'use strict';
// The frame, on medium and high quality: the world is drawn to an HDR target and the held weapon to a second one; then contact shadow
// (ambient occlusion from the world's depth), glow (bloom), tone mapping, a light colour grade, vignette and grain are laid over them.
// On low quality none of this runs and the frame is drawn straight to the screen as before.
(function () {
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const DEPTH = `uniform sampler2D tDepth; uniform mat4 projInv;
vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 v = projInv * vec4(uv * 2. - 1., d * 2. - 1., 1.); return v.xyz / v.w; }
`;
  const AO_FS = `precision highp float; varying vec2 vUv; uniform mat4 proj; uniform vec2 res; uniform float radius; uniform float strength;
${DEPTH}
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
void main(){
  float d0 = texture2D(tDepth, vUv).x; if (d0 >= .99999) { gl_FragColor = vec4(1., 1000., 0., 1.); return; }
  vec3 p = vpos(vUv); vec2 t = 1. / res;
  vec3 pr = vpos(vUv + vec2(t.x, 0.)), pl = vpos(vUv - vec2(t.x, 0.)), pu = vpos(vUv + vec2(0., t.y)), pd = vpos(vUv - vec2(0., t.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl, dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  float rs = min(radius * proj[1][1] * .5 / -p.z, .12);
  float a0 = ign(gl_FragCoord.xy) * 6.2831853, acc = 0.;
  const int N = 12;
  for (int i = 0; i < N; i++) {
    float fi = float(i) + .5, r = sqrt(fi / float(N)), a = a0 + fi * 2.399963;
    vec2 o = vec2(cos(a), sin(a)) * r * rs; o.x *= res.y / res.x;
    vec3 v = vpos(vUv + o) - p; float vv = dot(v, v), vn = dot(v, n);
    float fall = max(0., 1. - vv / (radius * radius));
    acc += max(0., vn * inversesqrt(vv + 1e-6) - .14) * fall * fall;
  }
  float ao = clamp(1. - acc / float(N) * 2.4 * strength, 0., 1.);
  ao = mix(ao, 1., smoothstep(40., 90., -p.z));   // (none far off: it would only shimmer there)
  gl_FragColor = vec4(ao, -p.z, 0., 1.);
}`;
  // blur along one axis, not across a step in depth
  const BLUR_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tAO; uniform vec2 dir;
void main(){
  vec2 c = texture2D(tAO, vUv).xy; float sum = c.x * .2, w = .2;
  for (int i = 1; i <= 4; i++) {
    float k = (i == 1 ? .17 : i == 2 ? .12 : i == 3 ? .07 : .04);
    for (int s = -1; s <= 1; s += 2) { vec2 q = texture2D(tAO, vUv + dir * float(i * s)).xy; float ww = k * max(0., 1. - abs(q.y - c.y) / (.04 + c.y * .04)); sum += q.x * ww; w += ww; }
  }
  gl_FragColor = vec4(sum / w, c.y, 0., 1.);
}`;
  // the world with the held weapon over it (the weapon's target is cleared to nothing, so its alpha is its cover)
  const MIX = `uniform sampler2D tScene; uniform sampler2D tGun; uniform float gunOn;
vec3 both(vec2 uv){ vec3 c = texture2D(tScene, uv).rgb; if (gunOn > .5) { vec4 g = texture2D(tGun, uv); c = c * (1. - clamp(g.a, 0., 1.)) + g.rgb; } return c; }
`;
  const PRE_FS = `precision highp float; varying vec2 vUv; uniform vec2 texel; uniform float thresh; uniform float knee;
${MIX}
vec3 pre(vec2 uv){ vec3 c = min(both(uv), vec3(30.)); float l = max(c.r, max(c.g, c.b)); float s = clamp(l - thresh + knee, 0., 2. * knee); s = s * s / (4. * knee + 1e-5); return c * max(s, l - thresh) / max(l, 1e-5); }
void main(){ vec2 o = texel * .5; gl_FragColor = vec4((pre(vUv + vec2(-o.x, -o.y)) + pre(vUv + vec2(o.x, -o.y)) + pre(vUv + vec2(-o.x, o.y)) + pre(vUv + vec2(o.x, o.y))) * .25, 1.); }`;
  const DOWN_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 texel;
void main(){
  vec3 a = texture2D(tSrc, vUv).rgb * 4.;
  a += texture2D(tSrc, vUv + texel * vec2(-1., -1.)).rgb + texture2D(tSrc, vUv + texel * vec2(1., -1.)).rgb + texture2D(tSrc, vUv + texel * vec2(-1., 1.)).rgb + texture2D(tSrc, vUv + texel * vec2(1., 1.)).rgb;
  a += (texture2D(tSrc, vUv + texel * vec2(-2., 0.)).rgb + texture2D(tSrc, vUv + texel * vec2(2., 0.)).rgb + texture2D(tSrc, vUv + texel * vec2(0., -2.)).rgb + texture2D(tSrc, vUv + texel * vec2(0., 2.)).rgb) * .5;
  gl_FragColor = vec4(a / 10., 1.);
}`;
  const UP_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 texel; uniform float mixk;
void main(){
  vec3 a = texture2D(tSrc, vUv).rgb * 4.;
  a += (texture2D(tSrc, vUv + texel * vec2(-1., 0.)).rgb + texture2D(tSrc, vUv + texel * vec2(1., 0.)).rgb + texture2D(tSrc, vUv + texel * vec2(0., -1.)).rgb + texture2D(tSrc, vUv + texel * vec2(0., 1.)).rgb) * 2.;
  a += texture2D(tSrc, vUv + texel * vec2(-1., -1.)).rgb + texture2D(tSrc, vUv + texel * vec2(1., -1.)).rgb + texture2D(tSrc, vUv + texel * vec2(-1., 1.)).rgb + texture2D(tSrc, vUv + texel * vec2(1., 1.)).rgb;
  gl_FragColor = vec4(mix(texture2D(tAdd, vUv).rgb, a / 16., mixk), 1.);
}`;
  // a square from the middle of the world's picture, for the lens of a scope
  const PIP_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform vec2 part;
void main(){ gl_FragColor = vec4(texture2D(tScene, .5 + (vUv - .5) * part).rgb, 1.); }`;
  const FIN_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tAO; uniform sampler2D tBloom;
uniform float time; uniform float aoAmt; uniform float bloomAmt; uniform float exposure; uniform vec2 res; uniform float grade;
${MIX}
vec3 RRT(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
  const mat3 O = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
  c *= 1. / .6; c = I * c; c = RRT(c); c = O * c; return clamp(c, 0., 1.);
}
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv, cc = uv - .5;
  vec3 c = texture2D(tScene, uv).rgb;
  float lum = dot(c, vec3(.2126, .7152, .0722));
  c *= mix(1., texture2D(tAO, uv).r, aoAmt * (1. - smoothstep(.6, 5., lum) * .7));
  if (gunOn > .5) { vec4 g = texture2D(tGun, uv); c = c * (1. - clamp(g.a, 0., 1.)) + g.rgb; }
  c += texture2D(tBloom, uv).rgb * bloomAmt;
  c *= exposure;
  c = aces(c);
  // grade: a little more contrast, cool shadows, warm lights; the corners fall off; a fine grain
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(c, c * c * (3. - 2. * c), .16 * grade);
  c = mix(vec3(l), c, 1. + .05 * grade);
  c += vec3(-.004, .001, .008) * (1. - smoothstep(0., .35, l)) * grade;
  c *= mix(vec3(1.), vec3(1.025, 1.0, .965), smoothstep(.35, .95, l) * grade);
  float v = smoothstep(1.0, .3, length(cc * vec2(1., res.y / res.x * 1.25)));
  c *= mix(1., mix(.82, 1., v), grade);
  c += (hash(gl_FragCoord.xy + fract(time) * 917.) - .5) * .009 * (1. - l * .6) * grade;
  c = max(c, 0.);
  gl_FragColor = vec4(mix(c * 12.92, pow(c, vec3(1. / 2.4)) * 1.055 - .055, step(.0031308, c)), 1.);
}`;

  const Post = G.Post = { active: false, ao: true, bloom: true, msaa: 4, set: { aoAmt: 0.75, aoRadius: 0.75, aoStrength: 1, bloomAmt: 0.07, thresh: 0.95, grade: 1, gain: 1.2 } };
  Post.stats = { n: 0, ms: 0 }; // (warm draws: how many, how long)
  let R = null, quad, cam, scn, rtScene, rtGun, rtAO, rtAO2, rtPip, pipSize = 0, mips = [], W = 0, H = 0, curMsaa = -1;
  const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  let mAO, mBlur, mPre, mDown, mUp, mFin, mPip;
  const draw = (mat, target) => { quad.material = mat; R.setRenderTarget(target); R.render(scn, cam); };
  const col = new THREE.Color(), v2 = new THREE.Vector2();

  Post.init = function (renderer) {
    R = renderer;
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); scn = new THREE.Scene(); quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scn.add(quad);
    const M4 = () => ({ value: new THREE.Matrix4() }), V2 = () => ({ value: new THREE.Vector2() }), T = () => ({ value: null });
    mAO = mk(AO_FS, { tDepth: T(), projInv: M4(), proj: M4(), res: V2(), radius: { value: 0.5 }, strength: { value: 1 } });
    mBlur = mk(BLUR_FS, { tAO: T(), dir: V2() });
    mPre = mk(PRE_FS, { tScene: T(), tGun: T(), gunOn: { value: 0 }, texel: V2(), thresh: { value: 1 }, knee: { value: 0.5 } });
    mDown = mk(DOWN_FS, { tSrc: T(), texel: V2() });
    mUp = mk(UP_FS, { tSrc: T(), tAdd: T(), texel: V2(), mixk: { value: 0.5 } });
    mPip = mk(PIP_FS, { tScene: T(), part: V2() });
    mFin = mk(FIN_FS, { tScene: T(), tGun: T(), gunOn: { value: 0 }, tAO: T(), tBloom: T(), time: { value: 0 }, aoAmt: { value: 1 }, bloomAmt: { value: 0.05 }, exposure: { value: 1 }, res: V2(), grade: { value: 1 } });
  };
  const hdr = (w, h, o) => new THREE.WebGLRenderTarget(w, h, Object.assign({ type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }, o || {}));
  Post.resize = function () {
    if (!R) return;
    R.getDrawingBufferSize(v2); const w = Math.max(2, v2.x | 0), h = Math.max(2, v2.y | 0);
    // (many pixels: fewer samples, or the two multisampled targets take more memory than is sensible)
    const ms = w * h > 3.2e6 ? Math.min(2, Post.msaa) : Post.msaa;
    if (w === W && h === H && ms === curMsaa) return; W = w; H = h; curMsaa = ms;
    for (const t of [rtScene, rtGun, rtAO, rtAO2, ...mips.flat()]) if (t) t.dispose();
    const depth = new THREE.DepthTexture(w, h); depth.type = THREE.UnsignedIntType; depth.minFilter = depth.magFilter = THREE.NearestFilter;
    rtScene = hdr(w, h, { samples: ms, depthBuffer: true, depthTexture: depth });
    rtGun = hdr(w, h, { samples: Math.min(ms, 2), depthBuffer: true });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    rtAO = hdr(hw, hh); rtAO2 = hdr(hw, hh);
    mips = []; let mw = hw, mh = hh;
    for (let i = 0; i < 6 && mw > 8 && mh > 8; i++) { mips.push([hdr(mw, mh), null]); mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1); }
    for (let i = 0; i < mips.length - 1; i++) mips[i][1] = hdr(mips[i][0].width, mips[i][0].height);
    Post.rtScene = rtScene;
  };
  // run something (a shader warm-up) with the world's target bound, so what it compiles is what the frame will use
  Post.withTarget = function (fn) {
    if (!Post.active || !rtScene) return fn();
    const prev = R.getRenderTarget(); R.setRenderTarget(rtScene);
    try { return fn(); } finally { R.setRenderTarget(prev); }
  };
  // Draw a scene once into the frame's own kind of target, everything in it whether in view or not, a few pixels wide. Making a shader
  // (compile) is not the whole of it on some drivers: the first DRAW into a target of another kind (many samples, a wide range of
  // brightness) builds the shader again for that target, and the frame waited a third of a second on a blast's first ring.
  Post.drawWarm = function (sc, cam, held) {
    if (!Post.active || !rtScene || !sc || !cam) return;
    const t0 = performance.now();
    const rt = held ? rtGun : rtScene, vp = rt.viewport.clone(), sci = rt.scissor.clone(), list = [], prev = R.getRenderTarget();
    rt.viewport.set(0, 0, 8, 8); rt.scissor.set(0, 0, 8, 8);
    sc.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; list.push(o); } });
    try { R.setRenderTarget(rt); R.render(sc, cam); } catch (e) { /* (the frame will make what it needs itself) */ }
    for (const o of list) o.frustumCulled = true;
    rt.viewport.copy(vp); rt.scissor.copy(sci); R.setRenderTarget(prev);
    Post.stats.n++; Post.stats.ms += Math.round(performance.now() - t0);
  };
  // draw every pass once (behind the loading screen), so none of them compiles in the middle of play
  Post.warm = function () {
    if (!Post.active || !rtScene) return;
    const prev = R.getRenderTarget();
    try { post(null, false, 0, true); } catch (e) { /* (a driver that will not: the frame then falls back by itself) */ }
    R.setRenderTarget(prev);
  };
  let pipTex = null;
  Post.pipTexture = function () { return pipTex; };
  function post(camera, gunOn, time, warming) {
    const s = Post.set, depth = rtScene.depthTexture;
    if (camera && Post.ao) {
      const u = mAO.uniforms; u.tDepth.value = depth; u.projInv.value.copy(camera.projectionMatrixInverse); u.proj.value.copy(camera.projectionMatrix); u.res.value.set(rtAO.width, rtAO.height); u.radius.value = s.aoRadius; u.strength.value = s.aoStrength;
      draw(mAO, rtAO);
      mBlur.uniforms.tAO.value = rtAO.texture; mBlur.uniforms.dir.value.set(1 / rtAO.width, 0); draw(mBlur, rtAO2);
      mBlur.uniforms.tAO.value = rtAO2.texture; mBlur.uniforms.dir.value.set(0, 1 / rtAO.height); draw(mBlur, rtAO);
    } else if (warming) { mAO.uniforms.tDepth.value = depth; draw(mAO, rtAO); mBlur.uniforms.tAO.value = rtAO.texture; draw(mBlur, rtAO2); }
    let bloomTex = null;
    if ((Post.bloom || warming) && mips.length > 1) {
      const p = mPre.uniforms; p.tScene.value = rtScene.texture; p.tGun.value = rtGun.texture; p.gunOn.value = gunOn ? 1 : 0; p.texel.value.set(1 / W, 1 / H); p.thresh.value = s.thresh; p.knee.value = s.thresh * 0.5;
      draw(mPre, mips[0][0]);
      for (let i = 1; i < mips.length; i++) { mDown.uniforms.tSrc.value = mips[i - 1][0].texture; mDown.uniforms.texel.value.set(1 / mips[i - 1][0].width, 1 / mips[i - 1][0].height); draw(mDown, mips[i][0]); }
      let src = mips[mips.length - 1][0];
      for (let i = mips.length - 2; i >= 0; i--) {
        mUp.uniforms.tSrc.value = src.texture; mUp.uniforms.tAdd.value = mips[i][0].texture; mUp.uniforms.texel.value.set(1 / src.width, 1 / src.height); mUp.uniforms.mixk.value = 0.62;
        draw(mUp, mips[i][1]); src = mips[i][1];
      }
      bloomTex = src.texture;
    }
    const u = mFin.uniforms;
    u.tScene.value = rtScene.texture; u.tGun.value = rtGun.texture; u.gunOn.value = gunOn ? 1 : 0; u.tAO.value = rtAO.texture; u.tBloom.value = bloomTex || rtAO.texture;
    u.time.value = time; u.aoAmt.value = Post.ao && camera ? s.aoAmt : 0; u.bloomAmt.value = bloomTex && Post.bloom ? s.bloomAmt : 0; u.exposure.value = R.toneMappingExposure * s.gain; u.res.value.set(W, H); u.grade.value = s.grade;
    draw(mFin, warming ? rtAO2 : null);
  }
  // one frame: the world, then (drawGun) what is held, then everything laid together on the screen.
  // wantPip: a scope is up, and its lens needs the middle of the world's picture (given to Post.pipTexture())
  Post.frame = function (scene, camera, drawGun, time, wantPip) {
    Post.resize();
    R.setRenderTarget(rtScene); R.clear(); R.render(scene, camera);
    pipTex = null;
    if (wantPip) {
      const size = Math.max(64, Math.min(512, W, H));
      if (!rtPip || pipSize !== size) { if (rtPip) rtPip.dispose(); rtPip = hdr(size, size); pipSize = size; }
      mPip.uniforms.tScene.value = rtScene.texture; mPip.uniforms.part.value.set(size / W, size / H); draw(mPip, rtPip); pipTex = rtPip.texture;
    }
    let gunOn = false;
    if (drawGun) {
      R.setRenderTarget(rtGun); R.getClearColor(col); const a = R.getClearAlpha();
      R.setClearColor(0x000000, 0); R.clear(); R.setClearColor(col, a);
      drawGun(R); gunOn = true;
    }
    post(camera, gunOn, time || 0, false);
    R.setRenderTarget(null);
  };
})();
