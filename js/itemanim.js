'use strict';
// First-person item-use animations (throwing grenades, wrapping bandages, drinking, injecting, eating, slotting plates, using gadgets).
// The item's effect is applied at a specific moment of its animation; the weapon is lowered meanwhile.
(function () {
  const IA = (G.ItemAnim = { lower: 0 });
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let root = null, cur = null, M = null;

  // which animation each item uses
  const KIND = {
    h_bandage: 'bandage', h_medkit: 'inject', h_regen: 'inject', u_adren: 'inject',
    h_elixir: 'drink', h_blood: 'drink', h_water: 'drink', u_rage: 'drink', u_iron: 'drink', u_focus: 'drink', u_invis: 'drink', h_fairy: 'drink',
    h_apple: 'eat', h_troll: 'eat', h_herb: 'eat', u_berserk: 'eat',
    u_plate: 'plate', u_battery: 'plate',
  };
  IA.kindOf = (id) => KIND[id] || 'device';
  const DUR = { throw: 0.5, bandage: 1.15, drink: 0.85, inject: 0.75, eat: 0.8, plate: 0.75, device: 0.62 };
  const APPLY = { throw: 0.42, bandage: 0.82, drink: 0.62, inject: 0.55, eat: 0.6, plate: 0.68, device: 0.5 };
  const LIQ = { h_elixir: 0xff3a5a, h_blood: 0x8a0010, h_water: 0x80c8ff, u_rage: 0xff5a10, u_iron: 0x8a8a90, u_focus: 0x60a0ff, u_invis: 0xc0e0ff, h_fairy: 0xffe0ff, h_regen: 0x60ff90, u_adren: 0xffd040, h_medkit: 0xff4040 };

  function mats() {
    if (M) return M;
    const W = G.weapons.mats;
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.envMapIntensity = 2; return m; };
    M = {
      glove: W.glove, sleeve: W.sleeve, steel: W.steel, gun: W.gun, brass: W.brass, wood: W.wood,
      cloth: mk({ color: 0xf0ece0, roughness: 0.95 }),
      glass: mk({ color: 0xd8f0ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }),
      cork: mk({ color: 0x8a6a40, roughness: 0.9 }),
      gold: mk({ color: 0xe0b050, metalness: 1, roughness: 0.25 }),
      paper: mk({ color: 0xd8c8a0, roughness: 0.9, side: THREE.DoubleSide }),
      red: mk({ color: 0xc01020, roughness: 0.4 }), green: mk({ color: 0x3a8a2a, roughness: 0.8, side: THREE.DoubleSide }),
      heart: mk({ color: 0x6a0a14, roughness: 0.4, emissive: 0x200004 }),
      shroom: mk({ color: 0xc02a20, roughness: 0.6 }), stem: mk({ color: 0xe8e0c8, roughness: 0.8 }),
      plate: mk({ color: 0x8a8e96, metalness: 0.8, roughness: 0.35 }), cell: mk({ color: 0x3060a0, emissive: 0x2050c0, emissiveIntensity: 1.2 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
    };
    return M;
  }
  const PGg = () => G.Props.PG;
  function box(p, m, sx, sy, sz, x, y, z, rx, ry, rz) { const o = new THREE.Mesh(PGg().box, m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; }
  function cyl(p, m, r, h, x, y, z, rx, ry, rz) { const o = new THREE.Mesh(PGg().cyl8, m); o.scale.set(r, h, r); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; }
  function sph(p, m, sx, sy, sz, x, y, z) { const o = new THREE.Mesh(PGg().sph, m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; }
  function hand(p, right) {
    const g = new THREE.Group(); p.add(g);
    box(g, M.glove, 0.05, 0.075, 0.075);
    box(g, M.glove, 0.055, 0.035, 0.06, right ? -0.022 : 0.022, 0, -0.01);
    const arm = new THREE.Mesh(PGg().cyl8, M.sleeve); arm.scale.set(0.038, 0.42, 0.038); arm.rotation.x = Math.PI / 2 - 0.35; arm.rotation.z = right ? 0.25 : -0.45; arm.position.set(right ? 0.06 : -0.08, -0.08, 0.2); g.add(arm);
    return g;
  }

  // ------------------------------------------------ item models (vm space, ~ real size)
  function buildItem(kind, id) {
    mats();
    const g = new THREE.Group();
    const liq = LIQ[id] || 0x80ff80;
    if (kind === 'throw') {
      const gid = id || 'g_frag';
      if (G.GrenFX && G.ITEM_BY_ID[gid]) g.add(G.GrenFX.build(gid, 0.42)); // the same model as the one that flies
      else if (gid === 'g_molotov' || gid === 'g_holy') { cyl(g, M.glass, 0.03, 0.12); cyl(g, new THREE.MeshBasicMaterial({ color: gid === 'g_holy' ? 0x80c8ff : 0xff8020 }), 0.026, 0.07, 0, -0.02); cyl(g, M.cloth, 0.012, 0.06, 0, 0.09); }
      else if (gid === 'g_dyna') { for (let i = 0; i < 3; i++) cyl(g, M.red, 0.016, 0.14, (i - 1) * 0.034, 0); }
      else if (gid === 'g_mine') { cyl(g, M.gun, 0.07, 0.03); sph(g, M.red, 0.012, 0.012, 0.012, 0, 0.02, 0); }
      else { sph(g, M.gun, 0.035, 0.045, 0.035); cyl(g, M.steel, 0.012, 0.03, 0, 0.045); box(g, M.steel, 0.006, 0.05, 0.012, 0.02, 0.03, 0, 0, 0, -0.3); }
    } else if (kind === 'bandage') {
      const roll = new THREE.Group(); g.add(roll); cyl(roll, M.cloth, 0.03, 0.06, 0, 0, 0, 0, 0, Math.PI / 2); g.userData.roll = roll;
    } else if (kind === 'drink') {
      cyl(g, M.glass, 0.028, 0.11); const l = cyl(g, new THREE.MeshStandardMaterial({ color: liq, emissive: liq, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), 0.024, 0.08, 0, -0.012); g.userData.liq = l;
      cyl(g, M.glass, 0.012, 0.04, 0, 0.07); cyl(g, M.cork, 0.013, 0.018, 0, 0.095);
    } else if (kind === 'inject') {
      const s = new THREE.Group(); g.add(s); s.rotation.x = Math.PI / 2;
      cyl(s, M.glass, 0.012, 0.12); cyl(s, new THREE.MeshBasicMaterial({ color: liq }), 0.01, 0.09, 0, -0.01);
      cyl(s, M.steel, 0.002, 0.05, 0, -0.085); const pl = cyl(s, M.steel, 0.005, 0.06, 0, 0.09); cyl(s, M.steel, 0.016, 0.004, 0, 0.12);
      g.userData.plunger = pl;
    } else if (kind === 'eat') {
      if (id === 'h_apple') { sph(g, M.gold, 0.045, 0.042, 0.045); cyl(g, M.wood, 0.004, 0.025, 0, 0.045); }
      else if (id === 'h_troll') { sph(g, M.heart, 0.05, 0.06, 0.045); cyl(g, M.heart, 0.012, 0.04, 0.015, 0.05); }
      else if (id === 'u_berserk') { const c = sph(g, M.shroom, 0.05, 0.03, 0.05, 0, 0.03); cyl(g, M.stem, 0.016, 0.05, 0, -0.005); g.userData.cap = c; }
      else { for (let i = 0; i < 5; i++) { const lf = new THREE.Mesh(PGg().plane, M.green); lf.scale.set(0.03, 0.08, 1); lf.position.set(U.rand(-0.015, 0.015), 0.03, 0); lf.rotation.set(0, i, U.rand(-0.6, 0.6)); g.add(lf); } }
    } else if (kind === 'plate') {
      if (id === 'u_battery') { cyl(g, M.steel, 0.025, 0.1); cyl(g, M.cell, 0.02, 0.07); }
      else { box(g, M.plate, 0.14, 0.16, 0.012); box(g, M.steel, 0.15, 0.015, 0.014, 0, 0.07); }
    } else {
      // gadgets
      if (id === 'u_map') { const p = new THREE.Mesh(PGg().plane, M.paper); p.scale.set(0.16, 0.12, 1); g.add(p); }
      else if (id === 'u_lucky') { cyl(g, M.gold, 0.025, 0.006, 0, 0, 0, Math.PI / 2); }
      else if (id === 'u_wind') { cyl(g, M.paper, 0.018, 0.12, 0, 0, 0, 0, 0, Math.PI / 2); cyl(g, M.wood, 0.006, 0.14, 0, 0, 0, 0, 0, Math.PI / 2); }
      else if (id === 'u_feather') { const f = new THREE.Mesh(PGg().cone, M.cloth); f.scale.set(0.02, 0.14, 0.006); g.add(f); }
      else if (id === 'u_sand') { const c1 = new THREE.Mesh(PGg().cone, M.glass); c1.scale.set(0.03, 0.04, 0.03); c1.position.y = 0.02; c1.rotation.x = Math.PI; g.add(c1); const c2 = c1.clone(); c2.rotation.x = 0; c2.position.y = -0.02; g.add(c2); cyl(g, M.wood, 0.034, 0.006, 0, 0.042); cyl(g, M.wood, 0.034, 0.006, 0, -0.042); }
      else if (id === 'u_ammo') { box(g, new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 0.8 }), 0.12, 0.07, 0.07); box(g, M.brass, 0.1, 0.01, 0.05, 0, 0.04); }
      else if (id === 'u_lantern') { box(g, M.gun, 0.06, 0.08, 0.06); sph(g, new THREE.MeshBasicMaterial({ color: 0x80d0ff }), 0.02, 0.025, 0.02); }
      else if (id === 'u_whet') { box(g, new THREE.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 1 }), 0.12, 0.025, 0.04); }
      else { box(g, M.gun, 0.08, 0.06, 0.06); box(g, M.brass, 0.03, 0.02, 0.065, 0, 0.02); }
      const gl = sph(g, M.glow, 0.001, 0.001, 0.001); g.userData.flash = gl;
    }
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    return g;
  }

  // ------------------------------------------------ playback
  IA.busy = () => !!cur;
  IA.curDur = () => (cur ? cur.dur : 0);
  // what is still left of the current motion: [seconds until the effect lands (0 once applied), seconds until the motion ends]
  IA.left = (id) => (cur && (!id || cur.id === id) ? [cur.applied ? 0 : Math.max(0, APPLY[cur.kind] * cur.dur - cur.t), Math.max(0, cur.dur - cur.t)] : null);
  IA.build = (kind, id) => { mats(); return buildItem(kind, id); };
  IA.hand = (p, right) => { mats(); return hand(p, right); };
  IA.play = function (kind, id, onApply, onDone) {
    if (cur || !G.weapons.vmRoot) return false;
    mats();
    if (!root) { root = new THREE.Group(); G.weapons.vmScene.add(root); }
    const g = new THREE.Group(); root.add(g);
    const item = buildItem(kind, id); g.add(item);
    const BS = kind === 'throw' ? 1.3 : 1.5; item.scale.setScalar(BS); item.userData.bs = BS;
    const rightHanded = kind === 'throw' || kind === 'inject' || kind === 'device';
    const h = hand(g, rightHanded); h.position.set(rightHanded ? 0.005 : -0.005, -0.04, 0.02);
    if (kind === 'drink' || kind === 'eat') h.children[2].scale.y = 0.18;
    let fore = null;
    if (kind === 'bandage' || kind === 'inject') {
      // the other forearm being treated
      fore = new THREE.Group(); root.add(fore);
      cyl(fore, M.sleeve, 0.04, 0.34, 0, 0, 0.12, Math.PI / 2 - 0.2, 0, 0);
      const skin = cyl(fore, M.glove, 0.034, 0.14, 0, -0.02, -0.08, Math.PI / 2 - 0.2, 0, 0);
      box(fore, M.glove, 0.06, 0.07, 0.07, 0, -0.045, -0.17);
      if (kind === 'bandage') { const wrap = cyl(fore, M.cloth, 0.038, 0.001, 0, -0.02, -0.05, Math.PI / 2 - 0.2, 0, 0); fore.userData.wrap = wrap; }
      fore.position.set(kind === 'bandage' ? 0.06 : -0.1, -0.13, -0.42); fore.rotation.y = kind === 'bandage' ? -0.5 : 0.5;
    }
    cur = { kind, id, t: 0, dur: DUR[kind] * (kind === 'bandage' && P().has && P().has('d_healboost') ? 0.85 : 1), applied: false, onApply, onDone, g, item, fore };
    if (kind === 'drink') G.sfx.mech('click', 0, 0.6);
    if (kind === 'bandage') G.sfx.whoosh(0.5, 0.25);
    if (kind === 'plate') G.sfx.mech('magOut', 0, 0.8);
    return true;
  };
  const P = () => G.player;
  const L = (a, b, k) => a + (b - a) * k;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function path(keys, k) {
    // keys: [[t, x, y, z, rx, ry, rz], ...]
    let i = 0; while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], u = ease(U.clamp((k - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1));
    return [1, 2, 3, 4, 5, 6].map((j) => L(a[j], b[j], u));
  }
  const PATHS = {
    throw: [[0, 0.2, -0.21, -0.3, 0, 0, 0], [0.3, 0.2, 0.03, -0.26, 0.9, 0, -0.2], [0.45, 0.04, 0.0, -0.6, -0.6, 0, 0.1], [1, 0.14, -0.36, -0.5, -0.8, 0, 0]],
    bandage: [[0, -0.2, -0.26, -0.35, 0, 0, 0], [0.15, -0.02, -0.08, -0.38, 0, 0, 0], [0.85, 0.12, -0.08, -0.45, 0, 0, 0], [1, -0.2, -0.31, -0.35, 0, 0, 0]],
    drink: [[0, -0.12, -0.24, -0.34, 0, 0, 0], [0.3, -0.02, -0.04, -0.3, 0.6, 0, -0.1], [0.72, 0, 0.0, -0.28, 1.6, 0, -0.1], [1, -0.12, -0.28, -0.3, 0.2, 0, 0]],
    inject: [[0, 0.16, 0.06, -0.3, -0.4, 0, 0.3], [0.38, -0.06, -0.04, -0.4, -0.9, 0.4, 0.2], [0.65, -0.06, -0.04, -0.4, -0.9, 0.4, 0.2], [1, 0.18, -0.28, -0.3, -0.4, 0, 0]],
    eat: [[0, -0.1, -0.26, -0.35, 0, 0, 0], [0.38, -0.01, -0.03, -0.29, 0.3, 0, 0], [0.68, -0.01, -0.04, -0.29, 0.3, 0, 0], [1, -0.1, -0.31, -0.32, 0, 0, 0]],
    plate: [[0, -0.18, -0.24, -0.34, 0, 0.3, 0], [0.35, -0.02, -0.02, -0.32, -0.3, 0, 0], [0.7, 0, -0.24, -0.2, -1.2, 0, 0], [1, -0.05, -0.41, -0.2, -1.2, 0, 0]],
    device: [[0, 0.14, -0.26, -0.35, 0, 0, 0], [0.38, 0.02, 0.04, -0.36, 0.2, 0.5, 0], [0.62, 0.02, 0.05, -0.36, 0.2, 2.2, 0], [1, 0.14, -0.31, -0.35, 0, 0, 0]],
  };
  // ------------------------------------------------ searching a chest / corpse: both hands dig in front of you, in a loop
  // (the gun is lowered meanwhile). Faster as the search nears its end; the hands sink in and out smoothly.
  let rum = null;
  // one whole hand, palm down: forearm + cuff + palm + four fingers + thumb, all joined (reads as a single hand)
  function digHand(p, side) {
    const g = new THREE.Group(); p.add(g);
    const fore = cyl(g, M.sleeve, 0.03, 0.34, 0, 0, 0.215, Math.PI / 2, 0, 0);       // forearm running back toward the camera
    cyl(g, M.glove, 0.034, 0.05, 0, 0, 0.06, Math.PI / 2, 0, 0);                    // cuff
    box(g, M.glove, 0.084, 0.03, 0.09, 0, 0, 0);                                                // palm / back of the hand
    const fingers = new THREE.Group(); fingers.position.set(0, -0.002, -0.044); g.add(fingers);
    for (let i = 0; i < 4; i++) { const f = box(fingers, M.glove, 0.017, 0.02, 0.058, -0.03 + i * 0.02, 0, -0.027); f.scale.z = i === 0 || i === 3 ? 0.05 : 0.058; }
    const th = box(g, M.glove, 0.02, 0.022, 0.05, -side * 0.048, -0.006, -0.012, 0, -side * 0.6, 0);  // thumb on the inner side
    return { g, fingers, th, fore };
  }
  function rummage(dt, on) {
    if (!G.weapons.vmRoot) return;
    if (on && !rum) {
      mats();
      if (!root) { root = new THREE.Group(); G.weapons.vmScene.add(root); }
      const g = new THREE.Group(); root.add(g);
      const l = digHand(g, -1), r = digHand(g, 1);
      rum = { g, l, r, t: 0, k: 0 };
    }
    if (!rum) return;
    rum.k = U.damp(rum.k, on ? 1 : 0, on ? 9 : 10, dt);
    const S = G.game.search, prog = S ? Math.min(1, S.t / Math.max(0.01, S.dur)) : 1;
    rum.t += dt * (7 + prog * 5);
    const t = rum.t, sink = (1 - rum.k) * 0.42;
    // each hand: forward / back strokes with a scoop at the bottom, the two out of phase
    const pose = (H, side, ph) => {
      const a = t + ph, s = Math.sin(a), c = Math.cos(a), h = H.g;
      // reach forward (fingers open) -> press down and pull back (fingers curl) -> lift
      h.position.set(side * (0.105 + c * 0.015), -0.08 - sink + Math.max(0, s) * 0.035, -0.44 + c * 0.05);
      h.rotation.set(0.32 + Math.max(0, -s) * 0.3, side * 0.18 + c * 0.06, side * (-0.12 + s * 0.08));
      H.fingers.rotation.x = 0.12 + Math.max(0, -s) * 0.7;
    };
    pose(rum.l, -1, 0); pose(rum.r, 1, Math.PI);
    rum.g.position.set(0, 0, 0);
    if (on && Math.sin(t) > 0.97 && Math.random() < 0.5) G.sfx.whoosh && G.sfx.whoosh(0.08, 0.6 + Math.random() * 0.3, true);
    if (!on && rum.k < 0.02) { root.remove(rum.g); rum = null; }
  }
  IA.update = function (dt) {
    const holding = G.GrenHold && G.GrenHold.active();
    const searching = !!(G.game && G.game.search) && !cur;
    IA.lower = U.damp(IA.lower, cur || holding || searching ? 1 : 0, cur || holding || searching ? 14 : 8, dt);
    rummage(dt, searching);
    if (!cur) return;
    const c = cur;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const p = path(PATHS[c.kind], k);
    c.g.position.set(p[0], p[1], p[2]); c.g.rotation.set(p[3], p[4], p[5]);
    // per-kind flourishes
    if (c.kind === 'bandage') {
      const roll = c.item.userData.roll, a = c.t * 16;
      if (k > 0.15 && k < 0.85) { roll.position.set(0, Math.sin(a) * 0.05, Math.cos(a) * 0.05); roll.scale.setScalar(1 - (k - 0.15) * 0.6); }
      if (c.fore && c.fore.userData.wrap) { const wk = U.clamp((k - 0.15) / 0.7, 0, 1); c.fore.userData.wrap.scale.y = Math.max(0.001, wk * 0.15); }
    }
    if (c.kind === 'drink' && c.item.userData.liq && k > 0.45 && k < 0.75) { const l = c.item.userData.liq; l.scale.y = Math.max(0.005, 0.08 * (1 - (k - 0.45) / 0.3)); }
    if (c.kind === 'inject' && c.item.userData.plunger) { const pk = U.clamp((k - 0.38) / 0.27, 0, 1); c.item.userData.plunger.position.y = 0.09 - pk * 0.07; }
    if (c.kind === 'eat' && k > 0.38 && k < 0.68) { const s = 1 - (k - 0.38) / 0.3 * 0.55; c.item.scale.setScalar(s * c.item.userData.bs); if (Math.random() < dt * 20) G.sfx.ui && 0; }
    if (c.kind === 'plate' && k > 0.6) c.item.scale.setScalar(c.item.userData.bs * Math.max(0.01, 1 - (k - 0.6) * 2.5));
    if (c.kind === 'device' && c.item.userData.flash) { const fk = Math.max(0, 1 - Math.abs(k - 0.5) * 8); c.item.userData.flash.scale.setScalar(0.001 + fk * 0.05); }
    if (c.kind === 'throw' && k > 0.45) c.item.visible = false;
    if (c.fore) { const fk = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1; c.fore.position.y = -0.13 - (1 - fk) * 0.3; }
    if (!c.applied && k >= APPLY[c.kind]) {
      c.applied = true;
      if (c.kind === 'drink') G.sfx.drink && G.sfx.drink();
      if (c.kind === 'eat') G.sfx.melee && G.sfx.melee(false);
      if (c.kind === 'inject') G.sfx.mech('click', 0, 1);
      if (c.kind === 'plate') G.sfx.mech('magIn', 0, 1);
      try { c.onApply && c.onApply(); } catch (e) { console.error(e); }
    }
    if (k >= 1) {
      root.remove(c.g); if (c.fore) root.remove(c.fore);
      cur = null;
      c.onDone && c.onDone();
    }
  };
  // drop whatever is being used WITHOUT applying it (a revive puts the inventory back as it was)
  IA.abort = function () { if (!cur) return; root.remove(cur.g); if (cur.fore) root.remove(cur.fore); cur = null; };
  IA.cancel = function () { if (!cur) return; if (!cur.applied && cur.onApply) { try { cur.onApply(); } catch (e) { console.error(e); } } root.remove(cur.g); if (cur.fore) root.remove(cur.fore); cur = null; };
})();
