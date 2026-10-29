'use strict';
// Coin-sink rooms: casino, abyssal bank, auction house, mercenary barracks, offering altar.
(function () {
  const R2 = (G.Rooms2 = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, GM, C, AR;
  R2.init = function () { P = G.player; GM = G.game; C = G.combat; AR = G.Areas; };

  R2.KINDS = ['casino', 'bank', 'auction', 'merc', 'offering'];
  setTimeout(() => Object.assign(G.Areas.TYPES, R2.TYPES), 0);
  R2.TYPES = {
    casino: { name: '賭博場', icon: '🎰', hint: 'コインを賭けて一攫千金', color: '#e0a040', w: 0.8, min: 5 },
    bank: { name: '深淵銀行', icon: '🏦', hint: '預けたコインに利息が付く', color: '#60c0a0', w: 0.75, min: 6 },
    auction: { name: '競売所', icon: '🔨', hint: '神器・遺物を競り落とせ', color: '#c080e0', w: 0.7, min: 10 },
    merc: { name: '傭兵の詰所', icon: '🛡️', hint: 'コインで傭兵を雇う', color: '#a0a0c0', w: 0.7, min: 8 },
    offering: { name: '献納の祭壇', icon: '🏛️', hint: '大金を捧げて上位の加護を得る', color: '#f0d070', w: 0.65, min: 12 },
  };
  const coins = () => GM.run.coins;
  const fmt = (v) => U.fmt(Math.round(v));
  const pay = (v) => { GM.run.coins -= Math.round(v); G.sfx.coins(3); GM.quietUntil = performance.now() + 1200; };
  const gain = (v, label) => C.coins(Math.round(v), null, label);

  function npc(def, pos, ev, light) {
    const w = G.world;
    const m = G.enemies.buildModel(def, {});
    m.group.position.copy(pos); w.group.add(m.group);
    w.lightSources.push({ pos: pos.clone().add(V(0, 2.6, 0.6)), color: light || '#ffd080', intensity: 7, range: 8, flame: 0, emit: false, ph: 0, prio: 2, steady: true });
    w.interactables.push({ type: 'npc', ev, pos: pos.clone().add(V(0, 1.4, 0)), model: m, used: false });
  }

  // room dressing (built with the level, before the world is finalised)
  R2.decor = function (w, kind, c, rng) {
    const Pr = G.Props;
    if (kind === 'casino') { for (const dx of [-6, 6]) { Pr.table(w, c.x + dx, c.z + 2, 0, true, rng); Pr.candles(w, c.x + dx, 0.86, c.z + 2, rng, true); } Pr.rug(w, c.x, c.z, 0, 12, 7, [0.45, 0.08, 0.06]); for (let i = 0; i < 4; i++) Pr.barrel(w, 3 + i, 5, 0, rng); }
    if (kind === 'bank') { for (const dx of [-4, -2.6, 2.6, 4]) Pr.crate(w, c.x + dx, c.z + 2.5, 0, rng, 1.1); Pr.chest(w, c.x - 6, c.z - 1, 0, Math.PI / 2, 2).locked = true; Pr.chest(w, c.x + 6, c.z - 1, 0, -Math.PI / 2, 2).locked = true; }
    if (kind === 'auction') { Pr.table(w, c.x, c.z + 2.5, 0, true, rng); Pr.rug(w, c.x, c.z + 5, 0, 8, 5, [0.25, 0.1, 0.35]); for (const dx of [-5, 5]) Pr.statue(w, c.x + dx, c.z - 1, 0, 0, rng, 1); }
    if (kind === 'merc') { Pr.weaponRack(w, c.x - 4, c.z + 2, 0, true); Pr.weaponRack(w, c.x + 4, c.z + 2, 0, true); for (let i = 0; i < 3; i++) Pr.barrel(w, c.x + 7 + i * 0.9, c.z + 3, 0, rng); Pr.banner(w, 0, 8, c.z, 'px', 4, 0x404070); Pr.banner(w, w.W, 8, c.z, 'nx', 4, 0x404070); }
    if (kind === 'offering') { w.solid('trim', c.x - 3.5, 0, c.z - 3, c.x + 3.5, 0.3, c.z + 1, { uv: 2 }); for (const dx of [-5, 5]) Pr.statue(w, c.x + dx, c.z - 1.5, 0.0, 0, rng, 1.2); Pr.brazier(w, c.x - 2.4, 0.3, c.z + 0.3, 1); Pr.brazier(w, c.x + 2.4, 0.3, c.z + 0.3, 1); }
  };
  R2.setup = function (kind) {
    const w = G.world, sp = w.npcSpots;
    const c = sp[0];
    // the bank keeps its showcase chests shut
    for (const it of w.interactables) if (it.type === 'chest' && it.locked) it.opened = true;
    const T = R2.TYPES[kind];
    GM.objective = { icon: T.icon, text: () => `${T.name} — 話しかけろ（${G.K('interact')}）／ 準備ができたら門へ`, done: true };
    R2['setup_' + kind](c);
  };

  // ---------------- roadside merchant before a boss: talk to buy; mostly healing ----------------
  R2.setupRoadMerchant = function () {
    const w = G.world; if (!w.roadMerchant) return;
    const heal = U.shuffle(G.ITEMS.filter((x) => x.sub === 'heal' && x.id !== 'h_fairy')).slice(0, 4);
    const guard = U.shuffle(G.ITEMS.filter((x) => x.sub === 'guard')).slice(0, 1);
    const boost = U.shuffle(G.ITEMS.filter((x) => x.sub === 'boost')).slice(0, 1);
    const gren = U.shuffle(G.ITEMS.filter((x) => x.cat === 'grenade')).slice(0, 1);
    const stock = [...heal, ...guard, ...boost, ...gren].map((it) => ({ it, n: it.sub === 'heal' ? U.randi(2, 3) : 1, price: GM.price(it.price * 1.15) }));
    if (G.Run.revivesAllowed() && Math.random() < 0.08) stock.push({ revive: true, n: 1, price: Math.round(GM.revivePrice() * 1.15 / 10) * 10 });
    if (w.stoneVendor && !w._vendSign) { w._vendSign = true; const sp = w.stoneVendor.pos; G.Props.label(w, '🗿 交換石機', sp.x, sp.y + 2.6, sp.z, Math.PI / 2, 3.4, { color: '#d8ffd0' }); }
    let treated = false;
    // the ancient stone machine: drop coins in, wares roll out (no one tends it)
    const stoneNpc = (def, pos, ev) => w.interactables.push({ type: 'npc', ev, pos: w.stoneVendor.pos.clone(), model: null, used: false });
    (w.stoneVendor ? stoneNpc : npc)(G.ENEMY_BY_ID.shaman_normal, w.roadMerchant, {
      id: 'roadshop', npc: w.stoneVendor ? '古の交換石機' : '道端の薬売り', icon: w.stoneVendor ? '🗿' : '🧳', repeat: true,
      get text() { return w.stoneVendor ? `<i>……石の機械が低く唸る。硬貨を投じれば、品が転がり出てくるようだ。</i><br>所持 🪙${fmt(coins())}　HP ${Math.ceil(P.hp)}/${P.stats.maxHp}` : `「この先へ行くのかい？ 薬は多めに持っておきな」<br>所持 🪙${fmt(coins())}　HP ${Math.ceil(P.hp)}/${P.stats.maxHp}`; },
      opts: () => {
        const out = stock.filter((s) => s.n > 0).map((s) => {
          if (s.revive) return { icon: GM.REVIVE.icon, label: `${GM.REVIVE.name}（${fmt(s.price)}🪙）`, sub: GM.REVIVE.desc, disabled: coins() < s.price, run: () => { pay(s.price); s.n--; P.revives++; G.ui.toast('🪔 魂の灯火が一つ灯った', 'good'); return { reopen: true }; } };
          const S = null;
          const full = !P.canAddItem(s.it.id);
          return { icon: s.it.icon, label: `${s.it.name}（${fmt(s.price)}🪙）　残り${s.n}`, sub: `${s.it.passive ? '[常時] ' : s.it.cat === 'grenade' ? `[${G.K('grenade')}:投擲] ` : `[${G.K('item1')}/${G.K('item2')}:消耗品] `}${s.it.desc}　所持 ${s.it.cat === 'grenade' ? (P.grenades[s.it.id] || 0) : P.itemCount(s.it.id)}${full ? '（持ち物がいっぱい）' : ''}`, disabled: coins() < s.price || full, run: () => { pay(s.price); s.n--; P.addItem(s.it.id, 1); return { reopen: true }; } };
        });
        const tc = GM.price(60 + GM.area * 8);
        out.push({ icon: w.stoneVendor ? '✨' : '🩹', label: w.stoneVendor ? `癒しの光を浴びる（${fmt(tc)}🪙）` : `手当てを受ける（${fmt(tc)}🪙）`, sub: treated ? '一度だけ' : 'HPを40%回復（一度だけ）', disabled: treated || coins() < tc || P.hp >= P.stats.maxHp, run: () => { pay(tc); treated = true; C.heal(P.stats.maxHp * 0.4); G.sfx.heal(); return { reopen: true }; } });
        return out;
      },
    }, '#ffc080');
  };

  // ---------------- casino ----------------
  R2.setup_casino = function (c) {
    let lotsLeft = 2;
    npc(G.ENEMY_BY_ID.skeleton_bone, c, {
      id: 'casino', npc: '骨の胴元', icon: '🎰', repeat: true,
      get text() { return `「さぁ張った張った！ 深淵では運も実力のうちさ」<br>所持 🪙${fmt(coins())}`; },
      opts: () => {
        const bet = Math.max(100, Math.round(coins() * 0.25 / 10) * 10), lot = GM.price(500), slot = GM.price(150);
        return [
          { icon: '🎲', label: `倍か無か（${fmt(bet)}🪙）`, sub: '所持の25%を賭ける。47%で倍になる', disabled: coins() < bet, run: () => { pay(bet); if (Math.random() < 0.47) { gain(bet * 2, '倍!'); G.ui.toast(`🎲 当たり！ +${fmt(bet * 2)}`, 'good'); G.sfx.ui('rare'); } else { G.ui.toast('🎲 外れ…', 'warn'); G.sfx.ui('deny'); } return { reopen: true }; } },
          { icon: '📦', label: lotsLeft > 0 ? `宝箱くじ（${fmt(lot)}🪙） 残り${lotsLeft}回` : '宝箱くじ（売り切れ）', sub: lotsLeft > 0 ? '古びた55%・上等30%・装飾8%・ミミック7%' : 'この部屋の分は売り切れた', disabled: lotsLeft <= 0 || coins() < lot, run: () => {
            lotsLeft--;
            pay(lot);
            const r = Math.random();
            if (r < 0.07) {
              G.ui.toast('😱 ミミックだ！', 'warn');
              for (let i = 0; i < 2; i++) GM.spawnEnemy({ elite: true, near: true });
              return {};
            }
            const tier = r < 0.15 ? 2 : r < 0.45 ? 1 : 0;
            GM.spawnChestNear(tier);
            G.ui.toast(['📦 古びた宝箱', '💎 上等な宝箱', '👑 装飾された宝箱！'][tier], 'good');
            return { reopen: true };
          } },
          { icon: '🎰', label: `スロット（${fmt(slot)}🪙）`, sub: '2倍25%・5倍10%・15倍4%・大当たり50倍1%', disabled: coins() < slot, run: () => {
            pay(slot); const r = Math.random(); const sym = ['🍒', '💎', '💀', '👑', '🔔'];
            let mul = 0; if (r < 0.01) mul = 50; else if (r < 0.05) mul = 15; else if (r < 0.15) mul = 5; else if (r < 0.4) mul = 2;
            const face = mul === 50 ? '👑👑👑' : mul === 15 ? '💎💎💎' : mul === 5 ? '🔔🔔🔔' : mul === 2 ? '🍒🍒' + U.pick(sym) : U.pick(sym) + U.pick(sym) + U.pick(sym);
            if (mul) { gain(slot * mul, 'スロット'); G.ui.toast(`🎰 ${face} ×${mul}！ +${fmt(slot * mul)}`, 'good'); if (mul >= 15) G.sfx.ui('rare'); } else G.ui.toast(`🎰 ${face} はずれ`, 'warn');
            return { reopen: true };
          } },
        ];
      },
    }, '#ffc060');
  };

  // ---------------- bank ----------------
  R2.setup_bank = function (c) {
    npc(G.ENEMY_BY_ID.shaman_normal, c, {
      id: 'bank', npc: '深淵銀行の番人', icon: '🏦', repeat: true,
      get text() { return `「預ければエリアをクリアするたびに8%の利息を付けてやろう。引き出しは銀行でのみ」<br>預金 🏦${fmt(GM.run.bank || 0)}　所持 🪙${fmt(coins())}`; },
      opts: () => [
        { icon: '📥', label: '全額預ける', sub: `🪙${fmt(coins())} を預金`, disabled: coins() < 1, run: () => { GM.run.bank = (GM.run.bank || 0) + coins(); GM.run.coins = 0; G.sfx.coins(5); return { reopen: true }; } },
        { icon: '📥', label: '半分預ける', sub: `🪙${fmt(Math.floor(coins() / 2))} を預金`, disabled: coins() < 2, run: () => { const v = Math.floor(coins() / 2); GM.run.bank = (GM.run.bank || 0) + v; GM.run.coins -= v; G.sfx.coins(3); return { reopen: true }; } },
        { icon: '📤', label: '全額引き出す', sub: `🏦${fmt(GM.run.bank || 0)} を受け取る`, disabled: !(GM.run.bank > 0), run: () => { gain(GM.run.bank, '払い戻し'); GM.run.bank = 0; return { reopen: true }; } },
      ],
    }, '#80e0c0');
  };
  R2.onAreaClear = function () {
    if (GM.run.bank > 0) { const it = Math.round(GM.run.bank * 0.08); GM.run.bank += it; G.ui.feed(`🏦 利息 +${fmt(it)}（預金 ${fmt(GM.run.bank)}）`); }
    if (GM.run.merc && GM.run.merc.left > 0) { GM.run.merc.left--; if (GM.run.merc.left <= 0) { const m = GM.run.merc; rosterSave(m); G.ui.toast(`🛡️ 傭兵の契約が満了した（Lv${m.lv} は名簿に残る）`, 'warn'); GM.run.merc = null; } }
  };

  // ---------------- auction ----------------
  function lotPool() {
    const pool = [];
    for (const w of G.WEAPONS) if (w.mythic && !P.weapons.some((pw) => pw.id === w.id)) pool.push({ kind: 'weapon', obj: w, value: w.price });
    for (const m of G.MELEE) if (m.mythic && P.melee.id !== m.id) pool.push({ kind: 'melee', obj: m, value: m.price });
    for (const b of G.BUFFS) if (b.cat === 'relic' && !P.has(b.id)) pool.push({ kind: 'relic', obj: b, value: b.price });
    for (const b of G.BUFFS) if (b.rarity === 'legendary' && !b.relic && !b.pact && b.cat !== 'curse' && (P.buffs.get(b.id) || 0) < b.max) pool.push({ kind: 'buff', obj: b, value: 2600 });
    return pool;
  }
  R2.setup_auction = function (c) {
    const ar = new G.RNG((GM.seed ^ U.hashStr('auction' + GM.area)) >>> 0);
    const lots = U.shuffle(lotPool(), () => ar.next()).slice(0, 3).map((l) => Object.assign(l, { price: Math.round(GM.price(l.value) * 0.55 / 10) * 10, rival: GM.price(l.value) * (0.85 + ar.next() * 0.6), sold: false, mine: false }));
    R2.lots = lots;
    npc(G.ENEMY_BY_ID.shaman_normal, c, {
      id: 'auction', npc: '仮面の競売人', icon: '🔨', repeat: true,
      get text() { return `「さぁ本日の目玉だ。競り相手は手強いぞ…」<br>所持 🪙${fmt(coins())}`; },
      opts: () => lots.filter((l) => !l.sold).map((l) => {
        const bid = Math.round(l.price * 1.15 / 10) * 10;
        return { icon: l.obj.icon, label: `${l.obj.name}　入札 ${fmt(bid)}🪙`, sub: `${l.kind === 'relic' ? '🏺 遺物' : l.kind === 'buff' ? '🌟 伝説の加護' : '✴️ 神器'} · 現在値 ${fmt(l.price)}　— ${U.esc(l.obj.desc || '')}`, disabled: coins() < bid || (l.kind === 'relic' && GM.relicCount() >= 3), run: () => {
          if (bid > l.rival || Math.random() < 0.18) {
            pay(bid); l.sold = true; G.ui.toast(`🔨 落札！ ${l.obj.icon} ${l.obj.name}`, 'good'); G.sfx.ui('rare'); G.sfx.bell();
            // a 4th relic: close the auction and ask which one to give up
            if (l.kind === 'relic' && GM.relicCount() >= 3) { setTimeout(() => GM.relicSwap(l.obj, { cancelLabel: '手放さない（落札品は破棄）' }), 120); return { reopen: false }; }
            R2.grant(l);
            return { reopen: lots.some((x) => !x.sold) };
          }
          l.price = Math.round(Math.min(l.rival, bid * U.rand(1.08, 1.22)) / 10) * 10;
          G.ui.toast(`🎭 競り相手が ${fmt(l.price)}🪙 で応札した`, 'warn');
          return { reopen: true };
        } };
      }),
    }, '#d0a0ff');
  };
  R2.grant = function (l) {
    if (l.kind === 'weapon') GM.giveWeapon(l.obj.id);
    else if (l.kind === 'melee') { G.Pawn.tradeIn(P.melee, true); P.melee = G.weapons.makeMelee(l.obj.id); if (P.meleeMode) G.weapons.melee.equip(false); G.ui.itemCard(l.obj, `[近接:${G.K('w3')}]`); G.ui.refreshWeapon(); }
    else { P.addBuff(l.obj.id); G.ui.itemCard(l.obj, l.kind === 'relic' ? '[遺物]' : '[加護]'); }
  };

  // ---------------- mercenaries ----------------
  const MERCS = {
    sword: { name: '傭兵剣士', icon: '🗡️', def: 'brute_normal', base: 1400, role: '前衛', hp: 420, dmg: 45, cd: 0.8, range: 1.4, ranged: false, desc: '敵に斬り込む前衛。' },
    bow: { name: '傭兵弓兵', icon: '🏹', def: 'skeleton_bone', base: 1700, role: '後衛', hp: 260, dmg: 36, cd: 1.1, range: 16, ranged: true, desc: '後方から矢を射る。' },
    shield: { name: '傭兵盾兵', icon: '🛡️', def: 'skeleton_elder', base: 1600, role: '壁役', hp: 780, dmg: 28, cd: 1.0, range: 1.4, ranged: false, reduce: 0.3, taunt: 14, desc: '被ダメージ−30%。14m以内の敵はあなたより盾兵を優先して狙う。' },
    mage: { name: '傭兵魔術師', icon: '🔮', def: 'shaman_normal', base: 2000, role: '後衛', hp: 220, dmg: 30, cd: 1.6, range: 18, ranged: true, splash: 3.5, desc: '着弾点の半径3.5mに範囲ダメージ（外側は半分）。体力が低い。' },
    medic: { name: '傭兵衛生兵', icon: '➕', def: 'skeleton_crystal', base: 1800, role: '支援', hp: 300, dmg: 14, cd: 1.4, range: 10, ranged: true, heal: 0.06, healCd: 4, desc: '4秒ごとにあなたの最大体力の6%を回復（体力90%以下のとき）。攻撃は弱い。' },
  };
  R2.MERCS = MERCS;
  // contract / growth / down rules (see mercStats and spawnMerc)
  const MERC = { cap: 10, term: 8, ext: 4, grow: 1.25, downMax: 4, downT: 10, lock: 0.25 };
  R2.MERC = MERC;
  const mercNeed = (lv) => 6 + 4 * (lv - 1);
  R2.mercNeed = mercNeed;
  // everything a mercenary is worth right now: full HP, the HP cap after this area's downs, damage, dps
  R2.mercStats = function (m) {
    const d = MERCS[m.type], gr = Math.pow(MERC.grow, m.lv - 1), downs = Math.min(MERC.downMax, m.downs || 0);
    const full = Math.round(d.hp * gr * (1 + (GM.area || 1) * 0.04));
    const cap = downs >= MERC.downMax ? 0 : Math.round(full * (1 - MERC.lock * downs));
    const dmg = d.dmg * gr;
    return { d, full, cap, downs, dmg, cd: d.cd, range: d.range, dps: dmg / d.cd, healPct: d.heal ? d.heal * (1 + (m.lv - 1) * 0.1) : 0 };
  };
  // the roster keeps each type's Lv / XP for the rest of the run, so a lapsed contract is not a lost investment
  function rosterSave(m) { if (!m) return; const r = GM.run.mercRoster || (GM.run.mercRoster = {}); r[m.type] = { lv: m.lv, xp: m.xp || 0 }; }
  // set the Lv (training, XP) and let a living mercenary's HP follow the new maximum
  function mercSetLv(m, lv) {
    const a = R2.mercAlly, c0 = a ? R2.mercStats(m).cap : 0;
    m.lv = lv;
    if (a && !a.dead && a.down <= 0) a.hp += R2.mercStats(m).cap - c0;
  }
  R2.mercXp = function (n) {
    const m = GM.run.merc; if (!m || m.left <= 0 || m.lv >= MERC.cap) return;
    m.xp = (m.xp || 0) + n; let up = 0;
    while (m.lv < MERC.cap && m.xp >= mercNeed(m.lv)) { m.xp -= mercNeed(m.lv); mercSetLv(m, m.lv + 1); up++; }
    if (m.lv >= MERC.cap) m.xp = 0;
    rosterSave(m);
    if (up) {
      const d = MERCS[m.type], a = R2.mercAlly;
      G.ui.toast(`${d.icon} ${d.name}が Lv${m.lv} に上がった`, 'good');
      if (a && !a.dead) { G.fx.ring(a.ent.pos.clone().setY(a.ent.pos.y + 0.1), 2.2, 0xffe090, 0.5); G.fx.sparks(a.ent.pos.clone().add(V(0, 1.4, 0)), null, 14, 0xffe090, 4); }
      G.sfx.ui && G.sfx.ui('select');
    }
  };
  // XP for every kill, yours or the mercenary's (a downed one still gains it); boss adds and clear sweeps give none
  R2.mercKill = function (e) { if (!GM.run || !GM.run.merc || e.noReward || e.bossSpawn) return; R2.mercXp(e.boss ? 20 : e.elite ? 5 : 1); };
  // Tab screen: the hover card (also usable by anything else that wants the numbers)
  R2.mercTip = function () {
    const m = GM.run && GM.run.merc; if (!m || m.left <= 0) return '';
    const s = R2.mercStats(m), d = s.d, a = R2.mercAlly, hp = a ? a.hp : s.cap, need = m.lv >= MERC.cap ? 0 : mercNeed(m.lv);
    const row = (k, v) => `<div class="ivt-r">${k}　<b>${v}</b></div>`;
    const lockTxt = s.downs >= MERC.downMax ? '<b style="color:#ff9090">戦闘不能（このエリアでは復帰しない）</b>' : s.downs ? `${s.downs}/${MERC.downMax}回　最大体力 ${100 - MERC.lock * 100 * s.downs}%（このエリアのみ）` : 'なし（4ダウンで復帰不可）';
    const sp = [d.reduce ? `被ダメージ −${d.reduce * 100}%` : '', d.taunt ? `${d.taunt}m以内の敵を引きつける` : '', d.splash ? `範囲 半径${d.splash}m（外側は半分）` : '', d.heal ? `${d.healCd}秒ごとに最大体力の${(s.healPct * 100).toFixed(1)}%を回復` : ''].filter(Boolean);
    return `<div class="ivt-h">${d.icon} ${U.esc(d.name)} <b style="color:#ffd890">Lv${m.lv}</b></div><div class="ivt-s">${d.role}・契約 残り${m.left}エリア</div>`
      + row('経験値', need ? `${m.xp || 0} / ${need}` : 'MAX')
      + row('体力', `${Math.ceil(hp)} / ${s.cap}（最大 ${s.full}）`)
      + row('攻撃力', `${Math.round(s.dmg)}${d.splash ? '（範囲）' : ''}`)
      + row('攻撃間隔', `${s.cd.toFixed(1)}秒`)
      + row('DPS', Math.round(s.dps))
      + row('射程', d.range <= 2 ? '近接' : `${d.range}m`)
      + (sp.length ? `<div class="ivt-fx">✦ ${sp.join('／')}</div>` : '')
      + `<div class="ivt-v">ダウン: ${lockTxt}</div>`
      + `<div class="ivt-s" style="margin-top:0.3em">敵を倒すと経験値（通常1・精鋭5・守護者20）。詰所でコインでも鍛えられる。</div>`;
  };
  R2.setup_merc = function (c) {
    npc(G.ENEMY_BY_ID.brute_normal, c, {
      id: 'merc', npc: '傭兵隊長', icon: '🛡️', repeat: true,
      get text() { const m = GM.run.merc; return `「腕は確かだ。契約は${MERC.term}エリア分。倒れても起き上がるが、金は前払いだ。腕前は名簿に残る」<br>${m ? `現在の契約: ${MERCS[m.type].icon} ${MERCS[m.type].name} Lv${m.lv}（残り${m.left}エリア）` : '現在の契約: なし'}`; },
      opts: () => {
        const m = GM.run.merc, ros = GM.run.mercRoster || {};
        const out = Object.entries(MERCS).map(([k, d]) => {
          const pr = GM.price(d.base), rs = ros[k], same = m && m.type === k;
          return { icon: d.icon, label: `${d.name}を雇う（${fmt(pr)}🪙）`, sub: `${d.desc} ${rs ? `名簿 Lv${rs.lv} から再開` : 'Lv1'}・${MERC.term}エリア契約${m && !same ? '（今の契約は解除）' : ''}`, disabled: coins() < pr || same, run: () => { pay(pr); if (m) rosterSave(m); const r2 = ros[k]; GM.run.merc = { type: k, lv: r2 ? r2.lv : 1, xp: r2 ? r2.xp : 0, left: MERC.term, downs: 0, dArea: 0 }; R2.spawnMerc(); G.ui.toast(`${d.icon} ${d.name}と契約した`, 'good'); return { reopen: true }; } };
        });
        if (m) {
          const up = GM.price(900 * Math.pow(1.35, m.lv)), ext = GM.price(MERCS[m.type].base * 0.6), cap = m.lv >= MERC.cap;
          out.push({ icon: '⬆️', label: cap ? `鍛える（Lv${MERC.cap} が上限）` : `鍛える Lv${m.lv}→${m.lv + 1}（${fmt(up)}🪙）`, sub: `火力・体力×${MERC.grow}　経験値 ${m.xp || 0}/${cap ? '—' : mercNeed(m.lv)}`, disabled: cap || coins() < up, run: () => { pay(up); mercSetLv(m, m.lv + 1); if (m.lv >= MERC.cap) m.xp = 0; rosterSave(m); return { reopen: true }; } });
          out.push({ icon: '📜', label: `契約延長 +${MERC.ext}エリア（${fmt(ext)}🪙）`, sub: `残り${m.left} → ${m.left + MERC.ext}`, disabled: coins() < ext, run: () => { pay(ext); m.left += MERC.ext; return { reopen: true }; } });
        }
        return out;
      },
    }, '#c0c0e0');
  };
  // ally readability: cyan outline, an x-ray silhouette through walls, a name/Lv/HP tag, a ground ring,
  // and a screen-edge pointer while off-screen
  const ALLY_COL = 0x50d8ff;
  function allyFx(mdl, d, m) {
    const outline = new THREE.MeshBasicMaterial({ color: ALLY_COL, side: THREE.BackSide, transparent: true, opacity: 0.95, depthWrite: false });
    // silhouette through walls: only switched on while a wall blocks your line of sight to the mercenary
    const xray = new THREE.MeshBasicMaterial({ color: ALLY_COL, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    let losT = 0, hidden = false, xk = 0;
    const extra = [];
    mdl.group.traverse((o) => {
      if (!o.isMesh || o.userData.allyFx) return;
      extra.push(o);
    });
    for (const o of extra) {
      const h = new THREE.Mesh(o.geometry, outline); h.scale.setScalar(1.14); h.userData.allyFx = true; h.castShadow = false; o.add(h);
      const x = new THREE.Mesh(o.geometry, xray); x.userData.allyFx = true; x.renderOrder = 4; x.castShadow = false; o.add(x);
    }
    const tagC = document.createElement('canvas'); tagC.width = 320; tagC.height = 96;
    const tagT = new THREE.CanvasTexture(tagC); tagT.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagT, transparent: true, depthTest: false, depthWrite: false })); tag.scale.set(2.0, 0.6, 1); tag.renderOrder = 8; G.scene.add(tag);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 32), new THREE.MeshBasicMaterial({ color: ALLY_COL, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; G.scene.add(ring);
    let last = '', host = null, el = null;
    const draw = (hpK, down, downT, downs) => {
      const key = `${m.lv}|${Math.round(hpK * 40)}|${down ? (downT === Infinity ? 'x' : Math.ceil(downT)) : -1}|${downs}`;
      if (key === last) return; last = key;
      const g = tagC.getContext('2d'); g.clearRect(0, 0, 320, 96);
      g.font = '900 30px "Noto Sans JP","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.9)';
      const txt = `${d.icon} 味方 ${d.name} Lv${m.lv}`;
      g.fillStyle = '#9fe8ff'; (G.Icons ? G.Icons.fillText : (g2, t2, x2, y2, o2) => { if (o2 && o2.stroke) g2.strokeText(t2, x2, y2); g2.fillText(t2, x2, y2); })(g, txt, 160, 28, { stroke: true });
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(40, 58, 240, 20);
      g.fillStyle = down ? '#666' : hpK > 0.5 ? '#5fe07a' : hpK > 0.25 ? '#ffd050' : '#ff5050'; g.fillRect(43, 61, 234 * Math.max(0, hpK), 14);
      if (downs) { // the part of the bar that this area's downs have locked away
        const lw = 234 * MERC.lock * downs; g.fillStyle = '#3a3a40'; g.fillRect(43 + 234 - lw, 61, lw, 14);
        g.strokeStyle = '#7a7a84'; g.lineWidth = 2; g.beginPath(); for (let x = 43 + 234 - lw; x < 277; x += 8) { g.moveTo(x, 75); g.lineTo(Math.min(277, x + 14), 61); } g.stroke();
      }
      g.strokeStyle = '#9fe8ff'; g.lineWidth = 2; g.strokeRect(40, 58, 240, 20);
      if (down) { g.font = '900 18px "Noto Sans JP",sans-serif'; g.fillStyle = '#ffd0d0'; g.lineWidth = 4; g.strokeStyle = '#000'; const dt2 = downT === Infinity ? '戦闘不能' : `ダウン ${Math.ceil(downT)}秒`; g.strokeText(dt2, 160, 69); g.fillText(dt2, 160, 69); }
      tagT.needsUpdate = true;
    };
    return {
      update(dt, a) {
        const p = a.ent.pos, t = G.game.time;
        tag.position.set(p.x, p.y + (a.down > 0 ? 1.4 : 2.9), p.z);
        ring.position.set(p.x, p.y + 0.05, p.z); ring.rotation.z += dt * 1.2; ring.scale.setScalar(1 + 0.08 * Math.sin(t * 3));
        outline.opacity = 0.75 + 0.2 * Math.sin(t * 3);
        losT -= dt; if (losT <= 0) { losT = 0.2; hidden = !G.world.los(G.camera.position, p.clone().setY(p.y + 1.2)); }
        xk = U.damp(xk, hidden ? 1 : 0, 8, dt); xray.opacity = 0.32 * xk; xray.visible = xk > 0.01;
        { const inf = a.info(); draw(a.hp / Math.max(1, inf.maxHp), a.down > 0, a.down, inf.downs); }
        // off-screen pointer
        if (!host) { host = document.getElementById('ally-markers'); if (!host) { host = document.createElement('div'); host.id = 'ally-markers'; G.ui.el.hud.appendChild(host); } el = document.createElement('div'); el.className = 'am'; host.appendChild(el); }
        const v = p.clone().setY(p.y + 1.6).project(G.camera), Wd = window.innerWidth, Hd = window.innerHeight;
        let x = (v.x * 0.5 + 0.5) * Wd, y = (-v.y * 0.5 + 0.5) * Hd; const behind = v.z > 1;
        const off = behind || x < 30 || x > Wd - 30 || y < 60 || y > Hd - 60;
        if (!off) { el.style.display = 'none'; return; }
        if (behind) { x = Wd - x; y = Hd - 80; }
        el.style.display = ''; el.style.transform = `translate(${U.clamp(x, 40, Wd - 40)}px, ${U.clamp(y, 70, Hd - 70)}px)`;
        const html = `<span>${d.icon}</span><b>${Math.round(Math.hypot(P.pos.x - p.x, P.pos.z - p.z))}m</b>`;
        if (el._h !== html) { el.innerHTML = html; el._h = html; }
      },
      dispose() { G.scene.remove(tag); G.scene.remove(ring); tagT.dispose(); if (el) el.remove(); },
    };
  }
  // the guardian's gate falls shut behind you (and the last field's entrance ledge is sealed): a mercenary left on the far side is brought in next to you
  R2.mercFetch = function (a) {
    const w = G.world; if (!a || !w || GM.stage !== 'boss' || !GM.bossEngaged || P.dead) return;
    const lim = w.ledgeZ ? w.ledgeZ - 1 : w.arenaD ? w.arenaD - 2 : Infinity, e = a.ent;
    if (e.pos.z < lim) return;
    e.pos.set(P.pos.x + 1.5, P.pos.y, P.pos.z - 1.5);
    const gy = w.groundAt(V(e.pos.x, P.pos.y + 0.8, e.pos.z), 0.2, 12);
    if (gy > -Infinity) e.pos.y = gy; else e.pos.set(P.pos.x, P.pos.y, P.pos.z);
    G.fx.smoke(e.pos, 6, 1, 0x8080a0, 1, 1);
  };
  // spawned at the start of each area while the contract lasts
  R2.spawnMerc = function () {
    const m = GM.run.merc; if (!m || m.left <= 0 || !G.world) return;
    if (R2.mercAlly) { R2.mercAlly.dead = true; R2.mercAlly = null; }
    const d = MERCS[m.type], def = G.ENEMY_BY_ID[d.def] || G.ENEMIES[0];
    const mdl = G.enemies.buildModel(def, { ally: true });
    const pos = P.pos.clone().add(V(1.5, 0, 1.5));
    mdl.group.position.copy(pos); G.scene.add(mdl.group);
    const ent = { pos: pos.clone(), vel: V(), yaw: 0, radius: 0.5, height: 2, def, cd: 0, walk: 0, atk: 0 };
    // the down penalty lasts for one area only: a new area starts with a clean slate
    if (m.dArea !== GM.area) { m.dArea = GM.area; m.downs = 0; }
    const dmg = () => R2.mercStats(m).dmg;
    const maxHp = () => R2.mercStats(m).cap; // the HP that is not locked by this area's downs
    // one blow, per type (melee: sword / shield; arrow: bow; instant arcane bolt with a splash: mage; weak green bolt: medic)
    function strike(tgt) {
      const from = ent.pos.clone().add(V(0, 1.6, 0));
      if (d.splash || d.heal) {
        const to = tgt.centerPos(), col = d.heal ? 0x70ff90 : 0xb080ff;
        G.fx.lightning(from, to, col);
        C.damageEnemy(tgt, dmg(), { src: 'ally', noMarker: true, pos: to });
        if (d.splash) {
          G.fx.ring(tgt.pos.clone().setY(tgt.pos.y + 0.1), d.splash, col, 0.35);
          for (const o of G.enemies.list) if (o !== tgt && o.alive && !o.ally && Math.hypot(o.pos.x - tgt.pos.x, o.pos.z - tgt.pos.z) < d.splash && Math.abs(o.pos.y - tgt.pos.y) < 3) C.damageEnemy(o, dmg() * 0.5, { src: 'ally', noMarker: true, pos: o.centerPos() });
        }
      } else if (d.ranged) { const dir = tgt.centerPos().sub(from).normalize(); C.spawnProjectile({ kind: 'arrow', pos: from.clone().addScaledVector(dir, 0.6), vel: dir.multiplyScalar(60), grav: 2, owner: 'player', dmg: dmg(), radius: 0.12, info: { src: 'ally', noMarker: true } }); }
      else { C.damageEnemy(tgt, dmg(), { src: 'ally', noMarker: true, pos: tgt.centerPos() }); G.sfx.melee(true); }
    }
    let healT = d.healCd || 0;
    G.fx.smoke(pos, 8, 1, 0x8080a0, 1, 1);
    // ---- the stacked-storey fields (halls / ruin): walk the nav like any foe does, never straight through slabs, bars or over the lava ----
    const dirv = { x: 0, z: 0 };
    let tgt = null, seekT = 0, fT = 0, fGoal = null, lostT = 0, farT = 0, skip = new Map();
    const here = () => { const w = G.world, i = w.navIdx(ent.pos.x, ent.pos.z, ent.pos.y); return i >= 0 && w.ndistM ? w.ndistM[i] : Infinity; }; // steps left to the goal along the walkable route
    const eyeP = () => V(ent.pos.x, ent.pos.y + 1.5, ent.pos.z);
    function pickTarget() {
      let best = null, bs = Infinity;
      for (const e of G.enemies.list) {
        if (!e.alive || e.ally || e.burrowed || e.untargetable || e.custom) continue;
        if ((skip.get(e) || 0) > G.game.time) continue;
        const dx = e.pos.x - ent.pos.x, dz = e.pos.z - ent.pos.z, dy = Math.abs(e.pos.y - ent.pos.y), dd = Math.hypot(dx, dz);
        if (dd > 36) continue;
        const sc = dd + (dy > 3 ? 20 + dy * 2 : 0) + (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > 28 ? 40 : 0); // enemies on another storey and ones far from you come last
        if (sc < bs) { bs = sc; best = e; }
      }
      return best;
    }
    function stratMove(a, dt, reach) {
      const w = G.world;
      seekT -= dt; fT -= dt;
      if (!tgt || !tgt.alive || seekT <= 0) { seekT = 0.5; tgt = pickTarget(); fT = 0; }
      let moving = false;
      const goal = tgt ? tgt.pos : P.pos;
      // the gates of the cells: a shut one in the way is simply opened
      for (const dr of G.Strata.doors) if (dr.state === 'closed' && Math.abs(ent.pos.y - dr.y) < 2 && Math.abs(ent.pos.x - dr.plane) < 1.7 && ent.pos.z > dr.lo - 0.8 && ent.pos.z < dr.hi + 0.8) G.Strata.openDoor(dr);
      if (tgt) {
        const dx = tgt.pos.x - ent.pos.x, dz = tgt.pos.z - ent.pos.z, l = Math.hypot(dx, dz), dy = Math.abs(tgt.pos.y - ent.pos.y);
        ent.yaw = Math.atan2(dx, dz);
        const seen = w.los(eyeP(), tgt.centerPos());
        const inRange = d.ranged ? (l < reach && seen) : (l < tgt.radius + reach && dy < 2.5 && !w.barsBetween(ent.pos, tgt.pos));
        if (inRange) {
          if (ent.cd <= 0) { ent.cd = d.cd; ent.atk = 0.4; strike(tgt); }
          return false;
        }
        if (fT <= 0 || fGoal !== tgt) { fT = 0.35; fGoal = tgt; if (!w.walkField(goal.x, goal.z, goal.y, ent.pos.x, ent.pos.z, ent.pos.y) || here() > 75) { skip.set(tgt, G.game.time + 4); tgt = null; seekT = 0.2; fGoal = null; return false; } } // unreachable, or a long way round (another storey): pick another foe
        moving = stepAlong(dt, 6);
        if (!moving) { lostT += dt; if (lostT > 2) { skip.set(tgt, G.game.time + 3); tgt = null; seekT = 0.2; lostT = 0; } } else lostT = 0;
        return moving;
      }
      // nobody to fight: stay with you
      const dx = P.pos.x - ent.pos.x, dz = P.pos.z - ent.pos.z, l = Math.hypot(dx, dz), dy = Math.abs(P.pos.y - ent.pos.y);
      if (l > 4 || dy > 3) {
        if (fT <= 0 || fGoal !== 'p') { fT = 0.35; fGoal = 'p'; if (!w.walkField(P.pos.x, P.pos.z, P.pos.y, ent.pos.x, ent.pos.z, ent.pos.y)) lostT += 0.35; }
        farT = here() > 75 ? farT + dt : 0; // a long way round (the stairs of three storeys): after a moment it simply catches up
        moving = stepAlong(dt, 7);
        if (moving) ent.yaw = Math.atan2(dirv.x, dirv.z);
        if (!moving && l > 6) lostT += dt; else if (moving) lostT = Math.max(0, lostT - dt);
      }
      if (l > 40 || lostT > 4 || farT > 2.5 || (dy > 12 && l < 14 && lostT > 1.5)) { // cut off from you: catch up
        lostT = 0; farT = 0; ent.pos.set(P.pos.x + 1.5, P.pos.y, P.pos.z + 1.5); const gy = w.groundAt(V(ent.pos.x, P.pos.y + 0.8, ent.pos.z), 0.2, 12); ent.pos.y = gy > -Infinity ? gy : P.pos.y;
        G.fx.smoke(ent.pos, 6, 1, 0x8080a0, 1, 1);
      }
      return moving;
    }
    function stepAlong(dt, speed) {
      const w = G.world;
      if (!w.flowDir(ent.pos.x, ent.pos.z, dirv, ent.pos.y, w.ndistM)) return false;
      if (!w.walkerSafe(ent.pos, ent.pos.x + dirv.x * (speed * dt + 0.5), ent.pos.z + dirv.z * (speed * dt + 0.5))) return false; // never over the lava or off a slab edge
      G.enemies.groundMove(ent, dirv.x, dirv.z, speed, dt);
      return true;
    }
    const ally = R2.mercAlly = C.addAlly({
      t: 1e9, ent, hp: maxHp(), down: 0, lastHurt: -10,
      taunt: d.taunt || 0,
      info() { const s = R2.mercStats(m); return { merc: true, icon: d.icon, name: d.name, lv: m.lv, hp: this.hp, maxHp: s.full, cap: s.cap, downs: s.downs, down: this.down, left: m.left, xp: m.xp || 0, need: m.lv >= MERC.cap ? 0 : mercNeed(m.lv) }; },
      targetable() { return this.down <= 0; },
      hurt(v) {
        if (this.down > 0) return;
        if (d.reduce) v *= 1 - d.reduce;
        this.hp -= v; this.lastHurt = G.game.time; G.fx.sparks(ent.pos.clone().add(V(0, 1.2, 0)), null, 4, 0xff3030, 2);
        if (this.hp <= 0) {
          this.hp = 0; m.downs = (m.downs || 0) + 1; G.fx.smoke(ent.pos, 6, 1, 0x606070, 1, 1);
          if (m.downs >= MERC.downMax) { this.down = Infinity; G.ui.toast(`${d.icon} ${d.name}は戦闘不能になった（このエリアでは復帰しない）`, 'bad'); }
          else { this.down = MERC.downT; G.ui.toast(`${d.icon} ${d.name}がダウンした（${MERC.downT}秒後に復帰・最大体力 ${Math.round(100 - MERC.lock * 100 * m.downs)}%）`, 'warn'); }
        }
      },
      update(dt) {
        // stay on the floor: fall when standing on nothing (after a teleport / a ledge / a lowered floor), also while idle or downed
        { const gy = G.world.groundAt(V(ent.pos.x, ent.pos.y + 0.8, ent.pos.z), 0.2, 10); if (gy > -Infinity) ent.pos.y = ent.pos.y > gy + 0.05 ? Math.max(gy, ent.pos.y - 24 * dt) : gy; }
        // downed: lies still for a fixed 10 s and gets back up with half of the (locked-down) maximum; the 4th down lasts the whole area
        if (this.down > 0) {
          this.down -= dt;
          mdl.group.position.copy(ent.pos); mdl.group.rotation.set(-1.35, ent.yaw, 0);
          if (this.down <= 0) { this.hp = maxHp() * 0.5; mdl.group.rotation.set(0, ent.yaw, 0); G.fx.ring(ent.pos.clone(), 1.5, 0xc0c0ff, 0.4); G.ui.toastSmall(`${d.icon} ${d.name}が復帰した`); }
          return;
        }
        if (this.hp > maxHp()) this.hp = maxHp();
        if (G.game.time - this.lastHurt > 5) this.hp = Math.min(maxHp(), this.hp + maxHp() * 0.04 * dt);
        // the medic's pulse: a slice of your max HP every few seconds while you are hurt
        if (d.heal) {
          healT -= dt;
          if (healT <= 0) {
            healT = d.healCd;
            if (!P.dead && P.hp < P.stats.maxHp * 0.9 && Math.hypot(P.pos.x - ent.pos.x, P.pos.z - ent.pos.z) < 25) {
              C.heal(P.stats.maxHp * R2.mercStats(m).healPct, true);
              G.fx.ring(P.pos.clone().setY(P.pos.y + 0.1), 1.6, 0x70ff90, 0.4); G.fx.sparks(P.chestPos(), null, 8, 0x80ff9a, 3);
              G.ui.feed(`➕ ${d.name}があなたを回復`);
            }
          }
        }
        ent.cd -= dt;
        let moving = false;
        const reach = d.range;
        if (G.world.navLayers > 1) moving = stratMove(this, dt, reach);
        else {
        const e = G.enemies.nearest(ent.pos, 40);
        if (e && !e.ally) {
          const to = e.pos.clone().sub(ent.pos); to.y = 0; const l = to.length();
          ent.yaw = Math.atan2(to.x, to.z);
          if (l > e.radius + reach) { G.enemies.groundMove(ent, to.x / l, to.z / l, 6, dt); moving = true; }
          else if (ent.cd <= 0) { ent.cd = d.cd; ent.atk = 0.4; strike(e); }
        } else {
          const to = P.pos.clone().sub(ent.pos); to.y = 0; const l = to.length();
          if (l > 4) { G.enemies.groundMove(ent, to.x / l, to.z / l, 7, dt); moving = true; ent.yaw = Math.atan2(to.x, to.z); }
          if (l > 30) { ent.pos.copy(P.pos).add(V(1.5, 0, 1.5)); ent.pos.y = G.world.groundAt(V(ent.pos.x, P.pos.y + 0.8, ent.pos.z), 0.2, 12) > -Infinity ? G.world.groundAt(V(ent.pos.x, P.pos.y + 0.8, ent.pos.z), 0.2, 12) : P.pos.y; }
        }
        }
        ent.atk = Math.max(0, ent.atk - dt); ent.walk += moving ? dt * 9 : 0;
        mdl.group.position.copy(ent.pos); mdl.group.rotation.y = ent.yaw;
        mdl.animate({ walk: ent.walk, moving, atk: ent.atk > 0 ? 1 - ent.atk / 0.4 : 0, t: G.game.time, flinch: 0, state: 'chase' });
      },
      remove() { G.scene.remove(mdl.group); },
    });
    const fx = allyFx(mdl, d, m);
    const u0 = ally.update, r0 = ally.remove;
    ally.update = function (dt) { u0.call(this, dt); R2.mercFetch(this); fx.update(dt, this); };
    ally.remove = function () { r0.call(this); fx.dispose(); };
    return ally;
  };

  // the altar's skill sub-menu: Lv+1 for coins, 1.5x the forge price per skill, rising with every offering made here
  R2.skillOffering = function (back) {
    const k = Math.pow(1.5, R2.offerN || 0), list = GM.tomeTargets();
    const out = list.map((x) => {
      const cost = Math.round(GM.price(1500 * Math.pow(1.25, x.lv)) * k / 10) * 10;
      const d = x.pile ? { icon: '🔨', name: 'パイルドライバー', key: G.input.keyName('crouch') } : { icon: x.s.def.icon, name: x.s.def.name, key: G.input.skillKey(x.i) };
      return { icon: d.icon, label: `[${d.key}]${!x.pile && x.s.def.ult ? '（ULT）' : ''} ${d.name} Lv${x.lv} → Lv${x.lv + 1}（${fmt(cost)}🪙）`, disabled: coins() < cost, onPick: () => {
        pay(cost); R2.offerN = (R2.offerN || 0) + 1; G.fx.ring(P.pos.clone(), 3, 0xffd070, 0.6); G.sfx.bell();
        if (x.pile) P.pileTome = (P.pileTome || 0) + 1; else { x.s.lv = x.lv + 1; x.s.maxCd = G.abilities.cdOf(x.s); }
        G.ui.toast(`📘 ${d.name} Lv${x.lv + 1}`, 'good');
        GM._keepModal = true; setTimeout(back, 0);
      } };
    });
    out.push({ icon: '↩', label: '戻る', onPick: () => { GM._keepModal = true; setTimeout(back, 0); } });
    GM.modal('📘 スキルの献納', `どれを捧げて強化する？　所持 🪙${fmt(coins())}`, out);
  };

  // ---------------- offering altar ----------------
  R2.setup_offering = function (c) {
    R2.offerN = 0;
    npc(G.ENEMY_BY_ID.wraith_normal, c, {
      id: 'offering', npc: '黄金の祭司', icon: '🏛️', repeat: true,
      get text() { return `「捧げよ。捧げた分だけ、深淵は応えよう」<br>所持 🪙${fmt(coins())}`; },
      opts: () => {
        const k = Math.pow(1.5, R2.offerN || 0);
        const t1 = GM.price(1500 * k), t2 = GM.price(4000 * k), t3 = GM.price(10000 * k);
        const after = () => { R2.offerN = (R2.offerN || 0) + 1; G.fx.ring(P.pos.clone(), 3, 0xffd070, 0.6); G.sfx.bell(); };
        return [
          { icon: '🪙', label: `小献納（${fmt(t1)}🪙）`, sub: 'レア以上の加護をランダムに1つ', disabled: coins() < t1, run: () => { pay(t1); after(); const b = U.pick(G.BUFFS.filter((x) => G.RARITY[x.rarity] && G.RARITY[x.rarity].tier >= 2 && !x.relic && !x.pact && x.cat !== 'curse' && (P.buffs.get(x.id) || 0) < x.max && (!x.skill || P.skills.some((s) => s && s.id === x.skill)))); if (b) { P.addBuff(b.id); G.ui.itemCard(b, '[献納]', { now: true }); } return { reopen: true }; } },
          { icon: '💰', label: `大献納（${fmt(t2)}🪙）`, sub: 'エピック以上の加護を3つから選ぶ', disabled: coins() < t2, run: () => { pay(t2); after(); return { offer: (x) => G.RARITY[x.rarity] && G.RARITY[x.rarity].tier >= 3 && x.cat !== 'pact' && x.cat !== 'relic' }; } },
          { icon: '👑', label: `至高の献納（${fmt(t3)}🪙）`, sub: '伝説の加護を3つから選ぶ', disabled: coins() < t3, run: () => { pay(t3); after(); return { offer: (x) => x.rarity === 'legendary' && x.cat !== 'pact' && x.cat !== 'relic' }; } },
          // coins into a skill level: pick the skill (or the ultimate / the pile driver); the price follows that skill's own Lv and the altar's rising factor
          (() => {
            const costs = GM.tomeTargets().map((x) => Math.round(GM.price(1500 * Math.pow(1.25, x.lv)) * k / 10) * 10), lo = costs.length ? Math.min(...costs) : 0;
            return { icon: '📘', label: costs.length ? `スキルの献納（${fmt(lo)}🪙〜）` : 'スキルの献納（全て最大レベル）', sub: 'スキル・アルティメット・パイルドライバーを1つ選び、レベル+1（価格は選んだものの今の Lv で決まる）', disabled: !costs.length || coins() < lo, run: () => ({ sub: R2.skillOffering }) };
          })(),
        ];
      },
    }, '#ffe090');
  };
})();
