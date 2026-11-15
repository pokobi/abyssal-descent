'use strict';
// Weapon parts: corpses and chests sometimes hold a part. A part has a rarity and nothing else: three of a rarity make one weapon of that
// rarity at a workbench, and the kind of weapon (handgun, SMG, assault ...) is picked there. Three of a lower rarity make one of the next.
// Parts take no room in the bag: picked up, they go into a count of their own (P.parts, inventory.js), shown in the inventory's parts row.
// The bench in the transmutation hall works for free and without limit; the one in the shop asks a price. Parts last for one run.
(function () {
  const U = G.U, IV = G.Inv;
  const PT = (G.Parts = {});
  // the eight kinds the bench can make; guns by archetype, every melee weapon in one
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
  PT.famOk = (fam, r) => PT.pool(fam, r).length > 0;
  // the kinds the class is good with are marked on the bench (classes.js CL.partW)
  PT.fav = (fam) => !!(G.Classes && G.Classes.partW && G.Classes.partW(fam) > 1);
  // what one finished weapon of the rarity costs in the shop (the guns' base price table); a part sells for 3% of it
  const WPRICE = { common: 900, uncommon: 1350, rare: 2000, epic: 2900, legendary: 4100, mythic: 7000 };
  PT.MAKE_COST = { common: 270, uncommon: 400, rare: 600, epic: 870, legendary: 1230 }; // the shop bench: three parts -> a weapon
  PT.UP_COST = { uncommon: 135, rare: 200, epic: 290, legendary: 410 }; // the shop bench: three parts -> one of this rarity
  PT.NEED = 3;
  PT.ICON = '⚙️';
  G.PARTS = [];
  for (const r of ORD) {
    if (!PT.FAMS.some((f) => PT.famOk(f.id, r))) continue; // a rarity no kind has a weapon of has no part either (no ミシック parts)
    const rn = G.RARITY[r].name;
    G.PARTS.push({ id: `pt_${r}`, kind: 'part', rarity: r, name: `武器の部品（${rn}）`, short: '武器の部品', icon: PT.ICON, value: Math.round(WPRICE[r] * 0.03),
      desc: `武器を組み立てるための部品。${rn}の部品を${PT.NEED}つ集めると、作業台で${rn}の武器を1つ作れる（武器の系統はその場で選ぶ）。下のレアリティの部品${PT.NEED}つで、1つ上のレアリティの部品にもできる。持ち物の枠は取らない。` });
  }
  G.PART_BY_ID = Object.fromEntries(G.PARTS.map((p) => [p.id, p]));
  PT.R = G.PARTS.map((p) => p.rarity); // the rarities parts come in, lowest first
  PT.id = (r) => `pt_${r}`;
  // a rarity from a rarity, a part id, or a part id of the old kind x rarity parts ('pt_sg_common': a run saved before parts lost their kind)
  PT.rOf = function (x) {
    if (!x) return null;
    if (G.RARITY[x]) return PT.R.includes(x) ? x : null;
    const m = /^pt_(?:[a-z]+_)?([a-z]+)$/.exec(String(x));
    return m && PT.R.includes(m[1]) ? m[1] : null;
  };
  PT.legacy = (id) => { const r = PT.rOf(id); return r ? G.PART_BY_ID[PT.id(r)] : null; };
  PT.next = (r) => { const i = PT.R.indexOf(r); return i >= 0 ? PT.R[i + 1] || null : null; };

  // ---------------- drops ----------------
  // a part is added to what the corpse / chest already holds (it never takes the place of anything); its rarity follows the loot depth and luck.
  // The chances were set from a count of a whole run (docs: about 13-17 parts on normal, three to a weapon -> 2-4 weapons a run): mostly from
  // chests, whose number hardly grows with depth, so the deep areas with twice the foes do not flood the bench.
  PT.roll = function (luck) {
    const area = G.game ? G.game.area : 1, d = G.Run ? G.Run.lootDepth(area) : area;
    const w = PT.R.map((r) => G.rarityWeightD(r, d, luck || 0));
    let x = Math.random() * w.reduce((s, v) => s + v, 0), r = PT.R[PT.R.length - 1];
    for (let i = 0; i < PT.R.length; i++) { x -= w[i]; if (x <= 0) { r = PT.R[i]; break; } }
    return IV.make('part', PT.id(r), 1);
  };
  // into a container, growing it by a row when it is full (a part found is never lost for want of room)
  function addTo(c, it) {
    if (IV.put(c, it) === 0) return;
    c.rows += 1; IV.put(c, it);
  }
  PT.CORPSE = { tiny: 0.01, plain: 0.02, elite: 0.08, champion: 0.3 };
  PT.CHEST = [0.4, 0.5, 0.7];
  PT.BOSS = 1; // parts a guardian's chest always holds
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
    if (tier >= 3) { for (let i = 0; i < PT.BOSS; i++) addTo(c, PT.roll(luck + 2)); }
    else if (Math.random() < (PT.CHEST[tier] || 0)) addTo(c, PT.roll(luck));
    return c;
  };

  // ---------------- what the player holds ----------------
  const P = () => G.player;
  PT.count = (x) => IV.partCount(P(), PT.rOf(x));
  PT.take = (x, n) => IV.takeParts(P(), PT.rOf(x), n);
  PT.total = () => PT.R.reduce((s, r) => s + PT.count(r), 0);
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
  // three parts of a rarity + a kind -> any weapon of that kind and rarity (the parts and the price are taken only when one is picked).
  // every one is offered, so backing out and asking again changes nothing; the class's favourites come first.
  PT.make = function (rr, fam, free, done) {
    const r = PT.rOf(rr), d = r && G.PART_BY_ID[PT.id(r)], run = GM().run;
    if (!d || !PT.famOk(fam, r)) return false;
    const cost = PT.makeCost(r, free);
    if (PT.count(r) < PT.NEED || run.coins < cost) return false;
    const wt = (x) => (G.Classes ? G.Classes.weight(x) : 1);
    const cands = PT.pool(fam, r).map((w, i) => [w, i]).sort((a, b) => wt(b[0]) - wt(a[0]) || a[1] - b[1]).map(([w]) => w);
    return { cands, r, fam, pick: (w) => {
      if (PT.count(r) < PT.NEED || run.coins < cost || !cands.includes(w)) return false;
      PT.take(r, PT.NEED); run.coins -= cost;
      PT.give(w);
      G.ui.toast(`🔧 ${d.name}×${PT.NEED} → ${w.icon} ${w.name}`, 'good'); G.ui.itemCard(w, '[部品から組み立て]');
      if (done) done();
      return true;
    } };
  };
  // three of a rarity -> one of the next
  PT.up = function (rr, free) {
    const r = PT.rOf(rr), to = r && PT.next(r), run = GM().run;
    if (!to || PT.count(r) < PT.NEED) return false;
    const cost = PT.upCost(to, free); if (run.coins < cost) return false;
    PT.take(r, PT.NEED); run.coins -= cost;
    IV.addParts(P(), to, 1, true);
    G.ui.toast(`🔩 ${G.PART_BY_ID[PT.id(r)].name}×${PT.NEED} → ${G.PART_BY_ID[PT.id(to)].name}`, 'good');
    return true;
  };

  // ---------------- the workbench ----------------
  const RN = (r) => `<b style="color:${G.ui.R(r)}">${G.RARITY[r].name}</b>`;
  const costTxt = (c) => (c ? `${U.fmt(c)}🪙` : '無料');
  PT.benchInfo = function (free) {
    const have = PT.total(), ready = PT.R.filter((r) => PT.count(r) >= PT.NEED).length;
    return { icon: '🔧', name: free ? '部品の作業台（無料）' : '部品の作業台', rc: '#c8a878', cat: free ? '部品の組み立て・繰り上げ（無料・何度でも）' : '部品の組み立て・繰り上げ（有料）',
      desc: have ? `所持している部品 ${have}個 — 組み立てられるレアリティ ${ready}` : '部品を持っていない。亡骸や宝箱から見つかる。', action: '使う' };
  };
  // the bench: (1) the rarity (how many parts of each you hold), (2) the kind of weapon, then on the right what it can become
  const esc = U.esc;
  let selR = null, selF = null, cands = null;
  const firstR = () => {
    const ok = PT.R.filter((r) => PT.count(r) >= PT.NEED); if (ok.length) return ok[ok.length - 1];
    const any = PT.R.filter((r) => PT.count(r) > 0); return any.length ? any[any.length - 1] : PT.R[0];
  };
  PT.open = function (free) {
    const gm = GM(), UI = G.ui;
    gm.state = 'modal'; G.input.exitLock();
    const s = UI.screen('<div class="pb-wrap"></div>');
    const wrap = s.querySelector('.pb-wrap');
    const close = () => { cands = null; UI.clearScreen(); gm.resume(); };
    cands = null;
    if (!PT.R.includes(selR) || !PT.count(selR)) selR = firstR();
    if (selF && !PT.famOk(selF, selR)) selF = null;
    const dots = (n) => `<span class="pb-dots">${Array.from({ length: PT.NEED }, (_, k) => `<em class="${k < Math.min(n, PT.NEED) ? 'on' : ''}"></em>`).join('')}</span>`;
    const render = () => {
      const coins = gm.run.coins;
      const head = `<div class="pb-head"><div class="pb-title">🔧 部品の作業台 <span class="pb-tag ${free ? 'free' : ''}">${free ? '無料・何度でも' : '有料'}</span></div><div class="pb-coins">🪙 ${U.fmt(coins)}</div></div>
        <div class="pb-rule">部品${PT.NEED}つで武器を1つ組み立てる：① 部品のレアリティを選ぶ → ② 武器の系統を選ぶ → ③ 出る武器から1つ選ぶ。下のレアリティの部品${PT.NEED}つで、1つ上のレアリティの部品にもできる。</div>`;
      const rars = PT.R.map((r) => {
        const n = PT.count(r), ok = n >= PT.NEED;
        return `<button class="pb-c pb-r${n ? ' have' : ''}${ok ? ' ok' : ''}${selR === r ? ' sel' : ''}" data-r="${r}" style="--rc:${G.ui.R(r)}"><span class="pb-rn">${G.RARITY[r].name}</span><span class="pb-rc"><b>${n}</b><i>/${PT.NEED}</i></span>${dots(n)}</button>`;
      }).join('');
      const fams = PT.FAMS.map((f) => {
        const pool = PT.pool(f.id, selR), fav = PT.fav(f.id);
        if (!pool.length) return `<div class="pb-f none" title="${esc(G.RARITY[selR].name)}の${esc(f.name)}武器はない"><span class="pb-fi">${f.icon}</span><span class="pb-fn">${esc(f.name)}</span><small>なし</small></div>`;
        return `<button class="pb-f${selF === f.id ? ' sel' : ''}${fav ? ' fav' : ''}" data-f="${f.id}" style="--rc:${G.ui.R(selR)}"><span class="pb-fi">${f.icon}</span><span class="pb-fn">${esc(f.name)}</span><small>${pool.length}種</small>${fav ? '<em class="pb-fav">おすすめ</em>' : ''}</button>`;
      }).join('');
      const left = `<div class="pb-pick"><div class="pb-step"><b>1</b>部品のレアリティ</div><div class="pb-rars">${rars}</div>
        <div class="pb-step"><b>2</b>武器の系統<small>（${RN(selR)}の武器があるもの）</small></div><div class="pb-fams">${fams}</div></div>`;
      wrap.innerHTML = `${head}<div class="pb-main">${left}<div class="pb-side">${side(coins)}</div></div><div class="pb-foot"><button class="btn" id="pb-close">閉じる</button></div>`;
      wrap.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { selR = b.dataset.r; if (selF && !PT.famOk(selF, selR)) selF = null; cands = null; G.sfx.ui('click'); render(); }; });
      wrap.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { selF = b.dataset.f; cands = null; G.sfx.ui('click'); render(); }; });
      wrap.querySelector('#pb-close').onclick = () => { G.sfx.ui('back'); close(); };
      const mk = wrap.querySelector('#pb-make'); if (mk) mk.onclick = () => { const r = PT.make(selR, selF, free, null); if (!r) { G.sfx.ui('deny'); return; } cands = r; G.sfx.ui('select'); render(); };
      const up = wrap.querySelector('#pb-up'); if (up) up.onclick = () => { const r0 = selR; if (PT.up(r0, free)) { G.sfx.ui('select'); if (!PT.count(r0)) { selR = PT.next(r0); if (selF && !PT.famOk(selF, selR)) selF = null; } render(); } else G.sfx.ui('deny'); };
      wrap.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => { const w = cands && cands.cands[+b.dataset.w]; if (!w || !cands.pick(w)) { G.sfx.ui('deny'); return; } cands = null; G.sfx.ui('select'); if (!PT.count(selR)) selR = firstR(); if (selF && !PT.famOk(selF, selR)) selF = null; render(); }; });
      const back = wrap.querySelector('#pb-cback'); if (back) back.onclick = () => { cands = null; G.sfx.ui('back'); render(); };
    };
    const side = (coins) => {
      const r = selR, d = G.PART_BY_ID[PT.id(r)], f = selF && PT.FAM_BY_ID[selF], n = PT.count(r), to = PT.next(r);
      const mc = PT.makeCost(r, free), uc = to ? PT.upCost(to, free) : 0;
      const top = `<div class="pb-sel" style="--rc:${G.ui.R(r)}"><span class="pb-big">${f ? f.icon : PT.ICON}</span><div><div class="pb-nm">${f ? `${esc(f.name)}の武器` : esc(d.short)}</div><div>${RN(r)}の部品　所持 <b>${n}</b> / ${PT.NEED}</div></div></div>`;
      if (cands) {
        return `${top}<div class="pb-sec">どれを組み立てますか？<small>（${esc(f.name)}・${RN(r)}の全${cands.cands.length}種）</small></div><div class="pb-cands${cands.cands.length > 3 ? ' many' : ''}">${cands.cands.map((w, i) => `<button class="pb-cand" data-w="${i}" style="--rc:${G.ui.R(w.rarity)}"><span class="pb-ci">${w.icon}</span><div><b>${esc(w.name)}</b><small>${esc(w.cat || '')}</small><div class="pb-cs">${w.kind === 'melee' ? G.Areas.meleeCard(w) : G.Areas.gunCard(w)}</div></div></button>`).join('')}</div>
          <div class="pb-note">部品${PT.NEED}つ${mc ? `と ${U.fmt(mc)}🪙` : ''}は、選んだときに使う。</div><button class="btn" id="pb-cback">↩ やめる</button>`;
      }
      const canMake = !!f && n >= PT.NEED && coins >= mc, canUp = !!to && n >= PT.NEED && coins >= uc;
      const actions = `<div class="pb-acts">
        <button class="btn primary" id="pb-make"${canMake ? '' : ' disabled'}><span>🔧 組み立てる</span><small>${G.RARITY[r].name}の部品×${PT.NEED}・${costTxt(mc)}</small></button>
        ${to ? `<button class="btn" id="pb-up"${canUp ? '' : ' disabled'}><span>⏫ 繰り上げ → ${G.RARITY[to].name}</span><small>部品×${PT.NEED} → 1・${costTxt(uc)}</small></button>` : '<div class="pb-note">これより上のレアリティの部品はない。</div>'}
      </div>${n < PT.NEED ? `<div class="pb-note">${RN(r)}の部品があと ${PT.NEED - n} 個で使える。</div>` : !f ? '<div class="pb-note">② で武器の系統を選ぶと組み立てられる。</div>' : coins < Math.min(mc, to ? uc : mc) ? '<div class="pb-note">コインが足りない。</div>' : ''}`;
      if (!f) return `${top}${actions}`;
      const pool = PT.pool(f.id, r);
      const chips = pool.slice(0, 18).map((w) => `<span class="pb-chip" title="${esc(w.name)}">${w.icon}<em>${esc(w.name)}</em></span>`).join('') + (pool.length > 18 ? `<span class="pb-chip more">ほか${pool.length - 18}種</span>` : '');
      return `${top}${actions}<div class="pb-sec">組み立てで出る武器（${pool.length}種から1つを選べる）</div><div class="pb-chips">${chips}</div>`;
    };
    render();
  };
  // where the bench stands in this area (the levels set world.benchPos / world.benchFree)
  PT.benchPos = () => (G.world && G.world.benchPos) || null;
})();
