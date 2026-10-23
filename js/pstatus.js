'use strict';
// Player status-effect feedback: ring-gauge icons, tinted HP bar, coloured screen edges, tinted hands / weapon / avatar, and particles.
(function () {
  const PS = (G.PStatus = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  PS.DEFS = {
    burn: { icon: '🔥', name: '炎上', col: '#ff7a20', rgb: [1, 0.45, 0.1] },
    poison: { icon: '☠️', name: '毒', col: '#6ad040', rgb: [0.35, 0.85, 0.2] },
    shock: { icon: '⚡', name: '電撃', col: '#ffe060', rgb: [1, 0.9, 0.35] },
    slow: { icon: '🐌', name: '鈍化', col: '#70b0ff', rgb: [0.45, 0.7, 1] },
  };
  const ORDER = ['burn', 'poison', 'shock', 'slow'];
  const max = {}, prev = {};
  let host = null, vig = null, hpFill = null, ghost = null, acc = 0;
  PS.els = new Map();
  const tmpC = new THREE.Color(), baseKey = new THREE.Color();
  let baseSaved = false;

  function ensureDom() {
    if (host) return;
    const hp = G.ui.el && G.ui.el.hpFill;
    hpFill = hp;
    host = document.createElement('div'); host.id = 'pstatus';
    const anchor = document.getElementById('hp-wrap');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor); else G.ui.el.hud.appendChild(host);
    vig = document.createElement('div'); vig.id = 'st-vig'; document.body.appendChild(vig);
    // projected HP from heal-over-time items (bandage, regen...) drawn behind the HP fill
    ghost = document.createElement('div'); ghost.id = 'hp-ghost';
    if (hp && hp.parentNode) hp.parentNode.insertBefore(ghost, hp);
  }
  // emissive glow on every viewmodel material (weapon, melee weapon, hands); originals are restored afterwards
  let vmMats = [], vmScan = 0, lastTint = null;
  const glowC = new THREE.Color();
  function tintViewmodel(top, t, dt, look) {
    const W = G.weapons; if (!W.vmRoot) return;
    vmScan -= dt;
    if (vmScan <= 0 || (top && !vmMats.length)) {
      vmScan = 0.5;
      const set = new Set();
      W.vmRoot.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) set.add(o.material); });
      for (const m of set) if (!m.userData.baseE) m.userData.baseE = m.emissive.clone();
      // restore anything that left the viewmodel (weapon switched) before forgetting it
      for (const m of vmMats) if (!set.has(m) && m.userData.baseE) m.emissive.copy(m.userData.baseE);
      vmMats = [...set];
    }
    if (!top && !lastTint) return;
    if (top) {
      const d = look || PS.DEFS[top];
      let k = (look ? look.glow : 0.16) + Math.sin(t * (look ? (look.inv ? 11 : 3) : 5)) * (look && look.inv ? 0.2 : 0.07) + (look ? guardT * 0.4 : 0);
      if (top === 'burn') k = 0.14 + Math.random() * 0.14;
      if (top === 'shock') k = Math.random() < 0.3 ? 0.45 : 0.08;
      glowC.setRGB(d.rgb[0] * k, d.rgb[1] * k, d.rgb[2] * k);
      for (const m of vmMats) m.emissive.copy(m.userData.baseE).add(glowC);
      lastTint = top;
    } else {
      for (const m of vmMats) if (m.userData.baseE) m.emissive.copy(m.userData.baseE);
      lastTint = null;
    }
  }
  // self-buff ultimates change your look the same way statuses do (a status wins if both are active)
  PS.LOOKS = {
    // real invulnerability (not dash i-frames): the grandest look of all, in icy cyan / blue
    invuln: { rgb: [0.45, 0.9, 1], col: '120,220,255', glow: 0.55, shield: true, inv: true, mote: [0.75, 0.97, 1], hex: 0x6fd8ff, hex2: 0xe0faff },
    ult_bastion: { rgb: [1, 0.78, 0.3], col: '255,200,90', glow: 0.3, shield: true, mote: [1, 0.85, 0.4], hex: 0xffd070, hex2: 0xffe9a0 },
    // buff ultimates: a coloured aura, a sweeping screen edge and their own particles (grander than skills)
    ult_berserk: { ult: true, rgb: [1, 0.15, 0.08], col: '255,40,20', glow: 0.32, mote: [1, 0.25, 0.1], fx: 'rage' },
    ult_titan: { ult: true, rgb: [0.95, 0.6, 0.3], col: '230,150,80', glow: 0.28, mote: [0.9, 0.6, 0.3], fx: 'stone' },
    ult_shadow: { ult: true, rgb: [0.55, 0.3, 1], col: '140,80,255', glow: 0.3, mote: [0.5, 0.3, 1], fx: 'shade' },
    ult_phoenix: { ult: true, rgb: [1, 0.5, 0.15], col: '255,120,30', glow: 0.36, mote: [1, 0.55, 0.15], fx: 'flame' },
    ult_armory: { ult: true, rgb: [1, 0.7, 0.2], col: '255,170,40', glow: 0.28, mote: [1, 0.75, 0.3], fx: 'spark' },
    ult_overcharge: { ult: true, rgb: [0.4, 0.85, 1], col: '100,210,255', glow: 0.32, mote: [0.5, 0.9, 1], fx: 'arc' },
    ult_timestop: { ult: true, rgb: [0.55, 0.75, 1], col: '140,190,255', glow: 0.3, mote: [0.8, 0.9, 1], fx: 'clock' },
    ult_inferno: { ult: true, rgb: [1, 0.35, 0.05], col: '255,90,20', glow: 0.34, mote: [1, 0.45, 0.1], fx: 'flame' },
    ult_bloodstorm: { ult: true, rgb: [0.85, 0.05, 0.12], col: '210,20,40', glow: 0.3, mote: [0.9, 0.1, 0.15], fx: 'blood' },
    ult_bladestorm: { ult: true, rgb: [0.85, 0.9, 1], col: '210,225,255', glow: 0.28, mote: [0.9, 0.95, 1], fx: 'spark' },
    // buff skills: the same idea, toned down
    berserk: { rgb: [1, 0.25, 0.15], col: '255,70,40', glow: 0.18, mote: [1, 0.3, 0.15] },
    overdrive: { rgb: [1, 0.75, 0.25], col: '255,190,70', glow: 0.16, mote: [1, 0.8, 0.35] },
    haste: { rgb: [0.4, 1, 0.75], col: '110,255,190', glow: 0.16, mote: [0.5, 1, 0.8] },
    thornarmor: { rgb: [0.55, 0.85, 0.3], col: '140,215,80', glow: 0.16, mote: [0.6, 0.85, 0.35] },
    ricostorm: { rgb: [1, 0.95, 0.4], col: '255,240,110', glow: 0.15, mote: [1, 0.95, 0.5] },
    warcry: { rgb: [1, 0.6, 0.25], col: '255,160,70', glow: 0.16, mote: [1, 0.65, 0.3] },
    healaura: { rgb: [0.4, 1, 0.5], col: '110,255,140', glow: 0.15, mote: [0.5, 1, 0.6] },
    cloak: { rgb: [0.65, 0.55, 0.9], col: '170,150,230', glow: 0.14, mote: [0.7, 0.6, 0.95] },
    chrono_fx: { rgb: [0.55, 0.75, 1], col: '140,190,255', glow: 0.15, mote: [0.7, 0.85, 1] },
    blades: { rgb: [0.85, 0.9, 1], col: '210,225,255', glow: 0.15, mote: [0.9, 0.95, 1] },
    flight_sky: { rgb: [0.8, 0.95, 1], col: '200,240,255', glow: 0.14, mote: [0.85, 0.95, 1] },
  };
  // the active look: invulnerability, then any buff temp (ultimates first), then the follow-auras / blades
  function pickLook(P, invOn) {
    if (invOn) return ['invuln', null];
    for (const id in PS.LOOKS) if (id !== 'invuln' && P.temps.has(id)) return [id, P.temps.get(id)];
    const A = G.abilities;
    const au = A && A.auras && A.auras.find((a) => a.follow && (a.kind === 'fire' || a.kind === 'drain') && a.t > 0);
    if (au) return [au.kind === 'drain' ? 'ult_bloodstorm' : 'ult_inferno', au];
    if (P.bladesT > 0) return [P.bladesUlt ? 'ult_bladestorm' : 'blades', { t: P.bladesT }];
    return [null, null];
  }
  // ultimate-only particles around the body / weapon hand
  function ultFx(look, P, dt, t) {
    const AV = G.avatar, tp = AV && AV.tpK > 0.4;
    const body = () => P.pos.clone().add(V(U.rand(-0.5, 0.5), U.rand(0.1, 1.9), U.rand(-0.5, 0.5)));
    const hand = () => (tp ? body() : (P.handPos ? P.handPos() : P.chestPos()).add(V(U.rand(-0.12, 0.12), U.rand(-0.1, 0.06), U.rand(-0.12, 0.12))));
    const n = Math.random() < dt * 30 ? 1 : 0; if (!n) return;
    const q = Math.random() < 0.5 ? hand() : body();
    switch (look.fx) {
      case 'rage': case 'flame': G.fx.flameLick(q.x, q.y, q.z, tp ? 1.1 : 0.45, look.fx === 'rage' ? 0xff3010 : 0xff8a28); break;
      case 'stone': G.fx.dust(P.pos.clone().add(V(U.rand(-0.8, 0.8), 0.05, U.rand(-0.8, 0.8))), V(0, 1, 0), 0x8a7050, 2); break;
      case 'shade': G.fx.norm.spawn(q.x, q.y, q.z, U.rand(-0.2, 0.2), U.rand(0.2, 0.6), U.rand(-0.2, 0.2), 1.2, tp ? 0.2 : 0.06, tp ? 0.6 : 0.2, 0.25, 0.12, 0.45, 0.6, -0.1, 0.5); break;
      case 'spark': G.fx.sparks(q, null, 2, look.fx === 'spark' && look.col === '210,225,255' ? 0xe0ecff : 0xffc050, 2.5); break;
      case 'arc': if (Math.random() < 0.4) { const b = hand(); G.fx.lightning(b, b.clone().add(V(U.rand(-0.3, 0.3), U.rand(-0.2, 0.3), U.rand(-0.3, 0.3))), 0x9fdcff); } break;
      case 'clock': if (Math.random() < 0.15) G.fx.ring(P.pos.clone().setY(P.pos.y + 0.05), 1.6, 0x9fc4ff, 0.5); break;
      case 'blood': G.fx.norm.spawn(q.x, q.y, q.z, U.rand(-0.6, 0.6), U.rand(-0.2, 0.6), U.rand(-0.6, 0.6), 0.8, tp ? 0.06 : 0.025, 0.02, 0.7, 0.03, 0.06, 0.9, 1.5, 0.5); break;
    }
  }
  let bvig = null, bubble = null, shards = null, guardT = 0;
  // a hit softened by the bastion: golden ring + chime + "-N 軽減"
  PS.guardHit = function (raw, taken) {
    guardT = 1;
    const P = G.player;
    G.fx.ring(P.pos.clone().setY(P.pos.y + 1), 1.6, 0xffd070, 0.3);
    G.fx.sparks(P.chestPos(), null, 10, 0xffe090, 4);
    if (G.sfx.shieldHit) G.sfx.shieldHit();
    let el = document.getElementById('guard-pop');
    if (!el) { el = document.createElement('div'); el.id = 'guard-pop'; document.body.appendChild(el); }
    el.textContent = `🛡 ${Math.max(1, Math.round(raw - taken))} 軽減`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  };
  function updateLook(id, look, dt, t, P, tmp) {
    if (!bvig) { bvig = document.createElement('div'); bvig.id = 'buff-vig'; document.body.appendChild(bvig); }
    guardT = Math.max(0, guardT - dt * 2.5);
    if (hpFill) hpFill.classList.toggle('hp-guard', !!(look && look.shield));
    // a buff ultimate running out: blink, accelerating ticks, a warning, and a closing chime when it ends
    if (endId && endId !== id) { if (G.sfx.invulnOff) G.sfx.invulnOff(); endId = null; }
    if (!look) { bvig.style.opacity = 0; if (bubble) { bubble.visible = false; shards.visible = false; } return; }
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    bvig.dataset.look = id;
    bvig.style.setProperty('--lc', look.col);
    bvig.style.opacity = Math.min(1, (look.ult || look.shield ? 0.6 : 0.38) + pulse * (look.ult ? 0.25 : 0.12) + guardT * 0.5).toFixed(2);
    if (look.inv) tmp = null;
    if (look.ult && !look.shield) ultFx(look, P, dt, t);
    if (tmp && tmp.t < 2) {
      const k = 1 - tmp.t / 2;
      bvig.style.opacity = (0.3 + Math.abs(Math.sin(t * (10 + k * 22))) * 0.7).toFixed(2);
      if (endId !== id) { endId = id; endTick = 0; }
      endTick -= dt; if (endTick <= 0) { endTick = 0.32 - k * 0.2; if (G.sfx.invulnTick) G.sfx.invulnTick(k); }
      guardT = Math.max(guardT, Math.abs(Math.sin(t * (10 + k * 22))) * 0.35);
    } else if (endId === id && (!tmp || tmp.t >= 2)) endId = null;
    bvig.classList.toggle('shield', !!look.shield);
    bvig.classList.toggle('inv', !!look.inv);
    bvig.classList.toggle('ult', !!look.ult && !look.shield);
    bvig.classList.toggle('skill', !look.ult && !look.shield && !look.inv);
    if (look.inv) { const left = G.player.invulnT || 0; bvig.style.opacity = (left < 1 ? 0.35 + Math.abs(Math.sin(t * (14 + (1 - left) * 20))) * 0.65 : 0.85 + pulse * 0.15).toFixed(2); }
    if (!look.shield) { if (bubble) { bubble.visible = false; shards.visible = false; } return; }
    // the barrier around your body (third person) and golden plates orbiting you (visible at the view edges)
    if (!bubble) {
      bubble = new THREE.Group();
      const add = (geo, o) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial(Object.assign({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }, o)));
      const m1 = add(new THREE.SphereGeometry(1.15, 24, 16), { opacity: 0.12, side: THREE.DoubleSide });
      const m2 = add(new THREE.IcosahedronGeometry(1.2, 1), { wireframe: true, opacity: 0.35 });
      const m3 = add(new THREE.IcosahedronGeometry(1.32, 2), { wireframe: true, opacity: 0.3 });
      const halo = add(new THREE.TorusGeometry(1.45, 0.05, 8, 64), { opacity: 0.8 }); halo.rotation.x = Math.PI / 2;
      bubble.add(m1, m2, m3, halo); bubble.userData = { m1, m2, m3, halo };
      shards = new THREE.Group();
      const sm = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (let i = 0; i < 8; i++) { const h = new THREE.Mesh(i < 4 ? new THREE.CircleGeometry(0.2, 6) : new THREE.OctahedronGeometry(0.16, 0), sm); h.userData.a = (i % 4) / 4 * Math.PI * 2 + (i >= 4 ? Math.PI / 4 : 0); h.userData.hi = i >= 4; shards.add(h); }
      shards.userData.mat = sm;
    }
    if (bubble.parent !== G.scene) { G.scene.add(bubble); G.scene.add(shards); }
    const U2 = bubble.userData, inv = !!look.inv;
    U2.m1.material.color.set(look.hex); U2.m2.material.color.set(look.hex2); U2.m3.material.color.set(look.hex); U2.halo.material.color.set(look.hex2); shards.userData.mat.color.set(inv ? 0xc8f4ff : look.hex);
    const tp = G.avatar && G.avatar.tpK > 0.4;
    bubble.visible = tp; shards.visible = true;
    U2.m3.visible = U2.halo.visible = inv;
    bubble.position.set(P.pos.x, P.pos.y + 0.95, P.pos.z); bubble.rotation.y += dt * (inv ? 1.4 : 0.6);
    U2.m3.rotation.y -= dt * 2.2; U2.m3.rotation.x += dt * 0.7;
    U2.halo.position.y = Math.sin(t * 2.4) * 0.7; U2.halo.material.opacity = 0.5 + pulse * 0.4;
    U2.m1.material.opacity = (inv ? 0.16 + pulse * 0.08 : 0.1) + guardT * 0.3; U2.m2.material.opacity = 0.25 + pulse * 0.15 + guardT * 0.5; U2.m3.material.opacity = 0.2 + (1 - pulse) * 0.2;
    // first person: the plates circle below and above the eye line so they frame the view instead of crossing it
    shards.position.set(P.pos.x, P.pos.y + (tp ? 1.0 : 0.55), P.pos.z);
    const r = tp ? 1.35 : 1.25;
    shards.userData.mat.opacity = tp ? 0.85 : 0.55;
    shards.children.forEach((h, i) => {
      h.visible = inv || !h.userData.hi;
      const hi = h.userData.hi, a = h.userData.a + t * (inv ? (hi ? -2.6 : 2.2) : 1.6), rr = r * (hi ? 1.15 : 1);
      h.position.set(Math.cos(a) * rr, (hi ? (tp ? 0.55 : 2.05) : 0) + Math.sin(t * 2 + i) * (tp ? 0.25 : 0.1), Math.sin(a) * rr);
      h.rotation.set(hi ? t * 3 : 0, -a + Math.PI / 2, hi ? t * 2 : 0);
    });
    // invulnerability: a storm of sparkles all around you, and a bright pulse ring now and then
    if (inv && !P.dead) {
      const n = Math.random() < dt * 40 ? 2 : 0;
      for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, d = U.rand(0.6, 1.6); G.fx.add.spawn(P.pos.x + Math.cos(a) * d, P.pos.y + U.rand(0.1, 2.2), P.pos.z + Math.sin(a) * d, 0, U.rand(0.3, 1.2), 0, U.rand(0.5, 0.9), U.rand(0.05, 0.1), 0.01, U.rand(0.6, 1), U.rand(0.9, 1), 1, 1, 0, 0); }
      invRingT -= dt; if (invRingT <= 0) { invRingT = 0.9; G.fx.ring(P.pos.clone().setY(P.pos.y + 0.1), 2.2, 0x8fe4ff, 0.6); }
    }
  }
  let invRingT = 0, invLast = 0, invMax = 0, endId = null, endTick = 0;
  PS.active = function () {
    const s = G.player.st || {};
    return ORDER.filter((k) => s[k] > 0);
  };
  PS.update = function (dt) {
    const P = G.player; if (!P || !P.st) return;
    ensureDom();
    const s = P.st, act = [];
    for (const k of ORDER) {
      const v = s[k] > 0 ? s[k] : 0;
      // a status that was (re)applied grows -> remember its full length for the ring gauge
      if (v > (prev[k] || 0) + 1e-3) max[k] = Math.max(v, 0.1);
      prev[k] = v;
      if (v > 0) act.push(k);
    }
    const t = G.game.time;
    const top = act[0];
    // ---- heal over time (timed items only; permanent regen buffs are not shown) ----
    let pending = 0, healing = false;
    for (const [id, tm] of P.temps) if (id.startsWith('regen_') && tm.t > 0 && tm.mods && tm.mods.hpRegen) { healing = true; pending += tm.t * tm.mods.hpRegen * Math.max(0, 1 + (P.stats.healMul || 0)); }
    const mx = P.stats.maxHp;
    if (ghost) {
      // heal-over-time (bandage, regen potion): a guide segment shows where the HP bar will end up
      const hpNow = Math.max(0, P.hp);
      const tgt = pending > 0 && !P.dead ? Math.min(mx, hpNow + pending) : 0;
      const gw = (tgt > 0 ? U.clamp(tgt / mx, 0, 1) * 100 : 0).toFixed(1) + '%', go = tgt > hpNow + 0.5 ? 1 : 0;
      if (ghost._w !== gw) { ghost._w = gw; ghost.style.width = gw; }
      if (ghost._o !== go) { ghost._o = go; ghost.style.opacity = go; }
    }
    // ---- HUD icons with ring gauges (throttled) ----
    acc -= dt;
    if (acc <= 0) {
      acc = 0.06;
      // persistent elements (rebuilding them every tick restarted their animations = flicker)
      const want = [];
      // (heal-over-time is shown on the HP bar only: no ring)
      for (const k of act) { const d = PS.DEFS[k]; want.push({ key: k, cls: 'bad st-' + k, col: d.col, icon: d.icon, name: d.name, frac: U.clamp(s[k] / (max[k] || 1), 0, 1), badge: k === 'poison' && s.poisonStacks > 1 ? '×' + s.poisonStacks : '', t: s[k] }); }
      const keep = new Set(want.map((w) => w.key));
      for (const [key, el] of PS.els) if (!keep.has(key)) { el.classList.add('out'); PS.els.delete(key); setTimeout(() => el.remove(), 220); }
      want.forEach((w, i) => {
        let el = PS.els.get(w.key);
        if (!el) {
          el = document.createElement('div'); el.className = 'pst in ' + w.cls; el.title = w.name;
          el.innerHTML = '<div class="pst-ring"><span class="pst-ic"></span><b class="pst-b"></b></div><i class="pst-t"></i><em class="pst-n"></em>';
          el.style.setProperty('--c', w.col); el.querySelector('.pst-ic').textContent = w.icon; el.querySelector('.pst-n').textContent = w.name;
          host.appendChild(el); PS.els.set(w.key, el);
          setTimeout(() => el.classList.remove('in'), 400);
        }
        // re-applied (timer jumped up): a short shake, not a re-pop
        if (w.t > (el._t || 0) + 0.3 && el._t !== undefined) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
        el._t = w.t;
        el.style.setProperty('--p', (w.frac * 100).toFixed(1) + '%');
        const b = el.querySelector('.pst-b'); if (b.textContent !== w.badge) { b.textContent = w.badge; b.style.display = w.badge ? '' : 'none'; }
        el.querySelector('.pst-t').textContent = w.t.toFixed(1) + 's';
        el.classList.toggle('low', w.frac < 0.25);
        if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
      });
      // HP bar tint
      // only ailments that eat HP (burn / poison) tint the HP bar; slow and shock don't
      if (hpFill) { const hpTop = s.burn > 0 ? 'burn' : s.poison > 0 ? 'poison' : null; if (hpFill._top !== hpTop) { hpFill._top = hpTop; for (const k of ORDER) hpFill.classList.toggle('hp-' + k, k === hpTop); } }
    }
    // ---- screen: strong coloured edges + a light full-screen wash, each status with its own motion ----
    if (top) {
      const d = PS.DEFS[top];
      const [r, g, b] = d.rgb.map((v) => Math.round(v * 255));
      let a = 0.6, spread = 55, wash = 0.035;
      if (top === 'burn') { a = 0.55 + Math.random() * 0.25; spread = 60 + Math.random() * 25; wash = 0.03 + Math.random() * 0.03; }
      if (top === 'poison') { const st = Math.min(5, s.poisonStacks || 1); a = 0.5 + Math.sin(t * 3) * 0.12 + st * 0.04; spread = 45 + Math.sin(t * 2) * 12 + st * 6; wash = 0.025 + st * 0.008; }
      if (top === 'shock') { const fl = Math.random() < 0.35; a = fl ? 0.85 : 0.35; spread = fl ? 90 : 40; wash = fl ? 0.1 : 0.02; }
      if (top === 'slow') { a = 0.6; spread = 70; wash = 0.03; }
      vig.style.boxShadow = `inset 0 0 ${200 + spread}px ${spread}px rgba(${r},${g},${b},${a.toFixed(2)})`;
      vig.style.background = `radial-gradient(ellipse at center, rgba(${r},${g},${b},0) 55%, rgba(${r},${g},${b},${(wash * 4).toFixed(3)}) 100%), rgba(${r},${g},${b},${wash.toFixed(3)})`;
      vig.style.opacity = 1;
      vig.dataset.st = top;
    } else { vig.style.opacity = 0; vig.dataset.st = ''; }
    // ---- active self-buff look (the body tint only when no status is showing) ----
    const iv = P.invulnT || 0;
    if (iv > invLast + 0.05) invMax = iv; invLast = iv;
    const invOn = iv > 0 && invMax >= 0.6 && iv < 1e6;
    const [lookId, lookTmp] = pickLook(P, invOn);
    const look = lookId ? PS.LOOKS[lookId] : null;
    updateLook(lookId, look, dt, t, P, lookTmp);
    const vis = invOn ? look : top ? PS.DEFS[top] : look;
    // ---- recolour the held weapon (gun or melee) and the hands ----
    const key = G.weapons.vmKey;
    if (key) {
      if (!baseSaved) { baseKey.copy(key.color); baseSaved = true; }
      if (vis) { tmpC.setRGB(...vis.rgb); key.color.copy(baseKey).lerp(tmpC, invOn ? 0.7 + Math.sin(t * 12) * 0.15 : 0.55 + Math.sin(t * 6) * 0.1); }
      else key.color.lerp(baseKey, Math.min(1, dt * 6));
    }
    tintViewmodel(invOn ? lookId : top || lookId, t, dt, invOn || !top ? look : null);
    const AV = G.avatar;
    if (AV && AV.mats) for (const m of AV.mats) { if (!m.emissive) continue; if (vis) { const k = invOn ? 0.6 + Math.sin(t * 10) * 0.2 : top ? 0.35 : 0.45 + guardT * 0.4; m.emissive.setRGB(vis.rgb[0] * k, vis.rgb[1] * k, vis.rgb[2] * k); } else m.emissive.setRGB(0, 0, 0); }
    // motes rising from the hands / body while a buff look is active
    if (look && !P.dead && Math.random() < dt * (invOn ? 40 : look.ult || look.shield ? 18 : 9)) {
      const tp2 = AV && AV.tpK > 0.4;
      const h2 = tp2 ? P.pos.clone().add(V(U.rand(-0.5, 0.5), U.rand(0.1, 1.8), U.rand(-0.5, 0.5))) : (P.handPos ? P.handPos() : P.chestPos()).add(V(U.rand(-0.1, 0.1), U.rand(-0.1, 0.05), U.rand(-0.1, 0.1)));
      G.fx.add.spawn(h2.x, h2.y, h2.z, 0, U.rand(0.4, 1.0), 0, 0.9, tp2 ? 0.07 : 0.03, 0.01, look.mote[0], look.mote[1], look.mote[2], 0.9, 0, 0);
    }
    // ---- particles: around the hand (first person) or the whole body (third person) ----
    const tp = AV && AV.tpK > 0.4;
    if (healing && !P.dead && P.hp < mx) {
      // rising green motes + soft green rim at the screen edge while healing
      if (Math.random() < dt * (tp ? 16 : 8)) {
        const b = tp ? P.pos.clone().add(V(U.rand(-0.4, 0.4), U.rand(0.1, 1.5), U.rand(-0.4, 0.4))) : P.pos.clone().add(V(U.rand(-0.6, 0.6), U.rand(0.2, 0.9), U.rand(-0.6, 0.6)));
        G.fx.add.spawn(b.x, b.y, b.z, 0, U.rand(0.5, 1.0), 0, 1.0, tp ? 0.07 : 0.05, 0.01, 0.4, 1, 0.55, 0.9, 0, 0);
      }
      if (!top) { vig.style.boxShadow = `inset 0 0 120px 20px rgba(90,255,140,${(0.12 + Math.sin(t * 4) * 0.05).toFixed(2)})`; vig.style.opacity = 1; }
    }
    if (!act.length || P.dead) return;
    const hp = P.handPos ? P.handPos() : P.chestPos();
    for (const k of act) {
      const rate = (tp ? 18 : 14) * dt;
      if (Math.random() > rate) continue;
      const base = tp ? P.pos.clone().add(V(U.rand(-0.35, 0.35), U.rand(0.2, 1.6), U.rand(-0.35, 0.35))) : hp.clone().add(V(U.rand(-0.08, 0.08), U.rand(-0.1, 0.04), U.rand(-0.08, 0.08)));
      if (k === 'burn') G.fx.flameLick(base.x, base.y, base.z, tp ? 0.7 : 0.35);
      else if (k === 'poison') G.fx.norm.spawn(base.x, base.y, base.z, U.rand(-0.1, 0.1), U.rand(0.3, 0.6), U.rand(-0.1, 0.1), 0.9, tp ? 0.08 : 0.03, tp ? 0.14 : 0.05, 0.4, 0.9, 0.2, 0.75, -0.2, 1);
      else if (k === 'shock') G.fx.sparks(base, null, 1, 0xfff0a0, tp ? 3 : 1.5);
      else if (k === 'slow') G.fx.norm.spawn(base.x, base.y, base.z, 0, -0.1, 0, 1.0, tp ? 0.08 : 0.03, tp ? 0.12 : 0.05, 0.75, 0.88, 1, 0.6, 0, 1);
    }
  };
})();
