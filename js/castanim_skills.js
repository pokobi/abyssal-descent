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
// Each skill has a motion a person would make to do what it does, with the hand where its effect is when it comes (abilities.js
// castSkill: an effect that is not a throw goes off at once, as the motion starts, so the motion's telling moment is at its hit; a
// throw goes off as the hand lets go, at 0.12 s). The moves below (sk_*) are written the way the shared ones are (castanim.js, its
// head and MOVES): keys for the RIGHT hand in the view's space (the eye at the origin, -z ahead), mirrored for the left.
// Where the hands are kept: the wrist 0.08 - 0.3 m out to the side, 0.1 - 0.3 m below the eye and 0.45 - 0.6 m ahead, so a hand takes
// no more than a quarter of the view's height and leaves the aim clear; an open hand held up has its fingers leaning away (q x 0.8 -
// 1.0, not 1.5), or it stands before the eye like a wall. A hand raised over the head comes in from the edge of the view (x ~0.3).
// Hand turns used here: [0, 0, 0] palm down, fingers ahead; [0.9, 0, 0] palm ahead, fingers up and leaning away; [0, 0, -1.57] palm
// in (a blade); [0, 0, 3.1] palm up; CA.FIST_Q a fist held up, its back to the eye.
(function () {
  const CA = G.CastAnim, mv = CA.move;
  const GRIP_Q = [0.35, 0.35, -2.3], REST_Q = [-0.4, 0.1, 0.5], FIST_Q = CA.FIST_Q || [1.3, 0.3, -0.2];
  const hf = (i, m, r, l, t) => ({ f: [i, m, r, l], t });
  // hand shapes of these motions (castanim.js FING has the shared ones): each finger [knuckle, middle, last, spread], the thumb [root,
  // first, second, spread]; no two fingers alike (deeper on the little finger's side, fanned from the middle one)
  const FX = {
    // cupped, palm up, round a handful (powder, water, a flame)
    cup: hf([0.34, 0.48, 0.28, -0.1], [0.42, 0.55, 0.32, 0], [0.5, 0.6, 0.35, 0.07], [0.58, 0.66, 0.38, 0.15], [0.28, 0.24, 0.2, 0.3]),
    // limp and hanging from the knuckles (a puppeteer's hand over its strings)
    hang: hf([0.5, 0.48, 0.26, -0.08], [0.6, 0.56, 0.3, 0], [0.68, 0.6, 0.33, 0.07], [0.76, 0.64, 0.36, 0.14], [0.3, 0.3, 0.25, 0.15]),
    // a watch cradled in the palm: the fingers a little curled under its rim, the thumb raised clear of it / pressed on its crown
    cradle: hf([0.3, 0.42, 0.28, -0.06], [0.36, 0.48, 0.31, 0], [0.43, 0.53, 0.34, 0.05], [0.5, 0.58, 0.37, 0.11], [0.08, 0.0, 0.0, 0.5]),
    cradleUp: hf([0.3, 0.42, 0.28, -0.06], [0.36, 0.48, 0.31, 0], [0.43, 0.53, 0.34, 0.05], [0.5, 0.58, 0.37, 0.11], [0.0, -0.12, -0.08, 0.55]),
    cradlePress: hf([0.36, 0.48, 0.32, -0.06], [0.42, 0.53, 0.35, 0], [0.49, 0.58, 0.38, 0.05], [0.56, 0.62, 0.41, 0.11], [0.6, 0.5, 0.42, 0.48]),
    // closed over the watch
    watch: hf([0.88, 0.98, 0.62, -0.04], [0.96, 1.04, 0.68, 0], [1.03, 1.08, 0.71, 0.04], [1.1, 1.12, 0.74, 0.08], [0.55, 0.45, 0.35, 0.15]),
    // the fingers hooked at their middle joints, the knuckles near straight (under the edge of a slab, round a chain)
    hook: hf([0.2, 1.22, 0.92, -0.05], [0.25, 1.32, 0.98, 0], [0.31, 1.38, 1.0, 0.04], [0.37, 1.42, 1.03, 0.09], [0.4, 0.45, 0.4, 0.1]),
    // the fingers flicked open and a little back (a sprinkle, a flick of water)
    flick: hf([-0.18, -0.06, 0.0, -0.26], [-0.16, -0.05, 0.0, -0.04], [-0.12, -0.02, 0.02, 0.13], [-0.08, 0.02, 0.03, 0.28], [0.05, 0.05, 0.0, 0.35]),
    // a knob taken between the thumb and the first two fingers, the other two closed out of the way
    pinch: hf([0.55, 0.92, 0.5, 0.04], [0.62, 0.98, 0.52, -0.04], [1.38, 1.5, 0.98, 0], [1.46, 1.56, 1.02, -0.04], [0.75, 0.45, 0.3, 0.6]),
    pinchOpen: hf([0.28, 0.48, 0.24, 0.08], [0.36, 0.52, 0.27, -0.06], [1.32, 1.45, 0.94, 0], [1.4, 1.5, 0.98, -0.04], [0.35, 0.15, 0.1, 0.7]),
    // half closed round the edge of a hood (cloth taken between the fingers and the thumb)
    pinchCloth: hf([0.62, 0.9, 0.5, -0.06], [0.7, 0.96, 0.54, 0], [0.8, 1.02, 0.58, 0.05], [0.9, 1.08, 0.62, 0.1], [0.62, 0.42, 0.3, 0.55]),
  };
  const fx = (n) => FX[n] || n;
  const F = (keys) => keys.map((k) => (k.f && typeof k.f === 'string' && FX[k.f] ? Object.assign({}, k, { f: FX[k.f] }) : k));
  // the hand on the gun as a motion of the left hand starts, and back on it as it ends (q left out: the gun's own turn and shape)
  const G0 = () => ({ t: 0, p: 'grip', q: GRIP_Q, f: 'grip' });
  // the hand taken off the gun: dropped off the fore-end, thumb up and palm in, before it turns to what it does (from the fore-end's
  // palm-up hold straight to a palm down or a palm ahead, the turn would go round the wrong way, through a twist no arm can give). It
  // drops below the foot of the view as it turns, and comes up into sight already turned
  const OFF = (t, p) => [G0(), { t, p: p || [0.1, -0.36, -0.44], q: [0.4, 0.1, -1.4], f: 'relax', e: 'o' }];
  // the hand taken off the gun and raised over the head: dropped off the fore-end below the view (t0), then up beside the head out at
  // the side of the view (t1), already turned (q) and shaped (f) as it comes in over the top of the view; it never crosses the view
  // on its way up (castanim.js: a wrist just above the top of the view keeps the sleeve behind the eye, only the hand coming in)
  // (the elbow kept out at the side and low on the way, so that it rises up outside the head with the hand, not in before the face;
  // the hand on its way up in the turn an arm gives it there with ease, palm in and a little down - turned to a blade or a fist there,
  // the turn of the forearm and the bend of the wrist run out and draw the elbow in - and turned to what it does as it comes over)
  const UP = (t0, t1, f) => [G0(), { t: t0, p: [0.27, -0.42, -0.22], q: [0.4, 0.1, -1.4], f: 'relax', e: 'q', el: [0.38, -0.52, -0.06] },
    { t: t1, p: [0.34, -0.02, -0.11], q: [0.2, 0, 0.3], f: fx(f), e: 'l', el: [0.4, -0.13, 0.07] }];
  const GE = (t) => ({ t, p: 'grip', f: 'grip', e: 's' });
  // a hand raised overhead brought down outside the shoulder, below the view, to come onto the gun from below (not swung down across
  // the face)
  const DN = (t) => ({ t, p: [0.34, -0.3, -0.2], q: [0.4, 0.1, -1.4], f: 'relax', e: 'q' });
  // keys along a loop: from t0 to t1, n keys, at(u) giving { p, q, f } for u 0..1 (eased evenly, so the hand runs round, not stopping)
  function loop(t0, t1, n, at) {
    const out = [];
    for (let k = 1; k <= n; k++) { const u = k / n, a = at(u); out.push(Object.assign({ t: t0 + (t1 - t0) * u, e: 'l' }, a, a.f ? { f: fx(a.f) } : {})); }
    return out;
  }

  // ================================================ movement
  // ---- 疾風迅雷: both hands driven out low before the chest, fingertips first and palms in (a diver's), then torn wide apart and
  // swept back past the edges of the view, turning palm out (the rush parting the air), crackling
  mv('sk_dive', () => {
    const keys = (d) => [
      { t: 0, p: [0.2, -0.46, -0.22], q: [0.25, 0, -1.4], f: 'blade' },
      { t: 0.06 + d, p: [0.085, -0.21, -0.5], q: [0.3, -0.12, -1.5], e: 'o' },
      { t: 0.11 + d, p: [0.075, -0.195, -0.54], e: 'o', s: 0.0015 },
      { t: 0.22 + d, p: [0.27, -0.17, -0.47], q: [0.4, -0.35, 1.25], f: 'splay', e: 'q', s: 0.003 },
      { t: 0.34 + d, p: [0.4, -0.23, -0.26], q: [0.25, -0.6, 1.45], f: 'relax', e: 'o' },
      { t: 0.55, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.55, hit: 0.06, both: true, main: keys(0), off: keys(0.008),
      body: [{ t: 0 }, { t: 0.06, d: 0.012, f: 0.02 }, { t: 0.14, f: 0.075, p: -0.02, d: 0.018 }, { t: 0.32, f: 0.03, d: 0.006 }, { t: 0.55 }],
      jolt: [[0.12, 0.05]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.36, 0.26]] };
  });
  // ---- ブリンク: the hand off the gun, two fingers drawn up and flicked out at where you go, closing to a fist as you are there
  mv('sk_flick', () => ({ dur: 0.46, hit: 0.09, main: [
    ...OFF(0.03, [0.14, -0.3, -0.44]),
    { t: 0.05, p: [0.18, -0.24, -0.48], q: [0.55, 0.15, -1.3], f: 'seal', e: 'o' },
    { t: 0.09, p: [0.13, -0.125, -0.55], q: [0.22, 0.25, -1.35], e: 'i', on: true },
    { t: 0.15, p: [0.135, -0.135, -0.53], q: [0.35, 0.2, -1.3], f: 'fist', e: 'o' },
    { t: 0.28, p: [0.16, -0.2, -0.52], q: [0.45, 0.15, -1.2], f: 'relax', e: 's' },
    GE(0.46)],
    body: [{ t: 0 }, { t: 0.09, f: 0.03, p: -0.006 }, { t: 0.2, f: 0.008 }, { t: 0.46 }],
    snd: [[0, 'cl', 0.7], [0.05, 'sw', 0.18, 0.12]] }));
  // ---- 雷鳴の跳躍: a standing jump's arm swing: both arms from low behind the hips swung forward and up to before the shoulders, the
  // hands loosely closed, then let fall as you fly
  mv('sk_jump', () => {
    const keys = (d) => [
      { t: 0, p: [0.22, -0.56, 0.02], q: [-1.0, 0.1, -1.5], f: 'relax' },
      { t: 0.05 + d, p: [0.22, -0.46, -0.22], q: [-0.35, 0.1, -1.5], e: 'i' },
      { t: 0.12 + d, p: [0.17, -0.13, -0.5], q: [0.5, 0.05, -1.1], f: 'relax', e: 'o' },
      { t: 0.2 + d, p: [0.18, -0.08, -0.48], q: [0.75, 0.05, -1.1], e: 'o' },
      { t: 0.44, p: [0.21, -0.22, -0.44], q: [0.45, 0.1, -1.3], f: 'relax', e: 's' },
      { t: 0.7, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.7, hit: 0.12, both: true, main: keys(0), off: keys(0.01),
      body: [{ t: 0 }, { t: 0.05, d: 0.03, p: -0.025, f: 0.01 }, { t: 0.16, d: -0.02, p: 0.035, f: 0.02 }, { t: 0.45, p: 0.01 }, { t: 0.7 }],
      jolt: [[0.12, 0.04]], snd: [[0, 'cl', 1], [0.04, 'sw', 0.34, 0.24]] };
  });
  // ---- 飛翔: both palms pressed down hard on the air before the hips (pushing off), then the arms spread out to the sides, palms
  // down and the fingers apart, held through the climb with a slow beat
  mv('sk_wings', () => {
    const keys = (d) => [
      { t: 0, p: [0.2, -0.42, -0.32], q: [0.2, 0, 0.1], f: 'flat' },
      { t: 0.08 + d, p: [0.17, -0.22, -0.52], q: [-0.25, 0, 0.12], f: 'splay', e: 'o' },
      { t: 0.14 + d, p: [0.19, -0.27, -0.5], e: 'o' },
      { t: 0.3 + d, p: [0.33, -0.17, -0.41], q: [0.05, -0.5, 0.1], e: 's' },
      { t: 0.5 + d, p: [0.34, -0.14, -0.41], q: [0.12, -0.5, 0.12], e: 's' },
      { t: 0.68 + d, p: [0.335, -0.19, -0.41], q: [-0.02, -0.5, 0.08], f: 'relax', e: 's' },
      { t: 0.95, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.95, hit: 0.08, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.08, d: 0.025, p: -0.01 }, { t: 0.24, d: -0.02, p: 0.04 }, { t: 0.65, p: 0.03, d: -0.01 }, { t: 0.95 }],
      jolt: [[0.08, 0.05]], snd: [[0, 'cl', 1], [0.06, 'sw', 0.3, 0.2], [0.2, 'sw', 0.2, 0.3]] };
  });
  // ---- 吸血の刃: a knife-hand cut: the hand thrown up outside the shoulder, edge on, and slashed down across the body as the strike
  // lands (the little finger's edge leading), through, and back
  mv('sk_slash', () => ({ dur: 0.62, hit: 0.12, main: [
    ...OFF(0.032),
    { t: 0.07, p: [0.29, -0.05, -0.36], q: [0.6, -0.3, -1.4], f: 'blade', e: 'o', el: [0.42, -0.16, -0.08] },
    { t: 0.12, p: [0.13, -0.14, -0.5], q: [0.25, 0.1, -1.5], e: 'i', on: true },
    { t: 0.19, p: [-0.06, -0.25, -0.46], q: [0.0, 0.45, -1.6], e: 'o' },
    { t: 0.32, p: [-0.04, -0.27, -0.44], f: 'relax', e: 's' },
    GE(0.62)],
    body: [{ t: 0 }, { t: 0.07, y: -0.015, p: 0.008 }, { t: 0.16, f: 0.06, y: 0.025, r: 0.02, p: -0.015, d: 0.01 }, { t: 0.35, f: 0.015, y: 0.006 }, { t: 0.62 }],
    jolt: [[0.15, 0.06]], snd: [[0, 'cl', 0.9], [0.09, 'sw', 0.3, 0.16]] }));
  // ---- 加速装置: a fist pump: the fist raised before the shoulder, its back to the eye, and driven down hard to the hip (set to go)
  mv('sk_pump', () => ({ dur: 0.72, hit: 0.1, main: [
    ...OFF(0.045),
    { t: 0.1, p: [0.18, -0.13, -0.54], q: FIST_Q, f: 'fist', e: 'o', on: true },
    { t: 0.18, p: [0.185, -0.115, -0.53], e: 'b', s: 0.0015 },
    { t: 0.3, p: [0.21, -0.31, -0.36], q: [0.85, 0.2, -1.25], e: 'i' },
    { t: 0.36, p: [0.21, -0.3, -0.37], e: 'o', s: 0.002 },
    { t: 0.5, p: [0.2, -0.27, -0.46], f: 'relax', e: 's' },
    GE(0.72)],
    body: [{ t: 0 }, { t: 0.12, p: 0.012, d: -0.006 }, { t: 0.3, f: 0.03, d: 0.012, p: -0.012 }, { t: 0.46, f: 0.01 }, { t: 0.72 }],
    jolt: [[0.3, 0.04]], snd: [[0, 'cl', 0.8], [0.22, 'sw', 0.2, 0.12], [0.3, 'cl', 1.2]] }));

  // ================================================ thrown / shot from the hand
  // ---- 投槍: the hand carried high back by the ear (out of sight), the elbow up and out, the shaft along the forearm; the arm driven
  // forward over the elbow and let go before the face, following on down and across the body
  mv('sk_javelin', () => {
    const r = 0.12;
    return { dur: 0.72, rel: r, hit: r, release: true, relP: [0.11, -0.07, -0.53], main: [
      { t: 0, p: [0.24, 0.04, 0.06], q: [2.2, -0.2, -1.3], f: 'hold', el: [0.42, -0.12, 0.05] },
      { t: 0.06, p: [0.27, 0.0, -0.22], q: [1.7, -0.15, -1.35], e: 'i', el: [0.42, -0.14, -0.06] },
      { t: r, p: 'hand', q: [0.9, -0.05, -1.4], f: 'release', e: 'l', on: true },
      { t: r + 0.08, p: [0.04, -0.26, -0.52], q: [0.1, 0.3, -1.4], f: 'relax', e: 'o' },
      { t: 0.4, p: [-0.02, -0.39, -0.4], q: [-0.2, 0.3, -1.3], e: 's' },
      GE(0.72)],
      body: [{ t: 0 }, { t: 0.06, p: 0.016, y: -0.02, r: -0.012, f: -0.015 }, { t: r + 0.04, p: -0.02, y: 0.02, r: 0.018, f: 0.06, d: 0.01 },
        { t: 0.42, f: 0.018, y: 0.005 }, { t: 0.72 }],
      snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.24]] };
  });
  // ---- 氷槍: a knife's throw: the hand cocked up beside the shoulder, palm in, and the forearm snapped down forward over the elbow, the
  // wrist flicking as the shard leaves the fingers; the open hand following on low
  mv('sk_dart', () => {
    const r = 0.12;
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.11, -0.09, -0.53], main: [
      { t: 0, p: [0.3, -0.02, -0.2], q: [1.6, -0.2, -1.4], f: 'hold', el: [0.38, -0.24, -0.08] },
      { t: 0.06, p: [0.3, -0.04, -0.33], q: [1.3, -0.1, -1.4], e: 'i', el: [0.36, -0.26, -0.14] },
      { t: r, p: 'hand', q: [0.55, 0.05, -1.4], f: 'release', e: 'l', on: true },
      { t: r + 0.07, p: [0.06, -0.24, -0.53], q: [0.0, 0.25, -1.35], f: 'splay', e: 'o' },
      { t: 0.36, p: [0.01, -0.39, -0.4], q: [-0.2, 0.25, -1.3], f: 'relax', e: 's' },
      GE(0.66)],
      body: [{ t: 0 }, { t: 0.06, p: 0.012, d: -0.006 }, { t: r + 0.03, p: -0.03, d: 0.014, f: 0.04 }, { t: 0.4, f: 0.01 }, { t: 0.66 }],
      jolt: [[r, 0.035]], snd: [[0, 'cl', 0.9], [0.04, 'sw', 0.24, 0.14]] };
  });
  // ---- 火球: the fire held in the cupped palm by the shoulder and put out from it like a shot-put, the arm driven straight, the
  // fingers spreading as it leaves the palm
  mv('sk_hurl', () => {
    const r = 0.12;
    return { dur: 0.7, rel: r, hit: r, release: true, relP: [0.12, -0.1, -0.53], main: F([
      { t: 0, p: [0.25, -0.25, -0.18], q: [1.05, 0.05, -0.35], f: 'cup', el: [0.3, -0.46, 0.04] },
      { t: 0.06, p: [0.23, -0.23, -0.34], q: [1.0, 0, -0.3], e: 'i' },
      { t: r, p: 'hand', q: [0.85, -0.1, -0.15], f: 'splay', e: 'l', pt: 'palm', on: true },
      { t: r + 0.08, p: 'hand+', q: [0.75, -0.1, -0.2], f: 'release', e: 'o' },
      { t: 0.3, p: [0.12, -0.27, -0.5], q: [0.3, 0.05, -0.8], f: 'relax', e: 's' },
      { t: 0.44, p: [0.1, -0.37, -0.42], q: [0.3, 0.1, -1.3], e: 's' },
      GE(0.7)]),
      body: [{ t: 0 }, { t: 0.06, d: 0.01, p: -0.012, f: -0.01 }, { t: r + 0.04, f: 0.05, p: 0.004, d: -0.004 }, { t: 0.42, f: 0.012 }, { t: 0.7 }],
      jolt: [[r, 0.03]], snd: [[0, 'cl', 0.9], [0.05, 'sw', 0.26, 0.2]] };
  });
  // ---- 水弾: a side-arm throw (a stone skimmed): the arm out to the side, palm to the front, swept in level and let go before the
  // chest with a flick of the wrist, following through past the middle
  mv('sk_skim', () => {
    const r = 0.12;
    return { dur: 0.64, rel: r, hit: r, release: true, relP: [0.12, -0.12, -0.52], main: [
      { t: 0, p: [0.4, -0.2, -0.14], q: [1.25, -1.1, 0], f: 'hold', el: [0.4, -0.38, 0.08] },
      { t: 0.06, p: [0.31, -0.17, -0.38], q: [1.2, -0.75, 0], e: 'i' },
      { t: r, p: 'hand', q: [0.95, -0.2, 0], f: 'release', e: 'l', pt: 'palm', on: true },
      { t: r + 0.08, p: [0.0, -0.2, -0.5], q: [0.55, 0.55, -0.4], f: 'relax', e: 'o' },
      { t: 0.36, p: [-0.02, -0.27, -0.45], e: 's' },
      GE(0.64)],
      body: [{ t: 0 }, { t: 0.06, y: -0.02, r: -0.008 }, { t: r + 0.05, y: 0.022, r: 0.012, f: 0.03 }, { t: 0.4, y: 0.005 }, { t: 0.64 }],
      snd: [[0, 'cl', 0.8], [0.04, 'sw', 0.26, 0.18]] };
  });
  // ---- 磁力爆弾: the open hand thrust out with the charge, held, then clenched and yanked back low to the body - the pull that follows
  mv('sk_magnet', () => {
    const r = 0.12;
    return { dur: 0.78, rel: r, hit: r, release: true, relP: [0.11, -0.1, -0.54], main: [
      ...OFF(0.035),
      { t: 0.07, p: [0.19, -0.26, -0.45], q: [0.75, 0.05, -0.8], e: 'o' },
      { t: r, p: 'hand', q: [0.88, -0.05, -0.2], f: 'splay', e: 'i', pt: 'palm', on: true },
      { t: r + 0.1, p: 'hand+', e: 'o', s: 0.0015 },
      { t: 0.3, f: 'clawOpen', e: 's', s: 0.002 },
      { t: 0.36, f: 'fist', q: [0.85, 0.1, -0.9], e: 'i' },
      { t: 0.46, p: [0.2, -0.27, -0.37], q: [0.55, 0.15, -1.2], e: 'o' },
      GE(0.78)],
      body: [{ t: 0 }, { t: 0.06, f: -0.01 }, { t: r + 0.03, f: 0.04, d: 0.006 }, { t: 0.36, f: 0.02 }, { t: 0.48, f: -0.025, p: 0.01 }, { t: 0.78 }],
      jolt: [[r, 0.03], [0.44, 0.04]], snd: [[0, 'cl', 0.8], [0.04, 'sw', 0.22, 0.14], [0.35, 'cl', 1.4], [0.38, 'sw', 0.16, 0.12]] };
  });
  // ---- 破甲杭: the fist cocked at the hip, thumb up, and driven straight out like a ram, turning over as it lands; the stake goes and
  // the arm is kicked back up by it, the hand shaken open
  mv('sk_ram', () => {
    const r = 0.12;
    return { dur: 0.7, rel: r, hit: r, release: true, relP: [0.09, -0.11, -0.56], main: [
      { t: 0, p: [0.24, -0.34, -0.12], q: [0.1, 0.15, -1.4], f: 'fist', el: [0.26, -0.5, 0.14] },
      { t: 0.06, p: [0.2, -0.26, -0.3], q: [0.05, 0.05, -1.2], e: 'i' },
      { t: r, p: 'hand', q: [0.05, -0.05, -0.6], e: 'l', pt: 'palm', on: true },
      { t: r + 0.04, p: [0.125, -0.1, -0.46], q: [0.4, 0.05, -0.6], e: 'o' },
      { t: r + 0.12, p: [0.12, -0.115, -0.5], e: 's' },
      { t: 0.4, f: 'relax', e: 's', s: 0.002 },
      GE(0.7)],
      body: [{ t: 0 }, { t: 0.06, y: -0.014, f: -0.01 }, { t: r, f: 0.05, y: 0.014, d: 0.01 }, { t: r + 0.05, f: -0.02, p: 0.022 }, { t: 0.42, f: 0.004 }, { t: 0.7 }],
      jolt: [[r, 0.1]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.22, 0.12]] };
  });
  // ---- 連鎖雷: the arm snapped out, the first finger levelled at the foe beside the aim (the bolt leaves its tip), held crackling, the
  // fingers then thrown open as the charge goes out of them
  mv('sk_zap', () => {
    const r = 0.12;
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.1, -0.07, -0.6], main: [
      ...OFF(0.027),
      { t: 0.06, p: [0.2, -0.25, -0.43], q: [0.35, 0.25, -1.25], f: 'point', e: 'o' },
      { t: r, p: 'hand', q: [0.2, 0.3, -1.3], e: 'i', pt: 'tip', on: true },
      { t: r + 0.05, p: 'hand+', e: 'o', s: 0.003 },
      { t: 0.3, e: 'l', s: 0.0035 },
      { t: 0.38, f: 'splay', q: [0.5, 0.25, -0.9], e: 'o', s: 0.001 },
      GE(0.66)],
      body: [{ t: 0 }, { t: r + 0.02, f: 0.03, y: 0.01, s: 0.0015 }, { t: 0.3, f: 0.02, s: 0.0015 }, { t: 0.4, f: 0.005 }, { t: 0.66 }],
      jolt: [[r, 0.03]], snd: [[0, 'cl', 0.9], [0.05, 'sw', 0.16, 0.1]] };
  });
  // ---- 雷神の裁き: two fingers raised high at the edge of the view and brought down on the foe like a sentence passed, the bolt
  // leaving their tips; held trembling
  mv('sk_smite', () => {
    const r = 0.12;
    return { dur: 0.8, rel: r, hit: r, release: true, relP: [0.1, -0.06, -0.58], main: [
      { t: 0, p: [0.29, 0.12, -0.2], q: [2.0, -0.1, -1.45], f: 'seal', el: [0.42, 0.0, -0.04] },
      { t: 0.06, p: [0.28, 0.04, -0.36], q: [1.3, 0, -1.45], e: 'i', el: [0.4, -0.1, -0.12] },
      { t: r, p: 'hand', q: [0.3, 0.25, -1.4], e: 'l', pt: 'tip', on: true },
      { t: r + 0.06, p: [0.125, -0.125, -0.53], q: [0.15, 0.25, -1.4], e: 'o', s: 0.003 },
      { t: 0.45, p: [0.127, -0.13, -0.53], e: 'l', s: 0.004 },
      GE(0.8)],
      body: [{ t: 0 }, { t: 0.06, p: 0.025, d: -0.008 }, { t: r + 0.03, p: -0.03, d: 0.014, f: 0.03, s: 0.002 }, { t: 0.45, p: -0.015, d: 0.008, s: 0.002 }, { t: 0.8 }],
      jolt: [[r, 0.06]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.16]] };
  });
  // ---- 鉤鎖乱舞: the chains caught and hauled in hand over hand: one hand reaches out and closes on them while the other draws back
  // low past the hip
  mv('sk_haul', () => {
    const A = [0.1, -0.17, -0.54], B = [0.21, -0.35, -0.28], qa = [0.4, 0.05, -1.5], qb = [0.2, 0.15, -1.4];
    const keys = (ph) => ph ? [
      { t: 0, p: [0.2, -0.44, -0.24], q: qb, f: 'fist' },
      { t: 0.08, p: B, q: qb, f: 'fist', e: 'o' },
      { t: 0.18, p: A, q: qa, f: 'hook', e: 'q' },
      { t: 0.22, f: 'fist', e: 'o' },
      { t: 0.36, p: B, q: qb, e: 'o' },
      { t: 0.46, p: [0.105, -0.18, -0.53], q: qa, f: 'hook', e: 'q' },
      { t: 0.5, f: 'fist', e: 'o' },
      { t: 0.8, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }] : [
      { t: 0, p: [0.18, -0.3, -0.36], q: qa, f: 'clawOpen' },
      { t: 0.07, p: A, q: qa, f: 'hook', e: 'o', on: true },
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
  // ---- 地雷散布: a low side-arm sow: the handful swung up from beside the hip and swept across the body, palm up, the fingers opening
  // as it goes so the mines fan out
  mv('sk_sow', () => {
    const r = 0.12;
    return { dur: 0.68, rel: r, hit: r, release: true, relP: [0.14, -0.17, -0.56], main: [
      { t: 0, p: [0.33, -0.38, -0.16], q: [-0.3, 0.4, -2.6], f: 'hold' },
      { t: 0.06, p: [0.28, -0.32, -0.4], q: [0.1, 0.25, -2.8], e: 'i' },
      { t: r, p: 'hand', q: [0.05, -0.1, -2.9], f: 'release', e: 'l', on: true },
      { t: r + 0.08, p: [-0.03, -0.22, -0.5], q: [0.0, -0.5, -2.9], f: 'splay', e: 'o' },
      { t: 0.36, p: [-0.04, -0.39, -0.4], q: [-0.2, -0.3, -2.4], f: 'relax', e: 's' },
      GE(0.68)],
      body: [{ t: 0 }, { t: 0.06, d: 0.012, y: -0.018, p: -0.012 }, { t: r + 0.06, y: 0.028, r: 0.012, f: 0.025, d: 0.006 }, { t: 0.42, y: 0.008 }, { t: 0.68 }],
      snd: [[0, 'cl', 0.9], [0.04, 'sw', 0.24, 0.24]] };
  });
  // ---- 幻影の囮: a gentle lift: the cupped hand rises low before the body and opens upward, letting the phantom go like a bird,
  // held open a moment, palm up
  mv('sk_loft', () => {
    const r = 0.12;
    return { dur: 0.8, rel: r, hit: r, release: true, relP: [0.13, -0.15, -0.56], main: F([
      { t: 0, p: [0.18, -0.36, -0.36], q: [0.0, 0, 3.05], f: 'cup' },
      { t: 0.06, p: [0.17, -0.29, -0.5], q: [0.15, 0, 3.05], e: 'o' },
      { t: r, p: 'hand', q: [0.3, 0, 3.05], f: 'release', e: 'l', on: true },
      { t: 0.3, p: [0.15, -0.13, -0.56], q: [0.45, -0.05, 3.0], f: 'splay', e: 'o' },
      { t: 0.5, p: [0.15, -0.135, -0.56], q: [0.5, -0.05, 3.0], f: 'relax', e: 'l' },
      GE(0.8)]),
      body: [{ t: 0 }, { t: 0.3, p: 0.025, d: -0.006 }, { t: 0.5, p: 0.02 }, { t: 0.8 }],
      snd: [[0, 'cl', 0.7], [0.08, 'sw', 0.12, 0.2]] };
  });

  // ================================================ at a point aimed at
  // ---- 隕石落とし: the open hand raised to the sky at the edge of the view and held there, straining, the fingers slowly closing on
  // what it calls; then wrenched down into a fist before the chest as the stone comes
  mv('sk_calldown', () => ({ dur: 1.15, hit: 0.12, main: [
    ...UP(0.04, 0.08, 'splay'),
    { t: 0.12, p: [0.23, 0.13, -0.31], q: [0.0, 0.0, 0.6], f: 'splay', e: 'o', on: true },
    { t: 0.35, p: [0.235, 0.135, -0.305], e: 's', s: 0.0015 },
    { t: 0.58, p: [0.225, 0.125, -0.315], q: [-0.6, 0, -0.6], f: 'clawOpen', e: 'l', s: 0.003 },
    { t: 0.72, p: [0.15, -0.18, -0.5], q: [0.55, 0.1, -1.3], f: 'fist', e: 'i' },
    { t: 0.8, p: [0.15, -0.175, -0.495], e: 'o', s: 0.002 },
    GE(1.15)],
    body: [{ t: 0 }, { t: 0.14, p: 0.035, d: -0.01 }, { t: 0.58, p: 0.045, d: -0.012, s: 0.0012 }, { t: 0.74, p: -0.035, d: 0.022, f: 0.02 }, { t: 0.9, p: -0.015, d: 0.01 }, { t: 1.15 }],
    jolt: [[0.72, 0.08]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.14, 0.14], [0.66, 'sw', 0.3, 0.12]] }));
  // ---- 矢の雨: the archers' signal: the flat hand raised high at the edge of the view, edge on, held, and chopped forward and down at
  // the ground marked
  mv('sk_volley', () => ({ dur: 0.85, hit: 0.1, main: [
    ...UP(0.035, 0.065, 'blade'),
    { t: 0.1, p: [0.24, 0.14, -0.29], q: [0.2, 0, -0.5], f: 'blade', e: 'o', on: true },
    { t: 0.32, p: [0.245, 0.145, -0.285], e: 's', s: 0.001 },
    { t: 0.42, p: [0.13, -0.15, -0.52], q: [0.3, 0.1, -1.5], e: 'i' },
    { t: 0.5, p: [0.13, -0.165, -0.51], e: 'o' },
    GE(0.85)],
    body: [{ t: 0 }, { t: 0.12, p: 0.025, d: -0.008 }, { t: 0.32, p: 0.028 }, { t: 0.44, p: -0.02, f: 0.035, d: 0.008 }, { t: 0.85 }],
    jolt: [[0.42, 0.04]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.14, 0.12], [0.35, 'sw', 0.3, 0.12]] }));
  // ---- 火炎嵐: the hand held out low over the mark, palm down, and turned in a small rising circle, then flung up open as the fire
  // climbs
  mv('sk_kindle', () => {
    const c = [0.13, -0.2, -0.54];
    const ks = loop(0.08, 0.5, 10, (u) => {
      const a = u * Math.PI * 2.2, rr = 0.03 + 0.035 * u;
      return { p: [c[0] + Math.cos(a) * rr, c[1] + u * 0.07, c[2] + Math.sin(a) * rr * 0.8], q: [0.1 + 0.35 * u, 0.15 * Math.sin(a), 0.1], f: u < 0.5 ? 'relax' : 'splay' };
    });
    return { dur: 0.95, hit: 0.08, main: [
      ...OFF(0.036),
      { t: 0.08, p: [c[0] + 0.03, c[1], c[2]], q: [0.1, 0, 0.1], f: 'relax', e: 'o', on: true },
      ...ks,
      { t: 0.6, p: [0.15, -0.1, -0.56], q: [0.9, -0.05, -0.1], f: 'splay', e: 'o' },
      { t: 0.72, p: [0.15, -0.11, -0.56], f: 'relax', e: 's' },
      GE(0.95)],
      body: [{ t: 0 }, { t: 0.1, f: 0.015 }, { t: 0.5, p: 0.012, f: 0.01 }, { t: 0.62, p: 0.03, d: -0.008 }, { t: 0.95 }],
      jolt: [[0.6, 0.03]], snd: [[0, 'cl', 0.8], [0.2, 'sw', 0.1, 0.4], [0.55, 'sw', 0.22, 0.14]] };
  });
  // ---- 毒霧: a handful tossed out forward: the cupped hand drawn back low beside the hip and swung forward and up, the fingers
  // flung open at the mark as the cloud rises there
  mv('sk_toss', () => ({ dur: 0.85, hit: 0.1, main: F([
    G0(),
    { t: 0.045, p: [0.22, -0.32, -0.36], q: [-0.35, 0.05, 3.0], f: 'cup', e: 'o' },
    { t: 0.1, p: [0.15, -0.16, -0.53], q: [0.15, 0, 3.0], f: 'splay', e: 'o', on: true },
    { t: 0.17, p: [0.145, -0.14, -0.54], q: [0.25, 0, 3.0], e: 'o' },
    { t: 0.3, p: [0.14, -0.26, -0.5], q: [0.1, 0, 2.9], f: 'relax', e: 's' },
    { t: 0.46, p: [0.12, -0.38, -0.42], q: [0.1, 0.1, 2.8], e: 's' },
    GE(0.85)]),
    body: [{ t: 0 }, { t: 0.05, d: 0.01, p: -0.012 }, { t: 0.14, p: 0.008, f: 0.03 }, { t: 0.42, f: 0.008 }, { t: 0.85 }],
    snd: [[0, 'cl', 0.8], [0.04, 'sw', 0.2, 0.22]] }));
  // ---- 腐蝕の雨: the closed hand held out over the mark, palm down, and the fingers flicked open three times - a sprinkling
  mv('sk_sprinkle', () => {
    const P0 = [0.14, -0.1, -0.5], dip = (t, y) => ({ t, p: [P0[0], P0[1] + y, P0[2]] });
    return { dur: 0.95, hit: 0.1, main: F([
      ...OFF(0.045),
      { t: 0.1, p: P0, q: [0.3, 0.1, 0.1], f: 'hold', e: 'o', on: true },
      Object.assign(dip(0.17, -0.02), { f: 'flick', e: 'o' }),
      Object.assign(dip(0.25, 0.0), { f: 'hold', e: 'q' }),
      Object.assign(dip(0.32, -0.02), { f: 'flick', e: 'o' }),
      Object.assign(dip(0.4, 0.0), { f: 'hold', e: 'q' }),
      Object.assign(dip(0.47, -0.025), { f: 'flick', e: 'o' }),
      { t: 0.62, p: [0.14, -0.15, -0.5], f: 'relax', e: 's' },
      GE(0.95)]),
      body: [{ t: 0 }, { t: 0.12, p: 0.012 }, { t: 0.5, p: 0.012 }, { t: 0.95 }],
      snd: [[0, 'cl', 0.8], [0.16, 'sw', 0.06, 0.08], [0.31, 'sw', 0.06, 0.08], [0.46, 'sw', 0.07, 0.08]] };
  });
  // ---- 渦潮: the hand held out flat over the mark and stirred round in a tightening circle, sinking, the fingers drawing in as the
  // water is drawn round
  mv('sk_stir', () => {
    const c = [0.13, -0.17, -0.54];
    const ks = loop(0.1, 0.62, 12, (u) => {
      const a = -u * Math.PI * 3, rr = 0.07 - 0.05 * u;
      return { p: [c[0] + Math.cos(a) * rr, c[1] - u * 0.03, c[2] + Math.sin(a) * rr * 0.7], q: [-0.05 - 0.15 * u, -0.2 * Math.sin(a), 0.05], f: u < 0.6 ? 'relax' : 'cup' };
    });
    return { dur: 0.95, hit: 0.1, main: F([
      ...OFF(0.045),
      { t: 0.1, p: [c[0] + 0.07, c[1], c[2]], q: [0.0, 0, 0.05], f: 'flat', e: 'o', on: true },
      ...ks,
      GE(0.95)]),
      body: [{ t: 0 }, { t: 0.12, f: 0.015, p: -0.01 }, { t: 0.6, d: 0.012, p: -0.02, f: 0.015 }, { t: 0.95 }],
      snd: [[0, 'cl', 0.8], [0.15, 'sw', 0.08, 0.45]] };
  });
  // ---- 重力井戸: the hand laid out palm down over the mark and borne down, slowly, under a weight that grows, the fingers clawing in,
  // until it is crushed shut and dragged down
  mv('sk_weigh', () => ({ dur: 1.05, hit: 0.12, main: [
    ...OFF(0.054),
    { t: 0.12, p: [0.14, -0.11, -0.55], q: [0.2, 0, 0.05], f: 'splay', e: 'o', on: true },
    { t: 0.4, p: [0.14, -0.15, -0.55], q: [0.1, 0, 0.05], f: 'clawOpen', e: 's', s: 0.0015 },
    { t: 0.62, p: [0.14, -0.18, -0.54], q: [0.0, 0, 0.05], f: 'claw', e: 'l', s: 0.0035 },
    { t: 0.7, p: [0.15, -0.25, -0.47], q: [0.35, 0.1, -1.0], f: 'fist', e: 'i' },
    { t: 0.78, p: [0.15, -0.245, -0.475], e: 'o', s: 0.002 },
    GE(1.05)],
    body: [{ t: 0 }, { t: 0.14, f: 0.015 }, { t: 0.62, d: 0.02, p: -0.02, f: 0.015, s: 0.0015 }, { t: 0.72, d: 0.035, p: -0.035, f: 0.02 }, { t: 0.85, d: 0.015, p: -0.015 }, { t: 1.05 }],
    jolt: [[0.7, 0.06]], snd: [[0, 'cl', 0.8], [0.5, 'cl', 0.8], [0.68, 'cl', 1.5]] }));
  // ---- 闇の手: a grip taken from below: the open hand, palm up, rises from low before the body and snaps shut, held, trembling with
  // the strain
  mv('sk_rise', () => ({ dur: 0.9, hit: 0.1, main: [
    G0(),
    { t: 0.08, p: [0.16, -0.3, -0.45], q: [0.05, 0, 3.0], f: 'clawOpen', e: 'o' },
    { t: 0.2, p: [0.14, -0.16, -0.52], q: [0.35, 0, 3.0], e: 'o' },
    { t: 0.26, q: [0.45, 0.05, 2.9], f: 'fist', e: 'i', on: true },
    { t: 0.32, p: [0.14, -0.17, -0.515], e: 'o', s: 0.003 },
    { t: 0.6, p: [0.14, -0.175, -0.51], e: 'l', s: 0.004 },
    GE(0.9)],
    body: [{ t: 0 }, { t: 0.1, p: -0.015 }, { t: 0.26, p: 0.01, f: 0.015 }, { t: 0.6, f: 0.012, s: 0.0012 }, { t: 0.9 }],
    jolt: [[0.26, 0.05]], snd: [[0, 'cl', 0.8], [0.12, 'sw', 0.14, 0.12], [0.25, 'cl', 1.5]] }));
  // ---- 処刑の刻印: two fingers levelled at the foe and a small cross cut on him in two strokes, then a jab that seals it
  mv('sk_brand', () => {
    const q = [0.25, 0.3, -1.35];
    return { dur: 0.78, hit: 0.09, main: [
      ...OFF(0.041),
      { t: 0.09, p: [0.16, -0.09, -0.52], q, f: 'seal', e: 'o', on: true },
      { t: 0.17, p: [0.11, -0.15, -0.53], e: 'i' },
      { t: 0.24, p: [0.11, -0.09, -0.52], e: 'q' },
      { t: 0.31, p: [0.16, -0.15, -0.53], e: 'i' },
      { t: 0.38, p: [0.14, -0.13, -0.49], e: 'o' },
      { t: 0.44, p: [0.13, -0.12, -0.56], e: 'i' },
      { t: 0.52, p: [0.13, -0.122, -0.545], e: 'o' },
      GE(0.78)],
      body: [{ t: 0 }, { t: 0.1, f: 0.015 }, { t: 0.44, f: 0.03, d: 0.004 }, { t: 0.78 }],
      jolt: [[0.44, 0.025]], snd: [[0, 'cl', 0.8], [0.12, 'sw', 0.1, 0.07], [0.26, 'sw', 0.1, 0.07], [0.4, 'sw', 0.12, 0.06]] };
  });

  // ================================================ round you / ahead of you
  // ---- 大地の棘: the hand slapped down flat on the ground before the knee and raked forward and up, the fingers clawing - the stone
  // torn up ahead
  mv('sk_rip', () => ({ dur: 0.7, hit: 0.09, main: [
    ...OFF(0.035, [0.15, -0.3, -0.42]),
    { t: 0.09, p: [0.13, -0.28, -0.5], q: [-0.35, 0.05, 0.08], f: 'press', e: 'i', on: true },
    { t: 0.14, p: [0.13, -0.285, -0.505], e: 'o', s: 0.002 },
    { t: 0.26, p: [0.12, -0.19, -0.54], q: [0.55, 0, 0.05], f: 'claw', e: 'o' },
    { t: 0.36, p: [0.125, -0.14, -0.56], q: [0.95, 0, 0.05], f: 'clawOpen', e: 'o' },
    GE(0.7)],
    body: [{ t: 0 }, { t: 0.1, d: 0.075, p: -0.085, f: 0.02 }, { t: 0.28, d: 0.03, p: -0.03, f: 0.035 }, { t: 0.4, p: 0.005, f: 0.01 }, { t: 0.7 }],
    jolt: [[0.09, 0.08], [0.26, 0.04]], snd: [[0, 'cl', 0.9], [0.09, 'th', 0.22], [0.2, 'sw', 0.22, 0.14]] }));
  // ---- 石壁: both hands down low, hooked under the slab, and hauled up to the chest with the whole back as the wall rises
  mv('sk_lift', () => {
    const keys = (d) => [
      { t: 0, p: [0.18, -0.46, -0.36], q: [0.0, 0.1, 2.9], f: 'hook' },
      { t: 0.06 + d, p: [0.15, -0.34, -0.47], q: [0.15, 0.1, 2.9], e: 'o', s: 0.002 },
      { t: 0.22 + d, p: [0.17, -0.22, -0.54], q: [0.2, 0.1, 2.85], e: 'q', s: 0.003 },
      { t: 0.45, p: [0.17, -0.215, -0.535], e: 'l', s: 0.002 },
      { t: 0.55, f: 'relax', e: 's' },
      { t: 0.75, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.75, hit: 0.06, both: true, main: F(keys(0)), off: F(keys(0.015)),
      body: [{ t: 0 }, { t: 0.06, d: 0.05, p: -0.07, f: 0.02, s: 0.001 }, { t: 0.24, d: -0.01, p: 0.015, s: 0.002 }, { t: 0.45, p: 0.01 }, { t: 0.75 }],
      jolt: [[0.22, 0.07]], snd: [[0, 'cl', 1.2], [0.08, 'cl', 1], [0.2, 'sw', 0.18, 0.18]] };
  });
  // ---- 生命吸収: the hand held out at the foes, its fingers working, and drawn slowly back low to the body, closing
  mv('sk_siphon', () => ({ dur: 1.0, hit: 0.1, main: [
    ...OFF(0.045),
    { t: 0.1, p: [0.15, -0.12, -0.53], q: [0.9, -0.1, -0.3], f: 'clawOpen', e: 'o', on: true },
    { t: 0.22, f: 'claw', e: 's', s: 0.002 },
    { t: 0.32, f: 'clawOpen', e: 's', s: 0.002 },
    { t: 0.46, p: [0.17, -0.18, -0.47], q: [0.8, 0.05, -0.8], f: 'claw', e: 's', s: 0.003 },
    { t: 0.62, p: [0.21, -0.29, -0.37], q: [0.5, 0.15, -1.2], f: 'fist', e: 's', s: 0.002 },
    GE(1.0)],
    body: [{ t: 0 }, { t: 0.12, f: 0.02 }, { t: 0.4, f: 0.01, s: 0.001 }, { t: 0.64, f: -0.02, p: 0.012, d: -0.005 }, { t: 1.0 }],
    jolt: [[0.62, 0.03]], snd: [[0, 'cl', 0.8], [0.22, 'cl', 0.9], [0.44, 'cl', 0.9], [0.6, 'cl', 1.2]] }));
  // ---- 魂の収穫: a reaper's stroke: the edge of the hand swung from high out at the side down across the body, then the souls taken
  // in the closing hand and drawn back low to the body
  mv('sk_reap', () => ({ dur: 0.85, hit: 0.05, main: [
    { t: 0, p: [0.34, 0.04, -0.28], q: [0.6, -0.4, -1.45], f: 'blade', el: [0.44, -0.08, -0.04] },
    { t: 0.05, p: [0.12, -0.15, -0.5], q: [0.25, 0, -1.55], e: 'i', on: true },
    { t: 0.1, p: [-0.07, -0.26, -0.46], q: [0.05, 0.45, -1.6], e: 'o' },
    { t: 0.2, p: [-0.08, -0.28, -0.44], e: 'o' },
    { t: 0.38, p: [0.1, -0.17, -0.51], q: [0.8, 0, -0.6], f: 'clawOpen', e: 's' },
    { t: 0.46, p: [0.2, -0.3, -0.42], q: [0.6, 0.1, -1.2], f: 'fist', e: 'o' },
    GE(0.85)],
    body: [{ t: 0, y: -0.02, p: 0.012 }, { t: 0.12, y: 0.035, r: 0.02, p: -0.02, d: 0.01 }, { t: 0.48, f: -0.015, p: 0.01 }, { t: 0.85 }],
    jolt: [[0.05, 0.03], [0.46, 0.03]], snd: [[0, 'cl', 0.9], [0.01, 'sw', 0.32, 0.2], [0.44, 'cl', 1.2]] }));
  // ---- 次元斬: the edge of the hand raised high at the edge of the view and cut straight down the line of sight - the air split
  mv('sk_cleave', () => ({ dur: 0.66, hit: 0.05, main: [
    { t: 0, p: [0.23, 0.1, -0.34], q: [1.7, 0.0, -1.57], f: 'blade', el: [0.4, -0.05, -0.08] },
    { t: 0.05, p: [0.11, -0.08, -0.5], q: [0.9, 0.1, -1.57], e: 'i', on: true },
    { t: 0.1, p: [0.06, -0.27, -0.46], q: [0.1, 0.1, -1.57], e: 'o' },
    { t: 0.3, p: [0.065, -0.28, -0.45], f: 'relax', e: 's' },
    GE(0.66)],
    body: [{ t: 0, p: 0.02, d: -0.008 }, { t: 0.09, p: -0.035, d: 0.016, f: 0.025 }, { t: 0.32, p: -0.01 }, { t: 0.66 }],
    jolt: [[0.06, 0.06]], snd: [[0, 'cl', 0.9], [0.0, 'sw', 0.34, 0.14]] }));
  // ---- 刃の旋風: the flat hand, palm down, swung round in a flat circle low before the body - the blades set spinning
  mv('sk_whirl', () => {
    const c = [0.11, -0.18, -0.54];
    const ks = loop(0.06, 0.42, 12, (u) => {
      const a = Math.PI * 0.5 - u * Math.PI * 2;
      // (the ring is tilted up toward the eye: laid flat, it would be seen edge on, a hand going left and right)
      return { p: [c[0] + Math.cos(a) * 0.12, c[1] + Math.sin(a) * 0.04, c[2] - Math.sin(a) * 0.06], q: [0.15 + 0.1 * Math.sin(a), 0.45 * Math.cos(a), 0.1], f: 'flat' };
    });
    return { dur: 0.72, hit: 0.06, main: [
      ...OFF(0.03, [0.13, -0.3, -0.44]),
      { t: 0.06, p: [c[0], c[1] + 0.04, c[2] - 0.06], q: [0.3, 0.05, -0.65], f: 'flat', e: 'o', on: true },
      ...ks,
      { t: 0.54, p: [c[0], c[1] - 0.02, c[2]], f: 'relax', e: 's' },
      GE(0.72)],
      body: [{ t: 0 }, { t: 0.15, y: 0.02, r: 0.01 }, { t: 0.3, y: -0.02, r: -0.01 }, { t: 0.45, y: 0.005 }, { t: 0.72 }],
      snd: [[0, 'cl', 0.8], [0.08, 'sw', 0.26, 0.36]] };
  });
  // ---- 鬨の声: the fist thrust up high at the edge of the view, its back to the eye, and shaken with the roar, the head thrown back
  mv('sk_roar', () => ({ dur: 0.9, hit: 0.1, main: [
    ...UP(0.035, 0.065, 'fist'),
    { t: 0.1, p: [0.24, 0.12, -0.3], q: [0.3, 0, 0.5], f: 'fist', e: 'o', on: true },
    { t: 0.18, p: [0.243, 0.142, -0.296], e: 'o', s: 0.002 },
    { t: 0.27, p: [0.238, 0.112, -0.302], e: 'q', s: 0.002 },
    { t: 0.36, p: [0.243, 0.142, -0.296], e: 'o', s: 0.003 },
    { t: 0.5, p: [0.24, 0.122, -0.3], e: 's', s: 0.002 },
    DN(0.68),
    GE(0.9)],
    body: [{ t: 0 }, { t: 0.12, p: 0.05, d: -0.012, f: 0.01, s: 0.002 }, { t: 0.5, p: 0.045, d: -0.01, s: 0.0025 }, { t: 0.9 }],
    jolt: [[0.1, 0.06], [0.36, 0.03]], snd: [[0, 'cl', 1.2], [0.05, 'sw', 0.22, 0.12]] }));
  // ---- 骸骨兵召喚: the puppeteer's hand: held out low, palm down, the fingers hanging, and lifted slowly, the fingers curling up as if
  // drawing the dead up out of the ground on strings; then a last tug up
  mv('sk_puppet', () => ({ dur: 1.0, hit: 0.12, main: F([
    ...OFF(0.054),
    { t: 0.12, p: [0.14, -0.19, -0.5], q: [0.15, 0, 0.05], f: 'hang', e: 'o', on: true },
    { t: 0.3, p: [0.14, -0.16, -0.5], q: [0.22, 0, 0.05], e: 's', s: 0.0012 },
    { t: 0.52, p: [0.14, -0.1, -0.49], q: [0.35, 0, 0.05], f: 'relax', e: 's', s: 0.002 },
    { t: 0.6, p: [0.14, -0.06, -0.48], q: [0.3, 0, 0.05], f: 'claw', e: 'o' },
    { t: 0.72, p: [0.14, -0.07, -0.48], e: 's' },
    GE(1.0)]),
    body: [{ t: 0 }, { t: 0.14, p: -0.025, d: 0.01 }, { t: 0.52, p: 0.0, d: 0.0 }, { t: 0.62, p: 0.025, d: -0.008 }, { t: 1.0 }],
    jolt: [[0.6, 0.04]], snd: [[0, 'cl', 0.8], [0.3, 'cl', 0.7], [0.56, 'sw', 0.18, 0.12]] }));
  // ---- EMPバースト: a sharp clap low before the chest (well below the aim), held a beat, the hands then flung apart and out, palms out
  mv('sk_burst', () => {
    const h = 0.07, hold = 0.05;
    const keys = (d) => [
      { t: 0, p: [0.2, -0.42, -0.3], q: [0.8, 0.1, -1.3], f: 'relax' },
      { t: h + d, p: [0.03, -0.31, -0.54], q: [0.75, -0.05, -1.57], f: 'pray', e: 'i', on: true },
      { t: h + 0.04 + d, p: [0.029, -0.308, -0.545], e: 'o', s: 0.001 },
      { t: h + hold, p: [0.029, -0.307, -0.545], e: 'l', s: 0.001 },
      { t: h + hold + 0.12, p: [0.3, -0.2, -0.48], q: [0.6, 0.35, -0.2], f: 'splay', e: 'o' },
      { t: h + hold + 0.45, p: 'rest', q: REST_Q, f: 'rest', e: 'q' }];
    return { dur: h + hold + 0.45, hit: h, both: true, main: keys(0), off: keys(0.006),
      body: [{ t: 0 }, { t: h + 0.03, d: 0.01, p: -0.012 }, { t: h + hold, d: 0.012, p: -0.014 }, { t: h + hold + 0.1, d: -0.008, p: 0.016, f: 0.02 }, { t: h + hold + 0.45 }],
      jolt: [[h + hold + 0.06, 0.06]], snd: [[0, 'cl', 1], [h, 'cp', 1], [h + hold + 0.02, 'sw', 0.24, 0.18]] };
  });
  // ---- 地裂掌: the open hand drawn up short beside the shoulder, edge on (no time for more: the blow lands at 0.085 s), and struck down
  // flat on the ground at the foot of the view, palm down, the fingers spread; pressed there, then back to the gun
  mv('sk_strike', () => {
    const h = 0.085;
    return { dur: 0.62, hit: h, main: [
      G0(),
      { t: h * 0.4, p: [0.15, -0.3, -0.42], q: [0.4, 0.1, -1.4], f: 'relax', e: 'o' },
      { t: h, p: [0.13, -0.31, -0.48], q: [-0.2, 0.05, 0.08], e: 'i', on: true },
      { t: h + 0.045, p: [0.13, -0.3, -0.475], e: 'o', s: 0.003 },
      { t: 0.36, p: [0.135, -0.305, -0.48], f: 'press', e: 's' },
      GE(0.62)],
      body: [{ t: 0 }, { t: h * 0.4, p: 0.016, d: -0.01 }, { t: h + 0.03, d: 0.095, p: -0.115, f: 0.03 }, { t: 0.36, d: 0.075, p: -0.09, f: 0.02 }, { t: 0.62 }],
      jolt: [[h, 0.14]], snd: [[0, 'cl', 0.9], [h * 0.4, 'sw', 0.24, 0.12], [h, 'th', 0.3]] };
  });

  // ================================================ on yourself
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
    // (the hand's own space: palm down (-y), fingers to -z, the thumb to -x: the watch lies on the palm, face out of it, its crown
    // turned toward the thumb)
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
    G0(),
    { t: 0.12, p: [0.13, -0.21, -0.55], q: [0.35, 0.2, 3.0], f: 'cradle', e: 'o', on: true },
    { t: 0.22, p: [0.13, -0.205, -0.545], f: 'cradleUp', e: 's' },
    { t: 0.3, f: 'cradlePress', e: 'i', s: 0.0015 },
    { t: 0.4, f: 'cradle', e: 'o' },
    { t: 0.6, p: [0.13, -0.23, -0.53], q: [0.25, 0.2, 2.9], f: 'watch', e: 's' },
    GE(0.95)]),
    body: [{ t: 0 }, { t: 0.14, p: -0.04, d: 0.006 }, { t: 0.3, p: -0.045, d: 0.008 }, { t: 0.6, p: -0.03, d: 0.006 }, { t: 0.95 }],
    jolt: [[0.3, 0.02]], snd: [[0, 'cl', 0.8], [0.3, 'cl', 1.6]] }));
  // ---- 時間逆行: a dial in the air taken between the thumb and the first two fingers and wound back hard, twice (the hand lets go and
  // takes it again between the turns), then snatched back low to the body
  mv('sk_unwind', () => {
    const P0 = [0.14, -0.12, -0.51], qa = (z) => [0.85, 0.0, z];
    return { dur: 0.78, hit: 0.08, main: F([
      ...OFF(0.04, [0.13, -0.3, -0.44]),
      { t: 0.08, p: P0, q: qa(-0.2), f: 'pinchOpen', e: 'o' },
      { t: 0.11, f: 'pinch', e: 'i', on: true },
      { t: 0.22, q: qa(-1.15), e: 'q', s: 0.0008 },
      { t: 0.26, f: 'pinchOpen', e: 'o' },
      { t: 0.3, q: qa(-0.2), e: 'q' },
      { t: 0.33, f: 'pinch', e: 'i' },
      { t: 0.44, q: qa(-1.15), e: 'q', s: 0.0008 },
      { t: 0.54, p: [0.21, -0.27, -0.37], q: [0.6, 0.2, -1.1], f: 'fist', e: 'o' },
      GE(0.78)]),
      body: [{ t: 0 }, { t: 0.1, f: 0.012 }, { t: 0.44, f: 0.012 }, { t: 0.56, f: -0.04, p: 0.015 }, { t: 0.78 }],
      jolt: [[0.54, 0.03]], snd: [[0, 'cl', 0.8], [0.11, 'cl', 0.9], [0.33, 'cl', 0.9], [0.48, 'sw', 0.2, 0.1]] };
  });
  // ---- 透明化: the hood drawn up: the hand reaches up past the edge of the view to the hood behind the head, takes its edge and pulls it
  // forward down over the brow, and lets go
  mv('sk_hood', () => ({ dur: 0.62, hit: 0.1, main: F([
    ...UP(0.035, 0.065, 'relax'),
    { t: 0.1, p: [0.3, 0.17, -0.12], q: [-0.4, 0, -0.8], f: 'pinchCloth', e: 'o' },
    { t: 0.22, p: [0.25, 0.155, -0.26], q: [-0.55, 0, -0.7], e: 's' },
    { t: 0.32, p: [0.23, 0.13, -0.31], q: [-0.55, 0, -0.6], e: 's', on: true },
    { t: 0.4, p: [0.29, 0.15, -0.24], q: [-0.3, 0, -0.4], f: 'relax', e: 'o' },
    DN(0.5),
    GE(0.62)]),
    body: [{ t: 0 }, { t: 0.12, p: 0.01 }, { t: 0.32, p: -0.025, d: 0.01 }, { t: 0.62 }],
    snd: [[0, 'cl', 0.9], [0.14, 'cl', 1.1], [0.2, 'sw', 0.08, 0.16]] }));
  // ---- 影分身: both hands brought together low before the body, then swept out to either side, palms out, sending the shadows to
  // stand there; held out a moment
  mv('sk_send', () => {
    const keys = (d) => [
      { t: 0, p: [0.2, -0.46, -0.24], q: [0.5, 0.1, -1.3], f: 'relax' },
      { t: 0.1 + d, p: [0.07, -0.25, -0.53], q: [0.6, -0.1, -1.5], f: 'flat', e: 'o', on: true },
      { t: 0.16 + d, p: [0.065, -0.245, -0.54], e: 'o' },
      { t: 0.32 + d, p: [0.34, -0.23, -0.44], q: [0.1, -0.55, 0.25], f: 'flat', e: 'o' },
      { t: 0.55, p: [0.345, -0.22, -0.44], f: 'relax', e: 'l', s: 0.0008 },
      { t: 0.85, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.85, hit: 0.1, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.12, d: 0.012, p: -0.015 }, { t: 0.32, f: 0.015, p: 0.005 }, { t: 0.55, d: 0.004 }, { t: 0.85 }],
      jolt: [[0.3, 0.025]], snd: [[0, 'cl', 1], [0.1, 'cp', 0.35], [0.2, 'sw', 0.22, 0.2]] };
  });
  // ---- 天秤の祈り: both hands held out low to the sides, palms up like the pans of a scale, rocking against each other and coming to
  // rest level
  mv('sk_scales', () => {
    const keys = (s) => [
      { t: 0, p: [0.2, -0.44, -0.3], q: [0.2, 0, 2.9], f: 'relax' },
      { t: 0.14, p: [0.24, -0.19 + 0.03 * s, -0.55], q: [0.15, 0.05, 2.95], e: 'o' },
      { t: 0.34, p: [0.24, -0.19 - 0.025 * s, -0.55], e: 's' },
      { t: 0.52, p: [0.24, -0.19 + 0.012 * s, -0.55], e: 's' },
      { t: 0.7, p: [0.24, -0.19, -0.55], e: 's' },
      { t: 0.85, p: [0.24, -0.19, -0.55], e: 'l' },
      { t: 1.1, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 1.1, hit: 0.14, both: true, main: keys(1), off: keys(-1),
      body: [{ t: 0 }, { t: 0.14, d: 0.006, r: -0.008 }, { t: 0.34, r: 0.007 }, { t: 0.52, r: -0.003 }, { t: 0.7, p: -0.008 }, { t: 1.1 }],
      snd: [[0, 'cl', 1], [0.3, 'cl', 0.5]] };
  });
  // ---- 癒しの泉: both hands cupped together low before the body, as water is taken from a spring, lifted, and parted palms up
  mv('sk_spring', () => {
    const keys = (d) => [
      { t: 0, p: [0.17, -0.44, -0.3], q: [0.1, 0, 2.9], f: 'relax' },
      { t: 0.12 + d, p: [0.05, -0.29, -0.5], q: [0.15, -0.25, 2.75], f: 'cup', e: 'o' },
      { t: 0.4 + d, p: [0.06, -0.2, -0.54], q: [0.35, -0.25, 2.75], e: 's' },
      { t: 0.62 + d, p: [0.21, -0.2, -0.55], q: [0.25, 0.15, 2.95], f: 'splay', e: 's' },
      { t: 0.75, f: 'relax', e: 's' },
      { t: 0.95, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.95, hit: 0.12, both: true, main: F(keys(0)), off: F(keys(0.01)),
      body: [{ t: 0 }, { t: 0.14, p: -0.04, d: 0.015 }, { t: 0.42, p: -0.015, d: 0.006 }, { t: 0.62, p: 0.008 }, { t: 0.95 }],
      snd: [[0, 'cl', 1], [0.12, 'cp', 0.3], [0.5, 'sw', 0.08, 0.2]] };
  });
  // ---- 茨の鎧: the fists brought up in a guard before the chest, the forearms upright, braced and trembling as the hide hardens, then
  // struck out and down to the sides as the thorns burst from the ground
  mv('sk_brace', () => {
    const keys = (d) => [
      { t: 0, p: [0.2, -0.44, -0.28], q: [0.8, 0.1, -1.4], f: 'relax' },
      { t: 0.1 + d, p: [0.18, -0.19, -0.53], q: [1.1, -0.1, -1.45], f: 'fist', e: 'o', on: true },
      { t: 0.38, p: [0.175, -0.2, -0.525], q: [1.05, -0.05, -1.4], e: 'l', s: 0.003 },
      { t: 0.48, p: [0.27, -0.29, -0.4], q: [0.3, 0.3, -1.4], e: 'o' },
      { t: 0.58, p: [0.275, -0.3, -0.4], f: 'relax', e: 's' },
      { t: 0.8, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.8, hit: 0.1, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.1, d: 0.02, p: -0.02, f: -0.01 }, { t: 0.38, d: 0.03, p: -0.025, s: 0.002 }, { t: 0.5, d: -0.008, p: 0.015, f: 0.02 }, { t: 0.8 }],
      jolt: [[0.1, 0.04], [0.48, 0.07]], snd: [[0, 'cl', 1.2], [0.1, 'cl', 1], [0.44, 'sw', 0.26, 0.16]] };
  });
  // ---- 弾幕: the gun is slapped twice on its side with the flat of the hand, as if to wake it (or, a hand weapon held, the fist struck
  // into the palm): its bolt goes back with it
  mv('sk_slap', () => {
    const g = CA.gunNow ? CA.gunNow() : null;
    // (no gun in the right hand: a hand weapon is lowered and the right fist is struck twice into the open left palm before the chest)
    if (!g) {
      const palm = [0.07, -0.21, -0.53], PQ = [0.95, -0.05, -1.57];
      return { dur: 0.6, hit: 0.1, both: true,
        main: [
          { t: 0, p: [0.2, -0.44, -0.28], q: [0.8, 0.1, -1.2], f: 'relax' },
          { t: 0.08, p: palm, q: PQ, f: 'flat', e: 'o' },
          { t: 0.3, p: [palm[0], palm[1] - 0.003, palm[2]], e: 'l', s: 0.0015 },
          { t: 0.6, p: 'rest', q: REST_Q, f: 'rest', e: 's' }],
        off: [
          { t: 0, p: [0.22, -0.44, -0.26], q: [0.6, 0.1, -0.9], f: 'fist' },
          { t: 0.06, p: [0.16, -0.19, -0.49], q: [0.5, 0.4, -0.4], e: 'o' },
          { t: 0.1, p: [0.015, -0.22, -0.53], q: [0.3, 0.9, -0.3], e: 'i', on: true },
          { t: 0.17, p: [0.15, -0.19, -0.5], e: 'o' },
          { t: 0.22, p: [0.015, -0.22, -0.53], e: 'i' },
          { t: 0.3, p: [0.02, -0.218, -0.525], e: 'o', s: 0.002 },
          { t: 0.6, p: 'rest', q: REST_Q, f: 'rest', e: 's' }],
        body: [{ t: 0 }, { t: 0.1, d: 0.008, p: -0.008 }, { t: 0.22, d: 0.01, p: -0.01 }, { t: 0.6 }],
        jolt: [[0.1, 0.03], [0.22, 0.04]], snd: [[0.09, 'cp', 0.9], [0.21, 'cp', 1.0]] };
    }
    // (the wrist out to the gun's left side and down from its top, the palm turned in flat against the receiver; drawn out from it
    // between the slaps)
    const on = ['gun', 0.035, -0.06, 0.02], up = ['gun', 0.1, -0.03, 0.02], QF = [0.05, 0.05, -1.45], QU = [0.25, 0.1, -1.2];
    return { dur: 0.6, hit: 0.1, main: [
      G0(),
      { t: 0.06, p: up, q: QU, f: 'flat', e: 'o' },
      { t: 0.1, p: on, q: QF, e: 'i', on: true },
      { t: 0.17, p: up, q: QU, e: 'o' },
      { t: 0.22, p: on, q: QF, e: 'i' },
      { t: 0.3, p: ['gun', 0.045, -0.055, 0.02], e: 'o' },
      GE(0.6)],
      body: [{ t: 0 }, { t: 0.1, d: 0.006, p: -0.008 }, { t: 0.22, d: 0.008, p: -0.01 }, { t: 0.6 }],
      jolt: [[0.1, 0.03], [0.22, 0.04]], snd: [[0.09, 'cp', 0.7], [0.21, 'cp', 0.9]] };
  });
  // ---- 跳弾の嵐: the first finger traces a bullet's way off one wall and another: a quick zig-zag below the aim, each turn sharp
  mv('sk_zigzag', () => ({ dur: 0.66, hit: 0.08, main: [
    ...OFF(0.036),
    { t: 0.08, p: [0.2, -0.09, -0.5], q: [0.3, 0.45, -1.3], f: 'point', e: 'o', on: true },
    { t: 0.15, p: [0.1, -0.14, -0.52], q: [0.25, 0.2, -1.3], e: 'o' },
    { t: 0.22, p: [0.19, -0.18, -0.51], q: [0.2, 0.45, -1.3], e: 'o' },
    { t: 0.29, p: [0.11, -0.12, -0.54], q: [0.25, 0.25, -1.3], e: 'o' },
    { t: 0.38, p: [0.115, -0.122, -0.535], e: 'o' },
    GE(0.66)],
    body: [{ t: 0 }, { t: 0.1, f: 0.01, y: -0.006 }, { t: 0.18, y: 0.008 }, { t: 0.25, y: -0.006 }, { t: 0.32, y: 0.004, f: 0.015 }, { t: 0.66 }],
    snd: [[0, 'cl', 0.7], [0.1, 'sw', 0.08, 0.05], [0.17, 'sw', 0.08, 0.05], [0.24, 'sw', 0.08, 0.05]] }));

  CA.table({
    // ---- movement
    dash: { m: 'part' },                                         // ダッシュ: both hands part the air
    dash2: { m: 'sk_dive' },                                     // 疾風迅雷: driven out together, torn apart crackling
    blink: { m: 'sk_flick' },                                    // ブリンク: two fingers flicked at where you go
    leap: { m: 'sk_jump' },                                      // 雷鳴の跳躍: both arms swung up into the jump
    flight: { m: 'sk_wings' },                                   // 飛翔: pushed off the air, the arms spread
    lunge: { m: 'sk_slash', at: 0.16 },                          // 吸血の刃: a knife-hand cut as the strike lands (0.16 s)
    haste: { m: 'sk_pump' },                                     // 加速装置: a fist pump
    // ---- thrown / shot from the hand
    spear: { m: 'sk_javelin' },                                  // 投槍
    icespear: { m: 'sk_dart' },                                  // 氷槍: a knife's throw
    fireball: { m: 'sk_hurl' },                                  // 火球: put from the palm like a shot
    waterbolt: { m: 'sk_skim' },                                 // 水弾: a side-arm throw
    magnet: { m: 'sk_magnet' },                                  // 磁力爆弾: thrust out, then clenched and yanked back
    sk_pile: { m: 'sk_ram' },                                    // 破甲杭: a ram from the hip, kicked back
    chain: { m: 'sk_zap' },                                      // 連鎖雷: the bolt leaves the finger tip
    chain2: { m: 'sk_smite' },                                   // 雷神の裁き: two fingers brought down from on high
    anchorstorm: { m: 'sk_haul' },                               // 鉤鎖乱舞: the chains hauled in hand over hand
    mines: { m: 'sk_sow' },                                      // 地雷散布: sown across the body
    decoy: { m: 'sk_loft' },                                     // 幻影の囮: let go upward from the palm
    turret: { m: 'underhand' },                                  // 自動弩砲: tossed underhand onto the spot
    // ---- at a point aimed at
    meteor: { m: 'sk_calldown' },                                // 隕石落とし: called from the sky, dragged down
    arrowrain: { m: 'sk_volley' },                               // 矢の雨: the archers' signal
    firestorm: { m: 'sk_kindle' },                               // 火炎嵐: a rising circle, flung up
    toxic: { m: 'sk_toss' },                                     // 毒霧: a handful tossed out
    sk_acid: { m: 'sk_sprinkle' },                               // 腐蝕の雨: sprinkled
    whirlpool: { m: 'sk_stir' },                                 // 渦潮: stirred in a tightening circle
    gravity: { m: 'sk_weigh' },                                  // 重力井戸: borne down by a weight, crushed shut
    grasp: { m: 'sk_rise' },                                     // 闇の手: a grip taken from below
    mark: { m: 'sk_brand' },                                     // 処刑の刻印: a cross cut with two fingers
    // ---- round you / ahead of you
    shockwave: { m: 'push2' },                                   // 衝撃波
    emp: { m: 'sk_burst' },                                      // EMPバースト: a clap low, flung open
    frostnova: { m: 'plant', both: true, hold: 0.3 },            // フロストノヴァ: both palms on the ground
    groundpound: { m: 'sk_strike' },                             // 地裂掌: the palm struck on the ground
    quake: { m: 'slam', both: true },                            // 地震: both fists
    spikes: { m: 'sk_rip' },                                     // 大地の棘: slapped down, raked forward and up
    barrier: { m: 'sk_lift' },                                   // 石壁: hauled up out of the ground
    drain: { m: 'sk_siphon' },                                   // 生命吸収: drawn back to the body
    harvest: { m: 'sk_reap' },                                   // 魂の収穫: a reaper's stroke, the souls taken in
    holynova: { m: 'clasp', open: true },                        // 聖なる光: a prayer, flung open
    sk_rift: { m: 'sk_cleave' },                                 // 次元斬: cut straight down
    blades: { m: 'sk_whirl' },                                   // 刃の旋風: swung round in a circle
    warcry: { m: 'sk_roar' },                                    // 鬨の声: the fist shaken overhead
    summon: { m: 'sk_puppet' },                                  // 骸骨兵召喚: drawn up on strings
    // ---- on yourself
    chrono: { m: 'sk_watch', tick: (c, t) => { if (c.prop) c.prop.visible = t < 0.8; } },   // 時間減速: a pocket watch's crown pressed
    rewind: { m: 'sk_unwind' },                                  // 時間逆行: a dial pinched and wound back, snatched back
    cloak: { m: 'sk_hood' },                                     // 透明化: the hood drawn up over the brow
    sk_shadow: { m: 'sk_send' },                                 // 影分身: the shadows sent out to either side
    sk_scale: { m: 'sk_scales' },                                // 天秤の祈り: the pans of a scale
    healaura: { m: 'sk_spring' },                                // 癒しの泉: water cupped from a spring
    thornarmor: { m: 'sk_brace' },                               // 茨の鎧: a braced guard, struck out
    berserk: { m: 'channel', f: 'fist', hold: 0.4, body: 1.3 },  // 狂戦士化: fists clenched and trembling, torn apart
    overdrive: { m: 'sk_slap' },                                 // 弾幕: the gun slapped awake
    ricostorm: { m: 'sk_zigzag' },                               // 跳弾の嵐: a ricochet's way traced
  });
})();
