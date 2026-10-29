'use strict';
// Throwables, each with its own look (in the hand and in flight), its own trail and its own detonation (sight and sound).
// build(id) gives a model at world size (about 10 cm across); the in-hand model is the same one scaled down.
// boom(id, ...) adds what is particular to each one on top of the shared blast / zone logic in abilities.js.
(function () {
  const GF = (G.GrenFX = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);

  // ---------------- materials ----------------
  let M = null;
  function mats() {
    if (M) return M;
    const s = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.3 }, o || {}));
    const e = (color, k) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k || 1.2, roughness: 0.4 });
    M = {
      olive: s(0x4a5a2a, { roughness: 0.75 }), dark: s(0x26282c, { metalness: 0.6 }), steel: s(0x9aa0a8, { metalness: 0.9, roughness: 0.3 }),
      brass: s(0xc8a040, { metalness: 1, roughness: 0.3 }), red: s(0xa81818, { roughness: 0.6 }), paper: s(0xc42222, { roughness: 0.9, metalness: 0 }),
      tape: s(0x1a1a1a, { roughness: 0.95, metalness: 0 }), orange: s(0xd06010), yellow: s(0xe0c020), green: s(0x3f7a26, { roughness: 0.8 }),
      blue: s(0x2a5aa0), white: s(0xe8e8e0, { metalness: 0 }), grey: s(0x70757a), black: s(0x08060c, { roughness: 0.15, metalness: 0.9 }),
      gold: s(0xe0b050, { metalness: 1, roughness: 0.22 }), cloth: s(0xe0d4b8, { metalness: 0, roughness: 0.95 }),
      ice: s(0xbfe8ff, { roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }),
      glass: s(0xd8f0ff, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 }),
      water: s(0x9ad8ff, { transparent: true, opacity: 0.8, emissive: 0x3070b0, emissiveIntensity: 0.5 }),
      oil: s(0xd07020, { transparent: true, opacity: 0.85, emissive: 0x803000, emissiveIntensity: 0.4 }),
      goo: s(0x90e040, { roughness: 0.15, transparent: true, opacity: 0.85, emissive: 0x2a5000, emissiveIntensity: 0.5 }),
      crystal: new THREE.MeshStandardMaterial({ color: 0x80f0ff, emissive: 0x30a0c0, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }),
      gBlue: e(0x60b0ff), gYellow: e(0xffe040, 1.4), gRed: e(0xff2010, 2), gPurple: e(0xa050ff, 1.6), gOrange: e(0xff8020, 1.8), gGreen: e(0x70ff40, 1.1), gHoly: e(0xfff0b0, 1.2), gWhite: e(0xffffff, 1.2),
    };
    return M;
  }
  const PG = () => G.Props.PG;
  function mesh(p, geo, m, sx, sy, sz, x, y, z, rx, ry, rz) { const o = new THREE.Mesh(PG()[geo], m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; }
  const cyl = (p, m, r, h, x, y, z, rx, ry, rz) => mesh(p, 'cyl8', m, r, h, r, x, y, z, rx, ry, rz);
  const sph = (p, m, r, x, y, z, sy) => mesh(p, 'sph', m, r, sy || r, r, x, y, z);
  const ring = (p, m, r, y, rx) => mesh(p, 'torus', m, r, r, r * 0.6, 0, y || 0, 0, rx ?? Math.PI / 2);
  // a pin grenade's spoon and ring
  function lever(g, m, top) { mesh(g, 'box', m, 0.014, 0.09, 0.028, 0.05, top - 0.04, 0, 0, 0, -0.25); ring(g, M.brass, 0.022, top + 0.02, 0.3).position.x = -0.03; }

  // ---------------- models ----------------
  GF.build = function (id, scale) {
    mats();
    const root = new THREE.Group(), g = new THREE.Group();
    root.add(g); root.userData.spin = g;
    switch (id) {
      case 'g_frag2': // black body, red band: the high-explosive one
        sph(g, M.dark, 0.085, 0, 0, 0, 0.1); ring(g, M.red, 0.088, 0.0); ring(g, M.red, 0.075, 0.05); cyl(g, M.steel, 0.026, 0.04, 0, 0.11); lever(g, M.steel, 0.11); break;
      case 'g_fire': // a red can with an orange band and a hot cap
        cyl(g, M.red, 0.052, 0.17); cyl(g, M.orange, 0.054, 0.035, 0, 0.03); cyl(g, M.dark, 0.03, 0.03, 0, 0.1); sph(g, M.gOrange, 0.018, 0, 0.12, 0); lever(g, M.steel, 0.1); break;
      case 'g_cryo': // frosted blue canister
        cyl(g, M.blue, 0.05, 0.16); cyl(g, M.ice, 0.054, 0.03, 0, 0.04); cyl(g, M.ice, 0.054, 0.03, 0, -0.04); cyl(g, M.gBlue, 0.028, 0.03, 0, 0.095); lever(g, M.steel, 0.1); break;
      case 'g_emp': // dark core in glowing coils, with an antenna
        cyl(g, M.dark, 0.048, 0.15); for (const y of [-0.045, 0, 0.045]) ring(g, M.gBlue, 0.056, y); cyl(g, M.steel, 0.006, 0.1, 0, 0.12); sph(g, M.gBlue, 0.016, 0, 0.175, 0); break;
      case 'g_shock': // yellow canister wound with a coil, two prongs
        cyl(g, M.yellow, 0.05, 0.15); for (const y of [-0.05, -0.017, 0.017, 0.05]) ring(g, M.gYellow, 0.054, y);
        cyl(g, M.steel, 0.006, 0.06, 0.02, 0.1); cyl(g, M.steel, 0.006, 0.06, -0.02, 0.1); sph(g, M.gYellow, 0.01, 0.02, 0.135, 0); sph(g, M.gYellow, 0.01, -0.02, 0.135, 0); break;
      case 'g_toxic': // green canister, glowing vents
        cyl(g, M.green, 0.052, 0.16); ring(g, M.gGreen, 0.056, 0.05); ring(g, M.gGreen, 0.056, -0.05);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; sph(g, M.gGreen, 0.011, Math.cos(a) * 0.052, 0, Math.sin(a) * 0.052); }
        cyl(g, M.dark, 0.03, 0.03, 0, 0.095); lever(g, M.steel, 0.1); break;
      case 'g_cluster': // a round bomb studded with bomblets
        sph(g, M.dark, 0.095); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = i % 2 ? 0.45 : -0.45; sph(g, M.red, 0.034, Math.cos(a) * Math.cos(b) * 0.09, Math.sin(b) * 0.09, Math.sin(a) * Math.cos(b) * 0.09); }
        cyl(g, M.steel, 0.024, 0.05, 0, 0.11); break;
      case 'g_sticky': { // a dark puck in green goo, a red light that blinks faster as it is about to go
        cyl(g, M.dark, 0.07, 0.045); sph(g, M.goo, 0.075, 0, -0.02, 0, 0.03); const led = sph(g, M.gRed, 0.016, 0, 0.03, 0); root.userData.led = led; break;
      }
      case 'g_flash': // grey tube with white bands and holes
        cyl(g, M.grey, 0.045, 0.16); cyl(g, M.white, 0.047, 0.025, 0, 0.045); cyl(g, M.white, 0.047, 0.025, 0, -0.045);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; sph(g, M.black, 0.009, Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045); }
        cyl(g, M.dark, 0.028, 0.03, 0, 0.095); lever(g, M.steel, 0.1); break;
      case 'g_hole': { // a black sphere circled by a violet ring
        sph(g, M.black, 0.075); const r1 = ring(g, M.gPurple, 0.12, 0, 1.2), r2 = ring(g, M.gPurple, 0.1, 0, 2.1); r2.rotation.y = 1.0; root.userData.rings = [r1, r2]; sph(g, M.gPurple, 0.02, 0, 0, 0.075); break;
      }
      case 'g_holy': // a glass flask of glowing water, gold neck and stopper
        cyl(g, M.glass, 0.045, 0.13); cyl(g, M.water, 0.04, 0.1, 0, -0.012); cyl(g, M.gold, 0.02, 0.05, 0, 0.09); sph(g, M.gHoly, 0.02, 0, 0.125, 0); ring(g, M.gold, 0.047, 0.04); break;
      case 'g_molotov': // a bottle of fuel with a burning rag
        cyl(g, M.glass, 0.04, 0.15); cyl(g, M.oil, 0.035, 0.11, 0, -0.018); cyl(g, M.glass, 0.016, 0.06, 0, 0.1); cyl(g, M.cloth, 0.014, 0.07, 0, 0.14, 0, 0, 0, 0.3); sph(g, M.gOrange, 0.03, 0.01, 0.18, 0); break;
      case 'g_mine': // a flat disc with prongs and a red eye
        cyl(g, M.dark, 0.14, 0.05); cyl(g, M.grey, 0.1, 0.02, 0, 0.03); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; cyl(g, M.steel, 0.006, 0.04, Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07); }
        root.userData.led = sph(g, M.gRed, 0.018, 0, 0.045, 0); break;
      case 'g_smoke': // grey canister with a white top and vents
        cyl(g, M.grey, 0.052, 0.17); cyl(g, M.white, 0.054, 0.04, 0, 0.06); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; sph(g, M.black, 0.011, Math.cos(a) * 0.052, -0.04, Math.sin(a) * 0.052); }
        cyl(g, M.dark, 0.03, 0.03, 0, 0.1); lever(g, M.steel, 0.1); break;
      case 'g_nail': { // a can bristling with nails
        cyl(g, M.steel, 0.055, 0.13); ring(g, M.dark, 0.058, 0.04); ring(g, M.dark, 0.058, -0.04);
        for (let i = 0; i < 12; i++) { const a = i * 2.4, y = -0.05 + (i % 4) * 0.033; const n = cyl(g, M.steel, 0.004, 0.08, Math.cos(a) * 0.07, y, Math.sin(a) * 0.07); n.rotation.set(0, -a, Math.PI / 2); }
        cyl(g, M.dark, 0.026, 0.03, 0, 0.08); break;
      }
      case 'g_thermite': // a charge with molten, glowing bands
        cyl(g, M.dark, 0.05, 0.16); cyl(g, M.gOrange, 0.052, 0.02, 0, 0.035); cyl(g, M.gOrange, 0.052, 0.02, 0, -0.035); cyl(g, M.white, 0.03, 0.03, 0, 0.095); lever(g, M.steel, 0.1); break;
      case 'g_shatter': // a crystal in a steel cage
        mesh(g, 'oct3', M.crystal, 0.075, 0.11, 0.075); ring(g, M.steel, 0.07, 0); ring(g, M.steel, 0.07, 0, 0).rotation.y = Math.PI / 2; sph(g, M.gWhite, 0.02); break;
      case 'g_dyna': { // three red paper sticks taped together, a long fuse with a spark at its end
        for (let i = 0; i < 3; i++) cyl(g, M.paper, 0.028, 0.24, (i - 1) * 0.056, 0, i === 1 ? 0.03 : -0.015);
        for (const y of [-0.07, 0.07]) mesh(g, 'box', M.tape, 0.18, 0.025, 0.08, 0, y, 0.005);
        const f = cyl(g, M.cloth, 0.005, 0.1, 0.01, 0.16, 0.01, 0, 0, 0.35); f.material = M.tape;
        root.userData.fuse = sph(g, M.gOrange, 0.014, -0.006, 0.21, 0.01); break;
      }
      case 'g_decoy': // a little golden bell
        mesh(g, 'cone', M.gold, 0.07, 0.11, 0.07, 0, 0, 0); sph(g, M.gold, 0.03, 0, 0.06, 0); ring(g, M.gold, 0.07, -0.05); sph(g, M.dark, 0.016, 0, -0.07, 0);
        ring(g, M.gold, 0.018, 0.09, 0); break;
      default: // g_frag: an olive "pineapple" with its spoon and pin
        sph(g, M.olive, 0.08, 0, 0, 0, 0.1); for (const y of [-0.05, 0, 0.05]) ring(g, M.dark, y ? 0.068 : 0.082, y); cyl(g, M.brass, 0.024, 0.04, 0, 0.11); lever(g, M.steel, 0.11);
    }
    if (scale) root.scale.setScalar(scale);
    return root;
  };

  // ---------------- in flight ----------------
  const add = (...a) => G.fx.add.spawn(...a), norm = (...a) => G.fx.norm.spawn(...a);
  GF.trail = function (p, dt) {
    const id = p.look.slice(3), x = p.pos.x, y = p.pos.y, z = p.pos.z, sp = p.mesh.userData.spin, ud = p.mesh.userData, r = Math.random();
    // tumble (bottles and bundles turn end over end, round ones roll)
    if (sp) { sp.rotation.x += dt * (id === 'g_dyna' || id === 'g_molotov' || id === 'g_holy' ? 9 : 14); sp.rotation.z += dt * 3; }
    if (ud.rings) { ud.rings[0].rotation.z += dt * 8; ud.rings[1].rotation.x += dt * 6; }
    if (ud.led) ud.led.visible = Math.sin(G.game.time * 30) > 0;
    switch (id) {
      case 'g_fire': case 'g_thermite': if (r < 0.7) G.fx.flame.spawn(x, y, z, U.rand(-0.2, 0.2), 0.4, U.rand(-0.2, 0.2), 0.25, 0.12, 0.03, 1.5, 0.7, 0.25, 1, -1, 1); break;
      case 'g_molotov': G.fx.flameLick(x, y + 0.1, z, 0.35); break;
      case 'g_cryo': if (r < 0.8) add(x, y, z, U.rand(-0.4, 0.4), U.rand(-0.4, 0.2), U.rand(-0.4, 0.4), 0.5, 0.1, 0.25, 0.6, 0.85, 1.0, 0.6, -0.3, 1); break;
      case 'g_emp': if (r < 0.5) add(x, y, z, U.rand(-2, 2), U.rand(-2, 2), U.rand(-2, 2), 0.15, 0.05, 0.01, 0.5, 0.75, 1.6, 1, 0, 2); break;
      case 'g_shock': if (r < 0.6) add(x, y, z, U.rand(-2.5, 2.5), U.rand(-2.5, 2.5), U.rand(-2.5, 2.5), 0.12, 0.05, 0.01, 1.6, 1.5, 0.6, 1, 0, 2); break;
      case 'g_toxic': if (r < 0.6) norm(x, y, z, 0, -0.6, 0, 0.6, 0.06, 0.12, 0.45, 0.8, 0.2, 0.8, 4, 0); break;
      case 'g_hole': if (r < 0.8) { const a = Math.random() * 6.28; add(x + Math.cos(a) * 0.4, y, z + Math.sin(a) * 0.4, -Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2, 0.3, 0.06, 0.01, 0.8, 0.4, 1.4, 1, 0, 0); } break;
      case 'g_holy': if (r < 0.6) add(x, y, z, U.rand(-0.3, 0.3), U.rand(0, 0.6), U.rand(-0.3, 0.3), 0.5, 0.07, 0.01, 1.6, 1.5, 1.0, 1, -0.5, 1); break;
      case 'g_smoke': if (r < 0.5) norm(x, y, z, U.rand(-0.2, 0.2), 0.3, U.rand(-0.2, 0.2), 0.9, 0.12, 0.45, 0.6, 0.6, 0.62, 0.45, -0.2, 1); break;
      case 'g_shatter': if (r < 0.4) add(x, y, z, 0, 0, 0, 0.25, 0.08, 0.01, 0.6, 1.4, 1.6, 1, 0, 0); break;
      case 'g_dyna': { // the fuse sputters all the way
        const f = V(0, 0.21 * (p.mesh.scale.x || 1), 0); if (ud.fuse) { ud.fuse.updateWorldMatrix(true, false); f.setFromMatrixPosition(ud.fuse.matrixWorld); } else f.add(p.pos);
        for (let i = 0; i < 2; i++) add(f.x, f.y, f.z, U.rand(-1.5, 1.5), U.rand(0, 2), U.rand(-1.5, 1.5), 0.25, 0.04, 0.01, 1.8, 1.0, 0.35, 1, 6, 1);
        if (r < 0.3) norm(f.x, f.y, f.z, 0, 0.4, 0, 0.6, 0.05, 0.18, 0.4, 0.38, 0.36, 0.4, -0.2, 1);
        if (r < dt * 6) G.sfx.fire && G.sfx.fire(p.pos, false);
        break;
      }
      case 'g_decoy': if (r < 0.3) add(x, y, z, 0, 0.3, 0, 0.3, 0.06, 0.01, 1.6, 1.3, 0.5, 1, 0, 0); break;
      default: if (r < 0.2) norm(x, y, z, 0, 0.2, 0, 0.4, 0.04, 0.1, 0.45, 0.45, 0.45, 0.25, -0.1, 1);
    }
  };

  // ---------------- detonations ----------------
  const live = []; // lasting effects: black holes, thermite fountains, decoy bells
  function burst(p, n, speed, col, life, size, grav) {
    for (let i = 0; i < n; i++) { const d = V(U.rand(-1, 1), U.rand(-0.2, 1), U.rand(-1, 1)).normalize().multiplyScalar(speed * U.rand(0.4, 1)); add(p.x, p.y, p.z, d.x, d.y, d.z, life * U.rand(0.6, 1.2), size, size * 0.2, col[0], col[1], col[2], 1, grav ?? 6, 1); }
  }
  function puff(p, n, r, col, a, life) {
    for (let i = 0; i < n; i++) { const t = Math.random() * 6.28, d = Math.random() * r; norm(p.x + Math.cos(t) * d, p.y + U.rand(0, 1), p.z + Math.sin(t) * d, Math.cos(t) * U.rand(0.5, 2), U.rand(0.3, 1.5), Math.sin(t) * U.rand(0.5, 2), life || 2.5, 0.8, 2.6, col[0], col[1], col[2], a || 0.6, -0.1, 0.6); }
  }
  function arcs(c, r, n, col) { for (let i = 0; i < n; i++) { const t = Math.random() * 6.28, d = r * U.rand(0.4, 1); G.fx.lightning(c.clone(), c.clone().add(V(Math.cos(t) * d, U.rand(-0.3, 1.5), Math.sin(t) * d)), col); } }
  const later = (ms, fn) => setTimeout(() => { if (G.game && G.game.run) fn(); }, ms);
  // what each throwable adds on top of the shared logic; pos = where it went off, ground = the floor under it, d = its data
  GF.boom = function (id, pos, ground, d) {
    const S = G.sfx, FX = G.fx, r = d.r || 4, c = pos.clone().add(V(0, 0.3, 0));
    switch (id) {
      case 'g_frag':
        burst(c, 24, 14, [1.6, 1.1, 0.5], 0.35, 0.05, 10); FX.debris && FX.debris(c, G.world.mats.iron, 8, 0.06, 9); break;
      case 'g_frag2':
        burst(c, 36, 18, [1.7, 1.2, 0.6], 0.4, 0.06, 10); FX.ring(ground, r * 1.2, 0xffe0b0, 0.45); FX.flash(c, 0xffd090, 120, 0.25, r * 3); S.rumble(0.8, 0.6); break;
      case 'g_fire':
        FX.fireBurst(ground, r); for (let i = 0; i < 18; i++) G.fx.flame.spawn(ground.x + U.rand(-1, 1), ground.y + 0.2, ground.z + U.rand(-1, 1), U.rand(-2, 2), U.rand(3, 7), U.rand(-2, 2), 0.7, 0.5, 0.2, 1.6, 0.7, 0.25, 1, -1, 1);
        S.fire(pos, true); break;
      case 'g_cryo':
        FX.ring(ground, r, 0xbfe8ff, 0.6); FX.ring(ground, r * 0.6, 0xffffff, 0.4); burst(c, 40, 10, [0.7, 0.95, 1.2], 0.8, 0.08, 4);
        puff(ground, 14, r * 0.8, [0.75, 0.88, 1.0], 0.5, 2);
        S.ice(pos); S.whoosh(0.5, 0.6); break;
      case 'g_emp':
        FX.ring(ground, r, 0x80c0ff, 0.5); later(120, () => FX.ring(ground, r * 0.7, 0xffffff, 0.4)); arcs(c, r, 7, 0x9fd0ff); burst(c, 30, 12, [0.5, 0.8, 1.7], 0.3, 0.05, 0);
        S.zap(pos); later(150, () => S.zap(pos)); S.shieldBreak && S.shieldBreak(pos); break;
      case 'g_shock':
        FX.strike(ground, 0xe0e8ff, true); arcs(c, r, 9, 0xfff2a0); burst(c, 24, 14, [1.6, 1.5, 0.6], 0.25, 0.05, 0); later(100, () => S.zap(pos)); break;
      case 'g_toxic':
        puff(ground, 26, r * 0.7, [0.35, 0.6, 0.12], 0.55, 3); FX.ring(ground, r, 0x80e040, 0.6); burst(c, 18, 6, [0.6, 1.4, 0.3], 0.6, 0.08, 4);
        S.hiss ? S.hiss(pos, 1.6) : S.whoosh(0.8, 0.5); break;
      case 'g_cluster':
        FX.flash(c, 0xff5030, 80, 0.2, r * 2.5); burst(c, 20, 12, [1.7, 0.6, 0.3], 0.35, 0.06, 10); break;
      case 'g_sticky':
        FX.flash(c, 0xff3020, 70, 0.15, r * 2); burst(c, 16, 9, [0.6, 1.4, 0.3], 0.5, 0.07, 10); break;
      case 'g_flash':
        FX.ring(ground, r, 0xffffff, 0.35); burst(c, 40, 16, [2, 2, 2], 0.2, 0.06, 0); S.zap(pos); break;
      case 'g_hole': GF.blackhole(ground, r, d.blackhole || 3); break;
      case 'g_holy': {
        const top = ground.clone().add(V(0, 9, 0));
        FX.beam(ground.clone(), top, 0xffe8a0, 0.9, 0.7); FX.beam(ground.clone(), top, 0xffffff, 0.3, 0.55); S.chime ? S.chime(pos) : S.magic(pos, 'holy'); break;
      }
      case 'g_molotov':
        burst(c, 18, 6, [0.8, 0.9, 1.0], 0.4, 0.04, 14); for (let i = 0; i < 14; i++) G.fx.flame.spawn(ground.x + U.rand(-1.2, 1.2), ground.y + 0.2, ground.z + U.rand(-1.2, 1.2), U.rand(-1, 1), U.rand(2, 5), U.rand(-1, 1), 0.7, 0.45, 0.2, 1.6, 0.7, 0.25, 1, -1, 1); break;
      case 'g_smoke':
        puff(ground, 30, r * 0.6, [0.55, 0.56, 0.58], 0.7, 4); S.hiss ? S.hiss(pos, 2.2) : null; break;
      case 'g_nail': {
        for (let i = 0; i < 28; i++) { const t = Math.random() * 6.28, el = U.rand(-0.25, 0.5), dir = V(Math.cos(t) * Math.cos(el), Math.sin(el), Math.sin(t) * Math.cos(el)); FX.tracer(c.clone(), c.clone().addScaledVector(dir, r * U.rand(0.6, 1.1)), 0xd8dce0, 0.02, 0.18); }
        burst(c, 20, 16, [1.4, 1.4, 1.5], 0.25, 0.04, 10); for (let i = 0; i < 4; i++) later(60 + i * 90, () => S.ricochet && S.ricochet(pos)); break;
      }
      case 'g_thermite':
        FX.flash(c, 0xfff0d0, 140, 0.3, r * 3); burst(c, 30, 7, [2, 1.6, 1.0], 0.9, 0.06, 9); live.push({ kind: 'thermite', pos: ground.clone(), t: 0, dur: d.dur || 4, r });
        S.hiss ? S.hiss(pos, d.dur || 4) : S.fire(pos, true); break;
      case 'g_shatter':
        FX.ring(ground, r, 0x80f0ff, 0.45); for (let i = 0; i < 36; i++) { const dd = V(U.rand(-1, 1), U.rand(0, 1), U.rand(-1, 1)).normalize().multiplyScalar(U.rand(5, 14)); add(c.x, c.y, c.z, dd.x, dd.y, dd.z, 0.6, 0.09, 0.03, 0.6, 1.5, 1.8, 1, 10, 1); }
        S.breakObj(pos, 'ceramic'); S.ice(pos); S.zap(pos); break;
      case 'g_dyna': {
        // the big one: a second and third blast, a column of smoke, debris and a long rumble
        FX.flash(c, 0xffc070, 200, 0.4, r * 4); burst(c, 50, 20, [1.8, 1.1, 0.4], 0.5, 0.08, 10); FX.debris && FX.debris(c, G.world.mats.rock, 14, 0.12, 12);
        for (let i = 0; i < 2; i++) { const o = V(U.rand(-2, 2), 0.4, U.rand(-2, 2)); later(140 + i * 140, () => { FX.explosion(pos.clone().add(o), r * 0.55, 0xffa040); S.explosion(pos, 1.5); }); }
        for (let i = 0; i < 24; i++) norm(ground.x + U.rand(-1, 1), ground.y + 0.5 + i * 0.25, ground.z + U.rand(-1, 1), U.rand(-0.4, 0.4), U.rand(2, 4), U.rand(-0.4, 0.4), 3.5, 1.2, 3.5, 0.28, 0.25, 0.22, 0.75, -0.3, 0.7);
        FX.ring(ground, r * 1.4, 0xffd0a0, 0.6); S.rumble(1.6, 1); if (G.player) G.player.addShake(0.6); break;
      }
    }
  };
  // the decoy: the hologram becomes a golden bell that swings and rings until it runs out
  GF.bell = function (dc) {
    if (!dc || !dc.mesh) return;
    mats();
    dc.mesh.children.forEach((ch) => { ch.visible = false; });
    const b = GF.build('g_decoy', 3.2); b.position.y = 0.9; dc.mesh.add(b);
    live.push({ kind: 'bell', dc, model: b, t: 0, next: 0 });
  };

  // ---------------- the black hole ----------------
  GF.blackhole = function (ground, r, dur) {
    mats();
    const g = new THREE.Group(); g.position.copy(ground).add(V(0, 1.2, 0));
    const core = new THREE.Mesh(PG().sph, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const halo = new THREE.Mesh(PG().sph, new THREE.MeshBasicMaterial({ color: 0x7a30ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    const disc = new THREE.Mesh(PG().torus, new THREE.MeshBasicMaterial({ color: 0xc080ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    const disc2 = new THREE.Mesh(PG().torus, disc.material.clone()); disc2.material.color.set(0xff70d0); disc2.material.opacity = 0.5;
    disc.rotation.x = Math.PI / 2 - 0.25; disc2.rotation.x = Math.PI / 2 + 0.35;
    g.add(core, halo, disc, disc2); core.scale.setScalar(0.01); halo.scale.setScalar(0.01); disc.scale.setScalar(0.01); disc2.scale.setScalar(0.01);
    G.scene.add(g);
    G.fx.flash(g.position, 0x8040ff, 60, 0.3, r * 2);
    live.push({ kind: 'hole', g, core, halo, disc, disc2, ground: ground.clone(), r, t: 0, dur });
  };

  GF.update = function (dt) {
    if (!live.length || !(dt > 0)) return;
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i]; L.t += dt;
      if (L.kind === 'hole') {
        const k = L.t / L.dur, grow = Math.min(1, L.t / 0.35), pulse = 1 + Math.sin(L.t * 18) * 0.06, s = 0.55 * grow * pulse;
        L.core.scale.setScalar(s); L.halo.scale.setScalar(s * 1.6); L.disc.scale.setScalar(s * 2.6); L.disc2.scale.setScalar(s * 2.1);
        L.disc.rotation.z += dt * 6; L.disc2.rotation.z -= dt * 9;
        const p = L.g.position;
        // matter spirals in from the edge of the pull
        for (let n = 0; n < 5; n++) {
          const a = Math.random() * 6.28, d = L.r * U.rand(0.5, 1), y = U.rand(-0.8, 1.6);
          const to = V(-Math.cos(a) * d, -y, -Math.sin(a) * d).multiplyScalar(1.6), sw = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(d * 1.2);
          add(p.x + Math.cos(a) * d, p.y + y, p.z + Math.sin(a) * d, to.x + sw.x, to.y, to.z + sw.z, 0.6, 0.09, 0.01, 0.9, 0.45, 1.6, 1, 0, 0);
        }
        if (Math.random() < dt * 3) G.fx.ring(L.ground, L.r, 0x9050ff, 0.5, { start: 1 });
        if (k >= 1) {
          // collapse: a white-violet flash and a shock ring (the blast itself is in abilities.js)
          G.fx.flash(p, 0xd0a0ff, 160, 0.35, L.r * 3); G.fx.ring(L.ground, L.r * 1.2, 0xe0c0ff, 0.5);
          for (let n = 0; n < 40; n++) { const dd = V(U.rand(-1, 1), U.rand(-0.5, 1), U.rand(-1, 1)).normalize().multiplyScalar(U.rand(6, 16)); add(p.x, p.y, p.z, dd.x, dd.y, dd.z, 0.5, 0.1, 0.02, 1.2, 0.7, 1.8, 1, 2, 1); }
          G.sfx.whoosh(0.4, 1, true);
          G.scene.remove(L.g); live.splice(i, 1);
        }
      } else if (L.kind === 'thermite') {
        // white-hot metal fountains up and spatters around for as long as it burns
        const p = L.pos;
        for (let n = 0; n < 4; n++) add(p.x + U.rand(-0.3, 0.3), p.y + 0.1, p.z + U.rand(-0.3, 0.3), U.rand(-2.5, 2.5), U.rand(4, 9), U.rand(-2.5, 2.5), 0.7, 0.05, 0.01, 2, 1.5, 0.8, 1, 14, 1);
        if (Math.random() < dt * 6) G.fx.flash(p.clone().add(V(0, 0.5, 0)), 0xffb060, 40, 0.15, L.r * 2);
        if (Math.random() < dt * 10) norm(p.x + U.rand(-L.r * 0.5, L.r * 0.5), p.y + 0.2, p.z + U.rand(-L.r * 0.5, L.r * 0.5), 0, 0.8, 0, 1.2, 0.3, 1.2, 0.35, 0.33, 0.3, 0.4, -0.2, 0.8);
        if (L.t >= L.dur) live.splice(i, 1);
      } else if (L.kind === 'bell') {
        const dc = L.dc;
        if (!dc || dc.t <= 0 || !dc.mesh.parent) { live.splice(i, 1); continue; }
        L.model.rotation.z = Math.sin(L.t * 7) * 0.35;
        L.next -= dt;
        if (L.next <= 0) { L.next = 0.9; G.fx.ring(dc.pos, 3, 0xffd060, 0.6); G.fx.ring(dc.pos, 1.5, 0xffffff, 0.4); if (G.sfx.chime) G.sfx.chime(dc.pos); }
      }
    }
  };
  GF.clear = function () { for (const L of live) if (L.g) G.scene.remove(L.g); live.length = 0; };
})();
