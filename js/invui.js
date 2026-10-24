'use strict';
// The one carry screen (Tab / B). Layout (1920x1080):
//   left   : status sheet (stats + boons)  -- or the chest / corpse you are searching
//   middle : armour column (head / chest / legs / feet) beside the weapons row, the hand slot + skills row and the big inventory
//            with the three special slots (grenades, healing, support) under it.
// Everything is drag & drop: items between grids, armour / attachments onto their sockets, guns and skills onto each other
// (that rearranges the keys). Drop an item outside the inventory and it is thrown on the ground. Details come as hover cards.
(function () {
  const IV = G.Inv, U = G.U;
  const UIV = (G.InvUI = {});
  let CS = 56, SC = 1;
  let root = null, P = null, GM = null, drag = null, tip = null, menu = null;
  UIV.isOpen = () => !!root;
  const isMine = (c) => !!c && !!P && (c === P.bag || c.kind === 'spec');

  // ---------------- open / close ----------------
  UIV.open = function (cont, src) {
    P = G.player; GM = G.game;
    if (!P || !GM.run || P.dead) return;
    IV.openCont = cont || null; IV.openSrc = src || null;
    if (GM.state === 'playing') { GM.state = 'inv'; G.input.exitLock(); }
    if (!root) {
      root = document.createElement('div'); root.id = 'inv-ui';
      G.ui.el.hud.appendChild(root); // inside the HUD layer, so the message areas (toasts, banners ...) can sit above the dark backdrop without being moved
      root.addEventListener('contextmenu', (e) => e.preventDefault());
      // (a right click on an item opens the menu in its own handler, which runs first: do not close it again here)
      root.addEventListener('pointerdown', (e) => { if (e.button === 2 && e.target.closest('.iv-it, .iv-wbox')) return; if (!menu || !menu.contains(e.target)) closeMenu(); });
      window.addEventListener('resize', onResize);
    }
    G.sfx.ui('open'); G.ui.showInteract(null); G.ui.holdRing(-1);
    render();
  };
  function onResize() { if (root && !drag) render(); }
  // build the screen once, hidden and silent (both the Tab view and the loot view), so the first real opening has its styles,
  // fonts and layout ready. Called once per page from G.Warm.ui().
  UIV.warm = function () {
    if (root || UIV._warm) return;
    P = G.player; GM = G.game; if (!P || !GM.run || P.dead) return;
    UIV._warm = true;
    const keepCont = IV.openCont, keepSrc = IV.openSrc, sfxUi = G.sfx.ui;
    G.sfx.ui = () => {};
    try {
      for (const cont of [null, IV.container(6, 4, '', 'box')]) {
        IV.openCont = cont; IV.openSrc = null;
        root = document.createElement('div'); root.id = 'inv-ui'; root.style.visibility = 'hidden';
        G.ui.el.hud.appendChild(root);
        render(); root.offsetHeight;
        try { G.StatusUI.unmount(); } catch (e) { /* ignore */ }
        root.remove(); root = null;
        const ov = G.ui.el.statusOv; G.ui.statusOverlay(false);
        for (const k of ['left', 'top', 'width', 'height', 'right', 'bottom']) ov.style.removeProperty(k);
        document.body.classList.remove('inv-open', 'inv-loot'); document.body.style.removeProperty('--s');
      }
    } catch (e) { console.warn('inventory warm-up failed', e); root = null; }
    G.sfx.ui = sfxUi; IV.openCont = keepCont; IV.openSrc = keepSrc;
  };
  UIV.close = function () {
    if (!root) return;
    if (drag) endDrag(null);
    closeMenu(); hideTip();
    window.removeEventListener('resize', onResize);
    root.remove(); root = null;
    const ov = G.ui.el.statusOv;
    G.ui.statusOverlay(false);
    for (const k of ['left', 'top', 'width', 'height', 'right', 'bottom']) ov.style.removeProperty(k);
    document.body.classList.remove('inv-open', 'inv-loot'); document.body.style.removeProperty('--s');
    if (IV.openSrc && IV.openSrc.onClose) IV.openSrc.onClose();
    IV.openCont = null; IV.openSrc = null;
    if (G.game.state === 'inv') G.game.resume();
    G.sfx.ui('click');
  };
  UIV.toggle = () => (root ? UIV.close() : UIV.open(null));
  IV.onChange = () => { if (root && !drag) render(); };

  // ---------------- render ----------------
  const R = (r) => G.ui.R(r || 'common');
  const px = (n) => Math.round(n) + 'px';
  function itemEl(it, where, cell) {
    cell = cell || CS;
    const d = IV.def(it); if (!d) return '';
    const [w, h] = IV.size(it);
    const big = Math.min(w, h);
    const ench = it.ench && it.ench.length ? `<i class="iv-ench">${'✦'.repeat(it.ench.length)}</i>` : '';
    const fit = it.type === 'att' && attFits(it);
    const dur = it.type === 'armor' ? durBar(it) : '';
    return `<div class="iv-it t-${it.type}${fit ? ' iv-fit' : ''}" data-uid="${it.uid}" data-where="${where}" style="--rc:${R(d.rarity)};left:${it.x * cell}px;top:${it.y * cell}px;width:${w * cell - 3}px;height:${h * cell - 3}px">
      <span class="iv-ic" style="font-size:${px((big >= 2 ? 0.8 : 0.56) * cell)}">${it.type === 'armor' ? G.armorIcon(d) : d.icon}</span>${it.n > 1 ? `<b class="iv-n">${it.n}</b>` : ''}${it.type === 'armor' ? `<em class="iv-def">🛡${d.def}</em>` : ''}${fit ? '<b class="iv-fitb">装着可</b>' : ''}${ench}${it.type === 'valuable' ? `<em class="iv-val">${U.fmt(IV.value(it))}</em>` : ''}${dur}</div>`;
  }
  // armour durability: a thin bar along the bottom of the cell (green > amber > red)
  function durBar(it) {
    const f = IV.durFrac(it), col = f > 0.5 ? '#6ee06a' : f > 0.2 ? '#f0b040' : '#ff4a3a';
    return `<i class="iv-dur" style="--f:${f.toFixed(3)};--dc:${col}"></i>`;
  }
  // an attachment that would be a free upgrade: some gun has its socket empty and can take it
  function attFits(it) { const a = G.ATT_BY_ID[it.id]; return !!a && G.weapons.gunsInOrder().some((w) => !w.atts[a.slot] && a.compat(w.def)); }
  function gridEl(c, key, cell) {
    cell = cell || CS;
    return `<div class="iv-grid" data-grid="${key}" data-cs="${cell}" style="width:${c.cols * cell}px;height:${c.rows * cell}px;--cs:${cell}px">${c.items.map((it) => itemEl(it, key, cell)).join('')}</div>`;
  }
  function eqBox(S, cls) {
    const it = P.equip[S.id], d = it && IV.def(it);
    return `<div class="iv-eq ${cls || ''}${it ? ' on' : ''}" data-eq="${S.id}" style="--rc:${d ? R(d.rarity) : '#3a332a'}">
      <span class="iv-eql">${S.name}</span>${it ? `<div class="iv-it t-armor" data-uid="${it.uid}" data-where="eq:${S.id}" style="--rc:${R(d.rarity)};position:relative;width:100%;height:100%"><span class="iv-ic" style="font-size:${px(CS * 0.95)}">${G.armorIcon(d)}</span><em class="iv-def">🛡${d.def}</em>${it.ench && it.ench.length ? `<i class="iv-ench">${'✦'.repeat(it.ench.length)}</i>` : ''}${durBar(it)}</div>` : `<span class="iv-ghosticon">${S.icon}</span>`}</div>`;
  }
  function weaponBoxes() {
    const W = G.weapons, guns = W.gunsInOrder(), A = G.ATT_BY_ID;
    const out = [0, 1].map((i) => {
      const w = guns[i];
      if (!w) return `<div class="iv-wbox empty" data-wslot="${i}"><div class="iv-wh"><kbd>${G.K('w' + (i + 1))}</kbd><span class="wnm"><b class="dim">— 武器スロット —</b></span></div></div>`;
      const cells = Object.keys(G.ATT_SLOTS).map((sl) => {
        const id = w.atts[sl], a = id && A[id], S = G.ATT_SLOTS[sl];
        const wantsOne = !a && [...P.bag.items, ...(IV.openCont ? IV.openCont.items : [])].some((q) => { const qa = q.type === 'att' && A[q.id]; return qa && qa.slot === sl && qa.compat(w.def); });
        return `<div class="iv-as${a ? ' on' : ''}${wantsOne ? ' iv-fitslot' : ''}" data-as="${i}:${sl}" style="--rc:${a ? R(a.rarity) : '#3a332a'}">${a ? `<div class="iv-it t-att" data-uid="0" data-where="as:${i}:${sl}" style="--rc:${R(a.rarity)};position:relative;width:100%;height:100%"><span class="iv-ic" style="font-size:${px(CS * 0.5)}">${a.icon}</span></div>` : `<span class="iv-asl">${S.icon}<small>${S.name}</small></span>`}</div>`;
      }).join('');
      const dps = Math.round(W.dps(W.stats(w)));
      return `<div class="iv-wbox" data-wslot="${i}" style="--rc:${R(w.def.rarity)}"><div class="iv-wh"><kbd>${i + 1}</kbd><span class="wnm"><b style="color:${R(w.def.rarity)}">${U.esc(w.def.name)}${w.lv ? ' +' + w.lv : ''}</b><small>${U.esc(w.def.cat || '')}</small></span><span class="wdps"><b>${dps}</b><small>DPS</small></span></div><div class="iv-wpv">${G.StatusUI.preview('gun', w.def, w.atts)}</div><div class="iv-asg">${cells}</div></div>`;
    });
    const m = P.melee, md = m.def, ms = W.meleeStats(m);
    out.push(`<div class="iv-wbox mel" data-melee="1" style="--rc:${R(md.rarity)}"><div class="iv-wh"><kbd>${G.K('w3')}</kbd><span class="wnm"><b style="color:${R(md.rarity)}">${U.esc(md.name)}${m.lv ? ' +' + m.lv : ''}</b><small>${U.esc(md.cat || '')}・固定</small></span><span class="wdps"><b>${Math.round(ms.dmg / ms.swing)}</b><small>DPS</small></span></div><div class="iv-wpv">${G.StatusUI.preview('melee', md)}</div>
      <div class="iv-mst"><div><small>ダメージ</small><b>${Math.round(ms.dmg)}</b></div><div><small>間隔</small><b>${ms.swing.toFixed(2)}s</b></div><div><small>リーチ</small><b>${ms.range}m</b></div></div></div>`);
    return out.join('');
  }
  function skillBoxes() {
    const A = G.abilities, out = [];
    P.skills.forEach((sk, i) => {
      const key = G.input.skillKey(i);
      if (!sk) { out.push(`<div class="iv-sk empty${i === 0 ? ' ult' : ''}" data-sk="${i}"><kbd>${key}</kbd><span class="snm dim">— 空き —</span></div>`); return; }
      const ready = A.ready(sk), st = sk.maxCharges ? `${sk.charges}/${sk.maxCharges}` : ready ? 'READY' : `${Math.ceil(sk.cd)}s`;
      out.push(`<div class="iv-sk${i === 0 ? ' ult' : ''}" data-sk="${i}" style="--rc:${R(sk.def.rarity)}"><kbd>${key}</kbd><span class="sic">${sk.def.icon}</span><span class="snm">${U.esc(sk.def.name)}</span><span class="sst${ready ? ' ok' : ''}">${A.lvHTML(sk) ? A.lvHTML(sk) + ' · ' : ''}${st}</span></div>`);
    });
    const pi = P.pileInfo();
    out.push(`<div class="iv-sk fixed" data-sk="pile" style="--rc:var(--gold2)"><kbd>${G.input.keyName('crouch')}</kbd><span class="sic">🔨</span><span class="snm">パイルドライバー</span><span class="sst${P.pileReady() ? ' ok' : ''}">${pi.lvl ? 'Lv' + pi.lvl + ' · ' : ''}${P.pileReady() ? 'READY' : Math.ceil(P.pileCd) + 's'}</span></div>`);
    return out.join('');
  }
  // the contracted mercenary under the armour column: Lv, HP (with the locked part), XP. Hover for the full numbers.
  function mercChip() {
    const R2 = G.Rooms2, m = GM.run && GM.run.merc; if (!R2 || !m || m.left <= 0 || !R2.mercStats) return '';
    const s = R2.mercStats(m), a = R2.mercAlly, hp = a ? a.hp : s.cap, need = m.lv >= R2.MERC.cap ? 0 : R2.mercNeed(m.lv), down = a && a.down > 0;
    return `<div class="iv-merc${down ? ' down' : ''}" data-merc="1"><div class="mc-h"><span>${s.d.icon}</span><b>Lv${m.lv}</b><small>残${m.left}</small></div><div class="pa-hp"><div style="width:${U.clamp(hp / s.full, 0, 1) * 100}%"></div>${s.downs ? `<i class="pa-lock" style="width:${Math.min(100, s.downs * 25)}%"></i>` : ''}<span>${down ? (a.down === Infinity ? '戦闘不能' : 'ダウン ' + Math.ceil(a.down) + '秒') : Math.ceil(hp) + '/' + s.cap}</span></div><div class="pa-xp"><div style="width:${need ? U.clamp((m.xp || 0) / need, 0, 1) * 100 : 100}%"></div><span>${need ? 'XP ' + (m.xp || 0) + '/' + need : 'XP MAX'}</span></div></div>`;
  }
  function render() {
    if (!root) return;
    const loot = !!IV.openCont, C = IV.openCont;
    // layout: sizes come from the window so nothing is wasted (1920x1080 = 1.0)
    // phone: a taller virtual screen (the root scrolls) and no status column - the status sheet stays in the pause menu
    const MB = !!window.G_MOBILE;
    const Wd = innerWidth, Ht = MB ? Math.max(innerHeight, 520) : innerHeight;
    SC = MB ? Math.max(0.3, Math.min(1, Math.min(Wd / 1920, Ht / 1080))) : Math.max(0.62, Math.min(1.6, Math.min(Wd / 1920, Ht / 1080)));
    const padX = Wd * 0.02, padY = Ht * 0.03, gap = Math.round(10 * SC);
    const IW = Wd - 2 * padX, IH = Ht - 2 * padY;
    const sw = MB ? 0 : Math.round(IW * 0.25), aw = Math.round(IW * 0.095), mw = IW - sw - aw - 2 * gap;
    const footH = Math.round(24 * SC), hW = Math.round(IH * 0.31), hS = Math.round(IH * 0.15), hI = IH - hW - hS - footH - 3 * gap;
    CS = Math.floor(Math.max(24, 0.9 * Math.min((mw - 30 * SC) / IV.BAG[0], (hI - 86 * SC) / (IV.BAG[1] + 1))));
    // looting: only the inventory, big and centred (bag next to the chest / corpse) so it never looks like the Tab screen
    if (loot) CS = Math.floor(Math.max(26, Math.min((IW * 0.95 - 90 * SC - 250 * SC) / (IV.BAG[0] + C.cols * 1.3), (IH * 0.88 - 150 * SC) / (IV.BAG[1] + 1), (IH * 0.88 - 150 * SC) / (C.rows * 1.3))));
    document.body.style.setProperty('--s', (MB ? Math.max(SC, 0.5) : SC).toFixed(3));
    document.body.classList.add('inv-open');
    document.body.classList.toggle('inv-loot', loot);
    const st = P.stats, def = st.defense || 0;
    const SL = G.ARMOR_SLOT_BY_ID;
    const valTotal = P.bag.items.filter((o) => o.type === 'valuable').reduce((s, o) => s + IV.value(o), 0);
    const specs = IV.SPEC.map((S) => `<div class="iv-spec" data-spec="${S.id}"><div class="iv-sph"><span>${S.icon} ${S.name}</span><kbd>${G.K(S.key)}</kbd></div>${gridEl(P.spec[S.id], 'spec:' + S.id)}</div>`).join('');
    const help = `<div class="iv-hs"><span>🛡 防御 <b>${Math.round(def)}</b></span><span>⚖ 重さ <b>${(st.weight || 0).toFixed(1)}</b></span></div>`;
    const foot = `<div class="iv-foot">ドラッグで移動・入れ替え　<b>R</b> 回転　<b>右クリック</b> メニュー　<b>ダブルクリック</b> 使う／装備　<b>Shift+クリック</b> 反対側へ　枠の外へドラッグ＝捨てる　<b>${G.K('status')}</b>・<b>Esc</b> 閉じる</div>`;
    const left = loot
      ? `<div class="iv-panel iv-contp"><div class="iv-ph"><b>${C.kind === 'corpse' ? '💀 ' + U.esc(C.name) + 'の亡骸' : '📦 ' + U.esc(C.name)}</b><button class="btn small" id="iv-all">すべて取る</button></div><div class="iv-contbody">${gridEl(C, 'cont', Math.round(CS * 1.3))}</div></div>`
      : '';
    const ov = G.ui.el.statusOv;
    if (loot || MB) G.ui.statusOverlay(false); else G.ui.statusOverlay(true, true, true);
    const invPanel = `<div class="iv-panel iv-invpanel"><div class="iv-ph"><b>🎒 インベントリ</b><span>${P.bag.items.length}個　·　金品の価値 <b>${U.fmt(valTotal)}</b>🪙<button class="iv-sort" id="iv-sort" title="種類 → レアリティ順に並べて左上へ詰める">⇅ 整理</button></span></div><div class="iv-bagwrap">${gridEl(P.bag, 'bag')}</div><div class="iv-specs">${specs}</div></div>`;
    if (loot) {
      const eqPanel = `<div class="iv-panel iv-eqpanel"><div class="iv-ph"><b>🛡 装備</b><span>防御 <b>${Math.round(def)}</b></span></div><div class="iv-eqgrid">${eqBox(SL.head, 'head')}${eqBox(SL.chest)}${eqBox(SL.hands)}${eqBox(SL.legs)}${eqBox(SL.feet)}</div></div>`;
      root.innerHTML = `<div class="iv-screen loot" style="--cs:${CS}px;--gap:${gap}px;width:${IW}px;height:${IH}px;left:${padX}px;top:${padY}px"><div class="iv-lootrow">${eqPanel}${invPanel}${left}</div><div class="iv-lootnote">ドラッグで移動・入れ替え　<b>ダブルクリック</b> 反対側へ移す／使う　<b>右クリック</b> メニュー　<b>R</b> 回転　<b>${G.K('interact')}</b>・<b>Esc</b> 閉じる　（装備の確認は ${G.K('status')} キー）</div></div>`;
    } else
    root.innerHTML = `<div class="iv-screen" style="--cs:${CS}px;--sw:${sw}px;--aw:${aw}px;--hw:${hW}px;--hs:${hS}px;--ft:${footH}px;--gap:${gap}px;width:${IW}px;height:${IH}px;left:${padX}px;top:${padY}px">
      <div class="iv-cell-st">${left}</div>
      <div class="iv-armorcol">${eqBox(SL.head, 'head')}${eqBox(SL.chest)}${eqBox(SL.legs)}${eqBox(SL.feet)}${help}${mercChip()}</div>
      <div class="iv-weaprow">${weaponBoxes()}</div>
      <div class="iv-foot-wrap">${foot}</div>
      <div class="iv-skillrow">${eqBox(SL.hands, 'hand')}<div class="iv-sks">${skillBoxes()}</div></div>
      ${invPanel}
    </div>`;
    const srt = root.querySelector('#iv-sort');
    if (srt) srt.onclick = () => { closeMenu(); const ok = IV.sortContainer(P.bag); G.sfx.ui(ok ? 'select' : 'deny'); if (!ok) G.ui.toastSmall('🎒 並べ替えできなかった'); render(); };
    const all = root.querySelector('#iv-all');
    if (all) all.onclick = () => { takeAll(); };
    root.querySelectorAll('.iv-it').forEach((el) => wire(el));
    root.querySelectorAll('.iv-wbox[data-wslot]').forEach((el) => wireBox(el, 'w'));
    root.querySelectorAll('.iv-wbox[data-melee]').forEach((el) => wireBox(el, 'm'));
    root.querySelectorAll('.iv-sk').forEach((el) => wireBox(el, 's'));
    root.querySelectorAll('.iv-merc').forEach((el) => {
      el.addEventListener('mouseenter', (e) => { if (!drag) showTip(G.Rooms2.mercTip(), e, false); });
      el.addEventListener('mousemove', (e) => { if (!drag && tip) placeTip(e); });
      el.addEventListener('mouseleave', hideTip);
    });
    G.StatusUI.mount(root);
    // the status sheet fills the left cell (it lives in the HUD layer, so it is placed over it)
    if (!loot && !MB) {
      const r = root.querySelector('.iv-cell-st').getBoundingClientRect();
      ov.style.setProperty('left', r.left + 'px', 'important'); ov.style.setProperty('top', r.top + 'px', 'important');
      ov.style.setProperty('width', r.width + 'px', 'important'); ov.style.setProperty('height', r.height + 'px', 'important');
      ov.style.setProperty('right', 'auto', 'important'); ov.style.setProperty('bottom', 'auto', 'important');
    }
  }
  function takeAll() {
    const C = IV.openCont; if (!C) return;
    let moved = 0;
    for (const it of C.items.slice()) { IV.remove(C, it); const left = IV.stow(P, it); if (left > 0) { it.n = left; it.rot = false; IV.put(C, it); } else moved++; }
    G.sfx.ui(moved ? 'select' : 'deny');
    if (C.items.length) G.ui.toastSmall('🎒 入りきらない物が残った');
    render();
  }

  // ---------------- lookup ----------------
  const contOf = (key) => (key === 'bag' ? P.bag : key === 'cont' ? IV.openCont : key && key.startsWith('spec:') ? P.spec[key.slice(5)] : null);
  function findIt(el) {
    const uid = +el.dataset.uid, where = el.dataset.where;
    if (where.startsWith('eq:')) { const s = where.slice(3); return { it: P.equip[s], from: null, eq: s }; }
    if (where.startsWith('as:')) { const [, i, sl] = where.split(':'); const w = G.weapons.gunsInOrder()[+i], id = w && w.atts[sl]; return { it: id ? IV.make('att', id, 1) : null, from: null, as: { w, sl } }; }
    const c = contOf(where); return { it: c && c.items.find((o) => o.uid === uid), from: c, eq: null };
  }

  // ---------------- interactions ----------------
  let lastDown = { key: '', t: 0 };
  function wire(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { e.preventDefault(); openMenu(el, e); return; }
      if (e.button !== 0) return;
      closeMenu();
      const f = findIt(el); if (!f.it) return;
      if (e.shiftKey) { quickMove(f); return; }
      // double click is detected here by hand: every drop re-renders the screen, so the browser's own dblclick never sees the same element twice
      const key = el.dataset.where + ':' + el.dataset.uid, now = performance.now();
      if (lastDown.key === key && now - lastDown.t < 420) { lastDown = { key: '', t: 0 }; hideTip(); primary(f); return; }
      lastDown = { key, t: now };
      startDrag(f, el, e);
    });
    el.addEventListener('mouseenter', (e) => { if (!drag) showTip(UIV.describe(findIt(el).it), e); });
    el.addEventListener('mousemove', (e) => { if (!drag && tip) placeTip(e); });
    el.addEventListener('mouseleave', hideTip);
  }
  // weapon / skill boxes: hover card + drag (guns swap keys 1/2, skills swap keys X/Z/V)
  function wireBox(el, kind) {
    const html = () => {
      const SU = G.StatusUI;
      if (kind === 'm') return SU.meleeTip();
      if (kind === 'w') { const w = G.weapons.gunsInOrder()[+el.dataset.wslot]; return w ? SU.gunTip(w) : ''; }
      const k = el.dataset.sk; if (k === 'pile') return SU.pileTip();
      const sk = P.skills[+k]; return sk ? SU.skillTip(sk, G.input.skillKey(+k)) : '';
    };
    el.addEventListener('mouseenter', (e) => { if (!drag) showTip(html(), e, true); });
    el.addEventListener('mousemove', (e) => { if (!drag && tip) placeTip(e); });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('pointerdown', (e) => {
      // right click on a gun: its menu (the last gun cannot be thrown away)
      if (e.button === 2 && kind === 'w' && !el.classList.contains('empty') && !e.target.closest('.iv-as')) {
        e.preventDefault(); closeMenu(); hideTip();
        const w = G.weapons.gunsInOrder()[+el.dataset.wslot]; if (!w) return;
        popMenu([['🗑️ 捨てる', () => { if (GM.dropGun(w)) { G.sfx.ui('click'); G.ui.toastSmall(`🗑️ ${w.def.name} を捨てた`); } else { G.sfx.ui('deny'); G.ui.toastSmall('最後の銃は捨てられない'); } render(); }]], e);
        return;
      }
      if (e.button !== 0 || e.target.closest('.iv-as')) return;
      closeMenu();
      if (kind === 'w' && !el.classList.contains('empty') && G.weapons.gunsInOrder().length) startDrag({ wslot: +el.dataset.wslot }, el, e);
      else if (kind === 's' && el.dataset.sk !== 'pile' && el.dataset.sk !== '0' && !el.classList.contains('empty')) startDrag({ sk: +el.dataset.sk }, el, e);
    });
  }
  function usable(it) { const d = IV.def(it); return it.type === 'item' && d && !d.passive && d.cat !== 'grenade'; }
  function primary(f) {
    const it = f.it;
    if (f.eq) { IV.unequip(P, f.eq); render(); return; }
    if (f.as) { unequipAtt(f.as); return; }
    if (it.type === 'armor') { IV.equip(P, it, f.from); render(); return; } // from the bag or straight out of a chest / corpse
    if (it.type === 'att' && isMine(f.from)) { equipAtt(it); return; }
    if (!isMine(f.from)) { quickMove(f); return; }
    if (usable(it)) { UIV.close(); G.abilities.useItemId(it.id); return; }
    if (IV.openCont) quickMove(f);
  }
  function quickMove(f) {
    const it = f.it;
    if (f.as) { unequipAtt(f.as); return; }
    if (f.eq) { if (!IV.unequip(P, f.eq, P.bag)) G.sfx.ui('deny'); render(); return; }
    if (it.type === 'armor' && !f.eq && IV.openCont && !isMine(f.from)) { IV.equip(P, it, f.from); render(); return; }
    if (isMine(f.from)) {
      const to = IV.openCont;
      if (!to) { if (it.type === 'armor') { IV.equip(P, it, f.from); render(); } return; }
      IV.remove(f.from, it);
      const left = IV.put(to, it);
      if (left > 0) { it.n = left; IV.put(f.from, it); G.sfx.ui('deny'); G.ui.toastSmall('入りきらない'); } else G.sfx.ui('click');
    } else {
      IV.remove(f.from, it);
      const left = IV.stow(P, it);
      if (left > 0) { it.n = left; IV.put(f.from, it); G.sfx.ui('deny'); G.ui.toastSmall('入りきらない'); } else G.sfx.ui('click');
    }
    render();
  }
  // attachments: bag <-> gun sockets
  function equipAtt(it, gun) {
    const a = G.ATT_BY_ID[it.id], guns = G.weapons.gunsInOrder().filter((w) => a.compat(w.def));
    const w = gun || (guns.includes(P.weapon) ? P.weapon : guns[0]);
    if (!w) { G.sfx.ui('deny'); G.ui.toastSmall('付けられる銃がない'); return false; }
    if (!GM.moveAtt(it.id, 'stash', w)) { G.sfx.ui('deny'); G.ui.toastSmall('この銃には付けられない'); return false; }
    G.sfx.mech('magIn'); render(); return true;
  }
  function unequipAtt(as) {
    const id = as.w && as.w.atts[as.sl]; if (!id) return;
    if (!IV.findSpot(P.bag, IV.make('att', id, 1))) { G.sfx.ui('deny'); G.ui.toastSmall('🎒 インベントリに空きがない'); render(); return; }
    GM.moveAtt(id, as.w, 'stash'); G.sfx.mech('magOut'); render();
  }
  function discard(f) {
    const it = f.it;
    if (f.eq) { P.equip[f.eq] = null; P.recalc(); } else IV.remove(f.from, it);
    it.rot = false;
    IV.dropToGround(it, P.pos.clone().add(new THREE.Vector3(0, 0.4, 0)).addScaledVector(P.forward().setY(0).normalize(), 0.9));
    G.sfx.ui('click');
    render();
  }
  function swapGuns() {
    const o = G.weapons.order(); const t = o[0]; o[0] = o[1]; o[1] = t; P.wOrder = o.map((x) => x || null);
    G.ui.refreshWeapon(); G.sfx.ui('click');
    const a = o[0], b = o[1];
    G.ui.toastSmall(`🔁 [${G.K('w1')}] ${a ? a.def.name : '空き'}　[${G.K('w2')}] ${b ? b.def.name : '空き'}`);
  }
  function swapSkills(i, j) {
    if (i === j || ![1, 2, 3].includes(i) || ![1, 2, 3].includes(j)) { G.sfx.ui('deny'); return; }
    const t = P.skills[i]; P.skills[i] = P.skills[j]; P.skills[j] = t;
    G.ui.buildAbilityRow && G.ui.buildAbilityRow(); G.ui.refreshItems && G.ui.refreshItems();
    G.sfx.ui('click');
    G.ui.toastSmall(`🔁 ${G.input.skillKey(i)}: ${P.skills[i] ? P.skills[i].def.name : '空き'}　${G.input.skillKey(j)}: ${P.skills[j] ? P.skills[j].def.name : '空き'}`);
  }

  // ---------------- drag & drop ----------------
  function startDrag(f, el, e) {
    hideTip();
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true); ghost.classList.add('iv-ghost');
    ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
    document.body.appendChild(ghost);
    drag = { f, el, ghost, gx: e.clientX - r.left, gy: e.clientY - r.top, rot: !!(f.it && f.it.rot), x: e.clientX, y: e.clientY, w0: r.width, h0: r.height };
    el.classList.add('iv-dragging');
    glow(f);
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  // light up everything the held thing can go to
  function glow(f) {
    const add = (sel) => root.querySelectorAll(sel).forEach((n) => n.classList.add('iv-glow'));
    if (f.wslot !== undefined) { add(`.iv-wbox[data-wslot]:not([data-wslot="${f.wslot}"])`); return; }
    if (f.sk !== undefined) { for (const k of [1, 2, 3]) if (k !== f.sk) add(`.iv-sk[data-sk="${k}"]`); return; }
    const it = f.it; if (!it) return;
    if (it.type === 'armor') add(`.iv-eq[data-eq="${G.ARMOR_BY_ID[it.id].slot}"]`);
    else if (it.type === 'att') {
      const a = G.ATT_BY_ID[it.id], guns = G.weapons.gunsInOrder();
      root.querySelectorAll('.iv-as').forEach((n) => { const [i, sl] = n.dataset.as.split(':'); const w = guns[+i]; if (w && sl === a.slot && a.compat(w.def)) n.classList.add('iv-glow'); });
    } else { const k = IV.specOf(it); if (k === 'g') add('.iv-spec[data-spec="g"]'); else if (k) add('.iv-spec[data-spec="c1"],.iv-spec[data-spec="c2"]'); }
  }
  function dims() { const [w, h] = IV.baseSize(drag.f.it); return drag.rot ? [h, w] : [w, h]; }
  function moveGhost(x, y) {
    drag.x = x; drag.y = y;
    let w, h;
    if (drag.f.it) { [w, h] = dims(); w = w * CS - 3; h = h * CS - 3; drag.ghost.style.width = w + 'px'; drag.ghost.style.height = h + 'px'; }
    else { w = drag.w0; h = drag.h0; }
    drag.ghost.style.left = x - Math.min(drag.gx, w - 10) + 'px'; drag.ghost.style.top = y - Math.min(drag.gy, h - 10) + 'px';
    root.querySelectorAll('.iv-hl').forEach((n) => n.remove());
    const t = target(x, y);
    drag.ghost.classList.toggle('iv-out', !!(t && t.ground && (drag.f.it || drag.f.wslot !== undefined) && !drag.f.as));
    if (t && t.grid && drag.f.it) {
      const ok = canDrop(t);
      const [gw, gh] = dims();
      const hl = document.createElement('div'); hl.className = 'iv-hl' + (ok ? '' : ' bad');
      hl.style.left = t.cx * t.cs + 'px'; hl.style.top = t.cy * t.cs + 'px'; hl.style.width = gw * t.cs - 3 + 'px'; hl.style.height = gh * t.cs - 3 + 'px';
      t.grid.appendChild(hl);
    }
    root.querySelectorAll('.iv-eq').forEach((n) => n.classList.toggle('hover', !!(t && t.eq === n.dataset.eq)));
    root.querySelectorAll('.iv-as').forEach((n) => n.classList.toggle('hover', !!(t && t.as === n.dataset.as)));
    { const hw = t && (t.wslot !== undefined ? t.wslot : (t.as && drag.f.it && drag.f.it.type === 'att' ? +t.as.split(':')[0] : undefined)); root.querySelectorAll('[data-wslot]').forEach((n) => n.classList.toggle('hover', hw !== undefined && hw === +n.dataset.wslot)); }
    root.querySelectorAll('[data-sk]').forEach((n) => n.classList.toggle('hover', !!(t && t.sk !== undefined && t.sk === n.dataset.sk)));
  }
  function target(x, y) {
    drag.ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    drag.ghost.style.display = '';
    if (!el) return { ground: true };
    const eq = el.closest('[data-eq]'); if (eq) return { eq: eq.dataset.eq };
    const as = el.closest('[data-as]'); if (as) return { as: as.dataset.as };
    const ws = el.closest('[data-wslot]'); if (ws) return { wslot: +ws.dataset.wslot };
    const sk = el.closest('[data-sk]'); if (sk) return { sk: sk.dataset.sk };
    if (el.closest('[data-melee]')) return null;
    if (el.closest('#status-overlay')) return null;
    const grid = el.closest('[data-grid]');
    if (grid && drag.f.it) {
      const r = grid.getBoundingClientRect(), [w, h] = dims(), cs = +grid.dataset.cs || CS;
      const gl = x - Math.min(drag.gx, w * cs - 10), gt = y - Math.min(drag.gy, h * cs - 10);
      return { grid, key: grid.dataset.grid, cs, cx: Math.round((gl - r.left) / cs), cy: Math.round((gt - r.top) / cs) };
    }
    if (el.closest('.iv-panel') || el.closest('.iv-spec')) return null; // inside the inventory but not on a cell: nothing happens
    return { ground: true };
  }
  function canDrop(t) {
    const c = contOf(t.key), it = drag.f.it; if (!c) return false;
    if (c.accept && !c.accept(it)) return false;
    const [w, h] = dims();
    if (IV.fits(c, w, h, t.cx, t.cy, c === drag.f.from ? it : null)) return true;
    const over = overlapping(c, it, t.cx, t.cy, w, h);
    if (over.length === 1) { const o = over[0]; if (o.type === 'item' && it.type === 'item' && o.id === it.id && o.n < IV.maxStack(o)) return true; return !!drag.f.from; }
    return false;
  }
  function overlapping(c, it, cx, cy, w, h) {
    return c.items.filter((o) => { if (o === it) return false; const [ow, oh] = IV.size(o); return cx < o.x + ow && cx + w > o.x && cy < o.y + oh && cy + h > o.y; });
  }
  // two items trade places
  function trySwap(f, it, c, cx, cy, rot, over) {
    const src = f.from; if (!src) return false;
    const oldX = it.x, oldY = it.y, oldRot = it.rot, oX = over.x, oY = over.y, oRot = over.rot;
    const [bw, bh] = IV.baseSize(it), [w, h] = rot ? [bh, bw] : [bw, bh];
    src.items = src.items.filter((o) => o !== it); c.items = c.items.filter((o) => o !== over);
    let placed = false;
    if ((!c.accept || c.accept(it)) && IV.fits(c, w, h, cx, cy)) {
      it.x = cx; it.y = cy; it.rot = rot; c.items.push(it);
      if (!src.accept || src.accept(over)) {
        for (const r2 of [over.rot, !over.rot]) {
          const [ow, oh] = r2 ? [IV.baseSize(over)[1], IV.baseSize(over)[0]] : IV.baseSize(over);
          if (IV.fits(src, ow, oh, oldX, oldY)) { over.x = oldX; over.y = oldY; over.rot = r2; src.items.push(over); placed = true; break; }
        }
        if (!placed) { const sp = IV.findSpot(src, over); if (sp) { Object.assign(over, sp); src.items.push(over); placed = true; } }
      }
      if (!placed) c.items = c.items.filter((o) => o !== it);
    }
    if (!placed) { it.x = oldX; it.y = oldY; it.rot = oldRot; over.x = oX; over.y = oY; over.rot = oRot; src.items.push(it); c.items.push(over); return false; }
    IV.changed(src); IV.changed(c);
    return true;
  }
  const onMove = (e) => { if (drag) moveGhost(e.clientX, e.clientY); };
  const onUp = (e) => endDrag(target(e.clientX, e.clientY));
  function endDrag(t) {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!drag) return;
    const { f, ghost, el } = drag; const it = f.it;
    ghost.remove(); el.classList.remove('iv-dragging');
    const rot = drag.rot; drag = null;
    // guns / skills onto each other
    if (f.wslot !== undefined && t && t.ground) {
      const w = G.weapons.gunsInOrder()[f.wslot];
      if (w && GM.dropGun(w)) { G.sfx.ui('click'); G.ui.toastSmall(`🗑️ ${w.def.name} を捨てた`); } else { G.sfx.ui('deny'); G.ui.toastSmall('最後の銃は捨てられない'); }
      render(); return;
    }
    if (f.wslot !== undefined) { if (t && t.wslot !== undefined && t.wslot !== f.wslot) swapGuns(); render(); return; }
    if (f.sk !== undefined) { if (t && t.sk !== undefined && +t.sk !== f.sk) swapSkills(f.sk, +t.sk); render(); return; }
    if (!t) { render(); return; }
    if (t.ground) { if (f.as) { render(); return; } discard(f); return; }
    // a part dropped anywhere on a gun's box (even on the wrong little socket) goes into the socket it belongs to
    if (t.as && it.type === 'att' && G.ATT_BY_ID[it.id] && !(f.as && f.as.w === G.weapons.gunsInOrder()[+t.as.split(':')[0]])) t = { wslot: +t.as.split(':')[0] };
    if (t.wslot !== undefined) {
      const w = G.weapons.gunsInOrder()[t.wslot];
      if (it.type === 'att' && w) { if (f.as) { if (f.as.w !== w && GM.moveAtt(it.id, f.as.w, w)) G.sfx.mech('magIn'); else G.sfx.ui('deny'); render(); } else if (isMine(f.from)) equipAtt(it, w); else { G.sfx.ui('deny'); render(); } return; }
      G.sfx.ui('deny'); render(); return;
    }
    if (t.sk !== undefined) { G.sfx.ui('deny'); render(); return; }
    if (t.as) {
      const [wi, sl] = t.as.split(':'), w = G.weapons.gunsInOrder()[+wi];
      const a = it.type === 'att' && G.ATT_BY_ID[it.id];
      if (!a || !w) { G.sfx.ui('deny'); G.ui.toastSmall('そこにはアタッチメントしか付けられない'); }
      else if (a.slot !== sl) { G.sfx.ui('deny'); G.ui.toastSmall(`${a.name} は ${G.ATT_SLOTS[a.slot].icon}${G.ATT_SLOTS[a.slot].name} スロット用`); }
      else if (!a.compat(w.def)) { G.sfx.ui('deny'); G.ui.toastSmall('この武器には付けられない'); }
      else if (f.as) { if (f.as.w !== w && GM.moveAtt(it.id, f.as.w, w)) G.sfx.mech('magIn'); }
      else if (isMine(f.from)) { equipAtt(it, w); return; }
      else {
        IV.remove(f.from, it); const left = IV.stow(P, it);
        if (left > 0) { it.n = left; IV.put(f.from, it); G.sfx.ui('deny'); G.ui.toastSmall('🎒 インベントリに空きがない'); } else equipAtt(it, w);
      }
      render(); return;
    }
    if (t.grid && f.as) { if (t.key === 'bag') unequipAtt(f.as); else { G.sfx.ui('deny'); render(); } return; }
    if (t.eq) {
      if (it.type === 'armor' && G.ARMOR_BY_ID[it.id].slot === t.eq) { if (!f.eq) IV.equip(P, it, f.from); }
      else { G.sfx.ui('deny'); if (it.type === 'armor') G.ui.toastSmall('その部位には装備できない'); }
      render(); return;
    }
    if (t.grid) {
      const c = contOf(t.key), [bw, bh] = IV.baseSize(it), [w, h] = rot ? [bh, bw] : [bw, bh];
      if (c.accept && !c.accept(it)) { G.sfx.ui('deny'); G.ui.toastSmall(`その枠には${c.name}しか入らない`); render(); return; }
      if (IV.fits(c, w, h, t.cx, t.cy, c === f.from ? it : null)) {
        if (f.eq) { P.equip[f.eq] = null; P.recalc(); } else if (c !== f.from) IV.remove(f.from, it);
        it.x = t.cx; it.y = t.cy; it.rot = rot;
        if (!c.items.includes(it)) c.items.push(it);
        IV.changed(c); G.sfx.ui('click');
      } else {
        const over = overlapping(c, it, t.cx, t.cy, w, h);
        const o = over.length === 1 ? over[0] : null;
        if (o && o.type === 'item' && it.type === 'item' && o.id === it.id && o.n < IV.maxStack(o)) { const k = Math.min(IV.maxStack(o) - o.n, it.n); o.n += k; it.n -= k; if (it.n <= 0) IV.remove(f.from, it); IV.changed(c); G.sfx.ui('click'); }
        else if (o && !f.eq && f.from && trySwap(f, it, c, t.cx, t.cy, rot, o)) G.sfx.ui('select');
        else G.sfx.ui('deny');
      }
    }
    render();
  }
  window.addEventListener('keydown', (e) => {
    if (!root) return;
    if (drag && e.code === 'KeyR' && drag.f.it) { e.preventDefault(); e.stopPropagation(); drag.rot = !drag.rot; moveGhost(drag.x, drag.y); return; }
    if (e.code === 'Escape' || G.BIND.status.includes(e.code) || (G.BIND.inventory && G.BIND.inventory.includes(e.code)) || (IV.openCont && G.BIND.interact.includes(e.code))) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { if (e.code === 'Escape') G.game.escCloseT = performance.now(); UIV.close(); } }
  }, true);

  // ---------------- context menu ----------------
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(el, e) {
    closeMenu(); hideTip();
    const f = findIt(el); if (!f.it) return;
    const it = f.it, opts = [];
    if (f.as) opts.push(['📥 外してインベントリへ', () => unequipAtt(f.as)]);
    else if (it.type === 'att' && isMine(f.from)) for (const w of G.weapons.gunsInOrder()) if (G.ATT_BY_ID[it.id].compat(w.def)) opts.push([`🔩 装着: ${G.weapons.keyLabel(w)}${w.def.name}`, () => equipAtt(it, w)]);
    if (f.as) { popMenu(opts, e); return; }
    if (isMine(f.from) && usable(it)) opts.push(['🍶 使う', () => { UIV.close(); G.abilities.useItemId(it.id); }]);
    if (it.type === 'armor' && !f.eq) opts.push(['🛡️ 装備する', () => { IV.equip(P, it, f.from); render(); }]);
    if (f.eq) opts.push(['📥 外す', () => { IV.unequip(P, f.eq); render(); }]);
    if (IV.openCont && !f.eq) opts.push([isMine(f.from) ? '📤 箱へ移す' : '📥 インベントリへ', () => quickMove(f)]);
    if (it.type === 'item' && it.n > 1 && !f.eq) opts.push(['✂️ 半分に分ける', () => { const k = Math.floor(it.n / 2); const part = IV.make(it.type, it.id, k); const s = IV.findSpot(f.from, part); if (!s) { G.sfx.ui('deny'); return; } it.n -= k; Object.assign(part, s); f.from.items.push(part); IV.changed(f.from); render(); }]);
    if (!f.eq) opts.push(['↻ 回転', () => { const [w, h] = IV.baseSize(it); const nr = !it.rot; const [ww, hh] = nr ? [h, w] : [w, h]; if (IV.fits(f.from, ww, hh, it.x, it.y, it)) { it.rot = nr; IV.changed(f.from); render(); } else G.sfx.ui('deny'); }]);
    opts.push(['🗑️ 捨てる', () => discard(f)]);
    popMenu(opts, e);
  }
  function popMenu(opts, e) {
    menu = document.createElement('div'); menu.className = 'iv-menu';
    menu.innerHTML = opts.map(([l], i) => `<div data-i="${i}">${l}</div>`).join('');
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    root.appendChild(menu);
    menu.querySelectorAll('[data-i]').forEach((n) => n.onclick = () => { const o = opts[+n.dataset.i]; closeMenu(); o[1](); });
  }

  // ---------------- hover cards ----------------
  UIV.describe = function (it) {
    const d = IV.def(it); if (!d) return '';
    const rar = G.RARITY[d.rarity];
    let body = `<div class="ivt-h" style="color:${R(d.rarity)}">${it.type === 'armor' ? G.armorIcon(d) : d.icon} ${U.esc(d.name)}</div><div class="ivt-s">${rar ? rar.name : ''} · ${{ item: d.cat === 'grenade' ? '投擲物' : d.passive ? '所持品（常時効果）' : '消耗品', armor: '防具', valuable: '金品（売却専用）', att: 'アタッチメント' }[it.type]}${it.n > 1 ? ` · ×${it.n}` : ''}</div>`;
    if (it.type === 'armor') {
      const M = G.ARMOR_MAT_BY_ID[d.mat], S = G.ARMOR_SLOT_BY_ID[d.slot];
      body += `<div class="ivt-r">部位 <b>${S.name}</b>　素材 <b>${M.name}</b></div><div class="ivt-r">🛡️ 防御力 <b>${d.def}</b>　⚖️ 重さ <b>${d.weight || 'なし'}</b></div>`;
      for (const fx of d.fixed) body += `<div class="ivt-fx">◆ ${fx.desc}</div>`;
      for (const e of it.ench || []) body += `<div class="ivt-en">✦ ${G.enchantText(e)}</div>`;
      { const f = IV.durFrac(it), col = f > 0.5 ? '#6ee06a' : f > 0.2 ? '#f0b040' : '#ff4a3a';
        body += `<div class="ivt-r">🔧 耐久 <b style="color:${col}">${Math.ceil(IV.durOf(it))} / ${IV.durMax(it)}</b>（${Math.round(f * 100)}%）</div>`; }
    } else body += `<div class="ivt-d">${U.esc(d.desc || '')}</div>`;
    body += `<div class="ivt-v">売値 ${U.fmt(IV.value(it))}🪙</div>`;
    return body;
  };
  function showTip(html, e, wide) {
    if (!html) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'iv-tip'; document.body.appendChild(tip); }
    tip.classList.toggle('wide', !!wide);
    tip.innerHTML = html;
    tip.style.display = 'block'; placeTip(e);
  }
  function placeTip(e) { if (!tip) return; const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.max(4, Math.min(innerWidth - w - 8, e.clientX + 16)) + 'px'; tip.style.top = Math.max(4, Math.min(innerHeight - h - 8, e.clientY + 12)) + 'px'; }
  function hideTip() { if (tip) tip.style.display = 'none'; }
})();
