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
  PT.FAM_BY_ID = Object.fromEntries(PT.FAMS.map((f) => [f.id, f]));
  const ORD = G.RARITY_ORDER;
  // what a set of parts can become: never a mythic weapon, the starting gun, the starting knife or bare hands
  PT.pool = function (fam, rarity) {
    const f = PT.FAM_BY_ID[fam]; if (!f) return [];
    if (f.melee) return G.MELEE.filter((m) => m.rarity === rarity && !m.mythic && !m.legacy && !G.isDefaultMelee(m.id));
    return G.WEAPONS.filter((w) => w.rarity === rarity && !w.mythic && w.id !== 'starter' && f.arch.includes(w.arch));
  };
  // what one finished weapon of the rarity costs in the shop (the guns' base price table); a part sells for 3% of it
  const WPRICE = { common: 900, uncommon: 1350, rare: 2000, epic: 2900, legendary: 4100 };
  PT.MAKE_COST = { common: 270, uncommon: 400, rare: 600, epic: 870, legendary: 1230 }; // the shop bench: three parts -> a weapon
  PT.UP_COST = { uncommon: 135, rare: 200, epic: 290, legendary: 410 }; // the shop bench: three parts -> one of this rarity
  PT.NEED = 3;
  G.PARTS = [];
  for (const f of PT.FAMS) for (const r of ORD) {
    if (!PT.pool(f.id, r).length) continue; // a kind with no weapon of that rarity has no part of it either
    G.PARTS.push({ id: `pt_${f.id}_${r}`, kind: 'part', fam: f.id, rarity: r, name: `${f.name}の部品`, icon: f.icon, famIcon: f.icon, value: Math.round(WPRICE[r] * 0.03),
      desc: `${f.name}の武器を組み立てるための部品。同じ部品を3つ集めると、作業台で${G.RARITY[r].name}の${f.name}武器を1つ作れる（3択）。下のレアリティの部品3つで、1つ上のレアリティの部品にもできる。` });
  }
  G.PART_BY_ID = Object.fromEntries(G.PARTS.map((p) => [p.id, p]));
  PT.id = (fam, r) => `pt_${fam}_${r}`;
  PT.has = (fam, r) => !!G.PART_BY_ID[PT.id(fam, r)];

  // ---------------- drops ----------------
  // a part is added to what the corpse / chest already holds (it never takes the place of anything); its rarity follows the loot depth and luck
  PT.roll = function (luck) {
    const fams = PT.FAMS.slice();
    const f = fams[Math.floor(Math.random() * fams.length)];
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
  // three parts -> three weapons to choose from (the parts and the price are taken only when one is picked)
  PT.make = function (id, free, done) {
    const d = G.PART_BY_ID[id], cost = PT.makeCost(d.rarity, free), run = GM().run;
    if (PT.count(id) < PT.NEED) return false;
    if (run.coins < cost) return false;
    const cands = U.shuffle(PT.pool(d.fam, d.rarity).slice()).slice(0, 3);
    return { cands, pick: (w) => {
      if (PT.count(id) < PT.NEED || run.coins < cost) return false;
      PT.take(id, PT.NEED); run.coins -= cost;
      PT.give(w);
      G.ui.toast(`🔩 ${d.name}×3 → ${w.icon} ${w.name}`, 'good'); G.ui.itemCard(w, '[部品から組み立て]');
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
    return { icon: '🔧', name: free ? '部品の作業台（無料）' : '部品の作業台', rc: '#c8a878', cat: free ? '武器パーツの組み立て・繰り上げ（無料・何度でも）' : '武器パーツの組み立て・繰り上げ（有料）',
      desc: have ? `所持パーツ ${have}個 — 組み立てられる組 ${ready}` : '武器パーツを持っていない。死体や宝箱から見つかる。', action: '使う' };
  };
  PT.open = function (free) {
    const gm = GM(), again = () => { gm._keepModal = true; setTimeout(() => PT.open(free), 0); };
    const { make, up } = PT.recipes(), coins = gm.run.coins, opts = [];
    for (const m of make) {
      const c = PT.makeCost(m.d.rarity, free), n = PT.pool(m.d.fam, m.d.rarity).length;
      opts.push({ icon: m.d.famIcon, label: `組み立て：${m.d.name}（${G.RARITY[m.d.rarity].name}） ${Math.min(m.n, 99)}/${PT.NEED}`, sub: `${G.RARITY[m.d.rarity].name}の${PT.FAM_BY_ID[m.d.fam].name}武器を${n > 1 ? `${Math.min(3, n)}つから1つ選んで作る` : "1つ作る"} — ${costTxt(c)}`,
        disabled: !m.ok || coins < c, onPick: () => {
          const r = PT.make(m.d.id, free, null); if (!r) return;
          gm._keepModal = true;
          setTimeout(() => {
            const wo = r.cands.map((w) => ({ icon: w.icon, label: `${w.name}（${G.RARITY[w.rarity].name}）`, sub: w.kind === 'melee' ? G.Areas.meleeCard(w) : G.Areas.gunCard(w), onPick: () => { if (!r.pick(w)) G.sfx.ui('deny'); else G.sfx.ui('select'); } }));
            wo.push({ icon: '↩', label: 'やめる', onPick: again });
            gm.modal(`🔧 どれを組み立てますか？（${G.RARITY[m.d.rarity].name}）`, `${m.d.name}×${PT.NEED}${c ? `と ${U.fmt(c)}🪙` : ''}を使って、次のうち1つを組み立てる。`, wo);
          }, 0);
        } });
    }
    for (const u of up) {
      const c = PT.upCost(u.to.rarity, free);
      opts.push({ icon: '⏫', label: `繰り上げ：${u.d.name}（${G.RARITY[u.d.rarity].name}）×${PT.NEED} → ${G.RARITY[u.to.rarity].name}`, sub: `所持 ${u.n}個 — ${costTxt(c)}`,
        disabled: !u.ok || coins < c, onPick: () => { if (PT.up(u.d.id, free)) { G.sfx.ui('select'); again(); } else G.sfx.ui('deny'); } });
    }
    opts.push({ icon: '↩', label: '閉じる', onPick: () => {} });
    const list = make.length ? make.map((m) => `${m.d.famIcon} ${U.esc(m.d.name)} ${RN(m.d.rarity)} ×${m.n}`).join('　') : '武器パーツを持っていない。';
    gm.modal(free ? '🔧 部品の作業台（無料）' : '🔧 部品の作業台', `同じ部品3つで武器を1つ組み立てる。下のレアリティの部品3つで、1つ上のレアリティの部品にもできる。${free ? '<br>ここでは無料で何度でも使える。' : ''}<br><span style="font-size:12.5px">${list}</span><br>所持 🪙 ${U.fmt(coins)}`, opts);
  };
  // where the bench stands in this area (the levels set world.benchPos / world.benchFree)
  PT.benchPos = () => (G.world && G.world.benchPos) || null;
})();
