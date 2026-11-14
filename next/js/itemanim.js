'use strict';
// First-person item-use animations (throwing grenades, wrapping bandages, drinking, injecting, eating, slotting plates, using gadgets).
// The item's effect is applied at a specific moment of its animation; the weapon is lowered meanwhile.
(function () {
  const IA = (G.ItemAnim = { lower: 0 });
  const U = G.U;
  const V3 = THREE.Vector3, QT = THREE.Quaternion, HX = Math.PI / 2;
  let root = null, cur = null, M = null;

  // which animation each item uses (its length and the moment its effect lands come from this)
  const KIND = {
    h_bandage: 'bandage', h_medkit: 'inject', h_regen: 'inject', u_adren: 'inject',
    h_elixir: 'drink', h_water: 'drink', u_rage: 'drink', u_iron: 'drink', u_focus: 'drink', u_invis: 'drink', h_fairy: 'drink',
    h_apple: 'eat', h_troll: 'eat', h_herb: 'eat', u_berserk: 'eat',
    u_plate: 'plate',
  };
  // what is seen, where it is not the kind's own (the timing stays the kind's): the god's wine is drunk from its flask
  const LOOK = { h_ambrosia: 'drink' };
  IA.kindOf = (id) => KIND[id] || 'device';
  const DUR = { throw: 0.5, bandage: 1.15, drink: 0.85, inject: 0.75, eat: 0.8, plate: 0.75, device: 0.62 };
  const APPLY = { throw: 0.42, bandage: 0.82, drink: 0.62, inject: 0.55, eat: 0.6, plate: 0.68, device: 0.5 };
  // what each draught or dose looks like in its glass: [colour, how much of the light it lets through]. Muted; nothing glows
  const LIQ = { h_elixir: [0x4e0c10, 0.88], h_water: [0xb4c0b8, 0.32], u_rage: [0x5e2010, 0.86], u_iron: [0x261810, 0.94], u_focus: [0x26344e, 0.82], u_invis: [0xc0c8cc, 0.3], h_fairy: [0xd4d0c4, 0.62], h_regen: [0x5e6c2e, 0.72], u_adren: [0x8e7020, 0.76], h_medkit: [0x6a5a3a, 0.8] };

  function mats() {
    if (M) return M;
    const W = G.weapons.mats, X = G.GFX || {};
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.envMapIntensity = 2; return m; };
    // (a surface of gfx.js laid on: colour, normal, and occlusion / roughness in one - the material's roughness scales what it gives)
    const sf = (t) => (t ? { map: t.map, normalMap: t.normalMap, roughnessMap: t.orm, aoMap: t.orm } : {});
    const it = (n) => (X.itemTex ? X.itemTex(n) : null), ex = (n) => (X.tex ? X.tex(n) : null);
    const steelT = ex('steel'), weave = ex('weave'), hide = ex('leather'), rock = ex('rock'), poly = ex('polymer');
    M = {
      glove: W.glove, sleeve: W.sleeve, steel: W.steel, gun: W.gun, brass: W.brass, wood: W.wood, poly: W.poly,
      // gauze, the end of its roll, a forearm's skin, a label of paper (gfx.js itemTex)
      linen: mk(Object.assign({ color: 0xd8d0c0, roughness: 1, side: THREE.DoubleSide }, sf(it('linen')))),
      rollEnd: mk(Object.assign({ color: 0xd8d0c0, roughness: 1 }, sf(it('rollEnd')))),
      linenV: mk(Object.assign({ color: 0xd8d0c0, roughness: 1, side: THREE.DoubleSide, vertexColors: true }, sf(it('linen')))),
      skin: mk(Object.assign({ color: 0xcfc2b6, roughness: 1 }, sf(it('skin')))),
      label: mk(Object.assign({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }, sf(it('label')))),
      // canvas, its piping and a cross painted on it; leather; metals worn dull (nickel, old brass, tin, pewter)
      canvas: mk(Object.assign({ color: 0x8a7c5c, roughness: 1, side: THREE.DoubleSide }, sf(weave))),
      canvasDk: mk(Object.assign({ color: 0x5e5038, roughness: 1 }, sf(weave))),
      cross: mk(Object.assign({ color: 0x582820, roughness: 1 }, sf(weave))),
      leather: mk(Object.assign({ color: 0x4a3222, roughness: 1, side: THREE.DoubleSide }, sf(hide))),
      nickel: mk(Object.assign({ color: 0xc4c2b8, metalness: 0.9, roughness: 0.55 }, sf(steelT))),
      brassOld: mk(Object.assign({ color: 0xa0844a, metalness: 0.9, roughness: 0.65 }, sf(steelT))),
      tin: mk(Object.assign({ color: 0x9c9a90, metalness: 0.85, roughness: 0.75 }, sf(steelT))),
      pewter: mk(Object.assign({ color: 0x8a8880, metalness: 0.8, roughness: 0.85 }, sf(steelT))),
      // glass (thick: its inner face is drawn too, what it holds is drawn first), black rubber, ink, the dark inside of a pouch
      glass: mk({ color: 0x3e4842, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false }),
      glassBrown: mk({ color: 0x3a200c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false }),
      rubber: mk({ color: 0x1e1b18, roughness: 0.75 }), ink: mk({ color: 0x14110e, roughness: 0.6 }), dark: mk({ color: 0x0c0a08, roughness: 1 }),
      // stoneware glazed and bare, cork, sealing wax, string
      glaze: mk(Object.assign({ color: 0xffffff, roughness: 1, metalness: 0 }, sf(it('saltGlaze')))),   // (salt glaze: mottled, its skin like orange peel)
      glazeDk: mk(Object.assign({ color: 0x2c1a10, roughness: 0.26, metalness: 0 }, poly ? { normalMap: poly.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) } : {})),
      clay: mk(Object.assign({ color: 0xa4856a, roughness: 1 }, sf(rock))),
      cork: mk(Object.assign({ color: 0x8e6c48, roughness: 1 }, sf(hide))),
      wax: mk({ color: 0x40120e, roughness: 0.55 }),
      cord: mk(Object.assign({ color: 0x7a6a4a, roughness: 1 }, sf(weave))),
      // the golden apple's skin, stalk and leaf; the troll's heart - its flesh, its vessels, their bores, the fat on it
      appleSkin: mk(Object.assign({ color: 0xffffff, roughness: 1 }, sf(it('appleSkin')))), stalk: mk(Object.assign({ color: 0x3e2a1a, roughness: 1 }, sf(hide))),
      leaf: mk({ color: 0x4a5430, roughness: 0.7, side: THREE.DoubleSide }),
      flesh: mk(Object.assign({ color: 0xe0d0d0, roughness: 1.3 }, sf(it('flesh')))), vessel: mk({ color: 0x3a1018, roughness: 0.34 }), fat: mk({ color: 0x6a5a3a, roughness: 0.5 }), lumen: mk({ color: 0x160606, roughness: 0.6 }),
      // forged steel and iron, old gold, a darker leather (the plate, the hammer, the tool roll)
      plateSteel: mk(Object.assign({ color: 0x86888a, metalness: 0.85, roughness: 0.8 }, sf(steelT))),
      forged: mk(Object.assign({ color: 0x6a6c68, roughness: 1 }, (() => { const t = it('castIron'); return t ? Object.assign(sf(t), { metalnessMap: t.orm, metalness: 1 }) : {}; })())),
      goldOld: mk(Object.assign({ color: 0x8e7238, metalness: 0.85, roughness: 0.6 }, sf(steelT))), leatherDk: mk(Object.assign({ color: 0x2e1e14, roughness: 1, side: THREE.DoubleSide }, sf(hide))),
      // (the rest, as they were)
      cloth: mk({ color: 0xf0ece0, roughness: 0.95 }),
      gold: mk({ color: 0xb08a3a, metalness: 0.9, roughness: 0.32 }), stone: mk({ color: 0x5a5a58, roughness: 1 }),
      paper: mk({ color: 0xd8c8a0, roughness: 0.9, side: THREE.DoubleSide }),
      red: mk({ color: 0x7a1c1c, roughness: 0.5 }), green: mk({ color: 0x3a5a2a, roughness: 0.85, side: THREE.DoubleSide }),
      heart: mk({ color: 0x4a0c12, roughness: 0.35 }),
      shroom: mk({ color: 0x74322a, roughness: 0.7 }), stem: mk({ color: 0xb8ab8e, roughness: 0.85 }),
      plate: mk({ color: 0x8a8e96, metalness: 0.8, roughness: 0.35 }), cell: mk({ color: 0x3060a0, emissive: 0x2050c0, emissiveIntensity: 1.2 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xfff0c0 }),
    };
    return M;
  }
  const liqC = {};
  const liqMat = (id) => liqC[id] || (liqC[id] = (() => { const L = LIQ[id] || [0x5a6a40, 0.8], m = new THREE.MeshStandardMaterial({ color: L[0], roughness: 0.12, metalness: 0, transparent: true, opacity: L[1], depthWrite: false }); m.envMapIntensity = 1.5; return m; })());
  const PGg = () => G.Props.PG;
  function box(p, m, sx, sy, sz, x, y, z, rx, ry, rz) { const o = new THREE.Mesh(PGg().box, m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; }
  function cyl(p, m, r, h, x, y, z, rx, ry, rz) { const o = new THREE.Mesh(PGg().cyl8, m); o.scale.set(r, h, r); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; }
  function sph(p, m, sx, sy, sz, x, y, z) { const o = new THREE.Mesh(PGg().sph, m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; }
  // the parts of one of gfx.js's shapes (itemGeo) as meshes under p; what is tagged is handed back by its tag. What is in a glass is
  // drawn before the glass. null when there is no such shape
  function putG(p, name, id) {
    const d = G.GFX && G.GFX.itemGeo ? G.GFX.itemGeo(name) : null; if (!d || !d.length) return null;
    const tags = {};
    for (const q of d) {
      const mat = q.m === 'liq' ? liqMat(id) : M[q.m] || M.gun, o = new THREE.Mesh(q.g, mat);
      if (q.at) o.position.set(q.at[0], q.at[1], q.at[2]);
      if (mat.transparent) o.renderOrder = q.m === 'liq' ? 1 : 2;
      p.add(o); if (q.tag) { tags[q.tag] = o; o.userData.part = q; }
    }
    return tags;
  }
  // where the glove's cuff ends on the right hand of gfx.js and the way the forearm runs back from it (the left: the same in a mirror)
  const WR = new V3(0.046, -0.066, 0.08), DR = new V3(0.016, -0.036, 0.052).normalize(), ZV = new V3(0, 0, 1);
  // a sleeve back from the cuff of a hand, along its forearm (gfx.js sleeveArm; a plain bar where it is missing)
  function sleeveOn(g, right) {
    const s = new THREE.Group(); g.add(s);
    if (!putG(s, 'sleeveArm')) { const a = cyl(s, M.sleeve, 0.038, 0.42, 0, 0, 0.2); a.rotation.x = HX; }
    s.position.set(right ? WR.x : -WR.x, WR.y, WR.z); s.quaternion.setFromUnitVectors(ZV, new V3(right ? DR.x : -DR.x, DR.y, DR.z));
    return s;
  }
  function hand(p, right) {
    const g = new THREE.Group(); p.add(g);
    // (a gloved hand closed round what it holds, a pad over its knuckles: gfx.js. Then the sleeve back from its cuff)
    const hs = G.GFX && G.GFX.hand ? G.GFX.hand(right, true) : null, W = G.weapons.mats;
    if (hs) g.add(new THREE.Mesh(hs.hand, M.glove), new THREE.Mesh(hs.pad, W.poly || M.gun));
    else { box(g, M.glove, 0.05, 0.075, 0.075); box(g, M.glove, 0.055, 0.035, 0.06, right ? -0.022 : 0.022, 0, -0.01); }
    g.userData.arm = sleeveOn(g, right);
    if (hs) g.add(new THREE.Mesh(hs.strap, M.sleeve));
    return g;
  }
  // a hand alone (its sleeve is laid by the caller)
  function bareHand(p, right) {
    const g = new THREE.Group(); p.add(g);
    const hs = G.GFX && G.GFX.hand ? G.GFX.hand(right, true) : null;
    if (hs) g.add(new THREE.Mesh(hs.hand, M.glove), new THREE.Mesh(hs.pad, G.weapons.mats.poly || M.gun), new THREE.Mesh(hs.strap, M.sleeve));
    else box(g, M.glove, 0.05, 0.075, 0.075);
    return g;
  }
  // a sleeve that runs from the cuff of hand h to its elbow, E from the cuff (in root's space), stretched to reach it
  const _w = new V3(), _d = new V3();
  function sleeveTo(sl, h, E) {
    h.updateWorldMatrix(true, false); _w.copy(WR).applyMatrix4(h.matrixWorld);
    sl.position.copy(_w); _d.copy(E); const len = _d.length();
    sl.quaternion.setFromUnitVectors(ZV, _d.normalize()); sl.scale.set(1, 1, Math.max(0.3, len / 0.3));
  }
  // set group F from its wrist w to its elbow e (its +z), the back of it towards up
  function place(F, w, e, up) {
    const z = new V3().subVectors(e, w).normalize(), x = new V3().crossVectors(up, z).normalize(), y = new V3().crossVectors(z, x);
    F.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); F.position.copy(w); F.userData.base = w.clone();
  }
  // the other forearm, bare and held out to be seen to (gfx.js forearm: the wrist at the origin, along +z to the elbow), the left fist on
  // its wrist turned by twist about the arm; set from its wrist w to its elbow e in the viewmodel's space
  function foreArm(p, w, e, up, twist) {
    const F = new THREE.Group(); p.add(F);
    if (!putG(F, 'forearm')) cyl(F, M.sleeve, 0.04, 0.34, 0, 0, 0.17, HX, 0, 0);
    const h = bareHand(F, false), dl = new V3(-DR.x, DR.y, DR.z);
    h.quaternion.setFromUnitVectors(dl, ZV).premultiply(new QT().setFromAxisAngle(ZV, twist || 0));
    h.position.set(-WR.x, WR.y, WR.z).applyQuaternion(h.quaternion).multiplyScalar(-1).add(new V3(0, 0, 0.012));
    F.userData.hand = h;
    place(F, w, e, up);
    return F;
  }

  // ------------------------------------------------ item models (vm space, ~ real size)
  function buildItem(kind, id) {
    mats();
    const g = new THREE.Group();
    if (kind === 'throw') {
      const gid = id || 'g_frag';
      if (G.GrenFX && G.ITEM_BY_ID[gid]) g.add(G.GrenFX.build(gid, 0.42)); // the same model as the one that flies
      else if (gid === 'g_dyna') { for (let i = 0; i < 3; i++) cyl(g, M.red, 0.016, 0.14, (i - 1) * 0.034, 0); }
      else { sph(g, M.gun, 0.035, 0.045, 0.035); cyl(g, M.steel, 0.012, 0.03, 0, 0.045); box(g, M.steel, 0.006, 0.05, 0.012, 0.02, 0.03, 0, 0, 0, -0.3); }
    } else if (kind === 'bandage') {
      // (the whole roll, its end hanging and pinned: as it is shown. In use it is the roll alone, wound off onto the arm)
      const roll = new THREE.Group(); g.add(roll); if (!putG(roll, 'bandage')) cyl(roll, M.cloth, 0.03, 0.06, 0, 0, 0, 0, 0, HX); g.userData.roll = roll;
    } else if (kind === 'drink') {
      const vs = (G.GFX && G.GFX.VESSEL && G.GFX.VESSEL[id]) || 'phial', tg = putG(g, vs, id);
      if (tg) g.userData.liq = tg.liq || null;
      else { const lm = liqMat(id); cyl(g, M.glass, 0.028, 0.11); g.userData.liq = cyl(g, lm, 0.024, 0.08, 0, -0.012); g.userData.liq.userData.base = 0.08; cyl(g, M.glass, 0.012, 0.04, 0, 0.07); cyl(g, M.cork, 0.013, 0.018, 0, 0.095); }
    } else if (kind === 'inject') {
      // held in the fist, the needle out past the thumb (the shapes are drawn needle down: turned over): a glass syringe, or the kit's syrette
      const s = new THREE.Group(), sy = id === 'h_medkit' ? 0.042 : 0.022; g.add(s); s.rotation.x = Math.PI; s.position.y = sy; g.userData.tip = sy + (id === 'h_medkit' ? 0.0544 : 0.0892);   // (the syrette, short, stands further out of the fist)
      if (id === 'h_medkit') { const tg = putG(s, 'syrette'); if (tg) g.userData.squeeze = tg.squeeze; }
      else {
        const tg = putG(s, 'inject', id);
        if (tg) { const pl = new THREE.Group(); putG(pl, 'plunger'); pl.position.y = 0.028; s.add(pl); g.userData.plunger = pl; g.userData.liq = tg.liq || null; if (tg.liq) tg.liq.scale.y = 0.028 - 0.0062 + 0.0305; }
        else { cyl(s, M.glass, 0.012, 0.12); cyl(s, liqMat(id), 0.01, 0.09, 0, -0.01); cyl(s, M.steel, 0.002, 0.05, 0, -0.085); const pl = cyl(s, M.steel, 0.005, 0.06, 0, 0.09); cyl(s, M.steel, 0.016, 0.004, 0, 0.12); g.userData.plunger = pl; g.userData.old = true; }
      }
    } else if (kind === 'eat') {
      const FG = G.GFX && G.GFX.foeGeo;
      if (id === 'h_apple') { if (!putG(g, 'apple')) { sph(g, M.gold, 0.045, 0.042, 0.045); cyl(g, M.wood, 0.004, 0.025, 0, 0.045); } }
      else if (id === 'h_troll') { if (!putG(g, 'heart')) { sph(g, M.heart, 0.05, 0.06, 0.045); cyl(g, M.heart, 0.012, 0.04, 0.015, 0.05); } }
      else if (id === 'u_berserk') {
        if (FG && FG('cap')) { const c = new THREE.Mesh(FG('cap'), M.shroom); c.scale.set(0.05, 0.045, 0.05); c.position.y = 0.035; g.add(c); const st = new THREE.Mesh(FG('stem'), M.stem); st.scale.set(0.014, 0.055, 0.014); st.position.y = -0.008; g.add(st); g.userData.cap = c; }
        else { const c = sph(g, M.shroom, 0.05, 0.03, 0.05, 0, 0.03); cyl(g, M.stem, 0.016, 0.05, 0, -0.005); g.userData.cap = c; }
      }
      else if (!putG(g, 'herb')) { for (let i = 0; i < 5; i++) { const lf = new THREE.Mesh(PGg().plane, M.green); lf.scale.set(0.03, 0.08, 1); lf.position.set(U.rand(-0.015, 0.015), 0.03, 0); lf.rotation.set(0, i, U.rand(-0.6, 0.6)); g.add(lf); } }
    } else if (kind === 'plate') {
      if (!putG(g, 'plate')) { box(g, M.plate, 0.14, 0.16, 0.012); box(g, M.steel, 0.15, 0.015, 0.014, 0, 0.07); }
    } else {
      // gadgets (shaped in gfx.js: a map, a scroll, a feather, an hourglass, a case of cartridges, a lantern, a whetstone; a coin)
      if (id === 'u_lucky') { const cg = G.GFX && G.GFX.wareGeo ? G.GFX.wareGeo('coin') : null; if (cg) { const c = new THREE.Mesh(cg[0].g, M.gold); c.scale.setScalar(0.3); g.add(c); } else cyl(g, M.gold, 0.025, 0.006, 0, 0, 0, HX); }
      else if (!putG(g, { u_map: 1, u_wind: 1, u_feather: 1, u_sand: 1, u_ammo: 1, u_lantern: 1, u_whet: 1 }[id] ? id : 'device')) { box(g, M.gun, 0.08, 0.06, 0.06); box(g, M.brass, 0.03, 0.02, 0.065, 0, 0.02); }
      if (id === 'u_lantern') sph(g, new THREE.MeshBasicMaterial({ color: 0xc8e4ff }), 0.014, 0.022, 0.014);
      const gl = sph(g, M.glow, 0.001, 0.001, 0.001); g.userData.flash = gl;
    }
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    return g;
  }

  // ------------------------------------------------ playback
  IA.busy = () => !!cur;
  // what is still left of the current motion: [seconds until the effect lands (0 once applied), seconds until the motion ends]
  IA.left = (id) => (cur && (!id || cur.id === id) ? [cur.applied ? 0 : Math.max(0, APPLY[cur.kind] * cur.dur - cur.t), Math.max(0, cur.dur - cur.t)] : null);
  IA.build = (kind, id) => { mats(); return buildItem(kind, id); };
  IA.hand = (p, right) => { mats(); return hand(p, right); };
  // one of gfx.js's item shapes, made of these materials (to show a thing as it lies, apart from its use)
  IA.shape = (name, id) => { mats(); const g = new THREE.Group(); putG(g, name, id); return g; };
  // an item as it is shown in the world - on a shop's stand, lying on the ground - rather than in the hand: its own shape (the kit and
  // the tools have shapes of their own here), grown from its true size by k (between min and max across) or fitted to fit across, its
  // middle at the origin; lie: laid down on its side if it stands taller than it is wide, its foot at y = 0. null for what has none
  const SHOWN = { h_medkit: 'kit', u_hammer: 'smithHammer', u_repair: 'toolRoll' };
  IA.display = function (id, o) {
    mats(); o = o || {};
    const it = G.ITEM_BY_ID[id]; if (!it) return null;
    let m = null;
    try {
      if (it.cat === 'grenade') m = G.GrenFX ? G.GrenFX.build(id, 0.42) : null;
      else if (SHOWN[id]) { m = new THREE.Group(); if (!putG(m, SHOWN[id], id)) m = null; }
      else { const k = LOOK[id] || IA.kindOf(id); if (k !== 'device') m = buildItem(k, id); }
    } catch (e) { m = null; }
    if (!m) return null;
    const wrap = new THREE.Group(), inner = new THREE.Group(); wrap.add(inner); inner.add(m);
    const box = new THREE.Box3().setFromObject(m), sz = box.getSize(new V3()), L = Math.max(sz.x, sz.y, sz.z) || 0.1;
    m.position.sub(box.getCenter(new V3()));
    const s = o.fit ? o.fit / L : Math.min(o.max || 9, Math.max(o.min || 0, L * (o.k || 1))) / L; inner.scale.setScalar(s);
    if (o.lie) {
      if (sz.y > Math.max(sz.x, sz.z) * 1.15) inner.rotation.z = Math.PI / 2;
      inner.rotation.y = o.yaw || 0; wrap.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(inner); inner.position.y -= b2.min.y;
    }
    wrap.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.frustumCulled = true; } });
    return wrap;
  };
  // every item's model once, and the arms they are used with (warmup.js: their shapes and surfaces made behind the loading screen)
  IA.warm = function (p) {
    mats();
    for (const it of G.ITEMS || []) { try { p.add(buildItem(it.cat === 'grenade' ? 'throw' : LOOK[it.id] || IA.kindOf(it.id), it.id)); } catch (e) { /* made when used */ } }
    try { const F = foreArm(p, new V3(0, 0, -1), new V3(0, 0, -0.7), new V3(0, 1, 0), 0); putG(F, 'bandWrap'); putG(F, 'bandRoll'); putG(F.userData.hand, 'kit'); } catch (e) { /* made when used */ }
  };
  // the bandage: the left forearm held out across the view, the right hand winds the roll round it (see bandStep)
  const ELB_R = new V3(0.13, -0.3, 0.2);   // (where the right elbow is from the right wrist: down, out and back)
  function playBandage(c) {
    const F = foreArm(root, new V3(0.1, -0.1, -0.43), new V3(-0.16, -0.21, -0.2), new V3(0, 1, 0.4), -0.35);
    const tw = putG(F, 'bandWrap'), wrap = tw ? tw.wrap : null; if (wrap) wrap.geometry.setDrawRange(0, 0);
    const RH = new THREE.Group(); F.add(RH);
    const spin = new THREE.Group(); RH.add(spin); const roll = new THREE.Group(); spin.add(roll); roll.rotation.z = HX;
    if (!putG(roll, 'bandRoll')) cyl(roll, M.cloth, 0.0185, 0.045, 0, 0, 0, 0, 0, HX);
    const rh = bareHand(RH, true); rh.position.y = -0.058;   // (the roll stands out of the thumb's side of the fist)
    const taut = new THREE.Mesh(new THREE.BufferGeometry(), M.linen); taut.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)); taut.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2)); taut.geometry.setIndex([0, 2, 1, 1, 2, 3]); taut.frustumCulled = false; F.add(taut);
    const sl = new THREE.Group(); root.add(sl); if (!putG(sl, 'sleeveArm')) { const a = cyl(sl, M.sleeve, 0.038, 0.3, 0, 0, 0.15); a.rotation.x = HX; }
    const part = wrap && wrap.userData.part, BD = (G.GFX && G.GFX.BAND) || { R: 0.0185, W: 0.045, K: 25 };
    c.b = { F, wrap, RH, spin, roll, rh, taut, sl, path: part ? part.path : null, seg: part ? part.seg : 0, Ltot: part ? part.L : 0.5, W: part ? part.W : BD.W, R: BD.R, K: BD.K, rest: new V3(0.2, -0.13, 0.13) };
    for (const o of [F, sl]) o.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; } });
    c.fore = F;
  }
  // the dose: the left forearm held out (the kit hanging by its strap from the fist, for the kit's syrette), the right hand brings the
  // needle in from above and puts it in the top of the forearm (see jabStep)
  function playInject(c) {
    const F = foreArm(root, new V3(-0.075, -0.11, -0.46), new V3(-0.32, -0.27, -0.2), new V3(-0.15, 1, 0.3), c.id === 'h_medkit' ? -1.2 : -0.4);
    if (c.id === 'h_medkit') {
      const pouch = new THREE.Group(); F.userData.hand.add(pouch); putG(pouch, 'kit');
      // (it hangs straight down from the fist, its face to the eye)
      F.updateMatrixWorld(true); const hq = new QT(); F.userData.hand.getWorldQuaternion(hq);
      const want = new QT().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(0.94, 0, -0.34), new V3(0, 1, 0), new V3(0.34, 0, 0.94)));
      pouch.quaternion.copy(hq.invert().multiply(want));
    }
    F.traverse((m) => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = false; } });
    c.fore = F;
    // where the needle goes in: the top of the forearm, a third of the way to the elbow; it comes down into it from above and to the right
    const z = 0.085, a = HX - 0.2, r = G.GFX && G.GFX.armR ? G.GFX.armR(z, a) : 0.03;
    c.j = { T: new V3(Math.cos(a) * r, Math.sin(a) * r, z), D: new V3(-0.72, -0.55, -0.3).normalize() };
  }
  IA.play = function (kind, id, onApply, onDone) {
    if (cur || !G.weapons.vmRoot) return false;
    mats();
    if (!root) { root = new THREE.Group(); G.weapons.vmScene.add(root); }
    const vis = LOOK[id] || kind;
    const g = new THREE.Group(); root.add(g);
    const item = vis === 'bandage' ? new THREE.Group() : buildItem(vis, id); g.add(item);
    const BS = vis === 'throw' ? 1.3 : vis === 'inject' ? 1.35 : 1.5; item.scale.setScalar(BS); item.userData.bs = BS;
    const rightHanded = vis === 'throw' || vis === 'inject' || vis === 'device';
    let h = null;
    if (vis !== 'bandage') { h = hand(g, rightHanded); h.position.set(rightHanded ? 0.005 : -0.005, -0.04, 0.02); }
    if (vis === 'inject') { h.position.set(0, 0, 0); item.position.set(0, 0, 0); }
    if (h && (vis === 'drink' || vis === 'eat')) h.userData.arm.scale.z = 0.4;
    cur = { kind, vis, id, t: 0, dur: DUR[kind] * (kind === 'bandage' && P().has && P().has('d_healboost') ? 0.85 : 1), applied: false, onApply, onDone, g, item, fore: null };
    if (vis === 'bandage') playBandage(cur);
    if (vis === 'inject') playInject(cur);
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    if (vis === 'drink') G.sfx.mech('click', 0, 0.6);
    if (vis === 'bandage') G.sfx.whoosh(0.5, 0.25);
    if (vis === 'plate') G.sfx.mech('magOut', 0, 0.8);
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
    drink: [[0, -0.12, -0.24, -0.34, 0, 0, 0], [0.3, -0.02, -0.04, -0.3, 0.6, 0, -0.1], [0.72, 0, 0.0, -0.28, 1.6, 0, -0.1], [1, -0.12, -0.28, -0.3, 0.2, 0, 0]],
    eat: [[0, -0.1, -0.26, -0.35, 0, 0, 0], [0.38, -0.01, -0.03, -0.29, 0.3, 0, 0], [0.68, -0.01, -0.04, -0.29, 0.3, 0, 0], [1, -0.1, -0.31, -0.32, 0, 0, 0]],
    plate: [[0, -0.18, -0.24, -0.34, 0, 0.3, 0], [0.35, -0.02, -0.02, -0.32, -0.3, 0, 0], [0.7, 0, -0.24, -0.2, -1.2, 0, 0], [1, -0.05, -0.41, -0.2, -1.2, 0, 0]],
    device: [[0, 0.14, -0.26, -0.35, 0, 0, 0], [0.38, 0.02, 0.04, -0.36, 0.2, 0.5, 0], [0.62, 0.02, 0.05, -0.36, 0.2, 2.2, 0], [1, 0.14, -0.31, -0.35, 0, 0, 0]],
  };
  // ---- the bandage wound on. Its timing: 0 - 0.15 the arm comes up and the roll to its wrist; to 0.8 the roll goes round the arm, the
  // cloth coming off it onto the arm turn by turn (the roll spins, grows less, the cloth between them taut); at 0.82 (the effect) the end is
  // torn and tucked in; then the hand goes and the arm goes down
  const NZ = new V3(0, 0, -1), _P = new V3(), _N = new V3(), _T = new V3(), _C = new V3(), _X = new V3(), _Z = new V3(), _m = new THREE.Matrix4(), _q = new QT(), _q2 = new QT();
  function bandStep(c, k) {
    const B = c.b; if (!B.path) return;
    const n = B.path.length - 1, s = U.clamp((k - 0.15) / 0.65, 0, 1), f = s * n, i0 = Math.min(n - 1, Math.floor(f)), t = f - i0, A = B.path[i0], Z = B.path[i0 + 1];
    const l = (j) => A[j] + (Z[j] - A[j]) * t;
    _P.set(l(0), l(1), l(2)); _N.set(l(3), l(4), l(5)).normalize(); _T.set(l(6), l(7), l(8)).normalize();
    if (B.wrap) B.wrap.geometry.setDrawRange(0, (k >= 0.8 ? n : Math.round(f)) * B.seg);
    const kr = 1 - 0.32 * s, rr = B.R * kr;
    _C.copy(_P).addScaledVector(_N, rr + 0.003).addScaledVector(_T, 0.028);
    // (the hand's frame: its back ahead of the roll the way it goes round and a little out from the arm, its grip along the arm with its
    // wrist to the elbow's side, so that its forearm comes from where the shoulder is)
    _X.copy(_T).addScaledVector(_N, 0.35); _Z.crossVectors(_X, NZ).normalize(); _X.crossVectors(NZ, _Z).normalize(); _m.makeBasis(_X, NZ, _Z); _q.setFromRotationMatrix(_m);
    let w = 1; if (k < 0.15) w = ease(k / 0.15); else if (k > 0.8) w = 1 - ease(Math.min(1, (k - 0.8) / 0.14));
    _q2.setFromEuler(new THREE.Euler(0.3, 0.2, -0.6));
    B.RH.position.lerpVectors(B.rest, _C, w); B.RH.quaternion.slerpQuaternions(_q2, _q, w);
    if (k > 0.8) B.RH.position.addScaledVector(_N, (1 - w) * 0.05);
    B.spin.rotation.y = -s * B.Ltot / B.R; B.roll.scale.set(1, kr, kr);
    // the cloth from the last of what is on to the roll, pulled straight
    const show = s > 0.002 && k < 0.82; B.taut.visible = show;
    if (show) {
      const ps = B.taut.geometry.attributes.position, hw = B.W / 2, q = _C.clone().addScaledVector(_N, -rr);
      ps.setXYZ(0, _P.x, _P.y, _P.z - hw); ps.setXYZ(1, _P.x, _P.y, _P.z + hw); ps.setXYZ(2, q.x, q.y, q.z - hw); ps.setXYZ(3, q.x, q.y, q.z + hw); ps.needsUpdate = true;
      const uv = B.taut.geometry.attributes.uv, len = _P.distanceTo(q) * B.K; uv.setXY(2, len, 0); uv.setXY(3, len, B.W * B.K); uv.setXY(1, 0, B.W * B.K); uv.needsUpdate = true;
      B.taut.geometry.computeVertexNormals();
    }
    sleeveTo(B.sl, B.rh, ELB_R);
  }
  // ---- the dose. 0 - 0.3 the hand comes in over the arm; to 0.38 the needle goes in; to 0.65 the dose is given (the plunger goes down,
  // the tube is squeezed flat); then out, and away
  const _Tw = new V3(), _Dw = new V3(), _pIn = new V3(), _pNear = new V3(), _qIn = new QT(), _qRest = new QT().setFromEuler(new THREE.Euler(0.5, 0.6, -0.9)), _pRest = new V3(0.26, -0.34, -0.3), SLV_R = new V3(0.85, -0.45, 0.3).normalize();
  function jabStep(c, k) {
    const J = c.j, F = c.fore, g = c.g; F.updateMatrixWorld(true);
    _Tw.copy(J.T).applyMatrix4(F.matrixWorld); _Dw.copy(J.D);
    // (the needle out along the hand's +y, the way it goes in; the hand turned about it so that its forearm runs back, down and out to the
    // right, towards where the shoulder is)
    const Y = _Dw, Wv = SLV_R.clone().addScaledVector(Y, 0.55), Zw = Wv.addScaledVector(Y, -Wv.dot(Y)).normalize(), Xw = new V3().crossVectors(Y, Zw);
    _qIn.setFromRotationMatrix(_m.makeBasis(Xw, Y, Zw));
    const tip = (c.item.userData.tip || 0.12) * c.item.userData.bs;
    _pIn.copy(_Tw).addScaledVector(_Dw, 0.006 - tip); _pNear.copy(_pIn).addScaledVector(_Dw, -0.07);
    let a, b, u, qa = _qIn, qb = _qIn;
    if (k < 0.3) { a = _pRest; b = _pNear; u = ease(k / 0.3); qa = _qRest; }
    else if (k < 0.38) { a = _pNear; b = _pIn; u = ease((k - 0.3) / 0.08); }
    else if (k < 0.65) { a = _pIn; b = _pIn; u = 0; }
    else if (k < 0.78) { a = _pIn; b = _pNear; u = ease((k - 0.65) / 0.13); }
    else { a = _pNear; b = _pRest; u = ease((k - 0.78) / 0.22); qb = _qRest; }
    g.position.lerpVectors(a, b, u); g.quaternion.slerpQuaternions(qa, qb, u);
    const pk = U.clamp((k - 0.4) / 0.24, 0, 1), ud = c.item.userData;
    if (ud.plunger) {
      if (ud.old) ud.plunger.position.y = 0.09 - pk * 0.07;
      else { ud.plunger.position.y = 0.028 - pk * 0.052; if (ud.liq) ud.liq.scale.y = Math.max(0.001, ud.plunger.position.y - 0.0062 + 0.0305); }
    }
    if (ud.squeeze) ud.squeeze.scale.z = 1 - pk * 0.72;
  }
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
  function drop(c) { root.remove(c.g); if (c.fore) root.remove(c.fore); if (c.b && c.b.sl) root.remove(c.b.sl); }
  IA.update = function (dt) {
    const holding = G.GrenHold && G.GrenHold.active();
    const searching = !!(G.game && G.game.search) && !cur;
    IA.lower = U.damp(IA.lower, cur || holding || searching ? 1 : 0, cur || holding || searching ? 14 : 8, dt);
    rummage(dt, searching);
    if (!cur) return;
    const c = cur;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur), v = c.vis;
    if (v === 'inject') jabStep(c, k);
    else if (v !== 'bandage') { const p = path(PATHS[v], k); c.g.position.set(p[0], p[1], p[2]); c.g.rotation.set(p[3], p[4], p[5]); }
    // per-kind flourishes
    if (v === 'drink' && c.item.userData.liq && k > 0.45 && k < 0.75) { const lq = c.item.userData.liq; lq.scale.y = (lq.userData.base || 1) * Math.max(0.02, 1 - (k - 0.45) / 0.3); }
    if (v === 'eat' && k > 0.38 && k < 0.68) { const s = 1 - (k - 0.38) / 0.3 * 0.55; c.item.scale.setScalar(s * c.item.userData.bs); }
    if (v === 'plate' && k > 0.6) c.item.scale.setScalar(c.item.userData.bs * Math.max(0.01, 1 - (k - 0.6) * 2.5));
    if (v === 'device' && c.item.userData.flash) { const fk = Math.max(0, 1 - Math.abs(k - 0.5) * 8); c.item.userData.flash.scale.setScalar(0.001 + fk * 0.05); }
    if (v === 'throw' && k > 0.45) c.item.visible = false;
    // the other arm comes up into view and goes down again
    if (c.fore) { const fk = k < 0.15 ? ease(k / 0.15) : k > 0.86 ? ease(Math.max(0, (1 - k) / 0.14)) : 1, b = c.fore.userData.base; c.fore.position.set(b.x, b.y - (1 - fk) * 0.32, b.z + (1 - fk) * 0.05); }
    if (v === 'bandage') bandStep(c, k);
    if (!c.applied && k >= APPLY[c.kind]) {
      c.applied = true;
      if (v === 'drink') G.sfx.drink && G.sfx.drink();
      if (v === 'eat') G.sfx.melee && G.sfx.melee(false);
      if (v === 'inject') G.sfx.mech('click', 0, 1);
      if (v === 'plate') G.sfx.mech('magIn', 0, 1);
      try { c.onApply && c.onApply(); } catch (e) { console.error(e); }
    }
    if (k >= 1) {
      drop(c);
      cur = null;
      c.onDone && c.onDone();
    }
  };
  // drop whatever is being used WITHOUT applying it (a revive puts the inventory back as it was)
  IA.abort = function () { if (!cur) return; drop(cur); cur = null; };
  IA.cancel = function () { if (!cur) return; if (!cur.applied && cur.onApply) { try { cur.onApply(); } catch (e) { console.error(e); } } drop(cur); cur = null; };
})();
