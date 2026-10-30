'use strict';
// The rift of light: after the run's last guardian falls a tear opens in the air; walking up and interacting with it leads to the clear screen.
// grand: the last guardian of all gets a larger one, with turning rings, orbiting shards and a pillar of light.
(function () {
  const R = (G.Rift = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let cur = null;
  const VS = 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  // a bright jagged seam, its edges flickering, a soft glow and thin rays leaking out of it
  const tearMat = (col) => new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uC: { value: new THREE.Color(col) } },
    vertexShader: VS,
    fragmentShader: `uniform float uT, uA; uniform vec3 uC; varying vec2 vU;
      void main() {
        float y = vU.y, x = (vU.x - 0.5) * 2.0;
        float env = pow(max(0.0, sin(3.14159 * y)), 0.6);
        float bend = sin(y * 17.0 + uT * 1.3) * 0.5 + sin(y * 41.0 - uT * 2.1) * 0.3 + sin(y * 87.0 + uT * 3.0) * 0.2;
        float wid = (0.1 + 0.05 * sin(y * 23.0 + uT * 2.0)) * env + 0.002;
        float d = abs(x - bend * 0.07 * env);
        float core = smoothstep(wid, wid * 0.35, d);
        float glow = exp(-d / (wid * 2.0 + 0.02)) * env * 0.55;
        float rays = pow(0.5 + 0.5 * sin(y * 60.0 + uT * 4.0), 8.0) * exp(-d * 6.0) * env * 0.4;
        float al = (core + glow + rays) * uA;
        if (al < 0.01) discard;
        gl_FragColor = vec4(mix(uC, vec3(1.0), core), al);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const add = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

  R.active = () => !!(cur && !cur.entering && cur.t > 1);
  // what the crosshair has to be near to interact
  R.target = () => cur && cur.mid;
  R.reach = () => (cur && cur.grand ? { r: 2.8, d: 7 } : { r: 2, d: 5 });
  R.open = function (pos, grand) {
    R.clear();
    const col = grand ? 0xffc8f0 : 0xffe6a8, H = grand ? 11 : 6.5, g = new THREE.Group();
    g.position.copy(pos); G.scene.add(g);
    const o = { g, grand, col, H, world: G.world, t: 0, look: 0, mid: pos.clone().setY(pos.y + (grand ? 3.2 : 2.4)) };
    // the tear always turns its face to you (upright: it only turns about y)
    o.tear = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tearMat(col)); o.tear.scale.set(H * 0.9, H, 1); o.tear.position.y = H / 2 + 0.2; g.add(o.tear);
    // the floor under it
    o.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: G.Tex.spr.soft, color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    o.pool.rotation.x = -Math.PI / 2; o.pool.position.y = 0.06; o.pool.scale.setScalar(H * 0.55); g.add(o.pool);
    // motes of light drifting up and into the seam
    const N = grand ? 180 : 70, arr = new Float32Array(N * 3); o.motes = [];
    for (let i = 0; i < N; i++) o.motes.push({ r: U.rand(0.4, H * 0.55), a: Math.random() * 6.28, y: Math.random() * H });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    o.pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: G.Tex.spr.soft, color: col, size: grand ? 0.34 : 0.24, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    o.pts.frustumCulled = false; g.add(o.pts);
    if (grand) {
      // a pillar of light, turning rings and shards keeping time around the tear
      o.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 90, 20, 1, true), add(col, 0.13)); o.beam.position.y = 45; g.add(o.beam);
      o.rings = [[5.2, 0.5, 0.4], [6.6, -0.35, -0.28], [4, 1.1, 0.62]].map(([r, tilt, sp]) => {
        const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 72), add(0xfff0c8, 0.45)); m.position.y = H / 2 + 0.2; m.rotation.x = Math.PI / 2 + tilt; g.add(m); return { m, sp, tilt };
      });
      o.shards = [];
      const sM = add(0xfff4d8, 0.9);
      for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(G.Props.PG.oct3, sM); m.scale.set(0.14, 0.42, 0.14); g.add(m); o.shards.push({ m, a: i / 10 * 6.28, r: 4.6 + (i % 3) * 0.8, y: 1.5 + (i % 4) * 2.2 }); }
    }
    const w = G.world;
    if (w && w.lightSources) w.lightSources.push({ pos: pos.clone().add(V(0, H * 0.5, 0)), color: grand ? '#ffd0f0' : '#ffe8b0', intensity: grand ? 22 : 12, range: grand ? 30 : 18, flame: 0, emit: false, ph: 0, prio: 3, steady: true });
    g.scale.set(1, 0.01, 1);
    cur = o;
    G.fx.flash(o.mid, col, grand ? 200 : 90, 0.8, grand ? 60 : 30);
    G.fx.ring(pos.clone().setY(pos.y + 0.15), grand ? 12 : 6, col, 0.9);
    if (G.sfx.riftOpen) G.sfx.riftOpen();
    if (grand && G.sfx.bell) G.sfx.bell();
    G.player.addShake(grand ? 0.8 : 0.35);
    G.ui.toast('✨ 空間に光の裂け目が開いた', 'good');
    G.game.objective = { icon: '✨', text: () => '光の裂け目へ入れ', progress: () => 1, done: false };
  };
  R.update = function (dt) {
    const o = cur; if (!o) return;
    if (o.world !== G.world) { R.clear(); return; }
    o.t += dt; o.look += dt * (o.entering ? 4 : 1);
    const k = Math.min(1, o.t / 1.1), e = 1 - Math.pow(1 - k, 3);
    o.g.scale.y = Math.max(0.01, e);
    const u = o.tear.material.uniforms; u.uT.value = o.look; u.uA.value = e;
    if (o.entering) { const s = 1 + (o.t - o.enterT) * 0.9; o.tear.scale.x = o.H * 0.9 * s; }
    const c = G.camera.position; o.tear.rotation.y = Math.atan2(c.x - o.g.position.x, c.z - o.g.position.z);
    o.pool.material.opacity = (0.42 + Math.sin(o.look * 2.3) * 0.08) * e;
    const pa = o.pts.geometry.attributes.position;
    o.motes.forEach((m, i) => {
      m.r -= dt * (0.3 + 1.2 / (m.r + 0.4)); m.a += dt * 1.4; m.y += dt * 0.45;
      if (m.r < 0.12 || m.y > o.H) { m.r = U.rand(1, o.H * 0.55); m.a = Math.random() * 6.28; m.y = U.rand(0, o.H * 0.6); }
      pa.setXYZ(i, Math.cos(m.a) * m.r, m.y, Math.sin(m.a) * m.r);
    });
    pa.needsUpdate = true;
    if (o.rings) for (const r of o.rings) r.m.rotation.z += dt * r.sp;
    if (o.shards) for (const s of o.shards) { s.a += dt * 0.5; s.m.position.set(Math.cos(s.a) * s.r, s.y + Math.sin(o.look + s.a * 3) * 0.3, Math.sin(s.a) * s.r); s.m.rotation.y += dt * 2; }
    if (o.beam) o.beam.material.opacity = (0.11 + Math.sin(o.look * 1.7) * 0.03) * e;
  };
  // step in: the light swallows the screen, and then the clear screen
  R.enter = function () {
    const o = cur; if (!o || o.entering) return;
    o.entering = true; o.enterT = o.t;
    const P = G.player; P.invulnT = Math.max(P.invulnT || 0, 4);
    if (G.sfx.ascend) G.sfx.ascend(1.5);
    G.ui.showInteract(null);
    const f = document.createElement('div'); f.id = 'rift-fade'; f.style.setProperty('--c', o.grand ? '#ffe4f6' : '#fff4d8'); document.body.appendChild(f);
    void f.offsetWidth; f.classList.add('on');
    setTimeout(() => {
      G.game.victory();
      R.clear();
      f.classList.remove('on');
      setTimeout(() => f.remove(), 1000);
    }, 1500);
  };
  R.clear = function () {
    const o = cur; if (!o) return;
    cur = null;
    G.scene.remove(o.g);
    o.g.traverse((c) => { if (c.geometry && c.geometry !== G.Props.PG.oct3) c.geometry.dispose(); if (c.material) c.material.dispose(); });
  };
})();
