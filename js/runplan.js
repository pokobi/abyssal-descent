'use strict';
// Run plan: difficulty, segments of 7 areas (5 ordinary ones, a merchant-only preparation area, then the guardian), which field each segment is in,
// the enemy cap, stat multipliers and the "depth" used by mutations / anomalies / pile resistance.
(function () {
  const R = (G.Run = {});

  // fields: graveyard (outdoor night) / gate (dungeon entrance) / halls (deep multi-storey dungeon) / ruin (the ruined depths)
  R.DIFFS = {
    easy: { name: 'イージー', en: 'EASY', icon: '🌙', col: '#7acb6a', areas: 14, mul: 0.65, segs: [['grave', 3], ['grave', 5]], depth: [0, 0], desc: '初めての方に。短めの冒険で、敵も穏やか。' },
    normal: { name: 'ノーマル', en: 'NORMAL', icon: '⚔️', col: '#e0c070', areas: 21, mul: 1, segs: [['grave', 3], ['gate', 5], ['halls', 7]], depth: [0, 0, 0], desc: '標準の難易度。' },
    hard: { name: 'ハード', en: 'HARD', icon: '🔥', col: '#e07040', areas: 21, mul: 1.5, segs: [['gate', 3], ['halls', 6], ['ruin', 9]], depth: [0, 8, 16], desc: '手強い敵が待ち受け、深層の変異体や異変が現れる。' },
    extra: { name: 'エクストラ', en: 'EXTRA', icon: '☠️', col: '#d0405a', areas: 21, mul: 3, segs: [['ruin', 6], ['ruin', 10], ['ruin', 10]], depth: [6, 22, 34], desc: '最も過酷な挑戦。魂の灯火は一つも灯らない。' },
  };
  R.FIELD_NAME = { grave: '墓所', gate: '関門', halls: '回廊', ruin: '廃墟', hamlet: '廃村', dusk: '黄昏の都', catacombs: '地下墓所', castle: '古城', flooded: '水没回廊', foundry: '溶鉱炉', frozen: '霊廟', sanctum: '聖域', battlefield: '古戦場', shaft: '大縦坑', mine: '坑道', pillars: '石柱の海' };
  // ---- the fields of a run: four depth tiers of three fields each. A difficulty's segments name the tier (by its first field, as above);
  // every run draws one field of that tier per segment (never the same one twice in a run while there is another to take), so the
  // depth, foe numbers and strength of each segment stay exactly what they were and only the place changes.
  R.TIERS = [
    ['grave', 'hamlet', 'dusk', 'battlefield'], // 地上
    ['gate', 'catacombs', 'castle', 'shaft'], // 入口
    ['halls', 'flooded', 'foundry', 'mine'], // 中層
    ['ruin', 'frozen', 'sanctum', 'pillars'], // 深層
  ];
  R.tierOf = (f) => R.TIERS.findIndex((t) => t.includes(f));
  R.baseOf = (f) => { const t = R.TIERS[R.tierOf(f)]; return t ? t[0] : f; };
  // a field joins the draw once its generator exists (fieldgen.js registers them)
  R.ready = (f) => !!(G.FieldGen && G.FieldGen.gen && G.FieldGen.gen[f]);
  // legacy: a run saved before the draw existed keeps the fields it was made with (its saved area is rebuilt from them)
  R.legacy = false; R._nextLegacy = false;
  R.drawOn = () => !R.legacy && !!(G.game && G.game.seed) && !(G.game.tutorial || (G.Tutorial && G.Tutorial.active));
  R.fieldsFor = function (seed, d) {
    const D = R.DIFFS[d.id] || R.DIFFS.normal, out = [], used = new Set();
    const rng = new G.RNG(((seed || 1) ^ G.U.hashStr('fields:' + d.id)) >>> 0);
    for (const [base] of D.segs) {
      const t = R.TIERS[R.tierOf(base)] || [base], cand = t.filter((f) => f === base || R.ready(f));
      const fresh = cand.filter((f) => !used.has(f)), from = fresh.length ? fresh : cand;
      const f = from[Math.floor(rng.next() * from.length) % from.length] || base;
      used.add(f); out.push(f);
    }
    return out;
  };
  let fieldsKey = '', fieldsVal = null;
  R.runFields = function () {
    const seed = G.game.seed, key = seed + '|' + R.key() + '|' + Object.keys((G.FieldGen && G.FieldGen.gen) || {}).length;
    if (key !== fieldsKey) { fieldsKey = key; fieldsVal = R.fieldsFor(seed, R.cur); }
    return fieldsVal;
  };
  R.cur = { id: 'normal', lv: 0 };
  R.set = function (id, lv) { R.cur = { id: R.DIFFS[id] ? id : 'normal', lv: id === 'extra' ? Math.max(1, Math.min(10, lv | 0 || 1)) : 0 }; };
  R.def = () => R.DIFFS[R.cur.id];
  R.label = (d) => { d = d || R.cur; const D = R.DIFFS[d.id]; return d.id === 'extra' ? `${D.name}${d.lv}` : D.name; };
  R.key = (d) => { d = d || R.cur; return d.id === 'extra' ? 'extra' + d.lv : d.id; };
  R.areas = () => R.def().areas;
  R.CYCLE = 7; // areas 1-5 ordinary, 6 = the merchant-only preparation area, 7 = the guardian
  R.seg = (n) => Math.max(0, Math.min(R.def().segs.length - 1, Math.floor((Math.max(1, n) - 1) / R.CYCLE)));
  R.isBoss = (n) => n % R.CYCLE === 0;
  R.isPrep = (n) => n % R.CYCLE === R.CYCLE - 1;
  R.isLast = (n) => n >= R.areas();
  R.field = (n) => (R.drawOn() ? R.runFields()[R.seg(n)] : R.def().segs[R.seg(n)][0]);
  // A number that differs from segment to segment (the foe cap, the strength exponent, the depth offset) is eased in over the 5 foe areas that follow a boundary
  // instead of jumping at it. Only areas that bring ordinary foes count (the preparation area and the guardian that close a segment are not steps on the way:
  // after the guardian the next area is the very next step), so the first 5 areas of a run, and the last of each segment, are never touched.
  const ease = (t) => { t = Math.max(0, Math.min(1, t)); return 0.5 * t + 0.5 * t * t * (3 - 2 * t); }; // (half straight, half S-curve: steady steps, without a hard start)
  R.foePos = function (n) {
    n = Math.max(1, n);
    if (R.isBoss(n)) n -= 2; else if (R.isPrep(n)) n -= 1; // (these stand where the last ordinary area of their segment stood)
    return n - 2 * Math.min(R.def().segs.length - 1, Math.floor((n - 1) / R.CYCLE));
  };
  R.blend = function (n, vals) {
    const p = R.foePos(n);
    let v = vals[0];
    for (let j = 1; j < vals.length; j++) v += (vals[j] - vals[j - 1]) * ease((p - 5 * j) / 5);
    return v;
  };
  R.cap = (n) => R.blend(n, R.def().segs.map((s) => s[1]));
  // overall strength multiplier; extra n = 3 x 1.5^(n-1)
  R.baseMul = () => (R.cur.id === 'extra' ? 3 * Math.pow(1.5, R.cur.lv - 1) : R.def().mul);
  // the first segment is never brutal: the multiplier is softened there, and comes in fully from segment 2 on (eased in over the boundary)
  const MUL_EXP = [0.35, 0.85, 1];
  R.mul = function (n) {
    const m = R.baseMul();
    if (m <= 1) return m;
    return Math.pow(m, R.blend(n, MUL_EXP));
  };
  // (the guardians keep the plain per-segment step: they are tuned one by one)
  R.stepMul = function (n) {
    const m = R.baseMul();
    if (m <= 1) return m;
    return Math.pow(m, MUL_EXP[Math.min(MUL_EXP.length - 1, R.seg(n))]);
  };
  // ---- the coin income: lean early (so a shop in the first fields can sell something good), back to 1x where drops (gold items) are rich on their own ----
  // easy / normal 1.8x at area 1 down to 1.2x at area 14; hard 1.5x down to 1x by area 7 (its gold items turn rich from the second segment); extra 1x
  R.incomeMul = function (n) {
    n = Math.max(1, n || 1);
    if (R.cur.id === 'extra') return 1;
    if (R.cur.id === 'hard') return 1 + 0.5 * Math.max(0, 1 - (n - 1) / 6);
    return 1.2 + 0.6 * Math.max(0, 1 - (n - 1) / 13);
  };
  R.income = (v) => v * R.incomeMul(G.game ? G.game.area : 1);
  // the shops judge rarity as if deeper (epics show up from the early fields, legendaries stay late): easy / normal only, fading out by area 16
  R.shopRarityBonus = function (n) {
    if (R.cur.id !== 'easy' && R.cur.id !== 'normal') return 0;
    return Math.max(0, Math.min(10, 10 * (1 - (n - 6) / 10)));
  };
  // enemy level: deeper difficulties start (and stay) at higher levels. Level already scales HP / damage, so the multipliers
  // below are divided by what the level offset adds, which keeps the overall toughness exactly as tuned.
  R.LV_OFF = { easy: 0, normal: 2, hard: 8, extra: 18 };
  R.lvOff = () => (R.LV_OFF[R.cur.id] || 0) + (R.cur.id === 'extra' ? 7 * R.cur.lv : 0);
  R.enemyLv = (n) => Math.max(1, n + R.lvOff());
  const fHp = (L) => (1 + 0.11 * L) * Math.pow(1.015, L), fDmg = (L) => 1 + 0.04 * L;
  // guardians keep their own level curve (area based), so they use the plain multipliers
  R.bossHpMul = (n) => R.stepMul(n);
  R.bossDmgMul = (n) => Math.pow(R.stepMul(n), 0.8);
  R.hpMul = (n) => Math.max(0.15, R.mul(n) * fHp(n - 1) / fHp(n - 1 + R.lvOff()));
  R.dmgMul = (n) => Math.max(0.15, Math.pow(R.mul(n), 0.8) * fDmg(n - 1) / fDmg(n - 1 + R.lvOff())); // damage climbs a little slower than toughness
  // the depth that decides the RARITY of drops (chests, corpses): hard / extra push their mutation depth far ahead of the area number,
  // but loot only follows about a third of that lead (at least +3 in hard / +5 in extra, at most 9 ahead), so epic / legendary stay late-run things there too
  R.lootDepth = (n) => { const d = R.depthArea(n); if (R.cur.id === 'easy' || R.cur.id === 'normal') return d; return n + Math.max(R.cur.id === 'extra' ? 5 : 3, Math.min(9, (d - n) * 0.35)); };
  // what a "valuable" (sell-only trinket) is worth, and how often it drops: less in the harder modes, where everything else is richer
  R.valuableMul = () => (R.cur.id === 'extra' ? 0.5 : R.cur.id === 'hard' ? 0.7 : 1);
  R.valuableShare = () => (R.cur.id === 'extra' ? 0.5 : R.cur.id === 'hard' ? 0.65 : 1);
  // soul lanterns (revive tickets): hard starts with one, extra has none and never earns any
  R.startRevives = () => (R.cur.id === 'extra' ? 0 : R.cur.id === 'hard' ? 1 : 3);
  R.revivesAllowed = () => R.cur.id !== 'extra';
  // "depth" (the old area number) used by mutations, anomalies and pile resistance
  R.depthArea = function (n) {
    const D = R.def(), s = R.seg(n);
    if (R.cur.id === 'easy') return Math.floor(n * 0.6);
    return n + Math.round(R.blend(n, D.depth)) + (R.cur.id === 'extra' ? 2 * R.cur.lv : 0);
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
  R.markClear = function () { const c = R.rec(); const k = R.key(); const first = !c[k]; c[k] = (c[k] || 0) + 1; const r = G.save.data.records, ck = (G.player && G.player.cls) || 'soldier'; r.byClass = r.byClass || {}; const bc = r.byClass[ck] || (r.byClass[ck] = { bestArea: 0, clears: {} }); bc.clears[k] = (bc.clears[k] || 0) + 1; G.save.write(); return first; };

  // ---- guardians: each field has its own pool; one is drawn at random (equal odds) ----
  R.BOSS_POOLS = {
    grave: ['houndlord', 'boneking', 'broodmother', 'wyrm', 'colossus', 'oboro', 'foxfire', 'stormimp'],
    gate: ['warlock', 'boneking', 'cerberus', 'madman', 'executioner', 'colossus', 'warden', 'arbiter', 'minotaur', 'oboro', 'karakuri', 'stormimp'],
    halls: ['warlock', 'boneking', 'cerberus', 'executioner', 'colossus', 'warden', 'arbiter', 'minotaur', 'oboro', 'karakuri', 'foxfire'],
    ruin: ['ossuary', 'hollowknight', 'lich', 'behemoth', 'weaver', 'warden', 'arbiter', 'minotaur', 'cinderpriest', 'ashdrake', 'foxfire', 'karakuri', 'stormimp'],
  };
  // a field without a pool of its own draws from its tier's first field (the guardians' strength follows the segment, not the place)
  R.bossPool = (f) => R.BOSS_POOLS[f] || R.BOSS_POOLS[R.baseOf(f)] || [];
  // the small, quick guardians (bosses7.js) make up about a third of every field's draw, however many big ones the field has
  R.SMALL_SHARE = 1 / 3;
  const isSmall = (id) => !!(G.BOSS_BY_ID[id] && G.BOSS_BY_ID[id].small);
  // a run never meets the same guardian twice: the earlier guardians of the run are drawn first (drawn from the run's own random key, so a restarted area meets the same one), then excluded
  R.bossFor = function (n) {
    if (R.cur.id === 'extra' && R.isLast(n)) return 'sovereign'; // extra: the last guardian is always the Crimson Sovereign, on its own field
    const used = new Set(), draw = (m) => {
      const pool = R.bossPool(R.field(m)).filter((id) => G.BOSS_BY_ID[id] && G.bosses.has(id));
      if (!pool.length) return null;
      const fresh = pool.filter((id) => !used.has(id)), c = fresh.length ? fresh : pool;
      const rng = new G.RNG(((G.game.seed || 1) ^ G.U.hashStr('boss' + m)) >>> 0);
      const ns = c.filter(isSmall).length, nb = c.length - ns;
      const ws = ns && nb ? R.SMALL_SHARE * nb / ((1 - R.SMALL_SHARE) * ns) : 1, wt = (id) => (isSmall(id) ? ws : 1);
      let x = rng.next() * c.reduce((s, id) => s + wt(id), 0), id = c[c.length - 1];
      for (const k of c) { x -= wt(k); if (x <= 0) { id = k; break; } }
      used.add(id); return id;
    };
    for (let m = R.CYCLE; m < n; m += R.CYCLE) draw(m);
    return draw(n);
  };
})();
