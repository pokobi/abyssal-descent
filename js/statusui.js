'use strict';
// The Tab screen, laid out like an FPS loadout: a header strip, then LOADOUT / ABILITIES / STATS columns of framed panels,
// and the full perk list underneath. Text is large and each card shows only what matters at a glance (the weapon cards carry a
// live 3D model); every number that buffs, attachments or levels have changed is bold and coloured (green = better, red = worse)
// with the change in brackets, and skill descriptions get their numbers recomputed and highlighted the same way.
(function () {
  const UI = G.ui, U = G.U;
  const SU = (G.StatusUI = {});
  let P;
  const R = (r) => UI.R(r);
  const esc = U.esc;
  const num = (v, dec) => { const d = dec ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2); return (+v.toFixed(d)).toString(); };
  // a value compared with its base: lowerBetter flips the colours (cooldowns, reload); abs = the change is shown in points
  function dv(cur, base, o) {
    o = o || {};
    const unit = o.unit || '', txt = (o.fmt ? o.fmt(cur) : num(cur, o.dec)) + unit;
    if (!base || Math.abs(cur - base) < Math.max(1e-6, Math.abs(base) * 0.005)) return `<b class="sv">${txt}</b>`;
    const pct = o.abs ? cur - base : (cur / base - 1) * 100, better = o.lowerBetter ? pct < 0 : pct > 0;
    // split: o.mid = the value with only the weapon's upgrade level (+n) applied.
    //   amber = the +n upgrade, as a fixed amount (e.g. +9.8);  cyan = everything else (attachments, buffs, 与ダメ, enchantments), as a % of the upgraded value.
    if (o.mid != null) {
      const eps = Math.max(1e-6, Math.abs(base) * 0.005);
      const dl = o.mid - base, hasL = Math.abs(dl) >= eps, hasB = Math.abs(cur - o.mid) >= eps;
      const fx = (x) => `${x > 0 ? '+' : '-'}${o.fmt ? o.fmt(Math.abs(x)) : num(Math.abs(x), o.dec)}${unit}`;
      const bp = o.abs ? cur - o.mid : (o.mid ? (cur / o.mid - 1) * 100 : 0), bt = `${bp > 0 ? '+' : ''}${Math.round(bp)}${o.abs ? 'pt' : '%'}`;
      const parts = (hasL ? [`<i class="sdw">${fx(dl)}</i>`] : []).concat(hasB ? [`<i class="sdb">${bt}</i>`] : []);
      if (parts.length) return `<b class="sv ${better ? 'up' : 'dn'}">${txt}</b><span class="sd sp2">(${parts.join(' ')})</span>`;
      return `<b class="sv">${txt}</b>`;
    }
    return `<b class="sv ${better ? 'up' : 'dn'}">${txt}</b><span class="sd ${better ? 'up' : 'dn'}">(${pct > 0 ? '+' : ''}${Math.round(pct)}${o.abs ? 'pt' : '%'})</span>`;
  }
  const panel = (en, jp, body, cls) => `<section class="sp ${cls || ''}"><header><span class="en">${en}</span><span class="jp">${jp}</span></header><div class="sp-b">${body}</div></section>`;
  const tile = (label, val) => `<div class="t"><label>${label}</label><div class="v">${val}</div></div>`;
  let pend = [];
  let noPv = false; // tooltips render the same cards without the 3D model
  const preview = (kind, def, atts) => { if (noPv) return ''; const id = pend.length; pend.push({ id, kind, def, atts }); return `<canvas class="pv" data-pv="${id}" width="448" height="256"></canvas>`; };

  // ---------------- weapons ----------------
  // the weapon's stats with only its upgrade level (+n): no attachments, no player bonuses; used to tell the +n part from everything else
  function bareStats(w) {
    const pl = G.player, real = pl.stats, cache = w._sc, dyn = pl.dynFireRate, atts = w.atts;
    try { pl.stats = Object.assign({}, G.PLAYER_BASE); pl.dynFireRate = 0; w.atts = {}; w._sc = null; return Object.assign({}, G.weapons.stats(w)); } finally { pl.stats = real; pl.dynFireRate = dyn; w.atts = atts; w._sc = cache; }
  }
  const legend = '<div class="wc-legend"><span class="sdw">■ 武器の強化 +n（固定値）</span><span class="sdb">■ アタッチメント・加護・与ダメなど（%）</span></div>';
  function gunCard(w) {
    const d = w.def, s = G.weapons.stats(w), st = P.stats, cur = w === P.weapon && !P.meleeMode;
    const trait = d.trait ? G.WEAPON_TRAITS[d.trait] : null;
    const crit = st.critChance + (s.critChance || 0), B = G.PLAYER_BASE;
    const dmgMul = G.weapons.dmgMul(); // 与ダメ (boons, enchantments ...) counts in the shown damage and DPS
    const s0 = bareStats(w); // the weapon with its +n level only
    const tiles = [
      tile('ダメージ', dv(s.dmg * dmgMul, d.dmg, { mid: s0.dmg }) + (s.pellets > 1 ? `<span class="sx">×${s.pellets}</span>` : '')),
      tile('連射', dv(s.rpm, d.rpm, { unit: '/分', dec: 0, mid: s0.rpm })),
      tile('装弾数', dv(s.mag, d.mag, { dec: 0, mid: s0.mag })),
      tile('リロード', dv(s.reload, d.reload, { unit: '秒', lowerBetter: true, mid: s0.reload })),
      tile('射程', dv(s.range, d.range, { unit: 'm', dec: 0, mid: s0.range })),
      tile('会心率', dv(crit * 100, B.critChance * 100, { unit: '%', dec: 0, abs: true, mid: (B.critChance + (s0.critChance || 0)) * 100 })),
      tile('会心ダメージ', dv((st.critMul - 1) * 100, (B.critMul - 1) * 100, { unit: '%', dec: 0, abs: true, mid: (B.critMul - 1) * 100 })),
      tile('ヘッドショット', dv(s.headMul, d.headMul, { unit: '倍', mid: s0.headMul })),
    ].join('');
    const attDesc = (() => { const on = Object.keys(G.ATT_SLOTS).map((sl) => w.atts[sl] && G.ATT_BY_ID[w.atts[sl]]).filter(Boolean); return on.length ? `<div class="wc-attd">${on.map((a) => `<div><span>${a.icon} ${esc(a.name)}</span>${esc(a.desc || '')}</div>`).join('')}</div>` : ''; })();
    const atts = Object.keys(G.ATT_SLOTS).map((sl) => { const a = w.atts[sl] && G.ATT_BY_ID[w.atts[sl]]; return a ? `<span class="att on" ${UI.tipAttr(a)}>${a.icon}<em>${esc(a.name)}</em></span>` : sl === 'core' && G.ownEl(w) ? `<span class="att lock" title="自分の属性を持つ武器なので、属性コアは付けられない">🚫</span>` : `<span class="att" title="${G.ATT_SLOTS[sl].name}">${G.ATT_SLOTS[sl].icon}</span>`; }).join('');
    return `<div class="wc ${cur ? 'cur' : ''}" style="--rc:${R(d.rarity)}">
      <div class="wc-top">
        <div class="wc-pv">${preview('gun', d, w.atts)}<span class="key">${G.weapons.keyLabel(w).replace(/[\[\]]/g, '') || '·'}</span></div>
        <div class="wc-info">
          <div class="nm">${esc(d.name)}${w.lv ? `<b class="lv">+${w.lv}</b>` : ''}</div>
          <div class="cat">${esc(d.cat || '')}・${G.RARITY[d.rarity].name}</div>
          <div class="fg">${G.ui.forgeBar(w.lv, G.ui.forgeCap(w))}</div>
          <div class="dps"><b>${Math.round(G.weapons.gunDps(w))}</b><span>DPS</span></div>
          ${trait ? `<div class="tr">${trait.icon} ${esc(trait.name)}</div>` : ''}
          ${(() => { const el = G.Elem.wEl(w); return el ? `<div class="tr" style="color:${G.Elem.BY[el].col}">${G.Elem.BY[el].icon} ${G.Elem.BY[el].name}属性</div>` : ''; })()}
        </div>
      </div>
      <div class="wc-grid">${tiles}</div>${legend}
      <div class="wc-att">${atts}</div>${G.weapons.FALLOFF[d.arch] ? `<div class="wc-attd"><div><span>📉 距離減衰</span>遠くの敵ほどダメージが下がる</div></div>` : `<div class="wc-attd"><div><span>🎯 減衰なし</span>距離によってダメージが下がらない</div></div>`}${attDesc}</div>`;
  }
  function meleeCard() {
    const m = P.melee, d = m.def, s = G.weapons.meleeStats(m), st = P.stats, B = G.PLAYER_BASE;
    const dmgMul = G.weapons.meleeDmgMul(); // 与ダメ + 近接ダメージ (both always apply to a melee weapon) count in the shown damage and DPS
    const crit = st.critChance + (s.critChance || 0), dps = G.weapons.meleeDps(m), dps0 = d.dmg / d.swing;
    const tiles = [
      tile('ダメージ', dv(s.dmg * dmgMul, d.dmg, { mid: d.dmg * Math.pow(1.13, m.lv || 0) })),
      tile('攻撃間隔', dv(s.swing, d.swing, { unit: '秒', lowerBetter: true, mid: d.swing })),
      tile('リーチ', dv(s.range, d.range, { unit: 'm', mid: d.range })),
      tile('重撃ダメージ', dv(s.dmg * dmgMul * s.heavy[0], d.dmg * d.heavy[0], { mid: d.dmg * Math.pow(1.13, m.lv || 0) * d.heavy[0] })),
      tile('重撃倍率', `<b class="sv">×${s.heavy[0]}</b>`),
      tile('会心率', dv(crit * 100, (d.critChance || 0) * 100 + B.critChance * 100, { unit: '%', dec: 0, abs: true, mid: ((d.critChance || 0) + B.critChance) * 100 })),
      tile('会心ダメージ', dv((st.critMul - 1) * 100, (B.critMul - 1) * 100, { unit: '%', dec: 0, abs: true, mid: (B.critMul - 1) * 100 })),
      tile('ヘッドショット', `<b class="sv">${num(d.headMul || 1)}倍</b>`),
      tile('移動', `<b class="sv">×${num(d.moveMul)}</b>`),
      ...G.weapons.guardStats(d).map(([k, v]) => tile(k, `<b class="sv">${v}</b>`)),
    ].join('');
    const fxLines = G.weapons.meleeFx ? G.weapons.meleeFx(d) : (d.traitDesc ? ['✦ ' + d.traitDesc] : []);
    return `<div class="wc ${P.meleeMode ? 'cur' : ''}" style="--rc:${R(d.rarity)}">
      <div class="wc-top">
        <div class="wc-pv">${preview('melee', d)}<span class="key">${G.weapons.keyLabel('m').replace(/[\[\]]/g, '') || '·'}</span></div>
        <div class="wc-info">
          <div class="nm">${esc(d.name)}${m.lv ? `<b class="lv">+${m.lv}</b>` : ''}</div>
          <div class="cat">${esc(d.cat)}・${G.RARITY[d.rarity].name}</div>
          ${d.id === (G.BARE_MELEE || 'fists') ? '' : `<div class="fg">${G.ui.forgeBar(m.lv, G.ui.forgeCap(m))}</div>`}
          <div class="dps"><b>${Math.round(dps)}</b><span>DPS</span>${Math.abs(dps - dps0) > dps0 * 0.005 ? `<span class="sd ${dps > dps0 ? 'up' : 'dn'}">(${dps > dps0 ? '+' : ''}${Math.round((dps / dps0 - 1) * 100)}%)</span>` : ''}</div>
          ${fxLines.map((x) => `<div class="tr">${esc(x)}</div>`).join('')}
          ${(() => { const a = m.atts && m.atts.core && G.ATT_BY_ID[m.atts.core], L = a && G.Elem.BY[a.mods.el]; return L ? `<div class="tr" style="color:${L.col}" ${UI.tipAttr(a)}>${a.icon} ${esc(a.name)}（${L.name}属性）</div>` : ''; })()}
        </div>
      </div>
      <div class="wc-grid">${tiles}</div>${legend}${d.desc ? `<div class="wc-attd"><div><span>🗡️ 特徴</span>${esc(d.desc)}</div></div>` : ''}</div>`;
  }

  // ---------------- skills ----------------
  const skLegend = '<div class="wc-legend"><span class="sdw">■ スキル強化 Lv（固定値）</span><span class="sdb">■ 加護・専用強化・能力値（%）</span></div>';
  const AREA_K = ['r', 'len', 'range', 'w'];
  const POW_K = ['dmg', 'dps', 'heal', 'hps'];
  // the class screen's preview (classes.js): the same card as here, for a level-0 skill, with the stats the class starts with
  SU.previewSkill = function (id, stats) {
    const pl = G.player; P = pl;
    const keep = [pl.stats, pl.buffs, pl.temps, pl._skm];
    try { pl.stats = stats; pl.buffs = new Map(); pl.temps = new Map(); pl._skm = null; return skillCard(G.abilities.makeSlot(id), ''); }
    finally { pl.stats = keep[0]; pl.buffs = keep[1]; pl.temps = keep[2]; pl._skm = null; }
  };
  function skillCard(sk, key) {
    const A = G.abilities, st = P.stats, d = sk.def, ult = !!d.ult;
    const p0 = d.p, p = A.scaleP(sk), pMid = A.scaleP(sk, true);
    const baseCd = ult ? d.cd : d.cd * A.SKILL_CD_MUL, cd = A.cdOf(sk), cdMid = A.cdOf(sk, true);
    const powBase = ult ? 1 : A.SKILL_POW_MUL, powMid = ult ? A.ultPower(sk, true) : A.power(sk, true);
    const pow = (ult ? A.ultPower(sk) : A.power(sk)) * (1 + st.dmg + st.skillDmg + (ult ? st.ultDmg || 0 : 0)); // 与ダメ and スキルダメージ add up, as in C.damageEnemy
    const line = [`<span><label>クールタイム</label>${dv(cd, baseCd, { unit: '秒', lowerBetter: true, mid: cdMid })}</span>`];
    // the actual numbers (what one hit / one second / one heal really amounts to with the current level and bonuses)
    const ek = A.effK(sk), ekMid = A.effK(sk, true); // heals grow with the effect factor, damage with the power factor
    for (const [k, lab] of [['dmg', 'ダメージ'], ['dps', '毎秒ダメージ']]) if (p0[k] != null && p0[k] > 0) { const f = pow; line.push(`<span><label>${lab}</label>${dv(p0[k] * f, p0[k] * (k === 'heal' || k === 'hps' ? 1 : powBase), { dec: 0, mid: p0[k] * powMid })}</span>`); }
    // what a level changes in the buff / heal skills goes into the description's own numbers (below); only the ones the text does not mention get a row
    const eff = A.effInfo(sk).map((e) => ({ e, used: false })), effDv = (z) => dv(z.e[2], z.e[1], { mid: z.e[6], unit: z.e[3] === '倍' ? '' : z.e[3], dec: z.e[4] === undefined ? 0 : z.e[4], lowerBetter: !!z.e[5] });
    for (const k of AREA_K) if (p0[k]) { line.push(`<span><label>${k === 'len' ? '長さ' : k === 'range' ? '射程' : k === 'w' ? '幅' : '範囲'}</label>${dv(p[k], p0[k], { unit: 'm', mid: pMid[k] })}</span>`); break; }
    if (p0.dur) line.push(`<span><label>効果時間</label>${dv(p.dur, p0.dur, { unit: '秒', mid: pMid.dur })}</span>`);
    if (sk.maxCharges > 1 || p0.charges) line.push(`<span><label>チャージ</label>${dv(sk.maxCharges || 1, p0.charges || 1, { dec: 0, mid: p0.charges || 1 })}</span>`);
    // the description: numbers that come from the skill's own parameters are recomputed; every number is bold
    const used = new Set();
    const desc = esc(d.desc).replace(/(\d+(?:\.\d+)?)(秒|m|体|個|本|%|倍)?/g, (all, n, u) => {
      const v = +n;
      let k = null;
      if (u === '秒') k = ['dur', 't'].find((x) => p0[x] === v && !used.has(x));
      else if (u === 'm') k = AREA_K.find((x) => p0[x] === v && !used.has(x));
      else if (!u) k = POW_K.concat(['n']).find((x) => p0[x] === v && !used.has(x));
      else if (u === '体' || u === '個' || u === '本') k = ['n'].find((x) => p0[x] === v && !used.has(x));
      if (!k) { const z = eff.find((q) => !q.used && (u === '%' || u === '倍' || !u) && ((u === '倍' || !u) ? Math.abs(q.e[1] - v) < 1e-6 && q.e[3] === '倍' : q.e[3] === '%' && Math.round(q.e[1]) === v)); if (z) { z.used = true; return effDv(z) + (u === '倍' ? '倍' : ''); } }
      if (!k) return `<b class="sv">${n}${u || ''}</b>`;
      used.add(k);
      const cur = AREA_K.includes(k) || k === 'dur' ? p[k] : (k === 'heal' || k === 'hps') ? p0[k] * ek : POW_K.includes(k) ? p0[k] * pow : p[k]; // the real number: base x level x the skill power constant x bonuses
      const mid = AREA_K.includes(k) || k === 'dur' ? pMid[k] : (k === 'heal' || k === 'hps') ? p0[k] * ekMid : POW_K.includes(k) ? p0[k] * powMid : pMid[k];
      return dv(cur, (k === 'heal' || k === 'hps') ? v : POW_K.includes(k) ? v * powBase : v, { mid, unit: u || '', dec: Number.isInteger(v) && Math.abs(cur - Math.round(cur)) < 0.05 ? 0 : 1 });
    });
    const augs = [...P.buffs].filter(([id]) => G.BUFF_BY_ID[id] && G.BUFF_BY_ID[id].skill === sk.id);
    const ready = A.ready(sk), left = sk.maxCharges ? `${sk.charges}/${sk.maxCharges}` : ready ? 'READY' : `${Math.ceil(sk.cd)}秒`;
    return `<div class="sc ${ult ? 'ult' : ''}" style="--rc:${R(d.rarity)}">
      <div class="sc-h"><span class="key">${key}</span><span class="ic">${d.icon}${G.Elem.badge(d)}</span><span class="nm">${esc(d.name)}${A.lvHTML(sk) ? `<b class="lv">${A.lvHTML(sk)}</b>` : ''}${ult ? '<em class="tag">ULT</em>' : ''}</span><span class="st ${ready ? 'ok' : ''}">${left}</span></div>
      <div class="sc-l">${line.concat(eff.filter((z) => !z.used).map((z) => `<span><label>${z.e[0]}</label>${effDv(z)}</span>`)).join('')}</div>
      <div class="sc-d">${desc}</div>${skLegend}
      ${augs.length ? `<div class="sc-a">${augs.map(([id, n]) => { const b = G.BUFF_BY_ID[id]; return `<span ${UI.tipAttr(b)} style="--rc:${R(b.rarity)}">${b.icon}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`; }).join('')}</div>` : ''}</div>`;
  }
  function pileCard() {
    const pi = P.pileInfo(), pk = 1 + (P.stats.dmg || 0) + (P.stats.skillDmg || 0); // the shockwave is a skill hit: 与ダメ + スキルダメージ apply
    pi.dmg *= pk; pi.dmgMax *= pk;
    return `<div class="sc" style="--rc:var(--gold2)">
      <div class="sc-h"><span class="key">${G.input.keyName('crouch')}</span><span class="ic">🔨</span><span class="nm">パイルドライバー<b class="lv">Lv${pi.lvl + 1}</b></span><span class="st ${P.pileReady() ? 'ok' : ''}">${P.pileReady() ? 'READY' : Math.ceil(P.pileCd) + '秒'}</span></div>
      <div class="sc-l"><span><label>クールタイム</label>${dv(pi.cd, 8, { unit: '秒', lowerBetter: true })}</span><span><label>威力</label>${dv(pi.dmg, 120, { dec: 0 })}</span><span><label>範囲</label>${dv(pi.radius, 5.5, { unit: 'm' })}</span></div>
      <div class="sc-d">空中で <b class="sv">${G.input.keyName('crouch')}</b>：真下へ急降下して叩きつける。高所から落ちるほど威力が上がる（10mごとに${dv(pi.heightPer10, 100, { unit: '%', dec: 0 })}、最大 ${dv(pi.dmgMax, 120 * 2.5, { dec: 0 })}）。シールドへ ×<b class="sv">${pi.shieldMul}</b></div>
      ${pi.fx.length ? `<div class="sc-x">${pi.fx.join('　')}</div>` : ''}</div>`;
  }

  // ---------------- stats, items, perks ----------------
  const GROUPS = [
    ['攻撃', ['dmg', 'fireRate', 'reloadSpeed', 'critChance', 'critMul', 'headMul', 'skillDmg', 'explosionDmg', 'shieldDmg', 'defIgnore', 'defIgnoreGun']],
    ['生存', ['maxHp', 'defense', 'armor', 'hpRegen', 'lifesteal']],
    ['属性', ['elMastery', 'elRes_fire', 'elRes_water', 'elRes_ice', 'elRes_volt', 'elRes_wind', 'elRes_earth']],
    ['機動・その他', ['moveSpeed', 'weight', 'maxJumps', 'grappleRange', 'cdr', 'coinMul', 'luck']],
  ];
  const LOWER_STATS = new Set(['weight']);
  function statRow(k) {
    const st = P.stats, B = G.PLAYER_BASE, def = G.STAT_NAMES[k]; if (!def) return '';
    const [ic, nm, t] = def, v = st[k] ?? 0, b = B[k] ?? 0;
    let txt;
    if (t === 'cd') txt = Math.round((v - 1) * 100) + '%';
    else if (t === 'p') { const isAbs = ['critChance', 'lifesteal', 'armor', 'cdr', 'luck'].includes(k) || k.startsWith('elRes_'); txt = (isAbs ? Math.round(v * 100) : (v >= 0 ? '+' : '') + Math.round(v * 100)) + '%'; }
    else if (t === 'x') txt = '×' + v.toFixed(2);
    else txt = String(Math.round(v * 10) / 10);
    const diff = Math.abs(v - b) > 1e-6;
    // more of a stat is a gain, except the ones where less is better (the weight of the armour)
    const gain = LOWER_STATS.has(k) ? v < b : v > b;
    return `<div class="sg" ${G.statTip(k)}><span>${ic} ${nm}</span><b class="sv ${diff ? (gain ? 'up' : 'dn') : ''}">${txt}</b></div>`;
  }
  const statsBody = () => GROUPS.map(([title, keys]) => `<div class="sgh">${title}</div><div class="sgrid">${keys.map(statRow).join('')}</div>`).join('');
  function perksBody() {
    const list = [...P.buffs];
    if (!list.length) return '<div class="none">まだ加護はありません</div>';
    return `<div class="pgrid">${list.map(([id, n]) => {
      const b = G.BUFF_BY_ID[id]; if (!b) return '';
      const cnt = b.counter ? ` <span class="cnt">[${b.counter(P.buffState[id] || {})}]</span>` : '';
      return `<div class="bf" style="--rc:${R(b.rarity)}"><div class="bicon" style="--rc:${R(b.rarity)}">${b.icon}${n > 1 ? `<span class="st">${n}</span>` : ''}</div><div class="bt"><b>${esc(b.name)}</b>${cnt}<div>${U.descHTML(b.desc, { inline: true })}</div></div></div>`;
    }).join('')}</div>`;
  }
  function itemsBody() {
    const row = (it, title, sub) => `<div class="it" style="--rc:${R(it.rarity)}" ${UI.tipAttr(it)}><span class="ic">${it.icon}${G.Elem.badge(it)}</span><span class="nm">${title}</span><span class="sub">${sub || ''}</span>${it.desc ? `<span class="ds">${esc(it.desc)}</span>` : ''}</div>`;
    const g = Object.keys(P.grenades).filter((k) => P.grenades[k] > 0).map((k) => row(G.ITEM_BY_ID[k], `${G.ITEM_BY_ID[k].name} ×${P.grenades[k]}`, k === P.grenadeSel ? '◀ G' : 'G'));
    const u = G.ITEM_SLOTS.map((S) => P.slotItems(S.id).map((id) => row(G.ITEM_BY_ID[id], `${G.ITEM_BY_ID[id].name} ×${P.itemCount(id)}`, (id === P.selItem(S.id) ? '◀ ' : '') + S.key)).join('')).filter(Boolean);
    const pv = G.passiveItems(P).map((id) => row(G.ITEM_BY_ID[id], `${G.ITEM_BY_ID[id].name} ×${P.itemCount(id)}`, '常時'));
    // attachments waiting in the stash (with what they do)
    const sn = {}; for (const id of P.attStash || []) if (G.ATT_BY_ID[id]) sn[id] = (sn[id] || 0) + 1;
    const st = Object.keys(sn).map((id) => row(G.ATT_BY_ID[id], `${G.ATT_BY_ID[id].name}${sn[id] > 1 ? ' ×' + sn[id] : ''}`, '🗃️ 保管庫'));
    const all = g.concat(u, pv, st);
    return all.length ? all.join('') : '<div class="none">アイテムなし</div>';
  }

  UI.statusHTML = function (compact) {
    P = G.player; pend = [];
    const st = P.stats, run = G.game.run || {};
    const head = `<div class="sh">
      <div class="sh-t">STATUS<span>ホイールでスクロール</span></div>
      <div class="sh-c"><span>エリア <b>${G.game.area}</b></span><span>❤ <b>${Math.ceil(P.hp)}</b>/${st.maxHp}</span>${P.os > 0.5 ? `<span class="os">🛡 <b>+${Math.ceil(P.os)}</b></span>` : ''}<span>🪙 <b>${U.fmt(run.coins || 0)}</b></span><span>🪔 <b>${P.revives || 0}</b></span><span>撃破 <b>${run.kills || 0}</b></span></div></div>`;
    const empty = Math.max(0, st.weaponSlots - P.weapons.length);
    const CLS = G.Classes, cl = CLS && CLS.of(P.cls);
    const clsP = cl && cl.pas ? panel('CLASS', `${cl.icon} ${cl.name}`, `<div style="--cc:${cl.col}">${CLS.pasHTML(cl)}${CLS.perksHTML(cl, CLS.perksOf(P))}<div class="cls-pas-n">▼ 短所：${esc(cl.minus)}</div></div>`) : '';
    if (compact) return `<div class="sw cp">${head}<div class="scols"><div class="col">${panel('ROUTE', '道程', UI.routeHTML())}${clsP}${panel('STATS', '能力値', statsBody())}</div></div><div class="srow">${panel(`PERKS・${P.buffs.size}`, '加護', perksBody(), 'perks')}</div></div>`;
    const loadout = panel('LOADOUT', '武器', G.weapons.gunsInOrder().map(gunCard).join('') + Array.from({ length: empty }, () => `<div class="wc empty"><div class="wc-h0"><span class="key">＋</span><span class="nm">武器スロット：空き</span></div></div>`).join('') + meleeCard());
    const abil = panel('ABILITIES', 'スキル', P.skills.map((sk, i) => (sk ? skillCard(sk, G.input.skillKey(i)) : `<div class="sc empty"><div class="sc-h"><span class="key">${G.input.skillKey(i)}</span><span class="nm">— 空き —</span></div></div>`)).join('') + pileCard());
    const right = clsP + panel('STATS', '能力値', statsBody()) + panel('ITEMS', '所持アイテム', `<div class="igrid">${itemsBody()}</div>`);
    const perks = panel(`PERKS・${P.buffs.size}`, '加護', perksBody(), 'perks');
    return `<div class="sw">${head}<div class="scols"><div class="col">${loadout}</div><div class="col">${abil}</div><div class="col">${right}</div></div><div class="srow">${perks}</div></div>`;
  };

  // hover cards (the weapon / skill boxes on the inventory screen)
  const tipOf = (fn) => { P = G.player; noPv = true; try { return fn(); } finally { noPv = false; } };
  SU.gunTip = (w) => tipOf(() => gunCard(w));
  SU.meleeTip = () => tipOf(() => meleeCard());
  SU.skillTip = (sk, key) => tipOf(() => skillCard(sk, key));
  SU.pileTip = () => tipOf(() => pileCard());
  // a live 3D model canvas for other screens: build the html, then call SU.mount(root) once it is in the page
  SU.preview = (kind, def, atts) => preview(kind, def, atts);

  // ---------------- small 3D views, drawn by the game's own renderer ----------------
  // The weapon cards, the class screen's figure and the codex's model are drawn by the game's renderer into a target of their own and
  // copied to a 2D canvas: none has a WebGL context of its own. (A phone allows a page only a few, and Chrome takes the oldest - the
  // game's - when there are too many; each held its drawing buffer, reflections and copies of the game's baked surfaces - from some
  // 10 to 20 MB each - and the class screen's and the codex's stayed after they were closed. A context made at each opening instead
  // had its shaders and reflections to make again: a second or two on a phone.)
  // (the target is marked as XR's: three r158 then draws into it as it draws to the screen - the renderer's tone mapping and sRGB
  // out - where any other target is given linear colour. Its storage is plain 8-bit (RGBA8, not sRGB), so the bytes read back are those
  // a canvas of its own would have shown; 4 samples, as that canvas's antialias)
  const PPB = 0x88EB, _cc = new THREE.Color();
  const liveR = () => { const R = G.renderer; return R && !R.getContext().isContextLost() ? R : null; };
  // the game renderer lent to a view: whatever of its state is changed is put back as it was (the frame's target, clearing, clear
  // colour, exposure, tone mapping, its draw counts, a shadow redraw it was asked for)
  SU.lend = function (fn) {
    const R = liveR(); if (!R) return;
    const sm = R.shadowMap, st = { rt: R.getRenderTarget(), ac: R.autoClear, ex: R.toneMappingExposure, tm: R.toneMapping, ca: R.getClearAlpha(), ar: R.info.autoReset, su: sm.needsUpdate };
    R.getClearColor(_cc);
    try {
      R.autoClear = true; R.toneMappingExposure = 1; R.toneMapping = THREE.ACESFilmicToneMapping; R.setClearColor(0x000000, 0); R.info.autoReset = false;
      return fn(R, R.getContext());
    } finally {
      R.setRenderTarget(st.rt); R.autoClear = st.ac; R.toneMappingExposure = st.ex; R.toneMapping = st.tm; R.setClearColor(_cc, st.ca); R.info.autoReset = st.ar; sm.needsUpdate = st.su;
    }
  };
  // SU.view(): one such view. size(w, h) sets its picture's size; frame(jobs, now) draws each job - { ctx, draw(R) }: draw renders a
  // scene with R, whose target is already the view's - and puts the picture on the job's 2D context: at once when `now` (or without
  // WebGL2); otherwise copied on the GPU into a pixel buffer and put on a later frame, once a fence says the GPU is done (a plain read
  // back waits for the GPU to finish everything before it, the game's own frame too: on a phone that halved the frame rate behind
  // the inventory). dispose() lets its target and buffer go.
  SU.view = function () {
    const V = { rt: null, w: 0, h: 0, img: null, buf: null, rd: null, async: false };
    V.size = function (w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      if (V.rt && V.w === w && V.h === h) return true;
      const R = liveR(); if (!R) return false;
      V.drop(); V.w = w; V.h = h; V.img = new ImageData(w, h); V.buf = new Uint8Array(w * h * 4);
      if (V.rt) { V.rt.setSize(w, h); return true; }
      V.async = !!R.capabilities.isWebGL2;
      V.rt = new THREE.WebGLRenderTarget(w, h, { samples: V.async ? 4 : 0, colorSpace: THREE.SRGBColorSpace });
      if (V.async) V.rt.texture.internalFormat = 'RGBA8';
      V.rt.isXRRenderTarget = true;
      return true;
    };
    // the picture read back (rows bottom-up, colour premultiplied by alpha, as a canvas with alpha holds it) put on a 2D canvas
    const put = (ctx, src, off) => {
      const d = V.img.data, row = V.w * 4;
      for (let y = 0; y < V.h; y++) { const s = off + (V.h - 1 - y) * row; d.set(src.subarray(s, s + row), y * row); }
      for (let i = 3; i < d.length; i += 4) { const a = d[i]; if (a && a < 255) { const k = 255 / a; d[i - 3] *= k; d[i - 2] *= k; d[i - 1] *= k; } }
      ctx.putImageData(V.img, 0, 0);
    };
    V.frame = function (jobs, now) {
      const R = liveR(); if (!R || !V.rt || !jobs.length) return;
      if (now || !V.async) {
        SU.lend((R2) => { for (const j of jobs) { R2.setRenderTarget(V.rt); j.draw(R2); R2.readRenderTargetPixels(V.rt, 0, 0, V.w, V.h, V.buf); put(j.ctx, V.buf, 0); } });
        return;
      }
      const gl = R.getContext(), S = V.w * V.h * 4, n = jobs.length;
      let D = V.rd;
      if (D && D.fence) {
        if (gl.getSyncParameter(D.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return;   // (not drawn yet: the canvases keep their last picture)
        gl.deleteSync(D.fence); D.fence = null;
        gl.bindBuffer(PPB, D.pbo); gl.getBufferSubData(PPB, 0, D.data, 0, D.n * S); gl.bindBuffer(PPB, null);
        for (let i = 0; i < D.n; i++) if (jobs[i] && D.ctx[i] === jobs[i].ctx) put(jobs[i].ctx, D.data, i * S);
      }
      if (!D || D.cap < n) {
        V.drop();
        const pbo = gl.createBuffer(); gl.bindBuffer(PPB, pbo); gl.bufferData(PPB, n * S, gl.STREAM_READ); gl.bindBuffer(PPB, null);
        D = V.rd = { pbo, cap: n, data: new Uint8Array(n * S), fence: null, n: 0, ctx: [] };
      }
      SU.lend((R2) => {
        for (let i = 0; i < n; i++) {
          R2.setRenderTarget(V.rt); jobs[i].draw(R2);
          // (the target's resolved picture: bound as three binds it to read it back - readRenderTargetPixels - and copied into the buffer)
          R2.state.bindFramebuffer(gl.FRAMEBUFFER, R2.properties.get(V.rt).__webglFramebuffer);
          gl.bindBuffer(PPB, D.pbo); gl.readPixels(0, 0, V.w, V.h, gl.RGBA, gl.UNSIGNED_BYTE, i * S); gl.bindBuffer(PPB, null);
        }
      });
      D.n = n; D.ctx = jobs.map((j) => j.ctx); D.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    };
    // (a read under way dropped - its picture is of what is no longer shown - and the pixel buffer let go)
    V.drop = function () {
      const D = V.rd; V.rd = null; if (!D) return;
      try { const gl = G.renderer.getContext(); if (D.fence) gl.deleteSync(D.fence); gl.deleteBuffer(D.pbo); } catch (e) { /* gone with the context */ }
    };
    V.dispose = function () { V.drop(); if (V.rt) V.rt.dispose(); V.rt = null; V.w = V.h = 0; V.img = V.buf = null; };
    return V;
  };

  // ---------------- 3D weapon previews ----------------
  const PV = { scene: null, cam: null, view: null, items: [], raf: 0, W: 448, H: 256 };
  function pvInit() {
    const R = liveR(); if (!R) return false;
    if (PV.scene) return true;
    PV.view = SU.view(); if (!PV.view.size(PV.W, PV.H)) { PV.view = null; return false; }
    PV.scene = new THREE.Scene();
    PV.scene.add(new THREE.HemisphereLight(0xc8c4bc, 0x50483c, 2.4));
    const k = new THREE.DirectionalLight(0xffe8d0, 3.6); k.position.set(2, 3, 3); PV.scene.add(k);
    const r2 = new THREE.DirectionalLight(0x8090c0, 1.1); r2.position.set(-3, 1, -2); PV.scene.add(r2);
    const f = new THREE.DirectionalLight(0xffffff, 1.4); f.position.set(0, 0.5, 4); PV.scene.add(f);
    // (the game's own reflections: the same context, nothing to copy)
    try { PV.scene.environment = G.envTex || (G.Tex && G.Tex.makeEnv ? G.Tex.makeEnv(R) : null); } catch (e) { PV.scene.environment = null; }
    PV.cam = new THREE.PerspectiveCamera(28, PV.W / PV.H, 0.01, 100);
    return true;
  }
  // a card's job for the view: its model put in the scene, turned, framed, drawn, and taken out again
  const pvJobs = (items, t) => items.map((it) => ({ ctx: it.ctx, draw(R) {
    PV.scene.add(it.g);
    it.g.rotation.y = it.kind === 'gun' ? -Math.PI / 2 + Math.sin(t * 0.8 + it.ph) * 0.6 : t * 0.7 + it.ph;
    PV.cam.position.set(0, it.d * 0.12, it.d); PV.cam.lookAt(0, 0, 0);
    R.render(PV.scene, PV.cam);
    PV.scene.remove(it.g);
  } }));
  // (drawn and put at once: the cards new on the screen, so that none shows empty)
  function pvFrame(items, now) {
    items = items || PV.items;
    if (!items.length || !pvInit()) return;
    PV.view.frame(pvJobs(items, performance.now() / 1000), now);
  }
  function pvLoop() {
    PV.raf = requestAnimationFrame(pvLoop);
    if (!UI.statusOpen() && !(G.InvUI && G.InvUI.isOpen())) { SU.unmount(); return; }
    pvFrame();
  }
  SU.renderOnce = () => pvFrame(null, true);
  // bounds of what is actually drawn (hidden parts of a display model must not enlarge the frame)
  function visBox(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    (function walk(o) {
      if (!o.visible) return;
      if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp); }
      for (const ch of o.children) walk(ch);
    })(root);
    return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.2, -0.1, -0.2), new THREE.Vector3(0.2, 0.1, 0.2)) : box;
  }
  // the models already made, by weapon and parts (the inventory mounts the same few again at every opening and every change in the
  // bag): made, fitted and copied for this renderer once; the oldest are let go past a dozen or so
  const pvModels = new Map();
  function pvModel(it) {
    const key = it.kind + '|' + (it.def.id || it.def.name) + '|' + (it.atts ? JSON.stringify(it.atts) : '');
    let m = pvModels.get(key);
    if (m) { pvModels.delete(key); pvModels.set(key, m); return m; }
    let model; try { model = it.kind === 'melee' ? G.weapons.meleeDisplayModel(it.def) : G.weapons.displayModel(it.def, it.atts); } catch (e) { return null; }
    const box = visBox(model), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    model.position.sub(c);
    const g = new THREE.Group(); g.add(model);
    // guns are seen side-on (barrel across the frame); melee weapons spin, fitted by their bounding sphere
    const half = Math.tan(THREE.MathUtils.degToRad(PV.cam.fov / 2)), asp = PV.W / PV.H;
    const d = it.kind === 'gun' ? Math.max(sz.z * 1.12 / (2 * half * asp), sz.y * 1.35 / (2 * half), 0.25) : Math.max(sz.length() * 0.5 / half * 1.15, 0.3);
    m = { key, g, d };
    pvModels.set(key, m);
    if (pvModels.size > 16) pvModels.delete(pvModels.keys().next().value);
    return m;
  }
  SU.mount = function (root) {
    const list = pend; pend = [];
    SU.unmount();
    if (!list.length || !pvInit()) return;
    PV.items = list.map((it, i) => {
      const cv = root.querySelector(`canvas[data-pv="${it.id}"]`); if (!cv) return null;
      const m = pvModel(it); if (!m) return null;
      // (a canvas kept from the last time - the inventory patches its markup in place - already shows this weapon: it is not drawn
      // again before the next frame)
      const fresh = cv._pv !== m.key; cv._pv = m.key;
      return { cv, ctx: cv._ctx || (cv._ctx = cv.getContext('2d')), g: m.g, d: m.d, kind: it.kind, ph: i * 1.3, fresh };
    }).filter(Boolean);
    pvFrame(PV.items.filter((x) => x.fresh), true);
    PV.raf = requestAnimationFrame(pvLoop);
  };
  // the previews' target made and their shaders compiled once (the game renderer's, as they are drawn into the target: tone mapped,
  // sRGB out), ahead of the first Tab / chest screen
  SU.warm = function () {
    if (!pvInit()) return;
    try {
      const d = G.WEAPON_BY_ID && (G.WEAPON_BY_ID.starter || G.WEAPONS[0]);
      const g = new THREE.Group();
      if (d) g.add(G.weapons.displayModel(d, {}));
      if (G.MELEE && G.MELEE[0]) g.add(G.weapons.meleeDisplayModel(G.MELEE[0]));
      PV.scene.add(g); PV.scene.updateMatrixWorld(true);
      PV.cam.position.set(0, 0.1, 1.2); PV.cam.lookAt(0, 0, 0);
      SU.lend((R) => { R.setRenderTarget(PV.view.rt); R.compile(PV.scene, PV.cam); R.render(PV.scene, PV.cam); });
      PV.scene.remove(g);
    } catch (e) { /* ignore */ }
    // the class screen's figure, as its view draws it (classes.js CL.warmView): made when the page is idle, after the loading screen,
    // so that neither the boot nor the first opening of that screen pays for it. Its reflections are made here, behind the loading
    // screen (CL.warmEnv: a blur that held the title for a moment when it was made at idle)
    if (SU._clsWarm) return; SU._clsWarm = true;
    try { if (G.Classes && G.Classes.warmEnv) G.Classes.warmEnv(); } catch (e) { /* made at the first opening */ }
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    idle(() => { try { if (G.Classes && G.Classes.warmView) G.Classes.warmView(); } catch (e) { /* made at the first opening */ } }, { timeout: 8000 });
  };
  // the queued previews are dropped (markup made without being put on the page: the inventory's patch while it is closed)
  SU.drop = () => { pend = []; };
  SU.unmount = function () {
    if (PV.raf) cancelAnimationFrame(PV.raf); PV.raf = 0; PV.items = [];
    if (PV.view) PV.view.drop();   // (a read still under way: its pictures are of cards no longer shown)
  };
})();
