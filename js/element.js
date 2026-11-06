'use strict';
// Elements: a system of their own beside the status effects (burn, frost, poison, shock stay as they are).
// A hit that carries an element leaves it on the foe (fire / water / ice / volt, 8 s). A different element landing on it sets off a reaction and both are spent.
// Wind and earth never stay: they only act on what is already there. A foe born with an element keeps it for good (it reacts, it is never replaced).
// The player can carry an element too (from the attacks of elemental foes) and suffers the reactions in a milder form.
// Reaction strength: 属性熟練 (elMastery) on its own curve, times the reaction boons (reactDmg / rx_*) as a separate factor.
(function () {
  const EL = (G.Elem = {});
  let P = null, C = null;
  EL.init = function () { P = G.player; C = G.combat; EL.crystals.length = 0; if (G.save && G.save.mark) for (const c of EL.CODEX) if (c.always) G.save.mark('items', c.id); };

  EL.LIST = [
    { id: 'fire', name: '炎', icon: '🔥', col: '#ff6a3a', hex: 0xff6a3a, aura: true },
    { id: 'water', name: '水', icon: '💧', col: '#3f9dff', hex: 0x3f9dff, aura: true },
    { id: 'ice', name: '氷', icon: '❄️', col: '#a8ecff', hex: 0xa8ecff, aura: true },
    { id: 'volt', name: '雷', icon: '⚡', col: '#b88cff', hex: 0xb88cff, aura: true },
    { id: 'wind', name: '風', icon: '🌪️', col: '#4fd8c0', hex: 0x4fd8c0, aura: false },
    { id: 'earth', name: '地', icon: '🪨', col: '#e0a640', hex: 0xe0a640, aura: false },
  ];
  EL.IDS = EL.LIST.map((x) => x.id);
  EL.LIST.forEach((x) => { x.desc = { fire: '炎上を付けると炎も付く。水が付いた敵に当てると沸騰（×1.5）、氷が付いた敵に当てると熱融（×2.0）。', water: '他の属性の下地。炎で沸騰、氷で凍結、雷で漏電。炎上中の敵に当てると炎上が消える。', ice: '冷気を付けると氷も付く。水で凍結、炎が付いた敵に当てると熱融（×1.5）、雷で脆化。', volt: '電撃を付けると雷も付く。炎で爆轟、水で漏電、氷で脆化。', wind: '敵に残らない。付いている属性を周囲6mの敵へ広げる（旋風）。', earth: '敵に残らない。付いている属性で結晶を作る（晶壁）。凍結中の敵を砕く（粉砕）。' }[x.id]; });
  EL.BY = Object.fromEntries(EL.LIST.map((x) => [x.id, x]));
  EL.idx = (id) => EL.IDS.indexOf(id) + 1; // 0 = none (wire format)
  EL.of = (i) => EL.IDS[i - 1] || null;

  EL.RX = {
    boil: { name: '沸騰', col: '#ff9a5a', desc: '炎と水。炎が付いた敵に水で×2.0、水が付いた敵に炎で×1.5。' },
    thaw: { name: '熱融', col: '#ffb0c8', desc: '炎と氷。炎が付いた敵に氷で×1.5、氷が付いた敵に炎で×2.0。' },
    freeze: { name: '凍結', col: '#9fe0ff', desc: '水と氷。通常の敵は3秒、精鋭は1.5秒凍る。ボスは凍らず3秒間60%鈍化。' },
    shatter: { name: '粉砕', col: '#e8f8ff', desc: '凍結中の敵に地属性・近接の重撃・パイルドライバー。凍結を割って大ダメージ。' },
    blast: { name: '爆轟', col: '#ff6aa8', desc: '炎と雷。半径4mの爆発と吹き飛ばし。' },
    leak: { name: '漏電', col: '#7aa8ff', desc: '水と雷。4秒間0.5秒ごとにダメージ。近くの水が付いた敵にも移る。電撃を付ける。' },
    brittle: { name: '脆化', col: '#d0b8ff', desc: '氷と雷。8秒間その敵の被ダメ+25%（ボスは+15%）。' },
    swirl: { name: '旋風', col: '#4fd8c0', desc: '風と炎・水・氷・雷。周囲6mの敵に同じ属性をばらまく。' },
    crystal: { name: '晶壁', col: '#e0a640', desc: '地と炎・水・氷・雷。結晶が落ち、拾うとシールドとその属性の耐性を得る。' },
  };

  // the codex page (js/codex.js): the elements are always shown, a reaction once you have set it off
  EL.CODEX = [
    { id: 'el_about', name: '属性について', icon: '🌈', rarity: 'common', cat: '属性', always: true, desc: '炎・水・氷・雷は当たった敵に8秒間残る（自分にも6秒）。炎上・冷気・電撃を付けると、炎・氷・雷も付く。属性が残っている敵に違う属性が当たると反応が起き、どちらの属性も、それに伴う状態異常（炎上・冷気・電撃）も消える。風と地は残らず、付いている属性に作用するだけ。\n銃は同じ敵へ2.5秒に1回、近接は1秒に1回だけ属性を残す。スキル・アルティメット・投擲物は毎回。\n常に属性を帯びた敵は上書きされず、他の属性で必ず反応する（同じ敵では1秒に1回）。\n属性熟練：反応が強くなる。属性耐性：その属性から受けるダメージが減る。' },
    ...['fire', 'water', 'ice', 'volt', 'wind', 'earth'].map((id) => ({ id: 'el_' + id, always: true, cat: '属性' })),
    ...Object.entries({ boil: '♨️', thaw: '🌡️', freeze: '🧊', shatter: '💎', blast: '💥', leak: '🔌', brittle: '💔', swirl: '🌀', crystal: '💠' }).map(([id, icon]) => ({ id: 'rx_' + id, icon, rarity: 'rare', cat: '反応' })),
  ];
  // does the player have any way to leave an element? (the element boons are offered only then)
  // an element on a gun / melee weapon, an elemental skill or ultimate, an elemental grenade in the bag, or anything that burns / chills / shocks
  // (since burn, frost and shock leave fire / ice / volt too)
  EL.STATUS_EL = { fire: 'fire', burn: 'fire', frost: 'ice', shock: 'volt' };
  EL.hasSource = function (P) {
    if (!P) return false;
    for (const w of P.weapons || []) { if (EL.wEl(w)) return true; const s = G.weapons.stats(w); if (s.elem && EL.STATUS_EL[s.elem]) return true; }
    if (P.melee && (EL.wEl(P.melee) || (P.melee.def.elem && EL.STATUS_EL[P.melee.def.elem]))) return true;
    for (const s of P.skills || []) if (s && EL.skEl(s.id)) return true;
    for (const id of Object.keys(P.grenades || {})) if (P.grenades[id] > 0 && (EL.GREN[id] || (G.ITEM_BY_ID[id] && G.ITEM_BY_ID[id].data && EL.STATUS_EL[G.ITEM_BY_ID[id].data.elem]))) return true;
    for (const id of ['h_burn', 'h_frost', 'h_shock', 'k_ash', 'k_icegrave', 'k_chain', 'h_chain', 'h_critchain', 'm_trail', 'x_frostaura', 'o_thunderjump', 'p_fire', 'p_frost', 'p_shock', 'z_storm']) if (P.has(id)) return true;
    const st = P.stats || {};
    if (st.techBurn > 0 || st.techFrost > 0 || st.techShock > 0 || st.elemChance > 0) return true;
    for (const id of P.buffs ? P.buffs.keys() : []) if (/_(oh_burn|oh_frost|oh_shock|x_fire|x_frost)$/.test(id)) return true;
    return false;
  };
  EL.isElementBoon = (b) => !!b && (b.cat === 'attr' || /^s_elMastery_/.test(b.id));
  EL.AURA_T = 8;
  for (const c of EL.CODEX) { const k = c.id.slice(3); if (c.id.startsWith('el_') && EL.BY[k]) Object.assign(c, { name: EL.BY[k].name + '属性', icon: EL.BY[k].icon, rarity: 'common', desc: EL.BY[k].desc }); if (c.id.startsWith('rx_')) Object.assign(c, { name: EL.RX[k].name, desc: EL.RX[k].desc }); }
  EL.SELF_T = 6;
  // how often one source can leave its element on the same foe (s): guns per weapon, melee, boon procs. Skills, ultimates, grenades, the pile driver: every time.
  EL.ICD = { bullet: 2.5, melee: 1.0, buff: 2.5 };

  // what each skill / ultimate / grenade carries
  EL.SK = {
    fireball: 'fire', firestorm: 'fire', ult_inferno: 'fire', ult_phoenix: 'fire',
    waterbolt: 'water', whirlpool: 'water', ult_tsunami: 'water',
    icespear: 'ice', frostnova: 'ice', ult_cryo: 'ice',
    chain: 'volt', chain2: 'volt', leap: 'volt', dash2: 'volt', ult_judgement: 'volt',
    shockwave: 'wind',
    spikes: 'earth', quake: 'earth', groundpound: 'earth', meteor: 'earth', ult_meteor: 'earth',
  };
  EL.skEl = (id) => (id && EL.SK[id]) || null;
  // the element a gun / melee weapon carries: what it was born with, then one of its own (made from parts), then its 属性コア
  EL.isChaos = (w) => !!(w && w.atts && w.atts.core === 'c_chaos');
  EL.chaosFor = function (e) {
    const a = EL.auraOf(e);
    if (a === 'fire') return 'water'; // 沸騰 (×2.0)
    if (a === 'ice') return 'fire'; // 熱融 (×2.0)
    if (a === 'water') return 'volt'; // 漏電
    if (a === 'volt') return 'fire'; // 爆轟
    EL._chaosI = ((EL._chaosI || 0) + 1) % 4; return ['fire', 'water', 'ice', 'volt'][EL._chaosI]; // nothing on it yet: lay one down
  };
  EL.wEl = function (w) {
    if (!w || !w.def) return null;
    if (w.def.el) return w.def.el;
    if (w.el) return w.el; // (made from parts with an element of its own)
    const a = w.atts && w.atts.core && G.ATT_BY_ID[w.atts.core];
    return (a && a.mods && a.mods.el) || null;
  };
  // grenades
  EL.GREN = { g_fire: 'fire', g_cryo: 'ice', g_shock: 'volt', g_nail: 'earth', g_water: 'water' };

  // ---------------------------------------------------------------- the element mark on icons
  // which element does this thing leave? (a gun / melee weapon / its definition, an attachment, a skill, a grenade). Burning, chilling
  // and shocking count, since they leave fire / ice / volt too. null = none.
  const TRAIT_EL = { incendiary: 'fire', cryo: 'ice', shock: 'volt' };
  EL.tagOf = function (o) {
    if (!o) return null;
    if (o.def && o.def !== o) { // a weapon in hand / in a bag: its own element, its 属性コア, its rounds, then what the kind is born with
      const e = EL.wEl(o); if (e) return e;
      if (o.def.kind === 'weapon' && G.weapons && G.weapons.stats) { const s = G.weapons.stats(o); if (s && EL.STATUS_EL[s.elem]) return EL.STATUS_EL[s.elem]; }
      return EL.tagOf(o.def);
    }
    switch (o.kind) {
      case 'weapon': return o.el || EL.STATUS_EL[o.element] || TRAIT_EL[o.trait] || null;
      case 'melee': return o.el || EL.STATUS_EL[o.elem] || null;
      case 'attachment': return (o.mods && (o.mods.el || EL.STATUS_EL[o.mods.elem])) || null;
      case 'skill': return EL.skEl(o.id);
      case 'item': return EL.GREN[o.id] || null;
    }
    return null;
  };
  EL.itemTag = function (it) {
    if (!it) return null;
    const d = G.Inv && G.Inv.def(it); if (!d) return null;
    const g = it.gun || {};
    if (d.el) return d.el;
    if (g.el) return g.el;
    for (const id of Object.values(g.atts || {})) { const a = G.ATT_BY_ID[id]; if (a && a.slot === 'core' && a.mods.el) return a.mods.el; }
    for (const id of Object.values(g.atts || {})) { const t = EL.tagOf(G.ATT_BY_ID[id]); if (t) return t; }
    return EL.tagOf(d);
  };
  // a small round mark in the corner of an icon (the box it sits in must be position: relative / absolute)
  EL.badge = function (o, cls) {
    const L = EL.BY[typeof o === 'string' ? o : EL.tagOf(o)]; if (!L) return '';
    return `<i class="elb${cls ? ' ' + cls : ''}" style="--ec:${L.col}" title="${L.name}属性">${L.icon}</i>`;
  };
  // the same as words, for a tooltip / card head: "🔥 炎属性"
  EL.chip = function (o) {
    const L = EL.BY[typeof o === 'string' ? o : EL.tagOf(o)]; if (!L) return '';
    return `<span class="elchip" style="--ec:${L.col}">${L.icon} ${L.name}属性</span>`;
  };

  // ---------------------------------------------------------------- numbers
  EL.mastery = () => Math.max(0, (P && P.stats.elMastery) || 0);
  EL.effK = (M) => 2.5 * M / (M + 400);
  EL.mulK = (M) => 0.75 * M / (M + 400);
  const sx = (k) => (P && P.stats[k]) || 0;
  // effect reactions: base x (1 + mastery curve) x (1 + reaction boons): two separate factors
  // 反応強化 (術士): a third factor of its own
  const cls = () => 1 + (G.Classes ? G.Classes.rxMul() : 0);
  EL.effMul = (id) => (1 + EL.effK(EL.mastery())) * (1 + sx('reactDmg') + sx('rx_' + id)) * cls();
  // amplifying reactions: the base factor plus mastery plus boons, added up
  EL.ampMul = (id, base) => base + EL.mulK(EL.mastery()) + sx('reactMul') + sx('rx_' + id) + (G.Classes ? G.Classes.ampAdd() : 0);
  EL.scale = (v) => (C ? C.scale(v) : v);
  // a foe's resistance to an element (0.7 = 70% less, negative = weak to it)
  EL.resOf = (e, el) => { const r = e && e.elRes && e.elRes[el]; return r ? Math.max(-1, Math.min(0.9, r)) : 0; };
  EL.selfRes = (el) => Math.max(0, Math.min(0.7, sx('elRes_' + el)));

  // ---------------------------------------------------------------- state on a foe
  // e.au = { el, t (game time it ends) } / e.auFix = element it was born with
  EL.auraOf = function (e) {
    if (!e) return null;
    if (e.auFix) return e.auFix;
    if (e.au && e.au.t > G.game.time) return e.au.el;
    if (e.au) e.au = null;
    return null;
  };
  EL.auraLeft = (e) => (e && e.au && !e.auFix ? Math.max(0, e.au.t - G.game.time) : 0);
  EL.setAura = function (e, el, dur) {
    if (!e || e.auFix) return;
    const now = G.game.time;
    if (!el) { e.au = null; EL.netAura(e); return; }
    e.au = { el, t: now + (dur || EL.AURA_T) };
    EL.netAura(e);
  };
  EL.netAura = function (e) { if (EL.onNetAura) EL.onNetAura(e); }; // (co-op hooks in from js/coop)

  // the reaction an element b sets off on an element a already there (null = none)
  function pair(a, b) {
    if (!a || !b || a === b) return null;
    if (b === 'wind') return EL.BY[a].aura ? { id: 'swirl', with: a } : null;
    if (b === 'earth') return EL.BY[a].aura ? { id: 'crystal', with: a } : null;
    const k = [a, b].sort().join('+');
    switch (k) {
      case 'fire+water': return { id: 'boil', amp: a === 'fire' ? 2.0 : 1.5 };
      case 'fire+ice': return { id: 'thaw', amp: a === 'fire' ? 1.5 : 2.0 };
      case 'ice+water': return { id: 'freeze' };
      case 'fire+volt': return { id: 'blast' };
      case 'volt+water': return { id: 'leak' };
      case 'ice+volt': return { id: 'brittle' };
    }
    return null;
  }
  EL.pair = pair;

  const ownHit = (info, src) => !info.enemy && !info.ally && src !== 'dot' && src !== 'ally';
  // the element a player's hit carries (null = none)
  EL.hitEl = function (info, src) {
    if (info.el !== undefined) return info.el || null;
    if (!ownHit(info, src)) return null;
    if (src === 'skill' || src === 'explosion') { const s = EL.skEl(info.sk || C.curSk); if (s) return s; }
    if (info.pile) return P.has('p_fire') ? 'fire' : P.has('p_shock') ? 'volt' : P.has('p_frost') ? 'ice' : null;
    return null;
  };

  // Called by C.damageEnemy before the hit lands. Returns { el, mul, rx } (or null for a hit without an element).
  EL.onEnemyHit = function (e, info, src) {
    if (!e || !e.alive) return null;
    const out = { el: null, mul: 1, rx: null, rxWith: null };
    // shatter: a frozen foe struck by earth, a heavy melee blow or the pile driver (with or without an element)
    if (e.st && e.st.frozen > 0 && e._elFrozen && ownHit(info, src) && src !== 'react' && (info.heavy || info.pile || EL.hitEl(info, src) === 'earth')) {
      out.rx = 'shatter';
    }
    // 混沌の属性コア: the hit takes whichever element reacts with what this foe carries
    if (ownHit(info, src) && (src === 'bullet' || src === 'melee')) { const w = info.weapon || (src === 'melee' ? P && P.melee : null); if (EL.isChaos(w)) info.el = EL.chaosFor(e); }
    const el = EL.hitEl(info, src);
    if (!el) return out.rx ? out : null;
    if (e.mut && e.mut.nullify) return out.rx ? out : null;
    const now = G.game.time;
    const icd = info.icd !== undefined ? info.icd : EL.ICD[src] || 0;
    if (icd > 0) {
      const key = info.icdKey || (info.weapon ? 'w:' + info.weapon.def.id : src);
      const m = e._elIcd || (e._elIcd = {});
      const k = icd * (src === 'bullet' || src === 'buff' ? Math.max(0.2, 1 - sx('elIcd')) : 1);
      if ((m[key] || -9) > now) return out.rx ? out : null;
      m[key] = now + k;
    }
    out.el = el;
    out.mul = 1 - EL.resOf(e, el);
    // water puts out a fire
    if (el === 'water' && e.st && e.st.burn > 0) { e.st.burn = 0; e.st.burnLv = 0; }
    if (out.rx === 'shatter') return out;
    const cur = EL.auraOf(e);
    const skId = (src === 'skill' || src === 'explosion') && (info.sk || C.curSk);
    const dur = EL.AURA_T + sx('elAuraT') + (info.auraT || 0) + (skId && G.abilities.skm(skId).x_elT ? 4 : 0);
    if (!cur) { if (EL.BY[el].aura) EL.setAura(e, el, dur); return out; }
    if (cur === el) { if (!e.auFix) EL.setAura(e, el, dur); return out; }
    const r = pair(cur, el);
    if (!r) return out;
    if (e.auFix) { if ((e._rxCd || 0) > now) return out; e._rxCd = now + 1; } else { EL.setAura(e, null); EL.stopStatus(e, cur); }
    EL.stopStatus(e, el);
    out.rx = r.id; out.rxWith = r.with || null;
    if (r.amp) out.mul *= EL.ampMul(r.id, r.amp);
    return out;
  };

  // A foe gets an element without a blow of its own (frost zones, a dying elemental core). Returns the reaction it set off, if any.
  EL.give = function (e, el, opts) {
    if (!e || !e.alive || !el || (e.mut && e.mut.nullify)) return null;
    opts = opts || {};
    const cur = EL.auraOf(e);
    const dur = EL.AURA_T + sx('elAuraT') + (opts.auraT || 0);
    if (!cur) { if (EL.BY[el].aura) EL.setAura(e, el, dur); return null; }
    if (cur === el) { if (!e.auFix) EL.setAura(e, el, dur); return null; }
    const r = pair(cur, el);
    if (!r) return null;
    const now = G.game.time;
    if (e.auFix) { if ((e._rxCd || 0) > now) return null; e._rxCd = now + 1; } else { EL.setAura(e, null); EL.stopStatus(e, cur); }
    EL.stopStatus(e, el);
    EL.after(e, r.id, r.with, opts);
    return r.id;
  };

  // ---------------------------------------------------------------- the surroundings (fields.js: shallows, lava, ice sheets; weather.js: rain, snow, embers)
  // They lay their element on whoever is in them and keep it up, but never set off a reaction on their own: a foe or a player that
  // already carries another element keeps it (water is the one exception: it washes a fire off you).
  // `wait`: a target that has just lost its element (spent in a reaction) is left bare that long before it is laid on again.
  EL.envEnemy = function (e, el, wait) {
    if (!e || !e.alive || e.auFix || !el || !EL.BY[el] || !EL.BY[el].aura || (e.mut && e.mut.nullify)) return false;
    const cur = EL.auraOf(e), now = G.game.time;
    if (cur && cur !== el) { e._envBare = 0; return false; }
    if (!cur && wait) { if (!e._envBare) { e._envBare = now; return false; } if (now - e._envBare < wait) return false; }
    e._envBare = 0;
    if (!cur || EL.auraLeft(e) < EL.AURA_T - 1) EL.setAura(e, el, EL.AURA_T); // (kept topped up: re-sent to co-op screens once a second at most)
    return true;
  };
  EL.envPlayer = function (el, wait) {
    if (!P || P.dead || !el || !EL.BY[el] || !EL.BY[el].aura) return false;
    const cur = EL.playerAura(), now = G.game.time, dur = EL.SELF_T * Math.max(0.1, 1 - sx('elSelfT'));
    if (cur && cur !== el && !(el === 'water' && cur === 'fire')) { P._envBare = 0; return false; }
    if (!cur && wait) { if (!P._envBare) { P._envBare = now; return false; } if (now - P._envBare < wait) return false; }
    P._envBare = 0;
    P.au = { el, t: now + dur };
    return true;
  };
  // a status (burn / frost / shock) leaves its element: every time, with no cool-down; a reaction can follow
  EL._inRx = 0;
  EL.fromStatus = function (e, el) { if (EL._inRx > 0 || !e || !e.alive) return; EL.give(e, el, { status: true }); };
  // a reaction spends the elements in it, and the statuses that go with them stop (fire: burn, ice: frost, volt: shock)
  EL.stopStatus = function (e, el) {
    const s = e && e.st; if (!s) return;
    if (EL.onNetStop) EL.onNetStop(e, el); // (co-op: a guest's reaction stops the status where it ticks, on the host)
    if (el === 'fire') { s.burn = 0; s.burnLv = 0; }
    else if (el === 'ice') { s.frost = 0; s.frostStacks = 0; }
    else if (el === 'volt') { s.shock = 0; s.shockLv = 0; }
  };
  // ---------------------------------------------------------------- what a reaction does (after the blow)
  EL._depth = 0;
  const rxHit = (o, amt, id, extra) => C.damageEnemy(o, amt, Object.assign({ src: 'react', rx: id, proc: true, noBuffs: true, noMarker: true, el: null }, extra || {}));
  EL.label = function (e, id) {
    if (!G.fx || !G.fx.dmgNum) return;
    // (the same reaction on the same foe is named once a second at most: a foe standing in water inside a fire would otherwise flicker with it)
    const lt = e._rxLab || (e._rxLab = {}), now = G.game.time; if ((lt[id] || -9) > now) return; lt[id] = now + 1;
    const p = e.centerPos(); p.y += (e.height || 1.6) * 0.45 + 0.35;
    G.fx.dmgNum(p, EL.RX[id].name, 'rxl rx-' + id);
  };
  // which elements each reaction is made of (元素の支配者: the skills of those elements cool down 1 s)
  const RX_ELS = { boil: ['fire', 'water'], thaw: ['fire', 'ice'], freeze: ['water', 'ice'], blast: ['fire', 'volt'], leak: ['volt', 'water'], brittle: ['ice', 'volt'], shatter: ['earth', 'ice'] };
  EL.after = function (e, id, withEl, opts) {
    if (!e || !id) return;
    if (P && P.has && P.has('x_myth') && !(opts && opts.echo)) { const els = (RX_ELS[id] || []).concat(withEl ? [withEl] : [], id === 'swirl' ? ['wind'] : id === 'crystal' ? ['earth'] : []); for (const sk of P.skills) if (sk && !(sk.def && sk.def.ult) && sk.cd > 0 && els.includes(EL.skEl(sk.id))) sk.cd = Math.max(0, sk.cd - 1); }
    opts = opts || {};
    if (EL._depth > 3) return;
    EL._depth++; EL._inRx++;
    try {
      EL.label(e, id);
      if (G.save && G.save.mark) G.save.mark('items', 'rx_' + id);
      if (G.game.run) { const r = G.game.run.rx || (G.game.run.rx = {}); r[id] = (r[id] || 0) + 1; }
      const pos = e.centerPos();
      switch (id) {
        case 'boil': case 'thaw':
          G.fx.sparks(pos, null, 14, id === 'boil' ? 0xffc080 : 0xffd0e0, 6);
          if (id === 'boil') G.fx.smoke && G.fx.smoke(pos, 6, 1.2, 0xe8e8f0, 0.5, 1.0);
          break;
        case 'freeze': {
          const s = e.st, now = G.game.time;
          const k = (1 + EL.effK(EL.mastery()) * 0.5) * cls();
          if (e.boss) { s.elSlow = Math.max(s.elSlow || 0, (3 + sx('rxFreezeT')) * k); }
          else if (now >= (e.freezeImmuneUntil || 0)) {
            const t = ((e.elite ? 1.5 : 3) + sx('rxFreezeT')) * k;
            s.frozen = Math.max(s.frozen || 0, t); e._elFrozen = true; s.frostStacks = 0;
            e.freezeImmuneUntil = now + t + 4;
          } else s.elSlow = Math.max(s.elSlow || 0, 2);
          G.sfx.ice(e.pos); G.fx.sparks(pos, null, 16, 0xd0f0ff, 5);
          break;
        }
        case 'shatter': {
          e.st.frozen = 0; e._elFrozen = false;
          G.fx.sparks(pos, null, 26, 0xe8f8ff, 9); G.sfx.ice(e.pos);
          rxHit(e, EL.scale(120) * EL.effMul('shatter'), 'shatter');
          break;
        }
        case 'blast': {
          const r = 4 * (1 + sx('rxBlastR'));
          G.fx.explosion(pos, r, 0xff6aa8, { decal: false }); G.sfx.explosion(pos, 0.7);
          const dmg = EL.scale(90) * EL.effMul('blast');
          for (const o of G.enemies.inRadius(e.pos, r)) {
            const d = o.pos.clone().sub(e.pos).setY(0); if (d.lengthSq() < 0.01) d.set(1, 0, 0);
            rxHit(o, dmg, 'blast', { shieldMul: 2, knock: 8, dir: d.normalize() });
          }
          break;
        }
        case 'leak': {
          const s = e.st;
          s.leak = 4; s.leakK = EL.scale(14) * EL.effMul('leak') * (1 + sx('rxLeak')); s.leakT = 0;
          if (e.alive) C.status(e, 'shock', 1);
          G.fx.sparks(pos, null, 12, 0xb0c8ff, 6);
          break;
        }
        case 'brittle': {
          const s = e.st;
          s.brittle = 8; s.brittleK = (e.boss ? 0.15 : 0.25) * (1 + EL.effK(EL.mastery()) * 0.5) * cls() + sx('rxBrittle');
          G.fx.sparks(pos, null, 12, 0xd8c8ff, 5);
          break;
        }
        case 'swirl': {
          const r = 6 + sx('rxSwirlR');
          if (G.fx.ring) G.fx.ring(e.pos.clone().setY(e.pos.y + 0.15), r, EL.BY.wind.hex, 0.45);
          const dmg = EL.scale(25) * EL.effMul('swirl');
          for (const o of G.enemies.inRadius(e.pos, r)) {
            if (o === e) continue;
            rxHit(o, dmg, 'swirl', { el: withEl, auraT: sx('rxSwirlT') });
          }
          break;
        }
        case 'crystal': EL.dropCrystal(e.pos.clone(), withEl); break;
      }
      EL.netAura(e); if (EL.onNetStatus) EL.onNetStatus(e);
      // 反応充填: the skill that set it off gets 1 s back (once a second)
      { const sk = opts.sk || ((opts.src === 'skill' || opts.src === 'explosion') && C.curSk); const now = G.game.time; if (sk && !opts.echo && G.abilities.skm(sk).x_elCd && (EL._cdT || 0) <= now) { EL._cdT = now + 1; const s = P.skills.find((x) => x && x.id === sk); if (s) s.cd = Math.max(0, (s.cd || 0) - 1); } }
      // 共鳴: the nearest other foe suffers the same reaction (never from an echo; the damage-only reactions just echo their burst)
      if (!opts.echo && P.has('rx_echo') && id !== 'crystal') {
        let best = null, bd = 12;
        for (const o of G.enemies.inRadius(e.pos, 12)) { if (o === e || !o.alive) continue; const d = o.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = o; } }
        if (best) {
          if (G.fx.beam) G.fx.beam(pos, best.centerPos(), EL.RX[id] ? parseInt(EL.RX[id].col.slice(1), 16) : 0xffffff, 0.2);
          if (id === 'boil' || id === 'thaw') rxHit(best, EL.scale(40) * EL.effMul(id), id);
          else EL.after(best, id, withEl, { echo: true });
        }
      }
    } finally { EL._depth--; EL._inRx--; }
  };

  // ---------------------------------------------------------------- ticking (called from C.updateStatus)
  EL.tick = function (e, dt) {
    const s = e.st;
    if (s.elSlow > 0) s.elSlow -= dt;
    if (s.brittle > 0) s.brittle -= dt;
    if (s.frozen <= 0 && e._elFrozen) e._elFrozen = false;
    if (s.leak > 0) {
      s.leak -= dt; s.leakT = (s.leakT || 0) - dt;
      if (s.leakT <= 0) {
        s.leakT = 0.5;
        rxHit(e, s.leakK || EL.scale(14), 'leak', { silent: false });
        G.fx.sparks(e.centerPos(), null, 4, 0xb0c8ff, 4);
        // it runs on into foes that are wet
        const r = 6 + (P.has('rx_leakR') ? 3 : 0);
        for (const o of G.enemies.inRadius(e.pos, r)) {
          if (o === e || !o.alive || o.st.leak > 0 || EL.auraOf(o) !== 'water') continue;
          if (!o.auFix) EL.setAura(o, null);
          o.st.leak = 4; o.st.leakK = s.leakK; o.st.leakT = 0.25; EL._inRx++; try { C.status(o, 'shock', 1); } finally { EL._inRx--; }
          if (G.fx.lightning) G.fx.lightning(e.centerPos(), o.centerPos());
          EL.label(o, 'leak');
        }
      }
    }
  };

  // ---------------------------------------------------------------- guardians
  // [element it wields, element it is weak to]: own element 25% resisted, the weak one -25%. None of them is born with an element.
  EL.BOSS = {
    houndlord: ['fire', 'water'], cerberus: ['fire', 'water'], cinderpriest: ['fire', 'water'], ashdrake: ['fire', 'ice'], foxfire: ['fire', 'water'], sovereign: ['fire', 'water'],
    boneking: ['ice', 'fire'], lich: ['ice', 'fire'], hollowknight: ['ice', 'fire'],
    warlock: ['volt', 'earth'], arbiter: ['volt', 'earth'], stormimp: ['volt', 'earth'], karakuri: ['volt', 'water'], archon: ['volt', 'earth'],
    colossus: ['earth', 'volt'], ossuary: ['earth', 'fire'], behemoth: ['earth', 'volt'], warden: ['earth', 'volt'], minotaur: ['earth', 'ice'], executioner: ['earth', 'fire'],
    wyrm: ['water', 'volt'], weaver: ['water', 'fire'],
    drake: ['wind', 'ice'], hunter: ['wind', 'earth'], oboro: ['wind', 'volt'],
    broodmother: [null, 'fire'],
  };
  EL.KING = [['fire', 'water'], ['ice', 'fire'], ['volt', 'earth']]; // 深淵の王: by phase
  const resFor = (el, weak) => { const r = {}; if (el) r[el] = 0.25; if (weak) r[weak] = -0.25; return r; };
  EL.bossInit = function (b, id) {
    const parts = b.parts || [b];
    let spec = EL.BOSS[id] || null;
    if (id === 'twins') { parts.forEach((p, i) => { const el = i % 2 ? 'ice' : 'fire'; p.elAtk = el; p.elRes = resFor(el, i % 2 ? 'fire' : 'ice'); }); b.elAtk = 'fire'; return; }
    if (id === 'abyssking') spec = EL.KING[0];
    if (!spec) return;
    b.elAtk = spec[0];
    for (const p of parts) { p.elAtk = spec[0]; p.elRes = resFor(spec[0], spec[1]); }
  };
  EL.bossTick = function () {
    const b = G.bosses && G.bosses.active; if (!b || b.dead || b.def.id !== 'abyssking') return;
    const s = EL.KING[Math.max(0, Math.min(2, (b.phase || 1) - 1))];
    if (b.elAtk === s[0]) return;
    b.elAtk = s[0];
    for (const p of b.parts || []) { p.elAtk = s[0]; p.elRes = resFor(s[0], s[1]); }
    G.ui.toastSmall(`${EL.BY[s[0]].icon} 深淵の王が${EL.BY[s[0]].name}属性を纏った`);
  };

  // ---------------------------------------------------------------- crystals (晶壁)
  EL.crystals = [];
  EL.dropCrystal = function (pos, el) {
    if (!G.scene) return;
    const col = EL.BY[el] ? EL.BY[el].hex : 0xe0a640;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    const floor = G.world && G.world.floorBelow ? G.world.floorBelow(pos.x, pos.y + 1, pos.z) : pos.y;
    m.position.set(pos.x, floor + 0.7, pos.z);
    G.scene.add(m);
    EL.crystals.push({ m, el, t: 10, base: floor + 0.7 });
  };
  EL.pickCrystal = function (c) {
    const sh = 40 * (1 + sx('rxCrystal'));
    P.os = Math.min(Math.max(P.os || 0, 0) + sh, Math.max(80, sh * 2));
    C.temp('el_crystal_' + c.el, 10, { ['elRes_' + c.el]: 0.4 }, EL.BY[c.el].icon, `晶壁（${EL.BY[c.el].name}耐性）`);
    G.sfx.ui && G.sfx.ui('ok');
    G.ui.toastSmall(`💠 晶壁 — シールド+${Math.round(sh)}・${EL.BY[c.el].name}耐性+40%`);
  };
  EL.update = function (dt) {
    if (!P) return;
    for (let i = EL.crystals.length - 1; i >= 0; i--) {
      const c = EL.crystals[i];
      c.t -= dt;
      c.m.rotation.y += dt * 2.5;
      const pull = P.has('rx_crystalPull');
      const d = c.m.position.distanceTo(P.chestPos());
      if (pull && d < 9) c.m.position.lerp(P.chestPos(), Math.min(1, dt * 4));
      else c.m.position.y = c.base + Math.sin(c.t * 3) * 0.12;
      if (c.t < 2) c.m.material.opacity = 0.9 * c.t / 2;
      if (!P.dead && d < 1.7) { EL.pickCrystal(c); c.t = 0; }
      if (c.t <= 0) { G.scene.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); EL.crystals.splice(i, 1); }
    }
    EL.tickPlayer(dt);
    EL.bossTick();
  };
  EL.clear = function () { for (const c of EL.crystals) { if (G.scene) G.scene.remove(c.m); } EL.crystals.length = 0; if (P) { P.au = null; P.elFrozen = 0; P.elLeak = 0; P.elBrittle = 0; } };

  // ---------------------------------------------------------------- the player's side
  EL.playerAura = () => (P && P.au && P.au.t > G.game.time ? P.au.el : null);
  // Called by C.damagePlayer for a blow that carries an element. Returns the factor on the blow.
  EL.onPlayerHit = function (el) {
    if (!P || !el || !EL.BY[el]) return 1;
    let mul = 1 - EL.selfRes(el);
    const cur = EL.playerAura();
    const dur = EL.SELF_T * Math.max(0.1, 1 - sx('elSelfT'));
    if (!cur) { if (EL.BY[el].aura) P.au = { el, t: G.game.time + dur }; return mul; }
    if (cur === el) { P.au.t = G.game.time + dur; return mul; }
    const r = pair(cur, el);
    if (!r) return mul;
    P.au = null;
    const soft = Math.max(0.1, 1 - sx('elSelfRes'));
    const res = Math.max(EL.selfRes(cur), EL.selfRes(el));
    const sc = 1 + 0.1 * Math.max(0, (G.game.area || 1) - 1);
    const rx = EL.RX[r.id];
    G.ui.toastSmall(`${EL.BY[cur].icon}${EL.BY[el].icon} ${rx.name}`);
    switch (r.id) {
      case 'boil': case 'thaw': mul *= 1 + ((r.amp >= 2 ? 1.5 : 1.3) - 1) * soft; break;
      case 'freeze': P.elFrozen = 1; G.sfx.ice(P.pos); break;
      case 'blast': setTimeout(() => { if (P && !P.dead) C.damagePlayer(20 * sc * (1 - res) * soft, { src: 'react', fixed: true }); }, 0); P.addShake(0.4); break;
      case 'leak': P.elLeak = 3; P.elLeakK = 4 * sc * (1 - res) * soft; P.elLeakT = 0.5; break;
      case 'brittle': P.elBrittle = 5; break;
    }
    return mul;
  };
  EL.tickPlayer = function (dt) {
    if (!P) return;
    if (P.elFrozen > 0) P.elFrozen -= dt;
    if (P.elBrittle > 0) P.elBrittle -= dt;
    if (P.elLeak > 0) {
      P.elLeak -= dt; P.elLeakT -= dt;
      if (P.elLeakT <= 0) { P.elLeakT = 0.5; C.damagePlayer(P.elLeakK || 4, { src: 'react', fixed: true }); }
    }
    if (P.au && P.au.t <= G.game.time) P.au = null;
  };
})();
