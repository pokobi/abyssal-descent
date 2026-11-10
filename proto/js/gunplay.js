'use strict';
// How the rifle is held and fired: where it sits in view, its sway and bob, aiming, recoil, the flash, the cases, and what a shot does where it lands.
(function () {
  const GP = P.GunPlay = {}, V = THREE.Vector3;
  let Gun, cam, scene, st, flash, flashLight, ray, cases = [], sparks, decals, puffs = [];
  const tmp = new V(), tmp2 = new V(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4();

  const FLASH_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); ' + P.VMZ + ' }';
  const FLASH_FS = `precision highp float; varying vec2 vUv; uniform float seed; uniform float power; uniform float kind;
void main(){
  vec2 p = vUv - .5; float r = length(p) * 2., a = atan(p.y, p.x);
  if (kind > .5) {   // seen from the side: a tongue running forward
    float x = vUv.x, y = abs(vUv.y - .5) * 2.; float w = (1. - x) * (.55 + .3 * sin(x * 21. + seed * 9.)) * smoothstep(0., .08, x);
    float I = smoothstep(w, 0., y); gl_FragColor = vec4((vec3(1., .5, .16) * I * 7. + vec3(1., .9, .7) * I * I * I * 16.) * power, 1.); return;
  }
  float sp = pow(.5 + .5 * cos(a * 5. + seed * 6.), 3.) * .6 + pow(.5 + .5 * cos(a * 9. - seed * 3.), 6.) * .4;
  float I = smoothstep(1., 0., r / (.3 + sp * .7)); I *= I; float core = smoothstep(.34, 0., r);
  gl_FragColor = vec4((vec3(1., .5, .15) * I * 9. + vec3(1., .88, .66) * core * 26.) * power, 1.);
}`;
  const DECAL_VS = 'varying vec2 vUv; attribute float seed; varying float vSeed; void main(){ vUv = uv; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }';
  const DECAL_FS = `precision highp float; varying vec2 vUv; varying float vSeed;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
void main(){
  vec2 p = (vUv - .5) * 2.; float a = atan(p.y, p.x), r = length(p);
  float edge = .55 + .3 * n(vec2(a * 2.2 + vSeed * 31., vSeed * 7.)) + .15 * n(vec2(a * 7., vSeed * 3.));
  float chip = smoothstep(edge, edge - .18, r);              // the broken-out patch
  float hole = smoothstep(.2, .1, r);                         // the hole itself
  float ring = smoothstep(.34, .2, r) * (1. - hole);
  vec3 c = mix(vec3(.30, .29, .27), vec3(.13, .125, .12), ring); c = mix(c, vec3(.012), hole);
  c *= .8 + .4 * n(p * 9. + vSeed * 40.);
  gl_FragColor = vec4(c * .16, chip * .93);
}`;

  GP.init = function (gun, camera, scn) {
    Gun = gun; cam = camera; scene = scn;
    st = GP.st = { ads: 0, back: 0, rx: 0, ry: 0, rz: 0, swx: 0, swy: 0, lower: 0, fireT: 0, ammo: 30, reload: 0, lastYaw: 0, lastPitch: 0, fov: 68, shots: 0, flashT: 0 };
    ray = new THREE.Raycaster(); ray.far = 80;
    // muzzle flash: a card facing back along the bore, two seen from the sides, and a light
    flash = new THREE.Group(); flash.position.set(0, 0, -Gun.muzzle - 0.01); flash.visible = false; Gun.model.group.add(flash);
    const fm = (kind) => new THREE.ShaderMaterial({ vertexShader: FLASH_VS, fragmentShader: FLASH_FS, uniforms: { seed: { value: 0 }, power: { value: 1 }, kind: { value: kind } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    const f0 = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), fm(0)); f0.position.z = -0.03;
    const sideG = new THREE.PlaneGeometry(0.3, 0.13).translate(0.15, 0, 0);
    const f1 = new THREE.Mesh(sideG, fm(1)); f1.rotation.y = Math.PI / 2; const f2 = new THREE.Mesh(sideG, fm(1)); f2.rotation.set(Math.PI / 2, Math.PI / 2, 0, 'YXZ');
    flash.add(f0, f1, f2); flash.traverse((o) => { o.frustumCulled = false; o.renderOrder = 8; });
    flashLight = new THREE.PointLight(new THREE.Color(1, 0.62, 0.3), 0, 14, 2); flashLight.position.set(0, 0.02, -Gun.muzzle - 0.12); Gun.model.group.add(flashLight);
    // spent cases
    const caseG = P.Geo.lathe([[0.0005, 0], [0.0048, 0], [0.0048, 0.03], [0.0036, 0.036], [0.0036, 0.044], [0.0005, 0.044]], 10, true);
    const caseM = new THREE.MeshStandardMaterial({ color: 0xb48a3a, metalness: 1, roughness: 0.28, envMapIntensity: 1.4 });
    for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(caseG, caseM); c.visible = false; c.userData = { v: new V(), w: new V(), life: 0 }; c.castShadow = true; scene.add(c); cases.push(c); }
    // sparks
    const N = 240, pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(-999), 3)); pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sparks = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.028, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, sizeAttenuation: true }));
    sparks.frustumCulled = false; sparks.userData = { v: new Float32Array(N * 3), life: new Float32Array(N), n: N, next: 0 }; scene.add(sparks);
    // bullet marks
    const DN = 96, dg = new THREE.PlaneGeometry(1, 1); dg.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(DN), 1));
    decals = new THREE.InstancedMesh(dg, new THREE.ShaderMaterial({ vertexShader: DECAL_VS, fragmentShader: DECAL_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), DN);
    decals.count = 0; decals.frustumCulled = false; decals.userData = { next: 0, n: DN }; decals.renderOrder = 1; scene.add(decals);
    // dust
    const pm = new THREE.SpriteMaterial({ color: 0x8a8378, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(pm.clone()); s.visible = false; s.userData = { v: new V(), life: 0, max: 1 }; scene.add(s); puffs.push(s); }
    P.Fx = { update: fx };
    P.hitTargets = P.hitTargets || [];
  };

  function spark(p, nrm, n, speed, col) {
    const u = sparks.userData, pos = sparks.geometry.attributes.position.array, c = sparks.geometry.attributes.color.array;
    for (let i = 0; i < n; i++) {
      const k = u.next; u.next = (u.next + 1) % u.n;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.8).add(nrm).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      u.v[k * 3] = tmp.x; u.v[k * 3 + 1] = tmp.y; u.v[k * 3 + 2] = tmp.z; u.life[k] = 0.18 + Math.random() * 0.3;
      c[k * 3] = col[0]; c[k * 3 + 1] = col[1]; c[k * 3 + 2] = col[2];
    }
  }
  function puff(p, nrm) {
    for (let i = 0; i < 2; i++) { const s = puffs.find((x) => !x.visible); if (!s) return; s.visible = true; s.position.copy(p).addScaledVector(nrm, 0.04); s.userData.v.copy(nrm).multiplyScalar(0.5 + Math.random() * 0.6).add(tmp.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).multiplyScalar(0.4)); s.userData.life = 0; s.userData.max = 0.7 + Math.random() * 0.5; s.scale.setScalar(0.06); }
  }
  function mark(p, nrm) {
    const u = decals.userData, k = u.next; u.next = (u.next + 1) % u.n; decals.count = Math.min(u.n, decals.count + 1);
    q.setFromUnitVectors(tmp.set(0, 0, 1), nrm); const s = 0.075 + Math.random() * 0.05;
    m4.compose(tmp2.copy(p).addScaledVector(nrm, 0.003), q, tmp.set(s, s, s)); decals.setMatrixAt(k, m4); decals.instanceMatrix.needsUpdate = true;
    decals.geometry.attributes.seed.setX(k, Math.random()); decals.geometry.attributes.seed.needsUpdate = true;
  }
  function fx(dt) {
    const u = sparks.userData, pos = sparks.geometry.attributes.position.array, c = sparks.geometry.attributes.color.array;
    for (let k = 0; k < u.n; k++) {
      if (u.life[k] <= 0) continue; u.life[k] -= dt;
      if (u.life[k] <= 0) { pos[k * 3 + 1] = -999; continue; }
      u.v[k * 3 + 1] -= 9.8 * dt; pos[k * 3] += u.v[k * 3] * dt; pos[k * 3 + 1] += u.v[k * 3 + 1] * dt; pos[k * 3 + 2] += u.v[k * 3 + 2] * dt;
      if (pos[k * 3 + 1] < 0.01) { pos[k * 3 + 1] = 0.01; u.v[k * 3 + 1] *= -0.35; }
      const f = Math.pow(0.02, dt); c[k * 3] *= f; c[k * 3 + 1] *= f * f; c[k * 3 + 2] *= f * f * f;
    }
    sparks.geometry.attributes.position.needsUpdate = true; sparks.geometry.attributes.color.needsUpdate = true;
    for (const s of puffs) { if (!s.visible) continue; const d = s.userData; d.life += dt; const t = d.life / d.max; if (t >= 1) { s.visible = false; continue; } s.position.addScaledVector(d.v, dt); d.v.multiplyScalar(Math.pow(0.05, dt)); d.v.y += 0.12 * dt; s.scale.setScalar(0.08 + t * 0.5); s.material.opacity = 0.2 * (1 - t) * Math.min(1, t * 12); }
    for (const cse of cases) {
      if (!cse.visible) continue; const d = cse.userData; d.life += dt; if (d.life > 4) { cse.visible = false; continue; }
      if (d.rest) continue;
      d.v.y -= 9.8 * dt; cse.position.addScaledVector(d.v, dt); cse.rotation.x += d.w.x * dt; cse.rotation.y += d.w.y * dt; cse.rotation.z += d.w.z * dt;
      if (cse.position.y < 0.006) { cse.position.y = 0.006; if (Math.abs(d.v.y) < 0.9) { d.rest = true; cse.rotation.x = Math.PI / 2; cse.rotation.z = 0; } else { d.v.y *= -0.38; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.6); } }
    }
  }

  function shoot(pl) {
    st.ammo--; st.shots++; st.flashT = 0.05;
    st.back = Math.min(0.03, st.back + 0.014); st.rx += 0.022 * (1 - st.ads * 0.5); st.rz += (Math.random() - 0.5) * 0.02; st.ry += (Math.random() - 0.5) * 0.008;
    const k = Gun.kick; k.pitch += 0.0085 * (1 - st.ads * 0.35); k.yaw += (Math.random() - 0.5) * 0.007;
    flash.visible = true; flash.rotation.z = Math.random() * 6.28; const sc = 0.75 + Math.random() * 0.6; flash.scale.setScalar(sc);
    flash.children.forEach((c) => { c.material.uniforms.seed.value = Math.random() * 10; c.material.uniforms.power.value = 0.8 + Math.random() * 0.5; });
    flashLight.intensity = 34;
    // a case out of the right side
    const cse = cases.find((c) => !c.visible) || cases[0]; cse.visible = true; const d = cse.userData; d.life = 0; d.rest = false;
    Gun.model.group.localToWorld(cse.position.set(0.03, 0.004, -0.015));
    cam.getWorldQuaternion(q); d.v.set(2.2 + Math.random(), 1.4 + Math.random() * 0.8, 0.3 + Math.random() * 0.5).applyQuaternion(q).add(tmp.set(pl.vel.x, 0, pl.vel.z)); d.w.set(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
    cse.quaternion.copy(q);
    // where it lands
    const spread = (1 - st.ads) * 0.012 + 0.0015 + Math.min(st.shots, 8) * 0.0012 * (1 - st.ads * 0.6);
    tmp.set((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2, -1).normalize().transformDirection(cam.matrixWorld);
    ray.set(cam.getWorldPosition(tmp2), tmp);
    const hits = ray.intersectObjects(P.hitTargets, false);
    if (hits.length) {
      const h = hits[0], n = h.face ? tmp2.copy(h.face.normal).transformDirection(h.object.matrixWorld) : tmp2.copy(tmp).negate();
      if (n.dot(tmp) > 0) n.negate();
      const nn = n.clone(), pp = h.point.clone();
      if (h.object.userData.foe && P.Monster && P.Monster.hit) { P.Monster.hit(h.object, pp, tmp.clone()); spark(pp, nn, 6, 2.2, [1.6, 1.4, 1.0]); puff(pp, nn); }
      else { spark(pp, nn, 12, 4.5, [7, 3.6, 1.2]); puff(pp, nn); mark(pp, nn); }
    }
  }

  GP.update = function (dt, input, pl, time) {
    const k = (r) => 1 - Math.exp(-dt * r), kick = Gun.kick;
    // aim
    const wantAds = input.ads && st.reload <= 0 && !pl.run ? 1 : 0; st.ads += (wantAds - st.ads) * k(15);
    const fov = 68 - 20 * st.ads; if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // fire
    st.fireT -= dt;
    if (input.fire && st.fireT <= 0 && st.ammo > 0 && st.reload <= 0 && st.lower < 0.5) { shoot(pl); st.fireT = 0.082; }
    if (!input.fire) st.shots = Math.max(0, st.shots - dt * 14);
    if ((input.reload && st.ammo < 30 || st.ammo <= 0 && input.fire) && st.reload <= 0) st.reload = 2.1;
    if (st.reload > 0) { st.reload -= dt; if (st.reload <= 0) st.ammo = 30; }
    if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) flash.visible = false; }
    flashLight.intensity *= Math.pow(1e-6, dt * 2.2);
    // recoil settles
    st.back *= Math.pow(0.0005, dt); st.rx *= Math.pow(0.0004, dt); st.rz *= Math.pow(0.001, dt); st.ry *= Math.pow(0.001, dt);
    kick.pitch *= Math.pow(0.004, dt); kick.yaw *= Math.pow(0.004, dt);
    // the gun trails the view a little, and rides the walk
    const dy = pl.yaw - st.lastYaw, dp = pl.pitch - st.lastPitch; st.lastYaw = pl.yaw; st.lastPitch = pl.pitch;
    st.swx += (Math.max(-0.06, Math.min(0.06, dy * 2.2)) - st.swx) * k(9); st.swy += (Math.max(-0.05, Math.min(0.05, dp * 2.2)) - st.swy) * k(9);
    // near a wall the muzzle is brought down out of it
    tmp.set(0, 0, -0.42).applyQuaternion(cam.getWorldQuaternion(q)); tmp.add(cam.getWorldPosition(tmp2)); const px = tmp.x, pz = tmp.z; tmp.y = 0; P.Room.collide(tmp, 0.05);
    const blocked = Math.hypot(tmp.x - px, tmp.z - pz) > 0.001 ? 1 : 0; st.lower += ((blocked || pl.run ? 1 : 0) * (pl.run && !blocked ? 0.6 : 1) - st.lower) * k(9);
    const a = st.ads, b = pl.bobAmt * (1 - a * 0.85), bx = Math.cos(pl.bob) * 0.006 * b, by = Math.abs(Math.sin(pl.bob)) * 0.007 * b;
    const idle = (1 - a * 0.8), ix = Math.sin(time * 0.9) * 0.0016 * idle, iy = Math.sin(time * 1.3 + 1) * 0.0022 * idle;
    // reload: the gun rolls over, the magazine drops out and a new one comes up
    let rl = 0, magY = 0, magR = 0;
    if (st.reload > 0) { const t = 1 - st.reload / 2.1; rl = Math.min(1, t * 6) * Math.min(1, (1 - t) * 6); const mt = t < 0.2 ? 0 : t < 0.45 ? (t - 0.2) / 0.25 : t < 0.6 ? 1 : t < 0.85 ? 1 - (t - 0.6) / 0.25 : 0; magY = -0.3 * mt * mt; magR = 0.5 * mt; }
    Gun.model.mag.position.set(0.02 * magR, magY, 0.03 * magR); Gun.model.mag.rotation.set(-magR * 0.6, 0, 0);
    if (P.Hands && P.Hands.left) { const lh = P.Hands.left, t = Math.min(1, magR * 2.5); lh.position.set(-0.02 * t, -0.2 * t + magY * 0.4, 0.2 * t); lh.rotation.set(-0.5 * t, 0, 0.3 * t); }
    const r = Gun.root, hp = Gun.hip, ap = Gun.adsPos, lw = st.lower * (1 - a);
    r.position.set(hp.x + (ap.x - hp.x) * a + bx + ix + st.swx * 0.12 + rl * 0.02, hp.y + (ap.y - hp.y) * a - by + iy - st.swy * 0.1 - lw * 0.07 - rl * 0.03, hp.z + (ap.z - hp.z) * a + st.back + lw * 0.07);
    r.rotation.set(st.rx - st.swy * 0.6 - lw * 0.62 + rl * 0.22, (1 - a) * 0.2 + st.ry + st.swx * 0.7 + lw * 0.28, st.rz + st.swx * 0.5 - rl * 0.42 + (1 - a) * 0.05);
  };
})();
