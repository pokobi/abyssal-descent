'use strict';
// Which first-person motion each ultimate casts with (castanim.js). The same form as js/castanim_skills.js. An ultimate's effect is
// never held back (no release): its motion plays from the moment it goes off.
//
// An ultimate is the high point of a fight, so each has a move of its own (made here with G.CastAnim.move, every name begun with
// 'u_'): larger, heavier and longer than a skill's, the body and the view going with it more, and each one plain to tell from the
// others by its shape, pace, wind-up, hands and side. The moments are put to ultimates.js: where its effect comes at once (a ring run
// out from you, a wave risen before you) the blow lands within the first 0.1-0.2 s, the arm coming in from outside the view so there is
// no wind-up to wait for; where it comes later (the meteors fall from 1.0 s, the bell tolls at 0, 0.9 and 1.8 s, the blades of 断罪
// come down at 2.0 s) the hands are there at that moment.
(function () {
  const CA = G.CastAnim; if (!CA || !CA.move) return;
  const GQ = [0.35, 0.35, -2.3], RQ = [-0.4, 0.1, 0.5];
  const IN = [0.2, -0.3, -0.25], INQ = [0.6, 0.05, -0.6];
  // a fist clenched hard (the fingers rolled in tight, the thumb laid across them): an ultimate's fist is a strained one
  const TF = { f: [0, 1, 2, 3].map((i) => [2.05 + i * 0.04, 2.25, 1.55, (i - 1.5) * -0.02]), t: [1.15, 1.05, 0.95, 0.15] };
  // (fists are turned so their backs and knuckles face the eye: seen from the palm side, curled fingers read as a claw)
  const FQ = [1.3, 0.3, -0.2];
  const M = CA.move;

  // 不屈の城塞: the fist driven into the open palm before the chest (a pledge), then both forearms brought up as a guard before the face
  // and held there, the body set low and square behind it
  M('u_bastion', () => ({ dur: 1.4, hit: 0.13, both: true,
    main: [
      { t: 0, p: [0.22, -0.32, -0.24], q: [0.6, 0.1, -0.9], f: TF },
      { t: 0.07, p: [0.12, -0.11, -0.3], q: [0.8, 0.05, -1.3], e: 'o' },
      { t: 0.13, p: [0.0, -0.115, -0.37], q: [0.25, 0.9, -0.2], e: 'i' },
      { t: 0.18, p: [0.005, -0.113, -0.368], e: 'o', s: 0.003 },
      { t: 0.5, p: [0.005, -0.112, -0.365], e: 'l', s: 0.0018 },
      { t: 0.66, p: [0.1, -0.02, -0.34], q: FQ, e: 'o' },
      { t: 1.05, p: [0.103, -0.025, -0.343], e: 'l', s: 0.0016 },
      { t: 1.4, p: 'rest', q: RQ, f: 'rest', e: 's' }],
    off: [
      { t: 0, p: [0.22, -0.32, -0.24], q: [1.0, 0, -1.2], f: 'relax' },
      { t: 0.1, p: [0.045, -0.115, -0.39], q: [1.45, -0.05, -1.57], f: 'flat', e: 'o' },
      { t: 0.14, p: [0.055, -0.116, -0.385], e: 'o', s: 0.002 },
      { t: 0.5, p: [0.055, -0.114, -0.385], e: 'l', s: 0.0015 },
      { t: 0.68, p: [0.1, -0.01, -0.35], q: FQ, f: TF, e: 'o' },
      { t: 1.05, p: [0.103, -0.015, -0.352], e: 'l', s: 0.0016 },
      { t: 1.4, p: 'rest', q: RQ, f: 'rest', e: 's' }],
    body: [{ t: 0 }, { t: 0.07, p: 0.008, f: -0.01 }, { t: 0.15, d: 0.03, p: -0.025, f: 0.025 }, { t: 0.5, d: 0.03, p: -0.022, f: 0.02 },
      { t: 0.7, d: 0.055, p: -0.012, s: 0.0008 }, { t: 1.05, d: 0.05, p: -0.01, s: 0.0006 }, { t: 1.4 }],
    jolt: [[0.13, 0.14], [0.68, 0.08]], snd: [[0, 'cl', 1.2], [0.05, 'sw', 0.22, 0.14], [0.13, 'cp', 1.3], [0.56, 'cl', 1.1], [0.6, 'sw', 0.18, 0.16]] }));

  // 星落とし: both hands reached up to the sky (the head lifted after them), clawed, closed on it, and hauled down hard to the foot of
  // the view as the first rock comes down (1.0 s)
  M('u_meteor', () => {
    const k = (d) => [
      { t: 0, p: IN, q: INQ, f: 'relax' },
      { t: 0.2 + d, p: [0.24, 0.09, -0.46], q: [1.85, -0.1, -0.3], f: 'clawOpen', e: 'o' },
      { t: 0.34 + d, p: [0.235, 0.11, -0.47], e: 's', s: 0.001 },
      { t: 0.44 + d, p: [0.225, 0.095, -0.45], q: [1.75, 0, -0.7], f: 'claw', e: 'i' },
      { t: 0.5 + d, p: [0.22, 0.09, -0.44], f: TF, e: 'o', s: 0.003 },
      { t: 0.95 + d, p: [0.13, -0.12, -0.4], q: FQ, e: 'i' },
      { t: 1.05 + d, p: [0.13, -0.135, -0.39], e: 'o', s: 0.002 },
      { t: 1.5, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.5, hit: 0.95, both: true, main: k(0), off: k(0.02),
      body: [{ t: 0 }, { t: 0.3, p: 0.075, d: -0.015 }, { t: 0.48, p: 0.08, d: -0.018 }, { t: 0.97, p: -0.075, d: 0.06, f: 0.03 }, { t: 1.12, p: -0.065, d: 0.055, f: 0.025 }, { t: 1.5 }],
      jolt: [[0.48, 0.05], [0.97, 0.2]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.2, 0.2], [0.44, 'cl', 1.4], [0.7, 'sw', 0.4, 0.3], [0.97, 'th', 0.35]] };
  });

  // 終焉の鐘: the two fists clasped into one and swung up like a ram against the bell above, once for each toll (0, 0.9, 1.8 s): from
  // the right, from the left, and straight up from below; the head goes up with each blow
  M('u_bell', () => {
    // the clasped fists' middle, in the view's true space (x + right), and the time of each place
    const path = [
      [0, [0.2, -0.22, -0.32]], [0.09, [0.0, 0.07, -0.5]], [0.2, [-0.08, 0.09, -0.48]], [0.45, [0.02, -0.06, -0.36]],
      [0.76, [-0.2, -0.06, -0.3]], [0.9, [0.0, 0.07, -0.5]], [1.0, [0.08, 0.09, -0.48]], [1.3, [0.0, -0.06, -0.34]],
      [1.62, [0.0, -0.2, -0.3]], [1.8, [0.0, 0.08, -0.5]], [1.92, [0.0, 0.1, -0.49]], [2.1, [0.0, -0.02, -0.42]]];
    const E = ['', 'i', 'o', 's', 's', 'i', 'o', 's', 's', 'i', 'o', 'l'];
    // main is the left arm (its x turned over), off the right; the two fists a hand's breadth apart, the right one a little higher
    const keys = (mx, dx, dy) => path.map(([t, p], i) => ({ t, p: [mx * (p[0] + dx), p[1] + dy, p[2]], q: [1.2, 0.1, -1.5], f: TF, e: E[i] || 'q', s: i % 4 === 2 ? 0.002 : 0 }))
      .concat([{ t: 2.45, p: 'rest', q: RQ, f: 'rest', e: 's' }]);
    const body = [{ t: 0 }];
    for (const [t0, y] of [[0, 1], [0.81, -1], [1.71, 0]]) body.push({ t: t0 + 0.1, p: 0.05, d: -0.01, y: 0.025 * y, r: 0.012 * y, f: 0.015 }, { t: t0 + 0.4, p: 0.0, d: 0.015, y: -0.01 * y });
    body.push({ t: 2.1, p: 0.02, d: 0.005 }, { t: 2.45 });
    return { dur: 2.45, hit: 0.09, both: true, main: keys(-1, -0.028, 0), off: keys(1, 0.028, 0.012), body,
      jolt: [[0.09, 0.12], [0.9, 0.12], [1.8, 0.16]],
      snd: [[0, 'cl', 1.2], [0.02, 'sw', 0.3, 0.14], [0.7, 'cl', 0.9], [0.8, 'sw', 0.3, 0.14], [1.6, 'cl', 0.9], [1.7, 'sw', 0.34, 0.14]] };
  });

  // 神降ろし: both arms lifted up and out into a V, the palms turned to the light coming down, the head raised to it; then the hands
  // drawn slowly down before the chest and closed into fists, the power taken in
  M('u_godfall', () => {
    const k = (d) => [
      { t: 0, p: IN, q: INQ, f: 'relax' },
      { t: 0.24 + d, p: [0.27, 0.08, -0.45], q: [2.0, -0.2, 0.3], f: 'splay', e: 'o' },
      { t: 0.7 + d, p: [0.285, 0.1, -0.45], e: 's', s: 0.0015 },
      { t: 1.1 + d, p: [0.12, -0.06, -0.4], q: FQ, f: 'claw', e: 's' },
      { t: 1.22 + d, p: [0.11, -0.085, -0.39], f: TF, e: 'o', s: 0.003 },
      { t: 1.4, p: [0.11, -0.088, -0.385], e: 'l', s: 0.002 },
      { t: 1.8, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.8, hit: 0.24, both: true, main: k(0), off: k(0.015),
      body: [{ t: 0 }, { t: 0.28, p: 0.09, d: -0.02 }, { t: 0.7, p: 0.1, d: -0.025 }, { t: 1.12, p: -0.02, d: 0.03, f: 0.02 }, { t: 1.25, d: 0.035, p: -0.025, s: 0.002 }, { t: 1.4, d: 0.03, p: -0.02, s: 0.001 }, { t: 1.8 }],
      jolt: [[1.22, 0.12]], snd: [[0, 'cl', 1.1], [0.05, 'sw', 0.14, 0.25], [1.1, 'cl', 1.4]] };
  });

  // 時止め: the left hand thrust out open at the world (the gun kept in the right), held a beat, then the fingers clenched shut on it
  // with a turn of the wrist - and held there, still, as time stops
  M('u_timestop', () => ({ dur: 1.35, hit: 0.1, both: false,
    main: [
      { t: 0, p: [0.18, -0.24, -0.22], q: [1.1, 0.05, -0.3], f: 'flat' },
      { t: 0.1, p: [0.07, -0.065, -0.52], q: [1.62, -0.06, -0.1], f: 'splay', e: 'o' },
      { t: 0.16, p: [0.074, -0.068, -0.525], e: 'o', s: 0.001 },
      { t: 0.34, p: [0.074, -0.07, -0.52], f: 'clawOpen', e: 's' },
      { t: 0.42, p: [0.075, -0.08, -0.505], q: [1.35, -0.1, -0.6], f: TF, e: 'i' },
      { t: 0.5, p: [0.075, -0.081, -0.504], e: 'o', s: 0.0025 },
      { t: 1.0, p: [0.075, -0.082, -0.503], e: 'l', s: 0.0004 },
      { t: 1.35, p: 'grip', q: GQ, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, f: 0.05, p: -0.01 }, { t: 0.34, f: 0.045, p: -0.008 }, { t: 0.44, f: 0.05, d: 0.012, p: -0.014 }, { t: 1.0, f: 0.045, d: 0.01, p: -0.012 }, { t: 1.35 }],
    jolt: [[0.1, 0.06], [0.42, 0.12]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.25, 0.14], [0.4, 'cl', 1.6]] }));

  // 鬼神化: the two fists struck together knuckle to knuckle before the chest, then dragged apart and down with the arms locked and
  // shaking (the body hunched over them, trembling harder), and at last driven out and down
  M('u_berserk', () => {
    const k = (d) => [
      { t: 0, p: [0.24, -0.28, -0.22], q: [0.6, 0.1, -0.9], f: TF },
      { t: 0.06, p: [0.2, -0.1, -0.3], q: [0.4, 0.6, -0.6], e: 'o' },
      { t: 0.12 + d, p: [0.045, -0.105, -0.4], q: [0.2, 1.2, 0.0], e: 'i' },
      { t: 0.17 + d, p: [0.05, -0.104, -0.398], e: 'o', s: 0.003 },
      { t: 0.32 + d, p: [0.17, -0.15, -0.37], q: [0.6, 0.3, -0.3], e: 'o', s: 0.003 },
      { t: 0.85, p: [0.19, -0.175, -0.35], e: 'l', s: 0.006 },
      { t: 1.0, p: [0.13, -0.13, -0.48], q: [0.15, 0.25, -0.05], e: 'o' },
      { t: 1.4, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.4, hit: 0.12, both: true, main: k(0), off: k(0.005),
      body: [{ t: 0 }, { t: 0.12, d: 0.02, p: -0.01, f: 0.02 }, { t: 0.32, d: 0.06, p: -0.04, s: 0.002 }, { t: 0.85, d: 0.07, p: -0.05, s: 0.005 }, { t: 1.0, d: 0.02, p: -0.02, f: 0.05 }, { t: 1.4 }],
      jolt: [[0.12, 0.13], [1.0, 0.15]], snd: [[0, 'cl', 1.1], [0.12, 'cp', 1.4], [0.3, 'cl', 1.2], [0.95, 'sw', 0.3, 0.2]] };
  });

  // 虚無の渦: both hands out round a ball of nothing, one over it and one under, clawed into it, and wrung in opposite ways - the upper
  // hand rolled over and down, the lower up - until both are crushed shut and torn apart
  M('u_blackhole', () => ({ dur: 1.45, hit: 0.14, both: true,
    main: [
      { t: 0, p: [0.2, -0.28, -0.25], q: [0.8, 0, -0.6], f: 'relax' },
      { t: 0.14, p: [0.075, -0.02, -0.48], q: [0.7, 0.2, -1.0], f: 'clawOpen', e: 'o' },
      { t: 0.3, p: [0.075, -0.025, -0.48], f: 'claw', e: 's', s: 0.0012 },
      { t: 0.62, p: [0.085, -0.13, -0.46], q: [0.9, 0.3, -2.7], e: 's', s: 0.002 },
      { t: 0.7, p: [0.085, -0.135, -0.455], f: TF, e: 'i' },
      { t: 0.8, p: [0.085, -0.135, -0.455], e: 'l', s: 0.004 },
      { t: 1.0, p: [0.2, -0.15, -0.38], q: [0.7, 0.2, -2.2], e: 'o' },
      { t: 1.45, p: 'rest', q: RQ, f: 'rest', e: 's' }],
    off: [
      { t: 0, p: [0.2, -0.3, -0.25], q: [0.8, 0, -0.6], f: 'relax' },
      { t: 0.16, p: [0.075, -0.16, -0.47], q: [0.9, -0.2, -2.5], f: 'clawOpen', e: 'o' },
      { t: 0.3, p: [0.075, -0.155, -0.47], f: 'claw', e: 's', s: 0.0012 },
      { t: 0.62, p: [0.085, -0.04, -0.47], q: [0.8, -0.2, -0.7], e: 's', s: 0.002 },
      { t: 0.7, p: [0.085, -0.035, -0.465], f: TF, e: 'i' },
      { t: 0.8, p: [0.085, -0.035, -0.465], e: 'l', s: 0.004 },
      { t: 1.0, p: [0.2, -0.06, -0.38], q: [0.7, -0.1, -0.8], e: 'o' },
      { t: 1.45, p: 'rest', q: RQ, f: 'rest', e: 's' }],
    body: [{ t: 0 }, { t: 0.14, f: 0.03 }, { t: 0.62, f: 0.035, r: 0.035, d: 0.015, s: 0.002 }, { t: 0.72, f: 0.03, r: 0.03, d: 0.028, p: -0.02 }, { t: 1.0, f: -0.01, r: 0.0 }, { t: 1.45 }],
    jolt: [[0.7, 0.14]], snd: [[0, 'cl', 1], [0.06, 'sw', 0.2, 0.14], [0.35, 'cl', 1.2], [0.68, 'cl', 1.6], [0.95, 'sw', 0.22, 0.18]] }));

  // 天罰: the left hand flung straight up at the sky, open (the gun kept in the right), and the head after it; then brought down hard,
  // open and flat, at the ground ahead, as the storm runs out and strikes
  M('u_judgement', () => ({ dur: 1.25, hit: 0.1, both: false,
    main: [
      { t: 0, p: [0.17, -0.25, -0.3], q: [0.5, 0, -0.9], f: 'relax' },
      { t: 0.1, p: [0.22, 0.1, -0.45], q: [1.8, -0.1, -0.2], f: 'splay', e: 'o' },
      { t: 0.28, p: [0.22, 0.115, -0.46], e: 's', s: 0.0015 },
      { t: 0.42, p: [0.08, -0.095, -0.52], q: [-0.1, 0.15, 0.0], f: 'splay', e: 'i' },
      { t: 0.48, p: [0.07, -0.1, -0.515], e: 'o', s: 0.002 },
      { t: 0.9, p: [0.075, -0.102, -0.51], f: 'flat', e: 'l', s: 0.0008 },
      { t: 1.25, p: 'grip', q: GQ, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.12, p: 0.075, d: -0.015 }, { t: 0.3, p: 0.08, d: -0.018 }, { t: 0.44, p: -0.045, d: 0.03, f: 0.04 }, { t: 0.9, p: -0.035, d: 0.025, f: 0.03 }, { t: 1.25 }],
    jolt: [[0.1, 0.1], [0.42, 0.12]], snd: [[0, 'cl', 1], [0.02, 'sw', 0.2, 0.14], [0.34, 'sw', 0.32, 0.14]] }));

  // 鳳凰転生: the forearms crossed tight before the chest (the body hunched over them, shaking), then flung up and out wide like wings,
  // palms up, the body rising and the head going back
  M('u_phoenix', () => {
    const k = (d, z) => [
      { t: 0, p: IN, q: INQ, f: 'relax' },
      { t: 0.18 + d, p: [-0.06, -0.06, z], q: FQ, f: TF, e: 'o' },
      { t: 0.46, p: [-0.055, -0.07, z + 0.02], e: 'l', s: 0.003 },
      { t: 0.62 + d, p: [0.29, 0.0, -0.43], q: [0.45, -0.3, 1.15], f: 'splay', e: 'o' },
      { t: 1.1, p: [0.3, 0.015, -0.43], e: 'l', s: 0.001 },
      { t: 1.55, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.55, hit: 0.62, both: true, main: k(0, -0.33), off: k(0.01, -0.36),
      body: [{ t: 0 }, { t: 0.18, d: 0.03, p: -0.03 }, { t: 0.46, d: 0.045, p: -0.04, s: 0.002 }, { t: 0.64, d: -0.03, p: 0.07, f: -0.01 }, { t: 1.1, d: -0.02, p: 0.05 }, { t: 1.55 }],
      jolt: [[0.62, 0.13]], snd: [[0, 'cl', 1], [0.16, 'cl', 1.1], [0.5, 'sw', 0.35, 0.3]] };
  });

  // 無限兵装: the left hand leaves the fore-end, takes hold of the gun on top of its receiver and racks it hard back and home (the
  // ultimate's own bolt sounds come at 0 and 0.15 s), and slaps it on the way back to the fore-end. The places are set from where the
  // hand holds the gun (tick, below); with no gun in hand it is a fist raised and clenched
  const RACK = [[-0.025, 0.155, 0.09], [-0.025, 0.15, 0.17], [-0.025, 0.155, 0.07], [-0.01, 0.12, 0.05]];
  M('u_armory', () => ({ dur: 0.75, hit: 0.15, both: false,
    main: [
      { t: 0, p: 'grip', q: GQ, f: 'grip' },
      { t: 0.06, p: [0.12, -0.02, -0.42], q: [0.15, 0.2, 0.2], f: 'hold', e: 'o' },
      { t: 0.12, p: [0.12, -0.03, -0.38], q: [0.0, 0.2, 0.25], f: TF, e: 'i' },
      { t: 0.17, p: [0.12, -0.02, -0.43], q: [0.15, 0.2, 0.2], f: 'release', e: 'i' },
      { t: 0.3, p: [0.12, -0.03, -0.44], q: [0.2, 0.25, 0.1], f: 'flat', e: 'o' },
      { t: 0.75, p: 'grip', q: GQ, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.06, f: 0.01, p: -0.01 }, { t: 0.13, f: -0.025, p: 0.012, d: 0.01 }, { t: 0.2, f: 0.02, p: -0.012, d: 0.012 }, { t: 0.45, f: 0.008 }, { t: 0.75 }],
    jolt: [[0.12, 0.06], [0.18, 0.1]], snd: [[0, 'cl', 1.2], [0.28, 'cp', 0.8]] }));

  // 亡者の軍勢: the hands brought up from below, palms up and clawed as if under the earth, and lifted slowly and heavily up to the
  // chest, shaking with the weight - the dead raised; the body starts bowed low and rises with them
  M('u_legion', () => {
    const k = (d) => [
      { t: 0, p: [0.15, -0.42, -0.42], q: [0.0, 0.0, 3.0], f: 'clawOpen' },
      { t: 0.2 + d, p: [0.12, -0.17, -0.48], q: [0.15, 0.0, 3.05], f: 'claw', e: 'o' },
      { t: 0.32 + d, p: [0.12, -0.165, -0.48], e: 'o', s: 0.003 },
      { t: 1.0 + d, p: [0.14, 0.03, -0.44], q: [0.7, 0.05, 3.0], e: 's', s: 0.004 },
      { t: 1.12 + d, p: [0.145, 0.045, -0.44], q: [0.8, 0.05, 3.0], f: 'splay', e: 'o' },
      { t: 1.6, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.6, hit: 0.2, both: true, main: k(0), off: k(0.03),
      body: [{ t: 0, d: 0.07, p: -0.08 }, { t: 0.2, d: 0.085, p: -0.09 }, { t: 0.5, d: 0.07, p: -0.06, s: 0.0015 }, { t: 1.0, d: -0.01, p: 0.03, s: 0.0025 }, { t: 1.15, d: -0.015, p: 0.035 }, { t: 1.6 }],
      jolt: [[0.2, 0.08], [1.12, 0.1]], snd: [[0, 'cl', 1], [0.18, 'th', 0.25], [0.6, 'cl', 1.1], [1.08, 'sw', 0.22, 0.2]] };
  });

  // 大海嘯: crouched low, both hands come up from below in a scoop and drive out together, palms forward, as the wave rises before you
  // (0.18 s), and keep pushing it out, the whole body lunging after
  M('u_tsunami', () => {
    const k = (d) => [
      { t: 0, p: [0.22, -0.42, -0.3], q: [0.4, 0.1, -0.5], f: 'flat' },
      { t: 0.07 + d, p: [0.19, -0.21, -0.4], q: [1.0, 0.1, -0.4], e: 'o' },
      { t: 0.18 + d, p: [0.14, -0.05, -0.5], q: [1.58, -0.12, -0.2], f: 'splay', e: 'o' },
      { t: 0.5 + d, p: [0.15, -0.03, -0.56], e: 's', s: 0.002 },
      { t: 0.78, p: [0.17, -0.1, -0.5], q: [1.3, -0.05, -0.2], f: 'relax', e: 's' },
      { t: 1.1, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.1, hit: 0.18, both: true, main: k(0), off: k(0.015),
      body: [{ t: 0, d: 0.06, p: -0.035 }, { t: 0.08, d: 0.055, p: -0.02 }, { t: 0.2, d: 0.0, f: 0.075, p: 0.015 }, { t: 0.5, f: 0.085, p: 0.01 }, { t: 0.78, f: 0.03 }, { t: 1.1 }],
      jolt: [[0.18, 0.16]], snd: [[0, 'cl', 1.1], [0.04, 'sw', 0.42, 0.3], [0.5, 'cl', 0.8]] };
  });

  // 絶対零度: both hands thrown up over the head and brought down flat on the ground with all the weight of the body (the view drops
  // to it), and held pressed there, shaking, while the frost runs out
  M('u_cryo', () => {
    const k = (d) => [
      { t: 0, p: [0.17, 0.05, -0.3], q: [1.0, 0, 0.1], f: 'splay' },
      { t: 0.05 + d, p: [0.17, 0.13, -0.38], q: [1.3, 0, 0.1], e: 'o' },
      { t: 0.12 + d, p: [0.12, -0.16, -0.52], q: [-0.35, 0, 0.1], e: 'i' },
      { t: 0.17 + d, p: [0.12, -0.148, -0.515], e: 'o', s: 0.004 },
      { t: 0.4, p: [0.12, -0.15, -0.52], f: 'press', e: 's', s: 0.002 },
      { t: 0.85, p: [0.12, -0.151, -0.52], e: 'l', s: 0.002 },
      { t: 1.2, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.2, hit: 0.12, both: true, main: k(0), off: k(0.008),
      body: [{ t: 0 }, { t: 0.05, p: 0.02, d: -0.015 }, { t: 0.14, d: 0.12, p: -0.13, f: 0.035 }, { t: 0.4, d: 0.1, p: -0.11, f: 0.03 }, { t: 0.85, d: 0.095, p: -0.1, f: 0.028, s: 0.0012 }, { t: 1.2 }],
      jolt: [[0.12, 0.26]], snd: [[0, 'cl', 1.1], [0.03, 'sw', 0.3, 0.12], [0.12, 'th', 0.55], [0.5, 'cl', 1]] };
  });

  // 煉獄: the hands cupped together before the chest, palms up, the fingers curling over a fire held in them (shaking with its heat),
  // then flung down and out to both sides, the fire cast round you on the ground
  M('u_inferno', () => {
    const k = (d) => [
      { t: 0, p: IN, q: INQ, f: 'relax' },
      { t: 0.15 + d, p: [0.06, -0.15, -0.38], q: [0.3, 0, 3.0], f: 'clawOpen', e: 'o' },
      { t: 0.4, p: [0.055, -0.13, -0.37], f: 'claw', e: 's', s: 0.003 },
      { t: 0.52 + d, p: [0.25, -0.12, -0.5], q: [0.05, -0.5, 0.3], f: 'splay', e: 'o' },
      { t: 1.0, p: [0.26, -0.125, -0.495], e: 'l', s: 0.0015 },
      { t: 1.35, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.35, hit: 0.15, both: true, main: k(0), off: k(0.01),
      body: [{ t: 0 }, { t: 0.15, d: 0.02, p: -0.02 }, { t: 0.4, d: 0.035, p: -0.03, s: 0.002 }, { t: 0.54, d: 0.05, p: -0.05, f: 0.02 }, { t: 1.0, d: 0.04, p: -0.04 }, { t: 1.35 }],
      jolt: [[0.52, 0.14]], snd: [[0, 'cl', 1], [0.3, 'cl', 0.9], [0.45, 'sw', 0.35, 0.25]] };
  });

  // 影の舞: the left hand raised in a sign of two fingers before the face (the gun kept in the right), then drawn slowly down over the
  // eyes like a veil as the body sinks low into a crouch
  M('u_shadow', () => ({ dur: 1.05, hit: 0.1, both: false,
    main: [
      { t: 0, p: [0.17, -0.25, -0.3], q: [0.5, 0, -0.9], f: 'relax' },
      { t: 0.1, p: [0.03, -0.045, -0.31], q: [1.5, 0.1, -1.5], f: 'seal', e: 'o' },
      { t: 0.38, p: [0.03, -0.042, -0.315], e: 'l', s: 0.0008 },
      { t: 0.7, p: [0.05, -0.2, -0.29], q: [1.1, 0.2, -1.5], e: 's' },
      { t: 1.05, p: 'grip', q: GQ, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, d: 0.01, p: -0.01 }, { t: 0.38, d: 0.02, p: -0.015 }, { t: 0.7, d: 0.06, p: -0.02, r: 0.01 }, { t: 1.05 }],
    snd: [[0, 'cl', 0.8], [0.03, 'sw', 0.1, 0.12], [0.5, 'sw', 0.12, 0.3]] }));

  // 衛星砲: the left hand jabbed out with the first finger at the point the beam is to burn (the gun kept in the right), and held
  // there, the finger following it, steady and a little shaking, as the beam comes down
  M('u_orbital', () => ({ dur: 1.55, hit: 0.12, both: false,
    main: [
      { t: 0, p: [0.17, -0.25, -0.3], q: [0.5, 0, -0.9], f: 'relax' },
      { t: 0.07, p: [0.13, -0.1, -0.38], q: [0.3, 0.3, -1.3], f: 'point', e: 'o' },
      { t: 0.12, p: [0.08, -0.055, -0.52], q: [0.32, 0.35, -1.3], e: 'i' },
      { t: 0.18, p: [0.082, -0.057, -0.515], e: 'o', s: 0.0015 },
      { t: 0.7, p: [0.07, -0.06, -0.515], e: 's', s: 0.0012 },
      { t: 1.2, p: [0.085, -0.058, -0.515], e: 's', s: 0.0012 },
      { t: 1.55, p: 'grip', q: GQ, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.13, f: 0.04, p: -0.015, y: 0.01 }, { t: 0.7, f: 0.035, p: -0.012, y: 0.004 }, { t: 1.2, f: 0.035, p: -0.012 }, { t: 1.55 }],
    jolt: [[0.12, 0.07]], snd: [[0, 'cl', 0.9], [0.04, 'sw', 0.2, 0.1]] }));

  // 聖域: the palms pressed together before the chest, the head bowed over them; then the hands opened and lowered, palms down, and
  // spread out low over the ground, laying the sanctuary under you
  M('u_sanctuary', () => {
    const k = (d) => [
      { t: 0, p: IN, q: [1.0, 0.1, -1.2], f: 'relax' },
      { t: 0.14 + d, p: [0.036, -0.12, -0.35], q: [1.45, -0.09, -1.57], f: 'pray', e: 'o' },
      { t: 0.55, p: [0.035, -0.112, -0.36], e: 'l', s: 0.0008 },
      { t: 0.88 + d, p: [0.2, -0.165, -0.5], q: [-0.15, 0.25, 0.15], f: 'flat', e: 's' },
      { t: 1.2, p: [0.23, -0.17, -0.5], e: 'l', s: 0.0006 },
      { t: 1.55, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.55, hit: 0.14, both: true, main: k(0), off: k(0.006),
      body: [{ t: 0 }, { t: 0.14, d: 0.015, p: -0.03 }, { t: 0.55, d: 0.02, p: -0.045 }, { t: 0.88, d: 0.045, p: -0.075 }, { t: 1.2, d: 0.045, p: -0.075 }, { t: 1.55 }],
      jolt: [[0.88, 0.05]], snd: [[0, 'cl', 1], [0.14, 'cp', 0.6], [0.65, 'sw', 0.15, 0.3]] };
  });

  // 血の嵐: the clawed hands reach out by turns and tear back to the chest, one and then the other, drawing the blood in, and are
  // clenched together at the chest at the end, shaking
  M('u_bloodstorm', () => {
    const out = [0.12, -0.065, -0.52], qo = [1.3, -0.25, -0.7], inn = [0.15, -0.15, -0.34], qi = [1.0, 0.05, -1.2];
    return { dur: 1.35, hit: 0.15, both: true,
      main: [
        { t: 0, p: IN, q: INQ, f: 'relax' },
        { t: 0.15, p: out, q: qo, f: 'clawOpen', e: 'o' },
        { t: 0.33, p: inn, q: qi, f: 'claw', e: 'i' },
        { t: 0.52, p: out, q: qo, f: 'clawOpen', e: 'o' },
        { t: 0.72, p: [0.11, -0.13, -0.34], q: [0.6, 0.3, -0.3], f: TF, e: 'i' },
        { t: 0.8, p: [0.11, -0.13, -0.34], e: 'o', s: 0.004 },
        { t: 1.0, p: [0.115, -0.135, -0.34], e: 'l', s: 0.003 },
        { t: 1.35, p: 'rest', q: RQ, f: 'rest', e: 's' }],
      off: [
        { t: 0, p: IN, q: INQ, f: 'relax' },
        { t: 0.18, p: inn, q: qi, f: 'claw', e: 'o' },
        { t: 0.36, p: out, q: qo, f: 'clawOpen', e: 'o' },
        { t: 0.55, p: inn, q: qi, f: 'claw', e: 'i' },
        { t: 0.72, p: [0.11, -0.12, -0.35], q: [0.6, 0.3, -0.3], f: TF, e: 's' },
        { t: 0.8, p: [0.11, -0.12, -0.35], e: 'o', s: 0.004 },
        { t: 1.0, p: [0.115, -0.125, -0.35], e: 'l', s: 0.003 },
        { t: 1.35, p: 'rest', q: RQ, f: 'rest', e: 's' }],
      body: [{ t: 0 }, { t: 0.15, f: 0.03, y: 0.015 }, { t: 0.34, f: -0.01, y: -0.015 }, { t: 0.52, f: 0.03, y: 0.015 }, { t: 0.74, f: -0.02, d: 0.03, p: -0.02, s: 0.002 }, { t: 1.0, d: 0.03, p: -0.015, s: 0.003 }, { t: 1.35 }],
      jolt: [[0.33, 0.06], [0.55, 0.06], [0.74, 0.12]],
      snd: [[0, 'cl', 1], [0.1, 'sw', 0.2, 0.12], [0.32, 'cl', 1], [0.44, 'sw', 0.2, 0.12], [0.54, 'cl', 1.2], [0.72, 'cl', 1.5]] };
  });

  // 過充電: the two hands held close before the chest, facing each other, the fingers clawed and drawn in as the charge builds between
  // them (shaking harder and harder), then snapped open and flung down and out - the charge let go
  M('u_overcharge', () => {
    const k = (d) => [
      { t: 0, p: IN, q: INQ, f: 'relax' },
      { t: 0.12 + d, p: [0.1, -0.09, -0.42], q: [0.55, 0.2, -1.5], f: 'clawOpen', e: 'o' },
      { t: 0.35 + d, p: [0.09, -0.095, -0.4], q: [0.5, 0.25, -1.52], f: 'claw', e: 's', s: 0.002 },
      { t: 0.55, p: [0.085, -0.1, -0.38], e: 'l', s: 0.005 },
      { t: 0.63 + d, p: [0.3, -0.18, -0.44], q: [0.4, -0.3, -0.3], f: 'splay', e: 'o' },
      { t: 0.95, p: [0.31, -0.2, -0.42], f: 'relax', e: 's', s: 0.0015 },
      { t: 1.25, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.25, hit: 0.12, both: true, main: k(0), off: k(0.008),
      body: [{ t: 0 }, { t: 0.12, d: 0.01 }, { t: 0.55, d: 0.035, p: -0.02, s: 0.004 }, { t: 0.65, d: -0.01, p: 0.02, f: 0.025 }, { t: 0.95, f: 0.01 }, { t: 1.25 }],
      jolt: [[0.63, 0.16]], snd: [[0, 'cl', 1], [0.3, 'cl', 1.1], [0.58, 'sw', 0.3, 0.2]] };
  });

  // 巨人化: both fists swung up over the head and hammered down into the ground (the view thrown down with them), held there, then
  // the body rises with the fists drawn up before the chest, clenched and shaking with the new strength
  M('u_titan', () => {
    const k = (d) => [
      { t: 0, p: [0.2, 0.02, -0.25], q: [-0.6, 0.1, -1.3], f: TF },
      { t: 0.08 + d, p: [0.18, 0.15, -0.36], q: [-1.1, 0.1, -1.3], e: 'o' },
      { t: 0.16 + d, p: [0.1, -0.17, -0.5], q: [-0.25, 0.1, -1.35], e: 'i' },
      { t: 0.21 + d, p: [0.1, -0.158, -0.495], e: 'o', s: 0.004 },
      { t: 0.45, p: [0.1, -0.162, -0.5], e: 'l', s: 0.002 },
      { t: 0.8 + d, p: [0.15, -0.07, -0.38], q: FQ, e: 'o' },
      { t: 1.1, p: [0.155, -0.075, -0.375], e: 'l', s: 0.0035 },
      { t: 1.45, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.45, hit: 0.16, both: true, main: k(0), off: k(0.006),
      body: [{ t: 0 }, { t: 0.08, p: 0.03, d: -0.02 }, { t: 0.18, d: 0.13, p: -0.14, f: 0.04 }, { t: 0.45, d: 0.11, p: -0.12, f: 0.03 }, { t: 0.8, d: -0.02, p: 0.04 }, { t: 1.1, d: -0.02, p: 0.035, s: 0.002 }, { t: 1.45 }],
      jolt: [[0.16, 0.3], [0.8, 0.08]], snd: [[0, 'cl', 1.2], [0.05, 'sw', 0.3, 0.12], [0.16, 'th', 0.6], [0.7, 'cl', 1.3]] };
  });

  // 剣の嵐: the edge of one hand swept wide across the view, then the other's back the other way, and both arms laid out wide and flat
  // to the sides as the blades go round
  M('u_bladestorm', () => {
    const k = (d) => [
      { t: 0, p: [0.3, -0.3, -0.2], q: [0.15, 0.6, -1.5], f: 'blade' },
      { t: d * 0.6, p: [0.3, -0.3, -0.2], e: 's' },
      { t: d + 0.03, p: [0.32, -0.04, -0.28], q: [0.15, 0.6, -1.5], e: 'o' },
      { t: d + 0.06, p: [0.22, -0.05, -0.43], q: [0.12, 0.3, -1.52], e: 'i' },
      { t: d + 0.11, p: [0.0, -0.075, -0.48], q: [0.1, -0.15, -1.55], e: 'l' },
      { t: d + 0.2, p: [-0.24, -0.13, -0.36], q: [0.05, -0.75, -1.6], e: 'o' },
      { t: 0.62, p: [0.31, -0.12, -0.42], q: [0.05, -0.2, -0.1], f: 'flat', e: 's' },
      { t: 0.95, p: [0.32, -0.125, -0.415], e: 'l', s: 0.001 },
      { t: 1.25, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.25, hit: 0.11, both: true, main: k(0), off: k(0.2),
      body: [{ t: 0 }, { t: 0.13, y: 0.04, r: 0.02, f: 0.015 }, { t: 0.33, y: -0.04, r: -0.02, f: 0.015 }, { t: 0.62, f: 0.02, d: 0.015 }, { t: 0.95, d: 0.012 }, { t: 1.25 }],
      jolt: [[0.11, 0.08], [0.31, 0.08]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.16], [0.23, 'sw', 0.32, 0.16], [0.55, 'cl', 0.9]] };
  });

  // 断罪: the edge of the left hand raised high over the head like a headsman's blade (the gun kept in the right), held there shaking
  // while the sigils burn under the foes, lifted a last hair and chopped down as the blades of light come down (2.0 s)
  M('u_execution', () => ({ dur: 2.5, hit: 2.0, both: false,
    main: [
      { t: 0, p: [0.17, -0.25, -0.3], q: [0.5, 0, -0.9], f: 'relax' },
      { t: 0.22, p: [0.23, 0.09, -0.46], q: [1.7, 0, -1.57], f: 'blade', e: 'o' },
      { t: 1.0, p: [0.232, 0.095, -0.46], e: 'l', s: 0.0012 },
      { t: 1.82, p: [0.235, 0.125, -0.44], q: [1.95, 0, -1.57], e: 's', s: 0.002 },
      { t: 2.0, p: [0.02, -0.13, -0.5], q: [-0.25, 0, -1.57], e: 'i' },
      { t: 2.06, p: [0.022, -0.14, -0.49], e: 'o', s: 0.002 },
      { t: 2.5, p: 'grip', q: GQ, f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.22, p: 0.035, d: -0.008 }, { t: 1.0, p: 0.04, d: -0.01, s: 0.0005 }, { t: 1.84, p: 0.055, d: -0.015 }, { t: 2.03, p: -0.06, d: 0.045, f: 0.045 }, { t: 2.2, p: -0.05, d: 0.035, f: 0.03 }, { t: 2.5 }],
    jolt: [[2.0, 0.18]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.15, 0.16], [1.88, 'sw', 0.38, 0.14]] }));

  // (the armoury's rack: its places on the gun set once from where the hand held it, when there is a gun in that hand)
  const rackTick = (c) => {
    if (c._rack) return; c._rack = 1;
    if (!c.oneHand || !c.grip || c.melee) return;
    const ks = c.arms[0] && c.arms[0].ks; if (!ks) return;
    for (let i = 0; i < RACK.length; i++) { const k = ks[i + 1]; if (k) k.P.copy(c.grip).add(new THREE.Vector3(RACK[i][0], RACK[i][1], RACK[i][2])); }
  };

  CA.table({
    ult_bastion: { m: 'u_bastion' },          // 不屈の城塞: fist to palm, then a guard
    ult_meteor: { m: 'u_meteor' },            // 星落とし: the sky clawed and hauled down
    ult_bell: { m: 'u_bell' },                // 終焉の鐘: three blows of the clasped fists
    ult_godfall: { m: 'u_godfall' },          // 神降ろし: arms up to the light, taken in
    ult_timestop: { m: 'u_timestop' },        // 時止め: thrust out and clenched
    ult_berserk: { m: 'u_berserk' },          // 鬼神化: fists struck together, strained
    ult_blackhole: { m: 'u_blackhole' },      // 虚無の渦: space wrung between the hands
    ult_judgement: { m: 'u_judgement' },      // 天罰: up to the sky, down on the ground
    ult_phoenix: { m: 'u_phoenix' },          // 鳳凰転生: arms crossed, flung up like wings
    ult_armory: { m: 'u_armory', tick: rackTick },   // 無限兵装: the gun racked
    ult_legion: { m: 'u_legion' },            // 亡者の軍勢: the dead lifted from the ground
    ult_tsunami: { m: 'u_tsunami' },          // 大海嘯: scooped up low and pushed out
    ult_cryo: { m: 'u_cryo' },                // 絶対零度: both palms slammed down and held
    ult_inferno: { m: 'u_inferno' },          // 煉獄: fire cupped, cast down round you
    ult_shadow: { m: 'u_shadow' },            // 影の舞: a sign, drawn down over the eyes
    ult_orbital: { m: 'u_orbital' },          // 衛星砲: the target pointed and held
    ult_sanctuary: { m: 'u_sanctuary' },      // 聖域: a prayer, laid on the ground
    ult_bloodstorm: { m: 'u_bloodstorm' },    // 血の嵐: clawed in by turns
    ult_overcharge: { m: 'u_overcharge' },    // 過充電: a charge built and flung out
    ult_titan: { m: 'u_titan' },              // 巨人化: fists into the ground, rising
    ult_bladestorm: { m: 'u_bladestorm' },    // 剣の嵐: two sweeps, arms laid out
    ult_execution: { m: 'u_execution' },      // 断罪: the headsman's chop at 2.0 s
  });
})();
