'use strict';
// Optics: what each sight looks like on the gun and through it (built from weapons.js buildGun).
// - Dot sights (no magnification): a big window brought close to the eye while aiming (it covers DOT_Q of the screen's height), the reticle drawn
//   on the glass. The red dot is square, the holographic sight round; the epic and better ones are made as pieces of their own, alive.
// - Scopes 2x to 4x: a lens that shows the world magnified (picture in picture, weapons.js) inside a thick rim, each with its own reticle and its own
//   body; the world around the lens stays in view.
// - The 8x (sniper rifles only): the one sight that blacks the screen out around a full eyepiece, with a rangefinder (the SVG here, ui.js scope).
(function () {
  const O = (G.Optics = {});
  const DOT_Q = 0.4;
  O.DOT_T = Math.tan((DOT_Q * 50) / 2 * Math.PI / 180); // (the view model's camera is 50° tall while aiming, weapons.js render)
  O.PIPK = { x2: 0, x25: 1, x3: 2, x4: 3 }; // the reticle each scope's lens draws (weapons.js PIP_FRAG)
  const DOTK = { reddot: 0, reflex: 1, holo: 2, hunter: 3, seer: 4, god: 5 };
  O.isDot = (v) => DOTK[v] !== undefined;

  let geo = null, mats = null;
  const GEO = () => {
    if (geo) return geo;
    const PG = G.Props.PG;
    geo = {
      box: PG.box, cyl: PG.cyl,
      tube: new THREE.CylinderGeometry(1, 1, 1, 40, 1, true),
      torThin: new THREE.TorusGeometry(1, 0.06, 8, 56), torMid: new THREE.TorusGeometry(1, 0.13, 10, 48), torFat: new THREE.TorusGeometry(1, 0.2, 10, 48),
      cone: new THREE.ConeGeometry(1, 1, 12), oct: new THREE.OctahedronGeometry(1, 0),
      circle: new THREE.CircleGeometry(1, 56), plane: new THREE.PlaneGeometry(1, 1),
    };
    for (const k in geo) geo[k].userData.shared = true;
    return geo;
  };
  const MATS = () => {
    if (mats) return mats;
    const ms = (o) => { const m = new THREE.MeshStandardMaterial(o); m.envMapIntensity = 2.2; return m; };
    const mb = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    const DS = THREE.DoubleSide;
    mats = {
      tube: ms({ color: 0x25272b, metalness: 0.65, roughness: 0.42 }), tubeIn: ms({ color: 0x1a1b1e, metalness: 0.5, roughness: 0.6, side: DS }),
      ring: ms({ color: 0x6c7078, metalness: 0.8, roughness: 0.32 }), rubber: ms({ color: 0x121214, metalness: 0, roughness: 0.9 }),
      tan: ms({ color: 0x8c7852, metalness: 0.2, roughness: 0.62 }), white: ms({ color: 0xe8e8e0, metalness: 0, roughness: 0.5 }),
      gold: ms({ color: 0xffc94a, metalness: 1, roughness: 0.22, emissive: 0x5a3a06, emissiveIntensity: 0.5 }),
      goldIn: ms({ color: 0xfff0c0, metalness: 0.6, roughness: 0.3, emissive: 0x806020, emissiveIntensity: 0.4, side: DS }),
      bone: ms({ color: 0xd6c9a8, metalness: 0.05, roughness: 0.6 }), horn: ms({ color: 0x2e2018, metalness: 0.1, roughness: 0.45, side: DS }),
      leather: ms({ color: 0x5a3820, metalness: 0, roughness: 0.85 }),
      navy: ms({ color: 0x1a2440, metalness: 0.6, roughness: 0.35, side: DS }), brass: ms({ color: 0xc89a50, metalness: 1, roughness: 0.3 }),
      glassDark: ms({ color: 0x10203a, metalness: 0.4, roughness: 0.04, emissive: 0x04101c }),
      coat: ms({ color: 0x2a1a40, metalness: 0.5, roughness: 0.05, emissive: 0x24103a, emissiveIntensity: 0.7 }),
      red: mb(0xff3020), amber: mb(0xffa020), orange: mb(0xff7a20), green: mb(0x50ff80), cyan: mb(0x60f0ff), cyanDim: mb(0x2aa0c8), halo: mb(0xfff0c0), gem: mb(0xffe890),
    };
    return mats;
  };

  // ---- the glass of a dot sight: a faint tint, darker toward its edge, a streak of reflection, and the reticle (in units of the window's half height)
  const GLASS_V = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const GLASS_F = `
    uniform float uTime; uniform float uKind; uniform float uRound; uniform vec2 uAsp; uniform vec3 uTint; varying vec2 vUv;
    float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
    float ln(float d, float w, float aa) { return smoothstep(w + aa, w, d); }
    void main() {
      vec2 u = vUv * 2.0 - 1.0; vec2 p = u * uAsp; float r = length(p), an = atan(p.y, p.x);
      float aa = fwidth(p.y) * 1.2;
      int k = int(uKind + 0.5);
      float ret = 0.0, glow = 0.0; vec3 rc = vec3(1.0, 0.16, 0.08);
      if (k == 0) { // red dot
        ret = ln(r, 0.034, aa); glow = exp(-r * 22.0) * 0.6;
      } else if (k == 1) { // reflex: an orange dot inside four short ticks
        rc = vec3(1.0, 0.5, 0.08);
        float tk = min(min(seg(p, vec2(0.14, 0.0), vec2(0.24, 0.0)), seg(p, vec2(-0.14, 0.0), vec2(-0.24, 0.0))), min(seg(p, vec2(0.0, 0.14), vec2(0.0, 0.24)), seg(p, vec2(0.0, -0.14), vec2(0.0, -0.24))));
        ret = max(ln(r, 0.03, aa), ln(tk, 0.011, aa)); glow = exp(-r * 20.0) * 0.5;
      } else if (k == 2) { // holographic: the big ring, its four ticks and the dot
        rc = vec3(1.0, 0.24, 0.12);
        float tk = min(min(seg(p, vec2(0.0, 0.49), vec2(0.0, 0.6)), seg(p, vec2(0.0, -0.49), vec2(0.0, -0.6))), min(seg(p, vec2(0.49, 0.0), vec2(0.6, 0.0)), seg(p, vec2(-0.49, 0.0), vec2(-0.6, 0.0))));
        ret = max(max(ln(r, 0.03, aa), ln(abs(r - 0.46), 0.013, aa)), ln(tk, 0.012, aa));
        glow = exp(-abs(r - 0.46) * 30.0) * 0.25 + exp(-r * 22.0) * 0.4;
      } else if (k == 3) { // 狩人の眼: a beast's slit pupil, breathing, in an iris of fine lines
        rc = vec3(1.0, 0.6, 0.1);
        float bw = 0.06 + 0.014 * sin(uTime * 2.2);
        float e = length(vec2(p.x / bw, p.y / 0.34));
        float slit = ln(abs((e - 1.0) * bw), 0.009, aa) + smoothstep(1.0, 0.2, e) * 0.35;
        float spokes = smoothstep(0.22, 0.0, abs(fract(an * 40.0 / 6.2832) - 0.5)) * smoothstep(0.4, 0.46, r) * smoothstep(0.66, 0.58, r) * 0.55;
        float iris = ln(abs(r - 0.68), 0.008, aa) + ln(abs(r - 0.4), 0.005, aa) * 0.7;
        float marks = 0.0; for (int i = 0; i < 4; i++) { float a = float(i) * 1.5708 + 0.7854; vec2 dd = vec2(cos(a), sin(a)); marks = max(marks, ln(seg(p, dd * 0.74, dd * 0.86), 0.012, aa)); }
        ret = clamp(max(max(slit, spokes), max(iris, marks)), 0.0, 1.0); ret = max(ret, ln(r, 0.022, aa));
        glow = exp(-r * 9.0) * (0.35 + 0.15 * sin(uTime * 2.2)) + exp(-abs(r - 0.68) * 26.0) * 0.2;
      } else if (k == 4) { // 千里眼: a diamond in rings of turning runes
        rc = vec3(0.35, 0.95, 1.0);
        float dia = ln(abs(p.x) + abs(p.y), 0.05, aa);
        float r1 = ln(abs(r - 0.27), 0.007, aa);
        float a1 = an + uTime * 0.5; float f1 = fract(a1 * 12.0 / 6.2832);
        float dash = step(0.18, f1) * step(f1, 0.82) * ln(abs(r - 0.5), 0.011, aa);
        float rune = ln(abs(f1 - 0.5) * r * 0.524, 0.006, aa) * smoothstep(0.38, 0.4, r) * smoothstep(0.47, 0.45, r);
        float a2 = an - uTime * 0.3; float f2 = fract(a2 * 6.0 / 6.2832);
        float dots = ln(length(vec2((f2 - 0.5) * r * 1.047, r - 0.76)), 0.022, aa);
        float r3 = ln(abs(r - 0.76), 0.004, aa) * 0.6;
        ret = clamp(max(max(dia, r1), max(max(dash, rune), max(dots, r3))), 0.0, 1.0);
        glow = exp(-r * 10.0) * 0.4 + exp(-abs(r - 0.5) * 24.0) * 0.25;
      } else { // 神の眼: a four-pointed star in turning rays and a shimmering ring
        rc = vec3(1.0, 0.86, 0.42);
        float star = max(step(abs(p.x) / 0.13 + abs(p.y) / 0.024, 1.0), step(abs(p.x) / 0.024 + abs(p.y) / 0.13, 1.0));
        float a = an + uTime * 0.25; float f = fract(a * 16.0 / 6.2832); float idx = mod(floor(a * 16.0 / 6.2832), 2.0);
        float len = mix(0.4, 0.31, idx);
        float rays = ln(abs(f - 0.5) * r * 0.393, 0.006, aa) * smoothstep(0.17, 0.19, r) * smoothstep(len + 0.01, len, r);
        float ring = ln(abs(r - 0.47), 0.008, aa);
        float a3 = an - uTime * 0.6; float f3 = fract(a3 * 24.0 / 6.2832);
        float ring2 = step(0.3, f3) * step(f3, 0.7) * ln(abs(r - 0.54), 0.006, aa);
        ret = clamp(max(max(star, rays), max(ring, ring2)), 0.0, 1.0);
        glow = exp(-r * 8.0) * 0.45 + (0.5 + 0.5 * sin(an * 8.0 - uTime * 3.0)) * exp(-abs(r - 0.47) * 20.0) * 0.35;
      }
      float edge = mix(max(abs(u.x), abs(u.y)), length(u), uRound);
      float ga = 0.05 + 0.2 * smoothstep(0.6, 1.0, edge) + 0.05 * smoothstep(0.1, 0.0, abs(u.x * 0.7 + u.y - 0.6));
      vec3 col = mix(uTint, rc, clamp(ret, 0.0, 1.0)) + rc * glow;
      gl_FragColor = vec4(col, clamp(max(ga, max(ret, glow * 0.8)), 0.0, 1.0));
    }`;
  const glassMats = {};
  const TINT = { reddot: 0x8ab4d0, reflex: 0xd8a868, holo: 0x88c8c0, hunter: 0xd09040, seer: 0x60c8e8, god: 0xf0d080 };
  O.glassMat = function (v, asp, round) {
    const key = v + ':' + asp.toFixed(2);
    if (!glassMats[key]) {
      glassMats[key] = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uKind: { value: DOTK[v] }, uRound: { value: round ? 1 : 0 }, uAsp: { value: new THREE.Vector2(asp, 1) }, uTint: { value: new THREE.Color(TINT[v]) } },
        vertexShader: GLASS_V, fragmentShader: GLASS_F, transparent: true, depthWrite: false, toneMapped: false,
      });
    }
    return glassMats[key];
  };

  // ---- building one on a gun: ctx = { g, M, metal (the gun's own finish), y (the rail's top), z (along the gun), pipMat }
  O.build = function (ctx, v) {
    const { g, M } = ctx, y = ctx.y, z = ctx.z, Gm = GEO(), K = MATS(), metal = ctx.metal;
    const add = (gg, m, sx, sy, sz, x, yy, zz, rx, ry, rz, parent) => { const o = new THREE.Mesh(gg, m); o.scale.set(sx, sy, sz); o.position.set(x, yy, zz); o.rotation.set(rx || 0, ry || 0, rz || 0); (parent || g).add(o); return o; };
    const bx = (w, h, d, x, yy, zz, m, rx, ry, rz, parent) => add(Gm.box, m || metal, w, h, d, x, yy, zz, rx, ry, rz, parent);
    const cz = (r, len, x, yy, zz, m, parent) => add(Gm.cyl, m || metal, r, len, r, x, yy, zz, Math.PI / 2, 0, 0, parent); // along the gun
    const cx = (r, len, x, yy, zz, m, parent) => add(Gm.cyl, m || metal, r, len, r, x, yy, zz, 0, 0, Math.PI / 2, parent); // across
    const cyv = (r, len, x, yy, zz, m, parent) => add(Gm.cyl, m || metal, r, len, r, x, yy, zz, 0, 0, 0, parent); // upright
    const hood = (rx, ry, len, x, yy, zz, m) => add(Gm.tube, m, rx, len, ry, x, yy, zz, Math.PI / 2, 0, 0); // an open tube along the gun (seen from inside too)
    const ring = (gg, rx, ry, x, yy, zz, m, parent) => add(gg, m, rx, ry, (rx + ry) / 2, x, yy, zz, 0, 0, 0, parent); // a torus facing along the gun
    const glass = (round, w, h, x, yy, zz, kind) => add(round ? Gm.circle : Gm.plane, O.glassMat(kind, w / h, round), round ? w / 2 : w, round ? h / 2 : h, 1, x, yy, zz);
    M.spin = []; M.pulse = []; M.optic = v;
    const metalDS = () => { const m = metal.clone(); m.side = THREE.DoubleSide; return m; };
    const dot = (cy, winH, winZ) => { M.sightY = cy; M.dotSight = true; M.winH = winH; M.winZ = winZ; };

    if (v === 'reddot') {
      // square: a deep hood round a square window, the battery on the right, two buttons on the left
      const W = 0.038, H = 0.034, D = 0.03, t = 0.0045, cy = y + 0.012 + t + H / 2;
      bx(0.03, 0.012, 0.05, 0, y + 0.006, z);
      bx(t, H + 2 * t, D, -(W / 2 + t / 2), cy, z); bx(t, H + 2 * t, D, W / 2 + t / 2, cy, z);
      bx(W + 2 * t, t, D, 0, cy + H / 2 + t / 2, z); bx(W + 2 * t, t, D + 0.004, 0, cy - H / 2 - t / 2, z);
      cx(0.0075, 0.009, W / 2 + t + 0.004, cy - 0.006, z + 0.003); cx(0.0055, 0.002, W / 2 + t + 0.0095, cy - 0.006, z + 0.003, K.ring);
      bx(0.003, 0.006, 0.006, -(W / 2 + t + 0.0015), cy - 0.004, z - 0.006, K.rubber); bx(0.003, 0.006, 0.006, -(W / 2 + t + 0.0015), cy - 0.004, z + 0.004, K.rubber);
      glass(false, W, H, 0, cy, z - D * 0.25, 'reddot');
      dot(cy, H / 2, z + D / 2);
    } else if (v === 'reflex') {
      // wide and low: a thin frame round a wide pane under a sloping hood, the orange light at the back
      const W = 0.052, H = 0.03, D = 0.012, t = 0.0035, cy = y + 0.01 + t + H / 2;
      bx(0.036, 0.01, 0.042, 0, y + 0.005, z);
      bx(t, H + 2 * t, D, -(W / 2 + t / 2), cy, z); bx(t, H + 2 * t, D, W / 2 + t / 2, cy, z);
      bx(W + 2 * t, t, D, 0, cy + H / 2 + t / 2, z); bx(W + 2 * t, t, D, 0, cy - H / 2 - t / 2, z);
      bx(W + 2 * t, 0.003, 0.02, 0, cy + H / 2 + t + 0.002, z - 0.01, metal, -0.32, 0, 0);
      bx(0.012, 0.004, 0.006, 0, y + 0.012, z + 0.016, K.orange);
      glass(false, W, H, 0, cy, z - 0.002, 'reflex');
      dot(cy, H / 2, z + D / 2);
    } else if (v === 'holo') {
      // round: a short tube on a block, rims at both ends, buttons on the side
      const R = 0.021, D = 0.032, cy = y + 0.015 + R + 0.003;
      bx(0.032, 0.015, 0.05, 0, y + 0.0075, z);
      bx(0.012, 0.012, 0.03, 0, y + 0.017, z);
      hood(R + 0.002, R + 0.002, D, 0, cy, z, metalDS());
      ring(Gm.torMid, R + 0.003, R + 0.003, 0, cy, z - D / 2, metal); ring(Gm.torMid, R + 0.003, R + 0.003, 0, cy, z + D / 2, metal);
      bx(0.004, 0.006, 0.006, -0.018, y + 0.008, z - 0.008, K.rubber); bx(0.004, 0.006, 0.006, -0.018, y + 0.008, z + 0.004, K.rubber);
      glass(true, 2 * R, 2 * R, 0, cy, z - D * 0.2, 'holo');
      dot(cy, R, z + D / 2);
    } else if (v === 'hunter') {
      // 狩人の眼 (epic): an eye of horn and bone, the window almond-shaped, fangs above and below, leather wraps, an amber stone that throbs
      const Rx = 0.03, Ry = 0.016, D = 0.03, cy = y + 0.018 + Ry + 0.004;
      bx(0.03, 0.016, 0.05, 0, y + 0.008, z);
      for (const s of [-1, 1]) bx(0.006, 0.02, 0.012, s * 0.016, y + 0.02, z, K.bone, 0, 0, -s * 0.5); // the bone claws that hold it
      hood(Rx + 0.002, Ry + 0.002, D, 0, cy, z, K.horn);
      ring(Gm.torFat, Rx + 0.004, Ry + 0.004, 0, cy, z - D / 2, K.bone); ring(Gm.torMid, Rx + 0.003, Ry + 0.003, 0, cy, z + D / 2, K.bone);
      for (const [x, s] of [[-0.016, 1], [0, 1], [0.016, 1], [-0.009, -1], [0.009, -1]]) { // fangs, leaning outwards
        const k = x === 0 ? 1.25 : 1, yy = cy + s * (Ry * Math.sqrt(Math.max(0, 1 - (x / Rx) ** 2)) + 0.007 * k);
        add(Gm.cone, K.bone, 0.0035, 0.013 * k, 0.0035, x, yy, z - D / 2 + 0.002, -0.35 * s, 0, s > 0 ? -x * 14 : Math.PI - x * 14);
      }
      for (const dz of [-0.007, 0.007]) bx(0.014, 0.0045, 0.006, 0, cy + Ry + 0.0035, z + dz, K.leather);
      for (const s of [-1, 1]) bx(0.0045, 0.012, 0.006, s * (Rx + 0.004), cy, z + 0.004, K.leather);
      cyv(0.006, 0.004, 0, cy - Ry - 0.004, z + D / 2 + 0.002, K.bone);
      const gem = add(Gm.oct, K.amber, 0.005, 0.008, 0.005, Rx + 0.008, cy + 0.008, z - 0.004);
      M.pulse.push({ o: gem, s: 1, k: 0.22, w: 2.2 });
      glass(true, 2 * Rx, 2 * Ry, 0, cy, z - D * 0.2, 'hunter');
      dot(cy, Ry, z + D / 2);
    } else if (v === 'seer') {
      // 千里眼 (legendary): a navy and brass tube ringed by two turning circles of runes, a crystal floating above
      const R = 0.022, D = 0.03, cy = y + 0.016 + R + 0.004;
      bx(0.03, 0.016, 0.05, 0, y + 0.008, z, K.brass);
      bx(0.012, 0.008, 0.03, 0, y + 0.019, z, K.brass);
      hood(R + 0.002, R + 0.002, D, 0, cy, z, K.navy);
      ring(Gm.torMid, R + 0.003, R + 0.003, 0, cy, z - D / 2, K.brass); ring(Gm.torMid, R + 0.003, R + 0.003, 0, cy, z + D / 2, K.brass);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39; bx(0.003, 0.003, 0.008, Math.cos(a) * (R + 0.0028), cy + Math.sin(a) * (R + 0.0028), z, K.cyanDim, 0, 0, a); }
      const r1 = new THREE.Group(); r1.position.set(0, cy, z - 0.004); g.add(r1);
      ring(Gm.torThin, R + 0.012, R + 0.012, 0, 0, 0, K.cyan, r1);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bx(0.0025, 0.006, 0.002, Math.cos(a) * (R + 0.012), Math.sin(a) * (R + 0.012), 0, K.cyan, 0, 0, a, r1); }
      const r2 = new THREE.Group(); r2.position.set(0, cy, z + 0.006); r2.rotation.x = 0.22; g.add(r2);
      ring(Gm.torThin, R + 0.019, R + 0.019, 0, 0, 0, K.cyanDim, r2);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(Gm.oct, K.cyan, 0.0022, 0.0022, 0.0022, Math.cos(a) * (R + 0.019), Math.sin(a) * (R + 0.019), 0, 0, 0, 0, r2); }
      M.spin.push({ o: r1, w: 0.6 }, { o: r2, w: -0.35 });
      cyv(0.0022, 0.012, 0, cy + R + 0.008, z, K.brass);
      const cr = add(Gm.oct, K.cyan, 0.006, 0.011, 0.006, 0, cy + R + 0.024, z);
      M.pulse.push({ o: cr, s: 1, k: 0.12, w: 1.6, bob: 0.002, y0: cr.position.y, spin: 1.2 });
      glass(true, 2 * R, 2 * R, 0, cy, z - D * 0.2, 'seer');
      dot(cy, R, z + D / 2);
    } else if (v === 'god') {
      // 神の眼 (mythic): a gold tube crowned by a burst of rays, a halo of stones turning behind it, a gem that breathes light
      const R = 0.023, D = 0.03, cy = y + 0.018 + R + 0.004;
      bx(0.032, 0.018, 0.052, 0, y + 0.009, z, K.gold);
      for (const s of [-1, 1]) bx(0.006, 0.014, 0.03, s * 0.012, y + 0.022, z, K.gold, 0, 0, s * 0.3);
      hood(R + 0.002, R + 0.002, D, 0, cy, z, K.goldIn);
      ring(Gm.torFat, R + 0.004, R + 0.004, 0, cy, z - D / 2, K.gold); ring(Gm.torMid, R + 0.003, R + 0.003, 0, cy, z + D / 2, K.gold);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2; if (Math.sin(a) < -0.45) continue; // (not into the gun below)
        const L = i % 2 ? 0.011 : 0.021, rr = R + 0.005 + L / 2;
        add(Gm.cone, K.gold, 0.0032, L, 0.0032, Math.cos(a) * rr, cy + Math.sin(a) * rr, z - D / 2 + 0.001, 0, 0, a - Math.PI / 2);
      }
      const h = new THREE.Group(); h.position.set(0, cy, z + 0.008); g.add(h);
      ring(Gm.torThin, R + 0.031, R + 0.031, 0, 0, 0, K.halo, h);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(Gm.oct, K.gem, 0.0028, 0.0045, 0.0028, Math.cos(a) * (R + 0.031), Math.sin(a) * (R + 0.031), 0, 0, 0, a - Math.PI / 2, h); }
      M.spin.push({ o: h, w: 0.25 });
      const gem = add(Gm.oct, K.gem, 0.0055, 0.009, 0.0055, 0, cy + R + 0.008, z + D / 2 - 0.002);
      M.pulse.push({ o: gem, s: 1, k: 0.25, w: 1.8, spin: 0.8 });
      glass(true, 2 * R, 2 * R, 0, cy, z - D * 0.2, 'god');
      dot(cy, R, z + D / 2);
    } else if (O.PIPK[v] !== undefined) {
      buildScope(ctx, v, { add, bx, cz, cx, cyv, ring, Gm, K });
    } else if (v === 'x8') {
      buildX8(ctx, { add, bx, cz, cx, cyv, ring, Gm, K });
    }
  };

  // rings on the rail for a tube: a base, the ring, the bolts
  const rings = (h, r, cy, zs, m) => {
    const { bx, cz } = h, K = h.K;
    for (const zz of zs) {
      bx(0.034, 0.012, 0.03, 0, h.y + 0.006, zz, m || K.tube);
      bx(0.012, cy - r - h.y - 0.008, 0.024, 0, (cy - r + h.y + 0.012) / 2, zz, m || K.tube);
      cz(r * 1.2, 0.024, 0, cy, zz, K.ring);
      for (const sx of [-1, 1]) bx(0.006, 0.014, 0.014, sx * r * 1.28, cy - r * 0.55, zz, m || K.tube);
    }
  };
  const lensAt = (ctx, M, r, cy, zz) => {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 48), ctx.pipMat);
    lens.position.set(0, cy, zz); lens.renderOrder = 5; ctx.g.add(lens);
    M.pipLens = lens; M.lensZ = zz; M.lensR = r; M.sightY = cy; M.pip = true; M.scopeOptic = true;
  };

  function buildScope(ctx, v, h) {
    const { M } = ctx, y = ctx.y, z = ctx.z, { bx, cz, cx, cyv, add, Gm, K } = h; h.y = y;
    M.scopeKind = v; M.pipKind = O.PIPK[v];
    if (v === 'x2') {
      // 2x (common): a compact prism sight: a squared body on its own mount, a short hood in front, an amber fibre along the top
      const H = 0.04, L = 0.1, cy = y + 0.012 + H / 2, ly = cy + 0.002;
      bx(0.034, 0.012, 0.08, 0, y + 0.006, z, K.tube);
      bx(0.04, H, L, 0, cy, z, K.tube);
      bx(0.03, 0.01, L * 0.94, 0, cy + H / 2 + 0.004, z, K.tube);
      for (const s of [-1, 1]) bx(0.008, 0.008, L * 0.94, s * 0.017, cy + H / 2 - 0.001, z, K.tube, 0, 0, s * 0.8);
      cz(0.0028, L * 0.72, 0, cy + H / 2 + 0.0105, z, K.amber);
      cz(0.019, 0.026, 0, ly, z - L / 2 - 0.012, K.tube); cz(0.0175, 0.003, 0, ly, z - L / 2 - 0.022, K.glassDark);
      cz(0.0165, 0.024, 0, ly, z + L / 2 + 0.011, K.tube); cz(0.019, 0.01, 0, ly, z + L / 2 + 0.026, K.rubber);
      bx(0.006, 0.012, 0.016, 0.023, cy + 0.006, z - 0.01, K.ring); // the windage cap
      lensAt(ctx, M, 0.0155, ly, z + L / 2 + 0.0325);
    } else if (v === 'x25') {
      // 2.5x (uncommon): a slim tube with a red illumination knob on the left
      const r = 0.0155, len = 0.16, cy = y + 0.022 + r;
      rings(h, r, cy, [z - len * 0.22, z + len * 0.22]);
      cz(r, len, 0, cy, z, K.tube);
      cz(r * 1.42, 0.05, 0, cy, z - len / 2 - 0.02, K.tube); cz(r * 1.5, 0.008, 0, cy, z - len / 2 - 0.048, K.ring); cz(r * 1.35, 0.003, 0, cy, z - len / 2 - 0.046, K.glassDark);
      cz(r * 1.3, 0.04, 0, cy, z + len / 2 + 0.014, K.tube); cz(r * 1.45, 0.016, 0, cy, z + len / 2 + 0.04, K.rubber);
      cx(r * 0.75, 0.014, -(r + 0.007), cy, z + len * 0.12); cx(r * 0.45, 0.003, -(r + 0.0145), cy, z + len * 0.12, K.red);
      cyv(r * 0.5, 0.014, 0, cy + r + 0.006, z - len * 0.06, K.ring); cyv(r * 0.42, 0.006, 0, cy + r + 0.016, z - len * 0.06, K.rubber);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; bx(0.0035, 0.0035, 0.026, Math.cos(a) * r * 1.13, cy + Math.sin(a) * r * 1.13, z + len * 0.32, K.rubber, 0, 0, a); }
      lensAt(ctx, M, r * 1.25, cy, z + len / 2 + 0.05);
    } else if (v === 'x3') {
      // マークスマンスコープ 3x (rare): a sand-coloured tube, a tall turret marked for the drop, a flip cap standing open, a throw lever
      const r = 0.019, len = 0.21, cy = y + 0.022 + r;
      rings(h, r, cy, [z - len * 0.2, z + len * 0.2]);
      cz(r, len, 0, cy, z, K.tan);
      cz(r * 1.5, 0.07, 0, cy, z - len / 2 - 0.025, K.tan); cz(r * 1.58, 0.01, 0, cy, z - len / 2 - 0.058, K.tube); cz(r * 1.42, 0.003, 0, cy, z - len / 2 - 0.056, K.glassDark);
      cz(r * 1.5, 0.004, 0, cy + r * 1.5 * 2 + 0.003, z - len / 2 - 0.066, K.tube); bx(0.006, r * 1.5 + 0.004, 0.004, 0, cy + r * 1.5 + 0.002, z - len / 2 - 0.066, K.tube);
      cyv(r * 0.62, 0.012, 0, cy + r + 0.004, z - len * 0.05, K.tube); cyv(r * 0.55, 0.03, 0, cy + r + 0.024, z - len * 0.05, K.tan);
      for (let i = 0; i < 3; i++) cyv(r * 0.57, 0.0018, 0, cy + r + 0.014 + i * 0.008, z - len * 0.05, K.white);
      cyv(r * 0.5, 0.005, 0, cy + r + 0.041, z - len * 0.05, K.tube);
      cx(r * 0.5, 0.02, r + 0.01, cy, z - len * 0.05, K.tan);
      cz(r * 1.3, 0.05, 0, cy, z + len / 2 + 0.02, K.tan); cz(r * 1.45, 0.016, 0, cy, z + len / 2 + 0.05, K.rubber);
      bx(0.004, 0.024, 0.006, r * 1.3 + 0.004, cy + 0.01, z + len * 0.36, K.tube, 0, 0, -0.3);
      lensAt(ctx, M, r * 1.25, cy, z + len / 2 + 0.062);
    } else {
      // 4x (rare): the classic long black tube: ring mounts, bells front and back, the magnification ring, turrets and a parallax knob
      const len = 0.27, r = 0.021, cy = y + 0.02 + r;
      rings(h, r, cy, [z - len * 0.2, z + len * 0.2]);
      cz(r, len, 0, cy, z, K.tube);
      cz(r * 1.55, 0.08, 0, cy, z - len / 2 - 0.02, K.tube); cz(r * 1.64, 0.014, 0, cy, z - len / 2 - 0.066, K.ring);
      cz(r * 1.5, 0.05, 0, cy, z - len / 2 - 0.1, K.rubber); cz(r * 1.42, 0.004, 0, cy, z - len / 2 - 0.058, K.glassDark);
      cz(r * 1.3, 0.052, 0, cy, z + len / 2 + 0.016, K.tube); cz(r * 1.45, 0.02, 0, cy, z + len / 2 + 0.048, K.rubber);
      cz(r * 1.14, 0.05, 0, cy, z + len * 0.3, K.ring);
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; bx(0.004, 0.004, 0.034, Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, z + len * 0.3, K.rubber, 0, 0, a); }
      cyv(r * 0.62, 0.012, 0, cy + r + 0.004, z - len * 0.06, K.ring); cyv(r * 0.5, 0.022, 0, cy + r + 0.017, z - len * 0.06, K.tube); cyv(r * 0.52, 0.006, 0, cy + r + 0.03, z - len * 0.06, K.rubber);
      cx(r * 0.6, 0.012, r + 0.004, cy, z - len * 0.06, K.ring); cx(r * 0.48, 0.022, r + 0.017, cy, z - len * 0.06, K.tube);
      cx(r * 0.5, 0.012, -(r * 1.5) - 0.004, cy, z - len / 2 - 0.02, K.tube); cx(r * 0.42, 0.02, -(r * 1.5) - 0.014, cy, z - len / 2 - 0.02, K.rubber);
      lensAt(ctx, M, r * 1.3, cy, z + len / 2 + 0.066);
    }
  }

  function buildX8(ctx, h) {
    // 8x (epic, sniper rifles only): a long heavy scope on a cantilever mount: a big coated objective under a long shade, gold bands, a large focus
    // wheel, an illumination dial that glows, a bubble level, tall turrets with a gold cap. Through it the screen goes black round the eyepiece (ui.js).
    const { M } = ctx, y = ctx.y, z = ctx.z, { bx, cz, cx, cyv, Gm, K, add } = h; h.y = y;
    const r = 0.026, len = 0.36, cy = y + 0.026 + r;
    M.scopeKind = 'x8'; M.scopeOptic = true; M.pip = false;
    bx(0.036, 0.014, 0.16, 0, y + 0.007, z + 0.03, K.tube); bx(0.03, 0.006, 0.05, 0, y + 0.017, z - 0.07, K.ring);
    rings(h, r, cy, [z - len * 0.16, z + len * 0.2]);
    for (const zz of [z - len * 0.16, z + len * 0.2]) cz(r * 1.24, 0.006, 0, cy, zz, K.gold);
    cz(r, len, 0, cy, z, K.tube);
    cz(r * 1.62, 0.09, 0, cy, z - len / 2 - 0.03, K.tube); cz(r * 1.7, 0.012, 0, cy, z - len / 2 - 0.074, K.gold);
    cz(r * 1.58, 0.08, 0, cy, z - len / 2 - 0.12, K.rubber); cz(r * 1.66, 0.006, 0, cy, z - len / 2 - 0.16, K.gold);
    cz(r * 1.5, 0.003, 0, cy, z - len / 2 - 0.077, K.coat);
    for (const dz of [-0.35, 0.36]) cz(r * 1.03, 0.006, 0, cy, z + len * dz, K.gold);
    cz(r * 1.14, 0.05, 0, cy, z + len * 0.3, K.ring);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; bx(0.004, 0.004, 0.034, Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, z + len * 0.3, K.rubber, 0, 0, a); }
    bx(0.002, 0.008, 0.006, 0, cy + r * 1.16 + 0.003, z + len * 0.3 - 0.012, K.white);
    // turrets: elevation (tall, gold cap, marks), windage
    const tz = z - len * 0.04;
    cyv(r * 0.72, 0.012, 0, cy + r + 0.004, tz, K.ring); cyv(r * 0.62, 0.03, 0, cy + r + 0.024, tz, K.tube);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; bx(0.0018, 0.008, 0.0018, Math.cos(a) * r * 0.63, cy + r + 0.026, tz + Math.sin(a) * r * 0.63, K.white, 0, -a, 0); }
    cyv(r * 0.64, 0.008, 0, cy + r + 0.043, tz, K.gold);
    cx(r * 0.62, 0.012, r + 0.004, cy, tz, K.ring); cx(r * 0.52, 0.026, r + 0.021, cy, tz, K.tube); cx(r * 0.54, 0.006, r + 0.036, cy, tz, K.gold);
    // the big focus wheel on the left, ribbed, a gold hub
    cx(r * 0.4, 0.014, -(r + 0.006), cy, tz, K.tube); cx(r * 1.3, 0.008, -(r + 0.016), cy, tz, K.tube);
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; bx(0.01, 0.003, 0.003, -(r + 0.016), cy + Math.sin(a) * r * 1.3, tz + Math.cos(a) * r * 1.3, K.rubber, a, 0, 0); }
    cx(r * 0.45, 0.004, -(r + 0.022), cy, tz, K.gold);
    // the illumination dial (glowing red) behind it, a bubble level at the back
    cx(r * 0.55, 0.012, -(r + 0.006), cy, z + len * 0.16, K.tube); cx(r * 0.28, 0.002, -(r + 0.0128), cy, z + len * 0.16, K.red);
    cz(0.0032, 0.012, r * 1.4, cy - r * 0.7, z + len * 0.2 + 0.018, K.green);
    // the eyepiece
    cz(r * 1.35, 0.06, 0, cy, z + len / 2 + 0.02, K.tube); cz(r * 1.5, 0.024, 0, cy, z + len / 2 + 0.06, K.rubber);
    add(Gm.circle, K.glassDark, r * 1.3, r * 1.3, 1, 0, cy, z + len / 2 + 0.073);
    M.lensZ = z + len / 2 + 0.074; M.lensR = r * 1.3; M.sightY = cy;
  }

  // the moving parts (the turning rings, the throbbing stones) and the reticles that live
  O.tick = function (model, dt, t) {
    for (const k in glassMats) glassMats[k].uniforms.uTime.value = t;
    if (!model) return;
    if (model.spin) for (const s of model.spin) s.o.rotation.z += s.w * dt;
    if (model.pulse) for (const p of model.pulse) {
      p.o.scale.x = p.o.scale.x / (p.cur || 1); p.o.scale.y = p.o.scale.y / (p.cur || 1); p.o.scale.z = p.o.scale.z / (p.cur || 1);
      p.cur = 1 + p.k * Math.sin(t * p.w); p.o.scale.multiplyScalar(p.cur);
      if (p.bob) p.o.position.y = p.y0 + Math.sin(t * p.w) * p.bob;
      if (p.spin) p.o.rotation.y += p.spin * dt;
    }
  };

  // ---- the 8x eyepiece (ui.js scope): a vignette and a glint on the glass, a mil-dot reticle with heavy posts, numbered marks, a stadia ladder,
  // a lit centre, the rangefinder's readout under it
  O.x8Svg = function () {
    const dots = [], nums = [], hash = [];
    for (let i = 1; i <= 4; i++) {
      const d = i * 8;
      for (const [x, yy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) dots.push(`<circle cx="${x}" cy="${yy}" r="0.95"/>`);
      for (const [x, yy] of [[d - 4, 0], [-(d - 4), 0], [0, d - 4], [0, -(d - 4)]]) hash.push(x ? `<line x1="${x}" y1="-1.3" x2="${x}" y2="1.3"/>` : `<line x1="-1.3" y1="${yy}" x2="1.3" y2="${yy}"/>`);
      if (i % 2 === 0) nums.push(`<text x="${d}" y="-3">${i * 2}</text><text x="${-d}" y="-3">${i * 2}</text><text x="3" y="${d + 1.2}">${i * 2}</text>`);
    }
    const ladder = [];
    for (let i = 0; i < 5; i++) { const yy = 44 + i * 5, w = 14 - i * 2.2; ladder.push(`<line x1="${-60 - w}" y1="${yy}" x2="-60" y2="${yy}"/><text x="-58" y="${yy + 1.3}">${(i + 2) * 100}</text>`); }
    return `<svg viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg">
<defs>
<radialGradient id="x8v" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse"><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="0.9" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0.92"/></radialGradient>
<radialGradient id="x8t" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse"><stop offset="0.55" stop-color="#4060a0" stop-opacity="0"/><stop offset="1" stop-color="#3a5080" stop-opacity="0.2"/></radialGradient>
<filter id="x8g" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="1.1"/></filter>
</defs>
<circle r="100" fill="url(#x8t)"/>
<circle r="100" fill="url(#x8v)"/>
<path d="M -78 -48 A 92 92 0 0 1 -30 -87" stroke="#fff" stroke-opacity="0.07" stroke-width="9" fill="none" stroke-linecap="round"/>
<path d="M 70 60 A 92 92 0 0 1 50 77" stroke="#fff" stroke-opacity="0.04" stroke-width="5" fill="none" stroke-linecap="round"/>
<g fill="#060606" stroke="none">
<rect x="-100" y="-1.7" width="60" height="3.4"/><rect x="40" y="-1.7" width="60" height="3.4"/><rect x="-1.7" y="40" width="3.4" height="60"/><rect x="-1.7" y="-100" width="3.4" height="60"/>
${dots.join('')}
</g>
<g stroke="#060606" stroke-width="0.38" fill="none">
<line x1="-40" y1="0" x2="40" y2="0"/><line x1="0" y1="-40" x2="0" y2="40"/>
${hash.join('')}
</g>
<g stroke="#060606" stroke-width="0.45" fill="#0a0a0a" font-family="monospace" font-size="3.2" text-anchor="middle">${ladder.join('').replace(/<text /g, '<text stroke="none" text-anchor="start" ')}</g>
<g fill="#0a0a0a" font-family="monospace" font-size="3.4" text-anchor="middle">${nums.join('')}</g>
<circle r="3" fill="none" stroke="#ff3a24" stroke-opacity="0.35" stroke-width="0.3"/>
<circle class="x8c" r="1.7" fill="#ff3020" filter="url(#x8g)"/>
<circle r="0.75" fill="#ff5a3a"/>
<text x="70" y="-66" fill="#fff" fill-opacity="0.35" font-family="monospace" font-size="6">8×</text>
<g transform="translate(0 62)">
<rect x="-19" y="-6.5" width="38" height="12" rx="2.2" fill="#140402" fill-opacity="0.6" stroke="#ff6a40" stroke-opacity="0.45" stroke-width="0.4"/>
<text class="x8rng" y="2.4" text-anchor="middle" font-family="monospace" font-size="7" fill="#ffb040">--- m</text>
</g>
</svg>`;
  };
})();
