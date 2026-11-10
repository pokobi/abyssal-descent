'use strict';
// The frame: the scene is drawn to an HDR target, then contact shadow (ambient occlusion from the depth), haze, glow (bloom),
// tone mapping, colour grading, vignette and grain are laid over it.
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
  float rs = min(radius * proj[1][1] * .5 / -p.z, .14);
  float a0 = ign(gl_FragCoord.xy) * 6.2831853, acc = 0.;
  const int N = 14;
  for (int i = 0; i < N; i++) {
    float fi = float(i) + .5, r = sqrt(fi / float(N)), a = a0 + fi * 2.399963;
    vec2 o = vec2(cos(a), sin(a)) * r * rs; o.x *= res.y / res.x;
    vec3 v = vpos(vUv + o) - p; float vv = dot(v, v), vn = dot(v, n);
    float fall = max(0., 1. - vv / (radius * radius));
    acc += max(0., vn * inversesqrt(vv + 1e-6) - .12) * fall * fall;
  }
  float ao = clamp(1. - acc / float(N) * 2.6 * strength, 0., 1.);
  gl_FragColor = vec4(ao, -p.z, 0., 1.);
}`;
  // the moon's light in the haze: steps along each view ray, asking the moon's shadow map whether the light reaches each
  const VOL_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tShadow; uniform mat4 shadowMat; uniform mat4 viewInv; uniform vec3 camPos; uniform vec3 lightDir; uniform float time;
${DEPTH}
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
float unpack(vec4 v){ return dot(v, vec4(255. / 256. / 16777216., 255. / 256. / 65536., 255. / 256. / 256., 255. / 256.)); }
float n3(vec3 p){ return sin(p.x * 1.7 + sin(p.z * 1.3 + p.y)) * sin(p.y * 2.1 + sin(p.x * .9)) * sin(p.z * 1.9 + sin(p.y * 1.1 + p.x * .6)); }
void main(){
  vec3 vp = vpos(vUv); vec3 wp = (viewInv * vec4(vp, 1.)).xyz; vec3 rd = wp - camPos; float dist = min(length(rd), 46.); rd = normalize(rd);
  const int N = 40; float stp = dist / float(N), j = ign(gl_FragCoord.xy), acc = 0.;
  for (int i = 0; i < N; i++) {
    vec3 p = camPos + rd * (float(i) + j) * stp;
    vec4 sc = shadowMat * vec4(p, 1.); sc.xyz /= sc.w;
    if (sc.x < 0. || sc.x > 1. || sc.y < 0. || sc.y > 1. || sc.z > 1.) continue;
    float lit = step(sc.z - .0015, unpack(texture2D(tShadow, sc.xy)));
    float dens = .75 + .45 * n3(p * .9 + vec3(time * .05, -time * .03, time * .02)) + .25 * n3(p * 2.7 - vec3(time * .08));
    acc += lit * max(dens, .1) * stp;
  }
  float c = dot(rd, -lightDir), g = .62, ph = (1. - g * g) / pow(1. + g * g - 2. * g * c, 1.5) * .25 + .22;
  gl_FragColor = vec4(acc * ph, -vp.z, 0., 1.);
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
  const PRE_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform vec2 texel; uniform float thresh; uniform float knee;
vec3 pre(vec2 uv){ vec3 c = min(texture2D(tScene, uv).rgb, vec3(40.)); float l = max(c.r, max(c.g, c.b)); float s = clamp(l - thresh + knee, 0., 2. * knee); s = s * s / (4. * knee + 1e-5); return c * max(s, l - thresh) / max(l, 1e-5); }
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
  const FIN_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tBloom; uniform sampler2D tVol; uniform vec3 volCol;
uniform mat4 viewInv; uniform vec3 camPos; uniform float time; uniform float on; uniform float aoAmt; uniform float bloomAmt; uniform float exposure;
uniform vec3 fogCol; uniform vec3 fogGlow; uniform vec3 glowDir; uniform float fogDen; uniform float fogFall; uniform vec2 res; uniform float hurt;
${DEPTH}
vec3 RRT(vec3 v){ vec3 a = v * (v + .0245786) - .000090537; vec3 b = v * (.983729 * v + .4329510) + .238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(.59719, .07600, .02840), vec3(.35458, .90834, .13383), vec3(.04823, .01566, .83777));
  const mat3 O = mat3(vec3(1.60475, -.10208, -.00327), vec3(-.53108, 1.10813, -.07276), vec3(-.07367, -.00605, 1.07602));
  c *= 1. / .6; c = I * c; c = RRT(c); c = O * c; return clamp(c, 0., 1.);
}
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 uv = vUv, cc = uv - .5;
  vec3 c;
  if (on > .5) {   // a little colour fringing towards the corners
    float ca = dot(cc, cc) * .0045;
    c = vec3(texture2D(tScene, uv + cc * ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - cc * ca).b);
  } else c = texture2D(tScene, uv).rgb;
  if (on > .5) {
    float lum = dot(c, vec3(.2126, .7152, .0722));
    float ao = texture2D(tAO, uv).r;
    c *= mix(1., ao, aoAmt * (1. - smoothstep(.6, 5., lum) * .7));
    // haze: thicker near the floor, and bright when looking towards the light
    float d0 = texture2D(tDepth, uv).x;
    vec3 vp = vpos(uv); vec3 wp = (viewInv * vec4(vp, 1.)).xyz; vec3 rd = wp - camPos; float dist = length(rd); rd /= max(dist, 1e-4);
    if (d0 >= .99999) dist = 60.;
    float ym = mix(camPos.y, wp.y, .5);
    float f = 1. - exp(-dist * fogDen * (1. + exp(-max(ym, 0.) * fogFall) * 1.6));
    float gl = pow(max(dot(rd, glowDir), 0.), 6.);
    c = mix(c, fogCol + fogGlow * gl, clamp(f, 0., 1.));
    c += volCol * texture2D(tVol, uv).r;
    vec3 b = texture2D(tBloom, uv).rgb;
    c += b * bloomAmt;
  }
  c *= exposure;
  c = aces(c);
  if (on > .5) {
    // grade: a little more contrast, cool shadows, warm lights
    float l = dot(c, vec3(.2126, .7152, .0722));
    c = mix(c, c * c * (3. - 2. * c), .28);
    c = mix(vec3(l), c, 1.08);
    c += vec3(-.006, .002, .012) * (1. - smoothstep(0., .35, l));
    c *= mix(vec3(1.), vec3(1.035, 1.0, .955), smoothstep(.35, .95, l));
    float v = smoothstep(.95, .25, length(cc * vec2(1., res.y / res.x * 1.25)));
    c *= mix(.52, 1., v);
    c += (hash(gl_FragCoord.xy + fract(time) * 917.) - .5) * .013 * (1. - l * .6);
  }
  c = mix(c, vec3(.5, .02, .02) * (.3 + c), hurt * smoothstep(.2, .75, length(cc)));
  c = max(c, 0.);
  gl_FragColor = vec4(mix(c * 12.92, pow(c, vec3(1. / 2.4)) * 1.055 - .055, step(.0031308, c)), 1.);
}`;

  const Post = P.Post = { on: true, ao: true, bloom: true, vol: true, scale: 1, set: { volAmt: 0.05, volCol: new THREE.Color(0.55, 0.72, 1.0), aoAmt: 1, aoRadius: 0.55, aoStrength: 1, bloomAmt: 0.085, thresh: 1.0, exposure: 1, fogDen: 0.016, fogFall: 0.55, fogCol: new THREE.Color(0.012, 0.016, 0.024), fogGlow: new THREE.Color(0.10, 0.13, 0.18), glowDir: new THREE.Vector3(0, 0.3, -1).normalize(), hurt: 0 } };
  let R, quad, cam, scn, rtScene, rtAO, rtAO2, rtVol, rtVol2, mips = [], W = 0, H = 0, msaa = 4, volLight = null;
  const mk = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  let mAO, mBlur, mPre, mDown, mUp, mFin, mVol;
  Post.setLight = function (l) { volLight = l; };
  const draw = (mat, target) => { quad.material = mat; R.setRenderTarget(target); R.render(scn, cam); };

  Post.init = function (renderer, o) {
    R = renderer; msaa = (o && o.msaa !== undefined) ? o.msaa : 4;
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); scn = new THREE.Scene(); quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scn.add(quad);
    const M4 = () => ({ value: new THREE.Matrix4() }), V2 = () => ({ value: new THREE.Vector2() });
    mAO = mk(AO_FS, { tDepth: { value: null }, projInv: M4(), proj: M4(), res: V2(), radius: { value: 0.5 }, strength: { value: 1 } });
    mBlur = mk(BLUR_FS, { tAO: { value: null }, dir: V2() });
    mVol = mk(VOL_FS, { tDepth: { value: null }, projInv: M4(), viewInv: M4(), shadowMat: M4(), tShadow: { value: null }, camPos: { value: new THREE.Vector3() }, lightDir: { value: new THREE.Vector3() }, time: { value: 0 } });
    mPre = mk(PRE_FS, { tScene: { value: null }, texel: V2(), thresh: { value: 1 }, knee: { value: 0.5 } });
    mDown = mk(DOWN_FS, { tSrc: { value: null }, texel: V2() });
    mUp = mk(UP_FS, { tSrc: { value: null }, tAdd: { value: null }, texel: V2(), mixk: { value: 0.5 } });
    mFin = mk(FIN_FS, { tScene: { value: null }, tAO: { value: null }, tBloom: { value: null }, tDepth: { value: null }, projInv: M4(), viewInv: M4(), camPos: { value: new THREE.Vector3() },
      tVol: { value: null }, volCol: { value: new THREE.Color() }, time: { value: 0 }, on: { value: 1 }, aoAmt: { value: 1 }, bloomAmt: { value: 0.05 }, exposure: { value: 1 }, fogCol: { value: new THREE.Color() }, fogGlow: { value: new THREE.Color() }, glowDir: { value: new THREE.Vector3() },
      fogDen: { value: 0.01 }, fogFall: { value: 0.5 }, res: V2(), hurt: { value: 0 } });
  };
  Post.resize = function (w, h) {
    if (w === W && h === H) return; W = w; H = h;
    for (const t of [rtScene, rtAO, rtAO2, rtVol, rtVol2, ...mips.flat()]) if (t) t.dispose();
    const depth = new THREE.DepthTexture(w, h); depth.type = THREE.UnsignedIntType; depth.minFilter = depth.magFilter = THREE.NearestFilter;
    rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: msaa, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    const half = () => new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    rtAO = half(); rtAO2 = half(); rtVol = half(); rtVol2 = half();
    mips = [];
    let mw = hw, mh = hh;
    for (let i = 0; i < 6 && mw > 8 && mh > 8; i++) {
      const a = new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      const b = i > 0 ? null : null; mips.push([a, b]); mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    }
    for (let i = 0; i < mips.length - 1; i++) mips[i][1] = new THREE.WebGLRenderTarget(mips[i][0].width, mips[i][0].height, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  };
  Post.render = function (scene, camera, time) {
    const s = Post.set, prevAuto = R.autoClear;
    R.setRenderTarget(rtScene); R.clear(); R.render(scene, camera);
    const depth = rtScene.depthTexture, on = Post.on;
    if (on && Post.ao) {
      const u = mAO.uniforms; u.tDepth.value = depth; u.projInv.value.copy(camera.projectionMatrixInverse); u.proj.value.copy(camera.projectionMatrix); u.res.value.set(rtAO.width, rtAO.height); u.radius.value = s.aoRadius; u.strength.value = s.aoStrength;
      draw(mAO, rtAO);
      mBlur.uniforms.tAO.value = rtAO.texture; mBlur.uniforms.dir.value.set(1 / rtAO.width, 0); draw(mBlur, rtAO2);
      mBlur.uniforms.tAO.value = rtAO2.texture; mBlur.uniforms.dir.value.set(0, 1 / rtAO.height); draw(mBlur, rtAO);
    }
    let volOn = false;
    if (on && Post.vol && volLight && volLight.shadow.map) {
      const u = mVol.uniforms; u.tDepth.value = depth; u.projInv.value.copy(camera.projectionMatrixInverse); u.viewInv.value.copy(camera.matrixWorld); camera.getWorldPosition(u.camPos.value);
      u.shadowMat.value.copy(volLight.shadow.matrix); u.tShadow.value = volLight.shadow.map.texture; u.time.value = time;
      u.lightDir.value.copy(volLight.target.position).sub(volLight.position).normalize();
      draw(mVol, rtVol);
      mBlur.uniforms.tAO.value = rtVol.texture; mBlur.uniforms.dir.value.set(1 / rtVol.width, 0); draw(mBlur, rtVol2);
      mBlur.uniforms.tAO.value = rtVol2.texture; mBlur.uniforms.dir.value.set(0, 1 / rtVol.height); draw(mBlur, rtVol);
      volOn = true;
    }
    let bloomTex = null;
    if (on && Post.bloom && mips.length > 1) {
      mPre.uniforms.tScene.value = rtScene.texture; mPre.uniforms.texel.value.set(1 / W, 1 / H); mPre.uniforms.thresh.value = s.thresh; mPre.uniforms.knee.value = s.thresh * 0.5;
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
    u.tScene.value = rtScene.texture; u.tAO.value = rtAO.texture; u.tBloom.value = bloomTex; u.tDepth.value = depth;
    u.projInv.value.copy(camera.projectionMatrixInverse); u.viewInv.value.copy(camera.matrixWorld); camera.getWorldPosition(u.camPos.value);
    u.tVol.value = rtVol.texture; u.volCol.value.copy(s.volCol).multiplyScalar(volOn ? s.volAmt : 0);
    u.time.value = time; u.on.value = on ? 1 : 0; u.aoAmt.value = Post.ao ? s.aoAmt : 0; u.bloomAmt.value = bloomTex ? s.bloomAmt : 0; u.exposure.value = s.exposure;
    u.fogCol.value.copy(s.fogCol); u.fogGlow.value.copy(s.fogGlow); u.glowDir.value.copy(s.glowDir); u.fogDen.value = s.fogDen; u.fogFall.value = s.fogFall; u.res.value.set(W, H); u.hurt.value = s.hurt;
    draw(mFin, null);
    R.autoClear = prevAuto;
  };
})();
