'use strict';
// Weapon parts: corpses and chests sometimes hold a part (a kind of weapon x a rarity). Three of the same part make a weapon of that kind and rarity at a
// workbench, and three of a lower rarity make one of the next rarity. The bench in the transmutation hall works for free and without limit; the one in
// the shop asks a price. Parts last for one run (they are in the bag, which a new run empties).
(function () {
  const U = G.U, IV = G.Inv;
  const PT = (G.Parts = {});
  // the eight kinds; guns by archetype, every melee weapon in one
  PT.FAMS = [
    { id: 'hg', name: 'ハンドガン', icon: '🔫', arch: ['pistol', 'revolver'] },
    { id: 'smg', name: 'SMG', icon: '🔫', arch: ['smg'] },
    { id: 'ar', name: 'アサルト', icon: '🎯', arch: ['rifle', 'burst'] },
    { id: 'sr', name: '狙撃', icon: '🔭', arch: ['dmr', 'sniper'] },
    { id: 'sg', name: 'ショットガン', icon: '💥', arch: ['shotgun', 'autoshotgun'] },
    { id: 'mg', name: '機関銃', icon: '🌀', arch: ['lmg', 'minigun'] },
    { id: 'sp', name: '特殊・爆発', icon: '🚀', arch: ['rocket', 'gl', 'flame', 'rail', 'nail', 'harpoon', 'tesla', 'crossbow'] },
    { id: 'ml', name: '近接', icon: '🗡️', melee: true },
  ];
  // each kind shows the drawn icon of its first archetype (icons.js has already given the archetypes theirs); melee shows a blade
  for (const f of PT.FAMS) { const ic = f.melee ? G.MELEE_BY_ID.m_katana && G.MELEE_BY_ID.m_katana.icon : G.WEAPON_ARCH[f.arch[0]] && G.WEAPON_ARCH[f.arch[0]].icon; if (ic) f.icon = ic; }
  PT.FAM_BY_ID = Object.fromEntries(PT.FAMS.map((f) => [f.id, f]));
  const ORD = G.RARITY_ORDER;
  // what a set of parts can become: never a mythic weapon, the starting gun, the starting knife or bare hands
  PT.pool = function (fam, rarity) {
    const f = PT.FAM_BY_ID[fam]; if (!f) return [];
    if (f.melee) return G.MELEE.filter((m) => m.rarity === rarity && !m.mythic && !m.legacy && !G.isDefaultMelee(m.id));
    return G.WEAPONS.filter((w) => w.rarity === rarity && !w.mythic && w.id !== 'starter' && f.arch.includes(w.arch));
  };
  // what one finished weapon of the rarity costs in the shop (the guns' base price table); a part sells for 3% of it
  const WPRICE = { common: 900, uncommon: 1350, rare: 2000, epic: 2900, legendary: 4100, mythic: 7000 };
  PT.MAKE_COST = { common: 270, uncommon: 400, rare: 600, epic: 870, legendary: 1230 }; // the shop bench: three parts -> a weapon
  PT.UP_COST = { uncommon: 135, rare: 200, epic: 290, legendary: 410 }; // the shop bench: three parts -> one of this rarity
  PT.NEED = 3;
  G.PARTS = [];
  for (const f of PT.FAMS) for (const r of ORD) {
    if (!PT.pool(f.id, r).length) continue; // a kind with no weapon of that rarity has no part of it either
    G.PARTS.push({ id: `pt_${f.id}_${r}`, kind: 'part', fam: f.id, rarity: r, name: `${f.name}の部品`, icon: f.icon, famIcon: f.icon, value: Math.round(WPRICE[r] * 0.03),
      desc: `${f.name}の武器を組み立てるための部品。同じ部品を3つ集めると、作業台で${G.RARITY[r].name}の${f.name}武器を1つ作れる（その種類の武器から好きなものを選べる）。下のレアリティの部品3つで、1つ上のレアリティの部品にもできる。` });
  }
  G.PART_BY_ID = Object.fromEntries(G.PARTS.map((p) => [p.id, p]));
  const ORD_T = ORD.filter((r) => G.PARTS.some((p) => p.rarity === r)); // the bench's columns: only rarities that have parts (no ミシック parts)
  PT.id = (fam, r) => `pt_${fam}_${r}`;
  PT.has = (fam, r) => !!G.PART_BY_ID[PT.id(fam, r)];

  // ---------------- drops ----------------
  // a part is added to what the corpse / chest already holds (it never takes the place of anything); its rarity follows the loot depth and luck
  PT.roll = function (luck) {
    const fams = PT.FAMS.slice();
    const f = U.weighted(fams, (x) => (G.Classes ? G.Classes.partW(x.id) : 1), Math.random); // (the class's kinds of part turn up more often)
    const area = G.game ? G.game.area : 1, d = G.Run ? G.Run.lootDepth(area) : area;
    const rs = ORD.filter((r) => PT.has(f.id, r)), w = rs.map((r) => G.rarityWeightD(r, d, luck || 0));
    let x = Math.random() * w.reduce((s, v) => s + v, 0), r = rs[rs.length - 1];
    for (let i = 0; i < rs.length; i++) { x -= w[i]; if (x <= 0) { r = rs[i]; break; } }
    return IV.make('part', PT.id(f.id, r), 1);
  };
  // into a container, growing it by a row when it is full (a part found is never lost for want of room)
  function addTo(c, it) {
    if (IV.put(c, it) === 0) return;
    c.rows += 1; IV.put(c, it);
  }
  PT.CORPSE = { tiny: 0.03, plain: 0.08, elite: 0.25, champion: 0.5 };
  PT.CHEST = [0.2, 0.35, 0.6];
  const corpse0 = IV.corpseLoot;
  IV.corpseLoot = function (e) {
    const c = corpse0.call(IV, e);
    const p = e.champion ? PT.CORPSE.champion : e.elite ? PT.CORPSE.elite : IV.bodyClass(e) === 0 ? PT.CORPSE.tiny : PT.CORPSE.plain;
    if (Math.random() < p) addTo(c, PT.roll((G.player.stats.luck || 0)));
    return c;
  };
  const chest0 = IV.chestLoot;
  IV.chestLoot = function (tier) {
    const c = chest0.call(IV, tier), luck = (G.player.stats.luck || 0) + (G.player.stats.chestBonus || 0);
    if (tier >= 3) { addTo(c, PT.roll(luck + 2)); addTo(c, PT.roll(luck + 2)); }
    else if (Math.random() < (PT.CHEST[tier] || 0)) addTo(c, PT.roll(luck));
    return c;
  };

  // ---------------- what the player holds ----------------
  const P = () => G.player;
  PT.count = (id) => IV.countAll(P(), 'part', id);
  PT.take = (id, n) => IV.takeAll(P(), 'part', id, n);
  // the recipes open to the player right now
  PT.recipes = function () {
    const make = [], up = [];
    for (const d of G.PARTS) {
      const n = PT.count(d.id); if (n <= 0) continue;
      make.push({ d, n, ok: n >= PT.NEED });
      const ri = ORD.indexOf(d.rarity), nx = ORD[ri + 1];
      if (nx && PT.has(d.fam, nx)) up.push({ d, to: G.PART_BY_ID[PT.id(d.fam, nx)], n, ok: n >= PT.NEED });
    }
    return { make, up };
  };
  const GM = () => G.game;
  PT.makeCost = (r, free) => (free ? 0 : GM().price(PT.MAKE_COST[r]));
  PT.upCost = (r, free) => (free ? 0 : GM().price(PT.UP_COST[r]));
  // a finished weapon goes where the transmutation hall's would: a free gun slot / the melee hand, else the bag, else the floor
  PT.give = function (d) {
    const p = P(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const stash = (it) => { if (IV.stow(p, it) > 0) { IV.dropToGround(it, p.pos.clone().add(V(0, 0.4, 0))); G.ui.toastSmall('🎒 インベントリに空きがないので足元に置いた'); } };
    if (d.kind === 'melee') {
      if (p.melee && p.melee.id !== (G.BARE_MELEE || 'fists')) stash(GM().meleeItem(p.melee));
      p.melee = G.weapons.makeMelee(d.id);
      if (p.meleeMode) G.weapons.melee.equip(false);
    } else {
      const nw = G.weapons.make(d.id); nw.mag = G.weapons.stats(nw).mag;
      if (!d.el && Math.random() < 0.1) { nw.el = ['fire', 'water', 'ice', 'volt', 'wind', 'earth'][Math.floor(Math.random() * 6)]; const E = G.Elem.BY[nw.el]; setTimeout(() => G.ui.toast(`${E.icon} ${d.name} は${E.name}属性を帯びて組み上がった`, 'good'), 300); }
      if (p.weapons.length < p.stats.weaponSlots) { p.weapons.push(nw); G.weapons.switchTo(p.weapons.length - 1); }
      else stash(GM().gunItem(nw));
    }
    G.weapons.order(); G.ui.refreshWeapon(); G.ui.refreshItems(); p.recalc();
    G.save.mark('items', d.id);
  };
  // three parts -> any weapon of that kind and rarity (the parts and the price are taken only when one is picked).
  // every one is offered, so backing out and asking again changes nothing (it used to be a random three: backing out re-rolled them).
  // the class's favourites come first.
  PT.make = function (id, free, done) {
    const d = G.PART_BY_ID[id], cost = PT.makeCost(d.rarity, free), run = GM().run;
    if (PT.count(id) < PT.NEED) return false;
    if (run.coins < cost) return false;
    const wt = (x) => (G.Classes ? G.Classes.weight(x) : 1);
    const cands = PT.pool(d.fam, d.rarity).map((w, i) => [w, i]).sort((a, b) => wt(b[0]) - wt(a[0]) || a[1] - b[1]).map(([w]) => w);
    return { cands, pick: (w) => {
      if (PT.count(id) < PT.NEED || run.coins < cost) return false;
      PT.take(id, PT.NEED); run.coins -= cost;
      PT.give(w);
      G.ui.toast(`🔧 ${d.name}×3 → ${w.icon} ${w.name}`, 'good'); G.ui.itemCard(w, '[部品から組み立て]');
      if (done) done();
      return true;
    } };
  };
  PT.up = function (id, free) {
    const d = G.PART_BY_ID[id], ri = ORD.indexOf(d.rarity), to = G.PART_BY_ID[PT.id(d.fam, ORD[ri + 1])], run = GM().run;
    if (!to || PT.count(id) < PT.NEED) return false;
    const cost = PT.upCost(to.rarity, free); if (run.coins < cost) return false;
    PT.take(id, PT.NEED); run.coins -= cost;
    const it = IV.make('part', to.id, 1);
    if (IV.stow(P(), it) > 0) IV.dropToGround(it, P().pos.clone().setY(P().pos.y + 0.4));
    G.ui.toast(`🔩 ${d.name}（${G.RARITY[d.rarity].name}）×3 → ${to.name}（${G.RARITY[to.rarity].name}）`, 'good');
    return true;
  };

  // ---------------- the workbench ----------------
  const RN = (r) => `<b style="color:${G.ui.R(r)}">${G.RARITY[r].name}</b>`;
  const costTxt = (c) => (c ? `${U.fmt(c)}🪙` : '無料');
  PT.benchInfo = function (free) {
    const { make } = PT.recipes(), ready = make.filter((m) => m.ok).length, have = make.reduce((s, m) => s + m.n, 0);
    return { icon: '🔧', name: free ? '部品の作業台（無料）' : '部品の作業台', rc: '#c8a878', cat: free ? '部品の組み立て・繰り上げ（無料・何度でも）' : '部品の組み立て・繰り上げ（有料）',
      desc: have ? `所持している部品 ${have}個 — 組み立てられる組 ${ready}` : '部品を持っていない。死体や宝箱から見つかる。', action: '使う' };
  };
  // the bench: a table of kind x rarity (how many of each part you hold), the chosen cell on the right with what it can become
  const esc = U.esc;
  let sel = null, cands = null;
  PT.open = function (free) {
    const gm = GM(), UI = G.ui;
    gm.state = 'modal'; G.input.exitLock();
    const s = UI.screen('<div class="pb-wrap"></div>');
    const wrap = s.querySelector('.pb-wrap');
    const close = () => { cands = null; UI.clearScreen(); gm.resume(); };
    const firstPick = () => {
      const { make } = PT.recipes();
      const ready = make.find((m) => m.ok); if (ready) return ready.d.id;
      const any = make[0]; return any ? any.d.id : null;
    };
    if (!sel || !G.PART_BY_ID[sel] || !PT.count(sel)) sel = firstPick();
    const render = () => {
      const coins = gm.run.coins;
      const head = `<div class="pb-head"><div class="pb-title">🔧 部品の作業台 <span class="pb-tag ${free ? 'free' : ''}">${free ? '無料・何度でも' : '有料'}</span></div><div class="pb-coins">🪙 ${U.fmt(coins)}</div></div>
        <div class="pb-rule">同じ部品3つで武器を1つ組み立てる（3つの候補から選ぶ）。下のレアリティの部品3つで、1つ上のレアリティの部品にもできる。</div>`;
      const cols = ORD_T.map((r) => `<div class="pb-ch" style="--rc:${G.ui.R(r)}">${G.RARITY[r].name}</div>`).join('');
      const rows = PT.FAMS.map((f) => {
        const cells = ORD_T.map((r) => {
          const id = PT.id(f.id, r), d = G.PART_BY_ID[id];
          if (!d) return '<div class="pb-c none">—</div>';
          const n = PT.count(id), ok = n >= PT.NEED;
          return `<button class="pb-c${n ? ' have' : ''}${ok ? ' ok' : ''}${sel === id ? ' sel' : ''}" data-p="${id}" style="--rc:${G.ui.R(r)}"><b>${n}</b><i>/${PT.NEED}</i><span class="pb-dots">${[0, 1, 2].map((k) => `<em class="${k < Math.min(n, 3) ? 'on' : ''}"></em>`).join('')}</span></button>`;
        }).join('');
        return `<div class="pb-rh"><span class="pb-fi">${f.icon}</span>${esc(f.name)}</div>${cells}`;
      }).join('');
      const grid = `<div class="pb-grid"><div class="pb-corner"></div>${cols}${rows}</div>`;
      wrap.innerHTML = `${head}<div class="pb-main">${grid}<div class="pb-side">${side(coins)}</div></div><div class="pb-foot"><button class="btn" id="pb-close">閉じる</button></div>`;
      wrap.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { sel = b.dataset.p; cands = null; G.sfx.ui('click'); render(); }; });
      wrap.querySelector('#pb-close').onclick = () => { G.sfx.ui('back'); close(); };
      const mk = wrap.querySelector('#pb-make'); if (mk) mk.onclick = () => { const r = PT.make(sel, free, null); if (!r) { G.sfx.ui('deny'); return; } cands = r; G.sfx.ui('select'); render(); };
      const up = wrap.querySelector('#pb-up'); if (up) up.onclick = () => { if (PT.up(sel, free)) { G.sfx.ui('select'); const to = PT.id(G.PART_BY_ID[sel].fam, ORD[ORD.indexOf(G.PART_BY_ID[sel].rarity) + 1]); if (!PT.count(sel)) sel = to; render(); } else G.sfx.ui('deny'); };
      wrap.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => { const w = cands && cands.cands[+b.dataset.w]; if (!w || !cands.pick(w)) { G.sfx.ui('deny'); return; } cands = null; G.sfx.ui('select'); if (!PT.count(sel)) sel = firstPick(); render(); }; });
      const back = wrap.querySelector('#pb-cback'); if (back) back.onclick = () => { cands = null; G.sfx.ui('back'); render(); };
    };
    const side = (coins) => {
      const d = sel && G.PART_BY_ID[sel];
      if (!d) return '<div class="pb-empty">部品を持っていない。<br>死体や宝箱から見つかる。</div>';
      const f = PT.FAM_BY_ID[d.fam], n = PT.count(d.id), ri = ORD.indexOf(d.rarity), next = ORD[ri + 1], to = next && G.PART_BY_ID[PT.id(d.fam, next)];
      const mc = PT.makeCost(d.rarity, free), uc = to ? PT.upCost(to.rarity, free) : 0;
      const pool = PT.pool(d.fam, d.rarity);
      const top = `<div class="pb-sel" style="--rc:${G.ui.R(d.rarity)}"><span class="pb-big">${f.icon}</span><div><div class="pb-nm">${esc(f.name)}の部品</div><div>${RN(d.rarity)}　所持 <b>${n}</b> / ${PT.NEED}</div></div></div>`;
      if (cands) {
        return `${top}<div class="pb-sec">どれを組み立てますか？<small>（${esc(PT.FAM_BY_ID[d.fam].name)}・${RN(d.rarity)}の全${cands.cands.length}種）</small></div><div class="pb-cands${cands.cands.length > 3 ? ' many' : ''}">${cands.cands.map((w, i) => `<button class="pb-cand" data-w="${i}" style="--rc:${G.ui.R(w.rarity)}"><span class="pb-ci">${w.icon}</span><div><b>${esc(w.name)}</b><small>${esc(w.cat || '')}</small><div class="pb-cs">${w.kind === 'melee' ? G.Areas.meleeCard(w) : G.Areas.gunCard(w)}</div></div></button>`).join('')}</div>
          <div class="pb-note">部品${PT.NEED}つ${mc ? `と ${U.fmt(mc)}🪙` : ''}は、選んだときに使う。</div><button class="btn" id="pb-cback">↩ やめる</button>`;
      }
      const canMake = n >= PT.NEED && coins >= mc, canUp = !!to && n >= PT.NEED && coins >= uc;
      const actions = `<div class="pb-acts">
        <button class="btn primary" id="pb-make"${canMake ? '' : ' disabled'}><span>🔧 組み立てる</span><small>部品×${PT.NEED}・${costTxt(mc)}</small></button>
        ${to ? `<button class="btn" id="pb-up"${canUp ? '' : ' disabled'}><span>⏫ 繰り上げ → ${G.RARITY[to.rarity].name}</span><small>部品×${PT.NEED}・${costTxt(uc)}</small></button>` : '<div class="pb-note">これより上のレアリティはない。</div>'}
      </div>${n < PT.NEED ? `<div class="pb-note">あと ${PT.NEED - n} 個で使える。</div>` : coins < Math.min(mc, to ? uc : mc) ? '<div class="pb-note">コインが足りない。</div>' : ''}`;
      const chips = pool.slice(0, 18).map((w) => `<span class="pb-chip" title="${esc(w.name)}">${w.icon}<em>${esc(w.name)}</em></span>`).join('') + (pool.length > 18 ? `<span class="pb-chip more">ほか${pool.length - 18}種</span>` : '');
      return `${top}${actions}<div class="pb-sec">組み立てで出る武器（${pool.length}種から3つが候補になる）</div><div class="pb-chips">${chips}</div>`;
    };
    render();
  };
  // where the bench stands in this area (the levels set world.benchPos / world.benchFree)
  PT.benchPos = () => (G.world && G.world.benchPos) || null;
})();
