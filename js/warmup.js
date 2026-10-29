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
    const sc = G.scene; if (!sc || !G.enemies || !G.enemies.buildModel || !G.ENEMIES) return null;
    const tmp = new THREE.Group(); tmp.position.set(0, -800, 0);
    const seen = new Set();
    for (const d of G.ENEMIES) { const k = d.plan + '|' + d.variant; if (seen.has(k)) continue; seen.add(k); try { tmp.add(G.enemies.buildModel(d, { scale: 1 }).group); } catch (e) { /* ignore */ } }
    if (G.GrenFX) for (const it of G.ITEMS || []) if (it.cat === 'grenade') { try { tmp.add(G.GrenFX.build(it.id)); } catch (e) { /* ignore */ } } // every throwable's materials, so the first throw doesn't stall
    sc.add(tmp);
    return tmp;
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
      if (G.MELEE && G.MELEE[0]) { try { tmp.add(Wp.meleeDisplayModel(G.MELEE[0])); } catch (e) { /* ignore */ } }
      if (G.ItemAnim) for (const k of ['throw', 'bandage', 'drink', 'inject', 'eat', 'plate', 'device']) { try { tmp.add(G.ItemAnim.build(k, null)); } catch (e) { /* ignore */ } }
      if (G.GrenFX) for (const it of G.ITEMS || []) if (it.cat === 'grenade') { try { tmp.add(G.GrenFX.build(it.id, 0.42)); } catch (e) { /* ignore */ } }
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
