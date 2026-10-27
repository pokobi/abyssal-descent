'use strict';
// Weapons: stats pipeline, procedural first-person models (+attachments, hands), ADS, recoil, firing, reload, melee.
(function () {
  const W = (G.weapons = { adsT: 0, dirty: true, ver: 0, curStats: null });
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let vmScene, vmCam, vmRoot, vmLight, flashSprite, flashSprite2, mats, P;
  let model = null; // current viewmodel {group, muzzle, sightY, mag, bolt, ...}

  // ---------------- stats ----------------
  const ELEM_OF = { incendiary: ['fire', 0.35], cryo: ['frost', 0.4], toxic: ['poison', 0.4], shock: ['shock', 0.3] };
  W.make = function (id) {
    const def = G.WEAPON_BY_ID[id];
    const w = { id, def, atts: {}, mag: 0, reloading: false, reloadT: 0, bloom: 0, magAcc: 0, ver: 0, ramp: 0, burstQ: 0, charge: 0, spin: 0, kills: 0 };
    w.mag = W.stats(w).mag;
    G.save.mark('items', id);
    return w;
  };
  // [fraction of the range with full damage, damage multiplier at the range]; arms not listed (dmr / sniper / crossbow / rail ...) do not fall off
  W.FALLOFF = { pistol: [0.4, 0.7], revolver: [0.5, 0.78], smg: [0.3, 0.55], rifle: [0.55, 0.8], burst: [0.55, 0.8], lmg: [0.5, 0.75], minigun: [0.4, 0.6], shotgun: [0.2, 0.35], autoshotgun: [0.2, 0.3], nail: [0.5, 0.75], tesla: [0.4, 0.7] };
  W.stats = function (w) {
    if (w._sc && w._sc.ver === w.ver && w._sc.gv === W.ver) return w._sc.s;
    const d = w.def, st = G.player.stats, pl = G.player;
    const s = Object.assign({}, d);
    s.shieldMul = d.shieldMul || 1; s.critChance = 0; s.pierce = d.pierce || 0; s.ricochet = 0; s.lifesteal = 0; s.explo = 0; s.moveSpread = 0; s.crouchRecoil = 0; s.melee = 0; s.ammoSave = 0; s.eliteDmg = 0;
    s.elem = d.element || null; s.elemChance = d.elemChance || (d.element ? 0.25 : 0);
    if (d.trait && ELEM_OF[d.trait]) { s.elem = ELEM_OF[d.trait][0]; s.elemChance = Math.max(s.elemChance, ELEM_OF[d.trait][1]); if (d.trait === 'shock') s.shieldMul *= 1.3; }
    if (d.trait === 'ricochet') s.ricochet += 0.4;
    for (const slot in w.atts) {
      const a = G.ATT_BY_ID[w.atts[slot]]; if (!a) continue;
      for (const k in a.mods) {
        const v = a.mods[k];
        if (k === 'elem') { s.elem = v; continue; }
        if (k.endsWith('+')) { const kk = k.slice(0, -1); s[kk] = (s[kk] || 0) + v; continue; }
        if (k === 'critChance') { s.critChance += v; continue; }
        s[k] = (s[k] === undefined ? 1 : s[k]) * v;
      }
    }
    if (s.slug && (s.pellets || 1) > 1) { s.dmg *= s.pellets * 0.75; s.pellets = 1; s.spread *= 0.15; s.adsSpread = 0.08; s.range *= 2.5; }
    if (s.auto) s.auto = true;
    if (s.explodeR && s.proj && s.proj.explode) s.proj = Object.assign({}, s.proj, { explode: s.proj.explode + s.explodeR });
    // player stats
    s.rpm *= Math.max(0.2, 1 + st.fireRate + (pl.dynFireRate || 0));
    s.mag = Math.max(1, Math.round(s.mag * Math.max(0.2, 1 + st.magSize)));
    s.reload = s.reload / Math.max(0.3, 1 + st.reloadSpeed);
    s.spread *= Math.max(0.15, 1 + st.spread); s.adsSpread *= Math.max(0.15, 1 + st.spread);
    s.recoil *= Math.max(0.1, 1 + st.recoil);
    s.adsTime = s.adsTime / Math.max(0.3, 1 + st.adsSpeed);
    s.range *= 1 + st.range;
    s.headMul = s.headMul + st.headMul;
    s.pierce += st.pierce;
    s.ricochet += st.ricochet;
    s.ammoSave += st.ammoSave;
    s.critChance += 0;
    s.doubleShot = (st.doubleShot || 0) + (d.trait === 'double' ? 0.25 : 0);
    s.sprintFire = !!s.sprintFire;
    const lv = w.lv || 0;
    // forge levels are the main way guns keep up with depth (multiplicative, up to +15)
    if (lv) { s.dmg *= Math.pow(1.13, lv); s.rpm *= 1 + 0.02 * Math.min(lv, 10); s.mag = Math.max(1, Math.round(s.mag * (1 + 0.05 * Math.min(lv, 10)))); }
    w._sc = { ver: w.ver, gv: W.ver, s };
    return s;
  };
  W.dps = function (s) { return s.dmg * (s.pellets || 1) * s.rpm / 60; };

  // ---------------- scope lens ----------------
  // No second render of the world: the screen is rendered once (zoomed a little), and the central square of that finished frame is copied
  // into a texture which the scope's rear lens shows magnified further (plus vignette, a touch of colour fringing and the reticle).
  let pip = null;
  const PIP_FRAG = `
    uniform sampler2D tMap; uniform float uLive; uniform float uCrop; varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0; float r = length(p);
      vec3 col;
      float w = fwidth(p.x) * 1.3;
      if (uLive > 0.5) {
        vec2 q = p * (1.0 + 0.05 * r * r) * 0.5 * uCrop + 0.5; float ca = 0.004 * r * r * uCrop;
        col = vec3(texture2D(tMap, q + p * ca).r, texture2D(tMap, q).g, texture2D(tMap, q - p * ca).b);
        col *= mix(1.0, 0.25, smoothstep(0.74, 1.0, r));
        float h = abs(p.y), v = abs(p.x);
        float hz = mix(smoothstep(0.004 + w, 0.004, h), smoothstep(0.02 + w, 0.02, h), step(0.24, v)) * step(0.03, v);
        float vt = mix(smoothstep(0.004 + w, 0.004, v), smoothstep(0.02 + w, 0.02, v), step(0.24, h)) * step(0.03, h);
        float dots = 0.0;
        for (int k = 1; k < 5; k++) { float d = float(k) * 0.075; dots = max(dots, smoothstep(0.014 + w, 0.014, length(vec2(v - d, p.y)))); dots = max(dots, smoothstep(0.014 + w, 0.014, length(vec2(p.x, h - d)))); }
        float ret = clamp(max(max(hz, vt), dots) * step(r, 0.95), 0.0, 1.0);
        col = mix(col, vec3(0.0), ret * 0.92);
        col += vec3(1.0, 0.12, 0.06) * smoothstep(0.009 + w, 0.009, r) * 1.6;
        col += vec3(0.04, 0.05, 0.08) * smoothstep(0.9, 0.0, length(p - vec2(-0.5, 0.52))) * 0.3;
      } else {
        col = vec3(0.1, 0.12, 0.16) * 0.2 + vec3(0.2, 0.26, 0.34) * smoothstep(1.0, 0.0, length(p - vec2(-0.45, 0.5))) * 0.5;
      }
      col *= smoothstep(1.0, 0.955, r);
      gl_FragColor = vec4(col, 1.0);
    }`;
  W.pipMaterial = function () {
    if (!pip) {
      pip = { tex: null, size: 0, on: false, crop: 0.2, v2: new THREE.Vector2(), v2b: new THREE.Vector2(),
        mat: new THREE.ShaderMaterial({ uniforms: { tMap: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) }, uLive: { value: 0 }, uCrop: { value: 0.2 } }, vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: PIP_FRAG, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }) };
      pip.mat.uniforms.tMap.value.needsUpdate = true;
    }
    return pip.mat;
  };
  const LENS_Q = 0.92; // the lens covers this much of the screen height while aiming
  // how much the whole screen zooms while aiming through a scope: the rest of the magnification happens inside the lens
  W.camZoom = function () {
    const s = W.curStats; if (!s) return 1;
    if (!(model && model.pip)) return W.adsZoom();
    return 1 + (Math.min(2.4, Math.max(1, Math.sqrt(s.zoom))) - 1) * W.adsT;
  };

  // ---------------- viewmodel ----------------
  W.init = function (renderer) {
    P = G.player;
    vmScene = new THREE.Scene();
    vmCam = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
    vmRoot = new THREE.Group(); vmScene.add(vmRoot);
    vmScene.add(new THREE.HemisphereLight(0xb0a8b0, 0x3a2a20, 1.5));
    const key = new THREE.DirectionalLight(0xffd8b0, 2.4); key.position.set(1, 2, 1); vmScene.add(key);
    const rim = new THREE.DirectionalLight(0x8090c0, 1.0); rim.position.set(-1, 0.5, -1); vmScene.add(rim);
    vmLight = new THREE.PointLight(0xffb060, 0, 3, 2); vmLight.position.set(0.1, -0.05, -0.8); vmScene.add(vmLight);
    W.vmScene = vmScene; W.vmCam = vmCam; W.vmKey = key; W.vmRoot = vmRoot;
    W.getModel = () => model;
    const t = G.Tex.tex;
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.envMapIntensity = 2.2; return m; };
    mats = {
      gun: mk({ color: 0x4a4d54, metalness: 0.45, roughness: 0.42, normalMap: t.metal.normalMap, map: t.metal.map }),
      steel: mk({ color: 0x9a9da3, metalness: 0.7, roughness: 0.3, normalMap: t.metal.normalMap }),
      poly: mk({ color: 0x2a2b2e, metalness: 0.05, roughness: 0.72, normalMap: t.skin.normalMap }),
      wood: mk({ color: 0x8a5a34, metalness: 0, roughness: 0.55, map: t.planks.map, normalMap: t.planks.normalMap }),
      brass: mk({ color: 0xc89a50, metalness: 1, roughness: 0.3 }),
      glove: mk({ color: 0x2a221c, metalness: 0, roughness: 0.85, normalMap: t.skin.normalMap }),
      sleeve: mk({ color: 0x3a3a34, metalness: 0, roughness: 0.95, map: t.cloth.map, normalMap: t.cloth.normalMap }),
      lens: mk({ color: 0x8aa0b0, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.08, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ color: 0xff3020 }),
      coil: mk({ color: 0xb08040, metalness: 1, roughness: 0.35, emissive: 0x302010 }),
      railGlow: mk({ color: 0x404850, emissive: 0x6080a0, emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.3 }),
      tank: mk({ color: 0x6a2a1a, metalness: 0.6, roughness: 0.5 }),
    };
    W.mats = mats;
    const fl = G.Tex.canvasTex(128, (g, s) => {
      g.translate(s / 2, s / 2);
      for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); const gr = g.createLinearGradient(0, 0, s / 2, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -s * 0.05); g.lineTo(s * 0.5, 0); g.lineTo(0, s * 0.05); g.fill(); }
      const r = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.25); r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = r; g.fillRect(-s / 2, -s / 2, s, s);
    }, false);
    flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: fl, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flashSprite2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flashSprite.visible = flashSprite2.visible = false;
    vmScene.add(flashSprite, flashSprite2);
  };
  W.setEnv = function (env) { if (vmScene) vmScene.environment = env; };
  W.resize = function (a) { if (vmCam) { vmCam.aspect = a; vmCam.updateProjectionMatrix(); } };

  const FIN = { black: [0x45484e, 0x2a2b2e], tan: [0x45484e, 0x8a7a5a], steel: [0x9a9da2, 0x333333], wood: [0x45484e, null], brass: [0xa88850, 0x5a3a24], gold: [0xffcf40, 0x2c1016], bone: [0xc8bca0, 0x3a3028], rust: [0x6a4a36, 0x3a2a20] };
  function buildGun(def, atts, showHands) {
    const g = new THREE.Group();
    const isLeg = def.rarity === 'legendary' || !!def.mythic;
    const fin = FIN[def.finish] || FIN.black;
    const metal = mats.gun.clone(); metal.color.setHex(fin[0]);
    const poly = fin[1] === null ? mats.wood : mats.poly.clone(); if (fin[1] !== null) poly.color.setHex(fin[1]);
    if (def.finish === 'gold' || isLeg) {
      metal.map = null; metal.metalness = 0.46; metal.roughness = 0.20;
      if (def.id === 'y_maw') { metal.color.setHex(0x281832); metal.emissive.setHex(0x180624); metal.emissiveIntensity = 0.45; poly.color.setHex(0xd8a840); }
      else if (def.id === 'y_storm') { metal.color.setHex(0xe8f4ff); metal.emissive.setHex(0x286898); metal.emissiveIntensity = 0.48; poly.color.setHex(0xc89a38); }
      else if (def.id === 'm_hell') { metal.color.setHex(0xd88828); metal.emissive.setHex(0x581c04); metal.emissiveIntensity = 0.48; poly.color.setHex(0x220c0a); }
      else { metal.color.setHex(0xffcf40); metal.emissive.setHex(0x7a4c08); metal.emissiveIntensity = 0.50; poly.color.setHex(0x321016); poly.emissive.setHex(0x140408); poly.emissiveIntensity = 0.25; }
    }
    const woodOr = isLeg ? poly : (def.finish === 'wood' || def.arch === 'shotgun' || def.arch === 'crossbow' || def.arch === 'dmr' ? mats.wood : poly);
    const PG = G.Props.PG;
    const box = (w, h, d, x, y, z, m, rx, ry, rz, parent) => { const o = new THREE.Mesh(PG.box, m || metal); o.scale.set(w, h, d); o.position.set(x, y, z); o.rotation.set(rx || 0, ry || 0, rz || 0); (parent || g).add(o); return o; };
    const cyl = (r, len, x, y, z, m, seg, parent) => { const o = new THREE.Mesh(seg === 8 ? PG.cyl8 : PG.cyl, m || metal); o.scale.set(r, len, r); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); (parent || g).add(o); return o; };
    const M = { muzzle: V(0, 0.03, -0.4), sightY: 0.08, mag: null, bolt: null, fore: V(0, -0.02, -0.25), grip: V(0, -0.05, 0.06), ejector: V(0.03, 0.05, 0), opticY: 0.075, opticZ: 0, railY: 0.07, ironY: 0.08, extra: [] };
    let barrels = null;
    switch (def.arch) {
      case 'pistol': {
        const slide = box(0.032, 0.036, 0.19, 0, 0.035, -0.02); M.bolt = slide;
        box(0.03, 0.026, 0.17, 0, 0.007, -0.015, poly);
        box(0.03, 0.1, 0.045, 0, -0.055, 0.045, poly, 0.22);
        box(0.008, 0.02, 0.03, 0, -0.013, -0.01, metal);
        cyl(0.007, 0.02, 0, 0.035, -0.12, mats.steel);
        box(0.006, 0.01, 0.006, 0, 0.058, -0.105); box(0.006, 0.012, 0.008, -0.008, 0.058, 0.065); box(0.006, 0.012, 0.008, 0.008, 0.058, 0.065);
        M.mag = box(0.026, 0.07, 0.035, 0, -0.07, 0.048, metal, 0.22);
        for (let i = 0; i < 6; i++) box(0.034, 0.03, 0.003, 0, 0.036, 0.04 + i * 0.008, mats.poly);
        box(0.002, 0.012, 0.03, 0.0165, 0.042, -0.04, mats.poly);
        box(0.031, 0.006, 0.05, 0, -0.004, -0.065, mats.poly);
        box(0.006, 0.014, 0.008, 0, 0.02, 0.078, metal, -0.4);
        M.muzzle.set(0, 0.035, -0.13); M.sightY = 0.06; M.ironY = 0.06; M.railY = 0.054; M.opticZ = 0.02; M.fore.set(0, -0.06, 0.04); M.grip.set(0, -0.05, 0.05); M.ejector.set(0.02, 0.045, -0.01);
        break;
      }
      case 'revolver': {
        cyl(0.013, 0.2, 0, 0.04, -0.13, metal); box(0.012, 0.012, 0.2, 0, 0.058, -0.13);
        const drum = cyl(0.032, 0.05, 0, 0.03, 0.0, mats.steel); M.bolt = drum; drum.userData.spin = true;
        box(0.03, 0.05, 0.09, 0, 0.03, 0.03);
        box(0.032, 0.11, 0.05, 0, -0.05, 0.075, mats.wood, 0.4);
        box(0.008, 0.02, 0.012, 0, 0.068, 0.06);
        M.muzzle.set(0, 0.04, -0.24); M.sightY = 0.07; M.ironY = 0.07; M.railY = 0.064; M.fore.set(0, -0.06, 0.06); M.grip.set(0, -0.05, 0.08); M.opticZ = -0.06;
        break;
      }
      case 'smg': {
        box(0.045, 0.06, 0.28, 0, 0.02, -0.02); M.bolt = box(0.01, 0.015, 0.05, 0.026, 0.035, 0.0, mats.steel);
        box(0.05, 0.045, 0.14, 0, 0.015, -0.21, poly); cyl(0.012, 0.08, 0, 0.02, -0.31);
        box(0.032, 0.1, 0.045, 0, -0.06, 0.07, poly, 0.25);
        M.mag = box(0.025, 0.14, 0.035, 0, -0.08, -0.07, metal, -0.05);
        box(0.015, 0.015, 0.2, 0, 0.0, 0.2, metal); box(0.03, 0.06, 0.02, 0, -0.02, 0.3, poly);
        box(0.03, 0.01, 0.26, 0, 0.055, -0.04, metal);
        M.muzzle.set(0, 0.02, -0.36); M.sightY = 0.075; M.ironY = 0.075; M.railY = 0.06; M.fore.set(0, -0.03, -0.2); M.grip.set(0, -0.05, 0.07);
        break;
      }
      case 'rifle': case 'burst': case 'dmr': {
        const long = def.arch === 'dmr';
        box(0.05, 0.07, 0.34, 0, 0.02, 0.0);
        M.bolt = box(0.012, 0.018, 0.06, 0.03, 0.035, 0.02, mats.steel);
        box(0.056, 0.058, 0.26, 0, 0.018, -0.28, long ? mats.wood : poly);
        cyl(0.011, long ? 0.34 : 0.22, 0, 0.022, long ? -0.55 : -0.5);
        cyl(0.017, 0.05, 0, 0.022, long ? -0.71 : -0.6, metal);
        box(0.034, 0.1, 0.045, 0, -0.065, 0.1, poly, 0.3);
        M.mag = box(0.028, 0.15, 0.06, 0, -0.09, -0.06, metal, -0.15);
        box(0.042, 0.075, 0.24, 0, 0.0, 0.3, long ? mats.wood : poly); box(0.044, 0.1, 0.03, 0, -0.01, 0.42, mats.poly);
        box(0.03, 0.012, 0.36, 0, 0.062, -0.08, metal);
        box(0.008, 0.035, 0.01, 0, 0.08, -0.37); box(0.006, 0.024, 0.02, -0.01, 0.076, 0.11); box(0.006, 0.024, 0.02, 0.01, 0.076, 0.11);
        box(0.002, 0.03, 0.07, 0.026, 0.035, -0.02, mats.poly); box(0.012, 0.012, 0.025, -0.03, 0.045, 0.1, mats.steel);
        for (let i = 0; i < 5; i++) box(0.058, 0.004, 0.012, 0, 0.048, -0.2 - i * 0.045, mats.poly);
        box(0.04, 0.03, 0.05, 0, -0.035, -0.06, metal);
        if (def.arch === 'burst') { box(0.06, 0.03, 0.1, 0, -0.025, -0.15, metal); }
        M.muzzle.set(0, 0.022, long ? -0.75 : -0.64); M.sightY = 0.088; M.ironY = 0.088; M.railY = 0.068; M.fore.set(0, -0.02, -0.28); M.grip.set(0, -0.06, 0.1);
        break;
      }
      case 'sniper': {
        box(0.05, 0.065, 0.3, 0, 0.02, 0.0); cyl(0.013, 0.6, 0, 0.025, -0.45); cyl(0.02, 0.06, 0, 0.025, -0.77, metal);
        box(0.06, 0.06, 0.4, 0, -0.005, -0.15, woodOr); box(0.045, 0.09, 0.3, 0, -0.01, 0.3, woodOr);
        box(0.03, 0.09, 0.04, 0, -0.07, 0.12, woodOr, 0.35);
        M.bolt = box(0.05, 0.012, 0.012, 0.035, 0.04, 0.08, mats.steel);
        M.mag = box(0.03, 0.06, 0.07, 0, -0.06, -0.02, metal);
        box(0.03, 0.012, 0.25, 0, 0.06, -0.04, metal);
        M.muzzle.set(0, 0.025, -0.81); M.sightY = 0.1; M.ironY = 0.08; M.railY = 0.066; M.fore.set(0, -0.04, -0.28); M.grip.set(0, -0.06, 0.12);
        if (!atts.optic) atts = Object.assign({}, atts, { optic: '__defscope' });
        break;
      }
      case 'shotgun': case 'autoshotgun': {
        const auto = def.arch === 'autoshotgun';
        box(0.05, 0.07, 0.24, 0, 0.02, 0.0);
        cyl(0.017, 0.52, 0, 0.04, -0.36);
        if (!auto) { cyl(0.014, 0.42, 0, 0.0, -0.32, mats.steel); M.bolt = box(0.055, 0.05, 0.14, 0, 0.0, -0.28, woodOr); }
        else { box(0.056, 0.06, 0.24, 0, 0.02, -0.25, poly); M.mag = cyl(0.06, 0.07, 0, -0.07, -0.08, metal); M.mag.rotation.set(0, 0, Math.PI / 2); }
        box(0.034, 0.1, 0.045, 0, -0.065, 0.1, woodOr, 0.3);
        box(0.045, 0.08, 0.26, 0, -0.005, 0.28, woodOr);
        box(0.008, 0.012, 0.008, 0, 0.062, -0.6, mats.brass);
        M.muzzle.set(0, 0.04, -0.63); M.sightY = 0.065; M.ironY = 0.065; M.railY = 0.058; M.fore.set(0, -0.03, -0.28); M.grip.set(0, -0.06, 0.1);
        break;
      }
      case 'lmg': {
        box(0.07, 0.09, 0.36, 0, 0.02, 0.0); box(0.06, 0.07, 0.3, 0, 0.02, -0.32, poly);
        cyl(0.014, 0.3, 0, 0.025, -0.6); cyl(0.022, 0.06, 0, 0.025, -0.78);
        M.mag = box(0.09, 0.1, 0.1, 0.03, -0.07, -0.04, metal);
        box(0.036, 0.1, 0.05, 0, -0.07, 0.12, poly, 0.3);
        box(0.05, 0.09, 0.26, 0, 0.0, 0.32, poly);
        box(0.012, 0.05, 0.12, 0, 0.1, -0.1, metal);
        box(0.008, 0.12, 0.008, 0.02, -0.07, -0.55, metal, 0.6); box(0.008, 0.12, 0.008, -0.02, -0.07, -0.55, metal, 0.6);
        M.bolt = box(0.012, 0.02, 0.04, 0.04, 0.04, 0.02, mats.steel);
        M.muzzle.set(0, 0.025, -0.82); M.opticZ = -0.1; M.sightY = 0.135; M.ironY = 0.135; M.railY = 0.13; M.fore.set(0, -0.03, -0.3); M.grip.set(0, -0.06, 0.12);
        break;
      }
      case 'minigun': {
        barrels = new THREE.Group(); barrels.position.set(0, 0, -0.35); g.add(barrels);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(0.011, 0.55, Math.cos(a) * 0.035, Math.sin(a) * 0.035, -0.1, mats.steel, 8, barrels); }
        cyl(0.055, 0.03, 0, 0, -0.32, metal, 16, barrels); cyl(0.055, 0.03, 0, 0, 0.1, metal, 16, barrels);
        cyl(0.07, 0.24, 0, 0, 0.12, metal); box(0.14, 0.12, 0.18, 0, -0.02, 0.28, poly);
        box(0.02, 0.1, 0.02, 0, 0.12, 0.05, metal); box(0.02, 0.02, 0.15, 0, 0.17, 0.05, poly);
        M.mag = box(0.12, 0.14, 0.12, 0.1, -0.12, 0.25, metal);
        cyl(0.06, 0.2, 0, 0, -0.1, metal); // the housing reaches the barrel cluster (there used to be a gap between them)
        M.muzzle.set(0, 0.0, -0.74); M.opticZ = 0.05; M.sightY = 0.2; M.ironY = 0.2; M.railY = 0.18; M.fore.set(0, 0.17, 0.05); M.grip.set(0, -0.05, 0.3);
        break;
      }
      case 'crossbow': {
        box(0.04, 0.05, 0.6, 0, 0.0, -0.1, mats.wood);
        box(0.6, 0.02, 0.03, 0, 0.02, -0.38, metal, 0, 0, 0);
        const limbL = box(0.32, 0.018, 0.025, -0.16, 0.02, -0.36, metal, 0, -0.25); const limbR = box(0.32, 0.018, 0.025, 0.16, 0.02, -0.36, metal, 0, 0.25);
        box(0.6, 0.004, 0.004, 0, 0.03, -0.27, mats.poly);
        M.bolt = box(0.012, 0.012, 0.5, 0, 0.045, -0.2, mats.wood); box(0.02, 0.02, 0.06, 0, 0.045, -0.47, mats.steel);
        box(0.034, 0.1, 0.045, 0, -0.06, 0.08, mats.wood, 0.3); box(0.045, 0.08, 0.2, 0, -0.01, 0.28, mats.wood);
        M.muzzle.set(0, 0.045, -0.5); M.sightY = 0.08; M.ironY = 0.08; M.railY = 0.04; M.fore.set(0, -0.03, -0.2); M.grip.set(0, -0.06, 0.08);
        break;
      }
      case 'rocket': {
        cyl(0.062, 0.95, 0, 0.03, -0.15, poly); cyl(0.07, 0.06, 0, 0.03, -0.6, metal); cyl(0.07, 0.06, 0, 0.03, 0.3, metal);
        box(0.03, 0.1, 0.045, 0, -0.08, 0.0, poly, 0.3); box(0.03, 0.1, 0.045, 0, -0.08, -0.25, poly, 0.1);
        box(0.03, 0.05, 0.06, -0.075, 0.08, -0.1, metal);
        M.bolt = new THREE.Mesh(PG.cone, metal); M.bolt.scale.set(0.05, 0.12, 0.05); M.bolt.rotation.x = -Math.PI / 2; M.bolt.position.set(0, 0.03, -0.66); g.add(M.bolt);
        M.muzzle.set(0, 0.03, -0.7); M.sightY = 0.11; M.ironY = 0.11; M.railY = 0.1; M.fore.set(0, -0.06, -0.25); M.grip.set(0, -0.06, 0.0);
        break;
      }
      case 'gl': {
        cyl(0.03, 0.26, 0, 0.03, -0.25); const drum = cyl(0.07, 0.12, 0, 0.0, -0.03, metal); M.bolt = drum; drum.userData.spin = true;
        box(0.05, 0.06, 0.2, 0, 0.04, 0.05); box(0.034, 0.1, 0.045, 0, -0.08, 0.12, poly, 0.3); box(0.04, 0.07, 0.2, 0, 0.0, 0.3, poly);
        M.muzzle.set(0, 0.03, -0.39); M.sightY = 0.1; M.ironY = 0.1; M.railY = 0.075; M.fore.set(0, -0.06, -0.2); M.grip.set(0, -0.07, 0.12);
        break;
      }
      case 'flame': {
        box(0.05, 0.07, 0.3, 0, 0.02, 0); cyl(0.02, 0.36, 0, 0.03, -0.33, metal); cyl(0.03, 0.05, 0, 0.03, -0.52, mats.brass);
        M.mag = cyl(0.05, 0.3, 0, -0.07, -0.12, mats.tank);
        box(0.034, 0.1, 0.045, 0, -0.08, 0.12, poly, 0.3); box(0.04, 0.07, 0.2, 0, 0.0, 0.3, poly);
        M.muzzle.set(0, 0.03, -0.56); M.sightY = 0.09; M.ironY = 0.09; M.railY = 0.06; M.fore.set(0, -0.05, -0.28); M.grip.set(0, -0.06, 0.12);
        const pilot = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.flame, color: 0x7aaaff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        pilot.scale.setScalar(0.04); pilot.position.set(0, 0.0, -0.57); g.add(pilot); M.extra.push(pilot);
        break;
      }
      case 'rail': {
        box(0.07, 0.08, 0.5, 0, 0.02, -0.1); for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(PG.torus, mats.coil); r.scale.set(0.045, 0.045, 0.06); r.position.set(0, 0.02, -0.25 - i * 0.08); g.add(r); }
        box(0.02, 0.02, 0.5, 0.025, 0.02, -0.5, mats.railGlow); box(0.02, 0.02, 0.5, -0.025, 0.02, -0.5, mats.railGlow);
        box(0.034, 0.1, 0.045, 0, -0.08, 0.1, poly, 0.3); box(0.045, 0.09, 0.22, 0, 0.0, 0.3, poly);
        M.mag = box(0.04, 0.06, 0.08, 0, -0.06, -0.05, mats.railGlow);
        M.muzzle.set(0, 0.02, -0.78); M.sightY = 0.1; M.ironY = 0.1; M.railY = 0.065; M.fore.set(0, -0.04, -0.3); M.grip.set(0, -0.07, 0.1);
        break;
      }
      case 'nail': {
        box(0.06, 0.1, 0.28, 0, 0.02, 0); cyl(0.012, 0.18, 0, 0.03, -0.24); M.mag = cyl(0.05, 0.03, 0, 0.0, -0.05, metal); M.mag.rotation.set(0, 0, Math.PI / 2);
        box(0.034, 0.1, 0.045, 0, -0.08, 0.12, poly, 0.3); box(0.03, 0.03, 0.2, 0, 0.07, -0.05, metal);
        M.muzzle.set(0, 0.03, -0.34); M.sightY = 0.1; M.ironY = 0.1; M.railY = 0.085; M.fore.set(0, 0.07, -0.12); M.grip.set(0, -0.07, 0.12);
        break;
      }
      case 'harpoon': {
        cyl(0.03, 0.5, 0, 0.03, -0.2, metal); M.bolt = box(0.012, 0.012, 0.5, 0, 0.03, -0.42, mats.steel);
        const tip = new THREE.Mesh(PG.cone, mats.steel); tip.scale.set(0.025, 0.08, 0.025); tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0.03, -0.71); g.add(tip); M.extra.push(tip);
        box(0.034, 0.1, 0.045, 0, -0.07, 0.08, mats.wood, 0.3); box(0.045, 0.08, 0.24, 0, 0.0, 0.25, mats.wood);
        M.muzzle.set(0, 0.03, -0.7); M.sightY = 0.08; M.ironY = 0.08; M.railY = 0.06; M.fore.set(0, -0.03, -0.3); M.grip.set(0, -0.06, 0.08);
        break;
      }
      case 'tesla': {
        box(0.06, 0.08, 0.3, 0, 0.02, 0); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(PG.torus, mats.coil); r.scale.set(0.04, 0.04, 0.08); r.position.set(0, 0.03, -0.2 - i * 0.07); g.add(r); }
        cyl(0.012, 0.3, 0, 0.03, -0.3, mats.brass); const ball = new THREE.Mesh(PG.sph, mats.railGlow); ball.scale.setScalar(0.025); ball.position.set(0, 0.03, -0.46); g.add(ball);
        M.mag = cyl(0.03, 0.12, 0.05, 0.0, 0.02, mats.brass);
        box(0.034, 0.1, 0.045, 0, -0.08, 0.12, poly, 0.3); box(0.04, 0.07, 0.2, 0, 0.0, 0.3, poly);
        M.muzzle.set(0, 0.03, -0.48); M.sightY = 0.09; M.ironY = 0.09; M.railY = 0.065; M.fore.set(0, -0.05, -0.25); M.grip.set(0, -0.07, 0.12);
        break;
      }
    }
    if (isLeg) {
      const gBright = new THREE.MeshStandardMaterial({ color: 0xfff0a0, metalness: 0.5, roughness: 0.12, emissive: 0xb88214, emissiveIntensity: 0.72 });
      const gRoyal = new THREE.MeshStandardMaterial({ color: 0xffcf40, metalness: 0.46, roughness: 0.20, emissive: 0x7a4c08, emissiveIntensity: 0.52 });
      const cHex = def.id === 'y_maw' ? 0xe830ff : def.id === 'y_echo' ? 0x58f8ff : (def.id === 'y_storm' || def.trait === 'shock' || def.trait === 'chainHit') ? 0x50e4ff : (def.trait === 'incendiary' || def.trait === 'explosiveRounds' || def.trait === 'cluster') ? 0xff4014 : def.trait === 'lifesteal' ? 0xff1840 : def.id === 'c_sylv' ? 0x40ff88 : 0xff2818;
      const gCore = new THREE.MeshStandardMaterial({ color: cHex, metalness: 0.15, roughness: 0.08, emissive: cHex, emissiveIntensity: 2.1 });
      const crest = (x, y, z, sc) => {
        const bz = new THREE.Mesh(PG.oct, gBright); bz.scale.set(0.018 * sc, 0.008 * sc, 0.018 * sc); bz.rotation.z = Math.PI / 2; bz.position.set(x, y, z); g.add(bz);
        const gm = new THREE.Mesh(PG.oct3, gCore); gm.scale.set(0.010 * sc, 0.013 * sc, 0.013 * sc); gm.position.set(x, y, z); g.add(gm);
      };
      const fang = (x, y, z, r, len, rx, ry, rz, m) => { const c = new THREE.Mesh(PG.cone, m || gBright); c.scale.set(r, len, r); c.position.set(x, y, z); c.rotation.set(rx || 0, ry || 0, rz || 0); g.add(c); return c; };
      switch (def.arch) {
        case 'pistol': {
          box(0.036, 0.014, 0.18, 0, 0.014, -0.025, gBright);
          box(0.028, 0.024, 0.075, 0, 0.008, -0.105, gRoyal);
          for (const sx of [-1, 1]) {
            box(0.007, 0.012, 0.16, sx * 0.019, 0.034, -0.025, gBright, 0, sx * 0.06, 0);
            box(0.006, 0.010, 0.06, sx * 0.018, 0.010, -0.10, gCore);
            crest(sx * 0.017, -0.05, 0.045, 0.85);
          }
          break;
        }
        case 'revolver': {
          box(0.026, 0.032, 0.21, 0, 0.024, -0.13, gRoyal);
          box(0.018, 0.014, 0.22, 0, 0.060, -0.12, gBright);
          for (const sx of [-1, 1]) {
            box(0.008, 0.016, 0.19, sx * 0.016, 0.038, -0.13, gBright, 0, sx * 0.06, 0);
            box(0.006, 0.010, 0.15, sx * 0.016, 0.022, -0.13, gCore);
            crest(sx * 0.018, 0.03, 0.035, def.mythic ? 1.15 : 0.9);
          }
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(0.007, 0.054, Math.cos(a) * 0.028, 0.03 + Math.sin(a) * 0.028, 0, gBright, 8, M.bolt ? M.bolt.parent : g); }
          if (def.id === 'y_midas') {
            fang(0, 0.012, -0.25, 0.010, 0.055, -Math.PI / 2, 0, 0, gBright);
            for (const sx of [-1, 1]) for (const z of [-0.08, -0.15, -0.21]) box(0.010, 0.012, 0.018, sx * 0.018, 0.048, z, gBright, -0.35, 0, -sx * 0.35);
          }
          break;
        }
        case 'smg': {
          for (const sx of [-1, 1]) {
            box(0.012, 0.032, 0.28, sx * 0.028, 0.024, -0.08, gBright, 0, sx * 0.08, 0);
            box(0.14, 0.012, 0.036, sx * 0.075, 0.045, -0.04, gBright, 0.15, sx * 0.38, sx * 0.28);
            box(0.11, 0.008, 0.022, sx * 0.09, 0.052, -0.01, gCore, 0.18, sx * 0.45, sx * 0.32);
            box(0.008, 0.014, 0.18, sx * 0.030, 0.018, -0.14, gCore);
            crest(sx * 0.026, 0.018, 0.02, 1.05);
          }
          box(0.036, 0.028, 0.18, 0, -0.016, -0.21, gBright, 0.15, 0, 0);
          fang(0, 0.02, -0.37, 0.016, 0.08, -Math.PI / 2, 0, 0, gCore);
          fang(0, -0.01, -0.35, 0.012, 0.08, -Math.PI / 2, 0, 0, gBright);
          break;
        }
        case 'rifle': case 'burst': case 'dmr': {
          const long = def.arch === 'dmr';
          for (const sx of [-1, 1]) {
            box(0.014, 0.034, 0.38, sx * 0.030, 0.022, -0.12, gBright, 0, sx * 0.06, 0);
            box(0.012, 0.022, 0.30, sx * 0.036, 0.048, -0.10, gRoyal, 0.12, sx * 0.14, sx * 0.38);
            box(0.010, 0.016, 0.28, sx * 0.033, 0.018, -0.24, gCore);
            crest(sx * 0.030, 0.016, 0.02, 1.25);
          }
          box(0.038, 0.032, 0.24, 0, -0.022, -0.26, gRoyal, 0.14, 0, 0);
          box(0.050, 0.026, 0.22, 0, 0.022, 0.30, gBright, -0.08, 0, 0);
          box(0.048, 0.024, 0.20, 0, -0.022, 0.30, gRoyal);
          if (def.id === 'a_oath') {
            // Sword of the Oath: winged golden crossguard & broad luminous sword-bayonet beneath the barrel
            box(0.14, 0.018, 0.026, 0, -0.010, -0.38, gBright);
            box(0.010, 0.032, 0.32, 0, -0.018, -0.52, new THREE.MeshStandardMaterial({ color: 0xfff8e0, metalness: 0.45, roughness: 0.10, emissive: 0xffdf80, emissiveIntensity: 1.1 }));
            fang(0, -0.018, -0.71, 0.016, 0.09, -Math.PI / 2, 0, 0, gBright);
          } else if (def.id === 'b_tempest') {
            // Tempest: crackling storm-coils & swept thunder-fins
            for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(PG.torus, i % 2 ? gCore : gBright); r.scale.set(0.046, 0.046, 0.06); r.position.set(0, 0.020, -0.28 - i * 0.085); g.add(r); }
            for (const sx of [-1, 1]) box(0.18, 0.014, 0.034, sx * 0.09, 0.032, -0.26, gCore, 0, sx * 0.38, sx * 0.18);
          } else if (def.id === 'd_saint') {
            // Saint's Judgement: floating golden cathedral halo & seraph wings
            const halo = new THREE.Mesh(PG.torus, gBright); halo.scale.set(0.052, 0.052, 0.065); halo.position.set(0, 0.012, -0.28); g.add(halo);
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(PG.torus, i === 1 ? gCore : gBright); r.scale.set(0.032, 0.032, 0.05); r.position.set(0, 0.018, -0.42 - i * 0.11); g.add(r); }
            for (const sx of [-1, 1]) box(0.20, 0.016, 0.036, sx * 0.10, 0.034, -0.22, gBright, 0, sx * 0.34, sx * 0.22);
          } else if (def.id === 'y_echo') {
            // Mythic Aria of Echoes: twin cantilevered golden tuning-fork blades & spectral harmonic rings
            for (const sx of [-1, 1]) {
              box(0.014, 0.014, 0.46, sx * 0.024, 0.046, -0.44, gBright);
              box(0.010, 0.010, 0.40, sx * 0.020, 0.040, -0.46, gCore);
            }
            box(0.022, 0.014, 0.46, 0, -0.020, -0.44, gBright);
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(PG.torus, gCore); r.scale.set(0.044, 0.044, 0.055); r.position.set(0, 0.016, -0.34 - i * 0.12); g.add(r); }
          }
          break;
        }
        case 'sniper': {
          for (const sx of [-1, 1]) {
            box(0.014, 0.034, 0.46, sx * 0.032, 0.014, -0.14, gBright, 0, sx * 0.05, 0);
            box(0.012, 0.022, 0.34, sx * 0.038, 0.038, -0.12, gRoyal, 0.10, sx * 0.12, sx * 0.35);
            box(0.010, 0.016, 0.36, sx * 0.035, 0.014, -0.22, gCore);
            crest(sx * 0.034, 0.008, 0.0, 1.3);
          }
          box(0.042, 0.030, 0.28, 0, -0.028, -0.24, gRoyal, 0.12, 0, 0);
          box(0.052, 0.028, 0.24, 0, 0.020, 0.30, gBright, -0.08, 0, 0);
          for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(PG.torus, i % 2 ? gCore : gBright); r.scale.set(0.032, 0.032, 0.045); r.position.set(0, 0.025, -0.38 - i * 0.095); g.add(r); }
          if (def.id === 'y_storm') {
            for (const sx of [-1, 1]) {
              box(0.34, 0.020, 0.038, sx * 0.17, 0.022, -0.34, gBright, 0, sx * 0.32, sx * 0.14);
              box(0.26, 0.014, 0.024, sx * 0.26, 0.036, -0.28, gCore, 0, sx * 0.48, sx * 0.20);
              box(0.30, 0.007, 0.007, sx * 0.18, 0.025, -0.16, gCore, 0, -sx * 0.38, 0);
            }
          } else {
            for (const sx of [-1, 1]) fang(sx * 0.028, 0.025, -0.78, 0.014, 0.11, -Math.PI / 2, sx * 0.22, 0, gBright);
            fang(0, -0.005, -0.76, 0.014, 0.12, -Math.PI / 2, 0, 0, gCore);
          }
          break;
        }
        case 'shotgun': case 'autoshotgun': {
          for (const sx of [-1, 1]) {
            box(0.014, 0.034, 0.40, sx * 0.030, 0.024, -0.16, gBright, 0, sx * 0.05, 0);
            box(0.012, 0.022, 0.32, sx * 0.036, 0.046, -0.14, gRoyal, 0.12, sx * 0.14, sx * 0.36);
            box(0.010, 0.016, 0.30, sx * 0.033, 0.020, -0.22, gCore);
            crest(sx * 0.032, 0.018, 0.0, 1.25);
          }
          box(0.050, 0.026, 0.22, 0, 0.020, 0.28, gBright, -0.08, 0, 0);
          if (def.id === 'y_maw') {
            const ring = new THREE.Mesh(PG.torus, gCore); ring.scale.set(0.038, 0.038, 0.06); ring.position.set(0, 0.020, -0.56); g.add(ring);
            for (let i = 0; i < 6; i++) {
              const a = i / 6 * Math.PI * 2 + Math.PI / 6;
              fang(Math.cos(a) * 0.042, 0.022 + Math.sin(a) * 0.038, -0.62, 0.014, 0.12, -Math.PI / 2 + Math.sin(a) * 0.24, -Math.cos(a) * 0.24, 0, gBright);
            }
            for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) fang(sx * 0.028, 0.052, -0.10 - i * 0.11, 0.011, 0.052, -0.50, 0, -sx * 0.42, gCore);
          } else {
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(PG.torus, gCore); r.scale.set(0.036, 0.036, 0.055); r.position.set(0, 0.025, -0.34 - i * 0.095); g.add(r); }
            for (const sx of [-1, 1]) fang(sx * 0.026, 0.01, -0.62, 0.013, 0.10, -Math.PI / 2, sx * 0.12, 0, gBright);
          }
          break;
        }
        case 'lmg': {
          for (const sx of [-1, 1]) {
            box(0.016, 0.038, 0.42, sx * 0.038, 0.026, -0.18, gBright, 0, sx * 0.06, 0);
            box(0.012, 0.020, 0.32, sx * 0.042, 0.026, -0.24, gCore);
            box(0.24, 0.018, 0.038, sx * 0.12, 0.028, -0.44, gBright, 0, sx * 0.35, sx * 0.12);
            box(0.20, 0.012, 0.022, sx * 0.16, 0.038, -0.40, gCore, 0, sx * 0.45, sx * 0.18);
            crest(sx * 0.040, 0.02, 0.02, 1.35);
          }
          box(0.054, 0.028, 0.22, 0, 0.025, 0.32, gBright, -0.08, 0, 0);
          break;
        }
        case 'minigun': {
          for (const z of [-0.28, -0.14, 0.0]) {
            const c = new THREE.Mesh(PG.torus, gCore); c.scale.set(0.066, 0.066, 0.09); c.position.set(0, 0, z); (barrels || g).add(c);
          }
          const sh = new THREE.Mesh(PG.oct, gBright); sh.scale.set(0.086, 0.20, 0.086); sh.rotation.x = Math.PI / 2; sh.position.set(0, 0, 0.02); g.add(sh);
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            fang(Math.cos(a) * 0.078, Math.sin(a) * 0.078, -0.09, 0.015, 0.10, -Math.PI / 2, 0, 0, gBright);
          }
          break;
        }
        case 'crossbow': {
          for (const sx of [-1, 1]) {
            box(0.40, 0.024, 0.038, sx * 0.19, 0.026, -0.35, gBright, 0, sx * 0.28, sx * 0.10);
            box(0.32, 0.016, 0.026, sx * 0.24, 0.038, -0.29, gCore, 0, sx * 0.38, sx * 0.16);
            crest(sx * 0.026, 0.01, -0.08, 1.2);
          }
          box(0.022, 0.016, 0.54, 0, 0.034, -0.15, gCore);
          box(0.048, 0.024, 0.20, 0, 0.018, 0.28, gBright);
          break;
        }
        case 'rocket': {
          for (const z of [-0.52, -0.30, -0.05, 0.20]) {
            const r = new THREE.Mesh(PG.torus, z === -0.30 ? gCore : gBright); r.scale.set(0.076, 0.076, 0.09); r.position.set(0, 0.03, z); g.add(r);
          }
          for (let i = 0; i < 4; i++) {
            const a = i / 4 * Math.PI * 2 + Math.PI / 4;
            box(0.014, 0.052, 0.30, Math.cos(a) * 0.074, 0.03 + Math.sin(a) * 0.074, -0.42, gBright, 0, 0, -a);
          }
          if (M.bolt) M.bolt.material = gCore;
          break;
        }
        case 'gl': {
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            cyl(0.016, 0.13, Math.cos(a) * 0.060, Math.sin(a) * 0.060, -0.03, i % 2 ? gBright : gCore);
          }
          const cRing = new THREE.Mesh(PG.torus, gBright); cRing.scale.set(0.076, 0.076, 0.08); cRing.position.set(0, 0, -0.03); g.add(cRing);
          for (const z of [-0.22, -0.35]) { const r = new THREE.Mesh(PG.torus, z === -0.35 ? gCore : gBright); r.scale.set(0.042, 0.042, 0.06); r.position.set(0, 0.03, z); g.add(r); }
          for (const sx of [-1, 1]) {
            box(0.014, 0.032, 0.26, sx * 0.036, 0.032, -0.24, gBright);
            crest(sx * 0.030, 0.04, 0.06, 1.25);
          }
          box(0.046, 0.026, 0.18, 0, 0.020, 0.30, gBright, -0.08, 0, 0);
          break;
        }
        case 'flame': {
          for (const sx of [-1, 1]) {
            box(0.016, 0.044, 0.38, sx * 0.038, 0.034, -0.12, gBright, 0.15, sx * 0.16, sx * 0.28);
            box(0.012, 0.028, 0.30, sx * 0.048, 0.052, -0.08, gCore, 0.22, sx * 0.24, sx * 0.38);
          }
          for (const z of [-0.22, -0.12, -0.02]) {
            const r = new THREE.Mesh(PG.torus, z === -0.12 ? gCore : gBright); r.scale.set(0.056, 0.056, 0.08); r.position.set(0, -0.07, z); g.add(r);
          }
          fang(0, 0.056, -0.54, 0.018, 0.09, -Math.PI / 2 + 0.2, 0, 0, gBright);
          break;
        }
        case 'rail': case 'tesla': {
          for (const sx of [-1, 1]) {
            box(0.016, 0.034, 0.40, sx * 0.040, 0.026, -0.18, gBright, 0, sx * 0.08, 0);
            box(0.012, 0.020, 0.34, sx * 0.046, 0.042, -0.16, gRoyal, 0.12, sx * 0.14, sx * 0.35);
            box(0.010, 0.016, 0.34, sx * 0.044, 0.024, -0.22, gCore);
            crest(sx * 0.038, 0.02, 0.02, 1.25);
          }
          for (let i = 0; i < 4; i++) {
            const r = new THREE.Mesh(PG.torus, i % 2 ? gCore : gBright); r.scale.set(0.056, 0.056, 0.08); r.position.set(0, 0.025, -0.22 - i * 0.09); g.add(r);
          }
          break;
        }
      }
    }
    // ---- per-gun mount points: [y, z] of the rear of the body (stock), whether the gun has a stock of its own, half-width of the receiver,
    // barrel radius, and [y, z] of the under-barrel rail ----
    const MNT = {
      pistol: { fwd: true, rear: [0.03, 0.082], stock: false, rw: 0.017, br: 0.0095, under: [0.0, -0.088] },
      revolver: { rear: [0.03, 0.105], stock: false, rw: 0.017, br: 0.013, under: [0.02, -0.15] },
      smg: { rear: [0.0, 0.31], stock: true, rw: 0.024, br: 0.012, under: [-0.01, -0.2] },
      rifle: { rear: [0.0, 0.43], stock: true, rw: 0.026, br: 0.011, under: [-0.011, -0.28] },
      sniper: { rear: [0.0, 0.46], stock: true, rw: 0.026, br: 0.013, under: [-0.035, -0.2] },
      shotgun: { rear: [0.0, 0.41], stock: true, rw: 0.026, br: 0.017, under: [-0.025, -0.5] },
      lmg: { rear: [0.0, 0.45], stock: true, rw: 0.036, br: 0.014, under: [-0.015, -0.36] },
      minigun: { rear: [0.0, 0.37], stock: false, rw: 0.07, br: 0.011, under: [-0.07, 0.1] },
      crossbow: { rear: [0.0, 0.38], stock: true, rw: 0.02, br: 0.01, under: [-0.025, -0.25] },
      rocket: { rear: [0.03, 0.33], stock: false, rw: 0.062, br: 0.06, under: [-0.032, -0.45] },
      gl: { rear: [0.0, 0.4], stock: true, rw: 0.026, br: 0.03, under: [0.0, -0.25] },
      flame: { rear: [0.0, 0.4], stock: true, rw: 0.026, br: 0.02, under: [0.0, -0.38] },
      rail: { rear: [0.0, 0.41], stock: true, rw: 0.036, br: 0.02, under: [-0.02, -0.3] },
      nail: { rear: [0.02, 0.14], stock: false, rw: 0.03, br: 0.012, under: [-0.03, -0.1] },
      harpoon: { rear: [0.0, 0.37], stock: true, rw: 0.015, br: 0.03, under: [0.0, -0.3] },
      tesla: { rear: [0.0, 0.4], stock: true, rw: 0.03, br: 0.012, under: [-0.02, -0.1] },
    };
    MNT.burst = MNT.dmr = MNT.rifle; MNT.autoshotgun = MNT.shotgun;
    // ammo type -> the colour of the round showing in the port and of the band on the magazine
    const AMMO_COL = { a_hollow: 0xd8b070, a_ap: 0x4a90e0, a_fire: 0xff6a20, a_cryo: 0x7ad8ff, a_toxic: 0x70e040, a_shock: 0xf0e040, a_explo: 0xff3030, a_rico: 0xc0c0c8, a_silver: 0xeef2ff, a_slug: 0x9a6a3a, a_pierce: 0xa060e8, a_bleed: 0xc02030, a_vamp: 0x9020b0, a_tracer: 0xff8040, a_hunter: 0x88a850 };
    // ---- attachments ----
    const atop = (id) => G.ATT_BY_ID[id] && G.ATT_BY_ID[id].visual;
    if (atts.optic) {
      const v = atts.optic === '__defscope' ? 'scope' : atop(atts.optic);
      const z = M.opticZ, y = M.railY;
      if (v === 'reddot') {
        box(0.025, 0.012, 0.04, 0, y + 0.006, z, metal); box(0.003, 0.028, 0.004, -0.0125, y + 0.026, z - 0.015, metal); box(0.003, 0.028, 0.004, 0.0125, y + 0.026, z - 0.015, metal); box(0.026, 0.003, 0.004, 0, y + 0.0395, z - 0.015, metal); box(0.022, 0.022, 0.001, 0, y + 0.026, z - 0.015, mats.lens);
        const dot = new THREE.Mesh(PG.sph, mats.glow); dot.scale.setScalar(0.0012); dot.position.set(0, y + 0.026, z - 0.016); g.add(dot);
        M.sightY = y + 0.026; M.dotSight = true;
      } else if (v === 'holo') {
        box(0.03, 0.016, 0.06, 0, y + 0.008, z, metal);
        box(0.004, 0.03, 0.05, -0.016, y + 0.03, z, metal); box(0.004, 0.03, 0.05, 0.016, y + 0.03, z, metal); box(0.036, 0.004, 0.05, 0, y + 0.047, z, metal);
        box(0.028, 0.026, 0.002, 0, y + 0.03, z - 0.02, mats.lens);
        const dot = new THREE.Mesh(PG.torus, mats.glow); dot.scale.setScalar(0.003); dot.position.set(0, y + 0.03, z - 0.021); g.add(dot);
        M.sightY = y + 0.03; M.dotSight = true;
      } else if (v === 'scope' || v === 'scopeL') {
        // a real magnified scope: ring mounts, main tube, objective bell with a sun shade, ocular bell with a rubber eyecup,
        // magnification ring, elevation / windage turrets and a parallax knob. The rear lens shows the world magnified (picture in picture).
        const big = v === 'scopeL';
        M.scopeOptic = true; M.scopeKind = v; M.pip = true;
        const len = big ? 0.34 : 0.27, r = big ? 0.024 : 0.021, cy = y + 0.02 + r;
        // plain materials (no normal / colour maps): textures this close to the eye shimmer when the scope moves
        if (!W._scopeMats) W._scopeMats = { metal: new THREE.MeshStandardMaterial({ color: 0x25272b, metalness: 0.65, roughness: 0.42 }), ring: new THREE.MeshStandardMaterial({ color: 0x6c7078, metalness: 0.8, roughness: 0.32 }), rubber: new THREE.MeshStandardMaterial({ color: 0x121214, metalness: 0, roughness: 0.9 }) };
        const sm = W._scopeMats, ring = sm.ring, rubber = sm.rubber, tube = sm.metal;
        const vcyl = (rr, hh, px, py, pz, m, rz) => { const o = new THREE.Mesh(PG.cyl, m || tube); o.scale.set(rr, hh, rr); o.position.set(px, py, pz); if (rz) o.rotation.z = rz; g.add(o); return o; };
        for (const dz of [-len * 0.2, len * 0.2]) {
          box(0.034, 0.012, 0.1, 0, y + 0.006, z + dz, tube);                // base on the rail
          cyl(r * 1.22, 0.026, 0, cy, z + dz, ring);                           // ring
          for (const sx of [-1, 1]) box(0.006, 0.014, 0.014, sx * r * 1.3, cy - r * 0.55, z + dz, tube); // clamp bolts
        }
        cyl(r, len, 0, cy, z, tube);                                          // main tube
        cyl(r * 1.55, 0.08, 0, cy, z - len / 2 - 0.02, tube);                 // objective bell
        cyl(r * 1.64, 0.014, 0, cy, z - len / 2 - 0.066, ring);                // bell rim
        cyl(r * 1.5, 0.05, 0, cy, z - len / 2 - 0.1, rubber);                  // sun shade
        cyl(r * 1.42, 0.004, 0, cy, z - len / 2 - 0.058, new THREE.MeshStandardMaterial({ color: 0x10203a, metalness: 0.4, roughness: 0.04, emissive: 0x04101c })); // front glass
        cyl(r * 1.3, 0.052, 0, cy, z + len / 2 + 0.016, tube);                // ocular bell
        cyl(r * 1.45, 0.02, 0, cy, z + len / 2 + 0.048, rubber);               // eyecup
        cyl(r * 1.14, 0.05, 0, cy, z + len * 0.3, ring);                       // magnification ring ...
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; box(0.004, 0.004, 0.034, Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, z + len * 0.3, rubber, 0, 0, a); } // ... and its grip ribs
        vcyl(r * 0.62, 0.012, 0, cy + r + 0.004, z - len * 0.06, ring);        // elevation turret
        vcyl(r * 0.5, 0.022, 0, cy + r + 0.017, z - len * 0.06, tube);
        vcyl(r * 0.52, 0.006, 0, cy + r + 0.03, z - len * 0.06, rubber);
        vcyl(r * 0.6, 0.012, r + 0.004, cy, z - len * 0.06, ring, Math.PI / 2); // windage turret
        vcyl(r * 0.48, 0.022, r + 0.017, cy, z - len * 0.06, tube, Math.PI / 2);
        vcyl(r * 0.5, 0.012, -(r * 1.5) - 0.004, cy, z - len / 2 - 0.02, tube, Math.PI / 2); // parallax knob
        vcyl(r * 0.42, 0.02, -(r * 1.5) - 0.014, cy, z - len / 2 - 0.02, rubber, Math.PI / 2);
        // the lens sits clearly in front of the eyecup's end face (they used to share a plane and z-fought = flicker), and always wins the depth test
        const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 1.3, 48), W.pipMaterial());
        lens.position.set(0, cy, z + len / 2 + 0.066); lens.renderOrder = 5; g.add(lens);
        M.pipLens = lens; M.lensZ = lens.position.z; M.lensR = r * 1.3; M.sightY = cy;
      } else if (v === 'acog') {
        M.scopeOptic = true; M.scopeKind = v;
        const len = v === 'acog' ? 0.11 : v === 'scope' ? 0.2 : 0.28, r = v === 'acog' ? 0.017 : v === 'scope' ? 0.019 : 0.023;
        box(0.02, 0.018, 0.03, 0, y + 0.009, z - len * 0.25, metal); box(0.02, 0.018, 0.03, 0, y + 0.009, z + len * 0.25, metal);
        cyl(r, len, 0, y + 0.018 + r, z, metal);
        cyl(r * 1.3, 0.03, 0, y + 0.018 + r, z - len / 2, metal); cyl(r * 1.2, 0.03, 0, y + 0.018 + r, z + len / 2, metal);
        const ln = cyl(r * 1.1, 0.002, 0, y + 0.018 + r, z + len / 2 + 0.016, mats.lens);
        M.sightY = y + 0.018 + r;
      }
    }
    // barrel, muzzle, magazine, under-barrel, stock, trigger and ammo: each sits on the mount point of the gun it is fitted to (MNT), is built from its own
    // little parts and stays a few shades off the gun's finish so it reads as a separate piece
    const MP = MNT[def.arch] || MNT.rifle, bR = MP.br;
    const AM = W._attMats || (W._attMats = {
      steel2: new THREE.MeshStandardMaterial({ color: 0x7c8088, metalness: 0.75, roughness: 0.32 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.5, roughness: 0.5 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xd0a850, metalness: 1, roughness: 0.26 }),
      ceramic: new THREE.MeshStandardMaterial({ color: 0xe8e2d4, metalness: 0.1, roughness: 0.28 }),
      glows: {},
    });
    const glowM = (hex) => AM.glows[hex] || (AM.glows[hex] = new THREE.MeshBasicMaterial({ color: hex }));
    const vc = (r, h, x, y, z, m, parent) => { const o = new THREE.Mesh(PG.cyl, m || AM.steel2); o.scale.set(r, h, r); o.position.set(x, y, z); (parent || g).add(o); return o; };
    const rod = (a, b, r, m, parent) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length(), o = new THREE.Mesh(PG.cyl8, m || AM.steel2);
      o.scale.set(r, len, r); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); (parent || g).add(o); return o;
    };
    if (atts.barrel) {
      // the barrel parts sit behind the muzzle (over the barrel's exposed length); on a pistol the barrel ends inside the slide, so they go in front of it
      const id = atts.barrel, mz = M.muzzle, fwd = !!MP.fwd, kL = fwd ? 0.55 : 1, zz = (z) => (fwd ? -z : z);
      const sleeve = (rAdd, len, m, z0) => { len *= kL; cyl(bR + rAdd, len, mz.x, mz.y, mz.z + zz((z0 || 0) + len / 2), m); return len; };
      const ringAt = (rAdd, z, m, len) => cyl(bR + rAdd, len || 0.008, mz.x, mz.y, mz.z + zz(z * kL), m);
      let used = 0;
      if (id === 'b_long') { cyl(bR + 0.001, 0.14, mz.x, mz.y, mz.z - 0.07, AM.steel2); cyl(bR + 0.006, 0.016, mz.x, mz.y, mz.z, AM.dark); M.muzzle = V(mz.x, mz.y, mz.z - 0.14); }
      else if (id === 'b_short') { used = sleeve(0.012, 0.05, AM.dark, 0.01); ringAt(0.014, 0.012, AM.steel2, 0.006); }
      else if (id === 'b_heavy') { used = sleeve(0.011, 0.24, AM.dark); ringAt(0.013, 0.0, AM.steel2, 0.012); ringAt(0.013, 0.24, AM.steel2, 0.012); }
      else if (id === 'b_fluted') { const L = sleeve(0.009, 0.25, AM.steel2); used = L; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(0.0035, 0.0035, L * 0.8, mz.x + Math.cos(a) * (bR + 0.009), mz.y + Math.sin(a) * (bR + 0.009), mz.z + zz(L / 2), AM.dark, 0, 0, a); } }
      else if (id === 'b_match') { used = sleeve(0.006, 0.17, AM.dark); ringAt(0.009, 0.006, AM.gold, 0.014); ringAt(0.009, 0.17, AM.gold, 0.014); }
      else if (id === 'b_rifled') { used = sleeve(0.005, 0.2, AM.steel2); for (let i = 0; i < 6; i++) ringAt(0.007, 0.02 + i * 0.032, AM.dark, 0.007); }
      else if (id === 'b_master') { used = sleeve(0.008, 0.24, AM.gold); for (let i = 0; i < 3; i++) ringAt(0.0105, 0.04 + i * 0.07, glowM(0xb070ff), 0.009); ringAt(0.012, 0.0, AM.dark, 0.012); }
      else if (id === 'b_ceramic') { used = sleeve(0.009, 0.22, AM.ceramic); ringAt(0.011, 0.0, AM.dark, 0.01); ringAt(0.011, 0.22, AM.dark, 0.01); }
      else if (id === 'b_blast') { used = sleeve(0.012, 0.15, AM.dark); ringAt(0.015, 0.006, glowM(0xff8a2a), 0.012); ringAt(0.015, 0.145, AM.steel2, 0.012); }
      if (fwd && used) M.muzzle = V(mz.x, mz.y, mz.z - used);
    }
    if (atts.muzzle) {
      const id = atts.muzzle, v = atop(id), mz = M.muzzle, r0 = Math.max(0.017, bR + 0.006);
      if (v === 'supp' || v === 'supp2') {
        const r = Math.max(0.021, bR + 0.01), pur = v === 'supp2';
        cyl(r, 0.16, mz.x, mz.y, mz.z - 0.08, AM.dark); cyl(r * 1.08, 0.014, mz.x, mz.y, mz.z - 0.006, AM.steel2); cyl(r * 0.86, 0.012, mz.x, mz.y, mz.z - 0.16, AM.steel2);
        for (let i = 0; i < 3; i++) cyl(r * 1.04, 0.006, mz.x, mz.y, mz.z - 0.04 - i * 0.04, pur ? glowM(0xb070ff) : AM.steel2);
        M.muzzle = V(mz.x, mz.y, mz.z - 0.165); M.suppressed = true;
      } else if (v === 'comp') {
        cyl(r0, 0.055, mz.x, mz.y, mz.z - 0.027, AM.steel2); box(0.04, 0.007, 0.022, mz.x, mz.y + r0, mz.z - 0.03, AM.dark);
        for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) box(0.004, 0.012, 0.01, mz.x + sx * r0, mz.y + 0.004, mz.z - 0.02 - i * 0.02, AM.dark);
        M.muzzle = V(mz.x, mz.y, mz.z - 0.055);
      } else if (v === 'brake') {
        box(r0 * 2.3, r0 * 1.7, 0.07, mz.x, mz.y, mz.z - 0.035, AM.steel2);
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) box(0.004, r0 * 1.3, 0.008, mz.x + sx * r0 * 1.15, mz.y, mz.z - 0.015 - i * 0.017, AM.dark);
        for (let i = 0; i < 2; i++) box(r0 * 1.3, 0.004, 0.008, mz.x, mz.y + r0 * 0.85, mz.z - 0.02 - i * 0.03, AM.dark);
        M.muzzle = V(mz.x, mz.y, mz.z - 0.07);
      } else if (v === 'flash') {
        cyl(r0 * 0.95, 0.025, mz.x, mz.y, mz.z - 0.012, AM.steel2);
        for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; box(0.006, 0.006, 0.05, mz.x + Math.cos(a) * r0 * 0.9, mz.y + Math.sin(a) * r0 * 0.9, mz.z - 0.048, AM.dark, 0, 0, a); }
        cyl(r0 * 1.1, 0.006, mz.x, mz.y, mz.z - 0.075, AM.steel2);
        M.muzzle = V(mz.x, mz.y, mz.z - 0.075);
      } else if (v === 'amp') {
        cyl(r0, 0.03, mz.x, mz.y, mz.z - 0.015, AM.dark);
        const bell = new THREE.Mesh(PG.cone, AM.steel2); bell.scale.set(r0 * 2.1, 0.07, r0 * 2.1); bell.rotation.x = Math.PI / 2; bell.position.set(mz.x, mz.y, mz.z - 0.065); g.add(bell);
        cyl(r0 * 1.8, 0.008, mz.x, mz.y, mz.z - 0.034, glowM(0xff9a2a));
        M.muzzle = V(mz.x, mz.y, mz.z - 0.1);
      } else if (v === 'nozzle') {
        cyl(0.034, 0.05, mz.x, mz.y, mz.z - 0.025, AM.dark); cyl(0.044, 0.012, mz.x, mz.y, mz.z - 0.056, AM.steel2); cyl(0.04, 0.006, mz.x, mz.y, mz.z - 0.064, glowM(0xff7a20));
        M.muzzle = V(mz.x, mz.y, mz.z - 0.065);
      } else if (v === 'choke') {
        cyl(bR + 0.005, 0.05, mz.x, mz.y, mz.z - 0.025, AM.steel2); cyl(bR + 0.008, 0.008, mz.x, mz.y, mz.z - 0.046, AM.dark); cyl(bR + 0.008, 0.008, mz.x, mz.y, mz.z - 0.004, AM.dark);
        M.muzzle = V(mz.x, mz.y, mz.z - 0.05);
      } else if (v === 'bayonet') box(0.004, 0.02, 0.2, mz.x, mz.y - 0.03, mz.z - 0.05, mats.steel);
    }
    // ---- magazine: rebuilt as one group so every part travels with it in the reload animation ----
    const ammoCol = atts.ammo ? AMMO_COL[atts.ammo] : null;
    if ((atts.mag || ammoCol) && M.mag && M.mag.geometry === PG.box) {
      const mm = M.mag, bw = mm.scale.x, bh = mm.scale.y, bd = mm.scale.z, v = atts.mag ? atop(atts.mag) : null;
      const sg = new THREE.Group(); sg.position.copy(mm.position); sg.rotation.copy(mm.rotation); g.add(sg); mm.visible = false; M.mag = sg;
      const mb = (w, h, d, x, y, z, m) => box(w, h, d, x, y, z, m || metal, 0, 0, 0, sg);
      const dr = Math.min(0.065, Math.max(0.042, bd * 1.1));
      if (v === 'drum' || v === 'infdrum') {
        const inf = v === 'infdrum', cy = -bh * 0.5 - 0.012, rim = inf ? glowM(0xb070ff) : AM.steel2;
        mb(bw, bh * 1.0, bd, 0, 0, 0);
        vc(dr, 0.05, 0, cy, 0, metal, sg); vc(dr * 1.05, 0.008, 0, cy + 0.022, 0, rim, sg); vc(dr * 1.05, 0.008, 0, cy - 0.022, 0, rim, sg); vc(dr * 0.5, 0.006, 0, cy - 0.027, 0, AM.dark, sg);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; box(0.006, 0.04, 0.012, Math.cos(a) * dr, cy, Math.sin(a) * dr, AM.dark, 0, -a, 0, sg); }
      } else if (v === 'ext') {
        mb(bw, bh * 1.5, bd, 0, -bh * 0.25, 0); mb(bw * 1.16, 0.008, bd * 1.12, 0, -bh * 1.0 - 0.004, 0, AM.steel2);
        for (let i = 0; i < 3; i++) mb(bw * 1.04, 0.004, bd * 1.04, 0, -bh * 0.1 - i * bh * 0.28, 0, AM.dark);
      } else if (v === 'dual') {
        mb(bw, bh, bd, 0, 0, 0); mb(bw, bh, bd, bw * 1.12, 0, 0); mb(bw * 2.4, 0.012, bd * 1.08, bw * 0.56, bh * 0.2, 0, AM.dark); mb(bw * 2.4, 0.012, bd * 1.08, bw * 0.56, -bh * 0.2, 0, AM.dark);
        mb(bw * 1.15, 0.006, bd * 1.1, bw * 1.12, -bh * 0.5 - 0.003, 0, AM.steel2);
      } else if (v === 'belt') {
        mb(bw, bh, bd, 0, 0, 0); mb(bw * 2.4, bh * 0.45, bd * 1.2, -bw * 2.1, -bh * 0.15, 0, AM.dark); mb(bw * 2.5, 0.006, bd * 1.25, -bw * 2.1, bh * 0.08, 0, AM.steel2);
        for (let i = 0; i < 6; i++) { const t = i / 5; mb(0.012, 0.016, 0.02, -bw * 1.6 + t * (bw * 1.1), bh * 0.08 + t * bh * 0.45, 0, mats.brass); }
      } else if (v === 'quick') {
        mb(bw, bh, bd, 0, 0, 0); mb(bw * 1.1, bh * 0.14, bd * 1.1, 0, -bh * 0.3, 0, glowM(0xff8a2a)); mb(bw * 0.7, 0.03, 0.005, 0, -bh * 0.5 - 0.016, bd * 0.4, glowM(0xff8a2a)); mb(bw * 0.7, 0.006, bd * 0.9, 0, -bh * 0.5 - 0.003, 0, AM.steel2);
      } else { mb(bw, bh, bd, 0, 0, 0); mb(bw * 1.1, 0.006, bd * 1.1, 0, -bh * 0.5 - 0.003, 0, AM.steel2); }
      if (ammoCol) mb(bw * 1.08, 0.014, bd * 1.08, 0, bh * 0.34, 0, glowM(ammoCol));
    } else if (atts.mag && M.mag) {
      // round tanks and drums (shotgun, flamethrower, nail gun, tesla): fatter, banded
      const v = atop(atts.mag), mm = M.mag, k = v === 'tank' ? 1.3 : v === 'drum' || v === 'infdrum' ? 1.35 : 1.15;
      mm.scale.x *= k; mm.scale.z *= k;
      for (const s of [-0.28, 0.28, v === 'infdrum' ? 0 : 9]) {
        if (s === 9) continue;
        const rb = new THREE.Mesh(PG.cyl, s === 0 ? glowM(0xb070ff) : AM.steel2); rb.scale.set(mm.scale.x * 1.04, 0.008, mm.scale.z * 1.04); rb.position.copy(mm.position); rb.rotation.copy(mm.rotation); rb.translateY(s * mm.scale.y); g.add(rb);
      }
    } else if (atts.mag) {
      // guns without a magazine (revolver, crossbow, rocket, harpoon, grenade launcher): a pouch clipped to the side
      const v = atop(atts.mag), sx = -(MP.rw + 0.02), py = 0.005, pz = MP.rear[1] - 0.18;
      if (v === 'drum' || v === 'infdrum') { const cd = vc(0.04, 0.05, sx, py, pz, metal); cd.rotation.z = Math.PI / 2; }
      else box(0.026, v === 'ext' || v === 'dual' || v === 'belt' ? 0.075 : 0.055, 0.05, sx, py, pz, v === 'quick' ? glowM(0xff8a2a) : metal);
      box(0.012, 0.012, 0.03, sx + 0.016, py + 0.03, pz, AM.dark);
    }
    if (ammoCol) { const ej = M.ejector; box(0.007, 0.012, 0.022, Math.min(ej.x, MP.rw + 0.002), ej.y, ej.z, glowM(ammoCol)); }
    // ---- under-barrel ----
    if (atts.under) {
      const id = atts.under, v = atop(id), ux = 0, uy = MP.under[0], uz = MP.under[1];
      const mount = (len) => { box(0.03, 0.01, len, ux, uy - 0.004, uz, AM.dark); for (let i = 0; i < 3; i++) box(0.032, 0.012, 0.004, ux, uy - 0.006, uz - len / 2 + len * (i + 0.5) / 3, AM.steel2); };
      if (v === 'vgrip' || v === 'gyro') {
        mount(0.06); vc(0.016, 0.085, ux, uy - 0.05, uz, poly); vc(0.019, 0.012, ux, uy - 0.098, uz, AM.dark);
        for (let i = 0; i < 3; i++) vc(0.0175, 0.005, ux, uy - 0.03 - i * 0.02, uz, AM.dark);
        if (v === 'gyro') { const gd = vc(0.026, 0.014, ux, uy - 0.016, uz - 0.045, AM.steel2); gd.rotation.z = Math.PI / 2; const gr = vc(0.027, 0.006, ux, uy - 0.016, uz - 0.045, glowM(0x60b8ff)); gr.rotation.z = Math.PI / 2; }
        M.fore = V(ux, uy - 0.1, uz);
      } else if (v === 'handstop') {
        mount(0.07); box(0.03, 0.04, 0.012, ux, uy - 0.025, uz - 0.02, poly, -0.3); box(0.03, 0.012, 0.045, ux, uy - 0.044, uz - 0.005, poly);
      } else if (v === 'agrip') {
        mount(0.08); box(0.028, 0.05, 0.034, ux, uy - 0.03, uz - 0.01, poly, -0.55); box(0.03, 0.01, 0.04, ux, uy - 0.058, uz - 0.03, AM.dark, -0.55);
        M.fore = V(ux, uy - 0.06, uz - 0.02);
      } else if (v === 'laser') {
        mount(0.07); box(0.026, 0.03, 0.075, ux, uy - 0.02, uz - 0.004, AM.dark); cyl(0.011, 0.02, ux, uy - 0.02, uz - 0.045, AM.steel2);
        const l = new THREE.Mesh(PG.sph, mats.glow); l.scale.setScalar(0.0045); l.position.set(ux, uy - 0.02, uz - 0.056); g.add(l); M.laser = V(ux, uy - 0.02, uz - 0.058);
        box(0.007, 0.006, 0.012, 0.0, uy - 0.037, uz + 0.01, glowM(0x60e060));
      } else if (v === 'bipod') {
        mount(0.05); box(0.04, 0.014, 0.024, ux, uy - 0.014, uz, AM.dark);
        for (const sx of [-1, 1]) {
          const a = V(sx * 0.016, uy - 0.016, uz - 0.004), b = V(sx * 0.04, uy - 0.062, uz - 0.115);
          rod(a, b, 0.0036, AM.steel2); box(0.012, 0.006, 0.02, b.x, b.y - 0.003, b.z - 0.004, AM.dark);
        }
      }
    }
    // ---- stock: where the gun's own stock ends (or, on a pistol, behind the slide) ----
    const stockFrom = g.children.length;
    if (atts.stock) {
      const v = atop(atts.stock), ry = MP.rear[0], rz = MP.rear[1], has = MP.stock, rub = mats.poly;
      if (v === 'heavy' || v === 'tac' || v === 'cheek') {
        const L = has ? 0.07 : 0.22;
        box(0.044, has ? 0.092 : 0.055, L, 0, ry - 0.008, rz + L / 2 - 0.004, poly);
        if (!has) box(0.04, 0.09, 0.05, 0, ry - 0.045, rz + L - 0.02, poly, -0.25);
        box(0.05, 0.098, 0.024, 0, ry - 0.012, rz + L + 0.008, rub); box(0.052, 0.004, 0.026, 0, ry - 0.012 + 0.047, rz + L + 0.008, AM.dark);
        if (v === 'cheek') box(0.036, 0.022, has ? 0.12 : 0.15, 0, ry + 0.042, rz + (has ? 0.02 : 0.08), rub);
        if (v === 'tac') { box(0.008, 0.034, 0.024, 0.027, ry - 0.016, rz + 0.025, AM.dark); for (let i = 0; i < 4; i++) box(0.046, 0.003, 0.006, 0, ry + 0.034, rz + 0.012 + i * 0.012, AM.steel2); }
      } else {
        const L = has ? 0.14 : 0.24, rk = v === 'skel';
        rod(V(0, ry + 0.012, rz - 0.01), V(0, ry + 0.004, rz + L), 0.0055, AM.steel2);
        rod(V(0, ry - 0.028, rz - 0.01), V(0, ry - 0.046, rz + L), 0.0055, AM.steel2);
        if (rk) rod(V(0, ry + 0.012, rz + 0.01), V(0, ry - 0.046, rz + L * 0.78), 0.0035, AM.dark);
        box(0.04, 0.082, 0.012, 0, ry - 0.021, rz + L + 0.006, AM.steel2); box(0.042, 0.07, 0.006, 0, ry - 0.021, rz + L + 0.015, rub);
        box(0.014, 0.012, 0.04, 0, ry - 0.007, rz + 0.01, AM.dark);
      }
    }
    M.stockParts = g.children.slice(stockFrom); // the add-on stock reaches back past the eye on some guns: it is hidden while aiming down the sights
    // ---- trigger group ----
    if (atts.trigger) {
      const id = atts.trigger, tx = MP.rw + 0.004, ty = M.grip.y + 0.032, tz = M.grip.z - 0.052;
      if (id === 't_match') { box(0.007, 0.034, 0.011, 0, ty, tz, AM.gold); box(0.016, 0.004, 0.018, 0, ty - 0.017, tz - 0.003, AM.gold); box(0.004, 0.012, 0.012, tx, ty + 0.02, tz + 0.02, AM.gold); }
      else if (id === 't_hair') { box(0.004, 0.03, 0.007, 0, ty, tz, AM.steel2); box(0.005, 0.006, 0.009, 0, ty - 0.017, tz - 0.002, glowM(0xff5030)); }
      else if (id === 't_auto') { box(0.01, 0.034, 0.06, tx, ty + 0.03, tz + 0.04, AM.dark); box(0.012, 0.008, 0.02, tx + 0.003, ty + 0.034, tz + 0.03, AM.steel2); box(0.0045, 0.006, 0.006, tx + 0.006, ty + 0.045, tz + 0.058, glowM(0xff4030)); }
      else if (id === 't_bolt') { rod(V(tx - 0.002, ty + 0.05, tz + 0.04), V(tx + 0.038, ty + 0.056, tz + 0.04), 0.004, AM.steel2); const kn = new THREE.Mesh(PG.sph, AM.dark); kn.scale.setScalar(0.011); kn.position.set(tx + 0.042, ty + 0.057, tz + 0.04); g.add(kn); }
      else if (id === 't_crit') { box(0.008, 0.03, 0.04, tx, ty + 0.03, tz + 0.03, AM.dark); const gm = new THREE.Mesh(PG.sph, glowM(0xff3040)); gm.scale.set(0.006, 0.011, 0.009); gm.position.set(tx + 0.006, ty + 0.03, tz + 0.03); g.add(gm); box(0.0035, 0.004, 0.05, tx + 0.003, ty + 0.012, tz + 0.03, AM.gold); }
      else if (id === 't_charge') { cyl(0.011, 0.07, tx + 0.008, ty + 0.034, tz + 0.03, AM.dark); for (const s of [-0.02, 0.02]) cyl(0.0125, 0.007, tx + 0.008, ty + 0.034, tz + 0.03 + s, glowM(0x60c8ff)); }
      else if (id === 't_spin') { const mo = vc(0.018, 0.04, tx + 0.016, ty + 0.034, tz + 0.03, AM.dark); mo.rotation.z = Math.PI / 2; for (let i = 0; i < 4; i++) box(0.04, 0.003, 0.012, tx + 0.016, ty + 0.034, tz + 0.03, AM.steel2, i * Math.PI / 4); }
    }
    // ---- hands ----
    if (showHands !== false) {
      const hand = (p, right) => {
        const hg = new THREE.Group(); hg.position.copy(p);
        const palm = new THREE.Mesh(PG.box, mats.glove); palm.scale.set(0.05, 0.075, 0.075); hg.add(palm);
        const fing = new THREE.Mesh(PG.box, mats.glove); fing.scale.set(0.055, 0.035, 0.06); fing.position.set(right ? -0.022 : 0.022, 0.0, -0.01); hg.add(fing);
        const thumb = new THREE.Mesh(PG.box, mats.glove); thumb.scale.set(0.02, 0.02, 0.05); thumb.position.set(right ? 0.02 : -0.02, 0.035, -0.02); thumb.rotation.y = right ? -0.3 : 0.3; hg.add(thumb);
        const arm = new THREE.Mesh(PG.cyl8, mats.sleeve); arm.scale.set(0.038, 0.42, 0.038); arm.rotation.x = Math.PI / 2 - 0.35; arm.rotation.z = right ? 0.25 : -0.45; arm.position.set(right ? 0.06 : -0.08, -0.08, 0.2); hg.add(arm);
        const cuff = new THREE.Mesh(PG.cyl8, mats.glove); cuff.scale.set(0.034, 0.05, 0.034); cuff.rotation.x = Math.PI / 2 - 0.35; cuff.rotation.z = right ? 0.25 : -0.45; cuff.position.set(right ? 0.012 : -0.012, -0.015, 0.035); hg.add(cuff);
        g.add(hg);
        return hg;
      };
      M.rHand = hand(M.grip.clone().add(V(0.005, -0.01, 0.0)), true);
      M.lHand = hand(M.fore.clone().add(V(-0.01, -0.03, 0.0)), false);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    if (def.arch === 'pistol' || def.arch === 'revolver') { g.scale.setScalar(1.3); M.sightY *= 1.3; }
    M.group = g; M.barrels = barrels;
    return M;
  }
  W.buildGun = buildGun;
  // display model for shop / codex (no hands)
  W.displayModel = function (def, atts) { if (!mats) return new THREE.Group(); const m = buildGun(def, atts || {}, false); m.group.rotation.order = 'ZXY'; m.group.rotation.set(0.18, Math.PI * 0.56, 0.38); return m.group; };

  W.equip = function (immediate) {
    const w = P.weapon;
    if (P.meleeMode) { if (model) model.group.visible = false; W.melee.equip(immediate); return; }
    if (model) vmRoot.remove(model.group);
    model = buildGun(w.def, w.atts, true);
    vmRoot.add(model.group);
    if (W.melee) W.melee.show(false);
    W.switchT = immediate ? 0 : 0.35;
    W.adsT = 0;
    W.dirty = true;
    w.reloading = false;
    if (W.flameLoop) { W.flameLoop.stop(); W.flameLoop = null; }
    if (W.spinLoop) { W.spinLoop.stop(); W.spinLoop = null; }
    G.ui.refreshWeapon();
  };
  W.switchTo = function (i) {
    if (P.meleeMode && P.weapons[i]) { P.meleeMode = false; if (W.melee) W.melee.show(false); if (i === P.wIdx) { G.sfx.mech('switch'); W.equip(false); return; } }
    if (i === P.wIdx || !P.weapons[i]) return;
    const old = P.weapon; if (old) { old.reloading = false; old.charge = 0; old.spin = 0; old.burstQ = 0; }
    P.wIdx = i;
    G.sfx.mech('switch');
    W.equip(false);
  };
  W.adsZoom = function () { const s = W.curStats; if (!s) return 1; return 1 + (s.zoom - 1) * W.adsT; };
  W.reloadBlocksSprint = function () { const w = P.weapon; return !!(w && w.reloading && !P.has('m_sprintreload')); };

  // ---------------- update / firing ----------------
  const anim = { kick: 0, kickR: 0, swayX: 0, swayY: 0, reload: 0, melee: 0, throwT: 0, inspect: 0, flash: 0, spinA: 0 };
  W.anim = anim;
  W.update = function (dt) {
    G.ItemAnim.update(dt);
    if (W.dirty) { W.ver++; W.dirty = false; }
    const w = P.weapon; if (!w) return;
    const s = W.curStats = W.stats(w);
    const t = G.game.time;
    // switching: 1/2 = guns, 3 = melee, wheel cycles through everything (incl. a holstered 3rd gun)
    if (W.handleSwitch()) return;
    if (P.meleeMode) return W.updateMeleeMode(dt);
    if (W.switchT > 0) { W.switchT -= dt; }
    // ADS
    const wantAds = I.mouse[2] && !G.GrenHold.active() && W.switchT <= 0 && anim.melee <= 0 && !P.mantle;
    if (wantAds && P.sprinting) P.sprintToggle = false;
    const adsRate = 1 / Math.max(0.05, s.adsTime);
    W.adsT = U.clamp(W.adsT + (wantAds ? 1 : -1.4) * adsRate * dt, 0, 1);
    P.adsActive = W.adsT > 0.6;
    // bloom recovery
    w.bloom = Math.max(0, w.bloom - dt * 3.5);
    // reload
    if (I.hit('reload') && !w.reloading && w.mag < s.mag && !s.flame || I.hit('reload') && s.flame && !w.reloading && w.mag < s.mag) W.startReload(w, s);
    if (w.reloading) {
      w.reloadT -= dt;
      W.reloadSounds(w, s);
      if (w.reloadT <= 0) {
        w.reloading = false; w.mag = s.mag;
        G.buffs.emit('onReloadEnd', { weapon: w });
      }
    }
    // firing
    const busy = W.switchT > 0 || w.reloading || anim.melee > 0 || anim.throwT > 0 || P.mantle || P.pileState || G.ItemAnim.busy() || G.GrenHold.active() || G.abilities.wheelOpen();
    const trig = I.mouse[0], press = I.mpressed[0];
    if (press) W.trigBuf = 0.12; else W.trigBuf = Math.max(0, (W.trigBuf || 0) - dt);
    W.cool = Math.max(-0.05, (W.cool || 0) - dt);
    if ((trig || W.trigBuf > 0) && P.sprinting) { P.lastShotT = t; P.sprinting = false; }
    // minigun spin / rail charge
    if (s.spinup) {
      if (trig && !busy) { w.spin = Math.min(s.spinup, w.spin + dt); if (!W.spinLoop) W.spinLoop = G.sfx.loop('spin'); }
      else { w.spin = Math.max(0, w.spin - dt * 0.8); if (W.spinLoop && w.spin <= 0) { W.spinLoop.stop(); W.spinLoop = null; } }
      if (W.spinLoop) W.spinLoop.set(0.5 + w.spin / s.spinup, 200 + 400 * w.spin / s.spinup);
      anim.spinA += dt * 40 * (w.spin / s.spinup);
    }
    if (busy) { if (W.flameLoop) { W.flameLoop.stop(); W.flameLoop = null; } return W.animate(dt, s); }
    if (w.mag <= 0) {
      if (press) { G.sfx.mech('empty'); }
      if ((trig || press) && !w.reloading) W.startReload(w, s);
      if (W.flameLoop) { W.flameLoop.stop(); W.flameLoop = null; }
      return W.animate(dt, s);
    }
    const interval = 60 / s.rpm / (s.trait === 'rampUp' || w.def.trait === 'rampUp' ? 1 + Math.min(0.6, w.ramp) : 1);
    if (w.def.trait === 'rampUp') { if (trig) w.ramp += dt * 0.25; else w.ramp = Math.max(0, w.ramp - dt); }
    if (s.flame) {
      if (trig) { if (!W.flameLoop) W.flameLoop = G.sfx.loop('flame'); if (W.cool <= 0) { W.cool += interval; W.fireFlame(w, s); } }
      else if (W.flameLoop) { W.flameLoop.stop(); W.flameLoop = null; }
    } else if (s.charge) {
      if (trig) {
        w.charge += dt;
        if (Math.random() < 0.5) { const mp = W.muzzleWorld(); G.fx.add.spawn(mp.x, mp.y, mp.z, U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), 0.15, 0.05, 0.01, 0.6, 0.8, 1, 0.8, 0, 0); }
        if (w.charge >= s.charge && W.cool <= 0) { W.cool = interval; w.charge = 0; W.shoot(w, s); }
      } else w.charge = Math.max(0, w.charge - dt * 2);
    } else if (s.burst) {
      if ((press || W.trigBuf > 0) && w.burstQ <= 0 && W.cool <= 0) { w.burstQ = s.burst; W.trigBuf = 0; W.burstHits = 0; }
      if (w.burstQ > 0 && W.cool <= 0) { w.burstQ--; W.cool += interval; W.shoot(w, s); if (w.burstQ <= 0) W.cool += s.burstDelay; if (w.mag <= 0) w.burstQ = 0; }
    } else if (s.auto) {
      if (trig && W.cool <= 0 && (!s.spinup || w.spin >= s.spinup)) { W.cool += interval; W.shoot(w, s); }
    } else {
      if (W.trigBuf > 0 && W.cool <= 0) { W.trigBuf = 0; W.cool = interval; W.shoot(w, s); }
    }
    if (W.cool < 0 && !trig) W.cool = 0;
    W.animate(dt, s);
  };

  W.startReload = function (w, s) {
    if (w.reloading || w.mag >= s.mag) return;
    let dur = s.reload;
    if (w.mag === 0 && P.has('s_tactical')) dur *= 0.6;
    w.reloading = true; w.reloadT = dur; w.reloadDur = dur; w.reloadEvents = 0;
    w.burstQ = 0; w.charge = 0;
    G.buffs.emit('onReload', { weapon: w, empty: w.mag === 0 });
  };
  W.reloadSounds = function (w, s) {
    const k = 1 - w.reloadT / w.reloadDur;
    const seqs = {
      mag: [[0.15, 'magOut'], [0.6, 'magIn'], [0.85, 'boltFwd']],
      cyl: [[0.1, 'cylinder'], [0.45, 'shell'], [0.75, 'magIn'], [0.9, 'click']],
      bolt: [[0.12, 'boltBack'], [0.5, 'magIn'], [0.85, 'boltFwd']],
      shells: [[0.15, 'shell'], [0.35, 'shell'], [0.55, 'shell'], [0.75, 'shell'], [0.9, 'pump']],
      box: [[0.1, 'boltBack'], [0.3, 'magOut'], [0.65, 'magIn'], [0.9, 'boltFwd']],
      tube: [[0.2, 'magOut'], [0.7, 'magIn'], [0.9, 'click']],
      tank: [[0.15, 'magOut'], [0.6, 'cell'], [0.85, 'click']],
      cell: [[0.15, 'magOut'], [0.55, 'cell'], [0.85, 'click']],
    }[s.reloadSeq] || [];
    while (w.reloadEvents < seqs.length && k >= seqs[w.reloadEvents][0]) { G.sfx.mech(seqs[w.reloadEvents][1]); w.reloadEvents++; }
  };

  W.muzzleWorld = function () {
    if (!model) return G.camera.position.clone();
    // map viewmodel-camera space point into world via the main camera (same orientation)
    const p = model.muzzle.clone();
    model.group.updateMatrixWorld(true);
    const wp = model.group.localToWorld(p); // in vm camera space (vmCam at origin, identity)
    wp.z *= 0.9;
    return G.camera.localToWorld(wp);
  };

  const tmpO = V(), tmpDir = V();
  W.currentSpread = function (s) {
    const st = P.stats;
    const ads = W.adsT;
    let sp = U.lerp(s.spread * Math.max(0.2, 1 + st.hipSpread), s.adsSpread, ads);
    const mv = Math.min(1.5, P.speedH / 8);
    sp *= 1 + mv * 0.8 * (1 + (s.moveSpread || 0)) * (1 - ads * 0.6);
    if (!P.grounded) sp *= 1.6;
    if (P.crouching && P.grounded) sp *= 0.75;
    if (P.has('h_still') && P.speedH < 0.5) sp *= 0.7;
    sp += P.weapon.bloom * (1 - ads * 0.5);
    return sp;
  };
  W.shoot = function (w, s) {
    const st = P.stats, t = G.game.time;
    // ammo
    const save = st.infAmmo > 0 || Math.random() < s.ammoSave;
    if (!save) w.mag--;
    P.lastShotT = t;
    const o = G.camera.position.clone();
    const fwd = P.forward();
    const spreadDeg = W.currentSpread(s);
    const pellets = s.pellets || 1;
    const muzzle = W.muzzleWorld();
    const doubled = Math.random() < s.doubleShot;
    // 黄金律: load coins into the round
    if (w.def.trait === 'goldrush') { const run = G.game.run; if (run.coins >= 3) { run.coins -= 3; s = Object.assign({}, s, { dmg: s.dmg * 2.2, goldShot: true }); } }
    const sets = doubled ? 2 : 1;
    for (let k = 0; k < sets; k++) for (let i = 0; i < pellets; i++) {
      const dir = coneDir(fwd, THREE.MathUtils.degToRad(spreadDeg + (k ? 0.6 : 0)));
      if (s.proj) W.fireProjectile(w, s, muzzle, o, dir);
      else W.traceShot(w, s, o, dir, muzzle, pellets);
    }
    // feedback
    const silent = model && model.suppressed || w.def.trait === 'silent';
    if (s.proj) G.sfx.launcher(s.sound); else if (s.sound === 'tesla') { G.sfx.zap(null); G.sfx.gun('nail', { vol: 0.5 }); } else if (s.sound === 'rail') G.sfx.launcher('rail'); else G.sfx.gun(s.sound, { suppressed: silent, auto: s.auto || s.autoShot, id: w.def.id, trait: w.def.trait, rar: w.def.rarity });
    if (!silent) G.fx.flash(muzzle, 0xffb060, s.sound === 'shotgun' ? 45 : 25, 0.06, 10);
    anim.flash = silent ? 0.02 : 0.05;
    const crouchRec = P.crouching && P.grounded ? 1 - (s.crouchRecoil || 0) : 1;
    const rec = s.recoil * crouchRec * (1 - W.adsT * 0.35);
    P.addRecoil(THREE.MathUtils.degToRad(rec * 0.55) * (0.8 + Math.random() * 0.4), THREE.MathUtils.degToRad(rec * 0.22) * (Math.random() - 0.5));
    anim.kick = Math.min(1.4, anim.kick + 0.35 + rec * 0.08);
    anim.kickR = (Math.random() - 0.5) * rec * 0.02;
    w.bloom = Math.min(6, w.bloom + rec * 0.12);
    P.addShake(Math.min(0.12, rec * 0.012));
    // shell ejection
    if (!s.proj && !s.flame && s.sound !== 'tesla' && s.sound !== 'rail' && s.sound !== 'revolver' && Math.random() < 0.8) {
      const ej = G.camera.localToWorld(V(0.18, -0.12, -0.35));
      G.fx.debris(ej, G.world.mats.brass, 1, 0.025, 2.5);
    }
    G.buffs.emit('onShoot', { weapon: w });
    // 残響: every 4th shot, phantom rounds chase nearby foes
    if (w.def.trait === 'echo') {
      w.echoN = (w.echoN || 0) + 1;
      if (w.echoN % 4 === 0) {
        const tg = G.enemies.list.filter((e) => e.alive && !e.ally && e.centerPos().distanceTo(o) < 40).sort((a, b) => a.centerPos().distanceTo(o) - b.centerPos().distanceTo(o)).slice(0, 3);
        for (const e of tg) { G.fx.tracer(muzzle, e.centerPos(), 0xb0d8ff, 0.03, 0.25); G.combat.damageEnemy(e, s.dmg * 0.9, { src: 'bullet', weapon: w, proc: true, noMarker: true }); }
      }
    }
  };
  function coneDir(fwd, ang) {
    if (ang <= 0) return fwd.clone();
    const r = Math.sqrt(Math.random()) * Math.tan(ang * 0.5);
    const th = Math.random() * Math.PI * 2;
    const up = Math.abs(fwd.y) > 0.99 ? V(1, 0, 0) : V(0, 1, 0);
    const right = V().crossVectors(fwd, up).normalize();
    const u2 = V().crossVectors(right, fwd).normalize();
    return fwd.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(u2, Math.sin(th) * r).normalize();
  }
  W.coneDir = coneDir;

  W.traceShot = function (w, s, o, dir, muzzle, pellets, depth, exclude) {
    depth = depth || 0;
    const maxD = 300;
    const wh = G.world.raycast(o, dir, maxD);
    const limit = wh ? wh.t : maxD;
    const hits = G.enemies.raycastAll(o, dir, limit, exclude);
    let pierce = s.pierce || 0;
    let end = wh ? wh.point : o.clone().addScaledVector(dir, maxD);
    let stopped = false;
    const pmul = pellets > 1 ? 1 : 1;
    for (const h of hits) {
      const hp = o.clone().addScaledVector(dir, h.t);
      const dist = h.t;
      let fall = dist > s.range ? Math.max(0.45, 1 - (dist - s.range) / s.range * 0.55) : 1;
      // distance falloff: full damage up close, fading towards the weapon's range (long-range arms such as snipers / marksman rifles keep full damage)
      const FP = W.FALLOFF[w.def.arch];
      if (FP) fall = Math.min(fall, 1 - (1 - FP[1]) * U.clamp((dist / s.range - FP[0]) / (1 - FP[0]), 0, 1));
      const info = {
        src: 'bullet', head: h.part === 'head', part: h.part, headMul: s.headMul, weapon: w, dir: dir.clone(), pos: hp,
        elem: s.elem, elemChance: s.elemChance, shieldMul: s.shieldMul, critBonus: s.critChance, eliteBonus: s.eliteDmg || 0,
        knock: (s.trait === 'knockback' || w.def.trait === 'knockback' ? 8 : 0) + (P.stats.knock ? 3 : 0) + (pellets > 1 ? 0.6 : 0.3),
        lowHit: hp.y < h.e.pos.y + h.e.height * 0.35, lifesteal: s.lifesteal || 0,
      };
      if (w.def.trait === 'execute' && !h.e.boss && h.e.hp < h.e.maxHp * 0.2) info.forceExecute = true;
      let dmg = s.dmg * fall * pmul;
      if (info.forceExecute) dmg = h.e.hp + h.e.shield + 1;
      if (P.temps.has('cloak') && !W._cloakUsed) { info.forceCrit = true; info.cloakMul = W._cloakMul; W._cloakUsed = true; G.combat.untemp('cloak'); }
      G.combat.damageEnemy(h.e, dmg, info);
      if (s.explo || w.def.trait === 'explosiveRounds') G.combat.explode(hp, 1.6, s.dmg * 0.6 * fall, { src: 'explosion', small: true, proc: true });
      if (w.def.trait === 'chainHit' && Math.random() < 0.5) { G.combat.chain(h.e, 2, s.dmg * 0.5, 9, { src: 'bullet', proc: true }); G.fx.strike(h.e.centerPos()); }
      if (s.chain) { G.combat.chain(h.e, s.chain, s.dmg * 0.6, 8, { src: 'bullet', proc: true, elem: 'shock', elemChance: 0.3 }); if (Math.random() < 0.35) G.fx.strike(h.e.centerPos()); }
      if (w.def.trait === 'shock' && Math.random() < 0.2) G.fx.strike(h.e.centerPos());
      if (w.def.trait === 'headhunter' && info.head) G.combat.refillN(2);
      if (w.def.trait === 'voidmaw' && h.e.alive && !h.e.boss) { const to = P.pos.clone().sub(h.e.pos).setY(0); if (to.lengthSq() > 4) h.e.knockback(to.normalize(), 3.5); G.combat.status(h.e, 'mark', 3); }
      if (w.def.trait === 'stormcall' && info.head) { G.fx.strike(hp, 0xd0e0ff, true); G.combat.chain(h.e, 5, s.dmg * 1.2, 14, { src: 'bullet', proc: true }); G.sfx.zap(hp); }
      if (w.def.pull || s.pull) { /* projectile only */ }
      // ricochet to another enemy
      if (depth < 2 && (Math.random() < s.ricochet || P.temps.has('ricostorm'))) {
        const t2 = G.enemies.nearest(hp, 16, h.e);
        if (t2) {
          const d2 = t2.centerPos().sub(hp).normalize();
          const ex = new Set(exclude || []); ex.add(h.e);
          G.fx.tracer(hp, t2.centerPos(), 0xffe0a0, 0.02, 0.08);
          W.traceShot(w, Object.assign({}, s, { pierce: 0, dmg: s.dmg * (P.temps.has('ricostorm') ? (W._ricoMul || 1) : 1) }), hp.clone().addScaledVector(d2, 0.2), d2, hp, 1, depth + 1, ex);
          G.sfx.ricochet(hp);
        }
      }
      end = hp;
      if (pierce-- <= 0) { stopped = true; break; }
    }
    // tracer
    if (muzzle && (pellets <= 1 || Math.random() < 0.35)) {
      const col = s.goldShot ? 0xffd040 : s.elem === 'fire' ? 0xffa060 : s.elem === 'frost' ? 0xbfe8ff : s.elem === 'shock' || s.sound === 'tesla' ? 0xe0e8ff : s.elem === 'poison' ? 0xb0e070 : 0xffd8a0;
      if (s.sound === 'tesla') G.fx.lightning(muzzle, end, 0xd8e4ff);
      else if (s.sound === 'rail') { G.fx.beam(muzzle, end, 0xa0c8ff, 0.06, 0.4); G.fx.beam(muzzle, end, 0xffffff, 0.02, 0.25); }
      else G.fx.tracer(muzzle, end, col, pellets > 1 ? 0.012 : 0.02, 0.05);
    }
    if (!stopped && wh) {
      const surf = wh.c.surf;
      if (wh.c.dest) G.combat.damageDestructible(wh.c.dest, s.dmg, wh.point);
      if (G.bosses.active && G.bosses.active.onWorldHit) G.bosses.active.onWorldHit(wh);
      if (surf === 'metal') { G.fx.sparks(wh.point, wh.normal, 8, 0xffd090, 6); }
      else if (surf === 'wood') { G.fx.dust(wh.point, wh.normal, 0x6a4a30, 3); }
      else { G.fx.dust(wh.point, wh.normal, 0x8a8070, 3); if (Math.random() < 0.5) G.fx.sparks(wh.point, wh.normal, 3, 0xffc080, 4); }
      G.fx.decal(wh.point, wh.normal, 'hole', s.sound === 'shotgun' ? 0.08 : 0.12);
      if (Math.random() < 0.5 || pellets === 1) G.sfx.impact(wh.point, surf);
      if (depth < 1 && P.has('o_ricochetwall') && Math.random() < 0.3) {
        const t2 = G.enemies.nearest(wh.point, 18);
        if (t2 && G.world.los(wh.point.clone().addScaledVector(wh.normal, 0.1), t2.centerPos())) {
          const d2 = t2.centerPos().sub(wh.point).normalize();
          G.fx.tracer(wh.point, t2.centerPos(), 0xffe0a0, 0.02, 0.08);
          W.traceShot(w, Object.assign({}, s, { pierce: 0 }), wh.point.clone().addScaledVector(wh.normal, 0.1), d2, null, 1, depth + 1);
          G.sfx.ricochet(wh.point);
        }
      }
    }
  };

  W.fireProjectile = function (w, s, muzzle, o, dir) {
    const pj = s.proj;
    // aim correction: aim the projectile from the muzzle toward the crosshair target point
    const wh = G.world.raycast(o, dir, 200);
    const target = wh ? wh.point : o.clone().addScaledVector(dir, 200);
    const d = target.clone().sub(muzzle).normalize();
    if (wh && wh.t < 2) d.copy(dir);
    const speed = pj.speed * (1 + (P.stats.projSpeed || 0));
    const base = {
      kind: pj.kind, pos: muzzle.clone(), vel: d.multiplyScalar(speed), grav: pj.grav, owner: 'player', dmg: s.dmg, radius: pj.kind === 'rocket' ? 0.25 : 0.12, weapon: w,
      headMul: s.headMul, pierce: s.pierce || 0, life: 6,
      info: { src: 'bullet', weapon: w, elem: s.elem, elemChance: s.elemChance, shieldMul: s.shieldMul, critBonus: s.critChance, headMul: s.headMul },
    };
    if (pj.explode) { base.explode = pj.explode; base.info = { src: 'explosion', weapon: w, elem: s.elem, elemChance: s.elemChance, shieldMul: s.shieldMul }; if (w.def.trait === 'cluster') base.cluster = 4; }
    if (pj.fuse) { base.fuse = pj.fuse; base.bounce = !!pj.bounce; }
    if (w.def.trait === 'homing') { base.homing = 5; }
    if (pj.kind === 'grenade') base.onHitEnemyExplode = true;
    if (s.pull || w.def.pull) {
      base.onHitEnemy = (e) => { if (!e.boss) { const toMe = P.pos.clone().sub(e.pos).setY(0); e.knockback(toMe.normalize(), Math.min(22, toMe.length() * 2.2)); G.combat.stun(e, 0.8); } G.sfx.chain(0.4, 0.4); };
    }
    const p = G.combat.spawnProjectile(base);
    // GL rounds explode on enemy contact
    if (pj.kind === 'grenade') { p.onHitEnemy = null; }
  };

  // flamethrower: cone damage tick
  W.fireFlame = function (w, s) {
    if (!(P.stats.infAmmo > 0) && Math.random() >= s.ammoSave) w.mag--;
    P.lastShotT = G.game.time;
    const o = G.camera.position.clone(), f = P.forward();
    const mz = W.muzzleWorld();
    for (let i = 0; i < 3; i++) {
      const d = coneDir(f, THREE.MathUtils.degToRad(s.spread * 1.2));
      const sp = U.rand(10, 15);
      G.fx.flame.spawn(mz.x, mz.y, mz.z, d.x * sp + P.vel.x * 0.5, d.y * sp + 0.5, d.z * sp + P.vel.z * 0.5, s.range / sp * U.rand(0.7, 1.1), 0.12, 1.4, 1.5, 1.0, 0.5, 0.9, -1.5, 1.2, 1.2, 0.35, 0.1);
    }
    if (Math.random() < 0.3) G.fx.norm.spawn(mz.x + f.x * s.range * 0.8, mz.y + 0.5, mz.z + f.z * s.range * 0.8, 0, 1, 0, 1.5, 0.6, 2, 0.15, 0.14, 0.13, 0.4, -0.3, 1);
    const wh = G.world.raycast(o, f, s.range);
    const reach = wh ? wh.t : s.range;
    for (const e of G.enemies.inRadius(o, reach + 1.5)) {
      const to = e.centerPos().sub(o); const dist = to.length(); to.divideScalar(dist);
      if (to.dot(f) < 0.88 - (1 - dist / reach) * 0.15) continue;
      G.combat.damageEnemy(e, s.dmg, { src: 'bullet', weapon: w, elem: 'fire', elemChance: 0.5, noMarker: Math.random() < 0.7, shieldMul: s.shieldMul * 1.2 });
    }
    for (const d of G.world.destructibles) if (d.alive && d.pos.distanceTo(o) < reach) { const to = d.pos.clone().sub(o).normalize(); if (to.dot(f) > 0.85) G.combat.damageDestructible(d, s.dmg, d.pos); }
    if (wh && Math.random() < 0.2) G.fx.decal(wh.point, wh.normal, 'scorch', 0.6);
    P.addRecoil(0.0004, (Math.random() - 0.5) * 0.0008);
    anim.kick = Math.min(0.4, anim.kick + 0.05);
    G.buffs.emit('onShoot', { weapon: w });
  };

  // melee weapon logic lives in melee.js (slot 3)

  // ---------------- viewmodel animation ----------------
  const hipPos = V(0.15, -0.15, -0.46);
  W.animate = function (dt, s) {
    if (!model) return;
    const g = model.group;
    const ads = easeInOut(W.adsT);
    // sway from mouse
    anim.swayX = U.damp(anim.swayX, U.clamp(-I.mx * 0.0006, -0.05, 0.05), 10, dt);
    anim.swayY = U.damp(anim.swayY, U.clamp(I.my * 0.0006, -0.05, 0.05), 10, dt);
    anim.kick = U.damp(anim.kick, 0, 14, dt);
    const sightY = model.sightY;
    const adsPos = V(0, -sightY - (model.dotSight || model.scopeOptic ? 0 : 0.012), model.pip ? -(model.lensR || 0.028) * 2.32 - model.lensZ : -0.44);
    const p = hipPos.clone().lerp(adsPos, ads);
    let rx = 0, ry = 0, rz = 0;
    // bob
    const bobK = P.bobAmt * (1 - ads * 0.85);
    p.x += Math.cos(P.bobPhase) * 0.012 * bobK;
    p.y += -Math.abs(Math.sin(P.bobPhase)) * 0.014 * bobK;
    // idle breathing
    const tt = G.game.time;
    p.y += Math.sin(tt * 1.6) * 0.002 * (1 - ads * 0.8);
    // sway
    p.x += anim.swayX * (1 - ads * 0.7); p.y += anim.swayY * (1 - ads * 0.7);
    ry += anim.swayX * 2 * (1 - ads * 0.7);
    // sprint pose
    const spr = W._spr = U.damp(W._spr || 0, P.sprinting ? 1 : 0, 10, dt);
    p.x += 0.04 * spr; p.y -= 0.05 * spr; rx -= 0.25 * spr; ry += 0.6 * spr; rz += 0.15 * spr;
    // slide / air
    const sl = W._sl = U.damp(W._sl || 0, P.sliding ? 1 : 0, 10, dt);
    rz += 0.35 * sl; p.y -= 0.02 * sl;
    p.y += P.landDip * 0.15 + P.eyeOff * 0.1;
    const air = W._air = U.damp(W._air || 0, P.grounded ? 0 : U.clamp(P.vel.y * 0.01, -0.03, 0.03), 8, dt);
    p.y -= air;
    // recoil
    p.z += anim.kick * 0.045 * (1 - ads * 0.4);
    rx += anim.kick * 0.09 * (1 - ads * 0.5);
    rz += anim.kickR * anim.kick;
    // reload
    const w = P.weapon;
    let rl = 0;
    if (w.reloading) { const k = 1 - w.reloadT / w.reloadDur; rl = Math.sin(Math.min(1, k) * Math.PI); }
    W._rl = U.damp(W._rl || 0, rl, 12, dt);
    p.y -= 0.06 * W._rl; rx += 0.35 * W._rl; rz += 0.5 * W._rl;
    if (model.mag) {
      if (!model.magBase) model.magBase = model.mag.position.clone();
      const k = w.reloading ? 1 - w.reloadT / w.reloadDur : 1;
      const off = w.reloading && k > 0.12 && k < 0.62 ? (k < 0.3 ? (k - 0.12) / 0.18 : k > 0.5 ? (0.62 - k) / 0.12 : 1) : 0;
      model.mag.position.set(model.magBase.x, model.magBase.y - off * 0.25, model.magBase.z + off * 0.05);
      model.mag.visible = off < 0.95;
      if (model.lHand) model.lHand.position.y = (model.lHandBaseY ??= model.lHand.position.y) - off * 0.2;
    }
    if (model.bolt) {
      if (model.bolt.userData.spin) model.bolt.rotation.y += anim.kick * dt * 20;
      else { if (!model.boltBase) model.boltBase = model.bolt.position.clone(); model.bolt.position.z = model.boltBase.z + anim.kick * 0.025; }
    }
    if (model.barrels) model.barrels.rotation.z = anim.spinA;
    // switch
    if (W.switchT > 0) { const k = W.switchT / 0.35; p.y -= 0.25 * k; rx -= 0.6 * k; }
    // melee
    if (anim.melee > 0) { const k = Math.sin((1 - anim.melee / 0.42) * Math.PI); p.z -= 0.12 * k; p.x -= 0.08 * k; ry += 0.5 * k; rz -= 0.4 * k; }
    // item in use: weapon dips out of the way
    if (G.ItemAnim.lower > 0.001) { const k = G.ItemAnim.lower; p.y -= 0.34 * k; p.x += 0.06 * k; rx -= 0.6 * k; }
    // grenade throw
    if (anim.throwT > 0) { anim.throwT -= dt; const k = Math.sin(Math.min(1, anim.throwT / 0.4) * Math.PI); p.y -= 0.2 * k; rx -= 0.4 * k; }
    // grapple: gun tilts aside
    const gpl = W._gp = U.damp(W._gp || 0, P.grapple.state === 'attached' || P.grapple.state === 'firing' ? 1 : 0, 10, dt);
    p.x += 0.03 * gpl; rz -= 0.25 * gpl;
    g.position.copy(p);
    g.rotation.set(rx, ry, rz);
    // muzzle flash
    if (anim.flash > 0) {
      anim.flash -= dt;
      g.updateMatrixWorld(true);
      const mp = g.localToWorld(model.muzzle.clone());
      flashSprite.position.copy(mp); flashSprite2.position.copy(mp);
      flashSprite.material.rotation = Math.random() * 6.28;
      const sz = (s.sound === 'shotgun' ? 0.22 : s.sound === 'smg' || s.sound === 'pistol' ? 0.12 : 0.16) * (1 - W.adsT * 0.6);
      flashSprite.scale.setScalar(sz * (0.8 + Math.random() * 0.4)); flashSprite2.scale.setScalar(sz * 1.8);
      flashSprite.visible = flashSprite2.visible = true;
      vmLight.position.copy(mp); vmLight.intensity = 6;
    } else { flashSprite.visible = flashSprite2.visible = false; vmLight.intensity = 0; }
    if (model.stockParts && model.stockParts.length) { const sv = W.adsT < 0.35; for (const o of model.stockParts) o.visible = sv; }
    // scope overlay
    const scoped = !!model.scopeOptic && !model.pip && W.adsT > 0.9;
    const lensOn = !!model.pip && W.adsT > 0.5;
    W.isScoped = scoped || lensOn;
    W.dotAds = !!model.dotSight && W.adsT > 0.6;
    vmRoot.visible = !scoped && G.game.state !== 'dead' && G.avatar.tpK < (G.avatar.returning ? 0.55 : 0.3);
    G.ui.scope(scoped, model.scopeKind);
    if (pip) { pip.on = lensOn && vmRoot.visible; pip.mat.uniforms.uLive.value = pip.on ? 1 : 0; }
  };
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  W.render = function (renderer) {
    if (!vmScene) return;
    if (pip && pip.on) {
      const sz = renderer.getDrawingBufferSize(pip.v2), size = Math.max(64, Math.min(512, sz.x | 0, sz.y | 0));
      if (!pip.tex || pip.size !== size) {
        if (pip.tex) pip.tex.dispose();
        pip.tex = new THREE.FramebufferTexture(size, size); pip.tex.minFilter = pip.tex.magFilter = THREE.LinearFilter; pip.size = size;
        pip.mat.uniforms.tMap.value = pip.tex;
      }
      renderer.copyFramebufferToTexture(pip.v2b.set(Math.floor((sz.x - size) / 2), Math.floor((sz.y - size) / 2)), pip.tex);
      // what part of the frame the lens shows: it must end up s.zoom times the hip-fire scale, and the screen is already zoomed by camZoom
      const s = W.curStats, zc = Math.max(1, (P.baseV || 60) / Math.max(1, G.camera.fov)), zl = Math.max(1, (s ? s.zoom : 4) / zc);
      pip.mat.uniforms.uCrop.value = Math.min(1, Math.max(0.04, (LENS_Q / zl) * sz.y / size));
    }
    vmCam.fov = 58 - W.adsT * 8;
    vmCam.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(vmScene, vmCam);
  };
  W.setLightLevel = function (k) { if (W.vmKey) W.vmKey.intensity = 1.2 * k; };
  W.hidden = function (h) { if (vmRoot) vmRoot.visible = !h; };
})();
