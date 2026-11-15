'use strict';
// Field guardians (v4): a data-driven boss framework (three rigs + an attack library) and the ten new guardians.
//  graveyard: 墓守の魔犬ガルム, 骸の王   dungeon: 冥門の妖術師, 冥府の番犬ケルベロス, 狂乱の獄囚
//  the ruined depths: 骨積みの巨人, 虚ろなる騎士王, 不死王リッチ, 奈落の巨獣, 深淵の紡ぎ女
(function () {
  const BS = G.bosses, U = G.U;
  const SLOW_K = { swipe: 1, slam: 1, charge: 1, nova: 1 }; // (the attacks whose circle lasts exactly the wind-up: BS.slow lengthens the short ones)
  const { mat, mesh, joint } = BS.h;
  const smesh = BS.h.smesh;
  const V = G.U.V;
  const PG = () => G.Props.PG;
  const Pl = () => G.player;
  const C = () => G.combat;
  const tex = () => G.Tex.tex;
  const glowM = (c, k) => mat('#000', { emissive: c, emissiveIntensity: k || 2.2 });

  // ================================================================ rigs
  // (what the rigs are built of, gfx.js: the old hand-drawn surfaces of a guardian's materials changed for the baked ones; things shaped
  // there - bones, helms, blades, shields, cloaks - hung on a joint at the guardian's measure)
  const GX = () => G.GFX || {};
  function regrain(m, quad) {
    if (!m || !m.map || m.userData.regrained || !GX().tex) return; const T = tex();
    const n = m.map === T.skin.map ? (quad === 'chitin' ? 'chitin' : quad ? 'fur' : 'leather') : m.map === T.cloth.map ? 'weave' : m.map === T.metal.map ? 'steel' : m.map === T.rock.map ? 'rock' : m.map === T.planks.map ? 'walnut' : null, t = n ? GX().tex(n) : null;
    if (!t) return; m.userData.regrained = true; m.userData.uvk = { weave: 2.2, leather: 1.3, fur: 0.8, chitin: 0.7, steel: 1.2, rock: 0.5, walnut: 1.5 }[n];   // (the grain at a guardian's size)
    m.map = t.map; m.normalMap = t.normalMap; m.roughnessMap = t.orm; m.aoMap = t.orm; if (n !== 'steel') m.roughness = 1; m.color.multiplyScalar(1.3);
  }
  // (the lit colours of a blade, a crown: kept as a tinge on dark steel - a faint glow of the same hue - not as bright paint)
  const sober = (m, k) => { if (!m || m.userData.sober) return m; m.userData.sober = true; const c = m.color, l = Math.max(c.r, c.g, c.b) || 1, g = 0.3 / l; { const r0 = c.r * g, g0 = c.g * g, b0 = c.b * g, y = (r0 + g0 + b0) / 3; c.setRGB(y + (r0 - y) * 0.3 + 0.1, y + (g0 - y) * 0.3 + 0.1, y + (b0 - y) * 0.3 + 0.11); } if (m.emissive) m.emissive.multiplyScalar(0.6); if (m.emissive) m.emissiveIntensity = Math.min(m.emissiveIntensity, k === undefined ? 0.5 : k); m.roughness = Math.max(m.roughness, 0.42); return m; };
  const gearOn = (parent, name, MM, x, y, z, rx, ry, rz, sc) => {
    const d = GX().foeGear ? GX().foeGear(name) : null; if (!d) return null;
    const g = joint(parent, x, y, z); g.rotation.set(rx || 0, ry || 0, rz || 0); if (Array.isArray(sc)) g.scale.set(sc[0], sc[1], sc[2]); else g.scale.setScalar(sc);
    for (const q of d) { const m = new THREE.Mesh(q.g, MM[q.m] || MM.def); m.castShadow = true; g.add(m); }
    return g;
  };
  let robeFine = null;
  const fineRobe = () => { if (robeFine) return robeFine; const g0 = GX().foeGeo && GX().foeGeo('robe'); if (!g0) return null; robeFine = g0.clone(); const uv = robeFine.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 5); return robeFine; };
  const putG = (parent, geo, mt, x, y, z, sx, sy, sz, rx, ry, rz) => { const m = new THREE.Mesh(geo, mt); m.position.set(x, y, z); m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; parent.add(m); return m; };
  BS.h.gearOn = gearOn; BS.h.putG = putG; BS.h.regrain = regrain;
  // humanoid: hips / torso / head / arms / legs, a weapon in the right hand; can float instead of walk
  // (a body of masses - ribs over a belly, shoulders, a head with brow and jaw, arms with their swells, hands with fingers, thighs and
  // calves - or, of bone, a man's whole skeleton to its measure; plate where it is armoured; a great helm, a hood with a skull far back
  // in it, a crown of points; a sword, a staff with a claw about its light, cleavers, a kite shield, a cloak. The joints, what a shot
  // hits and how it moves are as they were)
  function rigHuman(b, o) {
    const s = o.s || 1, r = b.root, M = o.m;
    for (const k2 in M) regrain(M[k2], false);
    sober(M.blade, 0.6); if (M.gold && M.gold.emissive && M.gold.emissive.getHex()) sober(M.gold, 0.9);
    const hipY = o.float ? 2.6 * s : 2.3 * s;
    const hips = joint(r, 0, hipY, 0);
    const bone = o.bones, K = bone && GX().bones ? GX().bones() : null, k = 2.42 * s, FG = GX().foeGeo, PP = PG();
    const skin = M.skin || M.body, arm = M.armor, dark = mat('#070606'), iron = mat('#3a3838', { metalness: 0.8, roughness: 0.6 }), hide = mat('#2a1c14', { roughness: 0.8 });
    if (K) putG(hips, K.pelvis, M.body, 0, -0.02 * s, 0, k * 1.3, k, k); else smesh(hips, PG().sph, arm || M.body, 0.62 * s, 0.34 * s, 0.44 * s);
    if (o.cloth) {
      if (o.float && fineRobe()) putG(hips, fineRobe(), M.cloth, 0, -1.2 * s, 0, 0.8 * s, 2.5 * s, 0.62 * s);
      else if (!gearOn(hips, 'tatter', { cloth: M.cloth }, 0, 0.1 * s, 0.42 * s, 0.04, 0, 0, [4.6 * s, 4.2 * s, 3 * s])) smesh(hips, PG().box, M.cloth, 1.2 * s, (o.float ? 2.2 : 1.3) * s, 0.06 * s, 0, -(o.float ? 1.1 : 0.7) * s, 0.4 * s);
      else gearOn(hips, 'tatter', { cloth: M.cloth }, 0, 0.1 * s, -0.42 * s, 0.04, Math.PI, 0, [5 * s, 3.6 * s, 3 * s]);
    }
    const torso = joint(hips, 0, 0.3 * s, 0);
    if (K) { putG(torso, K.lumbar, M.body, 0, 0, -0.05 * k, k, k * 1.26, k); putG(torso, K.chest, M.body, 0, 0.2 * k * 1.26, 0.01 * k, k * 1.5, k * 1.26, k * 1.15); putG(torso, K.neck, M.body, 0, 0.535 * k * 1.26, -0.05 * k, k); }
    else if (bone) { for (let i = 0; i < 4; i++) smesh(torso, PG().torus, M.body, 0.55 * s - i * 0.05 * s, 0.4 * s, 0.38 * s, 0, (0.5 + i * 0.32) * s, 0, Math.PI / 2, 0, 0); smesh(torso, PG().cyl8, M.body, 0.1 * s, 1.6 * s, 0.1 * s, 0, 0.9 * s, -0.25 * s); }
    else {
      smesh(torso, PG().sph, M.body, 0.74 * s, 0.66 * s, 0.5 * s, 0, 1.15 * s, 0.02 * s); smesh(torso, PG().sph, M.body, 0.6 * s, 0.55 * s, 0.44 * s, 0, 0.45 * s, 0.03 * s);
      smesh(torso, PG().sph, M.body, 0.62 * s, 0.26 * s, 0.4 * s, 0, 1.65 * s, -0.03 * s); smesh(torso, PG().cyl8, skin, 0.2 * s, 0.4 * s, 0.2 * s, 0, 1.85 * s, 0);
      for (const sx of [-1, 1]) smesh(torso, PG().sph, M.body, 0.3 * s, 0.26 * s, 0.3 * s, sx * 0.72 * s, 1.52 * s, 0);
    }
    if (arm && !bone) {
      arm.roughness = Math.max(arm.roughness, 0.66); if (M.body.metalness > 0.3) M.body.roughness = Math.max(M.body.roughness, 0.72);
      smesh(torso, PG().sph, arm, 0.76 * s, 0.56 * s, 0.52 * s, 0, 1.18 * s, 0.05 * s); smesh(torso, PG().sph, arm, 0.16 * s, 0.44 * s, 0.16 * s, 0, 1.16 * s, 0.46 * s);
      smesh(torso, PG().sph, arm, 0.7 * s, 0.56 * s, 0.42 * s, 0, 1.14 * s, -0.1 * s);
      for (let i = 0; i < 3; i++) putG(torso, PG().cyl8, arm, 0, (0.62 - i * 0.17) * s, 0.02 * s, (0.56 + i * 0.035) * s, 0.19 * s, (0.42 + i * 0.03) * s);
      putG(torso, PG().cyl8, arm, 0, 1.74 * s, 0, 0.3 * s, 0.22 * s, 0.3 * s);
      for (const sx of [-1, 1]) putG(hips, PG().rbox || PG().box, arm, sx * 0.34 * s, -0.42 * s, 0.3 * s, 0.5 * s, 0.7 * s, 0.07 * s, -0.16, 0, 0);
    }
    if (o.hunch) torso.rotation.x = 0.35;
    if (o.cape && !gearOn(torso, 'cape', { cloth: M.cloth }, 0, 1.78 * s, -0.5 * s, 0.12, 0, 0, [2.1 * s, 2.7 * s, 2.4 * s])) smesh(torso, PG().box, M.cloth, 1.4 * s, 2.6 * s, 0.06 * s, 0, 0.2 * s, -0.5 * s, 0.12);
    for (const sx of [-1, 1]) if (arm) { smesh(torso, PG().sph, arm, 0.5 * s, 0.36 * s, 0.5 * s, sx * 0.85 * s, 1.58 * s, 0, 0, 0, -sx * 0.3); smesh(torso, PG().sph, arm, 0.42 * s, 0.28 * s, 0.44 * s, sx * 1.0 * s, 1.36 * s, 0, 0, 0, -sx * 0.55); }
    const head = joint(torso, 0, 1.9 * s, 0.05 * s);
    const kh = 3.0 * s; let eyeY = 0.24 * s, eyeX = 0.13 * s, eyeZ = (bone ? 0.42 : o.hood ? 0.4 : 0.3) * s, topY = 0.6 * s;
    if (K) { putG(head, K.skull, M.body, 0, 0.05 * s, 0, kh); putG(head, K.jaw, M.body, 0, 0.05 * s - 0.008 * kh, 0, kh, kh, kh, 0.12); eyeX = 0.031 * kh; eyeY = 0.05 * s + 0.038 * kh; eyeZ = 0.05 * kh; topY = 0.05 * s + 0.17 * kh; }
    else if (bone) { smesh(head, PG().sph, M.body, 0.42 * s, 0.48 * s, 0.46 * s, 0, 0.2 * s, 0); smesh(head, PG().box, M.body, 0.34 * s, 0.14 * s, 0.3 * s, 0, -0.1 * s, 0.1 * s); }
    else if (o.helm) {
      if (gearOn(head, 'helm', { steel: arm, trim: M.gold || iron, dark, mail: mat('#2e2e33', { metalness: 0.6, roughness: 0.75 }) }, 0, -0.1 * s, 0, 0, 0, 0, 1.9 * s)) { eyeX = 0.135 * s; eyeY = 0.22 * s; eyeZ = 0.33 * s; }
      else { smesh(head, PG().box, arm, 0.62 * s, 0.75 * s, 0.66 * s, 0, 0.2 * s, 0); smesh(head, PG().box, mat('#050505'), 0.5 * s, 0.06 * s, 0.02 * s, 0, 0.25 * s, 0.34 * s); }
    }
    else if (o.hood) {
      smesh(head, PG().sph, M.cloth, 0.44 * s, 0.48 * s, 0.46 * s, 0, 0.22 * s, -0.05 * s); smesh(head, PG().cone, M.cloth, 0.3 * s, 0.75 * s, 0.3 * s, 0, 0.62 * s, -0.32 * s, -0.9);
      smesh(head, PG().sph, M.cloth, 0.5 * s, 0.22 * s, 0.42 * s, 0, -0.18 * s, -0.02 * s);
      putG(head, PG().sph, dark, 0, 0.17 * s, 0.2 * s, 0.33 * s, 0.38 * s, 0.2 * s);
      if (PP.skullB) { putG(head, PP.skullB, skin, 0, -0.1 * s, 0.05 * s, 2.3 * s); putG(head, PP.skullD, dark, 0, -0.1 * s, 0.05 * s, 2.3 * s); eyeX = 0.083 * s; eyeY = 0.125 * s; eyeZ = 0.27 * s; }
    }
    else {
      smesh(head, PG().sph, skin, 0.3 * s, 0.34 * s, 0.32 * s, 0, 0.26 * s, -0.02 * s); smesh(head, PG().box, skin, 0.36 * s, 0.22 * s, 0.32 * s, 0, 0.02 * s, 0.07 * s);
      smesh(head, PG().box, skin, 0.46 * s, 0.09 * s, 0.16 * s, 0, 0.36 * s, 0.22 * s, 0.25); smesh(head, PG().sph, skin, 0.06 * s, 0.1 * s, 0.08 * s, 0, 0.2 * s, 0.31 * s);
      putG(head, PG().box, dark, 0, 0.03 * s, 0.235 * s, 0.2 * s, 0.035 * s, 0.03 * s);
      for (const sx of [-1, 1]) putG(head, PG().sph, dark, sx * 0.13 * s, 0.25 * s, 0.26 * s, 0.085 * s, 0.065 * s, 0.05 * s);
      eyeZ = 0.3 * s;
    }
    const eyeM = glowM(o.eyes || 0xff3010, 2.6), er = (K ? 0.045 : o.helm ? 0.04 : o.hood ? 0.035 : 0.028) * s;
    for (const sx of [-1, 1]) smesh(head, PG().sph, eyeM, er, er * 0.7, er * 0.6, sx * eyeX, eyeY, eyeZ);
    if (o.crown) {
      const gold = M.gold || mat('#8c7036', { metalness: 0.9, roughness: 0.4 });
      smesh(head, PG().cyl8, gold, 0.3 * s, 0.11 * s, 0.33 * s, 0, topY - 0.06 * s, -0.02 * s);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39, hh = (i % 2 ? 0.2 : 0.36) * s; smesh(head, PG().cone, gold, 0.05 * s, hh, 0.035 * s, Math.cos(a) * 0.28 * s, topY - 0.01 * s + hh / 2, -0.02 * s + Math.sin(a) * 0.31 * s, Math.sin(a) * 0.12, -a, -Math.cos(a) * 0.12); }
    }
    if (o.horns) for (const sx of [-1, 1]) { const hm = M.horn || M.body; smesh(head, PG().cone, hm, 0.14 * s, 0.6 * s, 0.14 * s, sx * 0.3 * s, topY - 0.02 * s, -0.06 * s, -0.25, 0, -sx * 0.85); smesh(head, PG().cone, hm, 0.09 * s, 0.6 * s, 0.09 * s, sx * 0.62 * s, topY + 0.33 * s, -0.12 * s, -0.3, 0, -sx * 0.15); smesh(head, PG().sph, hm, 0.1 * s, 0.1 * s, 0.1 * s, sx * 0.5 * s, topY + 0.1 * s, -0.09 * s); }
    const arms = [], robed = !!(o.hood && o.cloth && M.cloth);
    for (const sx of [-1, 1]) {
      const sh = joint(torso, sx * 0.85 * s, 1.5 * s, 0), pos = sx > 0;
      const el = joint(sh, 0, -1.0 * s, 0);
      const hand = joint(el, 0, -0.95 * s, 0.05 * s);
      if (K) { putG(sh, pos ? K.humP : K.humN, M.body, 0, 0, 0, k, k * 1.37, k); putG(el, K.forearm, M.body, 0, 0, 0, k, k * 1.3, k); putG(hand, K.hand, M.body, 0, 0.05 * s, 0, k, k, k, 0, pos ? 0 : Math.PI, 0); }
      else if (bone) { smesh(sh, PG().cyl8, M.body, 0.1 * s, 1.0 * s, 0.1 * s, 0, -0.5 * s, 0); smesh(el, PG().cyl8, M.body, 0.08 * s, 0.95 * s, 0.08 * s, 0, -0.45 * s, 0); smesh(hand, PG().box, skin, 0.28 * s, 0.3 * s, 0.28 * s); }
      else {
        const um = robed ? M.cloth : skin;
        smesh(sh, PG().sph, um, 0.25 * s, 0.3 * s, 0.26 * s, 0, -0.06 * s, 0); smesh(sh, PG().sph, um, 0.21 * s, 0.5 * s, 0.23 * s, 0, -0.5 * s, 0);
        const fm = arm || um;
        if (robed && fineRobe()) putG(el, fineRobe(), M.cloth, 0, -0.5 * s, 0, 0.3 * s, 1.0 * s, 0.3 * s);
        smesh(el, PG().sph, fm, 0.19 * s, 0.36 * s, 0.2 * s, 0, -0.3 * s, 0.01 * s); smesh(el, PG().cyl8, fm, 0.14 * s, 0.9 * s, 0.15 * s, 0, -0.45 * s, 0);
        if (arm) { putG(el, PG().sph, arm, 0, 0, 0, 0.22 * s, 0.22 * s, 0.24 * s); putG(el, PG().cyl8, arm, 0, -0.5 * s, 0, 0.19 * s, 0.6 * s, 0.2 * s); putG(el, PG().cyl8, arm, 0, -0.84 * s, 0, 0.215 * s, 0.14 * s, 0.225 * s); }
        smesh(hand, PG().sph, skin, 0.17 * s, 0.2 * s, 0.12 * s);
        for (let i = 0; i < 3; i++) smesh(hand, PG().sph, skin, 0.05 * s, 0.15 * s, 0.06 * s, (i - 1) * 0.1 * s, -0.22 * s, 0.03 * s);
        smesh(hand, PG().sph, skin, 0.055 * s, 0.11 * s, 0.06 * s, -sx * 0.16 * s, -0.06 * s, 0.07 * s);
      }
      arms.push({ sh, el, hand });
    }
    // weapon (right hand)
    const R = arms[1].hand;
    const wp = o.weapon;
    let tip = null;
    if (wp === 'greatsword' || wp === 'sword') {
      const L = (wp === 'greatsword' ? 4.2 : 2.6) * s;
      if (!gearOn(R, 'greatsword', { leather: M.grip || hide, iron: M.gold || arm || iron, blade: M.blade || mat('#8a8c92', { metalness: 1, roughness: 0.35 }), dark }, 0, 0, 0.1 * s, 0, 0, 0, (L + 0.35 * s) / 1.32)) {
        smesh(R, PG().cyl8, M.grip || mat('#2a1a10'), 0.06 * s, 0.6 * s, 0.06 * s, 0, 0, 0.1 * s, Math.PI / 2);
        smesh(R, PG().box, M.gold || M.armor, 0.7 * s, 0.1 * s, 0.12 * s, 0, 0, 0.42 * s);
        smesh(R, PG().box, M.blade || mat('#b8bcc4', { metalness: 1, roughness: 0.25 }), 0.08 * s, 0.24 * s, L, 0, 0, 0.45 * s + L / 2);
      }
      tip = joint(R, 0, 0, 0.45 * s + L);
    } else if (wp === 'staff') {
      const wood = mat('#2a1a20', { map: tex().planks.map }); regrain(wood, false);
      if (!gearOn(R, 'staff', { wood, bone: mat('#b8ac90', { roughness: 0.6 }), dark }, 0, 0, 0, 0, 0, 0, 2.33 * s)) smesh(R, PG().cyl8, wood, 0.07 * s, 4.2 * s, 0.07 * s, 0, 0.6 * s, 0);
      tip = joint(R, 0, 2.8 * s, 0);
      smesh(tip, PG().sph, glowM(o.orb || 0x9a50ff, 3), 0.22 * s, 0.22 * s, 0.22 * s);
    } else if (wp === 'cleavers') {
      for (const hnd of [arms[0].hand, R]) if (!gearOn(hnd, 'cleaver', { wood: hide, blade: mat('#6a6a6c', { metalness: 0.9, roughness: 0.55 }), dark }, 0, 0, 0.1 * s, 0, 0, 0, 2.3 * s)) { smesh(hnd, PG().cyl8, mat('#2a1a10'), 0.05 * s, 0.4 * s, 0.05 * s, 0, 0, 0.1 * s, Math.PI / 2); smesh(hnd, PG().box, mat('#7a7a7a', { metalness: 0.9, roughness: 0.5 }), 0.06 * s, 0.6 * s, 1.0 * s, 0, 0.2 * s, 0.75 * s); }
      tip = joint(R, 0, 0, 1.2 * s);
    }
    if (o.shield && !gearOn(arms[0].hand, 'kite', { paint: mat('#241a1c', { roughness: 0.85 }), steel: arm || iron }, -0.2 * s, 0.1 * s, 0.2 * s, 0, -Math.PI / 2, 0, 1.8 * s)) smesh(arms[0].hand, PG().box, M.armor, 0.15 * s, 1.6 * s, 1.1 * s, -0.15 * s, 0, 0.2 * s);
    const legs = [];
    for (const sx of [-1, 1]) {
      const hp = joint(hips, sx * 0.38 * s, -0.2 * s, 0), lm = arm || M.body, pos = sx > 0;
      if (K) { putG(hp, pos ? K.femP : K.femN, M.body, 0, 0, 0, k, k * 0.94, k); putG(hp, pos ? K.shinP : K.shinN, M.body, 0, -0.46 * k * 0.94, 0, k, k * 0.94, k); if (!o.float) putG(hp, K.foot, M.body, 0, -0.832 * k * 0.94, 0, k); }
      else if (bone) { smesh(hp, PG().cyl8, M.body, 0.11 * s, 2.1 * s, 0.11 * s, 0, -1.05 * s, 0); if (!o.float) smesh(hp, PG().box, M.body, 0.55 * s, 0.25 * s, 0.8 * s, 0, -2.1 * s, 0.15 * s); }
      else {
        smesh(hp, PG().sph, lm, 0.3 * s, 0.62 * s, 0.32 * s, 0, -0.55 * s, 0.01 * s); smesh(hp, PG().sph, lm, 0.2 * s, 0.2 * s, 0.23 * s, 0, -1.06 * s, 0.04 * s);
        smesh(hp, PG().sph, lm, 0.22 * s, 0.42 * s, 0.24 * s, 0, -1.45 * s, -0.04 * s); smesh(hp, PG().cyl8, lm, 0.15 * s, 1.0 * s, 0.16 * s, 0, -1.55 * s, 0);
        if (!o.float) { smesh(hp, PG().box, lm, 0.42 * s, 0.24 * s, 0.7 * s, 0, -2.0 * s, 0.12 * s); smesh(hp, PG().sph, lm, 0.2 * s, 0.14 * s, 0.26 * s, 0, -2.03 * s, 0.46 * s); }
        if (arm) { putG(hp, PG().sph, arm, 0, -1.06 * s, 0.07 * s, 0.25 * s, 0.25 * s, 0.27 * s); putG(hp, PG().cyl8, arm, sx * 0.24 * s, -1.06 * s, 0.05 * s, 0.22 * s, 0.06 * s, 0.22 * s, 0, 0, Math.PI / 2); if (!o.float) putG(hp, PG().cone, arm, 0, -2.04 * s, 0.64 * s, 0.17 * s, 0.4 * s, 0.13 * s, Math.PI / 2); }
      }
      legs.push(hp);
    }
    const J = { hips, torso, head, arms, legs, tip, hipY };
    J.hits = [{ n: torso, r: 0.95 * s, part: 'body', o: V(0, 0.9 * s, 0) }, { n: head, r: 0.42 * s, part: 'head', o: V(0, 0.2 * s, 0) }, { n: hips, r: 0.7 * s, part: 'body' }, { n: legs[0], r: 0.35 * s, part: 'body', o: V(0, -1 * s, 0) }, { n: legs[1], r: 0.35 * s, part: 'body', o: V(0, -1 * s, 0) }];
    J.anim = (bb, dt) => {
      const w = bb.walk || 0, p = bb.pose || {}, k = p.k || 0;
      const mv = Math.min(1, bb.mv || 0);
      if (o.float) { hips.position.y = hipY + Math.sin(bb.t * 1.6) * 0.25 * s + (bb.hY || 0); for (let i = 0; i < 2; i++) legs[i].rotation.x = 0.25 + Math.sin(bb.t * 1.6 + i) * 0.1; }
      else { hips.position.y = hipY + Math.abs(Math.sin(w)) * 0.12 * s * mv + (bb.hY || 0); for (let i = 0; i < 2; i++) legs[i].rotation.x = Math.sin(w + i * Math.PI) * 0.45 * mv - (p.n === 'leap' ? 0.6 * k : 0); }
      arms[0].sh.rotation.x = -Math.sin(w) * 0.35 * mv; arms[1].sh.rotation.x = Math.sin(w) * 0.35 * mv;
      arms[0].sh.rotation.z = -0.15; arms[1].sh.rotation.z = 0.15;
      if (p.n === 'swing') { arms[1].sh.rotation.x = U.lerp(-2.6, 0.6, p.hit || 0) * k; arms[1].sh.rotation.z = 0.15 + (p.hit ? 0.6 : 0) * k; torso.rotation.y = U.lerp(0.5, -0.6, p.hit || 0) * k; }
      else if (p.n === 'slam') { const a = U.lerp(-3.0, -0.4, p.hit || 0) * k; arms[0].sh.rotation.x = a; arms[1].sh.rotation.x = a; torso.rotation.x = (o.hunch ? 0.35 : 0) + (p.hit ? 0.45 : -0.2) * k; }
      else if (p.n === 'cast') { arms[0].sh.rotation.x = -2.4 * k; arms[1].sh.rotation.x = -2.6 * k; arms[0].sh.rotation.z = -0.6 * k; arms[1].sh.rotation.z = 0.6 * k; }
      else if (p.n === 'throw') { arms[1].sh.rotation.x = U.lerp(-2.8, 0.4, p.hit || 0) * k; }
      else { torso.rotation.y = U.damp(torso.rotation.y, 0, 6, dt); torso.rotation.x = U.damp(torso.rotation.x, o.hunch ? 0.35 : 0, 6, dt); }
    };
    J.height = (hipY + 2.4 * s);
    return J;
  }
  // quadruped (hound / cerberus / behemoth): body, 1-3 necks + heads with jaws, four legs, a tail
  // (a beast of masses: a barrel of ribs, a tucked belly, haunches, a hump over the shoulders; a skull with a brow, cheeks, a long
  // muzzle and fangs; legs with a thigh, a thin shank and clawed feet; a ridge of spines, an iron collar with its broken chain)
  function rigQuad(b, o) {
    const s = o.s || 1, r = b.root, M = o.m;
    for (const k2 in M) regrain(M[k2], true);
    const bodyY = 1.7 * s, dark = mat('#070606'), tooth = M.claw || mat('#e8e0c8'), hornM = M.horn || M.body;
    const body = joint(r, 0, bodyY, 0);
    smesh(body, PG().sph, M.body, 0.8 * s, 0.76 * s, 1.08 * s, 0, -0.02 * s, 0.55 * s);       // ribs
    smesh(body, PG().sph, M.body, 0.6 * s, 0.56 * s, 0.9 * s, 0, 0.1 * s, -0.42 * s);         // the belly, tucked up
    smesh(body, PG().sph, M.body, 0.7 * s, 0.68 * s, 0.76 * s, 0, 0.05 * s, -1.05 * s);       // haunches
    smesh(body, PG().sph, M.body, 0.6 * s, 0.52 * s, 0.62 * s, 0, 0.48 * s, 0.9 * s);         // the hump of the shoulders
    smesh(body, PG().sph, M.body, 0.52 * s, 0.52 * s, 0.62 * s, 0, 0.4 * s, 1.3 * s, -0.5);   // the neck's root
    for (const sx of [-1, 1]) { smesh(body, PG().sph, M.body, 0.3 * s, 0.6 * s, 0.46 * s, sx * 0.56 * s, -0.05 * s, 0.95 * s); smesh(body, PG().sph, M.body, 0.34 * s, 0.64 * s, 0.52 * s, sx * 0.5 * s, 0.0, -1.0 * s); }
    if (o.spikes) for (let i = 0; i < 9; i++) { const hh = (0.5 + (i * 7 % 4) * 0.14 - Math.abs(i - 3) * 0.03) * s; smesh(body, PG().cone, hornM, 0.11 * s, hh, 0.16 * s, 0, 0.68 * s + (i < 3 ? (i * 0.12) * s : 0.26 * s - (i - 3) * 0.04 * s), (1.25 - i * 0.33) * s, -0.5); }
    if (o.collar) {
      const im = mat('#3e3c3c', { metalness: 0.85, roughness: 0.55 });
      smesh(body, PG().torus, im, 0.62 * s, 0.62 * s, 1.1 * s, 0, 0.42 * s, 1.5 * s, 0.45, 0, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; smesh(body, PG().cone, im, 0.07 * s, 0.26 * s, 0.07 * s, Math.cos(a) * 0.7 * s, 0.42 * s + Math.sin(a) * 0.64 * s, 1.5 * s - Math.sin(a) * 0.3 * s, 0, 0, a - Math.PI / 2); }
      for (let i = 0; i < 5; i++) smesh(body, PG().torus, im, 0.12 * s, 0.16 * s, 0.7 * s, 0.08 * s * (i % 2), -0.28 * s - i * 0.2 * s, 1.72 * s, i % 2 ? 0 : 0.2, i % 2 ? Math.PI / 2 : 0, 0);
    }
    const heads = [];
    const nh = o.heads || 1;
    for (let i = 0; i < nh; i++) {
      const off = nh === 1 ? 0 : (i - (nh - 1) / 2) * 0.75 * s;
      const neck = joint(body, off, 0.45 * s, 1.4 * s);
      neck.rotation.y = nh === 1 ? 0 : (i - (nh - 1) / 2) * -0.3;
      smesh(neck, PG().sph, M.body, 0.36 * s, 0.4 * s, 0.66 * s, 0, 0.17 * s, 0.42 * s, -0.5);
      const head = joint(neck, 0, 0.45 * s, 0.95 * s);
      smesh(head, PG().sph, M.body, 0.36 * s, 0.33 * s, 0.44 * s, 0, 0.03 * s, 0.04 * s);                 // skull
      smesh(head, PG().box, M.body, 0.58 * s, 0.14 * s, 0.28 * s, 0, 0.2 * s, 0.3 * s, 0.25);             // brow
      for (const sx of [-1, 1]) smesh(head, PG().sph, M.body, 0.2 * s, 0.2 * s, 0.28 * s, sx * 0.2 * s, -0.1 * s, 0.2 * s);   // cheeks
      smesh(head, PG().box, M.body, 0.36 * s, 0.26 * s, 0.62 * s, 0, -0.02 * s, 0.64 * s);                // muzzle
      smesh(head, PG().box, M.body, 0.27 * s, 0.21 * s, 0.34 * s, 0, 0.0, 0.98 * s);                      // its end
      putG(head, PG().sph, dark, 0, 0.04 * s, 1.16 * s, 0.11 * s, 0.09 * s, 0.08 * s);                    // nose
      const jaw = joint(head, 0, -0.18 * s, 0.25 * s);
      smesh(jaw, PG().box, M.body, 0.3 * s, 0.13 * s, 0.82 * s, 0, 0, 0.37 * s);
      putG(jaw, PG().box, dark, 0, 0.07 * s, 0.4 * s, 0.22 * s, 0.03 * s, 0.62 * s);                      // the dark of the mouth
      for (const sx of [-1, 1]) {
        for (let t = 0; t < 4; t++) smesh(head, PG().cone, tooth, 0.035 * s, (t === 3 ? 0.22 : 0.12) * s, 0.035 * s, sx * 0.135 * s, -0.19 * s, (0.5 + t * 0.19) * s, Math.PI);
        for (let t = 0; t < 3; t++) smesh(jaw, PG().cone, tooth, 0.032 * s, (t === 2 ? 0.17 : 0.1) * s, 0.032 * s, sx * 0.115 * s, 0.11 * s, (0.4 + t * 0.17) * s);
      }
      const eyeM = glowM(o.eyes ? o.eyes[i % o.eyes.length] : 0xff4010, 2.8);
      for (const sx of [-1, 1]) smesh(head, PG().sph, eyeM, 0.06 * s, 0.045 * s, 0.035 * s, sx * 0.2 * s, 0.12 * s, 0.42 * s);
      for (const sx of [-1, 1]) {
        if (o.horns) { smesh(head, PG().cone, hornM, 0.15 * s, 0.6 * s, 0.15 * s, sx * 0.34 * s, 0.4 * s, -0.12 * s, -0.5, 0, -sx * 0.9); smesh(head, PG().cone, hornM, 0.1 * s, 0.7 * s, 0.1 * s, sx * 0.7 * s, 0.72 * s, -0.02 * s, 0.5, 0, -sx * 0.1); smesh(head, PG().sph, hornM, 0.11 * s, 0.11 * s, 0.11 * s, sx * 0.58 * s, 0.5 * s, -0.16 * s); }
        else smesh(head, PG().cone, M.body, 0.13 * s, 0.42 * s, 0.07 * s, sx * 0.24 * s, 0.38 * s, -0.16 * s, -0.55, 0, -sx * 0.2);
      }
      heads.push({ neck, head, jaw });
    }
    const legs = [];
    for (const [lx, lz] of [[-0.6, 1.0], [0.6, 1.0], [-0.6, -1.0], [0.6, -1.0]]) {
      const rear = lz < 0;
      const hp = joint(body, lx * s, -0.35 * s, lz * s);
      smesh(hp, PG().sph, M.body, (rear ? 0.26 : 0.22) * s, 0.58 * s, (rear ? 0.38 : 0.3) * s, 0, -0.4 * s, rear ? -0.05 * s : 0);
      const kn = joint(hp, 0, -0.9 * s, 0);
      smesh(kn, PG().cyl8, M.body, 0.13 * s, 0.86 * s, 0.15 * s, 0, -0.42 * s, rear ? 0.05 * s : 0.02 * s, rear ? -0.14 : 0.05);
      smesh(kn, PG().sph, M.body, 0.16 * s, 0.26 * s, 0.19 * s, 0, -0.12 * s, 0);
      smesh(kn, PG().sph, M.body, 0.2 * s, 0.13 * s, 0.3 * s, 0, -0.82 * s, 0.12 * s);
      for (const cx of [-0.11, 0, 0.11]) smesh(kn, PG().cone, M.claw || dark, 0.04 * s, 0.17 * s, 0.04 * s, cx * s, -0.87 * s, 0.42 * s, Math.PI / 2 + 0.35);
      legs.push({ hp, kn });
    }
    const tail = joint(body, 0, 0.3 * s, -1.4 * s);
    smesh(tail, PG().sph, M.body, 0.2 * s, 0.2 * s, 0.34 * s, 0, 0.02 * s, -0.2 * s);
    smesh(tail, PG().cone, M.body, 0.17 * s, 1.9 * s, 0.17 * s, 0, 0.28 * s, -1.0 * s, -Math.PI / 2 - 0.28);
    const J = { body, heads, legs, tail, bodyY };
    J.hits = [{ n: body, r: 1.15 * s, part: 'body', o: V(0, 0, 0.5 * s) }, { n: body, r: 1.0 * s, part: 'body', o: V(0, 0, -0.8 * s) }];
    for (const h of heads) J.hits.push({ n: h.head, r: 0.48 * s, part: 'head' });
    J.anim = (bb, dt) => {
      const w = bb.walk || 0, p = bb.pose || {}, k = p.k || 0, mv = Math.min(1, bb.mv || 0);
      body.position.y = bodyY + Math.abs(Math.sin(w * 2)) * 0.12 * s * mv + (bb.hY || 0);
      legs.forEach((L, i) => { const ph = w + [0, Math.PI, Math.PI, 0][i]; L.hp.rotation.x = Math.sin(ph) * 0.5 * mv - (p.n === 'leap' ? 0.7 * k : 0); L.kn.rotation.x = Math.max(0, -Math.sin(ph)) * 0.5 * mv; });
      tail.rotation.y = Math.sin(bb.t * 3) * 0.3; tail.rotation.x = 0.2 + Math.sin(bb.t * 2) * 0.1;
      body.rotation.x = p.n === 'leap' ? -0.25 * k : p.n === 'bite' ? 0.12 * k : 0;
      heads.forEach((h, i) => {
        const act = p.n === 'bite' || p.n === 'breath' || p.n === 'howl';
        const which = p.head == null || p.head === i;
        h.jaw.rotation.x = act && which ? (p.n === 'howl' ? 0.7 : 0.55) * k : 0.06 + Math.sin(bb.t * 2 + i) * 0.04;
        h.neck.rotation.x = p.n === 'howl' && which ? -0.9 * k : p.n === 'bite' && which ? 0.35 * k : Math.sin(bb.t * 1.3 + i) * 0.06;
      });
    };
    J.height = 3.6 * s;
    return J;
  }
  // spider (weaver): abdomen, thorax, eight jointed legs, fangs, a cluster of eyes; optional human torso rising from the thorax
  // (a low shield of a fore-body with a ridge down it, a waist, a swollen abdomen banded dark with an hourglass on it and spinnerets
  // behind; eight eyes in two rows, heavy jaws with their fangs, feelers; legs of a hip, a thick thigh, a knee, a shin drawn out to
  // a claw, bristled. The lady: ribs and shoulders rising out of the fore-body, thin arms with long fingers, hair hanging to the waist)
  function rigSpider(b, o) {
    const s = o.s || 1, r = b.root, M = o.m;
    for (const k2 in M) regrain(M[k2], 'chitin');
    const bodyY = 2.2 * s, dark = mat('#070606'), Rod = GX().Geo ? GX().Geo.rod : null;
    const rodM = (parent, a, c, r0, r1, mt) => { if (!Rod) return null; const m = new THREE.Mesh(Rod(a, c, r0, 8, r1), mt); m.castShadow = true; parent.add(m); return m; };
    const body = joint(r, 0, bodyY, 0);
    smesh(body, PG().sph, M.body, 0.98 * s, 0.6 * s, 1.15 * s, 0, 0, 0.6 * s); smesh(body, PG().sph, M.body, 0.3 * s, 0.24 * s, 0.9 * s, 0, 0.48 * s, 0.55 * s);
    smesh(body, PG().sph, M.body, 0.4 * s, 0.36 * s, 0.4 * s, 0, 0.1 * s, -0.5 * s);                                     // the waist
    const abd = joint(body, 0, 0.3 * s, -0.9 * s);
    smesh(abd, PG().sph, M.body, 1.6 * s, 1.3 * s, 2.0 * s, 0, 0.2 * s, -0.9 * s);
    for (let i = 0; i < 5; i++) { const z = -0.1 - i * 0.42, rr = Math.sqrt(Math.max(0.05, 1 - Math.pow((z + 0.9) / 2.0, 2))); putG(abd, PG().torus, dark, 0, 0.2 * s, z * s, 1.6 * rr * s * 1.004, 1.3 * rr * s * 1.004, 0.5 * s); }
    const mk = glowM(o.mark || 0xa040ff, 0.9);
    putG(abd, PG().cone, mk, 0, 1.4 * s, -0.62 * s, 0.34 * s, 0.5 * s, 0.1 * s, -Math.PI / 2 - 0.16); putG(abd, PG().cone, mk, 0, 1.44 * s, -1.2 * s, 0.34 * s, 0.5 * s, 0.1 * s, Math.PI / 2 - 0.02);
    for (const sx of [-1, 0, 1]) putG(abd, PG().cone, M.body, sx * 0.22 * s, -0.1 * s, -2.85 * s, 0.13 * s, 0.4 * s, 0.13 * s, -Math.PI / 2 - 0.3);
    const head = joint(body, 0, 0.1 * s, 1.5 * s);
    smesh(head, PG().sph, M.body, 0.55 * s, 0.42 * s, 0.5 * s); smesh(head, PG().sph, M.body, 0.44 * s, 0.16 * s, 0.3 * s, 0, 0.3 * s, 0.22 * s);
    const eyeM = glowM(o.eyes || 0xff2050, 3);
    for (let i = 0; i < 8; i++) { const big = i >= 4, c = (i % 4) - 1.5; smesh(head, PG().sph, eyeM, (big ? 0.075 : 0.045) * s, (big ? 0.075 : 0.045) * s, 0.04 * s, c * (big ? 0.2 : 0.14) * s, (big ? 0.16 : 0.33) * s, (big ? 0.46 - Math.abs(c) * 0.04 : 0.36) * s); }
    for (const sx of [-1, 1]) { smesh(head, PG().sph, M.body, 0.17 * s, 0.26 * s, 0.2 * s, sx * 0.18 * s, -0.2 * s, 0.34 * s); rodM(head, [sx * 0.4 * s, -0.1 * s, 0.2 * s], [sx * 0.55 * s, -0.5 * s, 0.75 * s], 0.06 * s, 0.03 * s, M.body); }
    const fangs = [];
    for (const sx of [-1, 1]) { const f = joint(head, sx * 0.18 * s, -0.25 * s, 0.35 * s); smesh(f, PG().cone, mat('#1a1010'), 0.08 * s, 0.5 * s, 0.08 * s, 0, -0.2 * s, 0.05 * s, Math.PI); putG(f, PG().sph, mat('#1a1010'), 0, 0, 0.03 * s, 0.1 * s, 0.1 * s, 0.1 * s); fangs.push(f); }
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const sx = i < 4 ? -1 : 1, k = i % 4;
      const hp = joint(body, sx * 0.7 * s, 0, (0.9 - k * 0.5) * s);
      hp.rotation.y = sx * (Math.PI / 2 - 0.5 + k * 0.32) * -1;
      const a = joint(hp, 0, 0, 0);
      const kn = joint(a, 0, 1.0 * s, 1.6 * s);
      if (Rod) {
        putG(a, PG().sph, M.body, 0, 0, 0, 0.2 * s, 0.2 * s, 0.2 * s); rodM(a, [0, 0, 0], [0, 1.0 * s, 1.6 * s], 0.15 * s, 0.1 * s, M.body);
        putG(kn, PG().sph, M.body, 0, 0, 0, 0.14 * s, 0.14 * s, 0.14 * s); rodM(kn, [0, 0, 0], [0, -1.55 * s, 0.93 * s], 0.095 * s, 0.05 * s, M.body); rodM(kn, [0, -1.55 * s, 0.93 * s], [0, -2.05 * s, 1.2 * s], 0.05 * s, 0.012 * s, dark);
        for (let q = 0; q < 5; q++) { const t = 0.2 + q * 0.16; putG(kn, PG().cone, dark, 0, -1.55 * s * t + 0.07 * s, 0.93 * s * t + 0.09 * s, 0.018 * s, 0.22 * s, 0.018 * s, 0.9); }
      } else { smesh(a, PG().box, M.body, 0.18 * s, 0.18 * s, 1.8 * s, 0, 0.5 * s, 0.85 * s, -0.55); smesh(kn, PG().box, M.body, 0.14 * s, 0.14 * s, 2.4 * s, 0, -1.0 * s, 0.6 * s, 0.95); }
      legs.push({ hp, a, kn, sx, k });
    }
    let torso = null;
    if (o.lady) {
      const sk = M.skin || M.body, hair = mat('#0c0a0e', { roughness: 0.5, side: THREE.DoubleSide });
      torso = joint(body, 0, 0.6 * s, 1.1 * s);
      smesh(torso, PG().cone, sk, 0.42 * s, 0.9 * s, 0.34 * s, 0, 0.2 * s, -0.02 * s);                                    // the waist, out of the fore-body
      smesh(torso, PG().sph, sk, 0.36 * s, 0.4 * s, 0.25 * s, 0, 0.82 * s, -0.1 * s, -0.15); smesh(torso, PG().sph, sk, 0.42 * s, 0.14 * s, 0.22 * s, 0, 1.12 * s, -0.14 * s);
      smesh(torso, PG().cyl8, sk, 0.09 * s, 0.24 * s, 0.09 * s, 0, 1.28 * s, -0.12 * s);
      const lh = joint(torso, 0, 1.45 * s, 0.05 * s);
      smesh(lh, PG().sph, sk, 0.25 * s, 0.31 * s, 0.27 * s, 0, 0.02 * s, -0.04 * s); smesh(lh, PG().box, sk, 0.26 * s, 0.17 * s, 0.24 * s, 0, -0.17 * s, 0.03 * s); smesh(lh, PG().sph, sk, 0.045 * s, 0.08 * s, 0.06 * s, 0, -0.03 * s, 0.24 * s);
      for (const sx of [-1, 1]) { putG(lh, PG().sph, dark, sx * 0.1 * s, 0.04 * s, 0.2 * s, 0.07 * s, 0.05 * s, 0.04 * s); smesh(lh, PG().sph, eyeM, 0.035 * s, 0.022 * s, 0.022 * s, sx * 0.1 * s, 0.04 * s, 0.225 * s); }
      putG(lh, PG().sph, hair, 0, 0.1 * s, -0.07 * s, 0.28 * s, 0.3 * s, 0.3 * s);
      const wd = GX().foeGear ? GX().foeGear('weed') : null;
      if (wd) for (let i = 0; i < 9; i++) { const a2 = 0.9 + i * 0.56, g = joint(lh, Math.sin(a2) * 0.24 * s, 0.14 * s, -0.07 * s + Math.cos(a2) * 0.26 * s); g.rotation.set(0, a2, 0); g.scale.set(4.2 * s, (2.2 + (i % 3) * 0.5) * s, 2.4 * s); const m2 = new THREE.Mesh(wd[0].g, hair); m2.castShadow = true; g.add(m2); }
      else smesh(lh, PG().cone, M.body, 0.38 * s, 0.9 * s, 0.38 * s, 0, 0.35 * s, -0.12 * s, -0.4);
      for (const sx of [-1, 1]) {
        const ar = joint(torso, sx * 0.42 * s, 1.1 * s, 0);
        if (Rod) { putG(ar, PG().sph, sk, 0, 0, 0, 0.11 * s, 0.11 * s, 0.11 * s); rodM(ar, [0, 0, 0], [sx * 0.08 * s, -0.55 * s, 0.25 * s], 0.075 * s, 0.055 * s, sk); rodM(ar, [sx * 0.08 * s, -0.55 * s, 0.25 * s], [sx * -0.02 * s, -0.75 * s, 0.75 * s], 0.055 * s, 0.035 * s, sk); for (let q = 0; q < 4; q++) rodM(ar, [sx * -0.02 * s, -0.75 * s, 0.75 * s], [sx * (-0.1 + q * 0.06) * s, -0.9 * s, 1.02 * s], 0.016 * s, 0.004 * s, dark); }
        else smesh(ar, PG().box, sk, 0.14 * s, 1.1 * s, 0.14 * s, 0, -0.5 * s, 0.2 * s, -0.6);
      }
    }
    const J = { body, abd, head, fangs, legs, torso, bodyY };
    J.hits = [{ n: body, r: 1.0 * s, part: 'body', o: V(0, 0, 0.6 * s) }, { n: abd, r: 1.4 * s, part: 'body', o: V(0, 0.2 * s, -0.9 * s) }, { n: head, r: 0.48 * s, part: 'head' }];
    if (torso) J.hits.push({ n: torso, r: 0.55 * s, part: 'head', o: V(0, 0.9 * s, 0) });
    J.anim = (bb, dt) => {
      const w = bb.walk || 0, p = bb.pose || {}, k = p.k || 0, mv = Math.min(1, bb.mv || 0);
      body.position.y = bodyY + Math.sin(w * 2) * 0.08 * s * mv + (bb.hY || 0);
      legs.forEach((L, i) => { const ph = w * 1.4 + (i % 2) * Math.PI + L.k * 0.8; L.a.rotation.x = Math.sin(ph) * 0.25 * mv; L.hp.rotation.z = Math.max(0, Math.sin(ph)) * 0.25 * mv * L.sx; });
      fangs.forEach((f, i) => { f.rotation.z = (i ? -1 : 1) * (p.n === 'bite' ? 0.5 * k : 0.1 + Math.sin(bb.t * 4) * 0.05); });
      abd.rotation.x = Math.sin(bb.t * 1.5) * 0.06 + (p.n === 'spit' ? -0.4 * k : 0);
      body.rotation.x = p.n === 'leap' ? -0.2 * k : 0;
    };
    J.height = 4.2 * s;
    return J;
  }

  // ================================================================ the generic guardian
  class Beast extends BS.Boss {
    constructor(def, level, world) {
      super(def, level, world);
      const S = (this.S = SPECS[def.id]);
      this.maxHp = Math.round(S.hp * this.hpScale); this.hp = this.maxHp;
      this.bloodColor = S.blood || 0x5a1a10;
      this.J = (S.rig === 'quad' ? rigQuad : S.rig === 'spider' ? rigSpider : rigHuman)(this, S.look(this));
      this.main = this.part({ name: def.name, hitW: this.J.hits, undead: !!S.undead, blood: this.bloodColor });
      this.main.dmgMul = (info) => (this.S.dmgMul ? this.S.dmgMul(this, info) : 1);
      this.pos.set(world.arenaCenter.x, 0, world.arenaCenter.z - 6);
      this.state = 'fight'; this.minions = []; this.totems = []; this.speedK = 1;
      this.tempo = BS.tempo ? BS.tempo() : 1; // harder modes: everything the guardian does runs a little faster (see bosses5.js)
      if (S.deco) S.deco(this, this.J);
      this.pose = { n: null, k: 0 };
      this.cd = 2.2;
      if (S.init) S.init(this);
    }
    phaseText() { return this.S.phaseText ? this.S.phaseText(this) : ''; }
    extraDispose() { for (const t of this.totems) if (t.g) G.scene.remove(t.g); this.totems = []; if (this.S.dispose) this.S.dispose(this); }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const S = this.S, P = Pl();
      // phases
      const frac = this.hp / this.maxHp;
      if (S.phases) for (let i = this.phase - 1; i < S.phases.length; i++) if (frac <= S.phases[i].at && this.phase === i + 1) {
        this.phase = i + 2; const ph = S.phases[i];
        if (ph.speed) this.speedK = ph.speed;
        G.ui.toast(ph.msg || `${this.def.name}の様子が変わった`, 'warn'); G.sfx.monster(this.pos, 'roar', S.pitch || 0.5, 1.3); Pl().addShake(0.4);
        if (ph.fn) ph.fn(this);
      }
      // shield (totems up)
      if (this.totems.length) { this.totems = this.totems.filter((t) => t.p.alive); this.main.invuln = this.totems.length > 0; if (!this.main.invuln) { this.gimmickClear(this.totemName || '結晶'); G.ui.toast(S.shieldDown || '守りが崩れた — 今だ！', 'good'); G.sfx.explosion(this.pos, 0.8); } for (const t of this.totems) { t.g.rotation.y += dt; t.g.position.y = t.y + Math.sin(this.t * 2 + t.ph) * 0.3; t.p.pos.copy(t.g.position); t.p.centerRef.copy(t.g.position); t.p.hitW[0].w.copy(t.g.position); } }
      this.minions = this.minions.filter((e) => e.alive);
      const dh = this.playerDistH();
      this.cd -= dt * this.speedK * this.tempo;
      if (this.graceT > 0) this.graceT -= dt;
      if (this.state === 'stunned') {
        // dazed: no moving, no attacking; stars over the head
        this.mv = 0; this.pose = { n: 'slam', k: 0.4, hit: 1 };
        if (Math.random() < dt * 6) G.fx.sparks(this.pos.clone().setY(this.J.height + 0.4), null, 2, 0xfff0a0, 2);
        if (this.t >= this.stunUntil) { this.state = 'fight'; this.pose = { n: null, k: 0 }; this.recover(1.5); }
      } else if (!this.act) {
        this.face(P.pos, dt, S.turn || 2.6);
        const want = S.range || 4;
        this.mv = 0;
        if (dh > want) { const l = dh || 1; this.groundMove((P.pos.x - this.pos.x) / l, (P.pos.z - this.pos.z) / l, (S.speed || 4) * this.speedK, dt, S.radius || 1.6); this.mv = 1; this.walk = (this.walk || 0) + dt * (S.stride || 5) * this.speedK; }
        else if (S.keepAway && dh < want * 0.6) { const l = dh || 1; this.groundMove(-(P.pos.x - this.pos.x) / l, -(P.pos.z - this.pos.z) / l, (S.speed || 4) * 0.7, dt, S.radius || 1.6); this.mv = 0.7; this.walk = (this.walk || 0) - dt * 4; }
        this.pose.k = U.damp(this.pose.k, 0, 6, dt);
        if (this.cd <= 0 && !(this.graceT > 0)) this.choose(dh);
      } else this.run(dt);
      this.root.position.set(this.pos.x, (this.hYbase || 0), this.pos.z); this.root.rotation.y = this.yaw;
      this.J.anim(this, dt);
      if (S.tick) S.tick(this, dt);
      this.updateHits();
      this.bar();
    }
    choose(dh) {
      const S = this.S, rank = BS.diffRank ? BS.diffRank() : 1, list = S.attacks.filter((a) => (a.diff || 0) <= rank && (a.min ?? 0) <= dh && dh <= (a.max ?? 99) && (a.phase || 1) <= this.phase && (!a.upto || this.phase <= a.upto) && !(a.minions && this.minions.length >= (a.cap || 4)) && !(a.k === 'shield' && this.totems.length));
      if (!list.length) { this.cd = 0.4; return; }
      const wt = (a) => (a.w || 1) * (a.heavy && BS.heavyMul ? BS.heavyMul() : 1); // heavy attacks come up more often in the harder modes
      let tot = 0; for (const a of list) tot += wt(a);
      let x = Math.random() * tot, pick = list[0];
      for (const a of list) { x -= wt(a); if (x <= 0) { pick = a; break; } }
      this.act = BS.fair(Object.assign({ t: 0, step: 0 }, pick), this);
      this.pose = { n: pick.pose || null, k: 0, head: pick.head };
    }
    end(cd) { this.act = null; this.cd = cd ?? (this.S.cd || 1.6); this.hY = 0; }
    hit(dmg, src, pos, elem) { this.hurtPlayer(dmg, src, pos, elem); }
    // ---------------- the attack library ----------------
    // how fast the attack clock runs: phase speed x difficulty tempo, but capped so the fastest moves stay readable
    atkRate() { const cap = [1.15, 1.25, 1.35, 1.45][BS.diffRank ? BS.diffRank() : 1]; return Math.min(this.speedK * this.tempo, cap); }
    run(dt) {
      G.fx.teleK = this.atkRate();
      try { this.run0(dt); } finally { G.fx.teleK = 1; }
    }
    run0(dt) {
      const a = this.act, P = Pl(), S = this.S;
      a.t += dt * this.atkRate();
      // (the swing, the slam, the charge and the nova show their circle for exactly the wind-up: 0.8 s or less of it is 0.2 s longer, BS.slow)
      const wind0 = a.wind || 0.7, wind = SLOW_K[a.k] ? BS.slow(wind0) : wind0;
      const fwd = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.pose.k = Math.min(1, a.t / Math.max(0.15, wind));
      const sfxW = () => { if (!a.sw) { a.sw = true; G.sfx.monster(this.pos, a.cry || 'roar', S.pitch || 0.6, 0.9); } };
      switch (a.k) {
        case 'swipe': { // reach + arc in front
          // the warning circle follows the swing while it turns, and the blow lands exactly on it
          const sc = this.pos.clone().addScaledVector(fwd, a.r * 0.55).setY(0);
          if (a.t < wind) { this.face(P.pos, dt, 6); sfxW(); if (!a.tele) a.tele = G.fx.telegraph(sc, a.r * 0.6, wind - a.t, a.col || 0xff5030); else G.fx.teleMove(a.tele, sc); break; }
          this.pose.hit = Math.min(1, (a.t - wind) / 0.15);
          if (!a.done) {
            a.done = true; G.sfx.whoosh(0.7, 0.6);
            if (Math.hypot(P.pos.x - sc.x, P.pos.z - sc.z) < a.r * 0.6 + 0.4 && P.pos.y < (a.h || 4)) { this.hit(a.dmg, 'melee', this.pos.clone(), a.elem); P.vel.addScaledVector(fwd, a.knock || 8); P.vel.y = Math.max(P.vel.y, 3); }
            G.vfx.nova(sc, a.r * 0.6, 0.1, { style: 'shock', dome: false, ground: a.col || 0xffa060 }); G.vfx.slash(this.pos.clone().setY((this.J && this.J.height ? this.J.height : 3) * 0.45), fwd, a.r * 1.15, 2.4, a.col || 0xffc090, { tilt: (Math.random() - 0.5) * 0.9, dur: 0.14, r0: a.r * 0.3, cw: Math.random() < 0.5 });
            if (a.combo && (a.n = (a.n || 1)) < Math.min(3, a.combo + (BS.diffRank && BS.diffRank() >= 2 ? 1 : 0))) { a.n++; a.t = wind - BS.slow(wind0 * 0.55); a.done = false; a.tele = null; this.pose.hit = 0; break; }
          }
          if (a.t > wind + (a.rec || 0.5)) this.end();
          break;
        }
        case 'slam': { // circle at self (or at the player)
          if (!a.c) { a.c = (a.at === 'player' ? P.pos.clone() : this.pos.clone().addScaledVector(fwd, a.off || 0)).setY(0); a.tele = G.fx.telegraph(a.c, a.r, wind, a.col || 0xff4020); sfxW(); }
          if (a.t < wind) { if (a.at !== 'player') this.face(P.pos, dt, 2); this.hY = a.jump ? Math.sin(Math.min(1, a.t / wind) * Math.PI) * a.jump : 0; break; }
          this.pose.hit = 1;
          if (!a.done) {
            a.done = true; this.hY = 0;
            G.fx.explosion(a.c.clone().setY(0.4), a.r * 0.6, a.col || 0xffa060, { decal: false, noRing: true }); G.vfx.nova(a.c.clone(), a.r, 0.14, { style: 'shock', dome: false, ground: a.col || 0xffc080 }); G.vfx.spikes(G.vfx.ringPts(a.c.clone(), a.r * 0.6, 8), { kind: 'rock', r: 0.6, h: 0.8, n: 1, dur: 0.5 }); G.fx.dust(a.c, V(0, 1, 0), 0x7a6a50, 18);
            G.sfx.explosion(a.c, 1.1); P.addShake(0.5);
            if (Math.hypot(P.pos.x - a.c.x, P.pos.z - a.c.z) < a.r && P.pos.y < (a.jumpable ? 0.9 : 3)) { this.hit(a.dmg, 'aoe', a.c, a.elem); const kd = P.pos.clone().sub(a.c).setY(0).normalize(); P.vel.addScaledVector(kd, a.knock || 10); P.vel.y = Math.max(P.vel.y, 5); }
            if (a.zone) C().zone(a.c.clone(), a.r * 0.8, a.zone.dur || 5, a.zone.kind, a.zone.dps * this.dmgScale, { enemy: true, elem: a.zone.elem });
            if (a.shards) for (let i = 0; i < a.shards; i++) { const an = i / a.shards * Math.PI * 2; C().spawnProjectile({ kind: a.shardKind || 'boulder', pos: a.c.clone().setY(1), vel: V(Math.cos(an) * 14, 0, Math.sin(an) * 14), owner: 'enemy', dmg: a.dmg * 0.4 * this.dmgScale, radius: 0.45, life: 2.2, attacker: this.main, elem: a.elem }); }
          }
          if (a.t > wind + (a.rec || 0.6)) this.end();
          break;
        }
        case 'charge': { // run through you in a line
          if (a.t < wind) { this.face(P.pos, dt, 5); sfxW(); if (!a.tele) { a.tele = []; for (let i = 1; i <= 6; i++) a.tele.push(G.fx.telegraph(this.pos.clone().addScaledVector(fwd, i * 3.2), 1.5, wind, 0xff5030)); } else a.tele.forEach((t, i) => G.fx.teleMove(t, this.pos.clone().addScaledVector(fwd, (i + 1) * 3.2))); break; } // the lane turns with the charger: it runs where it shows
          this.mv = 2; this.walk = (this.walk || 0) + dt * 14;
          const blocked = this.groundMove(fwd.x, fwd.z, a.speed || 20, dt, S.radius || 1.6);
          if (!a.done && this.playerDistH() < (S.radius || 1.6) + 1.4 && P.pos.y < 3) { a.done = true; this.hit(a.dmg, 'melee'); P.vel.addScaledVector(fwd, a.knock || 16); P.vel.y = 6; }
          if (Math.random() < 0.6) G.fx.dust(this.pos, V(0, 1, 0), 0x6a5a48, 2);
          if (blocked || a.t > wind + (a.dur || 1.1)) { if (blocked) { G.sfx.explosion(this.pos, 0.8); P.addShake(0.4); if (a.stunWall) { this.stunned(a.stunWall); return; } } this.end(); }
          break;
        }
        case 'leap': { // jump onto your position
          if (!a.c) { a.c = P.pos.clone().setY(0); a.from = this.pos.clone(); a.tele = G.fx.telegraph(a.c, a.r, wind + (a.air || 0.7), 0xff4020); sfxW(); }
          if (a.t < wind) { this.face(a.c, dt, 6); this.hY = -0.4 * this.pose.k; break; }
          const f = Math.min(1, (a.t - wind) / (a.air || 0.7));
          this.pos.lerpVectors(a.from, a.c, f); this.pos.y = 0;
          this.hYbase = Math.sin(f * Math.PI) * (a.height || 7);
          if (f >= 1 && !a.done) {
            a.done = true; this.hYbase = 0;
            G.fx.explosion(a.c.clone().setY(0.4), a.r * 0.6, 0xffa060, { decal: false, noRing: true }); G.vfx.nova(a.c.clone(), a.r, 0.14, { style: 'shock', dome: false }); G.fx.debris(a.c.clone().setY(0.4), G.world.mats.rock, 8, 0.3, 8); G.sfx.explosion(a.c, 1.3); P.addShake(0.7);
            if (this.playerDistH() < a.r && P.pos.y < 1.2) { this.hit(a.dmg, 'aoe', a.c, a.elem); const kd = P.pos.clone().sub(a.c).setY(0).normalize(); P.vel.addScaledVector(kd, 12); P.vel.y = 6; }
            if (a.zone) C().zone(a.c.clone(), a.r * 0.7, a.zone.dur || 5, a.zone.kind, a.zone.dps * this.dmgScale, { enemy: true });
          }
          if (a.t > wind + (a.air || 0.7) + (a.rec || 0.7)) { this.hYbase = 0; this.end(); }
          break;
        }
        case 'volley': { // fans of projectiles at you
          if (a.t < wind) { this.face(P.pos, dt, 4); sfxW(); break; }
          const gap = a.gap || 0.35, n = (a.salvos || 1) + (BS.diffRank && BS.diffRank() >= 3 ? 1 : 0);
          while ((a.step || 0) < n && a.t >= wind + (a.step || 0) * gap) {
            a.step = (a.step || 0) + 1;
            const from = (this.J.tip ? this.J.tip.getWorldPosition(V()) : this.pos.clone().setY(this.J.height * 0.7));
            const aim = P.chestPos().add(P.vel.clone().multiplyScalar(a.lead || 0.25));
            const dir = aim.sub(from).normalize();
            const cnt = (a.n || 3) + (BS.diffRank && BS.diffRank() >= 2 ? 1 : 0), spr = a.spread || 0.25;
            for (let i = 0; i < cnt; i++) {
              const off = cnt === 1 ? 0 : (i - (cnt - 1) / 2) * spr / Math.max(1, cnt - 1) * 2;
              const d = dir.clone().applyAxisAngle(V(0, 1, 0), off);
              C().spawnProjectile({ kind: a.proj || 'darkorb', pos: from.clone(), vel: d.multiplyScalar(a.speed || 22), grav: a.grav || 0, owner: 'enemy', dmg: a.dmg * this.dmgScale, radius: a.rad || 0.45, life: a.life || 3.5, attacker: this.main, elem: a.elem, onHitPlayer: a.web ? () => { P.st.slow = 2.5; } : undefined, onEnd: a.pool ? (p) => C().zone(V(p.pos.x, 0.05, p.pos.z), 1.8, 4, a.pool, 8 * this.dmgScale, { enemy: true }) : undefined });
            }
            G.sfx.magic(this.pos, a.snd || 'dark');
          }
          if (a.t > wind + n * gap + (a.rec || 0.4)) this.end();
          break;
        }
        case 'nova': { // a ring of projectiles all around
          if (a.t < wind) { sfxW(); if (!a.tele) a.tele = G.fx.telegraph(this.pos.clone(), 3, wind, a.col || 0x9a50ff); break; }
          while ((a.step || 0) < (a.waves || 1) && a.t >= wind + (a.step || 0) * 0.5) {
            const k = a.step = (a.step || 0) + 1;
            const cnt = a.n || 16, from = this.pos.clone().setY(a.y || 1.4);
            for (let i = 0; i < cnt; i++) { const an = (i + k * 0.5) / cnt * Math.PI * 2; C().spawnProjectile({ kind: a.proj || 'soul', pos: from.clone(), vel: V(Math.cos(an), 0, Math.sin(an)).multiplyScalar(a.speed || 12), owner: 'enemy', dmg: a.dmg * this.dmgScale, radius: 0.5, life: 4, attacker: this.main, elem: a.elem }); }
            G.sfx.magic(this.pos, 'dark'); G.fx.ring(this.pos.clone().setY(0.3), 6, a.col || 0x9a50ff, 0.4);
          }
          if (a.t > wind + (a.waves || 1) * 0.5 + 0.5) this.end();
          break;
        }
        case 'rain': { // circles under and around you that blow up a moment later
          if (!a.pts) {
            a.pts = []; sfxW();
            for (let i = 0; i < (a.n || 6); i++) { const p = i === 0 ? P.pos.clone() : P.pos.clone().add(V(U.rand(-8, 8), 0, U.rand(-8, 8))); p.y = 0; a.pts.push({ c: p, t: (a.delay || 1.1) + i * (a.stagger || 0.15), tele: G.fx.telegraph(p, a.r || 2.6, (a.delay || 1.1) + i * (a.stagger || 0.15), a.col || 0x9a50ff), done: false }); }
          }
          for (const p of a.pts) if (!p.done && a.t >= p.t) {
            p.done = true;
            G.fx.explosion(p.c.clone().setY(0.5), (a.r || 2.6) * 0.7, a.col || 0xa060ff, { decal: false, noRing: true }); G.vfx.nova(p.c.clone(), a.r || 2.6, 0.1, { style: 'shock', dome: false, ground: a.col || 0xc090ff }); G.sfx.explosion(p.c, 0.6);
            if (Math.hypot(P.pos.x - p.c.x, P.pos.z - p.c.z) < (a.r || 2.6) && P.pos.y < 3.5) this.hit(a.dmg, 'aoe', p.c, a.elem);
            if (a.zone) C().zone(p.c.clone(), (a.r || 2.6) * 0.8, a.zone.dur || 4, a.zone.kind, a.zone.dps * this.dmgScale, { enemy: true });
          }
          this.pose.k = 1;
          if (a.pts.every((p) => p.done) && a.t > (a.delay || 1.1) + 0.5) this.end();
          break;
        }
        case 'breath': { // a cone that keeps burning while it lasts
          if (a.t < wind) { this.face(P.pos, dt, 4); sfxW(); break; }
          this.face(P.pos, dt, Math.min(0.6, a.track || 0.6)); // slow enough to outrun sideways, even close in
          const from = (this.J.heads ? this.J.heads[a.head || 0].head : this.J.head).getWorldPosition(V());
          if (Math.random() < 0.85) for (let i = 0; i < 3; i++) { const d = fwd.clone().applyAxisAngle(V(0, 1, 0), U.rand(-0.35, 0.35)); const fs = U.rand(0.65, 0.95) * (a.r || 11); G.fx.flame.spawn(from.x, from.y, from.z, d.x * fs, U.rand(-1, 1), d.z * fs, U.rand(0.4, 0.7), U.rand(0.5, 1.1), 0.2, ...(a.rgb || [1, 0.5, 0.15]), 0.9, 0, 0); }
          a.tick = (a.tick || 0) - dt;
          if (a.tick <= 0) {
            a.tick = 0.25;
            const to = P.pos.clone().sub(this.pos).setY(0), d = to.length();
            if (d < (a.r || 11) && to.normalize().dot(fwd) > 0.92 && P.pos.y < 4 && (G.world.los(from, P.chestPos()) || G.world.los(from, V(P.pos.x, P.pos.y + 0.5, P.pos.z)))) this.hit(a.dmg, 'aoe', from, a.elem); // a pillar between you and the mouth shields you
            if (a.zone && Math.random() < 0.5) C().zone(this.pos.clone().addScaledVector(fwd, U.rand(3, (a.r || 11) - 1)).setY(0.05), 1.6, 4, a.zone, 6 * this.dmgScale, { enemy: true });
          }
          if (a.t > wind + (a.dur || 2.4)) this.end();
          break;
        }
        case 'summon': {
          if (a.t < wind) { sfxW(); break; }
          if (!a.done) {
            a.done = true;
            const ids = a.ids || ['skeleton_normal'];
            const room = Math.max(1, (a.cap || 4) - this.minions.length);
            for (let i = 0; i < Math.min(a.n || 3, room); i++) {
              const an = Math.random() * Math.PI * 2, p = this.pos.clone().add(V(Math.cos(an) * U.rand(4, 7), 0, Math.sin(an) * U.rand(4, 7)));
              const def = G.ENEMY_BY_ID[U.pick(ids)]; if (!def) continue;
              const e = G.enemies.spawn(def, Math.max(1, this.level - 1), p, { hpMul: G.Run.bossHpMul(G.game.area || 1), noLoot: true });
              if (!e) continue; e.noLoot = true; e.state = 'chase'; this.minions.push(e);
              G.fx.smoke(p.clone().setY(0.6), 8, 1.2, a.smoke || 0x2a1a30, 0.6, 1.2); G.vfx.area(p.clone(), 1.4, 'dark', 1.2);
            }
            G.ui.toastSmall(a.msg || `${this.def.name}が手下を呼んだ`);
          }
          if (a.t > wind + 0.6) this.end();
          break;
        }
        case 'blink': { // vanish and reappear near you, then strike
          if (a.t < (a.wind || 0.4)) { if (!a.s0) { a.s0 = true; G.fx.smoke(this.pos.clone().setY(2), 14, 1.6, 0x1a0a20, 0.6, 1.4); G.sfx.magic(this.pos, 'dark'); this.root.visible = false; } break; }
          if (!a.done) {
            a.done = true;
            const an = Math.random() * Math.PI * 2, d = U.rand(5, 9), w = this.world;
            this.pos.set(U.clamp(P.pos.x + Math.cos(an) * d, 4, w.W - 4), 0, U.clamp(P.pos.z + Math.sin(an) * d, 4, (w.arenaD || w.D) - 4));
            this.root.visible = true; G.fx.smoke(this.pos.clone().setY(2), 14, 1.6, 0x1a0a20, 0.6, 1.4); G.sfx.magic(this.pos, 'dark');
            this.face(P.pos, 1, 99);
          }
          if (a.t > (a.wind || 0.4) + 0.25) { const next = a.then && S.attacks.find((x) => x.id === a.then); this.act = null; if (next) { this.act = BS.fair(Object.assign({ t: 0, step: 0 }, next), this); this.pose = { n: next.pose || null, k: 0 }; } else this.end(0.6); }
          break;
        }
        case 'pull': { // a hook: if it catches you, you are dragged in hard (then the follow-up)
          if (a.t < wind) { this.face(P.pos, dt, 6); sfxW(); break; }
          if (!a.shot) {
            a.shot = true;
            const from = (this.J.tip ? this.J.tip.getWorldPosition(V()) : this.pos.clone().setY(this.J.height * 0.6));
            const dir = P.chestPos().sub(from).normalize();
            C().spawnProjectile({ kind: 'harpoon', pos: from, vel: dir.multiplyScalar(38), owner: 'enemy', dmg: (a.dmg || 10) * this.dmgScale, radius: 0.5, life: 1.5, attacker: this.main, onHitPlayer: () => { a.pulled = 2.2; P.dragT = 0.3; G.sfx.chain && G.sfx.chain(0.6, 0.8); P.addShake(0.35); G.ui.toastSmall('⛓ 捕まった！'); } });
            G.sfx.chain && G.sfx.chain(0.5, 0.6);
          }
          if (a.pulled > 0) {
            a.pulled -= dt;
            const to = this.pos.clone().sub(P.pos); to.y = 0; const l = to.length();
            if (l > (S.radius || 1.6) + 1.4) { P.vel.x = to.x / l * 34; P.vel.z = to.z / l * 34; P.vel.y = Math.max(P.vel.y, 2.4); P.dragT = 0.15; }
            else a.pulled = 0;
            if (a.pulled <= 0) { P.vel.x *= 0.2; P.vel.z *= 0.2; const next = S.attacks.find((x) => x.id === a.then); this.act = next ? BS.fair(Object.assign({ t: 0, step: 0 }, next), this) : null; if (!next) this.end(); else this.pose = { n: next.pose || null, k: 0 }; } // the follow-up keeps its whole wind-up: you were just dragged in
            break;
          }
          if (a.t > wind + 1.4) this.end();
          break;
        }
        case 'shield': { // raise a ward kept up by totems you must destroy
          if (a.t < wind) { sfxW(); this.pose.k = 1; break; }
          if (!a.done) { a.done = true; this.raiseTotems(a); }
          if (a.t > wind + 0.6) this.end();
          break;
        }
        default: if (BS.atk && BS.atk[a.k]) { if (BS.atk[a.k].call(this, a, dt, fwd)) this.end(a.recCd); } else this.end();
      }
      if (this.act && this.act.k !== 'leap' && !(BS.atk && BS.atk[this.act.k] && BS.atk[this.act.k].air)) this.hYbase = U.damp(this.hYbase || 0, 0, 6, dt);
    }
    stunned(t) {
      this.act = null; this.cd = t; this.hYbase = 0;
      this.state = 'stunned'; this.stunUntil = this.t + t;
      G.ui.toast(`💫 ${this.def.name}が怯んだ！ 好機だ`, 'good'); G.sfx.monster(this.pos, 'roar', this.S.pitch || 0.5, 1);
    }
    raiseTotems(a) {
      const n = a.n || 3, w = this.world; this.totemName = a.totem || '守りの結晶';
      for (let i = 0; i < n; i++) {
        const an = (i / n) * Math.PI * 2 + Math.random(), R = U.rand(10, 15);
        const x = U.clamp(this.pos.x + Math.cos(an) * R, 5, w.W - 5), z = U.clamp(this.pos.z + Math.sin(an) * R, 5, (w.arenaD || w.D) - 5), y = 2.2;
        const g = new THREE.Group(); g.position.set(x, y, z);
        smesh(g, PG().oct, glowM(a.col || 0x9a50ff, 2.2), 0.6, 1.1, 0.6);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24), glowM(a.col || 0x9a50ff, 1.5)); ring.rotation.x = Math.PI / 2; g.add(ring);
        G.scene.add(g);
        const p = this.part({ name: a.totem || '守りの結晶', shared: false, hp: Math.round((a.hp || 260) * this.hpScale), maxHp: Math.round((a.hp || 260) * this.hpScale), hitW: [{ r: 0.9, part: 'body', w: g.position.clone() }], radius: 0.9, height: 1.8, showBar: true });
        p.die = () => { if (!p.alive) return false; p.alive = false; G.scene.remove(g); G.fx.explosion(g.position.clone(), 2, a.col || 0x9a50ff); G.sfx.explosion(g.position, 0.7); return true; };
        this.totems.push({ g, p, y, ph: i });
      }
      this.main.invuln = true;
      G.ui.toast(a.msg || `${this.def.name}が守りを張った — 結晶を壊せ！`, 'warn');
    }
  }

  // ================================================================ the guardians
  const M = (c, o) => mat(c, o);
  const SPECS = {
    // ---- 1: graveyard ----
    houndlord: {
      hp: 3900, rig: 'quad', speed: 7.2, radius: 2.2, range: 4.5, stride: 6, pitch: 0.5, blood: 0x3a0a08,
      look: () => ({ s: 1.55, collar: true, spikes: true, eyes: [0x9aff60], m: { body: M('#4a4248', { map: tex().skin.map, roughness: 0.9 }), claw: M('#d8d0c0'), horn: M('#c8c0b0') } }),
      attacks: [
        { id: 'bite', k: 'swipe', pose: 'bite', wind: 0.45, r: 5, arc: 0.3, dmg: 24, knock: 8, max: 7, w: 3, combo: 2, cry: 'snarl' },
        { k: 'leap', pose: 'leap', wind: 0.55, air: 0.6, r: 4.2, dmg: 32, min: 7, max: 30, w: 2, height: 6 },
        { k: 'charge', wind: 0.7, speed: 22, dur: 1.2, dmg: 30, knock: 18, min: 9, w: 2, stunWall: 3 },
        { k: 'summon', pose: 'howl', wind: 1.0, n: 3, ids: ['hound_normal'], minions: true, cap: 4, w: 1.2, msg: '🐺 遠吠えが猟犬を呼んだ', cry: 'howl' },
        { k: 'volley', pose: 'breath', wind: 0.6, n: 3, salvos: 3, gap: 0.3, proj: 'soul', speed: 20, dmg: 14, phase: 2, w: 1.5, snd: 'dark' },
      ],
      phases: [{ at: 0.5, speed: 1.3, msg: '🐺 ガルムの瞳に鬼火が灯った（速度上昇・鬼火を吐く）' }],
      phaseText: (b) => (b.state === 'stunned' ? '💫 壁に激突して怯んでいる — 頭を狙え！' : '突進を壁にぶつけると怯む　|　頭が弱点'),
      dmgMul: (b, info) => (b.state === 'stunned' ? 1.5 : 1),
    },
    boneking: {
      hp: 4300, rig: 'human', speed: 3.6, radius: 1.6, range: 4, stride: 4.5, pitch: 0.4, undead: true, blood: 0xd8d0b8,
      look: () => ({ s: 1.45, bones: true, crown: true, cape: true, weapon: 'greatsword', eyes: 0x60d0ff, m: { body: M('#d6ccb4', { map: tex().skin.map, roughness: 0.75 }), cloth: M('#3a1a40', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.95 }), gold: M('#d8b060', { metalness: 1, roughness: 0.3 }), blade: M('#9ab8d0', { metalness: 0.9, roughness: 0.2, emissive: 0x1a3a5a }) } }),
      attacks: [
        { k: 'swipe', pose: 'swing', wind: 0.75, r: 6.5, arc: -0.1, dmg: 30, knock: 10, max: 8, w: 3, combo: 2 },
        { k: 'slam', pose: 'slam', wind: 1.0, r: 6, dmg: 34, jumpable: true, shards: 10, shardKind: 'boulder', w: 2, max: 12 },
        { k: 'leap', pose: 'leap', wind: 0.7, air: 0.8, r: 5, dmg: 34, min: 9, w: 1.5 },
        { k: 'summon', pose: 'cast', wind: 0.9, n: 3, ids: ['skeleton_normal'], minions: true, cap: 4, w: 1.3, msg: '💀 骸の王が兵を呼び起こした' },
        { k: 'rain', pose: 'cast', n: 7, r: 2.4, delay: 1.2, dmg: 22, col: 0x60d0ff, w: 1.5, phase: 2 },
      ],
      phases: [{ at: 0.6, msg: '💀 骸の王が骨の守りを張った — 結晶を壊せ！', fn: (b) => b.raiseTotems({ n: 3, hp: 300, col: 0x60d0ff, totem: '骨の結晶', msg: '💀 骨の守り — 3つの結晶を壊すまで無敵' }) }, { at: 0.3, speed: 1.25, msg: '💀 骸の王が怒り狂う' }],
      phaseText: (b) => (b.totems.length ? `🛡 骨の守り — 結晶 残り${b.totems.length}` : '叩きつけの骨片はジャンプでかわせ　|　頭が弱点'),
    },
    // ---- 2 / 3: dungeon ----
    warlock: {
      hp: 3700, rig: 'human', speed: 3.4, radius: 1.2, range: 14, keepAway: true, stride: 3, pitch: 0.9, cd: 1.3, blood: 0x2a0a3a,
      look: () => ({ s: 1.3, float: true, hood: true, cloth: true, cape: true, weapon: 'staff', orb: 0xb060ff, eyes: 0xc080ff, m: { body: M('#1e1426', { map: tex().cloth.map, roughness: 0.95 }), cloth: M('#2a1840', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.95 }), skin: M('#5e5660') } }),
      attacks: [
        { k: 'volley', pose: 'cast', wind: 0.6, n: 5, spread: 0.5, salvos: 2, gap: 0.45, proj: 'darkorb', speed: 20, dmg: 16, w: 3 },
        { k: 'rain', pose: 'cast', n: 6, r: 2.8, delay: 1.0, dmg: 24, w: 2, zone: { kind: 'fire', dur: 3, dps: 8 } },
        { k: 'nova', pose: 'cast', wind: 0.8, n: 18, waves: 2, proj: 'soul', speed: 12, dmg: 14, w: 1.5, max: 10 },
        { id: 'blink', k: 'blink', wind: 0.4, then: 'novaClose', w: 1.5, min: 0, max: 7 },
        { id: 'novaClose', k: 'nova', pose: 'cast', wind: 0.5, n: 14, proj: 'darkorb', speed: 14, dmg: 16, w: 0, max: 0 },
        { k: 'summon', pose: 'cast', wind: 0.8, n: 3, ids: ['imp_normal'], minions: true, cap: 4, w: 1.1, msg: '🔥 妖術師がインプを喚んだ' },
      ],
      phases: [{ at: 0.5, speed: 1.3, msg: '🧙 妖術師の詠唱が速くなった', fn: (b) => b.raiseTotems({ n: 2, hp: 240, col: 0xb060ff, totem: '魔力の結晶' }) }],
      phaseText: (b) => (b.totems.length ? `🛡 魔力の障壁 — 結晶 残り${b.totems.length}` : '近づくと瞬間移動して離れる　|　遮蔽物で弾を防げ'),
    },
    cerberus: {
      hp: 4800, rig: 'quad', speed: 6.2, radius: 2.8, range: 5.5, stride: 5, pitch: 0.4, blood: 0x4a0a08,
      look: () => ({ s: 2.0, heads: 3, spikes: true, collar: true, eyes: [0xff5020, 0x60c0ff, 0x90ff40], m: { body: M('#5a3a2e', { map: tex().skin.map, roughness: 0.85 }), claw: M('#e0d8c0'), horn: M('#2a2020') } }),
      attacks: [
        { k: 'swipe', pose: 'bite', wind: 0.5, r: 6.5, arc: 0.1, dmg: 28, knock: 10, max: 8, w: 3, combo: 3, cry: 'snarl' },
        { k: 'breath', pose: 'breath', head: 0, wind: 0.7, r: 12, dur: 2.2, dmg: 11, elem: 'fire', zone: 'fire', rgb: [1, 0.45, 0.1], w: 2, max: 13 },
        { k: 'breath', pose: 'breath', head: 1, wind: 0.7, r: 12, dur: 2.0, dmg: 9, elem: 'frost', rgb: [0.5, 0.8, 1], w: 1.5, max: 13, phase: 2 },
        { k: 'breath', pose: 'breath', head: 2, wind: 0.7, r: 11, dur: 2.0, dmg: 8, elem: 'poison', zone: 'acid', rgb: [0.5, 1, 0.3], w: 1.5, max: 13, phase: 2 },
        { k: 'charge', wind: 0.8, speed: 21, dur: 1.2, dmg: 34, knock: 18, min: 10, w: 2, stunWall: 3.5 },
        { k: 'leap', pose: 'leap', wind: 0.6, air: 0.7, r: 5.5, dmg: 36, min: 8, w: 1.5, height: 7, zone: { kind: 'fire', dps: 8, dur: 4 } },
      ],
      phases: [{ at: 0.55, speed: 1.2, msg: '🔥❄️☠️ 三つの頭がそれぞれの息を吐き始めた' }],
      phaseText: (b) => (b.state === 'stunned' ? '💫 壁に激突 — 頭を撃て！' : '三つの頭が弱点　|　突進を壁にぶつけると怯む'),
      dmgMul: (b) => (b.state === 'stunned' ? 1.5 : 1),
    },
    madman: {
      hp: 3600, rig: 'human', speed: 6.0, radius: 1.3, range: 3.5, stride: 7, pitch: 1.1, cd: 1.2, blood: 0x6a0a08,
      look: () => ({ s: 1.35, hunch: true, weapon: 'cleavers', eyes: 0xffd040, m: { body: M('#6a4a3a', { map: tex().skin.map, normalMap: tex().skin.normalMap }), skin: M('#7a5a4a', { map: tex().skin.map }), armor: M('#3a2a20', { map: tex().cloth.map, roughness: 1 }) } }),
      attacks: [
        { k: 'swipe', pose: 'swing', wind: 0.35, r: 4.6, arc: 0.0, dmg: 18, knock: 5, max: 6, w: 3, combo: 4, rec: 0.3, cry: 'screech' },
        { k: 'charge', wind: 0.55, speed: 24, dur: 0.9, dmg: 22, knock: 12, min: 6, w: 2.5 },
        { id: 'hook', k: 'pull', pose: 'throw', wind: 0.55, dmg: 10, then: 'frenzy', min: 7, max: 26, w: 1.5 },
        { id: 'frenzy', k: 'swipe', pose: 'swing', wind: 0.5, r: 4.6, arc: -0.2, dmg: 20, knock: 6, combo: 3, rec: 0.5, w: 0, max: 0 },
        { k: 'volley', pose: 'throw', wind: 0.45, n: 2, spread: 0.18, salvos: 3, gap: 0.3, proj: 'spear', speed: 30, dmg: 16, min: 8, w: 1.5, snd: 'dark' },
      ],
      phases: [{ at: 0.5, speed: 1.4, msg: '😱 獄囚が狂乱した！（動きと攻撃が速くなる）' }],
      phaseText: (b) => (b.phase > 1 ? '😱 狂乱 — 鎖に捕まるな！' : '鎖に捕まると引き寄せられて連撃を受ける'),
    },
    // ---- 4: the ruined depths ----
    ossuary: {
      hp: 7200, rig: 'human', speed: 2.6, radius: 2.6, range: 6, stride: 3, pitch: 0.3, undead: true, blood: 0xd8d0b8,
      look: () => ({ s: 2.4, bones: true, horns: true, weapon: 'none', eyes: 0xff4060, m: { body: M('#cfc4a8', { map: tex().skin.map, roughness: 0.8 }), horn: M('#a89c80') } }),
      attacks: [
        { k: 'swipe', pose: 'swing', wind: 0.9, r: 9, arc: -0.2, dmg: 40, knock: 14, max: 10, w: 3, combo: 2 },
        { k: 'slam', pose: 'slam', wind: 1.2, r: 9, dmg: 46, jumpable: true, shards: 14, shardKind: 'boulder', w: 2.5, max: 14 },
        { k: 'rain', pose: 'cast', n: 9, r: 2.8, delay: 1.3, dmg: 30, col: 0xffd0a0, w: 2 },
        { k: 'summon', pose: 'slam', wind: 1.0, n: 4, ids: ['skeleton_normal', 'skeleton_bone'], minions: true, cap: 5, w: 1.3, msg: '🦴 骨の山から亡者が這い出る' },
        { k: 'slam', pose: 'slam', at: 'player', wind: 1.1, r: 5, dmg: 42, w: 1.5, min: 10, phase: 2, zone: { kind: 'acid', dps: 10, dur: 5 } },
      ],
      phases: [{ at: 0.6, msg: '🦴 骨積みの巨人の胸に核が露わになった（胸を撃て）' }, { at: 0.3, speed: 1.3, msg: '🦴 巨人が崩れかけながら暴れ出した' }],
      phaseText: (b) => (b.phase > 1 ? '胸の核が露出 — 胴体へのダメージ×1.6' : '骨の守りが固い（ダメージ×0.6）　|　叩きつけの骨片はジャンプでかわせ'),
      dmgMul: (b) => (b.phase > 1 ? 1.6 : 0.6),
    },
    hollowknight: {
      hp: 6600, rig: 'human', speed: 4.6, radius: 1.6, range: 4.5, stride: 5, pitch: 0.5, blood: 0x1a1a2a,
      look: () => ({ s: 1.6, helm: true, cape: true, shield: true, weapon: 'greatsword', eyes: 0xa0c0ff, m: { body: M('#2a2a32', { map: tex().metal.map, metalness: 0.7, roughness: 0.5 }), armor: M('#3a3a46', { map: tex().metal.map, normalMap: tex().metal.normalMap, metalness: 0.85, roughness: 0.4 }), cloth: M('#1a1430', { map: tex().cloth.map, side: THREE.DoubleSide }), gold: M('#9a8a5a', { metalness: 1, roughness: 0.35 }), blade: M('#5a6a9a', { metalness: 0.8, roughness: 0.2, emissive: 0x1a2a6a, emissiveIntensity: 1 }) } }),
      attacks: [
        { k: 'swipe', pose: 'swing', wind: 0.6, r: 7, arc: -0.1, dmg: 34, knock: 10, max: 8, w: 3, combo: 3 },
        { k: 'leap', pose: 'leap', wind: 0.6, air: 0.75, r: 5.5, dmg: 40, min: 8, w: 2, height: 8 },
        { k: 'charge', wind: 0.6, speed: 24, dur: 1.0, dmg: 34, knock: 16, min: 9, w: 1.5 },
        { k: 'volley', pose: 'swing', wind: 0.7, n: 3, spread: 0.4, salvos: 2, gap: 0.5, proj: 'icespear', speed: 28, dmg: 22, w: 2, phase: 2 },
        { k: 'slam', pose: 'slam', wind: 0.9, r: 7.5, dmg: 38, jumpable: true, shards: 12, shardKind: 'icespear', w: 1.5, phase: 2 },
      ],
      phases: [{ at: 0.5, speed: 1.25, msg: '⚔️ 騎士王の剣が蒼く燃え上がった（斬撃が飛ぶ）' }],
      phaseText: () => '🛡 正面は盾で硬い（×0.3）— 背後か側面を狙え',
      dmgMul: (b, info) => {
        const P = Pl(), fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), tx = P.pos.x - b.pos.x, tz = P.pos.z - b.pos.z, l = Math.hypot(tx, tz) || 1;
        const front = (fx * tx + fz * tz) / l;
        if (front > 0.35 && !b.act) { if (info.src === 'bullet' && Math.random() < 0.25) { G.fx.sparks(info.pos || b.main.centerRef, null, 4, 0xc0d0ff, 5); G.sfx.impact(b.pos, 'metal'); } return 0.3; }
        return front < -0.3 ? 1.4 : 1;
      },
    },
    lich: {
      hp: 6000, rig: 'human', speed: 3.2, radius: 1.3, range: 15, keepAway: true, stride: 3, pitch: 0.8, cd: 1.2, undead: true, blood: 0x1a3a4a,
      look: () => ({ s: 1.55, bones: true, float: true, crown: true, cape: true, cloth: true, weapon: 'staff', orb: 0x60e0ff, eyes: 0x60e0ff, m: { body: M('#bfc6c0', { map: tex().skin.map, roughness: 0.7 }), cloth: M('#122030', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.95 }), gold: M('#7ad0ff', { emissive: 0x2080c0, emissiveIntensity: 1.2 }) } }),
      attacks: [
        { k: 'volley', pose: 'cast', wind: 0.5, n: 5, spread: 0.55, salvos: 3, gap: 0.35, proj: 'frostorb', speed: 22, dmg: 16, elem: 'frost', w: 3 },
        { k: 'nova', pose: 'cast', wind: 0.9, n: 22, waves: 3, proj: 'soul', speed: 11, dmg: 16, w: 2, col: 0x60e0ff },
        { k: 'rain', pose: 'cast', n: 8, r: 3, delay: 1.1, dmg: 26, elem: 'frost', col: 0x60e0ff, w: 2 },
        { id: 'blink', k: 'blink', wind: 0.4, then: 'chill', w: 1.5, max: 8 },
        { id: 'chill', k: 'nova', pose: 'cast', wind: 0.4, n: 16, proj: 'frostorb', speed: 13, dmg: 16, elem: 'frost', w: 0, max: 0 },
        { k: 'summon', pose: 'cast', wind: 0.9, n: 3, ids: ['wraith_normal'], minions: true, cap: 4, w: 1.2, msg: '👻 不死王が怨霊を喚んだ' },
        { k: 'shield', pose: 'cast', wind: 0.8, n: 3, hp: 320, col: 0x60e0ff, totem: '魂の聖櫃', w: 0.8, phase: 2, msg: '💠 魂の聖櫃が不死王を守っている — 壊せ！' },
      ],
      phases: [{ at: 0.66, msg: '💠 不死王が魂の聖櫃を喚んだ', fn: (b) => b.raiseTotems({ n: 3, hp: 320, col: 0x60e0ff, totem: '魂の聖櫃', msg: '💠 魂の聖櫃が不死王を守っている — 壊せ！' }) }, { at: 0.33, speed: 1.3, msg: '❄️ 不死王の冷気が増した' }],
      phaseText: (b) => (b.totems.length ? `💠 聖櫃 残り${b.totems.length} — 全て壊すまで無敵` : '凍える弾幕は遮蔽物で防げ　|　近づくと瞬間移動する'),
    },
    behemoth: {
      hp: 7600, rig: 'quad', speed: 5.4, radius: 3.4, range: 6, stride: 3.5, pitch: 0.25, blood: 0x3a0a08,
      look: () => ({ s: 2.7, horns: true, spikes: true, eyes: [0xff7020], m: { body: M('#3a2e28', { map: tex().rock.map, normalMap: tex().rock.normalMap, roughness: 0.95 }), claw: M('#1a1410'), horn: M('#d8c8a0') } }),
      attacks: [
        { k: 'swipe', pose: 'bite', wind: 0.7, r: 8, arc: 0.0, dmg: 38, knock: 14, max: 9, w: 2.5, combo: 2 },
        { k: 'charge', wind: 0.9, speed: 23, dur: 1.4, dmg: 44, knock: 22, min: 9, w: 2.5, stunWall: 4 },
        { k: 'slam', pose: 'leap', wind: 1.0, r: 10, dmg: 40, jumpable: true, jump: 2, w: 2, max: 14, zone: { kind: 'fire', dps: 9, dur: 4 } },
        { k: 'volley', pose: 'bite', wind: 0.8, n: 3, spread: 0.35, salvos: 2, gap: 0.6, proj: 'boulder', speed: 24, grav: 9, dmg: 30, min: 10, w: 2 },
        { k: 'leap', pose: 'leap', wind: 0.8, air: 0.9, r: 7, dmg: 46, min: 12, w: 1.5, height: 10, phase: 2, zone: { kind: 'fire', dps: 10, dur: 5 } },
      ],
      phases: [{ at: 0.5, speed: 1.2, msg: '🔥 奈落の巨獣の背が燃え上がった' }],
      phaseText: (b) => (b.state === 'stunned' ? '💫 壁に激突 — 総攻撃！' : '突進を壁にぶつけると長く怯む　|　足踏みはジャンプでかわせ'),
      dmgMul: (b) => (b.state === 'stunned' ? 1.6 : 0.85),
    },
    weaver: {
      hp: 6400, rig: 'spider', speed: 6.4, radius: 2.6, range: 9, stride: 4, pitch: 1.2, blood: 0x2a5a10,
      look: () => ({ s: 1.5, lady: true, mark: 0x8a2a2a, eyes: 0xff2050, m: { body: M('#1a1420', { map: tex().skin.map, roughness: 0.6 }), skin: M('#4e4a50', { roughness: 0.6 }) } }),
      attacks: [
        { k: 'swipe', pose: 'bite', wind: 0.5, r: 6, arc: 0.2, dmg: 30, knock: 8, max: 7, w: 2, combo: 2, elem: 'poison' },
        { k: 'volley', pose: 'spit', wind: 0.5, n: 3, spread: 0.3, salvos: 2, gap: 0.4, proj: 'web', speed: 24, dmg: 10, web: true, w: 2.5 },
        { k: 'volley', pose: 'spit', wind: 0.6, n: 4, spread: 0.45, salvos: 2, gap: 0.5, proj: 'acid', speed: 20, grav: 8, dmg: 16, pool: 'acid', w: 2, min: 6 },
        { k: 'leap', pose: 'leap', wind: 0.5, air: 0.6, r: 5, dmg: 34, min: 8, w: 2, height: 7, zone: { kind: 'web', dps: 0, dur: 5 } },
        { k: 'summon', pose: 'spit', wind: 0.8, n: 4, ids: ['spider_normal'], minions: true, cap: 5, w: 1.3, msg: '🕷️ 卵嚢が破れ、子蜘蛛が溢れ出た', smoke: 0x2a4a10 },
        { k: 'rain', pose: 'spit', n: 7, r: 2.6, delay: 1.0, dmg: 22, elem: 'poison', col: 0x80ff40, w: 1.5, phase: 2, zone: { kind: 'acid', dps: 8, dur: 4 } },
      ],
      phases: [{ at: 0.5, speed: 1.25, msg: '🕸️ 紡ぎ女が毒の雨を降らせ始めた' }],
      phaseText: () => '糸に当たると鈍化　|　人の上半身が弱点',
    },
  };

  // ---------------- registration ----------------
  const DEFS = [
    ['houndlord', '墓守の魔犬ガルム', 'GARM', '🐺', '墓所を守る巨大な魔犬。噛みつきと飛びかかりで間合いを詰め、遠吠えで猟犬の群れを呼ぶ。突進を墓石や壁にぶつけると怯む。', ['頭が弱点', '突進を壁にぶつけると3秒怯む', 'HP50%で鬼火を吐くようになり、動きが速くなる']],
    ['boneking', '骸の王', 'KING OF BONES', '💀', '納骨堂に眠っていた王の骸。大剣と骨片の衝撃波で戦い、兵を呼び起こす。追い詰められると骨の結晶で身を守る。', ['HP60%で骨の守り（3つの結晶を壊すまで無敵）', '叩きつけの骨片はジャンプでかわせる', '頭が弱点']],
    ['warlock', '冥門の妖術師', 'NETHER WARLOCK', '🧙', '冥門を開いた妖術師。距離を取って闇の弾を撃ち、近づくと瞬間移動して弾をばらまく。魔力の結晶で障壁を張る。', ['近づくと瞬間移動', 'HP50%で魔力の障壁（結晶を壊せ）', '遮蔽物で弾を防げる']],
    ['cerberus', '冥府の番犬ケルベロス', 'CERBERUS', '🐕', '三つの頭を持つ冥府の番犬。炎・氷・毒の息を吐き分ける。三つの頭それぞれが弱点。', ['三つの頭が弱点', '突進を壁にぶつけると怯む', 'HP55%から氷と毒の息も吐く']],
    ['madman', '狂乱の獄囚', 'THE MADMAN', '😱', '地下牢に繋がれていた狂人。二本の肉切り包丁で猛然と斬りかかり、鎖で獲物を引き寄せる。', ['鎖に捕まると引き寄せられ、連撃を受ける', 'HP50%で狂乱（さらに速くなる）', '包丁を投げてくる']],
    ['ossuary', '骨積みの巨人', 'OSSUARY GIANT', '🦴', '幾千の骨が積み上がって生まれた巨人。骨の守りは固いが、弱るにつれ胸の核が露わになる。', ['HP60%までは被ダメ×0.6、以降は胸の核が露出して×1.6', '叩きつけの骨片はジャンプでかわせる', '骨の雨と亡者の召喚']],
    ['hollowknight', '虚ろなる騎士王', 'THE HOLLOW KING', '⚔️', '魂を失ってなお戦い続ける騎士の王。盾を構えた正面からの攻撃はほとんど通らない。', ['正面は×0.3 — 背後は×1.4', '飛びかかりと突進', 'HP50%で蒼い斬撃を飛ばす']],
    ['lich', '不死王リッチ', 'THE LICH', '☠️', '死を超えた魔導の王。凍える弾幕と瞬間移動を操り、魂の聖櫃が健在な限り傷つかない。', ['魂の聖櫃（結晶）を全て壊すまで無敵', '近づくと瞬間移動', '冷気で動きが鈍る']],
    ['behemoth', '奈落の巨獣', 'BEHEMOTH', '🦏', '奈落の底を這う岩の皮膚の巨獣。岩を投げ、地を揺らし、全てを薙ぎ倒しながら突進する。', ['岩の皮膚（被ダメ×0.85）', '突進を壁にぶつけると4秒怯む（×1.6）', '足踏みの衝撃はジャンプでかわせる']],
    ['weaver', '深淵の紡ぎ女', 'ABYSSAL WEAVER', '🕸️', '人の上半身を持つ巨大な蜘蛛。糸で獲物の足を止め、毒液と子蜘蛛で追い詰める。', ['糸に当たると鈍化', '人の上半身と頭が弱点', 'HP50%で毒の雨']],
  ];
  for (const [id, name, title, icon, desc, mech] of DEFS) if (!G.BOSS_BY_ID[id]) G.BOSSES.push({ id, name, title, icon, desc, mech, field: true });
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
  for (const id of Object.keys(SPECS)) BS.CLS[id] = Beast;
  // guardians that belonged to the retired sky stage / endless cycle are no longer drawn or listed
  G.RETIRED_BOSSES = ['archon', 'twins', 'heart', 'hunter', 'drake', 'abyssking'];
  BS.SPECS = SPECS;
})();
