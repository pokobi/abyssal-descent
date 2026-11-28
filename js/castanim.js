'use strict';
// First-person motions of the arms for skills and ultimates (a throw swung through, a dash that parts the air with both hands, a palm
// struck out, the ground slammed ...). The motions are made of a set of moves (MOVES below); which move each skill and ultimate uses,
// and with what values, is in two tables of their own: js/castanim_skills.js and js/castanim_ults.js (G.CastAnim.table(...)).
//
// How an arm is drawn. A motion's keys give the place of the wrist and the turn of the hand; the rest is a person's arm:
//   - the shoulder, below and behind the eye, goes with the hand (forward and in as the arm reaches, up as the hand is raised above
//     the chest, across as it reaches over the body), as the shoulder blade slides round the ribs;
//   - the upper arm and the forearm are of fixed lengths: the arm never stretches (a wrist put out of reach is drawn back into it);
//   - the elbow is found on the circle it can lie on (shoulder and wrist fixed), where the arm is most at ease: the wrist bent within
//     what a wrist does, the forearm turned within what it turns (palm down and the elbow goes out, palm up and it comes in), the
//     elbow low (it hangs), out of the chest and the head, not above the shoulder unless the hand is. A key may ask for the elbow to
//     go near a point (el);
//   - the turn of the hand is split into the turn of the forearm and the bend of the wrist (hand.js pose w): what a wrist cannot do,
//     the hand does not do (the hand is turned back into reach, never the wrist broken);
//   - the forearm wears gfx.js sleeve (from the glove's cuff past the bracer); from there over the elbow to the shoulder one tube of
//     cloth (made here) bends at the elbow round a curve, pressed together on its inner side and drawn over the point of the elbow.
// Timing. The wrist goes where the keys say, when they say it (the arm leads); the turn of the hand follows it through a spring (a
// little behind, a little past as it stops, then back), and the fingers each a little after that (closing from the little finger,
// opening from the first). A hand held still breathes. A motion's keys are written for the RIGHT hand; the left arm is the right one
// in a mirror (its root turned over in x), so the same keys serve either side.
//
// The body. Each move has a motion of the body of its own (body keys: the view sinks, leans forward, tips, turns - a throw leans into
// it, a slam drops the shoulders, a charge crouches and trembles), a jolt where a blow lands (player.js addShake: 設定の画面揺れ) and
// the small sounds of the arms (cloth, a swing through the air, a hand on the ground). The body is laid on the view only where it is
// drawn (the scene's onBeforeRender, taken off again after it), at 設定の視点の揺れ: the camera the game aims and shoots from never
// moves with it, so where a shot starts and where it goes are as they were.
//
// The weapon. A motion of the left hand alone leaves the gun in the right hand (its own left hand, weapons.js model.lHand, is hidden
// and this left hand takes its place, from where it held the gun and back to it, in the very shape and turn it held it in); with a
// hand weapon (melee.js) the left hand is free but for the fists (the left fist is hidden the same way), the twin fangs and a shield,
// which lower it. Any other motion (both hands, the right hand) lowers the weapon the way an item's use does (ItemAnim.lower). A shot,
// aiming, a switch of weapon, a reload, an item or a grenade cuts a motion off at once: it never holds up play.
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
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------ the fingers
  // A hand's shape: f, the four fingers (first, middle, ring, little), each [knuckle, middle joint, last joint, spread (+ towards the
  // little finger)]; t, the thumb [root (across the palm), first joint, second joint, spread (out of the palm's plane, to its front)].
  // Radians, + curls to the palm (hand.js pose; held within hand.js X.Hand.LIM, which stops what goes past a hand's reach). No two
  // fingers alike: a hand closes deeper on its little-finger side, its fingers fan out from the middle one as they open, and the first
  // finger stays the straightest.
  const hf = (i, m, r, l, t) => ({ f: [i, m, r, l], t });
  const FING = {
    // hanging at ease: each finger a little more curled than the one before it, the thumb lying along the first finger
    rest: hf([0.16, 0.26, 0.14, -0.06], [0.22, 0.34, 0.18, 0], [0.29, 0.42, 0.22, 0.05], [0.36, 0.48, 0.26, 0.11], [0.12, 0.14, 0.18, 0.22]),
    // at ease, held up (the hand on its way to or from something)
    relax: hf([0.26, 0.4, 0.2, -0.05], [0.34, 0.5, 0.26, 0], [0.42, 0.58, 0.3, 0.05], [0.5, 0.64, 0.34, 0.1], [0.22, 0.22, 0.28, 0.3]),
    // the fingers straight and together, the thumb laid along the side of the hand (a hand pushed flat against something)
    flat: hf([0.03, 0.06, 0.04, -0.02], [0.02, 0.05, 0.04, 0], [0.04, 0.07, 0.05, 0.02], [0.08, 0.1, 0.06, 0.04], [0.04, 0.08, 0.1, 0.06]),
    // spread and stiff, bent a little back at the knuckles (a palm struck out, a hand flung open); the thumb out from the hand, not
    // square to it
    splay: hf([-0.12, 0.02, 0.03, -0.3], [-0.1, 0.03, 0.03, -0.05], [-0.08, 0.05, 0.04, 0.12], [-0.05, 0.08, 0.05, 0.3], [-0.12, 0.05, 0.08, 0.38]),
    // pressed down on the ground: the fingers bent back hard at the knuckles, spread, their tips pressing
    press: hf([-0.3, 0.12, 0.08, -0.24], [-0.33, 0.1, 0.07, -0.04], [-0.3, 0.12, 0.08, 0.1], [-0.24, 0.16, 0.09, 0.24], [-0.18, 0.05, 0.02, 0.32]),
    // the edge of the hand: fingers straight and close, the thumb drawn in along the palm
    blade: hf([0.05, 0.06, 0.04, 0.03], [0.04, 0.05, 0.03, 0], [0.06, 0.06, 0.04, -0.03], [0.1, 0.08, 0.05, -0.06], [0.45, 0.22, 0.12, -0.08]),
    // clenched hard: rolled tight into the palm, the little finger deepest, the thumb laid across the first two fingers
    fist: hf([1.42, 1.7, 0.9, 0.03], [1.5, 1.78, 0.95, 0], [1.56, 1.82, 0.98, -0.03], [1.57, 1.83, 1.0, -0.08], [0.82, 0.5, 0.45, 0.8]),
    // closed round a thing to be thrown (a ball the size of a fist): the fingers spread round it, the thumb opposite
    hold: hf([0.6, 0.78, 0.42, -0.14], [0.68, 0.84, 0.48, 0], [0.76, 0.9, 0.52, 0.09], [0.86, 0.95, 0.55, 0.2], [0.5, 0.35, 0.32, 0.6]),
    // just let go: open, the fingers trailing (the first finger last off the thing, straightest)
    release: hf([0.0, 0.08, 0.05, -0.2], [0.08, 0.14, 0.08, -0.02], [0.14, 0.2, 0.11, 0.1], [0.2, 0.26, 0.14, 0.22], [0.02, 0.08, 0.12, 0.36]),
    // a claw opened wide (before it closes on something): the knuckles straight, the middle joints hooked, spread
    clawOpen: hf([0.12, 0.6, 0.42, -0.26], [0.1, 0.66, 0.46, -0.03], [0.14, 0.7, 0.48, 0.12], [0.2, 0.74, 0.5, 0.28], [0.02, 0.3, 0.42, 0.52]),
    claw: hf([0.72, 1.3, 0.95, -0.12], [0.8, 1.4, 1.0, 0], [0.88, 1.45, 1.05, 0.07], [0.96, 1.48, 1.06, 0.16], [0.5, 0.55, 0.65, 0.48]),
    // the first finger out, the rest closed, the thumb over the middle finger
    point: hf([-0.02, 0.04, 0.03, -0.04], [1.42, 1.72, 0.92, 0], [1.54, 1.8, 0.96, -0.02], [1.57, 1.83, 1.0, -0.06], [0.72, 0.55, 0.5, 0.58]),
    // a sign of two fingers: the first and middle up and together, the ring and little closed under the thumb
    seal: hf([0.02, 0.04, 0.03, 0.05], [0.04, 0.05, 0.03, -0.05], [1.5, 1.78, 0.95, 0], [1.57, 1.83, 1.0, -0.05], [0.9, 0.55, 0.6, 0.42]),
    // round the gun's fore-end (hand.js X.Hand.GRIP.fore, read afresh at each use: this is its shape for when it cannot be read)
    grip: hf([-0.22, 1.4, 0.63, 0], [0.26, 1.3, 0.585, 0], [0.3, 1.1, 0.495, 0], [0.18, 0.8, 0.36, 0], [-0.19, -0.05, -0.25, 0.26]),
    // palm to palm (a prayer): the fingers straight and together, a hair curled so their tips meet the other hand's, not cross them
    pray: hf([0.08, 0.1, 0.06, 0.03], [0.06, 0.08, 0.05, 0], [0.08, 0.1, 0.06, -0.02], [0.12, 0.12, 0.07, -0.04], [0.12, 0.1, 0.1, 0.02]),
  };
  CA.FING = FING;
  // the turn of a fist held up before the body with its back and knuckles to the eye (seen from the palm side, curled fingers read as
  // a claw): for a fist raised, braced or shaken
  CA.FIST_Q = [1.3, 0.3, -0.2];
  const fingArr = (f) => {
    if (Array.isArray(f)) return f.slice();
    if (f === 'grip') { const H = G.GFX && G.GFX.Hand, P = H && H.GRIP && H.GRIP.fore; if (P) return P.f.flat().concat(P.t); }
    const F = typeof f === 'string' ? FING[f] || FING.rest : f && f.f ? f : FING.rest;
    return F.f.flat().concat(F.t);
  };

  // ------------------------------------------------ the moves
  // A move: (o) => { dur, rel, hit, both, release, relP, main: [keys], off: [keys] | null, body: [body keys], jolt: [[t, a]],
  // snd: [[t, kind, a, len]], prop: () => Object3D }. o: the table's entry (its values: side, speed, angle, hold, high, f, at ...).
  // dur: its length (s); rel:
  // the moment the effect leaves the hand (s, for a release); hit: the moment the hand is in place for the effect (s; o.at moves it);
  // both: two hands (else the main hand alone; off may still give the other hand a small part when both). relP: where the palm (or the
  // finger tip) lets the shot go, in the view's space (o.hand overrides it). Keys (seconds, written for the right hand):
  //   { t, p: [x, y, z] | 'grip' | 'rest' | 'hand', q: [rx, ry, rz], f: finger shape | { f, t }, e: easing to it, s: tremor (m), pt,
  //     el: [x, y, z] }
  //   p: where the wrist is, in the view's space (the eye at the origin, -z ahead; ~0.45 m out is the hands' distance). 'grip': where
  //      the hand holds the gun (or out of sight below when it is lowered); with q left out (or GRIP_Q) and f 'grip' the hand is put
  //      in the very turn and shape the gun's own left hand has; 'rest': down out of sight; 'hand': the palm (pt 'tip': the
  //      finger tip) on relP, where the shot leaves the hand; 'hand+': a little out past it, settling. ['grip', dx, dy, dz]: that far
  //      from where the hand holds the gun; 'gun' / ['gun', dx, dy, dz]: (that far from) the wrist of a hand laid flat on top of the
  //      gun's receiver, over its ejection port - found for each gun from its own model, so it is on the gun whatever the gun. Both
  //      only mean something for the left hand alone with a gun in the right (CA.gripNow() / CA.gunNow() say whether there is one:
  //      a move asks them when it is built and gives other keys when there is none); without, they fall back to 'rest'.
  //   q: the hand's turn (Euler XYZ). [0, 0, 0]: palm down, fingers ahead. [1.5, 0, 0]: palm ahead, fingers up. [0, 0, -1.57]: palm
  //      in towards the middle (a blade). [0, 0, 1.57]: palm out to the side. [0, 0, 3.1]: palm up. A turn the arm cannot give the
  //      hand from where the wrist is (past the wrist's bend or the forearm's turn) is brought back to the nearest one it can.
  //   el: a point (the view's space) the elbow is drawn towards while this key holds (eased in and out with the keys next to it);
  //      left out, the elbow goes where the arm is most at ease.
  //   Left out: as the key before. e: q (in and out, the default), o (out: sets off fast, settles), i (in: gathers speed), s (smoother),
  //   l (even), b (out past the key a little and back: a hand stopped hard).
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

  // 上手投げ: the hand cocked back by the ear (behind the eye, out of sight), the elbow up and out at the shoulder's height; the elbow
  // leads forward, the forearm whips over it and the wrist snaps, letting go before the face (rel); the hand follows through down
  // across the body and goes back to the gun. angle: the arm laid over to the side (a side-arm throw). The body leans back into the
  // wind-up and forward through the throw, the shoulders turned with it
  MOVES.overhand = (o) => {
    const a = v(o, 'angle', 0), r = 0.12;
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.13 + a * 0.06, -0.08 - a * 0.06, -0.56], main: [
      { t: 0, p: [0.25 + a * 0.08, 0.05 - a * 0.12, 0.05], q: [2.3, -0.25 - a * 0.5, -0.45 - a * 0.5], f: 'hold', el: [0.42, -0.14 - a * 0.08, 0.04] },
      { t: 0.065, p: [0.34 + a * 0.05, 0.0 - a * 0.09, -0.24], q: [1.85, -0.2 - a * 0.45, -0.4 - a * 0.4], e: 'i', el: [0.42, -0.16 - a * 0.06, -0.06] },
      { t: r, p: 'hand', q: [0.75, -0.1, -0.3 - a * 0.3], f: 'release', e: 'l', on: true },
      { t: r + 0.09, p: [0.08, -0.22, -0.5], q: [-0.1, 0.25, -0.55], f: 'relax', e: 'o' },
      { t: 0.38, p: [0.0, -0.38, -0.38], q: [-0.5, 0.35, -0.7], e: 's' },
      { t: 0.66, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, p: 0.012, r: -0.014, y: -0.012, f: -0.01 }, { t: r + 0.035, p: -0.024, r: 0.022, y: 0.014, f: 0.04, d: 0.01 },
        { t: 0.4, p: -0.007, r: 0.005, y: 0.004, f: 0.012 }, { t: 0.66 }],
      snd: [[0, 'cl', 1], [0.035, 'sw', 0.26, 0.22]] };
  };
  // 下手投げ: swung back low beside the hip (out of sight below), palm to the front; the arm swung forward and up, let go before the
  // chest (rel), the open hand rising after it palm up. The body dips into the swing and comes up with it
  MOVES.underhand = (o) => {
    const r = 0.12, hi = v(o, 'high', 0);
    return { dur: 0.66, rel: r, hit: r, release: true, relP: [0.13, -0.18 + hi * 0.03, -0.56], main: [
      { t: 0, p: [0.23, -0.56, 0.06], q: [-1.25, 0.1, 3.0], f: 'hold' },
      { t: 0.06, p: [0.21, -0.43, -0.24], q: [-0.75, 0.05, 3.05], e: 'i' },
      { t: r, p: 'hand', q: [-0.25, 0, 3.05], f: 'release', e: 'l', on: true },
      { t: r + 0.12, p: [0.15, -0.17 + hi * 0.05, -0.53], q: [0.25, 0, 2.95], f: 'splay', e: 'o' },
      { t: 0.38, p: [0.16, -0.21 + hi * 0.05, -0.5], q: [0.1, 0, 2.85], f: 'relax', e: 's' },
      { t: 0.66, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.06, d: 0.018, p: -0.012, f: 0.01 }, { t: r + 0.05, d: 0.004, p: 0.008, f: 0.025, r: 0.008 }, { t: 0.4, f: 0.008 }, { t: 0.66 }],
      snd: [[0, 'cl', 0.9], [0.03, 'sw', 0.2, 0.22]] };
  };
  // 突き出す（掌底）: drawn back to the chest (the elbow down behind), the palm struck out low before the face, the heel of the hand
  // first, the fingers bent back and leaning away; held a moment against the recoil, back. release: the shot leaves the palm (at
  // 'hand'); else it is struck out to front (o.front: [x, y, z]). The body drives in behind it
  MOVES.palm = (o) => {
    const h = 0.1, rel = !!o.release, fr = v(o, 'front', [0.13, -0.19, -0.52]);
    return { dur: 0.64, rel: h, hit: h, release: rel, relP: [0.13, -0.15, -0.58], main: [
      { t: 0, p: [0.19, -0.31, -0.14], q: [1.0, 0.1, -0.5], f: 'flat', el: [0.25, -0.52, 0.04] },
      { t: 0.045, p: [0.19, -0.32, -0.3], q: [0.95, 0.05, -0.35], e: 'i' },
      { t: h, p: rel ? 'hand' : fr, q: [0.85, -0.1, -0.12], f: 'splay', e: 'l', pt: 'palm', on: true },
      { t: h + 0.06, p: rel ? 'hand+' : [fr[0] + 0.005, fr[1] - 0.004, fr[2] + 0.018], q: [0.8, -0.08, -0.15], e: 'b', s: 0.0015 },
      { t: 0.36, f: 'relax', q: [0.7, 0, -0.3], e: 's' },
      { t: 0.64, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.05, f: -0.012, p: 0.004 }, { t: h + 0.025, f: 0.05, p: -0.01, d: 0.008, r: 0.008 }, { t: 0.36, f: 0.016 }, { t: 0.64 }],
      jolt: [[h, 0.04]], snd: [[0, 'cl', 0.8], [0.025, 'sw', 0.22, 0.16]] };
  };
  // 両手で押し出す: both palms drawn to the chest and driven out together, the arms near straight, held out, let down. The body steps
  // into it
  MOVES.push2 = (o) => {
    const h = 0.09, w = v(o, 'wide', 0), lo = v(o, 'low', 0);
    const keys = (d) => [
      { t: 0, p: [0.17 + w * 0.04, -0.31 - lo * 0.05, -0.15], q: [0.95, 0.15, -0.6], f: 'flat' },
      { t: 0.04 + d, p: [0.17 + w * 0.04, -0.38 - lo * 0.05, -0.3], q: [0.7, 0.1, -0.45], e: 'i' },
      { t: h + d, p: [0.15 + w * 0.08, -0.23 - lo * 0.1, -0.58], q: [0.6, -0.15, -0.25], f: 'splay', e: 'o', on: true },
      { t: h + 0.07 + d, p: [0.154 + w * 0.08, -0.235 - lo * 0.1, -0.565], e: 'b', s: 0.002 },
      { t: 0.36, p: [0.16 + w * 0.08, -0.25 - lo * 0.1, -0.53], q: [0.55, -0.05, -0.32], f: 'relax', e: 's' },
      { t: 0.62, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.62, hit: h, both: true, main: keys(0), off: keys(0.012),
      body: [{ t: 0 }, { t: 0.045, f: -0.014, d: 0.006 }, { t: h + 0.025, f: 0.055, p: -0.012, d: 0.012 }, { t: 0.36, f: 0.02, d: 0.004 }, { t: 0.62 }],
      jolt: [[h, 0.07]], snd: [[0, 'cl', 1], [0.03, 'sw', 0.3, 0.2]] };
  };
  // 地面を叩く: the fist (or the flat hand: o.palm) thrown up by the temple, the elbow up and out, and brought down hard to the foot of
  // the view, knuckles down; the jolt of the blow, held, back. both: the two together. The body drops with the blow, the head bowed
  MOVES.slam = (o) => {
    const h = 0.085, pm = !!o.palm, f = pm ? 'splay' : 'fist';
    const keys = (d) => [
      { t: 0, p: [0.18, -0.24, -0.3], q: pm ? [0.6, 0, 0.1] : [0.8, 0.1, -0.9], f },
      { t: h * 0.4 + d, p: [0.22, -0.03, -0.36], q: pm ? [1.35, 0, 0.15] : [1.5, 0.1, -0.7], e: 'o', el: [0.38, -0.2, -0.14] },
      { t: h + d, p: [0.12, -0.31, -0.46], q: pm ? [0.15, 0, 0.1] : [-1.3, 0.1, -0.5], e: 'i', el: [0.33, -0.19, -0.3], on: true },
      { t: h + 0.045 + d, p: [0.12, -0.3, -0.455], e: 'o', s: 0.003 },
      { t: 0.36, p: [0.125, -0.305, -0.46], f: pm ? 'press' : 'fist', e: 's', el: [0.33, -0.2, -0.3] },
      { t: 0.62, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : undefined, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: 0.62, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.01) : null,
      body: [{ t: 0 }, { t: h * 0.4, p: 0.016, d: -0.01 }, { t: h + 0.03, d: 0.095, p: -0.115, f: 0.03 }, { t: 0.36, d: 0.075, p: -0.09, f: 0.02 }, { t: 0.62 }],
      jolt: [[h, o.both ? 0.18 : 0.14]], snd: [[0, 'cl', 0.9], [h * 0.4, 'sw', 0.24, 0.12], [h, 'th', o.both ? 0.4 : 0.3]] };
  };
  // 地面に手を付く: the hand brought down flat, fingers spread, to the foot of the view (the wrist bent back under the weight), pressed
  // down and held there, lifted off. The body goes down on one knee with it
  MOVES.plant = (o) => {
    const h = 0.1, hold = v(o, 'hold', 0.4);
    const keys = (d) => [
      { t: 0, p: [0.17, -0.22, -0.34], q: [0.45, 0.05, 0.15], f: 'splay' },
      { t: h + d, p: [0.12, -0.235, -0.52], q: [0.1, 0.05, 0.1], f: 'press', e: 'i' },
      { t: h + 0.05 + d, p: [0.12, -0.241, -0.518], e: 'o', s: 0.002 },
      { t: h + hold, p: [0.12, -0.243, -0.518], e: 'l', s: 0.001 },
      { t: h + hold + 0.3, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : undefined, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: h + hold + 0.3, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.015) : null,
      body: [{ t: 0 }, { t: h + 0.04, d: 0.09, p: -0.1, f: 0.025 }, { t: h + hold, d: 0.085, p: -0.095, f: 0.022, s: 0.0006 }, { t: h + hold + 0.3 }],
      jolt: [[h, 0.07]], snd: [[0, 'cl', 1], [h, 'th', 0.16]] };
  };
  // 掲げる: the hand raised out before the shoulder, the arm near straight, palm out and the fingers leaning away (f: 'fist' - a fist
  // raised, its back to the eye; high: lifted to the top of the view, the arm coming in from the edge), held, let down. both: the two
  // hands. The body straightens and the head lifts with it
  MOVES.raise = (o) => {
    const h = 0.11, fist = v(o, 'f', 'splay') === 'fist', hi = v(o, 'high', 0), hold = v(o, 'hold', 0.4), w = o.both ? 0.04 : 0;
    const qUp = fist ? [1.3, 0.25, -0.35] : [0.8, -0.15, 0.3], fu = fist ? 'fist' : v(o, 'f', 'splay');
    const P = fist ? [0.18 + w, -0.11 + hi * 0.15, -0.46] : [0.24 + w, -0.1 + hi * 0.17, -0.54 + hi * 0.08];
    const keys = (d) => [
      { t: 0, p: [0.2 + w, -0.32, -0.26], q: [0.7, 0.05, -0.6], f: 'relax' },
      { t: h + d, p: P, q: qUp, f: fu, e: 'o', el: hi > 0.5 ? [0.36 + w, -0.12, -0.2] : undefined },
      { t: h + 0.06 + d, p: [P[0], P[1] + 0.006, P[2] + 0.004], e: 'b', s: fist ? 0.0015 : 0 },
      { t: h + hold, p: [P[0], P[1] + 0.002, P[2] + 0.006], e: 'l', s: fist ? 0.0012 : 0.0008 },
      { t: h + hold + 0.32, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : undefined, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: h + hold + 0.32, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.02) : null,
      body: [{ t: 0 }, { t: h + 0.05, p: 0.022 + hi * 0.03, d: -0.012, f: fist ? 0.015 : 0 }, { t: h + hold, p: 0.018 + hi * 0.025, d: -0.01, s: fist ? 0.0008 : 0 }, { t: h + hold + 0.32 }],
      jolt: fist ? [[h, 0.05]] : null, snd: [[0, 'cl', 1.1], [0.03, 'sw', fist ? 0.2 : 0.12, 0.14]] };
  };
  // 両手でかき分ける（ダッシュ）: the two hands come up together low before the chest, backs together, palms turned out, and sweep wide
  // apart and back past the edges of the view (a breaststroke through the air ahead of the body). The body leans into the rush
  MOVES.part = (o) => {
    const wd = v(o, 'wide', 0);
    const keys = (d) => [
      { t: 0, p: [0.13, -0.33, -0.22], q: [0.35, 0, 1.2], f: 'flat' },
      { t: 0.07 + d, p: [0.05, -0.2, -0.5], q: [0.3, -0.2, 1.5], e: 'o' },
      { t: 0.11 + d, p: [0.056, -0.198, -0.51], e: 'l' },
      { t: 0.25 + d, p: [0.25 + wd * 0.03, -0.18, -0.45], q: [0.25, -0.15, 1.65], f: 'splay', e: 'q' },
      { t: 0.39 + d, p: [0.37 + wd * 0.04, -0.21, -0.22], q: [0.15, -0.5, 1.6], e: 'o' },
      { t: 0.5 + d, p: [0.36, -0.38, -0.06], f: 'relax', e: 'i' },
      { t: 0.62, p: 'rest', q: REST_Q, f: 'rest', e: 'i' }];
    return { dur: 0.62, hit: 0.07, both: true, main: keys(0), off: keys(0.01),
      body: [{ t: 0 }, { t: 0.07, d: 0.01, f: 0.01 }, { t: 0.22, f: 0.055, p: -0.014, d: 0.014 }, { t: 0.42, f: 0.022, d: 0.004 }, { t: 0.62 }],
      snd: [[0, 'cl', 1], [0.08, 'sw', 0.32, 0.3]] };
  };
  // 引いて突く: the fist chambered at the ribs, palm up, the elbow back; driven straight out, turning over palm down as it lands
  // (release: the shot leaves it, at 'hand'), back. The body twists into the blow
  MOVES.thrust = (o) => {
    const h = v(o, 'hitT', 0.1), rel = !!o.release;
    return { dur: h + 0.45, rel: h, hit: h, release: rel, relP: [0.1, -0.13, -0.6], main: [
      { t: 0, p: [0.21, -0.31, -0.07], q: [0.15, 0.1, 2.6], f: 'fist', el: [0.24, -0.46, 0.16] },
      { t: h * 0.4, p: [0.2, -0.29, -0.13], e: 'o' },
      { t: h, p: rel ? 'hand' : [0.09, -0.15, -0.55], q: [0.05, -0.05, -0.35], e: 'i', pt: 'palm', on: true },
      { t: h + 0.05, p: rel ? 'hand+' : [0.094, -0.154, -0.536], e: 'b', s: 0.002 },
      { t: h + 0.2, q: [0.08, 0, -0.5], e: 's' },
      { t: h + 0.45, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: h * 0.45, f: -0.012, y: -0.012, r: -0.006 }, { t: h + 0.025, f: 0.055, y: 0.016, r: 0.012, d: 0.008 }, { t: h + 0.22, f: 0.015, y: 0.004 }, { t: h + 0.45 }],
      jolt: [[h, 0.05]], snd: [[0, 'cl', 0.9], [h * 0.5, 'sw', 0.24, 0.14]] };
  };
  // 薙ぐ: the arm out to the side, the hand edge-on and palm up, swept flat across the view from the outside in (the little finger's
  // edge leading), through and past, the elbow bending as the hand crosses the body. The shoulders turn with it
  MOVES.sweep = (o) => {
    const a = v(o, 'angle', 0), h = 0.09;
    return { dur: 0.6, hit: h, both: false, main: [
      { t: 0, p: [0.36, -0.08 + a * 0.1, -0.22], q: [0.15, 0.55, 2.3 - a], f: 'blade' },
      { t: 0.045, p: [0.24, -0.1 + a * 0.05, -0.42], q: [0.12, 0.3, 2.4 - a], e: 'i' },
      { t: h, p: [0.02, -0.16, -0.53], q: [0.1, -0.15, 2.5 - a], e: 'l' },
      { t: h + 0.08, p: [-0.22, -0.18 - a * 0.05, -0.38], q: [0.05, -0.65, 2.45 - a], e: 'o' },
      { t: 0.3, p: [-0.25, -0.26, -0.33], f: 'relax', e: 's' },
      { t: 0.6, p: 'grip', f: 'grip', e: 's' }],
      body: [{ t: 0 }, { t: 0.04, y: -0.018, r: -0.01 }, { t: h + 0.06, y: 0.03, r: 0.016, f: 0.015 }, { t: 0.32, y: 0.008, r: 0.004 }, { t: 0.6 }],
      snd: [[0, 'cl', 0.8], [0.03, 'sw', 0.28, 0.18]] };
  };
  // 握りつぶす: the hand out, palm to what is there, its fingers spread into a claw, slowly closing on it, then crushed shut with a
  // turn of the wrist and a shake; pull: drawn back to the body after it
  MOVES.crush = (o) => {
    const h = 0.1, c = v(o, 'close', 0.42), pull = !!o.pull;
    const keys = (d) => [
      { t: 0, p: [0.18, -0.29, -0.28], q: [0.9, 0, -0.4], f: 'relax' },
      { t: h + d, p: [0.13, -0.18, -0.53], q: [0.85, -0.25, -0.55], f: 'clawOpen', e: 'o' },
      { t: c - 0.08 + d, p: [0.13, -0.182, -0.525], q: [0.82, -0.2, -0.6], f: 'claw', e: 's', s: 0.001 },
      { t: c + d, p: [0.13, -0.19, -0.5], q: [0.75, 0.05, -1.0], f: 'fist', e: 'i' },
      { t: c + 0.08 + d, p: [0.13, -0.19, -0.5], e: 'l', s: 0.003 },
      { t: c + 0.3, p: pull ? [0.17, -0.24, -0.32] : [0.13, -0.195, -0.49], q: pull ? [0.75, 0.1, -1.0] : [0.75, 0.05, -1.0], e: pull ? 'o' : 'l', s: 0.0012 },
      { t: c + 0.58, p: o.both ? 'rest' : 'grip', q: o.both ? REST_Q : undefined, f: o.both ? 'rest' : 'grip', e: 's' }];
    return { dur: c + 0.58, hit: h, both: !!o.both, main: keys(0), off: o.both ? keys(0.025) : null,
      body: [{ t: 0 }, { t: h + 0.04, f: 0.02, p: -0.004 }, { t: c, f: 0.024, d: 0.008, s: 0.0008 }, { t: c + 0.08, f: 0.02, d: 0.012, p: -0.008 },
        { t: c + 0.3, f: pull ? -0.02 : 0.01, p: pull ? 0.006 : -0.004 }, { t: c + 0.58 }],
      jolt: [[c, 0.05]], snd: [[0, 'cl', 0.9], [c - 0.02, 'cl', 1.4]] };
  };
  // 指さす・印を結ぶ: sign 'point' - the arm thrust out and the first finger levelled at the aim, beside it, not over it (up: at the
  // sky; release: its tip where the shot leaves); 'seal' - two fingers raised before the chin, the hand upright, leaning away
  MOVES.sign = (o) => {
    const h = 0.085, s = v(o, 'sign', 'point'), up = !!o.up, rel = !!o.release, hold = v(o, 'hold', 0.38);
    let pk, qk;
    if (s === 'seal') { pk = [0.1, -0.26, -0.58]; qk = [0.5, 0.1, -1.45]; }
    else if (up) { pk = [0.22, -0.02, -0.46]; qk = [1.3, -0.1, -1.2]; }
    else { pk = rel ? 'hand' : [0.12, -0.14, -0.52]; qk = [0.2, 0.22, -1.0]; }
    const point = s !== 'seal';
    return { dur: h + hold + 0.32, rel: h, hit: h, release: rel && point && !up, relP: [0.07, -0.09, -0.67], main: [
      { t: 0, p: [0.19, -0.3, -0.28], q: [0.5, 0, -0.9], f: 'relax' },
      { t: h, p: pk, q: qk, f: point ? 'point' : 'seal', e: 'o', pt: 'tip', on: true },
      { t: h + 0.05, p: typeof pk === 'string' ? 'hand+' : [pk[0], pk[1] + 0.004, pk[2] + 0.008], e: 'b' },
      { t: h + hold, e: 'l', s: 0.0008 },
      { t: h + hold + 0.32, p: 'grip', f: 'grip', e: 's' }],
      body: point ? [{ t: 0 }, { t: h + 0.03, f: 0.03, y: 0.008, p: up ? 0.02 : 0 }, { t: h + hold, f: 0.02, y: 0.005, p: up ? 0.016 : 0 }, { t: h + hold + 0.32 }]
        : [{ t: 0 }, { t: h + 0.05, d: 0.006, p: -0.008 }, { t: h + hold, d: 0.006, p: -0.008 }, { t: h + hold + 0.32 }],
      snd: [[0, 'cl', 0.9], [0.02, 'sw', point ? 0.16 : 0.08, 0.12]] };
  };
  // 胸の前で合わせる: the two hands brought together palm to palm before the chest, the fingers up and leaning away, the elbows down and
  // out (a prayer; a clap with o.clap), held; open: flung apart after it, palms out. The head bows to it
  MOVES.clasp = (o) => {
    const h = v(o, 'clap', 0) ? 0.07 : 0.12, hold = v(o, 'hold', 0.38), open = !!o.open, fs = v(o, 'f', 'pray');
    const keys = (d) => [
      { t: 0, p: [0.17, -0.34, -0.26], q: [0.9, 0.1, -1.2], f: 'relax' },
      { t: h + d, p: [0.03, -0.3, -0.49], q: [0.55, -0.05, -1.57], f: fs === 'flat' ? 'pray' : fs, e: o.clap ? 'i' : 'o' },
      { t: h + 0.04 + d, p: [0.029, -0.298, -0.495], e: 'o', s: 0.0008 },
      { t: h + hold, p: [0.029, -0.295, -0.5], e: 'l', s: 0.0008 },
      ...(open ? [{ t: h + hold + 0.12, p: [0.29, -0.18, -0.52], q: [0.5, 0.35, -0.2], f: 'splay', e: 'o' }] : []),
      { t: h + hold + (open ? 0.45 : 0.32), p: 'rest', q: REST_Q, f: 'rest', e: open ? 'q' : 's' }];
    return { dur: h + hold + (open ? 0.45 : 0.32), hit: h, both: true, main: keys(0), off: keys(0.006),
      body: open ? [{ t: 0 }, { t: h + 0.03, d: 0.01, p: -0.012 }, { t: h + hold, d: 0.012, p: -0.014 }, { t: h + hold + 0.1, d: -0.008, p: 0.016, f: 0.02 }, { t: h + hold + 0.45 }]
        : [{ t: 0 }, { t: h + 0.06, d: 0.012, p: -0.022 }, { t: h + hold, d: 0.014, p: -0.026 }, { t: h + hold + 0.32 }],
      jolt: open ? [[h + hold + 0.06, 0.06]] : null,
      snd: [[0, 'cl', 1], [h, 'cp', o.clap ? 1 : 0.6]].concat(open ? [[h + hold + 0.02, 'sw', 0.24, 0.18]] : []) };
  };
  // 構えて溜める: both hands out low before the body, palms facing each other a hand's breadth apart (a weight of air held between
  // them), the fingers clawing in, drawn in towards the chest and trembling harder with the strain for hold s; then thrown open,
  // outwards. With f: 'fist' the fists are clenched before the chest and pulled apart and down with the strain, then driven out. The
  // body crouches into the gathering and straightens as it is let go
  MOVES.channel = (o) => {
    const h = 0.16, hold = v(o, 'hold', 0.6), fist = v(o, 'f', '') === 'fist';
    const keys = fist ? (d) => [
      { t: 0, p: [0.18, -0.33, -0.28], q: [0.6, 0.1, -0.8], f: 'relax' },
      { t: h + d, p: [0.1, -0.22, -0.47], q: [0.8, 0.05, -1.3], f: 'fist', e: 'o', on: true },
      { t: h + hold * 0.5 + d, p: [0.13, -0.24, -0.45], q: [0.75, 0.15, -1.2], e: 's', s: 0.002 },
      { t: h + hold, p: [0.15, -0.26, -0.43], q: [0.65, 0.2, -1.1], e: 'l', s: 0.004 },
      { t: h + hold + 0.1, p: [0.12, -0.17, -0.47], q: [0.4, -0.05, -1.3], e: 'b' },
      { t: h + hold + 0.42, p: 'rest', q: REST_Q, f: 'rest', e: 'q' }]
      : (d) => [
        { t: 0, p: [0.18, -0.33, -0.28], q: [0.6, 0.1, -0.8], f: 'relax' },
        { t: h + d, p: [0.13, -0.2, -0.5], q: [0.5, 0.15, -1.4], f: 'clawOpen', e: 'o' },
        { t: h + hold * 0.5 + d, p: [0.11, -0.21, -0.47], q: [0.45, 0.2, -1.45], f: 'claw', e: 's', s: 0.0018 },
        { t: h + hold, p: [0.1, -0.22, -0.44], q: [0.4, 0.22, -1.48], e: 'l', s: 0.0035 },
        { t: h + hold + 0.1, p: [0.3, -0.17, -0.47], q: [0.85, 0.45, -0.25], f: 'splay', e: 'o' },
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
    return { move: e.m, dur: mv.dur, rel: mv.rel, hit: mv.hit, delay: mv.delay, both: mv.both, side: mv.side };
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
    const out = { dur: tm(mv.dur), hit: tm(hit), rel: mv.rel !== undefined ? tm(mv.rel) : tm(hit), both: !!mv.both, side: e.side || 'L', main: fix(mv.main), off: fix(mv.off), release: !!(mv.release || e.release) && e.release !== false, tick: e.tick || mv.tick || null };
    out.delay = out.release ? Math.min(MAX_DELAY, out.rel) : 0;
    out.relP = e.hand || mv.relP || REL_P;
    out.prop = typeof mv.prop === 'function' ? mv.prop : null;
    out.body = bk > 0 && mv.body ? mv.body.map((k) => ({ t: tm(k.t), d: (k.d || 0) * bk, f: (k.f || 0) * bk, p: (k.p || 0) * bk, r: (k.r || 0) * bk, y: (k.y || 0) * bk, s: (k.s || 0) * bk })) : null;
    out.jolt = bk > 0 && mv.jolt ? mv.jolt.map(([t, a]) => [tm(t), a * bk]) : [];
    out.snd = !e.quiet && mv.snd ? mv.snd.map((s) => [tm(s[0])].concat(s.slice(1))).sort((a, b) => a[0] - b[0]) : [];
    return out;
  }

  // ------------------------------------------------ the arm: its bones
  // the right shoulder joint at ease (the view's space: below the ear, behind the eye's plane), the upper arm (shoulder to elbow) and
  // the forearm (elbow to the wrist joint): a man's, 0.30 m each. The wrist goes no nearer the shoulder than MINR
  const SH = new V3(0.175, -0.265, 0.075), UPPER = 0.3, FORE = 0.3, REACH = UPPER + FORE - 0.006, MINR = 0.12;
  CA.ARM = { shoulder: SH.toArray(), upper: UPPER, fore: FORE };
  // the hand's own space (hand.js: the wrist joint at the origin, palm -y, fingers -z, thumb -x, the forearm +z): the middle of the
  // palm, the tip of the first finger held straight, and the glove's cuff (where the forearm's sleeve starts)
  const PALM = new V3(0.003, -0.02, -0.055), TIP = new V3(-0.02, -0.008, -0.172);
  const CUFF0 = new V3().fromArray((G.HandData && G.HandData.cuff && G.HandData.cuff.at) || [0.0024, 0.0005, 0.0625]);
  // how far a wrist bends ([to the palm, back], [to the little finger, to the thumb]) and the forearm turns (pronation +, palm down
  // from thumb up; supination -): at ease, and at most (hand.js X.Hand.LIM for the wrist). The forearm's own turn is some 85 degrees
  // each way; the upper arm turning in the shoulder gives the rest (the gun's own left hand, under its fore-end, is at some 1.56)
  const WLIM = () => (G.GFX && G.GFX.Hand && G.GFX.Hand.LIM && G.GFX.Hand.LIM.wrist) || [[-1.05, 1.2], [-0.35, 0.55]];
  const EASE_W = [[-0.62, 0.72], [-0.2, 0.36]], TW_EASE = [-1.05, 1.2], TW_MAX = [-1.5, 1.75];

  // the shoulder goes with the hand: forward and in as the arm reaches out (the shoulder blade slides round the ribs), up and out a
  // little as the hand is raised above the chest, forward and in as it reaches across the body, down a hair as it presses low
  function shoulderFor(w, out) {
    const dx = w.x - SH.x, dy = w.y - SH.y, dz = w.z - SH.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const reach = smooth(0.36, 0.56, d) * clamp(-dz / 0.45, 0, 1), up = smooth(0.05, 0.38, dy), across = smooth(0.05, 0.3, SH.x - w.x) * clamp(-dz / 0.3, 0, 1), low = smooth(-0.1, -0.3, dy) * reach;
    return out.set(SH.x - 0.022 * reach - 0.03 * across + 0.012 * up, SH.y + 0.05 * up - 0.012 * low, SH.z - 0.07 * reach - 0.035 * across + 0.012 * up);
  }
  // the forearm's way out of the hand (hand.js bone 0) for a wrist bent by a (to the palm) and b (to the little finger)
  const _eu = new THREE.Euler();
  const wristQ = (a, b, out) => out.setFromEuler(_eu.set(a, b, 0, 'XYZ'));
  // a cost past [lo, hi] at ease, and far more past [LO, HI]
  const over = (x, lo, hi) => (x < lo ? lo - x : x > hi ? x - hi : 0);
  const lim = (x, e, m) => { const a = over(x, e[0], e[1]), b = over(x, m[0], m[1]); return 0.7 * a * a + 18 * b * b; };
  // where the elbow is most at ease, for a wrist at W turned by Q (Qi its inverse), the shoulder at S: on the circle it can lie on,
  // round the line from the shoulder to the wrist. el / elW: a point the elbow is drawn to, and how strongly
  const _u = new V3(), _e1 = new V3(), _e2 = new V3(), _C = new V3(), _E = new V3(), _f = new V3(), _ua = new V3(), _fa = new V3(), _n = new V3(), _pn = new V3(), _tc = new V3(), _qb = new QT(), _qf = new QT(), _mid = new V3();
  const TORSO = { x: 0.165, z0: 0.125, rz: 0.135, top: -0.21 }, HEAD = new V3(0, 0.0, 0.07);
  function wristOf(E, W, Qi, out) {
    _f.subVectors(E, W).normalize().applyQuaternion(Qi);
    out[0] = Math.atan2(-_f.y, _f.z); out[1] = Math.asin(clamp(_f.x, -1, 1));
    return out;
  }
  const _ab = [0, 0];
  // the forearm's turn: 0 the thumb up with the palm in (the elbow bent, the upper arm down), + the palm turned down
  function twistOf(S, E, W, Q, a, b) {
    _ua.subVectors(E, S).normalize(); _fa.subVectors(W, E).normalize();
    _n.crossVectors(_ua, _fa); const sb = _n.length(); if (sb < 1e-4) return [0, 0];
    _n.divideScalar(-sb);
    _qf.copy(Q).multiply(wristQ(a, b, _qb)); _pn.set(0, -1, 0).applyQuaternion(_qf);
    const tw = Math.atan2(_tc.crossVectors(_n, _pn).dot(_fa), _n.dot(_pn));
    return [-tw, sb];
  }
  // (CA._capW, CA._wrOff: for the tools - the cap tried at another height, the wrist and the turn left out of the cost)
  const _lp = new V3();
  const CAP = 3, cap = (x) => { const k = CA._capW || CAP; return CA._wrOff ? 0 : k * (1 - Math.exp(-x / k)); };
  function armCost(S, E, W, Q, Qi, el, elW) {
    const WL = WLIM(), ab = wristOf(E, W, Qi, _ab);
    // (what the wrist and the forearm's turn cost is capped: a hand turned past what the arm can give is turned back into it after
    // (solveArm), rather than the elbow flung up or the arm laid flat to give it)
    let c = cap(lim(ab[0], EASE_W[0], WL[0]) + lim(ab[1], EASE_W[1], WL[1]));
    const [tw, sb] = twistOf(S, E, W, Q, clamp(ab[0], WL[0][0], WL[0][1]), clamp(ab[1], WL[1][0], WL[1][1]));
    c += cap(smooth(0.1, 0.55, sb) * lim(tw, TW_EASE, TW_MAX));
    // the elbow hangs (low is at ease), and is not raised above the shoulder unless the hand is
    c += 0.32 * (E.y - S.y);
    const hiE = E.y - S.y - 0.05 - 0.65 * Math.max(0, W.y - S.y); if (hiE > 0) c += 12 * hiE * hiE;
    // out of the chest and the head (the elbow, and the middle of the forearm)
    for (let k = 0; k < 2; k++) {
      const P = k ? _mid.addVectors(E, W).multiplyScalar(0.5) : E, wk = k ? 0.5 : 1;
      if (P.y < TORSO.top) { const q = (P.x / TORSO.x) ** 2 + ((P.z - TORSO.z0) / TORSO.rz) ** 2; if (q < 1) c += wk * 30 * (1 - q) * (1 - q); }
      const dh = P.distanceTo(HEAD); if (dh < 0.13) c += wk * 60 * (0.13 - dh) * (0.13 - dh) / 0.01;
    }
    // not far behind the back, not flung out past the side
    const bk = E.z - S.z - 0.1; if (bk > 0) c += 8 * bk * bk;
    const ox = E.x - S.x - 0.24; if (ox > 0) c += 6 * ox * ox;
    if (el && elW > 0) c += elW * 25 * E.distanceToSquared(el);
    // (the hand raised overhead: the elbow drawn up beside the head, back by the eyes' plane, so that the upper arm and the sleeve stay
    // behind the eye and out of sight and only
    // the forearm's end and the hand come in at the top of the view; less so when the key gives the elbow its own place)
    const lift = CA._noLift ? 0 : smooth(S.y + 0.18, S.y + 0.32, W.y) * (el && elW > 0 ? 0.3 : 1);
    if (lift > 0) { _lp.set(S.x + 0.1, Math.max(S.y + 0.2, W.y - 0.02), S.z - 0.02); c += lift * 0.7 * 25 * E.distanceToSquared(_lp); }
    return c;
  }
  const _Qi = new QT(), _rq = new QT(), _ax = new V3(), _d0 = new V3(), _d1 = new V3();
  // the whole arm for a wrist wanted at W0, the hand turned Q0: out = { S, E, W, Q, a, b, tw } (Q the hand's turn as the arm can give
  // it, a and b the wrist's bend for hand.js pose)
  // hint (optional): a point the elbow was at a moment ago. win > 0: the elbow is looked for only within win (rad) round the circle of
  // that point, and goes on to a far better place only win at a time, the way round the arm passes most easily (so it never jumps from
  // one frame to the next); win 0: the elbow is put where the hint is (onto its circle)
  const _cs = new Float32Array(40);
  const wrapA = (x) => x - Math.PI * 2 * Math.round(x / (Math.PI * 2));
  // exRef (optional): how far the hand is turned back about the forearm (track: worked out over time, so it goes on smoothly); without
  // it, what is past the forearm's most turn is taken off (the less the more nearly straight the arm is: the upper arm then gives it)
  // aRef (optional): the wrist's bend to the palm a moment ago (out.aRaw, as it was wanted, before it was held to the wrist's reach): a
  // bend wanted past the back of the hand round to the palm is told from one past the palm round to the back by it, so a hand turned
  // far past the wrist's reach stays held at the one end rather than thrown over to the other
  function solveArm(W0, Q0, el, elW, out, hint, win, exRef, aRef) {
    const S = shoulderFor(W0, out.S), W = out.W.copy(W0);
    _u.subVectors(W, S); let d = _u.length();
    if (d > REACH) { W.copy(S).addScaledVector(_u, REACH / d); d = REACH; } else if (d < MINR) { W.copy(S).addScaledVector(_u, MINR / Math.max(1e-4, d)); d = MINR; }
    _u.divideScalar(d);
    const a = UPPER, b = FORE, ax = (a * a - b * b + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, a * a - ax * ax));
    _C.copy(S).addScaledVector(_u, ax);
    _e1.set(0, -1, 0).addScaledVector(_u, _u.y); if (_e1.lengthSq() < 0.04) _e1.set(0, 0, 1).addScaledVector(_u, -_u.z); _e1.normalize();
    _e2.crossVectors(_e1, _u);
    const Q = out.Q.copy(Q0); _Qi.copy(Q).invert();
    const at = (ph) => _E.copy(_C).addScaledVector(_e1, hh * Math.cos(ph)).addScaledVector(_e2, hh * Math.sin(ph));
    // (round the circle in 40 steps, then closer in on the best)
    let best = 0, bc = Infinity; const N = 40;
    const cost = (ph) => armCost(S, at(ph), W, Q, _Qi, el, elW);
    if (hint && hh > 1e-4) {
      _tc.subVectors(hint, _C); const p0 = Math.atan2(_tc.dot(_e2), _tc.dot(_e1));
      if (!(win > 0)) best = p0;
      else {
        for (let i = 0; i <= 8; i++) { const ph = p0 - win + (i / 8) * 2 * win, c = cost(ph); if (c < bc) { bc = c; best = ph; } }
        let gb = 0, gc = Infinity;
        for (let i = 0; i < N; i++) { const c = _cs[i] = cost(-Math.PI + (i / N) * Math.PI * 2); if (c < gc) { gc = c; gb = -Math.PI + (i / N) * Math.PI * 2; } }
        if (gc < bc - 0.05 && Math.abs(wrapA(gb - best)) > win) {
          // (a far better place: towards it, the way whose worst on the way is the lesser)
          const i0 = Math.round((wrapA(p0) + Math.PI) / (Math.PI * 2) * N) % N, ig = Math.round((wrapA(gb) + Math.PI) / (Math.PI * 2) * N) % N;
          let mu = 0, md = 0;
          for (let i = i0; i !== ig; i = (i + 1) % N) mu = Math.max(mu, _cs[i]);
          for (let i = i0; i !== ig; i = (i + N - 1) % N) md = Math.max(md, _cs[i]);
          best = p0 + (mu <= md ? win : -win); bc = cost(best);
        } else {
          let step = win / 8;
          for (let k = 0; k < 3; k++) {
            const cl = best - step >= p0 - win ? cost(best - step) : Infinity, cr = best + step <= p0 + win ? cost(best + step) : Infinity;
            if (cl < bc && cl <= cr) { bc = cl; best -= step; } else if (cr < bc) { bc = cr; best += step; }
            step *= 0.5;
          }
        }
      }
    } else {
      for (let i = 0; i < N; i++) { const ph = -Math.PI + (i / N) * Math.PI * 2, c = cost(ph); if (c < bc) { bc = c; best = ph; } }
      let step = Math.PI / N;
      for (let k = 0; k < 5; k++) {
        const cl = cost(best - step), cr = cost(best + step);
        if (cl < bc && cl <= cr) { bc = cl; best -= step; } else if (cr < bc) { bc = cr; best += step; }
        step *= 0.5;
      }
    }
    const E = out.E.copy(at(best)); out.phi = best;
    // the wrist: what is past its bend is taken off the hand's turn (the hand turned round to where the forearm can hold it)
    const WL = WLIM(), ab = wristOf(E, W, _Qi, _ab);
    if (aRef !== undefined && aRef !== null && isFinite(aRef)) ab[0] = aRef + wrapA(ab[0] - aRef);
    const ca = clamp(ab[0], WL[0][0], WL[0][1]), cb = clamp(ab[1], WL[1][0], WL[1][1]);
    if (ca !== ab[0] || cb !== ab[1]) {
      _d0.set(0, 0, 1).applyQuaternion(wristQ(ca, cb, _qb)).applyQuaternion(Q); _d1.subVectors(E, W).normalize();
      Q.premultiply(_rq.setFromUnitVectors(_d0, _d1));
    }
    out.a = ca; out.b = cb; out.aRaw = ab[0];
    // the forearm's turn: what is past it is turned back about the forearm (which leaves the wrist's bend as it is)
    const [tw, sb] = twistOf(S, E, W, Q, ca, cb), k = smooth(0.1, 0.55, sb), ref = exRef !== undefined && exRef !== null && isFinite(exRef);
    const ex = ref ? exRef : over(tw, TW_MAX[0], TW_MAX[1]) * k * Math.sign(tw);
    if (Math.abs(ex) > 1e-4) { _ax.subVectors(W, E).normalize(); Q.premultiply(_rq.setFromAxisAngle(_ax, ex)); }
    out.tw = tw - ex; out.twRaw = tw; out.bent = k; out.ex = ex;
    return out;
  }
  // an arm solved (solveArm) given the hand's turn qF as it is to be drawn (track: the turn the arm gave the hand, held to what a hand
  // can turn a step): the wrist's bend found afresh from it, within the wrist's reach
  const _Qh = new QT();
  function holdTurn(s, qF) {
    s.Q.copy(qF); _Qh.copy(qF).invert();
    const WL = WLIM(), ab = wristOf(s.E, s.W, _Qh, _ab);
    if (isFinite(s.aRaw)) ab[0] = s.aRaw + wrapA(ab[0] - s.aRaw);
    s.a = clamp(ab[0], WL[0][0], WL[0][1]); s.b = clamp(ab[1], WL[1][0], WL[1][1]);
    s.tw = twistOf(s.S, s.E, s.W, s.Q, s.a, s.b)[0];
    return s;
  }

  // ------------------------------------------------ the arm: its sleeve from the bracer over the elbow to the shoulder
  // One tube of cloth made here, bent each frame: from inside the bracer's end (gfx.js sleeve: the bracer ends 0.205 m up the forearm
  // from the glove's cuff) to past the shoulder (out of sight behind the eye). Its rings are set at these distances (m) from the elbow
  // (- towards the wrist), close together where it bends. At the elbow the rings run round a curve (its radius smaller the sharper the
  // bend), pressed together on the inner side - the crook folds - and drawn out over the point of the elbow on the outer
  const NR = 28, ZR = [-0.046, -0.04, -0.034, -0.028, -0.022, -0.017, -0.012, -0.0075, -0.0035, 0.0005, 0.0045, 0.0085, 0.013, 0.018, 0.024, 0.031, 0.039, 0.049, 0.061, 0.076, 0.094, 0.116, 0.142, 0.17, 0.2, 0.23, 0.26, 0.29, 0.32, 0.35, 0.375];
  const NZ = ZR.length;
  // its half-widths at rest, round the arm (x across it, y the back of the forearm): coming out of the bracer, filling out to the
  // forearm's thick end at the elbow, the upper arm, the shoulder; the cloth's slanting folds
  function sleeveR(z, a) {
    let rx, ry;
    if (z < 0) { const k = smooth(-0.046, -0.026, z), m = smooth(-0.03, 0.0, z); rx = 0.0438 + 0.0042 * k + 0.0012 * m; ry = 0.0358 + 0.0042 * k + 0.0022 * m; }
    else { const k = smooth(0, 0.09, z), m = smooth(0.18, 0.36, z); rx = 0.0492 + 0.0042 * k + 0.0045 * m; ry = 0.0422 + 0.0082 * k + 0.0055 * m; }
    const c = Math.cos(a), s = Math.sin(a);
    let r = 1 / Math.sqrt((c * c) / (rx * rx) + (s * s) / (ry * ry));
    const up = smooth(-0.036, 0.0, z);
    r += up * (0.0026 * Math.sin(a * 3 + z * 23 + 0.5) + 0.0015 * Math.sin(a * 5 - z * 41 + 2.1) + 0.0008 * Math.sin(a * 8 + z * 77));
    r += (1 - up) * 0.0012 * Math.sin(a * 4 + z * 300);
    return r;
  }
  function makeTube() {
    const n = NZ * (NR + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), rb = new Float32Array(n), cs = new Float32Array((NR + 1) * 2), idx = [];
    for (let j = 0; j <= NR; j++) { const a = (j / NR) * Math.PI * 2 - Math.PI / 2; cs[j * 2] = Math.cos(a); cs[j * 2 + 1] = Math.sin(a); }
    for (let i = 0; i < NZ; i++) {
      let arc = 0, px = 0, py = 0;
      for (let j = 0; j <= NR; j++) {
        const a = (j / NR) * Math.PI * 2 - Math.PI / 2, r = sleeveR(ZR[i], a), x = cs[j * 2] * r, y = cs[j * 2 + 1] * r, k = i * (NR + 1) + j;
        if (j) arc += Math.hypot(x - px, y - py); px = x; py = y;
        rb[k] = r; uv[k * 2] = arc / 0.075; uv[k * 2 + 1] = ZR[i] / 0.075;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = ZR[i];
      }
    }
    for (let i = 0; i < NZ - 1; i++) for (let j = 0; j < NR; j++) { const a0 = i * (NR + 1) + j, b = a0 + 1, c = a0 + NR + 1, d = c + 1; idx.push(a0, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    g.boundingSphere = new THREE.Sphere(new V3(), 2);
    return { g, rb, cs };
  }
  const _zU = new V3(), _nb = new V3(), _bis = new V3(), _O = new V3(), _T1 = new V3(), _cen = new V3(), _rx = new V3(), _ry = new V3(), _rz = new V3(), _in = new V3(), _dir = new V3(), _rr = new QT(), _tv = new V3();
  // the tube laid along the arm: the elbow E, the shoulder S, the forearm's way to the elbow zF and its frame across (xF, yF)
  function bendTube(T, E, S, zF, xF, yF) {
    const pos = T.g.attributes.position.array, rb = T.rb, cs = T.cs;
    _zU.subVectors(S, E).normalize();
    const th = Math.acos(clamp(zF.dot(_zU), -1, 1));
    _nb.crossVectors(zF, _zU); const nl = _nb.length(); if (nl < 1e-5) _nb.copy(xF); else _nb.divideScalar(nl);
    const bent = th > 0.02, h2 = th / 2, L = bent ? Math.min(0.034, 0.05 * Math.tan(h2)) : 0, rho = bent ? L / Math.tan(h2) : 0, kb = Math.sin(h2);
    if (bent) { _bis.subVectors(_zU, zF).normalize(); _O.copy(E).addScaledVector(_bis, rho / Math.cos(h2)); _T1.copy(E).addScaledVector(zF, -L); }
    for (let i = 0; i < NZ; i++) {
      const z = ZR[i]; let ang, inArc = false, fr = 0;
      if (!bent || z <= -L) { _cen.copy(E).addScaledVector(zF, z); ang = 0; }
      else if (z >= L) { _cen.copy(E).addScaledVector(_zU, z); ang = th; }
      else { fr = (z + L) / (2 * L); ang = fr * th; inArc = true; _rr.setFromAxisAngle(_nb, ang); _cen.subVectors(_T1, _O).applyQuaternion(_rr).add(_O); }
      _rr.setFromAxisAngle(_nb, ang); _rx.copy(xF).applyQuaternion(_rr); _ry.copy(yF).applyQuaternion(_rr); _rz.copy(zF).applyQuaternion(_rr);
      // the inner side of the bend, as seen across this ring
      if (inArc) _in.subVectors(_O, _cen).normalize(); else if (bent) { _in.copy(_bis).addScaledVector(_rz, -_bis.dot(_rz)); const l = _in.length(); if (l > 1e-5) _in.divideScalar(l); }
      const wz = Math.exp(-(z / 0.05) * (z / 0.05)), sq = inArc ? Math.sin(Math.PI * fr) : 0, bump = 0.012 * Math.pow(kb, 1.5) * Math.exp(-(z / 0.026) * (z / 0.026));
      for (let j = 0; j <= NR; j++) {
        const k = i * (NR + 1) + j, ca = cs[j * 2], sa = cs[j * 2 + 1];
        _dir.copy(_rx).multiplyScalar(ca).addScaledVector(_ry, sa);
        let r = rb[k];
        if (bent) {
          const c = _dir.dot(_in);
          if (c > 0) {
            r += wz * kb * c * c * 0.0034 * Math.sin(z * 430 + j * 0.35 + 0.7);
            if (sq > 0) { const lm = (0.9 * rho) / Math.max(c, 1e-3); if (r > lm) r += (lm + (r - lm) * 0.2 - r) * sq; }
          } else r += bump * (-c) * (-c) * (-c);
        }
        pos[k * 3] = _cen.x + _dir.x * r; pos[k * 3 + 1] = _cen.y + _dir.y * r; pos[k * 3 + 2] = _cen.z + _dir.z * r;
      }
    }
    T.g.attributes.position.needsUpdate = true;
    T.g.computeVertexNormals();
    // (the seam: its two columns of corners given the one normal)
    const nm = T.g.attributes.normal;
    for (let i = 0; i < NZ; i++) { const a0 = i * (NR + 1), b = a0 + NR, x = nm.getX(a0) + nm.getX(b), y = nm.getY(a0) + nm.getY(b), z = nm.getZ(a0) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a0, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l); }
    nm.needsUpdate = true;
  }

  // ------------------------------------------------ the arms, made
  let rig = null, root = null, cur = null;
  function makeArm(side) {
    const X = G.GFX, Wm = G.weapons.mats;
    const g = new THREE.Group(); g.scale.x = side; g.visible = false; root.add(g);
    const hand = new THREE.Group(); g.add(hand);
    const oh = X.openHand();
    hand.add(new THREE.Mesh(oh.hand, Wm.glove), new THREE.Mesh(oh.pad, Wm.gloveDk || Wm.glove), new THREE.Mesh(oh.strap, Wm.gloveDk || Wm.glove));
    // the forearm's sleeve (the wool, its bracer, the straps and their iron) from the glove's cuff to just past the bracer; the rest of
    // the sleeve (over the elbow to the shoulder) is the tube
    const MS = { cloth: Wm.sleeve, bracer: Wm.bracer || Wm.sleeve, strap: Wm.gloveDk || Wm.sleeve, iron: Wm.iron || Wm.steel };
    const fore = new THREE.Group(); g.add(fore);
    for (const q of X.sleeve(0.21)) fore.add(new THREE.Mesh(q.g, MS[q.m] || Wm.sleeve));
    const tube = makeTube(), upper = new THREE.Mesh(tube.g, Wm.sleeve); g.add(upper);
    g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    return { side, g, hand, fore, upper, tube, oh, fk: null, sol: { S: new V3(), E: new V3(), W: new V3(), Q: new QT(), a: 0, b: 0, tw: 0, phi: 0 } };
  }
  function ensureRig() {
    if (rig) return rig;
    const X = G.GFX, W = G.weapons;
    if (!X || !X.openHand || !X.sleeve || !W || !W.vmScene || !W.mats) return null;
    root = new THREE.Group(); W.vmScene.add(root);
    rig = { L: makeArm(-1), R: makeArm(1) };
    return rig;
  }
  // set an arm (in its own right-handed space): the wrist wanted at w, the hand turned q, the fingers fa (20), the elbow drawn to el
  const _xF = new V3(), _yF = new V3(), _zF = new V3(), _m = new THREE.Matrix4(), _cw = new V3(), _wq = new QT(), _fq = new QT();
  const _fa20 = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], _ft = [0, 0, 0, 0], _fw = [0, 0];
  function poseArm(A, w, q, fa, el, elW, hint, exRef, aRef, qF) {
    const s = solveArm(w, q, el, elW || 0, A.sol, hint || null, 0, exRef, aRef);
    if (qF) holdTurn(s, qF);
    A.hand.position.copy(s.W); A.hand.quaternion.copy(s.Q);
    // the forearm: its frame at the wrist (the hand's, the wrist's bend taken off), its sleeve from the glove's cuff towards the elbow
    _fq.copy(s.Q).multiply(wristQ(s.a, s.b, _wq));
    _zF.subVectors(s.E, s.W).normalize();
    _yF.set(0, 1, 0).applyQuaternion(_fq); _yF.addScaledVector(_zF, -_yF.dot(_zF)).normalize(); _xF.crossVectors(_yF, _zF);
    _cw.copy(CUFF0).applyQuaternion(_fq).add(s.W);
    A.fore.position.copy(_cw); A.fore.quaternion.setFromRotationMatrix(_m.makeBasis(_xF, _yF, _zF));
    bendTube(A.tube, s.E, s.S, _zF, _xF, _yF);
    // the fingers and the wrist (bent afresh only when they have moved)
    let moved = !A.fk;
    if (!moved) { for (let i = 0; i < 20; i++) if (Math.abs(A.fk[i] - fa[i]) > 1e-4) { moved = true; break; } if (Math.abs(A.fk[20] - s.a) > 1e-4 || Math.abs(A.fk[21] - s.b) > 1e-4) moved = true; }
    if (moved) {
      A.fk = Array.from(fa).concat([s.a, s.b]);
      for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) _fa20[i][k] = fa[i * 4 + k];
      for (let k = 0; k < 4; k++) _ft[k] = fa[16 + k];
      _fw[0] = s.a; _fw[1] = s.b;
      A.oh.pose(_fa20, _ft, _fw);
    }
  }

  // ------------------------------------------------ keys made into a way through time
  const EASE = { q: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), o: (t) => 1 - Math.pow(1 - t, 3), i: (t) => t * t * t, s: (t) => t * t * t * (t * (t * 6 - 15) + 10), l: (t) => t,
    b: (t) => { const u = t - 1; return 1 + 2.3 * u * u * u + 1.3 * u * u; } };
  const toQ = (r, out) => out.setFromEuler(_eu.set(r[0], r[1], r[2], 'XYZ'));
  const sameQ = (a, b) => Array.isArray(a) && a.length === 3 && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
  // every key given its place, turn and fingers (what is left out taken from the key before; 'grip', 'rest' and 'hand' put where they
  // are now), for the arm on side s (1 right, -1 left)
  // A motion of the left hand alone whose first key is not on the weapon (a throw cocked by the ear, a fist chambered at the hip): the
  // hand is taken off the weapon, rather than gone from it at once and put where the key is. Where the next key comes within ENTRY_K s
  // there is no time for a man to get the hand there and on (a throw let go at 0.12 s): the hand goes from the weapon straight to the
  // next key, in the first key's turn and shape (a dart thrown from where the hand was, not wound up). Else it is taken there over the
  // first ENTRY_T s, a hand bound high by way of a point low out at the side, below the view, so it does not cross the view on its way
  const ENTRY_T = 0.05, ENTRY_K = 0.1;
  // A motion begun while another was in play (c.from: armsNow): its first key is the hand as it is - where, turned and shaped as it is
  // drawn - so the hand goes on from there to the motion's next key (what a key after it leaves out is still taken from the first key)
  function entryKeys(keys, c, s) {
    const k0 = keys[0], k1 = keys[1], fr = c.from && c.from[s];
    if (fr && k0 && k0.t <= 1e-6) {
      const out = [{ t: 0, p: [fr.P.x, fr.P.y, fr.P.z], Qn: fr.Q, f: fr.F, e: k0.e }];
      if (k1) out.push(Object.assign({}, k1, { p: k1.p !== undefined ? k1.p : k0.p, q: k1.q || k0.q, f: k1.f || k0.f }));
      return out.concat(keys.slice(2));
    }
    if (!c.oneHand || s > 0 || !c.grip || !k0 || !k1 || k0.t > 1e-6) return keys;
    const p0 = k0.p;
    if (p0 === undefined || p0 === 'grip' || (Array.isArray(p0) && p0[0] === 'grip')) return keys;
    const g = { t: 0, p: 'grip', q: GRIP_Q, f: 'grip' };
    if (k1.t <= ENTRY_K) {
      const m = Object.assign({}, k0, k1); if (k1.e === undefined) m.e = 'q';
      // (to a key high by the ear, by way of a point below the view in front of the shoulder, so the hand is not swung across the
      // face on its way: a pistol's grip and a fore-end are both in the middle of the view)
      const pm = m.p, up = Array.isArray(pm) && typeof pm[0] !== 'string' && pm[1] > -0.12;
      if (up) return [g, { t: k1.t * 0.5, p: [Math.max(0.3, pm[0]), -0.24, clamp(pm[2], -0.28, -0.16)], q: m.q, f: 'relax', e: 'o' }, Object.assign(m, { e: 'i' })].concat(keys.slice(2));
      return [g, m].concat(keys.slice(2));
    }
    const tE = Math.min(ENTRY_T, 0.5 * k1.t), out = [g];
    const hi = Array.isArray(p0) && typeof p0[0] !== 'string' && p0[1] > -0.24;
    if (hi) out.push({ t: tE * 0.45, p: [Math.max(0.26, p0[0]), -0.42, clamp(p0[2], -0.3, -0.12)], q: [0.4, 0.1, -1.4], f: 'relax', e: 'o' });
    out.push(Object.assign({}, k0, { t: tE, e: 'q' }));
    return out.concat(keys.slice(1));
  }
  function resolve(keys, c, s) {
    keys = entryKeys(keys, c, s);
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
      // (back on the gun: in the turn and the shape of the gun's own left hand, unless the key asks for another turn)
      const onGrip = pp === 'grip' && c.oneHand && s < 0 && c.gripQ && (k.q === undefined || sameQ(k.q, GRIP_Q));
      const qq = k.q || (pp === 'grip' && k.p !== undefined ? GRIP_Q : q), ff = k.f || f;
      const Q = k.Qn ? k.Qn.clone() : onGrip ? c.gripQ.clone() : toQ(qq, new QT());
      let P;
      if (pp === 'hand' || pp === 'hand+') {
        // the palm (or the finger tip) on the point where the shot leaves the hand; hand+: a little out past it, settling
        const tgt = new V3(c.relP[0], c.relP[1], c.relP[2]);
        if (pp === 'hand+') tgt.add(new V3(-0.006, 0.004, -0.012));
        if (pp === 'hand') c.relTip = k.pt === 'tip';
        P = tgt.sub((k.pt === 'tip' ? TIP : PALM).clone().applyQuaternion(Q));
      } else P = Array.isArray(pp) && typeof pp[0] !== 'string' ? new V3(pp[0], pp[1], pp[2]) : at(pp) || REST_P.clone();
      const F = ff === 'grip' && onGrip && c.gripF ? c.gripF.slice() : fingArr(ff);
      out.push({ t: k.t, P, Q, F, e: k.e || 'q', s: k.s || 0, el: Array.isArray(k.el) ? new V3(k.el[0], k.el[1], k.el[2]) : null, on: k.on });
      p = pp === 'hand' || pp === 'hand+' ? [P.x, P.y, P.z] : pp; q = k.q || qq; f = ff;
    }
    // the moments the hand's turn and fingers are exactly on the keys (the lag let go of before them, sample): the keys with on: true
    // (not by default at the hit or the release: the skills' keys are made for the lag, and without it a hand whips off the gun)
    out.pins = [];
    for (const k of out) if (k.on === true) out.pins.push(k.t);
    return out;
  }
  const REST_P = new V3(0.21, -0.56, -0.12);
  // the stretch of keys t falls in, and how far through it (eased)
  let sgA = null, sgB = null, sgU = 0, sgI = 0;
  function seg(ks, t) {
    let i = 0; while (i < ks.length - 2 && t > ks[i + 1].t) i++;
    sgI = i; sgA = ks[i]; sgB = ks[Math.min(ks.length - 1, i + 1)];
    const u0 = clamp((t - sgA.t) / Math.max(1e-4, sgB.t - sgA.t), 0, 1); sgU = EASE[sgB.e] ? EASE[sgB.e](u0) : u0;
  }
  // the wrist by a smooth curve through the keys (each stretch eased: Catmull-Rom, so the hand travels on a curve, not corner to corner)
  function posAt(ks, t, out) {
    seg(ks, t); const u = sgU, i = sgI;
    const p0 = ks[Math.max(0, i - 1)].P, p1 = sgA.P, p2 = sgB.P, p3 = ks[Math.min(ks.length - 1, i + 2)].P, u2 = u * u, u3 = u2 * u;
    return out.set(0, 0, 0).addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u).addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1).addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u).addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
  }
  const quatAt = (ks, t, out) => { seg(ks, t); return out.slerpQuaternions(sgA.Q, sgB.Q, sgU); };
  const fingAt = (ks, t, j) => { seg(ks, t); return sgA.F[j] + (sgB.F[j] - sgA.F[j]) * sgU; };
  // the pull to the elbow's point (el) at t: the point, and its weight (eased in from a key without one and out to it)
  const _el = new V3();
  function elAt(ks, t) {
    seg(ks, t); const wa = sgA.el ? 1 - sgU : 0, wb = sgB.el ? sgU : 0, w = wa + wb;
    if (w < 1e-4) return 0;
    _el.set(0, 0, 0); if (sgA.el) _el.addScaledVector(sgA.el, wa); if (sgB.el) _el.addScaledVector(sgB.el, wb); _el.divideScalar(w);
    return w;
  }
  // the spring the hand's turn and the fingers follow the keys through: a weighting of where the keys were over the last 0.17 s, made
  // from a spring's answer to a step (a little behind, a little past as it stops, then back). [s ago, weight]
  function kernel(f0, z) {
    const w = 2 * Math.PI * f0, wd = w * Math.sqrt(1 - z * z), out = []; let s = 0;
    for (let k = 1; k <= 22; k++) { const tau = k * 0.0078, h = Math.exp(-z * w * tau) * Math.sin(wd * tau); out.push([tau, h]); s += h; }
    for (const o of out) o[1] /= s;
    return out;
  }
  const KQ = kernel(7.2, 0.58), KF = kernel(6.4, 0.7);
  const _q0 = new QT(), _q1 = new QT(), _qr = new QT();
  function quatLag(ks, t, out) {
    let x = 0, y = 0, z = 0, w = 0; quatAt(ks, t, _q0);
    for (const [tau, k] of KQ) { quatAt(ks, t - tau, _q1); const sg = _q1.x * _q0.x + _q1.y * _q0.y + _q1.z * _q0.z + _q1.w * _q0.w < 0 ? -k : k; x += sg * _q1.x; y += sg * _q1.y; z += sg * _q1.z; w += sg * _q1.w; }
    return out.set(x, y, z, w).normalize();
  }
  // each finger a little after the hand, closing from the little finger, opening from the first; the thumb last as a hand closes
  const _F = new Float32Array(20);
  function fingLag(ks, t, out) {
    for (let g = 0; g < 5; g++) {
      const j0 = g * 4, now = fingAt(ks, t, j0) + fingAt(ks, t, j0 + 1), was = fingAt(ks, t - 0.05, j0) + fingAt(ks, t - 0.05, j0 + 1), closing = now >= was;
      const dl = g < 4 ? 0.012 + (closing ? 3 - g : g) * 0.013 : closing ? 0.04 : 0.006;
      for (let k = 0; k < 4; k++) { const j = j0 + k; let s = 0; for (const [tau, wk] of KF) s += wk * fingAt(ks, t - dl - tau, j); out[j] = s; }
    }
    return out;
  }
  // the pose of a resolved way at time t (the wrist, the hand's turn, the fingers) for an arm, and the small shake of a strained hand
  // (s) and the slow drift of a held one (its breath); end: the motion's length (its last moments settle on the keys themselves, so it
  // ends exactly where the gun's hand takes it up)
  const _w = new V3(), _q = new QT(), ON_IN = 0.1, ON_OUT = 0.12;
  function sample(ks, t, c, side, end, noF) {
    posAt(ks, t, _w);
    quatLag(ks, t, _q);
    if (!noF) fingLag(ks, t, _F);
    // (on keys: the lag let go of over ON_IN s before the key, so the turn and the fingers are on it at its moment, and taken up again
    // over ON_OUT s after it)
    let kOn = 1;
    if (!CA._noOn && ks.pins) for (const x of ks.pins) kOn = Math.min(kOn, t <= x ? smooth(x, x - ON_IN, t) : smooth(x, x + ON_OUT, t));
    const kEnd = Math.min(kOn, end ? smooth(end, end - 0.14, t) : 1);
    if (kEnd < 1) { quatAt(ks, t, _qr); _q.slerp(_qr, 1 - kEnd); if (!noF) for (let j = 0; j < 20; j++) _F[j] = fingAt(ks, t, j) + (_F[j] - fingAt(ks, t, j)) * kEnd; }
    seg(ks, t); const s = sgA.s + (sgB.s - sgA.s) * sgU;
    const T = t + side * 1.7;
    if (s > 0) { _w.x += s * (Math.sin(T * 47) + 0.6 * Math.sin(T * 83 + 1)); _w.y += s * (Math.sin(T * 53 + 2) + 0.5 * Math.sin(T * 97)); _w.z += s * 0.6 * Math.sin(T * 61 + 3); }
    // (breath: the arm rises and falls a little, slowly, and drifts)
    _w.y += 0.0019 * Math.sin(T * 1.75) + 0.0007 * Math.sin(T * 3.9 + 1); _w.x += 0.0009 * Math.sin(T * 1.15 + 2); _w.z += 0.0008 * Math.sin(T * 1.4 + 0.5);
    _qr.setFromEuler(_eu.set(0.012 * Math.sin(T * 1.6 + 0.3), 0.008 * Math.sin(T * 1.2 + 1), 0.01 * Math.sin(T * 1.9 + 2), 'XYZ')); _q.multiply(_qr);
    const elW = elAt(ks, t);
    return [_w, _q, _F, elW > 0 ? _el : null, elW];
  }
  // the elbow's way through a whole motion, worked out once as it starts, every TRK_H s from its start on: each step from the elbow of
  // the step before (solveArm's hint), so that it goes on smoothly however near two ways of holding the arm come to each other. The
  // arm is then posed with its elbow where this way has it (pictures of a frozen moment come out as the played motion does).
  // The hand's turn is worked out along it too: it turns no faster than TRK_QR a step (some 36 rad/s, what a fast wrist and forearm
  // give), so that where the keys ask for more (a hand whipped off the gun into a throw, a turn caught up with at an on key) it comes
  // round as fast as a hand can rather than in a blink; a little faster over the motion's last moments, so it ends in the gun's hand
  const TRK_QR = 0.3;
  const TRK_H = 1 / 120, TRK_WIN = 0.07, TRK_WK = 1.5, TRK_WS = 0.01, _tsh = new V3(), TRK_TW = 0.1, _tsol = { S: new V3(), E: new V3(), W: new V3(), Q: new QT(), a: 0, b: 0, tw: 0, phi: 0 };
  // (it is worked out step by step as far as it is wanted (trackTo), a frame's worth at a time as the motion plays, not all at its
  // start: each step depends only on the ones before, so it comes out the same, and a long motion costs no stall as it begins)
  function track(a, c) {
    const n = Math.ceil(c.dur / TRK_H) + 2;
    return { P: new Float32Array(n * 3), T: new Float32Array(n), Q4: new Float32Array(n * 4), AR: new Float32Array(n), n, k: 0, a, c,
      sx: null, ss: 0, sa: null, tq: new QT(), tqf: new QT(), w0: new V3(), tp: new V3(), h0: c.from && c.from[a.A.side] ? c.from[a.A.side].E.clone() : null };
  }
  function trackTo(trk, t) {
    const need = Math.min(trk.n - 1, Math.floor(clamp(t / TRK_H, 0, trk.n - 1)) + 1);
    while (trk.k <= need) trackStep(trk);
  }
  function trackStep(trk) {
    const { a, c, P, T, Q4, AR } = trk, i = trk.k++, has = i > 0, _tq = trk.tq, _tqf = trk.tqf, _tw0 = trk.w0, _tp = trk.tp;
    let ex = trk.sx, side = trk.ss, ar = trk.sa;
    {
      const t = Math.min(i * TRK_H, c.dur), [w, q, , el, elW] = sample(a.ks, t, c, a.A.side, c.dur, true);
      // (the elbow goes round as fast as the hand goes as the hand is raised above the shoulder: a hand flung from the gun up over the
      // head takes the elbow up beside the head with it in the time it takes, not a third of a second after; a hand moving slowly, or
      // low, leaves the elbow its slow, smooth way - swung round fast low, it would turn the hand with it at the wrist's ends)
      let win = TRK_WIN;
      if (has) {
        // (round the circle the elbow lies on, as far as an arc of TRK_WK times the way the wrist went past TRK_WS a step
        // (a hand flung, not a hand moved): the circle's radius from the shoulder's and the wrist's distance)
        const d = clamp(shoulderFor(w, _tsh).distanceTo(w), MINR, REACH), ax = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d), hr = Math.sqrt(Math.max(0, UPPER * UPPER - ax * ax));
        win += smooth(_tsh.y + 0.1, _tsh.y + 0.24, w.y) * Math.min(0.6, (CA._trkWk !== undefined ? CA._trkWk : TRK_WK) * Math.max(0, _tw0.distanceTo(w) - TRK_WS) / Math.max(0.05, hr));
      }
      _tw0.copy(w);
      if (!i) _tq.copy(q); else _tq.rotateTowards(q, CA._noQr ? 9 : TRK_QR + (1 - smooth(c.dur, c.dur - 0.14, t)) * 0.6);
      const s = solveArm(w, _tq, el, elW, _tsol, i ? _tp : trk.h0, win, ex, ar);
      ar = AR[i] = s.aRaw;
      // (the turn the arm gave the hand - the wanted turn held to the wrist's reach and the forearm's - held to what a hand can turn a
      // step too: where the wanted turn lies far past the wrist's reach, a small change in it can throw the held turn over a long way)
      if (!i) _tqf.copy(s.Q); else _tqf.rotateTowards(s.Q, CA._noQr ? 9 : TRK_QR + (1 - smooth(c.dur, c.dur - 0.14, t)) * 0.6);
      Q4[i * 4] = _tqf.x; Q4[i * 4 + 1] = _tqf.y; Q4[i * 4 + 2] = _tqf.z; Q4[i * 4 + 3] = _tqf.w;
      P[i * 3] = s.E.x; P[i * 3 + 1] = s.E.y; P[i * 3 + 2] = s.E.z; _tp.copy(s.E);
      // (the hand turned back by what its wanted turn is past the forearm's most - past it on the far side, back to the end it was
      // nearer - the less the straighter the arm, and none over the motion's last moments, so that it ends in the gun's own hand
      // exactly; reached at most TRK_TW a step, the way round that is the shorter from where it was)
      const raw = s.twRaw, kE = smooth(c.dur, c.dur - 0.14, t);
      if (raw >= TW_MAX[0] && raw <= TW_MAX[1]) side = raw < (TW_MAX[0] + TW_MAX[1]) / 2 ? -1 : 1;
      else if (!side) side = Math.abs(wrapA(raw - TW_MAX[0])) < Math.abs(wrapA(raw - TW_MAX[1])) ? -1 : 1;
      const edge = side < 0 ? TW_MAX[0] : TW_MAX[1], past = raw >= TW_MAX[0] && raw <= TW_MAX[1] ? 0 : wrapA(raw - edge);
      const want = s.bent * kE * past;
      ex = T[i] = ex === null ? want : ex + clamp(wrapA(want - ex), -(TRK_TW + (1 - kE) * 0.3), TRK_TW + (1 - kE) * 0.3);
    }
    trk.sx = ex; trk.ss = side; trk.sa = ar;
  }
  // the hand's turn as drawn the way has at t (null without a way)
  const _tqa = new QT(), _tqb = new QT(), _tqo = new QT();
  function trackQ(trk, t) {
    if (!trk) return null;
    trackTo(trk, t);
    const A = trk.Q4, u = clamp(t / TRK_H, 0, trk.n - 1), i = Math.min(trk.n - 2, Math.floor(u)), f = u - i;
    _tqa.set(A[i * 4], A[i * 4 + 1], A[i * 4 + 2], A[i * 4 + 3]); _tqb.set(A[i * 4 + 4], A[i * 4 + 5], A[i * 4 + 6], A[i * 4 + 7]);
    return _tqo.slerpQuaternions(_tqa, _tqb, f);
  }
  // where the way has the elbow at t (trk.ex: how far the hand is turned back about the forearm then)
  const _th = new V3();
  function trackAt(trk, t) {
    if (!trk) return null;
    trackTo(trk, t);
    const P = trk.P, u = clamp(t / TRK_H, 0, trk.n - 1), i = Math.min(trk.n - 2, Math.floor(u)), f = u - i;
    trk.ex = trk.T[i] + (trk.T[i + 1] - trk.T[i]) * f; trk.ar = trk.AR[i] + (trk.AR[i + 1] - trk.AR[i]) * f;
    return _th.set(P[i * 3] + (P[i * 3 + 3] - P[i * 3]) * f, P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * f, P[i * 3 + 2] + (P[i * 3 + 5] - P[i * 3 + 2]) * f);
  }

  // ------------------------------------------------ where a thrown shot is drawn from
  // The point in the world that is seen where the hand lets go (the palm, or the finger tip, of the hand that throws at the moment of
  // release, through the arms' camera onto the screen, and VIS_D m out along the line of sight there): null when no throw is being let
  // go. dist: how far out instead (m). Asked by combat.js spawnProjectile (and abilities.js, the bolt of 連鎖雷) while a held throw goes off
  let relC = null;
  const _vp = new V3(), _sol = { S: new V3(), E: new V3(), W: new V3(), Q: new QT(), a: 0, b: 0, tw: 0, phi: 0 };
  CA.visFrom = function (dist) {
    const c = relC, W = G.weapons, cam = G.camera; if (!c || !c.arms.length || !W.vmCam || !cam) return null;
    try {
      const a = c.arms[0]; if (a.trk) trackTo(a.trk, c.rel);
      const [w, q, , el, elW] = sample(a.ks, c.rel, c, a.A.side, c.dur);
      const h = trackAt(a.trk, c.rel), s = solveArm(w, q, el, elW, _sol, h, 0, h ? a.trk.ex : null, h ? a.trk.ar : null);
      if (h) holdTurn(s, trackQ(a.trk, c.rel));
      _vp.copy(c.relTip ? TIP : PALM).applyQuaternion(s.Q).add(s.W); _vp.x *= a.A.side;
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
  // the gun's own left hand as this left hand would be put to match it (in the right-handed space of the arms: x turned over): its
  // wrist, its turn and its fingers (hand.js GRIP: fore under a fore-end, fist round a handgun's grip). null where there is none
  function gripPose() {
    const W = G.weapons, m = W.dbgModel && W.dbgModel(); if (!m || !m.lHand || G.player.meleeMode) return null;
    m.group.updateMatrixWorld(true);
    const X = G.GFX, H = X && X.Hand, mesh = m.lHand.children.find((o) => o.isMesh);
    const fist = !!(mesh && X.hand && mesh.geometry === X.hand(false, true).hand), P = H && H.GRIP && H.GRIP[fist ? 'fist' : 'fore'];
    if (!P || !H.placement) {
      const p = m.lHand.getWorldPosition(new V3());
      return { p: sagged(new V3(-p.x, p.y, p.z).add(new V3(0.0, -0.015, 0.065))), q: null, F: null };
    }
    // (the gun's left hand is the right hand's grip seen in a mirror: its wrist at the grip's own place, x turned over, in the hand's
    // frame; its turn the hand's frame seen in the mirror, times the grip's)
    const pl = H.placement(P), lp = m.lHand.localToWorld(new V3(-pl.t.x, pl.t.y, pl.t.z)), wq = m.lHand.getWorldQuaternion(new QT());
    return { p: sagged(new V3(-lp.x, lp.y, lp.z)), q: new QT(wq.x, -wq.y, -wq.z, wq.w).multiply(pl.q), F: P.f.flat().concat(P.t) };
  }
  function gripPoint() { const g = gripPose(); return g ? g.p : null; }
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
    const from = cur && cur.freeze === undefined && opts.freeze === undefined ? armsNow(cur) : null;
    if (cur) stop(cur, true);
    const P = G.player, W = G.weapons;
    const side = mv.side === 'R' ? 1 : -1, melee = !!P.meleeMode;
    const ml = melee ? meleeLeft() : null;
    let gp = null; if (!melee) { try { gp = gripPose(); } catch (err) { gp = null; } }
    const grip = melee ? ml.grip : gp ? gp.p : null, gun = melee ? null : gunPoint();
    // the left hand alone, with a gun (or a hand weapon that leaves the left hand free) in the right: the weapon stays up and this hand
    // takes the place of its left one
    const oneHand = !mv.both && side < 0 && (melee ? ml.free : !!grip);
    const c = cur = { id, t: opts.freeze !== undefined ? opts.freeze : 0, freeze: opts.freeze, dur: mv.dur, rel: mv.rel, oneHand, lower: !oneHand, both: mv.both, side,
      w: P.weapon, melee, fire: opts.fire || null, fired: false, area: G.game && G.game.area, tick: mv.tick, grip, gun, gripQ: gp && gp.q, gripF: gp && gp.F, relP: mv.relP, relTip: false, hit: mv.hit,
      body: mv.body, jolt: mv.jolt.slice(), snd: mv.snd, si: 0, arms: [], from };
    const main = side < 0 ? rig.L : rig.R, other = side < 0 ? rig.R : rig.L;
    c.arms.push({ A: main, ks: resolve(mv.main, c, main.side) });
    if (mv.both) c.arms.push({ A: other, ks: resolve(mv.off || mv.main, c, other.side) });
    for (const a of c.arms) { a.A.g.visible = true; a.trk = CA._noTrack ? null : track(a, c); }
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
  // where each arm of a motion in play is now, by its side: the wrist (in the arm's own space), the hand's turn as drawn, the fingers,
  // the elbow
  function armsNow(c) {
    const o = {};
    for (const a of c.arms) { const A = a.A, s = A.sol; if (!A.fk) continue; o[A.side] = { P: s.W.clone(), Q: A.hand.quaternion.clone(), F: A.fk.slice(0, 20), E: s.E.clone() }; }
    return o;
  }
  // A motion cut short: what it held back goes off now, and the hand is taken back from where it is over BACK_T s, as fast as a man
  // pulls his hand back, not gone in a frame - onto the gun's fore-end for a shot, the sights or a reload (the gun's own hand shown
  // as it gets there), else down out of the view (a melee swing, a weapon switch, a motion of both hands: the gun comes back up as
  // they drop). A switch, an item, a throwable, the view, death: the arms are gone at once. While it is taken back a shot or another
  // reason does not cut it again
  const BACK_T = 0.13, BACK_HI = 0.17, BACK = { fire: 1, ads: 1, reload: 1, melee: 1, switch: 1 };
  function back(c, why) {
    if (c.fire && !c.fired) release(c);
    if (c.prop && c.prop.parent) c.prop.parent.remove(c.prop);
    const toGrip = c.oneHand && !c.melee && !!c.grip && why !== 'melee' && why !== 'switch';
    const from = armsNow(c), fl = from[-1], hi = toGrip && fl && fl.P.y > -0.14, T1 = hi ? BACK_HI : BACK_T;
    const b = Object.assign({}, c, { t: 0, dur: T1, rel: Infinity, hit: Infinity, fire: null, fired: true, lower: false, body: null, jolt: [], snd: [], si: 0,
      tick: null, prop: null, back: why, toGrip, arms: [], from });
    for (const a of c.arms) {
      const g = toGrip && a.A.side < 0;
      // (a hand raised high is brought down outside the shoulder, below the view, and onto the fore-end from below as the gun's own
      // hand comes to it - not swung down across the face)
      const ks = g ? [{ t: 0, p: 'grip' }].concat(hi ? [{ t: 0.07, p: [Math.max(0.34, fl.P.x), -0.3, clamp(fl.P.z, -0.26, -0.14)], q: [0.4, 0.1, -1.4], f: 'relax', e: 'o' }] : [], [{ t: T1, p: 'grip', q: GRIP_Q, f: 'grip', e: 'q' }])
        : [{ t: 0, p: 'rest' }, { t: T1, p: 'rest', q: REST_Q, f: 'relax', e: 'q' }];
      const arm = { A: a.A, ks: resolve(ks, b, a.A.side), toGrip: g }; arm.trk = CA._noTrack ? null : track(arm, b); b.arms.push(arm);
    }
    cur = b;
  }
  // (the gun's fore-end, where the hand is taken back to, followed as the gun moves: brought up to the eye, kicked by a shot)
  function backFollow(c) {
    if (!c.toGrip) return;
    let gp = null; try { gp = gripPose(); } catch (err) { gp = null; }
    if (!gp) return;
    for (const a of c.arms) { if (!a.toGrip) continue; const k = a.ks[a.ks.length - 1]; k.P.copy(gp.p); if (gp.q) k.Q.copy(gp.q); if (gp.F) k.F = gp.F.slice(); }
  }
  // cut the motion short (a shot, a reload ... : weapons.js); what it held back goes off now
  CA.cut = function (why) {
    if (!cur || cur.freeze !== undefined) return;
    CA._why = why;
    if (cur.back) { if (!BACK[why]) stop(cur, true); return; }
    if (BACK[why]) back(cur, why); else stop(cur, true);
  };
  CA.stop = () => { if (cur) stop(cur, true); for (const k of BK) BODY[k] = 0; };
  function pose(c) {
    // (the way worked out up to now first: its steps sample the keys too, and sample's answer is shared)
    for (const a of c.arms) { if (a.trk) trackTo(a.trk, c.t); const [w, q, F, el, elW] = sample(a.ks, c.t, c, a.A.side, c.dur); const h = trackAt(a.trk, c.t); poseArm(a.A, w, q, F, el, elW, h, h ? a.trk.ex : null, h ? a.trk.ar : null, h ? trackQ(a.trk, c.t) : null); }
    if (c.tick) { try { c.tick(c, c.t, rig); } catch (e) { console.error(e); } }
  }
  // (for the tools that look at the arms: where each joint of the arms now in play is, in the view's space, and the wrist's bend and
  // the forearm's turn)
  CA.joints = () => (cur ? cur.arms.map((a) => { const s = a.A.sol, m = (v) => [v.x * a.A.side, v.y, v.z]; return { side: a.A.side, S: m(s.S), E: m(s.E), W: m(s.W), a: s.a, b: s.b, tw: s.tw }; }) : []);
  CA.rig = () => rig;
  // (for the tools: how far round its circle (rad) each arm's elbow is now from where the body alone would have it - the wrist and
  // the forearm's turn left out)
  const _dv = { S: new V3(), E: new V3(), W: new V3(), Q: new QT(), a: 0, b: 0, tw: 0, phi: 0 };
  CA.elbowDev = () => (cur ? cur.arms.map((a) => {
    const [w, q, , el, elW] = sample(a.ks, cur.t, cur, a.A.side, cur.dur, true);
    CA._wrOff = true; let s; try { s = solveArm(w, q, el, elW, _dv); } finally { CA._wrOff = false; }
    const S = a.A.sol, ax = new V3().subVectors(S.W, S.S).normalize();
    const o1 = new V3().subVectors(S.E, S.S), o2 = new V3().subVectors(s.E, s.S);
    o1.addScaledVector(ax, -o1.dot(ax)); o2.addScaledVector(ax, -o2.dot(ax));
    return o1.length() < 0.02 || o2.length() < 0.02 ? 0 : o1.angleTo(o2);
  }) : []);
  // (for the tools: how far behind its keys each arm's hand turn (rad) and fingers (rad, the most of the 20) are now)
  CA.lagNow = () => (cur ? cur.arms.map((a) => {
    if (a.trk) trackTo(a.trk, cur.t);
    const [, q1, F] = sample(a.ks, cur.t, cur, a.A.side, cur.dur), q0 = quatAt(a.ks, cur.t, new QT()), q = (a.trk && trackQ(a.trk, cur.t)) || q1;
    let f = 0; for (let j = 0; j < 20; j++) f = Math.max(f, Math.abs(F[j] - fingAt(a.ks, cur.t, j)));
    return { q: 2 * Math.acos(Math.min(1, Math.abs(q.dot(q0)))), f };
  }) : []);
  // (for the tools: a frozen motion moved on to t s, posed there; false when no frozen motion is in play)
  CA.seek = (t) => { if (!cur || cur.freeze === undefined) return false; cur.t = cur.freeze = t; bodyAt(cur, t, BODY); pose(cur); return true; };
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
    let c = cur;
    if (c && c.freeze === undefined) {
      const why = cutBy(c);
      if (why && !(c.back && BACK[why])) { CA._why = why; if (BACK[why] && !c.back) back(c, why); else stop(c, true); }
      c = cur;
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
    if (c.back) backFollow(c);
    pose(c);
  };
  // the arms made and posed once behind the loading screen (their hands' own copies of gfx.js openHand, the sleeves): the first cast
  // otherwise spends some 70 ms on them (warmup.js, docs/tools/patch/castanim_warm.py)
  CA.warm = function () {
    if (!ensureRig()) return false;
    const F = fingArr('rest');
    for (const A of [rig.L, rig.R]) { A.fk = null; poseArm(A, REST_P, toQ(REST_Q, new QT()), F, null, 0); A.g.visible = false; }
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
