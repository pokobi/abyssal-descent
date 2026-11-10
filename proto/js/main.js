'use strict';
// Start-up, the walk-about camera and the frame loop.
(function () {
  const $ = (id) => document.getElementById(id), q = new URLSearchParams(location.search);
  if (q.has('clean')) document.body.classList.add('clean');
  const step = (msg, f) => new Promise((res) => { $('lmsg').textContent = msg; requestAnimationFrame(() => setTimeout(() => { f(); res(); }, 0)); });
  const bar = (v) => { $('lbar').style.width = Math.round(v * 100) + '%'; };
  const QUAL = [{ name: '高', pr: 1, msaa: 4, ao: true, bloom: true, vol: true }, { name: '中', pr: 0.8, msaa: 2, ao: true, bloom: true, vol: true }, { name: '低', pr: 0.66, msaa: 0, ao: false, bloom: true, vol: false }];
  let qi = Math.max(0, Math.min(2, +(q.get('q') || 0)));
  const BENCH = q.has('bench');

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120); camera.rotation.order = 'YXZ'; scene.add(camera);
  P.renderer = renderer; P.scene = scene; P.camera = camera;

  const pl = P.player = { pos: new THREE.Vector3(0.6, 0, 8.6), yaw: 0.05, pitch: -0.02, vel: new THREE.Vector3(), bob: 0, bobAmt: 0, eye: 1.66, y: 0, free: false };
  const keys = {}, mouse = { l: false, r: false };
  let locked = false, tPrev = 0, time = 0, frames = 0, fpsT = 0, fps = 0, ms = 0;

  function size() {
    const w = window.innerWidth, h = window.innerHeight, pr = Math.min(window.devicePixelRatio || 1, 2) * QUAL[qi].pr;
    renderer.setPixelRatio(pr); renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    P.Post.resize(Math.round(w * pr), Math.round(h * pr));
  }
  function applyQuality() { const Q = QUAL[qi]; P.Post.ao = Q.ao; P.Post.bloom = Q.bloom; P.Post.vol = Q.vol; size(); }

  // put the camera somewhere (for pictures): P.view(x, y, z, yaw, pitch)
  P.view = function (x, y, z, yaw, pitch) { pl.pos.set(x, 0, z); pl.y = y - pl.eye; pl.yaw = yaw || 0; pl.pitch = pitch || 0; pl.free = true; pl.vel.set(0, 0, 0); pl.bobAmt = 0; };

  function move(dt) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const run = keys.ShiftLeft && f > 0 && !mouse.r, sp = (run ? 5.6 : 3.4) * (mouse.r ? 0.6 : 1);
    const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw);
    let wx = (-sy * f + cy * s), wz = (-cy * f - sy * s); const l = Math.hypot(wx, wz); if (l > 1) { wx /= l; wz /= l; }
    const k = 1 - Math.exp(-dt * 11);
    pl.vel.x += (wx * sp - pl.vel.x) * k; pl.vel.z += (wz * sp - pl.vel.z) * k;
    if (f || s) pl.free = false;
    if (!pl.free) {
      pl.pos.x += pl.vel.x * dt; pl.pos.z += pl.vel.z * dt;
      const fy = P.Room.collide(pl.pos, 0.42); pl.y += (fy - pl.y) * (1 - Math.exp(-dt * 14));
    }
    const v = Math.hypot(pl.vel.x, pl.vel.z);
    pl.bobAmt += ((v > 0.4 ? Math.min(1, v / 4) : 0) - pl.bobAmt) * (1 - Math.exp(-dt * 8));
    pl.bob += dt * (run ? 12.5 : 8.6) * Math.min(1, v / 2.2);
    pl.speed = v; pl.run = run;
  }
  function place() {
    const b = pl.bobAmt * (mouse.r ? 0.3 : 1);
    camera.position.set(pl.pos.x, pl.y + pl.eye + Math.sin(pl.bob * 2) * 0.022 * b, pl.pos.z);
    const kick = P.Gun ? P.Gun.kick : null;
    camera.rotation.set(pl.pitch + (kick ? kick.pitch : 0), pl.yaw + (kick ? kick.yaw : 0), Math.sin(pl.bob) * 0.004 * b + (kick ? kick.roll : 0));
  }

  function frame(tms) {
    requestAnimationFrame(frame);
    const t = tms / 1000, dt = Math.min(0.05, t - tPrev || 0.016); tPrev = t; time += dt; P.timeU.value = time;
    const t0 = performance.now();
    move(dt); place();
    P.Room.update(time, dt);
    const F = P.force || {};
    if (P.Gun && P.Gun.update) P.Gun.update(dt, { fire: (mouse.l && locked) || !!F.fire, ads: (mouse.r && locked) || !!F.ads, reload: !!keys.KeyR || !!F.reload }, pl, time);
    if (P.Monster && P.Monster.update) P.Monster.update(dt, time, pl);
    if (P.Fx && P.Fx.update) P.Fx.update(dt, time);
    camera.updateMatrixWorld();
    renderer.info.reset();
    P.Post.render(scene, camera, time);
    if (BENCH) renderer.getContext().finish();   // (measuring: wait for the GPU, so the time is the whole frame's)
    ms += performance.now() - t0; frames++; fpsT += dt;
    if (fpsT >= 0.5) { fps = frames / fpsT; P.fps = fps; P.cpuMs = ms / frames; const i = renderer.info.render; $('stat').textContent = fps.toFixed(0) + ' fps ／ ' + (i.triangles / 1000).toFixed(0) + 'k 三角形 ／ ' + i.calls + ' 描画 ／ 画質 ' + QUAL[qi].name + (P.Post.on ? '' : ' ／ 後処理なし'); frames = 0; fpsT = 0; ms = 0; }
  }

  async function boot() {
    P.Post.init(renderer, { msaa: QUAL[qi].msaa });
    applyQuality();
    await step('質感を生成中', () => P.bakeAll(renderer)); bar(0.25);
    await step('部屋を組み立て中', () => P.Room.build(scene)); bar(0.45);
    if (P.Gun && P.Gun.build) { await step('武器を組み立て中', () => P.Gun.build(camera, scene)); } bar(0.6);
    if (P.Monster && P.Monster.build) { await step('敵を組み立て中', () => P.Monster.build(scene)); } bar(0.8);
    await step('光を写し取り中', () => {
      // the room's own light, caught from its middle, becomes the ambient light and the reflections of everything in it
      const hide = []; scene.traverse((o) => { if (o.userData.noEnv && o.visible) { o.visible = false; hide.push(o); } });
      const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      const cube = new THREE.CubeCamera(0.1, 80, cubeRT); cube.position.set(0, 2.3, -1.5); scene.add(cube);
      const pm = new THREE.PMREMGenerator(renderer);
      const b = P.Room.bounds; P.envU.envBoxMin.value.set(b.x0, b.y0, b.z0); P.envU.envBoxMax.value.set(b.x1, b.y1 - 0.4, b.z1); P.envU.envBoxPos.value.copy(cube.position);
      for (let pass = 0; pass < 2; pass++) { cube.update(renderer, scene); const env = pm.fromCubemap(cubeRT.texture).texture; if (scene.environment) scene.environment.dispose(); scene.environment = env; }
      scene.remove(cube); pm.dispose(); for (const o of hide) o.visible = true;
      P.Post.setLight(P.Room.moon);
    });
    bar(1);
    window.addEventListener('resize', size);
    $('load').style.display = 'none'; if (!q.has('clean')) $('start').style.display = 'flex';
    requestAnimationFrame(frame);
    setTimeout(() => { P.ready = true; }, 600);
  }

  const cv = renderer.domElement;
  $('start').addEventListener('click', () => cv.requestPointerLock());
  cv.addEventListener('click', () => { if (!locked) cv.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; $('start').style.display = locked || q.has('clean') ? 'none' : 'flex'; if (!locked) { mouse.l = mouse.r = false; } });
  document.addEventListener('mousemove', (e) => { if (!locked) return; const s = 0.0021 * (mouse.r ? 0.6 : 1); pl.yaw -= e.movementX * s; pl.pitch = Math.max(-1.45, Math.min(1.45, pl.pitch - e.movementY * s)); pl.free = false; });
  document.addEventListener('mousedown', (e) => { if (!locked) return; if (e.button === 0) mouse.l = true; if (e.button === 2) mouse.r = true; });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Digit1') P.Post.on = !P.Post.on;
    if (e.code === 'Digit2') { qi = (qi + 1) % QUAL.length; applyQuality(); }
    if (e.code === 'Digit3' && P.Monster && P.Monster.respawn) P.Monster.respawn();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  P.input = { keys, mouse };
  boot().catch((e) => { $('lmsg').textContent = 'エラー: ' + e.message; console.error(e); P.error = String(e && e.stack || e); });
})();
