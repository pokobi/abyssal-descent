'use strict';
// ---------------------------------------------------------------------------------------------------------------------------
// Warm-up: everything the GPU / browser would otherwise do for the first time in the middle of play.
//  * G.Warm.world()  - right after a new area is built (it runs behind the black fade): compile every shader the area uses and
//    upload its textures, so the first visible frame does not stall for 0.3 - 2 seconds.
//  * G.Warm.boot()   - once, behind the loading screen: the same for the title scene, the first-person weapon scene, the hands /
//    item models, the inventory's 3D weapon previews and the inventory screen's first layout.
// Nothing here changes what is drawn; it only moves work to a moment where nobody is looking.
// ---------------------------------------------------------------------------------------------------------------------------
(function () {
  const W = (G.Warm = { log: false });
  const TEXKEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'];
  const now = () => performance.now();

  function uploadTextures(root, renderer) {
    const seen = new Set();
    root.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) for (const k of TEXKEYS) { const t = m[k]; if (t && t.isTexture && !seen.has(t) && t.image) { seen.add(t); try { renderer.initTexture(t); } catch (e) { /* ignore */ } } }
      if (o.isMesh && o.material && o.material.uniforms) for (const u of Object.values(o.material.uniforms)) { const t = u && u.value; if (t && t.isTexture && !seen.has(t) && t.image) { seen.add(t); try { renderer.initTexture(t); } catch (e) { /* ignore */ } } }
    });
    return seen.size;
  }

  W.world = function () {
    const r = G.renderer, sc = G.scene, cam = G.camera;
    if (!r || !sc || !cam) return;
    const t0 = now();
    try {
      sc.updateMatrixWorld(true);
      if (G.fx && G.fx.withWarm) G.fx.withWarm(() => r.compile(sc, cam)); else r.compile(sc, cam);
      const n = uploadTextures(sc, r);
      if (W.log) console.log('[warm] world', (now() - t0).toFixed(0) + 'ms', n + ' textures');
    } catch (e) { console.warn('warm world failed', e); }
  };

  // The same, but WITHOUT blocking the page: the driver compiles in parallel (KHR_parallel_shader_compile) and we just wait.
  // Never waits longer than `limit` ms; resolves either way.
  W.worldAsync = function (limit) {
    const r = G.renderer, sc = G.scene, cam = G.camera;
    if (!r || !sc || !cam) return Promise.resolve();
    const t0 = now();
    try { sc.updateMatrixWorld(true); if (G.fx && G.fx.withWarm) G.fx.withWarm(() => r.compile(sc, cam)); else r.compile(sc, cam); uploadTextures(sc, r); } catch (e) { console.warn('warm world failed', e); return Promise.resolve(); }
    const tc = now() - t0;
    // compile() only starts the links; the page used to block on them at the first draw. Wait for the drivers here instead (polling, not blocking).
    return new Promise((resolve) => {
      const deadline = now() + (limit || 3500);
      const tick = () => {
        let pending = false;
        const ps = r.info.programs || [];
        for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (p && p.isReady && !p.isReady()) { pending = true; break; } }
        if (!pending || now() > deadline) { if (G.Perf && G.Perf.note) G.Perf.note(`シェーダー準備 ${Math.round(now() - t0)}ms（呼び出し ${Math.round(tc)}ms）${pending ? ' 時間切れ' : ''}`); resolve(); }
        else setTimeout(tick, 8);
      };
      tick();
    });
  };
  // one model of every enemy kind, parked far below the world, so every shader they need exists before the first fight
  W.enemyModels = function () {
    const sc = G.scene, tmp = enemyGroup(); if (!sc || !tmp) return null;
    sc.add(tmp);
    return tmp;
  };
  function enemyGroup() {
    if (!G.enemies || !G.enemies.buildModel || !G.ENEMIES) return null;
    const tmp = new THREE.Group(); tmp.position.set(0, -800, 0);
    const seen = new Set();
    for (const d of G.ENEMIES) { const k = d.plan + '|' + d.variant; if (seen.has(k)) continue; seen.add(k); try { tmp.add(G.enemies.buildModel(d, { scale: 1 }).group); } catch (e) { /* ignore */ } }
    if (G.GrenFX) for (const it of G.ITEMS || []) if (it.cat === 'grenade') { try { tmp.add(G.GrenFX.build(it.id)); } catch (e) { /* ignore */ } } // every throwable's materials, so the first throw doesn't stall
    return tmp;
  }

  // What only turns up later in an area, as samples parked far below the world while the area's shaders are made (game.js enterArea):
  // the highlight on a searchable body / chest, the shop's stands with each kind of ware (and a gun of each kind, a melee weapon of each
  // kind), the healing basin and its hint, one model of every enemy kind. Without them the first of each to appear in play made the
  // page wait for its shader on the spot (0.1 - 0.5 s here, up to a second on a machine whose driver compiles slowly: the first
  // foe searched, the first mini shop). The enemies are built once a session; the rest each area (it uses the area's own materials).
  W.lateKit = function () {
    const w = G.world, GM = G.game; if (!w || !w.mats || !GM) return null;
    const kit = new THREE.Group(); kit.name = 'warmKit'; kit.position.set(0, -800, 0);
    const add = (fn) => { try { const o = fn(); if (o) kit.add(o); } catch (e) { if (W.log) console.warn('warm kit', e); } };
    if (!W._enemies) W._enemies = enemyGroup();
    if (W._enemies) { W._enemies.position.set(0, 0, 0); kit.add(W._enemies); }
    if (G.Inv && G.Inv.lookSample) add(() => G.Inv.lookSample());
    // the shop's own stands, built into a stand-in world (no colliders, no lights or pointers left in the real one)
    if (GM.buildPedestal) {
      const fake = { group: new THREE.Group(), mats: w.mats, lightSources: [] }, slot = { x: 0, y: 0, z: 0 };
      const stand = (kind, obj) => { if (!obj || !obj.rarity) return; try { GM.buildPedestal({ kind, obj, price: 100, slot, lv: 0 }, fake); } catch (e) { if (W.log) console.warn('warm stand', kind, e); } };
      const one = (list, key) => { const seen = new Set(), out = []; for (const x of list || []) { const k = x[key]; if (k == null || seen.has(k)) continue; seen.add(k); out.push(x); } return out; };
      for (const d of one((G.WEAPONS || []).filter((x) => x.id !== 'starter'), 'arch')) stand('weapon', d);
      for (const d of one(G.MELEE, 'mcat')) stand('melee', d);
      stand('armor', (G.ARMOR || [])[0]); stand('relic', (G.BUFFS || []).find((b) => b.cat === 'relic'));
      stand('revive', GM.REVIVE); stand('skill', (G.SKILLS || [])[0]); stand('ult', (G.ULTS || [])[0]);
      stand('attachment', (G.ATTACHMENTS || [])[0]); stand('forge', GM.SVC_FORGE); stand('tome', GM.SVC_TOME);
      stand('item', (G.ITEMS || []).find((x) => x.cat === 'grenade')); stand('item', (G.ITEMS || []).find((x) => x.cat !== 'grenade'));
      stand('buff', (G.BUFFS || []).find((b) => b.cat !== 'relic' && b.cat !== 'curse' && b.cat !== 'pact'));
      kit.add(fake.group);
    }
    // a chest left closed when the area is cleared: its beam, ring and ripple (game.js, seen through walls; a see-through two-sided
    // material is drawn back then front: two shaders each)
    add(() => {
      const g = new THREE.Group(), c = 0xffe0a0, base = { color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide };
      g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 11, 12, 1, true), new THREE.MeshBasicMaterial(Object.assign({ fog: false }, base))));
      g.add(new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), new THREE.MeshBasicMaterial(Object.assign({}, base))));
      return g;
    });
    // the healing basin's water and the hint drawn round it when you are hurt (game.js updateHealHint)
    add(() => {
      const g = new THREE.Group(), PG = G.Props.PG, c = 0x60ff90;
      g.add(new THREE.Mesh(PG.cyl, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
      g.add(new THREE.Mesh(PG.oct, new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false })));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 8, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
      g.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })));
      return g;
    });
    return kit;
  };
  W.bootAsync = async function () {
    const r = G.renderer; if (!r) return;
    const t0 = now();
    const tmp = W.enemyModels();
    try { await W.worldAsync(8000); } catch (e) { /* ignore */ }
    if (tmp) { G.scene.remove(tmp); }
    try { warmViewmodel(r); } catch (e) { /* ignore */ }
    try { if (G.Icons && G.Icons.warm) G.Icons.warm(); } catch (e) { /* ignore */ }
    try { if (G.PStatus && G.PStatus.warm) G.PStatus.warm(); } catch (e) { /* ignore */ }
    try { if (G.StatusUI && G.StatusUI.warm) G.StatusUI.warm(); } catch (e) { /* ignore */ }
    if (W.log) console.log('[warm] bootAsync', (now() - t0).toFixed(0) + 'ms');
  };

  // the first-person scene: current gun, hands, and one of each item model (they share materials, so a few are enough)
  function warmViewmodel(r) {
    const Wp = G.weapons;
    if (!Wp || !Wp.vmScene || !Wp.vmCam) return;
    const tmp = new THREE.Group(); Wp.vmScene.add(tmp);
    try {
      const guns = Object.values(G.WEAPON_ARCH || {}).length ? [G.WEAPON_BY_ID.starter, G.WEAPON_BY_ID.a_ranger, G.WEAPON_BY_ID.g_breacher, G.WEAPON_BY_ID.n_longbow, G.WEAPON_BY_ID.k_bastion, G.WEAPON_BY_ID.f_scorch] : [];
      for (const d of guns) if (d) { try { tmp.add(Wp.displayModel(d, { optic: 'o_4x', muzzle: 'm_supp', under: 'u_laser' })); } catch (e) { /* ignore */ } }
      // every sight once (their glass, their glowing stones, the open hoods seen from inside are shaders of their own)
      if (G.WEAPON_BY_ID.n_scout) for (const a of G.ATTACHMENTS || []) if (a.slot === 'optic') { try { tmp.add(Wp.displayModel(G.WEAPON_BY_ID.n_scout, { optic: a.id })); } catch (e) { /* ignore */ } }
      if (G.MELEE && G.MELEE[0]) { try { tmp.add(Wp.meleeDisplayModel(G.MELEE[0])); } catch (e) { /* ignore */ } }
      if (G.ItemAnim) for (const k of ['throw', 'bandage', 'drink', 'inject', 'eat', 'plate', 'device']) { try { tmp.add(G.ItemAnim.build(k, null)); } catch (e) { /* ignore */ } }
      if (G.GrenFX) for (const it of G.ITEMS || []) if (it.cat === 'grenade') { try { tmp.add(G.GrenFX.build(it.id, 0.42)); } catch (e) { /* ignore */ } }
      if (G.ItemAnim) { try { const h = new THREE.Group(); G.ItemAnim.hand(h, true); tmp.add(h); } catch (e) { /* ignore */ } }
      // see-through hands and gun (影の舞, the invisibility draught: pstatus.js ghostMesh): their shader variants, once
      if (G.PStatus && G.PStatus.ghostWarm && Wp.buildGun && G.WEAPON_BY_ID.n_scout) { try { const gm = Wp.buildGun(G.WEAPON_BY_ID.n_scout, {}, true).group; G.PStatus.ghostWarm(gm); tmp.add(gm); } catch (e) { /* ignore */ } }
      Wp.vmScene.updateMatrixWorld(true);
      r.compile(Wp.vmScene, Wp.vmCam);
      uploadTextures(Wp.vmScene, r);
    } catch (e) { console.warn('warm viewmodel failed', e); }
    Wp.vmScene.remove(tmp);
    tmp.traverse((o) => { if (o.geometry && !o.geometry._shared && o.geometry.dispose && !o.userData.keepGeo) { /* geometries are small and shared with the pool; leave them */ } });
  }

  W.boot = function () {
    const r = G.renderer; if (!r) return;
    const t0 = now();
    try { W.world(); } catch (e) { /* ignore */ }
    try { warmViewmodel(r); } catch (e) { /* ignore */ }
    try { if (G.Icons && G.Icons.warm) G.Icons.warm(); } catch (e) { /* ignore */ }
    try { if (G.PStatus && G.PStatus.warm) G.PStatus.warm(); } catch (e) { /* ignore */ }
    try { if (G.StatusUI && G.StatusUI.warm) G.StatusUI.warm(); } catch (e) { /* ignore */ }
    if (W.log) console.log('[warm] boot', (now() - t0).toFixed(0) + 'ms');
  };

  // the inventory screen: build it once, off-screen and silent, so the first real opening has its styles / fonts / layout ready
  W.ui = function () {
    const UIV = G.InvUI; if (!UIV || !UIV.warm) return;
    try { UIV.warm(); } catch (e) { console.warn('warm ui failed', e); }
  };
})();
