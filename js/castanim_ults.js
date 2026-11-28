'use strict';
// Which first-person motion each ultimate casts with (castanim.js). The same form as js/castanim_skills.js. An ultimate's effect is
// never held back (no release): its motion plays from the moment it goes off.
//
// An ultimate is the high point of a fight, so each has a move of its own (made here with G.CastAnim.move, every name begun with
// 'u_'): larger, heavier and longer than a skill's, the body and the view going with it more. Each is a thing a man does with his
// arms when he puts his strength into something - a rope hauled, a sledge swung, a fist driven into a palm, both palms slammed on the
// ground - not a sign or a pose. The moments are put to ultimates.js: where its effect comes at once (a ring run out from you, a wave
// risen before you) the blow lands within the first 0.1-0.2 s, the arm coming in from below the view so there is no wind-up to wait
// for; where it comes later (the meteors fall from 1.0 s, the bell tolls at 0, 0.9 and 1.8 s, the blades of 断罪 come down at 2.0 s)
// the wind-up is held and the blow lands at that moment.
//
// Where the hands are kept: low in the view (the wrist some 0.45-0.55 m out, below the eye), the open hand leaning away so it takes no
// more than a quarter of the view's height, clear of the aim. A hand raised high goes up past the view's top corner, its arm coming in
// from the edge; the hands come in from below the view and go back down out of it (or to the gun).
(function () {
  const CA = G.CastAnim; if (!CA || !CA.move) return;
  const RQ = [-0.4, 0.1, 0.5];
  // where the hands start from: down by the body, below the view
  const LOW = [0.2, -0.38, -0.27], LOWQ = [0.6, 0.05, -0.6];
  // a fist held up before the body with its back and knuckles to the eye (castanim.js CA.FIST_Q)
  const FQ = CA.FIST_Q || [1.3, 0.3, -0.2];
  // the turns of the hand used here (written for the right hand, the view's space)
  const Q = {
    // the palm out ahead, the fingers up and leaning away (a hand held up to stop something)
    stop: [0.88, 0.15, 0.12],
    // the palm turned in, the fingers up and leaning away (a palm that takes a blow, a prayer)
    edge: [0.64, 0, -1.57],
    // a fist with its knuckles to the middle, its palm down (its back to the eye)
    knuckInDn: [0.0, 1.37, -0.1],
    // a fist down by the hip, the knuckles ahead and down
    lowFist: [-0.29, 0, -0.74],
    // a fist round an upright handle (a rope, a lever): the thumb up, the forearm rising ahead
    hammer: [0.4, 0, -1.57],
    // the same with the forearm raised high
    hammerUp: [1.5, 0, -1.57],
    // the same with the forearm sloping down ahead (a haft swung down)
    hammerDn: [-0.29, 0, -1.57],
    // an arm raised up and out, the palm open to what is above and ahead
    praise: [1.35, -0.31, -0.54],
    // the palm down, the fingers ahead and out (spread over the ground)
    downOut: [-0.2, -0.37, -0.07],
    // the palm up, the fingers ahead
    palmUp: [0.29, -0.1, -3.13],
    // the palm ahead and a little down, the fingers up: reaching to take hold of something
    grab: [0.93, 0, 0],
    // a fist drawn back to the ribs, its palm up and in
    pullIn: [0.2, 0.29, -2.35],
  };
  const M = CA.move;
  // a key list made of the same places for both hands (main: the left one, off: the right), d: the second hand's lag
  const both = (fn, d) => ({ main: fn(0, 1), off: fn(d || 0, -1) });

  // 不屈の城塞: the left fist cocked and driven into the open right palm before the chest (a pledge, the blow taken and held), then
  // both fists pulled apart and down to the hips, the elbows out, the body set low and square behind them
  M('u_bastion', () => ({ dur: 1.4, hit: 0.13, both: true,
    main: [
      { t: 0, p: LOW, q: [0.3, 0.6, -0.9], f: 'fist' },
      { t: 0.07, p: [0.2, -0.13, -0.38], q: [0.0, 1.0, -0.1], e: 'o', el: [0.36, -0.2, -0.2] },
      { t: 0.13, p: [0.085, -0.185, -0.45], q: Q.knuckInDn, e: 'i', on: true },
      { t: 0.19, p: [0.082, -0.183, -0.449], e: 'b', s: 0.003 },
      { t: 0.45, p: [0.083, -0.183, -0.449], e: 'l', s: 0.0018 },
      { t: 0.68, p: [0.2, -0.165, -0.46], q: Q.lowFist, e: 'o' },
      { t: 1.05, p: [0.202, -0.167, -0.461], e: 'l', s: 0.0016 },
      { t: 1.4, p: 'rest', q: RQ, f: 'rest', e: 's' }],
    off: [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      { t: 0.09, p: [0.045, -0.215, -0.43], q: [0.17, 0.53, -1.65], f: 'relax', e: 'o' },
      { t: 0.13, p: [0.05, -0.213, -0.435], f: 'hold', e: 'i', on: true },
      { t: 0.18, p: [0.055, -0.212, -0.435], e: 'b', s: 0.002 },
      { t: 0.45, p: [0.052, -0.211, -0.435], e: 'l', s: 0.0015 },
      { t: 0.7, p: [0.2, -0.165, -0.46], q: Q.lowFist, f: 'fist', e: 'o' },
      { t: 1.05, p: [0.202, -0.167, -0.461], e: 'l', s: 0.0016 },
      { t: 1.4, p: 'rest', q: RQ, f: 'rest', e: 's' }],
    body: [{ t: 0 }, { t: 0.07, p: 0.006, f: -0.012, y: 0.01 }, { t: 0.15, d: 0.025, p: -0.02, f: 0.025, y: -0.006 }, { t: 0.45, d: 0.025, p: -0.018, f: 0.02 },
      { t: 0.72, d: 0.06, p: -0.012, s: 0.0008 }, { t: 1.05, d: 0.055, p: -0.01, s: 0.0006 }, { t: 1.4 }],
    jolt: [[0.13, 0.14], [0.7, 0.08]], snd: [[0, 'cl', 1.2], [0.05, 'sw', 0.22, 0.14], [0.13, 'cp', 1.3], [0.56, 'cl', 1.1], [0.62, 'sw', 0.16, 0.16]] }));

  // 星落とし: both arms reached up and out past the top corners of the view, the head lifted after them, the hands closing on the sky
  // up there and holding it a beat, shaking with the strain - then hauled down hard to the hips with the whole weight of the body as
  // the first rock comes down
  M('u_meteor', () => {
    const k = (d) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      { t: 0.11 + d, p: [0.36, -0.04, -0.1], q: [0.2, 0, 0.3], f: 'splay', e: 'i', el: [0.4, -0.13, 0.07] },
      { t: 0.22 + d, p: [0.27, 0.125, -0.32], q: [-0.6, 0, -0.6], f: 'clawOpen', e: 'o' },
      { t: 0.38 + d, p: [0.272, 0.13, -0.318], e: 's', s: 0.001 },
      { t: 0.5 + d, p: [0.27, 0.128, -0.32], q: [0.3, 0, 0.5], f: 'fist', e: 'i', on: true },
      { t: 0.72, p: [0.272, 0.134, -0.318], e: 's', s: 0.003 },
      { t: 0.88, p: [0.26, 0.03, -0.4], q: FQ, e: 'i' },
      { t: 0.95, p: [0.2, -0.17, -0.45], q: Q.lowFist, e: 'l', on: true },
      { t: 1.02, p: [0.2, -0.175, -0.448], e: 'b', s: 0.003 },
      { t: 1.2, p: [0.202, -0.177, -0.447], e: 'l', s: 0.0015 },
      { t: 1.5, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.5, hit: 0.95, both: true, main: k(0), off: k(0.02),
      body: [{ t: 0 }, { t: 0.3, p: 0.075, d: -0.015 }, { t: 0.72, p: 0.085, d: -0.02, s: 0.0008 }, { t: 0.97, p: -0.09, d: 0.065, f: 0.04 },
        { t: 1.15, p: -0.07, d: 0.055, f: 0.03 }, { t: 1.5 }],
      jolt: [[0.5, 0.05], [0.95, 0.2]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.2, 0.2], [0.48, 'cl', 1.4], [0.8, 'sw', 0.42, 0.22]] };
  });

  // 終焉の鐘: the left hand reaches up and takes the bell's rope above (the gun kept in the right) and hauls it down hard, once for each
  // toll (0, 0.9, 1.8 s); between the tolls the hand goes up with the rope as the bell swings back, the elbow out and the forearm coming
  // in from the edge of the view; let go after the last
  M('u_bell', () => {
    const T = [0.3, 0.2, -0.26], B = [0.19, -0.12, -0.44], EL = [0.42, -0.02, -0.18];
    const nb = (dy) => [B[0], B[1] + dy, B[2]];
    const main = [{ t: 0, p: T, q: Q.hammerUp, f: 'fist', el: EL }];
    for (const [t0, t1] of [[0.09, 0.66], [0.9, 1.56]]) {
      main.push({ t: t0, p: B, q: Q.hammer, e: 'i', on: true }, { t: t0 + 0.07, p: nb(-0.008), e: 'b', s: 0.002 }, { t: t0 + 0.26, p: nb(0.012), e: 's' },
        { t: t1, p: T, q: Q.hammerUp, e: 's', el: EL });
    }
    main.push({ t: 1.8, p: B, q: Q.hammer, e: 'i', on: true }, { t: 1.88, p: nb(-0.01), e: 'b', s: 0.0025 }, { t: 2.08, p: nb(-0.006), f: 'relax', e: 'l', s: 0.0012 },
      { t: 2.45, p: 'grip', f: 'grip', e: 's' });
    const body = [{ t: 0, p: 0.03, d: -0.01 }];
    for (const [t0, t1] of [[0.09, 0.66], [0.9, 1.56]]) body.push({ t: t0 + 0.03, p: -0.03, d: 0.025, f: 0.012 }, { t: t1, p: 0.03, d: -0.01 });
    body.push({ t: 1.83, p: -0.035, d: 0.03, f: 0.014 }, { t: 2.1, d: 0.01 }, { t: 2.45 });
    return { dur: 2.45, hit: 0.09, both: false, main, body,
      jolt: [[0.09, 0.12], [0.9, 0.12], [1.8, 0.16]],
      snd: [[0, 'cl', 1.2], [0.02, 'sw', 0.2, 0.1], [0.5, 'cl', 0.8], [0.8, 'sw', 0.22, 0.12], [1.4, 'cl', 0.8], [1.7, 'sw', 0.26, 0.12]] };
  });

  // 神降ろし: both arms opened out low at the sides, the palms turned up to the light coming down as if into rain, the head raised to it;
  // then the hands drawn in before the chest, the fingers closing, and clenched into fists with the arms shaking - the strength taken in
  M('u_godfall', () => {
    const k = (d) => [
      { t: 0, p: [0.24, -0.34, -0.3], q: [-0.4, -0.3, 3.0], f: 'relax' },
      { t: 0.24 + d, p: [0.27, -0.13, -0.42], q: [-0.2, -0.46, 3.05], f: 'release', e: 'o' },
      { t: 0.32 + d, p: [0.272, -0.126, -0.42], e: 'b' },
      { t: 0.75, p: [0.285, -0.12, -0.44], q: [-0.1, -0.5, 3.0], e: 's', s: 0.001 },
      { t: 1.0 + d, p: [0.2, -0.14, -0.47], q: [-0.2, -0.3, 3.05], f: 'fist', e: 's' },
      { t: 1.2 + d, p: [0.165, -0.1, -0.42], q: FQ, f: 'fist', e: 'i' },
      { t: 1.26 + d, p: [0.165, -0.104, -0.418], e: 'b', s: 0.003 },
      { t: 1.45, p: [0.167, -0.106, -0.418], e: 'l', s: 0.002 },
      { t: 1.8, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.8, hit: 0.24, both: true, main: k(0), off: k(0.015),
      body: [{ t: 0 }, { t: 0.28, p: 0.09, d: -0.02 }, { t: 0.75, p: 0.1, d: -0.025 }, { t: 1.1, p: 0.0, d: 0.02, f: 0.015 }, { t: 1.24, d: 0.035, p: -0.025, s: 0.002 },
        { t: 1.45, d: 0.03, p: -0.02, s: 0.001 }, { t: 1.8 }],
      jolt: [[1.2, 0.12]], snd: [[0, 'cl', 1.1], [0.05, 'sw', 0.14, 0.25], [0.8, 'cl', 0.8], [1.15, 'cl', 1.4]] };
  });

  // 時止め: the left hand thrust out open at the world, the palm to it, as if to stop it (the gun kept in the right); held a beat, then
  // the fingers closed slowly into a fist, the wrist turning in as it shuts - and held there, still, as time stops
  M('u_timestop', () => ({ dur: 1.35, hit: 0.1, both: false,
    main: [
      { t: 0, p: [0.17, -0.34, -0.3], q: [0.9, 0.05, -0.5], f: 'relax' },
      { t: 0.1, p: [0.145, -0.16, -0.53], q: Q.stop, f: 'splay', e: 'o', on: true },
      { t: 0.17, p: [0.147, -0.162, -0.525], e: 'b', s: 0.001 },
      { t: 0.32, p: [0.147, -0.163, -0.523], f: 'clawOpen', e: 's' },
      { t: 0.42, p: [0.145, -0.17, -0.5], q: [0.5, 0.15, -0.35], f: 'fist', e: 'i' },
      { t: 0.49, p: [0.145, -0.172, -0.498], e: 'b', s: 0.0025 },
      { t: 1.0, p: [0.145, -0.173, -0.497], e: 'l', s: 0.0003 },
      { t: 1.35, p: 'grip', f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, f: 0.05, p: -0.01 }, { t: 0.34, f: 0.045, p: -0.008 }, { t: 0.44, f: 0.05, d: 0.012, p: -0.014 }, { t: 1.0, f: 0.045, d: 0.01, p: -0.012 }, { t: 1.35 }],
    jolt: [[0.1, 0.06], [0.42, 0.12]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.25, 0.14], [0.4, 'cl', 1.6]] }));

  // 鬼神化: both fists jerked up before the chest, the forearms upright and the elbows down and in, clenched so hard the arms shake (a man
  // roaring with every muscle set), the body hunched and shaking harder and harder; at last the fists flung down and out as the roar breaks
  M('u_berserk', () => {
    const k = (d) => [
      { t: 0, p: LOW, q: [0.3, 0.4, -0.9], f: 'fist' },
      { t: 0.12 + d, p: [0.17, -0.11, -0.41], q: FQ, e: 'o', el: [0.25, -0.36, -0.2] },
      { t: 0.18 + d, p: [0.168, -0.114, -0.408], e: 'b', s: 0.003 },
      { t: 0.5, p: [0.16, -0.12, -0.4], q: [1.25, 0.4, -0.25], e: 's', s: 0.004 },
      { t: 0.85, p: [0.155, -0.125, -0.395], e: 'l', s: 0.0065, el: [0.24, -0.37, -0.18] },
      { t: 1.0, p: [0.22, -0.2, -0.5], q: Q.lowFist, e: 'o' },
      { t: 1.4, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.4, hit: 0.12, both: true, main: k(0), off: k(0.005),
      body: [{ t: 0 }, { t: 0.12, d: 0.02, p: -0.01, f: 0.02 }, { t: 0.32, d: 0.06, p: -0.04, s: 0.002 }, { t: 0.85, d: 0.07, p: -0.05, s: 0.005 }, { t: 1.0, d: 0.02, p: -0.02, f: 0.05 }, { t: 1.4 }],
      jolt: [[0.12, 0.13], [1.0, 0.15]], snd: [[0, 'cl', 1.1], [0.12, 'cl', 1.4], [0.3, 'cl', 1.2], [0.95, 'sw', 0.3, 0.2]] };
  });

  // 虚無の渦: both hands reach out and take hold of the air before the chest as if of a cloth, side by side, the elbows out, and wring it
  // - the left rolled over and down, the right up and back - harder and harder, a last hard twist, then let go and drawn back apart
  M('u_blackhole', () => {
    const EL = [0.25, -0.2, -0.26];
    const k = (d, w) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      { t: 0.14 + d, p: [0.075, -0.15, -0.46], q: [-0.12, 0.64, 0.07], f: 'clawOpen', e: 'o', el: EL },
      { t: 0.26 + d, p: [0.073, -0.152, -0.458], f: 'fist', e: 's', el: EL },
      { t: 0.6, p: [0.07, -0.155, -0.455], q: w > 0 ? [-0.5, 0.58, 0.0] : [0.35, 0.58, 0.03], e: 's', s: 0.002, el: EL },
      { t: 0.7, p: [0.068, -0.158, -0.45], q: w > 0 ? [-0.79, 0.53, -0.07] : [0.54, 0.52, 0.0], e: 'i', el: EL },
      { t: 0.78, e: 'b', s: 0.004, el: EL },
      { t: 1.0, p: [0.17, -0.2, -0.42], q: [0.2, 0, -0.3], f: 'relax', e: 'o' },
      { t: 1.45, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return Object.assign(both(k, 0.012), { dur: 1.45, hit: 0.14, both: true,
      body: [{ t: 0 }, { t: 0.14, f: 0.03 }, { t: 0.62, f: 0.035, r: -0.02, d: 0.015, s: 0.002 }, { t: 0.72, f: 0.03, r: -0.025, d: 0.028, p: -0.02 }, { t: 1.0, f: -0.01, r: 0 }, { t: 1.45 }],
      jolt: [[0.7, 0.14]], snd: [[0, 'cl', 1], [0.06, 'sw', 0.2, 0.14], [0.35, 'cl', 1.2], [0.68, 'cl', 1.6], [0.95, 'sw', 0.22, 0.18]] });
  });

  // 天罰: the left hand brought up by the shoulder, flat, and chopped straight down at once (the gun kept in the right), the edge of the
  // hand leading, to point at the ground ahead as the storm strikes - the signal given; held there, then let down
  M('u_judgement', () => ({ dur: 1.25, hit: 0.1, both: false,
    main: [
      { t: 0, p: [0.17, -0.34, -0.3], q: [0.3, 0, -1.4], f: 'blade' },
      { t: 0.05, p: [0.23, -0.07, -0.45], q: [0.45, 0, -1.57], f: 'blade', e: 'o' },
      { t: 0.1, p: [0.12, -0.17, -0.55], q: [-0.34, 0, -1.57], e: 'i', on: true },
      { t: 0.16, p: [0.12, -0.176, -0.545], e: 'b', s: 0.002 },
      { t: 0.5, p: [0.121, -0.172, -0.547], e: 'l', s: 0.0012 },
      { t: 0.85, p: [0.14, -0.2, -0.5], q: [-0.2, 0, -1.4], f: 'relax', e: 's', s: 0.0006 },
      { t: 1.25, p: 'grip', f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.05, p: 0.02, d: -0.01 }, { t: 0.12, p: -0.045, d: 0.03, f: 0.04 }, { t: 0.5, p: -0.04, d: 0.028, f: 0.035 }, { t: 0.9, p: -0.015, d: 0.01, f: 0.01 }, { t: 1.25 }],
    jolt: [[0.1, 0.14]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.32, 0.12], [0.6, 'cl', 0.8]] }));

  // 鳳凰転生: the forearms crossed tight before the chest, fists clenched, the body hunched over them and shaking; then flung up and out
  // wide like wings, the hands thrown open, the body rising and the head going back
  M('u_phoenix', () => {
    const k = (d, z) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      { t: 0.18 + d, p: [-0.07, -0.16, z], q: [1.57, 0.67, 0.23], f: 'fist', e: 'o' },
      { t: 0.46, p: [-0.065, -0.17, z + 0.015], q: [1.6, 0.72, 0.2], e: 'l', s: 0.003 },
      { t: 0.56 + d, p: [0.2, -0.07, -0.44], q: [1.11, -0.34, 0.03], f: 'splay', e: 'i' },
      { t: 0.62 + d, p: [0.31, -0.06, -0.47], q: [0.79, -0.47, -0.04], e: 'o', on: true },
      { t: 0.7 + d, e: 'b' },
      { t: 1.1, p: [0.315, -0.075, -0.465], f: 'release', e: 'l', s: 0.001 },
      { t: 1.55, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.55, hit: 0.62, both: true, main: k(0, -0.4), off: k(0.01, -0.43),
      body: [{ t: 0 }, { t: 0.18, d: 0.03, p: -0.03 }, { t: 0.46, d: 0.045, p: -0.04, s: 0.002 }, { t: 0.64, d: -0.03, p: 0.07, f: -0.01 }, { t: 1.1, d: -0.02, p: 0.05 }, { t: 1.55 }],
      jolt: [[0.62, 0.13]], snd: [[0, 'cl', 1], [0.16, 'cl', 1.1], [0.5, 'sw', 0.35, 0.3]] };
  });

  // 無限兵装: the left hand leaves the fore-end, slides back along the left side of the gun's receiver, hooks its handle and racks it
  // hard back and home (the ultimate's own bolt sounds come at 0 and 0.15 s), slaps it, and goes back to the fore-end - every place set from the
  // gun in hand (castanim.js 'gun', found from each gun's own model). With no gun in that hand (a hand weapon, the gun lowered), a fist
  // raised and clenched hard instead
  M('u_armory', () => {
    // (the hand's turn on the side of the receiver: the palm to the gun, the fingers ahead and hooked round the handle; flat on it to slap)
    const QG = [0.1, 0, -1.28], QG2 = [-0.1, 0, -0.1];
    if (!CA.gunNow()) return { dur: 0.75, hit: 0.12, both: false,
      main: [
        { t: 0, p: [0.17, -0.34, -0.3], q: [0.9, 0.05, -0.5], f: 'relax' },
        { t: 0.12, p: [0.15, -0.14, -0.44], q: FQ, f: 'fist', e: 'o', on: true },
        { t: 0.2, p: [0.15, -0.13, -0.445], e: 'b', s: 0.003 },
        { t: 0.34, p: [0.152, -0.145, -0.44], e: 'q', s: 0.002 },
        { t: 0.75, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.12, p: 0.02, d: -0.008, s: 0.0015 }, { t: 0.4, p: 0.012 }, { t: 0.75 }],
      jolt: [[0.12, 0.08]], snd: [[0, 'cl', 1.2], [0.1, 'sw', 0.18, 0.12]] };
    return { dur: 0.75, hit: 0.1, both: false,
      main: [
        { t: 0, p: 'grip', f: 'grip' },
        { t: 0.06, p: ['gun', 0.09, -0.07, -0.03], q: QG, f: 'relax', e: 'o', el: [0.22, -0.42, -0.1] },
        { t: 0.1, p: ['gun', 0.085, -0.075, 0.0], q: QG, f: 'hold', e: 'i', el: [0.22, -0.42, -0.1], on: true },
        { t: 0.145, p: ['gun', 0.09, -0.08, 0.025], f: 'hold', e: 'o' },
        { t: 0.19, p: ['gun', 0.085, -0.075, -0.005], f: 'relax', e: 'i' },
        { t: 0.25, p: ['gun', 0.02, 0.035, -0.08], q: QG2, f: 'flat', e: 'o' },
        { t: 0.3, p: ['gun', 0.01, 0.01, -0.075], e: 'i' },
        { t: 0.75, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, f: 0.01, p: -0.012 }, { t: 0.145, f: -0.025, p: 0.012, d: 0.01 }, { t: 0.2, f: 0.02, p: -0.014, d: 0.012 }, { t: 0.3, d: 0.01 }, { t: 0.5, f: 0.006 }, { t: 0.75 }],
      jolt: [[0.145, 0.06], [0.19, 0.1], [0.3, 0.04]], snd: [[0, 'cl', 1.2], [0.3, 'cp', 0.8]] };
  });

  // 亡者の軍勢: down on one knee, both hands reached to the ground ahead and the fingers dug into it; turned over under the earth and
  // lifted, palms up, slowly and heavily up before the chest, shaking with the weight, and at the last flung open - the dead raised. The
  // body starts bowed low and rises with them
  M('u_legion', () => {
    const k = (d) => [
      { t: 0, p: [0.2, -0.38, -0.3], q: [0.3, 0, -0.3], f: 'relax' },
      { t: 0.2 + d, p: [0.14, -0.2, -0.5], q: [-0.29, 0, 0], f: 'claw', e: 'i', on: true },
      { t: 0.27 + d, p: [0.141, -0.205, -0.498], e: 'b', s: 0.002 },
      { t: 0.5, p: [0.14, -0.205, -0.495], q: [0.0, 0, -1.8], f: 'hold', e: 's', s: 0.002 },
      { t: 1.0 + d, p: [0.16, -0.1, -0.46], q: Q.palmUp, e: 's', s: 0.004 },
      { t: 1.12 + d, p: [0.165, -0.08, -0.46], q: [0.5, -0.1, -3.1], f: 'splay', e: 'o' },
      { t: 1.25, p: [0.166, -0.078, -0.46], e: 'l' },
      { t: 1.6, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.6, hit: 0.2, both: true, main: k(0), off: k(0.03),
      body: [{ t: 0, d: 0.07, p: -0.08 }, { t: 0.2, d: 0.085, p: -0.09 }, { t: 0.5, d: 0.07, p: -0.06, s: 0.0015 }, { t: 1.0, d: -0.01, p: 0.03, s: 0.0025 }, { t: 1.15, d: -0.015, p: 0.035 }, { t: 1.6 }],
      jolt: [[0.2, 0.08], [1.12, 0.1]], snd: [[0, 'cl', 1], [0.18, 'th', 0.25], [0.6, 'cl', 1.1], [1.08, 'sw', 0.22, 0.2]] };
  });

  // 大海嘯: crouched low, both hands scooped up from beside the knees and driven out together, palms ahead and the arms near straight, as
  // the wave rises before you (0.18 s); held pushing it out, the whole body lunging after, then let down
  M('u_tsunami', () => {
    const k = (d) => [
      { t: 0, p: [0.24, -0.44, -0.28], q: [-1.01, 0, -3.14], f: 'flat' },
      { t: 0.08 + d, p: [0.2, -0.27, -0.42], q: [0.1, 0, -3.14], e: 'o' },
      { t: 0.18 + d, p: [0.15, -0.12, -0.56], q: Q.grab, f: 'splay', e: 'o', on: true },
      { t: 0.26 + d, p: [0.152, -0.122, -0.555], e: 'b', s: 0.002 },
      { t: 0.5, p: [0.155, -0.115, -0.57], e: 's', s: 0.002 },
      { t: 0.78, p: [0.18, -0.2, -0.5], q: [0.6, 0, -0.4], f: 'relax', e: 's' },
      { t: 1.1, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.1, hit: 0.18, both: true, main: k(0), off: k(0.015),
      body: [{ t: 0, d: 0.06, p: -0.035 }, { t: 0.08, d: 0.055, p: -0.02 }, { t: 0.2, d: 0.0, f: 0.075, p: 0.015 }, { t: 0.5, f: 0.085, p: 0.01 }, { t: 0.78, f: 0.03 }, { t: 1.1 }],
      jolt: [[0.18, 0.16]], snd: [[0, 'cl', 1.1], [0.04, 'sw', 0.42, 0.3], [0.5, 'cl', 0.8]] };
  });

  // 絶対零度: both hands up by the head, brought down flat on the ground ahead with all the weight of the body (the view drops to it),
  // the wrists bent back under it, and held pressed there, shaking, while the frost runs out
  M('u_cryo', () => {
    const k = (d) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      { t: 0.05 + d, p: [0.2, -0.07, -0.4], q: [0.1, 0, 0.1], f: 'splay', e: 'o' },
      { t: 0.12 + d, p: [0.14, -0.19, -0.5], q: [-0.2, 0.05, 0.05], f: 'press', e: 'i', on: true },
      { t: 0.18 + d, p: [0.14, -0.186, -0.498], e: 'b', s: 0.004 },
      { t: 0.4, p: [0.14, -0.188, -0.5], e: 's', s: 0.002 },
      { t: 0.85, p: [0.14, -0.189, -0.5], e: 'l', s: 0.002 },
      { t: 1.2, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.2, hit: 0.12, both: true, main: k(0), off: k(0.008),
      body: [{ t: 0 }, { t: 0.05, p: 0.02, d: -0.015 }, { t: 0.14, d: 0.12, p: -0.13, f: 0.035 }, { t: 0.4, d: 0.1, p: -0.11, f: 0.03 }, { t: 0.85, d: 0.095, p: -0.1, f: 0.028, s: 0.0012 }, { t: 1.2 }],
      jolt: [[0.12, 0.26]], snd: [[0, 'cl', 1.1], [0.03, 'sw', 0.3, 0.12], [0.12, 'th', 0.55], [0.5, 'cl', 1]] };
  });

  // 煉獄: the right fist held low before the body as a flint, the left struck down hard across its knuckles - twice, a spark each time -
  // then both hands flung open down and out to the sides, the fire cast round you on the ground
  M('u_inferno', () => {
    const QS = [0.0, 0.29, -0.45], OUT = [0.26, -0.17, -0.48];
    return { dur: 1.35, hit: 0.15, both: true,
      main: [
        { t: 0, p: LOW, q: LOWQ, f: 'fist' },
        { t: 0.08, p: [0.07, -0.06, -0.42], q: QS, e: 'o' },
        { t: 0.15, p: [0.025, -0.165, -0.45], e: 'i' },
        { t: 0.2, p: [0.03, -0.175, -0.452], e: 'o' },
        { t: 0.27, p: [0.075, -0.06, -0.42], e: 'q' },
        { t: 0.34, p: [0.025, -0.165, -0.45], e: 'i' },
        { t: 0.4, p: [0.03, -0.175, -0.452], e: 'o', s: 0.002 },
        { t: 0.54, p: OUT, q: Q.downOut, f: 'splay', e: 'o' },
        { t: 1.0, p: [0.27, -0.18, -0.475], f: 'release', e: 'l', s: 0.0012 },
        { t: 1.35, p: 'rest', q: RQ, f: 'rest', e: 's' }],
      off: [
        { t: 0, p: LOW, q: LOWQ, f: 'fist' },
        { t: 0.08, p: [-0.04, -0.155, -0.41], q: QS, e: 'o' },
        { t: 0.16, p: [-0.042, -0.163, -0.41], e: 'b', s: 0.002 },
        { t: 0.34, p: [-0.04, -0.156, -0.41], e: 's' },
        { t: 0.37, p: [-0.042, -0.164, -0.41], e: 'b', s: 0.002 },
        { t: 0.56, p: OUT, q: Q.downOut, f: 'splay', e: 'o' },
        { t: 1.0, p: [0.27, -0.18, -0.475], f: 'release', e: 'l', s: 0.0012 },
        { t: 1.35, p: 'rest', q: RQ, f: 'rest', e: 's' }],
      body: [{ t: 0 }, { t: 0.15, d: 0.02, p: -0.02 }, { t: 0.34, d: 0.03, p: -0.028 }, { t: 0.56, d: 0.05, p: -0.05, f: 0.02 }, { t: 1.0, d: 0.04, p: -0.04 }, { t: 1.35 }],
      jolt: [[0.15, 0.06], [0.34, 0.07], [0.54, 0.14]], snd: [[0, 'cl', 1], [0.15, 'cp', 0.9], [0.34, 'cp', 1], [0.45, 'sw', 0.35, 0.25]] };
  });

  // 影の舞: the left hand held out flat, palm down, and pressed down twice - the signal to get down and keep low (the gun kept in the
  // right) - as the body sinks into a crouch
  M('u_shadow', () => ({ dur: 1.05, hit: 0.1, both: false,
    main: [
      { t: 0, p: [0.17, -0.34, -0.3], q: [0.6, 0.05, -0.5], f: 'relax' },
      { t: 0.1, p: [0.17, -0.15, -0.48], q: [0.15, 0, 0.1], f: 'flat', e: 'o', on: true },
      { t: 0.2, p: [0.17, -0.19, -0.47], q: [-0.05, 0, 0.1], e: 'o' },
      { t: 0.3, p: [0.17, -0.165, -0.48], q: [0.12, 0, 0.1], e: 's' },
      { t: 0.42, p: [0.17, -0.21, -0.46], q: [-0.08, 0, 0.1], e: 'o' },
      { t: 0.7, p: [0.18, -0.25, -0.44], f: 'relax', e: 's' },
      { t: 1.05, p: 'grip', f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.1, d: 0.01, p: -0.01 }, { t: 0.22, d: 0.03, p: -0.015 }, { t: 0.45, d: 0.06, p: -0.02 }, { t: 0.75, d: 0.06, p: -0.015 }, { t: 1.05 }],
    snd: [[0, 'cl', 0.8], [0.03, 'sw', 0.1, 0.12], [0.36, 'sw', 0.08, 0.14]] }));

  // 衛星砲: the left arm thrust out and the first finger levelled at the point the beam is to burn, beside the aim, not over it (the gun
  // kept in the right), and held there, following it, steady and a little shaking, as the beam comes down
  M('u_orbital', () => ({ dur: 1.55, hit: 0.12, both: false,
    main: [
      { t: 0, p: [0.17, -0.34, -0.3], q: [0.6, 0.05, -0.6], f: 'fist' },
      { t: 0.07, p: [0.15, -0.2, -0.4], q: [0.3, 0.1, -0.65], f: 'point', e: 'o' },
      { t: 0.12, p: [0.1, -0.11, -0.53], q: [0.12, 0.06, -0.65], e: 'i', on: true },
      { t: 0.18, p: [0.101, -0.112, -0.527], e: 'b', s: 0.0012 },
      { t: 0.7, p: [0.095, -0.11, -0.53], q: [0.14, 0.1, -0.65], e: 's', s: 0.001 },
      { t: 1.2, p: [0.103, -0.112, -0.528], q: [0.11, 0.04, -0.65], e: 's', s: 0.001 },
      { t: 1.55, p: 'grip', f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.13, f: 0.04, p: -0.015, y: 0.01 }, { t: 0.7, f: 0.035, p: -0.012, y: 0.004 }, { t: 1.2, f: 0.035, p: -0.012 }, { t: 1.55 }],
    jolt: [[0.12, 0.07]], snd: [[0, 'cl', 0.9], [0.04, 'sw', 0.2, 0.1]] }));

  // 聖域: the palms pressed together before the chest, the head bowed over them; then the hands parted, turned palm down and spread out
  // low over the ground, laying the sanctuary under you
  M('u_sanctuary', () => {
    const k = (d) => [
      { t: 0, p: LOW, q: [0.9, 0.1, -1.2], f: 'relax' },
      { t: 0.14 + d, p: [0.028, -0.195, -0.52], q: [0.75, 0, -1.57], f: 'pray', e: 'o' },
      { t: 0.2 + d, p: [0.028, -0.193, -0.522], e: 'b' },
      { t: 0.55, p: [0.028, -0.19, -0.525], e: 'l', s: 0.0006 },
      { t: 0.75 + d, p: [0.1, -0.17, -0.5], q: [-0.1, -0.2, -0.4], f: 'flat', e: 's' },
      { t: 1.0 + d, p: [0.22, -0.175, -0.5], q: Q.downOut, f: 'splay', e: 's' },
      { t: 1.2, p: [0.25, -0.18, -0.49], e: 'l', s: 0.0006 },
      { t: 1.55, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.55, hit: 0.14, both: true, main: k(0), off: k(0.006),
      body: [{ t: 0 }, { t: 0.14, d: 0.015, p: -0.03 }, { t: 0.55, d: 0.02, p: -0.045 }, { t: 0.88, d: 0.045, p: -0.075 }, { t: 1.2, d: 0.045, p: -0.075 }, { t: 1.55 }],
      jolt: [[0.88, 0.05]], snd: [[0, 'cl', 1], [0.14, 'cp', 0.6], [0.65, 'sw', 0.15, 0.3]] };
  });

  // 血の嵐: the hands reach out by turns, open, close on something ahead and tear it back to the ribs, one and then the other - twice
  // each - drawing the blood in; and are clenched together before the chest at the end, shaking
  M('u_bloodstorm', () => {
    const OUT = [0.14, -0.12, -0.53], IN = [0.18, -0.27, -0.4], FIN = [0.13, -0.125, -0.45];
    const k = (d) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      ...(d > 0 ? [{ t: 0.15, p: [0.2, -0.28, -0.38], f: 'relax', e: 'o' }] : []),
      { t: 0.15 + d, p: OUT, q: Q.grab, f: 'clawOpen', e: 'o' },
      { t: 0.22 + d, p: [0.14, -0.125, -0.525], f: 'fist', e: 'i' },
      { t: 0.34 + d, p: IN, q: Q.pullIn, e: 'o' },
      { t: 0.52 + d, p: OUT, q: Q.grab, f: 'clawOpen', e: 'o' },
      { t: 0.59 + d, p: [0.14, -0.125, -0.525], f: 'fist', e: 'i' },
      { t: 0.71 + d, p: IN, q: Q.pullIn, e: 'o' },
      { t: 0.9 + d * 0.4, p: FIN, q: FQ, e: 'o' },
      { t: 0.97 + d * 0.4, p: [0.13, -0.127, -0.448], e: 'b', s: 0.004 },
      { t: 1.1, p: [0.132, -0.129, -0.448], e: 'l', s: 0.003 },
      { t: 1.35, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.35, hit: 0.15, both: true, main: k(0), off: k(0.18),
      body: [{ t: 0 }, { t: 0.15, f: 0.03, y: -0.015 }, { t: 0.34, f: -0.01, y: 0.015 }, { t: 0.52, f: 0.03, y: -0.015 }, { t: 0.72, f: -0.01, y: 0.015 },
        { t: 0.95, f: -0.02, d: 0.03, p: -0.02, s: 0.002 }, { t: 1.1, d: 0.03, p: -0.015, s: 0.003 }, { t: 1.35 }],
      jolt: [[0.34, 0.06], [0.52, 0.06], [0.71, 0.06], [0.95, 0.12]],
      snd: [[0, 'cl', 1], [0.1, 'sw', 0.2, 0.12], [0.22, 'cl', 1], [0.4, 'cl', 1], [0.59, 'cl', 1.2], [0.77, 'cl', 1.2], [0.92, 'cl', 1.5]] };
  });

  // 過充電: the palms pressed together before the chest and rubbed hard and fast, back and forth, faster and harder as the charge
  // builds; then snapped apart and flung down and out, the fingers spread - the charge let go
  M('u_overcharge', () => {
    const B = [0.03, -0.175, -0.5], RUB = [[0.12, 0], [0.18, -0.03], [0.24, 0.022], [0.29, -0.03], [0.34, 0.022], [0.39, -0.032], [0.44, 0.024], [0.49, -0.032], [0.55, 0]];
    const k = (d, w) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      ...RUB.map(([t, dz], i) => ({ t: t + (i ? 0 : d), p: [B[0], B[1], B[2] + dz * w], q: Q.edge, f: 'pray', e: i ? 'q' : 'o', s: 0.0006 + i * 0.0003 })),
      { t: 0.63 + d, p: [0.27, -0.19, -0.49], q: [-0.24, -0.45, -0.16], f: 'splay', e: 'o' },
      { t: 0.7 + d, e: 'b' },
      { t: 0.95, p: [0.28, -0.2, -0.48], f: 'relax', e: 's', s: 0.0015 },
      { t: 1.25, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return Object.assign(both(k, 0.008), { dur: 1.25, hit: 0.12, both: true,
      body: [{ t: 0 }, { t: 0.12, d: 0.01 }, { t: 0.55, d: 0.03, p: -0.02, s: 0.003 }, { t: 0.65, d: -0.01, p: 0.02, f: 0.025 }, { t: 0.95, f: 0.01 }, { t: 1.25 }],
      jolt: [[0.63, 0.16]], snd: [[0, 'cl', 1], [0.12, 'cp', 0.7], [0.2, 'cl', 0.6], [0.32, 'cl', 0.7], [0.44, 'cl', 0.8], [0.58, 'sw', 0.3, 0.2]] });
  });

  // 巨人化: both fists swung up by the head and hammered down, little-finger side first, into the ground ahead (the view thrown down with them),
  // held there; then the body rises, the fists drawn up before the chest, clenched and shaking with the new strength
  M('u_titan', () => {
    const k = (d) => [
      { t: 0, p: [0.32, 0.06, -0.1], q: Q.hammerUp, f: 'fist' },
      { t: 0.08 + d, p: [0.33, 0.12, -0.12], q: [1.2, 0, -1.57], e: 'o' },
      { t: 0.16 + d, p: [0.14, -0.18, -0.48], q: Q.hammerDn, e: 'i', on: true },
      { t: 0.22 + d, p: [0.14, -0.176, -0.478], e: 'b', s: 0.004 },
      { t: 0.45, p: [0.14, -0.178, -0.48], e: 'l', s: 0.0025 },
      { t: 0.8 + d, p: [0.165, -0.11, -0.41], q: FQ, e: 's' },
      { t: 1.1, p: [0.167, -0.112, -0.408], e: 'l', s: 0.0035 },
      { t: 1.45, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.45, hit: 0.16, both: true, main: k(0), off: k(0.006),
      body: [{ t: 0 }, { t: 0.08, p: 0.03, d: -0.02 }, { t: 0.18, d: 0.13, p: -0.14, f: 0.04 }, { t: 0.45, d: 0.11, p: -0.12, f: 0.03 }, { t: 0.8, d: -0.02, p: 0.04 }, { t: 1.1, d: -0.02, p: 0.035, s: 0.002 }, { t: 1.45 }],
      jolt: [[0.16, 0.3], [0.8, 0.08]], snd: [[0, 'cl', 1.2], [0.05, 'sw', 0.3, 0.12], [0.16, 'th', 0.6], [0.7, 'cl', 1.3]] };
  });

  // 剣の嵐: each flat hand, palm down, swept hard across before the body from the other side out past its own - a backhand clearing
  // stroke, the left and then the right - and both arms laid out wide and low to the sides as the blades go round
  M('u_bladestorm', () => {
    const k = (d) => [
      { t: 0, p: LOW, q: LOWQ, f: 'relax' },
      { t: Math.max(0.01, d * 0.6), p: [0.12, -0.3, -0.32], q: [0.3, 0.3, 0], f: 'blade', e: 's' },
      { t: d + 0.05, p: [-0.05, -0.14, -0.43], q: [0, 0.54, -0.1], f: 'blade', e: 'i' },
      { t: d + 0.11, p: [0.12, -0.12, -0.48], q: [0, 0, 0], e: 'l', on: true },
      { t: d + 0.19, p: [0.34, -0.12, -0.36], q: [0, -0.54, 0.1], e: 'o' },
      { t: 0.62, p: [0.31, -0.15, -0.4], q: Q.downOut, f: 'flat', e: 's' },
      { t: 0.95, p: [0.32, -0.155, -0.395], e: 'l', s: 0.001 },
      { t: 1.25, p: 'rest', q: RQ, f: 'rest', e: 's' }];
    return { dur: 1.25, hit: 0.11, both: true, main: k(0), off: k(0.2),
      body: [{ t: 0 }, { t: 0.13, y: -0.04, r: -0.02, f: 0.015 }, { t: 0.33, y: 0.04, r: 0.02, f: 0.015 }, { t: 0.62, f: 0.02, d: 0.015 }, { t: 0.95, d: 0.012 }, { t: 1.25 }],
      jolt: [[0.11, 0.08], [0.31, 0.08]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.16], [0.23, 'sw', 0.32, 0.16], [0.55, 'cl', 0.9]] };
  });

  // 断罪: the left hand raised to the shoulder and closed round a lever there (the gun kept in the right), held while the sigils burn under
  // the foes, the arm shaking more and more with the strain, drawn up a last hair - and yanked down hard as the blades of light come
  // down (2.0 s), the body dropping with it
  M('u_execution', () => ({ dur: 2.5, hit: 2.0, both: false,
    main: [
      { t: 0, p: [0.17, -0.34, -0.3], q: [0.6, 0.05, -0.6], f: 'relax' },
      { t: 0.22, p: [0.2, -0.06, -0.48], q: Q.hammer, f: 'clawOpen', e: 'o' },
      { t: 0.5, p: [0.2, -0.065, -0.48], f: 'fist', e: 's' },
      { t: 1.0, p: [0.201, -0.06, -0.478], e: 'l', s: 0.0012 },
      { t: 1.82, p: [0.2, -0.04, -0.47], e: 's', s: 0.0028 },
      { t: 2.0, p: [0.19, -0.2, -0.45], q: [0.0, 0, -1.57], e: 'i' },
      { t: 2.07, p: [0.19, -0.205, -0.448], e: 'b', s: 0.003 },
      { t: 2.2, e: 'l' },
      { t: 2.5, p: 'grip', f: 'grip', e: 's' }],
    body: [{ t: 0 }, { t: 0.22, p: 0.02, d: -0.008 }, { t: 1.0, p: 0.025, d: -0.01, s: 0.0005 }, { t: 1.84, p: 0.035, d: -0.015, s: 0.0012 }, { t: 2.03, p: -0.06, d: 0.045, f: 0.03 }, { t: 2.2, p: -0.05, d: 0.035, f: 0.02 }, { t: 2.5 }],
    jolt: [[2.0, 0.18]], snd: [[0, 'cl', 1], [0.05, 'sw', 0.15, 0.16], [0.48, 'cl', 1.2], [1.9, 'sw', 0.38, 0.14]] }));

  CA.table({
    ult_bastion: { m: 'u_bastion' },          // 不屈の城塞: fist into the palm, then braced
    ult_meteor: { m: 'u_meteor' },            // 星落とし: the sky taken and hauled down
    ult_bell: { m: 'u_bell' },                // 終焉の鐘: the bell's rope hauled down three times
    ult_godfall: { m: 'u_godfall' },          // 神降ろし: palms up to the light, taken in
    ult_timestop: { m: 'u_timestop' },        // 時止め: a hand held up to stop, clenched
    ult_berserk: { m: 'u_berserk' },          // 鬼神化: fists pulled in, straining
    ult_blackhole: { m: 'u_blackhole' },      // 虚無の渦: the air wrung like a cloth
    ult_judgement: { m: 'u_judgement' },      // 天罰: a hand up, chopped down at the ground
    ult_phoenix: { m: 'u_phoenix' },          // 鳳凰転生: arms crossed, flung up like wings
    ult_armory: { m: 'u_armory' },            // 無限兵装: the gun racked
    ult_legion: { m: 'u_legion' },            // 亡者の軍勢: the dead lifted from the ground
    ult_tsunami: { m: 'u_tsunami' },          // 大海嘯: scooped up low and pushed out
    ult_cryo: { m: 'u_cryo' },                // 絶対零度: both palms slammed down and held
    ult_inferno: { m: 'u_inferno' },          // 煉獄: flint struck twice, fire cast round
    ult_shadow: { m: 'u_shadow' },            // 影の舞: the hand signal to get down
    ult_orbital: { m: 'u_orbital' },          // 衛星砲: the target pointed and held
    ult_sanctuary: { m: 'u_sanctuary' },      // 聖域: a prayer, laid on the ground
    ult_bloodstorm: { m: 'u_bloodstorm' },    // 血の嵐: torn in by turns
    ult_overcharge: { m: 'u_overcharge' },    // 過充電: palms rubbed, flung apart
    ult_titan: { m: 'u_titan' },              // 巨人化: fists into the ground, rising
    ult_bladestorm: { m: 'u_bladestorm' },    // 剣の嵐: drawn from the hips, arms laid out
    ult_execution: { m: 'u_execution' },      // 断罪: a lever yanked at 2.0 s
  });
})();
