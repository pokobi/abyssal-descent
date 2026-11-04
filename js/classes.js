'use strict';
// Classes: what a run starts with (a common gun and melee weapon, one uncommon skill, one epic ultimate), one strength and one weakness,
// the grapple's cooldown, what turns up a little more often (x1.3), and how the character looks in third person (js/avatar.js, the co-op bodies).
// Every class starts equally strong; only the direction differs. Chosen after the difficulty; the last choice is remembered.
(function () {
  const CL = (G.Classes = {});
  CL.LIST = [
    { id: 'soldier', name: '兵士', icon: '🪖', col: '#9ab070', gun: 'a_ranger', melee: 'm_basic', skill: 'spear', ult: 'ult_armory', grapple: 18,
      mods: { reloadSpeed: 0.15, magSize: 0.15 }, plus: 'リロード速度+15%、装弾数+15%', minus: 'なし', favName: 'なし', fav: null,
      look: 'オリーブ色の戦闘服とヘルメット', role: '何でもこなす基準のクラス' },
    { id: 'assault', name: '突撃兵', icon: '💨', col: '#ff6a50', gun: 's_wasp', melee: 'm_basic', skill: 'dash', ult: 'ult_berserk', grapple: 15,
      mods: { moveSpeed: 0.05 }, near: 0.15, far: -0.15, plus: '10m以内の敵への与ダメ+15%、移動速度+5%', minus: '20m以上の敵への与ダメ-15%', favName: 'SMG・ショットガン',
      fav: (o) => o.kind === 'weapon' && (o.arch === 'smg' || o.arch === 'shotgun'), look: '赤いバンダナとゴーグルの軽装', role: '近距離で暴れる' },
    { id: 'sniper', name: '狙撃手', icon: '🎯', col: '#7ac070', gun: 'n_scout', melee: 'm_basic', skill: 'decoy', ult: 'ult_shadow', grapple: 18,
      mods: { headMul: 0.3, maxHp: -10 }, plus: 'ヘッドショット倍率+30%', minus: '最大HP-10', favName: '狙撃銃・DMR',
      fav: (o) => o.kind === 'weapon' && (o.arch === 'sniper' || o.arch === 'dmr'), look: '緑のフード付きマントとマスク', role: '遠くから急所を撃つ' },
    { id: 'blade', name: '剣士', icon: '⚔️', col: '#c4a0f0', gun: 'p_viper', melee: 'm_machete', skill: 'haste', ult: 'ult_bladestorm', grapple: 15,
      mods: { meleeDmg: 0.2, guardHp: 0.3, magSize: -0.25 }, plus: '近接与ダメ+20%、ガードの耐久+30%', minus: '銃の装弾数-25%', favName: '近接武器',
      fav: (o) => o.kind === 'melee', look: '羽織と袴、鉢巻、背中に鞘', role: '近接で斬り込む' },
    { id: 'heavy', name: '重装兵', icon: '🛡️', col: '#e0b050', gun: 'g_breacher', melee: 'm_woodshield', skill: 'thornarmor', ult: 'ult_bastion', grapple: 28,
      mods: { maxHp: 30, armor: 0.1, moveSpeed: -0.08 }, plus: '最大HP+30、被ダメ-10%', minus: '移動速度-8%', favName: '防具・盾',
      fav: (o) => o.kind === 'armor' || (o.kind === 'melee' && !!o.guard && o.guard[0] >= 0.75), look: '板金の鎧と大きな肩当て、顔まで覆う兜', role: '前に立って受け止める' },
    { id: 'mage', name: '術士', icon: '🔮', col: '#7a9aff', gun: 't_rivet', atts: { core: 'c_water' }, melee: 'm_basic', skill: 'fireball', ult: 'ult_tsunami', grapple: 20,
      mods: { elMastery: 80, elIcd: 0.4, maxHp: -15 }, plus: '属性熟練+80、武器の属性付与の間隔1.5秒', minus: '最大HP-15', favName: '属性コア・属性のスキル',
      fav: (o) => (o.kind === 'attachment' && o.slot === 'core') || (o.kind === 'skill' && G.Elem && !!G.Elem.skEl(o.id)), look: 'フード付きのローブ。まわりに属性の光球が浮く', role: '属性反応で崩す' },
  ];
  CL.BY = Object.fromEntries(CL.LIST.map((c) => [c.id, c]));
  CL.DEFAULT = 'soldier';
  CL.of = (id) => CL.BY[id] || CL.BY[CL.DEFAULT];
  CL.last = () => { const s = G.save && G.save.data.settings; return s && CL.BY[s.lastClass] ? s.lastClass : CL.DEFAULT; };
  CL.remember = (id) => { if (!CL.BY[id] || !G.save) return; G.save.data.settings.lastClass = id; G.save.write(); };

  // the starting kit (called by Player.resetRun)
  CL.kit = function (P) {
    const c = CL.of(P.cls);
    const w = G.weapons.make(c.gun);
    if (c.atts) { Object.assign(w.atts, c.atts); w.ver++; w.mag = G.weapons.stats(w).mag; }
    P.weapons = [w];
    P.melee = G.weapons.makeMelee(c.melee);
    P.skills = [G.abilities.makeSlot(c.ult), G.abilities.makeSlot(c.skill), null, null];
  };
  // the class's strength / weakness as stats (folded in by Player.recalc), the grapple's own cooldown
  CL.mods = function (P) { const c = CL.of(P.cls); return Object.assign({ grappleBase: c.grapple }, c.mods); };
  // 突撃兵: near / far
  CL.dmgAdd = function (P, dist) {
    const c = CL.of(P.cls);
    if (c.near && dist <= 10) return c.near;
    if (c.far && dist >= 20) return c.far;
    return 0;
  };
  // what turns up more often for the class (x1.3)
  CL.weight = function (o) { const c = G.player && CL.of(G.player.cls); return c && c.fav && o && c.fav(o) ? 1.3 : 1; };
  CL.pick = function (r, list) { if (!list.length) return undefined; if (list.every((o) => CL.weight(o) === 1)) return r.pick(list); return r.weighted(list, (o) => CL.weight(o)); };
  // the 不屈の城塞 of a team-mate near you takes a quarter off what you suffer (co-op hooks this in)
  CL.allyGuard = () => false;

  // ---------------- the choice ----------------
  const skLine = (id) => { const d = G.SKILL_BY_ID[id] || (G.ULT_BY_ID && G.ULT_BY_ID[id]) || (G.ULTS || []).find((u) => u.id === id); return d ? { name: d.name, icon: d.icon, desc: d.desc, cd: d.cd } : { name: id, icon: '', desc: '' }; };
  const wName = (id) => { const d = G.WEAPON_BY_ID[id] || G.MELEE_BY_ID[id]; return d ? d.name : id; };
  CL.cardHTML = function (c, on) {
    const sk = skLine(c.skill), ul = skLine(c.ult);
    const core = c.atts && c.atts.core && G.ATT_BY_ID[c.atts.core];
    return `<div class="cls-card${on ? ' on' : ''}" data-c="${c.id}" style="--cc:${c.col}">
      <div class="cls-top"><span class="cls-ic">${c.icon}</span><div><div class="cls-nm">${c.name}</div><div class="cls-role">${c.role}</div></div></div>
      <div class="cls-row"><b>武器</b>${U.esc(wName(c.gun))}${core ? `（${core.icon}${core.name}）` : ''} ／ ${U.esc(wName(c.melee))}</div>
      <div class="cls-sk"><b>${sk.icon} ${U.esc(sk.name)}</b><span>${U.esc(sk.desc)}${sk.cd ? `（CT${sk.cd}秒）` : ''}</span></div>
      <div class="cls-sk ult"><b>${ul.icon} ${U.esc(ul.name)}</b><span>${U.esc(ul.desc)}</span></div>
      <div class="cls-row up"><b>長所</b>${U.esc(c.plus)}</div>
      <div class="cls-row dn"><b>短所</b>${U.esc(c.minus)}</div>
      <div class="cls-row"><b>グラップル</b>CT${c.grapple}秒　<b>出やすい物</b>${U.esc(c.favName)}</div>
      ${(() => { const r = G.save && G.save.data.records.byClass && G.save.data.records.byClass[c.id]; if (!r) return ''; const cl = Object.keys(r.clears || {}).filter((k) => G.Run.DIFFS[k]).map((k) => G.Run.DIFFS[k].name).join('・'); return `<div class="cls-row"><b>記録</b>最深エリア ${r.bestArea}${cl ? `　クリア ${cl}` : ''}</div>`; })()}
    </div>`;
  };
  const U = G.U;
  CL.select = function (onPick, back) {
    const UI = G.ui; let cur = CL.last();
    const s = UI.screen(`<div class="cls-wrap"><h2 class="df-title">クラスを選択</h2><div class="cls-note">始めの装備と方向性が決まります。拾った物はどのクラスでも使えます。</div><div class="cls-cards"></div>
      <div style="text-align:center;margin-top:16px"><button class="btn primary" id="cls-go">この クラスで始める</button> <button class="btn" id="cls-back">↩ 戻る</button></div></div>`);
    const cards = s.querySelector('.cls-cards');
    const render = () => {
      cards.innerHTML = CL.LIST.map((c) => CL.cardHTML(c, c.id === cur)).join('');
      cards.querySelectorAll('.cls-card').forEach((el) => { el.onclick = () => { if (cur === el.dataset.c) return go(); cur = el.dataset.c; G.sfx.ui('click'); render(); }; });
      s.querySelector('#cls-go').textContent = `${CL.of(cur).icon} ${CL.of(cur).name}で始める`;
    };
    const go = () => { CL.remember(cur); G.sfx.ui('select'); onPick(cur); };
    s.querySelector('#cls-go').onclick = go;
    s.querySelector('#cls-back').onclick = () => { G.sfx.ui('back'); back && back(); };
    render();
    return s;
  };
})();
