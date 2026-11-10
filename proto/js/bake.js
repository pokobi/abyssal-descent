'use strict';
// Bakes a material's textures on the GPU: colour, normal (from a height) and one texture holding occlusion / roughness / metalness.
// A material is a piece of GLSL:  void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal)
(function () {
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const FS = (body) => `precision highp float; varying vec2 vUv; uniform int mode; uniform float texel; uniform float nStr; uniform float aoStr;
${P.NOISE}
${body}
void main(){
  float h, r, m; vec3 c; mat(vUv, h, c, r, m);
  if (mode == 0) { gl_FragColor = vec4(c, 1.); return; }
  float h2, r2, m2; vec3 c2;
  if (mode == 1) {
    float hx, hy, hx0, hy0;
    mat(vUv + vec2(texel, 0.), hx, c2, r2, m2); mat(vUv - vec2(texel, 0.), hx0, c2, r2, m2);
    mat(vUv + vec2(0., texel), hy, c2, r2, m2); mat(vUv - vec2(0., texel), hy0, c2, r2, m2);
    vec3 n = normalize(vec3((hx0 - hx) * nStr, (hy0 - hy) * nStr, 1.));
    gl_FragColor = vec4(n * .5 + .5, 1.); return;
  }
  // occlusion: how far the surface about a point stands over it
  float acc = 0.;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.399963, rr = texel * (2. + float(i) * 1.6);
    mat(vUv + vec2(cos(a), sin(a)) * rr, h2, c2, r2, m2); acc += max(0., h2 - h);
  }
  gl_FragColor = vec4(clamp(1. - acc / 12. * aoStr, 0., 1.), clamp(r, 0.03, 1.), clamp(m, 0., 1.), 1.);
}`;
  let quad, cam, scene;
  // o.size: the metres one repeat of the texture covers; o.normal: strength of the relief; o.ao: strength of the baked occlusion
  P.bake = function (renderer, px, body, o) {
    o = o || {};
    if (!quad) { cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); scene = new THREE.Scene(); quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad); }
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS(body), depthTest: false, depthWrite: false,
      uniforms: { mode: { value: 0 }, texel: { value: 1 / px }, nStr: { value: (o.normal === undefined ? 1 : o.normal) * px / 64 }, aoStr: { value: o.ao === undefined ? 3 : o.ao } } });
    quad.material = mat;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const rt = (srgb) => {
      const t = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
      if (srgb) t.texture.colorSpace = THREE.SRGBColorSpace;
      t.texture.anisotropy = aniso; return t;
    };
    const out = [rt(true), rt(false), rt(false)], prev = renderer.getRenderTarget();
    for (let i = 0; i < 3; i++) { mat.uniforms.mode.value = i; renderer.setRenderTarget(out[i]); renderer.render(scene, cam); }
    renderer.setRenderTarget(prev); mat.dispose();
    return { map: out[0].texture, normalMap: out[1].texture, orm: out[2].texture, size: o.size || 2 };
  };
})();
