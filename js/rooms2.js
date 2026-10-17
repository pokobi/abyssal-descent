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
          return { icon: s.it.icon, label: `${s.it.name}（${fmt(s.price)}🪙）　残り${s.n}`, sub: `${s.it.passive ? '[常時] ' : s.it.cat === 'grenade' ? '[G:投擲] ' : '[4/5:消耗品] '}${s.it.desc}　所持 ${s.it.cat === 'grenade' ? (P.grenades[s.it.id] || 0) : P.itemCount(s.it.id)}${full ? '（持ち物がいっぱい）' : ''}`, disabled: coins() < s.price || full, run: () => { pay(s.price); s.n--; P.addItem(s.it.id, 1); return { reopen: true }; } };
        });
        const tc = GM.price(60 + GM.area * 8);
        out.push({ icon: w.stoneVendor ? '✨' : '🩹', label: w.stoneVendor ? `癒しの光を浴びる（${fmt(tc)}🪙）` : `手当てを受ける（${fmt(tc)}🪙）`, sub: treated ? '一度だけ' : 'HPを40%回復（一度だけ）', disabled: treated || coins() < tc || P.hp >= P.stats.maxHp, run: () => { pay(tc); treated = true; C.heal(P.stats.maxHp * 0.4); G.sfx.heal(); return { reopen: true }; } });
        return out;
      },
    }, '#ffc080');
  };

  // ---------------- casino ----------------
  R2.setup_casino = function (c) {
    npc(G.ENEMY_BY_ID.skeleton_bone, c, {
      id: 'casino', npc: '骨の胴元', icon: '🎰', repeat: true,
      get text() { return `「さぁ張った張った！ 深淵では運も実力のうちさ」<br>所持 🪙${fmt(coins())}`; },
      opts: () => {
        const bet = Math.max(100, Math.round(coins() * 0.25 / 10) * 10), lot = GM.price(400), slot = GM.price(150);
        return [
          { icon: '🎲', label: `倍か無か（${fmt(bet)}🪙）`, sub: '所持の25%を賭ける。47%で倍になる', disabled: coins() < bet, run: () => { pay(bet); if (Math.random() < 0.47) { gain(bet * 2, '倍!'); G.ui.toast(`🎲 当たり！ +${fmt(bet * 2)}`, 'good'); G.sfx.ui('rare'); } else { G.ui.toast('🎲 外れ…', 'warn'); G.sfx.ui('deny'); } return { reopen: true }; } },
          { icon: '📦', label: `宝箱くじ（${fmt(lot)}🪙）`, sub: '古びた50%・上等30%・装飾12%・ミミック8%', disabled: coins() < lot, run: () => { pay(lot); const r = Math.random(); if (r < 0.08) { G.ui.toast('😱 ミミックだ！', 'warn'); for (let i = 0; i < 2; i++) GM.spawnEnemy({ elite: true, near: true }); return {}; } const tier = r < 0.2 ? 2 : r < 0.5 ? 1 : 0; GM.spawnChestNear(tier); G.ui.toast(['📦 古びた宝箱', '💎 装飾された宝箱', '👑 王の宝箱！'][tier], 'good'); return { reopen: true }; } },
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
    if (GM.run.merc && GM.run.merc.left > 0) { GM.run.merc.left--; if (GM.run.merc.left <= 0) { G.ui.toast('🛡️ 傭兵の契約が満了した', 'warn'); GM.run.merc = null; } }
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
    else if (l.kind === 'melee') { G.Pawn.tradeIn(P.melee, true); P.melee = G.weapons.makeMelee(l.obj.id); if (P.meleeMode) G.weapons.melee.equip(false); G.ui.itemCard(l.obj, '[近接:3]'); G.ui.refreshWeapon(); }
    else { P.addBuff(l.obj.id); G.ui.itemCard(l.obj, l.kind === 'relic' ? '[遺物]' : '[加護]'); }
  };

  // ---------------- mercenaries ----------------
  const MERCS = {
    sword: { name: '傭兵剣士', icon: '🗡️', def: 'brute_normal', base: 1400, ranged: false, desc: '敵に斬り込む前衛。' },
    bow: { name: '傭兵弓兵', icon: '🏹', def: 'skeleton_bone', base: 1700, ranged: true, desc: '後方から矢を射る。' },
  };
  R2.MERCS = MERCS;
  R2.setup_merc = function (c) {
    npc(G.ENEMY_BY_ID.brute_normal, c, {
      id: 'merc', npc: '傭兵隊長', icon: '🛡️', repeat: true,
      get text() { const m = GM.run.merc; return `「腕は確かだ。契約は3エリア分。倒れても起き上がるが、金は前払いだ」<br>${m ? `現在の契約: ${MERCS[m.type].icon} ${MERCS[m.type].name} Lv${m.lv}（残り${m.left}エリア）` : '現在の契約: なし'}`; },
      opts: () => {
        const m = GM.run.merc;
        const out = Object.entries(MERCS).map(([k, d]) => { const pr = GM.price(d.base); return { icon: d.icon, label: `${d.name}を雇う（${fmt(pr)}🪙）`, sub: `${d.desc} Lv1・3エリア契約${m ? '（今の契約は解除）' : ''}`, disabled: coins() < pr, run: () => { pay(pr); GM.run.merc = { type: k, lv: 1, left: 3 }; R2.spawnMerc(); G.ui.toast(`${d.icon} ${d.name}と契約した`, 'good'); return { reopen: true }; } }; });
        if (m) {
          const up = GM.price(900 * Math.pow(1.35, m.lv)), ext = GM.price(MERCS[m.type].base * 0.6);
          out.push({ icon: '⬆️', label: `鍛える Lv${m.lv}→${m.lv + 1}（${fmt(up)}🪙）`, sub: '与ダメージ×1.3', disabled: coins() < up, run: () => { pay(up); m.lv++; return { reopen: true }; } });
          out.push({ icon: '📜', label: `契約延長 +3エリア（${fmt(ext)}🪙）`, sub: `残り${m.left} → ${m.left + 3}`, disabled: coins() < ext, run: () => { pay(ext); m.left += 3; return { reopen: true }; } });
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
    const draw = (hpK, down, downT) => {
      const key = `${m.lv}|${Math.round(hpK * 40)}|${down ? Math.ceil(downT) : -1}`;
      if (key === last) return; last = key;
      const g = tagC.getContext('2d'); g.clearRect(0, 0, 320, 96);
      g.font = '900 30px "Noto Sans JP","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.9)';
      const txt = `${d.icon} 味方 ${d.name} Lv${m.lv}`;
      g.fillStyle = '#9fe8ff'; (G.Icons ? G.Icons.fillText : (g2, t2, x2, y2, o2) => { if (o2 && o2.stroke) g2.strokeText(t2, x2, y2); g2.fillText(t2, x2, y2); })(g, txt, 160, 28, { stroke: true });
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(40, 58, 240, 20);
      g.fillStyle = down ? '#666' : hpK > 0.5 ? '#5fe07a' : hpK > 0.25 ? '#ffd050' : '#ff5050'; g.fillRect(43, 61, 234 * Math.max(0, hpK), 14);
      g.strokeStyle = '#9fe8ff'; g.lineWidth = 2; g.strokeRect(40, 58, 240, 20);
      if (down) { g.font = '900 18px "Noto Sans JP",sans-serif'; g.fillStyle = '#ffd0d0'; g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(`ダウン ${Math.ceil(downT)}秒`, 160, 69); g.fillText(`ダウン ${Math.ceil(downT)}秒`, 160, 69); }
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
        draw(a.hp / Math.max(1, a.info().maxHp), a.down > 0, a.down);
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
  // spawned at the start of each area while the contract lasts
  R2.spawnMerc = function () {
    const m = GM.run.merc; if (!m || m.left <= 0 || !G.world) return;
    if (R2.mercAlly) { R2.mercAlly.dead = true; R2.mercAlly = null; }
    const d = MERCS[m.type], def = G.ENEMY_BY_ID[d.def] || G.ENEMIES[0];
    const mdl = G.enemies.buildModel(def, { ally: true });
    const pos = P.pos.clone().add(V(1.5, 0, 1.5));
    mdl.group.position.copy(pos); G.scene.add(mdl.group);
    const ent = { pos: pos.clone(), vel: V(), yaw: 0, radius: 0.5, height: 2, def, cd: 0, walk: 0, atk: 0 };
    const dmg = () => 45 * Math.pow(1.3, m.lv - 1) * (d.ranged ? 0.8 : 1);
    const maxHp = () => Math.round((d.ranged ? 260 : 420) * Math.pow(1.3, m.lv - 1) * (1 + GM.area * 0.04));
    G.fx.smoke(pos, 8, 1, 0x8080a0, 1, 1);
    const ally = R2.mercAlly = C.addAlly({
      t: 1e9, ent, hp: maxHp(), down: 0, lastHurt: -10,
      info() { return { merc: true, icon: d.icon, name: d.name, lv: m.lv, hp: this.hp, maxHp: maxHp(), down: this.down, left: m.left }; },
      targetable() { return this.down <= 0; },
      hurt(v) {
        if (this.down > 0) return;
        this.hp -= v; this.lastHurt = G.game.time; G.fx.sparks(ent.pos.clone().add(V(0, 1.2, 0)), null, 4, 0xff3030, 2);
        if (this.hp <= 0) { this.hp = 0; this.down = 10; G.ui.toast(`${d.icon} ${d.name}がダウンした（10秒後に復帰）`, 'warn'); G.fx.smoke(ent.pos, 6, 1, 0x606070, 1, 1); }
      },
      update(dt) {
        // stay on the floor: fall when standing on nothing (after a teleport / a ledge / a lowered floor), also while idle or downed
        { const gy = G.world.groundAt(V(ent.pos.x, ent.pos.y + 0.8, ent.pos.z), 0.2, 10); if (gy > -Infinity) ent.pos.y = ent.pos.y > gy + 0.05 ? Math.max(gy, ent.pos.y - 24 * dt) : gy; }
        // downed: lies still, gets back up with half HP (the contract says they never die)
        if (this.down > 0) {
          this.down -= dt;
          mdl.group.position.copy(ent.pos); mdl.group.rotation.set(-1.35, ent.yaw, 0);
          if (this.down <= 0) { this.hp = maxHp() * 0.5; mdl.group.rotation.set(0, ent.yaw, 0); G.fx.ring(ent.pos.clone(), 1.5, 0xc0c0ff, 0.4); G.ui.toastSmall(`${d.icon} ${d.name}が復帰した`); }
          return;
        }
        if (this.hp > maxHp()) this.hp = maxHp();
        if (G.game.time - this.lastHurt > 5) this.hp = Math.min(maxHp(), this.hp + maxHp() * 0.04 * dt);
        ent.cd -= dt;
        const e = G.enemies.nearest(ent.pos, 40);
        let moving = false;
        const reach = d.ranged ? 16 : 1.4;
        if (e && !e.ally) {
          const to = e.pos.clone().sub(ent.pos); to.y = 0; const l = to.length();
          ent.yaw = Math.atan2(to.x, to.z);
          if (l > e.radius + reach) { G.enemies.groundMove(ent, to.x / l, to.z / l, 6, dt); moving = true; }
          else if (ent.cd <= 0) {
            ent.cd = d.ranged ? 1.1 : 0.8; ent.atk = 0.4;
            if (d.ranged) { const from = ent.pos.clone().add(V(0, 1.6, 0)), dir = e.centerPos().sub(from).normalize(); C.spawnProjectile({ kind: 'arrow', pos: from.clone().addScaledVector(dir, 0.6), vel: dir.multiplyScalar(60), grav: 2, owner: 'player', dmg: dmg(), radius: 0.12, info: { src: 'ally', noMarker: true } }); }
            else { C.damageEnemy(e, dmg(), { src: 'ally', noMarker: true, pos: e.centerPos() }); G.sfx.melee(true); }
          }
        } else {
          const to = P.pos.clone().sub(ent.pos); to.y = 0; const l = to.length();
          if (l > 4) { G.enemies.groundMove(ent, to.x / l, to.z / l, 7, dt); moving = true; ent.yaw = Math.atan2(to.x, to.z); }
          if (l > 30) { ent.pos.copy(P.pos).add(V(1.5, 0, 1.5)); ent.pos.y = G.world.groundAt(V(ent.pos.x, P.pos.y + 0.8, ent.pos.z), 0.2, 12) > -Infinity ? G.world.groundAt(V(ent.pos.x, P.pos.y + 0.8, ent.pos.z), 0.2, 12) : P.pos.y; }
        }
        ent.atk = Math.max(0, ent.atk - dt); ent.walk += moving ? dt * 9 : 0;
        mdl.group.position.copy(ent.pos); mdl.group.rotation.y = ent.yaw;
        mdl.animate({ walk: ent.walk, moving, atk: ent.atk > 0 ? 1 - ent.atk / 0.4 : 0, t: G.game.time, flinch: 0, state: 'chase' });
      },
      remove() { G.scene.remove(mdl.group); },
    });
    const fx = allyFx(mdl, d, m);
    const u0 = ally.update, r0 = ally.remove;
    ally.update = function (dt) { u0.call(this, dt); fx.update(dt, this); };
    ally.remove = function () { r0.call(this); fx.dispose(); };
    return ally;
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
          { icon: '🪙', label: `小献納（${fmt(t1)}🪙）`, sub: 'レア以上の加護をランダムに1つ', disabled: coins() < t1, run: () => { pay(t1); after(); const b = U.pick(G.BUFFS.filter((x) => G.RARITY[x.rarity] && G.RARITY[x.rarity].tier >= 2 && !x.relic && !x.pact && x.cat !== 'curse' && (P.buffs.get(x.id) || 0) < x.max)); if (b) { P.addBuff(b.id); G.ui.itemCard(b, '[献納]'); } return { reopen: true }; } },
          { icon: '💰', label: `大献納（${fmt(t2)}🪙）`, sub: 'エピック以上の加護を3つから選ぶ', disabled: coins() < t2, run: () => { pay(t2); after(); return { offer: (x) => G.RARITY[x.rarity] && G.RARITY[x.rarity].tier >= 3 && x.cat !== 'pact' && x.cat !== 'relic' }; } },
          { icon: '👑', label: `至高の献納（${fmt(t3)}🪙）`, sub: '伝説の加護を3つから選ぶ', disabled: coins() < t3, run: () => { pay(t3); after(); return { offer: (x) => x.rarity === 'legendary' && x.cat !== 'pact' && x.cat !== 'relic' }; } },
        ];
      },
    }, '#ffe090');
  };
})();
