'use strict';
// Melee weapon slot (key 3): viewmodels, light combo (LMB), heavy blow (RMB), hit detection and special traits.
(function () {
  const W = G.weapons, U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, mm = null; // current melee viewmodel {group, r, l, tip, def}
  const ms = { ph: 'idle', t: 0, dur: 0, hitAt: 0, hitDone: false, side: 1, combo: 0, lungeT: 0 };
  W.ms = ms;

  W.makeMelee = function (id) { G.save.mark('items', id); return { id, def: G.MELEE_BY_ID[id], lv: 0 }; };
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
    return P.melee.def.moveMul * (1 + (P.stats.meleeMove || 0)) * (heavy ? 0.45 : 1);
  };
  W.meleeBusy = () => ms.ph !== 'idle';

  // ---------------- viewmodels ----------------
  function buildMelee(def) {
    const mats = W.mats, PG = G.Props.PG;
    const root = new THREE.Group();
    const r = new THREE.Group(), l = new THREE.Group();
    root.add(r, l);
    const mk = (o) => { const m = new THREE.MeshStandardMaterial(o); m.envMapIntensity = 2.4; return m; };
    const blade = mk({ color: 0xc8ccd2, metalness: 0.95, roughness: 0.18 });
    const dark = mk({ color: 0x2a2420, roughness: 0.8 });
    const wrap = mk({ color: 0x3a1a14, roughness: 0.9, map: G.Tex.tex.cloth.map });
    const gold = mk({ color: 0xd8b060, metalness: 1, roughness: 0.25 });
    let bladeM = blade;
    if (def.model === 'frostknife') bladeM = mk({ color: 0xbfe8ff, metalness: 0.3, roughness: 0.05, emissive: 0x2a6a9a, emissiveIntensity: 0.9, transparent: true, opacity: 0.92 });
    if (def.model === 'emberblade') bladeM = mk({ color: 0x401008, metalness: 0.6, roughness: 0.3, emissive: 0xff5a10, emissiveIntensity: 1.6 });
    if (def.model === 'holy') bladeM = mk({ color: 0xfff6e0, metalness: 0.9, roughness: 0.1, emissive: 0xffe0a0, emissiveIntensity: 0.9 });
    if (def.model === 'twin') bladeM = mk({ color: 0x6a8a3a, metalness: 0.7, roughness: 0.25, emissive: 0x1a3a00, emissiveIntensity: 0.8 });
    const box = (p, w, h, d, x, y, z, m, rx, ry, rz) => { const o = new THREE.Mesh(PG.box, m); o.scale.set(w, h, d); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); p.add(o); return o; };
    const cyl = (p, rad, len, x, y, z, m) => { const o = new THREE.Mesh(PG.cyl8, m); o.scale.set(rad, len, rad); o.position.set(x || 0, y || 0, z || 0); p.add(o); return o; };
    const cone = (p, rad, len, x, y, z, m, rx) => { const o = new THREE.Mesh(PG.cone, m); o.scale.set(rad, len, rad); o.position.set(x || 0, y || 0, z || 0); o.rotation.x = rx || 0; p.add(o); return o; };
    const fist = (p, right) => {
      const palm = box(p, 0.06, 0.08, 0.08, 0, 0, 0, mats.glove);
      box(p, 0.065, 0.04, 0.06, right ? -0.01 : 0.01, 0.035, -0.02, mats.glove);
      const arm = new THREE.Mesh(PG.cyl8, mats.sleeve); arm.scale.set(0.04, 0.42, 0.04); arm.rotation.x = Math.PI / 2 - 0.25; arm.position.set(right ? 0.03 : -0.03, -0.06, 0.22); p.add(arm);
      const cuff = new THREE.Mesh(PG.cyl8, mats.glove); cuff.scale.set(0.036, 0.05, 0.036); cuff.rotation.x = Math.PI / 2 - 0.25; cuff.position.set(0, -0.015, 0.05); p.add(cuff);
      return palm;
    };
    // weapon pivot = grip, local +Y = blade direction
    const wg = new THREE.Group(); r.add(wg);
    let tipY = 0.3, glow = null;
    const knife = (p, len, m) => { cyl(p, 0.016, 0.11, 0, 0, 0, dark); box(p, 0.03, 0.012, 0.06, 0, 0.06, 0, mats.steel); box(p, 0.006, len, 0.03, 0, 0.066 + len / 2, 0, m); cone(p, 0.016, 0.04, 0, 0.066 + len + 0.02, 0, m); return 0.066 + len + 0.04; };
    switch (def.model) {
      case 'fists': break;
      case 'knife': tipY = knife(wg, 0.18, bladeM); break;
      case 'sknife': {
        cyl(wg, 0.018, 0.12, 0, 0, 0, wrap); box(wg, 0.022, 0.02, 0.022, 0, -0.065, 0, mats.steel);
        box(wg, 0.034, 0.012, 0.075, 0, 0.065, 0, mats.steel);
        box(wg, 0.007, 0.17, 0.034, 0, 0.155, -0.002, bladeM);
        box(wg, 0.009, 0.15, 0.008, 0, 0.15, 0.018, dark);
        cone(wg, 0.018, 0.045, 0, 0.262, -0.004, bladeM);
        tipY = 0.285; break;
      }
      case 'frostknife': tipY = knife(wg, 0.2, bladeM); glow = 0x80d0ff; break;
      case 'twin': { tipY = knife(wg, 0.17, bladeM); const lg = new THREE.Group(); l.add(lg); knife(lg, 0.17, bladeM); lg.rotation.set(-0.9, 0, -0.2); l.userData.knife = lg; break; }
      case 'kukri': { cyl(wg, 0.017, 0.12, 0, 0, 0, mats.wood); box(wg, 0.007, 0.16, 0.045, 0, 0.14, -0.01, bladeM, -0.25); box(wg, 0.007, 0.12, 0.05, 0, 0.27, -0.05, bladeM, 0.35); tipY = 0.33; break; }
      case 'machete': { cyl(wg, 0.018, 0.13, 0, 0, 0, dark); box(wg, 0.006, 0.4, 0.055, 0, 0.27, -0.005, bladeM); box(wg, 0.007, 0.06, 0.06, 0, 0.47, -0.01, bladeM, 0.4); tipY = 0.5; break; }
      case 'katana': case 'emberblade': case 'holy': {
        const h = def.model === 'holy';
        cyl(wg, 0.017, 0.2, 0, 0, 0, h ? gold : wrap);
        if (h) box(wg, 0.035, 0.025, 0.16, 0, 0.11, 0, gold); else cyl(wg, 0.042, 0.01, 0, 0.105, 0, gold);
        const bl = box(wg, 0.006, 0.66, h ? 0.04 : 0.03, 0, 0.44, 0, bladeM, h ? 0 : 0.03);
        cone(wg, h ? 0.022 : 0.016, 0.06, 0, 0.8, h ? 0 : -0.012, bladeM);
        tipY = 0.82; if (def.model === 'emberblade') glow = 0xff6a20; if (h) glow = 0xfff0c0; bl.userData.glow = true; break;
      }
      case 'rapier': { cyl(wg, 0.014, 0.12, 0, 0, 0, dark); const cup = new THREE.Mesh(PG.sph, gold); cup.scale.set(0.05, 0.025, 0.05); cup.position.y = 0.075; wg.add(cup); box(wg, 0.004, 0.78, 0.008, 0, 0.47, 0, bladeM); tipY = 0.86; break; }
      case 'axe': { cyl(wg, 0.018, 0.6, 0, 0.18, 0, mats.wood); box(wg, 0.014, 0.15, 0.17, 0, 0.42, -0.08, bladeM); box(wg, 0.02, 0.06, 0.06, 0, 0.44, 0.04, mats.steel); tipY = 0.48; break; }
      case 'hammer': case 'thunder': {
        const th = def.model === 'thunder';
        cyl(wg, 0.02, 0.62, 0, 0.2, 0, th ? wrap : mats.wood);
        box(wg, 0.11, 0.11, 0.2, 0, 0.5, 0, th ? mk({ color: 0x5a5e66, metalness: 0.85, roughness: 0.3 }) : mats.steel);
        if (th) { for (const z of [-0.06, 0.06]) { const c = new THREE.Mesh(PG.torus, W.mats.coil); c.scale.set(0.06, 0.06, 0.06); c.position.set(0, 0.5, z); wg.add(c); } glow = 0xc8d8ff; }
        tipY = 0.55; break;
      }
      case 'spear': { cyl(wg, 0.016, 1.35, 0, 0.3, 0, mats.wood); box(wg, 0.035, 0.03, 0.035, 0, 0.98, 0, mats.steel); cone(wg, 0.03, 0.2, 0, 1.1, 0, bladeM); tipY = 1.2; break; }
      case 'scythe': {
        cyl(wg, 0.018, 1.15, 0, 0.32, 0, mats.wood);
        const bg = new THREE.Group(); bg.position.set(0, 0.88, 0); wg.add(bg);
        for (let i = 0; i < 5; i++) box(bg, 0.006, 0.05 - i * 0.006, 0.12, 0, -i * 0.022, -0.06 - i * 0.11, mk({ color: 0x8a8c90, metalness: 0.9, roughness: 0.3, emissive: 0x200810 }), -0.18 * i);
        tipY = 0.9; glow = 0x9a2040; break;
      }
    }
    fist(r, true);
    if (def.model === 'fists' || def.model === 'twin') fist(l, false);
    else l.visible = false;
    wg.rotation.set(0, 0, 0);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    return { group: root, r, l, wg, tipY, glow, def };
  }
  W.meleeDisplayModel = function (def) {
    if (!W.mats) return new THREE.Group();
    const m = buildMelee(def);
    if (def.model === 'fists') { m.r.children.slice(-4).forEach((o) => { if (o.geometry === G.Props.PG.cyl8 && o.scale.y > 0.3) o.visible = false; }); m.l.visible = false; return m.group; }
    m.r.children.filter((o) => o !== m.wg).forEach((o) => o.visible = false); m.l.visible = false;
    m.wg.rotation.set(0, 0, Math.PI / 2.4);
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
  W.keyLabel = (t) => { const i = W.order().indexOf(t); return i < 0 ? '' : i < 3 ? `[${i + 1}] ` : '[⇕] '; };
  W.curTok = () => (G.player.meleeMode ? 'm' : G.player.weapon);
  W.selectTok = function (t) { if (t === 'm') W.setMelee(); else if (t) W.switchTo(G.player.weapons.indexOf(t)); };
  W.tokInfo = function (t) {
    if (t === 'm') { const d = G.player.melee.def; return { icon: d.icon, name: d.name, rarity: d.rarity, sub: '近接' }; }
    return { icon: t.def.icon, name: t.def.name, rarity: t.def.rarity, sub: t.lv ? '+' + t.lv : '' };
  };
  W.kh = null; // a number key being held: tap = switch, hold = choose which weapon lives on that key
  W.handleSwitch = function () {
    P = G.player;
    const o = W.order();
    for (let k = 0; k < 3; k++) if (I.hit('w' + (k + 1))) { if (o[k]) W.selectTok(o[k]); if (k < 2 && !W.kh) W.kh = { k, t0: G.game.time, wheel: false }; }
    const kh = W.kh;
    if (kh) {
      if (I.down('w' + (kh.k + 1))) {
        if (!kh.wheel && G.game.time - kh.t0 > 0.3 && W.gunsInOrder().length > 1) { kh.wheel = true; G.ui.weaponWheel(kh.k, W.gunsInOrder(), o[kh.k] || W.gunsInOrder()[0]); G.sfx.ui('open'); }
        if (kh.wheel) { G.ui.itemWheelMove(I.mx, I.my); G.game.chronoT = Math.max(G.game.chronoT || 0, 0.1); G.game.chronoSlow = 0.65; }
      } else {
        if (kh.wheel) {
          const t = G.ui.itemWheelClose();
          if (t) {
            const j = o.indexOf(t), k = kh.k;
            if (j !== k) {
              while (o.length <= k) o.push(null);
              o[j] = o[k]; o[k] = t;
              P.wOrder = o.map((x) => x || null);
              const inf = W.tokInfo(t);
              G.ui.toastSmall(`🔁 [${G.K('w' + (k + 1))}] に ${inf.icon} ${inf.name} を割り当て`);
            }
            W.selectTok(t); G.sfx.ui('click'); G.ui.refreshWeapon();
          }
        }
        W.kh = null;
      }
    }
    if (I.wheel && !(W.kh && W.kh.wheel)) {
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
    if (ms.ph === 'idle' && !blocked) {
      if (I.mpressed[2]) startHeavy(s);
      else if (I.mouse[0]) startLight(s);
    } else if (ms.ph === 'light' && !blocked && ms.t >= ms.dur * 0.8 && (I.mouse[0] || I.mpressed[0])) {
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
      if (heavy) C.stun(e, s.trait === 'quake' ? 1.2 : 0.5);
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
    const REST = fist ? [0.17, -0.2, -0.36, 0, 0, 0] : kind === 'thrust' ? [0.2, -0.22, -0.32, -1.25, 0, 0.12] : [0.21, -0.24, -0.4, -0.95, 0, 0.25];
    const LREST = [-0.17, -0.2, -0.36, 0, 0, 0];
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
        const E = right ? [0.04, -0.1, -0.72, fist ? 0 : -1.5, 0, fist ? 0 : 0.3] : [-0.04, -0.1, -0.72, twin ? -1.5 : 0, 0, twin ? -0.3 : 0];
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
    mm.l.rotation.set(0, Lp[4], 0);
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
