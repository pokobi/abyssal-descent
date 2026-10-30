'use strict';
// Melee weapon slot (key 3): viewmodels, light combo (LMB), heavy blow (RMB), hit detection and special traits.
(function () {
  const W = G.weapons, U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, mm = null; // current melee viewmodel {group, r, l, tip, def}
  const ms = { ph: 'idle', t: 0, dur: 0, hitAt: 0, hitDone: false, side: 1, combo: 0, lungeT: 0 };
  W.ms = ms;

  W.makeMelee = function (id) { if (id !== 'fists') G.save.mark('items', id); return { id, def: G.MELEE_BY_ID[id], lv: 0 }; };
  W.meleeStats = function (m) {
    const d = m.def, st = G.player.stats;
    const s = Object.assign({}, d);
    s.swing = d.swing * (1 - Math.min(0.5, st.meleeCd || 0));
    s.dmg = d.dmg * Math.pow(1.13, m.lv || 0);
    s.critChance = (d.critChance || 0);
    s.range = d.range + (st.meleeRange || 0);
    s.heavy = [d.heavy[0], d.heavy[1] * (1 - Math.min(0.5, (st.meleeRecover || 0) * 0.5)), d.heavy[2] * (1 - Math.min(0.6, st.meleeRecover || 0))];
    return s;
  };
  W.meleeKind = function (def) { return def.mcat === 'fist' ? 'jab' : def.mcat === 'spear' || def.id === 'm_rapier' ? 'thrust' : 'slash'; };
  W.meleeMoveMul = function () {
    if (!P || !P.meleeMode || !P.melee) return null;
    const heavy = ms.ph === 'hwind' || ms.ph === 'hrec';
    return P.melee.def.moveMul * (1 + (P.stats.meleeMove || 0)) * (heavy ? 0.45 : 1) * (gd.on ? 0.6 : 1);
  };
  W.meleeBusy = () => ms.ph !== 'idle';
  // the guard numbers shown on a weapon's hover card: [label, value]
  W.guardStats = (d) => (d.guard ? [['ガード率', Math.round(d.guard[0] * 100) + '%'], ['ガード耐久', '' + d.guard[1]], ['ガード範囲', d.guard[2] * 2 + '°']] : [['ガード', '不可']]);

  // ---------------- guard (hold reload with a melee weapon) ----------------
  // While held: walk only, no attacks. Hits from in front (within the weapon's arc) lose part of their damage; what was cut drains the gauge.
  // An empty gauge cuts nothing (the guard stays up). After a short rest the gauge refills by itself.
  const gd = { on: false, k: 0, g: 1, rest: 9, lastT: 0, flash: 0, kick: 0 };
  W.gd = gd;
  const GUARD_REST = 1.6, GUARD_REGEN = 0.09; // seconds without a blocked hit before it refills; share of the gauge per second (the same for every weapon)
  W.guarding = () => !!(gd.on && P && P.meleeMode);
  function guardTick(dt, blocked) {
    const g = P.melee.def.guard;
    // the gauge refills even while the melee weapon is put away (measured by game time since the last tick)
    const el = Math.min(5, Math.max(0, G.game.time - (gd.lastT || G.game.time))); gd.lastT = G.game.time;
    gd.rest += el;
    if (gd.rest > GUARD_REST && gd.g < 1) gd.g = Math.min(1, gd.g + el * GUARD_REGEN);
    const want = !!g && I.down('reload') && !blocked && ms.ph === 'idle' && !P.dead;
    if (want && !gd.on) G.sfx.mech('boltBack', 0, 0.5);
    gd.on = want;
    gd.k = U.damp(gd.k, gd.on ? 1 : 0, 16, dt);
    gd.flash = Math.max(0, gd.flash - dt * 3); gd.kick = Math.max(0, gd.kick - dt * 6);
    if (gd.on) { P.sprinting = false; P.sprintToggle = false; }
    guardUI();
  }
  // called by damagePlayer with the damage left after armour: returns what still gets through
  W.guardAbsorb = function (dmg, info) {
    P = G.player;
    if (!W.guarding() || info.fixed || info.src === 'dot' || info.src === 'fall') return dmg;
    const g = P.melee.def.guard; if (!g) return dmg;
    const from = info.pos || (info.attacker && info.attacker.pos); if (!from) return dmg;
    const dx = from.x - P.pos.x, dz = from.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.35) return dmg; // something on top of you (a puddle, a field) has no front
    const f = P.forward(); const fl = Math.hypot(f.x, f.z) || 1;
    if ((dx * f.x + dz * f.z) / (d * fl) < Math.cos(g[2] * Math.PI / 180)) return dmg;
    if (gd.g <= 0) { gd.flash = Math.max(gd.flash, 0.3); G.sfx.ui('deny'); return dmg; }
    const pool = g[1], cut = Math.min(dmg * g[0], gd.g * pool);
    gd.g = Math.max(0, gd.g - cut / pool); gd.rest = 0; gd.flash = 1; gd.kick = 1;
    const fw = P.forward();
    const at = G.camera.position.clone().addScaledVector(fw, 0.9).add(V(0, -0.15, 0));
    G.fx.sparks(at, fw.clone().negate(), 10, 0xffe0a0, 6);
    G.sfx.impact(at, 'metal'); G.sfx.mech('boltFwd', 0, 0.6);
    P.addShake(0.12);
    if (gd.g <= 0) { G.ui.toastSmall('🛡️ 防御の耐久が尽きた'); if (G.sfx.shieldBreak) G.sfx.shieldBreak(at); }
    return dmg - cut;
  };
  let gEl = null;
  function guardUI() {
    const g = P.melee && P.melee.def.guard;
    if (!gEl) { gEl = document.createElement('div'); gEl.id = 'guard-gauge'; gEl.innerHTML = '<i></i><span>🛡️</span>'; G.ui.el.hud.appendChild(gEl); }
    const show = !!g && P.meleeMode && (gd.on || gd.g < 0.999);
    gEl.classList.toggle('on', show);
    gEl.classList.toggle('active', gd.on);
    gEl.classList.toggle('empty', gd.g <= 0);
    gEl.classList.toggle('hit', gd.flash > 0.5);
    gEl.firstChild.style.height = (gd.g * 100).toFixed(1) + '%';
  }
  W.hideGuardUI = () => { if (gEl) gEl.classList.remove('on'); gd.on = false; gd.k = 0; };
  const MELEM = { bleed: ['🩸', '出血'], frost: ['❄️', '冷気'], burn: ['🔥', '炎上'], poison: ['☠️', '毒'], shock: ['⚡', '感電'] };
  W.meleeFx = function (d) {
    const out = [];
    if (d.traitDesc) out.push('✦ ' + d.traitDesc);
    if (d.elem && MELEM[d.elem]) out.push(`${MELEM[d.elem][0]} ${MELEM[d.elem][1]}付与 ${Math.round((d.elemChance || 0) * 100)}%（重撃100%）`);
    if (d.shieldMul && d.shieldMul > 1) out.push(`🛡️ シールド特効 +${Math.round((d.shieldMul - 1) * 100)}%`);
    if (d.lifesteal) out.push(`🩸 吸血 ${Math.round(d.lifesteal * 100)}%`);
    if (d.critChance) out.push(`🎯 会心率 +${Math.round(d.critChance * 100)}%`);
    if (d.headMul && d.headMul > 1.55) out.push(`💀 頭部 ×${d.headMul}`);
    return out;
  };

  // ---------------- viewmodels ----------------
  function buildMelee(def) {
    const mats = W.mats, PG = G.Props.PG;
    const root = new THREE.Group();
    const r = new THREE.Group(), l = new THREE.Group();
    root.add(r, l);
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.envMapIntensity = 2.4; return m; };
    const blade = mk({ color: 0xdce2ec, metalness: 0.52, roughness: 0.18, emissive: 0x242a34, emissiveIntensity: 0.25 });
    const dark = mk({ color: 0x241e1c, metalness: 0.3, roughness: 0.62 });
    const wrap = mk({ color: 0x3a1a14, roughness: 0.9, map: G.Tex.tex.cloth.map });
    const gold = mk({ color: 0xffcf40, metalness: 0.45, roughness: 0.20, emissive: 0x7a4c08, emissiveIntensity: 0.50 });
    const goldBr = mk({ color: 0xfff0a0, metalness: 0.50, roughness: 0.12, emissive: 0xb88214, emissiveIntensity: 0.72 });
    let bladeM = blade;
    if (def.model === 'frostknife') bladeM = mk({ color: 0xbfe8ff, metalness: 0.3, roughness: 0.05, emissive: 0x3898ff, emissiveIntensity: 1.15, transparent: true, opacity: 0.94 });
    if (def.model === 'emberblade') bladeM = mk({ color: 0xff6018, metalness: 0.35, roughness: 0.18, emissive: 0xff4808, emissiveIntensity: 1.8 });
    if (def.model === 'holy') bladeM = mk({ color: 0xfff8e8, metalness: 0.45, roughness: 0.10, emissive: 0xffdf80, emissiveIntensity: 1.1 });
    if (def.model === 'twin') bladeM = mk({ color: 0x68f040, metalness: 0.4, roughness: 0.18, emissive: 0x28b810, emissiveIntensity: 1.2 });
    const box = (p, w, h, d, x, y, z, m, rx, ry, rz) => { const o = new THREE.Mesh(PG.box, m); o.scale.set(w, h, d); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; };
    const cyl = (p, rad, len, x, y, z, m) => { const o = new THREE.Mesh(PG.cyl8, m); o.scale.set(rad, len, rad); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; };
    const cone = (p, rad, len, x, y, z, m, rx) => { const o = new THREE.Mesh(PG.cone, m); o.scale.set(rad, len, rad); o.position.set(x || 0, y || 0, z || 0); o.rotation.x = rx || 0; p.add(o); return o; };
    const flatTip = (p, w, len, d, x, y, z, m, rx) => { const o = new THREE.Mesh(PG.cone, m); o.scale.set(w * 0.58, len, d * 0.58); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, Math.PI / 4, 0); p.add(o); return o; };
    const isMidas = def.id === 'm_midas' || def.trait === 'midas';
    const gDeep = isMidas ? mk({ color: 0xd89218, metalness: 0.42, roughness: 0.28, emissive: 0x523004, emissiveIntensity: 0.45 }) : null;
    const gGold = isMidas ? mk({ color: 0xffcf40, metalness: 0.45, roughness: 0.22, emissive: 0x7a4c08, emissiveIntensity: 0.52 }) : null;
    const gBright = isMidas ? mk({ color: 0xffe878, metalness: 0.48, roughness: 0.16, emissive: 0x9a6810, emissiveIntensity: 0.62 }) : null;
    const gSpike = isMidas ? mk({ color: 0xfff8c0, metalness: 0.52, roughness: 0.10, emissive: 0xc88e18, emissiveIntensity: 0.82 }) : null;
    const gTrim = isMidas ? mk({ color: 0x3a1014, metalness: 0.35, roughness: 0.45, emissive: 0x1a0406, emissiveIntensity: 0.25 }) : null;
    const gGem = isMidas ? mk({ color: 0xff2414, metalness: 0.15, roughness: 0.08, emissive: 0xff3c14, emissiveIntensity: 2.1 }) : null;
    const fist = (p, right) => {
      const s = right ? 1 : -1;
      if (isMidas) {
        // sculpted golden armored fist core + continuous tapered side cheek-guards
        const palm = box(p, 0.056, 0.042, 0.064, 0, -0.001, 0.000, gDeep);
        box(p, 0.012, 0.036, 0.096, s * 0.028, 0.002, 0.014, gGold, -0.12, -s * 0.08, -s * 0.25);
        box(p, 0.011, 0.032, 0.088, -s * 0.027, 0.002, 0.012, gGold, -0.12, s * 0.07, s * 0.22);
        // overlapping dorsal carapace lames + crimson-obsidian inlay + flared gothic cuff
        box(p, 0.060, 0.013, 0.062, 0, 0.020, -0.002, gGold, -0.10, 0, 0);
        box(p, 0.044, 0.008, 0.046, 0, 0.025, -0.001, gTrim, -0.10, 0, 0);
        box(p, 0.054, 0.012, 0.034, 0, 0.017, 0.036, gBright, -0.15, 0, 0);
        box(p, 0.052, 0.012, 0.042, 0, 0.013, 0.062, gGold, -0.18, 0, 0);
        box(p, 0.034, 0.010, 0.034, 0, 0.010, 0.080, gBright, -0.18, Math.PI / 4, 0);
        box(p, 0.048, 0.028, 0.054, 0, -0.004, 0.052, gDeep, -0.16, 0, 0);
        box(p, 0.046, 0.010, 0.048, 0, -0.017, 0.052, gGold, -0.16, 0, 0);
        // twin V-shaped golden chevron wings + continuous central spine + octagonal sun-crest & diamond ruby
        for (const [dz, w] of [[-0.014, 0.025], [0.012, 0.021], [0.038, 0.023]]) {
          const dy = dz > 0.02 ? 0.023 : 0.028;
          box(p, w, 0.007, 0.008, s * 0.011, dy, dz, gBright, -0.12, s * 0.42, 0);
          box(p, w, 0.007, 0.008, -s * 0.011, dy, dz, gBright, -0.12, -s * 0.42, 0);
        }
        box(p, 0.008, 0.009, 0.086, 0, 0.025, 0.018, gSpike, -0.14, 0, 0);
        const bez = new THREE.Mesh(PG.oct, gSpike); bez.scale.set(0.016, 0.007, 0.016); bez.position.set(0, 0.029, -0.002); bez.rotation.x = -0.10; p.add(bez);
        const gem = new THREE.Mesh(PG.oct3, gGem); gem.scale.set(0.011, 0.009, 0.014); gem.position.set(0, 0.032, -0.002); gem.rotation.x = -0.10; p.add(gem);
        // heavy cestus knuckle-duster bridge
        box(p, 0.070, 0.024, 0.022, 0, 0.008, -0.035, gGold);
        box(p, 0.068, 0.010, 0.024, 0, 0.019, -0.032, gBright, -0.35, 0, 0);
        box(p, 0.066, 0.008, 0.018, 0, -0.005, -0.036, gTrim);
        // 4 individual knuckle sockets, finger rings, faceted golden spikes & curled armored phalanges
        for (let i = 0; i < 4; i++) {
          const fx = (i - 1.5) * 0.016 * s;
          const archZ = [0.005, 0.008, 0.004, -0.001][i];
          const archY = [0.003, 0.006, 0.003, -0.001][i];
          const spkLen = [0.030, 0.036, 0.031, 0.025][i];
          box(p, 0.0135, 0.025, 0.018, fx, 0.008 + archY, -0.037 - archZ, gBright);
          const ring = new THREE.Mesh(PG.torus, gSpike); ring.scale.set(0.0074, 0.0074, 0.015); ring.rotation.x = 1.15; ring.position.set(fx, -0.002 + archY, -0.043 - archZ); p.add(ring);
          const spk = cone(p, 0.0054, spkLen, fx, 0.009 + archY, -0.045 - archZ - spkLen * 0.45, gSpike, -Math.PI / 2); spk.rotation.z = Math.PI / 4;
          box(p, 0.013, 0.020, 0.016, fx, -0.011 + archY, -0.038 - archZ * 0.6, gGold, 0.55, 0, 0);
          box(p, 0.012, 0.015, 0.022, fx, -0.021 + archY * 0.5, -0.022 - archZ * 0.3, gBright, 0.15, 0, 0);
          box(p, 0.011, 0.012, 0.016, fx, -0.020 + archY * 0.3, -0.006, gGold, -0.35, 0, 0);
        }
        // sculpted cestus palm-grip bar & ventral wrist buckle clasp (for 360-degree view)
        box(p, 0.062, 0.012, 0.014, 0, -0.016, -0.012, gSpike);
        box(p, 0.052, 0.008, 0.024, 0, -0.021, 0.012, gTrim);
        box(p, 0.026, 0.010, 0.022, 0, -0.022, 0.046, gBright, -0.16, 0, 0);
        // outer & inner wing guards + side spikes
        box(p, 0.012, 0.026, 0.034, s * 0.035, 0.007, -0.026, gBright, 0, s * 0.25, 0);
        const ws = cone(p, 0.0048, 0.022, s * 0.039, 0.008, -0.038, gSpike, -Math.PI / 2); ws.rotation.z = -s * 0.42;
        // articulated golden thumb locked across inner front
        box(p, 0.017, 0.022, 0.036, -s * 0.031, 0.000, -0.006, gGold, 0.28, s * 0.32, s * 0.22);
        box(p, 0.028, 0.016, 0.018, -s * 0.018, -0.015, -0.026, gBright, 0, s * 0.18, -s * 0.12);
        const arm = new THREE.Mesh(PG.cyl8, mats.sleeve); arm.scale.set(0.022, 0.34, 0.022); arm.rotation.x = Math.PI / 2 - 0.22; arm.position.set(s * 0.014, -0.048, 0.21); arm.userData.sleeve = true; p.add(arm);
        return palm;
      }
      const palm = box(p, 0.06, 0.08, 0.08, 0, 0, 0, mats.glove);
      box(p, 0.065, 0.04, 0.06, right ? -0.01 : 0.01, 0.035, -0.02, mats.glove);
      const arm = new THREE.Mesh(PG.cyl8, mats.sleeve); arm.scale.set(0.04, 0.42, 0.04); arm.rotation.x = Math.PI / 2 - 0.25; arm.position.set(right ? 0.03 : -0.03, -0.06, 0.22); arm.userData.sleeve = true; p.add(arm);
      const cuff = new THREE.Mesh(PG.cyl8, mats.glove); cuff.scale.set(0.036, 0.05, 0.036); cuff.rotation.x = Math.PI / 2 - 0.25; cuff.position.set(0, -0.015, 0.05); p.add(cuff);
      return palm;
    };
    // weapon pivot = grip, local +Y = blade direction
    const wg = new THREE.Group(); r.add(wg);
    let tipY = 0.3, glow = null;
    const gemM = (col, em) => mk({ color: col, metalness: 0.15, roughness: 0.08, emissive: em || col, emissiveIntensity: 2.0 });
    const knife = (p, len, m) => {
      cyl(p, 0.015, 0.11, 0, 0, 0, dark); box(p, 0.022, 0.018, 0.024, 0, -0.06, 0, mats.steel);
      for (let i = 0; i < 3; i++) box(p, 0.032, 0.006, 0.028, 0, -0.032 + i * 0.028, 0, mats.steel);
      box(p, 0.028, 0.014, 0.072, 0, 0.06, 0, mats.steel);
      box(p, 0.007, len, 0.034, 0, 0.067 + len / 2, -0.002, m);
      box(p, 0.009, len * 0.85, 0.010, 0, 0.065 + len * 0.44, 0.012, dark);
      flatTip(p, 0.007, 0.055, 0.034, 0, 0.067 + len + 0.027, -0.002, m);
      return 0.067 + len + 0.055;
    };
    switch (def.model) {
      case 'fists': if (isMidas) glow = 0xffd040; break;
      case 'knife': tipY = knife(wg, 0.18, bladeM); break;
      case 'sknife': {
        cyl(wg, 0.017, 0.12, 0, 0, 0, wrap); box(wg, 0.024, 0.02, 0.026, 0, -0.065, 0, mats.steel);
        box(wg, 0.030, 0.014, 0.078, 0, 0.065, 0, mats.steel);
        box(wg, 0.007, 0.18, 0.036, 0, 0.16, -0.003, bladeM);
        box(wg, 0.009, 0.16, 0.010, 0, 0.15, 0.014, dark);
        flatTip(wg, 0.007, 0.055, 0.036, 0, 0.277, -0.003, bladeM);
        tipY = 0.30; break;
      }
      case 'frostknife': {
        const iceGem = gemM(0x70e8ff, 0x30b8ff), iceHil = mk({ color: 0x385878, metalness: 0.5, roughness: 0.25, emissive: 0x102840, emissiveIntensity: 0.4 });
        cyl(wg, 0.015, 0.11, 0, 0, 0, iceHil);
        for (const y of [-0.03, 0, 0.03]) box(wg, 0.032, 0.006, 0.032, 0, y, 0, goldBr);
        const pm = new THREE.Mesh(PG.oct3, iceGem); pm.scale.set(0.014, 0.022, 0.014); pm.position.set(0, -0.068, 0); wg.add(pm);
        box(wg, 0.026, 0.016, 0.044, 0, 0.062, 0, goldBr);
        for (const sz of [-1, 1]) box(wg, 0.014, 0.012, 0.045, 0, 0.070, sz * 0.032, bladeM, sz * 0.42, 0, 0);
        box(wg, 0.007, 0.20, 0.038, 0, 0.17, 0, bladeM);
        box(wg, 0.010, 0.17, 0.010, 0, 0.16, 0, iceGem);
        flatTip(wg, 0.008, 0.065, 0.038, 0, 0.30, 0, bladeM);
        tipY = 0.33; glow = 0x80d0ff; break;
      }
      case 'twin': {
        const vGem = gemM(0x50ff30, 0x30e818), vObs = mk({ color: 0x142214, metalness: 0.4, roughness: 0.35, emissive: 0x061204, emissiveIntensity: 0.3 });
        const buildVenom = (p) => {
          cyl(p, 0.015, 0.11, 0, 0, 0, vObs);
          for (const y of [-0.032, 0, 0.032]) box(p, 0.031, 0.006, 0.031, 0, y, 0, gold);
          const pm = new THREE.Mesh(PG.oct3, vGem); pm.scale.set(0.014, 0.022, 0.014); pm.position.set(0, -0.068, 0); p.add(pm);
          box(p, 0.026, 0.018, 0.046, 0, 0.062, 0, gold);
          const cg = new THREE.Mesh(PG.oct3, vGem); cg.scale.set(0.016, 0.012, 0.012); cg.position.set(0, 0.064, 0); p.add(cg);
          for (const sz of [-1, 1]) {
            box(p, 0.014, 0.012, 0.046, 0, 0.072, sz * 0.034, goldBr, sz * 0.48, 0, 0);
            box(p, 0.009, 0.028, 0.016, 0, 0.135, sz * 0.022, bladeM, -sz * 0.38, 0, 0);
          }
          box(p, 0.008, 0.18, 0.036, 0, 0.16, 0, vObs);
          box(p, 0.006, 0.18, 0.042, 0, 0.16, 0, bladeM);
          box(p, 0.011, 0.15, 0.009, 0, 0.15, 0, vGem);
          flatTip(p, 0.008, 0.065, 0.042, 0, 0.28, 0, bladeM);
          return 0.31;
        };
        tipY = buildVenom(wg);
        const lg = new THREE.Group(); l.add(lg); buildVenom(lg); lg.rotation.set(-0.9, 0, -0.2); l.userData.knife = lg;
        glow = 0x50ff30; break;
      }
      case 'kukri': {
        cyl(wg, 0.016, 0.12, 0, 0, 0, mats.wood); box(wg, 0.026, 0.016, 0.034, 0, -0.065, 0, gold); box(wg, 0.028, 0.018, 0.052, 0, 0.065, 0, gold);
        box(wg, 0.007, 0.14, 0.042, 0, 0.135, -0.008, bladeM, -0.14); box(wg, 0.009, 0.14, 0.010, 0, 0.135, 0.012, dark, -0.14);
        box(wg, 0.007, 0.15, 0.058, 0, 0.265, -0.024, bladeM, 0.16); box(wg, 0.009, 0.15, 0.012, 0, 0.265, 0.000, dark, 0.16);
        flatTip(wg, 0.007, 0.065, 0.056, 0, 0.365, -0.012, bladeM, 0.16);
        tipY = 0.39; break;
      }
      case 'machete': {
        cyl(wg, 0.017, 0.13, 0, 0, 0, dark); box(wg, 0.026, 0.022, 0.036, 0, -0.07, 0, mats.steel); box(wg, 0.028, 0.014, 0.068, 0, 0.068, 0, mats.steel);
        box(wg, 0.006, 0.38, 0.054, 0, 0.265, -0.006, bladeM); box(wg, 0.009, 0.38, 0.014, 0, 0.265, 0.016, dark);
        flatTip(wg, 0.007, 0.07, 0.054, 0, 0.485, -0.006, bladeM);
        tipY = 0.52; break;
      }
      case 'katana': case 'emberblade': {
        const em = def.model === 'emberblade';
        const spineM = em ? mk({ color: 0x1a0806, metalness: 0.45, roughness: 0.35, emissive: 0x280600, emissiveIntensity: 0.4 }) : dark;
        const fGem = em ? gemM(0xff3810, 0xff5010) : null;
        cyl(wg, 0.016, 0.22, 0, -0.01, 0, wrap);
        box(wg, 0.026, 0.018, 0.032, 0, -0.125, 0, gold);
        for (let i = 0; i < 5; i++) box(wg, 0.034, 0.008, 0.028, 0, -0.09 + i * 0.038, 0, em ? gold : dark, 0.35);
        const tsuba = new THREE.Mesh(PG.oct, gold); tsuba.scale.set(0.038, 0.010, 0.044); tsuba.position.set(0, 0.105, 0); wg.add(tsuba);
        if (em) {
          for (const sz of [-1, 1]) box(wg, 0.016, 0.012, 0.052, 0, 0.112, sz * 0.038, goldBr, sz * 0.38, 0, 0);
          const cg = new THREE.Mesh(PG.oct3, fGem); cg.scale.set(0.016, 0.016, 0.016); cg.position.set(0, 0.132, 0); wg.add(cg);
        }
        box(wg, 0.014, 0.032, 0.036, 0, 0.126, 0, goldBr);
        const bl = box(wg, 0.006, 0.62, 0.034, 0, 0.45, -0.006, bladeM, 0.03);
        box(wg, 0.009, 0.62, 0.012, 0, 0.45, 0.008, spineM, 0.03);
        if (em) for (let i = 0; i < 3; i++) box(wg, 0.008, 0.045, 0.018, 0, 0.28 + i * 0.16, 0.016, bladeM, -0.45);
        flatTip(wg, 0.007, 0.075, 0.034, 0, 0.79, -0.016, bladeM, 0.05);
        tipY = 0.83; if (em) glow = 0xff6a20; bl.userData.glow = true; break;
      }
      case 'holy': {
        const hGem = gemM(0xff3018, 0xff4818), hSun = gemM(0xfff8b0, 0xffd850);
        const hTrim = mk({ color: 0x381018, metalness: 0.35, roughness: 0.4, emissive: 0x180408, emissiveIntensity: 0.3 });
        // royal pommel with sun-ruby core & golden wings
        const pBez = new THREE.Mesh(PG.oct, goldBr); pBez.scale.set(0.022, 0.016, 0.022); pBez.position.set(0, -0.125, 0); pBez.rotation.z = Math.PI / 2; wg.add(pBez);
        const pGem = new THREE.Mesh(PG.oct3, hGem); pGem.scale.set(0.016, 0.024, 0.016); pGem.position.set(0, -0.132, 0); wg.add(pGem);
        cyl(wg, 0.016, 0.21, 0, -0.01, 0, hTrim);
        for (let i = 0; i < 5; i++) box(wg, 0.034, 0.007, 0.034, 0, -0.085 + i * 0.038, 0, goldBr);
        // multi-layered winged golden sun-crossguard + central medallion
        box(wg, 0.032, 0.032, 0.085, 0, 0.112, 0, gold);
        for (const sz of [-1, 1]) {
          box(wg, 0.024, 0.020, 0.11, 0, 0.122, sz * 0.068, goldBr, sz * 0.32, 0, 0);
          box(wg, 0.016, 0.014, 0.085, 0, 0.142, sz * 0.082, gold, sz * 0.52, 0, 0);
          box(wg, 0.012, 0.026, 0.024, 0, 0.215, sz * 0.036, goldBr, -sz * 0.45, 0, 0);
        }
        const cBez = new THREE.Mesh(PG.oct, goldBr); cBez.scale.set(0.026, 0.038, 0.026); cBez.position.set(0, 0.118, 0); cBez.rotation.z = Math.PI / 2; wg.add(cBez);
        const cGem = new THREE.Mesh(PG.oct3, hGem); cGem.scale.set(0.022, 0.022, 0.022); cGem.position.set(0, 0.118, 0); wg.add(cGem);
        // ornate golden ricasso collar + broad luminous sacred blade with radiant fuller
        box(wg, 0.016, 0.09, 0.056, 0, 0.175, 0, gold);
        box(wg, 0.019, 0.07, 0.032, 0, 0.175, 0, hTrim);
        const bl = box(wg, 0.008, 0.62, 0.050, 0, 0.48, 0, bladeM);
        box(wg, 0.012, 0.56, 0.018, 0, 0.46, 0, gold);
        box(wg, 0.015, 0.50, 0.008, 0, 0.44, 0, hSun);
        flatTip(wg, 0.009, 0.095, 0.050, 0, 0.835, 0, bladeM);
        tipY = 0.88; glow = 0xfff0c0; bl.userData.glow = true; break;
      }
      case 'rapier': {
        cyl(wg, 0.014, 0.13, 0, -0.005, 0, dark);
        const pm = new THREE.Mesh(PG.oct3, goldBr); pm.scale.set(0.016, 0.022, 0.016); pm.position.set(0, -0.08, 0); wg.add(pm);
        const cup = new THREE.Mesh(PG.sph, gold); cup.scale.set(0.048, 0.028, 0.048); cup.position.y = 0.075; wg.add(cup);
        const ring = new THREE.Mesh(PG.torus, goldBr); ring.scale.set(0.048, 0.048, 0.06); ring.position.set(0, 0.075, 0); ring.rotation.x = Math.PI / 2; wg.add(ring);
        box(wg, 0.012, 0.010, 0.16, 0, 0.065, 0, goldBr);
        box(wg, 0.010, 0.11, 0.012, 0, 0.01, -0.052, goldBr, 0.25);
        box(wg, 0.007, 0.74, 0.018, 0, 0.46, 0, bladeM);
        box(wg, 0.010, 0.22, 0.008, 0, 0.20, 0, gold);
        flatTip(wg, 0.007, 0.07, 0.018, 0, 0.86, 0, bladeM);
        tipY = 0.89; break;
      }
      case 'axe': {
        cyl(wg, 0.018, 0.62, 0, 0.18, 0, mats.wood);
        for (const y of [-0.10, 0.10, 0.32, 0.48]) box(wg, 0.040, 0.016, 0.040, 0, y, 0, mats.steel);
        box(wg, 0.026, 0.12, 0.08, 0, 0.42, 0, dark);
        box(wg, 0.014, 0.19, 0.13, 0, 0.41, -0.07, dark);
        box(wg, 0.009, 0.22, 0.05, 0, 0.40, -0.135, bladeM, 0.12);
        flatTip(wg, 0.014, 0.09, 0.045, 0, 0.43, 0.075, bladeM, Math.PI / 2);
        flatTip(wg, 0.014, 0.07, 0.032, 0, 0.53, 0, bladeM);
        tipY = 0.56; break;
      }
      case 'buckler': {
        // an arming sword: leather grip, a plain crossguard, a straight double-edged blade with a fuller
        cyl(wg, 0.016, 0.12, 0, 0, 0, wrap); box(wg, 0.03, 0.03, 0.03, 0, -0.07, 0, mats.steel);
        box(wg, 0.022, 0.022, 0.15, 0, 0.07, 0, mats.steel);
        box(wg, 0.007, 0.36, 0.044, 0, 0.26, 0, bladeM); box(wg, 0.009, 0.32, 0.012, 0, 0.25, 0, dark);
        flatTip(wg, 0.007, 0.07, 0.044, 0, 0.475, 0, bladeM);
        tipY = 0.51; break;
      }
      case 'tower': {
        // a short war hammer for the right hand
        cyl(wg, 0.018, 0.34, 0, 0.08, 0, mats.wood);
        for (const y of [-0.06, 0.12]) box(wg, 0.04, 0.016, 0.04, 0, y, 0, mats.steel);
        box(wg, 0.075, 0.075, 0.15, 0, 0.27, -0.01, dark); box(wg, 0.088, 0.088, 0.04, 0, 0.27, -0.08, mats.steel);
        flatTip(wg, 0.03, 0.07, 0.03, 0, 0.27, 0.1, bladeM, Math.PI / 2);
        tipY = 0.33; break;
      }
      case 'hammer': {
        cyl(wg, 0.020, 0.62, 0, 0.20, 0, mats.wood);
        for (const y of [-0.09, 0.12, 0.38]) box(wg, 0.044, 0.018, 0.044, 0, y, 0, mats.steel);
        box(wg, 0.09, 0.09, 0.18, 0, 0.49, -0.01, dark);
        box(wg, 0.105, 0.105, 0.05, 0, 0.49, -0.09, mats.steel);
        const face = new THREE.Mesh(PG.oct, bladeM); face.scale.set(0.052, 0.024, 0.052); face.rotation.x = Math.PI / 2; face.position.set(0, 0.49, -0.12); wg.add(face);
        flatTip(wg, 0.036, 0.09, 0.036, 0, 0.49, 0.12, bladeM, Math.PI / 2);
        flatTip(wg, 0.028, 0.06, 0.028, 0, 0.57, 0, mats.steel);
        tipY = 0.58; break;
      }
      case 'thunder': {
        const tGem = gemM(0x60f0ff, 0x30c8ff), tSteel = mk({ color: 0x262c38, metalness: 0.48, roughness: 0.28, emissive: 0x0a1424, emissiveIntensity: 0.35 });
        // braided obsidian-and-gold haft + storm-crystal pommel & flared golden collar
        cyl(wg, 0.020, 0.64, 0, 0.19, 0, tSteel);
        for (const y of [-0.08, 0.04, 0.16, 0.28, 0.38]) box(wg, 0.046, 0.016, 0.046, 0, y, 0, gold);
        box(wg, 0.056, 0.026, 0.056, 0, -0.12, 0, goldBr);
        const pGem = new THREE.Mesh(PG.oct3, tGem); pGem.scale.set(0.020, 0.030, 0.020); pGem.position.set(0, -0.15, 0); wg.add(pGem);
        box(wg, 0.068, 0.036, 0.082, 0, 0.41, 0, gold);
        // massive Raijin warhammer head: dark-titanium & royal-gold beveled armor
        box(wg, 0.115, 0.115, 0.23, 0, 0.50, 0, tSteel);
        box(wg, 0.124, 0.028, 0.24, 0, 0.55, 0, gold);
        box(wg, 0.124, 0.024, 0.24, 0, 0.45, 0, gold);
        box(wg, 0.036, 0.132, 0.25, 0, 0.50, 0, goldBr);
        // front & rear octagonal golden striking rams + blazing cyan plasma coils
        for (const sz of [-1, 1]) {
          const ram = new THREE.Mesh(PG.oct, goldBr); ram.scale.set(0.058, 0.028, 0.058); ram.rotation.x = Math.PI / 2; ram.position.set(0, 0.50, sz * 0.128); wg.add(ram);
          const coil = new THREE.Mesh(PG.torus, tGem); coil.scale.set(0.056, 0.056, 0.09); coil.position.set(0, 0.50, sz * 0.095); wg.add(coil);
          const core = new THREE.Mesh(PG.oct, tGem); core.scale.set(0.032, 0.012, 0.032); core.rotation.x = Math.PI / 2; core.position.set(0, 0.50, sz * 0.142); wg.add(core);
        }
        // left & right Raijin thunder-drum medallions + swept golden lightning wings
        for (const sx of [-1, 1]) {
          const drum = new THREE.Mesh(PG.oct, goldBr); drum.scale.set(0.044, 0.016, 0.044); drum.rotation.z = Math.PI / 2; drum.position.set(sx * 0.062, 0.50, 0); wg.add(drum);
          const dGem = new THREE.Mesh(PG.oct3, tGem); dGem.scale.set(0.018, 0.024, 0.024); dGem.position.set(sx * 0.068, 0.50, 0); wg.add(dGem);
          box(wg, 0.016, 0.022, 0.14, sx * 0.064, 0.54, 0, goldBr, 0, sx * 0.18, 0);
        }
        // top lightning-spire crown
        const crB = new THREE.Mesh(PG.oct, goldBr); crB.scale.set(0.028, 0.020, 0.028); crB.position.set(0, 0.57, 0); wg.add(crB);
        const crS = new THREE.Mesh(PG.oct3, tGem); crS.scale.set(0.020, 0.042, 0.020); crS.position.set(0, 0.60, 0); wg.add(crS);
        tipY = 0.62; glow = 0x70e8ff; break;
      }
      case 'spear': {
        cyl(wg, 0.016, 1.32, 0, 0.30, 0, mats.wood);
        for (const y of [-0.20, 0.25, 0.65, 0.90]) box(wg, 0.038, 0.018, 0.038, 0, y, 0, gold);
        box(wg, 0.032, 0.05, 0.048, 0, 0.96, 0, gold);
        for (const sz of [-1, 1]) box(wg, 0.014, 0.018, 0.065, 0, 0.98, sz * 0.042, goldBr, sz * 0.45, 0, 0);
        box(wg, 0.008, 0.16, 0.046, 0, 1.07, 0, bladeM);
        box(wg, 0.012, 0.15, 0.014, 0, 1.06, 0, gold);
        flatTip(wg, 0.009, 0.11, 0.046, 0, 1.20, 0, bladeM);
        tipY = 1.25; break;
      }
      case 'scythe': {
        const isDev = def.id === 'm_devour' || def.trait === 'devour';
        if (isDev) {
          const sGem = gemM(0xff1868, 0xff2080), sVoid = mk({ color: 0x1c0818, metalness: 0.45, roughness: 0.3, emissive: 0x180214, emissiveIntensity: 0.4 });
          const sEdge = mk({ color: 0xff3888, metalness: 0.35, roughness: 0.12, emissive: 0xe01868, emissiveIntensity: 1.75 });
          // armored obsidian-and-gold snath + abyssal soul-crystal pommel
          cyl(wg, 0.019, 1.18, 0, 0.32, 0, sVoid);
          for (let i = 0; i < 6; i++) box(wg, 0.044, 0.018, 0.044, 0, -0.14 + i * 0.20, 0, gold);
          const pGem = new THREE.Mesh(PG.oct3, sGem); pGem.scale.set(0.022, 0.042, 0.022); pGem.position.set(0, -0.28, 0); wg.add(pGem);
          // demonic golden-and-obsidian maw collar + floating crimson-violet Soul Core & golden halo
          const bg = new THREE.Group(); bg.position.set(0, 0.88, 0); wg.add(bg);
          box(bg, 0.048, 0.085, 0.11, 0, 0.0, 0.01, sVoid);
          box(bg, 0.054, 0.032, 0.13, 0, 0.032, 0.01, gold);
          box(bg, 0.054, 0.024, 0.11, 0, -0.032, 0.01, gold);
          const halo = new THREE.Mesh(PG.torus, goldBr); halo.scale.set(0.058, 0.058, 0.08); halo.rotation.y = Math.PI / 2; halo.position.set(0, 0.01, -0.02); bg.add(halo);
          const core = new THREE.Mesh(PG.oct3, sGem); core.scale.set(0.032, 0.032, 0.032); core.position.set(0, 0.01, -0.02); bg.add(core);
          // swept rear counter-horns + top crown spike
          flatTip(bg, 0.024, 0.11, 0.038, 0, 0.02, 0.11, goldBr, Math.PI / 2 + 0.25);
          flatTip(bg, 0.018, 0.08, 0.028, 0, -0.02, 0.09, sEdge, Math.PI / 2 - 0.25);
          flatTip(bg, 0.022, 0.08, 0.036, 0, 0.08, 0.01, goldBr);
          // massive sweeping crescent soul-blade: royal-gold dorsal spine + blazing crimson-magenta plasma edge
          let cy = 0.02, cz = -0.02;
          for (let i = 0; i < 6; i++) {
            const w = 0.088 - i * 0.010, step = 0.105, rx = -0.06 - i * 0.115;
            const my = cy + Math.sin(rx) * step * 0.5, mz = cz - Math.cos(rx) * step * 0.5;
            box(bg, 0.015, w * 0.42, step + 0.025, 0, my + Math.cos(rx) * w * 0.28, mz + Math.sin(rx) * w * 0.28, i % 2 === 0 ? gold : sVoid, rx);
            box(bg, 0.008, w * 0.78, step + 0.025, 0, my - Math.cos(rx) * w * 0.16, mz - Math.sin(rx) * w * 0.16, sEdge, rx);
            cy += Math.sin(rx) * step; cz -= Math.cos(rx) * step;
          }
          // inner soul-ripper hook
          flatTip(bg, 0.014, 0.09, 0.036, 0, -0.055, -0.18, goldBr, -2.4);
          tipY = 0.95; glow = 0xff2078; break;
        }
        const boneM = mk({ color: 0xd8ceb8, metalness: 0.25, roughness: 0.4, emissive: 0x241e18, emissiveIntensity: 0.25 });
        const rGem = gemM(0xff2030, 0xff1020);
        cyl(wg, 0.018, 1.15, 0, 0.32, 0, dark);
        for (const y of [-0.15, 0.15, 0.45, 0.72]) box(wg, 0.038, 0.018, 0.038, 0, y, 0, boneM);
        const bg = new THREE.Group(); bg.position.set(0, 0.88, 0); wg.add(bg);
        box(bg, 0.042, 0.068, 0.095, 0, 0, 0.01, boneM);
        const eye = new THREE.Mesh(PG.oct3, rGem); eye.scale.set(0.024, 0.020, 0.020); eye.position.set(0, 0.005, -0.01); bg.add(eye);
        flatTip(bg, 0.018, 0.09, 0.032, 0, 0.01, 0.09, boneM, Math.PI / 2 + 0.15);
        let cy = 0.015, cz = -0.02;
        for (let i = 0; i < 5; i++) {
          const w = 0.076 - i * 0.009, step = 0.11, rx = -0.06 - i * 0.12;
          const my = cy + Math.sin(rx) * step * 0.5, mz = cz - Math.cos(rx) * step * 0.5;
          box(bg, 0.013, w * 0.38, step + 0.025, 0, my + Math.cos(rx) * w * 0.25, mz + Math.sin(rx) * w * 0.25, dark, rx);
          box(bg, 0.007, w * 0.74, step + 0.025, 0, my - Math.cos(rx) * w * 0.15, mz - Math.sin(rx) * w * 0.15, bladeM, rx);
          cy += Math.sin(rx) * step; cz -= Math.cos(rx) * step;
        }
        tipY = 0.92; glow = 0xd02040; break;
      }
    }
    fist(r, true);
    if (def.model === 'fists' || def.model === 'twin') fist(l, false);
    else if (SHIELDS[def.model]) buildShield(l, def.model, mk, mats, PG, box, gold, dark);
    else l.visible = false;
    wg.rotation.order = 'ZXY';
    wg.rotation.set(0, 0, 0);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    return { group: root, r, l, wg, tipY, glow, def };
  }
  // the shield on the left arm (its face looks away from you, along -z)
  const SHIELDS = { buckler: 1, tower: 1 };
  W.isShield = (def) => !!(def && SHIELDS[def.model]);
  function buildShield(l, kind, mk, mats, PG, box, gold, dark) {
    const sg = new THREE.Group(); l.add(sg); l.userData.shield = sg;
    sg.scale.setScalar(kind === 'buckler' ? 0.5 : 0.52); sg.rotation.y = 0.35; // held a little turned, its face towards the middle of the view
    if (kind === 'buckler') {
      const face = mk({ color: 0x6a2a20, metalness: 0.25, roughness: 0.55, map: G.Tex.tex.cloth.map });
      const disk = new THREE.Mesh(PG.cyl, face); disk.scale.set(0.2, 0.03, 0.2); disk.rotation.x = Math.PI / 2; sg.add(disk);
      const rim = new THREE.Mesh(PG.torus, mats.steel); rim.scale.set(0.2, 0.2, 0.25); sg.add(rim);
      const boss = new THREE.Mesh(PG.sph, mats.steel); boss.scale.set(0.055, 0.055, 0.04); boss.position.z = -0.02; sg.add(boss);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; box(sg, 0.02, 0.15, 0.012, Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.018, gold, 0, 0, a + Math.PI / 2); }
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const rv = new THREE.Mesh(PG.sph, mats.steel); rv.scale.setScalar(0.01); rv.position.set(Math.cos(a) * 0.175, Math.sin(a) * 0.175, -0.02); sg.add(rv); }
    } else {
      const face = mk({ color: 0x3c3f48, metalness: 0.6, roughness: 0.38 });
      box(sg, 0.36, 0.56, 0.03, 0, 0, 0, face);
      for (const y of [-0.27, 0.27]) box(sg, 0.38, 0.03, 0.045, 0, y, -0.004, dark);
      for (const x of [-0.175, 0.175]) box(sg, 0.03, 0.58, 0.045, x, 0, -0.004, dark);
      box(sg, 0.05, 0.5, 0.02, 0, 0, -0.022, mats.steel); box(sg, 0.3, 0.05, 0.02, 0, 0.07, -0.022, mats.steel);
      const boss = new THREE.Mesh(PG.oct, gold); boss.scale.set(0.05, 0.03, 0.05); boss.rotation.x = Math.PI / 2; boss.position.set(0, 0.07, -0.04); sg.add(boss);
      for (const x of [-0.15, 0.15]) for (const y of [-0.24, 0, 0.24]) { const rv = new THREE.Mesh(PG.sph, mats.steel); rv.scale.setScalar(0.013); rv.position.set(x, y, -0.03); sg.add(rv); }
    }
    return sg;
  }
  W.meleeDisplayModel = function (def) {
    if (!W.mats) return new THREE.Group();
    const m = buildMelee(def);
    if (SHIELDS[def.model]) {
      m.r.children.filter((o) => o !== m.wg).forEach((o) => m.r.remove(o));
      m.l.children.filter((o) => o !== m.l.userData.shield).forEach((o) => m.l.remove(o));
      m.wg.rotation.order = 'ZXY'; m.wg.rotation.set(0.18, 1.38, Math.PI / 3.1); m.r.position.set(0.05, -0.05, 0.06);
      m.l.position.set(-0.03, 0.03, -0.04); m.l.rotation.set(0, 1.0, 0); m.l.visible = true;
      return m.group;
    }
    if (def.model === 'fists') {
      for (const h of [m.r, m.l]) h.children.filter((o) => o.userData && o.userData.sleeve).forEach((o) => h.remove(o));
      m.r.rotation.order = 'YXZ'; m.r.position.set(0.064, 0.014, 0.016); m.r.rotation.set(0.78, 2.55, -0.22);
      m.l.rotation.order = 'YXZ'; m.l.position.set(-0.064, -0.012, -0.016); m.l.rotation.set(0.72, -0.35, 0.24);
      m.l.visible = true;
      return m.group;
    }
    if (def.model === 'twin') {
      const k2 = m.l.userData.knife;
      m.r.children.filter((o) => o !== m.wg).forEach((o) => m.r.remove(o));
      m.l.children.filter((o) => o !== k2).forEach((o) => m.l.remove(o));
      m.wg.rotation.order = 'ZXY'; m.r.position.set(0.042, -0.01, 0.015); m.wg.rotation.set(0.18, 1.35, Math.PI / 3.4);
      if (k2) { k2.rotation.order = 'ZXY'; m.l.position.set(-0.042, 0.01, -0.015); k2.rotation.set(-0.18, -1.35, -Math.PI / 3.4); }
      m.l.visible = true;
      return m.group;
    }
    m.r.children.filter((o) => o !== m.wg).forEach((o) => m.r.remove(o));
    m.group.remove(m.l);
    m.wg.rotation.order = 'ZXY';
    m.wg.rotation.set(0.18, 1.38, Math.PI / 3.1);
    return m.group;
  };

  const DRAW_DUR = { flip: 0.46, twirl: 0.5, toss: 0.56, baton: 0.56, fists: 0.42, knifetoss: 0.6 };
  W.drawStyle = function (def) {
    const m = def.model;
    if (m === 'fists') return 'fists';
    if (m === 'sknife') return 'knifetoss';
    if (m === 'knife' || m === 'frostknife' || m === 'kukri' || m === 'twin') return 'flip';
    if (m === 'axe' || m === 'hammer' || m === 'thunder') return 'toss';
    if (m === 'spear' || m === 'scythe') return 'baton';
    return 'twirl';
  };
  W.melee = {
    equip(immediate) {
      P = G.player;
      if (mm) W.vmRoot.remove(mm.group);
      mm = buildMelee(P.melee.def);
      W.vmRoot.add(mm.group);
      W.switchT = 0;
      ms.ph = 'idle'; ms.t = 0;
      // draw flourish (flip / twirl / toss / baton spin / knuckle bump); quick-draw makes it snappier
      const st = W.drawStyle(P.melee.def);
      ms.draw = immediate === true ? null : { t: 0, style: st, dur: DRAW_DUR[st] * (P.has('k_quickdraw') ? 0.6 : 1) };
      if (ms.draw) { G.sfx.whoosh(0.25, st === 'toss' ? 0.8 : 1.4); animateMelee(0); }
      W.adsT = 0;
      G.ui.refreshWeapon();
    },
    show(v) { if (mm) mm.group.visible = v; const gm = W.getModel(); if (gm) gm.group.visible = !v; },
    rebuild() { if (P && P.meleeMode) W.melee.equip(true); },
  };
  W.setMelee = function () {
    P = G.player;
    if (P.meleeMode) return;
    const old = P.weapon; if (old) { old.reloading = false; old.charge = 0; old.spin = 0; old.burstQ = 0; }
    if (W.flameLoop) { W.flameLoop.stop(); W.flameLoop = null; }
    if (W.spinLoop) { W.spinLoop.stop(); W.spinLoop = null; }
    P.meleeMode = true;
    G.sfx.mech('switch');
    W.melee.equip(false);
    W.meleeDrawT = G.game.time; W.quickUsed = false;
    W.melee.show(true);
    G.ui.scope(false); W.isScoped = false;
  };
  // ---------------- key layout ----------------
  // P.wOrder says what sits on keys 1, 2, 3 (anything past the third is reachable with the mouse wheel only).
  // Entries are gun objects or 'm' for the melee weapon. A gun replaced in the shop takes over its predecessor's key.
  W.order = function () {
    P = G.player;
    // keys 1 and 2 hold guns (swap them from the inventory screen or by holding a key), key 3 is always the melee weapon
    let g = [0, 1].map((k) => { const t = (P.wOrder || [])[k]; return t && t !== 'm' && P.weapons.includes(t) ? t : null; });
    if (g[0] && g[0] === g[1]) g[1] = null;
    const spare = P.weapons.filter((w) => !g.includes(w));
    g = g.map((t) => t || spare.shift() || null);
    const o = [g[0], g[1], 'm'].concat(spare);
    P.wOrder = o;
    return o;
  };
  W.orderList = () => W.order().filter(Boolean);
  // guns in key order, and a "[1] " style prefix for menus (forge, attachments, shop swaps follow the key layout)
  W.gunsInOrder = () => W.orderList().filter((t) => t !== 'm');
  // the two gun keys exactly as bound, an empty key staying null (what the inventory screen draws: slot i is key i + 1)
  W.gunSlots = () => { const o = W.order(); return [o[0] || null, o[1] || null]; };
  W.keyLabel = (t) => { const i = W.order().indexOf(t); return i < 0 ? '' : i < 3 ? `[${i + 1}] ` : '[⇕] '; };
  W.curTok = () => (G.player.meleeMode ? 'm' : G.player.weapon);
  W.selectTok = function (t) { if (t === 'm') W.setMelee(); else if (t) W.switchTo(G.player.weapons.indexOf(t)); };
  W.tokInfo = function (t) {
    if (t === 'm') { const d = G.player.melee.def; return { icon: d.icon, name: d.name, rarity: d.rarity, sub: '近接' }; }
    return { icon: t.def.icon, name: t.def.name, rarity: t.def.rarity, sub: t.lv ? '+' + t.lv : '' };
  };
  // 1/2/3 switch straight to that slot (which gun sits on 1 or 2 is changed by drag & drop in the Tab screen)
  W.handleSwitch = function () {
    P = G.player;
    const o = W.order();
    for (let k = 0; k < 3; k++) if (I.hit('w' + (k + 1)) && o[k]) W.selectTok(o[k]);
    if (I.wheel) {
      const L = W.orderList(), cur = L.indexOf(W.curTok());
      W.selectTok(L[(cur + (I.wheel > 0 ? 1 : L.length - 1)) % L.length]);
    }
    return false;
  };

  // ---------------- logic ----------------
  W.updateMeleeMode = function (dt) {
    P = G.player;
    if (!mm) W.melee.equip(true);
    const s = W.mStats = W.meleeStats(P.melee);
    W.adsT = Math.max(0, W.adsT - dt * 8); P.adsActive = false;
    if (W.switchT > 0) W.switchT -= dt;
    if (ms.draw && ms.draw.t > ms.draw.dur * 0.5 && (I.mpressed[0] || I.mpressed[2])) ms.draw = null;
    const blocked = !!ms.draw || W.switchT > 0 || P.mantle || P.pileState || W.anim.throwT > 0 || G.ItemAnim.busy() || G.GrenHold.active() || G.abilities.wheelOpen();
    guardTick(dt, blocked);
    if (ms.ph === 'idle' && !blocked && !gd.on) {
      if (I.mpressed[2]) startHeavy(s);
      else if (I.mouse[0]) startLight(s);
    } else if (ms.ph === 'light' && !blocked && !gd.on && ms.t >= ms.dur * 0.8 && (I.mouse[0] || I.mpressed[0])) {
      if (I.mpressed[2]) startHeavy(s); else startLight(s);
    }
    if ((I.mouse[0] || I.mouse[2]) && P.sprinting) { P.sprinting = false; P.lastShotT = G.game.time - 0.1; }
    // advance
    if (ms.ph !== 'idle') {
      ms.t += dt;
      if (ms.ph === 'light') {
        if (!ms.hitDone && ms.t >= ms.hitAt) { ms.hitDone = true; doHit(s, false); }
        if (ms.t >= ms.dur) ms.ph = 'idle';
      } else if (ms.ph === 'hwind') {
        if (Math.random() < dt * 30 && mm.glow) spawnGlow(mm.glow, 0.5);
        if (ms.t >= ms.dur) {
          ms.ph = 'hrec'; ms.t = 0; ms.dur = s.heavy[2]; ms.hitDone = false;
          ms.hitAt = 0.05;
          G.sfx.swing(true, P.melee.def.mcat);
          if (s.trait === 'lunge') { const f = P.forward(); f.y = 0; f.normalize(); P.vel.x = f.x * 19; P.vel.z = f.z * 19; ms.hitAt = 0.13; ms.lungeT = 0.18; P.invulnT = Math.max(P.invulnT || 0, 0.25); }
        }
      } else if (ms.ph === 'hrec') {
        if (ms.lungeT > 0) { ms.lungeT -= dt; const f = P.forward(); f.y = 0; f.normalize(); P.vel.x = f.x * 19; P.vel.z = f.z * 19; }
        if (!ms.hitDone && ms.t >= ms.hitAt) { ms.hitDone = true; doHit(s, true); }
        if (ms.t >= ms.dur) ms.ph = 'idle';
      }
    }
    animateMelee(dt, s);
  };
  function startLight(s) {
    const kind = W.meleeKind(P.melee.def);
    ms.ph = 'light'; ms.t = 0; ms.dur = s.swing; ms.hitDone = false; ms.combo++;
    ms.side = ms.combo % 2 ? 1 : -1;
    if (P.has('k_throw') && ms.combo % 3 === 0) setTimeout(() => throwDagger(s), 60);
    ms.hitAt = s.swing * (kind === 'jab' ? 0.3 : kind === 'thrust' ? 0.34 : 0.36);
    G.sfx.swing(false, P.melee.def.mcat);
    if (P.weapon) P.weapon.reloading = false;
  }
  function startHeavy(s) {
    ms.ph = 'hwind'; ms.t = 0; ms.dur = s.heavy[1]; ms.hitDone = false; ms.parried = false;
    G.sfx.mech('boltBack', 0, 0.35);
  }
  function spawnGlow(col, k) {
    if (!mm) return;
    const tp = tipWorld();
    const c = new THREE.Color(col);
    G.fx.add.spawn(tp.x, tp.y, tp.z, U.rand(-0.3, 0.3), U.rand(0, 0.6), U.rand(-0.3, 0.3), 0.35, 0.05 * k, 0.01, c.r, c.g, c.b, 0.9, 0, 0);
  }
  function tipWorld() {
    mm.wg.updateMatrixWorld(true);
    const p = mm.wg.localToWorld(V(0, mm.tipY, 0));
    if (mm.def.model === 'fists') { mm.r.updateMatrixWorld(true); p.copy(mm.r.localToWorld(V(0, 0, -0.05))); }
    p.z *= 0.9;
    return G.camera.localToWorld(p);
  }

  function doHit(s, heavy) {
    const C = G.combat;
    const o = G.camera.position.clone(), f = P.forward();
    const def = P.melee.def;
    const cleave = heavy && P.has('k_cleave');
    let range = s.range + (heavy ? 0.6 : 0) + (cleave ? 0.8 : 0);
    const arc = cleave ? -1.1 : heavy ? s.arc - 0.12 : s.arc;
    let dmg = s.dmg * (heavy ? s.heavy[0] : 1) * (1 + 0.08 * (W.devour || 0));
    if (def.trait === 'midas' && heavy && G.game.run.coins >= 50) { G.game.run.coins -= 50; dmg *= 3; G.fx.sparks(o.clone().addScaledVector(f, 1.5), null, 20, 0xffd040, 6); G.sfx.coins(5); }
    const maxT = s.trait === 'pierceLine' || cleave ? 99 : s.trait === 'sweep' || s.trait === 'reap' ? 8 : heavy ? 5 : 3;
    const targets = new Map();
    const ray = G.enemies.raycastAll(o, f, range, null, 0.45);
    ray.sort((a, b) => a.t - b.t);
    for (const h of ray) { targets.set(h.e, h.part === 'head'); if (s.trait !== 'pierceLine') break; }
    for (const e of G.enemies.inRadius(o, range)) {
      if (targets.size >= maxT) break;
      if (targets.has(e)) continue;
      const c = e.centerPos(); const to = c.clone().sub(o); const d = to.length(); to.divideScalar(Math.max(0.001, d));
      if (to.dot(f) < arc && d > e.radius + 0.7) continue;
      if (d - e.radius > range) continue;
      if (!G.world.los(o, c)) continue;
      targets.set(e, false);
    }
    let hit = false;
    for (const [e, head] of targets) {
      hit = true;
      // attacking from behind: the enemy faces away from us
      const ef = V(Math.sin(e.yaw || 0), 0, Math.cos(e.yaw || 0)), toMe = P.pos.clone().sub(e.pos).setY(0).normalize();
      const backstab = !e.boss && ef.dot(toMe) < -0.3;
      const info = { src: 'melee', heavy, backstab, head, headMul: s.headMul, part: head ? 'head' : 'body', dir: f.clone(), knock: s.knock * (heavy ? 1.8 : 1), pos: e.centerPos(), elem: s.elem, elemChance: s.elemChance, shieldMul: s.shieldMul, critBonus: s.critChance, lifesteal: s.lifesteal };
      let d = dmg;
      if (heavy && s.trait === 'reap' && !e.boss && e.hp < e.maxHp * 0.25) { d = e.hp + e.shield + 1; info.forceCrit = true; }
      C.damageEnemy(e, d, info);
      if (heavy) C.stun(e, s.trait === 'quake' ? 1.2 : s.trait === 'bash' ? 1.4 : 0.5);
      if (s.trait === 'thunder' && (heavy || Math.random() < 0.4)) { C.chain(e, 2, d * 0.35, 8, { src: 'melee', proc: true }); G.fx.strike(e.centerPos(), 0xcfe0ff, heavy); }
      G.fx.blood(e.centerPos(), f, e.bloodColor || 0x6a0a0a, heavy ? 10 : 5);
      if (def.trait === 'midas' && !e.boss) C.coins(heavy ? 6 : 2, e.centerPos());
      if (def.trait === 'devour' && !e.alive && e.mut) { W.devour = Math.min(10, (W.devour || 0) + 1); C.heal(P.stats.maxHp * 0.05); G.ui.toastSmall(`🌑 魂を喰らった（${W.devour}重）`); }
    }
    // destructibles
    for (const ds of G.world.destructibles) if (ds.alive && ds.pos.distanceTo(o) < range + 0.3) { const to = ds.pos.clone().sub(o).normalize(); if (to.dot(f) > 0.45) { C.damageDestructible(ds, 999, ds.pos); hit = true; } }
    // wall impact sparks when hitting nothing
    if (!hit) { const wh = G.world.raycast(o, f, range * 0.9); if (wh) { G.fx.sparks(wh.point, wh.normal, def.mcat === 'fist' ? 0 : 6, 0xffd090, 4); G.fx.dust(wh.point, wh.normal, 0x8a8070, 2); G.sfx.impact(wh.point, wh.c.surf); } }
    // slash wave (buff): light attacks reach further
    if (!heavy && P.has('k_wave')) lineStrike(o, f, 7, dmg * 0.45, targets, 1.0, 0xc8e0ff, null);
    if (heavy && P.has('k_quake') && s.trait !== 'quake') {
      const pos = P.pos.clone();
      C.explode(pos, 3.5, dmg * 0.45, { src: 'melee', noFx: true, knock: 8, proc: true });
      for (const e of G.enemies.inRadius(pos, 4)) C.stun(e, 0.9);
      G.fx.ring(pos.clone().setY(pos.y + 0.1), 3.5, 0xd0b080, 0.4); G.fx.dust(pos, V(0, 1, 0), 0x8a7a60, 10); G.sfx.explosion(pos, 0.35); P.addShake(0.4);
    }
    // heavy specials
    if (heavy) {
      const tr = s.trait;
      if (tr === 'quake') {
        const pos = P.pos.clone();
        C.explode(pos, 4.8, dmg * 0.55, { src: 'melee', noFx: true, knock: 10, proc: true });
        for (const e of G.enemies.inRadius(pos, 5.3)) C.stun(e, 1.2);
        G.fx.ring(pos.clone().setY(pos.y + 0.1), 5, 0xd0b080, 0.5); G.fx.dust(pos, V(0, 1, 0), 0x8a7a60, 16); G.sfx.explosion(pos, 0.5); P.addShake(0.6);
      } else if (tr === 'flameWave' || tr === 'beam') {
        const len = 16, from = o.clone().addScaledVector(f, 0.8), to = o.clone().addScaledVector(f, len);
        const wh = G.world.raycast(o, f, len); if (wh) to.copy(wh.point);
        const L = to.distanceTo(o);
        for (const e of G.enemies.inRadius(o.clone().addScaledVector(f, L / 2), L / 2 + 1.5)) {
          if (targets.has(e)) continue;
          const c = e.centerPos(); const t = c.clone().sub(o).dot(f); if (t < 0 || t > L) continue;
          const perp = c.clone().sub(o.clone().addScaledVector(f, t)).length(); if (perp > 1.4 + e.radius) continue;
          C.damageEnemy(e, dmg * 0.7, { src: 'melee', pos: c, dir: f.clone(), knock: 4, elem: tr === 'flameWave' ? 'burn' : null, elemChance: 1, noMarker: false, shieldMul: 1.4 });
        }
        if (tr === 'flameWave') { G.fx.beam(from, to, 0xff7a20, 0.35, 0.3); for (let i = 0; i < 18; i++) { const p = from.clone().lerp(to, i / 18); G.fx.flameLick(p.x, p.y - 0.3, p.z, 1.2); } G.sfx.whoosh(0.5, 0.8); }
        else { G.fx.beam(from, to, 0xffe8a0, 0.4, 0.35); G.fx.beam(from, to, 0xffffff, 0.12, 0.25); G.fx.flash(from, 0xffe0a0, 30, 0.2, 10); G.sfx.launcher('rail'); }
      } else if (tr === 'thunder') {
        let n = 0;
        for (const e of G.enemies.inRadius(o.clone().addScaledVector(f, 5), 7)) {
          if (n++ >= 4) break;
          const c = e.centerPos();
          G.fx.lightning(c.clone().add(V(U.rand(-1, 1), 14, U.rand(-1, 1))), c, 0xd8e4ff);
          C.damageEnemy(e, dmg * 0.6, { src: 'melee', pos: c, elem: 'shock', elemChance: 1, shieldMul: 2, noMarker: true });
        }
        if (n) { G.sfx.zap(o); G.fx.flash(o.clone().addScaledVector(f, 4), 0xc8d8ff, 40, 0.25, 14); P.addShake(0.4); }
      }
    }
    G.sfx.meleeHit(hit, def.mcat, heavy);
    if (hit) {
      P.addShake(heavy ? 0.45 : 0.18);
      G.buffs.emit('onMeleeHit', { heavy });
    }
  }

  // damage everything along a short line ahead (slash waves)
  function lineStrike(o, f, len, dmg, skip, width, col, elem) {
    const C = G.combat;
    const wh = G.world.raycast(o, f, len); const L = wh ? wh.t : len;
    const from = o.clone().addScaledVector(f, 0.8), to = o.clone().addScaledVector(f, L);
    for (const e of G.enemies.inRadius(o.clone().addScaledVector(f, L / 2), L / 2 + 1.5)) {
      if (skip && skip.has(e)) continue;
      const c = e.centerPos(); const t = c.clone().sub(o).dot(f); if (t < 0 || t > L) continue;
      if (c.clone().sub(o.clone().addScaledVector(f, t)).length() > width + e.radius) continue;
      C.damageEnemy(e, dmg, { src: 'melee', proc: true, pos: c, dir: f.clone(), knock: 2, elem, elemChance: elem ? 1 : 0 });
    }
    G.fx.beam(from, to, col, 0.18, 0.18);
  }
  function throwDagger(s) {
    if (!P.meleeMode) return;
    const o = G.camera.position.clone(), f = P.forward();
    const p = G.combat.spawnProjectile({ kind: 'nail', pos: o.clone().addScaledVector(f, 0.6), vel: f.clone().multiplyScalar(70), grav: 4, owner: 'player', dmg: s.dmg * 0.8, radius: 0.12, pierce: 3, life: 3, headMul: 2, info: { src: 'melee', elem: 'bleed', elemChance: 1 } });
    G.sfx.swing(false, 'knife');
    return p;
  }

  // ---------------- animation ----------------
  const tmpP = V(), tmpR = V();
  const L = (a, b, k) => a + (b - a) * k;
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function lerp6(A, B, k) { return [L(A[0], B[0], k), L(A[1], B[1], k), L(A[2], B[2], k), L(A[3], B[3], k), L(A[4], B[4], k), L(A[5], B[5], k)]; }
  let prevTip = null;
  function animateMelee(dt, s) {
    if (!mm) return;
    const def = mm.def, kind = W.meleeKind(def);
    const fist = def.model === 'fists', twin = def.model === 'twin';
    // rest poses: [x, y, z, rx, ry, rz]
    const isScythe = def.model === 'scythe';
    const REST = fist ? [0.19, -0.13, -0.36, 0.62, 0.36, 0.24] : kind === 'thrust' ? [0.2, -0.22, -0.32, -1.25, 0.55, 0.12] : isScythe ? [0.26, -0.24, -0.42, -0.72, 1.12, 0.32] : [0.22, -0.23, -0.39, -0.88, 0.68, 0.26];
    const LREST = fist ? [-0.19, -0.13, -0.36, 0.62, -0.36, -0.24] : [-0.17, -0.2, -0.36, 0, 0, 0];
    let R = REST.slice(), Lp = LREST.slice();
    const t = ms.t, sd = ms.side;
    let striking = false;
    if (ms.ph === 'light') {
      const k = t / ms.dur;
      if (kind === 'slash' && !twin) {
        const S = sd > 0 ? [0.34, -0.04, -0.34, -0.55, 0.2, -1.35] : [-0.08, -0.02, -0.38, -0.55, -0.2, 1.3];
        const E = sd > 0 ? [-0.22, -0.3, -0.5, -1.35, -0.2, 1.15] : [0.36, -0.32, -0.46, -1.35, 0.2, -1.1];
        if (k < 0.26) R = lerp6(REST, S, ease(k / 0.26));
        else if (k < 0.46) { R = lerp6(S, E, easeOut((k - 0.26) / 0.2)); striking = true; }
        else R = lerp6(E, REST, ease((k - 0.46) / 0.54));
      } else if (kind === 'thrust') {
        const S = [0.2, -0.2, -0.2, -1.45, 0, 0.05], E = [0.06, -0.12, -0.9, -1.55, 0, 0];
        if (k < 0.24) R = lerp6(REST, S, ease(k / 0.24));
        else if (k < 0.42) { R = lerp6(S, E, easeOut((k - 0.24) / 0.18)); striking = true; }
        else R = lerp6(E, REST, ease((k - 0.42) / 0.58));
      } else {
        // jabs / twin daggers: alternate hands
        const right = sd > 0 || !(fist || twin);
        const base = right ? REST : LREST;
        const E = right ? [0.03, -0.08, -0.68, fist ? 0.18 : -1.5, fist ? -0.12 : 0, fist ? -0.15 : 0.3] : [-0.03, -0.08, -0.68, twin ? -1.5 : (fist ? 0.18 : 0), fist ? 0.12 : 0, twin ? -0.3 : (fist ? 0.15 : 0)];
        const S = right ? [base[0] + 0.03, base[1] - 0.03, base[2] + 0.08, base[3], base[4], base[5]] : [base[0] - 0.03, base[1] - 0.03, base[2] + 0.08, base[3], base[4], base[5]];
        let P6;
        if (k < 0.15) P6 = lerp6(base, S, k / 0.15);
        else if (k < 0.34) { P6 = lerp6(S, E, easeOut((k - 0.15) / 0.19)); striking = true; }
        else P6 = lerp6(E, base, ease((k - 0.34) / 0.66));
        if (right) R = P6; else Lp = P6;
      }
    } else if (ms.ph === 'hwind') {
      const k = Math.min(1, t / ms.dur);
      const H = fist ? [0.26, -0.24, -0.12, 0.2, 0.3, 0] : kind === 'thrust' ? [0.26, -0.18, -0.06, -1.4, 0.1, 0.1] : [0.26, 0.1, -0.16, 0.45, 0.15, -0.35];
      R = lerp6(REST, H, ease(k));
      const sh = k * 0.004; R[0] += U.rand(-sh, sh); R[1] += U.rand(-sh, sh);
      if (twin) Lp = lerp6(LREST, [-0.26, 0.08, -0.16, 0.45, -0.15, 0.35], ease(k));
    } else if (ms.ph === 'hrec') {
      const H = fist ? [0.26, -0.24, -0.12, 0.2, 0.3, 0] : kind === 'thrust' ? [0.26, -0.18, -0.06, -1.4, 0.1, 0.1] : [0.26, 0.1, -0.16, 0.45, 0.15, -0.35];
      const E = fist ? [0.02, -0.1, -0.82, 0, -0.1, 0] : kind === 'thrust' ? [0.03, -0.12, -1.05, -1.55, 0, 0] : [0.02, -0.38, -0.62, -1.9, 0, 0.25];
      const ks = 0.1;
      if (t < ks) { R = lerp6(H, E, easeOut(t / ks)); striking = true; }
      else R = lerp6(E, REST, ease(Math.min(1, (t - ks) / Math.max(0.05, ms.dur - ks))));
      if (twin) Lp = t < ks ? lerp6([-0.26, 0.08, -0.16, 0.45, -0.15, 0.35], [-0.02, -0.38, -0.62, -1.9, 0, -0.25], easeOut(t / ks)) : lerp6([-0.02, -0.38, -0.62, -1.9, 0, -0.25], LREST, ease(Math.min(1, (t - ks) / Math.max(0.05, ms.dur - ks))));
    }
    // ---- shield: the heavy blow is a punch with the shield arm; the right hand only cocks back ----
    const shield = !!SHIELDS[def.model];
    if (shield) {
      Lp = [-0.2, -0.2, -0.4, 0, 0, 0];
      if (ms.ph === 'hwind' || ms.ph === 'hrec') {
        R = REST.slice();
        const H = [-0.16, -0.2, -0.24, 0, 0, 0], E = [-0.04, -0.12, -0.78, 0, 0, 0];
        if (ms.ph === 'hwind') { Lp = lerp6(Lp, H, ease(Math.min(1, t / ms.dur))); R[2] += 0.06 * ease(Math.min(1, t / ms.dur)); }
        else { const ks = 0.1; Lp = t < ks ? lerp6(H, E, easeOut(t / ks)) : lerp6(E, Lp, ease(Math.min(1, (t - ks) / Math.max(0.05, ms.dur - ks)))); }
        striking = false;
      }
    }
    // ---- guard: the weapon comes across in front (a shield is lifted to the middle) and is knocked back a little by each blocked hit ----
    if (gd.k > 0.001) {
      const k = ease(Math.min(1, gd.k)), kb = gd.kick * 0.05;
      const GR = shield ? [0.28, -0.32, -0.34, -1.05, 0.6, 0.35] : fist ? [0.1, -0.06, -0.3, 1.15, 0.25, 0.1] : [0.12, -0.12, -0.42, -0.2, 0.25, 1.35];
      const GL = shield ? [-0.1, -0.13, -0.4, 0, 0, 0] : fist ? [-0.1, -0.06, -0.3, 1.15, -0.25, -0.1] : Lp;
      R = lerp6(R, GR, k); Lp = lerp6(Lp, GL, k);
      R[2] += kb; Lp[2] += kb; R[1] += kb * 0.4; Lp[1] += kb * 0.4;
    }
    // ---- draw flourish ----
    let spinX = 0, spinZ = 0, tossY = 0, tossZ = 0;
    if (ms.draw && ms.ph === 'idle') {
      const d = ms.draw; d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      const sm = (a, b) => U.clamp((k - a) / (b - a), 0, 1);
      const low = [REST[0] + 0.05, REST[1] - 0.2, REST[2] + 0.06, REST[3], REST[4], REST[5]];
      const catchAt = { flip: 0.8, twirl: 0.74, toss: 0.72, baton: 0.78, fists: 0.4, knifetoss: 0.74 }[d.style];
      if (d.style === 'knifetoss') {
        // the knife leaves the hand: it is already in the air on the first frame (no dead frames), turns twice
        // around its own balance point at the top of a short arc, and drops back into the palm, which rises to meet it
        const f = sm(0, catchAt);
        const air = 0.05 + Math.sin((0.18 + f * 0.82) * Math.PI) * 0.12 * (1 - f * 0.35); // starts mid-rise, apex, falls into the hand
        tossY = f < 1 ? air * (1 - easeOut(Math.max(0, (f - 0.82) / 0.18))) : 0;
        const a = 0.7 * (1 - f) + easeOut(f) * Math.PI * 4; // two full turns (already turning on frame 1), ending upright
        spinX = -a;
        const open = [REST[0] + 0.01, REST[1] - 0.09, REST[2] + 0.03, REST[3], REST[4], REST[5]];
        if (k < catchAt) R = lerp6(open, [REST[0], REST[1] - 0.02, REST[2], REST[3], REST[4], REST[5]], ease(sm(0.35, catchAt)));
        else { R = REST.slice(); R[1] -= 0.035 * Math.sin(sm(catchAt, 1) * Math.PI); R[3] += 0.12 * Math.sin(sm(catchAt, 1) * Math.PI); }
        // rotate about the knife's middle, not the grip: keep the middle where the resting tilt (R[3]) puts it
        const cy = 0.13, t0 = R[3], t1 = R[3] + spinX;
        tossY += cy * Math.cos(t0) - cy * Math.cos(t1); tossZ = cy * Math.sin(t0) - cy * Math.sin(t1);
        tossZ -= 0.07 * Math.sin(Math.min(1, f) * Math.PI); // out in front of the hand, away from the lens
        if (f > 0 && f < 1) striking = true;
      } else if (d.style === 'flip') {
        // flick the blade up, it somersaults twice and lands back in the palm
        const up = [REST[0] - 0.02, REST[1] + 0.03, REST[2] - 0.02, REST[3], REST[4], REST[5]];
        if (k < 0.12) R = lerp6(low, up, easeOut(k / 0.12)); else if (k < catchAt) R = lerp6(up, REST, ease(sm(0.12, catchAt)));
        else { R = REST.slice(); R[1] -= 0.03 * Math.sin(sm(catchAt, 1) * Math.PI); }
        const f = sm(0, catchAt); tossY = Math.sin(f * Math.PI) * 0.24; spinX = 0.9 * (1 - f) - f * Math.PI * 4; // already mid-flip on the first frame
        if (f > 0 && f < 1) striking = true;
      } else if (d.style === 'twirl') {
        // rises from the hip while the blade spins a full circle in the wrist, then snaps into guard
        R = lerp6([REST[0] + 0.1, REST[1] - 0.22, REST[2] + 0.08, REST[3], REST[4], REST[5]], REST, easeOut(sm(0, 0.7)));
        const f = sm(0, catchAt); spinZ = 0.8 * (1 - f) - easeOut(f) * Math.PI * 2; spinX = Math.sin(f * Math.PI) * 0.5;
        if (f > 0 && f < 1) striking = true;
        if (k > catchAt) { const s2 = Math.sin(sm(catchAt, 1) * Math.PI); R[2] -= 0.04 * s2; R[3] -= 0.12 * s2; }
      } else if (d.style === 'toss') {
        // tossed up a little, flips once, caught with a heavy dip
        const up = [REST[0] - 0.01, REST[1] - 0.02, REST[2], REST[3], REST[4], REST[5]];
        if (k < 0.08) R = lerp6(low, up, easeOut(k / 0.08)); else if (k < catchAt) R = up.slice();
        else { R = lerp6(up, REST, ease(sm(catchAt, 1))); R[1] -= 0.08 * Math.sin(sm(catchAt, 1) * Math.PI); }
        const f = sm(0.04, catchAt); tossY = Math.sin(f * Math.PI) * 0.18; spinX = -f * Math.PI * 2;
        R[2] -= 0.16 * Math.sin(sm(0.08, catchAt) * Math.PI); R[0] -= 0.05 * Math.sin(sm(0.08, catchAt) * Math.PI); // keep the long haft away from the lens
        if (f > 0 && f < 1) striking = true;
      } else if (d.style === 'baton') {
        // the shaft spins like a baton twice in front of you while it swings into place
        R = lerp6([REST[0] - 0.24, REST[1] - 0.16, REST[2] - 0.04, REST[3], REST[4], REST[5]], REST, easeOut(sm(0, 0.85)));
        const f = sm(0, catchAt); spinZ = -easeOut(f) * Math.PI * 4;
        if (f > 0 && f < 1) striking = true;
      } else if (d.style === 'fists') {
        // both fists come up and bump knuckles, then settle into guard with a little roll of the wrists
        const RB = [0.05, -0.16, -0.42, 0, 0, 0.35], LB = [-0.05, -0.16, -0.42, 0, 0, -0.35];
        const lowL = [LREST[0] - 0.06, LREST[1] - 0.34, LREST[2] + 0.1, 0, 0, 0];
        if (k < catchAt) { R = lerp6(low, RB, easeOut(k / catchAt)); Lp = lerp6(lowL, LB, easeOut(k / catchAt)); }
        else { const f = sm(catchAt, 1); R = lerp6(RB, REST, ease(f)); Lp = lerp6(LB, LREST, ease(f)); R[5] += Math.sin(f * Math.PI * 2) * 0.25; R[3] -= Math.sin(f * Math.PI) * 0.3; }
      }
      if (!d.caught && k >= catchAt) {
        d.caught = true;
        if (d.style === 'fists') { G.sfx.melee && G.sfx.melee(false); P.addShake && P.addShake(0.05); }
        else if (d.style === 'toss') { G.sfx.mech('boltFwd', 0, 0.75); P.addShake && P.addShake(0.08); }
        else if (d.style === 'knifetoss') { G.sfx.mech('magIn', 0, 1.6); P.addShake && P.addShake(0.03); }
        else { G.sfx.mech('magIn', 0, d.style === 'twirl' ? 1.5 : 1.25); if (d.style === 'twirl' || mm.glow) for (let i = 0; i < 6; i++) spawnGlow(mm.glow || 0xffffff, 0.9); }
      }
      if (k >= 1) ms.draw = null;
    }
    // grenade throw dips the hands
    if (W.anim.throwT > 0) { W.anim.throwT -= dt; const k = Math.sin(Math.min(1, W.anim.throwT / 0.4) * Math.PI); R[1] -= 0.2 * k; Lp[1] -= 0.2 * k; }
    if (G.ItemAnim.lower > 0.001) { const k = G.ItemAnim.lower; R[1] -= 0.34 * k; Lp[1] -= 0.34 * k; }
    // bob / sway / sprint
    const bob = P.bobAmt || 0;
    const ox = Math.cos(P.bobPhase) * 0.012 * bob + W.anim.swayX, oy = -Math.abs(Math.sin(P.bobPhase)) * 0.014 * bob + W.anim.swayY + Math.sin(G.game.time * 1.6) * 0.002 + P.landDip * 0.15 + P.eyeOff * 0.1;
    W.anim.swayX = U.damp(W.anim.swayX, U.clamp(-I.mx * 0.0006, -0.05, 0.05), 10, dt);
    W.anim.swayY = U.damp(W.anim.swayY, U.clamp(I.my * 0.0006, -0.05, 0.05), 10, dt);
    const spr = W._spr = U.damp(W._spr || 0, P.sprinting ? 1 : 0, 10, dt);
    let sw = 0; if (W.switchT > 0) sw = W.switchT / 0.3;
    mm.r.position.set(R[0] + ox + 0.03 * spr, R[1] + oy - 0.04 * spr - 0.3 * sw, R[2]);
    mm.r.rotation.set(fist ? R[3] - 0.25 * spr : 0, R[4], fist ? R[5] : 0);
    if (!fist) { mm.wg.rotation.set(R[3] - 0.2 * spr - 0.6 * sw + spinX, R[4], R[5] + 0.3 * spr + spinZ); mm.wg.position.y = tossY; mm.wg.position.z = tossZ; mm.r.rotation.set(0, 0, 0); }
    mm.l.position.set(Lp[0] + ox - 0.03 * spr, Lp[1] + oy - 0.04 * spr - 0.3 * sw, Lp[2]);
    mm.l.rotation.set(fist ? Lp[3] - 0.25 * spr : 0, Lp[4], fist ? Lp[5] : 0);
    if (twin && mm.l.userData.knife) mm.l.userData.knife.rotation.set(Lp[3] || -0.95, 0, Lp[5] || -0.25);
    if (twin && ms.ph === 'idle') { mm.l.userData.knife.rotation.set(-0.95 + spinX, 0, -0.25); mm.l.userData.knife.position.y = tossY; }
    // slash trail
    if (striking && !fist) {
      const tp = tipWorld();
      // the draw flourish leaves only a faint, short-lived streak (a full slash trail would smear across the screen)
      if (prevTip && prevTip.distanceTo(tp) > 0.02) { if (spinX || spinZ || tossY) { if (prevTip.distanceTo(tp) < 0.6) G.fx.tracer(prevTip, tp, mm.glow || 0xb8c4d8, 0.008, 0.05); } else G.fx.tracer(prevTip, tp, mm.glow || 0xe8eef8, ms.ph === 'hrec' ? 0.05 : 0.03, 0.14); }
      prevTip = tp;
    } else prevTip = null;
    if (mm.glow && Math.random() < dt * 6) spawnGlow(mm.glow, 0.4);
    W.isScoped = false;
    W.vmRoot.visible = G.game.state !== 'dead' && G.avatar.tpK < (G.avatar.returning ? 0.55 : 0.3);
    G.ui.scope(false);
  }
})();
