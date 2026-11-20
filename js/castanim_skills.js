'use strict';
// Which first-person motion each skill casts with (castanim.js). One line a skill:
//   id: { m: move, side: 'L' | 'R', speed, at, release, ...the move's own values }
//   m: one of G.CastAnim.MOVES - the shared ones (overhand, underhand, palm, push2, slam, plant, raise, part, thrust, sweep, crush,
//      sign, clasp, channel) or one of the moves made below for a skill of its own (sk_*)
//   side: the hand that does it ('L', the default: the gun stays in the right hand; 'R' or a move of both hands lowers the gun)
//   speed: quicker (> 1) or slower (< 1) than the move's own pace; at: the moment (s) the hand is to be in place for the effect
//   release: the skill's effect waits for the hand to swing through (a throw or a shot from the hand; at most 0.12 s) and the shot
//            starts from the hand on the screen. The move's own values are listed with each move in castanim.js
//   tick(c, t, rig): run each frame of the motion, for what a move alone does not give (rig.L / rig.R: { g, hand, fore, upper, oh })
// A skill that is not here plays CA.DEFAULT (raise).
//
// Each skill has a motion that reads as what it does, with the hand where its effect is when it comes (abilities.js castSkill: an
// effect that is not a throw goes off at once, as the motion starts; a throw goes off as the hand lets go, at 0.12 s). The moves below
// (sk_*) are written the way the shared ones are (castanim.js, its head and MOVES): keys for the RIGHT hand in the view's space (the
// eye at the origin, -z ahead), mirrored for the left. Hand turns used here: [0, 0, 0] palm down, fingers ahead; [1.5, 0, 0] palm ahead,
// fingers up; [0, 0, -1.57] palm in (a blade); [0, 0, 3.1] palm up; [1.5, 0, 3.1] palm to the face, fingers up.
(function () {
  const CA = G.CastAnim, mv = CA.move;
  const GRIP_Q = [0.35, 0.35, -2.3], REST_Q = [-0.4, 0.1, 0.5];
  const v = (o, k, d) => (o && o[k] !== undefined ? o[k] : d);
  const sp = (i) => i - 1.5;
  const fing = (fn, t) => ({ f: [0, 1, 2, 3].map((i) => fn(i)), t });
  // hand shapes of these motions (castanim.js FING has the shared ones)
  const FX = {
    // cupped, palm up, round a ball that is not there (fire, a handful of powder)
    cup: fing((i) => [0.42 + i * 0.05, 0.55, 0.35, sp(i) * 0.08], [0.35, 0.3, 0.25, 0.25]),
    // limp and hanging from the knuckles (a puppeteer's hand over its strings)
    hang: fing((i) => [0.62 + i * 0.07, 0.55 + i * 0.03, 0.32, sp(i) * 0.1], [0.3, 0.35, 0.3, 0.1]),
    // closed round a watch held in the palm, the thumb on its crown
    watch: fing((i) => [0.95 + i * 0.06, 1.05, 0.7, sp(i) * 0.04], [0.55, 0.45, 0.35, -0.25]),
    watchPress: fing((i) => [1.05 + i * 0.06, 1.15, 0.8, sp(i) * 0.04], [0.75, 0.75, 0.75, -0.35]),
    // the fingers hooked at their middle joints, the knuckles straight (under the edge of a slab, round a chain)
    hook: fing((i) => [0.25 + i * 0.03, 1.35, 1.0, sp(i) * 0.05], [0.4, 0.45, 0.4, 0.1]),
    // the fingers flicked open and back (a sprinkle, a flick of water)
    flick: fing((i) => [-0.22 + i * 0.03, -0.1, 0.0, sp(i) * 0.18], [0.1, 0.05, 0.0, 0.2]),
    // a watch cradled in the palm: the fingers a little curled under its rim, the thumb raised clear of it / pressed down on its crown
    cradle: fing((i) => [0.35 + i * 0.06, 0.5, 0.35, sp(i) * 0.05], [0.1, 0.0, 0.0, 0.5]),
    cradlePress: fing((i) => [0.4 + i * 0.06, 0.55, 0.4, sp(i) * 0.05], [0.6, 0.5, 0.4, 0.5]),
    // a knob taken between the thumb and the first two fingers, the other two closed out of the way
    pinch: fing((i) => (i < 2 ? [0.55 + i * 0.05, 0.95, 0.5, (i ? -0.04 : 0.04)] : [1.35 + i * 0.05, 1.5, 1.0, 0]), [0.75, 0.45, 0.3, 0.6]),
    pinchOpen: fing((i) => (i < 2 ? [0.3 + i * 0.05, 0.5, 0.25, (i ? -0.08 : 0.08)] : [1.3 + i * 0.05, 1.45, 0.95, 0]), [0.35, 0.15, 0.1, 0.7]),
  };
  const fx = (n) => FX[n] || n;
  // where the gun's own left hand is now (castanim.js gripPoint: the wrist behind the fist on the fore-end), or null
  function gripNow() {
    try {
      const W = G.weapons, m = W.dbgModel && W.dbgModel(); if (!m || !m.lHand || G.player.meleeMode) return null;
      m.group.updateMatrixWorld(true); const p = m.lHand.getWorldPosition(new THREE.Vector3());
      return [-p.x, p.y - 0.015, p.z + 0.065];
    } catch (e) { return null; }
  }
  // keys along a loop: from t0 to t1, n keys, at(u) giving { p, q, f } for u 0..1 (eased evenly, so the hand runs round, not stopping)
  function loop(t0, t1, n, at) {
    const out = [];
    for (let k = 1; k <= n; k++) { const u = k / n, a = at(u); out.push(Object.assign({ t: t0 + (t1 - t0) * u, e: 'l' }, a, a.f ? { f: fx(a.f) } : {})); }
    return out;
  }
  const F = (keys) => keys.map((k) => (k.f && typeof k.f === 'string' && FX[k.f] ? Object.assign({}, k, { f: FX[k.f] }) : k));

  // ---- 疾風迅雷: the hands driven out together fingertips first (a dive), then torn wide apart, crackling
  mv('sk_dive', () => {
    const keys = (d) => [
      { t: 0, p: [0.12, -0.3, -0.28], q: [0.2, 0, -1.5], f: 'blade' },
      { t: 0.06 + d, p: [0.035, -0.105, -0.4], q: [0.12, -0.05, -1.57], e: 'o' },
      { t: 0.12 + d, p: [0.03, -0.085, -0.5], e: 'i', s: 0.002 },
      { t: 0.24 + d, p: [0.3, -0.1, -0.38], q: [0.3, -0.3, 1.2], f: 'splay', e: 'o', s: 0.003 },
      { t: 0.36 + d, p: [0.4, -0.22, -0.16], f: 'relax', e: 'i' },
      { t: 0.55, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.55, hit: 0.06, both: true, main: keys(0), off: keys(0.008),
      body: [{ t: 0 }, { t: 0.06, d: 0.012, f: 0.02 }, { t: 0.14, f: 0.075, p: -0.02, d: 0.018 }, { t: 0.32, f: 0.03, d: 0.006 }, { t: 0.55 }],
      jolt: [[0.12, 0.05]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.36, 0.26]] };
  });
  // ---- ブリンク: two fingers drawn to the chest and flicked out at where you go, the hand snapping shut as you are there
  mv('sk_flick', () => ({ dur: 0.46, hit: 0.09, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.045, p: [0.1, -0.15, -0.3], q: [0.7, 0.15, -1.35], f: 'seal', e: 'o' },
    { t: 0.09, p: [0.055, -0.075, -0.5], q: [0.28, 0.3, -1.4], e: 'i' },
    { t: 0.15, p: [0.065, -0.095, -0.47], q: [0.4, 0.2, -1.4], f: 'fist', e: 'o' },
    { t: 0.46, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.09, f: 0.03, p: -0.006 }, { t: 0.2, f: 0.008 }, { t: 0.46 }],
    snd: [[0, 'cl', 0.7], [0.05, 'sw', 0.18, 0.12]] }));
  // ---- 雷鳴の跳躍: both arms swung from low behind forward and up, the fists over the head (a standing jump), then let down
  mv('sk_jump', () => {
    const keys = (d) => [
      { t: 0, p: [0.22, -0.48, 0.02], q: [-1.2, 0.1, -1.5], f: 'fist' },
      { t: 0.05 + d, p: [0.2, -0.38, -0.2], q: [-0.4, 0.1, -1.5], e: 'i' },
      { t: 0.12 + d, p: [0.15, -0.03, -0.42], q: [0.95, 0.05, -1.45], e: 'o' },
      { t: 0.22 + d, p: [0.17, 0.09, -0.34], q: [1.5, 0.05, -1.4], f: 'relax', e: 'o' },
      { t: 0.48, p: [0.22, -0.18, -0.3], q: [0.6, 0.1, -1.2], e: 's' },
      { t: 0.7, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.7, hit: 0.12, both: true, main: keys(0), off: keys(0.01),
      body: [{ t: 0 }, { t: 0.05, d: 0.03, p: -0.025, f: 0.01 }, { t: 0.16, d: -0.02, p: 0.035, f: 0.02 }, { t: 0.45, p: 0.01 }, { t: 0.7 }],
      jolt: [[0.12, 0.04]], snd: [[0, 'cl', 1], [0.04, 'sw', 0.34, 0.24]] };
  });
  // ---- 飛翔: both palms driven down at the sides (pushing off the air), then the arms spread wide, palms down, fingers apart like
  // pinions, held through the climb with a slow beat
  mv('sk_wings', () => {
    const keys = (d) => [
      { t: 0, p: [0.15, -0.3, -0.3], q: [0.2, 0, 0.1], f: 'flat' },
      { t: 0.08 + d, p: [0.17, -0.185, -0.43], q: [-0.4, 0, 0.15], e: 'i' },
      { t: 0.22 + d, p: [0.27, -0.06, -0.4], q: [0.05, -0.3, 0.45], f: 'splay', e: 'o' },
      { t: 0.45 + d, p: [0.28, -0.035, -0.4], q: [0.12, -0.3, 0.5], e: 's' },
      { t: 0.65 + d, p: [0.275, -0.085, -0.4], q: [-0.02, -0.3, 0.42], e: 's' },
      { t: 0.95, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.95, hit: 0.08, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.08, d: 0.025, p: -0.01 }, { t: 0.24, d: -0.02, p: 0.04 }, { t: 0.65, p: 0.03, d: -0.01 }, { t: 0.95 }],
      jolt: [[0.08, 0.05]], snd: [[0, 'cl', 1], [0.06, 'sw', 0.3, 0.2], [0.2, 'sw', 0.2, 0.3]] };
  });
  // ---- 吸血の刃: the hand thrown up outside as a claw and raked down across the body as the strike lands
  mv('sk_rake', () => ({ dur: 0.62, hit: 0.12, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.07, p: [0.28, 0.05, -0.32], q: [1.25, -0.45, 0.25], f: 'clawOpen', e: 'o' },
    { t: 0.12, p: [0.13, -0.06, -0.46], q: [1.0, -0.1, -0.2], e: 'i' },
    { t: 0.19, p: [-0.06, -0.15, -0.45], q: [0.75, 0.35, -0.6], f: 'claw', e: 'o' },
    { t: 0.3, p: [-0.08, -0.17, -0.43], e: 's' },
    { t: 0.62, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.07, y: -0.015, p: 0.008 }, { t: 0.16, f: 0.06, y: 0.025, r: 0.02, p: -0.015, d: 0.01 }, { t: 0.35, f: 0.015, y: 0.006 }, { t: 0.62 }],
    jolt: [[0.15, 0.06]], snd: [[0, 'cl', 0.9], [0.09, 'sw', 0.3, 0.16]] }));
  // ---- 加速装置: the forearm brought across before the chest and the bracer's crank wound with two hard twists of the wrist, then
  // the fist pumped
  mv('sk_wind', () => ({ dur: 0.72, hit: 0.1, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.02, -0.15, -0.36], q: [0.15, 0.25, -0.1], f: 'fist', e: 'o' },
    { t: 0.17, q: [0.15, 0.25, 2.2], e: 'o' },
    { t: 0.23, q: [0.15, 0.25, -0.1], e: 'q' },
    { t: 0.3, q: [0.15, 0.25, 2.2], e: 'o' },
    { t: 0.36, q: [0.2, 0.2, -0.6], e: 'q' },
    { t: 0.44, p: [0.09, -0.07, -0.47], q: [0.9, 0.05, -1.45], e: 'o' },
    { t: 0.72, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.12, p: -0.025, d: 0.006 }, { t: 0.36, p: -0.02 }, { t: 0.46, f: 0.03, p: 0.01 }, { t: 0.72 }],
    jolt: [[0.17, 0.02], [0.3, 0.02], [0.44, 0.035]], snd: [[0, 'cl', 0.8], [0.16, 'cl', 1.2], [0.29, 'cl', 1.2], [0.4, 'sw', 0.18, 0.12]] }));

  // ---- 投槍: the hand carried high back by the ear, the shaft along the arm, driven straight down the line of sight and let go, the
  // arm following on out at the mark
  mv('sk_javelin', () => {
    const r = 0.12;
    return { dur: 0.72, rel: r, hit: r, release: true, relP: [0.075, -0.045, -0.5], main: [
      { t: 0, p: [0.16, 0.08, -0.05], q: [2.1, -0.15, -1.35], f: 'hold' },
      { t: 0.06, p: [0.11, 0.01, -0.45], q: [1.55, -0.1, -1.4], e: 'i' },
      { t: r, p: 'hand', q: [1.05, 0.0, -1.45], f: 'release', e: 'l' },
      { t: r + 0.08, p: [0.04, -0.09, -0.53], q: [0.35, 0.15, -1.45], f: 'point', e: 'o' },
      { t: 0.4, p: [0.03, -0.13, -0.5], q: [0.2, 0.2, -1.4], f: 'relax', e: 's' },
      { t: 0.72, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, p: 0.016, y: -0.02, r: -0.012, f: -0.015 }, { t: r + 0.04, p: -0.02, y: 0.02, r: 0.018, f: 0.06, d: 0.01 },
        { t: 0.42, f: 0.018, y: 0.005 }, { t: 0.72 }],
      snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.24]] };
  });
  // ---- 氷槍: a dagger of ice held point down in the fist (逆手), raised by the head and stabbed down and forward, the hand opening
  // as it flies
  mv('sk_stab', () => {
    const r = 0.12;
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.07, -0.08, -0.5], main: [
      { t: 0, p: [0.2, 0.16, -0.1], q: [1.3, 0.1, 1.55], f: 'fist' },
      { t: 0.06, p: [0.16, 0.08, -0.3], q: [0.8, 0.05, 1.55], e: 'i' },
      { t: r, p: 'hand', q: [0.15, 0, 1.55], e: 'l' },
      { t: r + 0.07, p: [0.06, -0.12, -0.49], q: [-0.35, 0, 1.4], f: 'release', e: 'o' },
      { t: 0.38, p: [0.07, -0.14, -0.46], f: 'relax', e: 's' },
      { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, p: 0.012, d: -0.006 }, { t: r + 0.03, p: -0.03, d: 0.014, f: 0.04 }, { t: 0.4, f: 0.01 }, { t: 0.66 }],
      jolt: [[r, 0.035]], snd: [[0, 'cl', 0.9], [0.04, 'sw', 0.24, 0.14]] };
  });
  // ---- 火球: the fire born in the cupped palm low before the chest, the wrist cocked back under it, then flung up and out, the
  // fingers thrown open after it
  mv('sk_hurl', () => {
    const r = 0.12;
    return { dur: 0.7, rel: r, hit: r, release: true, relP: [0.08, -0.06, -0.5], main: F([
      { t: 0, p: [0.07, -0.26, -0.32], q: [0.25, 0, 3.05], f: 'cup' },
      { t: 0.06, p: [0.09, -0.17, -0.34], q: [-0.15, 0, 3.05], e: 'o' },
      { t: r, p: 'hand', q: [0.75, -0.05, 0.12], f: 'splay', e: 'i' },
      { t: r + 0.08, p: 'hand+', q: [0.3, -0.05, 0.05], f: 'release', e: 'o' },
      { t: 0.4, p: [0.1, -0.12, -0.44], q: [1.0, 0, -0.2], f: 'relax', e: 's' },
      { t: 0.7, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
      body: [{ t: 0 }, { t: 0.06, d: 0.01, p: -0.012 }, { t: r + 0.04, f: 0.05, p: 0.008, d: -0.004 }, { t: 0.42, f: 0.012 }, { t: 0.7 }],
      jolt: [[r, 0.03]], snd: [[0, 'cl', 0.9], [0.05, 'sw', 0.26, 0.2]] };
  });
  // ---- 水弾: a side-arm cast from out at the side, the open hand swept in across the view and the water let fly off the fingers
  // with a flick of the wrist, the hand following through past the middle
  mv('sk_splash', () => {
    const r = 0.12;
    return { dur: 0.64, rel: r, hit: r, release: true, relP: [0.09, -0.08, -0.5], main: F([
      { t: 0, p: [0.38, -0.1, -0.1], q: [0.25, 1.0, 1.57], f: 'relax' },
      { t: 0.06, p: [0.27, -0.09, -0.36], q: [0.25, 1.25, 1.57], e: 'i' },
      { t: r, p: 'hand', q: [0.25, 1.5, 1.57], f: 'flick', e: 'l' },
      { t: r + 0.08, p: [-0.04, -0.1, -0.47], q: [0.0, 1.95, 1.3], f: 'relax', e: 'o' },
      { t: 0.36, p: [-0.06, -0.15, -0.44], e: 's' },
      { t: 0.64, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
      body: [{ t: 0 }, { t: 0.06, y: -0.02, r: -0.008 }, { t: r + 0.05, y: 0.022, r: 0.012, f: 0.03 }, { t: 0.4, y: 0.005 }, { t: 0.64 }],
      snd: [[0, 'cl', 0.8], [0.04, 'sw', 0.26, 0.18]] };
  });
  // ---- 磁力爆弾: the clawed hand thrust out with the charge, held, then clenched and yanked back to the body - the pull that follows
  mv('sk_magnet', () => {
    const r = 0.12;
    return { dur: 0.78, rel: r, hit: r, release: true, relP: [0.075, -0.075, -0.52], main: [
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.06, p: [0.15, -0.15, -0.3], q: [1.15, 0, -0.25], f: 'clawOpen', e: 'o' },
      { t: r, p: 'hand', q: [1.55, -0.05, -0.15], e: 'i', pt: 'palm' },
      { t: r + 0.1, p: 'hand+', e: 'o', s: 0.0015 },
      { t: 0.3, f: 'claw', e: 's', s: 0.002 },
      { t: 0.36, f: 'fist', q: [1.2, 0.05, -0.9], e: 'i' },
      { t: 0.46, p: [0.15, -0.17, -0.3], q: [0.9, 0.1, -1.2], e: 'o' },
      { t: 0.78, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, f: -0.01 }, { t: r + 0.03, f: 0.04, d: 0.006 }, { t: 0.36, f: 0.02 }, { t: 0.48, f: -0.025, p: 0.01 }, { t: 0.78 }],
      jolt: [[r, 0.03], [0.44, 0.04]], snd: [[0, 'cl', 0.8], [0.04, 'sw', 0.22, 0.14], [0.35, 'cl', 1.4], [0.38, 'sw', 0.16, 0.12]] };
  });
  // ---- 破甲杭: the fist cocked back at the hip and driven out level like a ram; the stake goes, the arm is kicked back by it and
  // the hand shaken open
  mv('sk_ram', () => {
    const r = 0.12;
    return { dur: 0.7, rel: r, hit: r, release: true, relP: [0.065, -0.075, -0.54], main: [
      { t: 0, p: [0.26, -0.28, -0.02], q: [0.0, 0.15, -0.9], f: 'fist' },
      { t: 0.06, p: [0.22, -0.22, -0.2], q: [0.05, 0.05, -0.5], e: 'i' },
      { t: r, p: 'hand', q: [0.08, -0.05, -0.25], e: 'l', pt: 'palm' },
      { t: r + 0.04, p: [0.085, -0.055, -0.42], q: [0.3, 0.05, -0.3], e: 'o' },
      { t: r + 0.12, p: [0.075, -0.075, -0.46], e: 's' },
      { t: 0.4, f: 'relax', e: 's', s: 0.002 },
      { t: 0.7, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, y: -0.014, f: -0.01 }, { t: r, f: 0.05, y: 0.014, d: 0.01 }, { t: r + 0.05, f: -0.02, p: 0.022 }, { t: 0.42, f: 0.004 }, { t: 0.7 }],
      jolt: [[r, 0.1]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.22, 0.12]] };
  });
  // ---- 連鎖雷: the arm snapped out, the first finger levelled at the foe (the bolt leaves its tip), held crackling, the fingers then
  // thrown open as the charge goes out of them
  mv('sk_zap', () => {
    const r = 0.12;
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.09, -0.035, -0.58], main: [
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.06, p: [0.15, -0.14, -0.3], q: [0.45, 0.3, -1.2], f: 'point', e: 'o' },
      { t: r, p: 'hand', q: [0.32, 0.35, -1.3], e: 'i', pt: 'tip' },
      { t: r + 0.05, p: 'hand+', e: 'o', s: 0.003 },
      { t: 0.3, e: 'l', s: 0.0035 },
      { t: 0.36, f: 'splay', q: [0.6, 0.3, -1.0], e: 'o', s: 0.001 },
      { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: r + 0.02, f: 0.03, y: 0.01, s: 0.0015 }, { t: 0.3, f: 0.02, s: 0.0015 }, { t: 0.4, f: 0.005 }, { t: 0.66 }],
      jolt: [[r, 0.03]], snd: [[0, 'cl', 0.9], [0.05, 'sw', 0.16, 0.1]] };
  });
  // ---- 雷神の裁き: two fingers raised high over the head and brought down on the foe like a sentence passed, the bolt leaving their
  // tips; held trembling
  mv('sk_smite', () => {
    const r = 0.12;
    return { dur: 0.8, rel: r, hit: r, release: true, relP: [0.085, -0.045, -0.56], main: [
      { t: 0, p: [0.15, 0.2, -0.2], q: [2.3, 0.05, -1.5], f: 'seal' },
      { t: 0.06, p: [0.11, 0.07, -0.38], q: [1.4, 0.1, -1.5], e: 'i' },
      { t: r, p: 'hand', q: [0.45, 0.25, -1.45], e: 'l', pt: 'tip' },
      { t: r + 0.06, p: [0.07, -0.08, -0.5], q: [0.3, 0.25, -1.45], e: 'o', s: 0.003 },
      { t: 0.45, p: [0.072, -0.085, -0.5], e: 'l', s: 0.004 },
      { t: 0.8, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, p: 0.025, d: -0.008 }, { t: r + 0.03, p: -0.03, d: 0.014, f: 0.03, s: 0.002 }, { t: 0.45, p: -0.015, d: 0.008, s: 0.002 }, { t: 0.8 }],
      jolt: [[r, 0.06]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.16]] };
  });
  // ---- 鉤鎖乱舞: the chains caught and hauled in hand over hand: one hand reaches out and closes on them while the other draws back
  mv('sk_haul', () => {
    const A = [0.05, -0.07, -0.5], B = [0.15, -0.2, -0.24], qa = [0.9, 0.05, -1.5], qb = [0.55, 0.15, -1.4];
    const keys = (ph) => ph ? [
      { t: 0, p: [0.14, -0.3, -0.26], q: qb, f: 'fist' },
      { t: 0.08, p: B, q: qb, f: 'fist', e: 'o' },
      { t: 0.18, p: A, q: qa, f: 'hook', e: 'q' },
      { t: 0.22, f: 'fist', e: 'o' },
      { t: 0.36, p: B, q: qb, e: 'o' },
      { t: 0.46, p: [0.06, -0.08, -0.48], q: qa, f: 'hook', e: 'q' },
      { t: 0.5, f: 'fist', e: 'o' },
      { t: 0.8, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }] : [
      { t: 0, p: [0.12, -0.2, -0.3], q: qa, f: 'clawOpen' },
      { t: 0.07, p: A, q: qa, f: 'hook', e: 'o' },
      { t: 0.1, f: 'fist', e: 'o' },
      { t: 0.24, p: B, q: qb, e: 'o' },
      { t: 0.34, p: A, q: qa, f: 'hook', e: 'q' },
      { t: 0.38, f: 'fist', e: 'o' },
      { t: 0.52, p: B, q: qb, e: 'o' },
      { t: 0.8, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.8, hit: 0.07, both: true, main: F(keys(0)), off: F(keys(1)),
      body: [{ t: 0 }, { t: 0.08, f: 0.02 }, { t: 0.24, f: -0.03, p: 0.01, y: 0.01 }, { t: 0.36, f: -0.01, y: -0.01 }, { t: 0.52, f: -0.035, p: 0.012, y: 0.008 }, { t: 0.8 }],
      jolt: [[0.24, 0.05], [0.36, 0.04], [0.52, 0.05]], snd: [[0, 'cl', 1], [0.1, 'cl', 1.3], [0.22, 'cl', 1.1], [0.38, 'cl', 1.3], [0.5, 'cl', 1.1]] };
  });
  // ---- 地雷散布: a low side-arm sow: the handful swung up from the hip and swept across the body, the fingers opening as it goes so
  // the mines fan out
  mv('sk_sow', () => {
    const r = 0.12;
    return { dur: 0.68, rel: r, hit: r, release: true, relP: [0.11, -0.13, -0.47], main: [
      { t: 0, p: [0.32, -0.36, -0.1], q: [-0.4, 0.4, -2.6], f: 'hold' },
      { t: 0.06, p: [0.22, -0.25, -0.33], q: [0.1, 0.25, -2.8], e: 'i' },
      { t: r, p: 'hand', q: [0.3, -0.1, -2.95], f: 'release', e: 'l' },
      { t: r + 0.1, p: [-0.08, -0.13, -0.45], q: [0.35, -0.6, -2.95], f: 'splay', e: 'o' },
      { t: 0.4, p: [-0.1, -0.19, -0.42], f: 'relax', e: 's' },
      { t: 0.68, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, d: 0.012, y: -0.018, p: -0.012 }, { t: r + 0.06, y: 0.028, r: 0.012, f: 0.025, d: 0.006 }, { t: 0.42, y: 0.008 }, { t: 0.68 }],
      snd: [[0, 'cl', 0.9], [0.04, 'sw', 0.24, 0.24]] };
  });
  // ---- 幻影の囮: a palm-up lift, gentle: the hand rises before the chest and opens upward, letting the phantom go like a bird, held
  // open a moment
  mv('sk_loft', () => {
    const r = 0.12;
    return { dur: 0.8, rel: r, hit: r, release: true, relP: [0.1, -0.1, -0.47], main: F([
      { t: 0, p: [0.12, -0.32, -0.28], q: [0.0, 0, 3.05], f: 'cup' },
      { t: 0.06, p: [0.1, -0.22, -0.38], q: [0.2, 0, 3.05], e: 'o' },
      { t: r, p: 'hand', q: [0.45, 0, 3.05], f: 'release', e: 'l' },
      { t: 0.3, p: [0.1, -0.04, -0.43], q: [0.8, -0.05, 3.0], f: 'splay', e: 'o' },
      { t: 0.5, p: [0.1, -0.045, -0.43], q: [0.85, -0.05, 3.0], e: 'l' },
      { t: 0.8, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
      body: [{ t: 0 }, { t: 0.3, p: 0.025, d: -0.006 }, { t: 0.5, p: 0.02 }, { t: 0.8 }],
      snd: [[0, 'cl', 0.7], [0.08, 'sw', 0.12, 0.2]] };
  });
  // ---- 自動弩砲: the crossbow set down: the hand lifted by the shoulder and tossed down forward onto the spot, then left pointing at it
  mv('sk_lob', () => {
    const r = 0.12;
    return { dur: 0.7, rel: r, hit: r, release: true, relP: [0.08, -0.12, -0.5], main: [
      { t: 0, p: [0.22, -0.04, -0.2], q: [1.0, 0.2, -1.1], f: 'hold' },
      { t: 0.06, p: [0.17, -0.03, -0.33], q: [0.8, 0.1, -0.9], e: 'o' },
      { t: r, p: 'hand', q: [0.0, 0, -0.5], f: 'release', e: 'i' },
      { t: r + 0.1, p: [0.075, -0.135, -0.5], q: [-0.4, 0.05, -0.3], f: 'point', e: 'o' },
      { t: 0.45, p: [0.078, -0.13, -0.5], e: 'l' },
      { t: 0.7, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, p: 0.01 }, { t: r + 0.05, p: -0.04, d: 0.014, f: 0.02 }, { t: 0.45, p: -0.03, d: 0.01 }, { t: 0.7 }],
      snd: [[0, 'cl', 0.9], [0.06, 'sw', 0.18, 0.14]] };
  });

  // ---- 隕石落とし: the open hand raised to the sky and held there, straining, the fingers slowly closing on what it calls; then
  // wrenched down into a fist at the mark as the stone comes
  mv('sk_calldown', () => ({ dur: 1.15, hit: 0.12, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.12, p: [0.13, 0.06, -0.4], q: [1.75, -0.1, -0.15], f: 'splay', e: 'o' },
    { t: 0.35, p: [0.13, 0.075, -0.39], e: 's', s: 0.0015 },
    { t: 0.58, p: [0.13, 0.07, -0.39], f: 'clawOpen', e: 'l', s: 0.003 },
    { t: 0.72, p: [0.08, -0.13, -0.48], q: [0.8, 0.05, -1.4], f: 'fist', e: 'i' },
    { t: 0.8, p: [0.08, -0.12, -0.475], e: 'o', s: 0.002 },
    { t: 1.15, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.14, p: 0.035, d: -0.01 }, { t: 0.58, p: 0.045, d: -0.012, s: 0.0012 }, { t: 0.74, p: -0.035, d: 0.022, f: 0.02 }, { t: 0.9, p: -0.015, d: 0.01 }, { t: 1.15 }],
    jolt: [[0.72, 0.08]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.14, 0.14], [0.66, 'sw', 0.3, 0.12]] }));
  // ---- 矢の雨: the archers' signal: the flat hand raised high, edge on, held, and chopped forward and down at the ground marked
  mv('sk_volley', () => ({ dur: 0.85, hit: 0.1, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.18, 0.06, -0.34], q: [1.85, 0.05, -1.55], f: 'blade', e: 'o' },
    { t: 0.32, p: [0.18, 0.075, -0.335], e: 's', s: 0.001 },
    { t: 0.42, p: [0.08, -0.1, -0.52], q: [0.35, 0.05, -1.55], e: 'i' },
    { t: 0.48, p: [0.08, -0.11, -0.51], e: 'o' },
    { t: 0.85, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.12, p: 0.025, d: -0.008 }, { t: 0.32, p: 0.028 }, { t: 0.44, p: -0.02, f: 0.035, d: 0.008 }, { t: 0.85 }],
    jolt: [[0.42, 0.04]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.14, 0.12], [0.35, 'sw', 0.3, 0.12]] }));
  // ---- 火炎嵐: the hand held out over the mark and turned in a widening, rising spiral, palm down, the fingers opening upward as the
  // fire climbs, then flung up open
  mv('sk_kindle', () => {
    const c = [0.08, -0.13, -0.46];
    const ks = loop(0.08, 0.5, 10, (u) => {
      const a = u * Math.PI * 2.4, rr = 0.035 + 0.075 * u;
      return { p: [c[0] + Math.cos(a) * rr, c[1] + u * 0.11, c[2] + Math.sin(a) * rr * 0.8], q: [0.15 + 0.9 * u, 0.2 * Math.sin(a), 0.1], f: u < 0.5 ? 'claw' : 'clawOpen' };
    });
    return { dur: 0.95, hit: 0.08, main: [
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.08, p: [c[0] + 0.035, c[1], c[2]], q: [0.15, 0, 0.1], f: 'claw', e: 'o' },
      ...ks,
      { t: 0.6, p: [0.1, 0.0, -0.44], q: [1.6, -0.05, -0.1], f: 'splay', e: 'o' },
      { t: 0.95, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.1, f: 0.015 }, { t: 0.5, p: 0.012, f: 0.01 }, { t: 0.62, p: 0.03, d: -0.008 }, { t: 0.95 }],
      jolt: [[0.6, 0.03]], snd: [[0, 'cl', 0.8], [0.2, 'sw', 0.1, 0.4], [0.55, 'sw', 0.22, 0.14]] };
  });
  // ---- 毒霧: a handful brought up palm up before the mouth, then blown out: the hand pushed out and the fingers spread as it goes
  mv('sk_blow', () => ({ dur: 0.85, hit: 0.1, main: F([
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.05, -0.11, -0.27], q: [0.45, 0, 3.0], f: 'cup', e: 'o' },
    { t: 0.24, p: [0.05, -0.105, -0.27], e: 's' },
    { t: 0.36, p: [0.07, -0.08, -0.5], q: [0.65, 0, 3.0], f: 'splay', e: 'o' },
    { t: 0.52, p: [0.075, -0.085, -0.51], f: 'relax', e: 's' },
    { t: 0.85, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
    body: [{ t: 0 }, { t: 0.12, p: -0.03, d: 0.008 }, { t: 0.24, p: -0.03, d: 0.01, f: -0.01 }, { t: 0.38, p: 0.005, f: 0.03 }, { t: 0.85 }],
    snd: [[0, 'cl', 0.8], [0.26, 'sw', 0.16, 0.3]] }));
  // ---- 腐蝕の雨: the closed hand held out over the mark, palm down, and the fingers flicked open three times - a sprinkling
  mv('sk_sprinkle', () => {
    const P0 = [0.1, 0.035, -0.45], dip = (t, y) => ({ t, p: [P0[0], P0[1] + y, P0[2]] });
    return { dur: 0.95, hit: 0.1, main: F([
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.1, p: P0, q: [0.45, 0.1, 0.1], f: 'hold', e: 'o' },
      Object.assign(dip(0.17, -0.02), { f: 'flick', e: 'o' }),
      Object.assign(dip(0.25, 0.0), { f: 'hold', e: 'q' }),
      Object.assign(dip(0.32, -0.02), { f: 'flick', e: 'o' }),
      Object.assign(dip(0.4, 0.0), { f: 'hold', e: 'q' }),
      Object.assign(dip(0.47, -0.025), { f: 'flick', e: 'o' }),
      { t: 0.62, p: [0.09, -0.06, -0.47], f: 'relax', e: 's' },
      { t: 0.95, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
      body: [{ t: 0 }, { t: 0.12, p: 0.012 }, { t: 0.5, p: 0.012 }, { t: 0.95 }],
      snd: [[0, 'cl', 0.8], [0.16, 'sw', 0.06, 0.08], [0.31, 'sw', 0.06, 0.08], [0.46, 'sw', 0.07, 0.08]] };
  });
  // ---- 渦潮: the hand pressed down over the mark and stirred in a tightening spiral, sinking, the fingers drawing in as the water is
  // drawn round
  mv('sk_stir', () => {
    const c = [0.07, -0.1, -0.47];
    const ks = loop(0.1, 0.62, 12, (u) => {
      const a = -u * Math.PI * 3, rr = 0.11 - 0.08 * u;
      return { p: [c[0] + Math.cos(a) * rr, c[1] - u * 0.03, c[2] + Math.sin(a) * rr * 0.7], q: [-0.15 - 0.2 * u, -0.25 * Math.sin(a), 0.05], f: u < 0.6 ? 'relax' : 'cup' };
    });
    return { dur: 0.95, hit: 0.1, main: F([
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.1, p: [c[0] + 0.11, c[1], c[2]], q: [-0.1, 0, 0.05], f: 'flat', e: 'o' },
      ...ks,
      { t: 0.95, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
      body: [{ t: 0 }, { t: 0.12, f: 0.015, p: -0.01 }, { t: 0.6, d: 0.012, p: -0.02, f: 0.015 }, { t: 0.95 }],
      snd: [[0, 'cl', 0.8], [0.15, 'sw', 0.08, 0.45]] };
  });
  // ---- 重力井戸: the hand laid out palm down over the mark and borne down, slowly, under a weight that grows, the fingers clawing in,
  // until it is crushed shut and dragged down
  mv('sk_weigh', () => ({ dur: 1.05, hit: 0.12, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.12, p: [0.08, -0.03, -0.49], q: [1.25, -0.1, -0.3], f: 'clawOpen', e: 'o' },
    { t: 0.4, p: [0.08, -0.07, -0.485], q: [1.1, -0.1, -0.3], f: 'claw', e: 's', s: 0.0015 },
    { t: 0.62, p: [0.08, -0.1, -0.48], q: [0.95, -0.1, -0.35], e: 'l', s: 0.0035 },
    { t: 0.7, p: [0.08, -0.16, -0.46], q: [0.4, 0.05, -0.4], f: 'fist', e: 'i' },
    { t: 0.78, p: [0.08, -0.155, -0.47], e: 'o', s: 0.002 },
    { t: 1.05, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.14, f: 0.015 }, { t: 0.62, d: 0.02, p: -0.02, f: 0.015, s: 0.0015 }, { t: 0.72, d: 0.035, p: -0.035, f: 0.02 }, { t: 0.85, d: 0.015, p: -0.015 }, { t: 1.05 }],
    jolt: [[0.7, 0.06]], snd: [[0, 'cl', 0.8], [0.5, 'cl', 0.8], [0.68, 'cl', 1.5]] }));
  // ---- 闇の手: the hands of the dark coming up out of the ground: a palm-up claw rises from below to before the chest and snaps shut,
  // held, trembling with the grip
  mv('sk_rise', () => ({ dur: 0.9, hit: 0.1, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.08, p: [0.08, -0.25, -0.44], q: [0.25, 0, 3.0], f: 'clawOpen', e: 'o' },
    { t: 0.2, p: [0.08, -0.08, -0.48], q: [0.55, 0, 3.0], e: 'o' },
    { t: 0.26, q: [0.65, 0.05, 2.9], f: 'fist', e: 'i' },
    { t: 0.32, p: [0.08, -0.09, -0.475], e: 'o', s: 0.003 },
    { t: 0.6, p: [0.08, -0.095, -0.47], e: 'l', s: 0.004 },
    { t: 0.9, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, p: -0.015 }, { t: 0.26, p: 0.01, f: 0.015 }, { t: 0.6, f: 0.012, s: 0.0012 }, { t: 0.9 }],
    jolt: [[0.26, 0.05]], snd: [[0, 'cl', 0.8], [0.12, 'sw', 0.14, 0.12], [0.25, 'cl', 1.5]] }));
  // ---- 処刑の刻印: two fingers levelled at the foe and a cross cut on him in two strokes, then a jab that seals it
  mv('sk_brand', () => {
    const q = [0.3, 0.3, -1.35];
    return { dur: 0.78, hit: 0.09, main: [
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.09, p: [0.11, -0.025, -0.48], q, f: 'seal', e: 'o' },
      { t: 0.17, p: [0.04, -0.105, -0.49], e: 'i' },
      { t: 0.24, p: [0.04, -0.025, -0.48], e: 'q' },
      { t: 0.31, p: [0.11, -0.105, -0.49], e: 'i' },
      { t: 0.38, p: [0.07, -0.07, -0.44], e: 'o' },
      { t: 0.44, p: [0.07, -0.065, -0.53], e: 'i' },
      { t: 0.52, p: [0.07, -0.068, -0.51], e: 'o' },
      { t: 0.78, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.1, f: 0.015 }, { t: 0.44, f: 0.03, d: 0.004 }, { t: 0.78 }],
      jolt: [[0.44, 0.025]], snd: [[0, 'cl', 0.8], [0.12, 'sw', 0.1, 0.07], [0.26, 'sw', 0.1, 0.07], [0.4, 'sw', 0.12, 0.06]] };
  });

  // ---- 大地の棘: the hand slapped down flat on the ground and raked forward and up, the fingers clawing - the stone torn up ahead
  mv('sk_rip', () => ({ dur: 0.7, hit: 0.09, main: [
    { t: 0, p: [0.14, -0.08, -0.38], q: [0.2, 0.05, 0.12], f: 'splay' },
    { t: 0.09, p: [0.09, -0.155, -0.46], q: [-0.45, 0.05, 0.08], f: 'press', e: 'i' },
    { t: 0.14, p: [0.09, -0.158, -0.47], e: 'o', s: 0.002 },
    { t: 0.26, p: [0.07, -0.1, -0.5], q: [0.75, 0, 0.05], f: 'claw', e: 'o' },
    { t: 0.36, p: [0.075, -0.05, -0.48], q: [1.2, 0, 0.05], f: 'clawOpen', e: 'o' },
    { t: 0.7, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, d: 0.075, p: -0.085, f: 0.02 }, { t: 0.28, d: 0.03, p: -0.03, f: 0.035 }, { t: 0.4, p: 0.005, f: 0.01 }, { t: 0.7 }],
    jolt: [[0.09, 0.08], [0.26, 0.04]], snd: [[0, 'cl', 0.9], [0.09, 'th', 0.22], [0.2, 'sw', 0.22, 0.14]] }));
  // ---- 石壁: both hands down at the floor, hooked under the slab, and hauled up with the whole back as the wall rises
  mv('sk_lift', () => {
    const keys = (d) => [
      { t: 0, p: [0.14, -0.32, -0.36], q: [0.0, 0.1, 2.9], f: 'hook' },
      { t: 0.06 + d, p: [0.13, -0.25, -0.42], q: [0.15, 0.1, 2.9], e: 'o', s: 0.002 },
      { t: 0.22 + d, p: [0.12, -0.05, -0.42], q: [0.85, 0.1, 2.75], f: 'fist', e: 'q', s: 0.003 },
      { t: 0.45, p: [0.12, -0.04, -0.415], e: 'l', s: 0.002 },
      { t: 0.75, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.75, hit: 0.06, both: true, main: F(keys(0)), off: F(keys(0.015)),
      body: [{ t: 0 }, { t: 0.06, d: 0.05, p: -0.07, f: 0.02, s: 0.001 }, { t: 0.24, d: -0.01, p: 0.015, s: 0.002 }, { t: 0.45, p: 0.01 }, { t: 0.75 }],
      jolt: [[0.22, 0.07]], snd: [[0, 'cl', 1.2], [0.08, 'cl', 1], [0.2, 'sw', 0.18, 0.18]] };
  });
  // ---- 生命吸収: the clawed hand held out at the foes, the fingers working, and drawn slowly back to the chest, turning to the face
  mv('sk_siphon', () => ({ dur: 1.0, hit: 0.1, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.08, -0.08, -0.5], q: [1.45, -0.1, -0.35], f: 'clawOpen', e: 'o' },
    { t: 0.22, f: 'claw', e: 's', s: 0.002 },
    { t: 0.32, f: 'clawOpen', e: 's', s: 0.002 },
    { t: 0.44, p: [0.1, -0.12, -0.4], q: [1.5, 0, 1.6], f: 'claw', e: 's', s: 0.003 },
    { t: 0.62, p: [0.09, -0.15, -0.3], q: [1.45, 0, 3.0], f: 'fist', e: 's', s: 0.002 },
    { t: 1.0, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.12, f: 0.02 }, { t: 0.4, f: 0.01, s: 0.001 }, { t: 0.64, f: -0.02, p: 0.012, d: -0.005 }, { t: 1.0 }],
    jolt: [[0.62, 0.03]], snd: [[0, 'cl', 0.8], [0.22, 'cl', 0.9], [0.44, 'cl', 0.9], [0.6, 'cl', 1.2]] }));
  // ---- 魂の収穫: a reaper's stroke: the edge of the hand swung from high out at the side down across the body, then the souls taken
  // in the fist and drawn to the chest
  mv('sk_reap', () => ({ dur: 0.85, hit: 0.05, main: [
    { t: 0, p: [0.36, 0.08, -0.24], q: [0.55, 0.5, -1.45], f: 'blade' },
    { t: 0.05, p: [0.1, -0.08, -0.46], q: [0.3, 0.0, -1.55], e: 'i' },
    { t: 0.1, p: [-0.12, -0.18, -0.42], q: [0.15, -0.55, -1.65], e: 'o' },
    { t: 0.2, p: [-0.15, -0.21, -0.38], e: 'o' },
    { t: 0.38, p: [-0.02, -0.12, -0.42], q: [1.2, 0, 2.6], f: 'clawOpen', e: 's' },
    { t: 0.46, p: [0.06, -0.15, -0.3], q: [1.45, 0, 3.0], f: 'fist', e: 'o' },
    { t: 0.85, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0, y: -0.02, p: 0.012 }, { t: 0.12, y: 0.035, r: 0.02, p: -0.02, d: 0.01 }, { t: 0.48, f: -0.015, p: 0.01 }, { t: 0.85 }],
    jolt: [[0.05, 0.03], [0.46, 0.03]], snd: [[0, 'cl', 0.9], [0.01, 'sw', 0.32, 0.2], [0.44, 'cl', 1.2]] }));
  // ---- 次元斬: the edge of the hand raised high over the middle of the view and cut straight down through it - the air split
  mv('sk_cleave', () => ({ dur: 0.66, hit: 0.05, main: [
    { t: 0, p: [0.08, 0.13, -0.46], q: [1.95, 0.0, -1.57], f: 'blade' },
    { t: 0.05, p: [0.04, -0.06, -0.48], q: [0.8, 0, -1.57], e: 'i' },
    { t: 0.1, p: [0.03, -0.21, -0.44], q: [0.1, 0, -1.57], e: 'o' },
    { t: 0.3, p: [0.035, -0.22, -0.43], e: 's' },
    { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0, p: 0.02, d: -0.008 }, { t: 0.09, p: -0.035, d: 0.016, f: 0.025 }, { t: 0.32, p: -0.01 }, { t: 0.66 }],
    jolt: [[0.06, 0.06]], snd: [[0, 'cl', 0.9], [0.0, 'sw', 0.34, 0.14]] }));
  // ---- 刃の旋風: the hand, fingers spread, swung round in a flat circle before the body, outward and back - the blades set spinning
  mv('sk_whirl', () => {
    const c = [0.06, -0.085, -0.44];
    const ks = loop(0.06, 0.42, 12, (u) => {
      const a = Math.PI * 0.5 - u * Math.PI * 2;
      // (the ring is tilted up toward the eye: laid flat, it would be seen edge on, a hand going left and right)
      return { p: [c[0] + Math.cos(a) * 0.2, c[1] + Math.sin(a) * 0.07, c[2] - Math.sin(a) * 0.07], q: [0.25 + 0.2 * Math.sin(a), a - Math.PI * 0.5, 0.15], f: 'splay' };
    });
    return { dur: 0.72, hit: 0.06, main: [
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.06, p: [c[0], c[1], c[2] - 0.1], q: [0.05, 0, 0.15], f: 'splay', e: 'o' },
      ...ks,
      { t: 0.72, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.15, y: 0.02, r: 0.01 }, { t: 0.3, y: -0.02, r: -0.01 }, { t: 0.45, y: 0.005 }, { t: 0.72 }],
      snd: [[0, 'cl', 0.8], [0.08, 'sw', 0.26, 0.36]] };
  });
  // ---- 鬨の声: the fist thrust up over the head and shaken with the roar, the head thrown back
  mv('sk_roar', () => ({ dur: 0.9, hit: 0.1, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.15, 0.05, -0.37], q: [1.55, 0.05, -0.35], f: 'fist', e: 'o' },
    { t: 0.18, p: [0.15, 0.085, -0.36], e: 'o', s: 0.002 },
    { t: 0.27, p: [0.15, 0.05, -0.375], e: 'q', s: 0.002 },
    { t: 0.36, p: [0.15, 0.085, -0.36], e: 'o', s: 0.003 },
    { t: 0.5, p: [0.15, 0.06, -0.37], e: 's', s: 0.002 },
    { t: 0.9, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.12, p: 0.05, d: -0.012, f: 0.01, s: 0.002 }, { t: 0.5, p: 0.045, d: -0.01, s: 0.0025 }, { t: 0.9 }],
    jolt: [[0.1, 0.06], [0.36, 0.03]], snd: [[0, 'cl', 1.2], [0.05, 'sw', 0.22, 0.12]] }));
  // ---- 骸骨兵召喚: the puppeteer's hand: held out low, palm down, fingers hanging, and lifted slowly, the fingers curling up as if
  // drawing the dead up out of the ground on strings; then a last jerk up
  mv('sk_puppet', () => ({ dur: 1.0, hit: 0.12, main: F([
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.12, p: [0.08, -0.12, -0.47], q: [0.25, 0, 0.05], f: 'hang', e: 'o' },
    { t: 0.3, p: [0.08, -0.09, -0.47], q: [0.35, 0, 0.05], e: 's', s: 0.0012 },
    { t: 0.52, p: [0.08, -0.03, -0.46], q: [0.55, 0, 0.05], f: 'claw', e: 's', s: 0.002 },
    { t: 0.6, p: [0.08, 0.01, -0.45], q: [0.45, 0, 0.05], f: 'claw', e: 'o' },
    { t: 1.0, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
    body: [{ t: 0 }, { t: 0.14, p: -0.025, d: 0.01 }, { t: 0.52, p: 0.0, d: 0.0 }, { t: 0.62, p: 0.025, d: -0.008 }, { t: 1.0 }],
    jolt: [[0.6, 0.04]], snd: [[0, 'cl', 0.8], [0.3, 'cl', 0.7], [0.56, 'sw', 0.18, 0.12]] }));

  // ---- 時間減速: a pocket watch of old brass is held up in the palm before the chest, its face to the eye; the thumb is lifted and
  // pressed hard down on its crown (the moment time slows), and the hand closes over the watch as it goes back to the gun
  let watch = null;
  function watchProp() {
    if (watch) return watch;
    const g = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0x6e5532, metalness: 0.85, roughness: 0.45 });
    // the face: old ivory, its hours, two dark hands (drawn once on a small canvas)
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#a99c80'; x.fillRect(0, 0, 128, 128);
    const gr = x.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,15,0.45)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#2a2218'; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 56, 0, 6.283); x.stroke();
    for (let h = 0; h < 12; h++) { const a = h / 12 * 6.283, r0 = h % 3 ? 47 : 42; x.lineWidth = h % 3 ? 2 : 4; x.beginPath(); x.moveTo(64 + Math.sin(a) * r0, 64 - Math.cos(a) * r0); x.lineTo(64 + Math.sin(a) * 53, 64 - Math.cos(a) * 53); x.stroke(); }
    x.lineCap = 'round'; x.lineWidth = 5; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + 22, 64 - 18); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 - 8, 64 - 38); x.stroke();
    x.fillStyle = '#2a2218'; x.beginPath(); x.arc(64, 64, 4, 0, 6.283); x.fill();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const faceM = new THREE.MeshStandardMaterial({ map: tex, metalness: 0, roughness: 0.55 });
    // (the hand's own space: palm down (-y), fingers to -z, the thumb to -x: the watch lies under the palm, face down and out, its
    // crown turned toward the thumb)
    const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0215, 0.008, 32), brass);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0018, 6, 32), brass); rim.rotation.x = Math.PI / 2; rim.position.y = -0.0045;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.0185, 32), faceM); face.rotation.x = Math.PI / 2; face.position.y = -0.0042;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.005, 10), brass); stem.rotation.x = Math.PI / 2; stem.position.z = -0.0235;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.0045, 12), brass); crown.rotation.x = Math.PI / 2; crown.position.z = -0.0275;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.0065, 0.0012, 6, 16), brass); bow.rotation.x = Math.PI / 2; bow.position.z = -0.0355;
    const w = new THREE.Group(); w.add(cs, rim, face, stem, crown, bow);
    w.rotation.y = Math.PI * 0.3; w.position.set(-0.004, -0.034, -0.052);
    g.add(w);
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    return (watch = g);
  }
  mv('sk_watch', () => ({ dur: 0.95, hit: 0.12, prop: watchProp, main: F([
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.05, -0.115, -0.36], q: [0.75, 0.2, 3.0], f: 'cradle', e: 'o' },
    { t: 0.22, p: [0.05, -0.11, -0.355], f: { f: FX.cradle.f, t: [0.0, -0.15, -0.1, 0.55] }, e: 's' },
    { t: 0.3, f: 'cradlePress', e: 'i', s: 0.0015 },
    { t: 0.4, f: 'cradle', e: 'o' },
    { t: 0.6, p: [0.05, -0.12, -0.36], q: [0.55, 0.2, 2.9], f: 'watch', e: 's' },
    { t: 0.95, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
    body: [{ t: 0 }, { t: 0.14, p: -0.05, d: 0.006 }, { t: 0.3, p: -0.055, d: 0.008 }, { t: 0.6, p: -0.04, d: 0.006 }, { t: 0.95 }],
    jolt: [[0.3, 0.02]], snd: [[0, 'cl', 0.8], [0.3, 'cl', 1.6]] }));
  // ---- 時間逆行: a dial in the air taken between the thumb and the first two fingers and wound back hard, twice (the hand lets go and
  // takes it again between the turns), then snatched back to the shoulder
  mv('sk_unwind', () => {
    const P0 = [0.075, -0.06, -0.46], qa = (z) => [1.05, 0.0, z];
    return { dur: 0.78, hit: 0.08, main: F([
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.08, p: P0, q: qa(0.5), f: 'pinchOpen', e: 'o' },
      { t: 0.11, f: 'pinch', e: 'i' },
      { t: 0.22, q: qa(-0.9), e: 'q', s: 0.0008 },
      { t: 0.26, f: 'pinchOpen', e: 'o' },
      { t: 0.3, q: qa(0.5), e: 'q' },
      { t: 0.33, f: 'pinch', e: 'i' },
      { t: 0.44, q: qa(-0.9), e: 'q', s: 0.0008 },
      { t: 0.54, p: [0.2, -0.1, -0.22], q: [1.1, 0.4, -0.6], f: 'fist', e: 'o' },
      { t: 0.78, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }]),
      body: [{ t: 0 }, { t: 0.1, f: 0.012 }, { t: 0.44, f: 0.012 }, { t: 0.56, f: -0.04, p: 0.015 }, { t: 0.78 }],
      jolt: [[0.54, 0.03]], snd: [[0, 'cl', 0.8], [0.11, 'cl', 0.9], [0.33, 'cl', 0.9], [0.48, 'sw', 0.2, 0.1]] };
  });
  // ---- 透明化: the palm drawn down over the face from the brow, like a veil pulled down; the hand passes off below
  mv('sk_veil', () => ({ dur: 0.62, hit: 0.1, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.1, p: [0.07, 0.13, -0.22], q: [1.65, 0, 3.1], f: 'flat', e: 'o' },
    { t: 0.32, p: [0.06, -0.2, -0.24], q: [1.2, 0, 3.1], e: 's' },
    { t: 0.62, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.12, p: 0.01 }, { t: 0.32, p: -0.025, d: 0.01 }, { t: 0.62 }],
    snd: [[0, 'cl', 0.9], [0.14, 'sw', 0.1, 0.2]] }));
  // ---- 影分身: both hands' first two fingers crossed in a sign before the face (one upright, one across), held, then let go
  mv('sk_cross', () => {
    const main = [
      { t: 0, p: [0.14, -0.3, -0.26], q: [1.0, 0.1, -1.4], f: 'relax' },
      { t: 0.1, p: [0.0, -0.11, -0.34], q: [1.5, 0.1, -1.5], f: 'seal', e: 'o' },
      { t: 0.14, p: [0.0, -0.108, -0.342], e: 'o' },
      { t: 0.55, p: [0.0, -0.105, -0.345], e: 'l', s: 0.0008 },
      { t: 0.85, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    const off = [
      { t: 0, p: [0.14, -0.3, -0.26], q: [0.6, 0.1, -1.4], f: 'relax' },
      { t: 0.1, p: [0.075, -0.075, -0.32], q: [1.5, 1.45, 0.0], f: 'seal', e: 'o' },
      { t: 0.14, p: [0.075, -0.073, -0.322], e: 'o' },
      { t: 0.55, p: [0.075, -0.07, -0.325], e: 'l', s: 0.0008 },
      { t: 0.85, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.85, hit: 0.1, both: true, main, off,
      body: [{ t: 0 }, { t: 0.12, d: 0.012, p: -0.015 }, { t: 0.55, d: 0.014, p: -0.016 }, { t: 0.85 }],
      jolt: [[0.1, 0.025]], snd: [[0, 'cl', 1], [0.1, 'cp', 0.5]] };
  });
  // ---- 天秤の祈り: both hands held out to the sides, palms up like the pans of a scale, rocking against each other and coming to rest
  // level
  mv('sk_scales', () => {
    const keys = (s) => [
      { t: 0, p: [0.16, -0.32, -0.3], q: [0.2, 0, 2.9], f: 'relax' },
      { t: 0.14, p: [0.22, -0.11 + 0.035 * s, -0.42], q: [0.15, 0.05, 2.95], e: 'o' },
      { t: 0.34, p: [0.22, -0.11 - 0.03 * s, -0.42], e: 's' },
      { t: 0.52, p: [0.22, -0.11 + 0.015 * s, -0.42], e: 's' },
      { t: 0.7, p: [0.22, -0.11, -0.42], e: 's' },
      { t: 0.85, p: [0.22, -0.11, -0.42], e: 'l' },
      { t: 1.1, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 1.1, hit: 0.14, both: true, main: keys(1), off: keys(-1),
      body: [{ t: 0 }, { t: 0.14, d: 0.006, r: -0.008 }, { t: 0.34, r: 0.007 }, { t: 0.52, r: -0.003 }, { t: 0.7, p: -0.008 }, { t: 1.1 }],
      snd: [[0, 'cl', 1], [0.3, 'cl', 0.5]] };
  });
  // ---- 癒しの泉: both hands cupped together low before the body, as water is taken from a spring, lifted, and parted palms up
  mv('sk_spring', () => {
    const keys = (d) => [
      { t: 0, p: [0.12, -0.32, -0.3], q: [0.1, 0, 2.9], f: 'relax' },
      { t: 0.12 + d, p: [0.045, -0.22, -0.4], q: [0.2, -0.25, 2.75], f: 'cup', e: 'o' },
      { t: 0.4 + d, p: [0.05, -0.12, -0.4], q: [0.45, -0.25, 2.75], e: 's' },
      { t: 0.62 + d, p: [0.19, -0.13, -0.42], q: [0.3, 0.15, 2.95], f: 'splay', e: 's' },
      { t: 0.95, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.95, hit: 0.12, both: true, main: F(keys(0)), off: F(keys(0.01)),
      body: [{ t: 0 }, { t: 0.14, p: -0.04, d: 0.015 }, { t: 0.42, p: -0.015, d: 0.006 }, { t: 0.62, p: 0.008 }, { t: 0.95 }],
      snd: [[0, 'cl', 1], [0.12, 'cp', 0.3], [0.5, 'sw', 0.08, 0.2]] };
  });
  // ---- 茨の鎧: the fists brought up in a guard before the face, the forearms upright, braced and trembling as the hide hardens, then
  // struck out and down to the sides as the thorns burst from the ground
  mv('sk_brace', () => {
    const keys = (d) => [
      { t: 0, p: [0.15, -0.3, -0.28], q: [0.8, 0.1, -1.4], f: 'relax' },
      { t: 0.1 + d, p: [0.085, -0.075, -0.33], q: [1.35, -0.15, -1.45], f: 'fist', e: 'o' },
      { t: 0.38, p: [0.08, -0.085, -0.325], q: [1.3, -0.1, -1.4], e: 'l', s: 0.003 },
      { t: 0.48, p: [0.24, -0.2, -0.36], q: [0.3, 0.3, -1.4], e: 'o' },
      { t: 0.8, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.8, hit: 0.1, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.1, d: 0.02, p: -0.02, f: -0.01 }, { t: 0.38, d: 0.03, p: -0.025, s: 0.002 }, { t: 0.5, d: -0.008, p: 0.015, f: 0.02 }, { t: 0.8 }],
      jolt: [[0.1, 0.04], [0.48, 0.07]], snd: [[0, 'cl', 1.2], [0.1, 'cl', 1], [0.44, 'sw', 0.26, 0.16]] };
  });
  // ---- 弾幕: the gun is slapped twice on its side with the flat of the hand, as if to wake it (or, a hand weapon held, the fist struck
  // into the palm): its bolt goes back with it
  mv('sk_slap', () => {
    const g = CA.gunNow ? CA.gunNow() : gripNow();
    // (no gun in the right hand: a hand weapon is lowered and the right fist is struck twice into the open left palm before the chest)
    if (!g) {
      const palm = [0.05, -0.12, -0.38], PQ = [1.45, -0.05, -1.57];
      return { dur: 0.6, hit: 0.1, both: true,
        main: [
          { t: 0, p: [0.17, -0.3, -0.28], q: [0.8, 0.1, -1.2], f: 'relax' },
          { t: 0.08, p: palm, q: PQ, f: 'flat', e: 'o' },
          { t: 0.3, p: [palm[0], palm[1] - 0.003, palm[2]], e: 'l', s: 0.0015 },
          { t: 0.6, p: 'rest', q: [-0.4, 0.1, 0.5], f: 'rest', e: 's' }],
        off: [
          { t: 0, p: [0.2, -0.3, -0.26], q: [0.6, 0.1, -0.9], f: 'fist' },
          { t: 0.06, p: [0.11, -0.1, -0.33], q: [0.5, 0.4, -0.4], e: 'o' },
          { t: 0.1, p: [-0.015, -0.12, -0.375], q: [0.3, 0.9, -0.3], e: 'i' },
          { t: 0.17, p: [0.1, -0.1, -0.34], e: 'o' },
          { t: 0.22, p: [-0.015, -0.12, -0.375], e: 'i' },
          { t: 0.3, p: [-0.01, -0.118, -0.37], e: 'o', s: 0.002 },
          { t: 0.6, p: 'rest', q: [-0.4, 0.1, 0.5], f: 'rest', e: 's' }],
        body: [{ t: 0 }, { t: 0.1, d: 0.008, p: -0.008 }, { t: 0.22, d: 0.01, p: -0.01 }, { t: 0.6 }],
        jolt: [[0.1, 0.03], [0.22, 0.04]], snd: [[0.09, 'cp', 0.9], [0.21, 'cp', 1.0]] };
    }
    // (the wrist out to the gun's left side and down from its top, the palm turned in flat against the receiver; drawn out from it
    // between the slaps)
    const on = ['gun', 0.035, -0.06, 0.02], up = ['gun', 0.1, -0.03, 0.02], QF = [0.05, 0.05, -1.45], QU = [0.25, 0.1, -1.2];
    return { dur: 0.6, hit: 0.1, main: [
      { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
      { t: 0.06, p: up, q: QU, f: 'flat', e: 'o' },
      { t: 0.1, p: on, q: QF, e: 'i' },
      { t: 0.17, p: up, q: QU, e: 'o' },
      { t: 0.22, p: on, q: QF, e: 'i' },
      { t: 0.3, p: ['gun', 0.045, -0.055, 0.02], e: 'o' },
      { t: 0.6, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.1, d: 0.006, p: -0.008 }, { t: 0.22, d: 0.008, p: -0.01 }, { t: 0.6 }],
      jolt: [[0.1, 0.03], [0.22, 0.04]], snd: [[0.09, 'cp', 0.7], [0.21, 'cp', 0.9]] };
  });
  // ---- 跳弾の嵐: the first finger traces a bullet's way off one wall and another: a quick zig-zag, each turn sharp
  mv('sk_zigzag', () => ({ dur: 0.66, hit: 0.08, main: [
    { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' },
    { t: 0.08, p: [0.14, -0.03, -0.48], q: [0.4, 0.5, -1.3], f: 'point', e: 'o' },
    { t: 0.15, p: [0.03, -0.08, -0.5], q: [0.35, 0.2, -1.3], e: 'o' },
    { t: 0.22, p: [0.13, -0.12, -0.49], q: [0.3, 0.5, -1.3], e: 'o' },
    { t: 0.29, p: [0.04, -0.06, -0.52], q: [0.35, 0.25, -1.3], e: 'o' },
    { t: 0.38, p: [0.045, -0.062, -0.515], e: 'o' },
    { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, f: 0.01, y: -0.006 }, { t: 0.18, y: 0.008 }, { t: 0.25, y: -0.006 }, { t: 0.32, y: 0.004, f: 0.015 }, { t: 0.66 }],
    snd: [[0, 'cl', 0.7], [0.1, 'sw', 0.08, 0.05], [0.17, 'sw', 0.08, 0.05], [0.24, 'sw', 0.08, 0.05]] }));

  CA.table({
    // ---- movement
    dash: { m: 'part' },                                         // ダッシュ: both hands part the air
    dash2: { m: 'sk_dive' },                                     // 疾風迅雷: driven out together, torn apart crackling
    blink: { m: 'sk_flick' },                                    // ブリンク: two fingers flicked at where you go
    leap: { m: 'sk_jump' },                                      // 雷鳴の跳躍: both arms swung up into the jump
    flight: { m: 'sk_wings' },                                   // 飛翔: pushed off the air, the arms spread
    lunge: { m: 'sk_rake', at: 0.16 },                           // 吸血の刃: a claw raked down as the strike lands (0.16 s)
    haste: { m: 'sk_wind' },                                     // 加速装置: the bracer's crank wound
    // ---- thrown / shot from the hand
    spear: { m: 'sk_javelin' },                                  // 投槍
    icespear: { m: 'sk_stab' },                                  // 氷槍: held point down, stabbed out
    fireball: { m: 'sk_hurl' },                                  // 火球: from the cupped palm, flung up and out
    waterbolt: { m: 'sk_splash' },                               // 水弾: a side-arm flick
    magnet: { m: 'sk_magnet' },                                  // 磁力爆弾: thrust out, then clenched and yanked back
    sk_pile: { m: 'sk_ram' },                                    // 破甲杭: a ram from the hip, kicked back
    chain: { m: 'sk_zap' },                                      // 連鎖雷: the bolt leaves the finger tip
    chain2: { m: 'sk_smite' },                                   // 雷神の裁き: two fingers brought down from on high
    anchorstorm: { m: 'sk_haul' },                               // 鉤鎖乱舞: the chains hauled in hand over hand
    mines: { m: 'sk_sow' },                                      // 地雷散布: sown across the body
    decoy: { m: 'sk_loft' },                                     // 幻影の囮: let go upward from the palm
    turret: { m: 'sk_lob' },                                     // 自動弩砲: tossed down onto the spot
    // ---- at a point aimed at
    meteor: { m: 'sk_calldown' },                                // 隕石落とし: called from the sky, dragged down
    arrowrain: { m: 'sk_volley' },                               // 矢の雨: the archers' signal
    firestorm: { m: 'sk_kindle' },                               // 火炎嵐: a rising spiral
    toxic: { m: 'sk_blow' },                                     // 毒霧: blown from the palm
    sk_acid: { m: 'sk_sprinkle' },                               // 腐蝕の雨: sprinkled
    whirlpool: { m: 'sk_stir' },                                 // 渦潮: stirred in a tightening spiral
    gravity: { m: 'sk_weigh' },                                  // 重力井戸: borne down by a weight, crushed shut
    grasp: { m: 'sk_rise' },                                     // 闇の手: a claw up out of the ground, clenched
    mark: { m: 'sk_brand' },                                     // 処刑の刻印: a cross cut with two fingers
    // ---- round you / ahead of you
    shockwave: { m: 'push2' },                                   // 衝撃波
    emp: { m: 'clasp', clap: 1, open: true, hold: 0.05 },        // EMPバースト: a clap, flung open
    frostnova: { m: 'plant', both: true, hold: 0.3 },            // フロストノヴァ: both palms on the ground
    groundpound: { m: 'slam', palm: true },                      // 地裂掌: the palm struck on the ground
    quake: { m: 'slam', both: true },                            // 地震: both fists
    spikes: { m: 'sk_rip' },                                     // 大地の棘: slapped down, raked forward and up
    barrier: { m: 'sk_lift' },                                   // 石壁: hauled up out of the ground
    drain: { m: 'sk_siphon' },                                   // 生命吸収: drawn back to the chest
    harvest: { m: 'sk_reap' },                                   // 魂の収穫: a reaper's stroke, the souls taken in
    holynova: { m: 'clasp', open: true },                        // 聖なる光: a prayer, flung open
    sk_rift: { m: 'sk_cleave' },                                 // 次元斬: cut straight down
    blades: { m: 'sk_whirl' },                                   // 刃の旋風: swung round in a circle
    warcry: { m: 'sk_roar' },                                    // 鬨の声: the fist shaken overhead
    summon: { m: 'sk_puppet' },                                  // 骸骨兵召喚: drawn up on strings
    // ---- on yourself
    chrono: { m: 'sk_watch', tick: (c, t) => { if (c.prop) c.prop.visible = t < 0.8; } },   // 時間減速: a pocket watch's crown pressed
    rewind: { m: 'sk_unwind' },                                  // 時間逆行: a dial pinched and wound back, snatched back
    cloak: { m: 'sk_veil' },                                     // 透明化: a veil drawn down over the face
    sk_shadow: { m: 'sk_cross' },                                // 影分身: two fingers of each hand crossed
    sk_scale: { m: 'sk_scales' },                                // 天秤の祈り: the pans of a scale
    healaura: { m: 'sk_spring' },                                // 癒しの泉: water cupped from a spring
    thornarmor: { m: 'sk_brace' },                               // 茨の鎧: forearms crossed, thrown out
    berserk: { m: 'channel', f: 'fist', hold: 0.4, body: 1.3 },  // 狂戦士化: fists clenched and trembling, torn apart
    overdrive: { m: 'sk_slap' },                                 // 弾幕: the gun slapped awake
    ricostorm: { m: 'sk_zigzag' },                               // 跳弾の嵐: a ricochet's way traced
  });
})();
