'use strict';
// The foes of the new fields: two that live only in each of them (game.js enemyPool keeps them to their field, `fields`).
//   霧の廃村   屍喰いの村人 (packs, leaps)            呪いの案山子 (throws sickles, blinks away)
//   黄昏の廃都 夕陽の番兵 (a ray down a marked lane)    屍肉喰らいの禿鷲 (climbs, marks a spot, dives onto it)
//   地下墓所   骨這い (a bone spider that rises again)  墓守の祈祷師 (raises skeletons out of the floor)
//   血月の古城 呪われた騎士 (armoured in front)         城の弓兵 (three arrows at once)
//   水没回廊   溺れ人 (grabs and drags you down: slow)  大蛭 (leaps, drinks what it bites)
//   溶鉱の深層 鉱滓の巨人 (a slam that leaves molten iron) 火吹き職工 (a stream of fire you must step out of)
//   凍てつく霊廟 霜の亡霊 (three slow frost orbs)       氷晶の守り手 (a lane of ice spikes)
//   天空の聖域 虚空の使徒 (a column of light on a marked circle) 雲の守護像 (a gust that blows you back — mind the edge)
//   古戦場の丘 亡霊の槍兵 (marks a lane, then charges down it) 屍肉の鴉 (a flock that swoops in turn)
//   螺旋の大縦坑 鉤鎖の亡者 (a hooked chain down a lane: it reels you in) 落石の番人 (rocks fall on three marked circles)
//   捨てられた坑道 坑夫の亡者 (rushes down a gallery, pick first)  鉱石喰らい (a beetle in a shell of ore: charges)
//   沈む石柱の海 沈め手 (a stamp: the pillar under you starts to sink) 闇泳ぎのエイ (glides, a gust that blows you toward the dark)
// New bodies are built here with the enemy builder's own parts (enemies.js E._); new attacks hook its attack switch.
(function () {
  const E = G.enemies, X = E._, B = X.B, mesh = X.mesh, joint = X.joint, leg = X.leg;
  const U = G.U, V = U.V;
  let PG = null;
  const PGs = () => (PG = PG || G.Props.PG);

  // ---------------------------------------------------------------- colours of the new bodies
  Object.assign(X.PLANCOL, {
    villager: { skin: '#6e695c', sec: '#4a3a2a', rough: 0.85, blood: 0x4a3a20, tex: 'skin' },
    scarecrow: { skin: '#7d6a44', sec: '#4a3a26', rough: 0.95, blood: 0x6a5a30, tex: 'skin' },
    knight: { skin: '#4a4a52', sec: '#2a2224', rough: 0.45, metal: 0.6, blood: 0x2a2a2a, tex: 'skin' },
    archer: { skin: '#cfc2a6', sec: '#4a3a2a', rough: 0.7, blood: 0x6a6050, tex: 'skin' },
    drowned: { skin: '#687270', sec: '#2a3a34', rough: 0.3, blood: 0x2a4a40, tex: 'skin' },
    leech: { skin: '#3a1a1c', sec: '#7a2a2a', rough: 0.2, blood: 0x6a0a0a, tex: 'skin' },
    smith: { skin: '#5e4636', sec: '#2a1a12', rough: 0.7, blood: 0x6a1a0a, tex: 'skin' },
    seraph: { skin: '#6a665e', sec: '#7a5f2e', rough: 0.4, blood: 0xc8b890, tex: 'skin' },
  });

  // ---------------------------------------------------------------- materials of a body's own, things shaped in gfx.js
  const TX = (n) => (n && G.GFX && G.GFX.tex ? G.GFX.tex(n) : null);
  // a material of the wearer's own, one of gfx.js's surfaces on it; kept with the body's materials (they fade, flash and are thrown away together)
  function wear(M, color, texName, o, uvk) {
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9 }, o || {})), t = TX(texName);
    if (t) { m.map = t.map; m.normalMap = t.normalMap; m.roughnessMap = t.orm; m.aoMap = t.orm; m.color.multiplyScalar(1.25); }
    if (uvk) m.userData.uvk = uvk;
    M.all.push(m); return m;
  }
  // a thing shaped in gfx.js (foeGear) hung on a joint: MM gives each of its parts a material. Returns the joint it hangs in
  function gear(parent, name, MM, x, y, z, rx, ry, rz, s) {
    const d = G.GFX && G.GFX.foeGear ? G.GFX.foeGear(name) : null, g = joint(parent, x, y, z);
    g.rotation.set(rx || 0, ry || 0, rz || 0); if (s) { if (Array.isArray(s)) g.scale.set(s[0], s[1], s[2]); else g.scale.setScalar(s); }
    if (d) for (const q of d) { const m = new THREE.Mesh(q.g, MM[q.m] || MM.def); m.castShadow = true; g.add(m); }
    return g;
  }

  // ---------------------------------------------------------------- a shared humanoid frame (hips, trunk, head, arms, legs)
  // (a body of masses, not of boxes: a cage of ribs over a belly, shoulders, a neck; a skull with brow, nose and jaw, the eyes sunk in
  // their sockets; arms with a swell above and below the elbow, hands with fingers; thighs, calves, feet. Melted into one surface joint by
  // joint, gfx.js. The joints are as they were: each kind dresses and arms it. noHead: the kind makes the head itself)
  function humanoid(root, M, o) {
    PGs();
    const legL = o.leg || 0.88, th = o.torso || 0.62, w = o.width || 0.42, hr = o.head || 0.14, hu = o.hunch || 0, al = o.arm || 0.3, ak = al / 0.3;
    const tm = o.torsoMat || M.skin, am = o.armMat || M.skin, hm = o.headMat || M.skin, lm = o.legMat || M.skin, hdm = o.handMat || am, fm = o.footMat || M.sec;
    if (!M.skin.userData.uvk) M.skin.userData.uvk = o.uvk || 3;                                             // (the hide's grain: finer than on a beast)
    const hips = joint(root, 0, legL + 0.05, 0);
    mesh(hips, PG.sph, o.hipMat || M.sec, w * 0.47, 0.13, 0.15);
    const spine = joint(hips, 0, 0.08, 0);
    mesh(spine, PG.sph, tm, w * 0.36, th * 0.5, 0.125, 0, th * 0.48, hu * th * 0.2, hu * 0.6);              // the trunk's core
    mesh(spine, PG.sph, tm, w * 0.52, th * 0.36, 0.165, 0, th * 0.66, hu * th * 0.5 + 0.01, hu);          // ribs
    mesh(spine, PG.sph, tm, w * 0.42, th * 0.3, 0.145, 0, th * 0.27, 0.02);                                 // belly
    for (const s of [-1, 1]) mesh(spine, PG.sph, tm, 0.105, 0.085, 0.1, s * w * 0.48, th - 0.05, hu * th * 0.75);   // shoulders
    mesh(spine, PG.cyl8, o.neckMat || hm, 0.05, 0.14, 0.055, 0, th + 0.05, hu * th * 0.9);                  // neck
    const head = joint(spine, 0, th + 0.1, hu * 0.45);
    if (!o.noHead) {
      mesh(head, PG.sph, hm, hr, hr * 1.1, hr * 1.05, 0, hr * 0.64, -hr * 0.05);                            // skull
      mesh(head, PG.box, hm, hr * 1.5, hr * 0.3, hr * 0.5, 0, hr * 0.95, hr * 0.78, 0.25);                  // brow
      mesh(head, PG.box, hm, hr * 1.15, hr * 0.62, hr * 1.0, 0, hr * 0.16, hr * 0.36);                      // jaw
      mesh(head, PG.sph, hm, hr * 0.2, hr * 0.3, hr * 0.26, 0, hr * 0.56, hr * 1.0);                        // nose
      mesh(head, PG.box, M.dark, hr * 0.7, hr * 0.06, hr * 0.1, 0, hr * 0.2, hr * 0.86);                    // mouth
      if (o.eyes !== false) for (const s of [-1, 1]) { mesh(head, PG.sph, M.dark, hr * 0.26, hr * 0.2, hr * 0.14, s * hr * 0.42, hr * 0.72, hr * 0.86); mesh(head, PG.sph, M.eye, o.eyeR || 0.016, (o.eyeR || 0.016) * 0.9, 0.012, s * hr * 0.42, hr * 0.72, hr * 0.94); }
    }
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(spine, s * (w / 2 + 0.05), th - 0.06, 0);
      mesh(sh, PG.sph, am, 0.062, 0.085, 0.066, 0, -0.025, 0);
      mesh(sh, PG.sph, am, 0.052, al * 0.57, 0.058, 0, -al * 0.5, 0);
      const el = joint(sh, 0, -al, 0);
      mesh(el, PG.sph, am, 0.047, al * 0.37, 0.052, 0, -al * 0.27, 0.005); mesh(el, PG.cyl8, am, 0.034, al * 0.87, 0.036, 0, -al * 0.5, 0);
      const hand = joint(el, 0, -al, 0);
      mesh(hand, PG.sph, hdm, 0.045, 0.055, 0.03);
      for (let i = 0; i < 3; i++) mesh(hand, PG.sph, hdm, 0.014, 0.04 * ak, 0.016, (i - 1) * 0.028, -0.065, 0.012);
      mesh(hand, PG.sph, hdm, 0.015, 0.03, 0.016, -s * 0.045, -0.02, 0.02);
      arms.push({ sh, el, hand });
    }
    const hleg = (x) => {
      const hip = joint(hips, x, -0.04, 0);
      mesh(hip, PG.sph, lm, 0.075, legL * 0.27, 0.085, 0, -legL * 0.24, 0.005);
      const kn = joint(hip, 0, -legL * 0.5, 0);
      mesh(kn, PG.sph, lm, 0.055, legL * 0.15, 0.062, 0, -legL * 0.16, -0.02);                               // calf
      mesh(kn, PG.cyl8, lm, 0.04, legL * 0.44, 0.042, 0, -legL * 0.25, 0);
      mesh(kn, PG.box, fm, 0.09, 0.065, 0.2, 0, -legL * 0.5 + 0.032, 0.045);                                 // foot
      return { hip, kn };
    };
    const L = [hleg(-0.12), hleg(0.12)];
    return { hips, spine, head, arms, L, h: legL + 0.13 + th + 0.1 + hr * 2.2, hipY: legL + 0.05 };
  }
  function walkAnim(Hm, a, o) {
    const w = a.walk, k = o.swing ?? 0.6;
    Hm.L[0].hip.rotation.x = Math.sin(w) * k * a.mv; Hm.L[1].hip.rotation.x = -Math.sin(w) * k * a.mv;
    Hm.L[0].kn.rotation.x = Math.max(0, Math.sin(w)) * 0.7 * a.mv; Hm.L[1].kn.rotation.x = Math.max(0, -Math.sin(w)) * 0.7 * a.mv;
    Hm.hips.position.y = Hm.hipY + Math.abs(Math.sin(w)) * 0.03 * a.mv;
    Hm.spine.rotation.x = (o.lean || 0.08) + a.wind * -0.2 + a.atk * 0.3 - a.flinch * 0.4;
    Hm.head.rotation.y = Math.sin(a.t * 1.3) * 0.15;
  }
  const humanHits = (Hm, hr) => [{ n: Hm.head, r: (hr || 0.14) + 0.02, part: 'head', o: V(0, (hr || 0.14) * 0.6, 0) }, { n: Hm.spine, r: 0.27, part: 'body', o: V(0, 0.32, 0) }, { n: Hm.hips, r: 0.22, part: 'body', o: V(0, -0.3, 0) }];
  // rags hung about a waist: where each hangs by the angle about the body (0: before it)
  const tatters = (on, MM, angs, rx0, rz0, y, len) => { for (let i = 0; i < angs.length; i++) { const a = angs[i]; gear(on, 'tatter', MM, Math.sin(a) * rx0, y, Math.cos(a) * rz0, 0.06, a, 0, [1, (len || 1) * (0.8 + (i % 3) * 0.22), 1]); } };

  // 屍喰いの村人: a stooped villager in what is left of a smock and a hood, a rope still about the neck, long arms, a hay fork
  B.villager = function (root, M, opts, def) {
    const th = 0.6, hu = 0.45, hr = 0.13, al = 0.34, miner = !!(def && def.id === 'ff_miner');
    const Hm = humanoid(root, M, { leg: 0.82, torso: th, hunch: hu, head: hr, arm: al, footMat: M.skin });
    const rag = wear(M, miner ? 0x34302a : 0x3c352b, 'weave', { roughness: 1, side: THREE.DoubleSide }, 5), cord = wear(M, 0x6a5a40, 'weave', { roughness: 1 }, 7), hide = wear(M, 0x2e2018, 'leather');
    const wood = wear(M, 0x4a3524, 'walnut'), iron = wear(M, 0x3a3634, 'steel', { metalness: 0.7, roughness: 0.85 });
    // the smock: over the ribs and the belly, off one shoulder; a short skirt of it and rags below
    mesh(Hm.spine, PG.sph, rag, 0.236, 0.235, 0.185, 0, 0.385, 0.14, hu); mesh(Hm.spine, PG.sph, rag, 0.205, 0.2, 0.17, 0, 0.16, 0.035);
    mesh(Hm.spine, PG.sph, rag, 0.125, 0.09, 0.115, -0.2, 0.555, 0.2); mesh(Hm.arms[0].sh, PG.sph, rag, 0.064, 0.14, 0.068, 0, -0.1, 0);
    mesh(Hm.hips, PG.cone, rag, 0.25, 0.3, 0.2, 0, -0.1, 0);
    tatters(Hm.hips, { cloth: rag }, [-1.0, -0.35, 0.4, 1.1, 2.5, 3.5], 0.2, 0.16, -0.2, 1);
    // the hood, its fall on the neck; a mouth that opens too far, teeth
    if (miner) {   // (the miner: a cap of hide with a stub of candle on its brow)
      mesh(Hm.head, PG.sph, hide, hr * 1.1, hr * 0.8, hr * 1.14, 0, hr * 1.02, -hr * 0.1); mesh(Hm.head, PG.cyl8, hide, hr * 1.25, hr * 0.1, hr * 1.3, 0, hr * 0.98, -hr * 0.02);
      mesh(Hm.head, PG.cyl8, M.tooth, 0.016, 0.05, 0.016, 0, hr * 1.5, hr * 0.95); mesh(Hm.head, PG.sph, M.eye, 0.012, 0.022, 0.012, 0, hr * 1.5 + 0.04, hr * 0.95);
    } else {
      mesh(Hm.head, PG.sph, rag, hr * 1.1, hr * 1.1, hr * 1.14, 0, hr * 0.76, -hr * 0.24); mesh(Hm.head, PG.sph, rag, hr * 0.9, hr * 0.6, hr * 0.7, 0, -hr * 0.1, -hr * 0.55);
      mesh(Hm.head, PG.cone, rag, hr * 0.6, hr * 1.5, hr * 0.6, 0, hr * 1.3, -hr * 1.15, -1.25); mesh(Hm.head, PG.sph, rag, hr * 0.95, hr * 0.22, hr * 0.5, 0, hr * 1.42, hr * 0.42, 0.3);
      mesh(Hm.spine, PG.sph, rag, 0.25, 0.085, 0.19, 0, th - 0.04, hu * th * 0.72, hu);
    }
    mesh(Hm.head, PG.box, M.dark, hr * 0.72, hr * 0.3, hr * 0.14, 0, hr * 0.1, hr * 0.84);
    for (let i = 0; i < 4; i++) mesh(Hm.head, PG.cone, M.tooth, 0.008, 0.026, 0.008, (i - 1.5) * hr * 0.2, hr * 0.2, hr * 0.92, Math.PI);
    for (let i = 0; i < 3; i++) mesh(Hm.head, PG.cone, M.tooth, 0.008, 0.022, 0.008, (i - 1) * hr * 0.22, hr * 0.0, hr * 0.9);
    // the rope: about the neck with its end hanging, another for a belt
    if (!miner) { mesh(Hm.spine, PG.torus, cord, 0.078, 0.082, 0.26, 0, th + 0.015, hu * th * 0.86, Math.PI / 2 - hu); mesh(Hm.spine, PG.cyl8, cord, 0.011, 0.26, 0.011, 0.035, th - 0.13, hu * th * 0.86 + 0.085); }
    mesh(Hm.hips, PG.torus, cord, 0.205, 0.165, 0.26, 0, 0.07, 0, Math.PI / 2);
    for (const l of Hm.L) mesh(l.kn, PG.cyl8, rag, 0.05, 0.2, 0.053, 0, -0.82 * 0.3, 0);                                  // bound shins
    for (const a of Hm.arms) for (let i = 0; i < 3; i++) mesh(a.hand, PG.cone, M.dark, 0.008, 0.04, 0.008, (i - 1) * 0.028, -0.105, 0.016, Math.PI);   // nails
    const fork = joint(Hm.arms[1].hand, 0, 0, 0);
    gear(fork, miner ? 'pick' : 'pitchfork', { wood, iron });
    return {
      J: Hm, h: Hm.h * 0.92, r: 0.4, mats: [rag, cord, hide],
      hits: humanHits(Hm, 0.13), orn: { head: Hm.head, back: Hm.spine, backZ: [-0.1, -0.1], backY: 0.4 },
      animate(a) {
        walkAnim(Hm, a, { lean: 0.45, swing: 0.7 });
        Hm.arms[1].sh.rotation.x = -0.9 + Math.sin(a.walk) * 0.2 * a.mv - a.wind * 0.9 + a.atk * 1.6;
        Hm.arms[0].sh.rotation.x = -0.6 - Math.sin(a.walk) * 0.4 * a.mv - a.atk * 0.8;
      },
    };
  };
  // 呪いの案山子: a stake and a crossbar lashed together, a trunk of sacking stuffed with straw under a coat in rags, a sack for a head
  // with holes cut for eyes and a sewn grin, a shapeless hat; straw at every opening, a reaping hook in each bundle of a hand
  B.scarecrow = function (root, M) {
    PGs();
    const body = joint(root, 0, 1.25, 0);
    const wood = wear(M, 0x51453a, 'walnut', { roughness: 1 }), coat = wear(M, 0x2c2420, 'weave', { roughness: 1, side: THREE.DoubleSide }, 5), cord = wear(M, 0x6a5a40, 'weave', { roughness: 1 }, 7), iron = wear(M, 0x3a3634, 'steel', { metalness: 0.7, roughness: 0.85 });
    mesh(body, PG.cyl8, wood, 0.045, 2.6, 0.045, 0, -0.1, 0); mesh(body, PG.cone, wood, 0.045, 0.14, 0.045, 0, -1.46, 0, Math.PI);
    mesh(body, PG.cyl8, wood, 0.038, 1.9, 0.038, 0, 0.55, 0, 0, 0, Math.PI / 2);
    mesh(body, PG.torus, cord, 0.07, 0.07, 0.5, 0, 0.55, 0, 0, 0.78, 0); mesh(body, PG.torus, cord, 0.07, 0.07, 0.5, 0, 0.55, 0, 0, -0.78, 0);     // the lashing
    // the trunk of sacking, the coat open over it
    mesh(body, PG.sph, M.skin, 0.2, 0.36, 0.19, 0, 0.2, 0.02); mesh(body, PG.sph, M.skin, 0.18, 0.26, 0.17, 0, -0.14, 0.01);
    for (const s of [-1, 1]) { mesh(body, PG.sph, coat, 0.17, 0.42, 0.21, s * 0.15, 0.16, -0.03); mesh(body, PG.sph, coat, 0.15, 0.1, 0.13, s * 0.22, 0.52, 0); mesh(body, PG.cyl8, coat, 0.068, 0.56, 0.072, s * 0.54, 0.55, 0, 0, 0, Math.PI / 2); }
    mesh(body, PG.sph, coat, 0.26, 0.4, 0.14, 0, 0.14, -0.1);
    tatters(body, { cloth: coat }, [-1.2, -0.6, 0.65, 1.25, 2.2, 2.9, 3.6, 4.2], 0.27, 0.2, -0.16, 1.5);
    for (const s of [-1, 1]) { gear(body, 'tatter', { cloth: coat }, s * 0.7, 0.5, 0.03, 0, 0, 0, [0.8, 0.9, 1]); gear(body, 'tatter', { cloth: coat }, s * 0.42, 0.5, -0.04, 0, Math.PI, 0, [1, 1.3, 1]); }
    for (let i = 0; i < 9; i++) mesh(body, PG.cone, M.skin, 0.022, 0.26 + (i % 3) * 0.06, 0.022, Math.sin(i * 2.3) * 0.13, -0.5 - (i % 2) * 0.05, Math.cos(i * 2.3) * 0.1, Math.PI + Math.cos(i * 2.3) * 0.25, 0, Math.sin(i * 2.3) * 0.25);   // straw out of its foot
    for (let i = 0; i < 5; i++) mesh(body, PG.cone, M.skin, 0.014, 0.14, 0.014, (i - 2) * 0.035, 0.36, 0.17, 0.9, 0, (i - 2) * 0.3);                    // and out of its breast
    const head = joint(body, 0, 0.92, 0);
    mesh(head, PG.sph, M.skin, 0.2, 0.235, 0.195); mesh(head, PG.cone, M.skin, 0.17, 0.16, 0.16, 0, -0.27, 0);
    for (const s of [-1, 1]) mesh(head, PG.sph, M.skin, 0.05, 0.07, 0.045, s * 0.15, 0.17, -0.02, 0, 0, -s * 0.5);                                     // the sack's corners
    mesh(head, PG.torus, cord, 0.105, 0.1, 0.3, 0, -0.2, 0, Math.PI / 2);
    for (const s of [-1, 1]) { mesh(head, PG.sph, M.dark, 0.045, 0.058, 0.03, s * 0.08, 0.035, 0.17, 0, 0, s * 0.35); mesh(head, PG.sph, M.eye, 0.016, 0.02, 0.012, s * 0.08, 0.03, 0.172); }
    mesh(head, PG.box, M.dark, 0.2, 0.022, 0.03, 0, -0.09, 0.172, 0, 0, 0.06);
    for (let i = 0; i < 7; i++) mesh(head, PG.box, M.sec, 0.007, 0.06, 0.008, (i - 3) * 0.03, -0.09 + (i - 3) * 0.002, 0.19 - Math.abs(i - 3) * 0.006, 0, 0, (i % 2 ? 0.4 : -0.4));   // the stitches
    gear(head, 'hat', { felt: coat, cord }, 0, 0.13, 0, 0, 0.5, 0.1);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(body, s * 0.92, 0.55, 0);
      for (let i = 0; i < 8; i++) mesh(sh, PG.cone, M.skin, 0.02, 0.22 + (i % 3) * 0.05, 0.02, Math.sin(i * 2.1) * 0.03, -0.1, Math.cos(i * 2.1) * 0.04, 0.4 + Math.cos(i * 2.1) * 0.3, 0, Math.sin(i * 2.1) * 0.3 + Math.PI);
      mesh(sh, PG.torus, cord, 0.05, 0.05, 0.4, 0, 0.0, 0, Math.PI / 2);
      gear(sh, 'sickle', { wood, iron }, 0, -0.16, 0.06, 1.25, 0, 0, 1.45);
      arms.push(sh);
    }
    return {
      J: { body, head, arms }, h: 2.4, r: 0.45, hover: true, mats: [coat],
      hits: [{ n: head, r: 0.24, part: 'head' }, { n: body, r: 0.38, part: 'body', o: V(0, 0.1, 0) }, { n: body, r: 0.3, part: 'body', o: V(0, -0.6, 0) }],
      orn: { head, back: body, backZ: [-0.18, -0.18], backY: 0.3 },
      animate(a) {
        body.position.y = 1.25 + Math.abs(Math.sin(a.walk * 0.5)) * 0.35 * a.mv + Math.sin(a.t * 1.4) * 0.05; // (it hops on its pole)
        body.rotation.z = Math.sin(a.t * 0.9) * 0.08 - a.flinch * 0.3;
        head.rotation.z = Math.sin(a.t * 0.7) * 0.25 + 0.15; head.rotation.y = Math.sin(a.t * 0.5) * 0.3;
        arms[0].rotation.x = -a.wind * 1.4 + a.atk * 2.2; arms[1].rotation.x = -a.wind * 1.4 + a.atk * 2.2;
      },
    };
  };
  // 呪われた騎士: plate from crown to toe - a keeled breast over lames at the belly, great shoulders, a gorget, elbow and knee cops,
  // gauntlets, pointed shoes of iron; a great helm with its sight a slit and a fall of mail; a kite shield, a sword for two hands,
  // a cloak in tatters
  B.knight = function (root, M, opts, def) {
    const th = 0.66, legL = 0.92, pike = !!(def && def.id === 'ff_pikeman');
    const Hm = humanoid(root, M, { leg: legL, torso: th, width: 0.5, head: 0.15, noHead: true, footMat: M.skin, hipMat: M.skin });
    const trim = wear(M, 0x3e3526, 'steel', { metalness: 0.75, roughness: 0.85 }), mail = wear(M, 0x2e2e33, 'weave', { metalness: 0.65, roughness: 0.75 }), cloth = wear(M, 0x3a1318, 'weave', { roughness: 1, side: THREE.DoubleSide });
    const paint = wear(M, 0x2c1214, 'walnut', { roughness: 0.85 }), blade = wear(M, 0x85858c, 'steel', { metalness: 0.9, roughness: 0.5 }), hide = wear(M, 0x2a1c14, 'leather'), iron = wear(M, 0x3c3a3c, 'steel', { metalness: 0.8, roughness: 0.75 });
    // the cuirass
    mesh(Hm.spine, PG.sph, M.skin, 0.29, 0.25, 0.215, 0, 0.44, 0.035); mesh(Hm.spine, PG.sph, M.skin, 0.075, 0.22, 0.07, 0, 0.42, 0.2, 0.1);   // a keel down the breast
    mesh(Hm.spine, PG.sph, M.skin, 0.27, 0.26, 0.17, 0, 0.42, -0.045);
    for (let i = 0; i < 3; i++) mesh(Hm.spine, PG.cyl8, M.skin, 0.25 + i * 0.012, 0.078, 0.185 + i * 0.01, 0, 0.19 - i * 0.065, 0.01);
    mesh(Hm.spine, PG.cyl8, M.skin, 0.115, 0.09, 0.115, 0, th - 0.015, 0);
    for (const s of [-1, 1]) { mesh(Hm.spine, PG.sph, M.skin, 0.17, 0.12, 0.175, s * 0.31, 0.61, 0, 0, 0, -s * 0.25); mesh(Hm.spine, PG.sph, M.skin, 0.145, 0.1, 0.155, s * 0.37, 0.53, 0, 0, 0, -s * 0.5); mesh(Hm.spine, PG.box, M.skin, 0.03, 0.09, 0.2, s * 0.2, 0.69, 0, 0, 0, -s * 0.5); }
    mesh(Hm.hips, PG.cyl8, M.sec, 0.265, 0.055, 0.2, 0, 0.045, 0); mesh(Hm.hips, PG.box, trim, 0.06, 0.07, 0.03, 0, 0.045, 0.2);
    for (const s of [-1, 1]) mesh(Hm.hips, PG.box, M.skin, 0.17, 0.25, 0.03, s * 0.125, -0.14, 0.115, -0.14, 0, 0);                                      // tassets
    gear(Hm.hips, 'tatter', { cloth }, 0, -0.02, 0.135, 0.02, 0, 0, [1.25, 1.9, 1]); gear(Hm.hips, 'tatter', { cloth }, 0, -0.02, -0.14, 0.02, Math.PI, 0, [1.4, 1.7, 1]);
    for (let i = 0; i < 2; i++) {
      const a = Hm.arms[i], s = i ? 1 : -1, l = Hm.L[i];
      mesh(a.sh, PG.cyl8, M.skin, 0.062, 0.2, 0.066, 0, -0.16, 0);
      mesh(a.el, PG.sph, M.skin, 0.07, 0.07, 0.076); mesh(a.el, PG.cyl8, M.skin, 0.07, 0.022, 0.07, s * 0.06, 0, 0, 0, 0, Math.PI / 2);
      mesh(a.el, PG.cyl8, M.skin, 0.058, 0.2, 0.062, 0, -0.14, 0); mesh(a.el, PG.cyl8, M.skin, 0.066, 0.06, 0.07, 0, -0.25, 0);
      mesh(a.hand, PG.box, M.skin, 0.1, 0.09, 0.085, 0, -0.02, 0.005); mesh(a.hand, PG.box, M.skin, 0.09, 0.065, 0.05, 0, -0.085, 0.022);
      mesh(l.hip, PG.cyl8, M.skin, 0.09, legL * 0.36, 0.097, 0, -legL * 0.24, 0.005);
      mesh(l.kn, PG.sph, M.skin, 0.078, 0.085, 0.09, 0, 0, 0.012); mesh(l.kn, PG.cyl8, M.skin, 0.075, 0.022, 0.075, s * 0.07, 0, 0.01, 0, 0, Math.PI / 2);
      mesh(l.kn, PG.cyl8, M.skin, 0.064, legL * 0.4, 0.07, 0, -legL * 0.26, 0);
      mesh(l.kn, PG.box, M.skin, 0.105, 0.085, 0.21, 0, -legL * 0.5 + 0.045, 0.045); mesh(l.kn, PG.cone, M.skin, 0.05, 0.13, 0.04, 0, -legL * 0.5 + 0.03, 0.2, Math.PI / 2);
    }
    let cape = null;
    if (pike) {   // (the pikeman: a kettle hat over mail, the dark of a face in it; no shield, no cloak - both hands to the pike)
      gear(Hm.head, 'kettle', { steel: M.skin, mail }, 0, -0.02, 0);
      mesh(Hm.head, PG.sph, M.dark, 0.105, 0.125, 0.04, 0, 0.08, 0.15);
      for (const s of [-1, 1]) mesh(Hm.head, PG.sph, M.eye, 0.013, 0.011, 0.01, s * 0.045, 0.1, 0.178);
      gear(joint(Hm.arms[1].hand, 0, 0, 0), 'pike', { wood: wear(M, 0x4a3a28, 'walnut'), iron, blade, cloth });
    } else {
      gear(Hm.head, 'helm', { steel: M.skin, trim, dark: M.dark, mail }, 0, -0.02, 0);
      for (const s of [-1, 1]) mesh(Hm.head, PG.sph, M.eye, 0.014, 0.008, 0.01, s * 0.07, 0.148, 0.172);
      const shield = joint(Hm.arms[0].hand, 0, 0, 0.1); shield.rotation.x = 1.1;       // (the arm is held out before it: the shield stands upright all the same)
      gear(shield, 'kite', { paint, steel: iron }, 0, -0.04, 0.07, 0, 0, 0, 0.86);
      gear(joint(Hm.arms[1].hand, 0, 0, 0), 'greatsword', { leather: hide, iron, blade, dark: M.dark });
      cape = gear(Hm.spine, 'cape', { cloth }, 0, th - 0.02, -0.19);
    }
    return {
      J: Hm, h: Hm.h, r: 0.45,
      hits: humanHits(Hm, 0.17), orn: { head: Hm.head, back: Hm.spine, backZ: [-0.22, -0.22], backY: 0.5 },
      animate(a) {
        walkAnim(Hm, a, { lean: 0.05, swing: 0.45 });
        Hm.arms[0].sh.rotation.x = -1.1; Hm.arms[0].sh.rotation.y = 0.5;
        Hm.arms[1].sh.rotation.x = -0.4 - a.wind * 2.2 + a.atk * 3.0; Hm.arms[1].el.rotation.x = -0.5 - a.wind * 0.5;
        Hm.spine.rotation.y = a.atk * 0.7 - a.wind * 0.5;
        if (cape) cape.rotation.x = 0.1 + a.mv * 0.3 + Math.sin(a.t * 2) * 0.05;
      },
    };
  };
  // 城の弓兵: bones in a hood and a jerkin of hide, sleeves and hose of cloth, boots; a bracer on the bow arm, a quiver on a strap,
  // a longbow taller than its shoulder
  B.archer = function (root, M) {
    const th = 0.6, legL = 0.9, PP = G.Props.PG;
    const jerkin = wear(M, 0x3a2a1c, 'leather'), cloth = wear(M, 0x2c2e27, 'weave', { roughness: 1, side: THREE.DoubleSide }, 6), wood = wear(M, 0x4a3524, 'walnut'), fletch = wear(M, 0x4a4a48, 'weave', { roughness: 1, side: THREE.DoubleSide });
    const Hm = humanoid(root, M, { leg: legL, torso: th, width: 0.38, head: 0.13, noHead: true, torsoMat: jerkin, armMat: cloth, legMat: cloth, handMat: M.skin, footMat: jerkin, hipMat: jerkin, neckMat: M.skin });
    // the skull in its hood
    if (PP.skullB) { mesh(Hm.head, PP.skullB, M.skin, 1.2, 1.2, 1.2, 0, -0.02, 0.0); mesh(Hm.head, PP.skullD, M.dark, 1.2, 1.2, 1.2, 0, -0.02, 0.0); }
    for (const s of [-1, 1]) mesh(Hm.head, PG.sph, M.eye, 0.011, 0.011, 0.008, s * 0.043, 0.098, 0.112);
    mesh(Hm.head, PG.sph, cloth, 0.163, 0.172, 0.172, 0, 0.13, -0.05); mesh(Hm.head, PG.cone, cloth, 0.09, 0.22, 0.09, 0, 0.25, -0.15, -0.95);
    mesh(Hm.head, PG.sph, cloth, 0.15, 0.075, 0.135, 0, -0.035, 0.0);
    mesh(Hm.spine, PG.sph, cloth, 0.27, 0.1, 0.19, 0, th - 0.05, 0);                                                     // the hood's cape on the shoulders
    // the jerkin: its skirt, a belt, the lacing down its breast
    mesh(Hm.spine, PG.sph, jerkin, 0.2, 0.27, 0.152, 0, 0.33, 0.012); mesh(Hm.hips, PG.cone, jerkin, 0.215, 0.26, 0.17, 0, -0.06, 0);
    mesh(Hm.hips, PG.torus, M.sec, 0.195, 0.15, 0.3, 0, 0.07, 0, Math.PI / 2); mesh(Hm.hips, PG.box, M.tooth, 0.045, 0.05, 0.02, 0.02, 0.07, 0.155);
    for (let i = 0; i < 4; i++) mesh(Hm.spine, PG.box, M.dark, 0.055, 0.007, 0.012, 0, 0.24 + i * 0.065, 0.162 + (i === 3 ? 0.006 : 0), 0, 0, i % 2 ? 0.35 : -0.35);
    mesh(Hm.spine, PG.torus, M.sec, 0.205, 0.16, 0.2, 0, 0.36, 0.0, Math.PI / 2, 0.62, 0);                               // the quiver's strap
    mesh(Hm.arms[0].el, PG.cyl8, jerkin, 0.045, 0.2, 0.047, 0, -0.14, 0);                                                // the bracer
    for (const l of Hm.L) { mesh(l.kn, PG.cyl8, jerkin, 0.05, legL * 0.27, 0.054, 0, -legL * 0.355, 0); mesh(l.kn, PG.cyl8, jerkin, 0.058, 0.04, 0.062, 0, -legL * 0.22, 0); }
    gear(Hm.spine, 'quiver', { leather: jerkin, dark: M.dark, fletch }, 0.12, 0.42, -0.2, 0.2, 0, -0.35);
    const bow = joint(Hm.arms[0].hand, 0, 0, 0.05);
    gear(bow, 'longbow', { wood, leather: jerkin, bone: M.tooth });
    const string = mesh(bow, PG.box, M.tooth, 0.004, 1.56, 0.004, 0, 0, -0.16);
    return {
      J: Hm, h: Hm.h, r: 0.38, mats: [jerkin, cloth],
      hits: humanHits(Hm, 0.13), orn: { head: Hm.head, back: Hm.spine, backZ: [-0.18, -0.18], backY: 0.45 },
      animate(a) {
        walkAnim(Hm, a, { lean: 0.06 });
        Hm.arms[0].sh.rotation.x = -1.4 * Math.max(a.wind, a.atk > 0 ? 1 : 0.4); Hm.arms[0].sh.rotation.z = 0.1;
        Hm.arms[1].sh.rotation.x = -1.3 * a.wind - 0.3; Hm.arms[1].el.rotation.x = -1.4 * a.wind;
        string.position.z = -0.16 - a.wind * 0.25;
      },
    };
  };
  // 溺れ人: a body swollen with water - the belly, the breast, the neck gone into the shoulders, the face puffed; a rag at the loins,
  // weed and wet hair hanging off it, barnacles on the shoulders and the back, a shackle with its broken chain
  B.drowned = function (root, M) {
    const th = 0.66, legL = 0.84, hr = 0.145, hu = 0.25;
    const Hm = humanoid(root, M, { leg: legL, torso: th, width: 0.5, head: hr, hunch: hu, footMat: M.skin, hipMat: M.skin, eyeR: 0.007 });
    const weed = wear(M, 0x34503a, null, { roughness: 0.45, side: THREE.DoubleSide }), rag = wear(M, 0x2a2e28, 'weave', { roughness: 0.8, side: THREE.DoubleSide }, 5), barn = wear(M, 0x8c8a7a, 'bone'), iron = wear(M, 0x3a2e28, 'steel', { metalness: 0.6, roughness: 0.9 });
    mesh(Hm.spine, PG.sph, M.skin, 0.24, 0.24, 0.2, 0, 0.2, 0.06); mesh(Hm.spine, PG.sph, M.skin, 0.25, 0.19, 0.155, 0, 0.45, 0.06, hu);
    mesh(Hm.head, PG.sph, M.dark, hr * 0.3, hr * 0.3, hr * 0.12, hr * 0.05, hr * 0.1, hr * 0.84);                          // the mouth, hanging open
    for (const s of [-1, 1]) mesh(Hm.head, PG.sph, M.dark, hr * 0.3, hr * 0.26, hr * 0.14, s * hr * 0.42, hr * 0.7, hr * 0.86);   // the hollows of the eyes
    for (let i = 0; i < 2; i++) {
      const a = Hm.arms[i], l = Hm.L[i];
      mesh(a.sh, PG.sph, M.skin, 0.064, 0.16, 0.07, 0, -0.14, 0); mesh(a.el, PG.sph, M.skin, 0.052, 0.12, 0.056, 0, -0.1, 0); mesh(a.hand, PG.sph, M.skin, 0.058, 0.066, 0.042, 0, -0.01, 0);
      for (let k = 0; k < 3; k++) mesh(a.hand, PG.cone, M.dark, 0.009, 0.05, 0.009, (k - 1) * 0.028, -0.11, 0.02, Math.PI - 0.3);
      mesh(l.hip, PG.sph, M.skin, 0.088, legL * 0.26, 0.098, 0, -legL * 0.22, 0.01); mesh(l.kn, PG.sph, M.skin, 0.062, legL * 0.16, 0.07, 0, -legL * 0.17, -0.015);
    }
    mesh(Hm.hips, PG.cone, rag, 0.27, 0.26, 0.22, 0, -0.06, 0);
    tatters(Hm.hips, { cloth: rag }, [-0.8, 0.1, 0.9, 2.3, 3.1, 3.9], 0.24, 0.19, -0.14, 1.2);
    const hair = wear(M, 0x34342c, null, { roughness: 0.55, side: THREE.DoubleSide });
    mesh(Hm.head, PG.sph, hair, hr * 0.45, hr * 0.2, hr * 0.45, 0, hr * 1.68, -hr * 0.05);
    const weeds = [];
    for (let i = 0; i < 12; i++) {   // (locks of it from the crown, lying out over the skull and hanging: over the face, the ears, the nape)
      const a = i / 12 * Math.PI * 2 + 0.26, front = Math.cos(a) > 0.6, j = joint(Hm.head, Math.sin(a) * hr * 0.3, hr * 1.63, -hr * 0.05 + Math.cos(a) * hr * 0.3), k1 = joint(j, 0, 0, 0);
      k1.rotation.y = a; gear(k1, 'weed', { weed: hair }, 0, 0, 0, -0.5, 0, 0, [3.6, (front ? 0.5 : 0.75) + (i % 3) * 0.14, 1]); weeds.push(j);
    }
    for (let i = 0; i < 5; i++) { const j = joint(Hm.spine, (i - 2) * 0.12, 0.6 - (i % 2) * 0.12, 0.2 - Math.abs(i - 2) * 0.03); gear(j, 'weed', { weed }, 0, 0, 0, 0, i * 1.3, 0, [1.5, 0.9 + (i % 3) * 0.2, 1]); weeds.push(j); }
    for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.016 + (i % 3) * 0.008, on = Hm.spine; mesh(on, PG.cone, barn, r, r * 1.3, r, Math.cos(a) * 0.24, 0.5 + Math.sin(i * 1.7) * 0.12, -0.1 - Math.abs(Math.sin(a)) * 0.08, -1.2, 0, Math.cos(a) * 0.9); }
    mesh(Hm.L[0].kn, PG.torus, iron, 0.062, 0.066, 0.5, 0, -legL * 0.4, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) mesh(Hm.L[0].kn, PG.torus, iron, 0.022, 0.03, 0.5, -0.07 - i * 0.012, -legL * 0.41 - i * 0.022, -0.02 - i * 0.03, i % 2 ? 0.3 : Math.PI / 2, i % 2 ? 0 : 0.5, 0);
    return {
      J: Hm, h: Hm.h, r: 0.45, mats: [rag],
      hits: humanHits(Hm, 0.16), orn: { head: Hm.head, back: Hm.spine, backZ: [-0.2, -0.2], backY: 0.4 },
      animate(a) {
        walkAnim(Hm, a, { lean: 0.28, swing: 0.4 });
        for (const s of [0, 1]) { Hm.arms[s].sh.rotation.x = -1.3 - a.wind * 0.6 + a.atk * 0.6 + Math.sin(a.t * 2 + s) * 0.08; Hm.arms[s].sh.rotation.z = (s ? -1 : 1) * (0.2 + a.wind * 0.4); }
        weeds.forEach((j, i) => { j.rotation.x = Math.sin(a.t * 2.2 + i) * 0.2 + a.mv * 0.3; });
      },
    };
  };
  // 大蛭: a fat worm of rings, dark above and pale under; a round mouth with rings of teeth inside a lip of flesh, no eyes to speak of
  B.leech = function (root, M) {
    PGs();
    const body = joint(root, 0, 0.36, 0);
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const j = joint(body, 0, 0, 0.45 - i * 0.24), r = 0.32 - i * 0.03, h = 0.27 - i * 0.027;
      for (const d of [-0.085, 0, 0.085]) mesh(j, PG.sph, M.skin, r * (d ? 0.9 : 1), h * (d ? 0.9 : 1), 0.1, 0, 0.02, d);
      mesh(j, PG.sph, M.sec, r * 0.82, h * 0.5, 0.17, 0, -h * 0.55, 0);                                                    // the pale belly
      for (const s of [-1, 1]) mesh(j, PG.sph, M.dark, 0.035, 0.012, 0.03, s * r * 0.45, h * 0.88 + 0.02, (i % 2 ? 0.03 : -0.03));   // blotches down the back
      segs.push(j);
    }
    mesh(segs[4], PG.sph, M.skin, 0.13, 0.1, 0.12, 0, -0.03, -0.14); mesh(segs[4], PG.sph, M.sec, 0.1, 0.03, 0.08, 0, -0.12, -0.17);   // the tail and its sucker
    const mouth = joint(segs[0], 0, 0.02, 0.18);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; mesh(mouth, PG.sph, M.skin, 0.05, 0.05, 0.045, Math.cos(a) * 0.15, Math.sin(a) * 0.14, -0.005); }   // the lip, in lobes
    mesh(mouth, PG.torus, M.sec, 0.13, 0.125, 0.3, 0, 0, 0.022); mesh(mouth, PG.sph, M.dark, 0.125, 0.12, 0.03, 0, 0, 0.012); mesh(mouth, PG.sph, M.dark, 0.05, 0.05, 0.06, 0, 0, -0.01);
    for (let k = 0; k < 3; k++) { const n = 12 - k * 3, rr = 0.105 - k * 0.03; for (let i = 0; i < n; i++) { const a = (i + k * 0.5) / n * Math.PI * 2; mesh(mouth, PG.cone, M.tooth, 0.011 - k * 0.002, 0.05 - k * 0.008, 0.011 - k * 0.002, Math.cos(a) * rr, Math.sin(a) * rr, 0.035 - k * 0.006, Math.PI / 2 + Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); } }
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) mesh(segs[0], PG.sph, M.eye, 0.011, 0.011, 0.009, s * (0.13 + k * 0.035), 0.2 - k * 0.025, 0.11 - k * 0.04);
    return {
      J: { body, segs, mouth }, h: 0.75, r: 0.42,
      hits: [{ n: segs[0], r: 0.3, part: 'head' }, { n: segs[2], r: 0.3, part: 'body' }, { n: segs[4], r: 0.26, part: 'body' }],
      orn: { head: segs[0], back: segs[2], backZ: [0, 0], backY: 0.25 },
      animate(a) {
        segs.forEach((j, i) => { j.position.y = Math.sin(a.walk * 1.5 - i * 0.9) * 0.08 * a.mv; j.scale.z = 1 + Math.sin(a.walk * 1.5 - i * 0.9) * 0.15 * a.mv; });
        body.rotation.x = -a.wind * 0.5 + a.atk * 0.3; mouth.scale.setScalar(1 + a.wind * 0.5);
      },
    };
  };
  // 火吹き職工: a thick-set smith - a belly, a bull's neck, heavy arms in gauntlets of hide; an apron from breast to shin, an iron
  // plate before the face with two slits the fire shows through, two bottles on the back, a fire-pipe whose mouth glows
  B.smith = function (root, M) {
    const th = 0.62, legL = 0.8;
    const hide = wear(M, 0x3a2416, 'leather'), cloth = wear(M, 0x24201c, 'weave', { roughness: 1 }, 6), iron = wear(M, 0x35312f, 'steel', { metalness: 0.75, roughness: 0.8 }), brass = wear(M, 0x6a4c26, 'steel', { metalness: 0.8, roughness: 0.6 }), wood = wear(M, 0x4a3524, 'walnut');
    const Hm = humanoid(root, M, { leg: legL, torso: th, width: 0.56, head: 0.15, legMat: cloth, footMat: hide, hipMat: cloth, eyes: false });
    mesh(Hm.spine, PG.sph, M.skin, 0.3, 0.25, 0.25, 0, 0.2, 0.07); mesh(Hm.spine, PG.sph, M.skin, 0.31, 0.22, 0.2, 0, 0.43, 0.04);
    mesh(Hm.spine, PG.sph, M.skin, 0.22, 0.11, 0.15, 0, th - 0.015, -0.02);
    for (let i = 0; i < 2; i++) {
      const a = Hm.arms[i], l = Hm.L[i];
      mesh(a.sh, PG.sph, M.skin, 0.078, 0.17, 0.084, 0, -0.14, 0); mesh(a.sh, PG.sph, M.skin, 0.092, 0.09, 0.095, 0, 0, 0);
      mesh(a.el, PG.cyl8, hide, 0.056, 0.2, 0.06, 0, -0.17, 0); mesh(a.el, PG.cyl8, hide, 0.068, 0.045, 0.072, 0, -0.07, 0); mesh(a.hand, PG.sph, hide, 0.06, 0.07, 0.05, 0, -0.02, 0.005);
      mesh(l.hip, PG.sph, cloth, 0.095, legL * 0.27, 0.105, 0, -legL * 0.23, 0.005); mesh(l.kn, PG.cyl8, hide, 0.058, legL * 0.3, 0.062, 0, -legL * 0.34, 0); mesh(l.kn, PG.cyl8, hide, 0.066, 0.045, 0.07, 0, -legL * 0.2, 0);
    }
    gear(Hm.spine, 'apron', { leather: hide, iron, wood }, 0, 0, 0);
    gear(Hm.head, 'smithmask', { iron, leather: hide }, 0, -0.02, 0);
    for (const s of [-1, 1]) mesh(Hm.head, PG.box, M.eye, 0.05, 0.011, 0.012, s * 0.048, 0.14, 0.166, 0, s * 0.24, 0);
    const tank = joint(Hm.spine, 0, 0.42, -0.26); gear(tank, 'tank', { iron, brass });
    const glow = new THREE.MeshStandardMaterial({ color: 0x2a0a00, emissive: 0xff6a10, emissiveIntensity: 2 }); M.all.push(glow);
    const nozzle = joint(Hm.arms[1].hand, 0, 0, 0); gear(nozzle, 'nozzle', { iron, leather: hide }); const tip = mesh(nozzle, PG.sph, glow, 0.035, 0.035, 0.035, 0, 0, 0.6);
    return {
      J: Object.assign(Hm, { nozzle }), h: Hm.h, r: 0.48, mats: [hide, cloth],
      hits: humanHits(Hm, 0.17), orn: { head: Hm.head, back: Hm.spine, backZ: [-0.3, -0.3], backY: 0.45 },
      animate(a) {
        walkAnim(Hm, a, { lean: 0.12, swing: 0.45 });
        Hm.arms[1].sh.rotation.x = -1.3 - a.wind * 0.2; Hm.arms[0].sh.rotation.x = -0.9;
        tip.scale.setScalar(0.035 * (1 + a.atk * 1.5 + a.wind * 0.6)); // (the pipe's mouth glows more as it breathes)
      },
    };
  };
  // 虚空の使徒: a tall figure in a robe that hangs to nothing, a veil over the head and before the face a blank oval of bone, cracked;
  // a ring of light behind the head with rays out of it, six wings of soiled feathers, long hands out of wide sleeves; it hovers
  B.seraph = function (root, M) {
    PGs();
    const FG = G.GFX && G.GFX.foeGeo;
    const body = joint(root, 0, 1.4, 0);
    const mask = wear(M, 0x8f8876, 'bone', { roughness: 0.45 }), wingM = wear(M, 0x7d776c, 'weave', { roughness: 0.8, side: THREE.DoubleSide }, 9);
    mesh(body, (FG && FG('robe')) || PG.cone, M.skin, 0.42, 1.7, 0.4, 0, -0.45, 0);
    mesh(body, (FG && FG('robe')) || PG.cone, M.skin, 0.36, 0.44, 0.25, 0, 0.27, 0);                                    // a cape over the shoulders
    mesh(body, PG.cyl8, M.skin, 0.062, 0.14, 0.062, 0, 0.5, 0.01);
    mesh(body, PG.torus, M.sec, 0.125, 0.1, 0.22, 0, 0.46, 0.01, Math.PI / 2 - 0.2);                                     // a collar of old gold
    mesh(body, PG.box, M.sec, 0.09, 0.56, 0.014, 0, -0.15, 0.245, -0.115); mesh(body, PG.box, M.sec, 0.09, 0.56, 0.014, 0, -0.7, 0.325, -0.14); mesh(body, PG.oct3 || PG.sph, M.sec, 0.045, 0.065, 0.02, 0, 0.2, 0.215);
    const head = joint(body, 0, 0.55, 0);
    mesh(head, PG.sph, M.skin, 0.17, 0.21, 0.18, 0, 0.03, -0.04); mesh(head, PG.cone, M.skin, 0.17, 0.3, 0.13, 0, -0.14, -0.09); mesh(head, PG.sph, M.dark, 0.1, 0.15, 0.05, 0, 0.0, 0.105);
    mesh(head, PG.sph, mask, 0.092, 0.142, 0.05, 0, -0.005, 0.125);
    mesh(head, PG.box, M.eye, 0.006, 0.085, 0.01, 0, 0.015, 0.172);
    mesh(head, PG.box, M.dark, 0.004, 0.09, 0.006, 0.035, -0.055, 0.165, 0, 0, 0.5); mesh(head, PG.box, M.dark, 0.0035, 0.05, 0.006, 0.058, -0.005, 0.155, 0, 0, -0.4);   // the cracks
    const halo = joint(head, 0, 0.08, -0.16);
    mesh(halo, PG.torus, M.sec, 0.3, 0.3, 0.22, 0, 0, 0); mesh(halo, PG.torus, M.sec, 0.23, 0.23, 0.1, 0, 0, 0);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, l = i % 2 ? 0.1 : 0.19; mesh(halo, PG.cone, M.sec, 0.011, l, 0.006, Math.cos(a) * (0.31 + l / 2), Math.sin(a) * (0.31 + l / 2), 0, 0, 0, a - Math.PI / 2); }
    const wings = [];
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const j = joint(body, s * 0.12, 0.3 - k * 0.32, -0.15), sc = 1.15 - k * 0.2; gear(j, 'wing', { feather: wingM }, 0, 0, 0, 0, 0, s * (0.55 - k * 0.5), [s * sc, sc, 1]); wings.push({ j, s, k }); }
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(body, s * 0.3, 0.25, 0.05);
      mesh(sh, (FG && FG('robe')) || PG.cone, M.skin, 0.085, 0.62, 0.085, 0, -0.29, 0);
      mesh(sh, PG.sph, mask, 0.03, 0.045, 0.02, 0, -0.62, 0.01); for (let i = 0; i < 4; i++) mesh(sh, PG.cone, mask, 0.008, 0.13, 0.008, (i - 1.5) * 0.016, -0.71, 0.012, Math.PI, 0, (i - 1.5) * 0.09);
      arms.push(sh);
    }
    return {
      J: { body, head, halo, wings, arms }, h: 2.3, r: 0.45, hover: true,
      hits: [{ n: head, r: 0.22, part: 'head' }, { n: body, r: 0.4, part: 'body', o: V(0, -0.2, 0) }, { n: body, r: 0.34, part: 'body', o: V(0, -0.9, 0) }],
      orn: { head, back: body, backZ: [-0.2, -0.2], backY: 0.3 },
      animate(a) {
        body.position.y = 1.4 + Math.sin(a.t * 1.5) * 0.15;
        for (const w of wings) w.j.rotation.y = w.s * (Math.sin(a.t * 2.4 + w.k * 0.6) * 0.25 + a.wind * 0.5);
        halo.rotation.z = a.t * 0.8;
        for (const sh of arms) sh.rotation.x = -0.4 - a.wind * 2.2 + a.atk * 1.5;
        body.rotation.x = a.mv * 0.2 - a.flinch * 0.4;
      },
    };
  };

  // ---------------------------------------------------------------- the foes
  const ENEMIES = G.ENEMIES;
  const base = { variant: 'field', vicon: '', flyer: false, hover: false, big: false, elem: null, el: null, elRes: null, shield: 0, revive: false, dodge: false, aura: false, undead: false, frontArmor: 0, split: false, web: false, cloak: false, blink: false, color: null, eye: null, orn: null, special: false, fieldFoe: true };
  const add = (o) => { const d = Object.assign({}, base, o); d.minArea = d.unlockK * 5 + 1; d.desc = d.desc + `\n【${G.Run && G.Run.FIELD_NAME ? o.fields.map((f) => G.Tex.BIOMES[f] ? G.Tex.BIOMES[f].name : f).join('・') : ''}にだけ現れる】`; ENEMIES.push(d); return d; };
  add({ id: 'ff_ghoul', fields: ['hamlet'], plan: 'villager', name: '屍喰いの村人', icon: '🧟', hp: 80, dmg: 13, speed: 6.4, size: 1, attack: 'lunge', range: 2.4, cd: 1.3, ai: 'flank', h: 1.6, undead: true, sound: 'groan', pitch: 0.9, unlockK: 0, rarity: 'common', pack: true,
    desc: '村を捨てきれなかった者の成れの果て。群れで獲物を囲み、熊手を構えて跳びかかる。一体が気づくと周りの仲間も駆けつける。' });
  add({ id: 'ff_scarecrow', fields: ['hamlet'], plan: 'scarecrow', name: '呪いの案山子', icon: '🎃', hp: 115, dmg: 11, speed: 4.8, size: 1, attack: 'sickles', range: 22, cd: 2.8, ai: 'ranged', h: 2.4, hover: true, blink: true, sound: 'screech', pitch: 0.7, unlockK: 1, rarity: 'uncommon', color: '#7d6a44', eye: '#ff7a20',
    desc: '畑に立つ案山子に呪いが宿ったもの。鎌を三本まとめて投げ、狙われると一瞬で別の場所に移る。' });
  add({ id: 'ff_sentinel', fields: ['dusk'], plan: 'golem', name: '夕陽の番兵', icon: '🗿', hp: 250, dmg: 24, speed: 3.0, size: 0.72, attack: 'sunray', range: 30, cd: 4.2, ai: 'ranged', h: 2.3, shield: 0.3, sound: 'rumble', pitch: 1.1, unlockK: 1, rarity: 'uncommon', color: '#c8a878', eye: '#ffb050', orn: 'ember',
    desc: '廃都の門を守っていた砂岩の像。目に夕陽を集め、足元に印した一筋の道へ光線を放つ。光る線の上から横へ逃げろ。' });
  add({ id: 'ff_vulture', fields: ['dusk'], plan: 'bat', name: '屍肉喰らいの禿鷲', icon: '🦅', hp: 75, dmg: 15, speed: 10.5, size: 1.45, attack: 'divebomb', range: 22, cd: 3.0, ai: 'flyer', flyer: true, h: 1.1, sound: 'screech', pitch: 0.75, unlockK: 0, rarity: 'common', color: '#5a4030', eye: '#ffd070',
    desc: '夕空を旋回する大きな禿鷲。高く昇って獲物の足元に狙いを定め、急降下して叩きつける。円が出たら外へ。' });
  add({ id: 'ff_bonecrawler', fields: ['catacombs'], plan: 'spider', name: '骨這い', icon: '🦴', hp: 70, dmg: 12, speed: 8.6, size: 0.95, attack: 'pounce', range: 9, cd: 1.9, ai: 'flank', h: 0.8, revive: true, undead: true, sound: 'chitter', pitch: 1.2, unlockK: 1, rarity: 'uncommon', color: '#d8cdb4', eye: '#80ff60', orn: 'bones',
    desc: '納骨堂の骨が寄り集まった蜘蛛。跳びかかって噛みつき、崩しても数秒後に組み上がって起き上がる。' });
  add({ id: 'ff_gravecaller', fields: ['catacombs'], plan: 'shaman', name: '墓守の祈祷師', icon: '🕯️', hp: 140, dmg: 10, speed: 4.4, size: 1, attack: 'raise', range: 20, cd: 8, ai: 'support', h: 2.0, sound: 'groan', pitch: 0.8, unlockK: 2, rarity: 'rare', color: '#2a2a30', eye: '#a0ff80', orn: 'wisps',
    desc: '地下墓所の墓守の亡霊。祈りの声で床から骸骨を呼び起こす。呼ばれた骸骨は脆いが、祈祷師を倒さない限り湧き続ける。' });
  add({ id: 'ff_knight', fields: ['castle'], plan: 'knight', name: '呪われた騎士', icon: '🛡️', hp: 230, dmg: 26, speed: 4.4, size: 1.12, attack: 'slash', range: 3.0, cd: 1.9, ai: 'melee', h: 2.1, frontArmor: 0.65, shield: 0.25, undead: true, sound: 'groan', pitch: 0.7, unlockK: 1, rarity: 'rare', big: true,
    desc: '血の月に呼び戻された古城の騎士。正面は大盾と鎧で固く、大剣で薙ぎ払う。背後か側面を狙え。' });
  add({ id: 'ff_archer', fields: ['castle'], plan: 'archer', name: '城の弓兵', icon: '🏹', hp: 70, dmg: 9, speed: 4.8, size: 1, attack: 'volley', range: 34, cd: 2.4, ai: 'ranged', h: 1.85, undead: true, sound: 'groan', pitch: 1.2, unlockK: 1, rarity: 'uncommon',
    desc: '城壁を守り続ける骸骨の弓兵。遠くから三本の矢をまとめて放つ。物陰から物陰へ移りながら近づけ。' });
  add({ id: 'ff_drowned', fields: ['flooded'], plan: 'drowned', name: '溺れ人', icon: '🫧', hp: 115, dmg: 14, speed: 4.4, size: 1.05, attack: 'grab', range: 2.6, cd: 2.2, ai: 'melee', h: 1.85, undead: true, el: 'water', elRes: { water: 0.5 }, sound: 'groan', pitch: 0.75, unlockK: 2, rarity: 'uncommon',
    desc: '水底から這い上がった溺死者。ゆっくり歩くが、近づくと掴みかかってくる。掴まれると水に引かれ、しばらく足が重くなる。' });
  add({ id: 'ff_leech', fields: ['flooded'], plan: 'leech', name: '大蛭', icon: '🪱', hp: 85, dmg: 11, speed: 7.2, size: 1, attack: 'lunge', range: 2.0, cd: 1.6, ai: 'flank', h: 0.75, sound: 'slosh', pitch: 0.8, unlockK: 2, rarity: 'uncommon', drain: 0.6,
    desc: '水路に潜む人ほどの大きさの蛭。跳びついて噛みつき、吸った血で傷を癒す。' });
  add({ id: 'ff_slag', fields: ['foundry'], plan: 'brute', name: '鉱滓の巨人', icon: '🌋', hp: 300, dmg: 30, speed: 4.0, size: 1.05, attack: 'slagslam', range: 4.2, cd: 2.8, ai: 'melee', h: 3.0, big: true, frontArmor: 0.35, el: 'fire', elRes: { fire: 0.6 }, elem: 'fire', sound: 'roar', pitch: 0.7, unlockK: 3, rarity: 'rare', color: '#3a3634', eye: '#ff7a20', orn: 'ember',
    desc: '炉から溢れた鉱滓が固まった巨人。地面を叩き割り、その跡には溶けた鉄がしばらく残る。' });
  add({ id: 'ff_smith', fields: ['foundry'], plan: 'smith', name: '火吹き職工', icon: '🔥', hp: 130, dmg: 7, speed: 4.6, size: 1, attack: 'flame', range: 9, cd: 3.4, ai: 'ranged', h: 1.8, el: 'fire', elRes: { fire: 0.6 }, elem: 'fire', sound: 'groan', pitch: 0.9, unlockK: 3, rarity: 'uncommon',
    desc: '炉の番を続ける職工の亡霊。背負った油の筒から火を吹き、炎の帯でゆっくり薙ぐ。炎の扇の外へ回り込め。' });
  add({ id: 'ff_rimewraith', fields: ['frozen'], plan: 'wraith', name: '霜の亡霊', icon: '🥶', hp: 105, dmg: 11, speed: 5.2, size: 1, attack: 'frostfan', range: 26, cd: 2.8, ai: 'ranged', hover: true, blink: true, undead: true, el: 'ice', elRes: { ice: 0.6 }, elem: 'frost', sound: 'wail', pitch: 1.2, unlockK: 4, rarity: 'uncommon', color: '#a8d8f0', eye: '#e8ffff', orn: 'ice',
    desc: '霊廟に眠る者の凍った魂。ゆっくり追ってくる霜の弾を三つ放ち、近づくと掻き消えるように移る。' });
  add({ id: 'ff_icewarden', fields: ['frozen'], plan: 'golem', name: '氷晶の守り手', icon: '💠', hp: 320, dmg: 24, speed: 3.2, size: 0.85, attack: 'shardline', range: 16, cd: 3.6, ai: 'melee', h: 2.7, big: true, shield: 0.5, el: 'ice', elRes: { ice: 0.6 }, elem: 'frost', sound: 'rumble', pitch: 1.0, unlockK: 4, rarity: 'rare', color: '#9ac8e0', eye: '#e0f8ff', orn: 'crystal',
    desc: '霊廟を守る結晶の巨人。床を叩くと、印した一筋に沿って氷の棘が突き上がる。厚い結晶の殻を持つ。' });
  add({ id: 'ff_seraph', fields: ['sanctum'], plan: 'seraph', name: '虚空の使徒', icon: '😇', hp: 140, dmg: 24, speed: 5.0, size: 1, attack: 'smite', range: 34, cd: 3.2, ai: 'ranged', hover: true, blink: true, sound: 'wail', pitch: 1.4, unlockK: 4, rarity: 'rare', eye: '#fff0c0',
    desc: '偽りの空に仕える顔のない使徒。足元に光の輪を描き、そこへ天から光の柱を落とす。輪の外へ。' });
  add({ id: 'ff_cloudguard', fields: ['sanctum'], plan: 'gargoyle', name: '雲の守護像', icon: '🗽', hp: 125, dmg: 8, speed: 4.2, size: 1.05, attack: 'gust', range: 15, cd: 3.2, ai: 'ranged', flyer: true, h: 1.4, sound: 'screech', pitch: 0.6, unlockK: 4, rarity: 'uncommon', color: '#e8e4dc', eye: '#ffd090',
    desc: '聖域の縁に据えられた白い石像。翼を打って突風を起こし、獲物を吹き飛ばす。足場の縁では特に危ない。' });
  add({ id: 'ff_pikeman', fields: ['battlefield'], plan: 'knight', name: '亡霊の槍兵', icon: '🔱', hp: 160, dmg: 22, speed: 4.6, size: 1.02, attack: 'lancecharge', range: 16, cd: 3.6, ai: 'melee', h: 2.0, frontArmor: 0.35, undead: true, sound: 'groan', pitch: 0.8, unlockK: 0, rarity: 'common', color: '#6a6a62', eye: '#ff6a40',
    desc: '丘で討たれた兵の亡霊。槍を構えて足元に一筋の線を引き、その線の上を一気に駆け抜ける。線の上から横へ外れろ。' });
  add({ id: 'ff_crow', fields: ['battlefield'], plan: 'bat', name: '屍肉の鴉', icon: '🐦‍⬛', hp: 38, dmg: 7, speed: 11, size: 0.8, attack: 'swoop', range: 2.0, cd: 2.0, ai: 'flyer', flyer: true, h: 0.8, sound: 'screech', pitch: 1.1, unlockK: 0, rarity: 'common', pack: true, color: '#1c1a20', eye: '#ff3a2a',
    desc: '戦場の屍をついばむ黒い鴉。群れで飛び回り、代わる代わる急降下してくる。一羽は脆い。' });
  add({ id: 'ff_hookwraith', fields: ['shaft'], plan: 'wraith', name: '鉤鎖の亡者', icon: '⛓️', hp: 110, dmg: 12, speed: 5.0, size: 1, attack: 'hook', range: 18, cd: 3.4, ai: 'ranged', hover: true, undead: true, sound: 'wail', pitch: 0.8, unlockK: 0, rarity: 'common', color: '#5a6070', eye: '#ffb050', orn: 'wisps',
    desc: '縦坑の昇降機に繋がれて死んだ坑夫の亡霊。足元に線を引き、その線の上へ鉤のついた鎖を投げて、掛かった獲物を手元まで引き寄せる。縁の近くでは特に危ない。' });
  add({ id: 'ff_rockwarden', fields: ['shaft'], plan: 'golem', name: '落石の番人', icon: '🪨', hp: 260, dmg: 22, speed: 3.2, size: 0.8, attack: 'rockfall', range: 26, cd: 4.0, ai: 'ranged', h: 2.4, shield: 0.3, sound: 'rumble', pitch: 0.9, unlockK: 1, rarity: 'uncommon', color: '#7a7064', eye: '#ffd070',
    desc: '縦坑の壁から削り出された石の番人。地を踏み鳴らすと、獲物の足元とその周りの三つの円に、縁から岩が降ってくる。円の外へ。' });
  add({ id: 'ff_miner', fields: ['mine'], plan: 'villager', name: '坑夫の亡者', icon: '⛏️', hp: 120, dmg: 18, speed: 5.2, size: 1.05, attack: 'lancecharge', range: 14, cd: 3.2, ai: 'melee', h: 1.75, undead: true, sound: 'groan', pitch: 0.75, unlockK: 2, rarity: 'common', color: '#6a5a48', eye: '#ffd060',
    desc: '落盤で坑道に閉じ込められた坑夫の亡霊。つるはしを構えて足元に線を引き、狭い坑道を一気に駆け抜けてくる。坑道の中では避ける場所が少ない。' });
  add({ id: 'ff_orebeetle', fields: ['mine'], plan: 'beetle', name: '鉱石喰らい', icon: '🪲', hp: 170, dmg: 16, speed: 4.4, size: 1.15, attack: 'charge', range: 2.5, cd: 2.6, ai: 'melee', h: 1.0, shield: 0.55, sound: 'chitter', pitch: 0.7, unlockK: 2, rarity: 'uncommon', color: '#4a5a6a', eye: '#60e0ff', orn: 'crystal',
    desc: '鉱石を食べて殻を鉱石で固めた大きな甲虫。硬い殻で弾を受け止め、角を低く構えて突進してくる。' });
  add({ id: 'ff_sinker', fields: ['pillars'], plan: 'shaman', name: '沈め手', icon: '🌑', hp: 150, dmg: 18, speed: 4.4, size: 1.05, attack: 'quake', range: 22, cd: 4.6, ai: 'ranged', h: 2.0, undead: true, sound: 'groan', pitch: 0.6, unlockK: 4, rarity: 'uncommon', color: '#3a2a4a', eye: '#c890ff', orn: 'wisps',
    desc: '石柱の海の底から来る影の祈祷師。杖で闇を叩くと、獲物の足元に輪が浮かび、そこが揺れて打ちのめす。足元が沈む柱なら、その柱がすぐに沈み始める。' });
  add({ id: 'ff_voidray', fields: ['pillars'], plan: 'bat', name: '闇泳ぎのエイ', icon: '🦇', hp: 130, dmg: 10, speed: 7.5, size: 1.75, attack: 'gust', range: 14, cd: 3.4, ai: 'ranged', flyer: true, h: 1.0, sound: 'screech', pitch: 0.5, unlockK: 4, rarity: 'uncommon', color: '#2a2040', eye: '#e0a0ff',
    desc: '柱の間の闇を泳ぐ大きなエイ。翼を打って突風を送り、獲物を柱の縁から闇へ押し出す。' });
  G.ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

  // ---------------------------------------------------------------- what happens when they spawn / die
  const spawn0 = E.spawn;
  E.spawn = function (def, level, pos, opts) {
    const e = spawn0.call(this, def, level, pos, opts);
    if (e && def.drain && !e.eliteMod) e.eliteMod = { id: 'vamp', name: '吸血', icon: '🩸', silent: true }; // (the leech drinks: the same as the 'vamp' trait)
    // the ghouls come in packs: now and then one brings another with it (a little weaker)
    if (e && def.pack && !(opts && opts.packChild) && Math.random() < 0.45) { const a = Math.random() * Math.PI * 2, q = pos.clone().add(V(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6)); const w = G.world, y = w && w.floorBelow ? w.floorBelow(q.x, pos.y + 1, q.z) : pos.y; if (isFinite(y) && Math.abs(y - pos.y) < 0.6) { q.y = y; const o2 = Object.assign({}, opts || {}, { packChild: true, hpMul: (opts && opts.hpMul || 1) * 0.7 }); const k = spawn0.call(this, def, level, q, o2); if (k) { k.waveFoe = e.waveFoe; k.ignoreCount = false; } } }
    return e;
  };

  // ---------------------------------------------------------------- the new attacks
  const EP = E.Enemy.prototype, try0 = EP.tryAttack, upd0 = EP.updateAttack, move0 = EP.decideMove;
  const K = {};
  const C = () => G.combat, Pl = () => G.player;
  const endA = (e, cd) => { e.attackState = null; e.atk = 0; e.wind = 0; e.atkCd = (cd ?? e.def.cd) * (e.eliteMod && e.eliteMod.id === 'rage' ? 0.7 : 1) * (Pl().has('pact_fury') ? 0.8 : 1) * U.rand(0.85, 1.2); if (e.tele) { G.fx.endTelegraph(e.tele); e.tele = null; } };
  // the same as the attack switch's own hitPlayer
  const hitP = (e, tgt, dmg, src) => {
    if (tgt.decoy) { tgt.decoy.t -= 1; return 0; } if (tgt.ally) { tgt.ally.hurt(dmg); return 0; }
    const P = Pl(), dealt = C().damagePlayer(dmg, { src: src || 'melee', attacker: e, pos: e.pos.clone(), elem: e.def.elem });
    if (e.mut && dealt > 0) G.Depth.onPlayerHit(e, dealt);
    if (e.eliteMod && e.eliteMod.id === 'vamp') e.hp = Math.min(e.maxHp, e.hp + dmg * 0.35);
    if (P.temps.has('thornarmor') && (src || 'melee') === 'melee') C().damageEnemy(e, dmg * 1.2 + C().scale(8), { src: 'skill', proc: true });
    return dealt;
  };
  const shoot = (e, kind, from, dir, speed, o) => C().spawnProjectile(Object.assign({ kind, pos: from, vel: dir.clone().multiplyScalar(speed), grav: 0, owner: 'enemy', dmg: e.dmg, radius: 0.3, life: 4, attacker: e, elem: e.def.elem || null }, o || {}));
  const aimDir = (from, to) => to.clone().sub(from).normalize();
  const yawed = (d, a) => { const c = Math.cos(a), s = Math.sin(a); return V(d.x * c - d.z * s, d.y, d.x * s + d.z * c); };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  const segDistH = (p, a, b) => { const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1e-6; const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2)); return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)); };

  // 呪いの案山子: three sickles, fanned, spinning
  K.sickles = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 0.6 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (inWind) return { x: 0, z: 0 };
      if (!A.done) {
        A.done = true; e.atk = 1;
        const from = e.centerPos().add(V(0, 0.4, 0)), dir = aimDir(from, tgt.eye);
        for (const a of [-0.17, 0, 0.17]) shoot(e, 'spear', from.clone(), yawed(dir, a), 17, { look: 'sickle', radius: 0.32, life: 3, homing: a ? 0 : 0.5 });
        G.sfx.whoosh(0.35, 1.1);
      }
      if (A.t - A.wind > 0.35) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 夕陽の番兵: a lane marked on the floor, then a ray down it
  K.sunray = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 1.1 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (!A.lane) {
        const from = e.pos.clone(), dir = V(toT.x, 0, toT.z).normalize(), len = Math.min(e.def.range, d + 8);
        A.lane = { a: from.clone().setY(G.world.floorBelow(from.x, from.y + 1, from.z)), b: from.clone().addScaledVector(dir, len), dir };
        A.lane.b.y = A.lane.a.y;
        A.tl = G.fx.teleLine(A.lane.a, A.lane.b, 1.9, A.wind, 0xffa040);
      }
      if (inWind) { e.yaw = Math.atan2(A.lane.dir.x, A.lane.dir.z); return { x: 0, z: 0 }; }
      const t = A.t - A.wind, y = A.lane.a.y + 1.2;
      if (A.tl) { G.fx.endTeleLine(A.tl); A.tl = null; }
      e.atk = 1;
      A.ray = G.vfx.hold(A.ray, 0xffa040, 0xfff0c0); A.ray.set(e.centerPos(), A.lane.b.clone().setY(y), 0.6); // (radius 0.6 + the body's 0.35 = the lane's half width)
      if (!A.snd) { A.snd = true; G.sfx.fire(e.pos, true); }
      if (!A.hit && t > 0.05 && segDistH(tgt.pos, A.lane.a, A.lane.b) < 0.6 + 0.35 && tgt.pos.y - A.lane.a.y < 2.4) { A.hit = true; hitP(e, tgt, e.dmg, 'ranged'); }
      if (t > 0.5) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 屍肉喰らいの禿鷲: up high, a ring on the ground where you stand, then the dive onto it
  K.divebomb = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 0.9 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = 2.4;
      if (!A.c) { A.c = tgt.pos.clone(); A.c.y = G.world.floorBelow(A.c.x, A.c.y + 1, A.c.z); e.tele = G.fx.telegraph(A.c.clone().setY(A.c.y + 0.02), R, A.wind + 0.45, 0xff7030); G.sfx.monster(e.pos, 'screech', e.def.pitch, 0.9); }
      if (inWind) { e.alt = Math.min(9, e.alt + dt * 6); return { x: 0, z: 0, speed: 0, fly: true }; }
      e.atk = 1;
      const to = A.c.clone().add(V(0, 0.4, 0)), dv = to.sub(e.pos), L = dv.length();
      if (L > 0.6 && A.t - A.wind < 1.2) { e.pos.addScaledVector(dv.divideScalar(L), Math.min(L, 26 * dt)); return { x: 0, z: 0, speed: 0, fly: true }; }
      if (!A.hit) {
        A.hit = true; if (e.tele) { G.fx.endTelegraph(e.tele); e.tele = null; }
        G.vfx.nova(A.c.clone(), R, 0.12, { style: 'shock', dome: false, ground: 0xc8a070 }); G.fx.dust(A.c, V(0, 1, 0), 0x8a7a60, 12); G.sfx.explosion(A.c, 0.4);
        if (Math.hypot(tgt.pos.x - A.c.x, tgt.pos.z - A.c.z) < R && tgt.pos.y - A.c.y < 1.6) hitP(e, tgt, e.dmg, 'aoe');
      }
      e.alt = U.rand(3.5, 5); endA(e);
      return { x: 0, z: 0, speed: 0, fly: true };
    },
  };
  // 墓守の祈祷師: two skeletons out of the floor (never more than four of its own at a time)
  K.raise = {
    blind: true,
    can: (e) => (E.list.filter((o) => o.alive && o.raisedBy === e).length < 3 ? 1.0 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (!A.spots) {
        A.spots = [];
        // each at a spot a skeleton can stand: open floor at the caller's own height that you can walk to. (Any spot 2.6 m off was taken:
        // beside a wall that could be inside it, or past it where there is no floor at all - the skeleton then came out at the bottom of
        // the world and died of the fall at once, so the call raised one or none.) Nearer in if there is no room; at its feet if none at all
        const w = G.world;
        for (let i = 0; i < 2; i++) {
          let p = null;
          for (let k = 0; k < 12 && !p; k++) {
            const a = Math.random() * Math.PI * 2, r = k < 6 ? 2.6 : 1.3, q = e.pos.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
            q.y = w.floorBelow(q.x, e.pos.y + 1.5, q.z);
            if (Math.abs(q.y - e.pos.y) > 1.2 || !w.boxFree(q.x - 0.35, q.y + 0.15, q.z - 0.35, q.x + 0.35, q.y + 1.9, q.z + 0.35)) continue;
            const n = w.nf ? w.navIdx(q.x, q.z, q.y) : -1;
            if (w.nf && (n < 0 || w.nb[n] || Math.abs(w.nf[n] - q.y) > 0.6 || (w.reachMask && w.reachMask.length === w.nf.length && !w.reachMask[n]))) continue;
            p = q;
          }
          if (!p) p = e.pos.clone();
          A.spots.push(p); G.vfx.area(p.clone(), 1.2, 'dark', A.wind + 0.3);
        }
        G.sfx.magic(e.pos, 'dark');
      }
      if (inWind) return { x: 0, z: 0 };
      if (!A.done) {
        A.done = true; e.atk = 1;
        const def = G.ENEMY_BY_ID.skeleton_normal;
        for (const p of A.spots) { const s = E.spawn(def, Math.max(1, e.level - 1), p.clone(), { noLoot: true, hpMul: 0.5 }); if (s) { s.raisedBy = e; s.aware = true; G.fx.dust(p, V(0, 1, 0), 0x6a5a48, 10); G.fx.debris && G.fx.debris(p.clone().setY(p.y + 0.3), G.world.mats.rock, 5, 0.12, 4); } }
      }
      if (A.t - A.wind > 0.5) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 城の弓兵: three arrows, fanned a little
  K.volley = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 0.75 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (inWind) return { x: 0, z: 0 };
      if (!A.done) {
        A.done = true; e.atk = 1;
        const from = e.centerPos().add(V(0, 0.35, 0)), lead = tgt.eye.clone().addScaledVector(tgt.vel, Math.min(0.6, from.distanceTo(tgt.eye) / 30)), dir = aimDir(from, lead);
        for (const a of [-0.11, 0, 0.11]) shoot(e, 'arrow', from.clone(), yawed(dir, a), 30, { radius: 0.18, life: 3, grav: 4 });
        G.sfx.whoosh(0.3, 1.4);
      }
      if (A.t - A.wind > 0.35) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 溺れ人: a lunge that, if it catches you, drags at your legs (slowed for a while)
  K.grab = {
    melee: true,
    can: (e, tgt, toT, d) => (d < e.def.range && Math.abs(toT.y) < 2 ? 0.5 : null), // (it walks in close, then lunges: a lunge carries about 2 m)
    update(e, A, dt, tgt, toT, d, inWind) {
      if (inWind) return { x: 0, z: 0 };
      if (!A.leapt) { A.leapt = true; const l = Math.max(d, 1), sp = 11; e.vel.x = toT.x / l * sp; e.vel.z = toT.z / l * sp; e.vel.y = 5; e.grounded = false; G.sfx.monster(e.pos, 'groan', e.def.pitch, 0.9); } // (a heavy lunge: the plain lunge's arc, a little slower)
      e.atk = Math.min(1, (A.t - A.wind) * 4);
      if (!A.hit && Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z) < e.radius + 1.15 && Math.abs(tgt.pos.y - e.pos.y) < 1.8) {
        A.hit = true; hitP(e, tgt, e.dmg);
        if (tgt === Pl() || tgt.isPlayer) { const P = Pl(); P.st.slow = Math.max(P.st.slow || 0, 2.5); G.ui.tint && G.ui.tint('web', 1.2); }
        G.fx.norm && G.fx.norm.spawn(tgt.pos.x, tgt.pos.y + 0.4, tgt.pos.z, 0, 2, 0, 0.6, 0.3, 0.1, 0.5, 0.7, 0.8, 0.6, 4, 0);
      }
      if (A.t - A.wind > 0.3 && e.grounded || A.t > 2) endA(e);
      return { x: 0, z: 0, speed: 0 };
    },
  };
  // 鉱滓の巨人: the slam, and molten iron left where it struck
  K.slagslam = {
    melee: true,
    can: (e, tgt, toT, d) => (d < e.def.range + e.radius * 0.5 && Math.abs(toT.y) < 2.5 ? 1.0 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = e.def.range;
      if (!A.c) { const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw); A.c = V(e.pos.x + fx * e.radius * 1.2, e.pos.y, e.pos.z + fz * e.radius * 1.2); e.tele = G.fx.telegraph(A.c.clone().setY(A.c.y + 0.02), R, A.wind, 0xff6020); }
      if (inWind) return { x: 0, z: 0 };
      e.atk = Math.min(1, (A.t - A.wind) / 0.15);
      if (!A.hit) {
        A.hit = true; if (e.tele) { G.fx.endTelegraph(e.tele); e.tele = null; }
        G.vfx.nova(A.c, R, 0.12, { style: 'fire', dome: false, ground: 0xff7030 }); G.fx.debris(A.c.clone().add(V(0, 0.3, 0)), G.world.mats.rock, 6, 0.2, 6);
        G.sfx.explosion(A.c, 0.6); Pl().addShake(Math.max(0, 0.6 - Pl().pos.distanceTo(A.c) * 0.04));
        if (Math.hypot(tgt.pos.x - A.c.x, tgt.pos.z - A.c.z) < R && tgt.pos.y - A.c.y < 0.9 && tgt.pos.y - A.c.y > -1.5) hitP(e, tgt, e.dmg, 'aoe');
        C().zone(A.c.clone(), 2.4, 4.5, 'fire', e.dmg * 0.25, { enemy: true, elem: 'fire' });
      }
      if (A.t - A.wind > 0.8) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 火吹き職工: a stream of fire swept slowly toward you for a second and a half (step out of the fan)
  K.flame = {
    can: (e, tgt, toT, d) => (d < e.def.range && Math.abs(toT.y) < 2.5 ? 0.55 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = e.def.range - 0.5, HALF = 0.36;
      if (inWind) return { x: 0, z: 0 };
      const t = A.t - A.wind;
      // it turns toward you, but slowly
      const dy = angDiff(Math.atan2(toT.x, toT.z), e.yaw);
      e.yaw += Math.max(-1.3 * dt, Math.min(1.3 * dt, dy));
      e.atk = 1;
      const f = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)), o = e.pos.clone().addScaledVector(f, 0.8);
      A.tick = (A.tick || 0) - dt;
      if (A.tick <= 0) {
        A.tick = 0.25;
        G.vfx.fan(o.clone().setY(e.pos.y + 0.05), f, R, HALF, 0.3, { col: 0xff6a20 });
        for (let i = 0; i < 6; i++) { const a = (Math.random() - 0.5) * HALF * 2, r = Math.random() * R; const q = o.clone().addScaledVector(yawed(f, a), r); G.fx.flameLick(q.x, e.pos.y + 0.3 + Math.random() * 0.8, q.z, 0.8, 0xff7020); }
        const rel = V(tgt.pos.x - o.x, 0, tgt.pos.z - o.z), dist = rel.length();
        if (dist < R && Math.abs(angDiff(Math.atan2(rel.x, rel.z), e.yaw)) < HALF && Math.abs(tgt.pos.y - e.pos.y) < 2.2) hitP(e, tgt, e.dmg, 'ranged');
        if (!A.snd) { A.snd = true; G.sfx.fire(o, true); }
      }
      if (t > 1.5) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 霜の亡霊: three slow frost orbs that drift after you
  K.frostfan = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 0.6 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (inWind) return { x: 0, z: 0 };
      if (!A.done) {
        A.done = true; e.atk = 1;
        const from = e.centerPos().add(V(0, 0.3, 0)), dir = aimDir(from, tgt.eye);
        for (const a of [-0.24, 0, 0.24]) shoot(e, 'frostorb', from.clone(), yawed(dir, a), 8.5, { radius: 0.38, life: 5, homing: 0.9, elem: 'frost' });
        G.sfx.ice ? G.sfx.ice(from) : G.sfx.magic(from, 'ice');
      }
      if (A.t - A.wind > 0.35) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 氷晶の守り手: a lane marked toward you, then ice spikes up along all of it
  K.shardline = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 1.0 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const HW = 1.1;
      if (!A.lane) {
        const dir = V(toT.x, 0, toT.z).normalize(), a = e.pos.clone().addScaledVector(dir, e.radius + 0.4); a.y = G.world.floorBelow(a.x, e.pos.y + 1, a.z);
        A.lane = { a, b: a.clone().addScaledVector(dir, 14), dir }; A.tl = G.fx.teleLine(A.lane.a, A.lane.b, HW * 2, A.wind, 0x9fe0ff);
      }
      if (inWind) { e.yaw = Math.atan2(A.lane.dir.x, A.lane.dir.z); return { x: 0, z: 0 }; }
      if (!A.done) {
        A.done = true; e.atk = 1; if (A.tl) { G.fx.endTeleLine(A.tl); A.tl = null; }
        const pts = []; for (let s = 0; s <= 14; s += 1.4) pts.push(A.lane.a.clone().addScaledVector(A.lane.dir, s));
        G.vfx.spikes(pts, { kind: 'ice', r: HW + 0.1, h: 2.2, n: 3, dur: 0.8, step: 0.025 });
        G.sfx.ice ? G.sfx.ice(e.pos) : G.sfx.explosion(e.pos, 0.4); Pl().addShake(0.15);
      }
      // the spikes reach a point 0.025 s per 1.4 m along the lane: it hurts as they reach you
      if (!A.hit) { const t = A.t - A.wind, along = V(tgt.pos.x - A.lane.a.x, 0, tgt.pos.z - A.lane.a.z).dot(A.lane.dir); if (along > -0.5 && along < 14.5 && t > Math.max(0, along / 1.4) * 0.025 + 0.06 && segDistH(tgt.pos, A.lane.a, A.lane.b) < HW + 0.35 && tgt.pos.y - A.lane.a.y < 2) { A.hit = true; hitP(e, tgt, e.dmg, 'aoe'); } }
      if (A.t - A.wind > 0.7) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 虚空の使徒: a ring of light where you stand, then the column out of the sky onto it
  // (in the air with no floor under you, over the void: at your own height. floorBelow gives -100 there, which is finite: the ring and the
  // column were drawn down at the bottom of the world, and the blow never reached you)
  K.smite = {
    blind: true,
    can: (e, tgt, toT, d) => (d < e.def.range ? 1.05 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = 2.6;
      if (!A.c) { A.c = tgt.pos.clone(); A.c.y = G.world.floorBelow(A.c.x, A.c.y + 1, A.c.z); if (!(A.c.y > -50)) A.c.y = tgt.pos.y; e.tele = G.fx.telegraph(A.c.clone().setY(A.c.y + 0.02), R, A.wind, 0xffe0a0); G.sfx.magic(e.pos, 'holy'); }
      if (inWind) return { x: 0, z: 0 };
      if (!A.hit) {
        A.hit = true; e.atk = 1; if (e.tele) { G.fx.endTelegraph(e.tele); e.tele = null; }
        G.vfx.pillar(A.c.clone(), R, 16, 0xffe6a8, 0.6, { c2: 0xffffff });
        G.sfx.zap && G.sfx.zap(A.c);
        if (Math.hypot(tgt.pos.x - A.c.x, tgt.pos.z - A.c.z) < R && tgt.pos.y - A.c.y < 6) hitP(e, tgt, e.dmg, 'aoe');
      }
      if (A.t - A.wind > 0.5) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 雲の守護像: a gust down a fan in front of it: knocked back and off your feet
  // 亡霊の槍兵: a lane marked before it, then the charge down it, spear first (through you once, with a shove)
  // (min: the run-up it wants. Closer than that it backs off to get it, decideMove below; with no room to get - a wall behind it, you
  // keeping up with it - it charges from where it stands)
  K.lancecharge = {
    min: 3.5,
    can: (e, tgt, toT, d) => (d < e.def.range && (d > 3.5 || e._backT > 1.2) ? 0.9 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (!A.lane) {
        const dir = V(toT.x, 0, toT.z).normalize(), len = Math.min(e.def.range + 2, d + 4), a = e.pos.clone();
        const fy = G.world.floorBelow(a.x, a.y + 1, a.z); if (isFinite(fy) && fy > -50) a.y = fy;
        A.lane = { a, b: a.clone().addScaledVector(dir, len), dir, len };
        A.tl = G.fx.teleLine(a, A.lane.b, 1.6, A.wind, 0xd06040);
      }
      const dir = A.lane.dir;
      if (inWind) { e.yaw = Math.atan2(dir.x, dir.z); return { x: 0, z: 0, speed: 0 }; }
      if (A.tl) { G.fx.endTeleLine(A.tl); A.tl = null; G.sfx.monster(e.pos, 'groan', 0.6, 1); }
      e.atk = 1; e.yaw = Math.atan2(dir.x, dir.z);
      const t = A.t - A.wind, SP = 15;
      if (!A.hit && Math.hypot(tgt.pos.x - e.pos.x, tgt.pos.z - e.pos.z) < 1.5 && Math.abs(tgt.pos.y - e.pos.y) < 1.8) {
        A.hit = true; hitP(e, tgt, e.dmg, 'melee');
        if (tgt === Pl()) { const P = Pl(); P.vel.x += dir.x * 11; P.vel.z += dir.z * 11; P.vel.y = Math.max(P.vel.y, 4); P.grounded = false; }
      }
      if (Math.random() < dt * 30) G.fx.dust(e.pos.clone(), V(-dir.x, 0.6, -dir.z), 0x6a6050, 1);
      if (t * SP >= A.lane.len || t > 1.6) endA(e);
      return { x: dir.x, z: dir.z, speed: SP };
    },
  };
  // 鉤鎖の亡者: a lane marked toward you, then the chain flies down it; caught, you are reeled in to it
  K.hook = {
    can: (e, tgt, toT, d) => (d < e.def.range && d > 4 ? 0.85 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      if (!A.lane) {
        const from = e.pos.clone(), dir = V(toT.x, 0, toT.z).normalize(), len = Math.min(e.def.range, d + 3);
        const fy = G.world.floorBelow(from.x, from.y + 1, from.z); from.y = isFinite(fy) && fy > -50 ? fy : tgt.pos.y;
        A.lane = { a: from, b: from.clone().addScaledVector(dir, len), dir, len };
        A.tl = G.fx.teleLine(A.lane.a, A.lane.b, 1.4, A.wind, 0xb0b8c8);
      }
      if (inWind) { e.yaw = Math.atan2(A.lane.dir.x, A.lane.dir.z); return { x: 0, z: 0 }; }
      if (A.tl) { G.fx.endTeleLine(A.tl); A.tl = null; G.sfx.whoosh(0.5, 0.7); }
      e.atk = 1;
      const t = A.t - A.wind, reach = Math.min(A.lane.len, t * 34);
      const tip = A.lane.a.clone().addScaledVector(A.lane.dir, reach); tip.y = e.pos.y + 1.2;
      A.ray = G.vfx.hold(A.ray, 0x8a90a0, 0xd0d8e8); A.ray.set(e.centerPos(), A.caught ? tgt.pos.clone().setY(tgt.pos.y + 1) : tip, 0.08);
      if (!A.caught && !A.missed && segDistH(tgt.pos, A.lane.a, tip) < 1.0 && Math.abs(tgt.pos.y - A.lane.a.y) < 2.4) { A.caught = true; A.ct = 0; hitP(e, tgt, e.dmg, 'ranged'); G.sfx.hit && G.sfx.hit(tgt.pos, 'metal'); }
      if (!A.caught && reach >= A.lane.len) A.missed = true;
      if (A.caught) {
        A.ct += dt;
        if (tgt === Pl()) { const P = Pl(), dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, L = Math.hypot(dx, dz); if (L > 2.2) { P.vel.x = dx / L * 13; P.vel.z = dz / L * 13; P.vel.y = Math.max(P.vel.y, 1.5); P.grounded = false; } }
        if (A.ct > 0.55) endA(e);
      } else if (A.missed && t > A.lane.len / 34 + 0.25) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 落石の番人: three circles round you (one where you stand), then the rocks come down on them from above
  K.rockfall = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 1.2 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = 2.3;
      if (!A.spots) {
        A.spots = []; A.teles = [];
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, r = k ? U.rand(3, 5.5) : 0, q = tgt.pos.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
          const fy = G.world.floorBelow(q.x, tgt.pos.y + 2, q.z); if (!isFinite(fy) || fy < tgt.pos.y - 6) continue; q.y = fy;
          A.spots.push(q); A.teles.push(G.fx.telegraph(q.clone().setY(q.y + 0.02), R, A.wind + 0.2, 0xd09050));
        }
        G.sfx.stoneGrind(e.pos, 0.6);
      }
      if (inWind) { e.yaw = Math.atan2(toT.x, toT.z); return { x: 0, z: 0 }; }
      if (!A.done) {
        A.done = true; e.atk = 1;
        for (const tl of A.teles) G.fx.endTelegraph(tl);
        for (const q of A.spots) {
          G.fx.debris(q.clone().setY(q.y + 6), G.world.mats.rock, 7, 0.45, 6); G.fx.dust(q, V(0, 1, 0), 0x7a6e60, 10); G.vfx.nova(q.clone(), R, 0.12, { style: 'shock', dome: false, ground: 0x9a8a70 });
          if (Math.hypot(tgt.pos.x - q.x, tgt.pos.z - q.z) < R && tgt.pos.y - q.y < 2) { hitP(e, tgt, e.dmg, 'aoe'); break; }
        }
        G.sfx.explosion(A.spots[0] || e.pos, 0.35);
      }
      if (A.t - A.wind > 0.4) endA(e);
      return { x: 0, z: 0 };
    },
  };
  // 沈め手: a ring under you, then the ground in it shakes; a sinking pillar under you starts going down at once (fieldgen: pillarAt)
  K.quake = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 1.0 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = 2.6;
      if (!A.c) { A.c = tgt.pos.clone(); const fy = G.world.floorBelow(A.c.x, A.c.y + 1, A.c.z); if (isFinite(fy) && fy > -50) A.c.y = fy; e.tele = G.fx.telegraph(A.c.clone().setY(A.c.y + 0.03), R, A.wind + 0.15, 0xb070ff); }
      if (inWind) { e.yaw = Math.atan2(toT.x, toT.z); return { x: 0, z: 0 }; }
      if (!A.done) {
        A.done = true; e.atk = 1; if (e.tele) { G.fx.endTelegraph(e.tele); e.tele = null; }
        G.vfx.nova(A.c.clone(), R, 0.14, { style: 'shock', dome: false, ground: 0x9a70d0 }); G.fx.dust(A.c, V(0, 1, 0), 0x6a5a80, 10); G.sfx.stoneGrind(A.c, 0.7);
        if (Math.hypot(tgt.pos.x - A.c.x, tgt.pos.z - A.c.z) < R && tgt.pos.y - A.c.y < 1.8) hitP(e, tgt, e.dmg, 'aoe');
        const F = G.FieldGen, p = F && F.pillarAt && F.pillarAt(G.world, A.c.x, A.c.z); if (p && p.st === 'up' && !e._rep) F.sinkNow(G.world, p);
      }
      if (A.t - A.wind > 0.4) endA(e);
      return { x: 0, z: 0 };
    },
  };
  K.gust = {
    can: (e, tgt, toT, d) => (d < e.def.range ? 0.85 : null),
    update(e, A, dt, tgt, toT, d, inWind) {
      const R = e.def.range, HALF = 0.42;
      if (inWind) { e.yaw = Math.atan2(toT.x, toT.z); return { x: 0, z: 0 }; }
      if (!A.done) {
        A.done = true; e.atk = 1;
        const f = V(Math.sin(e.yaw), 0, Math.cos(e.yaw)), o = e.pos.clone(); o.y = G.world.floorBelow(o.x, o.y + 0.5, o.z); if (!(o.y > -50)) o.y = tgt.pos.y; // (it hangs out over the void: no floor under it, see smite)
        G.vfx.fan(o.clone().setY(o.y + 0.05), f, R, HALF, 0.45, { col: 0xdff0ff });
        for (let i = 0; i < 14; i++) { const a = (Math.random() - 0.5) * HALF * 2, r = Math.random() * R, q = e.pos.clone().addScaledVector(yawed(f, a), r); G.fx.norm.spawn(q.x, o.y + 0.5 + Math.random() * 2, q.z, f.x * 14, 0.5, f.z * 14, 0.5, 0.25, 0.6, 0.9, 0.95, 1, 0.4, 0, 0); }
        G.sfx.whoosh(0.6, 0.5);
        const rel = V(tgt.pos.x - e.pos.x, 0, tgt.pos.z - e.pos.z), dist = rel.length();
        if (dist < R && Math.abs(angDiff(Math.atan2(rel.x, rel.z), e.yaw)) < HALF && Math.abs(tgt.pos.y - o.y) < 4) {
          hitP(e, tgt, e.dmg, 'aoe');
          if (tgt === Pl()) { const P = Pl(); P.vel.x += f.x * 15; P.vel.z += f.z * 15; P.vel.y = Math.max(P.vel.y, 5.5); P.grounded = false; }
        }
      }
      if (A.t - A.wind > 0.5) endA(e);
      return { x: 0, z: 0 };
    },
  };

  // an attack that wants a run-up (min): closer than that, the foe backs away from you to get it. (A melee foe stops once you are well
  // inside its reach, and these two had no blow for that close: they stood at arm's length and did nothing, for as long as you stayed)
  EP.decideMove = function (tgt, toT, distH, dt) {
    const k = K[this.def.attack];
    if (k && k.min && distH < k.min && this.hasLOS && Math.abs(toT.y) < 1.2 && !this.barredFrom(tgt)) {
      this._backT = (this._backT || 0) + dt;
      const l = distH || 1; return { x: -toT.x / l, z: -toT.z / l };
    }
    this._backT = 0;
    return move0.call(this, tgt, toT, distH, dt);
  };
  EP.tryAttack = function (tgt, toT, distH) {
    const k = K[this.def.attack]; if (!k) return try0.call(this, tgt, toT, distH);
    if (this.atkCd > 0 || this.state === 'spawn') return;
    if (!this.hasLOS && !k.blind) return;
    if (k.melee && this.barredFrom(tgt)) return;
    const w = k.can(this, tgt, toT, distH); if (w == null) return;
    this.attackState = { kind: this.def.attack, t: 0, wind: w }; this.wind = 0;
    G.sfx.attackWind(this.pos, this.big);
  };
  EP.updateAttack = function (dt, tgt, toT, distH) {
    const A = this.attackState, k = A && K[A.kind]; if (!k) return upd0.call(this, dt, tgt, toT, distH);
    A.t += dt; const inWind = A.t < A.wind; this.wind = inWind ? A.t / A.wind : 0;
    return k.update(this, A, dt, tgt, toT, distH, inWind);
  };
  G.FieldFoes = { K };
})();
