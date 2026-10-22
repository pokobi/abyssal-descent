'use strict';
// Guardians (v5, part 2): what the older guardians gain (2-3 new patterns each) and tighter old moves. See bosses5.js for the pattern library.
(function () {
  const BS = G.bosses;

  // ---- the older (class) guardians: a new pattern is picked now and then in place of their usual attack ----
  const XP = {
    colossus: [
      { k: 'x_rings', n: 3, gap: 0.8, speed: 16, dmg: 30, col: 0xffa060 },
      { k: 'x_meteors', n: 7, r: 3.6, dmg: 30, col: 0xd08040, delay: 1.2 },
      { k: 'x_lines', mode: 'fan', n: 5, spread: 0.4, len: 44, wid: 3.4, dmg: 34, col: 0xff8030, phase: 2 },
    ],
    executioner: [
      { k: 'x_shockline', n: 3, spread: 0.5, wid: 6, dmg: 30, col: 0xff6040 },
      { k: 'x_chase', n: 5, r: 3, dmg: 26, col: 0xff4020 },
      { k: 'x_lines', mode: 'around', n: 6, len: 38, wid: 3, dmg: 32, col: 0xff4020, phase: 2 },
    ],
    broodmother: [
      { k: 'x_trail', dur: 3.2, iv: 0.4, delay: 1.1, r: 2.6, dmg: 22, col: 0x80ff40, zone: { kind: 'acid', dur: 3, dps: 8 } },
      { k: 'x_lines', mode: 'around', n: 5, len: 36, wid: 2.6, dmg: 26, col: 0xd8d8d8, zone: { kind: 'web', dur: 4, dps: 0 } },
      { k: 'x_chase', n: 4, r: 2.8, dmg: 24, col: 0x80ff40, elem: 'poison', phase: 2 },
    ],
  };
  BS.pickX = function (key, boss) {
    const L = XP[key]; if (!L || boss.dead) return null;
    if (Math.random() >= Math.min(0.7, 0.26 * BS.heavyMul())) return null;
    const ok = L.filter((x) => (x.phase || 1) <= (boss.phase || 1) && x.k !== boss._lastX);
    if (!ok.length) return null;
    const pick = ok[Math.floor(Math.random() * ok.length)]; boss._lastX = pick.k;
    return Object.assign({ t: 0 }, pick);
  };
  // the dive-and-erupt serpent has no attack list: its new patterns start on its state changes and run alongside the dive
  const XT = { wyrm: { surface: [{ k: 'x_shockline', n: 4, spread: 0.45, wid: 5, dmg: 28, col: 0xd08040 }, { k: 'x_rings', n: 3, speed: 14, dmg: 30, col: 0xd08040, phase: 2 }], under: [{ k: 'x_chase', n: 4, r: 3, dmg: 24, col: 0xd08040 }] } };
  BS.xTick = function (b, dt, key) {
    if (b.dead) return;
    if (b.xa) { b.xa.t += dt; if (BS.runX(b, b.xa, dt)) b.xa = null; return; }
    const trig = XT[key]; if (!trig || b.state === b._xst) return;
    b._xst = b.state;
    const list = (trig[b.state] || []).filter((x) => (x.phase || 1) <= (b.phase || 1));
    if (list.length && Math.random() < Math.min(0.9, 0.5 * BS.heavyMul())) b.xa = Object.assign({ t: 0 }, list[Math.floor(Math.random() * list.length)]);
  };

  // ---- the data-driven guardians: new attacks (flags: heavy = favoured in harder modes, phase = from that phase on) ----
  const ADD = {
    houndlord: [
      { k: 'trail', pose: 'howl', wind: 0.6, dur: 3.2, iv: 0.4, delay: 1.1, r: 2.4, dmg: 22, col: 0x9aff60, w: 1.3, heavy: true },
      { k: 'shockline', pose: 'howl', wind: 0.7, n: 3, spread: 0.55, dmg: 26, col: 0x9aff60, w: 1.3, phase: 2, heavy: true },
      { k: 'leapx', pose: 'leap', hops: 3, dmg: 28, r: 4.4, height: 6, col: 0x9aff60, min: 5, w: 1.2, phase: 2, heavy: true },
    ],
    boneking: [
      { k: 'lines', pose: 'slam', mode: 'fan', n: 5, spread: 0.35, len: 40, wid: 3, dmg: 30, col: 0x60d0ff, w: 1.3 },
      { k: 'chase', pose: 'cast', n: 4, r: 3, dmg: 24, col: 0x60d0ff, w: 1.2, phase: 2, heavy: true },
      { k: 'rings', pose: 'slam', n: 3, speed: 15, dmg: 28, col: 0x60d0ff, w: 1.1, phase: 2, heavy: true },
    ],
    warlock: [
      { k: 'spiral', pose: 'cast', arms: 3, dur: 3.4, proj: 'darkorb', dmg: 12, speed: 12, rot: 1.5, w: 1.4 },
      { k: 'beam', pose: 'cast', arms: 2, dur: 3.0, dmg: 9, col: 0xb060ff, h: 1.2, low: true, w: 1.1, phase: 2, heavy: true },
      { k: 'trail', pose: 'cast', dur: 3.0, delay: 1.1, r: 2.6, dmg: 22, col: 0xb060ff, w: 1.2, phase: 2, heavy: true },
    ],
    cerberus: [
      { k: 'rings', pose: 'bite', n: 3, gap: 0.8, speed: 15, dmg: 30, col: 0xff8030, w: 1.3 },
      { k: 'lines', pose: 'breath', mode: 'cross', n: 4, len: 40, wid: 3.4, dmg: 32, col: 0xff6020, zone: { kind: 'fire', dur: 4, dps: 8 }, w: 1.2, phase: 2, heavy: true },
      { k: 'meteors', pose: 'howl', n: 8, r: 3.4, dmg: 26, col: 0xff6020, zone: { kind: 'fire', dur: 3, dps: 8 }, w: 1.1, phase: 2, heavy: true },
    ],
    madman: [
      { k: 'mblink', hits: 4, dmg: 20, r: 4.8, col: 0xffd040, tele: 0.42, w: 1.5, heavy: true },
      { k: 'shockline', pose: 'throw', n: 3, spread: 0.35, wid: 4, dmg: 22, col: 0xffd040, w: 1.3 },
      { k: 'chase', pose: 'throw', n: 5, r: 2.6, dmg: 20, col: 0xffa030, delay: 0.8, w: 1.2, phase: 2, heavy: true },
    ],
    ossuary: [
      { k: 'rings', pose: 'slam', n: 4, gap: 0.8, speed: 14, dmg: 36, col: 0xe0d0b0, wind: 1.0, w: 1.5, heavy: true },
      { k: 'meteors', pose: 'cast', n: 9, r: 3.6, dmg: 32, col: 0xe0d0b0, w: 1.3 },
      { k: 'lines', pose: 'slam', mode: 'around', n: 6, len: 40, wid: 3.4, dmg: 36, col: 0xe0d0b0, w: 1.2, phase: 2, heavy: true },
    ],
    hollowknight: [
      { k: 'mblink', hits: 3, dmg: 28, r: 5, col: 0x80a0ff, tele: 0.45, w: 1.5, heavy: true },
      { k: 'shockline', pose: 'swing', n: 3, spread: 0.45, wid: 4.5, dmg: 28, col: 0x80a0ff, w: 1.5, phase: 2, heavy: true },
      { k: 'gravity', pose: 'cast', r: 7.5, dmg: 36, col: 0x8080ff, w: 1.1, heavy: true },
    ],
    lich: [
      { k: 'spiral', pose: 'cast', arms: 4, dur: 3.6, proj: 'frostorb', dmg: 13, speed: 11, elem: 'frost', rot: 1.3, w: 1.5 },
      { k: 'meteors', pose: 'cast', n: 9, r: 3, dmg: 26, col: 0x60e0ff, elem: 'frost', w: 1.3, phase: 2 },
      { k: 'gravity', pose: 'cast', r: 8, dmg: 34, col: 0x60e0ff, w: 1.1, phase: 2, heavy: true },
    ],
    behemoth: [
      { k: 'lines', pose: 'bite', mode: 'fan', n: 5, spread: 0.4, len: 44, wid: 3.6, dmg: 38, col: 0xff7030, zone: { kind: 'fire', dur: 4, dps: 9 }, w: 1.3 },
      { k: 'rings', pose: 'leap', n: 3, gap: 0.9, speed: 13, dmg: 40, col: 0xd08040, w: 1.4, heavy: true },
      { k: 'meteors', pose: 'bite', n: 8, r: 4, dmg: 36, col: 0xd08040, w: 1.2, phase: 2, heavy: true },
    ],
    weaver: [
      { k: 'trail', pose: 'spit', dur: 3.2, delay: 1.1, r: 2.6, dmg: 22, col: 0x80ff40, zone: { kind: 'acid', dur: 3, dps: 8 }, w: 1.3 },
      { k: 'lines', pose: 'spit', mode: 'around', n: 5, len: 38, wid: 2.8, dmg: 26, col: 0xd8d8d8, zone: { kind: 'web', dur: 4, dps: 0 }, w: 1.2, heavy: true },
      { k: 'chase', pose: 'spit', n: 4, r: 2.8, dmg: 24, col: 0x80ff40, elem: 'poison', w: 1.2, phase: 2 },
      { k: 'leapx', pose: 'leap', hops: 3, dmg: 28, r: 4.2, height: 6, col: 0xa040ff, min: 5, w: 1.1, phase: 2, heavy: true },
    ],
  };
  const SP = BS.SPECS;
  for (const id of Object.keys(SP)) {
    const S = SP[id];
    if (S._v5) continue;
    S._v5 = true;
    // tighter: shorter wind-ups, shorter rests between attacks, the phases come a little earlier and faster
    for (const a of S.attacks) if (a.wind) a.wind = Math.max(0.28, a.wind * 0.92);
    S.cd = (S.cd || 1.6) * 0.9;
    for (const ph of S.phases || []) { ph.at = Math.min(0.9, ph.at + 0.05); if (ph.speed) ph.speed += 0.05; }
    for (const x of ADD[id] || []) S.attacks.push(Object.assign({}, x));
  }
})();
