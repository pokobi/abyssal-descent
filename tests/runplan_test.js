'use strict';
// The run plan's numbers (foe cap, strength, depth, coin income): eased across segment boundaries instead of jumping, and untouched where they were fine.
// Plain node: runplan.js only needs a G to hang itself on.
global.G = {};
require('../js/runplan.js');
const R = G.Run;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };

// the numbers before the easing, for comparison
const old = {
  cap: (n) => R.def().segs[R.seg(n)][1],
  mul: (n) => { const m = R.baseMul(), s = R.seg(n); return m <= 1 ? m : Math.pow(m, s === 0 ? 0.35 : s === 1 ? 0.85 : 1); },
  depth: (n) => { const D = R.def(), s = R.seg(n); return R.cur.id === 'easy' ? Math.floor(n * 0.6) : n + (D.depth[s] || 0) + (R.cur.id === 'extra' ? 2 * R.cur.lv : 0); },
};
const fHp = (L) => (1 + 0.11 * L) * Math.pow(1.015, L);
// the total toughness of the foes an area brings: foes allowed (cap) x one foe's health (area-based part x the segment multiplier)
const threat = (cap, mul, n) => cap(n) * fHp(n - 1) * mul(n);
const skip = (n) => R.isBoss(n) || R.isPrep(n); // (no foes of this kind there)

const modes = [['easy', 0], ['normal', 0], ['hard', 0], ['extra', 1], ['extra', 5], ['extra', 10]];
for (const [id, lv] of modes) {
  R.set(id, lv); const name = R.label();
  const N = R.areas();
  // 1. the first five areas are exactly what they were
  let same = true;
  for (let n = 1; n <= 5; n++) if (R.cap(n) !== old.cap(n) || Math.abs(R.mul(n) - old.mul(n)) > 1e-9 || R.depthArea(n) !== old.depth(n)) same = false;
  check(same, `${name}: areas 1-5 are untouched`);
  // 2. the guardians keep their own per-segment strength
  let boss = true;
  for (let n = R.CYCLE; n <= N; n += R.CYCLE) if (Math.abs(R.bossHpMul(n) - old.mul(n)) > 1e-9) boss = false;
  check(boss, `${name}: the guardians' strength is as it was`);
  // 3. no big step between the foe areas that follow each other (the preparation area and the guardian bring no ordinary foes, so area 5 is followed by area 8)
  const foes = []; for (let n = 1; n <= N; n++) if (!skip(n)) foes.push(n);
  const worst = (cap, mul) => { let w = 0, at = 0, wc = 0, ac = 0; for (let i = 1; i < foes.length; i++) { const r = threat(cap, mul, foes[i]) / threat(cap, mul, foes[i - 1]); const cross = foes[i] - foes[i - 1] > 1; if (cross) { if (r > wc) { wc = r; ac = foes[i]; } } else if (r > w) { w = r; at = foes[i]; } } return { w, at, wc, ac }; };
  const o = worst(old.cap, old.mul), c = worst(R.cap, R.mul);
  console.log(`     ${name}: growth between neighbouring areas ${o.w.toFixed(2)} (area ${o.at}) -> ${c.w.toFixed(2)} (area ${c.at}); after a guardian ${o.wc.toFixed(2)} (area ${o.ac}) -> ${c.wc.toFixed(2)} (area ${c.ac})`);
  const ow = Math.max(o.w, o.wc), cw = Math.max(c.w, c.wc);
  if (id === 'extra') check(cw < ow * 0.5, `${name}: the biggest step is less than half of what it was (${ow.toFixed(2)} -> ${cw.toFixed(2)})`);
  else {
    check(c.w <= (id === 'hard' ? 1.4 : 1.3), `${name}: no area brings more than ${id === 'hard' ? 40 : 30}% over the one before`);
    check(c.wc <= 1.55 && c.wc <= o.wc * 0.7, `${name}: and after a guardian at most 55% and well below what it was (${o.wc.toFixed(2)} -> ${c.wc.toFixed(2)})`);
  }
  // 4. depth only ever climbs, never faster than 2 per area, and never past what the plain plan reaches
  let mono = true, fast = true, over = true;
  for (let n = 2; n <= N; n++) { const d = R.depthArea(n) - R.depthArea(n - 1); if (d < 0) mono = false; if (d > (id === 'extra' ? 5 : 4) && id !== 'easy') fast = false; }
  for (let n = 1; n <= N; n++) if (R.depthArea(n) > old.depth(n)) over = false;
  check(mono && fast, `${name}: the depth climbs steadily (${Array.from({ length: N }, (_, i) => R.depthArea(i + 1)).join(' ')})`);
  check(over, `${name}: and never runs ahead of the old plan`);
  check(R.depthArea(N) === old.depth(N) || id === 'easy', `${name}: and arrives at the same depth by the end (${R.depthArea(N)} / ${old.depth(N)})`);
}
// the cap itself
R.set('normal', 0);
console.log('     normal cap by area: ' + Array.from({ length: 21 }, (_, i) => R.cap(i + 1).toFixed(1)).join(' '));
check(R.cap(1) === 3 && R.cap(5) === 3 && R.cap(12) === 5 && R.cap(19) === 7 && R.cap(8) < 3.6, 'normal: cap is 3 for the first 5 areas, 5 by area 12, 7 by area 19, and only a little over 3 at area 8');
{ let up = true; for (let n = 2; n <= 21; n++) if (R.cap(n) < R.cap(n - 1)) up = false; check(up, 'normal: the cap never goes down'); }
// coin income: lean early on easy / normal and hard's first segment, nothing in extra
R.set('normal', 0);
check(Math.abs(R.incomeMul(1) - 1.8) < 1e-9 && Math.abs(R.incomeMul(14) - 1.2) < 1e-9 && R.incomeMul(21) === 1.2, 'normal: coins x1.8 at area 1 down to x1.2 from area 14');
R.set('easy', 0); check(Math.abs(R.incomeMul(1) - 1.8) < 1e-9, 'easy: the same as normal');
R.set('hard', 0);
check(Math.abs(R.incomeMul(1) - 1.5) < 1e-9 && Math.abs(R.incomeMul(7) - 1) < 1e-9 && R.incomeMul(8) === 1 && R.incomeMul(20) === 1, 'hard: x1.5 at area 1, x1 from area 7 on (no extra coins where gold items are rich)');
R.set('extra', 3); check(R.incomeMul(1) === 1 && R.incomeMul(10) === 1, 'extra: no extra coins');
// shop rarity
R.set('normal', 0);
check(R.shopRarityBonus(1) === 10 && R.shopRarityBonus(6) === 10 && R.shopRarityBonus(11) === 5 && R.shopRarityBonus(16) === 0 && R.shopRarityBonus(30) === 0, 'normal: shops judge rarity 10 deeper in the first fields, fading out by area 16');
R.set('hard', 0); check(R.shopRarityBonus(1) === 0, 'hard: no bonus'); R.set('extra', 1); check(R.shopRarityBonus(1) === 0, 'extra: no bonus');

console.log(fails.length ? `\nRUN PLAN TEST FAILED (${fails.length})` : '\nRUN PLAN TEST PASSED');
process.exit(fails.length ? 1 : 0);
