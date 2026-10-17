'use strict';
// Run plan: difficulty, segments of 6 areas (the 6th is a guardian), which field each segment is in,
// the enemy cap, stat multipliers and the "depth" used by mutations / anomalies / pile resistance.
(function () {
  const R = (G.Run = {});

  // fields: graveyard (outdoor night) / gate (dungeon entrance) / halls (deep multi-storey dungeon) / ruin (the ruined depths)
  R.DIFFS = {
    easy: { name: 'イージー', en: 'EASY', icon: '🌙', col: '#7acb6a', areas: 12, mul: 0.65, segs: [['grave', 3], ['grave', 5]], depth: [0, 0], desc: '初めての方に。短めの冒険で、敵も穏やか。' },
    normal: { name: 'ノーマル', en: 'NORMAL', icon: '⚔️', col: '#e0c070', areas: 18, mul: 1, segs: [['grave', 3], ['gate', 5], ['halls', 7]], depth: [0, 0, 0], desc: '標準の難易度。' },
    hard: { name: 'ハード', en: 'HARD', icon: '🔥', col: '#e07040', areas: 18, mul: 1.5, segs: [['gate', 3], ['halls', 6], ['ruin', 9]], depth: [0, 8, 16], desc: '手強い敵が待ち受け、深層の変異体や異変が現れる。' },
    extra: { name: 'エクストラ', en: 'EXTRA', icon: '☠️', col: '#d0405a', areas: 18, mul: 3, segs: [['ruin', 6], ['ruin', 10], ['ruin', 10]], depth: [6, 22, 34], desc: '最も過酷な挑戦。魂の灯火は一つも灯らない。' },
  };
  R.FIELD_NAME = { grave: '墓所', gate: '関門', halls: '回廊', ruin: '廃墟' };
  R.cur = { id: 'normal', lv: 0 };
  R.set = function (id, lv) { R.cur = { id: R.DIFFS[id] ? id : 'normal', lv: id === 'extra' ? Math.max(1, Math.min(10, lv | 0 || 1)) : 0 }; };
  R.def = () => R.DIFFS[R.cur.id];
  R.label = (d) => { d = d || R.cur; const D = R.DIFFS[d.id]; return d.id === 'extra' ? `${D.name}${d.lv}` : D.name; };
  R.key = (d) => { d = d || R.cur; return d.id === 'extra' ? 'extra' + d.lv : d.id; };
  R.areas = () => R.def().areas;
  R.seg = (n) => Math.max(0, Math.min(R.def().segs.length - 1, Math.floor((Math.max(1, n) - 1) / 6)));
  R.isBoss = (n) => n % 6 === 0;
  R.isLast = (n) => n >= R.areas();
  R.field = (n) => R.def().segs[R.seg(n)][0];
  R.cap = (n) => R.def().segs[R.seg(n)][1];
  // overall strength multiplier; extra n = 3 x 1.5^(n-1)
  R.baseMul = () => (R.cur.id === 'extra' ? 3 * Math.pow(1.5, R.cur.lv - 1) : R.def().mul);
  // the first segment is never brutal: the multiplier is softened there, and comes in fully from segment 2 on
  R.mul = function (n) {
    const m = R.baseMul(), s = R.seg(n);
    if (m <= 1) return m;
    return Math.pow(m, s === 0 ? 0.35 : s === 1 ? 0.85 : 1);
  };
  // enemy level: deeper difficulties start (and stay) at higher levels. Level already scales HP / damage, so the multipliers
  // below are divided by what the level offset adds, which keeps the overall toughness exactly as tuned.
  R.LV_OFF = { easy: 0, normal: 2, hard: 8, extra: 18 };
  R.lvOff = () => (R.LV_OFF[R.cur.id] || 0) + (R.cur.id === 'extra' ? 3 * R.cur.lv : 0);
  R.enemyLv = (n) => Math.max(1, n + R.lvOff());
  const fHp = (L) => (1 + 0.11 * L) * Math.pow(1.015, L), fDmg = (L) => 1 + 0.04 * L;
  // guardians keep their own level curve (area based), so they use the plain multipliers
  R.bossHpMul = (n) => R.mul(n);
  R.bossDmgMul = (n) => Math.pow(R.mul(n), 0.8);
  R.hpMul = (n) => Math.max(0.15, R.mul(n) * fHp(n - 1) / fHp(n - 1 + R.lvOff()));
  R.dmgMul = (n) => Math.max(0.15, Math.pow(R.mul(n), 0.8) * fDmg(n - 1) / fDmg(n - 1 + R.lvOff())); // damage climbs a little slower than toughness
  // soul lanterns (revive tickets): hard starts with one, extra has none and never earns any
  R.startRevives = () => (R.cur.id === 'extra' ? 0 : R.cur.id === 'hard' ? 1 : 3);
  R.revivesAllowed = () => R.cur.id !== 'extra';
  // "depth" (the old area number) used by mutations, anomalies and pile resistance
  R.depthArea = function (n) {
    const D = R.def(), s = R.seg(n);
    if (R.cur.id === 'easy') return Math.floor(n * 0.6);
    return n + (D.depth[s] || 0) + (R.cur.id === 'extra' ? 2 * R.cur.lv : 0);
  };

  // ---- unlocks (saved): hard clear opens extra 1; extra n clear opens extra n+1 ----
  R.rec = function () { const r = G.save.data.records; r.clears = r.clears || {}; return r.clears; };
  R.unlocked = function (id, lv) {
    const c = R.rec();
    if (id !== 'extra') return true;
    if (!c.hard) return false;
    return (lv || 1) <= 1 || !!c['extra' + ((lv || 1) - 1)];
  };
  R.maxExtra = function () { const c = R.rec(); if (!c.hard) return 0; let k = 1; while (k < 10 && c['extra' + k]) k++; return k; };
  R.markClear = function () { const c = R.rec(); const k = R.key(); const first = !c[k]; c[k] = (c[k] || 0) + 1; G.save.write(); return first; };

  // ---- guardians: each field has its own pool; one is drawn at random (equal odds) ----
  R.BOSS_POOLS = {
    grave: ['houndlord', 'boneking', 'broodmother', 'wyrm', 'colossus'],
    gate: ['warlock', 'boneking', 'cerberus', 'madman', 'executioner', 'colossus'],
    halls: ['warlock', 'boneking', 'cerberus', 'executioner', 'colossus'],
    ruin: ['ossuary', 'hollowknight', 'lich', 'behemoth', 'weaver'],
  };
  R.bossFor = function (n) {
    const pool = (R.BOSS_POOLS[R.field(n)] || []).filter((id) => G.BOSS_BY_ID[id] && G.bosses.has(id));
    if (!pool.length) return null;
    const rng = new G.RNG(((G.game.seed || 1) ^ G.U.hashStr('boss' + n)) >>> 0);
    return pool[Math.floor(rng.next() * pool.length)];
  };
})();
