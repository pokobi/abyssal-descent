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
      r.compile(sc, cam);
      const n = uploadTextures(sc, r);
      if (W.log) console.log('[warm] world', (now() - t0).toFixed(0) + 'ms', n + ' textures');
    } catch (e) { console.warn('warm world failed', e); }
  };

  // the first-person scene: current gun, hands, and one of each item model (they share materials, so a few are enough)
  function warmViewmodel(r) {
    const Wp = G.weapons;
    if (!Wp || !Wp.vmScene || !Wp.vmCam) return;
    const tmp = new THREE.Group(); Wp.vmScene.add(tmp);
    try {
      const guns = Object.values(G.WEAPON_ARCH || {}).length ? [G.WEAPON_BY_ID.starter, G.WEAPON_BY_ID.a_ranger, G.WEAPON_BY_ID.g_breacher, G.WEAPON_BY_ID.n_longbow, G.WEAPON_BY_ID.k_bastion, G.WEAPON_BY_ID.f_scorch] : [];
      for (const d of guns) if (d) { try { tmp.add(Wp.displayModel(d, { optic: 'o_4x', muzzle: 'm_supp', under: 'u_laser' })); } catch (e) { /* ignore */ } }
      if (G.MELEE && G.MELEE[0]) { try { tmp.add(Wp.meleeDisplayModel(G.MELEE[0])); } catch (e) { /* ignore */ } }
      if (G.ItemAnim) for (const k of ['throw', 'bandage', 'drink', 'inject', 'eat', 'plate', 'device']) { try { tmp.add(G.ItemAnim.build(k, null)); } catch (e) { /* ignore */ } }
      if (G.ItemAnim) { try { const h = new THREE.Group(); G.ItemAnim.hand(h, true); tmp.add(h); } catch (e) { /* ignore */ } }
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
    try { if (G.StatusUI && G.StatusUI.warm) G.StatusUI.warm(); } catch (e) { /* ignore */ }
    if (W.log) console.log('[warm] boot', (now() - t0).toFixed(0) + 'ms');
  };

  // the inventory screen: build it once, off-screen and silent, so the first real opening has its styles / fonts / layout ready
  W.ui = function () {
    const UIV = G.InvUI; if (!UIV || !UIV.warm) return;
    try { UIV.warm(); } catch (e) { console.warn('warm ui failed', e); }
  };
})();
