'use strict';
// Orchestration: renderer, area flow (normal / shop / boss), objectives & waves, shop & chests, buff choices, main loop.
(function () {
  const GM = (G.game = { state: 'loading', time: 0, timeScale: 1, enemyTimeScale: 1, area: 1, seed: 0, run: null, objective: null, chronoT: 0, chronoSlow: 0.4 });
  const U = G.U, I = G.input;
  const V = G.U.V;
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
    // the finer surfaces (gfx.js) are baked on the GPU now that there is one, and the frame's passes (post.js) made ready
    if (G.GFX) G.GFX.upgradeTextures(renderer, G.save.data.settings.quality === 'high' ? 1024 : 512);
    if (G.Post) { try { G.Post.init(renderer); } catch (e) { G.Post.failed = true; } }
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
    G.vfx.init(scene); // (meshes and shaders: areas, waves, domes, pillars, slashes, spikes, fireballs)
    G.weapons.init(renderer); G.weapons.setEnv(G.envTex);
    G.avatar.init(scene);
    G.combat.init(); G.Elem.init(); G.enemies.init(); G.Areas.init(); G.Depth.init(); G.Rooms2.init(); G.MidSave.init(); Object.assign(G.Areas.TYPES, G.Rooms2.TYPES); G.abilities.init(); G.bosses.init(); G.ui.init(); G.bindBuffs(); G.Dev && G.Dev.init();
    I.el = renderer.domElement;
    renderer.domElement.addEventListener('click', () => { if (GM.state === 'playing' && !I.locked) I.requestLock(); });
    G.on('lockchange', onLock);
    G.on('lockerror', () => { if (GM.debug) return; if (GM.state === 'paused' || GM.state === 'resuming' || GM.state === 'playing') { GM.state = 'paused'; G.ui.clickToResume(); } });
    window.addEventListener('resize', onResize); onResize();
    // browsers keep audio muted until the page has been clicked / a key pressed: start the sound with the very first of those, wherever it lands (title screen included)
    { const wake = () => { G.sfx.init(); window.removeEventListener('pointerdown', wake, true); window.removeEventListener('keydown', wake, true); }; window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true); }
    document.addEventListener('visibilitychange', () => { if (document.hidden && GM.state === 'playing') pause(); if (document.hidden) G.sfx.suspend(); else G.sfx.resume(); });
    window.addEventListener('keydown', (e) => {
      // Tab and B open the same screen: gear, bag, weapons + attachments and the full status sheet side by side
      // (also right after closing it: the "click to resume" wait must not swallow the key)
      const invReady = () => !(G.player && G.player.duelLock) && GM.state === 'playing' || GM.state === 'resuming' || (GM.state === 'paused' && !!document.querySelector('#screens .clicklock'));
      if ((G.BIND.status.includes(e.code) || G.BIND.inventory.includes(e.code)) && invReady()) { e.preventDefault(); if (!e.repeat && G.InvUI && !G.InvUI.isOpen()) { if (GM.state !== 'playing') { GM.state = 'playing'; G.ui.clearScreen(); } G.InvUI.open(null); } return; }
      if (e.code === 'Escape' && (GM.state === 'buff')) e.preventDefault();
      // Esc on a menu that can simply be left (a choice / shop / event panel, or the pause menu) goes back to the game
      // (a boon pick is a forced choice and stays as it is; the key-binding screen keeps Esc for cancelling a key capture)
      if (e.code === 'Escape' && !e.repeat && GM.state !== 'playing' && GM.state !== 'resuming' && GM.state !== 'buff' && !document.querySelector('#screens .kc-btn.wait')) {
        // every screen has one button that leaves it (cancel / back / end the deal / resume): Esc presses it
        const cancel = document.querySelector('#screens :is(#c-cancel, #pw-close, #alch-close, #cx-back, #h-back, #s-back, #rs-back, #rs-no, #kc-back, #st-back, #df-back, #p-resume)') || document.querySelector('#dv-close');
        if (cancel) { e.preventDefault(); GM.escCloseT = performance.now(); cancel.click(); }
      }
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
    if (G.Post && G.Post.active) { G.Post.resize(); G.Post.warm(); }
    if (G.Warm) { if (G.Warm.bootAsync) await G.Warm.bootAsync(); else G.Warm.boot(); } // title world + every enemy kind, viewmodel, previews: behind the loading screen, without blocking the page
    // (the faces of the text, asked for at the start: ui.js. Waited for here a while, so that they do not arrive in the middle of play)
    if (G.ui.fontsReady) { ldText.textContent = '書体を準備中…'; await Promise.race([G.ui.fontsReady, new Promise((r) => setTimeout(r, 6000))]); }
    setTimeout(() => document.getElementById('loading').classList.add('done'), 300);
    requestAnimationFrame(frame);
  }
  // graphics settings. High is the full look and is never touched; medium and low trade looks for speed in earnest:
  // render scale, shadows, number of live lights, particle amount, normal maps, draw distance (with the fog thickened to hide it)
  const QP = {
    low: { pr: 0.6, far: 110, fogK: 1.45, lights: 3, keep: 0.25, shadow: false, nm: false, post: false },
    med: { pr: 1.0, far: 220, fogK: 1.12, lights: 5, keep: 0.6, shadow: true, size: 1024, soft: false, nm: true, post: true, msaa: 2 },
    high: { pr: 1.5, far: 400, fogK: 1, lights: 8, keep: 1, shadow: true, size: 2048, soft: true, nm: true, post: true, msaa: 4 },
    // (post: the frame goes through post.js - contact shadow, glow, grade; msaa: its samples, the screen's own smoothing does not reach it)
  };
  GM.QP = QP;
  // normal maps off on low (kept on the material so high / medium bring them back)
  GM.qualityMaterials = function () {
    const q = QP[G.save.data.settings.quality] || QP.high;
    const pass = (root) => root && root.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.isMeshStandardMaterial) continue;
        if (!q.nm && m.normalMap) { m.userData._nm = m.normalMap; m.normalMap = null; m.needsUpdate = true; }
        else if (q.nm && !m.normalMap && m.userData._nm) { m.normalMap = m.userData._nm; m.userData._nm = null; m.needsUpdate = true; }
      }
    });
    pass(scene); pass(G.weapons && G.weapons.vmScene);
  };
  GM.applyQuality = function () {
    const key = G.save.data.settings.quality, q = QP[key] || QP.high;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pr));
    renderer.shadowMap.enabled = q.shadow;
    renderer.shadowMap.type = q.soft === false ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    moon.castShadow = q.shadow;
    const sz = q.size || 1024;
    if (moon.shadow.mapSize.x !== sz) { moon.shadow.mapSize.set(sz, sz); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }
    camera.far = q.far; camera.updateProjectionMatrix();
    if (GM._fogBase !== undefined) { scene.fog.density = GM._fogBase * q.fogK; G.fx.setFog(scene.fog.color.getStyle(), scene.fog.density); }
    G.LightPool.active = q.lights;
    G.fx.keep = q.keep;
    if (G.Post) { G.Post.active = !!q.post && !G.Post.failed; G.Post.msaa = q.msaa || 0; if (!G.Post.active) renderer.setRenderTarget(null); }
    GM.qualityMaterials();
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
    G.Strata.build(w);
    G.Graves.build(w);
    if (G.Gim) G.Gim.build(w); // (the field's own device: the chapel bell, the cracked pillars, ... gimmick.js)
    if (G.Water) G.Water.build(w); // (its water: ripples, splashes, the current, the sound of it: water.js)
    document.querySelectorAll('.exit-mark').forEach((e) => e.remove()); // the last area's gate markers
    const B0 = w.envOverride ? Object.assign({}, w.mats.biome, w.envOverride) : w.mats.biome;
    // the area's sky (skyvary.js): a mood of the field drawn from the run's seed, laid over its light and fog; what falls from it
    // also counts in the fight (weather.js). A guardian's hall always has the field's own sky.
    const sv = G.Sky && GM.stage && GM.stage !== 'title' ? G.Sky.choose(w, GM.area, GM.stage) : null; w.sky = sv;
    const B = G.Sky ? G.Sky.env(B0, sv) : B0;
    GM._fogBase = B.fogD; const qk = (QP[G.save.data.settings.quality] || QP.high);
    scene.fog.color.set(B.fog); scene.fog.density = B.fogD * qk.fogK;
    scene.background = new THREE.Color(B.fog);
    G.fx.setFog(B.fog, B.fogD * qk.fogK);
    G.fx.setLit(Math.min(1, Math.max(0.38, 0.22 + (B.amb || 0.6) * 0.8)));   // (dust and smoke are seen by the light of the place)
    GM.qualityMaterials();
    hemi.color.set(B.hemiS); hemi.groundColor.set(B.hemiG); hemi.intensity = (0.75 + B.amb * 0.6) * (B.hemiI || 1);
    amb.color.set(B.hemiS); amb.intensity = B.amb * 1.3;
    moon.color.set(B.moon); moon.intensity = 1.1 * B.moonI;
    const cx = w.W / 2, cz = w.D / 2, R = Math.max(w.W, w.D) * 0.62;
    if (B.sunDir) moon.position.set(cx + B.sunDir[0] * 70, Math.max(25, B.sunDir[1] * 70), cz + B.sunDir[2] * 70);
    else moon.position.set(cx + 18, 60, cz + 26);
    moon.target.position.set(cx, 0, cz); moon.target.updateMatrixWorld();
    setSky(B);
    if (G.Sky) G.Sky.start(scene, sv);
    if (G.Weather) G.Weather.reset();
    const sc = moon.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 140; sc.updateProjectionMatrix();
    G.abilities.rebuildVisuals();
  }

  // ---------------- the sky of the open-air fields (dungeons keep the fogged void) ----------------
  // One dome, drawn at infinity (the draw distance never cuts it) after everything solid, so that only the sky that shows is shaded.
  // Along each line of sight d it lays down, in this order:
  //  - the air: the field's three colours (zenith, middle, horizon) as scattered light lies - the horizon brighter and warmer toward a
  //    low sun or moon and cooler and duller on the far side, a haze and a tighter aureole round the body; a low sun's far side gets the
  //    earth's shadow, a dull band on the horizon under a band of rose
  //  - stars of many brightnesses (few bright, a great many faint), each its own hue, twinkling (more near the horizon), lost in the haze
  //    low down and under a bright sky or near the moon; a faint band of the galaxy across them
  //  - the moon (a disc with dark seas, lit highlands and a phase; the blood moon dark copper as in an eclipse) or the sun (a hot disc
  //    darkening to its limb, in its glare)
  //  - high streaks of cirrus, then the clouds: one layer seen from below (the line of sight meets a flat sheet, so they crowd toward the
  //    horizon), from a noise baked once into a texture and drifting with the wind; lit on the side of the body with a bright rim against
  //    it, dark under where thick, faded into the horizon's colour far off; under a rain deck, ragged scud running faster beneath it
  //  - a lightning flash lights the clouds from inside; the ground fog veils it all, more the lower one looks (a sky seen through a fog
  //    lying some metres deep over the field: in a thick mist, only a pale dome is left above); under the horizon, the fog's colour.
  // Low quality: the colours and the glow only (uDetail 0); medium: no cirrus and no galaxy (uDetail 1). The field's colours stay the
  // field's: what is added is drawn out of them.
  let skyDome = null, skyMesh = null, skyNoise = null, skyGen = 0;
  // the clouds' noise, baked once on the GPU (tiles both ways): r heaps of cloud (a soft noise with rounded billows), g the finer
  // billows that eat at their edges, b long fibres for cirrus (stretched where they are read), a ragged rolls for scud
  const SKY_BAKE = `precision highp float; varying vec2 vUv;
    float hs(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    vec2 gr(vec2 i, float P, float s){ float a = hs(mod(i, P) + s * 17.31) * 6.2831853; return vec2(cos(a), sin(a)); }
    float pn(vec2 x, float P, float s){ vec2 i = floor(x), f = fract(x), u = f * f * f * (f * (f * 6. - 15.) + 10.);
      return mix(mix(dot(gr(i, P, s), f), dot(gr(i + vec2(1., 0.), P, s), f - vec2(1., 0.)), u.x), mix(dot(gr(i + vec2(0., 1.), P, s), f - vec2(0., 1.)), dot(gr(i + 1., P, s), f - 1.), u.x), u.y); }
    float fb(vec2 uv, float P, float s, int n){ float a = 0., w = .5, t = 0.; for (int k = 0; k < 8; k++) { if (k >= n) break; a += w * pn(uv * P, P, s + float(k)); t += w; w *= .5; P *= 2.; } return a / t; }
    float wo(vec2 uv, float P, float s){ vec2 x = uv * P, i = floor(x), f = fract(x); float d = 9.;
      for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) { vec2 o = vec2(float(z), float(y)), c = mod(i + o, P); d = min(d, length(o + .15 + .7 * vec2(hs(c + s), hs(c + s + 7.7)) - f)); } return d; }
    void main(){
      vec2 uv = vUv, wp = vec2(fb(uv, 3., 41., 4), fb(uv, 3., 43., 4));   // (the place bent by a slow noise: swirls, not round blobs)
      vec2 u2 = uv + wp * .09;
      float n = clamp(fb(u2, 4., 1., 7) * 1.25 + .5, 0., 1.);
      float wf = (1. - wo(u2, 6., 3.)) * .625 + (1. - wo(u2, 12., 5.)) * .25 + (1. - wo(u2, 24., 9.)) * .125;
      float r = clamp(((n - (wf - 1.)) / (2. - wf) - .23) / .74, 0., 1.);
      float g = clamp((1. - abs(fb(uv + wp * .05, 12., 51., 5)) * 2.4) * .35 + (1. - wo(uv + wp * .03, 16., 13.)) * .4 + (1. - wo(uv, 32., 17.)) * .25, 0., 1.);
      float b = clamp(1. - abs(fb(uv + wp * .14, 8., 23., 6)) * 1.8, 0., 1.); b *= b;
      float a = clamp(fb(uv, 6., 31., 6) * 1.3 + .5, 0., 1.);
      gl_FragColor = vec4(r, g, b, a);
    }`;
  function skyNoiseTex() {
    if (skyNoise) return skyNoise;
    const rt = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false, stencilBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
    rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const m = new THREE.ShaderMaterial({ name: 'sky-bake', vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: SKY_BAKE, depthTest: false, depthWrite: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m), sc = new THREE.Scene(); q.frustumCulled = false; sc.add(q);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(prev);
    m.dispose(); q.geometry.dispose();
    GM.skyNoiseRT = rt; // (development: the baked noise can be read back, docs/tools/sky_shots.js)
    return (skyNoise = rt.texture);
  }
  const SKY_VS = `varying vec3 vD;
    void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`;
  const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; uniform vec3 fogc; uniform vec3 sunc;
    uniform float uT; uniform float uDetail; uniform float uPix; uniform float uStars; uniform float uHaze; uniform float uFogD;
    uniform vec4 uCl; uniform vec4 uCl2; uniform vec4 uBody; uniform vec4 uBody2; uniform vec4 uFlash; uniform vec4 uUnder;
    uniform sampler2D tN; varying vec3 vD;
    float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
    vec3 h3(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
    void main(){
      vec3 d = normalize(vD), s = normalize(sun);
      float h = d.y, hp = max(h, 0.), mu = dot(d, s), m0 = max(mu, 0.);
      vec2 dh = normalize(d.xz + vec2(1e-5, 0.)), sh = normalize(s.xz + vec2(1e-5, 0.));
      float az = dot(dh, sh), low = 1. - smoothstep(.05, .6, s.y), isSun = step(.5, uBody.x) * step(uBody.x, 1.5);
      vec3 hue = sunc / max(.001, max(sunc.r, max(sunc.g, sunc.b)));
      vec3 bc = vec3(0.); float bA = 0.;   // (the banks of cloud on the horizon: their colour and cover, laid on last)
      // (the angle round the horizon, 0..1, from whichever of two wraps is smooth here: the texture's level of detail does not jump
      // where the angle wraps round, which drew a thin upright line)
      float az1 = atan(d.z, d.x) / 6.2831853, az2 = fract(az1 + 1.), azS = fwidth(az1) <= fwidth(az2) ? az1 : az2;
      // ---- the air
      float wS = smoothstep(-.4, 1., az);
      vec3 Hs = hor * mix(vec3(1.), .55 + .6 * hue, .45 * low) * (1. + .3 * low);
      vec3 Ha = mix(hor, mid, .3) * (1. - .25 * low);
      vec3 H = mix(Ha, Hs, wS);
      vec3 col = mix(H, mid, 1. - exp(-hp * 6.));
      col = mix(col, top, smoothstep(.12, .95, hp));
      // (the colour is strongest in the low band toward the sun or moon; higher up and on the far side the sky is greyer, as it is)
      // (by day and at dusk the high sky goes to a grey blue: the field's violets and pinks stay low, toward the sun)
      float sat0 = mix(.5, .3, isSun);
      col = mix(vec3(lum(col)) * mix(vec3(1.), vec3(.93, .98, 1.1), isSun), col, sat0 + (1. - sat0) * exp(-hp * 6.) * (.3 + .7 * wS));
      // the earth's shadow on the far side of a low sun: a dull band on the horizon, a band of rose over it
      float bv = (1. - wS) * low * isSun;
      col = mix(col, mix(mid, top, .4) * .8, bv * .45 * (1. - smoothstep(.0, .07, hp)));
      col += hor * hue * bv * .22 * smoothstep(.03, .08, hp) * (1. - smoothstep(.1, .22, hp));
      // the glow of the air round the body, and the haze low down toward it
      vec3 glow = sunc * (pow(m0, 5.) * .04 + pow(m0, 32.) * (.09 - .04 * step(1.5, uBody.x)) + pow(m0, 350.) * .3) * uHaze * (1. - .5 * uBody2.y);
      glow += sunc * hor * exp(-hp * 8.) * pow(max(az, 0.), 3.) * low * .45;
      glow += isSun * sunc * hue * (pow(m0, 40.) * .42 + pow(m0, 9.) * .08) * (.35 + .9 * low) * uHaze;   // (a sun's glare through the haze, wider and warmer the lower it is)
      col += glow;
      if (uDetail < .5) {
        col += sunc * pow(m0, 1800.) * 1.5;   // (low quality: no clouds, no stars, a small disc - and no tone mapping to soften a big one)
      } else {
        vec3 base = col;
        // ---- stars (on the faces of a cube round the eye: a cell, maybe a star in it, at a place and of a brightness of its own)
        if (uStars > 0.) {
          vec3 a = abs(d); vec2 fu; float fc, am;
          if (a.x >= a.y && a.x >= a.z) { fu = d.yz / a.x; fc = d.x > 0. ? 1. : 2.; am = a.x; }
          else if (a.y >= a.z) { fu = d.xz / a.y; fc = d.y > 0. ? 3. : 4.; am = a.y; }
          else { fu = d.xy / a.z; fc = d.z > 0. ? 5. : 6.; am = a.z; }
          vec3 mwn = normalize(vec3(.42, .38, .82));
          float mb = dot(d, mwn), band = exp(-mb * mb / .022);
          vec2 g = fu * 130., ci = floor(g), f = g - ci;
          vec3 r = h3(vec3(ci, fc * 31.7)), r2 = h3(vec3(ci + 71.3, fc * 7.1));
          float pres = step(r.x, .028 * (1. + 2.2 * band));
          float I = .018 * pow(max(r.y, .0015), -.84);
          float pw = uPix * 130. / (am * am);
          float sg = max(pw * .6, .006) * (1. + .1 * log(1. + I * 4.));
          vec2 q = (f - .2 - .6 * r2.xy) / sg;
          float st = exp(-dot(q, q)) * pres * I;
          st *= 1. + (.2 + .45 * (1. - smoothstep(.12, .55, hp))) * sin(uT * (2.6 + 5. * r2.z) + r.z * 40.) * sin(uT * (1.1 + 2. * r.z) + r2.x * 30.);
          vec3 sc = mix(mix(vec3(.74, .84, 1.12), vec3(1.), smoothstep(.0, .45, r.z)), vec3(1.12, .93, .74), smoothstep(.72, 1., r.z));
          // the galaxy's band: a faint glow, torn by dark lanes
          vec3 mw = vec3(0.);
          if (uDetail > 1.5) {   // (medium quality: no galaxy)
            vec2 mq = vec2(atan(dot(d, normalize(cross(mwn, vec3(0., 1., 0.)))), dot(d, normalize(cross(mwn, cross(mwn, vec3(0., 1., 0.)))))) * 1.3, mb * 4.);
            float mt = texture2D(tN, mq * .35).r, ml = texture2D(tN, mq * .9 + .5).a;
            mw = vec3(1., .96, .9) * band * (.4 + .9 * mt) * (1. - .7 * smoothstep(.5, .7, ml) * smoothstep(.25, .0, abs(mb))) * .0035;
          }
          float sky = lum(base), ext = smoothstep(.0, .3, h);
          col += (sc * max(st - sky * 4., 0.) + mw * max(0., 1. - sky * 60.)) * ext * uStars;
        }
        // ---- the sun or the moon
        vec3 up = abs(s.y) > .99 ? vec3(1., 0., 0.) : vec3(0., 1., 0.), bR = normalize(cross(s, up)), bU = cross(bR, s);
        vec2 bq = vec2(dot(d, bR), dot(d, bU)) / uBody.y;
        float br = length(bq), aa = uPix / uBody.y * 1.3, disc = (1. - smoothstep(1. - aa, 1. + aa, br)) * step(0., mu);
        if (uBody.x > .5 && uBody.x < 1.5) {
          float ld = sqrt(max(0., 1. - br * br));
          float ex = smoothstep(.02, .5, s.y);   // (low down, through more air: dimmer, redder - a disc one can look at)
          col += sunc * mix(vec3(1., .55, .28), vec3(1.), ex) * (uBody.w * mix(.5, 1., ex) * disc * (.45 + .55 * ld) + pow(m0, 600.) * 2.2 + pow(m0, 90.) * .35 * uHaze);
        } else if (uBody.x > 1.5) {
          vec3 n = vec3(bq, sqrt(max(0., 1. - dot(bq, bq))));
          float ph = uBody.z, nl = dot(n, vec3(sin(ph) * .8, -sin(ph) * .6, cos(ph)));
          float lit = smoothstep(-.04, .1, nl) * (.82 + .18 * nl);
          float mar = texture2D(tN, bq * .16 + vec2(.37, .61)).a, cr = texture2D(tN, bq * .7 + vec2(.13, .29)).g;
          float alb = 1. - .42 * smoothstep(.5, .62, mar) - .16 * (cr - .5);
          lit *= mix(1., .55 + .45 * smoothstep(-.9, .9, dot(bq, vec2(.7, .7))), uBody2.y);
          vec3 mc = mix(vec3(lum(sunc)) * vec3(1.03, .99, .92), sunc, uBody2.x);
          col += mc * uBody.w * disc * alb * (lit + .02);
        }
        // ---- the clouds' shade and light: the shade lit by the sky overhead, greyer and cooler than the sky's own colours, against
        // the warm of the sun on them; the light as bright beside the sky as sun- or moonlit cloud is (the moon's is the night's whole light)
        vec3 amb = mix(mix(mid, top, .4), H, .25) * .85; amb = mix(vec3(lum(amb)), amb, .55) * mix(vec3(1.), top / max(.0001, lum(top)), .12);
        float skyL = lum(top) * .3 + lum(mid) * .5 + lum(H) * .2;
        vec3 litC = sunc * mix(vec3(1.), hue, low * isSun) * skyL * (isSun > .5 ? 2.4 : 3.2) * (.6 + .4 * m0);
        litC *= mix(vec3(1.), H / max(.0001, max(H.r, max(H.g, H.b))), .3);   // (the light that reaches them has come through the same air)
        vec2 wv = uCl2.xy * (uT * uCl2.z);
        // ---- far cumulus standing on the horizon beyond the hills, as such clouds look from tens of kilometres: hazed and pale, hardly
        // brighter or darker than the sky behind them; only the lit edges of their heads read, their bases are lost in the haze. A
        // section of cloud standing upright: a noise read round the horizon (azimuth) and up it (elevation) at one scale, cloud where it
        // passes a threshold that rises with height, so the outline is the noise's own (no line, no arc). Where banks stand and how high
        // they reach comes from a much slower noise round the horizon. Over the false sky's sea of cloud they rise out of it.
        if (uBody2.z > .001 && h > -.07 && h < .16) {
          // (their foot: some two degrees under the horizon, behind the far hills - from a tower or a bridge too there is no line
          // where they stand - or down in the sea of cloud)
          float base = uBody2.w > .5 ? -.05 : -.035;
          // (on some third to a half of the horizon: read from a blurred level of the noise, so that a bank tapers away over many
          // degrees - read sharp, it ended in an upright edge)
          float pres = smoothstep(.38, .62, texture2D(tN, dh * .4 + vec2(.13, .71), 3.).a);
          float Hm = (uBody2.w > .5 ? .03 : .05) + .08 * pow(texture2D(tN, dh * .8 + vec2(.52, .27), 2.).r, 1.5);   // (two to six degrees over the horizon, now and then eight)
          float e = h - base;
          if (pres > .01 && e < Hm * 1.2) {
            // (24 times round, the finer octaves 3 and 6 times that: whole numbers, so the noise meets itself where the angle wraps round)
            vec2 q = vec2(azS * 24., e * 3.82) + wv * .004;   // (the same scale up as across)
            float n = texture2D(tN, q).r * .62 + texture2D(tN, q * 3. + .31).g * .26 + texture2D(tN, q * 6. + .57).g * .12;
            float nu = texture2D(tN, q + vec2(0., .02)).r * .62 + texture2D(tN, q * 3. + .31 + vec2(0., .06)).g * .26 + texture2D(tN, q * 6. + .57).g * .12;
            // (solid low down, more and more broken toward the tops; toward the ends of a bank the cloud thins out by the noise, not
            // along a line: no slopes like a hill's)
            float k = clamp(e / (Hm * (.15 + .85 * pres)), 0., 1.2), thr = .1 + .66 * pow(k, 2.5) + (1. - pres) * .25;
            float den = smoothstep(thr, thr + .1, n);
            // light: the tops (where the cloud thins upward) and the side toward the sun or moon brighter, lower down greyer
            float lit = clamp((n - nu) * 9. + .35, 0., 1.) * (.55 + .45 * pow(max(az, 0.) * .5 + .5, 2.)) * smoothstep(.0, .7, k);
            vec3 cl = mix(vec3(lum(amb)) * .9, amb, .5) + litC * (.15 + .45 * lit);   // (far off: hardly brighter than the sky behind)
            vec3 air = mix(fogc, H + glow, smoothstep(-.01, .03, h));
            bc = mix(cl, air, .84 - .08 * k);   // (most of the way into the colour of the air)
            bA = den * smoothstep(.0, .6, k) * smoothstep(.01, .3, pres) * uBody2.z;   // (the foot lost in the haze altogether, slowly)
          }
        }
        // ---- clouds
        float ca = 0., cs = 0.;
        if (uCl.x > .001) {
          float hh = hp + .045;
          vec2 cp = d.xz / hh, uv = cp * uCl2.w + wv;
          float far = 1. - exp(-.07 / hh);
          // the sky's broad reaches: some clearer, some more clouded
          vec4 nl = texture2D(tN, uv * .23 + wv * .3 + .61);
          float cov = clamp(uCl.x + (nl.a - .5) * .7 * (1. - uCl.x * uCl.x), 0., 1.);
          // a heavy deck ends somewhere: low toward a low sun, its edge, and the light coming in under it - and nowhere else
          float gap = .9 * low * isSun * pow(max(az, 0.), 2.) * (1. - smoothstep(.03, .32, hp)) * smoothstep(.6, .9, uCl.x);
          cov = clamp(cov - gap, 0., 1.);
          // high cirrus: fibres drawn out along the wind, in patches, catching the light
          if (uCl.z > .001 && uDetail > 1.5) {   // (medium quality: no cirrus)
            vec2 cq = cp * .4, rq = vec2(dot(cq, uCl2.xy), dot(cq, vec2(-uCl2.y, uCl2.x)));
            vec2 cw = texture2D(tN, vec2(rq.x * .035, rq.y * .12) + wv * .3 + .17).ga - .5;   // (a slow bend along the streaks, here and there a hook)
            rq.y += cw.x * .18 + cw.y * abs(cw.y) * .5;
            // (a smooth noise drawn out a dozen times along the wind: fine streaks side by side, long and short - not the closed
            // loops a ridged noise makes)
            float fi = texture2D(tN, vec2(rq.x * .16, rq.y * 2.) + wv * .9 + .41).a;
            // (along each fibre: where it breaks off, thickens and thins; across: finer threads fraying off it)
            // (each fibre its own: where it breaks, how thick and how dense, read at its own place across the streaks)
            float brk = texture2D(tN, vec2(rq.x * 2.6, rq.y * 7.) + .23).r, fr = texture2D(tN, vec2(rq.x * 1.1, rq.y * 11.) + .67).g;
            float wdt = .8 - .22 * brk;
            float cia = smoothstep(wdt - .08, wdt + .05, fi + (fr - .5) * .1) * smoothstep(.2, .55, brk) * (.3 + .7 * fr * fr)
              * (.35 + .65 * smoothstep(-.2, .3, cw.y)) * smoothstep(.5, .8, nl.r) * uCl.z * smoothstep(.0, .14, h) * (1. - far * .85);
            col = mix(col, amb + litC * (.55 + 1.5 * pow(m0, 6.)), cia * .5);
          }
          float gd = texture2D(tN, uv * 3.3 + wv * .45 + .37).g;
          float t0 = .72 - .84 * pow(cov, 1.4), sf = .05 + .22 * uCl.y;   // (from a few heaps to a deck closed from horizon to horizon)
          t0 = mix(t0, -.7, smoothstep(.85, .97, uCl.x) * (1. - smoothstep(.0, .25, gap)));   // (a closed deck: no stray hole in it)
          vec2 uw = uv + (nl.gb - .5) * .05;   // (the heaps bent a little by the broad noise: no two alike)
          float xr = texture2D(tN, uw).r, x = xr - (1. - gd) * .45 * (1. - xr);   // (the fine billows eat at the thin edges, hardly at the cores)
          // how deep into the cloud this is (its edge thin and bright against the light, its core and base in its own shade), and how
          // much cloud lies between here and the body (a step toward it in the layer)
          float den = smoothstep(t0, t0 + sf, x), thick = smoothstep(t0, t0 + .28, x);
          float xr2 = texture2D(tN, uw + sh * .028).r, x2 = xr2 - (1. - gd) * .45 * (1. - xr2);
          float sunL = exp(-smoothstep(t0, t0 + .28, x2) * (1.3 + 2.4 * uCl.y));
          float sil = pow(m0, 5.) * den * (1. - thick) * 2.2;
          float oc = smoothstep(.6, 1., cov);   // (a closed deck: lit from below by the light of the land and the air, never black)
          vec3 cb = max(amb, fogc * mix(1.6, .8, smoothstep(.02, .15, lum(fogc))) * oc);
          vec3 cc = cb * (.85 - (.35 + .35 * uCl.y) * thick * (1. - .5 * oc)) + litC * (sunL * (.5 + .45 * (1. - uCl.y)) + sil);
          // a closed deck is not one grey: its underside sags and rolls, darker where it hangs lowest; round the hidden body it glows through
          cc *= mix(1., .35 + 1.3 * (1. - smoothstep(.15, .9, x)), max(uCl.y, .5) * oc);
          cc += litC * pow(m0, 14.) * .7 * thick * uCl.y;
          cc = mix(cc, vec3(lum(cc)), .3 * uBody2.x);   // (under a blood-red moon the clouds stay greyer than the sky's own red)
          cc += uUnder.rgb * uUnder.a * thick * exp(-hp * 4.);
          cc = mix(cc, H + glow, far * .8);
          ca = den * smoothstep(-.005, .05, h) * (1. - far * .5 * (1. - oc));
          cs = thick * (.75 + .25 * gd) * (.25 + .75 * smoothstep(.25, .95, xr) * smoothstep(.2, .8, nl.r));   // (what a flash inside lights up: the bulk of the cloud, in great uneven masses)
          // (the cloud layer passes in front of the banks; low down it is so drawn out toward the horizon that it would cut them in
          // upright strips: there, only as much as it shows itself)
          col = mix(col, cc, ca); bA *= 1. - ca * (1. - far);
          // scud under a rain deck: ragged rolls, lower and faster, darker
          if (uCl.w > .001) {
            float sd = texture2D(tN, d.xz / (hp + .03) * uCl2.w * 1.7 + wv * 2.6).a;
            float sa = smoothstep(.5, .8, sd) * uCl.w * smoothstep(.0, .05, h) * (1. - far * .5);
            col = mix(col, col * .78 + amb * .04, sa * .7); ca = max(ca, sa); cs = mix(cs, cs * .85, sa);   // (in a flash: lit as the deck behind it)
          }
        }
        // ---- a lightning flash: the clouds lit from inside round where it is, the whole sky a little
        if (uFlash.w > 0.) col += vec3(.75, .82, 1.) * uFlash.w * (exp(-(1. - dot(d, normalize(uFlash.xyz))) * 6.) * (.05 + ca * (.06 + .75 * cs)) + .02 * ca) * smoothstep(-.02, .1, h);
      }
      // ---- the ground fog seen through (a layer some metres deep: the longer the way through it, the more it veils), and under the horizon
      float fl = 7. / max(h, .02), tr = exp(-uFogD * uFogD * fl * fl), fv = tr * smoothstep(-.01, .03, h);
      col = mix(fogc, col, fv);
      if (bA > 0.) col = mix(col, mix(fogc, bc, max(fv, .8)), bA);
      col += vec3(.75, .82, 1.) * uFlash.w * .05 * (1. - fv) * step(.5, uDetail);   // (a flash lights the low murk too)
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`;
  // the field's clouds (from its sky mood): cover, darkness of the deck, cirrus, scud, wind speed (1: some 0.006 layer heights a second),
  // the scale of the heaps and the banks on the horizon; under: a glow from below (fires on the ground)
  const SKY_CL = [0.3, 0.3, 0.3, 0, 1, 1, 0];   // (the seventh: how much of the horizon has banks of cloud standing on it)
  function skyBody(B) {
    if (B.outdoor === 'void') return 0; // (the last guardian's void: the eclipse is a thing of its own, levelgen.js)
    return (B.body || ((B.night || B.stars) ? 'moon' : 'sun')) === 'moon' ? 2 : 1;
  }
  // The dome and its material are made once and kept; each area only sets their values. (A material thrown away takes its shader
  // with it, and the next open-air area had to compile that again, all at once, in the middle of the change of area.)
  function skyMake() {
    if (skyMesh) return skyMesh;
    const C = () => new THREE.Color(), V4 = (x, y, z, w) => new THREE.Vector4(x || 0, y || 0, z || 0, w || 0);
    const mat = new THREE.ShaderMaterial({
      name: 'sky', side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      uniforms: {
        top: { value: C() }, mid: { value: C() }, hor: { value: C() }, sun: { value: new THREE.Vector3(0, 1, 0) }, fogc: { value: C() }, sunc: { value: new THREE.Vector3(1, 0.85, 0.6) },
        tN: { value: skyNoiseTex() }, uT: { value: 0 }, uDetail: { value: 2 }, uPix: { value: 0.0015 }, uStars: { value: 0 }, uHaze: { value: 1 }, uFogD: { value: 0 },
        uCl: { value: V4() }, uCl2: { value: V4(1) }, uBody: { value: V4(1, 0.013, 0, 40) }, uBody2: { value: V4() }, uFlash: { value: V4(0, 1) }, uUnder: { value: V4() },
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, extensions: { derivatives: true },
    });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
    skyMesh.renderOrder = 50; skyMesh.frustumCulled = false;   // (after the solid world: only the sky that shows is shaded)
    return skyMesh;
  }
  function setSky(B) {
    if (skyDome) { scene.remove(skyDome); skyDome = null; }
    skyGen++;
    if (!B.outdoor && !(B.sky && B.sunDir)) return; // (the great shaft is roofless: its night sky shows through the opening)
    const m = skyMake(), u = m.material.uniforms;
    const cl = Object.assign([], SKY_CL, B.cl || []), body = skyBody(B), key = B.name || '';
    // the wind's way and the moon's phase: fixed for the field (from its name: no dice of the area are thrown here)
    const hk = (U.hashStr ? U.hashStr('sky:' + key) : 7) >>> 0, wa = (hk % 6283) / 1000, sunc = u.sunc.value.set(...(B.sunCol || [1.0, 0.85, 0.6]));
    const tint = body === 2 && Math.max(sunc.x, sunc.y, sunc.z) / Math.max(0.001, Math.min(sunc.x, sunc.y, sunc.z)) > 2.5 ? 0.9 : 0.25;  // (a blood-red moon keeps its colour; a pale one is near white)
    const phase = B.phase ?? (tint > 0.5 ? 0 : 0.25 + ((hk >>> 8) % 1000) / 1000 * 1.1);
    u.top.value.set(B.sky[0]); u.mid.value.set(B.sky[1]); u.hor.value.set(B.sky[2]); u.fogc.value.set(B.fog); u.sun.value.set(...B.sunDir).normalize();
    u.uT.value = GM.time % 3600; u.uStars.value = B.stars ? 1 : 0; u.uHaze.value = B.haze || 1; u.uFogD.value = scene.fog.density;
    u.uCl.value.set(cl[0], cl[1], cl[2], cl[3]); u.uCl2.value.set(Math.cos(wa), Math.sin(wa), cl[4] * 0.006 * cl[5] * 0.12, cl[5] * 0.12);
    u.uBody.value.set(body, body === 2 ? 0.023 : 0.013, phase, body === 2 ? (tint > 0.5 ? 0.4 : 1.9) : 40); u.uBody2.value.set(tint, tint > 0.5 ? 1 : 0, cl[6], 0);
    u.uFlash.value.set(0, 1, 0, 0);
    if (B.under) { const ug = new THREE.Color(B.under[0]); u.uUnder.value.set(ug.r, ug.g, ug.b, B.under[1]); } else u.uUnder.value.set(0, 0, 0, 0);
    u.uBody2.value.w = B.outdoor === 'sky' ? 1 : 0;   // (an island in the air: under the horizon is more sky, a sea of cloud)
    m.visible = true; skyDome = m; scene.add(m);
    scene.background = new THREE.Color(B.sky[2]);
    skyTick();
  }
  // behind the loading screen (warmup.js): the dome's shader and the clouds' noise made now, not with the first open-air area. The dome
  // is put in the scene for the shaders to be compiled with it; what is returned takes it out again (if the area has no sky)
  GM.skyWarm = function () { const m = skyMake(); if (m.parent) return null; scene.add(m); return () => { if (m !== skyDome && m.parent) m.parent.remove(m); }; };
  // every frame: the sky's clock, the size of a pixel (the stars stay points when the view zooms), quality, lightning, the fog's thickness
  const skyPx = new THREE.Vector2();
  function skyTick() {
    if (!skyDome) return;
    const u = skyDome.material.uniforms, q = G.save.data.settings.quality, S = G.Sky;
    u.uT.value = GM.time % 3600;
    u.uDetail.value = q === 'low' ? 0 : q === 'med' ? 1 : 2;
    renderer.getDrawingBufferSize(skyPx);
    u.uPix.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, skyPx.y);
    u.uFogD.value = scene.fog.density;
    const fa = S && S.flashA ? S.flashA : 0; u.uFlash.value.w = fa;
    if (fa > 0 && S.flashDir) u.uFlash.value.set(S.flashDir[0], S.flashDir[1], S.flashDir[2], fa);
  }
  GM.skyTick = skyTick;

  // ---------------- stage mood: special areas tint the whole scene ----------------
  const MOODS = {
    cursed: { c: '#7a1aa0', k: 0.5, fog: 1.4, amb: 0.75, vig: 'rgba(80,10,110,0.75)', p: [0.6, 0.25, 0.9] },
    elite: { c: '#9a1a10', k: 0.32, fog: 1.15, amb: 0.9, vig: 'rgba(110,10,0,0.55)', p: [1, 0.35, 0.2] },
    vault: { c: '#c8962a', k: 0.3, fog: 1.0, amb: 1.05, vig: 'rgba(120,80,10,0.4)', p: [1, 0.85, 0.4] },
    trial: { c: '#2a78b8', k: 0.28, fog: 0.9, amb: 1.05, vig: 'rgba(10,50,100,0.4)', p: [0.5, 0.8, 1] },
    shrine: { c: '#2aa898', k: 0.32, fog: 0.85, amb: 1.1, vig: 'rgba(10,80,70,0.35)', p: [0.5, 1, 0.9] },
    event: { c: '#7048b0', k: 0.25, fog: 1.0, amb: 0.95, vig: 'rgba(50,20,90,0.4)', p: [0.75, 0.6, 1] },
    forge: { c: '#d05010', k: 0.32, fog: 1.05, amb: 1.0, vig: 'rgba(120,40,0,0.45)', p: [1, 0.5, 0.15] },
    alchemy: { c: '#28a868', k: 0.28, fog: 0.95, amb: 1.05, vig: 'rgba(10,75,45,0.4)', p: [0.4, 1, 0.7] },
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
  // the last guardian's sky stage: k 0..1 turns the whole scene into deep space (black sky, almost no fog, cold light); the guardian's own
  // star sphere does the stars (bosses6.js). Reset when a new area starts.
  GM.setSpace = function (k) { GM.spaceK = k; };
  const SPACE = { fog: new THREE.Color('#06030c'), bg: new THREE.Color('#020106'), hemi: new THREE.Color('#9a86d0'), moon: new THREE.Color('#d8c8ff') };
  function applySpace() {
    const k = GM.spaceK || 0;
    if (skyDome) skyDome.visible = k < 0.85;
    if (k <= 0) return;
    scene.fog.color.lerp(SPACE.fog, k); scene.fog.density = U.lerp(scene.fog.density, 0.0028, k);
    if (scene.background && scene.background.isColor) scene.background.lerp(SPACE.bg, k);
    hemi.color.lerp(SPACE.hemi, k * 0.8); hemi.intensity = U.lerp(hemi.intensity, 0.85, k);
    moon.color.lerp(SPACE.moon, k); moon.intensity = U.lerp(moon.intensity, 1.6, k); amb.intensity = U.lerp(amb.intensity, 0.55, k);
  }
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
      GM._dark = { dome: skyGen, env: scene.environment, lk: G.LIGHT_K, sky: skyDome ? ['top', 'mid', 'hor', 'fogc'].map((u) => skyDome.material.uniforms[u].value.clone()) : null, sunc: skyDome ? skyDome.material.uniforms.sunc.value.clone() : null, starsVis: skyDome ? skyDome.material.uniforms.uStars.value : null };
      scene.environment = null; G.LIGHT_K = LIGHT_K * 0.22;
      // the hands / weapon have their own lights: dim those too (the lamp still catches them a little)
      const vs = G.weapons.vmScene;
      if (vs) { GM._dark.vmEnv = vs.environment; vs.environment = null; GM._dark.vmL = []; vs.traverse((o) => { if (o.isLight && o.intensity > 0) { GM._dark.vmL.push([o, o.intensity]); o.intensity *= 0.4; } }); }
      if (skyDome) { for (const u of ['top', 'mid', 'hor', 'fogc']) skyDome.material.uniforms[u].value.multiplyScalar(0.05); skyDome.material.uniforms.sunc.value.multiplyScalar(0.05); skyDome.material.uniforms.uStars.value = 0; }
    } else {
      const d = GM._dark; if (!d) return;
      scene.environment = d.env; G.LIGHT_K = d.lk;
      const vs = G.weapons.vmScene;
      if (vs) { if (d.vmEnv !== undefined) vs.environment = d.vmEnv; for (const [o, i] of d.vmL || []) o.intensity = i; }
      if (skyDome && d.sky && d.dome === skyGen) { ['top', 'mid', 'hor', 'fogc'].forEach((u, i) => skyDome.material.uniforms[u].value.copy(d.sky[i])); skyDome.material.uniforms.sunc.value.copy(d.sunc); if (d.starsVis !== null) skyDome.material.uniforms.uStars.value = d.starsVis; }
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
    if (skyDome && F.sky) { ['top', 'mid', 'hor'].forEach((u, i) => skyDome.material.uniforms[u].value.copy(F.sky[i]).lerp(DAWN.sky[i], k)); if (k > 0.5) skyDome.material.uniforms.uStars.value = 0; }
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
    scene.fog.density = b.fogD * (1 + k * 0.45) * (GM.bossEngaged && w.fogK ? w.fogK : 1);
    if (scene.background && scene.background.isColor && b.bg) scene.background.copy(b.bg).lerp(DC, k * 0.55);
    // lightning flash brightens everything for a moment
    GM._flashK = Math.max(0, (GM._flashK || 0) - dt * 3.5);
    const fl = GM._flashK;
    hemi.intensity = b.hemiI * (1 - k * 0.3) + fl * 1.2; amb.intensity = b.amb * (1 - k * 0.3) + fl * 0.8;
    moon.intensity = b.moonI * (1 - k * 0.35) + fl * 4; moon.color.copy(b.moon).lerp(tmpC.set(GM.bossDef && GM.bossDef.final ? '#b060ff' : '#ff5038'), Math.min(1, k * 0.55 + fl));
    applySceneTint();
    applySpace();
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
      // (the last field: the fight starts once you step off the entrance ledge onto the tiles, and the ledge is sealed behind you)
      if (P.pos.z < (w.ledgeZ ? w.ledgeZ - 1.5 : w.arenaD - 3) && !P.dead && (!w.ledgeZ || P.grounded)) {
        GM.bossEngaged = true;
        if (w.ledgeZ) G.bosses.terrain.seal(w);
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
  // the world behind the title screens: a random one, or (the hidden extra mode on the difficulty screen) the blue-flame ruin of field 4
  GM.titleWorld = function (ruin) {
    let w;
    if (ruin) {
      const keep = G.Run.cur; G.Run.cur = { id: 'extra', lv: 1 };
      try { w = G.LevelGen.generate(13, (Math.random() * 1e9) >>> 0); } finally { G.Run.cur = keep; }
    } else w = G.LevelGen.generate(1 + Math.floor(Math.random() * 25), (Math.random() * 1e9) >>> 0);
    setWorld(w);
    GM.titleT = 0;
  };
  // the screen looks of a run (invulnerability, buffs, statuses, low HP, the trial clock ...) are driven by the update while you play:
  // on the way out of a run they are put out, or they would stay frozen over the title / clear screen
  GM.clearScreenFx = function () {
    if (G.PStatus && G.PStatus.clearFx) G.PStatus.clearFx();
    if (G.HudX && G.HudX.clearFx) G.HudX.clearFx();
    for (const id of ['lowhp', 'dmg-flash', 'status-tint', 'trial-vig', 'mood-vig']) { const el = document.getElementById(id); if (el) { el.style.opacity = 0; delete el._s; } }
    G.ui.tintT = 0;
  };
  GM.toTitle = function () {
    GM.clearScreenFx();
    if (G.Tutorial.active) G.Tutorial.stop();
    G.Rift.clear();
    GM.state = 'title';
    GM.mood = null; GM.stage = 'title'; GM.stopDread(); G.Depth.endArea(); if (G.Sky) G.Sky.stop(); const mv = document.getElementById('mood-vig'); if (mv) mv.style.opacity = 0;
    I.exitLock();
    G.ui.showHud(false);
    G.ui.bossBar(null);
    const w = G.LevelGen.generate(1 + Math.floor(Math.random() * 25), (Math.random() * 1e9) >>> 0);
    setWorld(w);
    GM.titleT = 0;
    G.weapons.hidden(true);
    G.ui.title();
  };
  // slot: 1..3 = save there (the old run in that slot is replaced by the first checkpoint); null = no saving (tutorial, dev); undefined = the slot in use
  GM.startRun = function (diff, slot) {
    G.sfx.init();
    GM.slot = slot === undefined ? (GM.slot || GM.firstEmptySlot() || 1) : slot;
    if (G.Dev && !G.Dev.keep && G.Dev.on()) G.Dev.disable();
    if (diff) G.Run.set(diff.id, diff.lv);
    // every run is generated at random; this key only lets a reloaded / restarted area be rebuilt exactly as it was (never shown, never chosen)
    const seed = (Math.random() * 999999999) >>> 0;
    GM.seed = seed;
    GM.rng = new G.RNG(seed);
    GM.time = 0;
    GM.run = { coins: 0, coinsTotal: 0, kills: 0, headshots: 0, combo: 0, lastKillT: -10, multi: 0, multiT: -10, dmgTaken: 0, destroyed: 0, startT: 0, areasCleared: 0, shopVisits: 0 };
    GM.run.diff = Object.assign({}, G.Run.cur); GM.won = false;
    G.Run.legacy = !!G.Run._nextLegacy; G.Run._nextLegacy = false; if (!G.Run.legacy) GM.run.fd = 1; // (fd: this run draws its fields; see runplan.js)
    // the fields of this run, drawn now and kept with it: the fields you went into in your last game are passed over (save lastFields,
    // any difficulty); a shared game takes the host's (G.Run.nextFields). From here the fields this game goes into are counted anew.
    { const nf = G.Run.nextFields; G.Run.nextFields = null;
      if (!G.Run.legacy && G.Run.drawOn()) { GM.run.fields = nf ? nf.slice() : G.Run.fieldsFor(seed, G.Run.cur, G.save.data.lastFields || []); G.save.data.lastFields = []; } }
    G.save.data.records.runs++; G.save.write();
    P.cls = G.Classes && !GM.tutorialRun ? G.Classes.last() : 'soldier'; GM.run.cls = P.cls; GM.tutorialRun = false; // (the tutorial is always the soldier)
    P.resetRun();
    G.abilities.clearUltAuras && G.abilities.clearUltAuras();
    G.weapons.dirty = true;
    GM.area = 1;
    G.ui.clearScreen();
    I.requestLock();
    if (G.save.data.settings.fullscreen) I.fullscreen();
    GM.route = []; GM.rewardPending = null;
    GM.enterArea(1, 'combat');
    if (G.Warm && !GM._uiWarmed) { GM._uiWarmed = true; G.Warm.ui(); }
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
    if (to !== 'stash' && !G.attOk(a, to)) return false;
    if (from === 'stash') { const i = P.attStash.indexOf(id); if (i < 0) return false; P.attStash.splice(i, 1); }
    else { delete from.atts[a.slot]; from.ver++; }
    if (to === 'stash') P.attStash.push(id);
    else {
      const prev = to.atts[a.slot];
      to.atts[a.slot] = id; to.ver++;
      if (prev) {
        // the displaced part goes back where the new one came from if it fits there, else to the stash
        if (from !== 'stash' && G.attOk(G.ATT_BY_ID[prev], from) && !from.atts[a.slot]) { from.atts[a.slot] = prev; from.ver++; }
        else P.attStash.push(prev);
      }
    }
    G.weapons.dirty = true;
    if (!P.meleeMode && (from === P.weapon || to === P.weapon)) G.weapons.equip(true);
    if (from === P.melee || to === P.melee) G.weapons.melee.rebuild(); // (the element skin of the blade)
    G.ui.refreshWeapon();
    return true;
  }

  // ---------------- run checkpoint (saved on every area entry; resume restarts that area) ----------------
  // three save slots for the run in progress (slot 1 keeps the old key, so an existing save is simply slot 1). GM.slot = the slot of the run being played (null: no saving, e.g. the tutorial)
  GM.SLOTS = 3; GM.slot = null;
  GM.runKey = (s) => ((s || GM.slot) === 1 ? 'abyss_run_v1' : 'abyss_run_v1_s' + (s || GM.slot));
  GM.firstEmptySlot = () => { for (let i = 1; i <= GM.SLOTS; i++) if (!GM.loadRun(i)) return i; return 0; };
  GM.slotsUsed = () => { let n = 0; for (let i = 1; i <= GM.SLOTS; i++) if (GM.loadRun(i)) n++; return n; };
  GM.playerSnap = function () {
    return {
      cls: P.cls, perks: (P.perks || []).slice(), hp: P.hp, os: P.os || 0, revives: P.revives, permMaxHp: P.permMaxHp || 0, phoenixUsed: !!P.phoenixUsed, miserArea: P.miserArea,
      buffs: [...P.buffs], buffState: P.buffState,
      weapons: P.weapons.map((w) => ({ id: w.id, atts: w.atts, lv: w.lv || 0, forge: w.forge || undefined, mag: w.mag, kills: w.kills || 0, el: w.el || undefined, kit: w.kit ? 1 : undefined, soul: w.soul || undefined, soulArea: w.soul ? w.soulArea : undefined })), wIdx: P.wIdx, kitAtts: P.kitAtts || [],
      wOrder: G.weapons.order().map((t) => (t === 'm' ? 'm' : t ? P.weapons.indexOf(t) : null)),
      melee: { id: P.melee.id, lv: P.melee.lv || 0, forge: P.melee.forge || undefined, kit: P.melee.kit ? 1 : undefined, atts: P.melee.atts && P.melee.atts.core ? { core: P.melee.atts.core } : undefined },
      skills: P.skills.map((s) => (s ? s.id : null)), skillLv: P.skills.map((s) => (s ? s.lv || 0 : 0)), skillKit: P.skills.map((s) => (s && s.kit ? 1 : 0)), pileTome: P.pileTome || 0,
      grenadeSel: P.grenadeSel, isel: P.isel, invGrid: G.Inv.snap(P),
    };
  };
  GM.saveRun = function (n, kind) {
    if (!GM.slot || (GM.run && GM.run.dev) || (G.Dev && G.Dev.on())) return;
    try {
      const d = Object.assign({ v: 1, t: Date.now(), seed: GM.seed, area: n, kind, route: GM.route || [], run: GM.run }, GM.playerSnap());
      localStorage.setItem(GM.runKey(), JSON.stringify(d));
    } catch (e) { /* storage unavailable: the run simply can't be resumed */ }
  };
  GM.loadRun = function (s) { if (!(s || GM.slot)) return null; try { const d = JSON.parse(localStorage.getItem(GM.runKey(s)) || 'null'); return d && d.v === 1 ? d : null; } catch (e) { return null; } };
  GM.clearRun = function (s) { if (!(s || GM.slot)) return; try { localStorage.removeItem(GM.runKey(s)); } catch (e) { /* ignore */ } };
  GM.continueRun = function (s) {
    const d = GM.loadRun(s); if (!d) return;
    GM.slot = s || GM.slot;
    G.sfx.init();
    GM.seed = d.seed; GM.rng = new G.RNG((d.seed ^ U.hashStr('resume' + d.area)) >>> 0);
    GM.time = 0;
    GM.run = Object.assign({ coins: 0, coinsTotal: 0, kills: 0, headshots: 0, combo: 0, lastKillT: -10, multi: 0, multiT: -10, dmgTaken: 0, destroyed: 0, startT: 0, areasCleared: 0, shopVisits: 0 }, d.run, { combo: 0, lastKillT: -10, multiT: -10, startT: 0 });
    G.Run.set((d.run && d.run.diff && d.run.diff.id) || 'normal', d.run && d.run.diff && d.run.diff.lv);
    G.Run.legacy = !(d.run && d.run.fd); // (a run saved before the field draw keeps its old fields)
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
    P.cls = d.cls || (GM.run && GM.run.cls) || 'soldier';
    P.resetRun();
    P.buffs = new Map((d.buffs || []).filter(([id]) => G.BUFF_BY_ID[id]));
    // 鋸刃 (the bleeding boon) was removed with bleeding: a run saved with it is paid back in coins
    { const RET = { h_bleed: 150, s_dodge_1: 150, s_dodge_2: 250, s_dodge_3: 400 }; const gone = (d.buffs || []).reduce((n, [id, c]) => n + (RET[id] ? RET[id] * (c || 1) : 0), 0); if (gone && GM.run) { GM.run.coins += gone; setTimeout(() => G.ui.toast(`🪙 廃止された加護を ${gone} コインで返却しました`, 'good'), 1500); } }
    P.buffState = d.buffState || {};
    P.permMaxHp = d.permMaxHp || 0;
    P.perks = (d.perks || []).filter((id) => G.Classes && G.Classes.PERK[id]);
    P.recalc();
    P.phoenixUsed = !!d.phoenixUsed;
    P.weapons = (d.weapons || []).filter((x) => G.WEAPON_BY_ID[x.id]).map((x) => { const w = G.weapons.make(x.id); w.atts = Object.fromEntries(Object.entries(x.atts || {}).filter(([, a]) => G.ATT_BY_ID[a])); w.lv = x.lv || 0; w.forge = x.forge || 0; w.kills = x.kills || 0; if (x.el) w.el = x.el; if (x.kit) w.kit = true; w.ver++; w.mag = x.mag ?? w.mag; if (x.soul) { w.soul = x.soul; w.soulArea = x.soulArea; } return w; });
    const coresBack = []; for (const w of P.weapons) for (const [slot, id] of Object.entries(w.atts)) if (!G.attOk(G.ATT_BY_ID[id], w)) { coresBack.push(id); delete w.atts[slot]; w.ver++; } // (a core on a gun with an element of its own, a scope on a gun that takes dot sights only)
    if (!P.weapons.length && !Array.isArray(d.weapons)) P.weapons = [G.weapons.make('starter')]; // (a run saved with every gun put away keeps none)
    P.wIdx = Math.max(0, Math.min(d.wIdx || 0, P.weapons.length - 1));
    P.wOrder = (d.wOrder || []).map((t) => (t === 'm' ? 'm' : t === null ? null : P.weapons[t] || null));
    if (d.melee && G.MELEE_BY_ID[d.melee.id]) { P.melee = G.weapons.makeMelee(d.melee.id); P.melee.lv = d.melee.lv || 0; P.melee.forge = d.melee.forge || 0; if (d.melee.kit) P.melee.kit = true; const c = d.melee.atts && d.melee.atts.core; if (c && G.ATT_BY_ID[c]) { if (G.attOk(G.ATT_BY_ID[c], P.melee)) P.melee.atts.core = c; else coresBack.push(c); } }
    P.kitAtts = (d.kitAtts || []).slice();
    P.skills = [0, 1, 2, 3].map((i) => { if (!(d.skills && d.skills[i] && G.SKILL_BY_ID[d.skills[i]])) return null; const s = G.abilities.makeSlot(d.skills[i]); s.lv = Math.min(G.abilities.MAXLV, (d.skillLv && d.skillLv[i]) || 0); if (d.skillKit && d.skillKit[i]) s.kit = true; return s; });
    P.pileTome = d.pileTome || 0;
    if (P.skills[0] && !P.skills[0].def.ult) { const s = P.skills[0]; const free = [1, 2, 3].find((i) => !P.skills[i]); if (free) P.skills[free] = s; P.skills[0] = null; }
    if (!P.skills[0]) { P.skills[0] = G.abilities.makeSlot(G.Classes ? G.Classes.of(P.cls).ult : G.DEFAULT_ULT); P.skills[0].kit = true; }
    P.retiredCoins = 0;
    if (d.invGrid) G.Inv.load(P, d.invGrid);
    else {
      // older saves: rebuild the bag from the item counts
      G.Inv.setupPlayer(P);
      P.grenades = Object.fromEntries(Object.entries(d.grenades || {}).filter(([id]) => G.ITEM_BY_ID[id])); // (retired ones are dropped)
      const inv = {};
      if (d.inv) for (const [id, n] of Object.entries(d.inv)) { if (G.ITEM_BY_ID[id] && n > 0) inv[id] = n; }
      else for (const u of d.utils || []) if (u && G.ITEM_BY_ID[u.id]) inv[u.id] = (inv[u.id] || 0) + u.n;
      P.inv = inv;
      P.attStash = (d.attStash || []).filter((a) => G.ATT_BY_ID[a]);
    }
    if (P.retiredCoins > 0 && GM.run) { const rc = P.retiredCoins; GM.run.coins += rc; setTimeout(() => G.ui.toast(`🪙 廃止された消耗品を ${rc} コインに換えた`, 'good'), 1500); }
    P.retiredCoins = 0;
    P.grenadeSel = d.grenadeSel || Object.keys(P.grenades)[0] || 'g_frag';
    P.isel = Object.assign({ c1: null, c2: null }, d.isel && d.isel.c1 !== undefined ? d.isel : {});
    P.revives = d.revives ?? 3;
    P.recalc();
    P.hp = Math.min(P.stats.maxHp, d.hp || P.stats.maxHp); P.os = d.os || 0;
    P.miserArea = d.miserArea;
    for (const id of coresBack) P.attStash.push(id); // (cores taken off weapons that carry an element of their own go to the stash)
    G.weapons.dirty = true;
  };
  GM.enterArea = function (n, kind) {
    GM.saveRun(n, kind);
    if (G.Elem) G.Elem.clear();
    GM.area = n;
    GM.stage = kind;
    GM.spaceK = 0;
    GM.route = GM.route || []; GM.route.push(kind);
    const gates = G.Run.isBoss(n + 1) || G.Run.isPrep(n + 1) ? 1 : 3;
    const seed = (GM.seed ^ U.hashStr('area' + n + kind)) >>> 0;
    let w;
    if (kind === 'shop') w = G.LevelGen.shop(n, seed, gates);
    else if (kind === 'boss') w = G.LevelGen.boss(n, seed, G.bosses.forArea(n));
    else if (G.Areas.ROOMS.includes(kind) || kind === 'trial') w = G.LevelGen.room(n, seed, kind, gates);
    else w = G.LevelGen.generate(n, seed, { extraChests: P.stats.extraChests, gates, kind });
    setWorld(w);
    if (w.field) G.save.mark('items', 'stage_' + w.field);
    if (G.Run.drawOn()) { const f = G.Run.field(n), L = G.save.data.lastFields || (G.save.data.lastFields = []); if (f && !L.includes(f)) { L.push(f); G.save.write(); } } // (a field this game went into: passed over in the next game, runplan.js)
    P.spawnAt(w);
    w.warmAir(); // (the flyers' ways, worked out now: from where you come in)
    G.weapons.equip(true);
    G.weapons.hidden(false);
    GM.areaCleared = false; GM.areaDamage = 0; GM.areaStartT = GM.time; GM.areaKills = 0; GM.enrageReset();
    GM.objective = null; GM.waves = null; GM.shop = null; GM.clearMarkers(); GM.clearSweep = false; { const fmk = document.getElementById('free-markers'); if (fmk) fmk.innerHTML = ''; } GM.mimic = null; GM.mimicT = -1; GM.ambushReward = false;
    GM.areaMods = { hp: G.Run.hpMul(n), dmg: G.Run.dmgMul(n) };
    GM.arng = new G.RNG(seed ^ 0x51ed);
    G.ui.showHud(true);
    const B = w.mats.biome;
    const T = G.Areas.TYPES[kind];
    G.ui.setArea(`AREA ${n}<small class="ar-of"> / ${G.Run.areas()}</small>`, `${T.icon} ${T.name} — ${B.name}${w.layout ? ' · ' + layoutName(w.layout) : ''}${w.sky && w.sky.name && w.sky.w < 4 ? ' · ' + w.sky.name + (w.sky.el && G.Elem ? G.Elem.BY[w.sky.el].icon : '') + (w.sky.bolt ? '⚡' : '') : ''}`);
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
      const RT = w.roadText || { sub: '— 回廊の奥へ —', icon: '🚪', obj: '回廊の奥へ進め — 石の扉をくぐると戦いが始まる' }; // (each field's approach, fieldgen.js F.SHELL)
      G.ui.banner(`AREA ${n}`, RT.sub);
      GM.objective = { icon: RT.icon, text: () => RT.obj, done: false };
      G.Areas.spawnMiniShop(true, true);
      G.Rooms2.setupRoadMerchant();
    } else if (G.Areas.ROOMS.includes(kind)) {
      if (kind === 'event') { G.Areas.setupEvents(); GM.objective = { icon: '❓', text: () => `人影に話しかけろ（${G.K('interact')}）／ 準備ができたら門へ`, done: true }; }
      if (kind === 'shrine') { G.Areas.setupShrine(); GM.objective = { icon: '⛩️', text: () => `祭壇で祈れ（${G.K('interact')}）`, done: true }; }
      if (G.Rooms2.KINDS.includes(kind)) G.Rooms2.setup(kind);
      if (kind === 'forge') { G.Areas.setupForge(); GM.objective = { icon: '⚒️', text: () => `金床で武器を鍛えろ（${G.K('interact')}）`, done: true }; }
      if (kind === 'alchemy') { G.Areas.setupAlchemy(); GM.objective = { icon: '⚗️', text: () => { const cz = G.world && G.world.interactables.find((i) => i.type === 'cauldron'), left = Math.max(0, 2 - (cz && cz.used || 0)); return left > 0 ? `練成釜で装備や持ち物を練成しろ（残り${left}回 · ${G.K('interact')}）` : '練成を終えたら次の門へ進め'; }, done: true }; }
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
    // shaders + textures of the finished area, compiled in parallel behind a black screen (nothing runs or draws until it is ready)
    if (G.Warm && G.Warm.worldAsync) {
      const fade = document.getElementById('fade'), had = fade.classList.contains('on');
      fade.classList.add('on'); GM._warming = true;
      // (what turns up later in the area, as samples: their shaders made now with the rest; the compile is started at once, so they leave at once)
      const kit = G.Warm.lateKit ? G.Warm.lateKit() : null; if (kit) G.scene.add(kit);
      GM._warmP = G.Warm.worldAsync().then(() => { GM._warming = false; if (!had) fade.classList.remove('on'); });
      if (kit) G.scene.remove(kit);
    } else if (G.Warm) G.Warm.world();
  };
  function layoutName(l) { return { courtyard: '中庭', halls: '回廊', chasm: '大裂谷', terrace: '段丘', crypt: '納骨堂' }[l] || '遺構'; }

  // ---------------- objectives ----------------
  GM.setupObjective = function (n, variant) {
    const r = GM.arng;
    GM.clearMarkers();
    let pick = n === 1 ? 'exterminate' : r.weighted(['exterminate', 'survive', 'hunt', 'ritual'], () => 1);
    if (variant === 'elite') pick = 'hunt';
    if (variant === 'cursed' || variant === 'vault') pick = 'exterminate';
    // ---- wave plan: at most 3 waves; the number of foes follows a total-HP budget (see wavePlan) ----
    const waves = GM.wavePlan(n, variant, pick);
    const total = waves.reduce((s, w) => s + w.n, 0);
    const O = GM.objective = { kind: pick, killed: 0, total, spawned: 0, waves, wave: 0, waveT: 1.2, waveAlive: 0 };
    // a little tougher than the plain numbers, to make up for gear and buffs
    const tough = Math.min(1.3, 1.14 + n * 0.006);
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
  // How many foes an area brings is limited by their combined toughness, not by a head count: the budget is a number of "average foes
  // of this depth" (x1.8 the old head count), and every foe drawn costs its own HP (a hound 0.55, an ogre 2.6, an abyss golem 8).
  // Weak packs therefore come in bigger numbers, heavy hitters in small ones, and the area never gets more HP to chew through than planned.
  GM.FOE_MAX = 18; // hard ceiling per area (performance)
  GM.foeWeight = (def) => def.hp / 100;
  GM.wavePlan = function (n, variant, pick) {
    const r = GM.arng, cap = GM.enemyCap(n), pool = enemyPool(n);
    const avgW = pool.reduce((s, p) => s + GM.foeWeight(p[0]) * p[1], 0) / Math.max(1e-6, pool.reduce((s, p) => s + p[1], 0));
    const mulE = 1 + (P.stats.extraEnemies || 0); // curses / blessings that change how many foes come
    let budget = cap * avgW * 1.8 * Math.max(0.4, mulE);
    const minN = Math.max(2, Math.round(cap * Math.max(0.5, Math.min(1, mulE))));
    const defs = []; let used = 0;
    while (defs.length < GM.FOE_MAX) {
      const d = r.weighted(pool, (p) => p[1])[0], w = GM.foeWeight(d);
      if (defs.length >= minN && used + w > budget) break;
      defs.push(d); used += w;
    }
    let overflow = 0; // what the ceiling kept out becomes extra toughness for the foes that did come
    if (defs.length >= GM.FOE_MAX && budget - used > avgW) overflow = Math.round((budget - used) / avgW);
    if (variant === 'cursed') for (let i = 0; i < 2 && defs.length < GM.FOE_MAX + 2; i++) defs.push(r.weighted(pool, (p) => p[1])[0]); // the cursed arena always brings more
    const total = defs.length;
    let plan;
    if (pick === 'ritual') plan = splitN(Math.max(3, total), 3).map((v) => ({ n: Math.max(1, v) }));
    else if (pick === 'survive') plan = splitN(total, total <= 6 ? 2 : 3).map((v) => ({ n: Math.max(1, v) }));
    else if (pick === 'hunt') {
      const targets = total >= 9 ? 2 : 1;
      const k = total <= 7 ? 2 : 3;
      plan = splitN(total, k).map((v) => ({ n: Math.max(1, v) }));
      // targets arrive with the later waves
      const last = plan[plan.length - 1]; last.target = targets; last.n = Math.max(last.n, targets);
    } else {
      const k = variant === 'cursed' ? 3 : total <= 4 ? 1 : total <= 9 ? 2 : 3;
      plan = splitN(total, k).map((v) => ({ n: Math.max(1, v) }));
    }
    // hand the drawn kinds out wave by wave (the marked foes of a hunt take the toughest ones left)
    let at = 0;
    for (const wv of plan) { wv.defs = []; for (let i = 0; i < wv.n; i++) wv.defs.push(defs[at++ % defs.length]); }
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
      const e = GM.spawnEnemy({ wave: true, elite: isT, mark: isT, champion: isT && O.champion, def: wv.defs && wv.defs[i] });
      if (!e) continue;
      e.waveFoe = true; e.waveNo = O.wave; O.spawned++; O.waveSize++;
      if (isT) { tg--; O.marked++; G.ui.toast(`${O.champion ? '👑' : '🎯'} 標的出現: ${e.def.name}`, 'warn'); }
    }
    if (O.wave > 1) G.buffs.emit('onWave', { wave: O.wave });
    if (O.kind === 'ritual') { if (O.wave > 1) { G.ui.feed('🕯️ 儀式に呼応し、魔物が這い出た', 'big'); G.ui.banner('増援', '— 儀式に呼応し、魔物が這い出る —'); } }
    else if (O.waves.length > 1) { G.ui.feed(`⚔️ WAVE ${O.wave}/${O.waves.length}`, 'big'); if (O.wave > 1) G.ui.banner(`WAVE ${O.wave} / ${O.waves.length}`, O.wave === O.waves.length ? '— 最終WAVE —' : '— 増援が現れた —'); }
    G.sfx.bell && G.sfx.bell();
  };
  function enemyPool(n, biomeKey) {
    const B = biomeKey || G.world.biome;
    const fav = { grave: ['skeleton', 'hound', 'bat', 'wraith', 'gargoyle'], gate: ['skeleton', 'imp', 'spider', 'shaman', 'gargoyle'], halls: ['golem', 'mantis', 'brute', 'shaman', 'spider'], ruin: ['wraith', 'golem', 'worm', 'mantis', 'brute'], abyss: ['wraith', 'shaman', 'golem', 'mantis'], catacombs: ['skeleton', 'spider', 'wraith', 'slime', 'bat'], flooded: ['slime', 'worm', 'spider', 'mushroom', 'wraith'], forge: ['imp', 'golem', 'brute'], frozen: ['wraith', 'gargoyle', 'golem', 'mantis', 'skeleton'], temple: ['spider', 'mantis', 'mushroom'], ruins: ['brute', 'mantis', 'skeleton', 'worm'], sky: ['gargoyle', 'bat', 'wraith', 'golem'], void: ['wraith', 'gargoyle', 'imp', 'slime'], bloodmoon: ['skeleton', 'bat', 'brute', 'wraith'], hamlet: ['hound', 'skeleton', 'bat', 'slime', 'wraith'], battlefield: ['skeleton', 'hound', 'brute', 'wraith', 'bat'], shaft: ['bat', 'gargoyle', 'skeleton', 'spider', 'wraith'], mine: ['worm', 'spider', 'golem', 'bat', 'beetle'], pillars: ['wraith', 'gargoyle', 'mantis', 'shaman', 'bat'], dusk: ['gargoyle', 'imp', 'bat', 'beetle', 'skeleton'], castle: ['skeleton', 'gargoyle', 'brute', 'shaman', 'hound'], foundry: ['golem', 'imp', 'brute', 'beetle', 'gargoyle'], sanctum: ['gargoyle', 'wraith', 'shaman', 'mantis', 'bat'] }[B] || [];
    const vfav = { frozen: 'frost', foundry: 'fire', flooded: 'tide', castle: 'shadow', sanctum: 'storm' }[B]; // (the new fields lean on one kind of the 10 variants)
    const k = Math.floor((Math.max(1, G.Run.depthArea(n)) - 1) / 5); // which foes have appeared by this depth
    const dn = Math.max(1, G.Run.depthArea(n));
    // (a field's own foes, fieldfoes.js, come only in that field, and often)
    return G.ENEMIES.filter((e) => !e.special && (!e.fields || e.fields.includes(B)) && (e.unlockK ?? 0) <= k && !(e.fromArea > dn)).map((e) => [e, (e.fields ? 5 : e.variant === 'normal' ? 3 : e.variant === 'abyss' ? 0.5 : 1.4) * (fav.includes(e.plan) ? 2 : 1) * (vfav && e.variant === vfav ? 1.8 : 1) * ((e.unlockK ?? 0) === k && k > 0 ? 1.5 : 1)]);
  }
  GM.enemyPool = function (n, biomeKey) { return enemyPool(n, biomeKey);
  }
  GM.spawnEnemy = function (opts) {
    opts = opts || {};
    const w = G.world, r = GM.arng, n = GM.area;
    const pool = enemyPool(n);
    const def = opts.def || r.weighted(pool, (p) => p[1])[0];
    // opts.at: a fixed spot (a spawn grave) instead of a random open cell
    const c = opts.at ? { x: opts.at.x, y: opts.at.y, z: opts.at.z } : w.randomOpenCell(r, (x, z, idx) => (!w.reachMask || w.reachMask[idx]) && Math.hypot(x - P.pos.x, z - P.pos.z) > (opts.near ? 10 : opts.wave ? 13 : 17) && Math.hypot(x - P.pos.x, z - P.pos.z) < (opts.wave ? 40 : 60));
    if (!c) return null;
    const pos = V(c.x, c.y + (def.flyer ? (opts.at ? 1.4 : 3) : 0), c.z);
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
    if (opts.champion) { e.eliteMod2 = U.pick([{ id: 'rage', icon: '😡' }, { id: 'fast', icon: '💨' }]); if (e.eliteMod2.id === 'fast') e.speed *= 1.25; e.def = Object.assign({}, e.def, { name: '覇者・' + e.def.name }); }
    if (opts.mark) { e.marked = true; e.markTarget && e.markTarget(!!opts.champion); }
    if (opts.grave) { e.graveSpawn = true; e.ignoreCount = true; } // raised by a spawn grave: outside the cap, the waves and the kill target
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
  GM.onEnemyKilled = function (e) {
    if (e.boss || e.graveSpawn) return;
    GM.areaKills++;
    const O = GM.objective;
    if (e.def.id === 'mimic_gold') {
      const v = Math.round(G.Run.income(160 + GM.area * 25));
      G.combat.coins(v, e.centerPos());
      G.ui.feed(`💰 黄金のミミック撃破！ +${v}`, 'big');
      if (Math.random() < 0.6) { const it = U.pick(G.ITEMS.filter((i) => i.rarity !== 'legendary' && i.rarity !== 'mythic')); if (P.addItem(it.id, 1)) { G.ui.toast(`${it.icon} ${it.name} を手に入れた`, 'good'); G.ui.gain(it); } }
      return;
    }
    if (!O || GM.areaCleared) return;
    if (O.kind === 'exterminate' && e.waveFoe) O.killed++;
    if (e.waveNo && e.waveNo === O.wave) O.waveKilled = (O.waveKilled || 0) + 1;
    if (O.kind === 'hunt' && e.marked) O.markKilled++;
  };
  // after a clear, anything hostile that is still (or again) standing fades away
  // ---- fights that drag on (hard / extra): hit-and-run chipping is not a way to win ----
  // after a grace period (longer for more foes, longer still for a guardian) the foes grow frantic: every `step` seconds the
  // "frenzy" level rises (max 10): +15% damage and +3% speed (cooldowns, attack tempo, projectiles) per level.
  GM.enrage = { lv: 0, t: 0, grace: 0, step: 20, dmg: 1, tm: 1, warned: false, on: false };
  GM.enrageReset = function () { Object.assign(GM.enrage, { lv: 0, t: 0, grace: 0, dmg: 1, tm: 1, warned: false, on: false }); };
  GM.updateEnrage = function (dt) {
    const E = GM.enrage, id = G.Run.cur.id, O = GM.objective;
    let on = false, grace = 0, step = 20;
    if ((id === 'hard' || id === 'extra') && !GM.areaCleared && GM.state === 'playing') {
      // combat areas only (guardian fights are not timed); the grace grows with the number of foes
      if (['combat', 'elite', 'cursed', 'vault'].includes(GM.stage) && O && O.waves && O.wave > 0) { on = true; grace = (150 + 15 * (O.total || 6)) * (id === 'extra' ? 0.85 : 1); step = 25; }
    }
    E.on = on;
    if (!on) { if (E.lv && GM.areaCleared) GM.enrageReset(); return; }
    E.t += dt; E.grace = grace; E.step = step;
    const lv = E.t > grace ? Math.min(10, 1 + Math.floor((E.t - grace) / step)) : 0;
    if (lv > E.lv) {
      E.lv = lv; E.dmg = 1 + 0.15 * lv; E.tm = 1 + 0.03 * lv;
      G.ui.toast(`🔥 戦いが長引いている — 敵が激化した（激化 Lv${lv}：被ダメ+${Math.round(0.15 * lv * 100)}% 敵の動き+${Math.round(0.03 * lv * 100)}%）`, 'warn');
      G.sfx.heartbeat && G.sfx.heartbeat(1);
    } else if (!E.warned && E.t > grace - 20 && lv === 0) { E.warned = true; G.ui.toastSmall('⏳ 戦いが長引くと、敵が激化する'); }
  };
  function sweepCleared() {
    if (!GM.clearSweep || !GM.areaCleared) return;
    for (const e of G.enemies.list) {
      if (!e.alive || e.custom || e.ally || e.isTarget || e.graveSpawn || e.def.id === 'mimic_gold' || e.def.id === 'mimic_trap') continue; // a mimic that bit after the clear is a fight you chose
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
      fireEl.classList.toggle('on', fireLv > 0); if (fireLv > 0) fireEl.textContent = `🔥 炎上 ${['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'][fireLv] || 'Lv.' + fireLv}`;
      return;
    }
    fireT += dt; fireTick -= dt; fireWarnT -= dt; fireCool = 0.35;
    if (Math.random() < dt * (30 + fireLv * 6)) G.fx.flameLick(P.pos.x + U.rand(-0.5, 0.5), P.pos.y + 0.05, P.pos.z + U.rand(-0.5, 0.5), 1.2 + fireLv * 0.08);
    if (fireT < 0.25) return;
    if (fireWarnT <= 0) { fireWarnT = 4; G.ui.toast('🔥 高所は炎に包まれている！ 降りろ！', 'warn'); }
    if (fireTick <= 0) { fireTick = 0.5; fireLv++; G.combat.damagePlayer((4 + GM.area * 0.25) * (1 + (fireLv - 1) * 0.5), { src: 'aoe', elem: 'fire', pos: P.pos.clone() }); }
    fireEl.classList.add('on'); fireEl.textContent = `🔥 炎上 ${['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'][fireLv] || 'Lv.' + fireLv}`;
    fireEl.style.setProperty('--h', Math.max(0, 40 - fireLv * 4));
  }
  // green outline + glow + pillar on the healing basin while the hint is active
  function updateHealHint(dt) {
    const S = GM.shop, w = G.world;
    const want = !!(GM.healHint && S && S.healPos && !S.healUsed && P.hp < P.stats.maxHp * 0.5);
    if (want && S.healHl === undefined) S.healHl = null;
    if (want && !S.healHl) {
      const h = w.miniHeal, g = new THREE.Group(); g.position.copy(h);
      const col = G.fx.tone ? G.fx.tone(0xe0c080).getHex() : 0xd8b878;   // (a pale gold: the light of the water, not a green beacon)
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
    hl.outline.material.opacity = 0.45 * hl.k * pulse; hl.glow.material.opacity = 0.35 * hl.k * pulse; hl.beam.material.opacity = 0.08 * hl.k * pulse; hl.ring.material.opacity = 0;
    if (want && Math.random() < dt * 10) { const h = G.world.miniHeal, a = Math.random() * 6.283, d = Math.random() * 0.7; G.fx.add.spawn(h.x + Math.cos(a) * d, h.y + 0.6 + Math.random() * 0.3, h.z + Math.sin(a) * d, 0, 0.35 + Math.random() * 0.4, 0, 1.6, 0.05, 0.02, 0.85, 0.7, 0.4, 0.85, -0.05, 0.4); }   // (motes of light rising off the water)
    hl.ring.scale.setScalar(1 + 0.1 * Math.sin(GM.time * 3)); hl.beam.rotation.y += dt * 0.6;
    if (!want && hl.k < 0.01) { w.group.remove(hl.g); hl.beam.geometry.dispose(); hl.ring.geometry.dispose(); hl.outline.material.dispose(); S.healHl = null; }
  }
  // small reminder under the crosshair while a double jump is available in mid-air (needs the 二段ジャンプ perk)
  let airJumpEl = null, airJumpT = 0, airJumpKey = null;
  function updateAirJumpHint(dt) {
    const can = P.stats.maxJumps > 1 && !P.dead && GM.state === 'playing' && !P.grounded && P.coyote <= 0 && P.jumps < P.stats.maxJumps && P.grapple.state !== 'attached' && !P.pileState && !P.mantle && !(P.dragT > 0);
    airJumpT = can ? airJumpT + dt : 0;
    const on = airJumpT > (P.jumps >= 1 ? 0.04 : 0.25); // right after a jump of your own; a little later when you merely step off a ledge
    if (!airJumpEl) { if (!on) return; airJumpEl = document.createElement('div'); airJumpEl.id = 'airjump-hint'; (G.ui.el && G.ui.el.hud || document.body).appendChild(airJumpEl); }
    const key = G.K('jump');
    if (key !== airJumpKey) { airJumpKey = key; airJumpEl.innerHTML = `<kbd>${U.esc(key)}</kbd>で二段ジャンプ`; }
    airJumpEl.classList.toggle('on', on);
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
    // a guardian's fall teaches every skill and ultimate you carry: +1 level (the normal level, not mastery; Lv 15 is the cap)
    if (bossKill) {
      const A = G.abilities, up = [];
      for (const s of P.skills) if (s && (s.lv || 0) < A.MAXLV) { s.lv = (s.lv || 0) + 1; s.maxCd = A.cdOf(s); up.push(s); }
      if (up.length) setTimeout(() => { G.sfx.magic(P.pos, 'holy'); G.ui.toast(`📘 守護者の力が宿り、スキル・アルティメットが全て Lv+1（${up.map((s) => s.def.name + ' ' + A.lvText(s)).join('、')}）`, 'good'); }, 1000);
    }
    if (bossKill && G.Run.revivesAllowed()) { P.revives++; setTimeout(() => G.ui.toast(`🪔 守護者の魂を奪い、魂の灯火が一つ灯った（${P.revives}灯）`, 'good'), 1200); }
    const O = GM.objective; if (O) O.done = true;
    for (const e of G.enemies.list) if (e.alive && !e.boss && !e.isTarget && e.def.id !== 'mimic_gold' && e.def.id !== 'mimic_trap') { G.fx.smoke(e.centerPos(), 6, 1, 0x1a1412, 1, 1); e.noReward = true; e.hp = 0; G.combat.killEnemy(e, { src: 'clear', proc: true }, 0); }
    G.combat.collectAllPickups();
    const n = GM.area;
    const t = GM.time - GM.areaStartT;
    if (!opts.noBase) {
      let base = bossKill ? 420 + n * 45 : 110 + n * 18;
      if (stage === 'cursed') base *= 2;
      if (stage === 'elite') base *= 1.4;
      G.combat.coins(Math.round(G.Run.income(base)), null, 'エリアクリア');
    }
    const par = 45 + (O && O.total ? O.total * 3 : 40);
    if (!bossKill && stage !== 'trial' && t < par) { const b = Math.round(G.Run.income((60 + n * 8) * (P.has('e_speedrun') ? 2 : 1))); setTimeout(() => { G.combat.coins(b, null, '速攻'); G.ui.feed(`⏱ 速攻ボーナス +${b}`, 'big'); }, 500); }
    const flawless = GM.areaDamage <= 0;
    if (flawless && stage !== 'trial') { const b = Math.round(G.Run.income((80 + n * 10) * (P.has('e_flawless') ? 2 : 1))); setTimeout(() => { G.combat.coins(b, null, '無傷'); G.ui.feed(`🏅 無傷ボーナス +${b}`, 'big'); }, 900); }
    G.buffs.emit('onAreaClear', { flawless, time: t });
    if (stage !== 'trial') G.ui.banner(bossKill && G.Run.isLast(GM.area) ? 'FALLEN' : 'AREA CLEAR', bossKill ? (G.Run.isLast(GM.area) ? '— 最後の守護者は倒れた —' : '— 守護者は倒れた —') : '— 次の道を選べ —');
    G.sfx.ui('clear');
    if (!(bossKill && G.Run.isLast(GM.area))) G.Areas.openGates(); // the last guardian ends the run: no road onward
    if (stage !== 'boss') setTimeout(() => G.Areas.spawnMiniShop(), 600);
    if (G.save.data.records.bestArea < n) G.save.data.records.bestArea = n;
    { const R = G.save.data.records, k = P.cls || 'soldier'; R.byClass = R.byClass || {}; const c = R.byClass[k] || (R.byClass[k] = { bestArea: 0, clears: {} }); if (c.bestArea < n) c.bestArea = n; } // the best per class too
    G.save.write();
    const reward = opts.reward || (bossKill || stage === 'elite' ? 'boost' : stage === 'cursed' ? 'double' : stage === 'vault' ? 'none' : 'buff');
    if (reward === 'none') { setTimeout(() => GM.healNotice(), 2600); return; }
    if (bossKill && G.Run.isLast(n)) return; // the run is over: the rift of light leads to the clear screen
    GM.rewardPending = { reward, boss: bossKill, n };
    setTimeout(() => GM.giveReward(GM.rewardPending), 1600);
  }
  GM.giveReward = function (rp) {
    if (!rp || GM.rewardPending !== rp && !GM._forceReward) return;
    if (GM.state !== 'playing' || performance.now() < (G.ui.bannerHold || 0)) { setTimeout(() => GM.giveReward(rp), 300); return; }
    const { reward, boss, n } = rp;
    // a guardian's fall: first the class's 秘伝 (classes.js), then its boon
    if (boss && G.Classes && G.Classes.perkDue() > 0) { G.Classes.offerPerks(() => GM.giveReward(rp)); return; }
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
    GM.state = 'modal'; I.exitLock(); G.ui.showHud(false); G.ui.bossBar(null); GM.clearScreenFx();
    G.sfx.bell && G.sfx.bell(); G.sfx.ui('rare');
    G.ui.victory({ first, unlock });
  };
  GM.onBossDefeated = function (boss) {
    if (G.Run.isLast(GM.area)) {
      // the run ends through the rift of light that opens now (rift.js), not by itself
      const spot = boss && boss.riftSpot ? boss.riftSpot() : G.world.arenaCenter.clone().setY(0);
      setTimeout(() => { if (GM.stage === 'boss' && !P.dead) G.Rift.open(spot, !!(boss && boss.def.id === 'sovereign')); }, 1800);
    }
    const c = G.world.arenaCenter, lastOne = G.Run.isLast(GM.area); // the last guardian ends the run: no chest, no road onward
    if (!lastOne) G.Props.chest(G.world, c.x, c.z, 0, 0, 3);
    if (boss && boss.baseDef && G.BOSS_BY_ID[boss.baseDef.id] && G.BOSS_BY_ID[boss.baseDef.id].final) {
      // the Abyss King: a hoard worthy of the deepest throne
      G.Props.chest(G.world, c.x - 5, c.z + 2, 0, 0.4, 3); G.Props.chest(G.world, c.x + 5, c.z + 2, 0, -0.4, 3);
      P.revives += 2; G.combat.coins(3000 + GM.area * 60, c.clone().setY(1.5), '深淵の王');
      GM.run.kingsSlain = (GM.run.kingsSlain || 0) + 1;
      GM.startDawn();
      setTimeout(() => { G.ui.toast('🪔🪔 魂の灯火が二つ灯った', 'good'); G.ui.banner(`第${GM.run.kingsSlain}の深淵を踏破`, '— だが、深淵はさらに深く続いている —'); }, 2500);
    }
    G.world.flushDeferred();
    if (!lastOne) G.ui.toast('🏆 守護者の秘宝箱が現れた！', 'good');
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
    G.combat.coins(Math.round(G.Run.income(150 + GM.area * 20)), null, '宝'); return false;
  };
  // a weapon handed over for free (the peddler's mystery box, an auction won): it never pushes out a weapon you hold.
  // with every gun slot taken (or a melee weapon already in hand) it goes into the bag, and with the bag full it is set down at your feet.
  const keepNew = (it, d) => {
    if (G.Inv.stow(P, it) > 0) { G.Inv.dropToGround(it, P.pos.clone().add(V(0, 0.4, 0)).addScaledVector(P.forward().setY(0).normalize(), 0.9)); G.ui.toast(`🎒 インベントリに空きがないので ${d.icon} ${d.name} を足元に置いた`, 'warn'); }
    else G.ui.toast(`🎒 武器の枠がいっぱいなので ${d.icon} ${d.name} をインベントリに入れた`, 'good');
  };
  GM.giveWeapon = function (id) {
    const wd = G.WEAPON_BY_ID[id];
    if (P.weapons.length < P.stats.weaponSlots) { P.weapons.push(G.weapons.make(id)); G.weapons.switchTo(P.weapons.length - 1); }
    else keepNew(GM.gunItem(G.weapons.make(id)), wd);
    G.ui.itemCard(wd, '[武器]'); G.ui.refreshWeapon();
  };
  GM.giveMelee = function (id) {
    const md = G.MELEE_BY_ID[id];
    if (!P.melee || P.melee.id === (G.BARE_MELEE || 'fists')) { P.melee = G.weapons.makeMelee(id); if (P.meleeMode) G.weapons.melee.equip(false); }
    else keepNew(GM.meleeItem(G.weapons.makeMelee(id)), md);
    G.ui.itemCard(md, `[近接:${G.K('w3')}]`); G.ui.refreshWeapon(); P.recalc();
  };
  // a gun thrown away from the inventory screen becomes a pickup on the ground that keeps its upgrades, parts and ammo
  // a gun out of your hands as an inventory thing (attachments, level, ammo and kills ride along)
  GM.gunItem = (w) => G.Inv.make('gun', w.id, 1, { gun: { atts: Object.assign({}, w.atts), lv: w.lv || 0, forge: w.forge || undefined, mag: w.mag, kills: w.kills || 0, el: w.el || undefined, kit: w.kit ? 1 : undefined, soul: w.soul || undefined, soulArea: w.soul ? w.soulArea : undefined } }); // (its own element, the kit mark and 魂喰らい's count ride along)
  GM.meleeItem = (m) => G.Inv.make('melee', m.id, 1, { gun: { lv: m.lv || 0, forge: m.forge || undefined, kit: m.kit ? 1 : undefined, atts: m.atts && m.atts.core ? { core: m.atts.core } : undefined } }); // (its 属性コア rides along)
  // take a gun out of your hands (every gun can go: with none left you fight with the melee weapon / fists)
  GM.releaseGun = function (w) {
    if (!w || !P.weapons.includes(w)) return null;
    const cur = P.weapons[P.wIdx];
    G.weapons.order(); // makes sure the key layout refers to guns that still exist
    P.weapons.splice(P.weapons.indexOf(w), 1);
    P.wOrder = (P.wOrder || []).map((t) => (t === w ? null : t));
    w.reloading = false;
    if (!P.weapons.length) { P.wIdx = 0; if (!P.meleeMode) G.weapons.setMelee(); }
    else if (cur === w) { P.wIdx = 0; G.weapons.equip(false); } else P.wIdx = P.weapons.indexOf(cur);
    G.weapons.order(); G.ui.refreshWeapon(); P.recalc();
    return GM.gunItem(w);
  };
  GM.dropGun = function (w) {
    const it = GM.releaseGun(w); if (!it) return false;
    G.Inv.dropToGround(it, P.pos.clone().add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(P.forward().setY(0).normalize(), 0.9));
    return true;
  };
  // into the bag (at a given cell when it was dragged there); false when there is no room
  GM.stowGun = function (w, c, x, y, rot) {
    if (!w) return false;
    const probe = GM.gunItem(w);
    const spot = c ? (fitAt(c, probe, x, y, rot) ? { x, y, rot: !!rot } : null) : G.Inv.findSpot(P.bag, probe);
    if (!spot) return false;
    const it = GM.releaseGun(w);
    Object.assign(it, spot); (c || P.bag).items.push(it); G.Inv.changed(c || P.bag);
    return true;
  };
  GM.stowMelee = function (c, x, y, rot) {
    const m = P.melee; if (!m || m.id === (G.BARE_MELEE || 'fists')) return false;
    const it = GM.meleeItem(m);
    const spot = c ? (fitAt(c, it, x, y, rot) ? { x, y, rot: !!rot } : null) : G.Inv.findSpot(P.bag, it);
    if (!spot) return false;
    Object.assign(it, spot); (c || P.bag).items.push(it); G.Inv.changed(c || P.bag);
    P.melee = G.weapons.makeMelee(G.BARE_MELEE || 'fists');
    if (P.meleeMode) G.weapons.melee.equip(false);
    G.ui.refreshWeapon(); P.recalc();
    return true;
  };
  // a weapon in a bag / box into your hands; when the hands are full the one it replaces goes where it lay (the current gun / melee weapon)
  GM.equipArm = function (it, from, slotGun) {
    const IV = G.Inv;
    if (!IV.isArm(it) || !from || !from.items.includes(it)) return false;
    const at = { x: it.x, y: it.y };
    if (it.type === 'gun') {
      let out = null;
      if (P.weapons.length >= P.stats.weaponSlots) out = slotGun || (!P.meleeMode && P.weapon) || G.weapons.gunsInOrder()[0];
      IV.remove(from, it);
      if (out) {
        const back = GM.gunItem(out), s = spotAt(from, back, at);
        if (!s) { IV.put(from, Object.assign(it, at)); G.ui.toastSmall('🎒 持ち替える銃をしまう場所がない'); return false; }
        GM.releaseGun(out); Object.assign(back, s); from.items.push(back); // its key is left empty, and the new gun takes it
      }
      GM.takeGun(it, true);
      IV.changed(from); G.ui.refreshWeapon();
      return true;
    }
    const prev = P.melee;
    IV.remove(from, it);
    if (prev && prev.id !== (G.BARE_MELEE || 'fists')) {
      const back = GM.meleeItem(prev), s = spotAt(from, back, at);
      if (!s) { IV.put(from, Object.assign(it, at)); G.ui.toastSmall('🎒 持ち替える武器をしまう場所がない'); return false; }
      Object.assign(back, s); from.items.push(back);
      P.melee = G.weapons.makeMelee(G.BARE_MELEE || 'fists'); // (already put away: takeMelee must not drop it as well)
    }
    GM.takeMelee(it, true);
    IV.changed(from);
    return true;
  };
  // where a swapped-out weapon goes: the cell the new one came from when it fits there, else any free cell
  const spotAt = (c, it, at) => { const [w, h] = G.Inv.baseSize(it); return G.Inv.fits(c, w, h, at.x, at.y) ? { x: at.x, y: at.y, rot: false } : G.Inv.fits(c, h, w, at.x, at.y) ? { x: at.x, y: at.y, rot: true } : G.Inv.findSpot(c, it); };
  const fitAt = (c, it, x, y, rot) => { const [w, h] = G.Inv.baseSize(it); return rot ? G.Inv.fits(c, h, w, x, y) : G.Inv.fits(c, w, h, x, y); };
  GM.takeGun = function (it, quiet) {
    if (P.weapons.length >= P.stats.weaponSlots) return false;
    const x = it.gun || {}, w = G.weapons.make(it.id);
    w.atts = Object.fromEntries(Object.entries(x.atts || {}).filter(([, a]) => G.ATT_BY_ID[a])); w.lv = x.lv || 0; w.forge = x.forge || 0; w.kills = x.kills || 0; if (x.el) w.el = x.el; if (x.kit) w.kit = true; w.ver++; w.mag = x.mag ?? w.mag; if (x.soul) { w.soul = x.soul; w.soulArea = x.soulArea; }
    for (const [slot, id] of Object.entries(w.atts)) if (!G.attOk(G.ATT_BY_ID[id], w)) { P.attStash.push(id); delete w.atts[slot]; } // (a part it cannot take is kept aside: a 属性コア on a gun with an element of its own, a scope on a gun for dot sights only)
    P.weapons.push(w); G.weapons.switchTo(P.weapons.length - 1); G.ui.refreshWeapon(); P.recalc();
    const d = G.WEAPON_BY_ID[it.id]; G.ui.toastSmall(`${d.icon} ${d.name} を${quiet ? '装備した' : '拾った'}`);
    return true;
  };
  GM.dropMelee = function () {
    const m = P.melee;
    if (!m || m.id === (G.BARE_MELEE || 'fists')) return false;
    const it = GM.meleeItem(m);
    G.Inv.dropToGround(it, P.pos.clone().add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(P.forward().setY(0).normalize(), 0.9));
    P.melee = G.weapons.makeMelee(G.BARE_MELEE || 'fists');
    if (P.meleeMode) G.weapons.melee.equip(false);
    G.ui.refreshWeapon(); P.recalc();
    return true;
  };
  GM.takeMelee = function (it, quiet) {
    const prev = P.melee;
    if (prev && prev.id !== (G.BARE_MELEE || 'fists')) {
      const old = GM.meleeItem(prev);
      G.Inv.dropToGround(old, P.pos.clone().add(new THREE.Vector3(0, 0.4, 0)));
    }
    const m = G.weapons.makeMelee(it.id);
    m.lv = (it.gun && it.gun.lv) || 0; m.forge = (it.gun && it.gun.forge) || 0; if (it.gun && it.gun.kit) m.kit = true;
    const core = it.gun && it.gun.atts && it.gun.atts.core; if (core && G.ATT_BY_ID[core]) { if (G.attOk(G.ATT_BY_ID[core], m)) m.atts.core = core; else P.attStash.push(core); }
    P.melee = m;
    if (P.meleeMode) G.weapons.melee.equip(false);
    G.ui.refreshWeapon(); P.recalc();
    const d = G.MELEE_BY_ID[it.id]; G.ui.toastSmall(`${d.icon} ${d.name}${m.lv ? ' +' + m.lv : ''} を${quiet ? '装備した' : '拾った'}`);
    return true;
  };
  GM.giveSkill = function (id) {
    if (G.SKILL_BY_ID[id] && G.SKILL_BY_ID[id].ult) { P.skills[0] = G.abilities.makeSlot(id); G.ui.itemCard(G.SKILL_BY_ID[id], `[${G.input.skillKey(0)} アルティメット]`); return; }
    let i = [1, 2, 3].find((k) => !P.skills[k]) || 3;
    P.skills[i] = G.abilities.makeSlot(id);
    G.ui.itemCard(G.SKILL_BY_ID[id], `[${G.input.skillKey(i)}]`);
  };

  // ---------------- buff choices ----------------
  GM.rollBuffs = function (n, boost, filter, exclude) {
    const luck = P.stats.luck + (boost ? 1.2 : 0);
    const owned = new Set(P.skills.filter(Boolean).map((s) => s.id));
    const elOk = !G.Elem || G.Elem.hasSource(P); // (the element boons only once you have a way to leave an element)
    const pool = G.BUFFS.filter((b) => b.cat !== 'curse' && (P.buffs.get(b.id) || 0) < b.max && (!b.skill || owned.has(b.skill)) && !(exclude && exclude.has(b.id)) && (elOk || !G.Elem.isElementBoon(b)) && (filter ? filter(b) : b.cat !== 'pact' && b.cat !== 'relic'));
    const out = [];
    const r = Math.random;
    for (let i = 0; i < n && pool.length; i++) {
      const rar = U.weighted(G.RARITY_ORDER.filter((k) => pool.some((b) => b.rarity === k)), (k) => G.rarityWeight(k, GM.area, luck) * (boost && G.RARITY[k].tier < 2 ? 0.25 : 1) * (G.Classes ? G.Classes.rarW(k) : 1), r); // (掘り出し物 of the 兵士: rare and better x2)
      const cands = pool.filter((b) => b.rarity === rar && !out.includes(b));
      if (!cands.length) continue;
      // prefer mechanics over plain stats a bit
      const b = U.weighted(cands, (b) => (b.skill ? 10 : b.cat === 'stat' ? 0.7 : 1.2) * (G.Classes ? G.Classes.boonW(b) : 1), r); // (boons that suit the class: x1.3 - x2)
      out.push(b);
    }
    // keep survivability on the table: most offers include at least one defence boon
    if (!filter && out.length >= 2 && !out.some((b) => b.cat === 'defense') && r() < 0.6) {
      const dp = pool.filter((b) => b.cat === 'defense' && !out.includes(b));
      if (dp.length) out[out.length - 1] = U.weighted(dp, (b) => G.rarityWeight(b.rarity, GM.area, luck), r);
    }
    return out;
  };
  // rerolls: 1 free reroll per screen (2 with Fate Redeal), then doubling coin price: 200, 400, 800...
  GM.offerBuffs = function (boost, o) {
    o = o || {};
    GM.state = 'buff';
    // free the cursor so the cards can be clicked; held movement keys survive the unlock (see input.js)
    I.exitLock();
    const seen = new Set(); // what this screen has already shown: a reroll never brings it back
    const done = () => { GM.rewardPending = null; GM.resume(); if (o.after) o.after(); };
    let rolls = 0;
    const getReroll = () => {
      const freeMax = (P.has('e_reroll') ? 2 : 1) + (G.Classes ? G.Classes.freeRerolls() : 0), free = Math.max(0, freeMax - rolls); // (目利き of the 兵士: one more)
      const cost = GM.price(200 * Math.pow(2, Math.max(0, rolls - freeMax))); // priced like the shop (discounts, depth)
      return { free, cost, afford: free > 0 || GM.run.coins >= cost };
    };
    const render = (choices) => {
      for (const b of choices) seen.add(b.id);
      const ri = getReroll();
      G.ui.buffSelect(choices, {
        title: o.title || (boost ? 'ROYAL BOON' : 'CHOOSE A BOON'), sub: o.sub || (boost ? '強大な加護 — 一つを選べ' : undefined),
        reroll: o.noReroll ? null : { free: ri.free, cost: ri.cost, afford: ri.afford },
        onPick: (b) => { P.addBuff(b.id); if (o.onPicked) o.onPicked(b); G.ui.toast(`${b.icon} ${b.name} を${b.cat === 'pact' ? '結んだ' : '獲得'}`, b.cat === 'pact' ? 'warn' : 'good'); done(); },
        onReroll: () => {
          const state = getReroll();
          if (!state.afford) { G.sfx.ui('deny'); return; }
          const next = GM.rollBuffs(Math.max(2, P.stats.buffChoices), boost, o.filter, seen);
          if (!next.length) { G.sfx.ui('deny'); G.ui.toastSmall('🎲 もう出せる候補がない'); return; }
          if (state.free <= 0) {
            GM.run.coins -= state.cost;
            G.sfx.coins(3);
          }
          rolls++;
          render(next);
        },
      });
    };
    let first = GM.rollBuffs(Math.max(2, P.stats.buffChoices), boost, o.filter);
    if (!first.length) first = GM.rollBuffs(3, boost);
    render(first);
  };

  // ---------------- shop ----------------
  const BUFF_PRICE = { common: 260, uncommon: 380, rare: 560, epic: 820, legendary: 1200, mythic: 2000 };
  // prices creep up with depth (income does too) so late coins don't pile up unspent
  // noVisits: weapons skip the +5% per shop visit (with the per-area rise on top it priced them out of reach deep down)
  GM.price = function (base, noVisits) { return Math.max(0, Math.round(base * Math.max(0.3, 1 - P.stats.shopDiscount) * (noVisits ? 1 : 1 + GM.run.shopVisits * 0.05) * (1 + 0.03 * Math.max(0, (GM.area || 1) - 1)) / 10) * 10); };
  // while a shop is being stocked its rarity is judged a few areas deeper (easy / normal, the early fields: see Run.shopRarityBonus); drops and chests are not
  GM._rb = 0;
  function rollRarity(r, luck) { return GM._rb ? r.weighted(G.RARITY_ORDER, (k) => G.rarityWeightD(k, G.Run.depthArea(GM.area) + GM._rb, luck)) : r.weighted(G.RARITY_ORDER, (k) => G.rarityWeight(k, GM.area, luck)); }
  function pickBy(r, arr, luck) {
    const rar = rollRarity(r, luck);
    let c = arr.filter((o) => o.rarity === rar);
    if (!c.length) c = arr;
    return G.thinFairy(() => (G.Classes ? G.Classes.pick(r, c) : r.pick(c))); // (a class's favourites turn up x1.3)
  }
  // the armour shelf is where gear is bought: mostly epic / legendary (a little less of the legendary in the first few areas)
  function pickArmor(r, luck) {
    const ramp = 0.45 + 0.55 * Math.min(1, (GM.area || 1) / 8), lk = 1 + Math.max(0, luck) * 0.5;
    const deep = Math.max(0, Math.min(1, ((G.Run ? G.Run.depthArea(GM.area || 1) : GM.area || 1) - 30) / 20)); // ミシック: from depth 30, fully at 50
    const W = { common: 3, uncommon: 9, rare: 28, epic: 38 * lk, legendary: 22 * ramp * lk, mythic: 4 * deep * lk };
    const rar = r.weighted(G.RARITY_ORDER.filter((k) => W[k] !== undefined), (k) => W[k]);
    const c = G.ARMOR.filter((o) => o.rarity === rar);
    return G.Classes ? G.Classes.pick(r, c.length ? c : G.ARMOR) : r.pick(c.length ? c : G.ARMOR); // (the heavy's favourites: x1.3)
  }
  GM.pickOffer = function (k, used, r) {
    r = r || new G.RNG((Math.random() * 1e9) >>> 0);
    const luck = P.stats.luck;
    for (let t = 0; t < 14; t++) {
      let c;
      if (k === 'melee') c = pickBy(r, G.MELEE.filter((x) => !G.isDefaultMelee(x.id) && x.id !== P.melee.id), luck);
      else if (k === 'weapon') c = pickBy(r, G.WEAPONS.filter((x) => x.id !== 'starter' && !P.weapons.some((pw) => pw.id === x.id)), luck);
      else if (k === 'mythic' || k === 'mythicGun') { const pool = [...G.WEAPONS.filter((x) => x.mythic && !P.weapons.some((pw) => pw.id === x.id)), ...(k === 'mythic' ? G.MELEE.filter((x) => x.mythic && x.id !== P.melee.id) : []),
          // (every other kind of ミシック: attachments, skills, ultimates, relics, armour)
          ...G.ATTACHMENTS.filter((x) => x.rarity === 'mythic'), ...G.SKILLS.filter((x) => x.rarity === 'mythic' && !P.skills.some((s) => s && s.id === x.id)), ...(G.ULTS || []).filter((x) => x.rarity === 'mythic' && !(P.skills[0] && P.skills[0].id === x.id)),
          ...G.BUFFS.filter((b) => b.relic && b.rarity === 'mythic' && !P.has(b.id)), ...(r.next() < 0.3 ? G.ARMOR.filter((x) => x.rarity === 'mythic') : [])]; c = pool.length ? r.pick(pool) : null; }
      else if (k === 'relic') { const pool = G.BUFFS.filter((b) => b.cat === 'relic' && !P.has(b.id)); c = pool.length ? r.pick(pool) : null; }
      else if (k === 'forge') c = GM.SVC_FORGE;
      else if (k === 'tome') c = P.skills.some((s) => s && (s.lv || 0) < G.abilities.MAXLV) ? GM.SVC_TOME : null;
      else if (k === 'skill') c = pickBy(r, G.SKILLS.filter((x) => !P.skills.some((s) => s && s.id === x.id)), luck);
      else if (k === 'attachment') { const comp = G.ATTACHMENTS.filter((a) => [...P.weapons, P.melee].some((pw) => G.attOk(a, pw))); c = pickBy(r, comp.length ? comp : G.ATTACHMENTS, luck); }
      else if (k === 'grenade') c = pickBy(r, G.ITEMS.filter((x) => x.cat === 'grenade'), luck);
      else if (k === 'armor') c = pickArmor(r, luck);
      else if (k === 'util') c = pickBy(r, G.ITEMS.filter((x) => x.cat !== 'grenade'), luck);
      else if (k === 'item') c = pickBy(r, G.ITEMS, luck);
      else if (k === 'pile' || k === 'tech') c = GM.rollBuffs(1, false, G.isTech)[0];
      else if (k === 'ult') c = pickBy(r, G.ULTS.filter((x) => !(P.skills[0] && P.skills[0].id === x.id)), luck);
      else c = GM.rollBuffs(1)[0];
      if (c && !(used && used.has(c.id))) return c;
    }
    return null;
  };
  GM.REVIVE = { id: 'revive_ticket', name: '封魂の灯籠', icon: '🪔', rarity: 'legendary', kind: 'revive', desc: '彷徨う魂を封じた灯籠。魂の灯火が一つ増える。灯火は命尽きた時に燃え、そのエリアに入った最初から再開する（持ち物・加護・敵はその時点に戻り、HP全快・クールタイムはリセット）。' };
  GM.revivePrice = () => GM.price(4200 + GM.area * 160);
  GM.SVC_FORGE = { id: 'svc_forge', name: '鍛冶屋の出張', icon: '⚒️', rarity: 'rare', desc: '所持している銃か近接武器を1つ選んで強化値+1（ダメージ×1.13）。' };
  GM.SVC_TOME = { id: 'svc_tome', name: 'スキル強化の書', icon: '📘', rarity: 'epic', desc: '所持スキルを1つ選んでレベル+1（効果量UP・クールタイム-2%）。価格は、選んだスキルの今の Lv で決まる。' };
  // what the tome can raise right now, each with its own price (the same rule as the forge: 900 x 1.25^that skill's Lv)
  GM.tomeTargets = function () {
    const MAXLV = G.abilities.MAXLV, out = [], AR = G.Areas;
    if (P.pileLevel() < MAXLV) out.push({ pile: true, lv: P.pileLevel(), cost: AR.skillLvCost(P.pileLevel()) });
    P.skills.forEach((s, i) => { if (s && (s.lv || 0) < MAXLV) out.push({ s, i, lv: s.lv || 0, cost: AR.skillLvCost(s.lv || 0) }); });
    return out;
  };
  GM.tomeRange = function () { const c = GM.tomeTargets().map((x) => x.cost); return c.length ? [Math.min(...c), Math.max(...c)] : [0, 0]; };
  GM.tomePrice = () => GM.tomeRange()[0];
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
  GM.shopLvOf = (obj) => Math.min(GM.shopLv(), G.Areas.forgeCap(obj)); // (never past the weapon's own forge cap)
  GM.forgeTargets = () => G.weapons.orderList().map((t) => (t === 'm' ? { w: P.melee, gun: false, t } : { w: t, gun: true, t })).filter((x) => x.w.id !== (G.BARE_MELEE || 'fists') && (x.w.lv || 0) < G.Areas.forgeCap(x.w));
  GM.forgeRange = function () { const c = GM.forgeTargets().map((x) => G.Areas.forgeCost(x.w)); return c.length ? [Math.min(...c), Math.max(...c)] : [0, 0]; };
  GM.priceLabel = (o) => (o.free ? '無料!' : o.kind === 'forge' || o.kind === 'tome' ? (() => { const [a, b] = o.kind === 'forge' ? GM.forgeRange() : GM.tomeRange(); return a === b ? U.fmt(a) : `${U.fmt(a)}~${U.fmt(b)}`; })() : U.fmt(o.price));
  GM.offerPrice = function (kind, obj) {
    if (kind === 'forge') return GM.forgeRange()[0];
    if (kind === 'tome') return GM.tomePrice();
    if (kind === 'weapon' || kind === 'melee') return GM.price(obj.price * (1 + 0.1 * GM.shopLvOf(obj)), true); // (ミシック too: forged with depth, +10% a level; no per-visit rise)
    return GM.price(kind === 'buff' ? BUFF_PRICE[obj.rarity] * (G.isTech(obj) ? 1.2 : 1) : obj.price);
  };
  GM.setupShop = function (w) {
    GM.run.shopVisits++;
    const S = GM.shop = { offers: [], rerolls: 0, w };
    GM.fillShop();
    S.lines = ['ほう…生きてここまで来たか。', '金さえあれば、何でも揃うさ。', '深淵の底には何があるか、知りたいかね？', 'この先の守護者は手強いぞ。', '武器は高いが、命よりは安い。', '良い品を選ぶといい。次は無いかもしれん。'];
    S.talkT = 2;
    G.Pawn.setup(w);
    // 常連客: the free offer is named 2.4 s in, looked up then on the shelves as they are: "continue" restores the mid-area save after this
    // (other shelves, the free one already bought or rerolled away), and the offer stocked here would be named again for nothing
    if (P.has('e_free')) setTimeout(() => { const fr = GM.shop === S ? S.offers.find((o) => o.free && !o.sold) : null; if (fr) { G.ui.toast(`🎁 常連客特典：${fr.obj.icon} ${fr.obj.name} が無料！ 緑に光る台を探せ`, 'good'); G.sfx.ui('rare'); } }, 2400);
  };
  GM.fillShop = function () { GM._rb = G.Run.shopRarityBonus(GM.area); try { fillShopBody(); } finally { GM._rb = 0; } };
  function fillShopBody() {
    const S = GM.shop, w = S.w;
    const r = new G.RNG((GM.seed ^ U.hashStr('shop' + GM.area + ':' + S.rerolls)) >>> 0);
    const luck = P.stats.luck;
    for (const o of S.offers) if (o.mesh) w.group.remove(o.mesh);
    // six booths (slot order = hall layout): weapons (3) / skills (5, the first is always an ultimate) / upgrades + parts (5) / consumables (5) / armour (5) / boons (5)
    // (the weapon upgrade sits on its own plinth by the weapon island, the skill tome by the skill stall)
    const kinds = ['arms', 'arms', 'arms', 'forge',
      'ult', 'skill', 'skill', 'skill', 'skill', 'tome',
      'attachment', 'attachment', 'attachment',
      'item', 'item', 'item',
      'armor', 'armor', 'armor', 'armor', 'armor',
      'buff', 'buff', 'buff', 'buff', 'tech'];
    const item0 = kinds.indexOf('item');
    if (GM.area >= 8) kinds[kinds.length - 1] = 'relic';
    // ミシック (from area 15, 60%): one of any kind, set out on the stall of its own kind - a gun / melee weapon on the weapons island,
    // armour among the armour, a skill among the skills ... (it used to always take the first weapon pedestal, whatever it was)
    let mythAt = -1, mythObj = null;
    if (GM.area >= 15 && r.chance(0.6)) {
      mythObj = GM.pickOffer('mythic', new Set(), r);
      if (mythObj) {
        const mk = mythObj.relic ? 'relic' : ['attachment', 'skill', 'ult', 'armor'].includes(mythObj.kind) ? mythObj.kind : 'arms';
        mythAt = mk === 'relic' ? kinds.lastIndexOf('relic') : kinds.indexOf(mk);
        if (mythAt < 0) mythObj = null;
      }
    }
    const used = new Set();
    const offers = [];
    let meleeN = mythObj && mythObj.kind === 'melee' ? 1 : 0; // never two melee weapons on the shelves
    kinds.forEach((k, i) => {
      if (i === mythAt) k = 'mythic';
      // weapon pedestals are fully random between guns and melee, but never more than one melee weapon
      if (k === 'arms') { k = meleeN === 0 && r.chance(G.MELEE.length / (G.MELEE.length + G.WEAPONS.length) * 1.3) ? 'melee' : 'weapon'; if (k === 'melee') meleeN++; }
      let obj = k === 'mythic' ? mythObj : GM.pickOffer(k === 'item' ? (i === item0 ? 'grenade' : 'util') : k, used, r);
      if (!obj && (k === 'mythic' || k === 'relic' || k === 'tome')) { k = k === 'mythic' ? 'weapon' : k === 'tome' ? 'skill' : 'buff'; obj = GM.pickOffer(k, used, r); }
      if (!obj) return;
      used.add(obj.id);
      const kind = k === 'pile' || k === 'tech' ? 'buff' : k === 'mythic' ? (obj.relic ? 'relic' : obj.kind === 'melee' || obj.kind === 'attachment' || obj.kind === 'skill' || obj.kind === 'ult' || obj.kind === 'armor' ? obj.kind : 'weapon') : k;
      const inst = kind === 'armor' ? G.Inv.makeArmor(obj.id, () => r.next()) : null; // armour: enchantments are rolled when the shelf is stocked
      offers.push({ kind, obj, inst, price: Math.round(GM.offerPrice(kind, obj) * (inst ? G.Inv.enchMul(inst) : 1) / 10) * 10, sold: false, slot: w.shopSlots[i], lv: kind === 'weapon' || kind === 'melee' ? GM.shopLvOf(obj) : 0 });
    });
    // (the forge and the tome only count while there is something they can raise)
    if (P.has('e_free') && GM.run.freeArea !== GM.area) { const g = offers.filter((o) => o.kind !== 'buff' && !(o.kind === 'forge' && !GM.forgeTargets().length) && !(o.kind === 'tome' && !GM.tomeTargets().length)); if (g.length) { const f = r.pick(g); f.price = 0; f.free = true; GM.run.freeArea = GM.area; } }
    // rare: a revive charm for a fortune
    if (G.Run.revivesAllowed() && r.chance(0.16 + Math.min(0.1, GM.area * 0.004))) { const o = offers.find((x) => x.kind === 'buff' && x.obj.cat !== 'pile'); if (o) { o.kind = 'revive'; o.obj = GM.REVIVE; o.price = GM.revivePrice(); o.free = false; } }
    S.offers = offers;
    for (const o of offers) buildPedestal(o, w);
  }
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
      const wrap = new THREE.Group(); wrap.add(disp); { const L = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z), cap = s.big ? 2.1 : 1.42; let k = s.big ? 1.75 : 1.3; if (L * k > cap) k = cap / L; wrap.scale.setScalar(k); } disp = wrap;   // (a long gun is shown a little smaller: it must not hide the ware on the next stand)
      disp.position.y = s.big ? 0.55 : 0.45; // the weapon island shows its guns larger
    } else {
      disp = new THREE.Group();
      const PG = G.Props.PG;
      const col = new THREE.Color(rc);
      const m = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.35), metalness: 0.6, roughness: 0.3 });
      // (what stands on a shop's stands, shaped in gfx.js wareGeo: an anvil, a tome, a scroll, a breastplate, a medal, a lantern, a
      // sight, a flask, a rune stone. The part that tells the rarity takes its colour; the rest is iron, hide, glass)
      const WG = G.GFX && G.GFX.wareGeo, WM2 = G.weapons.mats, mk = (c, o2) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7 }, o2 || {}));
      const MM = { rc: m, iron: WM2.gun, steel: WM2.steel, wood: w.mats.woodDark, page: w.mats.candle, leather: mk(0x3a2216), gold: mk(0x9c7a36, { metalness: 0.9, roughness: 0.4 }), glass: mk(0xa8c0c8, { transparent: true, opacity: 0.28, roughness: 0.05 }), stone: mk(0x4a4844, { roughness: 0.95 }), wax: mk(0x6e1414, { roughness: 0.45 }) };
      const ware = (name) => { const d = WG ? WG(name) : null; if (!d) return false; for (const q of d) disp.add(new THREE.Mesh(q.g, MM[q.m] || WM2.gun)); return true; };
      const glow = (c, sz, op) => { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.setScalar(sz); disp.add(gl); };
      if (o.kind === 'forge') ware('forge');
      else if (o.kind === 'tome') { ware('tome'); glow(0x80a0ff, 0.5, 0.3); }
      else if (o.kind === 'armor') { const A = G.ARMOR_MAT_BY_ID[o.obj.mat]; MM.plate = new THREE.MeshStandardMaterial({ color: new THREE.Color(A.col), metalness: o.obj.mat === 'plate' || o.obj.mat === 'chain' ? 0.8 : 0.1, roughness: 0.5 }); ware('armor'); }
      else if (o.kind === 'relic') { ware('relic'); glow(0xffb040, 0.6, 0.35); }
      else if (o.kind === 'revive') {   // (the soul lantern: an iron lantern about a pale flame)
        ware('revive');
        const flame = new THREE.Mesh(PG.sph, new THREE.MeshBasicMaterial({ color: 0xc8e4ff })); flame.scale.set(0.04, 0.07, 0.04); disp.add(flame);
        glow(0x80c8ff, 0.45, 0.7);
      }
      else if (o.kind === 'skill') ware('skill');
      else if (o.kind === 'attachment') ware('attachment');
      else if (o.kind === 'item') {   // (a consumable as the thing it is - a roll of gauze, a kit, a flask - itemanim.js display; a flask where it has no shape)
        if (o.obj.cat === 'grenade' && G.GrenFX) disp.add(G.GrenFX.build(o.obj.id, 1.25));
        else { const sh = G.ItemAnim && G.ItemAnim.display ? G.ItemAnim.display(o.obj.id, { fit: 0.3 }) : null; if (sh) disp.add(sh); else ware('potion'); }
      }
      else ware('buff');
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
  const _cdv = new THREE.Vector3(), _cbx = new THREE.Box3(), _cray = new THREE.Ray(), _chit = new THREE.Vector3(), _csz = new THREE.Vector3(), _cctr = new THREE.Vector3();
  // the world-space box of a corpse's model (re-measured while it is still falling, then kept)
  function corpseBox(c) {
    const e = c.e, m = e.model && e.model.group; if (!m) return null;
    if (!c.box || (!(e.deathT > 0.75) && GM.time - (c.boxT || -9) > 0.1)) {
      m.updateMatrixWorld(true); c.box = (c.box || new THREE.Box3()).setFromObject(m); c.boxT = GM.time;
      // a model with a broken part gives an empty / NaN box: fall back to a box around where the body lies
      const b = c.box;
      if (![b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].every(Number.isFinite) || b.isEmpty()) { const r = Math.max(0.5, e.radius || 0.6), h = Math.max(0.4, (e.height || 1) * 0.4); b.min.set(e.pos.x - r, e.pos.y, e.pos.z - r); b.max.set(e.pos.x + r, e.pos.y + h, e.pos.z + r); }
    }
    return c.box;
  }
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
    if (G.Rift.active()) { const q = G.Rift.reach(); consider(G.Rift.target(), q.r, { type: 'rift' }, q.d); }
    if (GM.shop) {
      for (const o of GM.shop.offers) if (!o.sold) consider(o.pos, 0.6, { type: 'offer', o });
      if (GM.stage === 'shop') {
        consider(w.rerollPos.clone().setY(1.0), 0.8, { type: 'reroll' });
        consider(w.fountainPos.clone().setY(1.0), 1.5, { type: 'fountain' }, 4);
      }
      if (GM.shop.mini && !GM.shop.healUsed && GM.shop.healPos) consider(GM.shop.healPos, 0.9, { type: 'miniheal' }, 3.4);
      if (!GM.shop.mini && w.sellPos) consider(w.sellPos, 1.3, { type: 'sell' }, 3.6);
    }
    // a corpse lies on its side, so its body is metres away from where the foe stood: aim at the body itself (a ray against its bounding box),
    // the nearest one you are looking at wins; a near miss on the centre still counts a little further down
    // when several bodies lie in line, the one whose middle is nearest the crosshair (relative to its size) is the one you mean
    // a body that has been searched and emptied is never a target (it only dims on the ground): it can't cover a full body or a chest behind it
    let cBest = null, cScore = Infinity, cT = 0, nearBest = null;
    for (const c of G.Inv.corpses) {
      if (c.searched && !c.cont.items.length) continue;
      const e = c.e; if (!e || e.removed || Math.hypot(e.pos.x - eye.x, e.pos.z - eye.z) > 9) continue;
      const b = corpseBox(c); if (!b) continue;
      _cbx.copy(b).expandByScalar(0.3);
      let t = Infinity;
      if (_cbx.containsPoint(eye)) t = 0; else { _cray.set(eye, f); const hp = _cray.intersectBox(_cbx, _chit); if (hp) t = eye.distanceTo(hp); }
      const ctr = b.getCenter(_cctr), sz = b.getSize(_csz), half = Math.max(0.5, Math.max(sz.x, sz.y, sz.z) / 2);
      const along = _cdv.copy(ctr).sub(eye).dot(f), perp = Math.sqrt(Math.max(0, ctr.distanceToSquared(eye) - along * along));
      if (t <= 4.4) { const score = perp / half; if (score < cScore) { cScore = score; cBest = { type: 'corpse', c }; cT = t; } } // the crosshair is on the body
      else if (along > 0 && perp < Math.min(1.3, Math.max(0.7, Math.max(sz.x, sz.z) * 0.4)) && ctr.distanceTo(eye) <= 4.4) { // a near miss on the middle: only when nothing else is aimed at (below)
        if (!nearBest || perp < nearBest.perp) nearBest = { type: 'corpse', c, perp };
      }
    }
    if (cBest && cT < bd) { bd = cT; best = cBest; }
    for (const g of G.Inv.ground) consider(g.pos, 0.6, { type: 'loot', g }, 3.2);
    if (w.benchPos && G.Parts) consider(w.benchPos, 1.0, { type: 'partbench' }, 3.6);
    for (const it of w.interactables) {
      if (it.type === 'chest' && it.opened && it.cont && it.cont.items.length) consider(it.pos, 0.9, { type: 'chestOpen', it }, 3.2);
      if (it.type === 'chest' && !it.opened) consider(it.pos, 0.9, { type: 'chest', it }, 3.2);
      else if (it.type === 'npc' && !it.used) consider(it.pos, 1.0, { type: 'npc', it }, 4);
      else if (it.type === 'shrine' && !it.used) consider(it.pos, 1.2, { type: 'shrine', it }, 4);
      else if (it.type === 'anvil') consider(it.pos, 1.2, { type: 'anvil', it }, 4);
      else if (it.type === 'cauldron') consider(it.pos, 1.3, { type: 'cauldron', it }, 4);
      else if (it.type === 'celldoor' && it.door.state !== 'broken') consider(it.pos, 1.0, { type: 'celldoor', it }, 3.4);
      else if (it.type === 'gimmick' && (!it.gim.used || (G.Gim.K[it.gim.kind] || {}).cd)) consider(it.pos, it.r, { type: 'gimmick', it }, it.reach); // (one gathering itself again tells you how long)
    }
    if (!best && nearBest) best = nearBest;
    lookTarget = best;
    G.ui.holdRing(-1); // shown again below while a search is running
    updateSearch(dt);
    if (!best) { G.ui.showInteract(null); return; }
    const coins = GM.run.coins;
    if (best.type === 'offer') {
      const o = best.o, ob = o.obj;
      const info = describeOffer(o);
      G.ui.showInteract({ key: 'o' + ob.id + coins + P.wIdx, icon: o.kind === 'armor' ? G.armorIcon(ob) : ob.icon, el: G.Elem.tagOf(ob), name: ob.name, rc: G.ui.R(ob.rarity), cat: info.cat, desc: U.esc(ob.desc), stats: info.stats, note: info.note, price: (o.kind === 'forge' || o.kind === 'tome') && !o.free ? GM.priceLabel(o) : o.price, afford: coins >= ((o.kind === 'forge' || o.kind === 'tome') && !o.free ? (o.kind === 'forge' ? GM.forgeRange()[0] : GM.tomeRange()[0]) : o.price), action: info.action || '購入' });
    } else if (best.type === 'sell') {
      G.ui.showInteract({ key: 'sell' + coins, icon: '⚖️', name: '買取屋', rc: '#e0c070', cat: `持ち物を売る（買値の${Math.round(G.Pawn.RATE * 100)}%）`, desc: '武器・近接武器・アタッチメント・部品・防具・消耗品・投擲物・スキル・金品を売却できる。', action: '売る' });
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
      G.ui.showInteract({ key: 'anvil' + coins, icon: '⚒️', name: '鍛冶の金床', rc: '#e08040', cat: '武器・スキルの強化', desc: P.weapon ? `${P.weapon.def.name} +${P.weapon.lv || 0}（最大+${G.Areas.forgeCap(P.weapon)}）` : '近接武器・スキルを鍛える', action: '鍛える' });
    } else if (best.type === 'cauldron') {
      const left = Math.max(0, 2 - (best.it.used || 0));
      if (left <= 0) G.ui.showInteract({ key: 'cauldron0', icon: '⚗️', name: '練成の釜（火は消え、冷え切っている）', rc: '#7a8480', cat: '練成終了（残り 0 / 2回）', desc: '「釜の火は消え去った。深淵の恵みはここまでだ…」', action: null });
      else G.ui.showInteract({ key: 'cauldron' + left, icon: '⚗️', name: '練成の釜', rc: '#58d898', cat: `防具・武器・部品・アタッチメント・消耗品・金品の練成（残り ${left} / 2回）`, desc: '同種・同レアリティの品を2つ掛け合わせ、1段階上位の品へと練成する。', action: '練成する' });
    } else if (best.type === 'partbench') {
      const inf = G.Parts.benchInfo(!!w.benchFree);
      G.ui.showInteract(Object.assign({ key: 'bench' + coins + G.Inv.ver }, inf));
    } else if (best.type === 'rift') {
      G.ui.showInteract({ key: 'rift', icon: '✨', name: '光の裂け目', rc: '#ffe6a8', cat: 'この先に、深淵の外の光が見える', desc: '', action: '入る' });
    } else if (best.type === 'corpse') {
      const c = best.c, e = c.e;
      const S = GM.search && GM.search.it === c ? GM.search : null;
      const n = c.cont.items.length;
      G.ui.showInteract({ key: 'corpse' + (S ? 's' : '') + n + (c.searched ? 'o' : ''), icon: '💀', name: `${e.def.name}の亡骸`, rc: '#a89a88', cat: c.searched ? (n ? `中身 ${n}個` : '空っぽ') : `亡骸を漁る — ${GM.searchDur(1).toFixed(1)}秒`, desc: S ? '漁っている… 目を離したり離れると最初から' : c.searched ? (n ? '中身を確認できる' : '何も残っていない') : '一度押すと漁り始める。', action: c.searched ? (n ? '開く' : null) : S ? '漁っている…' : '漁る' });
      if (I.hit('interact') && !S) {
        if (c.searched) { if (n) G.InvUI.open(c.cont, c); }
        else GM.startSearch(c, (c.box ? c.box.getCenter(V()) : e.pos.clone().setY(e.pos.y + 0.45)), 1, '💀', () => { c.searched = true; if (e.clearTarget) e.clearTarget(); G.sfx.ui('open'); G.InvUI.open(c.cont, c); }, '亡骸を漁っている…');
      }
      return;
    } else if (best.type === 'loot') {
      const g = best.g, d = G.Inv.def(g.it);
      G.ui.showInteract({ key: 'loot' + g.it.uid, icon: d.icon, el: G.Elem.itemTag(g.it), name: d.name + (g.it.n > 1 ? ` ×${g.it.n}` : ''), rc: G.ui.R(d.rarity), cat: '地面に落ちている', desc: '', action: '拾う' });
      if (I.hit('interact')) G.Inv.pickUp(g);
      return;
    } else if (best.type === 'chestOpen') {
      const it = best.it;
      G.ui.showInteract({ key: 'chesto' + it.cont.items.length, icon: it.icon, name: GM.CHEST_NAMES[it.tier], rc: ['#b8b2a7', '#4d9be6', '#f0a030', '#ff68d8'][it.tier], cat: `中身 ${it.cont.items.length}個`, desc: '', action: '開く' });
      if (I.hit('interact')) G.InvUI.open(it.cont, it);
      return;
    } else if (best.type === 'chest') {
      const it = best.it;
      const S = GM.search && GM.search.it === it ? GM.search : null;
      const dur = GM.searchDur(GM.CHEST_SEARCH[it.tier]);
      G.ui.showInteract({ key: 'chest' + it.tier + (S ? 's' : ''), icon: it.icon, name: GM.CHEST_NAMES[it.tier], rc: ['#b8b2a7', '#4d9be6', '#f0a030', '#ff68d8'][it.tier], cat: `宝箱 — 探索 ${dur.toFixed(1)}秒`, desc: S ? '探索中… 視点を大きく外したり離れると最初からやり直し' : '一度押すと探索を始める。終わるまで宝箱から目を離さないこと。', action: S ? '探索中…' : '探す' });
      if (I.hit('interact') && !S) GM.startSearch(it, it.pos, GM.CHEST_SEARCH[it.tier], it.icon, () => { G.sfx.chestUnlock && G.sfx.chestUnlock(it.pos); doInteract(best); });
      return;
    } else if (best.type === 'celldoor') {
      // a prison cell's iron gate (strata fields): one press, keep looking at it for 2 s
      const it = best.it, closing = it.door.state === 'open', tgt = closing ? (it.closer || (it.closer = { door: it.door })) : it, S = GM.search && GM.search.it === tgt ? GM.search : null, dur = GM.searchDur(1);
      if (closing) { // an open gate can be shut again: the same hold, and only when nobody stands in the doorway
        G.ui.showInteract({ key: 'cdoorc' + (S ? 's' : ''), icon: '🔒', name: '鉄格子の扉', rc: '#9aa4b0', cat: `閉める — ${dur.toFixed(1)}秒`, desc: S ? '閉めている… 視点を大きく外したり離れると最初からやり直し' : '一度押して、そのまま扉を見続ける', action: '閉める' });
        if (I.hit('interact') && !S) GM.startSearch(tgt, it.pos, 1, '🔒', () => { if (!G.Strata.closeDoor(it.door)) G.ui.toastSmall('🚪 扉の前に誰かいて閉められない'); }, '扉を閉めている…');
        return;
      }
      G.ui.showInteract({ key: 'cdoor' + (S ? 's' : ''), icon: '🔓', name: '鉄格子の扉', rc: '#9aa4b0', cat: `開ける — ${dur.toFixed(1)}秒`, desc: S ? '開けている… 視点を大きく外したり離れると最初からやり直し' : '一度押すと開け始める。終わるまで扉から目を離さないこと。', action: S ? '開けている…' : '開ける' });
      if (I.hit('interact') && !S) GM.startSearch(it, it.pos, 1, '🔓', () => G.Strata.openDoor(it.door), '扉を開けている…');
      return;
    } else if (best.type === 'gimmick') {
      // the field's device (gimmick.js): worked with the key (one press, keep looking at it), or only named when it is set off by shooting it
      G.Gim.prompt(best.it, I);
      return;
    }
    if (I.hit('interact')) doInteract(best);
  }
  // ---------------- timed search (chests, corpses): one press, keep looking at it ----------------
  GM.CHEST_SEARCH = [1, 1, 2, 2];
  GM.CHEST_NAMES = ['古びた宝箱', '上等な宝箱', '装飾された宝箱', '守護者の秘宝箱'];
  GM.searchDur = (base) => base;
  GM.search = null;
  GM.startSearch = function (it, pos, base, icon, onDone, label) {
    if (P.handsBlocked()) return; // (both hands go into it: not in the pile driver's slam; a reload, an item ... are put down, player.js stopActions)
    P.beginHands('search');
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
    const to = S.pos.clone().sub(eye), box = S.it && S.it.box; // a corpse is judged by its whole body, not just its middle
    let d = to.length(); if (box) d = Math.min(d, box.distanceToPoint(eye) + 1);
    if (d > 4.4) { GM.cancelSearch('離れたので探索をやめた'); return; }
    let aimed = to.normalize().dot(f) >= 0.72; // ~44° off the target resets
    if (!aimed && box) { _cbx.copy(box).expandByScalar(0.5); aimed = _cbx.containsPoint(eye) || !!_cray.set(eye, f).intersectBox(_cbx, _chit); }
    if (!aimed) { GM.cancelSearch('目を離したので探索をやめた'); return; }
    S.t += dt;
    const k = Math.min(1, S.t / S.dur);
    const it = S.it;
    if (it && it.lid) it.lid.rotation.x = -Math.min(0.12, k * 0.12) + Math.sin(GM.time * (30 + k * 30)) * (0.006 + k * 0.016);
    S.pryT -= dt;
    if (S.pryT <= 0) { S.pryT = 0.3 - 0.18 * k; G.sfx.chestPry ? G.sfx.chestPry(k, S.pos, !(it && it.lid)) : G.sfx.mech('click'); } // (a thing with a lid is pried; anything else is gone through by hand)
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
      cat = `🔫 ${ob.cat} · ${G.RARITY[ob.rarity].name}${o.lv ? `　⚒️強化済み +${o.lv}` : ''}`;
      const cur = P.weapon ? G.weapons.stats(P.weapon) : { dmg: 0, pellets: 1, rpm: 0, mag: 0, reload: 0, spread: 0 }; // no gun in hand: everything is a gain
      const cmp = (label, a, b, fmt, better) => { const up = better === 'low' ? a < b : a > b; const cls = Math.abs(a - b) < 1e-6 ? '' : up ? 'up' : 'down'; return `<div>${label} <b class="${cls}">${fmt(a)}</b> <span style="opacity:.6">(${fmt(b)})</span></div>`; };
      // the gun on the shelf as you would hold it: its forge level and your own stats, the same as the one in your hand (not its bare Lv0 numbers)
      const sh = G.weapons.stats({ id: ob.id, def: ob, atts: {}, lv: o.lv || 0, ver: 0 });
      const nd = sh.dmg * (sh.pellets || 1), cd = cur.dmg * (cur.pellets || 1);
      stats = cmp('💥ダメージ', nd, cd, (v) => Math.round(v)) + cmp('🔁連射', sh.rpm, cur.rpm, (v) => Math.round(v)) + cmp('📊DPS', nd * sh.rpm / 60, cd * cur.rpm / 60, (v) => Math.round(v)) + cmp('📦装弾数', sh.mag, cur.mag, (v) => v) + cmp('♻️リロード', sh.reload, cur.reload, (v) => v.toFixed(1) + 's', 'low') + cmp('🎯拡散', sh.spread, cur.spread, (v) => v.toFixed(1) + '°', 'low');
      if (ob.trait) note += `${G.WEAPON_TRAITS[ob.trait].icon} ${G.WEAPON_TRAITS[ob.trait].name}: ${G.WEAPON_TRAITS[ob.trait].desc}　`;
      if (P.weapons.length >= P.stats.weaponSlots) note += '⚠ 武器スロット満杯：購入時に交換する武器を選択（旧武器は下取り）';
    } else if (o.kind === 'melee') {
      cat = `🗡️ 近接武器（${ob.cat}） · ${G.RARITY[ob.rarity].name}${o.lv ? `　⚒️強化済み +${o.lv}` : ''}`;
      // both as you would swing them: their forge levels and your own stats (the one on the shelf may come forged)
      const cur = G.weapons.meleeStats(P.melee), sm = G.weapons.meleeStats({ id: ob.id, def: ob, lv: o.lv || 0, atts: {} });
      const cmp = (label, a, b, fmt, better) => { const up = better === 'low' ? a < b : a > b; const cls = Math.abs(a - b) < 1e-6 ? '' : up ? 'up' : 'down'; return `<div>${label} <b class="${cls}">${fmt(a)}</b> <span style="opacity:.6">(${fmt(b)})</span></div>`; };
      stats = cmp('💥ダメージ', sm.dmg, cur.dmg, (v) => Math.round(v)) + cmp('⚡攻撃間隔', sm.swing, cur.swing, (v) => v.toFixed(2) + 's', 'low') + cmp('📊DPS', sm.dmg / sm.swing, cur.dmg / cur.swing, (v) => Math.round(v)) + cmp('📏リーチ', sm.range, cur.range, (v) => +v.toFixed(1) + 'm') + cmp('🔨重撃', sm.heavy[0], cur.heavy[0], (v) => '×' + v) + cmp('👟移動', sm.moveMul, cur.moveMul, (v) => '×' + v.toFixed(2));
      if (ob.traitDesc) note += '✦ ' + ob.traitDesc + '　';
      { const tv = G.Pawn.tradeValue(P.melee, true); if (tv > 0) note += `♻️ 今の${P.melee.def.name}は下取り +${U.fmt(tv)}🪙　`; }
      note += `⚠ 現在の ${cur.icon}${cur.name} と交換（${G.K('w3')}）`;
    } else if (o.kind === 'forge') {
      cat = '⚒️ 強化サービス'; note = `購入時に強化する武器を選ぶ（上限はレアリティで決まる: ${G.Areas.capText()}）・価格は武器の強化値で変わる`;
    } else if (o.kind === 'tome') {
      cat = '📘 スキル強化'; note = '購入時に強化するスキルを選ぶ・価格はそのスキルの Lv で変わる：' + P.skills.filter((s) => s).map((s) => `${s.def.icon}Lv${(s.lv || 0) + 1}`).join(' ');
    } else if (o.kind === 'relic') {
      cat = '🏺 遺物（常時効果・最大3つ）'; note = `所持遺物 ${GM.relicCount()}/3` + (GM.relicCount() >= 3 ? '　⚠ 購入時に手持ちの遺物と入れ替え' : '');
    } else if (o.kind === 'revive') {
      cat = '🪔 魂の灯火 · レジェンダリー'; note = `灯火 ${P.revives} → ${P.revives + 1}`;
    } else if (o.kind === 'attachment') {
      cat = `${G.ATT_SLOTS[ob.slot].icon} アタッチメント（${G.ATT_SLOTS[ob.slot].name}）`;
      const ok = P.weapons.filter((pw) => G.attOk(ob, pw));
      if (!ok.length) note = '⚠ 今の武器には装着できない（インベントリに入る）';
      else if (ok.length === 1) { note = `装着先: ${ok[0].def.icon} ${ok[0].def.name}`; if (ok[0].atts[ob.slot]) note += `（${G.ATT_BY_ID[ok[0].atts[ob.slot]].name} と交換・外したものはインベントリへ）`; }
      else note = '購入時に装着する武器を選択';
    } else if (o.kind === 'item') {
      cat = `${G.ITEM_CAT[ob.cat].icon} ${G.ITEM_CAT[ob.cat].name}`;
      if (!P.canAddItem(ob.id)) note = '⚠ 持ち物がいっぱいで持てない';
      const have = ob.cat === 'grenade' ? P.grenades[ob.id] || 0 : P.itemCount(ob.id);
      if (ob.slot === 'c') cat += `　[${G.K('item1')} / ${G.K('item2')}キー: 消耗品]`; else if (ob.passive) cat += '　[常時：持っているだけで発動]'; else if (ob.kit) cat += ob.data.forge ? '　[持ち物画面で武器へドラッグして強化]' : '　[持ち物画面で防具へドラッグして修復]';
      if (have) note += ` 所持 ×${have}`;
    } else if (o.kind === 'ult') {
      cat = `🌟 アルティメット（${G.input.skillKey(0)}） · CT ${ob.cd}秒`;
      const cur = P.skills[0]; note = cur ? `⚠ 現在の ${cur.def.icon} ${cur.def.name} と入れ替え` : `${G.input.skillKey(0)}に装備`;
    } else if (o.kind === 'skill') {
      cat = `🔮 スキル（${[1, 2, 3].map((i) => G.input.skillKey(i)).join('/')}） · CT ${Math.round(ob.cd * G.abilities.SKILL_CD_MUL)}秒`;
      const free = [1, 2, 3].find((i) => !P.skills[i]);
      if (!free) note = '⚠ スキル枠満杯：購入時に交換するスロットを選択';
      else note = `空きスロット ${G.input.skillKey(free)} に装備`;
    } else {
      const n = P.buffs.get(ob.id) || 0;
      cat = `🌟 加護 · ${ob.cat === 'trade' || ob.cat === 'curse' ? `<b class="cat-warn">${G.BUFF_CAT[ob.cat].name}</b>` : G.BUFF_CAT[ob.cat].name}${ob.skill ? ` · ${G.SKILL_BY_ID[ob.skill].icon} ${G.SKILL_BY_ID[ob.skill].name}専用` : ob.cat === 'pile' ? ' · 🔨 パイルドライバー専用' : ''}`;
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
    if (t.type === 'rift') return G.Rift.enter();
    if (t.type === 'chest') { if (t.it.trap) { t.it.opened = true; G.ui.showInteract(null); return G.Areas.springTrap(t.it); } return openChest(t.it); }
    if (t.type === 'npc') return G.Areas.runEvent(t.it);
    if (t.type === 'shrine') return G.Areas.useShrine(t.it);
    if (t.type === 'anvil') return G.Areas.useForge(t.it);
    if (t.type === 'cauldron') return G.Areas.useAlchemy(t.it);
    if (t.type === 'partbench') return G.Parts.open(!!(G.world && G.world.benchFree));
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
      if (!o.free) { if (o.kind === 'forge') o.price = GM.forgeRange()[0]; if (o.kind === 'tome') o.price = GM.tomeRange()[0]; } // (a free one stays free)
      if (run.coins < o.price) return deny('🪙 コインが足りない');
      const done = () => { run.coins -= o.price; o.sold = true; GM.quietUntil = performance.now() + 1200; G.sfx.ui('buy'); G.fx.sparks(o.pos, null, 20, 0xffd070, 4); G.fx.ring(o.pos.clone().setY(o.slot.y), 0.8, 0xffd070, 0.5); o.mesh.visible = false; G.ui.showInteract(null); G.ui.toast(`${ob.icon} ${ob.name} を購入`, 'good'); if (o.kind !== 'item' && o.kind !== 'forge' && o.kind !== 'tome') G.ui.itemCard(ob, o.kind === 'skill' ? '[スキル]' : o.kind === 'ult' ? `[${G.input.skillKey(0)} アルティメット]` : o.kind === 'weapon' ? '[武器]' : o.kind === 'melee' ? `[近接:${G.K('w3')}]` : o.kind === 'revive' ? '[魂の灯火]' : o.kind === 'attachment' ? '[装着]' : '[加護]'); G.ui.refreshWeapon(); G.ui.refreshItems(); if (o.kind !== 'revive' && o.kind !== 'forge' && o.kind !== 'tome') G.save.mark(o.kind === 'buff' ? 'buffs' : 'items', ob.id); };
      if (o.kind === 'buff') { P.addBuff(ob.id); return done(); }
      if (o.kind === 'armor') { G.Inv.give(P, 'armor', ob.id, 1, { ench: (o.inst && o.inst.ench) || [] }); return done(); }
      if (o.kind === 'revive') { P.revives++; G.sfx.ui('rare'); return done(); }
      if (o.kind === 'relic') { if (GM.relicCount() >= 3) return GM.relicSwap(ob, { onDone: done, cancelLabel: 'やめる（購入しない）' }); P.addBuff(ob.id); return done(); }
      if (o.kind === 'forge') {
        const list = GM.forgeTargets();
        if (!list.length) return deny('全て最大強化');
        return modal('⚒️ どれを鍛える？', `強化値+1（ダメージ×1.13）・強化値が高いほど高くなる・上限はレアリティで決まる（${G.Areas.capText()}）`, list.map((x) => { const c = o.free ? 0 : G.Areas.forgeCost(x.w); return { icon: x.w.def.icon, label: `${G.weapons.keyLabel(x.t)}${x.w.def.name} +${x.w.lv || 0} → +${(x.w.lv || 0) + 1}（${o.free ? '無料' : U.fmt(c) + '🪙'}）`, disabled: run.coins < c, onPick: () => { o.price = c; x.w.lv = (x.w.lv || 0) + 1; x.w.forge = (x.w.forge || 0) + c; if (x.gun) { x.w.ver++; if (x.w === P.weapon) G.weapons.equip(true); } done(); G.sfx.mech('magIn'); G.ui.toast(`⚒️ ${x.w.def.name} を +${x.w.lv} に強化した`, 'good'); } }; }));
      }
      if (o.kind === 'tome') {
        const list = GM.tomeTargets();
        if (!list.length) return deny('全て最大レベル');
        return modal('📘 どのスキルを強化する？', 'レベル+1（スキル・アルティメット：効果量UP・クールタイム-2%／パイルドライバー：威力+60%）　価格は、そのスキルの今の Lv で決まる', list.map((x) => {
          const d = x.pile ? { icon: '🔨', name: 'パイルドライバー', key: G.input.keyName('crouch') } : { icon: x.s.def.icon, name: x.s.def.name, key: G.input.skillKey(x.i) };
          const cost = o.free ? 0 : x.cost;
          return { icon: d.icon, label: `[${d.key}]${!x.pile && x.s.def.ult ? '（ULT）' : ''} ${d.name} Lv${x.lv + 1} → Lv${x.lv + 2}（${o.free ? '無料' : U.fmt(cost) + '🪙'}）`, disabled: run.coins < cost, onPick: () => {
            o.price = cost;
            if (x.pile) { P.pileTome = (P.pileTome || 0) + 1; G.sfx.ui('rare'); done(); }
            else { x.s.lv = x.lv + 1; x.s.maxCd = G.abilities.cdOf(x.s); done(); G.sfx.magic(P.pos, 'holy'); }
          } };
        }));
      }
      if (o.kind === 'melee') { G.Pawn.tradeIn(P.melee, true); P.melee = G.weapons.makeMelee(ob.id); P.melee.lv = o.lv || 0; done(); if (P.meleeMode) G.weapons.melee.equip(false); else G.weapons.setMelee(); return; }
      if (o.kind === 'item') { if (!P.canAddItem(ob.id)) return deny('持ち物がいっぱい'); P.addItem(ob.id, 1); return done(); }
      if (o.kind === 'weapon') {
        const mkW = () => { const nw = G.weapons.make(ob.id); nw.lv = o.lv || 0; nw.ver++; nw.mag = G.weapons.stats(nw).mag; return nw; };
        if (P.weapons.length < P.stats.weaponSlots) { P.weapons.push(mkW()); done(); G.weapons.switchTo(P.weapons.length - 1); return; }
        return modal('交換する武器を選択', `${ob.icon} <b>${ob.name}</b> と交換する武器を選んでください。手放す武器は<b>下取り</b>されます（買値の${Math.round(G.Pawn.RATE * 100)}%${P.has('e_salvage') ? '＋鉄屑回収30%' : ''}＋強化に使ったコインの${Math.round(G.Areas.FORGE_REFUND * 100)}%・初期装備は強化分のみ）。`, G.weapons.gunsInOrder().map((pw) => [pw, P.weapons.indexOf(pw)]).map(([pw, i]) => ({ icon: pw.def.icon, label: `${G.weapons.keyLabel(pw)}${pw.def.name}${pw.lv ? ' +' + pw.lv : ''}　→ 下取り +${U.fmt(G.Pawn.tradeValue(pw))}🪙`, sub: G.RARITY[pw.def.rarity].name + (Object.keys(pw.atts).length ? ' · アタッチメント' + Object.keys(pw.atts).length + '個（インベントリへ移動）' : ''), onPick: () => { G.Pawn.tradeIn(pw); GM.stashAtts(pw); P.weapons[i] = mkW(); P.wIdx = i; done(); G.weapons.equip(false); } })));
      }
      if (o.kind === 'ult') { P.skills[0] = G.abilities.makeSlot(ob.id); P.skills[0].cd = 20; G.ui.buildAbilityRow && G.ui.buildAbilityRow(); return done(); }
      if (o.kind === 'skill') {
        const free = [1, 2, 3].find((i) => !P.skills[i]);
        if (free) { P.skills[free] = G.abilities.makeSlot(ob.id); return done(); }
        return modal('交換するスキルスロットを選択', `${ob.icon} <b>${ob.name}</b> を装備するスロットを選んでください（${G.input.skillKey(0)}はアルティメット専用）。`, P.skills.map((s, i) => [s, i]).filter(([, i]) => i > 0).map(([s, i]) => ({ icon: s.def.icon, label: G.input.skillKey(i) + ': ' + s.def.name, sub: '交換すると失われます', onPick: () => { P.skills[i] = G.abilities.makeSlot(ob.id); done(); } })));
      }
      if (o.kind === 'attachment') {
        const ok = G.weapons.gunsInOrder().concat(ob.slot === 'core' && P.melee ? [P.melee] : []).map((pw) => [pw, P.weapons.indexOf(pw)]).filter(([pw]) => G.attOk(ob, pw)); // (a 属性コア fits the melee weapon too)
        if (!ok.length) { P.attStash.push(ob.id); done(); G.ui.toastSmall('🔩 インベントリに入れた（持ち物画面で装着）'); return; }
        const apply = (pw) => { const prev = pw.atts[ob.slot]; if (prev && prev !== ob.id) { P.attStash.push(prev); setTimeout(() => G.ui.toastSmall(`🗃️ 外した ${G.ATT_BY_ID[prev].icon} ${G.ATT_BY_ID[prev].name} はインベントリへ`), 400); } pw.atts[ob.slot] = ob.id; pw.ver++; G.weapons.dirty = true; if (pw === P.weapon) G.weapons.equip(true); if (pw === P.melee) G.weapons.melee.rebuild(); done(); };
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
    { epic: 40, legendary: 60 },
  ];
  GM.chestLoot = function (tier, pos) {
    const chance = [0.1, 0.5, 1, 1][tier] ?? 1;
    if (Math.random() >= chance) return null;
    // an ornate chest sometimes holds an attachment for the gun in your hands instead
    if (tier >= 2 && Math.random() < 0.35) {
      const comp = P.weapon ? G.ATTACHMENTS.filter((a) => G.attOk(a, P.weapon) && !P.weapon.atts[a.slot]) : [];
      if (comp.length) { const a = U.pick(comp); P.weapon.atts[a.slot] = a.id; P.weapon.ver++; G.weapons.equip(true); G.ui.toast(`${a.icon} ${a.name} を装着した！`, 'good'); return a; }
    }
    const W = GM.CHEST_RARITY[tier] || GM.CHEST_RARITY[2], ord = G.RARITY_ORDER;
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
    let coins = Math.round(G.Run.income((40 + n * 9) * ([1, 2.2, 4, 7][tier] || 4) * (1 + P.stats.chestBonus)));
    setTimeout(() => {
      G.combat.coins(coins, it.pos.clone().add(V(0, 0.6, 0)));
      G.fx.sparks(it.pos.clone().add(V(0, 0.6, 0)), V(0, 1, 0), 30, tier >= 3 ? 0xff78e8 : 0xffd070, 6);
      G.fx.flash(it.pos, tier >= 3 ? 0xff78e8 : 0xffd070, 40, 0.4, 8);
      G.sfx.coins(8);
      // health orbs sometimes spill out (instead of the old near-guaranteed consumables)
      if (Math.random() < ([0.5, 0.6, 0.7, 1.0][tier] || 0.7)) { const k = tier >= 3 ? U.randi(4, 6) : tier >= 2 ? U.randi(2, 3) : U.randi(1, 2); for (let i = 0; i < k; i++) C_orb(it.pos.clone().add(V(U.rand(-0.4, 0.4), 0.7, U.rand(-0.4, 0.4)))); }
      G.buffs.emit('onChest', {});
    }, 350);
    // what a chest holds is fixed by the run seed, the area and the chest's place: restarting the area (a soul lantern) opens the same contents
    { const rng = new G.RNG((GM.seed ^ U.hashStr('chest' + GM.area + ':' + Math.round(it.pos.x) + ',' + Math.round(it.pos.z))) >>> 0), keep = Math.random;
      Math.random = () => rng.next();
      try { it.cont = G.Inv.chestLoot(tier); } finally { Math.random = keep; } }
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
        if (G.Tutorial.active) { G.Tutorial.onGate(t.exit); return; } // practice gates lead nowhere
        GM.transitioning = true;
        G.sfx.whoosh(0.8, 0.8); G.sfx.rumble(1, 0.6);
        document.getElementById('fade').classList.add('on');
        const next = t.exit.type || 'combat';
        setTimeout(() => {
          GM.enterArea(GM.area + 1, next);
          // stay dark until the new area's shaders are ready (enterArea started that job)
          (GM._warmP || Promise.resolve()).then(() => { GM.transitioning = false; document.getElementById('fade').classList.remove('on'); });
        }, 650);
        return;
      }
    }
  }

  // ---------------- pause / lock ----------------
  function onLock(locked) {
    if (locked) {
      if (GM.state === 'paused' || GM.state === 'resuming' || GM.state === 'buff' || GM.state === 'modal') { GM.state = 'playing'; G.ui.clearScreen(); G.sfx.resume(); }
    } else if ((GM.state === 'playing' || GM.state === 'resuming') && performance.now() - (GM.escCloseT || -1e9) < 900) {
      // Esc closed a screen and the browser dropped the lock again together with fullscreen: take the lock back instead of showing the pause menu
      GM.escCloseT = 0; setTimeout(() => { if ((GM.state === 'playing' || GM.state === 'resuming') && !I.locked) I.requestLock(); }, 120);
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
  // leave for the title and keep the run: the slot keeps it, and the mid-area snapshot (taken right now) lets 続きから pick up where you stood
  GM.canSuspend = () => !!(GM.run && GM.slot && !GM.run.dev && !GM.tutorial && !G.Tutorial.active && !(G.Dev && G.Dev.on()) && GM.loadRun());
  GM.suspend = function () {
    if (!GM.canSuspend()) return;
    G.MidSave.tick();
    GM.toTitle();
  };
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
  // A soul lantern restarts the area from the beginning: you, your gear, buffs, coins and the foes are exactly as they were when you walked in
  // (the checkpoint written on entry), cooldowns are fresh and HP is full. The lantern itself is spent.
  GM.revive = function () {
    const d = GM.loadRun();
    GM.deathFrozen = false;
    const left = P.revives - 1;
    if (!d || d.area !== GM.area) { // no checkpoint for this area (should not happen): fall back to rising where you fell
      P.revives = left; P.dead = false; P.deathT = 0;
      P.pos.copy(P.lastSafe); P.pos.y += 0.05; P.vel.set(0, 0, 0); G.world.depenetrate(P.pos, P.hw, P.height);
      P.hp = P.stats.maxHp; P.invulnT = 3; P.st = {}; P.grapple.state = 'none'; P.pileState = null;
      G.sfx.heal(); G.ui.showHud(true); GM.resume(); return;
    }
    G.combat.clear(); G.enemies.clear(); G.bosses.clear(); G.fx.clear();
    G.ui.bossBar(null);
    // everything timed or half-done from the life that ended
    GM.chronoT = 0; GM.enemyTimeScale = 1;
    if (G.abilities.clearUltAuras) G.abilities.clearUltAuras();
    if (G.GrenHold) G.GrenHold.putAway(true);
    if (G.ItemAnim && G.ItemAnim.abort) G.ItemAnim.abort();
    for (const k of ['wardT', 'bladesT', 'invisT', 'smokeT', 'healZoneT', 'dragT', 'pullT', 'gravFreeAt', 'pileLandT']) P[k] = 0;
    P.healGauge = null; P.sprintToggle = false; P.sprinting = false; P._spCancel = false;
    { const keepT = GM.run.playT || 0, keepD = GM.run.dmgDealt || 0; // time and damage dealt are totals of the whole run: a restart of the area does not take them back
      GM.run = Object.assign({ coins: 0, coinsTotal: 0, kills: 0, headshots: 0, combo: 0, lastKillT: -10, multi: 0, multiT: -10, dmgTaken: 0, destroyed: 0, startT: 0, areasCleared: 0, shopVisits: 0 }, d.run, { combo: 0, lastKillT: -10, multiT: -10, playT: keepT, dmgDealt: keepD }); }
    GM.applyPlayerSnap(d);
    P.revives = left;
    P.dead = false; P.deathT = 0; P.st = {}; P.temps = new Map();
    for (const sk of P.skills) if (sk) { sk.cd = 0; if (sk.maxCharges) sk.charges = sk.maxCharges; }
    G.weapons.dirty = true;
    GM.area = d.area;
    GM.route = (d.route || []).slice(0, -1);
    GM.rewardPending = null;
    GM.enterArea(d.area, d.kind);
    P.hp = P.stats.maxHp; P.invulnT = 3;
    G.sfx.heal();
    G.ui.toast(`🪔 魂の灯火が燃え尽き、エリア ${d.area} の入口から再び（残り ${P.revives}灯）`, 'good');
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
  const BLUE_COL = [0x1040ff, 0x2a6aff, 0x4a8aff, 0x80b8ff];
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
        G.fx.flameLick(x, r.y + 0.1, z, s, (r.blue ? BLUE_COL : FIRE_COL)[(Math.random() * 4) | 0]);
        // long walkways / beams burn low and clean (they run across the view); short perches roar
        if (r.low) { if (Math.random() < 0.3) G.fx.flame.spawn(x, r.y + 0.2, z, U.rand(-0.2, 0.2), U.rand(1.6, 2.8), U.rand(-0.2, 0.2), U.rand(0.35, 0.55), U.rand(0.6, 0.9), 0.1, r.blue ? 0.15 : 1.8, 0.55, r.blue ? 1.8 : 0.12, 1, -1, 1.2); if (Math.random() < 0.3) G.fx.norm.spawn(x, r.y + 0.2, z, 0, U.rand(1.2, 2), 0, 0.4, 0.5, 0.1, r.blue ? 0.08 : 1.0, 0.35, r.blue ? 1.0 : 0.04, 0.85, -0.8, 1); continue; }
        // tall roaring tongues (well above the rim, so they show from the ground), embers and black smoke
        if (Math.random() < 0.75) G.fx.flame.spawn(x, r.y + 0.3, z, U.rand(-0.35, 0.35), U.rand(3.5, 6.5), U.rand(-0.35, 0.35), U.rand(0.45, 0.8), U.rand(0.9, 1.6), 0.15, 1.8, U.rand(0.45, 0.75), 0.1, 1, -2, 1.1);
        if (Math.random() < 0.18) G.fx.add.spawn(x, r.y + 0.3, z, U.rand(-1, 1), U.rand(2, 5.5), U.rand(-1, 1), U.rand(0.8, 1.7), 0.05, 0.01, 1.7, 0.6, 0.15, 1, -0.4, 0.4);
        // solid (non-additive) flame bodies so the fire still reads as deep orange-red against a bright sky
        if (Math.random() < 0.5) G.fx.norm.spawn(x, r.y + 0.25, z, U.rand(-0.3, 0.3), U.rand(2.2, 4.2), U.rand(-0.3, 0.3), U.rand(0.35, 0.6), U.rand(0.6, 1.0), 0.12, 1.0, U.rand(0.25, 0.45), 0.04, 0.85, -1.2, 1);
        // (the smoke off the bed: grey, climbing and spreading thin as it goes - not a black lump in a grey sky. Far off and in a thick fog it
        // takes the fog's colour and is fainter)
        if (Math.random() < 0.16) { const fg = scene.fog, fd = Math.hypot(x - cp.x, z - cp.z), fk = Math.min(0.6, fg.density * 7 + fd / 160), fa = (1 - 0.5 * Math.min(1, fd / 70)) * (1 - 0.4 * Math.min(1, fg.density * 18)), c0 = 0.17, c1 = 0.3; G.fx.norm.spawn(x, r.y + 1.8, z, U.rand(-0.3, 0.3), U.rand(1.0, 1.8), U.rand(-0.3, 0.3), U.rand(3.2, 4.6), 0.7, 3.6, c0 + (fg.color.r - c0) * fk, c0 * 0.95 + (fg.color.g - c0 * 0.95) * fk, c0 * 0.9 + (fg.color.b - c0 * 0.9) * fk, 0.55 * fa, -0.25, 0.35, c1 + (fg.color.r - c1) * Math.min(1, fk + 0.3), c1 + (fg.color.g - c1) * Math.min(1, fk + 0.3), c1 + (fg.color.b - c1) * Math.min(1, fk + 0.3)); }
      }
    }
  }
  function updateWorldFx(dt) {
    if (G.Pawn && G.Pawn.update) G.Pawn.update(dt);
    const w = G.world; if (!w) return;
    const cp = camera.position;
    updateFireBeds(w, cp, dt);
    for (const s of w.lightSources) {
      if (!s.emit || !s.flame) continue;
      const d2 = s.pos.distanceToSquared(cp);
      if (d2 > 45 * 45) continue;
      let a = (flameAcc.get(s) || 0) + dt * Math.max(9, 16 * Math.min(2.5, s.flame)) * (d2 > 25 * 25 ? 0.4 : 1);   // (a small flame too is whole: never fewer than nine tongues a second)
      const fp = s.fp || s.pos;   // (fp: where the flame is, when the light it gives is set apart from it)
      while (a >= 1) { a -= 1; G.fx.flameLick(fp.x, fp.y, fp.z, s.flame, w.mats.biome.flame); }
      flameAcc.set(s, a);
    }
    GM._ambT = (GM._ambT || 0) - dt;
    if (GM._ambT <= 0) {
      GM._ambT = U.rand(0.6, 2.2);
      if (Math.random() < 0.5 && !w.mats.biome.outdoor) G.sfx.drip(V(cp.x + U.rand(-15, 15), 2, cp.z + U.rand(-15, 15)));
      if (w.mats.biome.outdoor && Math.random() < 0.5) G.sfx.wind && G.sfx.wind(w.mats.biome.outdoor === 'sky' ? 1 : 0.6);
      let near = null, nd = 1e9; for (const s of w.lightSources) if (s.flame > 0.8) { const d = (s.fp || s.pos).distanceToSquared(cp); if (d < nd) { nd = d; near = s; } }   // (a fire is heard from where it burns, not from where its light is set)
      if (near && nd < 64) G.sfx.crackle(near.fp || near.pos);
      if (w.lavaZones.length && Math.random() < 0.5) { const z = U.pick(w.lavaZones); G.sfx.lava(V((z.x0 + z.x1) / 2, z.y || 0, (z.z0 + z.z1) / 2)); }
    }
    if (skyDome) { skyDome.position.copy(cp); skyTick(); }
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
      else if (a.kind === 'uvflow') { // (flowing water: the surface's ripples drift; the material gets its own copy of the texture first)
        const m = a.mat; if (m && m.normalMap) { if (!m._flow) { m.normalMap = m.normalMap.clone(); m.normalMap.wrapS = m.normalMap.wrapT = THREE.RepeatWrapping; m.normalMap.needsUpdate = true; m._flow = true; } m.normalMap.offset.x += a.sp[0] * dt; m.normalMap.offset.y += a.sp[1] * dt; }
      }
    }
    if (w.icicles && G.FieldGen && G.FieldGen.tickIcicles) G.FieldGen.tickIcicles(w, dt); // (the frozen mausoleum's falling icicles)
    if (w.pillars && G.FieldGen && G.FieldGen.tickPillars) G.FieldGen.tickPillars(w, dt); // (the sea of pillars: the ones that sink and rise)
    if (w.movers && G.FieldGen && G.FieldGen.tickMovers) G.FieldGen.tickMovers(w, dt); // (the foundry's machines: carriages, lifts, belts)
    if (w.iceTiles && G.FieldGen && G.FieldGen.tickIce) G.FieldGen.tickIce(w, dt); // (the frozen lake: broken ice freezes over again)
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
    updateAirJumpHint(dt);
    // once the area is cleared, unopened chests get a pulsing beam, ring and ripple (visible through walls) so they aren't forgotten
    for (const it of w.interactables) {
      if (it.type !== 'chest' || !it.mesh) continue;
      const want = GM.areaCleared && !it.opened;
      if (want && !it.hl) {
        const col = it.tier >= 3 ? 0xd06a40 : it.tier >= 2 ? 0xe0a848 : it.tier ? 0xa8b4c0 : 0xd8c098;   // (old gold leaking from it; its worth in the tint: pale, steel, gold, copper-red)
        const g = new THREE.Group(); g.position.copy(it.pos).setY(it.pos.y - 0.5);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        glow.scale.set(3.6, 2.4, 1); glow.position.y = 0.5; glow.renderOrder = 5; g.add(glow);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 11, 12, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
        beam.position.y = 5.5; beam.renderOrder = 5; g.add(beam);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.renderOrder = 5; g.add(ring);
        const rip = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); // a ripple that spreads outwards from the chest
        rip.rotation.x = -Math.PI / 2; rip.position.y = 0.05; rip.renderOrder = 5; g.add(rip);
        w.group.add(g); it.hl = { g, glow, beam, ring, rip, k: 0 };
      }
      if (it.hl) {
        const h = it.hl;
        h.k = U.damp(h.k, want ? 1 : 0, want ? 1.5 : 6, dt);
        const pulse = 0.7 + 0.3 * Math.sin(GM.time * 3.2 + it.pos.x), rp = (GM.time * 0.7 + it.pos.x * 0.37) % 1;
        h.glow.material.opacity = 0.4 * h.k * pulse; h.glow.scale.set(2.4, 1.6, 1);
        h.beam.material.opacity = 0.18 * h.k * pulse;
        h.ring.material.opacity = 0; h.rip.material.opacity = 0; h.rip.scale.setScalar(1 + rp * 2.2);   // (no lit rings on the floor: the light from its seams, and the shaft over it that finds it from afar)
        if (want && Math.random() < dt * 6) G.fx.add.spawn(it.pos.x + (Math.random() - 0.5) * 0.6, it.pos.y - 0.1, it.pos.z + (Math.random() - 0.5) * 0.6, 0, 0.3 + Math.random() * 0.3, 0, 1.2, 0.04, 0.015, 0.8, 0.62, 0.32, 0.85, -0.05, 0.4);
        h.ring.scale.setScalar(1 + 0.08 * Math.sin(GM.time * 2.4));
        h.beam.rotation.y += dt * 0.5;
        if (!want && h.k < 0.01) { w.group.remove(h.g); h.beam.geometry.dispose(); h.ring.geometry.dispose(); h.rip.geometry.dispose(); it.hl = null; }
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
    if (GM._warming) { I.endFrame(); if (PF && PF.on) PF.end(); return; } // the new area's shaders are compiling: run and draw nothing
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
        if (G.InvUI.tick) G.InvUI.tick();
      }
      else if (GM.state === 'buff') {
        // the boon choice is an overlay: the world keeps running and WASD still moves while the cursor picks a card;
        // number keys do nothing here (cards are picked with the mouse / wheel + Enter) and E/skills/items stay idle
        const api = G.InvUI.isOpen() ? null : G.ui._buffApi; // looking at the inventory: the cards behind it don't react
        if (api) {
          if (I.wheel) api.move(Math.sign(I.wheel));
          if (I.pressed.Enter || (I.locked && I.mpressed[0])) api.confirm();
          if (I.pressed.KeyR) api.reroll();
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
    GM.timeScale = (P.has('x_slowtime') && G.weapons.adsT > 0.5 ? 0.75 : 1) * (G.Duel ? G.Duel.timeK() : 1); // a parry slows the world for a moment (duel.js)
    const gdt = dt * GM.timeScale * (GM.dev ? GM.dev.speed : 1);
    GM.time += gdt;
    if (GM.run && GM.state !== 'title') GM.run.playT = (GM.run.playT || 0) + gdt; // total play time of the run (kept through reloads with the checkpoint)
    let timeSlow = 0;
    if (GM.chronoT > 0) { GM.chronoT -= gdt; timeSlow = GM.chronoSlow; }
    // the item wheel slows the foes while it is open (no effects: it is a selection aid, not a time skill, and it never touches chronoT / chronoSlow)
    GM.enemyTimeScale = 1 - Math.max(timeSlow, G.abilities.wheelOpen && G.abilities.wheelOpen() ? 0.65 : 0);
    // how strongly time is being bent (skill, ultimate, item, relic, perk) drives the screen / sound effects
    G.ui.timeFx(Math.max(timeSlow, 1 - GM.timeScale), dt);
    GM.enemyTimeScale *= GM.enrage.tm;
    if (GM.dev) { if (GM.dev.freeze) GM.enemyTimeScale = 0; if (GM.dev.noCd) { for (const s of P.skills) if (s) { s.cd = 0; if (s.maxCharges) s.charges = s.maxCharges; } P.pileCd = 0; P.grappleCd = 0; } }
    if (GM.state === 'dead') { if (GM.deathFrozen) return; P.update(gdt); G.enemies.update(gdt); G.bosses.update(gdt); G.combat.update(gdt); G.fx.update(gdt, camera, renderer); G.LightPool.update(gdt, G.world, camera.position, GM.time); return; }
    if (G.world) G.world.pp = true; // the player's own movement does not see monster-only colliders (the tightrope)
    try { P.update(gdt); } finally { if (G.world) G.world.pp = false; }
    G.weapons.update(gdt);
    G.abilities.update(gdt);
    G.enemies.update(gdt);
    G.bosses.update(gdt * GM.enemyTimeScale); // time slowing / stopping works on guardians too (enemyTimeScale already carries the enrage factor)
    if (G.bosses.active) for (const p of G.bosses.active.parts) if (p.alive && !p.removed) G.combat.updateStatus(p, gdt);
    G.combat.update(gdt);
    G.buffs.emit('tick', gdt);
    if (G.Classes) G.Classes.tick(gdt);
    updateObjective(gdt);
    GM.updateEnrage(gdt);
    updateHighFire(gdt);
    G.Fields.update(gdt);
    if (G.Weather) G.Weather.update(gdt); // (rain, snow, embers keep their element on everyone; lightning: weather.js)
    G.Strata.update(gdt);
    if (G.Gim) G.Gim.update(gdt);
    if (G.Water) G.Water.update(gdt);
    G.Tex.lavaT.value = GM.time;
    G.Graves.update(gdt);
    G.Areas.update(gdt);
    G.Depth.update(gdt);
    G.PStatus.update(gdt);
    G.HudX.update(gdt);
    G.Rift.update(gdt);
    if (GM.stage === 'boss' && GM.bossStartT > 0) { GM.bossStartT -= gdt; if (GM.bossStartT <= 0) G.bosses.start(G.bosses.forArea(GM.area), GM.area, G.world); }
    updateInteraction(gdt);
    G.Inv.tick(gdt);
    if (G.FieldGen) G.FieldGen.tickDoor(gdt);
    checkTriggers();
    updateWorldFx(gdt);
    G.LightPool.update(gdt, G.world, camera.position, GM.time);
    G.fx.update(gdt, camera, renderer);
    if (G.Sky) G.Sky.update(gdt, camera);
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
  const drawHeld = (r) => G.weapons.render(r);
  function render() {
    if (G.Post && G.Post.active && !GM.camHook) {
      const held = GM.state !== 'title' && GM.state !== 'dead';
      try { G.Post.frame(scene, camera, held ? drawHeld : null, GM.time, held && G.weapons.pipOn()); return; }
      catch (e) { G.Post.active = false; G.Post.failed = true; renderer.setRenderTarget(null); console.warn('post: off', e); } // (a GPU that will not: the plain frame from here on)
    }
    renderer.clear();
    if (GM.camHook) { GM.camHook(camera); renderer.render(scene, camera); return; } // (development: a camera placed by hand, to look at effects from any side)
    renderer.render(scene, camera);
    if (GM.state !== 'title' && GM.state !== 'dead') G.weapons.render(renderer);
  }
  G.LIGHT_K = LIGHT_K;
  window.addEventListener('load', boot);
})();
