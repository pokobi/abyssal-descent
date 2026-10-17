'use strict';
// Orchestration: renderer, area flow (normal / shop / boss), objectives & waves, shop & chests, buff choices, main loop.
(function () {
  const GM = (G.game = { state: 'loading', time: 0, timeScale: 1, enemyTimeScale: 1, area: 1, seed: 0, run: null, objective: null, chronoT: 0, chronoSlow: 0.4 });
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const LIGHT_K = 6;
  let renderer, scene, camera, hemi, amb, moon, P;
  let last = performance.now(), fpsAcc = 0, fpsN = 0;

  // ---------------- boot ----------------
  async function boot() {
    const ldFill = document.getElementById('ld-fill'), ldText = document.getElementById('ld-text');
    if (!window.THREE) { ldText.textContent = '⚠ Three.js を読み込めませんでした（インターネット接続を確認してください）'; return; }
    G.initTmp();
    ldText.textContent = 'テクスチャを生成中…';
    await G.Tex.init((k) => { ldFill.style.width = Math.round(k * 80) + '%'; });
    G.Props.init();
    ldText.textContent = 'レンダラを初期化中…';
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    document.getElementById('canvas-wrap').appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.ui.toast('⚠ グラフィックスコンテキストが失われました。ページを再読み込みしてください。', 'warn'); });
    G.renderer = renderer;
    scene = G.scene = new THREE.Scene();
    camera = G.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    hemi = new THREE.HemisphereLight(0x8080a0, 0x302018, 0.55); scene.add(hemi);
    amb = new THREE.AmbientLight(0x504840, 0.35); scene.add(amb);
    moon = new THREE.DirectionalLight(0xa8b8d8, 1.0);
    moon.castShadow = true; moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
    scene.add(moon, moon.target);
    G.LightPool.init(scene);
    G.envTex = G.Tex.makeEnv(renderer);
    scene.environment = G.envTex;
    scene.fog = new THREE.FogExp2(0x15110e, 0.02);
    GM.lights = { hemi, amb, moon };
    P = G.player = new G.Player();
    G.fx.init(scene, camera);
    G.weapons.init(renderer); G.weapons.setEnv(G.envTex);
    G.avatar.init(scene);
    G.combat.init(); G.enemies.init(); G.Areas.init(); G.Depth.init(); G.Rooms2.init(); G.MidSave.init(); Object.assign(G.Areas.TYPES, G.Rooms2.TYPES); G.abilities.init(); G.bosses.init(); G.ui.init(); G.bindBuffs(); G.Dev && G.Dev.init();
    I.el = renderer.domElement;
    renderer.domElement.addEventListener('click', () => { if (GM.state === 'playing' && !I.locked) I.requestLock(); });
    G.on('lockchange', onLock);
    G.on('lockerror', () => { if (GM.debug) return; if (GM.state === 'paused' || GM.state === 'resuming' || GM.state === 'playing') { GM.state = 'paused'; G.ui.clickToResume(); } });
    window.addEventListener('resize', onResize); onResize();
    document.addEventListener('visibilitychange', () => { if (document.hidden && GM.state === 'playing') pause(); if (document.hidden) G.sfx.suspend(); else G.sfx.resume(); });
    window.addEventListener('keydown', (e) => {
      // Tab and B open the same screen: gear, bag, weapons + attachments and the full status sheet side by side
      // (also right after closing it: the "click to resume" wait must not swallow the key)
      const invReady = () => GM.state === 'playing' || GM.state === 'resuming' || (GM.state === 'paused' && !!document.querySelector('#screens .clicklock'));
      if ((G.BIND.status.includes(e.code) || G.BIND.inventory.includes(e.code)) && invReady()) { e.preventDefault(); if (!e.repeat && G.InvUI && !G.InvUI.isOpen()) { if (GM.state !== 'playing') { GM.state = 'playing'; G.ui.clearScreen(); } G.InvUI.open(null); } return; }
      if (e.code === 'Escape' && (GM.state === 'buff')) e.preventDefault();
      // I = pause menu toggle (Esc sometimes gets swallowed by the browser while the pointer is locked)
      if (e.code === 'KeyI' && !e.repeat && !(e.target && e.target.tagName === 'INPUT')) {
        if (GM.state === 'playing') { e.preventDefault(); GM.state = 'paused'; I.exitLock(); G.ui.statusOverlay(false); G.ui.pause(); }
        else if (GM.state === 'paused') { e.preventDefault(); GM.resume(); }
      }
    });
    GM.applyQuality();
    ldFill.style.width = '100%';
    ldText.textContent = '準備完了';
    GM.toTitle();
    ldText.textContent = '描画を準備中…';
    await new Promise((r) => setTimeout(r, 30));
    if (G.Warm) G.Warm.boot(); // title world shaders, viewmodel, previews: behind the loading screen
    setTimeout(() => document.getElementById('loading').classList.add('done'), 300);
    requestAnimationFrame(frame);
  }
  GM.applyQuality = function () {
    const q = G.save.data.settings.quality;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.5 : q === 'med' ? 1.15 : 0.85));
    renderer.shadowMap.enabled = q !== 'low';
    moon.castShadow = q !== 'low';
    const sz = q === 'high' ? 2048 : 1024;
    if (moon.shadow.mapSize.x !== sz) { moon.shadow.mapSize.set(sz, sz); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }
    scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => m.needsUpdate = true); } });
    onResize();
  };
  function onResize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    G.weapons.resize(camera.aspect);
  }

  // ---------------- world setup ----------------
  function setWorld(w) {
    GM.dawn = null; GM.deathFrozen = false; liftHint = false; GM.search = null; if (G.InvUI) G.InvUI.close(); G.Inv.reset(); GM.healHint = false;
    if (G.world) G.world.dispose(scene);
    G.combat.clear(); G.enemies.clear(); G.bosses.clear(); G.fx.clear();
    G.LightPool.reset();
    G.world = w;
    w.finalize(scene, G.save.data.settings.quality);
    const B = w.envOverride ? Object.assign({}, w.mats.biome, w.envOverride) : w.mats.biome;
    scene.fog.color.set(B.fog); scene.fog.density = B.fogD;
    scene.background = new THREE.Color(B.fog);
    G.fx.setFog(B.fog, B.fogD);
    hemi.color.set(B.hemiS); hemi.groundColor.set(B.hemiG); hemi.intensity = 0.75 + B.amb * 0.6;
    amb.color.set(B.hemiS); amb.intensity = B.amb * 1.3;
    moon.color.set(B.moon); moon.intensity = 1.1 * B.moonI;
    const cx = w.W / 2, cz = w.D / 2, R = Math.max(w.W, w.D) * 0.62;
    if (B.sunDir) moon.position.set(cx + B.sunDir[0] * 70, Math.max(25, B.sunDir[1] * 70), cz + B.sunDir[2] * 70);
    else moon.position.set(cx + 18, 60, cz + 26);
    moon.target.position.set(cx, 0, cz); moon.target.updateMatrixWorld();
    setSky(B);
    const sc = moon.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 140; sc.updateProjectionMatrix();
    G.abilities.rebuildVisuals();
  }

  // open-air stages get a gradient sky dome with a sun disc; dungeons keep the fogged void
  let skyDome = null;
  function setSky(B) {
    if (skyDome) { scene.remove(skyDome); skyDome.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); skyDome = null; }
    if (!B.outdoor) return;
    const c = (h) => new THREE.Color(h);
    const sd = new THREE.Vector3(...B.sunDir).normalize();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { top: { value: c(B.sky[0]) }, mid: { value: c(B.sky[1]) }, hor: { value: c(B.sky[2]) }, sun: { value: sd }, fogc: { value: c(B.fog) }, sunc: { value: new THREE.Vector3(...(B.sunCol || [1.0, 0.85, 0.6])) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; uniform vec3 fogc; uniform vec3 sunc; varying vec3 vD;
        void main(){ float h = vD.y; vec3 col = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0, 0.25, h)), top, smoothstep(0.25, 0.9, h)) : mix(hor, fogc, smoothstep(0.0, -0.15, h));
          float sd = max(dot(normalize(vD), sun), 0.0);
          col += sunc * (pow(sd, 900.0) * 3.0 + pow(sd, 12.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
    skyDome.renderOrder = -10; skyDome.frustumCulled = false;
    if (B.stars) {
      // starfield on the upper hemisphere (rides along with the dome)
      const n = 900, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const u = Math.random() * 2 * Math.PI, v = Math.acos(1 - Math.random() * 0.95); pos[i * 3] = Math.sin(v) * Math.cos(u) * 280; pos[i * 3 + 1] = Math.cos(v) * 280; pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 280; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8d8d8, size: 1.6, sizeAttenuation: false, transparent: false, depthTest: true, depthWrite: false, fog: false }));
      st.renderOrder = -9; st.frustumCulled = false; skyDome.add(st);
    }
    scene.add(skyDome);
    scene.background = c(B.sky[2]);
  }

  // ---------------- stage mood: special areas tint the whole scene ----------------
  const MOODS = {
    cursed: { c: '#7a1aa0', k: 0.5, fog: 1.4, amb: 0.75, vig: 'rgba(80,10,110,0.75)', p: [0.6, 0.25, 0.9] },
    elite: { c: '#9a1a10', k: 0.32, fog: 1.15, amb: 0.9, vig: 'rgba(110,10,0,0.55)', p: [1, 0.35, 0.2] },
    vault: { c: '#c8962a', k: 0.3, fog: 1.0, amb: 1.05, vig: 'rgba(120,80,10,0.4)', p: [1, 0.85, 0.4] },
    trial: { c: '#2a78b8', k: 0.28, fog: 0.9, amb: 1.05, vig: 'rgba(10,50,100,0.4)', p: [0.5, 0.8, 1] },
    shrine: { c: '#2aa898', k: 0.32, fog: 0.85, amb: 1.1, vig: 'rgba(10,80,70,0.35)', p: [0.5, 1, 0.9] },
    event: { c: '#7048b0', k: 0.25, fog: 1.0, amb: 0.95, vig: 'rgba(50,20,90,0.4)', p: [0.75, 0.6, 1] },
    forge: { c: '#d05010', k: 0.32, fog: 1.05, amb: 1.0, vig: 'rgba(120,40,0,0.45)', p: [1, 0.5, 0.15] },
  };
  GM.applyMood = function (kind) {
    GM.sceneTint = null; GM._skyBase = null;
    const m = GM.mood = MOODS[kind] || null;
    GM.stopDread(); GM.dreadLifted = false; GM._flashK = 0; GM._pulse = 0;
    GM.dread = 0; GM._dreadT = 4; GM.gateDrop = 0;
    const base = GM.moodBase = { fog: scene.fog.color.clone(), fogD: scene.fog.density, hemi: hemi.color.clone(), hemiI: hemi.intensity, amb: amb.intensity, moon: moon.color.clone(), moonI: moon.intensity, bg: scene.background && scene.background.isColor ? scene.background.clone() : null };
    let vig = document.getElementById('mood-vig');
    if (!vig) { vig = document.createElement('div'); vig.id = 'mood-vig'; document.body.appendChild(vig); }
    if (!m) { vig.style.opacity = 0; vig.style.boxShadow = ''; return; }
    const c = new THREE.Color(m.c);
    scene.fog.color.lerp(c, m.k); scene.fog.density = base.fogD * m.fog;
    if (scene.background && scene.background.isColor) scene.background.lerp(c, m.k);
    hemi.color.lerp(c, m.k * 0.8); amb.intensity = base.amb * m.amb; moon.color.lerp(c, m.k * 0.5);
    G.fx.setFog(scene.fog.color, scene.fog.density);
    if (skyDome) for (const u of ['top', 'mid', 'hor']) skyDome.material.uniforms[u].value.lerp(c, m.k * 0.6);
    vig.style.boxShadow = `inset 0 0 260px 70px ${m.vig}`; vig.style.opacity = 1;
  };
  // boss road: the nearer the fortress, the darker, redder and louder the world gets
  const DREAD = new THREE.Color('#3a0608'), DREAD_F = new THREE.Color('#1c0830'), tmpC = new THREE.Color();
  function restoreMood() {
    GM.sceneTint = null;
    if (GM._skyBase && skyDome) { ['top', 'mid', 'hor'].forEach((u, i) => skyDome.material.uniforms[u].value.copy(GM._skyBase[i])); GM._skyBase = null; }
    const b = GM.moodBase; if (!b) return;
    hemi.color.copy(b.hemi);
    scene.fog.color.copy(b.fog); scene.fog.density = b.fogD;
    if (scene.background && scene.background.isColor && b.bg) scene.background.copy(b.bg);
    hemi.intensity = b.hemiI; amb.intensity = b.amb; moon.intensity = b.moonI; moon.color.copy(b.moon);
    G.fx.setFog(scene.fog.color, scene.fog.density);
    const vig = document.getElementById('mood-vig'); if (vig) vig.style.opacity = 0;
    if (GM.drone) { GM.drone.stop(); GM.drone = null; }
  }
  // final boss: push the whole scene toward a colour (fog, sky, ambient). restoreMood() undoes it when the area is cleared
  // (the boss-road dread recomputes the scene every frame, so the tint is stored and layered on top of it there)
  GM.tintScene = function (col, k) {
    const c = new THREE.Color(col);
    if (!GM.sceneTint) GM.sceneTint = { c: c.clone(), k: 0 };
    GM.sceneTint.c.lerp(c, k / Math.max(0.01, GM.sceneTint.k + k)); GM.sceneTint.k = Math.min(0.85, GM.sceneTint.k + k);
    if (skyDome) { if (!GM._skyBase) GM._skyBase = ['top', 'mid', 'hor'].map((u) => skyDome.material.uniforms[u].value.clone()); for (const u of ['top', 'mid', 'hor']) skyDome.material.uniforms[u].value.lerp(c, k); }
    hemi.color.lerp(c, k * 0.8);
  };
  function applySceneTint() {
    const T = GM.sceneTint; if (!T) return;
    // colour, not darkness: the fight must stay readable
    scene.fog.color.lerp(T.c, T.k); scene.fog.density *= 1 + T.k * 0.1;
    if (scene.background && scene.background.isColor) scene.background.lerp(T.c, T.k);
    moon.color.lerp(T.c, T.k * 0.6); moon.intensity *= 1 + T.k * 0.4; hemi.intensity *= 1 + T.k * 0.3;
  }
  // anomaly "darkness": kill the image-based light, dim torches and the sky; restored when the area ends
  GM.setDarkness = function (on) {
    if (on) {
      if (GM._dark) return;
      GM._dark = { dome: skyDome, env: scene.environment, lk: G.LIGHT_K, sky: skyDome ? ['top', 'mid', 'hor', 'fogc'].map((u) => skyDome.material.uniforms[u].value.clone()) : null, sunc: skyDome ? skyDome.material.uniforms.sunc.value.clone() : null, starsVis: skyDome && skyDome.children[0] ? skyDome.children[0].visible : null };
      scene.environment = null; G.LIGHT_K = LIGHT_K * 0.22;
      // the hands / weapon have their own lights: dim those too (the lamp still catches them a little)
      const vs = G.weapons.vmScene;
      if (vs) { GM._dark.vmEnv = vs.environment; vs.environment = null; GM._dark.vmL = []; vs.traverse((o) => { if (o.isLight && o.intensity > 0) { GM._dark.vmL.push([o, o.intensity]); o.intensity *= 0.4; } }); }
      if (skyDome) { for (const u of ['top', 'mid', 'hor', 'fogc']) skyDome.material.uniforms[u].value.multiplyScalar(0.05); skyDome.material.uniforms.sunc.value.multiplyScalar(0.05); if (skyDome.children[0]) skyDome.children[0].visible = false; }
    } else {
      const d = GM._dark; if (!d) return;
      scene.environment = d.env; G.LIGHT_K = d.lk;
      const vs = G.weapons.vmScene;
      if (vs) { if (d.vmEnv !== undefined) vs.environment = d.vmEnv; for (const [o, i] of d.vmL || []) o.intensity = i; }
      if (skyDome && d.sky && d.dome === skyDome) { ['top', 'mid', 'hor', 'fogc'].forEach((u, i) => skyDome.material.uniforms[u].value.copy(d.sky[i])); skyDome.material.uniforms.sunc.value.copy(d.sunc); if (skyDome.children[0] && d.starsVis !== null) skyDome.children[0].visible = d.starsVis; }
      GM._dark = null;
    }
  };
  GM.stopDread = function () { if (GM.drone) { GM.drone.stop(); GM.drone = null; } };
  // ---------------- the last field: elevator, the void that kills, and the dawn after the king falls ----------------
  let liftHint = false;
  function updateFinalField(dt) {
    const w = G.world; if (!w) return;
    const E = w.elevator;
    if (E && E.mesh) {
      const inXZ = P.pos.x > E.x0 - 0.1 && P.pos.x < E.x1 + 0.1 && P.pos.z > E.z0 - 0.1 && P.pos.z < E.z1 + 0.1;
      const on = inXZ && Math.abs(P.pos.y - E.y) < 0.45;
      if (!liftHint && E.state === 'idle' && Math.hypot(P.pos.x - (E.x0 + E.x1) / 2, P.pos.z - (E.z0 + E.z1) / 2) < 10) { liftHint = true; G.ui.toastSmall('🛗 昇降台に乗ると玉座の間へ昇る'); }
      if (E.state === 'idle') {
        if (on && P.grounded) { E.ride += dt; if (E.ride > 0.6) { E.state = 'up'; G.sfx.stoneGrind && G.sfx.stoneGrind(P.pos, 2); G.sfx.magic(P.pos, 'dark'); G.sfx.rumble && G.sfx.rumble(5, 0.6); } }
        else E.ride = 0;
        if (Math.random() < dt * 8) G.fx.add.spawn(U.rand(E.x0, E.x1), E.y + 0.05, U.rand(E.z0, E.z1), 0, U.rand(1, 3), 0, 1, 0.08, 0.01, 0.75, 0.45, 1, 0.9, -0.3, 0.4);
      } else if (E.state === 'up') {
        const ny = Math.min(E.y1, E.y + dt * 3.2), dy = ny - E.y;
        E.y = ny; E.col.y1 = ny; E.col.y0 = ny - 0.7; E.mesh.position.y = ny;
        if (inXZ && P.pos.y > ny - dy - 0.9 && P.pos.y < ny + 0.6) { P.pos.y = Math.max(P.pos.y, ny); if (P.vel.y < 0) P.vel.y = 0; P.grounded = true; }
        P.addShake(dt * 0.25);
        if (Math.random() < dt * 30) G.fx.add.spawn(U.rand(E.x0, E.x1), ny - 0.4, U.rand(E.z0, E.z1), U.rand(-0.5, 0.5), -U.rand(1, 3), U.rand(-0.5, 0.5), 0.8, 0.12, 0.02, 0.8, 0.5, 1, 0.9, 2, 0.5);
        if (ny >= E.y1) { E.state = 'top'; G.sfx.bell && G.sfx.bell(); G.fx.ring(V((E.x0 + E.x1) / 2, ny + 0.05, (E.z0 + E.z1) / 2), 4, 0xb070ff, 0.6); }
      }
    }
    // the last field: falling into the void is death — no damage reduction, no fairy, no second wind; only a soul lantern brings you back
    if (w.finalArena && !P.dead && GM.state === 'playing' && P.pos.y < -4 && P.pos.z < w.arenaD + 3) {
      GM.lastCause = '奈落';
      P.hp = 0; P.os = 0; P.dead = true; P.deathT = 0; P.vel.set(0, 0, 0);
      if (P.slideLoop) { P.slideLoop.stop(); P.slideLoop = null; }
      G.ui.toast('🕳️ 奈落に呑まれた……', 'warn'); G.ui.fadeFlash && G.ui.fadeFlash();
      GM.playerDied();
    }
    if (GM.dawn) updateDawn(dt);
  }
  // the king falls: the eclipse burns away, the void turns to dawn
  GM.startDawn = function () {
    const w = G.world;
    GM.dawn = { t: 0, from: { fog: scene.fog.color.clone(), fogD: scene.fog.density, bg: scene.background && scene.background.isColor ? scene.background.clone() : new THREE.Color('#000'), hemi: hemi.color.clone(), hemiI: hemi.intensity, amb: amb.intensity, moon: moon.color.clone(), moonI: moon.intensity, sky: skyDome ? ['top', 'mid', 'hor'].map((u) => skyDome.material.uniforms[u].value.clone()) : null } };
    const c = w.arenaCenter;
    G.ui.banner('夜明け', '— 深淵の王は滅び、世界に光が戻る —', true);
    G.sfx.ultCast && G.sfx.ultCast(); setTimeout(() => G.sfx.bell && G.sfx.bell(), 600); setTimeout(() => G.sfx.ultReady && G.sfx.ultReady(), 1400);
    // a pillar of light from the throne into the sky, waves of light across the island
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 260, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false }));
    beam.position.set(c.x, 128, c.z); w.group.add(beam); GM.dawn.beam = beam;
    for (let i = 0; i < 6; i++) setTimeout(() => { G.fx.ring(c.clone().setY(0.1), 6 + i * 6, 0xffe8a0, 1.2); P.addShake(0.15); }, i * 380);
  };
  const DAWN = { fog: new THREE.Color('#b8906a'), bg: new THREE.Color('#e8b888'), hemi: new THREE.Color('#ffe8c8'), moon: new THREE.Color('#ffd898'), sky: [new THREE.Color('#4f9ae6'), new THREE.Color('#ffc58a'), new THREE.Color('#fff0d8')] };
  function updateDawn(dt) {
    const D = GM.dawn, F = D.from, w = G.world;
    D.t += dt;
    const k = U.smoothstep ? U.smoothstep(0, 7, D.t) : Math.min(1, D.t / 7);
    scene.fog.color.copy(F.fog).lerp(DAWN.fog, k); scene.fog.density = U.lerp(F.fogD, 0.0016, k);
    if (scene.background && scene.background.isColor) scene.background.copy(F.bg).lerp(DAWN.bg, k);
    hemi.color.copy(F.hemi).lerp(DAWN.hemi, k); hemi.intensity = U.lerp(F.hemiI, 1.2, k);
    amb.intensity = U.lerp(F.amb, 0.9, k);
    moon.color.copy(F.moon).lerp(DAWN.moon, k); moon.intensity = U.lerp(F.moonI, 2.4, k);
    if (skyDome && F.sky) { ['top', 'mid', 'hor'].forEach((u, i) => skyDome.material.uniforms[u].value.copy(F.sky[i]).lerp(DAWN.sky[i], k)); if (k > 0.5) skyDome.children.forEach((ch) => { ch.visible = false; }); }
    G.fx.setFog(scene.fog.color, scene.fog.density);
    // the eclipse burns into a rising sun
    if (w.eclipse) { w.eclipse.children.forEach((ch) => { if (ch.material && ch.material.color) ch.material.color.lerp(new THREE.Color(ch.material.blending === THREE.AdditiveBlending ? '#ffe0a0' : '#fff6d0'), Math.min(1, dt * 1.5)); }); w.eclipse.position.y += dt * 4 * (1 - k); }
    if (D.beam) { D.beam.material.opacity = Math.min(0.35, D.t * 0.25) * (D.t > 8 ? Math.max(0, 1 - (D.t - 8) / 4) : 1); D.beam.rotation.y += dt * 0.3; }
    // golden motes rise from the whole island for a while
    if (D.t < 14 && Math.random() < dt * 60) { const c = w.arenaCenter, a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 26; G.fx.add.spawn(c.x + Math.cos(a) * r, 0.2, c.z + Math.sin(a) * r, 0, U.rand(1, 3), 0, U.rand(2, 4), U.rand(0.08, 0.16), 0.02, 1.2, 1.0, 0.6, 1, -0.3, 0.2); }
  }
  function updateDread(dt) {
    const w = G.world, b = GM.moodBase;
    if (!w.road || !b) return;
    // guardian slain: lift the whole atmosphere at once
    if (GM.areaCleared) { if (!GM.dreadLifted) { GM.dreadLifted = true; GM.dread = 0; restoreMood(); } return; }
    const raw = GM.bossEngaged ? 0.8 : U.clamp((w.road.z1 - P.pos.z) / (w.road.z1 - w.road.z0), 0, 1);
    GM.dread = U.damp(GM.dread || 0, raw, 2, dt);
    const k = GM.dread;
    const t = GM.time;
    // fog only tints slightly (keep the road readable); darkness and colour do the work
    const DC = GM.bossDef && GM.bossDef.final ? DREAD_F : DREAD;
    scene.fog.color.copy(b.fog).lerp(DC, k * 0.45);
    scene.fog.density = b.fogD * (1 + k * 0.45);
    if (scene.background && scene.background.isColor && b.bg) scene.background.copy(b.bg).lerp(DC, k * 0.55);
    // lightning flash brightens everything for a moment
    GM._flashK = Math.max(0, (GM._flashK || 0) - dt * 3.5);
    const fl = GM._flashK;
    hemi.intensity = b.hemiI * (1 - k * 0.3) + fl * 1.2; amb.intensity = b.amb * (1 - k * 0.3) + fl * 0.8;
    moon.intensity = b.moonI * (1 - k * 0.35) + fl * 4; moon.color.copy(b.moon).lerp(tmpC.set(GM.bossDef && GM.bossDef.final ? '#b060ff' : '#ff5038'), Math.min(1, k * 0.55 + fl));
    applySceneTint();
    G.fx.setFog(scene.fog.color, scene.fog.density);
    // pulsing blood-red vignette (beats with the heart near the gate)
    const vig = document.getElementById('mood-vig');
    GM._pulse = Math.max(0, (GM._pulse || 0) - dt * 2.2);
    if (vig) { const a = 0.22 + k * 0.45 + GM._pulse * 0.25; vig.style.boxShadow = `inset 0 0 ${180 + k * 120 + GM._pulse * 60}px ${30 + k * 60}px rgba(${GM.bossDef && GM.bossDef.final ? '40,0,70' : '60,0,0'},${a.toFixed(2)})`; vig.style.opacity = k > 0.02 ? 1 : 0; }
    // the drone swells as you approach
    if (!GM.drone && k > 0.05) GM.drone = G.sfx.drone ? G.sfx.drone() : null;
    if (GM.drone) GM.drone.set(GM.bossEngaged ? 0.35 : k);
    const cp = camera.position;
    // falling ash, embers, dark wisps creeping up from the ground
    if (Math.random() < dt * (4 + k * 30)) G.fx.norm.spawn(cp.x + U.rand(-12, 12), cp.y + U.rand(3, 8), cp.z + U.rand(-14, 6), U.rand(-0.3, 0.3), -U.rand(0.4, 0.9), U.rand(-0.3, 0.3), 7, 0.05, 0.05, 0.25, 0.22, 0.2, 0.8, 0, 0);
    if (k > 0.25 && Math.random() < dt * k * 22) G.fx.add.spawn(cp.x + U.rand(-10, 10), cp.y + U.rand(-1.5, 1), cp.z + U.rand(-12, 4), U.rand(-0.3, 0.3), U.rand(0.5, 1.4), U.rand(-0.3, 0.3), 2.2, 0.06, 0.01, 1, 0.35, 0.1, 0.9, 0, 0);
    if (k > 0.35 && Math.random() < dt * k * 14) G.fx.norm.spawn(cp.x + U.rand(-8, 8), P.pos.y + 0.05, cp.z + U.rand(-10, 3), U.rand(-0.1, 0.1), U.rand(0.3, 0.7), U.rand(-0.1, 0.1), 2.5, 0.35, 1.2, 0.06, 0.0, 0.05, 0.55, -0.1, 1);
    if (!GM.bossEngaged) {
      // eyes watching from the canyon walls
      GM._eyeT = (GM._eyeT ?? 3) - dt;
      if (GM._eyeT <= 0 && k > 0.3) {
        GM._eyeT = U.rand(2.5, 6) * (1.3 - k * 0.6);
        const side = Math.random() < 0.5 ? -1 : 1;
        const ez = P.pos.z - U.rand(4, 16), ex = w.W / 2 + side * U.rand(7.2, 8.8), ey = U.rand(2.5, 7);
        for (const o of [-0.13, 0.13]) G.fx.add.spawn(ex, ey, ez + o, 0, 0, 0, U.rand(0.9, 1.6), 0.07, 0.07, 1, 0.08, 0.05, 1, 0, 0);
        if (Math.random() < 0.5) G.sfx.whisper && G.sfx.whisper(V(ex, ey, ez));
      }
      // red lightning over the fortress towers
      GM._boltT = (GM._boltT ?? 6) - dt;
      if (GM._boltT <= 0 && k > 0.35 && !w.ceilingRoad) {
        GM._boltT = U.rand(5, 11) * (1.3 - k * 0.6);
        const tx = w.W / 2 + (Math.random() < 0.5 ? -1 : 1) * U.rand(5, 11), tz = w.arenaD + U.rand(1, 6);
        const top = V(tx + U.rand(-6, 6), 46, tz - U.rand(4, 14)), hit = V(tx, 23, tz);
        G.fx.lightning(top, hit, 0xff6050); G.fx.lightning(top, hit, 0xffd0c0);
        G.fx.flash(hit, 0xff5040, 90, 0.25, 40);
        GM._flashK = 1; GM._pulse = 1;
        G.sfx.thunder && G.sfx.thunder(U.rand(0.3, 0.9));
      }
      // distant roars, rumbles and toll
      GM._dreadT = (GM._dreadT || 4) - dt;
      if (GM._dreadT <= 0 && k > 0.15) {
        GM._dreadT = U.rand(6, 12) * (1.2 - k * 0.7);
        const r = Math.random();
        if (r < 0.4) G.sfx.monster(V(w.W / 2, 4, w.arenaD * 0.5), 'roar', 0.45, 0.4 + k * 0.6);
        else if (r < 0.7) { G.sfx.rumble(0.4 + k * 0.5, 1.2); P.addShake(0.08 + k * 0.15); }
        else if (r < 0.85) G.sfx.bell && G.sfx.bell();
        else G.sfx.whisper && G.sfx.whisper(V(cp.x + U.rand(-3, 3), cp.y, cp.z + U.rand(-3, 3)));
      }
      if (k > 0.7) { GM._hbT = (GM._hbT || 0) - dt; if (GM._hbT <= 0) { GM._hbT = 1.15 - (k - 0.7) * 1.3; G.sfx.heartbeat(0.4 + (k - 0.7) * 2); GM._pulse = Math.max(GM._pulse, 0.6 + (k - 0.7)); } }
      // crossing the gate: the portcullis slams shut and the guardian awakens
      if (P.pos.z < w.arenaD - 3 && !P.dead) {
        GM.bossEngaged = true;
        const g = w.bossGate;
        w.addCollider(g.x - g.w / 2, 0, g.z0, g.x + g.w / 2, 7, g.z1 + 0.2, { surf: 'metal', noGrapple: true });
        GM.gateDrop = 0.0001;
        G.sfx.mech('boltFwd', 0, 1.6); G.sfx.explosion(V(g.x, 1, g.z1), 0.5); P.addShake(0.5);
        GM.objective = { icon: '👑', text: () => '守護者を討伐せよ', progress: () => G.bosses.active ? 1 - Math.max(0, G.bosses.active.hp) / G.bosses.active.maxHp : 1 };
        GM.bossStartT = 1.8;
      }
    }
    if (GM.gateDrop > 0 && w.bossGate.pc) { GM.gateDrop = Math.min(1, GM.gateDrop + dt * 4); w.bossGate.pc.position.y = 5.8 * (1 - GM.gateDrop * GM.gateDrop); if (GM.gateDrop >= 1) { GM.gateDrop = 0; w.bossGate.pc.position.y = 0; G.fx.dust(V(w.bossGate.x, 0.2, w.bossGate.z1), V(0, 1, 0), 0x6a5a48, 14); } }
  }
  GM.updateDread = updateDread;

  // ---------------- run flow ----------------
  GM.toTitle = function () {
    if (G.Tutorial.active) G.Tutorial.stop();
    GM.state = 'title';
    GM.mood = null; GM.stage = 'title'; GM.stopDread(); G.Depth.endArea(); const mv = document.getElementById('mood-vig'); if (mv) mv.style.opacity = 0;
    I.exitLock();
    G.ui.showHud(false);
    G.ui.bossBar(null);
    const w = G.LevelGen.generate(1 + Math.floor(Math.random() * 25), (Math.random() * 1e9) >>> 0);
    setWorld(w);
    GM.titleT = 0;
    G.weapons.hidden(true);
    G.ui.title();
  };
  GM.startRun = function (seedStr, diff) {
    G.sfx.init();
    if (G.Dev && !G.Dev.keep && G.Dev.on()) G.Dev.disable();
    if (diff) G.Run.set(diff.id, diff.lv);
    let seed;
    if (seedStr && /^\d+$/.test(seedStr)) seed = parseInt(seedStr, 10) >>> 0; else if (seedStr) seed = U.hashStr(seedStr); else seed = (Math.random() * 999999999) >>> 0;
    GM.seed = seed;
    GM.rng = new G.RNG(seed);
    GM.time = 0;
    GM.run = { coins: 0, coinsTotal: 0, kills: 0, headshots: 0, combo: 0, lastKillT: -10, multi: 0, multiT: -10, dmgTaken: 0, destroyed: 0, startT: 0, areasCleared: 0, shopVisits: 0 };
    GM.run.diff = Object.assign({}, G.Run.cur); GM.won = false;
    G.save.data.records.runs++; G.save.write();
    P.resetRun();
    G.abilities.clearUltAuras && G.abilities.clearUltAuras();
    G.weapons.dirty = true;
    GM.area = 1;
    G.ui.clearScreen();
    I.requestLock();
    if (G.save.data.settings.fullscreen) I.fullscreen();
    GM.route = []; GM.rewardPending = null;
    GM.enterArea(1, 'combat');
    if (G.Warm && !GM._uiWarmed) { GM._uiWarmed = true; setTimeout(() => G.Warm.ui(), 1500); }
    setTimeout(() => { G.ui.itemCard(G.ITEM_BY_ID.h_bandage, `[${G.K('item1')} で使用]`, { noBanner: true }); G.ui.itemCard(G.ITEM_BY_ID.h_medkit, `[${G.K('item2')} で使用]`, { noBanner: true }); G.ui.itemCard(G.ITEM_BY_ID.g_frag, `[${G.K('grenade')} で構え→クリックで投擲]`, { noBanner: true }); G.ui.toastSmall('💡 Tab で持ち物・装備・ステータスをまとめて確認できます'); }, 3200);
  };
  // ---------------- attachments: stash & moving between weapons ----------------
  GM.stashAtts = function (w) { if (!w) return; for (const sl in w.atts) if (w.atts[sl]) P.attStash.push(w.atts[sl]); w.atts = {}; w.ver++; };
  // move attachment `id` from `from` (weapon or 'stash') to `to` (weapon or 'stash')
  GM.moveAtt = function (id, from, to) {
    // moving parts around by hand must never trigger the "auto equip on pickup" of the parts it sets down
    const was = G.Inv.noAuto; G.Inv.noAuto = true;
    try { return moveAtt0(id, from, to); } finally { G.Inv.noAuto = was; }
  };
  function moveAtt0(id, from, to) {
    const a = G.ATT_BY_ID[id]; if (!a || from === to) return false;
    if (to !== 'stash' && !a.compat(to.def)) return false;
    if (from === 'stash') { const i = P.attStash.indexOf(id); if (i < 0) return false; P.attStash.splice(i, 1); }
    else { delete from.atts[a.slot]; from.ver++; }
    if (to === 'stash') P.attStash.push(id);
    else {
      const prev = to.atts[a.slot];
      to.atts[a.slot] = id; to.ver++;
      if (prev) {
        // the displaced part goes back where the new one came from if it fits there, else to the stash
        if (from !== 'stash' && G.ATT_BY_ID[prev].compat(from.def) && !from.atts[a.slot]) { from.atts[a.slot] = prev; from.ver++; }
        else P.attStash.push(prev);
      }
    }
    G.weapons.dirty = true;
    if (!P.meleeMode && (from === P.weapon || to === P.weapon)) G.weapons.equip(true);
    G.ui.refreshWeapon();
    return true;
  }

  // ---------------- run checkpoint (saved on every area entry; resume restarts that area) ----------------
  const RUN_KEY = 'abyss_run_v1';
  GM.playerSnap = function () {
    return {
      hp: P.hp, os: P.os || 0, revives: P.revives, permMaxHp: P.permMaxHp || 0, phoenixUsed: !!P.phoenixUsed, miserArea: P.miserArea,
      buffs: [...P.buffs], buffState: P.buffState,
      weapons: P.weapons.map((w) => ({ id: w.id, atts: w.atts, lv: w.lv || 0, mag: w.mag, kills: w.kills || 0 })), wIdx: P.wIdx,
      wOrder: G.weapons.order().map((t) => (t === 'm' ? 'm' : t ? P.weapons.indexOf(t) : null)),
      melee: { id: P.melee.id, lv: P.melee.lv || 0 },
      skills: P.skills.map((s) => (s ? s.id : null)), skillLv: P.skills.map((s) => (s ? s.lv || 0 : 0)), pileTome: P.pileTome || 0,
      grenadeSel: P.grenadeSel, isel: P.isel, invGrid: G.Inv.snap(P),
    };
  };
  GM.saveRun = function (n, kind) {
    try {
      const d = Object.assign({ v: 1, t: Date.now(), seed: GM.seed, area: n, kind, route: GM.route || [], run: GM.run }, GM.playerSnap());
      localStorage.setItem(RUN_KEY, JSON.stringify(d));
    } catch (e) { /* storage unavailable: the run simply can't be resumed */ }
  };
  GM.loadRun = function () { try { const d = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); return d && d.v === 1 ? d : null; } catch (e) { return null; } };
  GM.clearRun = function () { try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ } };
  GM.continueRun = function () {
    const d = GM.loadRun(); if (!d) return;
    G.sfx.init();
    GM.seed = d.seed; GM.rng = new G.RNG((d.seed ^ U.hashStr('resume' + d.area)) >>> 0);
    GM.time = 0;
    GM.run = Object.assign({ coins: 0, coinsTotal: 0, kills: 0, headshots: 0, combo: 0, lastKillT: -10, multi: 0, multiT: -10, dmgTaken: 0, destroyed: 0, startT: 0, areasCleared: 0, shopVisits: 0 }, d.run, { combo: 0, lastKillT: -10, multiT: -10, startT: 0 });
    G.Run.set((d.run && d.run.diff && d.run.diff.id) || 'normal', d.run && d.run.diff && d.run.diff.lv);
    GM.applyPlayerSnap(d);
    G.weapons.dirty = true;
    GM.area = d.area;
    GM.route = (d.route || []).slice(0, -1);
    G.ui.clearScreen();
    I.requestLock();
    if (G.save.data.settings.fullscreen) I.fullscreen();
    const mid = d.mid && d.mid.area === d.area && d.mid.kind === d.kind ? d.mid : null;
    GM.rewardPending = null; GM.enterArea(d.area, d.kind);
    // enterArea re-ran the area-start effects; put HP back to the checkpoint value
    P.hp = Math.min(P.stats.maxHp, Math.max(P.hp, d.hp || 0));
    if (mid) {
      G.MidSave.apply(mid);
      G.MidSave.tick();
      G.ui.toast(d.kind === 'boss' && !mid.cleared ? `💾 エリア ${d.area} — 守護者の間の手前から再開` : `💾 エリア ${d.area} — 中断した所から再開`, 'good');
    } else G.ui.toast(`💾 エリア ${d.area} の入口から再開`, 'good');
  };
  GM.applyPlayerSnap = function (d) {
    P.resetRun();
    P.buffs = new Map((d.buffs || []).filter(([id]) => G.BUFF_BY_ID[id]));
    P.buffState = d.buffState || {};
    P.permMaxHp = d.permMaxHp || 0;
    P.recalc();
    P.phoenixUsed = !!d.phoenixUsed;
    P.weapons = (d.weapons || []).filter((x) => G.WEAPON_BY_ID[x.id]).map((x) => { const w = G.weapons.make(x.id); w.atts = Object.fromEntries(Object.entries(x.atts || {}).filter(([, a]) => G.ATT_BY_ID[a])); w.lv = x.lv || 0; w.kills = x.kills || 0; w.ver++; w.mag = x.mag ?? w.mag; return w; });
    if (!P.weapons.length) P.weapons = [G.weapons.make('starter')];
    P.wIdx = Math.min(d.wIdx || 0, P.weapons.length - 1);
    P.wOrder = (d.wOrder || []).map((t) => (t === 'm' ? 'm' : t === null ? null : P.weapons[t] || null));
    if (d.melee && G.MELEE_BY_ID[d.melee.id]) { P.melee = G.weapons.makeMelee(d.melee.id === 'fists' ? G.DEFAULT_MELEE : d.melee.id); P.melee.lv = d.melee.lv || 0; }
    P.skills = [0, 1, 2, 3].map((i) => { if (!(d.skills && d.skills[i] && G.SKILL_BY_ID[d.skills[i]])) return null; const s = G.abilities.makeSlot(d.skills[i]); s.lv = (d.skillLv && d.skillLv[i]) || 0; return s; });
    P.pileTome = d.pileTome || 0;
    if (P.skills[0] && !P.skills[0].def.ult) { const s = P.skills[0]; const free = [1, 2, 3].find((i) => !P.skills[i]); if (free) P.skills[free] = s; P.skills[0] = null; }
    if (!P.skills[0]) P.skills[0] = G.abilities.makeSlot(G.DEFAULT_ULT);
    if (d.invGrid) G.Inv.load(P, d.invGrid);
    else {
      // older saves: rebuild the bag from the item counts
      G.Inv.setupPlayer(P);
      P.grenades = d.grenades || {};
      const inv = {};
      if (d.inv) for (const [id, n] of Object.entries(d.inv)) { if (G.ITEM_BY_ID[id] && n > 0) inv[id] = n; }
      else for (const u of d.utils || []) if (u && G.ITEM_BY_ID[u.id]) inv[u.id] = (inv[u.id] || 0) + u.n;
      P.inv = inv;
      P.attStash = (d.attStash || []).filter((a) => G.ATT_BY_ID[a]);
    }
    P.grenadeSel = d.grenadeSel || Object.keys(P.grenades)[0] || 'g_frag';
    P.isel = Object.assign({ c1: null, c2: null }, d.isel && d.isel.c1 !== undefined ? d.isel : {});
    P.revives = d.revives ?? 3;
    P.recalc();
    P.hp = Math.min(P.stats.maxHp, d.hp || P.stats.maxHp); P.os = d.os || 0;
    P.miserArea = d.miserArea;
    G.weapons.dirty = true;
  };
  GM.enterArea = function (n, kind) {
    GM.saveRun(n, kind);
    GM.area = n;
    GM.stage = kind;
    GM.route = GM.route || []; GM.route.push(kind);
    const gates = G.Run.isBoss(n + 1) ? 1 : 3;
    const seed = (GM.seed ^ U.hashStr('area' + n + kind)) >>> 0;
    let w;
    if (kind === 'shop') w = G.LevelGen.shop(n, seed, gates);
    else if (kind === 'boss') w = G.LevelGen.boss(n, seed, G.bosses.forArea(n));
    else if (G.Areas.ROOMS.includes(kind) || kind === 'trial') w = G.LevelGen.room(n, seed, kind, gates);
    else w = G.LevelGen.generate(n, seed, { extraChests: P.stats.extraChests, gates, kind });
    setWorld(w);
    if (w.field) G.save.mark('items', 'stage_' + w.field);
    P.spawnAt(w);
    G.weapons.equip(true);
    G.weapons.hidden(false);
    GM.areaCleared = false; GM.areaDamage = 0; GM.areaStartT = GM.time; GM.areaKills = 0;
    GM.objective = null; GM.waves = null; GM.shop = null; GM.clearMarkers(); GM.clearSweep = false; { const fmk = document.getElementById('free-markers'); if (fmk) fmk.innerHTML = ''; } GM.mimic = null; GM.mimicT = -1; GM.ambushReward = false;
    GM.areaMods = { hp: G.Run.hpMul(n), dmg: G.Run.dmgMul(n) };
    GM.arng = new G.RNG(seed ^ 0x51ed);
    G.ui.showHud(true);
    const B = w.mats.biome;
    const T = G.Areas.TYPES[kind];
    G.ui.setArea(`AREA ${n}<small class="ar-of"> / ${G.Run.areas()}</small>`, `${T.icon} ${T.name} — ${B.name}${w.layout ? ' · ' + layoutName(w.layout) : ''}`);
    if (kind === 'shop') {
      GM.setupShop(w);
      GM.objective = { icon: '🛒', text: () => '買い物を終えたら次の門を選べ', done: true };
      G.Areas.openGates(true); GM.areaCleared = true;
      G.ui.banner('商人の間', '— 次なる試練に備えよ —');
    } else if (kind === 'boss') {
      const bid = G.bosses.forArea(n);
      const bd0 = G.BOSS_BY_ID[bid], cyc = G.bosses.cycleOf(n);
      const bd = cyc > 0 ? Object.assign({}, bd0, { name: G.bosses.cyclePrefix(cyc) + bd0.name }) : bd0;
      GM.bossDef = bd; GM.bossEngaged = false; GM.bossStartT = 0;
      const outdoorRoad = w.field === 'grave';
      G.ui.banner(`AREA ${n}`, outdoorRoad ? '— 墓所の奥へ —' : '— 回廊の奥へ —');
      GM.objective = { icon: outdoorRoad ? '⚰️' : '🚪', text: () => (outdoorRoad ? '墓所の奥へ進め — 鉄柵の門をくぐると戦いが始まる' : '回廊の奥へ進め — 石の扉をくぐると戦いが始まる'), done: false };
      G.Areas.spawnMiniShop(true, true);
      G.Rooms2.setupRoadMerchant();
    } else if (G.Areas.ROOMS.includes(kind)) {
      if (kind === 'event') { G.Areas.setupEvents(); GM.objective = { icon: '❓', text: () => `人影に話しかけろ（${G.K('interact')}）／ 準備ができたら門へ`, done: true }; }
      if (kind === 'shrine') { G.Areas.setupShrine(); GM.objective = { icon: '⛩️', text: () => `祭壇で祈れ（${G.K('interact')}）`, done: true }; }
      if (G.Rooms2.KINDS.includes(kind)) G.Rooms2.setup(kind);
      if (kind === 'forge') { G.Areas.setupForge(); GM.objective = { icon: '⚒️', text: () => `金床で武器を鍛えろ（${G.K('interact')}）`, done: true }; }
      G.Areas.openGates(true); GM.areaCleared = true;
      G.ui.banner(T.name, `— ${T.hint} —`);
    } else if (kind === 'trial') {
      G.Areas.setupTrial();
      G.ui.banner(T.name, '— 浮遊する的を撃ち抜け —');
    } else {
      if (kind === 'cursed') GM.areaMods = { hp: 1.75 * G.Run.hpMul(n), dmg: 1.45 * G.Run.dmgMul(n), cursed: true };
      GM.setupObjective(n, kind);
      if (kind === 'vault') G.Areas.setupVault();
      G.ui.banner(`AREA ${n}`, `${T.icon} ${T.name} — ${GM.objective.title}`);
    }
    GM.applyMood(kind);
    G.Depth.startArea(n, kind);
    if (GM.run.merc) setTimeout(() => G.Rooms2.spawnMerc(), 300);
    if (n === 26 || n === 51) setTimeout(() => G.ui.banner(n === 26 ? '深 層' : '奈 落', n === 26 ? '— 敵は変異し、異変が日常となる —' : '— ここから先、帰った者はいない —', true), 2600);
    else if (n > 51 && (n - 1) % 50 === 0) setTimeout(() => G.ui.banner(`第${G.bosses.cycleOf(n) + 1}巡`, '— 見知った魔物たちが、より深い色に染まっている —', true), 2600);
    G.world.baseChests = G.world.interactables.filter((i) => i.type === 'chest').length;
    // walked through the gate before the boon screen came up: the reward follows you into the new area instead of being lost
    const carried = GM.rewardPending; GM.rewardPending = null;
    if (carried && GM.run) { GM.rewardPending = carried; setTimeout(() => GM.giveReward(carried), 1400); }
    G.buffs.emit('onAreaStart', {});
    GM.state = 'playing';
    G.ui.refreshWeapon(); G.ui.refreshItems();
    G.sfx.setAmbience(kind === 'boss' || kind === 'cursed' ? 1.4 : 1);
    if (G.Warm) G.Warm.world(); // shaders + textures of the finished area (props, NPCs, enemies included), before the first frame
  };
  function layoutName(l) { return { courtyard: '中庭', halls: '回廊', chasm: '大裂谷', terrace: '段丘', crypt: '納骨堂' }[l] || '遺構'; }

  // ---------------- objectives ----------------
  GM.setupObjective = function (n, variant) {
    const r = GM.arng;
    GM.clearMarkers();
    let pick = n === 1 ? 'exterminate' : r.weighted(['exterminate', 'survive', 'hunt', 'ritual'], () => 1);
    if (variant === 'elite') pick = 'hunt';
    if (variant === 'cursed' || variant === 'vault') pick = 'exterminate';
    // ---- wave plan: at most 3 waves, at most 5 foes per wave, at most 10 foes per area ----
    const waves = GM.wavePlan(n, variant, pick);
    const total = waves.reduce((s, w) => s + w.n, 0);
    const O = GM.objective = { kind: pick, killed: 0, total, spawned: 0, waves, wave: 0, waveT: 1.2, waveAlive: 0 };
    // fewer foes, but each one hits harder and lasts longer
    const tough = Math.min(1.5, 1.28 + n * 0.01);
    GM.areaMods.hp *= tough * (1 + (waves.overflow || 0) * 0.07);
    GM.areaMods.dmg *= Math.min(1.18, 1.06 + n * 0.005);
    GM.spawnT = 0.5;
    // display: a main line (what to do + overall count), a small sub-line (wave / hints) and a segmented gauge.
    // the gauge always shows progress toward CLEARING the area, so it is full exactly when the area clears.
    const wavePips = () => O.waves.length > 1 ? `<span class="wv">WAVE ${Math.max(1, O.wave)}/${O.waves.length}</span>` : '';
    const waveSegs = () => O.waves.map((wv, i) => ({ w: wv.n, k: i < O.wave - 1 ? 1 : i === O.wave - 1 ? (O.waveSize ? O.waveKilled / O.waveSize : 0) : 0, cur: i === O.wave - 1 }));
    const waveLeft = () => Math.max(0, (O.waveSize || 0) - (O.waveKilled || 0));
    if (pick === 'exterminate') {
      O.title = variant === 'vault' ? '宝物庫の守護者' : variant === 'cursed' ? '呪われた殲滅戦' : '殲滅'; O.icon = variant === 'cursed' ? '☠️' : '⚔️';
      O.text = () => `全ての敵を倒せ — 撃破 <b>${Math.min(O.killed, O.total)}/${O.total}</b>`;
      O.sub = () => O.wave === 0 ? '敵が現れる…' : O.waves.length <= 1 ? `残り <b>${waveLeft()}</b>体` : waveLeft() === 0 && O.wave < O.waves.length ? `${wavePips()} 次の群れが来る…` : `${wavePips()} この群れの残り <b>${waveLeft()}</b>体${O.wave < O.waves.length ? '・全滅させると次の群れ' : '・最後の群れ'}`;
      O.segs = waveSegs;
      O.progress = () => Math.min(1, O.killed / Math.max(1, O.total));
    } else if (pick === 'survive') {
      O.title = '生存'; O.icon = '⏳'; O.dur = 30 + Math.min(15, n * 0.8); O.t = 0;
      O.text = () => `生き延びろ — 残り <b>${Math.ceil(Math.max(0, O.dur - O.t))}</b> 秒`;
      O.sub = () => `${wavePips()} 敵は倒さなくてもよい・魔物が絶え間なく湧き続ける`;
      O.progress = () => Math.min(1, O.t / O.dur);
    } else if (pick === 'hunt') {
      O.title = variant === 'elite' ? '精鋭狩り' : '狩猟'; O.icon = variant === 'elite' ? '👑' : '🎯';
      O.targets = waves.reduce((s, w) => s + (w.target || 0), 0); O.marked = 0; O.markKilled = 0; O.champion = variant === 'elite';
      const mk = () => (O.champion ? '👑覇者' : '★標的');
      O.text = () => `${mk()}を倒せ — <b>${O.markKilled}/${O.targets}</b>`;
      O.sub = () => {
        const alive = G.enemies.list.filter((e) => e.alive && e.marked).length;
        const nextT = O.waves.findIndex((wv, i) => i >= O.wave && wv.target);
        const hint = alive ? `${mk()}が出現中（頭上に${O.champion ? '👑' : '★'}）` : nextT >= 0 ? `${mk()}は WAVE ${nextT + 1} で現れる・まず今の群れを倒せ` : '';
        return `${wavePips()} ${hint}${alive || nextT < 0 ? '・他の敵は倒さなくてもよい' : ''}`;
      };
      // one segment per target; a living target fills as its HP drops
      O.segs = () => {
        const live = G.enemies.list.filter((e) => e.alive && e.marked);
        return Array.from({ length: O.targets }, (_, i) => {
          if (i < O.markKilled) return { w: 1, k: 1 };
          const e = live[i - O.markKilled];
          return { w: 1, k: e ? U.clamp(1 - e.hp / Math.max(1, e.maxHp), 0, 0.99) : 0, cur: !!e };
        });
      };
      O.progress = () => O.markKilled / Math.max(1, O.targets);
    } else {
      O.title = '儀式'; O.icon = '🕯️'; O.altars = [];
      const w = G.world;
      for (let i = 0; i < 3; i++) {
        const c = w.randomOpenCell(r, (x, z, idx) => w.reachMask && w.reachMask[idx] && Math.hypot(x - w.spawn.x, z - w.spawn.z) > 14 && O.altars.every((a) => Math.hypot(a.x - x, a.z - z) > 14));
        if (!c) continue;
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 48), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, c.y + 0.05, c.z); w.group.add(ring);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        fill.rotation.x = -Math.PI / 2; fill.position.set(c.x, c.y + 0.04, c.z); fill.scale.setScalar(0.01); w.group.add(fill);
        for (const k of [1 / 3, 2 / 3]) { const t = new THREE.Mesh(new THREE.RingGeometry(2.6 * k - 0.06, 2.6 * k + 0.06, 48), new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); t.rotation.x = -Math.PI / 2; t.position.set(c.x, c.y + 0.045, c.z); w.group.add(t); (ring.userData.ticks || (ring.userData.ticks = [])).push(t); }
        const light = { pos: V(c.x, c.y + 1, c.z), color: '#ffa040', intensity: 8, range: 10, flame: 0, emit: false, ph: 0, prio: 1.3, steady: true };
        w.lightSources.push(light);
        // a pillar of light that can be seen from anywhere in the area while the altar is unfinished
        const beam = new THREE.Group(); beam.position.set(c.x, c.y, c.z);
        const bm = (r0, r1, op) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 36, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        const b1 = bm(0.5, 1.6, 0.1), b2 = bm(0.18, 0.5, 0.22); b1.position.y = b2.position.y = 18; beam.add(b1); beam.add(b2); w.group.add(beam);
        O.altars.push({ x: c.x, y: c.y, z: c.z, p: 0, done: false, ring, fill, beam, light });
      }
      O.text = () => `祭壇で詠唱せよ — <b>${O.altars.filter((a) => a.done).length}/${O.altars.length}</b>`;
      O.sub = () => '光の柱の円に立ち続ける・ゲージは3段階で固定される・完了ごとに敵が湧く・敵は倒さなくてもよい';
      O.segs = () => O.altars.map((a) => ({ w: 1, k: a.done ? 1 : a.p, cur: !a.done && a.p > 0, ticks: 3, lock: a.done ? 1 : a.lock || 0 }));
      O.progress = () => O.altars.reduce((s, a) => s + (a.done ? 1 : a.p), 0) / Math.max(1, O.altars.length);
    }
    // golden mimic bonus
    if (n >= 2 && r.chance(0.14)) GM.mimicT = r.range(8, 25); else GM.mimicT = -1;
  };
  // Each entry: { n: foes in the wave, target: marked/champion foes among them }
  // Area size: see GM.CAP_BY_STAGE (3 foes in stage 1, rising to 10 from stage 10 on).
  // The number of waves follows the count and the objective (a small fight is a single wave).
  // total foes per area by stage (5 areas each): 1→3, 2-3→4, 4-5→5, 6→6, 7→7, 8→8, 9→9, 10+→10
  GM.CAP_BY_STAGE = [3, 4, 4, 5, 5, 6, 7, 8, 9, 10];
  GM.enemyCap = (n) => G.Run.cap(n);
  const splitN = (total, k) => { const out = []; let left = total; for (let i = 0; i < k; i++) { const v = Math.round(left / (k - i)); out.push(v); left -= v; } return out.sort((a, b) => a - b); };
  GM.wavePlan = function (n, variant, pick) {
    let total = GM.enemyCap(n);
    // curses that add foes raise the count up to 10; whatever doesn't fit becomes extra toughness
    let overflow = 0;
    const extra = Math.round(total * P.stats.extraEnemies);
    if (extra > 0) { const room = Math.max(0, 10 - total); total += Math.min(room, extra); overflow = Math.max(0, extra - room); }
    else if (extra < 0) total = Math.max(2, total + extra);
    if (variant === 'cursed') total += 2; // the cursed arena always brings more than the area cap
    let plan;
    if (pick === 'ritual') plan = splitN(Math.max(3, total), 3).map((v) => ({ n: Math.max(1, v) }));
    else if (pick === 'survive') plan = splitN(total, total <= 5 ? 2 : 3).map((v) => ({ n: Math.max(1, v) }));
    else if (pick === 'hunt') {
      const targets = variant === 'elite' ? (total >= 6 ? 2 : 1) : total >= 6 ? 2 : 1;
      const k = total <= 4 ? 2 : total <= 7 ? 2 : 3;
      plan = splitN(total, k).map((v) => ({ n: Math.max(1, v) }));
      // targets arrive with the later waves
      const last = plan[plan.length - 1]; last.target = targets; last.n = Math.max(last.n, targets);
    } else {
      const k = variant === 'cursed' ? 3 : total <= 3 ? 1 : total <= 6 ? 2 : 3;
      plan = splitN(total, k).map((v) => ({ n: Math.max(1, v) }));
    }
    plan.overflow = overflow;
    return plan;
  };
  GM.startWave = function () {
    const O = GM.objective; if (!O || !O.waves) return;
    const wv = O.waves[O.wave]; if (!wv) return;
    O.wave++;
    O.waveSize = 0; O.waveKilled = 0;
    let tg = wv.target || 0;
    for (let i = 0; i < wv.n; i++) {
      const isT = tg > 0;
      const e = GM.spawnEnemy({ wave: true, elite: isT, mark: isT, champion: isT && O.champion });
      if (!e) continue;
      e.waveFoe = true; e.waveNo = O.wave; O.spawned++; O.waveSize++;
      if (isT) { tg--; O.marked++; G.ui.toast(`${O.champion ? '👑' : '🎯'} 標的出現: ${e.def.name}`, 'warn'); }
    }
    if (O.wave > 1) G.buffs.emit('onWave', { wave: O.wave });
    if (O.kind === 'ritual') { if (O.wave > 1) { G.ui.feed('🕯️ 儀式に呼応し、魔物が這い出た', 'big'); G.ui.banner('増援', '— 儀式に呼応し、魔物が這い出る —'); } }
    else if (O.waves.length > 1) { G.ui.feed(`⚔️ WAVE ${O.wave}/${O.waves.length}`, 'big'); if (O.wave > 1) G.ui.banner(`WAVE ${O.wave} / ${O.waves.length}`, O.wave === O.waves.length ? '— 最終ウェーブ —' : '— 増援が現れた —'); }
    G.sfx.bell && G.sfx.bell();
  };
  function enemyPool(n, biomeKey) {
    const B = biomeKey || G.world.biome;
    const fav = { grave: ['skeleton', 'hound', 'bat', 'wraith', 'gargoyle'], gate: ['skeleton', 'imp', 'spider', 'shaman', 'gargoyle'], halls: ['golem', 'mantis', 'brute', 'shaman', 'spider'], ruin: ['wraith', 'golem', 'worm', 'mantis', 'brute'], abyss: ['wraith', 'shaman', 'golem', 'mantis'], catacombs: ['skeleton', 'bat', 'wraith'], flooded: ['slime', 'worm', 'spider'], forge: ['imp', 'golem', 'brute'], frozen: ['wraith', 'gargoyle', 'golem'], temple: ['spider', 'mantis', 'mushroom'], ruins: ['brute', 'mantis', 'skeleton', 'worm'], sky: ['gargoyle', 'bat', 'wraith', 'golem'], void: ['wraith', 'gargoyle', 'imp', 'slime'], bloodmoon: ['skeleton', 'bat', 'brute', 'wraith'] }[B] || [];
    const k = Math.floor((Math.max(1, G.Run.depthArea(n)) - 1) / 5); // which foes have appeared by this depth
    return G.ENEMIES.filter((e) => !e.special && (e.unlockK ?? 0) <= k).map((e) => [e, (e.variant === 'normal' ? 3 : e.variant === 'abyss' ? 0.5 : 1.4) * (fav.includes(e.plan) ? 2 : 1) * ((e.unlockK ?? 0) === k && k > 0 ? 1.5 : 1)]);
  }
  GM.enemyPool = function (n, biomeKey) { return enemyPool(n, biomeKey);
  }
  GM.spawnEnemy = function (opts) {
    opts = opts || {};
    const w = G.world, r = GM.arng, n = GM.area;
    const pool = enemyPool(n);
    const def = opts.def || r.weighted(pool, (p) => p[1])[0];
    const c = w.randomOpenCell(r, (x, z, idx) => (!w.reachMask || w.reachMask[idx]) && Math.hypot(x - P.pos.x, z - P.pos.z) > (opts.near ? 10 : opts.wave ? 13 : 17) && Math.hypot(x - P.pos.x, z - P.pos.z) < (opts.wave ? 40 : 60));
    if (!c) return null;
    const pos = V(c.x, c.y + (def.flyer ? 3 : 0), c.z);
    const mods = GM.areaMods || { hp: 1, dmg: 1 };
    const elite = opts.elite || r.chance(Math.min(0.24, Math.max(0, n - 2) * 0.016) + (GM.stage === 'cursed' ? 0.3 : 0) + (P.has('pact_elite') ? 0.15 : 0));
    const lvl = G.Run.enemyLv(n) + r.int(0, 1) + (elite ? 2 : 0) + (opts.champion ? 2 : 0);
    const cyc = G.bosses.cycleOf(n);
    const e = G.enemies.spawn(def, lvl, pos, { elite, hpMul: mods.hp * (opts.champion ? 2.2 : 1), scale: (opts.champion ? 1.3 : 1) * (1 + 0.08 * Math.min(3, cyc)) });
    if (cyc > 0) GM.applyCycleVariant(e, cyc);
    e.dmg *= mods.dmg * (opts.champion ? 1.2 : 1);
    // curse-empowered foes (cursed arena / curses that strengthen enemies) wear a violet aura
    if (mods.cursed || P.stats.enemyDmg > 0 || P.stats.enemyHp > 0) { e.cursed = true; e.makeCurseRing(0x9a30ff); }
    if (mods.cursed && GM.stage === 'cursed') e.speed *= 1.12; // the arena's curse also quickens them
    if (opts.champion) { e.champion = true; e.makeCurseRing(0xff3018); }
    if (opts.champion) { e.eliteMod2 = U.pick([{ id: 'regen', icon: '💚' }, { id: 'rage', icon: '😡' }, { id: 'fast', icon: '💨' }]); if (e.eliteMod2.id === 'fast') e.speed *= 1.25; e.def = Object.assign({}, e.def, { name: '覇者・' + e.def.name }); }
    if (opts.mark) { e.marked = true; e.markTarget && e.markTarget(!!opts.champion); }
    G.Depth.onSpawn(e, opts);
    // shock resistance vs. the pile driver: appears from area 16, with levels I–III deeper down
    const dn = G.Run.depthArea(n);
    if (dn >= 16 && !opts.noMut && Math.random() < Math.min(0.7, (dn - 15) * 0.028)) {
      e.pileRes = 1 + (dn >= 28 && Math.random() < 0.55 ? 1 : 0); if (e.pileRes === 2 && dn >= 42 && Math.random() < 0.5) e.pileRes = 3;
      G.save.mark('items', 'mut_pileres');
    }
    return e;
  };
  // after area 50 the same monsters return in deeper colours with new names
  GM.applyCycleVariant = function (e, cyc) {
    e.def = Object.assign({}, e.def, { name: G.bosses.cyclePrefix(cyc) + e.def.name });
    e.cycle = cyc;
    const hue = G.bosses.cycleHue(cyc), M = e.model && e.model.M;
    if (!M) return;
    for (const m of M.all) {
      if (m === M.eye) { m.emissive.setHSL(hue, 1, 0.55); continue; }
      if (m.color) m.color.offsetHSL(hue, 0.06, -0.03);
      if (m.emissive && m.emissive.getHex()) m.emissive.offsetHSL(hue, 0.1, 0);
    }
  };
  // split-offs belong to their parent's wave: they extend that wave's gauge (but not the area kill target)
  GM.onChildSpawn = function (parent, child) {
    const O = GM.objective;
    if (!O || !parent.waveNo) return;
    child.waveNo = parent.waveNo;
    if (parent.waveNo === O.wave) O.waveSize = (O.waveSize || 0) + 1;
  };
  GM.extraSpawned = function () { /* summoned / split foes no longer raise the kill target; waves only end when everything hostile is down */ };
  GM.onEnemyKilled = function (e) {
    if (e.boss) return;
    GM.areaKills++;
    const O = GM.objective;
    if (e.def.id === 'mimic_gold') {
      const v = 160 + GM.area * 25;
      G.combat.coins(v, e.centerPos());
      G.ui.feed(`💰 黄金のミミック撃破！ +${v}`, 'big');
      if (Math.random() < 0.6) { const it = U.pick(G.ITEMS.filter((i) => i.rarity !== 'legendary')); if (P.addItem(it.id, 1)) { G.ui.toast(`${it.icon} ${it.name} を手に入れた`, 'good'); G.ui.gain(it); } }
      return;
    }
    if (!O || GM.areaCleared) return;
    if (O.kind === 'exterminate' && e.waveFoe) O.killed++;
    if (e.waveNo && e.waveNo === O.wave) O.waveKilled = (O.waveKilled || 0) + 1;
    if (O.kind === 'hunt' && e.marked) O.markKilled++;
  };
  // after a clear, anything hostile that is still (or again) standing fades away
  function sweepCleared() {
    if (!GM.clearSweep || !GM.areaCleared) return;
    for (const e of G.enemies.list) {
      if (!e.alive || e.custom || e.ally || e.isTarget || e.def.id === 'mimic_gold') continue;
      G.fx.smoke(e.centerPos(), 6, 1, 0x1a1412, 1, 1);
      e.noReward = true; e.alive = false; e.dying = false; e.remove && e.remove();
    }
  }
  // boss arenas: standing on anything high (pillar tops, walls, towers) is standing in fire
  // standing in fire raises the burn level every 0.5s with no cap (damage grows with it); stepping off cools it fast
  let fireT = 0, fireTick = 0, fireWarnT = 0, fireLv = 0, fireCool = 0, fireEl = null;
  function updateHighFire(dt) {
    const w = G.world;
    let on = false;
    if (w && !P.dead && (w.fireY || (w.fireRects && w.fireRects.length)) && P.grounded) {
      if (w.isBoss && w.fireY && P.pos.y >= w.fireY && P.pos.z < w.fireZ) on = true;
      else if (w.fireRects) for (const r of w.fireRects) if (P.pos.x > r.x0 - 0.3 && P.pos.x < r.x1 + 0.3 && P.pos.z > r.z0 - 0.3 && P.pos.z < r.z1 + 0.3 && Math.abs(P.pos.y - r.y) < 0.6) { on = true; break; }
    }
    if (!fireEl) { fireEl = document.createElement('div'); fireEl.id = 'fire-lv'; document.body.appendChild(fireEl); }
    if (!on) {
      fireT = 0;
      if (fireLv > 0) { fireCool -= dt; if (fireCool <= 0) { fireCool = 0.35; fireLv--; } }
      fireEl.classList.toggle('on', fireLv > 0); if (fireLv > 0) fireEl.textContent = `🔥 炎上 Lv.${fireLv}`;
      return;
    }
    fireT += dt; fireTick -= dt; fireWarnT -= dt; fireCool = 0.35;
    if (Math.random() < dt * (30 + fireLv * 6)) G.fx.flameLick(P.pos.x + U.rand(-0.5, 0.5), P.pos.y + 0.05, P.pos.z + U.rand(-0.5, 0.5), 1.2 + fireLv * 0.08);
    if (fireT < 0.25) return;
    if (fireWarnT <= 0) { fireWarnT = 4; G.ui.toast('🔥 高所は炎に包まれている！ 降りろ！', 'warn'); }
    if (fireTick <= 0) { fireTick = 0.5; fireLv++; G.combat.damagePlayer((4 + GM.area * 0.25) * (1 + (fireLv - 1) * 0.5), { src: 'aoe', elem: 'fire', pos: P.pos.clone() }); }
    fireEl.classList.add('on'); fireEl.textContent = `🔥 炎上 Lv.${fireLv}`;
    fireEl.style.setProperty('--h', Math.max(0, 40 - fireLv * 4));
  }
  // green outline + glow + pillar on the healing basin while the hint is active
  function updateHealHint(dt) {
    const S = GM.shop, w = G.world;
    const want = !!(GM.healHint && S && S.healPos && !S.healUsed && P.hp < P.stats.maxHp * 0.5);
    if (want && S.healHl === undefined) S.healHl = null;
    if (want && !S.healHl) {
      const h = w.miniHeal, g = new THREE.Group(); g.position.copy(h);
      const col = 0x60ff90;
      const outline = new THREE.Mesh(G.Props.PG.oct, new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false })); outline.scale.set(0.9, 1.04, 0.9); outline.position.y = 0.45; outline.renderOrder = 4; g.add(outline);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); glow.scale.set(3, 2.2, 1); glow.position.y = 0.8; glow.renderOrder = 5; g.add(glow);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 8, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); beam.position.y = 4; g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.2, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
      w.group.add(g); S.healHl = { g, outline, glow, beam, ring, k: 0 };
    }
    const hl = S && S.healHl;
    if (!hl) return;
    hl.k = U.damp(hl.k, want ? 1 : 0, want ? 2 : 6, dt);
    const pulse = 0.7 + 0.3 * Math.sin(GM.time * 3);
    hl.outline.material.opacity = 0.9 * hl.k * pulse; hl.glow.material.opacity = 0.4 * hl.k * pulse; hl.beam.material.opacity = 0.16 * hl.k * pulse; hl.ring.material.opacity = 0.6 * hl.k * pulse;
    hl.ring.scale.setScalar(1 + 0.1 * Math.sin(GM.time * 3)); hl.beam.rotation.y += dt * 0.6;
    if (!want && hl.k < 0.01) { w.group.remove(hl.g); hl.beam.geometry.dispose(); hl.ring.geometry.dispose(); hl.outline.material.dispose(); S.healHl = null; }
  }
  function updateObjective(dt) {
    sweepCleared();
    const O = GM.objective;
    if (O && O.tutorial) return G.Tutorial.update(dt);
    if (!O || GM.areaCleared || !['combat', 'elite', 'cursed', 'vault'].includes(GM.stage)) return;
    const n = GM.area;
    const alive = G.enemies.aliveCount();
    GM.spawnT -= dt;
    // wave flow: the next wave arrives once the current one is down (survival waves also arrive on a timer)
    const hostile = G.enemies.list.filter((e) => e.alive && !e.boss && !e.ignoreCount && e.def.id !== 'mimic_gold').length;
    const moreWaves = O.wave < O.waves.length;
    if (moreWaves) {
      const due = O.kind === 'ritual' ? O.wave === 0 || O.altars.filter((a) => a.done).length >= O.wave
        : hostile === 0 || (O.kind === 'survive' && O.wave > 0 && O.t > O.dur * O.wave / O.waves.length);
      if (due) {
        O.waveT -= dt;
        if (O.waveT <= 0) { GM.startWave(); O.waveT = 1.6; }
      } else O.waveT = Math.max(O.waveT, O.wave === 0 ? 0.6 : O.kind === 'ritual' ? 0.8 : 1.6);
    }
    if (O.kind === 'exterminate') {
      if (!moreWaves && hostile === 0 && O.wave > 0) clearArea();
    } else if (O.kind === 'survive') {
      O.t += dt;
      // besides the waves, foes keep pouring in on a steady beat regardless of the area cap (only a hard safety ceiling for performance);
      // the clear stops it and wipes them all
      if (O.wave > 0 && O.t < O.dur - 0.5) {
        O.tickT = (O.tickT ?? 2.5) - dt;
        if (O.tickT <= 0) {
          O.tickT = Math.max(1.6, 3.6 - n * 0.03);
          if (hostile < 28) { const e = GM.spawnEnemy({ wave: true }); if (e) { e.waveFoe = true; O.spawned++; } }
        }
      }
      if (O.t >= O.dur) clearArea();
    } else if (O.kind === 'hunt') {
      if (O.markKilled >= O.targets && !moreWaves) clearArea();
    } else if (O.kind === 'ritual') {
      const DUR = 8;
      let inAltar = null;
      for (const a of O.altars) {
        if (a.done) continue;
        const inside = Math.hypot(P.pos.x - a.x, P.pos.z - a.z) < 2.8 && Math.abs(P.pos.y - a.y) < 2;
        if (inside) {
          inAltar = a;
          a.p = Math.min(1, a.p + dt / DUR);
          const lk = Math.floor(a.p * 3 + 1e-6) / 3;
          if (lk > (a.lock || 0) && a.p < 1) { a.lock = lk; G.sfx.ui('level'); G.fx.ring(V(a.x, a.y, a.z), 2.8 * lk, 0xffd080, 0.5); }
          if (Math.random() < dt * (20 + a.p * 40)) { const an = Math.random() * 6.28; G.fx.add.spawn(a.x + Math.cos(an) * 2.7, a.y + 0.1, a.z + Math.sin(an) * 2.7, 0, 2 + a.p * 3, 0, 0.8, 0.15, 0.02, 1.4, 0.8, 0.3, 1, -0.5, 0.5); }
          // chanting that speeds up and climbs as the rite nears completion
          a.chT = (a.chT || 0) - dt;
          if (a.chT <= 0) { a.chT = 0.55 - a.p * 0.33; G.sfx.chant ? G.sfx.chant(a.p, V(a.x, a.y + 1, a.z)) : G.sfx.crackle(P.pos); }
          if (a.p > 0.85 && !a.nearCue) { a.nearCue = true; G.sfx.ui('level'); }
        } else { a.lock = Math.max(a.lock || 0, Math.floor(a.p * 3 + 1e-6) / 3); a.p = Math.max(a.lock, a.p - dt / 30); if (a.p < 0.8) a.nearCue = false; }
        a.fill.scale.setScalar(Math.max(0.01, a.p));
        a.ring.material.opacity = 0.45 + Math.sin(GM.time * (4 + a.p * 8)) * 0.2 + (inside ? 0.3 : 0);
        if (a.beam) { const k = 0.75 + Math.sin(GM.time * 3 + a.x) * 0.25 + (inside ? 0.5 : 0); a.beam.children[0].material.opacity = 0.08 * k; a.beam.children[1].material.opacity = 0.18 * k; a.beam.rotation.y += dt * 0.4; }
        if (a.p >= 1) { GM.altarDone(a); G.sfx.ritualDone ? G.sfx.ritualDone(V(a.x, a.y + 1, a.z)) : G.sfx.bell(); G.ui.feed(`🕯️ 祭壇の儀式完了（${O.altars.filter((x) => x.done).length}/${O.altars.length}）`, 'big'); G.fx.ring(V(a.x, a.y, a.z), 4, 0xffd080, 0.8); G.fx.flash && G.fx.flash(V(a.x, a.y + 1.5, a.z), 0xffd080, 40, 0.3, 16); }
      }
      // centre gauge with the time left while standing in a circle
      if (inAltar) G.ui.holdRing(inAltar.p, 'pry', { center: `${((1 - inAltar.p) * DUR).toFixed(1)}s`, label: '詠唱中…', cls: 'ritual' });
      GM.ritualMarkers(O);
      if (O.altars.length && O.altars.every((a) => a.done)) clearArea();
      if (!O.altars.length) clearArea();
    }
    // golden mimic
    if (GM.mimicT > 0) {
      GM.mimicT -= dt;
      if (GM.mimicT <= 0) {
        const m = GM.spawnEnemy({ def: G.ENEMY_BY_ID.mimic_gold, near: true });
        if (m) { m.noReward = true; m.escapeT = 30; GM.mimic = m; G.ui.toast('💰 黄金のミミックが現れた！ 逃げられる前に倒せ！', 'good'); G.sfx.coins(6); }
      }
    }
    if (GM.mimic) {
      const m = GM.mimic;
      if (!m.alive) GM.mimic = null;
      else { m.escapeT -= dt; if (m.escapeT <= 0) { G.fx.smoke(m.centerPos(), 12, 1.2, 0x8a7a40, 1, 1); m.alive = false; m.remove(); GM.mimic = null; G.ui.toast('ミミックは逃げてしまった…', 'warn'); } }
    }
  }
  // a finished altar steps back: no pillar, dim green ring, weak light — clearly "done" at a glance
  GM.altarDone = function (a) {
    a.done = true; a.p = 1;
    a.ring.material.color.set(0x70c080); a.ring.material.opacity = 0.22;
    a.fill.material.color.set(0x60a070); a.fill.material.opacity = 0.07; a.fill.scale.setScalar(1);
    if (a.beam) { a.beam.parent && a.beam.parent.remove(a.beam); a.beam = null; }
    for (const t of a.ring.userData.ticks || []) t.visible = false;
    if (a.light) { a.light.intensity = 1.5; a.light.color = '#80d090'; }
  };
  // on-screen markers pointing at unfinished altars (clamped to the screen edge when off-screen)
  GM.ritualMarkers = function (O) {
    let host = document.getElementById('obj-markers');
    if (!host) { host = document.createElement('div'); host.id = 'obj-markers'; G.ui.el.hud.appendChild(host); }
    const W = window.innerWidth, H = window.innerHeight, v = new THREE.Vector3();
    O.altars.forEach((a, i) => {
      let el = host.children[i];
      if (!el) { el = document.createElement('div'); el.className = 'om'; host.appendChild(el); }
      if (a.done || GM.areaCleared) { el.style.display = 'none'; return; }
      v.set(a.x, a.y + 2.2, a.z).project(camera);
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const behind = v.z > 1;
      if (behind) { x = W - x; y = H - 40; }
      const off = behind || x < 30 || x > W - 30 || y < 60 || y > H - 60;
      x = U.clamp(x, 30, W - 30); y = U.clamp(y, 60, H - 60);
      const d = Math.round(Math.hypot(P.pos.x - a.x, P.pos.z - a.z));
      el.style.display = ''; el.style.transform = `translate(${x}px, ${y}px)`;
      el.className = 'om' + (off ? ' off' : '') + (a.p > 0 ? ' prog' : '');
      const html = `<span>🕯️</span><b>${d}m</b>${a.p > 0 ? `<i style="width:${Math.round(a.p * 100)}%"></i>` : ''}`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    });
  };
  GM.clearMarkers = function () { const h = document.getElementById('obj-markers'); if (h) h.innerHTML = ''; };
  function clearArea(opts) {
    if (GM.areaCleared) return;
    if (opts === true) opts = { boss: true };
    opts = opts || {};
    const stage = GM.stage, bossKill = !!opts.boss;
    GM.areaCleared = true; GM.clearSweep = true;
    G.Depth.liftDarkness();
    GM.clearMarkers();
    GM.run.areasCleared++;
    // the abyss hardens the survivor: a little permanent max HP per cleared area
    P.permMaxHp = (P.permMaxHp || 0) + 4; P.recalc();
    G.Rooms2.onAreaClear();
    if (bossKill && G.Run.revivesAllowed()) { P.revives++; setTimeout(() => G.ui.toast(`🪔 守護者の魂を奪い、魂の灯火が一つ灯った（${P.revives}灯）`, 'good'), 1200); }
    const O = GM.objective; if (O) O.done = true;
    for (const e of G.enemies.list) if (e.alive && !e.boss && !e.isTarget && e.def.id !== 'mimic_gold') { G.fx.smoke(e.centerPos(), 6, 1, 0x1a1412, 1, 1); e.noReward = true; e.hp = 0; G.combat.killEnemy(e, { src: 'clear', proc: true }, 0); }
    G.combat.collectAllPickups();
    const n = GM.area;
    const t = GM.time - GM.areaStartT;
    if (!opts.noBase) {
      let base = bossKill ? 420 + n * 45 : 110 + n * 18;
      if (stage === 'cursed') base *= 2;
      if (stage === 'elite') base *= 1.4;
      G.combat.coins(Math.round(base), null, 'エリアクリア');
    }
    const par = 45 + (O && O.total ? O.total * 3 : 40);
    if (!bossKill && stage !== 'trial' && t < par) { const b = Math.round((60 + n * 8) * (P.has('e_speedrun') ? 2 : 1)); setTimeout(() => { G.combat.coins(b, null, '速攻'); G.ui.feed(`⏱ 速攻ボーナス +${b}`, 'big'); }, 500); }
    const flawless = GM.areaDamage <= 0;
    if (flawless && stage !== 'trial') { const b = Math.round((80 + n * 10) * (P.has('e_flawless') ? 2 : 1)); setTimeout(() => { G.combat.coins(b, null, '無傷'); G.ui.feed(`🏅 無傷ボーナス +${b}`, 'big'); }, 900); }
    G.buffs.emit('onAreaClear', { flawless, time: t });
    if (stage !== 'trial') G.ui.banner('AREA CLEAR', bossKill ? '— 守護者は倒れた —' : '— 次の道を選べ —');
    G.sfx.ui('clear');
    if (!(bossKill && G.Run.isLast(GM.area))) G.Areas.openGates(); // the last guardian ends the run: no road onward
    if (stage !== 'boss') setTimeout(() => G.Areas.spawnMiniShop(), 600);
    if (G.save.data.records.bestArea < n) G.save.data.records.bestArea = n;
    G.save.write();
    const reward = opts.reward || (bossKill || stage === 'elite' ? 'boost' : stage === 'cursed' ? 'double' : stage === 'vault' ? 'none' : 'buff');
    if (reward === 'none') { setTimeout(() => GM.healNotice(), 2600); return; }
    if (bossKill && G.Run.isLast(n)) return; // the run is over: the clear screen follows
    GM.rewardPending = { reward, boss: bossKill, n };
    setTimeout(() => GM.giveReward(GM.rewardPending), 1600);
  }
  GM.giveReward = function (rp) {
    if (!rp || GM.rewardPending !== rp && !GM._forceReward) return;
    if (GM.state !== 'playing' || performance.now() < (G.ui.bannerHold || 0)) { setTimeout(() => GM.giveReward(rp), 300); return; }
    const { reward, boss, n } = rp;
    // once the choosing is over (not before: the clear banner and the card screen would drown it) tell a hurt player about the basin
    const fin = () => setTimeout(() => GM.healNotice(), 700);
    if (reward === 'double') GM.offerBuffs(false, { title: 'CURSED SPOILS (1/2)', after: () => setTimeout(() => GM.offerBuffs(true, { title: 'CURSED SPOILS (2/2)', after: fin }), 300) });
    // (the post-boss abyssal pact was retired)
    else GM.offerBuffs(reward === 'boost', { after: fin });
  };
  // below half HP after a clear: point at the paid healing basin of the mini shop (toast + outline / glow until it is used or you are healthy)
  GM.healNotice = function () {
    const S = GM.shop;
    if (!GM.areaCleared || P.dead || !S || !S.healPos || S.healUsed || P.hp >= P.stats.maxHp * 0.5) return;
    GM.healHint = true;
    G.ui.toast(`💚 HPが半分を切っています — 癒しの水盆（${G.Areas.miniHealCost()}🪙）で回復できます`, 'good');
    G.sfx.ui('rare');
  };
  GM.clearArea = clearArea;
  GM.victory = function () {
    if (GM.won || P.dead) return;
    GM.won = true;
    const R = G.Run, first = GM.run.dev ? false : R.markClear();
    const unlock = first && R.cur.id === 'hard' ? 'エクストラ1' : first && R.cur.id === 'extra' && R.cur.lv < 10 ? 'エクストラ' + (R.cur.lv + 1) : null;
    GM.clearRun(); recordRun();
    GM.state = 'modal'; I.exitLock(); G.ui.showHud(false); G.ui.bossBar(null);
    G.sfx.bell && G.sfx.bell(); G.sfx.ui('rare');
    G.ui.victory({ first, unlock });
  };
  GM.onBossDefeated = function (boss) {
    if (G.Run.isLast(GM.area)) {
      G.ui.banner('深淵を制した', `— ${G.Run.label()} クリア —`, true);
      setTimeout(() => GM.victory(), 3800);
    }
    const c = G.world.arenaCenter;
    G.Props.chest(G.world, c.x, c.z, 0, 0, 2);
    if (boss && boss.baseDef && G.BOSS_BY_ID[boss.baseDef.id] && G.BOSS_BY_ID[boss.baseDef.id].final) {
      // the Abyss King: a hoard worthy of the deepest throne
      G.Props.chest(G.world, c.x - 5, c.z + 2, 0, 0.4, 2); G.Props.chest(G.world, c.x + 5, c.z + 2, 0, -0.4, 2);
      P.revives += 2; G.combat.coins(3000 + GM.area * 60, c.clone().setY(1.5), '深淵の王');
      GM.run.kingsSlain = (GM.run.kingsSlain || 0) + 1;
      GM.startDawn();
      setTimeout(() => { G.ui.toast('🪔🪔 魂の灯火が二つ灯った', 'good'); G.ui.banner(`第${GM.run.kingsSlain}の深淵を踏破`, '— だが、深淵はさらに深く続いている —'); }, 2500);
    }
    G.world.flushDeferred();
    G.ui.toast('👑 装飾された宝箱が現れた！', 'good');
    clearArea({ boss: true });
  };
  GM.spawnChestNear = function (tier) {
    const w = G.world;
    const f = P.forward(); f.y = 0; f.normalize();
    for (let d = 2.5; d < 6; d += 0.5) {
      const pt = P.pos.clone().addScaledVector(f, d);
      const g = w.groundAt(V(pt.x, pt.y + 0.5, pt.z), 0.4, 2);
      if (g > -Infinity && w.boxFree(pt.x - 0.7, g + 0.05, pt.z - 0.7, pt.x + 0.7, g + 1, pt.z + 0.7)) { G.Props.chest(w, pt.x, pt.z, g, P.yaw, tier); w.flushDeferred(); G.fx.smoke(pt, 8, 1, 0x8a7a50, 0.5, 1); G.sfx.coins(4); return true; }
    }
    G.combat.coins(150 + GM.area * 20, null, '宝'); return false;
  };
  GM.giveWeapon = function (id) {
    const wd = G.WEAPON_BY_ID[id];
    if (P.weapons.length < P.stats.weaponSlots) { P.weapons.push(G.weapons.make(id)); G.weapons.switchTo(P.weapons.length - 1); }
    else { const old = P.weapons[P.wIdx]; G.Pawn.tradeIn(old); GM.stashAtts(old); P.weapons[P.wIdx] = G.weapons.make(id); G.weapons.equip(false); }
    G.ui.itemCard(wd, '[武器]'); G.ui.refreshWeapon();
  };
  GM.giveSkill = function (id) {
    if (G.SKILL_BY_ID[id] && G.SKILL_BY_ID[id].ult) { P.skills[0] = G.abilities.makeSlot(id); G.ui.itemCard(G.SKILL_BY_ID[id], '[Q アルティメット]'); return; }
    let i = [1, 2, 3].find((k) => !P.skills[k]) || 3;
    P.skills[i] = G.abilities.makeSlot(id);
    G.ui.itemCard(G.SKILL_BY_ID[id], `[${G.input.skillKey(i)}]`);
  };

  // ---------------- buff choices ----------------
  GM.rollBuffs = function (n, boost, filter) {
    const luck = P.stats.luck + (boost ? 1.2 : 0);
    const owned = new Set(P.skills.filter(Boolean).map((s) => s.id));
    const pool = G.BUFFS.filter((b) => b.cat !== 'curse' && (P.buffs.get(b.id) || 0) < b.max && (!b.skill || owned.has(b.skill)) && (filter ? filter(b) : b.cat !== 'pact' && b.cat !== 'relic'));
    const out = [];
    const r = Math.random;
    for (let i = 0; i < n && pool.length; i++) {
      const rar = U.weighted(G.RARITY_ORDER.filter((k) => pool.some((b) => b.rarity === k)), (k) => G.rarityWeight(k, GM.area, luck) * (boost && G.RARITY[k].tier < 2 ? 0.25 : 1), r);
      const cands = pool.filter((b) => b.rarity === rar && !out.includes(b));
      if (!cands.length) continue;
      // prefer mechanics over plain stats a bit
      const b = U.weighted(cands, (b) => (b.skill ? 10 : b.cat === 'stat' ? 0.7 : 1.2), r);
      out.push(b);
    }
    // keep survivability on the table: most offers include at least one defence boon
    if (!filter && out.length >= 2 && !out.some((b) => b.cat === 'defense') && r() < 0.6) {
      const dp = pool.filter((b) => b.cat === 'defense' && !out.includes(b));
      if (dp.length) out[out.length - 1] = U.weighted(dp, (b) => G.rarityWeight(b.rarity, GM.area, luck), r);
    }
    return out;
  };
  GM.offerBuffs = function (boost, o) {
    o = o || {};
    GM.state = 'buff';
    // free the cursor so the cards can be clicked; held movement keys survive the unlock (see input.js)
    I.exitLock();
    let rerolls = P.stats.buffRerolls;
    const done = () => { GM.rewardPending = null; GM.resume(); if (o.after) o.after(); };
    const show = () => {
      let choices = GM.rollBuffs(Math.max(2, P.stats.buffChoices), boost, o.filter);
      if (!choices.length) choices = GM.rollBuffs(3, boost);
      G.ui.buffSelect(choices, {
        rerolls, skipCoins: 60 + GM.area * 6,
        title: o.title || (boost ? 'ROYAL BOON' : 'CHOOSE A BOON'), sub: o.sub || (boost ? '強大な加護 — 一つを選べ' : undefined),
        noSkip: o.noSkip, rerolls: o.noReroll ? 0 : rerolls,
        onPick: (b) => { P.addBuff(b.id); if (o.onPicked) o.onPicked(b); G.ui.toast(`${b.icon} ${b.name} を${b.cat === 'pact' ? '結んだ' : '獲得'}`, b.cat === 'pact' ? 'warn' : 'good'); done(); },
        onReroll: () => { rerolls--; show(); },
        onSkip: () => { G.combat.coins(60 + GM.area * 6, null, 'スキップ'); done(); },
      });
    };
    show();
  };

  // ---------------- shop ----------------
  const BUFF_PRICE = { common: 260, uncommon: 380, rare: 560, epic: 820, legendary: 1200 };
  // prices creep up with depth (income does too) so late coins don't pile up unspent
  GM.price = function (base) { return Math.max(0, Math.round(base * Math.max(0.3, 1 - P.stats.shopDiscount) * (1 + GM.run.shopVisits * 0.05) * (1 + 0.03 * Math.max(0, (GM.area || 1) - 1)) / 10) * 10); };
  function rollRarity(r, luck) { return r.weighted(G.RARITY_ORDER, (k) => G.rarityWeight(k, GM.area, luck)); }
  function pickBy(r, arr, luck) {
    const rar = rollRarity(r, luck);
    let c = arr.filter((o) => o.rarity === rar);
    if (!c.length) c = arr;
    return G.thinFairy(() => r.pick(c));
  }
  GM.pickOffer = function (k, used, r) {
    r = r || new G.RNG((Math.random() * 1e9) >>> 0);
    const luck = P.stats.luck;
    for (let t = 0; t < 14; t++) {
      let c;
      if (k === 'melee') c = pickBy(r, G.MELEE.filter((x) => !G.isDefaultMelee(x.id) && !x.mythic && x.id !== P.melee.id), luck);
      else if (k === 'weapon') c = pickBy(r, G.WEAPONS.filter((x) => x.id !== 'starter' && !x.mythic && !P.weapons.some((pw) => pw.id === x.id)), luck);
      else if (k === 'mythic' || k === 'mythicGun') { const pool = [...G.WEAPONS.filter((x) => x.mythic && !P.weapons.some((pw) => pw.id === x.id)), ...(k === 'mythic' ? G.MELEE.filter((x) => x.mythic && x.id !== P.melee.id) : [])]; c = pool.length ? r.pick(pool) : null; }
      else if (k === 'relic') { const pool = G.BUFFS.filter((b) => b.cat === 'relic' && !P.has(b.id)); c = pool.length ? r.pick(pool) : null; }
      else if (k === 'forge') c = GM.SVC_FORGE;
      else if (k === 'tome') c = P.skills.some((s) => s && (s.lv || 0) < G.abilities.MAXLV) ? GM.SVC_TOME : null;
      else if (k === 'skill') c = pickBy(r, G.SKILLS.filter((x) => !P.skills.some((s) => s && s.id === x.id)), luck);
      else if (k === 'attachment') { const comp = G.ATTACHMENTS.filter((a) => P.weapons.some((pw) => a.compat(pw.def))); c = pickBy(r, comp.length ? comp : G.ATTACHMENTS, luck); }
      else if (k === 'grenade') c = pickBy(r, G.ITEMS.filter((x) => x.cat === 'grenade'), luck);
      else if (k === 'armor') c = pickBy(r, G.ARMOR, luck);
      else if (k === 'util') c = pickBy(r, G.ITEMS.filter((x) => x.cat !== 'grenade'), luck);
      else if (k === 'item') c = pickBy(r, G.ITEMS, luck);
      else if (k === 'pile' || k === 'tech') c = GM.rollBuffs(1, false, G.isTech)[0];
      else if (k === 'ult') c = pickBy(r, G.ULTS.filter((x) => !(P.skills[0] && P.skills[0].id === x.id) && x.id !== G.DEFAULT_ULT), luck);
      else c = GM.rollBuffs(1)[0];
      if (c && !(used && used.has(c.id))) return c;
    }
    return null;
  };
  GM.REVIVE = { id: 'revive_ticket', name: '封魂の灯籠', icon: '🪔', rarity: 'legendary', kind: 'revive', desc: '彷徨う魂を封じた灯籠。魂の灯火が一つ増える。灯火は命尽きた時に燃え、肉体を呼び戻す（HP全快・3秒無敵・周囲の敵を吹き飛ばす）。' };
  GM.revivePrice = () => GM.price(4200 + GM.area * 160);
  GM.SVC_FORGE = { id: 'svc_forge', name: '鍛冶屋の出張', icon: '⚒️', rarity: 'rare', desc: '所持している銃か近接武器を1つ選んで強化値+1（ダメージ×1.13）。' };
  GM.SVC_TOME = { id: 'svc_tome', name: 'スキル強化の書', icon: '📘', rarity: 'epic', desc: '所持スキルを1つ選んでレベル+1（威力×1.3・CT-2%）。' };
  GM.tomePrice = () => GM.price(900 * Math.pow(1.25, Math.min(...P.skills.filter((s) => s).map((s) => s.lv || 0).concat([0]))));
  // relics are capped at 3: a 4th one asks which owned relic to give up for it
  GM.relicSwap = function (ob, o) {
    o = o || {};
    const owned = [...P.buffs.keys()].filter((id) => G.BUFF_BY_ID[id] && G.BUFF_BY_ID[id].cat === 'relic');
    const opts = owned.map((id) => { const r = G.BUFF_BY_ID[id]; return { icon: r.icon, label: `${r.name} を手放す`, sub: r.desc, onPick: () => {
      P.buffs.delete(id); P.recalc();
      P.addBuff(ob.id); G.ui.toast(`🏺 ${r.icon} ${r.name} → ${ob.icon} ${ob.name} に入れ替えた`, 'good'); G.ui.gain(Object.assign({ kind: 'buff' }, ob));
      if (o.onDone) o.onDone();
    } }; });
    opts.push({ icon: '✖', label: o.cancelLabel || 'やめる', sub: o.cancelSub || '', onPick: () => { if (o.onCancel) o.onCancel(); } });
    modal('🏺 遺物がいっぱい — 入れ替える遺物を選ぶ', `${ob.icon} <b>${ob.name}</b>：${ob.desc}<br>遺物は3つまで。手放す遺物を選んでください。`, opts);
  };
  GM.relicCount = () => [...P.buffs.keys()].filter((id) => G.BUFF_BY_ID[id] && G.BUFF_BY_ID[id].cat === 'relic').length;
  // deeper shops stock weapons that are already forged (you pay for it)
  GM.shopLv = () => Math.min(10, Math.floor((G.Run.depthArea(GM.area) - 1) / 5));
  GM.forgeTargets = () => G.weapons.orderList().map((t) => (t === 'm' ? { w: P.melee, gun: false, t } : { w: t, gun: true, t })).filter((x) => (x.w.lv || 0) < G.Areas.FORGE_MAX);
  GM.forgeRange = function () { const c = GM.forgeTargets().map((x) => G.Areas.forgeCost(x.w)); return c.length ? [Math.min(...c), Math.max(...c)] : [0, 0]; };
  GM.priceLabel = (o) => (o.free ? '無料!' : o.kind === 'forge' ? (() => { const [a, b] = GM.forgeRange(); return a === b ? U.fmt(a) : `${U.fmt(a)}~${U.fmt(b)}`; })() : U.fmt(o.price));
  GM.offerPrice = function (kind, obj) {
    if (kind === 'forge') return GM.forgeRange()[0];
    if (kind === 'tome') return GM.tomePrice();
    if ((kind === 'weapon' || kind === 'melee') && !obj.mythic) return GM.price(obj.price * (1 + 0.2 * GM.shopLv()));
    return GM.price(kind === 'buff' ? BUFF_PRICE[obj.rarity] * (G.isTech(obj) ? 1.2 : 1) : obj.price);
  };
  GM.setupShop = function (w) {
    GM.run.shopVisits++;
    const S = GM.shop = { offers: [], rerolls: 0, w };
    GM.fillShop();
    S.lines = ['ほう…生きてここまで来たか。', '金さえあれば、何でも揃うさ。', '深淵の底には何があるか、知りたいかね？', 'この先の守護者は手強いぞ。', '武器は高いが、命よりは安い。', '良い品を選ぶといい。次は無いかもしれん。'];
    S.talkT = 2;
    G.Pawn.setup(w);
    const fr = S.offers.find((o) => o.free);
    if (fr) setTimeout(() => { if (GM.shop === S && !fr.sold) { G.ui.toast(`🎁 常連客特典：${fr.obj.icon} ${fr.obj.name} が無料！ 緑に光る台を探せ`, 'good'); G.sfx.ui('rare'); } }, 2400);
  };
  GM.fillShop = function () {
    const S = GM.shop, w = S.w;
    const r = new G.RNG((GM.seed ^ U.hashStr('shop' + GM.area + ':' + S.rerolls)) >>> 0);
    const luck = P.stats.luck;
    for (const o of S.offers) if (o.mesh) w.group.remove(o.mesh);
    // six booths (slot order = hall layout): weapons (3) / skills (5, the first is always an ultimate) / upgrades + parts (5) / consumables (5) / armour (5) / boons (5)
    const kinds = ['arms', 'arms', 'arms',
      'ult', 'skill', 'skill', 'skill', 'skill',
      'attachment', 'attachment', 'attachment', 'forge', 'tome',
      'item', 'item', 'item', 'item', 'item',
      'armor', 'armor', 'armor', 'armor', 'armor',
      'buff', 'buff', 'buff', 'buff', 'tech'];
    if (GM.area >= 15 && r.chance(0.6)) { kinds[2] = kinds[0]; kinds[0] = 'mythic'; }
    if (GM.area >= 8) kinds[27] = 'relic';
    const used = new Set();
    const offers = [];
    const curW = P.weapon.def;
    let meleeN = 0;
    kinds.forEach((k, i) => {
      // weapon pedestals are fully random between guns and melee, but never more than one melee weapon
      if (k === 'arms') { k = meleeN === 0 && r.chance(G.MELEE.length / (G.MELEE.length + G.WEAPONS.length) * 1.3) ? 'melee' : 'weapon'; if (k === 'melee') meleeN++; }
      if (k === 'mythic' && meleeN > 0) k = 'mythicGun'; // never two melee weapons on the shelves
      let obj = GM.pickOffer(k === 'item' ? (i < 15 ? 'grenade' : 'util') : k, used, r);
      if (obj && k === 'mythic' && obj.kind === 'melee') meleeN++;
      if (k === 'mythicGun') k = 'mythic';
      if (!obj && (k === 'mythic' || k === 'relic' || k === 'tome')) { k = k === 'mythic' ? 'weapon' : k === 'tome' ? 'skill' : 'buff'; obj = GM.pickOffer(k, used, r); }
      if (!obj) return;
      used.add(obj.id);
      const kind = k === 'pile' || k === 'tech' ? 'buff' : k === 'mythic' ? (obj.kind === 'melee' ? 'melee' : 'weapon') : k;
      const inst = kind === 'armor' ? G.Inv.makeArmor(obj.id, () => r.next()) : null; // armour: enchantments are rolled when the shelf is stocked
      offers.push({ kind, obj, inst, price: Math.round(GM.offerPrice(kind, obj) * (inst ? 1 + 0.15 * inst.ench.length : 1) / 10) * 10, sold: false, slot: w.shopSlots[i], lv: (kind === 'weapon' || kind === 'melee') && !obj.mythic ? GM.shopLv() : 0 });
    });
    if (P.has('e_free') && GM.run.freeArea !== GM.area) { const g = offers.filter((o) => o.kind !== 'buff'); if (g.length) { const f = r.pick(g); f.price = 0; f.free = true; GM.run.freeArea = GM.area; } }
    // rare: a revive charm for a fortune
    if (G.Run.revivesAllowed() && r.chance(0.16 + Math.min(0.1, GM.area * 0.004))) { const o = offers.find((x) => x.kind === 'buff' && x.obj.cat !== 'pile'); if (o) { o.kind = 'revive'; o.obj = GM.REVIVE; o.price = GM.revivePrice(); o.free = false; } }
    S.offers = offers;
    for (const o of offers) buildPedestal(o, w);
  };
  GM.buildPedestal = buildPedestal;
  function buildPedestal(o, w) {
    const g = new THREE.Group();
    const s = o.slot;
    g.position.set(s.x, s.y, s.z);
    const rc = G.ui.R(o.obj.rarity);
    let disp;
    if (o.kind === 'weapon' || o.kind === 'melee') {
      disp = o.kind === 'melee' ? G.weapons.meleeDisplayModel(o.obj) : G.weapons.displayModel(o.obj);
      const box = new THREE.Box3().setFromObject(disp); const c = box.getCenter(V()); disp.position.sub(c);
      const wrap = new THREE.Group(); wrap.add(disp); wrap.scale.setScalar(1.3); disp = wrap; disp.position.y = 0.45;
    } else {
      disp = new THREE.Group();
      const PG = G.Props.PG;
      const col = new THREE.Color(rc);
      const m = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.35), metalness: 0.6, roughness: 0.3 });
      if (o.kind === 'forge') { const an = new THREE.Mesh(PG.box, G.weapons.mats.steel); an.scale.set(0.42, 0.14, 0.2); disp.add(an); const hm = new THREE.Mesh(PG.box, w.mats.woodDark); hm.scale.set(0.05, 0.05, 0.36); hm.position.set(0.1, 0.16, 0); hm.rotation.y = 0.6; disp.add(hm); const hh = new THREE.Mesh(PG.box, G.weapons.mats.gun); hh.scale.set(0.12, 0.09, 0.09); hh.position.set(0.18, 0.16, -0.12); disp.add(hh); }
      else if (o.kind === 'tome') { const bk = new THREE.Mesh(PG.box, new THREE.MeshStandardMaterial({ color: 0x2a4aa0, roughness: 0.6, emissive: 0x0a1840 })); bk.scale.set(0.3, 0.07, 0.4); disp.add(bk); const pg = new THREE.Mesh(PG.box, w.mats.candle); pg.scale.set(0.27, 0.05, 0.38); pg.position.x = 0.02; disp.add(pg); const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0x80a0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.setScalar(0.6); disp.add(gl); }
      else if (o.kind === 'armor') { const M = G.ARMOR_MAT_BY_ID[o.obj.mat]; const am = new THREE.MeshStandardMaterial({ color: new THREE.Color(M.col), metalness: o.obj.mat === 'plate' || o.obj.mat === 'chain' ? 0.8 : 0.1, roughness: 0.5 }); const b = new THREE.Mesh(PG.box, am); b.scale.set(0.3, 0.32, 0.16); disp.add(b); const sh = new THREE.Mesh(PG.box, am); sh.scale.set(0.42, 0.08, 0.18); sh.position.y = 0.15; disp.add(sh); }
      else if (o.kind === 'relic') { const rm = new THREE.MeshStandardMaterial({ color: 0xd0a050, metalness: 1, roughness: 0.25, emissive: 0x402008 }); const b = new THREE.Mesh(PG.oct, rm); b.scale.set(0.16, 0.24, 0.16); disp.add(b); const rr = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.012, 6, 32), rm); rr.rotation.x = 1.3; disp.add(rr); const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xffb040, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.setScalar(0.7); disp.add(gl); }
      else if (o.kind === 'revive') {
        // soul lantern: iron frame around a pale flame
        const iron = G.weapons.mats.gun;
        for (const y of [-0.12, 0.12]) { const p = new THREE.Mesh(PG.box, iron); p.scale.set(0.2, 0.025, 0.2); p.position.y = y; disp.add(p); }
        for (const [x, z] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) { const b = new THREE.Mesh(PG.box, iron); b.scale.set(0.02, 0.24, 0.02); b.position.set(x, 0, z); disp.add(b); }
        const cap = new THREE.Mesh(PG.cone, iron); cap.scale.set(0.13, 0.1, 0.13); cap.position.y = 0.18; disp.add(cap);
        const flame = new THREE.Mesh(PG.sph, new THREE.MeshBasicMaterial({ color: 0x9ad8ff })); flame.scale.set(0.05, 0.08, 0.05); disp.add(flame);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0x80c8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.setScalar(0.45); disp.add(halo);
      }
      else if (o.kind === 'skill') { const b = new THREE.Mesh(PG.box, w.mats.woodDark); b.scale.set(0.32, 0.08, 0.42); disp.add(b); const pg = new THREE.Mesh(PG.box, w.mats.candle); pg.scale.set(0.29, 0.07, 0.39); pg.position.y = 0.01; disp.add(pg); const rune = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 24), m); rune.rotation.x = Math.PI / 2; rune.position.y = 0.12; disp.add(rune); }
      else if (o.kind === 'attachment') { const a = new THREE.Mesh(PG.cyl, G.weapons.mats.gun); a.scale.set(0.05, 0.28, 0.05); a.rotation.z = Math.PI / 2; disp.add(a); const b = new THREE.Mesh(PG.box, G.weapons.mats.steel); b.scale.set(0.12, 0.08, 0.1); b.position.y = 0.06; disp.add(b); }
      else if (o.kind === 'item') { if (o.obj.cat === 'grenade') { const a = new THREE.Mesh(PG.sph, G.weapons.mats.gun); a.scale.set(0.11, 0.13, 0.11); disp.add(a); } else { const a = new THREE.Mesh(PG.cyl8, new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.8, roughness: 0.1, emissive: col.clone().multiplyScalar(0.3) })); a.scale.set(0.09, 0.2, 0.09); disp.add(a); const nk = new THREE.Mesh(PG.cyl8, w.mats.woodDark); nk.scale.set(0.035, 0.08, 0.035); nk.position.y = 0.14; disp.add(nk); } }
      else { const orb = new THREE.Mesh(PG.sph, m); orb.scale.setScalar(0.16); disp.add(orb); const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.01, 6, 32), m); r2.rotation.x = 1.2; disp.add(r2); }
      disp.position.y = 0.45; disp.scale.setScalar(1.5);
    }
    g.add(disp);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.iconTex(o.obj.icon, rc), transparent: true, depthWrite: false }));
    icon.scale.setScalar(0.55); icon.position.y = 1.15; g.add(icon);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.textTex(o.free ? '無料!' : '🪙' + GM.priceLabel(o), { color: o.free ? '#8f8' : '#f1d79b', size: 30 }), transparent: true, depthWrite: false }));
    tag.scale.set(0.9, 0.22, 1); tag.position.y = 1.55; g.add(tag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: rc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
    w.group.add(g);
    o.mesh = g; o.disp = disp; o.tag = tag;
    if (o.free) buildFreeHighlight(o, g, disp);
    o.pos = V(s.x, s.y + 0.6, s.z);
    w.lightSources.push({ pos: V(s.x, s.y + 1.2, s.z), color: rc, intensity: G.RARITY[o.obj.rarity].tier >= 3 ? 4 : 2.5, range: 4.5, flame: 0, emit: false, ph: Math.random() * 9, prio: 0.6, steady: true, offer: o });
  }

  // a free item must not be missed: glowing outline on the item, a light pillar and halo visible through walls,
  // a big bouncing "free" tag, sparkles and an on-screen pointer (removed with the pedestal once taken)
  function buildFreeHighlight(o, g, disp) {
    const COL = 0x7dff8a;
    const hull = disp.clone(true);
    const om = new THREE.MeshBasicMaterial({ color: COL, side: THREE.BackSide, transparent: true, opacity: 0.9, depthWrite: false });
    hull.traverse((m) => { if (m.isMesh) m.material = om; else if (m.isSprite) m.visible = false; });
    hull.scale.multiplyScalar(1.12);
    g.add(hull);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: COL, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    glow.scale.set(2.2, 2.2, 1); glow.position.y = 0.6; glow.renderOrder = 6; g.add(glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 4.5; g.add(beam);
    const rings = [0.62, 0.82].map((r) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.07, 40), new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; g.add(m); return m; });
    const big = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.textTex('🎁 無料！', { color: '#9f9', size: 40 }), transparent: true, depthWrite: false, depthTest: false }));
    big.scale.set(1.5, 0.38, 1); big.position.y = 2.05; big.renderOrder = 7; g.add(big);
    o.freeFx = { hull, om, glow, beam, rings, big };
  }
  function updateFreeOffers(dt) {
    const S = GM.shop; let host = document.getElementById('free-markers');
    const list = S ? S.offers.filter((o) => o.free && !o.sold && o.freeFx) : [];
    if (!list.length) { if (host) host.innerHTML = ''; return; }
    if (!host) { host = document.createElement('div'); host.id = 'free-markers'; G.ui.el.hud.appendChild(host); }
    const t = GM.time, Wd = window.innerWidth, Hd = window.innerHeight, v = V();
    list.forEach((o, i) => {
      const f = o.freeFx, p = 0.5 + 0.5 * Math.sin(t * 4);
      f.om.opacity = 0.55 + 0.4 * p; f.glow.material.opacity = 0.35 + 0.3 * p; f.beam.material.opacity = 0.12 + 0.1 * p; f.beam.rotation.y += dt;
      f.rings.forEach((r, k) => { r.scale.setScalar(1 + 0.12 * Math.sin(t * 3 + k * 1.5)); r.material.opacity = 0.5 + 0.4 * Math.sin(t * 3 + k * 1.5); });
      f.big.position.y = 2.05 + Math.abs(Math.sin(t * 3)) * 0.18;
      f.hull.rotation.y = o.disp.rotation.y; f.hull.position.y = o.disp.position.y;
      if (Math.random() < dt * 12) { const a = Math.random() * 6.28; G.fx.add.spawn(o.pos.x + Math.cos(a) * 0.6, o.pos.y - 0.3, o.pos.z + Math.sin(a) * 0.6, 0, U.rand(0.8, 1.6), 0, 1.0, 0.07, 0.01, 0.5, 1, 0.55, 0.9, 0, 0); }
      // screen pointer (clamped to the edge when off-screen)
      let el = host.children[i]; if (!el) { el = document.createElement('div'); el.className = 'fm'; host.appendChild(el); }
      v.copy(o.pos).setY(o.pos.y + 1.8).project(camera);
      let x = (v.x * 0.5 + 0.5) * Wd, y = (-v.y * 0.5 + 0.5) * Hd; const behind = v.z > 1;
      if (behind) { x = Wd - x; y = Hd - 60; }
      const off = behind || x < 40 || x > Wd - 40 || y < 70 || y > Hd - 70;
      x = U.clamp(x, 40, Wd - 40); y = U.clamp(y, 70, Hd - 70);
      el.style.transform = `translate(${x}px, ${y}px)`; el.className = 'fm' + (off ? ' off' : '');
      const html = `<span>🎁</span><b>無料 ${Math.round(Math.hypot(P.pos.x - o.pos.x, P.pos.z - o.pos.z))}m</b>`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    });
    while (host.children.length > list.length) host.lastChild.remove();
  }
  GM.updateFreeOffers = updateFreeOffers;

  // ---------------- interaction ----------------
  let lookTarget = null;
  function updateInteraction(dt) {
    const w = G.world;
    const eye = camera.position, f = P.forward();
    let best = null, bd = 1e9;
    const consider = (pos, r, data, maxDist) => {
      const to = pos.clone().sub(eye); const d = to.length();
      if (d > (maxDist || 3.4)) return;
      const t = to.dot(f); if (t < 0) return;
      const perp = Math.sqrt(Math.max(0, d * d - t * t));
      if (perp < r && d < bd) { bd = d; best = data; }
    };
    if (GM.shop) {
      for (const o of GM.shop.offers) if (!o.sold) consider(o.pos, 0.6, { type: 'offer', o });
      if (GM.stage === 'shop') {
        consider(w.rerollPos.clone().setY(1.0), 0.8, { type: 'reroll' });
        consider(w.fountainPos.clone().setY(1.0), 1.5, { type: 'fountain' }, 4);
      }
      if (GM.shop.mini && !GM.shop.healUsed && GM.shop.healPos) consider(GM.shop.healPos, 0.9, { type: 'miniheal' }, 3.4);
      if (!GM.shop.mini && w.sellPos) consider(w.sellPos, 1.3, { type: 'sell' }, 3.6);
    }
    for (const c of G.Inv.corpses) if (c.e && !c.e.removed) consider(c.e.pos.clone().setY(c.e.pos.y + 0.45), 1.8, { type: 'corpse', c }, 4.4);
    for (const g of G.Inv.ground) consider(g.pos, 0.6, { type: 'loot', g }, 3.2);
    for (const it of w.interactables) {
      if (it.type === 'chest' && it.opened && it.cont && it.cont.items.length) consider(it.pos, 0.9, { type: 'chestOpen', it }, 3.2);
      if (it.type === 'chest' && !it.opened) consider(it.pos, 0.9, { type: 'chest', it }, 3.2);
      else if (it.type === 'npc' && !it.used) consider(it.pos, 1.0, { type: 'npc', it }, 4);
      else if (it.type === 'shrine' && !it.used) consider(it.pos, 1.2, { type: 'shrine', it }, 4);
      else if (it.type === 'anvil') consider(it.pos, 1.2, { type: 'anvil', it }, 4);
    }
    lookTarget = best;
    G.ui.holdRing(-1); // shown again below while a search is running
    updateSearch(dt);
    if (!best) { G.ui.showInteract(null); return; }
    const coins = GM.run.coins;
    if (best.type === 'offer') {
      const o = best.o, ob = o.obj;
      const info = describeOffer(o);
      G.ui.showInteract({ key: 'o' + ob.id + coins + P.wIdx, icon: o.kind === 'armor' ? G.armorIcon(ob) : ob.icon, name: ob.name, rc: G.ui.R(ob.rarity), cat: info.cat, desc: U.esc(ob.desc), stats: info.stats, note: info.note, price: o.kind === 'forge' && !o.free ? GM.priceLabel(o) : o.price, afford: coins >= (o.kind === 'forge' && !o.free ? GM.forgeRange()[0] : o.price), action: info.action || '購入' });
    } else if (best.type === 'sell') {
      G.ui.showInteract({ key: 'sell' + coins, icon: '⚖️', name: '買取屋', rc: '#e0c070', cat: `持ち物を売る（買値の${Math.round(G.Pawn.RATE * 100)}%）`, desc: '武器・近接武器・アタッチメント・アイテム・投擲物を売却できる。初期装備のピストルは売れない。', action: '売る' });
    } else if (best.type === 'reroll') {
      const cost = GM.rerollCost();
      G.ui.showInteract({ key: 'reroll' + coins, icon: '🎲', name: '運命の祭壇', cat: 'ショップの品揃えを入れ替える', desc: '売れ残った商品を全て新しいものに入れ替えます。使う度に価格が上がります。', price: cost, afford: coins >= cost, action: 'リロール' });
    } else if (best.type === 'fountain') {
      const cost = GM.fountainCost();
      if (P.hp >= P.stats.maxHp) { const bc = GM.blessCost(); G.ui.showInteract({ key: 'bless' + coins + (GM.run.blessN || 0), icon: '💖', name: '泉の祝福', cat: '最大HP+12（永続・何度でも）', desc: `HPは満タン。祝福を受けると最大HPが永続的に増える（現在 ${P.stats.maxHp}・購入${GM.run.blessN || 0}回）`, price: bc, afford: coins >= bc, action: '祝福' }); }
      else G.ui.showInteract({ key: 'fount' + coins + Math.round(P.hp), icon: '⛲', name: '癒しの泉', cat: 'HPを全回復する', desc: `現在 HP ${Math.ceil(P.hp)} / ${P.stats.maxHp}`, price: cost, afford: coins >= cost && P.hp < P.stats.maxHp, action: '回復' });
    } else if (best.type === 'miniheal') {
      const cost = G.Areas.miniHealCost();
      G.ui.showInteract({ key: 'mh' + coins + Math.round(P.hp), icon: '⛲', name: '癒しの水盆', cat: 'HPを50%回復（一度だけ）', desc: `現在 HP ${Math.ceil(P.hp)} / ${P.stats.maxHp}`, price: cost, afford: coins >= cost && P.hp < P.stats.maxHp, action: '回復' });
    } else if (best.type === 'npc') {
      G.ui.showInteract({ key: 'npc' + best.it.ev.id, icon: best.it.ev.icon, name: best.it.ev.npc, rc: '#b080e0', cat: '話しかける', desc: '何か用があるようだ…', action: '話す' });
    } else if (best.type === 'shrine') {
      G.ui.showInteract({ key: 'shrine', icon: '⛩️', name: '祈りの祭壇', rc: '#60d0c0', cat: '全回復＋強化を一つ', desc: '一度だけ祈ることができる。', action: '祈る' });
    } else if (best.type === 'anvil') {
      G.ui.showInteract({ key: 'anvil' + coins, icon: '⚒️', name: '鍛冶の金床', rc: '#e08040', cat: '武器・スキルの強化', desc: `${P.weapon.def.name} +${P.weapon.lv || 0}（最大+5）`, action: '鍛える' });
    } else if (best.type === 'corpse') {
      const c = best.c, e = c.e;
      const S = GM.search && GM.search.it === c ? GM.search : null;
      const n = c.cont.items.length;
      G.ui.showInteract({ key: 'corpse' + (S ? 's' : '') + n + (c.searched ? 'o' : ''), icon: '💀', name: `${e.def.name}の亡骸`, rc: '#a89a88', cat: c.searched ? (n ? `中身 ${n}個` : '空っぽ') : `死体を漁る — ${GM.searchDur(2).toFixed(1)}秒`, desc: S ? '漁っている… 目を離したり離れると最初から' : c.searched ? '中身を確認できる' : '一度押すと漁り始める。', action: c.searched ? '開く' : S ? '漁っている…' : '漁る' });
      if (I.hit('interact') && !S) {
        if (c.searched) G.InvUI.open(c.cont, c);
        else GM.startSearch(c, e.pos.clone().setY(e.pos.y + 0.45), 2, '💀', () => { c.searched = true; G.sfx.ui('open'); G.InvUI.open(c.cont, c); }, '死体を漁っている…');
      }
      return;
    } else if (best.type === 'loot') {
      const g = best.g, d = G.Inv.def(g.it);
      G.ui.showInteract({ key: 'loot' + g.it.uid, icon: d.icon, name: d.name + (g.it.n > 1 ? ` ×${g.it.n}` : ''), rc: G.ui.R(d.rarity), cat: '地面に落ちている', desc: '', action: '拾う' });
      if (I.hit('interact')) G.Inv.pickUp(g);
      return;
    } else if (best.type === 'chestOpen') {
      const it = best.it;
      G.ui.showInteract({ key: 'chesto' + it.cont.items.length, icon: it.icon, name: GM.CHEST_NAMES[it.tier], rc: ['#b8b2a7', '#4d9be6', '#f0a030'][it.tier], cat: `中身 ${it.cont.items.length}個`, desc: '', action: '開く' });
      if (I.hit('interact')) G.InvUI.open(it.cont, it);
      return;
    } else if (best.type === 'chest') {
      const it = best.it;
      const S = GM.search && GM.search.it === it ? GM.search : null;
      const dur = GM.searchDur(GM.CHEST_SEARCH[it.tier]);
      G.ui.showInteract({ key: 'chest' + it.tier + (S ? 's' : ''), icon: it.icon, name: GM.CHEST_NAMES[it.tier], rc: ['#b8b2a7', '#4d9be6', '#f0a030'][it.tier], cat: `宝箱 — 探索 ${dur.toFixed(1)}秒`, desc: S ? '探索中… 視点を大きく外したり離れると最初からやり直し' : '一度押すと探索を始める。終わるまで宝箱から目を離さないこと。', action: S ? '探索中…' : '探す' });
      if (I.hit('interact') && !S) GM.startSearch(it, it.pos, GM.CHEST_SEARCH[it.tier], it.icon, () => { G.sfx.chestUnlock && G.sfx.chestUnlock(it.pos); doInteract(best); });
      return;
    }
    if (I.hit('interact')) doInteract(best);
  }
  // ---------------- timed search (chests, corpses): one press, keep looking at it ----------------
  GM.CHEST_SEARCH = [1, 2, 4];
  GM.CHEST_NAMES = ['古びた宝箱', '上等な宝箱', '装飾された宝箱'];
  GM.searchDur = (base) => base / Math.max(0.2, 1 + (P.stats.opSpeed || 0));
  GM.search = null;
  GM.startSearch = function (it, pos, base, icon, onDone, label) {
    GM.search = { it, pos: pos.clone(), t: 0, dur: GM.searchDur(base), icon, onDone, label: label || '探索中…', pryT: 0 };
    G.sfx.mech('boltBack', 0, 0.8);
  };
  GM.cancelSearch = function (why) {
    const S = GM.search; if (!S) return;
    GM.search = null;
    if (S.it && S.it.lid) S.it.lid.rotation.x = 0;
    if (why) { G.sfx.ui('deny'); G.ui.toastSmall(why); }
  };
  function updateSearch(dt) {
    const S = GM.search; if (!S) return;
    if (P.dead || GM.state !== 'playing' || (S.it && (S.it.opened || S.it.looted))) { GM.cancelSearch(); return; }
    const eye = camera.position, f = P.forward();
    const to = S.pos.clone().sub(eye), d = to.length();
    if (d > 4.4) { GM.cancelSearch('離れたので探索をやめた'); return; }
    if (to.normalize().dot(f) < 0.72) { GM.cancelSearch('目を離したので探索をやめた'); return; } // ~44° off the target resets
    S.t += dt;
    const k = Math.min(1, S.t / S.dur);
    const it = S.it;
    if (it && it.lid) it.lid.rotation.x = -Math.min(0.12, k * 0.12) + Math.sin(GM.time * (30 + k * 30)) * (0.006 + k * 0.016);
    S.pryT -= dt;
    if (S.pryT <= 0) { S.pryT = 0.3 - 0.18 * k; G.sfx.chestPry ? G.sfx.chestPry(k, S.pos) : G.sfx.mech('click'); }
    G.ui.holdRing(k, 'pry', { center: S.icon, label: S.label, cls: 'search' });
    if (k >= 1) { GM.search = null; G.ui.holdRing(1, 'done'); S.onDone(); }
  }
  function describeOffer(o) {
    const ob = o.obj;
    let stats = '', note = '', cat = '', action = '購入';
    if (o.kind === 'armor') {
      const d = ob, S = G.ARMOR_SLOT_BY_ID[d.slot], cur = P.equip[d.slot] && G.ARMOR_BY_ID[P.equip[d.slot].id];
      cat = `🛡️ 防具（${S.name}・${G.ARMOR_MAT_BY_ID[d.mat].name}） · ${G.RARITY[d.rarity].name}`;
      stats = `<div>🛡️ 防御力 <b>${d.def}</b>${cur ? ` (${cur.def})` : ''}　⚖️ 重さ <b>${d.weight || 'なし'}</b></div>` + d.fixed.map((f) => `<div style="color:#ffd890">◆ ${f.desc}</div>`).join('') + (o.inst ? o.inst.ench.map((e) => `<div style="color:#c9a0ff">✦ ${G.enchantText(e)}</div>`).join('') : '');
      note = cur ? `装備中: ${cur.name}（購入品はインベントリへ）` : '購入品はインベントリへ（持ち物画面で装備）';
      return { cat, stats, note, action };
    }
    if (o.kind === 'weapon') {
      cat = `${ob.mythic ? '✴️ 神器 · ' : '🔫 '}${ob.cat} · ${G.RARITY[ob.rarity].name}${o.lv ? `　⚒️強化済み +${o.lv}` : ''}`;
      const cur = G.weapons.stats(P.weapon);
      const cmp = (label, a, b, fmt, better) => { const up = better === 'low' ? a < b : a > b; const cls = Math.abs(a - b) < 1e-6 ? '' : up ? 'up' : 'down'; return `<div>${label} <b class="${cls}">${fmt(a)}</b> <span style="opacity:.6">(${fmt(b)})</span></div>`; };
      const nd = ob.dmg * (ob.pellets || 1), cd = cur.dmg * (cur.pellets || 1);
      stats = cmp('💥ダメージ', nd, cd, (v) => Math.round(v)) + cmp('🔁連射', ob.rpm, cur.rpm, (v) => Math.round(v)) + cmp('📊DPS', nd * ob.rpm / 60, cd * cur.rpm / 60, (v) => Math.round(v)) + cmp('📦装弾数', ob.mag, cur.mag, (v) => v) + cmp('♻️リロード', ob.reload, cur.reload, (v) => v.toFixed(1) + 's', 'low') + cmp('🎯拡散', ob.spread, cur.spread, (v) => v.toFixed(1) + '°', 'low');
      if (ob.trait) note += `${G.WEAPON_TRAITS[ob.trait].icon} ${G.WEAPON_TRAITS[ob.trait].name}: ${G.WEAPON_TRAITS[ob.trait].desc}　`;
      if (P.weapons.length >= P.stats.weaponSlots) note += '⚠ 武器スロット満杯：購入時に交換する武器を選択（旧武器は下取り）';
    } else if (o.kind === 'melee') {
      cat = `${ob.mythic ? '✴️ 神器 · ' : '🗡️ '}近接武器（${ob.cat}） · ${G.RARITY[ob.rarity].name}${o.lv ? `　⚒️強化済み +${o.lv}` : ''}`;
      const cur = P.melee.def;
      const cmp = (label, a, b, fmt, better) => { const up = better === 'low' ? a < b : a > b; const cls = Math.abs(a - b) < 1e-6 ? '' : up ? 'up' : 'down'; return `<div>${label} <b class="${cls}">${fmt(a)}</b> <span style="opacity:.6">(${fmt(b)})</span></div>`; };
      stats = cmp('💥ダメージ', ob.dmg, cur.dmg, (v) => Math.round(v)) + cmp('⚡攻撃間隔', ob.swing, cur.swing, (v) => v.toFixed(2) + 's', 'low') + cmp('📊DPS', ob.dmg / ob.swing, cur.dmg / cur.swing, (v) => Math.round(v)) + cmp('📏リーチ', ob.range, cur.range, (v) => v + 'm') + cmp('🔨重撃', ob.heavy[0], cur.heavy[0], (v) => '×' + v) + cmp('👟移動', ob.moveMul, cur.moveMul, (v) => '×' + v.toFixed(2));
      if (ob.traitDesc) note += '✦ ' + ob.traitDesc + '　';
      { const tv = G.Pawn.tradeValue(P.melee, true); if (tv > 0) note += `♻️ 今の${P.melee.def.name}は下取り +${U.fmt(tv)}🪙　`; }
      note += `⚠ 現在の ${cur.icon}${cur.name} と交換（キー3）`;
    } else if (o.kind === 'forge') {
      cat = '⚒️ 強化サービス'; note = `購入時に強化する武器を選ぶ（上限+${G.Areas.FORGE_MAX}）・価格は武器の強化値で変わる`;
    } else if (o.kind === 'tome') {
      cat = '📘 スキル強化'; note = '購入時に強化するスキルを選ぶ：' + P.skills.filter((s) => s).map((s) => `${s.def.icon}Lv${s.lv || 0}`).join(' ');
    } else if (o.kind === 'relic') {
      cat = '🏺 遺物（常時効果・最大3つ）'; note = `所持遺物 ${GM.relicCount()}/3` + (GM.relicCount() >= 3 ? '　⚠ 購入時に手持ちの遺物と入れ替え' : '');
    } else if (o.kind === 'revive') {
      cat = '🪔 魂の灯火 · 伝説'; note = `灯火 ${P.revives} → ${P.revives + 1}`;
    } else if (o.kind === 'attachment') {
      cat = `${G.ATT_SLOTS[ob.slot].icon} アタッチメント（${G.ATT_SLOTS[ob.slot].name}）`;
      const ok = P.weapons.filter((pw) => ob.compat(pw.def));
      if (!ok.length) note = '⚠ 今の武器には装着できない（インベントリに入る）';
      else if (ok.length === 1) { note = `装着先: ${ok[0].def.icon} ${ok[0].def.name}`; if (ok[0].atts[ob.slot]) note += `（${G.ATT_BY_ID[ok[0].atts[ob.slot]].name} と交換・外したものはインベントリへ）`; }
      else note = '購入時に装着する武器を選択';
    } else if (o.kind === 'item') {
      cat = `${G.ITEM_CAT[ob.cat].icon} ${G.ITEM_CAT[ob.cat].name}`;
      if (!P.canAddItem(ob.id)) note = '⚠ 持ち物がいっぱいで持てない';
      const have = ob.cat === 'grenade' ? P.grenades[ob.id] || 0 : P.itemCount(ob.id);
      if (ob.slot === 'c') cat += `　[${G.K('item1')} / ${G.K('item2')}キー: 消耗品]`; else if (ob.passive) cat += '　[常時：持っているだけで発動]';
      if (have) note += ` 所持 ×${have}`;
    } else if (o.kind === 'ult') {
      cat = `🌟 アルティメット（Q） · CT ${ob.cd}秒`;
      const cur = P.skills[0]; note = cur ? `⚠ 現在の ${cur.def.icon} ${cur.def.name} と入れ替え` : 'Qに装備';
    } else if (o.kind === 'skill') {
      cat = `🔮 スキル（${[1, 2, 3].map((i) => G.input.skillKey(i)).join('/')}） · CT ${Math.round(ob.cd * G.abilities.SKILL_CD_MUL)}秒`;
      const free = [1, 2, 3].find((i) => !P.skills[i]);
      if (!free) note = '⚠ スキル枠満杯：購入時に交換するスロットを選択';
      else note = `空きスロット ${G.input.skillKey(free)} に装備`;
    } else {
      const n = P.buffs.get(ob.id) || 0;
      cat = `🌟 加護 · ${G.BUFF_CAT[ob.cat].name}${ob.skill ? ` · ${G.SKILL_BY_ID[ob.skill].icon} ${G.SKILL_BY_ID[ob.skill].name}専用` : ob.cat === 'pile' ? ' · 🔨 パイルドライバー専用' : ''}`;
      if (n) note = `所持 ${n} → ${n + 1}`;
    }
    if (o.free) note = '🎁 常連客特典：無料！ ' + note;
    return { stats, note, cat, action };
  }
  GM.rerollCost = () => GM.price(120 * Math.pow(1.6, GM.shop.rerolls));
  GM.fountainCost = () => GM.price(80 + GM.area * 8);
  GM.blessCost = () => GM.price(350 * Math.pow(1.35, GM.run.blessN || 0));
  function deny(msg) { G.sfx.ui('error'); G.ui.shakeInteract(); if (msg) G.ui.toastSmall(msg); }
  function doInteract(t) {
    const run = GM.run;
    if (t.type === 'chest') { if (t.it.trap) { t.it.opened = true; G.ui.showInteract(null); return G.Areas.springTrap(t.it); } return openChest(t.it); }
    if (t.type === 'npc') return G.Areas.runEvent(t.it);
    if (t.type === 'shrine') return G.Areas.useShrine(t.it);
    if (t.type === 'anvil') return G.Areas.useForge(t.it);
    if (t.type === 'sell') return G.Pawn.open();
    if (t.type === 'miniheal') { const c = G.Areas.miniHealCost(); if (P.hp >= P.stats.maxHp) return deny('❤️ HPは満タン'); if (run.coins < c) return deny('🪙 コインが足りない'); run.coins -= c; GM.shop.healUsed = true; G.combat.heal(P.stats.maxHp * 0.5); G.sfx.heal(); G.sfx.ui('buy'); G.ui.showInteract(null); return; }
    if (t.type === 'reroll') {
      const c = GM.rerollCost(); if (run.coins < c) return deny('🪙 コインが足りない');
      // asks first: it throws away everything still on the shelves
      return modal('🔄 品揃えを入れ替えますか？', `売れ残っている商品が、すべて新しいものに入れ替わります（${U.fmt(c)}🪙）。入れ替えるたびに値段が上がります。`, [
        { icon: '🔄', label: `入れ替える（${U.fmt(c)}🪙）`, onPick: () => { const c2 = GM.rerollCost(); if (run.coins < c2) return deny('🪙 コインが足りない'); run.coins -= c2; GM.shop.rerolls++; GM.fillShop(); G.sfx.ui('rare'); G.sfx.magic(P.pos); G.ui.showInteract(null); } },
        { icon: '↩', label: 'やめる', onPick: () => {} },
      ]);
    }
    if (t.type === 'fountain' && P.hp >= P.stats.maxHp) { const c = GM.blessCost(); if (run.coins < c) return deny('🪙 コインが足りない'); run.coins -= c; run.blessN = (run.blessN || 0) + 1; P.permMaxHp = (P.permMaxHp || 0) + 12; P.recalc(); P.hp = P.stats.maxHp; G.sfx.heal(); G.sfx.ui('rare'); G.fx.ring(P.pos.clone(), 2, 0xff70a0, 0.6); G.ui.toast('💖 泉の祝福 — 最大HP+12', 'good'); G.ui._ikey = null; return; }
    if (t.type === 'fountain') { const c = GM.fountainCost(); if (P.hp >= P.stats.maxHp) return deny('❤️ HPは満タン'); if (run.coins < c) return deny('🪙 コインが足りない'); run.coins -= c; G.combat.heal(9999); G.sfx.heal(); G.sfx.ui('buy'); G.ui._ikey = null; return; }
    if (t.type === 'offer') {
      GM._buying = true; setTimeout(() => { GM._buying = false; }, 0);
      const o = t.o, ob = o.obj;
      if (o.kind === 'forge' && !o.free) o.price = GM.forgeRange()[0];
      if (run.coins < o.price) return deny('🪙 コインが足りない');
      const done = () => { run.coins -= o.price; o.sold = true; GM.quietUntil = performance.now() + 1200; G.sfx.ui('buy'); G.fx.sparks(o.pos, null, 20, 0xffd070, 4); G.fx.ring(o.pos.clone().setY(o.slot.y), 0.8, 0xffd070, 0.5); o.mesh.visible = false; G.ui.showInteract(null); G.ui.toast(`${ob.icon} ${ob.name} を購入`, 'good'); if (o.kind !== 'item' && o.kind !== 'forge' && o.kind !== 'tome') G.ui.itemCard(ob, o.kind === 'skill' ? '[スキル]' : o.kind === 'ult' ? '[Q アルティメット]' : o.kind === 'weapon' ? '[武器]' : o.kind === 'melee' ? '[近接:3]' : o.kind === 'revive' ? '[魂の灯火]' : o.kind === 'attachment' ? '[装着]' : '[加護]'); G.ui.refreshWeapon(); G.ui.refreshItems(); if (o.kind !== 'revive' && o.kind !== 'forge' && o.kind !== 'tome') G.save.mark(o.kind === 'buff' ? 'buffs' : 'items', ob.id); };
      if (o.kind === 'buff') { P.addBuff(ob.id); return done(); }
      if (o.kind === 'armor') { G.Inv.give(P, 'armor', ob.id, 1, { ench: (o.inst && o.inst.ench) || [] }); return done(); }
      if (o.kind === 'revive') { P.revives++; G.sfx.ui('rare'); return done(); }
      if (o.kind === 'relic') { if (GM.relicCount() >= 3) return GM.relicSwap(ob, { onDone: done, cancelLabel: 'やめる（購入しない）' }); P.addBuff(ob.id); return done(); }
      if (o.kind === 'forge') {
        const list = GM.forgeTargets();
        if (!list.length) return deny('全て最大強化');
        return modal('⚒️ どれを鍛える？', `強化値+1（ダメージ×1.13）・強化値が高いほど高くなる`, list.map((x) => { const c = o.free ? 0 : G.Areas.forgeCost(x.w); return { icon: x.w.def.icon, label: `${G.weapons.keyLabel(x.t)}${x.w.def.name} +${x.w.lv || 0} → +${(x.w.lv || 0) + 1}（${o.free ? '無料' : U.fmt(c) + '🪙'}）`, disabled: run.coins < c, onPick: () => { o.price = c; x.w.lv = (x.w.lv || 0) + 1; if (x.gun) { x.w.ver++; if (x.w === P.weapon) G.weapons.equip(true); } done(); G.sfx.mech('magIn'); G.ui.toast(`⚒️ ${x.w.def.name} を +${x.w.lv} に強化した`, 'good'); } }; }));
      }
      if (o.kind === 'tome') {
        const list = P.skills.map((s, i) => [s, i]).filter(([s]) => s && (s.lv || 0) < G.abilities.MAXLV);
        const pileOpt = { icon: '🔨', label: `[${G.input.keyName('crouch')}] パイルドライバー Lv${P.pileLevel()} → Lv${P.pileLevel() + 1}`, onPick: () => { P.pileTome = (P.pileTome || 0) + 1; G.sfx.ui('rare'); done(); } };
        return modal('📘 どのスキルを強化する？', 'レベル+1（スキル：威力×1.3／パイルドライバー：威力+60%／アルティメット：威力×1.25・クールタイム-2%）', [pileOpt].concat(list.map(([s, i]) => ({ icon: s.def.icon, label: `[${G.input.skillKey(i)}]${s.def.ult ? '（ULT）' : ''} ${s.def.name} Lv${s.lv || 0} → Lv${(s.lv || 0) + 1}`, onPick: () => { s.lv = (s.lv || 0) + 1; s.maxCd = G.abilities.cdOf(s); done(); G.sfx.magic(P.pos, 'holy'); } }))));
      }
      if (o.kind === 'melee') { G.Pawn.tradeIn(P.melee, true); P.melee = G.weapons.makeMelee(ob.id); P.melee.lv = o.lv || 0; done(); if (P.meleeMode) G.weapons.melee.equip(false); else G.weapons.setMelee(); return; }
      if (o.kind === 'item') { if (!P.canAddItem(ob.id)) return deny('持ち物がいっぱい'); P.addItem(ob.id, 1); return done(); }
      if (o.kind === 'weapon') {
        const mkW = () => { const nw = G.weapons.make(ob.id); nw.lv = o.lv || 0; nw.ver++; nw.mag = G.weapons.stats(nw).mag; return nw; };
        if (P.weapons.length < P.stats.weaponSlots) { P.weapons.push(mkW()); done(); G.weapons.switchTo(P.weapons.length - 1); return; }
        return modal('交換する武器を選択', `${ob.icon} <b>${ob.name}</b> と交換する武器を選んでください。手放す武器は<b>下取り</b>されます（買値の${Math.round(G.Pawn.RATE * 100)}%${P.has('e_salvage') ? '＋鉄屑回収30%' : ''}・初期装備は0）。`, G.weapons.gunsInOrder().map((pw) => [pw, P.weapons.indexOf(pw)]).map(([pw, i]) => ({ icon: pw.def.icon, label: `${G.weapons.keyLabel(pw)}${pw.def.name}${pw.lv ? ' +' + pw.lv : ''}　→ 下取り +${U.fmt(G.Pawn.tradeValue(pw))}🪙`, sub: G.RARITY[pw.def.rarity].name + (Object.keys(pw.atts).length ? ' · アタッチメント' + Object.keys(pw.atts).length + '個（インベントリへ移動）' : ''), onPick: () => { G.Pawn.tradeIn(pw); GM.stashAtts(pw); P.weapons[i] = mkW(); P.wIdx = i; done(); G.weapons.equip(false); } })));
      }
      if (o.kind === 'ult') { P.skills[0] = G.abilities.makeSlot(ob.id); P.skills[0].cd = 20; G.ui.buildAbilityRow && G.ui.buildAbilityRow(); return done(); }
      if (o.kind === 'skill') {
        const free = [1, 2, 3].find((i) => !P.skills[i]);
        if (free) { P.skills[free] = G.abilities.makeSlot(ob.id); return done(); }
        return modal('交換するスキルスロットを選択', `${ob.icon} <b>${ob.name}</b> を装備するスロットを選んでください（Qはアルティメット専用）。`, P.skills.map((s, i) => [s, i]).filter(([, i]) => i > 0).map(([s, i]) => ({ icon: s.def.icon, label: G.input.skillKey(i) + ': ' + s.def.name, sub: '交換すると失われます', onPick: () => { P.skills[i] = G.abilities.makeSlot(ob.id); done(); } })));
      }
      if (o.kind === 'attachment') {
        const ok = G.weapons.gunsInOrder().map((pw) => [pw, P.weapons.indexOf(pw)]).filter(([pw]) => ob.compat(pw.def));
        if (!ok.length) { P.attStash.push(ob.id); done(); G.ui.toastSmall('🔩 インベントリに入れた（持ち物画面で装着）'); return; }
        const apply = (pw) => { const prev = pw.atts[ob.slot]; if (prev && prev !== ob.id) { P.attStash.push(prev); setTimeout(() => G.ui.toastSmall(`🗃️ 外した ${G.ATT_BY_ID[prev].icon} ${G.ATT_BY_ID[prev].name} はインベントリへ`), 400); } pw.atts[ob.slot] = ob.id; pw.ver++; if (pw === P.weapon) G.weapons.equip(true); done(); };
        if (ok.length === 1) return apply(ok[0][0]);
        return modal('装着する武器を選択', `${ob.icon} <b>${ob.name}</b>（${G.ATT_SLOTS[ob.slot].name}）`, ok.map(([pw]) => ({ icon: pw.def.icon, label: G.weapons.keyLabel(pw) + pw.def.name, sub: pw.atts[ob.slot] ? '交換: ' + G.ATT_BY_ID[pw.atts[ob.slot]].name + '（外したものはインベントリへ）' : '空きスロット', onPick: () => apply(pw) })));
      }
    }
  }
  GM.modal = (t, d, o) => modal(t, d, o);
  function modal(title, desc, options) {
    GM.state = 'modal';
    I.exitLock();
    const wrap = options.map((o) => Object.assign({}, o, { onPick: () => { o.onPick(); if (GM._keepModal) { GM._keepModal = false; return; } GM.resume(); } }));
    G.ui.choice(title, desc, wrap, () => GM.resume());
  }
  const C_orb = (pos) => G.combat.spawnPickup('orb', pos, 15 + GM.area);
  // one item at most per chest; the chest's grade decides how rare it is
  GM.CHEST_RARITY = [
    { common: 55, uncommon: 35, rare: 10 },
    { uncommon: 38, rare: 42, epic: 17, legendary: 3 },
    { rare: 30, epic: 48, legendary: 22 },
  ];
  GM.chestLoot = function (tier, pos) {
    const chance = [0.1, 0.5, 1][tier];
    if (Math.random() >= chance) return null;
    // an ornate chest sometimes holds an attachment for the gun in your hands instead
    if (tier >= 2 && Math.random() < 0.35) {
      const comp = G.ATTACHMENTS.filter((a) => a.compat(P.weapon.def) && !P.weapon.atts[a.slot]);
      if (comp.length) { const a = U.pick(comp); P.weapon.atts[a.slot] = a.id; P.weapon.ver++; G.weapons.equip(true); G.ui.toast(`${a.icon} ${a.name} を装着した！`, 'good'); return a; }
    }
    const W = GM.CHEST_RARITY[tier], ord = G.RARITY_ORDER;
    let rar = U.weighted(Object.keys(W), (k) => W[k]);
    // luck nudges the roll up one grade now and then
    if (P.stats.luck > 0 && Math.random() < Math.min(0.3, P.stats.luck * 0.15)) rar = ord[Math.min(ord.length - 1, ord.indexOf(rar) + 1)];
    let pool = [];
    for (let i = ord.indexOf(rar); i >= 0 && !pool.length; i--) pool = G.ITEMS.filter((x) => x.rarity === ord[i]);
    // early on a plain chest leans towards healing
    if (tier === 0 && GM.area <= 3 && Math.random() < 0.6) { const h = pool.filter((x) => x.cat === 'heal'); if (h.length) pool = h; }
    const itm = G.thinFairy(() => U.pick(pool));
    const R = G.RARITY[itm.rarity];
    if (P.addItem(itm.id, 1)) { G.ui.toast(`${itm.icon} 【${R.name}】${itm.name} を手に入れた`, 'good'); G.ui.gain(itm); }
    else { const c = Math.round((itm.price || 100) * 0.5); G.combat.coins(c, pos.clone().add(V(0, 0.6, 0))); G.ui.toastSmall(`${itm.icon} ${itm.name}（持ちきれないのでコイン${c}枚に）`); }
    return itm;
  };
  function openChest(it) {
    it.opened = true;
    const tier = it.tier;
    G.sfx.mech('boltBack'); G.sfx.stoneGrind(it.pos, 0.4);
    const n = GM.area;
    let coins = Math.round((40 + n * 9) * [1, 2.2, 4][tier] * (1 + P.stats.chestBonus));
    setTimeout(() => {
      G.combat.coins(coins, it.pos.clone().add(V(0, 0.6, 0)));
      G.fx.sparks(it.pos.clone().add(V(0, 0.6, 0)), V(0, 1, 0), 30, 0xffd070, 6);
      G.fx.flash(it.pos, 0xffd070, 40, 0.4, 8);
      G.sfx.coins(8);
      // health orbs sometimes spill out (instead of the old near-guaranteed consumables)
      if (Math.random() < [0.5, 0.6, 0.7][tier]) { const k = tier >= 2 ? U.randi(2, 3) : U.randi(1, 2); for (let i = 0; i < k; i++) C_orb(it.pos.clone().add(V(U.rand(-0.4, 0.4), 0.7, U.rand(-0.4, 0.4)))); }
      G.buffs.emit('onChest', {});
    }, 350);
    it.cont = G.Inv.chestLoot(tier);
    it.openAnim = 0;
    G.ui.showInteract(null);
    G.InvUI.open(it.cont, it);
  }

  // ---------------- transitions ----------------
  function checkTriggers() {
    const w = G.world;
    if (GM.transitioning || !w.exits || GM.state !== 'playing') return;
    for (const t of w.triggers) {
      if (t.kind === 'exit' && t.exit && t.exit.open && P.pos.x > t.x0 && P.pos.x < t.x1 && P.pos.z > t.z0 && P.pos.z < t.z1) {
        GM.transitioning = true;
        G.sfx.whoosh(0.8, 0.8); G.sfx.rumble(1, 0.6);
        document.getElementById('fade').classList.add('on');
        const next = t.exit.type || 'combat';
        setTimeout(() => {
          GM.enterArea(GM.area + 1, next);
          GM.transitioning = false;
          document.getElementById('fade').classList.remove('on');
        }, 650);
        return;
      }
    }
  }

  // ---------------- pause / lock ----------------
  function onLock(locked) {
    if (locked) {
      if (GM.state === 'paused' || GM.state === 'resuming' || GM.state === 'buff' || GM.state === 'modal') { GM.state = 'playing'; G.ui.clearScreen(); G.sfx.resume(); }
    } else if (GM.state === 'playing') pause();
  }
  GM.debug = /debug/.test(location.search);
  // test hook: advance the simulation deterministically without rAF
  GM.step = function (dt, n) { for (let i = 0; i < (n || 1); i++) { update(dt); I.endFrame(); } render(); };
  function pause() {
    if (GM.state !== 'playing' || GM.debug) return;
    GM.state = 'paused';
    I.exitLock();
    G.ui.statusOverlay(false);
    G.ui.pause();
  }
  GM.resume = function () {
    if (I.locked) { GM.state = 'playing'; G.ui.clearScreen(); I.softClear(); return; }
    GM.state = 'resuming';
    G.ui.clearScreen();
    I.softClear();
    I.requestLock();
    // fall back to an explicit click prompt if the browser refuses the lock
    setTimeout(() => { if (GM.state === 'resuming' && !I.locked) G.ui.clickToResume(); }, 400);
  };
  GM.abandon = function () { GM.clearRun(); recordRun(); GM.toTitle(); };
  GM.playerDied = function () {
    GM.state = 'dead';
    G.sfx.death();
    const final = () => { GM.clearRun(); const rec = recordRun(); I.exitLock(); G.ui.showHud(false); G.ui.bossBar(null); G.ui.death({ cause: GM.lastCause, newRecord: rec }); };
    setTimeout(() => {
      if (GM.state !== 'dead') return;
      GM.deathFrozen = true; // the prompt / death screen: the world behind it stands completely still
      if (P.revives > 0) { I.exitLock(); G.ui.revivePrompt(P.revives, GM.lastCause, () => GM.revive(), final); }
      else final();
    }, 1600);
  };
  GM.revive = function () {
    GM.deathFrozen = false;
    P.revives--;
    P.dead = false; P.deathT = 0;
    P.pos.copy(P.lastSafe); P.pos.y += 0.05; P.vel.set(0, 0, 0);
    G.world.depenetrate(P.pos, P.hw, P.height);
    P.hp = P.stats.maxHp; P.invulnT = 3; P.st = {};
    P.grapple.state = 'none'; P.pileState = null;
    // the rebirth blasts everything nearby away
    const c = P.chestPos();
    for (const e of G.enemies.inRadius(c, 9)) { const d = e.pos.clone().sub(P.pos).setY(0); if (d.lengthSq() < 0.01) d.set(1, 0, 0); if (!e.boss && e.knockback) e.knockback(d.normalize(), 16); G.combat.stun(e, 2); }
    G.fx.ring(P.pos.clone().setY(P.pos.y + 0.1), 9, 0xffd070, 0.8); G.fx.flash(c, 0xffe0a0, 60, 0.6, 16); G.fx.sparks(c, null, 40, 0xffd070, 8);
    G.sfx.heal();
    G.ui.toast(`🪔 魂の灯火が燃え尽き、深淵より還った（残り ${P.revives}灯）`, 'good');
    G.ui.showHud(true);
    GM.resume();
  };
  function recordRun() {
    const R = G.save.data.records; let nr = false;
    if (GM.run && GM.run.dev) return false; // debug runs leave no records
    if (GM.area > R.bestArea) { R.bestArea = GM.area; nr = true; }
    if (GM.run.kills > R.bestKills) { R.bestKills = GM.run.kills; nr = true; }
    if (GM.run.coinsTotal > R.bestCoins) R.bestCoins = GM.run.coinsTotal;
    G.save.write();
    return nr;
  }

  // ---------------- world ambience ----------------
  const flameAcc = new Map();
  const FIRE_COL = [0xff4a10, 0xff6a18, 0xff8a28, 0xffb040];
  function updateFireBeds(w, cp, dt) {
    if (!w.fireRects || !w.fireRects.length) return;
    // budget the flames: the nearest beds burn densest, long beams only burn around the camera
    const jobs = []; let want = 0;
    for (const r of w.fireRects) {
      const dx = Math.max(r.x0 - cp.x, 0, cp.x - r.x1), dz = Math.max(r.z0 - cp.z, 0, cp.z - r.z1), d = Math.hypot(dx, dz, r.y - cp.y);
      if (d > 60) continue;
      const sx0 = Math.max(r.x0, cp.x - 22), sx1 = Math.min(r.x1, cp.x + 22), sz0 = Math.max(r.z0, cp.z - 22), sz1 = Math.min(r.z1, cp.z + 22);
      if (sx1 <= sx0 || sz1 <= sz0) continue;
      const rate = Math.max(10, (sx1 - sx0) * (sz1 - sz0) * 28) * (d < 18 ? 1 : d < 35 ? 0.7 : 0.45);
      jobs.push([r, sx0, sx1, sz0, sz1, rate]); want += rate;
    }
    const k = Math.min(1, 1600 / Math.max(1, want));
    for (const [r, sx0, sx1, sz0, sz1, rate] of jobs) {
      r.acc += rate * k * dt;
      while (r.acc >= 1) {
        r.acc -= 1;
        const x = U.rand(sx0, sx1), z = U.rand(sz0, sz1), s = r.low ? U.rand(1.5, 2.3) : U.rand(2.2, 3.6);
        G.fx.flameLick(x, r.y + 0.1, z, s, FIRE_COL[(Math.random() * 4) | 0]);
        // long walkways / beams burn low and clean (they run across the view); short perches roar
        if (r.low) { if (Math.random() < 0.3) G.fx.flame.spawn(x, r.y + 0.2, z, U.rand(-0.2, 0.2), U.rand(1.6, 2.8), U.rand(-0.2, 0.2), U.rand(0.35, 0.55), U.rand(0.6, 0.9), 0.1, 1.8, 0.55, 0.12, 1, -1, 1.2); if (Math.random() < 0.3) G.fx.norm.spawn(x, r.y + 0.2, z, 0, U.rand(1.2, 2), 0, 0.4, 0.5, 0.1, 1.0, 0.35, 0.04, 0.85, -0.8, 1); continue; }
        // tall roaring tongues (well above the rim, so they show from the ground), embers and black smoke
        if (Math.random() < 0.75) G.fx.flame.spawn(x, r.y + 0.3, z, U.rand(-0.35, 0.35), U.rand(3.5, 6.5), U.rand(-0.35, 0.35), U.rand(0.45, 0.8), U.rand(0.9, 1.6), 0.15, 1.8, U.rand(0.45, 0.75), 0.1, 1, -2, 1.1);
        if (Math.random() < 0.18) G.fx.add.spawn(x, r.y + 0.3, z, U.rand(-1, 1), U.rand(2, 5.5), U.rand(-1, 1), U.rand(0.8, 1.7), 0.05, 0.01, 1.7, 0.6, 0.15, 1, -0.4, 0.4);
        // solid (non-additive) flame bodies so the fire still reads as deep orange-red against a bright sky
        if (Math.random() < 0.5) G.fx.norm.spawn(x, r.y + 0.25, z, U.rand(-0.3, 0.3), U.rand(2.2, 4.2), U.rand(-0.3, 0.3), U.rand(0.35, 0.6), U.rand(0.6, 1.0), 0.12, 1.0, U.rand(0.25, 0.45), 0.04, 0.85, -1.2, 1);
        if (Math.random() < 0.16) G.fx.norm.spawn(x, r.y + 1.8, z, U.rand(-0.3, 0.3), U.rand(1.2, 2.2), U.rand(-0.3, 0.3), 2.6, 0.8, 3.0, 0.05, 0.04, 0.04, 0.55, -0.2, 0.3);
      }
    }
  }
  function updateWorldFx(dt) {
    const w = G.world; if (!w) return;
    const cp = camera.position;
    updateFireBeds(w, cp, dt);
    for (const s of w.lightSources) {
      if (!s.emit || !s.flame) continue;
      const d2 = s.pos.distanceToSquared(cp);
      if (d2 > 45 * 45) continue;
      let a = (flameAcc.get(s) || 0) + dt * 16 * Math.min(2.5, s.flame) * (d2 > 25 * 25 ? 0.4 : 1);
      while (a >= 1) { a -= 1; G.fx.flameLick(s.pos.x, s.pos.y, s.pos.z, s.flame); }
      flameAcc.set(s, a);
    }
    GM._ambT = (GM._ambT || 0) - dt;
    if (GM._ambT <= 0) {
      GM._ambT = U.rand(0.6, 2.2);
      if (Math.random() < 0.5 && !w.mats.biome.outdoor) G.sfx.drip(V(cp.x + U.rand(-15, 15), 2, cp.z + U.rand(-15, 15)));
      if (w.mats.biome.outdoor && Math.random() < 0.5) G.sfx.wind && G.sfx.wind(w.mats.biome.outdoor === 'sky' ? 1 : 0.6);
      let near = null, nd = 1e9; for (const s of w.lightSources) if (s.flame > 0.8) { const d = s.pos.distanceToSquared(cp); if (d < nd) { nd = d; near = s; } }
      if (near && nd < 64) G.sfx.crackle(near.pos);
      if (w.lavaZones.length && Math.random() < 0.5) { const z = U.pick(w.lavaZones); G.sfx.lava(V((z.x0 + z.x1) / 2, 0, (z.z0 + z.z1) / 2)); }
    }
    if (skyDome) skyDome.position.copy(cp);
    updateFinalField(dt);
    if (GM.stage === 'boss') updateDread(dt);
    else if (GM.mood && Math.random() < dt * 10) { const c = GM.mood.p; G.fx.add.spawn(cp.x + U.rand(-12, 12), cp.y + U.rand(-1.5, 4), cp.z + U.rand(-12, 12), U.rand(-0.2, 0.2), U.rand(0.1, 0.5), U.rand(-0.2, 0.2), 3, 0.05, 0.01, c[0], c[1], c[2], 0.7, 0, 0); }
    const OUT = w.mats.biome.outdoor;
    if (OUT === 'ruins' && Math.random() < dt * 6) G.fx.norm.spawn(cp.x + U.rand(-14, 14), cp.y + U.rand(5, 9), cp.z + U.rand(-14, 14), U.rand(-0.6, 0.6), -U.rand(0.6, 1.1), U.rand(-0.6, 0.6), 9, 0.07, 0.07, 0.75, 0.5, 0.18, 0.9, 0, 0);
    if (OUT === 'sky' && Math.random() < dt * 8) G.fx.norm.spawn(cp.x + U.rand(-14, 14), cp.y + U.rand(-1, 6), cp.z + U.rand(-14, 14), U.rand(0.6, 1.4), U.rand(-0.05, 0.1), U.rand(-0.2, 0.2), 7, 0.05, 0.05, 1, 0.97, 0.85, 0.7, 0, 0);
    for (const a of w.animated) {
      if (a.kind === 'cloud') { a.m.position.x += a.sp * dt; if (a.m.position.x > w.W / 2 + 330) a.m.position.x -= 660; }
      else if (a.kind === 'islet') a.m.position.y = a.y0 + Math.sin(GM.time * 0.3 + a.ph) * 1.5;
      else if (a.kind === 'spin') a.m.rotation[a.axis || 'y'] += dt * a.sp;
    }
    // ambient dust motes
    if (!OUT && Math.random() < dt * 20) G.fx.norm.spawn(cp.x + U.rand(-12, 12), cp.y + U.rand(-2, 5), cp.z + U.rand(-12, 12), U.rand(-0.1, 0.1), U.rand(-0.05, 0.05), U.rand(-0.1, 0.1), 6, 0.03, 0.03, 0.9, 0.85, 0.75, 0.5, 0, 0);
    for (const a of w.animated) if (a.kind === 'banner') { a.m.rotation.x = Math.sin(GM.time * 1.3 + a.ph) * 0.06; a.m.rotation.z = Math.sin(GM.time * 0.9 + a.ph) * 0.02; }
    // exit portcullis
    for (const ex of w.exits || []) {
      if (ex.open && ex.portcullis && ex.openT < 2) { ex.openT += dt; ex.portcullis.position.y = Math.min(1, ex.openT / 2) * 5.6; }
      if (ex.glow && ex.open) ex.glow.material.opacity = Math.min(0.85, (ex.openT || 0) * 0.4) * (0.8 + Math.sin(GM.time * 2 + ex.idx) * 0.2);
    }
    // chests
    for (const it of w.interactables) if (it.type === 'chest' && it.opened && it.lid && it.openAnim < 1) { it.openAnim = Math.min(1, it.openAnim + dt * 2.5); it.lid.rotation.x = -it.openAnim * 1.9; }
    updateHealHint(dt);
    // once the area is cleared, unopened chests get a faint pulsing highlight (visible through walls) so they aren't forgotten
    for (const it of w.interactables) {
      if (it.type !== 'chest' || !it.mesh) continue;
      const want = GM.areaCleared && !it.opened;
      if (want && !it.hl) {
        const col = it.tier >= 2 ? 0xffc040 : it.tier ? 0x80c0ff : 0xffe0a0;
        const g = new THREE.Group(); g.position.copy(it.pos).setY(it.pos.y - 0.5);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        glow.scale.set(2.4, 1.6, 1); glow.position.y = 0.5; glow.renderOrder = 5; g.add(glow);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        beam.position.y = 3.5; g.add(beam);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
        w.group.add(g); it.hl = { g, glow, beam, ring, k: 0 };
      }
      if (it.hl) {
        const h = it.hl;
        h.k = U.damp(h.k, want ? 1 : 0, want ? 1.5 : 6, dt);
        const pulse = 0.75 + 0.25 * Math.sin(GM.time * 2.4 + it.pos.x);
        h.glow.material.opacity = 0.32 * h.k * pulse;
        h.beam.material.opacity = 0.12 * h.k * pulse;
        h.ring.material.opacity = 0.45 * h.k * pulse;
        h.ring.scale.setScalar(1 + 0.08 * Math.sin(GM.time * 2.4));
        h.beam.rotation.y += dt * 0.5;
        if (!want && h.k < 0.01) { w.group.remove(h.g); h.beam.geometry.dispose(); h.ring.geometry.dispose(); it.hl = null; }
      }
    }
    // spike traps
    for (const h of w.hazards) {
      if (h.kind !== 'spikes' || !h.mesh) continue;
      const prevUp = h.up;
      h.t += dt; const ph = h.t % h.period;
      h.up = ph > h.period - 1.1 ? 1 : 0;
      const target = h.up ? 0 : -0.62;
      h.mesh.position.y = U.damp(h.mesh.position.y, target, h.up ? 30 : 6, dt);
      if (h.up && !prevUp) {
        G.sfx.mech('boltFwd', 0, 1.2);
        const inside = (p) => Math.abs(p.x - h.x) < h.s / 2 && Math.abs(p.z - h.z) < h.s / 2;
        if (inside(P.pos) && P.pos.y < h.y + 0.6) { G.combat.damagePlayer(12 + GM.area * 1.5, { src: 'aoe', pos: V(h.x, h.y, h.z) }); P.vel.y = 6; }
        for (const e of G.enemies.inRadius(V(h.x, h.y, h.z), h.s * 0.7)) if (!e.flyer && Math.abs(e.pos.y - h.y) < 0.6) G.combat.damageEnemy(e, G.combat.scale(40), { src: 'skill', proc: true, noMarker: true });
      }
    }
    // shop merchant idle
    if (GM.shop && GM.stage === 'shop') {
      const S = GM.shop;
      for (const o of S.offers) if (!o.sold && o.disp) { o.disp.rotation.y += dt * 0.8; o.disp.position.y = 0.45 + Math.sin(GM.time * 2 + o.slot.z) * 0.04; }
      updateFreeOffers(dt);
    }
  }

  // ---------------- main loop ----------------
  function frame(now) {
    requestAnimationFrame(frame);
    const PF = G.Perf; if (PF && PF.on) PF.begin(now);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { G.ui.fps(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    try {
      if (GM.state === 'playing' || GM.state === 'dead') update(dt);
      else if (GM.state === 'inv') {
        // inventory / looting: the world keeps going, you don't move or shoot
        // movement keys stay live (the cursor is free, so no looking around); everything else is the UI's
        const mv = new Set(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch'].flatMap((a) => G.BIND[a] || []));
        for (const k of Object.keys(I.keys)) if (!mv.has(k)) I.keys[k] = false;
        for (const k of Object.keys(I.pressed)) if (!mv.has(k)) delete I.pressed[k];
        I.mouse = [false, false, false, false, false]; I.mpressed = [false, false, false, false, false]; I.wheel = 0;
        update(dt);
      }
      else if (GM.state === 'buff') {
        // the boon choice is an overlay: the world keeps running and WASD still moves while the cursor picks a card;
        // number keys belong to the cards and E/skills/items stay idle
        const api = G.ui._buffApi;
        if (api) {
          for (const k in I.pressed) { const m = /^Digit([1-9])$/.exec(k); if (m) api.pick(+m[1] - 1); }
          if (I.wheel) api.move(Math.sign(I.wheel));
          if (I.pressed.Enter || (I.locked && I.mpressed[0])) api.confirm();
          if (I.pressed.KeyR) api.reroll();
          if (I.pressed.Backspace) api.skip();
        }
        for (const k in I.pressed) if (/^Digit|^Key[EQXZGTRF]$|^Enter$|^Backspace$/.test(k)) delete I.pressed[k];
        I.mouse = [false, false, false, false, false]; I.mpressed = [false, false, false, false, false]; I.wheel = 0;
        update(dt);
      }
      else if (GM.state === 'title') titleUpdate(dt);
      else if (GM.state === 'paused' || GM.state === 'modal' || GM.state === 'resuming') { G.fx.update(0, camera, renderer); }
      if (G.ui.layoutCenter) G.ui.layoutCenter();
      render();
    } catch (e) {
      console.error(e);
      if (!GM._errShown) { GM._errShown = true; const f = document.getElementById('fatal'); f.classList.remove('hidden'); f.innerHTML += '<div>⚠ ' + U.esc(e.message) + '<br><small>' + U.esc((e.stack || '').split('\n').slice(0, 3).join(' | ')) + '</small></div>'; setTimeout(() => { GM._errShown = false; }, 4000); }
    }
    I.endFrame();
    if (PF && PF.on) PF.end();
  }
  function update(dt) {
    const S = G.save.data.settings;
    GM.timeScale = P.has('x_slowtime') && G.weapons.adsT > 0.5 ? 0.75 : 1;
    const gdt = dt * GM.timeScale * (GM.dev ? GM.dev.speed : 1);
    GM.time += gdt;
    if (GM.chronoT > 0) { GM.chronoT -= gdt; GM.enemyTimeScale = 1 - GM.chronoSlow; } else GM.enemyTimeScale = 1;
    if (GM.dev) { if (GM.dev.freeze) GM.enemyTimeScale = 0; if (GM.dev.noCd) { for (const s of P.skills) if (s) { s.cd = 0; if (s.maxCharges) s.charges = s.maxCharges; } P.pileCd = 0; P.grappleCd = 0; } }
    if (GM.state === 'dead') { if (GM.deathFrozen) return; P.update(gdt); G.enemies.update(gdt); G.bosses.update(gdt); G.combat.update(gdt); G.fx.update(gdt, camera, renderer); G.LightPool.update(gdt, G.world, camera.position, GM.time); return; }
    P.update(gdt);
    G.weapons.update(gdt);
    G.abilities.update(gdt);
    G.enemies.update(gdt);
    G.bosses.update(gdt);
    if (G.bosses.active) for (const p of G.bosses.active.parts) if (p.alive && !p.removed) G.combat.updateStatus(p, gdt);
    G.combat.update(gdt);
    G.buffs.emit('tick', gdt);
    updateObjective(gdt);
    updateHighFire(gdt);
    G.Fields.update(gdt);
    G.Areas.update(gdt);
    G.Depth.update(gdt);
    G.PStatus.update(gdt);
    G.HudX.update(gdt);
    if (GM.stage === 'boss' && GM.bossStartT > 0) { GM.bossStartT -= gdt; if (GM.bossStartT <= 0) G.bosses.start(G.bosses.forArea(GM.area), GM.area, G.world); }
    updateInteraction(gdt);
    G.Inv.tick(gdt);
    if (G.FieldGen) G.FieldGen.tickDoor(gdt);
    checkTriggers();
    updateWorldFx(gdt);
    G.LightPool.update(gdt, G.world, camera.position, GM.time);
    G.fx.update(gdt, camera, renderer);
    G.ui.update(gdt);
    if (I.wheel === 0 && I.hit('status')) {}
  }
  function titleUpdate(dt) {
    GM.titleT += dt;
    GM.time += dt;
    const w = G.world;
    const t = GM.titleT * 0.05;
    const cx = w.W / 2, cz = w.D / 2, R = Math.min(w.W, w.D) * 0.32;
    camera.position.set(cx + Math.cos(t) * R, 7 + Math.sin(t * 2) * 1.5, cz + Math.sin(t) * R);
    camera.lookAt(cx, 2.5, cz);
    camera.fov = 70; camera.updateProjectionMatrix();
    G.sfx.listener.x = camera.position.x; G.sfx.listener.y = camera.position.y; G.sfx.listener.z = camera.position.z;
    updateWorldFx(dt);
    G.LightPool.update(dt, w, camera.position, GM.time);
    G.fx.update(dt, camera, renderer);
  }
  function render() {
    renderer.clear();
    renderer.render(scene, camera);
    if (GM.state !== 'title' && GM.state !== 'dead') G.weapons.render(renderer);
  }
  G.LIGHT_K = LIGHT_K;
  window.addEventListener('load', boot);
})();
