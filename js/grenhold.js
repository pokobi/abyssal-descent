'use strict';
// Readied grenade: tap G to take the selected throwable in hand, LMB = overhand throw, RMB = underhand lob.
// Holding a mouse button winds up and shows the predicted arc + blast radius; releasing throws.
// Switching weapons or tapping G again puts it away.
(function () {
  const GH = (G.GrenHold = {});
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const P = () => G.player;
  let h = null, grp = null, guide = null, hint = null;

  GH.active = () => !!h;
  GH.winding = () => !!(h && h.ph === 'wind');

  // ---------------- viewmodel ----------------
  const POSE = {
    down: [0.2, -0.5, -0.3, -0.4, 0, 0],
    idle: [0.15, -0.15, -0.36, 0.12, 0, 0],
    windO: [0.2, -0.03, -0.3, 0.85, 0, -0.25],
    windU: [0.15, -0.25, -0.32, -0.7, 0, 0.2],
    relO: [0.04, 0.0, -0.62, -0.6, 0, 0.1],
    relU: [0.06, -0.1, -0.62, 0.55, 0, 0],
  };
  const lerpPose = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  function buildModel(id) {
    if (grp) { grp.parent && grp.parent.remove(grp); grp = null; }
    if (!G.weapons.vmScene) return;
    grp = new THREE.Group();
    const item = G.ItemAnim.build('throw', id); item.scale.setScalar(1.1); grp.add(item); grp.userData.item = item;
    const hd = G.ItemAnim.hand(grp, true); hd.position.set(0.005, -0.04, 0.02);
    G.weapons.vmScene.add(grp);
  }
  function setPose(p) { if (!grp) return; grp.position.set(p[0], p[1], p[2]); grp.rotation.set(p[3], p[4], p[5]); }

  // ---------------- arc guide ----------------
  const NDOT = 48;
  function ensureGuide() {
    if (!guide) {
      const dm = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
      const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), dm, NDOT); dots.frustumCulled = false; dots.renderOrder = 5;
      const rm = new THREE.MeshBasicMaterial({ color: 0xff7040, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), rm); ring.renderOrder = 5;
      const fill = new THREE.Mesh(new THREE.CircleGeometry(0.92, 48), new THREE.MeshBasicMaterial({ color: 0xff5020, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); fill.renderOrder = 5;
      const mark = new THREE.Group(); mark.add(ring); mark.add(fill);
      guide = { dots, mark, ring, fill, k: 0 };
    }
    if (guide.dots.parent !== G.scene) { G.scene.add(guide.dots); G.scene.add(guide.mark); }
    return guide;
  }
  function hideGuide() { if (guide) { guide.dots.visible = false; guide.mark.visible = false; guide.k = 0; } }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), UPV = V(0, 1, 0);
  function drawGuide(dt, under, id) {
    const g = ensureGuide();
    g.k = Math.min(1, g.k + dt * 6);
    const { o, vel } = GH.launch(under);
    const d = G.ITEM_BY_ID[id].data;
    const pos = o.clone(), v = vel.clone(), stepT = 1 / 40, dir = V();
    const pts = []; let hit = null;
    for (let i = 0; i < 160 && !hit; i++) {
      v.y -= 18 * stepT;
      const L = v.length() * stepT; dir.copy(v).divideScalar(v.length());
      const wh = G.world.raycast(pos, dir, L + 0.06);
      if (wh) { pos.addScaledVector(dir, wh.t); hit = { p: pos.clone(), n: wh.normal || wh.n || UPV }; break; }
      const eh = G.enemies.raycast && G.enemies.raycast(pos, dir, L, 0.12);
      if (eh && (d.impact || d.sticky)) { pos.addScaledVector(dir, eh.t); hit = { p: pos.clone(), n: UPV }; break; }
      pos.addScaledVector(dir, L);
      // skip the part right in front of the lens (huge, distracting dots)
      if (pos.distanceToSquared(G.camera.position) > 1.6 * 1.6) pts.push(pos.clone());
      if (pos.y < -200) break;
    }
    // spread the dots evenly along the computed path
    const n = Math.min(NDOT, pts.length), every = Math.max(1, pts.length / NDOT);
    const t = G.game.time;
    for (let i = 0; i < NDOT; i++) {
      if (i >= n) { tmpM.makeScale(0, 0, 0); g.dots.setMatrixAt(i, tmpM); continue; }
      const p = pts[Math.min(pts.length - 1, Math.floor(i * every))];
      const s = (0.045 + 0.02 * Math.max(0, Math.sin(t * 10 - i * 0.5))) * g.k * (0.6 + 0.4 * i / NDOT);
      tmpM.compose(p, tmpQ.identity(), tmpS.set(s, s, s)); g.dots.setMatrixAt(i, tmpM);
    }
    g.dots.count = NDOT; g.dots.instanceMatrix.needsUpdate = true; g.dots.visible = true;
    g.mark.visible = false; // only the arc is drawn; the blast-radius marker on the floor is gone
  }

  // ---------------- throw physics (shared by the guide and the real throw) ----------------
  GH.launch = function (under) {
    const p = P();
    // leaves from the throwing (right) hand, matching the viewmodel
    let o;
    if (G.avatar.tpK > 0.5) { o = p.handPos(); if (under) o.y -= 0.3; }
    else { G.camera.updateMatrixWorld(); o = G.camera.localToWorld(under ? V(0.2, -0.5, -0.45) : V(0.22, -0.05, -0.4)); }
    const eye = G.camera.position.clone(), dd = o.clone().sub(eye), L = dd.length();
    if (G.world.raycast(eye, dd.divideScalar(L), L + 0.15)) o = eye.addScaledVector(p.forward(), -0.1);
    const f = p.forward(), pw = 1 + (p.stats.throwPow || 0);
    let vel;
    if (under) {
      // a softer, flatter lob that rolls along the floor
      const fl = f.clone(); fl.y = fl.y * 0.6; fl.normalize();
      vel = fl.multiplyScalar(9.5 * pw).add(V(0, 2.2, 0));
    } else vel = f.clone().multiplyScalar(17 * pw).add(V(0, 3.5, 0));
    vel.addScaledVector(p.vel, 0.5);
    return { o, vel };
  };

  // ---------------- state ----------------
  function owned() { const p = P(); return Object.keys(p.grenades).filter((k) => p.grenades[k] > 0); }
  GH.toggle = function () {
    if (h) return GH.putAway();
    const p = P();
    if (p.dead || p.pileState) return;
    let id = p.grenadeSel;
    if (!p.grenades[id]) { const o = owned()[0]; if (!o) { G.ui.toastSmall('💣 投擲物がない'); G.sfx.ui('deny'); return; } id = p.grenadeSel = o; }
    if (G.ItemAnim.busy()) return;
    h = { id, ph: 'raise', t: 0, weapon: p.weapon, melee: !!p.meleeMode, pose: POSE.down.slice() };
    buildModel(id);
    G.sfx.mech('click', 0, 0.7);
    showHint(true);
  };
  GH.refresh = function () { if (h && h.ph !== 'throw' && P().grenadeSel !== h.id && P().grenades[P().grenadeSel]) { h.id = P().grenadeSel; buildModel(h.id); setPose(h.pose); G.sfx.mech('click', 0, 0.7); } };
  GH.putAway = function (instant) {
    if (!h) return;
    hideGuide(); showHint(false);
    if (instant || !grp) { if (grp) grp.parent && grp.parent.remove(grp); grp = null; h = null; return; }
    h.ph = 'lower'; h.t = 0; h.from = h.pose.slice();
  };
  function showHint(on) {
    if (!hint) { hint = document.createElement('div'); hint.id = 'gren-hint'; (G.ui.el && G.ui.el.hud || document.body).appendChild(hint); }
    if (on && h) {
      const it = G.ITEM_BY_ID[h.id];
      hint.innerHTML = `<b>${it.icon} ${it.name} ×${P().grenades[h.id] || 0}</b><span><kbd>左クリック</kbd>投げる</span><span><kbd>右クリック</kbd>下投げ</span><span><kbd>長押し</kbd>軌道表示</span><span><kbd>G</kbd>しまう</span>`;
    }
    hint.classList.toggle('on', !!on);
  }

  GH.update = function (dt) {
    if (!h) return;
    const p = P(), W = G.weapons;
    // anything that takes the hands away cancels the readied grenade
    if (h.ph !== 'lower' && h.ph !== 'throw' && (p.dead || p.weapon !== h.weapon || !!p.meleeMode !== h.melee || W.switchT > 0 || p.pileState || G.ItemAnim.busy())) { GH.putAway(true); return; }
    if (grp) grp.visible = G.avatar.tpK < 0.3 && G.game.state !== 'dead';
    h.t += dt;
    if (h.ph === 'raise') {
      const k = Math.min(1, h.t / 0.18); h.pose = lerpPose(POSE.down, POSE.idle, 1 - Math.pow(1 - k, 3));
      if (k >= 1) { h.ph = 'idle'; h.t = 0; }
    }
    if (h.ph === 'idle') {
      const bob = Math.sin(G.game.time * 2.2) * 0.006;
      h.pose = lerpPose(h.pose, POSE.idle, Math.min(1, dt * 12)); h.pose[1] += bob * dt * 10;
      if (!p.mantle && (I.mpressed[0] || I.mpressed[2])) {
        h.ph = 'wind'; h.t = 0; h.under = !!I.mpressed[2] && !I.mpressed[0]; h.btn = h.under ? 2 : 0; h.rel = false; h.from = h.pose.slice();
        G.sfx.whoosh(0.25, 0.15);
      }
    }
    if (h.ph === 'wind') {
      const k = Math.min(1, h.t / 0.16);
      h.pose = lerpPose(h.from, h.under ? POSE.windU : POSE.windO, 1 - Math.pow(1 - k, 2));
      // slight tremble while held back
      if (k >= 1) { h.pose[0] += Math.sin(G.game.time * 31) * 0.0015; h.pose[1] += Math.sin(G.game.time * 23) * 0.0015; }
      if (!I.mouse[h.btn]) h.rel = true;
      // the guide only appears for a deliberate hold, not a quick click
      if (h.t > 0.12 && !h.rel) drawGuide(dt, h.under, h.id); else if (h.rel) hideGuide();
      if (h.rel && h.t >= 0.1 && !p.mantle) { h.ph = 'throw'; h.t = 0; h.from = h.pose.slice(); h.thrown = false; hideGuide(); }
    }
    if (h.ph === 'throw') {
      const k = Math.min(1, h.t / 0.12);
      h.pose = lerpPose(h.from, h.under ? POSE.relU : POSE.relO, k);
      if (!h.thrown && h.t >= 0.06) {
        h.thrown = true;
        const id = h.id;
        if (!(p.has('g_refund') && Math.random() < 0.3)) p.takeItem(id);
        if (grp && grp.userData.item) grp.userData.item.visible = false;
        G.abilities.releaseGrenade(id, h.under);
        showHint(false);
      }
      if (h.t >= 0.2) { h.ph = 'lower'; h.t = 0; h.from = h.pose.slice(); }
    }
    if (h.ph === 'lower') {
      const k = Math.min(1, h.t / 0.16);
      h.pose = lerpPose(h.from, POSE.down, k);
      if (k >= 1) { if (grp) grp.parent && grp.parent.remove(grp); grp = null; h = null; hideGuide(); showHint(false); return; }
    }
    setPose(h.pose);
  };
})();
