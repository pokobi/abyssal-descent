'use strict';
// First-person motions of the arms for skills and ultimates (a throw swung through, a dash that parts the air with both hands, a palm
// struck out, the ground slammed ...). The motions are made of a set of moves (MOVES below); which move each skill and ultimate uses,
// and with what values, is in two tables of their own: js/castanim_skills.js and js/castanim_ults.js (G.CastAnim.table(...)).
//
// How a motion is drawn. Each arm is posed from two things only, the place of its wrist and the turn of its hand; the elbow is found
// from the shoulder (two bones, the elbow out and down), so the arm bends at its joints by itself. The hand is gfx.js openHand (its
// fingers bent at their joints each frame); the forearm and the upper arm wear gfx.js sleeve. A motion's keys are written for the RIGHT
// hand; the left arm is the right one in a mirror (its root turned over in x), so the same keys serve either side.
//
// The weapon. A motion of the left hand alone leaves the gun in the right hand (its own left hand, weapons.js model.lHand, is hidden
// and this left hand takes its place, from where it held the gun and back to it). Any other motion (both hands, the right hand, or a
// hand weapon in hand) lowers the weapon the way an item's use does (ItemAnim.lower). A shot, aiming, a switch of weapon, a reload,
// an item or a grenade cuts a motion off at once: it never holds up play.
//
// The time of play is not changed, but for this: a throw (a move whose entry has release) may hold the skill's effect back until the
// hand is swung through - its rel, never more than MAX_DELAY s (abilities.js A.cast asks CA.hold). The hand is then where the shot
// starts on the screen (P.handPos, seen through the view's camera: 'hand' keys), so the shot leaves the hand. Everything else plays
// from the moment of the cast, its keys set so that the hand is in place when the effect shows.
(function () {
  const CA = (G.CastAnim = { lowerWant: 0, one: 0 });
  const U = G.U, V3 = THREE.Vector3, QT = THREE.Quaternion;
  const MAX_DELAY = 0.12;
  CA.MAX_DELAY = MAX_DELAY;

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
    // spread and stiff, bent a little back (a palm struck out, a hand flung open)
    splay: fing((i) => [-0.12 - (i === 3 ? 0.04 : 0), -0.05, 0.0, sp(i) * 0.17], [0.05, 0.1, 0.1, 0.1]),
    // pressed down on the ground: the fingers bent back hard, spread
    press: fing((i) => [-0.32, 0.08, 0.04, sp(i) * 0.15], [-0.08, 0.05, 0.08, 0.36]),
    // the edge of the hand: fingers straight and close, the thumb in along the palm
    blade: fing((i) => [0.04, 0.03, 0.02, -sp(i) * 0.03], [0.3, 0.22, 0.12, -0.28]),
    fist: fing((i) => [1.9 + i * 0.04, 2.05, 1.4, 0], [1.0, 1.0, 0.9, -0.6]),
    // closed round a thing to be thrown
    hold: fing((i) => [0.82 + i * 0.05, 0.95, 0.6, sp(i) * 0.06], [0.45, 0.42, 0.35, 0.12]),
    // just let go: open, the fingers trailing
    release: fing((i) => [0.08 + i * 0.04, 0.16, 0.06, sp(i) * 0.12], [-0.05, 0.06, 0.05, 0.26]),
    // a claw opened wide (before it closes on something)
    clawOpen: fing((i) => [0.12, 0.48, 0.42, sp(i) * 0.15], [0.0, 0.32, 0.4, 0.3]),
    claw: fing((i) => [0.8, 1.35, 1.05, sp(i) * 0.1], [0.45, 0.62, 0.7, 0.1]),
    // the first finger out, the rest closed, the thumb over the middle finger
    point: fing((i) => (i === 0 ? [-0.02, 0.03, 0.02, -0.03] : [1.9 + i * 0.04, 2.05, 1.4, 0]), [0.95, 0.9, 0.7, -0.45]),
    // a sign of two fingers: the first and middle up, the ring and little closed under the thumb
    seal: fing((i) => (i < 2 ? [0.0, 0.02, 0.02, (i ? -0.02 : 0.02)] : [1.9 + i * 0.04, 2.05, 1.4, 0]), [1.05, 1.0, 0.8, -0.6]),
    // round the gun's fore-end (the hand that goes back to it)
    grip: fing((i) => [0.78 + i * 0.05, 0.9, 0.62, sp(i) * 0.04], [0.42, 0.4, 0.3, 0.1]),
  };
  CA.FING = FING;
  const fingArr = (f) => { const F = typeof f === 'string' ? FING[f] || FING.rest : f; return F.f.flat().concat(F.t); };

  // ------------------------------------------------ the moves
  // A move: (o) => { dur, rel, hit, both, release, main: [keys], off: [keys] | null }. o: the table's entry (its values: side, speed,
  // angle, hold, high, f, at ...). dur: its length (s); rel: the moment the effect leaves the hand (s, for a release); hit: the moment
  // the hand is in place for the effect (s; o.at moves it); both: two hands (else the main hand alone; off may still give the other
  // hand a small part when both). Keys (seconds, written for the right hand):
  //   { t, p: [x, y, z] | 'grip' | 'rest' | 'hand', q: [rx, ry, rz], f: finger preset | { f, t }, e: easing to it, s: tremor (m), pt }
  //   p: where the wrist is, in the view's space (the eye at the origin, -z ahead; ~0.45 m out is the hands' distance). 'grip': where
  //      the hand holds the gun (or out of sight below when it is lowered); 'rest': down out of sight; 'hand': the palm (pt 'tip': the
  //      finger tips) where the skill's shot starts on the screen.
  //   q: the hand's turn (Euler XYZ). [0, 0, 0]: palm down, fingers ahead. [1.5, 0, 0]: palm ahead, fingers up. [0, 0, -1.57]: palm
  //      in towards the middle (a blade). [0, 0, 3.1]: palm up.
  //   Left out: as the key before. e: q (in and out, the default), o (out: sets off fast, settles), i (in: gathers speed), s (smoother),
  //   l (even).
  const MOVES = {};
  CA.MOVES = MOVES;
  CA.move = (name, fn) => { MOVES[name] = fn; };
  const GRIP_Q = [0.35, 0.35, -2.3], REST_Q = [-0.4, 0.1, 0.5];
  const v = (o, k, d) => (o && o[k] !== undefined ? o[k] : d);

  // 上手投げ: the hand comes over from behind the shoulder (out of sight above), swung through to where the shot leaves it (rel),
  // follows through down across the body, and goes back to the gun. angle: the arm laid over to the side (a side-arm throw)
  MOVES.overhand = (o) => {
    const a = v(o, 'angle', 0), r = 0.12;
    return { dur: 0.64, rel: r, hit: r, release: true, main: [
      { t: 0, p: [0.25 + a * 0.12, 0.05 - a * 0.08, -0.14], q: [2.3, -0.35 - a, -0.5 - a], f: 'hold' },
      { t: 0.05, p: [0.2 + a * 0.08, -0.02, -0.32], q: [1.6, -0.25 - a * 0.6, -0.4 - a * 0.6], e: 'i' },
      { t: r, p: 'hand', q: [0.55, -0.1, -0.25 - a * 0.3], f: 'release', e: 'l' },
      { t: r + 0.09, p: [0.03, -0.15, -0.42], q: [-0.5, 0.45, -0.6], f: 'relax', e: 'o' },
      { t: 0.32, p: [0.01, -0.18, -0.4], q: [-0.6, 0.5, -0.7], e: 's' },
      { t: 0.64, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }] };
  };
  // 下手投げ: from low behind, the arm swung forward and up, let go low in front (rel), the hand rising after it
  MOVES.underhand = (o) => {
    const r = 0.12, hi = v(o, 'high', 0);
    return { dur: 0.66, rel: r, hit: r, release: true, main: [
      { t: 0, p: [0.25, -0.44, 0.02], q: [-1.0, 0.1, -2.7], f: 'hold' },
      { t: 0.06, p: [0.22, -0.38, -0.2], q: [-0.2, 0.05, -2.85], e: 'i' },
      { t: r, p: 'hand', q: [0.55, 0, -2.95], f: 'release', e: 'l' },
      { t: r + 0.12, p: [0.1, -0.17 + hi * 0.06, -0.5], q: [0.5, 0, -2.85], f: 'splay', e: 'o' },
      { t: 0.36, p: [0.11, -0.18 + hi * 0.06, -0.49], q: [0.4, 0, -2.8], f: 'relax', e: 's' },
      { t: 0.66, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }] };
  };
  // 突き出す（掌底）: drawn back to the chest, the palm struck out (the heel of the hand first, the fingers bent back), held a moment
  // against the recoil, back. release: the shot leaves the palm (at 'hand'); else it is struck out to front (o.front: [x, y, z])
  MOVES.palm = (o) => {
    const h = 0.1, rel = !!o.release, fr = v(o, 'front', [0.08, -0.12, -0.56]);
    return { dur: 0.62, rel: h, hit: h, release: rel, main: [
      { t: 0, p: [0.17, -0.25, -0.2], q: [1.15, 0.05, -0.25], f: 'flat' },
      { t: 0.045, p: [0.15, -0.21, -0.28], q: [1.25, 0.02, -0.2], e: 'i' },
      { t: h, p: rel ? 'hand' : fr, q: [1.55, -0.05, -0.12], f: 'splay', e: 'l', pt: 'palm' },
      { t: h + 0.06, p: rel ? 'hand+' : [fr[0] + 0.01, fr[1] - 0.005, fr[2] + 0.03], q: [1.5, -0.05, -0.12], e: 'o', s: 0.0015 },
      { t: 0.34, f: 'relax', q: [1.2, 0, -0.2], e: 's' },
      { t: 0.62, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }] };
  };
  // 両手で押し出す: both palms drawn to the chest and driven out together, held out, let down
  MOVES.push2 = (o) => {
    const h = 0.08, w = v(o, 'wide', 0), lo = v(o, 'low', 0);
    const keys = (d) => [
      { t: 0, p: [0.15 + w * 0.05, -0.25 - lo * 0.05, -0.18], q: [1.2, 0.15, -0.35], f: 'flat' },
      { t: h + d, p: [0.11 + w * 0.1, -0.11 - lo * 0.12, -0.53], q: [1.52, -0.1, -0.18], f: 'splay', e: 'o' },
      { t: h + 0.06 + d, p: [0.115 + w * 0.1, -0.12 - lo * 0.12, -0.51], e: 'o', s: 0.002 },
      { t: 0.34, p: [0.12 + w * 0.1, -0.15 - lo * 0.12, -0.48], q: [1.35, -0.05, -0.2], f: 'relax', e: 's' },
      { t: 0.6, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.6, hit: h, both: true, main: keys(0), off: keys(0.012) };
  };
  // 地面を叩く: the fist (or the flat hand: o.palm) thrown up and brought down hard to the foot of the view, the jolt of the blow,
  // held, back. both: the two together
  MOVES.slam = (o) => {
    const h = 0.075, pm = !!o.palm, f = pm ? 'splay' : 'fist', qd = pm ? [-0.35, 0, 0.1] : [-0.25, 0.1, -1.35];
    const keys = (d) => [
      { t: 0, p: [0.12, 0.05, -0.42], q: pm ? [0.4, 0, 0.1] : [-0.7, 0.1, -1.3], f },
      { t: h + d, p: [0.09, -0.2, -0.48], q: qd, e: 'i' },
      { t: h + 0.045 + d, p: [0.09, -0.185, -0.475], e: 'o', s: 0.003 },
      { t: 0.36, p: [0.1, -0.195, -0.48], f: pm ? 'press' : 'fist', e: 's' },
      { t: 0.62, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: 0.62, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.01) : null };
  };
  // 地面に手を付く: the hand brought down flat, fingers spread, to the foot of the view, pressed down and held there, lifted off
  MOVES.plant = (o) => {
    const h = 0.09, hold = v(o, 'hold', 0.4);
    const keys = (d) => [
      { t: 0, p: [0.14, -0.08, -0.4], q: [0.1, 0.05, 0.15], f: 'splay' },
      { t: h + d, p: [0.1, -0.2, -0.5], q: [-0.45, 0.05, 0.08], f: 'press', e: 'i' },
      { t: h + 0.05 + d, p: [0.1, -0.21, -0.5], e: 'o', s: 0.002 },
      { t: h + hold, p: [0.1, -0.212, -0.5], e: 'l', s: 0.001 },
      { t: h + hold + 0.3, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: h + hold + 0.3, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.015) : null };
  };
  // 掲げる: the hand raised before the face, palm out (f: 'fist' - a fist raised; high: up to the top of the view), held, let down.
  // both: the two hands
  MOVES.raise = (o) => {
    const h = 0.11, fist = v(o, 'f', 'splay') === 'fist', hi = v(o, 'high', 0), hold = v(o, 'hold', 0.4), w = o.both ? 0.05 : 0;
    const qUp = fist ? [1.25, 0.1, -1.45] : [1.5, -0.05, -0.2], fu = fist ? 'fist' : v(o, 'f', 'splay'), zf = fist ? 0.05 : 0;
    const keys = (d) => [
      { t: 0, p: [0.17 + w, -0.28, -0.3], q: [0.6, 0.05, -0.5], f: 'relax' },
      { t: h + d, p: [0.12 + w - zf, -0.01 + hi * 0.07 - zf * 1.6, -0.4 + zf], q: qUp, f: fu, e: 'o' },
      { t: h + 0.06 + d, p: [0.12 + w - zf, 0.0 + hi * 0.07 - zf * 1.6, -0.4 + zf], e: 'o' },
      { t: h + hold, p: [0.12 + w - zf, -0.005 + hi * 0.07 - zf * 1.6, -0.398 + zf], e: 'l', s: 0.001 },
      { t: h + hold + 0.32, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: h + hold + 0.32, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.02) : null };
  };
  // 両手でかき分ける（ダッシュ）: the two hands meet before the chest, palms out, and sweep apart and back out of sight - the air
  // parted ahead of the body
  MOVES.part = (o) => {
    const wd = v(o, 'wide', 0);
    const keys = (d) => [
      { t: 0, p: [0.035, -0.11, -0.43], q: [0.45, -0.1, 1.25], f: 'flat' },
      { t: 0.035 + d, p: [0.05, -0.105, -0.44], e: 'l' },
      { t: 0.16 + d, p: [0.25 + wd * 0.04, -0.1, -0.34], q: [0.15, 0.65, 1.4], f: 'splay', e: 'o' },
      { t: 0.3 + d, p: [0.32 + wd * 0.04, -0.3, -0.16], q: [-0.4, 0.8, 1.2], f: 'relax', e: 'q' },
      { t: 0.44, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.44, hit: 0.04, both: true, main: keys(0), off: keys(0.01) };
  };
  // 引いて突く: the fist drawn back to the side and driven straight out (release: the shot leaves it, at 'hand'), back
  MOVES.thrust = (o) => {
    const h = v(o, 'hitT', 0.1), rel = !!o.release;
    return { dur: h + 0.45, rel: h, hit: h, release: rel, main: [
      { t: 0, p: [0.21, -0.23, -0.12], q: [0.15, 0.2, -1.3], f: 'fist' },
      { t: h * 0.4, p: [0.22, -0.22, -0.15], e: 'o' },
      { t: h, p: rel ? 'hand' : [0.06, -0.13, -0.6], q: [0.05, -0.05, -1.42], e: 'i', pt: 'palm' },
      { t: h + 0.05, p: rel ? 'hand+' : [0.065, -0.135, -0.57], e: 'o', s: 0.002 },
      { t: h + 0.2, q: [0.1, 0, -1.35], e: 's' },
      { t: h + 0.45, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }] };
  };
  // 薙ぐ: the edge of the hand swept flat across the view from the outside in, through and past
  MOVES.sweep = (o) => {
    const a = v(o, 'angle', 0), h = 0.09;
    return { dur: 0.6, hit: h, both: false, main: [
      { t: 0, p: [0.34, -0.06 + a * 0.1, -0.2], q: [0.15, 0.6, -1.5 - a], f: 'blade' },
      { t: 0.045, p: [0.22, -0.09 + a * 0.05, -0.43], q: [0.12, 0.3, -1.52 - a], e: 'i' },
      { t: h, p: [0.0, -0.12, -0.48], q: [0.1, -0.15, -1.55 - a], e: 'l' },
      { t: h + 0.08, p: [-0.24, -0.18 - a * 0.05, -0.34], q: [0.05, -0.75, -1.6 - a], e: 'o' },
      { t: 0.3, p: [-0.26, -0.22, -0.32], f: 'relax', e: 's' },
      { t: 0.6, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }] };
  };
  // 握りつぶす: the hand out, its fingers spread into a claw, slowly closing on what is there, then crushed shut with a twist of
  // the wrist and a shake; pull: drawn back to the body after it
  MOVES.crush = (o) => {
    const h = 0.1, c = v(o, 'close', 0.42), pull = !!o.pull;
    const keys = (d) => [
      { t: 0, p: [0.16, -0.24, -0.3], q: [1.0, 0, -0.2], f: 'relax' },
      { t: h + d, p: [0.1, -0.1, -0.53], q: [1.45, -0.05, -0.12], f: 'clawOpen', e: 'o' },
      { t: c - 0.08 + d, p: [0.1, -0.105, -0.52], f: 'claw', e: 's', s: 0.0008 },
      { t: c + d, p: [0.1, -0.12, -0.5], q: [1.3, 0.05, -0.45], f: 'fist', e: 'i' },
      { t: c + 0.08 + d, p: [0.1, -0.12, -0.5], e: 'l', s: 0.0025 },
      { t: c + 0.3, p: pull ? [0.15, -0.19, -0.3] : [0.1, -0.13, -0.49], q: pull ? [1.0, 0.1, -0.6] : [1.3, 0.05, -0.45], e: pull ? 'o' : 'l', s: 0.001 },
      { t: c + 0.58, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : GRIP_Q, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: c + 0.58, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.025) : null };
  };
  // 指さす・印を結ぶ: sign 'point' - the first finger thrust out at the aim (up: at the sky; release: its tip where the shot starts);
  // 'seal' - two fingers raised before the face, the hand upright
  MOVES.sign = (o) => {
    const h = 0.085, s = v(o, 'sign', 'point'), up = !!o.up, rel = !!o.release, hold = v(o, 'hold', 0.38);
    let pk, qk;
    if (s === 'seal') { pk = [0.035, -0.07, -0.34]; qk = [1.5, 0.1, -1.5]; }
    else if (up) { pk = [0.11, 0.05, -0.42]; qk = [1.55, -0.1, -1.35]; }
    else { pk = rel ? 'hand' : [0.07, -0.1, -0.56]; qk = [0.15, -0.08, -1.4]; }
    return { dur: h + hold + 0.32, rel: h, hit: h, release: rel && s !== 'seal' && !up, main: [
      { t: 0, p: [0.17, -0.25, -0.3], q: [0.5, 0, -0.9], f: 'relax' },
      { t: h, p: pk, q: qk, f: s === 'seal' ? 'seal' : 'point', e: 'o', pt: 'tip' },
      { t: h + 0.05, p: typeof pk === 'string' ? 'hand+' : [pk[0], pk[1] + 0.005, pk[2] + 0.01], e: 'o' },
      { t: h + hold, e: 'l', s: 0.0008 },
      { t: h + hold + 0.32, p: 'grip', q: GRIP_Q, f: 'grip', e: 's' }] };
  };
  // 胸の前で合わせる: the two hands brought together palm to palm before the chest (a prayer; a clap with o.clap), held; open: flung
  // apart after it, palms out
  MOVES.clasp = (o) => {
    const h = v(o, 'clap', 0) ? 0.07 : 0.12, hold = v(o, 'hold', 0.38), open = !!o.open, fs = v(o, 'f', 'flat');
    const keys = (d) => [
      { t: 0, p: [0.16, -0.3, -0.28], q: [1.0, 0.1, -1.2], f: 'relax' },
      { t: h + d, p: [0.05, -0.12, -0.35], q: [1.45, 0.02, -1.57], f: fs, e: o.clap ? 'i' : 'o' },
      { t: h + 0.04 + d, p: [0.05, -0.118, -0.355], e: 'o', s: 0.0008 },
      { t: h + hold, p: [0.051, -0.115, -0.36], e: 'l', s: 0.0008 },
      ...(open ? [{ t: h + hold + 0.12, p: [0.24, -0.06, -0.38], q: [1.5, 0.4, -0.3], f: 'splay', e: 'o' }] : []),
      { t: h + hold + (open ? 0.45 : 0.32), p: 'rest', q: REST_Q, f: 'rest', e: open ? 'q' : 's' }];
    return { dur: h + hold + (open ? 0.45 : 0.32), hit: h, both: true, main: keys(0), off: keys(0.006) };
  };
  // 構えて溜める: both hands out before the body, half facing (holding a weight of air between them), fingers clawed and
  // trembling with the strain for hold s; then thrown open outwards and down
  MOVES.channel = (o) => {
    const h = 0.14, hold = v(o, 'hold', 0.6), fist = v(o, 'f', '') === 'fist';
    const keys = (d) => [
      { t: 0, p: [0.17, -0.3, -0.3], q: [0.6, 0.1, -0.8], f: 'relax' },
      { t: h + d, p: [0.075, -0.095, -0.4], q: fist ? [0.6, 0, -1.4] : [0.55, 0.1, -1.1], f: fist ? 'fist' : 'clawOpen', e: 'o' },
      { t: h + hold * 0.5, p: [0.07, -0.09, -0.41], f: fist ? 'fist' : 'claw', e: 's', s: 0.0018 },
      { t: h + hold, p: [0.068, -0.085, -0.415], e: 'l', s: 0.003 },
      { t: h + hold + 0.12, p: [0.28, -0.15, -0.36], q: [1.3, 0.5, -0.4], f: 'splay', e: 'o' },
      { t: h + hold + 0.42, p: 'rest', q: REST_Q, f: 'rest', e: 'q' }];
    return { dur: h + hold + 0.42, hit: h, both: true, main: keys(0), off: keys(0.02) };
  };
  // what a skill or ultimate that is in neither table does
  CA.DEFAULT = { m: 'raise' };

  // ------------------------------------------------ the tables (js/castanim_skills.js, js/castanim_ults.js)
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
    const out = { dur: tm(mv.dur), rel: mv.rel !== undefined ? tm(mv.rel) : tm(hit), both: !!mv.both, side: e.side || 'L', main: fix(mv.main), off: fix(mv.off), release: !!(mv.release || e.release) && e.release !== false, tick: e.tick || mv.tick || null };
    out.delay = out.release ? Math.min(MAX_DELAY, out.rel) : 0;
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
  const _c = new V3(), _d = new V3(), _e = new V3(), _u = new V3(), _pv = new V3(), _y = new V3(), _x = new V3(), _m = new THREE.Matrix4(), _z = new V3(0, 0, 1);
  function sleeveAlong(obj, from, to, up, len0, thick) {
    _d.subVectors(to, from); const L = _d.length() || 1e-4; _d.divideScalar(L);
    _y.copy(up).addScaledVector(_d, -up.dot(_d)); if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0).addScaledVector(_d, -_d.y); _y.normalize(); _x.crossVectors(_y, _d);
    obj.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _d)); obj.position.copy(from); obj.scale.set(thick, thick, L / len0);
  }
  function poseArm(A, w, q, fa) {
    A.hand.position.copy(w); A.hand.quaternion.copy(q);
    // the elbow: where the upper arm and the forearm meet, bent out and down (stretched straight when the wrist is beyond reach)
    _c.copy(CUFF).applyQuaternion(q).add(w);
    _u.subVectors(_c, SHOULDER); const d = Math.max(1e-4, _u.length()); _u.divideScalar(d);
    const a = UPPER, b = FORE - CUFF.z, dd = Math.min(d, a + b - 1e-4), ax = (a * a - b * b + dd * dd) / (2 * dd), hh = Math.sqrt(Math.max(0, a * a - ax * ax));
    _pv.copy(POLE).addScaledVector(_u, -POLE.dot(_u)).normalize();
    _e.copy(SHOULDER).addScaledVector(_u, ax * (d / dd)).addScaledVector(_pv, hh);
    _y.set(0, 1, 0).applyQuaternion(q);
    sleeveAlong(A.fore, _c, _e, _y, 0.34, 1);
    const top = _e.clone().addScaledVector(_d.subVectors(_c, _e).normalize(), 0.04);
    sleeveAlong(A.upper, top, SHOULDER, _y, 0.3, 1.06);
    // the fingers (bent afresh only when they have moved)
    let moved = !A.fk;
    if (!moved) for (let i = 0; i < 20; i++) if (Math.abs(A.fk[i] - fa[i]) > 1e-4) { moved = true; break; }
    if (moved) { A.fk = fa.slice(); A.oh.pose([fa.slice(0, 4), fa.slice(4, 8), fa.slice(8, 12), fa.slice(12, 16)], fa.slice(16, 20)); }
  }

  // ------------------------------------------------ keys made into a way through time
  const EASE = { q: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), o: (t) => 1 - Math.pow(1 - t, 3), i: (t) => t * t * t, s: (t) => t * t * t * (t * (t * 6 - 15) + 10), l: (t) => t };
  const _qa = new QT(), _qb = new QT(), _eu = new THREE.Euler();
  const toQ = (r, out) => out.setFromEuler(_eu.set(r[0], r[1], r[2]));
  // every key given its place, turn and fingers (what is left out taken from the key before; 'grip', 'rest' and 'hand' put where they
  // are now), for the arm on side s (1 right, -1 left)
  function resolve(keys, c, s) {
    const out = []; let p = null, q = REST_Q, f = 'rest';
    const at = (P) => {
      if (P === 'grip') return c.oneHand && s < 0 && c.grip ? c.grip.clone() : REST_P.clone();
      if (P === 'rest') return REST_P.clone();
      return null;
    };
    for (const k of keys) {
      let pp = k.p !== undefined ? k.p : p;
      const qq = k.q || q, ff = k.f || f, Q = toQ(qq, new QT());
      let P;
      if (pp === 'hand' || pp === 'hand+') {
        // the palm (or the finger tip) on the point of the screen the shot starts from; hand+: a little out past it, settling
        const tgt = c.handPt ? c.handPt.clone() : new V3(0.17, -0.17, -0.44);
        if (s < 0) tgt.x = -tgt.x;
        if (pp === 'hand+') tgt.add(new V3(-0.006, 0.004, -0.012));
        P = tgt.sub((k.pt === 'tip' ? TIP : PALM).clone().applyQuaternion(Q));
      } else P = Array.isArray(pp) ? new V3(pp[0], pp[1], pp[2]) : at(pp) || REST_P.clone();
      out.push({ t: k.t, P, Q, F: fingArr(ff), e: k.e || 'q', s: k.s || 0 });
      p = pp === 'hand' || pp === 'hand+' ? [P.x, P.y, P.z] : pp; q = qq; f = ff;
    }
    return out;
  }
  const REST_P = new V3(0.22, -0.52, -0.16);
  // the pose of a resolved way at time t: the wrist by a smooth curve through the keys (each stretch eased), the turn slerped, the
  // fingers between the two keys; and the small shake of a strained hand (s)
  const _w = new V3(), _q = new QT(), _F = new Array(20).fill(0);
  function sample(ks, t, c, side) {
    let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[Math.min(ks.length - 1, i + 1)], u0 = U.clamp((t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1), u = EASE[b.e] ? EASE[b.e](u0) : u0;
    const p0 = ks[Math.max(0, i - 1)].P, p1 = a.P, p2 = b.P, p3 = ks[Math.min(ks.length - 1, i + 2)].P;
    // (Catmull-Rom through the keys: the hand travels on a curve, not from corner to corner)
    const u2 = u * u, u3 = u2 * u;
    _w.set(0, 0, 0).addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u).addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1).addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u).addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
    _q.slerpQuaternions(a.Q, b.Q, u);
    for (let j = 0; j < 20; j++) _F[j] = a.F[j] + (b.F[j] - a.F[j]) * u;
    const s = a.s + (b.s - a.s) * u;
    if (s > 0) { const T = c.t * 1.0 + side; _w.x += s * (Math.sin(T * 47) + 0.6 * Math.sin(T * 83 + 1)); _w.y += s * (Math.sin(T * 53 + 2) + 0.5 * Math.sin(T * 97)); _w.z += s * 0.6 * Math.sin(T * 61 + 3); }
    // (a hand never stands quite still: the slow drift of a held arm)
    _w.y += Math.sin(c.t * 2.3 + side) * 0.0012; _w.x += Math.sin(c.t * 1.7 + side * 2) * 0.0009;
    return [_w, _q, _F];
  }

  // ------------------------------------------------ the screen point a shot starts from, in the view's space
  const _hp = new V3();
  function handPoint() {
    const P = G.player, cam = G.camera, W = G.weapons; if (!P || !cam || !W.vmCam || !P.handPos) return null;
    try {
      cam.updateMatrixWorld(); _hp.copy(P.handPos()).project(cam);
      const D = 0.44, vf = W.vmCam.fov * Math.PI / 360, asp = W.vmCam.aspect || cam.aspect || 1.78, ty = Math.tan(vf);
      return new V3(_hp.x * D * ty * asp, _hp.y * D * ty, -D);
    } catch (e) { return null; }
  }
  // where the gun's own left hand is (in the right-handed space of the arms: x turned over); null where there is none
  function gripPoint() {
    const W = G.weapons, m = W.dbgModel && W.dbgModel(); if (!m || !m.lHand || G.player.meleeMode) return null;
    m.group.updateMatrixWorld(true); const p = m.lHand.getWorldPosition(new V3());
    return new V3(-p.x, p.y, p.z).add(new V3(0.0, -0.015, 0.065));   // (its wrist: behind the fist that holds the fore-end)
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
    const e = CA.entryOf(id), mv = build(e); if (!mv || !mv.main) return false;
    if (cur) stop(cur, true);
    const P = G.player, W = G.weapons;
    const side = mv.side === 'R' ? 1 : -1, melee = !!P.meleeMode;
    const grip = gripPoint();
    // the left hand alone, with a gun in the right: the gun stays up and this hand takes the place of its left one
    const oneHand = !mv.both && side < 0 && !melee && !!grip;
    const c = cur = { id, t: opts.freeze !== undefined ? opts.freeze : 0, freeze: opts.freeze, dur: mv.dur, rel: mv.rel, oneHand, lower: !oneHand, both: mv.both, side,
      w: P.weapon, melee, fire: opts.fire || null, fired: false, area: G.game && G.game.area, tick: mv.tick, grip, handPt: handPoint(), arms: [] };
    const main = side < 0 ? rig.L : rig.R, other = side < 0 ? rig.R : rig.L;
    c.arms.push({ A: main, ks: resolve(mv.main, c, main.side) });
    if (mv.both) c.arms.push({ A: other, ks: resolve(mv.off || mv.main, c, other.side) });
    for (const a of c.arms) a.A.g.visible = true;
    if (oneHand) { const m = W.dbgModel(); c.lHand = m.lHand; m.lHand.visible = false; }
    root.visible = true;
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
    try { c.fire(); } catch (e) { console.error(e); }
  }
  function stop(c, now) {
    if (c.fire && !c.fired) release(c);
    for (const a of c.arms) a.A.g.visible = false;
    if (c.lHand) c.lHand.visible = true;
    if (cur === c) cur = null;
  }
  // cut the motion off at once (a shot, a reload ... : weapons.js); what it held back goes off now
  CA.cut = function (why) { if (cur && cur.freeze === undefined) { CA._why = why; stop(cur, true); } };
  CA.stop = () => { if (cur) stop(cur, true); };
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
    if (!cur) return;
    if (c.freeze === undefined) c.t += dt;
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
    return true;
  };
  // every id in the tables, and the moves
  CA.ids = () => Object.keys(TABLE);
  CA.moves = () => Object.keys(MOVES);
})();
