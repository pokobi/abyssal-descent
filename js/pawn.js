'use strict';
// Pawn counter in the merchant hall: sell weapons, melee weapons, skills, attachments, items and grenades for a fraction of their price.
// The starting pistol (and bare fists) can't be sold; selling a weapon or an attachment mounted on one asks for confirmation first.
(function () {
  const PW = (G.Pawn = {});
  const U = G.U;
  PW.RATE = 0.4; // sell for 40% of the base price
  const P = () => G.player, GM = () => G.game;
  const fmt = (n) => U.fmt(n);
  const R = (r) => G.ui.R(r);

  PW.weaponValue = (w) => w.def.price ? Math.max(5, Math.round(w.def.price * PW.RATE * (1 + 0.2 * (w.lv || 0)) / 5) * 5) : (w.lv || 0) * 60;
  PW.meleeValue = (m) => m.def.price ? Math.max(5, Math.round(m.def.price * PW.RATE * (1 + 0.2 * (m.lv || 0)) / 5) * 5) : (m.lv || 0) * 60;
  PW.attValue = (id) => { const a = G.ATT_BY_ID[id]; return a ? Math.max(1, Math.round((a.price || 0) * PW.RATE / 5) * 5) : 0; };
  PW.skillValue = (sk) => Math.max(1, Math.round((sk.def.price || 0) * PW.RATE * (1 + 0.2 * (sk.lv || 0)) / 5) * 5);
  PW.itemValue = (id) => { const it = G.ITEM_BY_ID[id]; return it ? Math.max(1, Math.round((it.price || 0) * PW.RATE / 5) * 5) : 0; };

  function pay(v, what) {
    GM().run.coins += v;
    G.sfx.coins && G.sfx.coins(Math.min(8, 2 + Math.floor(v / 200)));
    G.sfx.ui('buy');
    G.ui.toast(`⚖️ ${what} を売却 +${fmt(v)}🪙`, 'good');
    G.ui.refreshWeapon(); G.ui.refreshItems();
    G.ui._ikey = null;
  }
  // re-open the list after every sale (or after backing out of a confirmation)
  const again = () => { GM()._keepModal = true; setTimeout(PW.open, 0); };

  function sellGun(w, withAtts) {
    const p = P(), i = p.weapons.indexOf(w); if (i < 0) return;
    let v = PW.weaponValue(w);
    const atts = Object.values(w.atts || {}).filter((a) => G.ATT_BY_ID[a]);
    if (withAtts) v += atts.reduce((s, a) => s + PW.attValue(a), 0); else for (const a of atts) p.attStash.push(a);
    w.atts = {};
    const wasCur = p.weapon === w;
    p.weapons.splice(i, 1);
    if (p.wIdx >= p.weapons.length || wasCur) p.wIdx = 0;
    else if (i < p.wIdx) p.wIdx--;
    G.weapons.dirty = true;
    if (!p.meleeMode) G.weapons.equip(false);
    pay(v, w.def.name + (withAtts && atts.length ? '（アタッチメント込み）' : ''));
    if (!withAtts && atts.length) G.ui.toastSmall(`🗃️ アタッチメント${atts.length}個をインベントリへ移した`);
  }
  function sellMelee() {
    const p = P(), m = p.melee, v = PW.meleeValue(m);
    p.melee = G.weapons.makeMelee(G.BARE_MELEE || 'fists');
    if (p.meleeMode) G.weapons.melee.equip(false);
    pay(v, m.def.name);
  }
  function sellAtt(id, from) {
    const p = P();
    if (from === 'stash') { const k = p.attStash.indexOf(id); if (k < 0) return; p.attStash.splice(k, 1); }
    else { const a = G.ATT_BY_ID[id]; delete from.atts[a.slot]; from.ver++; G.weapons.dirty = true; if (!p.meleeMode && from === p.weapon) G.weapons.equip(true); }
    pay(PW.attValue(id), G.ATT_BY_ID[id].name);
  }
  function sellItem(id, grenade) {
    const p = P();
    if (grenade) { if (!p.itemCount(id)) return; p.takeItem(id); if (G.GrenHold && G.GrenHold.active()) G.GrenHold.putAway(true); }
    else if (!p.takeItem(id)) return;
    pay(PW.itemValue(id), G.ITEM_BY_ID[id].name);
  }

  function sellSkill(i) {
    const p = P(), sk = p.skills[i]; if (!sk) return;
    const v = PW.skillValue(sk);
    // Q is never empty: selling an ultimate puts the default one back
    p.skills[i] = sk.def.ult ? Object.assign(G.abilities.makeSlot(G.DEFAULT_ULT), { cd: 30 }) : null;
    G.ui.buildAbilityRow && G.ui.buildAbilityRow();
    pay(v, sk.def.name);
  }
  function confirmSkill(i) {
    const sk = P().skills[i], d = sk.def, key = G.input.skillKey(i);
    const augs = [...P().buffs.keys()].filter((id) => G.BUFF_BY_ID[id] && G.BUFF_BY_ID[id].skill === sk.id).length;
    GM().modal(`⚠ ${d.ult ? 'アルティメット' : 'スキル'}を売却しますか？`, `<b style="color:${R(d.rarity)}">[${key}] ${d.icon} ${U.esc(d.name)}${G.abilities.lvText(sk) ? ' ' + G.abilities.lvText(sk) : ''}</b> を売却します。${d.ult ? `${key}枠は初期のアルティメット（${G.SKILL_BY_ID[G.DEFAULT_ULT].name}）に戻ります。` : key + '枠は空になります。'}${augs ? `<br>このスキル専用の強化（${augs}種）は、同じスキルを再び手に入れるまで効果がありません。` : ''}`, [
      { icon: '💰', label: `売る（+${fmt(PW.skillValue(sk))}🪙）`, onPick: () => { sellSkill(i); again(); } },
      { icon: '↩', label: 'やめる', onPick: again },
    ]);
  }
  // ---------------- confirmations ----------------
  function confirmGun(w) {
    const atts = Object.values(w.atts || {}).filter((a) => G.ATT_BY_ID[a]);
    const base = PW.weaponValue(w), extra = atts.reduce((s, a) => s + PW.attValue(a), 0);
    const attTxt = atts.length ? `<br>装着中のアタッチメント：${atts.map((a) => `${G.ATT_BY_ID[a].icon} ${G.ATT_BY_ID[a].name}`).join('、')}` : '';
    const opts = [];
    if (atts.length) {
      opts.push({ icon: '🗃️', label: `武器だけ売る（+${fmt(base)}🪙）`, sub: 'アタッチメントは外してインベントリへ', onPick: () => { sellGun(w, false); again(); } });
      opts.push({ icon: '💰', label: `アタッチメントごと売る（+${fmt(base + extra)}🪙）`, sub: 'アタッチメントも一緒に手放します', onPick: () => { sellGun(w, true); again(); } });
    } else opts.push({ icon: '💰', label: `売る（+${fmt(base)}🪙）`, onPick: () => { sellGun(w, false); again(); } });
    opts.push({ icon: '↩', label: 'やめる', onPick: again });
    GM().modal('⚠ 武器を売却しますか？', `<b style="color:${R(w.def.rarity)}">${G.weapons.keyLabel(w)}${w.def.icon} ${U.esc(w.def.name)}${w.lv ? ' +' + w.lv : ''}</b> を売却します。売った武器は戻ってきません。${w.lv ? `<br>⚒️ 鍛冶の強化（+${w.lv}）も失われます。` : ''}${attTxt}`, opts);
  }
  function confirmMelee() {
    const m = P().melee;
    GM().modal('⚠ 近接武器を売却しますか？', `<b style="color:${R(m.def.rarity)}">${m.def.icon} ${U.esc(m.def.name)}${m.lv ? ' +' + m.lv : ''}</b> を売却します。売ると近接武器は素手になります。`, [
      { icon: '💰', label: `売る（+${fmt(PW.meleeValue(m))}🪙）`, onPick: () => { sellMelee(); again(); } },
      { icon: '↩', label: 'やめる', onPick: again },
    ]);
  }
  function confirmAtt(id, w) {
    const a = G.ATT_BY_ID[id];
    GM().modal('⚠ 装着中のアタッチメントを売却しますか？', `<b style="color:${R(a.rarity)}">${a.icon} ${U.esc(a.name)}</b> は <b>${G.weapons.keyLabel(w)}${w.def.icon} ${U.esc(w.def.name)}</b> に装着中です。<br>外して売却すると、その武器から効果（${U.esc(a.desc)}）がなくなります。`, [
      { icon: '💰', label: `外して売る（+${fmt(PW.attValue(id))}🪙）`, onPick: () => { sellAtt(id, w); again(); } },
      { icon: '↩', label: 'やめる', onPick: again },
    ]);
  }

  function confirmArmor(it, n) {
    const d = G.ARMOR_BY_ID[it.id], v = G.Inv.value(Object.assign({}, it, { n: 1 })) * n;
    GM().modal('⚠ エンチャント付きの防具を売却しますか？', `<b style="color:${R(d.rarity)}">${G.armorIcon(d)} ${U.esc(d.name)}${n > 1 ? ` ×${n}` : ''}</b> を売却します。<br>付与されているエンチャント：${it.ench.map((e) => U.esc(G.enchantText(e))).join('、')}<br>売った防具は戻ってきません。`, [
      { icon: '💰', label: `売る（+${fmt(v)}🪙）`, onPick: () => { sellInst(it, n); again(); } },
      { icon: '↩', label: 'やめる', onPick: again },
    ]);
  }  // ---------------- the counter: categories, one row per thing, bulk sale of valuables ----------------
  PW.tab = 'all';
  const CATS = [['all', '全て'], ['weapon', '🔫 武器'], ['melee', '🗡️ 近接'], ['att', '🔩 アタッチメント'], ['item', '🧪 消耗品'], ['grenade', '💣 投擲物'], ['skill', '🔮 スキル'], ['armor', '🛡️ 防具'], ['valuable', '💰 金品']];
  function sellInst(it, n) {
    const p = P(), IV = G.Inv; n = Math.min(n || 1, it.n);
    const unit = IV.value(Object.assign({}, it, { n: 1 }));
    const d = IV.def(it);
    const home = IV.pcs(p).find((c) => c.items.includes(it)) || p.bag;
    it.n -= n; if (it.n <= 0) IV.remove(home, it); else IV.changed(home);
    if (it.type === 'item' && d.cat === 'grenade' && G.GrenHold && G.GrenHold.active()) G.GrenHold.putAway(true);
    pay(unit * n, d.name + (n > 1 ? ` ×${n}` : ''));
  }
  function rows() {
    const p = P(), IV = G.Inv, out = [];
    const guns = G.weapons.gunsInOrder();
    for (const w of guns) {
      const start = w.id === 'starter', last = p.weapons.length <= 1, atts = Object.values(w.atts || {}).filter((a) => G.ATT_BY_ID[a]);
      out.push({ cat: 'weapon', icon: w.def.icon, rc: w.def.rarity, name: `${G.weapons.keyLabel(w)}${w.def.name}${w.lv ? ' +' + w.lv : ''}`, sub: last ? '最後の銃は売れません' : `${start ? '初期装備' : '銃'}${w.lv ? `・強化+${w.lv}` : start ? '（未強化は0🪙）' : ''}${atts.length ? `・アタッチメント${atts.length}個装着中` : ''}`, v: last ? 0 : PW.weaponValue(w), no: last, act: () => { GM()._keepModal = true; setTimeout(() => confirmGun(w), 0); } });
    }
    if (p.melee && p.melee.id !== (G.BARE_MELEE || 'fists')) { const startM = p.melee.id === G.DEFAULT_MELEE; out.push({ cat: 'melee', icon: p.melee.def.icon, rc: p.melee.def.rarity, name: p.melee.def.name + (p.melee.lv ? ' +' + p.melee.lv : ''), sub: `${startM ? '初期近接武器' : '近接武器'}${p.melee.lv ? `・強化+${p.melee.lv}` : startM ? '（未強化は0🪙）' : ''}（売ると素手になる）`, v: PW.meleeValue(p.melee), act: () => { GM()._keepModal = true; setTimeout(() => confirmMelee(), 0); } }); }
    for (const w of guns) for (const sl in w.atts) { const id = w.atts[sl], a = G.ATT_BY_ID[id]; if (a) out.push({ cat: 'att', icon: a.icon, rc: a.rarity, name: a.name, sub: `${w.def.name}に装着中`, v: PW.attValue(id), act: () => { GM()._keepModal = true; setTimeout(() => confirmAtt(id, w), 0); } }); }
    p.skills.forEach((sk, i) => { if (!sk) return; const def = sk.id === G.DEFAULT_ULT; out.push({ cat: 'skill', icon: sk.def.icon, rc: sk.def.rarity, name: `[${G.input.skillKey(i)}] ${sk.def.name}${G.abilities.lvText(sk) ? ' ' + G.abilities.lvText(sk) : ''}`, sub: def ? '初期装備のアルティメットは売れません' : sk.def.ult ? 'アルティメット' : 'スキル', v: def ? 0 : PW.skillValue(sk), no: def, act: () => { GM()._keepModal = true; setTimeout(() => confirmSkill(i), 0); } }); });
    // everything in the bag
    for (const it of IV.pcs(p).flatMap((c) => c.items).sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.id || '').localeCompare(b.id || ''))) {
      const d = IV.def(it); if (!d) continue;
      const cat = it.type === 'item' ? (d.cat === 'grenade' ? 'grenade' : 'item') : it.type;
      const unit = IV.value(Object.assign({}, it, { n: 1 })), ask = it.type === 'armor' && !!(it.ench && it.ench.length); // enchanted armour is confirmed first
      const sub = it.type === 'armor' ? `${G.ARMOR_SLOT_BY_ID[d.slot].name}防具・防御力${d.def}${it.ench && it.ench.length ? '・' + it.ench.map(G.enchantText).join(' ') : ''}` : it.type === 'valuable' ? '金品（売却専用）' : it.type === 'att' ? 'アタッチメント（インベントリ）' : d.passive ? '所持品（常時効果）' : cat === 'grenade' ? '投擲物' : '消耗品';
      out.push({ cat, icon: it.type === 'armor' ? G.armorIcon(d) : d.icon, rc: d.rarity, name: d.name + (it.n > 1 ? ` ×${it.n}` : ''), sub, v: unit, n: it.n, act: () => { if (ask) { GM()._keepModal = true; setTimeout(() => confirmArmor(it, 1), 0); } else { sellInst(it, 1); PW.open(); } }, actAll: it.n > 1 ? () => { if (ask) { GM()._keepModal = true; setTimeout(() => confirmArmor(it, it.n), 0); } else { sellInst(it, it.n); PW.open(); } } : null });
    }
    return out;
  }
  function getBulk(tab) {
    const p = P(), IV = G.Inv;
    if (tab === 'valuable' || tab === 'all') {
      const items = p.bag.items.filter((o) => o.type === 'valuable');
      const sum = items.reduce((s, o) => s + IV.value(o), 0);
      return {
        label: `💰 金品を一括売却（${items.length}点 +${fmt(sum)}🪙）`,
        count: items.length,
        primary: true,
        act: () => {
          if (!items.length) return;
          for (const o of items) IV.remove(p.bag, o);
          pay(sum, `金品${items.length}点`);
          PW.open();
        },
      };
    }
    if (tab === 'armor') {
      const armors = p.bag.items.filter((o) => o.type === 'armor');
      const count = armors.reduce((n, o) => n + (o.n || 1), 0);
      const sum = armors.reduce((s, o) => s + IV.value(o), 0);
      const ench = armors.filter((o) => o.ench && o.ench.length);
      const epics = armors.filter((o) => { const d = IV.def(o); return d && G.RARITY[d.rarity]?.tier >= 3; });
      return {
        label: `🛡️ 未装備の防具を一括売却（${count}点 +${fmt(sum)}🪙）`,
        count,
        primary: false,
        act: () => {
          if (!armors.length) return;
          const doSell = () => {
            for (const o of armors.slice()) IV.remove(p.bag, o);
            pay(sum, `防具${count}点`);
            G.ui.toast(`🛡️ 未装備の防具 ${count}点を売却した（+${fmt(sum)}🪙）`, 'good');
            PW.open();
          };
          if (ench.length || epics.length) {
            GM()._keepModal = true;
            const w = [];
            if (ench.length) w.push(`エンチャント付き <b>${ench.length}点</b>`);
            if (epics.length) w.push(`エピック以上 <b>${epics.length}点</b>`);
            GM().modal('🛡️ 防具を一括売却しますか？', `未装備の防具 <b>${count}点（+${fmt(sum)}🪙）</b> を売却します。<br><span style="color:#e080ff">⚠️ ${w.join('、')} が含まれています。</span>`, [
              { icon: '💰', label: `すべて売る（+${fmt(sum)}🪙）`, onPick: doSell },
              { icon: '↩', label: 'やめる', onPick: again },
            ]);
          } else doSell();
        },
      };
    }
    if (tab === 'att') {
      const atts = p.bag.items.filter((o) => o.type === 'att');
      const count = atts.reduce((n, o) => n + (o.n || 1), 0);
      const sum = atts.reduce((s, o) => s + IV.value(o), 0);
      return {
        label: `🔩 未装着アタッチメントを一括売却（${count}点 +${fmt(sum)}🪙）`,
        count,
        primary: false,
        act: () => {
          if (!atts.length) return;
          for (const o of atts.slice()) IV.remove(p.bag, o);
          pay(sum, `アタッチメント${count}点`);
          G.ui.toast(`🔩 未装着アタッチメント ${count}点を売却した（+${fmt(sum)}🪙）`, 'good');
          PW.open();
        },
      };
    }
    if (tab === 'item') {
      const items = IV.pcs(p).flatMap((c) => c.items).filter((o) => o.type === 'item' && G.ITEM_BY_ID[o.id] && G.ITEM_BY_ID[o.id].cat !== 'grenade');
      const count = items.reduce((n, o) => n + (o.n || 1), 0);
      const sum = items.reduce((s, o) => s + IV.value(o), 0);
      return {
        label: `🧪 消耗品を一括売却（${count}点 +${fmt(sum)}🪙）`,
        count,
        primary: false,
        act: () => {
          if (!items.length) return;
          for (const o of items.slice()) {
            const home = IV.pcs(p).find((c) => c.items.includes(o)) || p.bag;
            IV.remove(home, o);
          }
          pay(sum, `消耗品${count}点`);
          G.ui.toast(`🧪 消耗品 ${count}点を売却した（+${fmt(sum)}🪙）`, 'good');
          PW.open();
        },
      };
    }
    if (tab === 'grenade') {
      const grens = IV.pcs(p).flatMap((c) => c.items).filter((o) => o.type === 'item' && G.ITEM_BY_ID[o.id] && G.ITEM_BY_ID[o.id].cat === 'grenade');
      const count = grens.reduce((n, o) => n + (o.n || 1), 0);
      const sum = grens.reduce((s, o) => s + IV.value(o), 0);
      return {
        label: `💣 投擲物を一括売却（${count}点 +${fmt(sum)}🪙）`,
        count,
        primary: false,
        act: () => {
          if (!grens.length) return;
          for (const o of grens.slice()) {
            const home = IV.pcs(p).find((c) => c.items.includes(o)) || p.bag;
            IV.remove(home, o);
          }
          if (G.GrenHold && G.GrenHold.active()) G.GrenHold.putAway(true);
          pay(sum, `投擲物${count}点`);
          G.ui.toast(`💣 投擲物 ${count}点を売却した（+${fmt(sum)}🪙）`, 'good');
          PW.open();
        },
      };
    }
    return null;
  }
  PW.open = function () {
    const p = P(), IV = G.Inv;
    const all = rows();
    const list = all.filter((r) => PW.tab === 'all' || r.cat === PW.tab);
    const bulk = getBulk(PW.tab);
    GM().state = 'modal'; G.input.exitLock();
    const s = G.ui.screen(`<div class="panel pw-panel" style="width:min(940px,96vw)">
      <div class="pw-head"><h2>⚖️ 買取屋</h2><span>買値の<b>${Math.round(PW.RATE * 100)}%</b>で買い取る（金品は満額）</span>${G.ui.coinBox()}</div>
      <div class="pw-tabs">${CATS.map(([k, n]) => { const c = k === 'all' ? all.length : all.filter((r) => r.cat === k).length; return `<span class="pw-tab${PW.tab === k ? ' on' : ''}${c ? '' : ' none'}" data-t="${k}">${n} <small>${c}</small></span>`; }).join('')}</div>
      <div class="pw-bulk">${bulk ? `<button class="btn${bulk.primary && bulk.count ? ' primary' : ''}" id="pw-bulk-btn" ${bulk.count ? '' : 'disabled'}>${bulk.label}</button>` : ''}</div>
      <div class="pw-list">${list.length ? list.map((r, i) => `<div class="pw-row${r.no ? ' no' : ''}" style="--rc:${R(r.rc || 'common')}"><span class="pw-ic">${r.icon}</span><div class="pw-t"><b>${U.esc(r.name)}</b><small>${U.esc(r.sub)}</small></div><span class="pw-v">${r.no ? '—' : '+' + fmt(r.v) + '🪙' + (r.n > 1 ? '<small>/1個</small>' : '')}</span>${r.no ? '' : `<button class="btn small" data-s="${i}">売る</button>`}${r.actAll ? `<button class="btn small" data-a="${i}">すべて（+${fmt(r.v * r.n)}）</button>` : ''}</div>`).join('') : '<div class="pw-none">売れるものがない</div>'}</div>
      <div style="text-align:right;margin-top:10px"><button class="btn" id="pw-close">🚶 取引を終える</button></div></div>`, 'dim');
    s.querySelectorAll('.pw-tab').forEach((t) => t.onclick = () => { PW.tab = t.dataset.t; G.sfx.ui('click'); PW.open(); });
    s.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => list[+b.dataset.s].act());
    s.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => list[+b.dataset.a].actAll());
    if (bulk) {
      const b = s.querySelector('#pw-bulk-btn');
      if (b) b.onclick = bulk.act;
    }
    s.querySelector('#pw-close').onclick = () => { G.sfx.ui('click'); GM()._keepModal = false; GM().resume(); };
  };

  // ---------------- trade-in: a weapon that gets replaced is sold automatically ----------------
  // same rate as the pawn counter (starter pistol / fists are worth nothing); 鉄屑回収 adds +30% of the price on top
  PW.tradeValue = function (w, melee) {
    if (!w || (melee && w.id === (G.BARE_MELEE || 'fists'))) return 0;
    const base = melee ? PW.meleeValue(w) : PW.weaponValue(w);
    return base + (w.def.price && P().has('e_salvage') ? Math.round((w.def.price || 0) * 0.3 / 5) * 5 : 0);
  };
  PW.tradeIn = function (w, melee) {
    const v = PW.tradeValue(w, melee);
    if (v > 0) {
      GM().run.coins += v;
      G.sfx.coins && G.sfx.coins(Math.min(6, 2 + Math.floor(v / 300)));
      G.ui.toast(`♻️ ${w.def.icon} ${w.def.name} を下取り +${fmt(v)}🪙`, 'good');
    }
    return v;
  };

  // ---------------- the counter in the merchant hall ----------------
  PW.setup = function (w) {
    if (!w.sellPos) return;
    const def = G.ENEMY_BY_ID.skeleton_normal || G.ENEMY_BY_ID.imp_normal || G.ENEMIES[0];
    const m = G.enemies.buildModel(def, { ally: true });
    if (w.pawnNpc) { m.group.position.set(w.pawnNpc.x, 0, w.pawnNpc.z); m.group.rotation.y = w.pawnNpc.ry; } else { m.group.position.set(w.sellPos.x - 1.6, 0, w.sellPos.z); m.group.rotation.y = Math.PI / 2; }
    w.group.add(m.group);
    w.lightSources.push({ pos: w.sellPos.clone().add(new THREE.Vector3(0, 2.2, 0)), color: '#ffe0a0', intensity: 7, range: 7, flame: 0, emit: false, ph: 0, prio: 1.6, steady: true });
    PW.npc = m;
    PW.hintStart(w);
  };
  // ---- a few seconds after you step in, the counter is pointed out: a gold glow and light pillar on it, a screen marker, and a notice ----
  PW.h = null;
  PW.hintStart = function (w) {
    PW.hintEnd();
    const n = w.pawnNpc; if (!n) return;
    const g = new THREE.Group(); g.position.set(n.x, 0, n.z - 0.8);
    const glowM = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    const box = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.5, 2.0), glowM); box.position.y = 0.62; g.add(box);
    const beamM = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 7, 16, 1, true), beamM); beam.position.y = 4.4; g.add(beam);
    w.group.add(g);
    const root = document.getElementById('worldui'), el = document.createElement('div'); el.className = 'exit-mark pawn-mark'; el.style.setProperty('--c', '#ffd060'); el.style.display = 'none';
    el.innerHTML = '<span>💰</span><em>買取屋</em><b></b>'; if (root) root.appendChild(el);
    PW.h = { w, g, glowM, beamM, el, d: el.querySelector('b'), t: 0, toasted: false, done: false };
  };
  PW.hintEnd = function () {
    const h = PW.h; if (!h) return; PW.h = null;
    if (h.g.parent) h.g.parent.remove(h.g); h.glowM.dispose(); h.beamM.dispose(); h.el.remove();
  };
  const _pv = new THREE.Vector3();
  PW.update = function (dt) {
    const h = PW.h; if (!h) return;
    const GM = G.game;
    if (G.world !== h.w || GM.stage !== 'shop') { PW.hintEnd(); return; }
    if (GM.state === 'playing') h.t += dt;
    const P = G.player, sp = h.w.sellPos, near = Math.hypot(P.pos.x - sp.x, P.pos.z - sp.z) < 3.2;
    if (near && h.t > 2) h.done = true;
    const T0 = 1.5, T1 = 11, k = h.done ? 0 : h.t < T0 ? 0 : h.t > T1 ? 0 : Math.min(1, (h.t - T0) / 0.6, (T1 - h.t) / 1.2);
    if (h.t > T1 || (h.done && h.t > 2)) { PW.hintEnd(); return; }
    if (!h.toasted && h.t >= T0) { h.toasted = true; G.ui.toast('💰 買取屋 — 要らない物や武器を売ってコインに換えられる（カウンターの前でインタラクト）', 'good'); G.sfx.ui && G.sfx.ui('select'); }
    const pulse = 0.55 + 0.45 * Math.sin(GM.time * 5);
    h.glowM.opacity = k * (0.16 + 0.16 * pulse); h.beamM.opacity = k * 0.16;
    // the screen marker: over the counter, at the screen edge when it is out of view
    const el = h.el; if (k <= 0) { el.style.display = 'none'; return; }
    _pv.set(sp.x, 3.0, sp.z + 1.4).project(G.camera);
    let sx = _pv.x, sy = _pv.y; const behind = _pv.z > 1; if (behind) { sx = -sx; sy = -sy; }
    const out = behind || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.85;
    if (out) { const q = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.85, 0.001); sx /= q; sy /= q; if (behind) sy = Math.max(sy, 0.85); }
    el.style.display = ''; el.style.opacity = (0.9 * k).toFixed(2); el.style.left = ((sx * 0.5 + 0.5) * innerWidth) + 'px'; el.style.top = ((-sy * 0.5 + 0.5) * innerHeight) + 'px';
    el.classList.toggle('edge', out);
    const dd = Math.round(Math.hypot(P.pos.x - sp.x, P.pos.z - sp.z)); if (h.dv !== dd) { h.dv = dd; h.d.textContent = dd + 'm'; }
  };
})();
