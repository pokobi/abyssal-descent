'use strict';
// First-person motions of the arms for skills and ultimates (a throw swung through, a dash that parts the air with both hands, a palm
// struck out, the ground slammed ...). The motions are made of a set of moves (MOVES below); which move each skill and ultimate uses,
// and with what values, is in two tables of their own: js/castanim_skills.js and js/castanim_ults.js (G.CastAnim.table(...)).
//
// How a motion is drawn. Each arm is posed from two things only, the place of its wrist and the turn of its hand; the elbow is found
// from the shoulder (two bones, the elbow out and down), so the arm bends at its joints by itself. The shoulder itself goes with the
// hand a little (forward as the arm reaches, up as it is raised). The hand is gfx.js openHand (its fingers bent at their joints each
// frame); the forearm and the upper arm wear gfx.js sleeve. A motion's keys are written for the RIGHT hand; the left arm is the right
// one in a mirror (its root turned over in x), so the same keys serve either side.
//
// The body. Each move has a motion of the body of its own (body keys: the view sinks, leans forward, tips, turns - a throw leans into
// it, a slam drops the shoulders, a charge crouches and trembles), a jolt where a blow lands (player.js addShake: 設定の画面揺れ) and
// the small sounds of the arms (cloth, a swing through the air, a hand on the ground). The body is laid on the view only where it is
// drawn (the scene's onBeforeRender, taken off again after it), at 設定の視点の揺れ: the camera the game aims and shoots from never
// moves with it, so where a shot starts and where it goes are as they were.
//
// The weapon. A motion of the left hand alone leaves the gun in the right hand (its own left hand, weapons.js model.lHand, is hidden
// and this left hand takes its place, from where it held the gun and back to it); with a hand weapon (melee.js) the left hand is free
// but for the fists (the left fist is hidden the same way), the twin fangs and a shield, which lower it. Any other motion (both hands,
// the right hand) lowers the weapon the way an item's use does (ItemAnim.lower). A shot, aiming, a switch of weapon, a reload, an item
// or a grenade cuts a motion off at once: it never holds up play.
//
// The time of play is not changed, but for this: a throw (a move whose entry has release) may hold the skill's effect back until the
// hand is swung through - its rel, never more than MAX_DELAY s (abilities.js A.cast asks CA.hold). The hand lets go before the face or
// the chest (the move's relP, or the table's hand), well up in the view; the shot itself still starts where it always did (P.handPos,
// low at the left), and only what is drawn of it is carried from the hand onto its true way over its first VIS_T s (CA.visFrom,
// combat.js spawnProjectile), so the shot leaves the hand.
(function () {
  const CA = (G.CastAnim = { lowerWant: 0, one: 0 });
  const U = G.U, V3 = THREE.Vector3, QT = THREE.Quaternion;
  const MAX_DELAY = 0.12;
  CA.MAX_DELAY = MAX_DELAY;
  // how long a shot thrown from the hand is drawn coming from the hand onto its own way (s), and how far beyond the hand (m, along
  // the line of sight through it) its drawn start is set: behind the hand on the screen, so the hand is over it as it lets go
  CA.VIS_T = 0.12;
  const VIS_D = 0.85;

  // ------------------------------------------------ the fingers
  // a hand's fingers: [first finger, middle, ring, little] each [first knuckle, second, third, spread], and the thumb [root, first,
  // second, spread] (radians; a bend + curls to the palm, - bends back; gfx.js openHand pose). sp(i): spread fanned out across the hand
  const sp = (i) => i - 1.5;
  const fing = (fn, t) => ({ f: [0, 1, 2, 3].map((i) => fn(i)), t });
  const FING = {
    rest: fing(() => [0.22, 0.32, 0.2, 0], [0.15, 0.22, 0.25, 0]),
    relax: fing((i) => [0.3 + i * 0.06, 0.42 + i * 0.05, 0.28, sp(i) * 0.02], [0.2, 0.28, 0.3, 0.05]),
    // the fingers straight and together, the thumb laid to the side of the hand (a hand pushed flat against something)
    flat: fing((i) => [0.02, 0.05, 0.03, sp(i) * 0.03], [0.05, 0.12, 0.1, -0.1]),
    // spread and stiff, bent a little back (a palm struck out, a hand flung open). The thumb kept in near the hand: a thumb thrown
    // out square to it reads as a cartoon hand
    splay: fing((i) => [-0.1 - (i === 3 ? 0.04 : 0), -0.04, 0.02, sp(i) * 0.13], [0.22, 0.18, 0.14, -0.12]),
    // pressed down on the ground: the fingers bent back hard, spread
    press: fing((i) => [-0.32, 0.08, 0.04, sp(i) * 0.15], [0.05, 0.08, 0.1, 0.1]),
    // the edge of the hand: fingers straight and close, the thumb in along the palm
    blade: fing((i) => [0.04, 0.03, 0.02, -sp(i) * 0.03], [0.3, 0.22, 0.12, -0.28]),
    // clenched hard: the fingers rolled tight into the palm and the thumb laid across the first two of them (a thumb left hanging
    // below the fist, or out to its side, reads as a claw from the palm side)
    fist: fing((i) => [1.95 + i * 0.04, 2.1, 1.45, 0], [1.6, 0.8, 0.5, 0.9]),
    // closed round a thing to be thrown
    hold: fing((i) => [0.82 + i * 0.05, 0.95, 0.6, sp(i) * 0.06], [0.45, 0.42, 0.35, 0.12]),
    // just let go: open, the fingers trailing
    release: fing((i) => [0.08 + i * 0.04, 0.16, 0.06, sp(i) * 0.12], [0.1, 0.1, 0.08, 0.1]),
    // a claw opened wide (before it closes on something)
    clawOpen: fing((i) => [0.18, 0.62, 0.52, sp(i) * 0.16], [0.1, 0.38, 0.45, 0.2]),
    claw: fing((i) => [0.95 + i * 0.05, 1.45, 1.15, sp(i) * 0.08], [0.55, 0.7, 0.75, 0.05]),
    // the first finger out, the rest closed, the thumb over the middle finger
    point: fing((i) => (i === 0 ? [-0.05, 0.0, 0.0, -0.06] : [1.9 + i * 0.04, 2.05, 1.4, 0]), [0.95, 0.9, 0.7, -0.45]),
    // a sign of two fingers: the first and middle up, the ring and little closed under the thumb
    seal: fing((i) => (i < 2 ? [0.0, 0.02, 0.02, (i ? -0.02 : 0.02)] : [1.9 + i * 0.04, 2.05, 1.4, 0]), [1.05, 1.0, 0.8, -0.6]),
    // round the gun's fore-end (the hand that goes back to it)
    grip: fing((i) => [0.78 + i * 0.05, 0.9, 0.62, sp(i) * 0.04], [0.42, 0.4, 0.3, 0.1]),
    // palm to palm (a prayer): the fingers straight and together, a hair curled so their tips meet the other hand's, not cross them
    pray: fing((i) => [0.06, 0.06, 0.04, sp(i) * 0.01], [0.2, 0.15, 0.1, -0.15]),
  };
  CA.FING = FING;
  // the turn of a fist held up before the body with its back and knuckles to the eye (seen from the palm side, curled fingers read as
  // a claw): for a fist raised, braced or shaken
  CA.FIST_Q = [1.3, 0.3, -0.2];
  const fingArr = (f) => { const F = typeof f === 'string' ? FING[f] || FING.rest : f; return F.f.flat().concat(F.t); };

  // ------------------------------------------------ the moves
  // A move: (o) => { dur, rel, hit, both, release, relP, main: [keys], off: [keys] | null, body: [body keys], jolt: [[t, a]],
  // snd: [[t, kind, a, len]], prop: () => Object3D }. o: the table's entry (its values: side, speed, angle, hold, high, f, at ...).
  // dur: its length (s); rel:
  // the moment the effect leaves the hand (s, for a release); hit: the moment the hand is in place for the effect (s; o.at moves it);
  // both: two hands (else the main hand alone; off may still give the other hand a small part when both). relP: where the palm (or the
  // finger tip) lets the shot go, in the view's space (o.hand overrides it). Keys (seconds, written for the right hand):
  //   { t, p: [x, y, z] | 'grip' | 'rest' | 'hand', q: [rx, ry, rz], f: finger preset | { f, t }, e: easing to it, s: tremor (m), pt }
  //   p: where the wrist is, in the view's space (the eye at the origin, -z ahead; ~0.45 m out is the hands' distance). 'grip': where
  //      the hand holds the gun (or out of sight below when it is lowered); 'rest': down out of sight; 'hand': the palm (pt 'tip': the
  //      finger tip) on relP, where the shot leaves the hand; 'hand+': a little out past it, settling. ['grip', dx, dy, dz]: that far
  //      from where the hand holds the gun; 'gun' / ['gun', dx, dy, dz]: (that far from) the wrist of a hand laid flat on top of the
  //      gun's receiver, over its ejection port - found for each gun from its own model, so it is on the gun whatever the gun. Both
  //      only mean something for the left hand alone with a gun in the right (CA.gripNow() / CA.gunNow() say whether there is one:
  //      a move asks them when it is built and gives other keys when there is none); without, they fall back to 'rest'.
  //   q: the hand's turn (Euler XYZ). [0, 0, 0]: palm down, fingers ahead. [1.5, 0, 0]: palm ahead, fingers up. [0, 0, -1.57]: palm
  //      in towards the middle (a blade). [0, 0, 1.57]: palm out to the side. [0, 0, 3.1]: palm up.
  //   Left out: as the key before. e: q (in and out, the default), o (out: sets off fast, settles), i (in: gathers speed), s (smoother),
  //   l (even).
  // Body keys (written for the right hand: r and y turn over for the left): { t, d: sunk (m), f: forward (m), p: pitched up (rad), r:
  // rolled (rad, + the head tipped to the left), y: turned to the left (rad), s: a tremor (rad) }; left out: 0. Eased smoothly key to
  // key. jolt: [t, a] the view shaken at t (player.js addShake a). snd: [t, kind, a, len]: 'sw' an arm swung through the air
  // (sfx.whoosh), 'cl' the cloth of the sleeve and the glove (sfx.mech grab), 'th' a hand on the ground (sfx.land on the floor under
  // you), 'cp' the hands met. prop: a thing held in the main hand for the motion's length (a watch in the palm ...): made by the move
  // (made once and kept by it), put in the hand's own space (the wrist at the origin, palm down, fingers to -z) as the motion starts
  // and taken out of the hand as it ends or is cut; the move's tick may show and hide it (c.prop).
  const MOVES = {};
  CA.MOVES = MOVES;
  CA.move = (name, fn) => { MOVES[name] = fn; };
  const GRIP_Q = [0.35, 0.35, -2.3], REST_Q = [-0.4, 0.1, 0.5];
  const v = (o, k, d) => (o && o[k] !== undefined ? o[k] : d);
  const REL_P = [0.11, -0.07, -0.47];

  // 上手投げ: the hand comes over from behind the shoulder (out of sight above), swung through, letting go before the face (rel), follows
  // through down across the body, and goes back to the gun. angle: the arm laid over to the side (a side-arm throw). The body leans
  // back into the wind-up and forward through the throw, the shoulders turned with it
  MOVES.overhand = (o) => {
    const a = v(o, 'angle', 0), r = 0.12;
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.1 + a * 0.06, -0.045 - a * 0.06, -0.47], main: [
      { t: 0, p: [0.3 + a * 0.1, 0.2 - a * 0.12, 0.04], q: [2.4, -0.3 - a, -0.5 - a], f: 'hold' },
      { t: 0.06, p: [0.21 + a * 0.06, 0.09 - a * 0.07, -0.3], q: [1.85, -0.25 - a * 0.6, -0.45 - a * 0.6], e: 'i' },
      { t: r, p: 'hand', q: [0.95, -0.12, -0.3 - a * 0.3], f: 'release', e: 'l' },
      { t: r + 0.09, p: [0.04, -0.15, -0.47], q: [-0.1, 0.35, -0.55], f: 'relax', e: 'o' },
      { t: 0.36, p: [0.0, -0.215, -0.44], q: [-0.5, 0.5, -0.7], e: 's' },
      { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, p: 0.012, r: -0.014, y: -0.012, f: -0.01 }, { t: r + 0.035, p: -0.024, r: 0.022, y: 0.014, f: 0.04, d: 0.01 },
        { t: 0.4, p: -0.007, r: 0.005, y: 0.004, f: 0.012 }, { t: 0.66 }],
      snd: [[0, 'cl', 1], [0.035, 'sw', 0.26, 0.22]] };
  };
  // 下手投げ: from low behind (out of sight below), the arm swung forward and up, let go before the chest (rel), the open hand rising
  // after it. The body dips into the swing and comes up with it
  MOVES.underhand = (o) => {
    const r = 0.12, hi = v(o, 'high', 0);
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.1, -0.15 + hi * 0.03, -0.47], main: [
      { t: 0, p: [0.24, -0.5, 0.0], q: [-1.0, 0.1, -2.7], f: 'hold' },
      { t: 0.06, p: [0.2, -0.36, -0.26], q: [-0.3, 0.05, -2.85], e: 'i' },
      { t: r, p: 'hand', q: [0.45, 0, -2.95], f: 'release', e: 'l' },
      { t: r + 0.12, p: [0.09, -0.06 + hi * 0.05, -0.47], q: [0.65, 0, -2.85], f: 'splay', e: 'o' },
      { t: 0.38, p: [0.1, -0.08 + hi * 0.05, -0.46], q: [0.5, 0, -2.8], f: 'relax', e: 's' },
      { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, d: 0.018, p: -0.012, f: 0.01 }, { t: r + 0.05, d: 0.004, p: 0.008, f: 0.025, r: 0.008 }, { t: 0.4, f: 0.008 }, { t: 0.66 }],
      snd: [[0, 'cl', 0.9], [0.03, 'sw', 0.2, 0.22]] };
  };
  // 突き出す（掌底）: drawn back to the chest, the palm struck out before the face (the heel of the hand first, the fingers bent back),
  // held a moment against the recoil, back. release: the shot leaves the palm (at 'hand'); else it is struck out to front (o.front:
  // [x, y, z]). The body drives in behind it
  MOVES.palm = (o) => {
    const h = 0.1, rel = !!o.release, fr = v(o, 'front', [0.06, -0.1, -0.47]);
    return { dur: 0.64, rel: h, hit: h, release: rel, relP: [0.07, -0.075, -0.53], main: [
      { t: 0, p: [0.18, -0.24, -0.2], q: [1.1, 0.05, -0.3], f: 'flat' },
      { t: 0.045, p: [0.16, -0.19, -0.27], q: [1.25, 0.02, -0.22], e: 'i' },
      { t: h, p: rel ? 'hand' : fr, q: [1.62, -0.06, -0.1], f: 'splay', e: 'l', pt: 'palm' },
      { t: h + 0.06, p: rel ? 'hand+' : [fr[0] + 0.01, fr[1] - 0.005, fr[2] + 0.03], q: [1.55, -0.05, -0.12], e: 'o', s: 0.0015 },
      { t: 0.36, f: 'relax', q: [1.25, 0, -0.2], e: 's' },
      { t: 0.64, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.05, f: -0.012, p: 0.004 }, { t: h + 0.025, f: 0.05, p: -0.01, d: 0.008, r: 0.008 }, { t: 0.36, f: 0.016 }, { t: 0.64 }],
      jolt: [[h, 0.04]], snd: [[0, 'cl', 0.8], [0.025, 'sw', 0.22, 0.16]] };
  };
  // 両手で押し出す: both palms drawn to the chest and driven out together, held out, let down. The body steps into it
  MOVES.push2 = (o) => {
    const h = 0.09, w = v(o, 'wide', 0), lo = v(o, 'low', 0);
    const keys = (d) => [
      { t: 0, p: [0.16 + w * 0.05, -0.26 - lo * 0.05, -0.18], q: [1.15, 0.15, -0.4], f: 'flat' },
      { t: 0.04 + d, p: [0.15 + w * 0.05, -0.2 - lo * 0.05, -0.24], q: [1.3, 0.1, -0.3], e: 'i' },
      { t: h + d, p: [0.085 + w * 0.1, -0.1 - lo * 0.12, -0.46], q: [1.58, -0.12, -0.2], f: 'splay', e: 'o' },
      { t: h + 0.06 + d, p: [0.09 + w * 0.1, -0.105 - lo * 0.12, -0.445], e: 'o', s: 0.002 },
      { t: 0.36, p: [0.1 + w * 0.1, -0.13 - lo * 0.12, -0.43], q: [1.35, -0.05, -0.2], f: 'relax', e: 's' },
      { t: 0.62, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.62, hit: h, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.045, f: -0.014, d: 0.006 }, { t: h + 0.025, f: 0.055, p: -0.012, d: 0.012 }, { t: 0.36, f: 0.02, d: 0.004 }, { t: 0.62 }],
      jolt: [[h, 0.07]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.2]] };
  };
  // 地面を叩く: the fist (or the flat hand: o.palm) thrown up and brought down hard to the foot of the view, the jolt of the blow,
  // held, back. both: the two together. The body drops with the blow, the head bowed to it
  MOVES.slam = (o) => {
    const h = 0.085, pm = !!o.palm, f = pm ? 'splay' : 'fist', qd = pm ? [-0.35, 0, 0.1] : [-0.25, 0.1, -1.35];
    const keys = (d) => [
      { t: 0, p: [0.16, -0.12, -0.34], q: pm ? [0.6, 0, 0.1] : [-0.6, 0.1, -1.3], f },
      { t: h * 0.4 + d, p: [0.15, 0.14, -0.27], q: pm ? [1.2, 0, 0.1] : [-1.1, 0.1, -1.3], e: 'o' },
      { t: h + d, p: [0.07, -0.165, -0.5], q: qd, e: 'i' },
      { t: h + 0.045 + d, p: [0.07, -0.153, -0.495], e: 'o', s: 0.003 },
      { t: 0.36, p: [0.075, -0.157, -0.5], f: pm ? 'press' : 'fist', e: 's' },
      { t: 0.62, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: 0.62, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.01) : null,
      body: [{ t: 0 }, { t: h * 0.4, p: 0.016, d: -0.01 }, { t: h + 0.03, d: 0.095, p: -0.115, f: 0.03 }, { t: 0.36, d: 0.075, p: -0.09, f: 0.02 }, { t: 0.62 }],
      jolt: [[h, o.both ? 0.18 : 0.14]], snd: [[0, 'cl', 0.9], [h * 0.4, 'sw', 0.24, 0.12], [h, 'th', o.both ? 0.4 : 0.3]] };
  };
  // 地面に手を付く: the hand brought down flat, fingers spread, to the foot of the view, pressed down and held there, lifted off. The
  // body goes down on one knee with it
  MOVES.plant = (o) => {
    const h = 0.1, hold = v(o, 'hold', 0.4);
    const keys = (d) => [
      { t: 0, p: [0.14, -0.08, -0.4], q: [0.1, 0.05, 0.15], f: 'splay' },
      { t: h + d, p: [0.09, -0.15, -0.5], q: [-0.45, 0.05, 0.08], f: 'press', e: 'i' },
      { t: h + 0.05 + d, p: [0.09, -0.157, -0.5], e: 'o', s: 0.002 },
      { t: h + hold, p: [0.09, -0.159, -0.5], e: 'l', s: 0.001 },
      { t: h + hold + 0.3, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: h + hold + 0.3, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.015) : null,
      body: [{ t: 0 }, { t: h + 0.04, d: 0.09, p: -0.1, f: 0.025 }, { t: h + hold, d: 0.085, p: -0.095, f: 0.022, s: 0.0006 }, { t: h + hold + 0.3 }],
      jolt: [[h, 0.07]], snd: [[0, 'cl', 1], [h, 'th', 0.16]] };
  };
  // 掲げる: the hand raised before the face, palm out (f: 'fist' - a fist raised; high: up to the top of the view), held, let down.
  // both: the two hands. The body straightens and the head lifts with it
  MOVES.raise = (o) => {
    const h = 0.11, fist = v(o, 'f', 'splay') === 'fist', hi = v(o, 'high', 0), hold = v(o, 'hold', 0.4), w = o.both ? 0.05 : 0;
    const qUp = fist ? [1.25, 0.1, -1.45] : [1.5, -0.05, -0.2], fu = fist ? 'fist' : v(o, 'f', 'splay'), zf = fist ? 0.05 : 0;
    const keys = (d) => [
      { t: 0, p: [0.17 + w, -0.28, -0.3], q: [0.6, 0.05, -0.5], f: 'relax' },
      { t: h + d, p: [0.12 + w - zf, -0.01 + hi * 0.07 - zf * 1.6, -0.4 + zf], q: qUp, f: fu, e: 'o' },
      { t: h + 0.06 + d, p: [0.12 + w - zf, 0.0 + hi * 0.07 - zf * 1.6, -0.4 + zf], e: 'o', s: fist ? 0.0015 : 0 },
      { t: h + hold, p: [0.12 + w - zf, -0.005 + hi * 0.07 - zf * 1.6, -0.398 + zf], e: 'l', s: fist ? 0.0012 : 0.001 },
      { t: h + hold + 0.32, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: h + hold + 0.32, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.02) : null,
      body: [{ t: 0 }, { t: h + 0.05, p: 0.022 + hi * 0.03, d: -0.012, f: fist ? 0.015 : 0 }, { t: h + hold, p: 0.018 + hi * 0.025, d: -0.01, s: fist ? 0.0008 : 0 }, { t: h + hold + 0.32 }],
      jolt: fist ? [[h, 0.05]] : null, snd: [[0, 'cl', 1.1], [0.03, 'sw', fist ? 0.2 : 0.12, 0.14]] };
  };
  // 両手でかき分ける（ダッシュ）: the two hands come up together before the chest, palms out, and sweep wide apart across the view and
  // on out past its edges - the air parted ahead of the body. The body leans into the rush
  MOVES.part = (o) => {
    const wd = v(o, 'wide', 0);
    const keys = (d) => [
      { t: 0, p: [0.12, -0.3, -0.26], q: [0.6, 0, 0.9], f: 'flat' },
      { t: 0.07 + d, p: [0.035, -0.1, -0.45], q: [0.55, -0.15, 1.45], e: 'o' },
      { t: 0.11 + d, p: [0.045, -0.098, -0.46], e: 'l' },
      { t: 0.25 + d, p: [0.18 + wd * 0.03, -0.075, -0.45], q: [0.4, -0.05, 1.55], f: 'splay', e: 'q' },
      { t: 0.39 + d, p: [0.3 + wd * 0.04, -0.1, -0.35], q: [0.3, -0.35, 1.5], e: 'o' },
      { t: 0.5 + d, p: [0.37, -0.26, -0.15], f: 'relax', e: 'i' },
      { t: 0.62, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.62, hit: 0.07, both: true, main: keys(0), off: keys(0.01),
      body: [{ t: 0 }, { t: 0.07, d: 0.01, f: 0.01 }, { t: 0.22, f: 0.055, p: -0.014, d: 0.014 }, { t: 0.42, f: 0.022, d: 0.004 }, { t: 0.62 }],
      snd: [[0, 'cl', 1], [0.08, 'sw', 0.32, 0.3]] };
  };
  // 引いて突く: the fist drawn back to the side and driven straight out (release: the shot leaves it, at 'hand'), back. The body
  // twists into the blow
  MOVES.thrust = (o) => {
    const h = v(o, 'hitT', 0.1), rel = !!o.release;
    return { dur: h + 0.45, rel: h, hit: h, release: rel, relP: [0.065, -0.065, -0.54], main: [
      { t: 0, p: [0.21, -0.23, -0.12], q: [0.15, 0.2, -1.3], f: 'fist' },
      { t: h * 0.4, p: [0.22, -0.22, -0.15], e: 'o' },
      { t: h, p: rel ? 'hand' : [0.05, -0.085, -0.52], q: [0.08, -0.05, -1.42], e: 'i', pt: 'palm' },
      { t: h + 0.05, p: rel ? 'hand+' : [0.055, -0.09, -0.5], e: 'o', s: 0.002 },
      { t: h + 0.2, q: [0.1, 0, -1.35], e: 's' },
      { t: h + 0.45, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: h * 0.45, f: -0.012, y: -0.012, r: -0.006 }, { t: h + 0.025, f: 0.055, y: 0.016, r: 0.012, d: 0.008 }, { t: h + 0.22, f: 0.015, y: 0.004 }, { t: h + 0.45 }],
      jolt: [[h, 0.05]], snd: [[0, 'cl', 0.9], [h * 0.5, 'sw', 0.24, 0.14]] };
  };
  // 薙ぐ: the edge of the hand swept flat across the view from the outside in, through and past. The shoulders turn with it
  MOVES.sweep = (o) => {
    const a = v(o, 'angle', 0), h = 0.09;
    return { dur: 0.6, hit: h, both: false, main: [
      { t: 0, p: [0.34, -0.02 + a * 0.1, -0.2], q: [0.15, 0.6, -1.5 - a], f: 'blade' },
      { t: 0.045, p: [0.22, -0.05 + a * 0.05, -0.43], q: [0.12, 0.3, -1.52 - a], e: 'i' },
      { t: h, p: [0.0, -0.075, -0.48], q: [0.1, -0.15, -1.55 - a], e: 'l' },
      { t: h + 0.08, p: [-0.24, -0.13 - a * 0.05, -0.36], q: [0.05, -0.75, -1.6 - a], e: 'o' },
      { t: 0.3, p: [-0.27, -0.2, -0.32], f: 'relax', e: 's' },
      { t: 0.6, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.04, y: -0.018, r: -0.01 }, { t: h + 0.06, y: 0.03, r: 0.016, f: 0.015 }, { t: 0.32, y: 0.008, r: 0.004 }, { t: 0.6 }],
      snd: [[0, 'cl', 0.8], [0.03, 'sw', 0.28, 0.18]] };
  };
  // 握りつぶす: the hand out, its fingers spread into a claw (turned so the curl of the fingers shows), slowly closing on what is there,
  // then crushed shut with a twist of the wrist and a shake; pull: drawn back to the body after it
  MOVES.crush = (o) => {
    const h = 0.1, c = v(o, 'close', 0.42), pull = !!o.pull;
    const keys = (d) => [
      { t: 0, p: [0.16, -0.24, -0.3], q: [1.0, 0, -0.3], f: 'relax' },
      { t: h + d, p: [0.08, -0.09, -0.5], q: [1.3, -0.25, -0.7], f: 'clawOpen', e: 'o' },
      { t: c - 0.08 + d, p: [0.08, -0.095, -0.49], q: [1.28, -0.2, -0.75], f: 'claw', e: 's', s: 0.001 },
      { t: c + d, p: [0.08, -0.11, -0.47], q: [1.05, 0.05, -1.2], f: 'fist', e: 'i' },
      { t: c + 0.08 + d, p: [0.08, -0.11, -0.47], e: 'l', s: 0.003 },
      { t: c + 0.3, p: pull ? [0.14, -0.17, -0.3] : [0.08, -0.12, -0.46], q: pull ? [0.9, 0.1, -1.1] : [1.05, 0.05, -1.2], e: pull ? 'o' : 'l', s: 0.0012 },
      { t: c + 0.58, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: c + 0.58, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.025) : null,
      body: [{ t: 0 }, { t: h + 0.04, f: 0.02, p: -0.004 }, { t: c, f: 0.024, d: 0.008, s: 0.0008 }, { t: c + 0.08, f: 0.02, d: 0.012, p: -0.008 },
        { t: c + 0.3, f: pull ? -0.02 : 0.01, p: pull ? 0.006 : -0.004 }, { t: c + 0.58 }],
      jolt: [[c, 0.05]], snd: [[0, 'cl', 0.9], [c - 0.02, 'cl', 1.4]] };
  };
  // 指さす・印を結ぶ: sign 'point' - the arm thrust out and the first finger levelled at the aim, turned a little so it reads against the
  // view (up: at the sky; release: its tip where the shot leaves); 'seal' - two fingers raised before the face, the hand upright
  MOVES.sign = (o) => {
    const h = 0.085, s = v(o, 'sign', 'point'), up = !!o.up, rel = !!o.release, hold = v(o, 'hold', 0.38);
    let pk, qk;
    if (s === 'seal') { pk = [0.035, -0.07, -0.34]; qk = [1.5, 0.1, -1.5]; }
    else if (up) { pk = [0.1, 0.05, -0.42]; qk = [1.55, -0.1, -1.35]; }
    else { pk = rel ? 'hand' : [0.08, -0.06, -0.5]; qk = [0.32, 0.35, -1.3]; }
    const point = s !== 'seal';
    return { dur: h + hold + 0.32, rel: h, hit: h, release: rel && point && !up, relP: [0.09, -0.035, -0.58], main: [
      { t: 0, p: [0.17, -0.25, -0.3], q: [0.5, 0, -0.9], f: 'relax' },
      { t: h, p: pk, q: qk, f: point ? 'point' : 'seal', e: 'o', pt: 'tip' },
      { t: h + 0.05, p: typeof pk === 'string' ? 'hand+' : [pk[0], pk[1] + 0.005, pk[2] + 0.01], e: 'o' },
      { t: h + hold, e: 'l', s: 0.0008 },
      { t: h + hold + 0.32, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }],
      body: point ? [{ t: 0 }, { t: h + 0.03, f: 0.03, y: 0.008, p: up ? 0.02 : 0 }, { t: h + hold, f: 0.02, y: 0.005, p: up ? 0.016 : 0 }, { t: h + hold + 0.32 }]
        : [{ t: 0 }, { t: h + 0.05, d: 0.006, p: -0.008 }, { t: h + hold, d: 0.006, p: -0.008 }, { t: h + hold + 0.32 }],
      snd: [[0, 'cl', 0.9], [0.02, 'sw', point ? 0.16 : 0.08, 0.12]] };
  };
  // 胸の前で合わせる: the two hands brought together palm to palm before the chest (a prayer; a clap with o.clap), held; open: flung
  // apart after it, palms out. The head bows to it
  MOVES.clasp = (o) => {
    const h = v(o, 'clap', 0) ? 0.07 : 0.12, hold = v(o, 'hold', 0.38), open = !!o.open, fs = v(o, 'f', 'pray');
    const keys = (d) => [
      { t: 0, p: [0.16, -0.3, -0.28], q: [1.0, 0.1, -1.2], f: 'relax' },
      { t: h + d, p: [0.036, -0.12, -0.35], q: [1.45, -0.09, -1.57], f: fs === 'flat' ? 'pray' : fs, e: o.clap ? 'i' : 'o' },
      { t: h + 0.04 + d, p: [0.035, -0.118, -0.355], e: 'o', s: 0.0008 },
      { t: h + hold, p: [0.035, -0.115, -0.36], e: 'l', s: 0.0008 },
      ...(open ? [{ t: h + hold + 0.12, p: [0.24, -0.06, -0.38], q: [1.5, 0.4, -0.3], f: 'splay', e: 'o' }] : []),
      { t: h + hold + (open ? 0.45 : 0.32), p: 'rest', q: REST_Q, f: 'rest', e: open ? 'q' : 's' }];
    return { dur: h + hold + (open ? 0.45 : 0.32), hit: h, both: true, main: keys(0), off: keys(0.006),
      body: open ? [{ t: 0 }, { t: h + 0.03, d: 0.01, p: -0.012 }, { t: h + hold, d: 0.012, p: -0.014 }, { t: h + hold + 0.1, d: -0.008, p: 0.016, f: 0.02 }, { t: h + hold + 0.45 }]
        : [{ t: 0 }, { t: h + 0.06, d: 0.012, p: -0.022 }, { t: h + hold, d: 0.014, p: -0.026 }, { t: h + hold + 0.32 }],
      jolt: open ? [[h + hold + 0.06, 0.06]] : null,
      snd: [[0, 'cl', 1], [h, 'cp', o.clap ? 1 : 0.6]].concat(open ? [[h + hold + 0.02, 'sw', 0.24, 0.18]] : []) };
  };
  // 構えて溜める: both hands out before the body, facing each other a hand's breadth apart (a weight of air held between them), the
  // fingers clawing in, drawn in towards the chest and trembling harder with the strain for hold s; then thrown open, outwards. With
  // f: 'fist' the fists are clenched before the chest and pulled apart and down with the strain, then driven out. The body crouches
  // into the gathering and straightens as it is let go
  MOVES.channel = (o) => {
    const h = 0.16, hold = v(o, 'hold', 0.6), fist = v(o, 'f', '') === 'fist';
    const keys = fist ? (d) => [
      { t: 0, p: [0.17, -0.3, -0.3], q: [0.6, 0.1, -0.8], f: 'relax' },
      { t: h + d, p: [0.1, -0.1, -0.42], q: [0.85, 0.05, -1.45], f: 'fist', e: 'o' },
      { t: h + hold * 0.5 + d, p: [0.13, -0.125, -0.39], q: [0.8, 0.15, -1.3], e: 's', s: 0.002 },
      { t: h + hold, p: [0.15, -0.15, -0.36], q: [0.7, 0.2, -1.2], e: 'l', s: 0.004 },
      { t: h + hold + 0.1, p: [0.1, -0.09, -0.48], q: [0.5, -0.05, -1.45], e: 'o' },
      { t: h + hold + 0.42, p: 'rest', q: REST_Q, f: 'rest', e: 'q' }]
      : (d) => [
        { t: 0, p: [0.17, -0.3, -0.3], q: [0.6, 0.1, -0.8], f: 'relax' },
        { t: h + d, p: [0.125, -0.07, -0.45], q: [0.55, 0.2, -1.45], f: 'clawOpen', e: 'o' },
        { t: h + hold * 0.5 + d, p: [0.105, -0.075, -0.42], q: [0.5, 0.25, -1.5], f: 'claw', e: 's', s: 0.0018 },
        { t: h + hold, p: [0.09, -0.085, -0.39], q: [0.45, 0.28, -1.52], e: 'l', s: 0.0035 },
        { t: h + hold + 0.1, p: [0.3, -0.09, -0.44], q: [1.4, 0.5, -0.3], f: 'splay', e: 'o' },
        { t: h + hold + 0.42, p: 'rest', q: REST_Q, f: 'rest', e: 'q' }];
    return { dur: h + hold + 0.42, hit: h, both: true, main: keys(0), off: keys(0.02),
      body: [{ t: 0 }, { t: h, d: 0.012, p: -0.006 }, { t: h + hold, d: 0.034, p: -0.016, s: 0.0035 }, { t: h + hold + 0.08, d: -0.012, p: 0.022, f: 0.025 }, { t: h + hold + 0.42 }],
      jolt: [[h + hold + 0.05, 0.1]], snd: [[0, 'cl', 1], [h + hold * 0.5, 'cl', 0.8], [h + hold, 'sw', 0.3, 0.24]] };
  };
  // what a skill or ultimate that is in neither table does
  CA.DEFAULT = { m: 'raise' };

  // ------------------------------------------------ the tables (js/castanim_skills.js, js/castanim_ults.js)
  // Besides the move's own values, an entry may have:
  //   hand: [x, y, z]  where the palm (the finger tip for a point) lets the shot go, in the view's space (default: the move's relP)
  //   body: k          how strongly the body moves with it (1 the move's own; 0 none; 1.5 half as much again). The jolt too
  //   quiet: true      none of the small sounds of the arms
  const TABLE = {};
  CA.TABLE = TABLE;
  CA.table = (o) => { Object.assign(TABLE, o); };
  CA.entryOf = (id) => TABLE[id] || CA.DEFAULT;
  // what the motion of id would be: { move, dur, rel, delay, both, side } (seconds, at its speed)
  CA.info = function (id) {
    const e = CA.entryOf(id), mv = build(e); if (!mv) return null;
    return { move: e.m, dur: mv.dur, rel: mv.rel, delay: mv.delay, both: mv.both, side: mv.side };
  };
  // a move made from an entry, its times put to the entry's speed and to its at (the moment the hand is in place), keys made whole
  function build(e) {
    const fn = MOVES[e.m] || MOVES[CA.DEFAULT.m]; let mv = null;
    try { mv = fn(e) || null; } catch (err) { console.error(err); return null; }
    if (!mv) return null;
    const sp = Math.max(0.2, e.speed || 1), at = e.at !== undefined ? e.at : null, hit = mv.hit !== undefined ? mv.hit : mv.rel || 0;
    // (a moment t of the move is put where it falls at this speed, and stretched before the hit so that the hit falls at 'at')
    const tm = (t) => { let u = t / sp; const h = hit / sp; if (at !== null && h > 0) u = u <= h ? u * at / h : u + at - h; return u; };
    const fix = (keys) => keys ? keys.map((k) => Object.assign({}, k, { t: tm(k.t) })) : null;
    const bk = e.body !== undefined ? +e.body || 0 : 1;
    const out = { dur: tm(mv.dur), rel: mv.rel !== undefined ? tm(mv.rel) : tm(hit), both: !!mv.both, side: e.side || 'L', main: fix(mv.main), off: fix(mv.off), release: !!(mv.release || e.release) && e.release !== false, tick: e.tick || mv.tick || null };
    out.delay = out.release ? Math.min(MAX_DELAY, out.rel) : 0;
    out.relP = e.hand || mv.relP || REL_P;
    out.prop = typeof mv.prop === 'function' ? mv.prop : null;
    out.body = bk > 0 && mv.body ? mv.body.map((k) => ({ t: tm(k.t), d: (k.d || 0) * bk, f: (k.f || 0) * bk, p: (k.p || 0) * bk, r: (k.r || 0) * bk, y: (k.y || 0) * bk, s: (k.s || 0) * bk })) : null;
    out.jolt = bk > 0 && mv.jolt ? mv.jolt.map(([t, a]) => [tm(t), a * bk]) : [];
    out.snd = !e.quiet && mv.snd ? mv.snd.map((s) => [tm(s[0])].concat(s.slice(1))).sort((a, b) => a[0] - b[0]) : [];
    return out;
  }

  // ------------------------------------------------ the arms
  // the right shoulder in the view's space, the lengths of the upper arm and of the forearm (from the wrist), the way the elbow points
  const SHOULDER = new V3(0.19, -0.3, 0.09), UPPER = 0.31, FORE = 0.31, POLE = new V3(1, -0.55, 0.2).normalize();
  // where the forearm's sleeve starts on the hand (gfx.js openHand: the wrist at the origin, the glove's cuff behind it), the middle of
  // the palm and the tip of the first finger (the hand's own space)
  const CUFF = new V3(0, 0, 0.0625), PALM = new V3(0.002, -0.012, -0.055), TIP = new V3(-0.006, 0.0, -0.155);
  let rig = null, root = null, cur = null;
  function makeArm(side) {
    const X = G.GFX, Wm = G.weapons.mats;
    const g = new THREE.Group(); g.scale.x = side; g.visible = false; root.add(g);
    const hand = new THREE.Group(); g.add(hand);
    const oh = X.openHand();
    hand.add(new THREE.Mesh(oh.hand, Wm.glove), new THREE.Mesh(oh.pad, Wm.gloveDk || Wm.glove), new THREE.Mesh(oh.strap, Wm.gloveDk || Wm.glove));
    // the forearm's sleeve (the wool, its bracer, the straps and their iron) and the upper arm's (the wool alone), each from its own
    // start along +z, stretched to its length
    const MS = { cloth: Wm.sleeve, bracer: Wm.bracer || Wm.sleeve, strap: Wm.gloveDk || Wm.sleeve, iron: Wm.iron || Wm.steel };
    const fore = new THREE.Group(), upper = new THREE.Group(); g.add(fore, upper);
    for (const q of X.sleeve(0.34)) fore.add(new THREE.Mesh(q.g, MS[q.m] || Wm.sleeve));
    for (const q of X.sleeve(0.3)) if (q.m === 'cloth') upper.add(new THREE.Mesh(q.g, Wm.sleeve));
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    return { side, g, hand, fore, upper, oh, fk: null };
  }
  function ensureRig() {
    if (rig) return rig;
    const X = G.GFX, W = G.weapons;
    if (!X || !X.openHand || !X.sleeve || !W || !W.vmScene || !W.mats) return null;
    root = new THREE.Group(); W.vmScene.add(root);
    rig = { L: makeArm(-1), R: makeArm(1) };
    return rig;
  }
  // set an arm: its wrist at w and its hand turned by q (the arm's own, right-handed space); the elbow found from the shoulder
  const _c = new V3(), _d = new V3(), _e = new V3(), _u = new V3(), _pv = new V3(), _y = new V3(), _x = new V3(), _m = new THREE.Matrix4(), _sh = new V3();
  function sleeveAlong(obj, from, to, up, len0, thick) {
    _d.subVectors(to, from); const L = _d.length() || 1e-4; _d.divideScalar(L);
    _y.copy(up).addScaledVector(_d, -up.dot(_d)); if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_d, -_d.y); _y.normalize(); _x.crossVectors(_y, _d);
    obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _d)); obj.position.copy(from); obj.scale.set(thick, thick, L / len0);
  }
  // the shoulder goes with the hand: forward and in as the arm reaches out (the shoulder blade slides round), up as the hand is raised
  // above the chest, down a little as it is pressed low
  function shoulderFor(w) {
    const reach = U.clamp((-w.z - 0.36) / 0.16, 0, 1), up = U.clamp((w.y + 0.14) / 0.2, 0, 1), low = U.clamp((-0.2 - w.y) / 0.12, 0, 1) * U.clamp((-w.z - 0.3) / 0.15, 0, 1);
    return _sh.set(SHOULDER.x - 0.018 * reach, SHOULDER.y + 0.035 * up - 0.02 * low, SHOULDER.z - 0.05 * reach - 0.015 * low);
  }
  function poseArm(A, w, q, fa) {
    A.hand.position.copy(w); A.hand.quaternion.copy(q);
    const S = shoulderFor(w);
    // the elbow: where the upper arm and the forearm meet, bent out and down (stretched straight when the wrist is beyond reach)
    _c.copy(CUFF).applyQuaternion(q).add(w);
    _u.subVectors(_c, S); const d = Math.max(1e-4, _u.length()); _u.divideScalar(d);
    const a = UPPER, b = FORE - CUFF.z, dd = Math.min(d, a + b - 1e-4), ax = (a * a - b * b + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, a * a - ax * ax));
    _pv.copy(POLE).addScaledVector(_u, -POLE.dot(_u)).normalize();
    _e.copy(S).addScaledVector(_u, ax * (d / dd)).addScaledVector(_pv, hh);
    _y.set(0, 1, 0).applyQuaternion(q);
    sleeveAlong(A.fore, _c, _e, _y, 0.34, 1);
    const top = _e.clone().addScaledVector(_d.subVectors(_c, _e).normalize(), 0.04);
    sleeveAlong(A.upper, top, S, _y, 0.3, 1.06);
    // the fingers (bent afresh only when they have moved)
    let moved = !A.fk;
    if (!moved) for (let i = 0; i < 20; i++) if (Math.abs(A.fk[i] - fa[i]) > 1e-4) { moved = true; break; }
    if (moved) { A.fk = fa.slice(); A.oh.pose([fa.slice(0, 4), fa.slice(4, 8), fa.slice(8, 12), fa.slice(12, 16)], fa.slice(16, 20)); }
  }

  // ------------------------------------------------ keys made into a way through time
  const EASE = { q: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), o: (t) => 1 - Math.pow(1 - t, 3), i: (t) => t * t * t, s: (t) => t * t * t * (t * (t * 6 - 15) + 10), l: (t) => t };
  const _eu = new THREE.Euler();
  const toQ = (r, out) => out.setFromEuler(_eu.set(r[0], r[1], r[2]));
  // every key given its place, turn and fingers (what is left out taken from the key before; 'grip', 'rest' and 'hand' put where they
  // are now), for the arm on side s (1 right, -1 left)
  function resolve(keys, c, s) {
    const out = []; let p = null, q = REST_Q, f = 'rest';
    const at = (P) => {
      const name = Array.isArray(P) && typeof P[0] === 'string' ? P[0] : P;
      const d = Array.isArray(P) && typeof P[0] === 'string' ? new V3(+P[1] || 0, +P[2] || 0, +P[3] || 0) : null;
      if (name === 'grip' || name === 'gun') {
        const base = c.oneHand && s < 0 ? (name === 'gun' ? c.gun : c.grip) : null;
        if (!base) return REST_P.clone();
        return d ? base.clone().add(d) : base.clone();
      }
      if (P === 'rest') return REST_P.clone();
      return null;
    };
    for (const k of keys) {
      const pp = k.p !== undefined ? k.p : p;
      const qq = k.q || q, ff = k.f || f, Q = toQ(qq, new QT());
      let P;
      if (pp === 'hand' || pp === 'hand+') {
        // the palm (or the finger tip) on the point where the shot leaves the hand; hand+: a little out past it, settling
        const tgt = new V3(c.relP[0], c.relP[1], c.relP[2]);
        if (pp === 'hand+') tgt.add(new V3(-0.006, 0.004, -0.012));
        if (pp === 'hand') c.relTip = k.pt === 'tip';
        P = tgt.sub((k.pt === 'tip' ? TIP : PALM).clone().applyQuaternion(Q));
      } else P = Array.isArray(pp) && typeof pp[0] !== 'string' ? new V3(pp[0], pp[1], pp[2]) : at(pp) || REST_P.clone();
      out.push({ t: k.t, P, Q, F: fingArr(ff), e: k.e || 'q', s: k.s || 0 });
      p = pp === 'hand' || pp === 'hand+' ? [P.x, P.y, P.z] : pp; q = qq; f = ff;
    }
    return out;
  }
  const REST_P = new V3(0.22, -0.52, -0.16);
  // the pose of a resolved way at time t: the wrist by a smooth curve through the keys (each stretch eased), the turn slerped, the
  // fingers between the two keys; and the small shake of a strained hand (s)
  const _w = new V3(), _q = new QT(), _F = new Array(20).fill(0);
  function sample(ks, t, c, side, still) {
    let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[Math.min(ks.length - 1, i + 1)], u0 = U.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1), u = EASE[b.e] ? EASE[b.e](u0) : u0;
    const p0 = ks[Math.max(0, i - 1)].P, p1 = a.P, p2 = b.P, p3 = ks[Math.min(ks.length - 1, i + 2)].P;
    // (Catmull-Rom through the keys: the hand travels on a curve, not from corner to corner)
    const u2 = u * u, u3 = u2 * u;
    _w.set(0, 0, 0).addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u).addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1).addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u).addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
    _q.slerpQuaternions(a.Q, b.Q, u);
    for (let j = 0; j < 20; j++) _F[j] = a.F[j] + (b.F[j] - a.F[j]) * u;
    if (still) return [_w, _q, _F];
    const s = a.s + (b.s - a.s) * u;
    if (s > 0) { const T = c.t * 1.0 + side; _w.x += s * (Math.sin(T * 47) + 0.6 * Math.sin(T * 83 + 1)); _w.y += s * (Math.sin(T * 53 + 2) + 0.5 * Math.sin(T * 97)); _w.z += s * 0.6 * Math.sin(T * 61 + 3); }
    // (a hand never stands quite still: the slow drift of a held arm)
    _w.y += Math.sin(c.t * 2.3 + side) * 0.0012; _w.x += Math.sin(c.t * 1.7 + side * 2) * 0.0009;
    return [_w, _q, _F];
  }

  // ------------------------------------------------ where a thrown shot is drawn from
  // The point in the world that is seen where the hand lets go (the palm, or the finger tip, of the hand that throws at the moment of
  // release, through the arms' camera onto the screen, and VIS_D m out along the line of sight there): null when no throw is being let
  // go. dist: how far out instead (m). Asked by combat.js spawnProjectile (and abilities.js, the bolt of 連鎖雷) while a held throw goes off
  let relC = null;
  const _vp = new V3();
  CA.visFrom = function (dist) {
    const c = relC, W = G.weapons, cam = G.camera; if (!c || !c.arms.length || !W.vmCam || !cam) return null;
    try {
      const a = c.arms[0], [w, q] = sample(a.ks, c.rel, c, a.A.side, true);
      _vp.copy(c.relTip ? TIP : PALM).applyQuaternion(q).add(w); _vp.x *= a.A.side;
      W.vmCam.updateMatrixWorld(); _vp.project(W.vmCam);
      cam.updateMatrixWorld();
      const o = cam.getWorldPosition(new V3()), d = new V3(_vp.x, _vp.y, 0.5).unproject(cam).sub(o).normalize();
      return o.addScaledVector(d, dist || VIS_D);
    } catch (e) { return null; }
  };

  // ------------------------------------------------ the body: laid on the view only while it is drawn
  const BODY = { d: 0, f: 0, p: 0, r: 0, y: 0, s: 0 }, BK = ['d', 'f', 'p', 'r', 'y', 's'], _bt = {};
  // the body of motion c at time t (its keys eased smoothly one to the next; r and y turned over for the left hand)
  function bodyAt(c, t, out) {
    for (const k of BK) out[k] = 0;
    const ks = c.body; if (!ks || !ks.length) return out;
    let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[Math.min(ks.length - 1, i + 1)], u0 = U.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1), u = u0 * u0 * (3 - 2 * u0);
    for (const k of BK) out[k] = a[k] + (b[k] - a[k]) * u;
    // (a motion of the left hand alone leans and turns the other way; one of both hands is as it is written)
    const m = c.side < 0 && !c.both ? -1 : 1;
    out.r *= m; out.y *= m;
    return out;
  }
  const _sp = new V3(), _sq = new QT();
  let bodyOn = false;
  function bodyBefore(r, sc, cam) {
    if (cam !== G.camera || !G.player) return;
    const S = G.save && G.save.data && G.save.data.settings, k = S ? (S.bob === undefined ? 1 : S.bob) : 1;
    if (!(k > 0) || (Math.abs(BODY.d) + Math.abs(BODY.f) + Math.abs(BODY.p) + Math.abs(BODY.r) + Math.abs(BODY.y) + BODY.s) < 1e-5) return;
    if (G.avatar && G.avatar.tpK > 0.01) return;
    _sp.copy(cam.position); _sq.copy(cam.quaternion); bodyOn = true;
    const yaw = G.player.yaw, t = G.game ? G.game.time || 0 : 0;
    cam.position.y -= BODY.d * k;
    cam.position.x -= Math.sin(yaw) * BODY.f * k; cam.position.z -= Math.cos(yaw) * BODY.f * k;
    const tr = BODY.s * k;
    cam.rotateY(BODY.y * k); cam.rotateX(BODY.p * k + tr * (Math.sin(t * 41) + 0.5 * Math.sin(t * 73 + 1))); cam.rotateZ(BODY.r * k + tr * 0.7 * Math.sin(t * 37 + 2));
    cam.updateMatrixWorld();
  }
  function bodyAfter(r, sc, cam) {
    if (!bodyOn || cam !== G.camera) return;
    bodyOn = false; cam.position.copy(_sp); cam.quaternion.copy(_sq); cam.updateMatrixWorld();
  }
  function hookScene() {
    const sc = G.scene; if (!sc || sc.userData.castBody) return;
    const b0 = sc.onBeforeRender, a0 = sc.onAfterRender;
    sc.onBeforeRender = function (r, s, cam, rt) { b0.call(this, r, s, cam, rt); bodyBefore(r, s, cam); };
    sc.onAfterRender = function (r, s, cam) { bodyAfter(r, s, cam); a0.call(this, r, s, cam); };
    sc.userData.castBody = true;
  }
  CA.body = () => Object.assign({}, BODY);

  // ------------------------------------------------ the small sounds of the arms
  function sound(s) {
    const X = G.sfx, P = G.player; if (!X) return;
    try {
      const kind = s[1], a = s[2] || 1;
      if (kind === 'sw') X.whoosh(s[3] || 0.2, a);
      else if (kind === 'cl') X.mech('grab', 0, a);
      else if (kind === 'th') X.land(a, P && P.surfaceBelow ? P.surfaceBelow() : 'stone');
      else if (kind === 'cp') { X.mech('grab', 0, 1.6 * a); X.whoosh(0.08, 0.1 * a); }
    } catch (e) { /* a sound is never worth a motion */ }
  }

  // ------------------------------------------------ the point a hand holds the weapon by, in the view's space
  // where the gun's own left hand is (in the right-handed space of the arms: x turned over); null where there is none
  function gripPoint() {
    const W = G.weapons, m = W.dbgModel && W.dbgModel(); if (!m || !m.lHand || G.player.meleeMode) return null;
    m.group.updateMatrixWorld(true); const p = m.lHand.getWorldPosition(new V3());
    return sagged(new V3(-p.x, p.y, p.z).add(new V3(0.0, -0.015, 0.065)));   // (its wrist: behind the fist that holds the fore-end)
  }
  // a point on the gun as it will be once the motion of the left hand alone has let it sag in the right hand (weapons.js: the gun
  // held in one hand drops and moves out a little as CA.one comes up; a point taken before that would leave the hand above the gun)
  function sagged(v) { const k = 1 - CA.one; v.x -= 0.025 * k; v.y -= 0.02 * k; v.z += 0.015 * k; return v; }
  // where the wrist of a hand laid flat on the gun's receiver is (in the arms' right-handed space: x turned over): on top of it over the
  // ejection port, a little to the hand's own side so the palm lies on it rather than in it; null where there is no gun in hand
  function gunPoint() {
    const W = G.weapons, m = W.dbgModel && W.dbgModel(); if (!m || !m.group || G.player.meleeMode) return null;
    m.group.updateMatrixWorld(true);
    const ej = m.ejector || new V3(0.03, 0.05, 0), top = Math.max(m.railY || 0.06, ej.y + 0.012);
    const p = m.group.localToWorld(new V3(0, top + 0.022, ej.z + 0.03));
    return sagged(new V3(-p.x, p.y, p.z));
  }
  // for a move as it is built: where the hand holds the gun / the point on its receiver now (arrays, in the arms' space), or null
  CA.gripNow = () => { try { const g = gripPoint(); return g ? [g.x, g.y, g.z] : null; } catch (e) { return null; } };
  CA.gunNow = () => { try { const g = gunPoint(); return g ? [g.x, g.y, g.z] : null; } catch (e) { return null; } };
  // a hand weapon's left hand (melee.js W.meleeLeft): free (nothing in it, or the fists' left fist, which this hand takes the place of),
  // or busy (the twin fangs' second blade, a shield): { free, l, grip }
  const BUSY_LEFT = { twin: 1, buckler: 1, tower: 1 };
  function meleeLeft() {
    const W = G.weapons, ml = W.meleeLeft && W.meleeLeft(); if (!ml) return { free: false };
    if (BUSY_LEFT[ml.model]) return { free: false };
    if (!ml.l || !ml.l.visible) return { free: true, l: null, grip: null };
    ml.l.updateMatrixWorld(true); const p = ml.l.getWorldPosition(new V3());
    return { free: true, l: ml.l, grip: new V3(-p.x, p.y - 0.02, p.z + 0.05) };
  }

  // ------------------------------------------------ playing
  CA.busy = () => !!cur;
  CA.current = () => (cur ? { id: cur.id, t: cur.t, dur: cur.dur, rel: cur.rel, oneHand: cur.oneHand, lower: cur.lower, delayed: !!cur.fire, fired: cur.fired } : null);
  CA.pending = (id) => !!(cur && cur.fire && !cur.fired && (!id || cur.id === id));
  // can a motion be played now (not while an item is in use, a grenade is held, or the view is off: the third person, a scope)
  function canPlay() {
    const P = G.player, W = G.weapons;
    if (!P || P.dead || !W || !W.vmScene || !W.vmRoot) return false;
    if (G.ItemAnim && G.ItemAnim.busy()) return false;
    if (G.GrenHold && G.GrenHold.active && G.GrenHold.active()) return false;
    if (G.avatar && G.avatar.tpK > 0.3) return false;
    return true;
  }
  // play the motion of skill / ultimate id. opts: { fire: fn (a held throw: run when the hand is swung through, or at once if the
  // motion is cut), freeze: t (hold the motion at t s - for pictures) }. false when nothing is played
  CA.play = function (id, opts) {
    opts = opts || {};
    if (!canPlay() || !ensureRig()) return false;
    hookScene();
    const e = CA.entryOf(id), mv = build(e); if (!mv || !mv.main) return false;
    if (cur) stop(cur, true);
    const P = G.player, W = G.weapons;
    const side = mv.side === 'R' ? 1 : -1, melee = !!P.meleeMode;
    const ml = melee ? meleeLeft() : null;
    const grip = melee ? ml.grip : gripPoint(), gun = melee ? null : gunPoint();
    // the left hand alone, with a gun (or a hand weapon that leaves the left hand free) in the right: the weapon stays up and this hand
    // takes the place of its left one
    const oneHand = !mv.both && side < 0 && (melee ? ml.free : !!grip);
    const c = cur = { id, t: opts.freeze !== undefined ? opts.freeze : 0, freeze: opts.freeze, dur: mv.dur, rel: mv.rel, oneHand, lower: !oneHand, both: mv.both, side,
      w: P.weapon, melee, fire: opts.fire || null, fired: false, area: G.game && G.game.area, tick: mv.tick, grip, gun, relP: mv.relP, relTip: false,
      body: mv.body, jolt: mv.jolt.slice(), snd: mv.snd, si: 0, arms: [] };
    const main = side < 0 ? rig.L : rig.R, other = side < 0 ? rig.R : rig.L;
    c.arms.push({ A: main, ks: resolve(mv.main, c, main.side) });
    if (mv.both) c.arms.push({ A: other, ks: resolve(mv.off || mv.main, c, other.side) });
    for (const a of c.arms) a.A.g.visible = true;
    if (mv.prop) { try { const o = mv.prop(); if (o) { o.visible = true; main.hand.add(o); c.prop = o; } } catch (e) { console.error(e); } }
    if (oneHand) {
      if (melee) { if (ml.l) { c.lHand = ml.l; ml.l.visible = false; } }
      else { const m = W.dbgModel(); c.lHand = m.lHand; m.lHand.visible = false; }
    }
    root.visible = true;
    if (c.freeze !== undefined) { c.jolt.length = 0; c.si = c.snd.length; bodyAt(c, c.t, BODY); }
    pose(c);
    return true;
  };
  // a skill's effect held back until its throw is swung through: true when the motion was started and run is left to it (abilities.js)
  CA.hold = function (id, run) {
    const e = CA.entryOf(id), mv = build(e);
    if (!mv || !mv.release || mv.delay <= 0) return false;
    return CA.play(id, { fire: run });
  };
  // a skill or ultimate went off: its motion (unless it is the throw already under way for it)
  CA.cast = function (id) { if (cur && cur.id === id && cur.fire) return; CA.play(id); };
  // the skill did not go off (no target): a held throw is swung through all the same
  CA.fail = function () { };
  function release(c) {
    if (!c.fire || c.fired) return;
    c.fired = true;
    const P = G.player;
    if (P.dead || (G.game && c.area !== G.game.area)) return;
    // (let go from the hand only when the hand is where it lets go: a throw cut short goes off from where the shot always started)
    relC = c.t >= c.rel - 1e-4 ? c : null;
    try { c.fire(); } catch (e) { console.error(e); } finally { relC = null; }
  }
  function stop(c, now) {
    if (c.fire && !c.fired) release(c);
    for (const a of c.arms) a.A.g.visible = false;
    if (c.prop && c.prop.parent) c.prop.parent.remove(c.prop);
    if (c.lHand) c.lHand.visible = true;
    if (cur === c) cur = null;
  }
  // cut the motion off at once (a shot, a reload ... : weapons.js); what it held back goes off now
  CA.cut = function (why) { if (cur && cur.freeze === undefined) { CA._why = why; stop(cur, true); } };
  CA.stop = () => { if (cur) stop(cur, true); for (const k of BK) BODY[k] = 0; };
  function pose(c) {
    for (const a of c.arms) { const [w, q, F] = sample(a.ks, c.t, c, a.A.side); poseArm(a.A, w, q, F); }
    if (c.tick) { try { c.tick(c, c.t, rig); } catch (e) { console.error(e); } }
  }
  // what cuts a motion short (see the head of the file)
  function cutBy(c) {
    const P = G.player, W = G.weapons, I = G.input;
    if (P.dead) return 'dead';
    if (I.mouse && I.mouse[2]) return 'ads';
    if (W.switchT > 0 || P.weapon !== c.w || !!P.meleeMode !== c.melee) return 'switch';
    if (G.ItemAnim && G.ItemAnim.busy()) return 'item';
    if (G.GrenHold && G.GrenHold.active && G.GrenHold.active()) return 'grenade';
    if (c.melee && I.mpressed && I.mpressed[0]) return 'melee';
    if (!c.melee && P.weapon && P.weapon.reloading) return 'reload';
    if (G.avatar && G.avatar.tpK > 0.3) return 'view';
    return null;
  }
  CA.update = function (dt) {
    const c = cur;
    if (c && c.freeze === undefined) {
      const why = cutBy(c);
      if (why) { CA._why = why; stop(c, true); }
    }
    CA.lowerWant = cur && cur.lower ? 1 : 0;
    CA.one = U.damp(CA.one, cur && cur.oneHand ? 1 : 0, cur && cur.oneHand ? 16 : 10, dt);
    // the body: where the motion has it now (a motion cut short lets the body come back quickly, not at a jump)
    if (cur && cur.freeze !== undefined) bodyAt(cur, cur.t, BODY);
    else {
      if (cur) bodyAt(cur, cur.t + dt, _bt); else for (const k of BK) _bt[k] = 0;
      for (const k of BK) BODY[k] = cur ? _bt[k] : U.damp(BODY[k], 0, 14, dt);
    }
    if (!cur) return;
    if (c.freeze === undefined) {
      c.t += dt;
      while (c.si < c.snd.length && c.snd[c.si][0] <= c.t) sound(c.snd[c.si++]);
      for (let i = c.jolt.length - 1; i >= 0; i--) if (c.jolt[i][0] <= c.t) { const a = c.jolt[i][1]; c.jolt.splice(i, 1); if (G.player.addShake && a > 0) G.player.addShake(a); }
    }
    if (c.fire && !c.fired && c.t >= c.rel) release(c);
    if (root) root.visible = !!(G.weapons.vmRoot && G.weapons.vmRoot.visible) || c.freeze !== undefined;
    if (c.t >= c.dur && c.freeze === undefined) { stop(c, false); return; }
    pose(c);
  };
  // the arms made and posed once behind the loading screen (their hands' own copies of gfx.js openHand, the sleeves): the first cast
  // otherwise spends some 70 ms on them (warmup.js, docs/tools/patch/castanim_warm.py)
  CA.warm = function () {
    if (!ensureRig()) return false;
    const F = fingArr('rest');
    for (const A of [rig.L, rig.R]) { poseArm(A, REST_P, toQ(REST_Q, new QT()), F); A.g.visible = false; }
    warmProps();
    return true;
  };
  // the things some moves hold in the hand (the pocket watch of 時間減速, its face drawn on a canvas): made once here, with their shaders
  // made for the hands' scene and their faces sent to the GPU. The first cast made them on the spot - a shader of their own (no other
  // thing in the hands' scene has a drawn face on that material), the canvas drawn and sent - and held that frame.
  function warmProps() {
    const W = G.weapons, R = G.renderer; if (!W || !W.vmScene || !W.vmCam || !R) return;
    const tmp = new THREE.Group(); tmp.position.set(0, -0.1, -0.4);
    for (const k in MOVES) {
      let mv = null; try { mv = MOVES[k]({}); } catch (e) { mv = null; }
      if (!mv || typeof mv.prop !== 'function') continue;
      try { const o = mv.prop(); if (o && !o.parent) { o.visible = true; tmp.add(o); } } catch (e) { /* made with the first cast */ }
    }
    if (!tmp.children.length) return;
    W.vmScene.add(tmp); W.vmScene.updateMatrixWorld(true);
    try {
      const cmp = () => R.compile(W.vmScene, W.vmCam);
      if (G.Post && G.Post.withTarget) G.Post.withTarget(cmp); else cmp();
      if (G.Post && G.Post.drawWarm) G.Post.drawWarm(W.vmScene, W.vmCam, true);
      tmp.traverse((o) => { const m = o.material; if (m && m.map) { try { R.initTexture(m.map); } catch (e) { /* sent at its first sight */ } } });
    } catch (e) { /* made with the first cast */ }
    W.vmScene.remove(tmp);
    for (const o of tmp.children.slice()) tmp.remove(o);
  }
  // every id in the tables, and the moves
  CA.ids = () => Object.keys(TABLE);
  CA.moves = () => Object.keys(MOVES);
})();
