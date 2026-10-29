'use strict';
// Grid inventory (Tarkov / Dark-and-Darker style): the player's bag, armour slots, chests, corpses and things dropped on the ground.
// Everything except weapons, skills and boons lives here. The old count-based views (P.inv, P.grenades, P.attStash) are derived from it.
(function () {
  const IV = (G.Inv = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let uidN = 1;

  // ---------------- item instances ----------------
  // { uid, type: 'item' | 'armor' | 'valuable' | 'att', id, n, x, y, rot, ench? }
  IV.make = function (type, id, n, extra) { return Object.assign({ uid: uidN++, type, id, n: n || 1, x: 0, y: 0, rot: false }, extra || {}); };
  // worn = true for found loot: 0 - 90% of the durability is already gone
  IV.makeArmor = function (id, rnd, worn) {
    const d = G.ARMOR_BY_ID[id], extra = { ench: G.rollEnchants(d.rarity, rnd) };
    if (worn) extra.dur = Math.max(1, Math.round(G.armorMaxDur(d) * (1 - 0.9 * (rnd || Math.random)())));
    return IV.make('armor', id, 1, extra);
  };
  // ---- armour durability ----
  IV.durMax = (it) => G.armorMaxDur(G.ARMOR_BY_ID[it.id]);
  IV.durOf = (it) => (it.dur === undefined ? IV.durMax(it) : it.dur);
  IV.durFrac = (it) => { const m = IV.durMax(it); return m ? Math.max(0, Math.min(1, IV.durOf(it) / m)) : 1; };
  // how much of a hit each worn piece takes (normalised over what you actually wear)
  const WEAR_SHARE = { chest: 0.35, head: 0.2, legs: 0.2, feet: 0.15, hands: 0.1 };
  IV.WEAR_K = 30; // durability points a hit of your whole max HP costs, summed over all worn pieces
  IV.wear = function (P, dmg) {
    if (!P.equip || !(dmg > 0)) return;
    const worn = Object.keys(P.equip).filter((k) => P.equip[k]);
    if (!worn.length) return;
    const tot = worn.reduce((s, k) => s + (WEAR_SHARE[k] || 0.1), 0), pts = IV.WEAR_K * dmg / Math.max(20, P.stats.maxHp);
    let broke = false;
    for (const k of worn) {
      const it = P.equip[k], was = IV.durFrac(it);
      it.dur = IV.durOf(it) - pts * (WEAR_SHARE[k] || 0.1) / tot;
      const d = G.ARMOR_BY_ID[it.id];
      if (it.dur <= 0) {
        P.equip[k] = null; broke = true;
        G.sfx.shieldBreak && G.sfx.shieldBreak(P.pos); G.sfx.mech('magOut', 0, 1);
        G.ui.toast(`💥 ${d.name} が壊れた！`, 'warn'); G.ui.feed(`💥 ${d.name} が壊れた`, 'big');
      } else if (was > 0.2 && IV.durFrac(it) <= 0.2) {
        G.ui.toastSmall(`⚠ ${d.name} の耐久が残りわずか`); G.sfx.ui('deny');
      }
    }
    if (broke) P.recalc();
    if (G.InvUI && G.InvUI.isOpen && G.InvUI.isOpen()) IV.onChange && IV.onChange();
  };
  // repair: which = 'equip' | 'all' (also what is in the bag); frac = share of the missing durability restored (1 = fully)
  IV.damaged = (P, which) => { const out = []; for (const k in P.equip) if (P.equip[k]) out.push(P.equip[k]); if (which === 'all') for (const o of P.bag.items) if (o.type === 'armor') out.push(o); return out.filter((o) => IV.durFrac(o) < 0.995); };
  IV.repairCost = (P, which, frac) => { let c = 0; for (const o of IV.damaged(P, which)) c += G.ARMOR_BY_ID[o.id].price * 0.3 * (1 - IV.durFrac(o)) * (frac || 1); return c; };
  IV.repair = function (P, which, frac) {
    let n = 0;
    for (const o of IV.damaged(P, which)) { const m = IV.durMax(o); o.dur = Math.min(m, IV.durOf(o) + (m - IV.durOf(o)) * (frac || 1)); n++; }
    if (n) { G.sfx.mech('magIn', 0, 0.9); if (G.InvUI && G.InvUI.isOpen && G.InvUI.isOpen()) IV.onChange && IV.onChange(); }
    return n;
  };
  // repair kit (u_repair): +150 durability on one armour piece, dropped on it in the inventory screen. returns the points restored, or -1 when the piece is not worn down
  IV.isKit = (it) => !!it && it.type === 'item' && !!(G.ITEM_BY_ID[it.id] && G.ITEM_BY_ID[it.id].kit);
  IV.kitPower = (it) => (G.ITEM_BY_ID[it.id] && G.ITEM_BY_ID[it.id].data.repair) || 150;
  IV.kitGain = (kit, piece) => (IV.durFrac(piece) >= 0.995 ? 0 : Math.min(IV.kitPower(kit), IV.durMax(piece) - IV.durOf(piece)));
  IV.useKit = function (P, kit, from, piece) {
    if (!IV.isKit(kit) || !piece || piece.type !== 'armor') return -1;
    const gain = IV.kitGain(kit, piece); if (gain <= 0) return -1;
    piece.dur = IV.durOf(piece) + gain;
    kit.n--; if (kit.n <= 0 && from) IV.remove(from, kit); else if (from) IV.changed(from);
    G.sfx.mech('magIn', 0, 0.9); setTimeout(() => G.sfx.mech('magOut', 0, 0.8), 110);
    return gain;
  };
  IV.def = function (it) {
    if (!it) return null;
    if (it.type === 'item') return G.ITEM_BY_ID[it.id];
    if (it.type === 'armor') return G.ARMOR_BY_ID[it.id];
    if (it.type === 'valuable') return G.VALUABLE_BY_ID[it.id];
    if (it.type === 'att') return G.ATT_BY_ID[it.id];
    if (it.type === 'gun') return G.WEAPON_BY_ID[it.id]; // a gun lying on the ground (only ever on the ground)
    if (it.type === 'melee') return G.MELEE_BY_ID[it.id];
    return null;
  };
  IV.baseSize = function (it) {
    const d = IV.def(it);
    if (!d) return [1, 1];
    if (it.type === 'armor' || it.type === 'valuable') return d.size;
    if (it.type === 'att') return d.slot === 'barrel' || d.slot === 'stock' || d.slot === 'under' ? [2, 1] : [1, 1];
    if (it.type === 'item' && d.size) return d.size;
    return [1, 1];
  };
  IV.size = function (it) { const [w, h] = IV.baseSize(it); return it.rot ? [h, w] : [w, h]; };
  IV.maxStack = function (it) {
    if (it.type !== 'item') return 1;
    const d = IV.def(it);
    if (d && (d.passive || d.kit)) return 3;
    return 50; // consumables and grenades stack up to 50 in one cell; relic-like passives keep their small stacks
  };
  IV.enchMul = (it) => (it && it.ench && it.ench.length ? 1.65 + it.ench.reduce((s, e) => { const E = G.ENCHANT_BY_ID[e.id], q = E && E.max > E.min ? U.clamp((e.v - E.min) / (E.max - E.min), 0, 1) : 0.5; return s + 0.35 + 0.35 * q; }, 0) : 1);
  IV.value = function (it) {
    const d = IV.def(it); if (!d) return 0;
    const R = G.Pawn ? G.Pawn.RATE : 0.4;
    if (it.type === 'valuable') return Math.max(1, Math.round(d.value * it.n * (G.Run ? G.Run.valuableMul() : 1)));
    if (it.type === 'armor') return Math.max(5, Math.round(d.price * R * IV.enchMul(it) * (0.2 + 0.8 * IV.durFrac(it)) / 5) * 5); // the more worn, the less it sells for
    return Math.max(1, Math.round((d.price || 0) * R / 5) * 5) * it.n;
  };

  // ---------------- containers ----------------
  IV.container = function (cols, rows, name, kind) { return { cols, rows, items: [], name: name || '', kind: kind || 'box' }; };
  IV.fits = function (c, w, h, x, y, ignore) {
    if (x < 0 || y < 0 || x + w > c.cols || y + h > c.rows) return false;
    for (const o of c.items) {
      if (o === ignore) continue;
      const [ow, oh] = IV.size(o);
      if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) return false;
    }
    return true;
  };
  IV.findSpot = function (c, it) {
    for (const rot of [it.rot, !it.rot]) {
      const [w, h] = rot ? [IV.baseSize(it)[1], IV.baseSize(it)[0]] : IV.baseSize(it);
      for (let y = 0; y <= c.rows - h; y++) for (let x = 0; x <= c.cols - w; x++) if (IV.fits(c, w, h, x, y)) return { x, y, rot };
    }
    return null;
  };
  // put an item in: tops up existing stacks first, then takes a free spot. returns how many did NOT fit.
  IV.put = function (c, it) {
    if (c.accept && !c.accept(it)) return it.n; // the special slots only take their own kind
    if (it.type === 'item') {
      const cap = IV.maxStack(it);
      for (const o of c.items) {
        if (it.n <= 0) break;
        if (o.type === it.type && o.id === it.id && o.n < cap) { const k = Math.min(cap - o.n, it.n); o.n += k; it.n -= k; }
      }
      while (it.n > cap) {
        const part = IV.make(it.type, it.id, cap);
        const s = IV.findSpot(c, part); if (!s) break;
        Object.assign(part, s); c.items.push(part); it.n -= cap;
      }
    }
    if ((c.kind === 'bag' || c.kind === 'spec') && G.save) {
      // the first repair kit ever picked up: one quiet line on how it is used (the item card keeps its short hint)
      if (it.type === 'item' && it.id === 'u_repair' && !G.save.data.codex.items.u_repair && G.ui && G.ui.toastSmall) G.ui.toastSmall('🛠️ 名工の補修具：インベントリで防具にドラッグして耐久を修復');
      G.save.mark('items', it.id);
    }
    if (it.n <= 0) { IV.changed(c); return 0; }
    const s = IV.findSpot(c, it);
    if (!s) { IV.changed(c); return it.n; }
    Object.assign(it, s); c.items.push(it);
    IV.changed(c);
    return 0;
  };
  IV.canPut = function (c, type, id, n) { const tmp = { cols: c.cols, rows: c.rows, items: c.items.map((o) => Object.assign({}, o)) }; return IV.put(tmp, IV.make(type, id, n || 1)) === 0; };
  // tidy a container: same-kind stacks merged, then ordered by kind (armour, attachments, consumables, valuables) and, within a kind, by rarity
  // (best first), packed from the top left. Returns false (nothing changed) if the new arrangement would not fit.
  const KIND_RANK = { armor: 0, att: 1, item: 2, valuable: 3 };
  const ITEM_CAT = { heal: 0, util: 1, grenade: 2 };
  IV.sortContainer = function (c) {
    const items = c.items.slice(), merged = [], snap = items.map((o) => [o, o.n, o.x, o.y, o.rot]);
    const byId = {};
    for (const it of items) {
      if (it.type !== 'item') { merged.push(it); continue; }
      (byId[it.id] = byId[it.id] || []).push(it);
    }
    for (const id in byId) {
      const list = byId[id], cap = IV.maxStack(list[0]); let total = list.reduce((n, o) => n + o.n, 0);
      for (const o of list) { if (total <= 0) break; o.n = Math.min(cap, total); total -= o.n; merged.push(o); }
    }
    const tier = (it) => { const d = IV.def(it); return d && G.RARITY[d.rarity] ? G.RARITY[d.rarity].tier : 0; };
    const key = (it) => { const d = IV.def(it) || {}; return [KIND_RANK[it.type] ?? 9, it.type === 'item' ? (ITEM_CAT[d.cat] ?? 9) : 0, -tier(it), -(d.price || d.value || 0), String(d.name || it.id), -it.n]; };
    merged.sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; } return 0; });
    const tmp = { cols: c.cols, rows: c.rows, items: [] };
    for (const it of merged) { const sp = IV.findSpot(tmp, it); if (!sp) { for (const [o, n, x, y, r] of snap) Object.assign(o, { n, x, y, rot: r }); return false; } Object.assign(it, sp); tmp.items.push(it); }
    c.items = tmp.items;
    IV.changed(c);
    return true;
  };
  IV.remove = function (c, it) { const i = c.items.indexOf(it); if (i >= 0) c.items.splice(i, 1); IV.changed(c); };
  IV.ver = 0;
  IV.changed = function (c) { IV.ver++; if (G.player && (c === G.player.bag || c.kind === 'spec')) { G.ui && (G.ui._itemsDirty = true); if (G.ui && G.ui.refreshItems) G.ui.refreshItems(); } if (IV.onChange) IV.onChange(c); };
  IV.count = function (c, type, id) { let n = 0; for (const o of c.items) if (o.type === type && o.id === id) n += o.n; return n; };
  IV.take = function (c, type, id, n) {
    n = n || 1;
    const list = c.items.filter((o) => o.type === type && o.id === id).sort((a, b) => a.n - b.n);
    for (const o of list) { if (n <= 0) break; const k = Math.min(o.n, n); o.n -= k; n -= k; if (o.n <= 0) c.items.splice(c.items.indexOf(o), 1); }
    IV.changed(c);
    return n <= 0;
  };

  // ---------------- player bag + armour ----------------
  IV.BAG = [14, 6];
  // special slots: 4 cells each for grenades (G), healing (key 4) and support items (key 5); they only accept their own kind
  IV.SPEC = [
    { id: 'g', name: '投擲物', icon: '💣', key: 'grenade' },
    { id: 'c1', name: '消耗品', icon: '🧪', key: 'item1' },
    { id: 'c2', name: '消耗品', icon: '🧪', key: 'item2' },
  ];
  IV.specOf = function (it) {
    if (!it || it.type !== 'item') return null;
    const d = G.ITEM_BY_ID[it.id]; if (!d || d.passive || d.kit) return null;
    return d.slot === 'g' ? 'g' : 'c';
  };
  IV.pcs = (P) => (P.spec ? [P.spec.g, P.spec.c1, P.spec.c2] : []).concat(P.bag ? [P.bag] : []);
  IV.countAll = (P, type, id) => IV.pcs(P).reduce((n, c) => n + IV.count(c, type, id), 0);
  IV.takeAll = function (P, type, id, n) { n = n || 1; for (const c of IV.pcs(P)) { while (n > 0 && IV.count(c, type, id) > 0) { IV.take(c, type, id, 1); n--; } } return n <= 0; };
  IV.clearItems = function (P, grenade) {
    for (const c of IV.pcs(P)) c.items = c.items.filter((o) => !(o.type === 'item' && G.ITEM_BY_ID[o.id] && (G.ITEM_BY_ID[o.id].cat === 'grenade') === !!grenade));
  };
  // put something with the player: its special slot first (if there is room), the bag for the rest. returns how many did NOT fit
  IV.stow = function (P, it) {
    const k = IV.specOf(it);
    if (k && P.spec) {
      const list = k === 'g' ? [P.spec.g] : [P.spec.c1, P.spec.c2];
      // top up stacks you already carry (either pocket), then use a free cell
      for (const c of list) for (const o of c.items) if (it.n > 0 && o.type === it.type && o.id === it.id && o.n < IV.maxStack(o)) { const t = Math.min(IV.maxStack(o) - o.n, it.n); o.n += t; it.n -= t; IV.changed(c); }
      if (it.n <= 0) return 0;
      for (const c of list) if (IV.put(c, it) === 0) return 0;
    }
    // armour for a part you have nothing on goes straight on
    if (it.type === 'armor' && !IV.noAuto && P.equip) {
      const d = G.ARMOR_BY_ID[it.id];
      if (d && !P.equip[d.slot] && IV.equip(P, it, null)) { if (G.ui && G.ui.toastSmall) G.ui.toastSmall(`🛡 ${d.name} を装備した`); return 0; }
      // the very same piece (same kind and rarity) with more durability replaces the worn one; enchanted pieces are never swapped automatically
      const cur = d && P.equip[d.slot];
      if (cur && cur.id === it.id && !(cur.ench && cur.ench.length) && !(it.ench && it.ench.length) && IV.durOf(it) > IV.durOf(cur)) {
        const a = Math.round(IV.durOf(cur)), b = Math.round(IV.durOf(it)), m = IV.durMax(it);
        if (IV.equip(P, it, null)) { if (G.ui && G.ui.toastSmall) G.ui.toastSmall(`🛡 ${d.name} を耐久の高い方に付け替えた（${a}→${b} / ${m}）`); return 0; }
      }
    }
    const left = IV.put(P.bag, it);
    if (left === 0 && it.type === 'att') IV.autoAtt(P, it);
    return left;
  };
  // a picked-up attachment goes straight onto a gun that can use it and has the socket free (the gun on key 1 first, then key 2)
  IV.autoAtt = function (P, it) {
    if (IV.noAuto || !G.weapons || !G.game || !G.game.moveAtt || !P.weapons || !P.weapons.length) return false;
    const a = G.ATT_BY_ID[it.id]; if (!a) return false;
    const w = G.weapons.gunsInOrder().find((g) => a.compat(g.def) && !g.atts[a.slot]);
    if (!w || !G.game.moveAtt(it.id, 'stash', w)) return false;
    G.ui.toastSmall(`🔩 ${a.icon} ${a.name} を ${w.def.name} に装着した`);
    return true;
  };
  IV.setupPlayer = function (P) {
    P.bag = IV.container(IV.BAG[0], IV.BAG[1], 'インベントリ', 'bag');
    P.spec = {};
    for (const S of IV.SPEC) { const c = IV.container(4, 1, S.name, 'spec'); c.accept = (it) => IV.specOf(it) === (S.id === 'g' ? 'g' : 'c'); P.spec[S.id] = c; }
    P.equip = { head: null, chest: null, legs: null, hands: null, feet: null };
  };
  // count views used everywhere else
  IV.counts = function (P, grenade) {
    const out = {};
    if (!P.bag) return out;
    for (const o of IV.pcs(P).reduce((a, c) => a.concat(c.items), [])) if (o.type === 'item') { const d = G.ITEM_BY_ID[o.id]; if (d && (d.cat === 'grenade') === !!grenade) out[o.id] = (out[o.id] || 0) + o.n; }
    return out;
  };
  // attachments kept in the bag, as a list-like object (push / splice / indexOf / includes / iteration)
  class StashView {
    constructor(P) { this.P = P; }
    get arr() { return this.P.bag ? this.P.bag.items.filter((o) => o.type === 'att').sort((a, b) => a.uid - b.uid) : []; }
    get length() { return this.arr.length; }
    push(...ids) { for (const id of ids) IV.give(this.P, 'att', id, 1); return this.length; }
    splice(i, n) { const a = this.arr.slice(i, i + (n ?? 1)); for (const o of a) IV.remove(this.P.bag, o); return a.map((o) => o.id); }
    indexOf(id) { return this.arr.findIndex((o) => o.id === id); }
    includes(id) { return this.indexOf(id) >= 0; }
    forEach(f) { this.arr.map((o) => o.id).forEach(f); }
    filter(f) { return this.arr.map((o) => o.id).filter(f); }
    map(f) { return this.arr.map((o) => o.id).map(f); }
    some(f) { return this.arr.map((o) => o.id).some(f); }
    [Symbol.iterator]() { return this.arr.map((o) => o.id)[Symbol.iterator](); }
  }
  IV.stashView = (P) => new StashView(P);
  // give something to the player: into the bag, or onto the floor at your feet when it doesn't fit
  IV.give = function (P, type, id, n, extra) {
    G.save.mark('items', id);
    const it = type === 'armor' && !(extra && extra.ench) ? IV.makeArmor(id) : IV.make(type, id, n || 1, extra);
    const left = IV.stow(P, it);
    if (left > 0) {
      const rest = it.n === left && !P.bag.items.includes(it) ? it : IV.make(type, id, left, extra);
      IV.dropToGround(rest, P.pos.clone().add(V(0, 0.4, 0)));
      G.ui.toastSmall('🎒 インベントリがいっぱい — 足元に置いた');
      return false;
    }
    return true;
  };
  // equipped armour -> stat mods (defence, weight, fixed effects, enchantments)
  IV.applyArmor = function (P, s) {
    if (!P.equip) return;
    let def = 0, wt = 0;
    for (const k in P.equip) {
      const it = P.equip[k]; if (!it) continue;
      const d = G.ARMOR_BY_ID[it.id]; if (!d) continue;
      def += d.def; wt += d.weight;
      for (const f of d.fixed) for (const m in f.mods) s[m] = (s[m] || 0) + f.mods[m];
      for (const e of it.ench || []) { const E = G.ENCHANT_BY_ID[e.id]; s[E.stat] = (s[E.stat] || 0) + e.v / 100; }
    }
    s.defense = (s.defense || 0) + def;
    s.weight = wt;
    // weight slows you down (cloth weighs nothing; a full plate set is about -14%)
    s.moveSpeed -= Math.min(0.22, wt * 0.022);
  };
  IV.equip = function (P, it, from) {
    const d = G.ARMOR_BY_ID[it.id]; if (!d) return false;
    const prev = P.equip[d.slot];
    if (from) IV.remove(from, it);
    P.equip[d.slot] = it;
    if (prev) { if (from && IV.put(from, prev) > 0) IV.dropToGround(prev, P.pos.clone().add(V(0, 0.4, 0))); else if (!from && IV.put(P.bag, prev) > 0) IV.dropToGround(prev, P.pos.clone().add(V(0, 0.4, 0))); }
    P.recalc(); G.sfx.mech('magIn', 0, 0.8);
    G.save.mark('items', it.id);
    return true;
  };
  IV.unequip = function (P, slot, to) {
    const it = P.equip[slot]; if (!it) return false;
    if (to) { if (IV.put(to, it) > 0) return false; } else if (IV.put(P.bag, it) > 0) IV.dropToGround(it, P.pos.clone().add(V(0, 0.4, 0)));
    P.equip[slot] = null; P.recalc(); G.sfx.mech('magOut', 0, 0.8);
    return true;
  };

  // ---------------- serialisation (mid-run save) ----------------
  IV.ser = (it) => ({ t: it.type, id: it.id, n: it.n, x: it.x, y: it.y, r: it.rot ? 1 : 0, e: it.ench, d: it.dur, g: it.gun });
  IV.de = (o) => IV.make(o.t, o.id, o.n, Object.assign({ x: o.x, y: o.y, rot: !!o.r, ench: o.e }, (o.d !== undefined && o.d !== null ? { dur: o.d } : {}), o.g ? { gun: o.g } : {}));
  IV.snap = (P) => ({ bag: P.bag.items.map(IV.ser), spec: Object.fromEntries(Object.entries(P.spec || {}).map(([k, c]) => [k, c.items.map(IV.ser)])), equip: Object.fromEntries(Object.entries(P.equip).map(([k, v]) => [k, v ? IV.ser(v) : null])) });
  IV.load = function (P, d) {
    IV.setupPlayer(P);
    if (d && d.bag) {
      const retired = (o) => { const pr = o.t === 'item' && G.RETIRED_ITEMS && G.RETIRED_ITEMS[o.id]; if (pr) P.retiredCoins = (P.retiredCoins || 0) + Math.round(pr * 0.5) * (o.n || 1); };
      for (const o of d.bag) { if (!IV.def({ type: o.t, id: o.id })) { retired(o); continue; } const it = IV.de(o); if (IV.fits(P.bag, ...IV.size(it), it.x, it.y)) P.bag.items.push(it); else IV.put(P.bag, it); }
      for (const k in d.spec || {}) for (const o of d.spec[k]) { if (!IV.def({ type: o.t, id: o.id })) { retired(o); continue; } const it = IV.de(o); if (P.spec[k] && IV.fits(P.spec[k], ...IV.size(it), it.x, it.y)) P.spec[k].items.push(it); else IV.stow(P, it); }
      for (const k in d.equip || {}) if (d.equip[k] && G.ARMOR_BY_ID[d.equip[k].id]) P.equip[k] = IV.de(d.equip[k]);
      IV.changed(P.bag);
    }
  };

  // ---------------- loot tables ----------------
  const pickR = (W) => { let t = 0; for (const k in W) t += W[k]; if (t <= 0) { const ks = Object.keys(W); return ks[ks.length - 1]; } let x = Math.random() * t; for (const k in W) { x -= W[k]; if (x <= 0) return k; } return Object.keys(W)[0]; };
  const rarityW = (luck, floor, depthBonus) => {
    const d = Math.max((G.Run ? G.Run.lootDepth(G.game.area) : G.game.area) + (depthBonus || 0), (floor || 0) >= 4 ? 18 : (floor || 0) >= 3 ? 10 : 1);
    return Object.fromEntries(G.RARITY_ORDER.map((r) => [r, G.RARITY[r].tier < (floor || 0) ? 0 : G.rarityWeightD(r, d, luck)]));
  };
  const pickOf = (arr, r) => { let c = arr.filter((o) => o.rarity === r); if (!c.length) c = arr; return G.thinFairy(() => c[Math.floor(Math.random() * c.length)]); };
  // one random thing of a kind
  IV.rollThing = function (kind, luck, floor) {
    const r = pickR(rarityW(luck, floor));
    if (kind === 'valuable') return IV.make('valuable', pickOf(G.VALUABLES, r).id, 1);
    if (kind === 'armor') return IV.makeArmor(pickOf(G.ARMOR, r).id, null, true); // loot is secondhand
    if (kind === 'att') return IV.make('att', pickOf(G.ATTACHMENTS, r).id, 1);
    if (kind === 'grenade') return IV.make('item', pickOf(G.ITEMS.filter((i) => i.cat === 'grenade'), r).id, 1 + (Math.random() < 0.3 ? 1 : 0));
    const cons = G.ITEMS.filter((i) => i.cat !== 'grenade' && !i.noLoot && !(i.data && i.data.chest));
    return IV.make('item', pickOf(cons, r).id, 1);
  };
  const KIND_W = { chest: { item: 30, grenade: 10, valuable: 32, armor: 18, att: 10 }, corpse: { item: 32, grenade: 10, valuable: 40, armor: 18 }, corpseTiny: { item: 40, grenade: 12, valuable: 40 } };
  IV.fill = function (c, n, src, luck, floor) {
    for (let i = 0; i < n; i++) { const kw = Object.assign({}, KIND_W[src]); if (G.Run) kw.valuable *= G.Run.valuableShare(); const it = IV.rollThing(pickR(kw), luck, i === 0 ? floor : 0); IV.put(c, it); }
    return c;
  };
  // chests: plain 4x3 / fine 5x4 / ornate 6x5 / guardian reliquary 8x6; contents grow with the grade and depth
  IV.chestLoot = function (tier) {
    const P = G.player, luck = (P.stats.luck || 0) + (P.stats.chestBonus || 0);
    const c = IV.container([4, 5, 6, 8][tier] || 6, [3, 4, 5, 6][tier] || 5, ['古びた宝箱', '上等な宝箱', '装飾された宝箱', '守護者の秘宝箱'][tier] || '宝箱', 'chest');
    const n = ([U.randi(1, 3), U.randi(2, 4), U.randi(4, 6), U.randi(6, 8)][tier]) || 5;
    if (tier >= 3) {
      const gk = pickR({ armor: 55, att: 25, item: 20 });
      const g1 = IV.rollThing(gk, luck + 5, 4);
      if (g1.type === 'armor') delete g1.dur;
      IV.put(c, g1);
      const g2 = IV.makeArmor(pickOf(G.ARMOR, pickR(rarityW(luck + 1.8, 3, 14))).id);
      IV.put(c, g2);
      const bkw = { armor: 26, att: 20, item: 30, grenade: 8, valuable: 16 * (G.Run ? G.Run.valuableShare() : 1) };
      for (let i = 2; i < n; i++) {
        const it = IV.rollThing(pickR(bkw), luck + 2.2, i === 2 ? 3 : 2);
        if (it.type === 'armor') delete it.dur; // boss chest armour is pristine
        IV.put(c, it);
      }
      return c;
    }
    return IV.fill(c, n, 'chest', luck, [0, 1, 2][tier] || 0);
  };
  // how big the body is (radius² × height): 0 tiny (imp, bat) · 1 small (hound, skeleton, spider) · 2 medium (slime, gargoyle) · 3 large (beetle, mantis, worm) · 4 huge (ogre, golem)
  IV.bodyClass = function (e) {
    const v = (e.radius || 0.5) * (e.radius || 0.5) * (e.height || 1.5);
    return v < 0.15 ? 0 : v < 0.36 ? 1 : v < 0.6 ? 2 : v < 1.6 ? 3 : 4;
  };
  const BODY_GRID = [[3, 2], [4, 2], [4, 3], [5, 3], [6, 4]];
  // corpses: the bigger the body, the bigger its pack; the stronger / higher-level the foe, the more and rarer the loot (always at least one thing).
  // a tiny thing carries no armour
  IV.corpseLoot = function (e) {
    const P = G.player, luck = P.stats.luck || 0;
    const worth = (e.champion ? 3 : e.elite ? 2 : e.def.hp >= 200 ? 1 : 0) + (e.marked ? 1 : 0);
    const bc = IV.bodyClass(e), [gw, gh] = BODY_GRID[bc], up = worth >= 2 ? 1 : 0;
    const c = IV.container(gw + up, gh + up, e.def.name, 'corpse');
    const base = [1, U.randi(1, 2), U.randi(1, 2), U.randi(2, 3), U.randi(2, 4)][bc];
    const n = Math.min(Math.max(1, base + worth + (bc >= 1 && Math.random() < 0.25 ? 1 : 0)), [2, 3, 5, 6, 9][bc] + up * 2);
    return IV.fill(c, n, bc === 0 ? 'corpseTiny' : 'corpse', luck + worth * 0.4, worth >= 3 ? 2 : worth >= 2 ? 1 : 0);
  };

  // ---------------- corpses ----------------
  IV.corpses = [];
  IV.MAX_CORPSES = 24;
  IV.addCorpse = function (e) {
    const cont = IV.corpseLoot(e);
    const c = { e, cont, pos: e.pos.clone(), looted: false };
    e.corpse = c;
    IV.corpses.push(c);
    while (IV.corpses.length > IV.MAX_CORPSES) { const old = IV.corpses.shift(); if (old.e) old.e.corpse = null; }
  };
  // a body that was already lying there when the game was saved (rebuilt dead, with whatever is left to search)
  IV.restoreCorpse = function (s, cont) {
    const def = G.ENEMY_BY_ID[s.id]; if (!def || !cont) return;
    const e = G.enemies.spawn(def, s.lv, V(...s.pos), { scale: s.sc || 1, noSplit: true, noLoot: true });
    e.noReward = true; e.alive = false; e.dying = true; e.deathT = 2; e.state = 'dead'; e.yaw = s.yaw || 0;
    e.hp = 0;
    const m = e.model; m.inner.rotation.z = 1.45 * (e.yaw > 0 ? 1 : -1); m.inner.position.y = -e.radius * 0.4; m.group.scale.setScalar(1); m.group.position.copy(e.pos);
    const c = { e, cont, pos: e.pos.clone(), looted: false, searched: !!s.searched };
    e.corpse = c; IV.corpses.push(c);
  };
  // ---------------- things on the ground ----------------
  IV.ground = [];
  IV.dropToGround = function (it, pos) {
    const w = G.world; if (!w) return;
    const d = IV.def(it);
    const g = new THREE.Group();
    const sack = new THREE.Mesh(G.Props.PG.sph, new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 }));
    sack.scale.set(0.22, 0.16, 0.2); sack.position.y = 0.14; g.add(sack);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(G.ui.R(d && d.rarity || 'common')), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const tex = G.Tex.textTex(d ? d.icon : '❔', { size: 48 });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const asp = tex.image && tex.image.height ? tex.image.width / tex.image.height : 1;
    tag.scale.set(0.34 * asp, 0.34, 1); tag.position.y = 0.55; g.add(tag);
    const fl = w.floorBelow(pos.x, pos.y + 0.6, pos.z);
    const off = V(U.rand(-0.5, 0.5), 0, U.rand(-0.5, 0.5));
    g.position.set(pos.x + off.x, (fl > -50 ? fl : pos.y), pos.z + off.z);
    w.group.add(g);
    IV.ground.push({ it, g, tag, pos: g.position.clone().add(V(0, 0.3, 0)) });
  };
  IV.pickUp = function (gr) {
    const P = G.player;
    if (gr.it.type === 'melee') { G.game.takeMelee(gr.it); G.world.group.remove(gr.g); IV.ground.splice(IV.ground.indexOf(gr), 1); G.sfx.ui('select'); return true; }
    if (gr.it.type === 'gun') {
      if (!G.game.takeGun(gr.it)) { G.ui.toastSmall('🔫 武器スロットがいっぱい — 先に別の銃を捨てる'); G.sfx.ui('deny'); return false; }
      G.world.group.remove(gr.g); IV.ground.splice(IV.ground.indexOf(gr), 1); G.sfx.ui('select');
      return true;
    }
    const left = IV.stow(P, gr.it);
    if (left > 0) { G.ui.toastSmall('🎒 インベントリに空きがない'); G.sfx.ui('deny'); return false; }
    G.save.mark('items', gr.it.id);
    G.world.group.remove(gr.g);
    IV.ground.splice(IV.ground.indexOf(gr), 1);
    const d = IV.def(gr.it); G.sfx.ui('select');
    G.ui.toastSmall(`${d.icon} ${d.name} を拾った`);
    return true;
  };
  IV.reset = function () { IV.corpses = []; IV.ground = []; IV.openCont = null; LOOKS.clear(); };
  IV.tick = function (dt) {
    if (G.player.dead && G.InvUI && G.InvUI.isOpen()) G.InvUI.close(); for (const g of IV.ground) { g.tag.position.y = 0.55 + Math.sin(G.game.time * 3 + g.pos.x) * 0.05; }
    tickLooks(dt);
  };

  // ---------------- how a corpse / chest looks: unsearched · searched with things left · empty ----------------
  // new   : gold silhouette outline, pulsing gold ring + glow, the odd sparkle
  // loot  : steady cyan outline + ring, a floating "🎒 n" tag
  // empty : no outline / ring, model darkened and greyed, a faint "空" tag up close
  const BOX = new THREE.Box3();
  const LOOKS = new Map(); // source (corpse record or chest interactable) -> look
  const OL = {};
  function outlineMat(hex) {
    if (OL[hex]) return OL[hex];
    return (OL[hex] = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(hex) }, opacity: { value: 0.9 }, thick: { value: 0.0045 } },
      // push each vertex out along (mostly) its direction from the part's centre, in view space and scaled by depth,
      // so the shell is a constant few pixels thick and has no cracks at box corners
      vertexShader: 'uniform float thick; void main() { vec3 d = normalize(normal + normalize(position + vec3(1e-4)) * 1.5); vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xyz += normalize(normalMatrix * d) * thick * max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; void main() { gl_FragColor = vec4(color, opacity); }',
      side: THREE.BackSide, transparent: true, depthWrite: false,
    }));
  }
  const COL = { new: 0xffc040, loot: 0x48d8ff };
  function stateOf(src, isChest) {
    if (isChest) return !src.opened ? 'new' : src.cont && src.cont.items.length ? 'loot' : 'empty';
    return !src.searched ? 'new' : src.cont.items.length ? 'loot' : 'empty';
  }
  function modelOf(src, isChest) { return isChest ? src.mesh : src.e && src.e.model && src.e.model.group; }
  function makeLook(src, isChest) {
    const w = G.world, root = modelOf(src, isChest);
    const g = new THREE.Group();
    const R = isChest ? 0.95 : 0.85;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.09, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; g.add(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: COL.new, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.2, 1.3, 1); glow.position.y = 0.45; g.add(glow);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    tag.position.y = isChest ? 1.45 : 1.15; tag.visible = false; g.add(tag);
    w.group.add(g);
    // outline shells: one per mesh, sharing the mesh's geometry (skips sprites, effects and skinned meshes)
    const shells = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.olShell) return;
      const m = o.material; if (!m || Array.isArray(m) || m.transparent || m.blending === THREE.AdditiveBlending) return;
      shells.push(o);
    });
    const outl = shells.map((o) => { const sh = new THREE.Mesh(o.geometry, outlineMat(COL.new)); sh.userData.olShell = true; sh.castShadow = sh.receiveShadow = false; o.add(sh); return sh; });
    // per-instance materials so darkening one empty chest doesn't darken them all (corpse materials are already per-enemy)
    let mats;
    if (isChest) {
      mats = []; const seen = new Map();
      for (const o of shells) { let c = seen.get(o.material); if (!c) { c = o.material.clone(); seen.set(o.material, c); mats.push(c); } o.material = c; }
    } else mats = (src.e.model.M.all || []).filter((m) => m !== src.e.model.M.eye && m.color);
    return { g, ring, glow, tag, outl, mats, state: null, n: -1, isChest, ph: Math.random() * 6 };
  }
  function setTag(L, text, color) {
    if (L.tagText === text) return;
    L.tagText = text;
    if (L.tag.material.map) L.tag.material.map.dispose();
    const tex = G.Tex.textTex(text, { size: 34, color });
    L.tag.material.map = tex; L.tag.material.needsUpdate = true;
    const asp = tex.image && tex.image.height ? tex.image.width / tex.image.height : 4;
    L.tag.scale.set(0.42 * asp, 0.42, 1);
  }
  function applyState(L, st) {
    L.state = st;
    for (const sh of L.outl) { sh.visible = st !== 'empty'; if (st !== 'empty') sh.material = outlineMat(COL[st]); }
    L.ring.visible = st !== 'empty';
    if (st !== 'empty') L.ring.material.color.setHex(COL[st]);
    L.glow.visible = st === 'new';
    // empty: dim and desaturate the model (remember the originals once)
    for (const m of L.mats) {
      if (!m.userData.lk) m.userData.lk = { c: m.color.clone(), e: m.emissive ? m.emissive.clone() : null };
      const o = m.userData.lk;
      if (st === 'empty') {
        const l = o.c.r * 0.3 + o.c.g * 0.59 + o.c.b * 0.11;
        m.color.setRGB(U.lerp(o.c.r, l, 0.7) * 0.32, U.lerp(o.c.g, l, 0.7) * 0.32, U.lerp(o.c.b, l, 0.7) * 0.32);
        if (m.emissive) m.emissive.setRGB(0, 0, 0);
      } else { m.color.copy(o.c); if (m.emissive && o.e) m.emissive.copy(o.e); }
    }
    if (L.isChest && L.src) {
      if (L.src.halo) L.src.halo.visible = st !== 'empty';
      // the chest's warm glint light goes out once it's empty
      for (const ls of G.world.lightSources) if (ls.chest === L.src) ls.on = st !== 'empty';
    }
  }
  function tickLooks(dt) {
    const w = G.world, P = G.player; if (!w || !P) return;
    const t = G.game.time;
    const srcs = [];
    for (const c of IV.corpses) if (c.e && !c.e.removed && c.e.model) srcs.push([c, false]);
    for (const it of w.interactables) if (it.type === 'chest' && it.mesh && !it.removed) srcs.push([it, true]);
    const live = new Set();
    for (const [src, isChest] of srcs) {
      live.add(src);
      let L = LOOKS.get(src);
      if (!L) { L = makeLook(src, isChest); L.src = src; LOOKS.set(src, L); }
      const st = stateOf(src, isChest);
      if (st !== L.state) applyState(L, st);
      // follow the body (a corpse can still be sliding / falling)
      if (isChest) L.g.position.set(src.pos.x, src.pos.y - 0.5, src.pos.z);
      else {
        // a body topples sideways, so centre the ring on where it actually lies
        if (!L.ctr || t - L.ctrT > 0.5) { L.ctr = BOX.setFromObject(modelOf(src, false)).getCenter(L.ctr || V()); L.ctrT = t; }
        const p = src.e.pos, fl = w.floorBelow(L.ctr.x, p.y + 0.6, L.ctr.z); L.g.position.set(L.ctr.x, fl > -50 ? Math.max(fl, p.y - 0.6) : p.y, L.ctr.z);
      }
      const d = L.g.position.distanceTo(P.pos);
      const near = d < 26;
      for (const sh of L.outl) sh.visible = near && st !== 'empty';
      if (st === 'new') {
        const k = 0.5 + 0.5 * Math.sin(t * 3.2 + L.ph);
        L.ring.material.opacity = 0.35 + k * 0.45; L.ring.scale.setScalar(1 + k * 0.12);
        L.glow.material.opacity = 0.18 + k * 0.22;
        if (L.outl.length) L.outl[0].material.uniforms.opacity.value = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 3.2));
        if (d < 16 && Math.random() < dt * 1.4) G.fx.sparks(L.g.position.clone().add(V(U.rand(-0.4, 0.4), 0.5, U.rand(-0.4, 0.4))), V(0, 1, 0), 2, COL.new, 1.5);
        L.tag.visible = false;
      } else if (st === 'loot') {
        L.ring.material.opacity = 0.55; L.ring.scale.setScalar(1);
        if (L.outl.length) L.outl[0].material.uniforms.opacity.value = 0.85;
        const n = src.cont.items.length;
        setTag(L, `🎒 ${n}`, '#9fe4ff');
        L.tag.visible = d < 18; L.tag.material.opacity = 0.95;
        L.tag.position.y = (L.isChest ? 1.8 : 1.15) + Math.sin(t * 2 + L.ph) * 0.05;
      } else {
        setTag(L, '空', '#8a8a8a');
        L.tag.visible = d < 7; L.tag.material.opacity = Math.max(0, Math.min(0.75, (7 - d) / 3));
        L.tag.position.y = L.isChest ? 1.75 : 0.9;
      }
    }
    // forget corpses that got recycled / chests that vanished
    for (const [src, L] of LOOKS) if (!live.has(src)) { L.g.parent && L.g.parent.remove(L.g); for (const sh of L.outl) sh.parent && sh.parent.remove(sh); if (L.tag.material.map) L.tag.material.map.dispose(); LOOKS.delete(src); }
  }
})();
