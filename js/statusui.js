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
  const esc = (s) => U.esc(String(s));
  const num = (v, dec) => { const d = dec ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2); return (+v.toFixed(d)).toString(); };
  // a value compared with its base: lowerBetter flips the colours (cooldowns, reload); abs = the change is shown in points
  function dv(cur, base, o) {
    o = o || {};
    const unit = o.unit || '', txt = (o.fmt ? o.fmt(cur) : num(cur, o.dec)) + unit;
    if (!base || Math.abs(cur - base) < Math.max(1e-6, Math.abs(base) * 0.005)) return `<b class="sv">${txt}</b>`;
    const pct = o.abs ? cur - base : (cur / base - 1) * 100, better = o.lowerBetter ? pct < 0 : pct > 0;
    return `<b class="sv ${better ? 'up' : 'dn'}">${txt}</b><span class="sd ${better ? 'up' : 'dn'}">(${pct > 0 ? '+' : ''}${Math.round(pct)}${o.abs ? 'pt' : '%'})</span>`;
  }
  const panel = (en, jp, body, cls) => `<section class="sp ${cls || ''}"><header><span class="en">${en}</span><span class="jp">${jp}</span></header><div class="sp-b">${body}</div></section>`;
  const tile = (label, val) => `<div class="t"><label>${label}</label><div class="v">${val}</div></div>`;
  let pend = [];
  let noPv = false; // tooltips render the same cards without the 3D model
  const preview = (kind, def, atts) => { if (noPv) return ''; const id = pend.length; pend.push({ id, kind, def, atts }); return `<canvas class="pv" data-pv="${id}" width="448" height="256"></canvas>`; };

  // ---------------- weapons ----------------
  function gunCard(w) {
    const d = w.def, s = G.weapons.stats(w), st = P.stats, cur = w === P.weapon && !P.meleeMode;
    const trait = d.trait ? G.WEAPON_TRAITS[d.trait] : null;
    const crit = st.critChance + (s.critChance || 0), B = G.PLAYER_BASE;
    const tiles = [
      tile('ダメージ', dv(s.dmg, d.dmg) + (s.pellets > 1 ? `<span class="sx">×${s.pellets}</span>` : '')),
      tile('連射', dv(s.rpm, d.rpm, { unit: '/分', dec: 0 })),
      tile('装弾数', dv(s.mag, d.mag, { dec: 0 })),
      tile('リロード', dv(s.reload, d.reload, { unit: '秒', lowerBetter: true })),
      tile('射程', dv(s.range, d.range, { unit: 'm', dec: 0 })),
      tile('会心率', dv(crit * 100, B.critChance * 100, { unit: '%', dec: 0, abs: true })),
      tile('会心ダメージ', dv((st.critMul - 1) * 100, (B.critMul - 1) * 100, { unit: '%', dec: 0, abs: true })),
      tile('ヘッドショット', dv(s.headMul, d.headMul, { unit: '倍' })),
    ].join('');
    const attDesc = (() => { const on = Object.keys(G.ATT_SLOTS).map((sl) => w.atts[sl] && G.ATT_BY_ID[w.atts[sl]]).filter(Boolean); return on.length ? `<div class="wc-attd">${on.map((a) => `<div><span>${a.icon} ${esc(a.name)}</span>${esc(a.desc || '')}</div>`).join('')}</div>` : ''; })();
    const atts = Object.keys(G.ATT_SLOTS).map((sl) => { const a = w.atts[sl] && G.ATT_BY_ID[w.atts[sl]]; return a ? `<span class="att on" ${UI.tipAttr(a)}>${a.icon}<em>${esc(a.name)}</em></span>` : `<span class="att" title="${G.ATT_SLOTS[sl].name}">${G.ATT_SLOTS[sl].icon}</span>`; }).join('');
    return `<div class="wc ${cur ? 'cur' : ''}" style="--rc:${R(d.rarity)}">
      <div class="wc-top">
        <div class="wc-pv">${preview('gun', d, w.atts)}<span class="key">${G.weapons.keyLabel(w).replace(/[\[\]]/g, '') || '·'}</span></div>
        <div class="wc-info">
          <div class="nm">${esc(d.name)}${w.lv ? `<b class="lv">+${w.lv}</b>` : ''}</div>
          <div class="cat">${esc(d.cat || '')}・${G.RARITY[d.rarity].name}</div>
          <div class="dps"><b>${Math.round(G.weapons.dps(s))}</b><span>DPS</span></div>
          ${trait ? `<div class="tr">${trait.icon} ${esc(trait.name)}</div>` : ''}
        </div>
      </div>
      <div class="wc-grid">${tiles}</div>
      <div class="wc-att">${atts}</div>${G.weapons.FALLOFF[d.arch] ? `<div class="wc-attd"><div><span>📉 距離減衰</span>遠くの敵ほどダメージが下がる</div></div>` : `<div class="wc-attd"><div><span>🎯 減衰なし</span>距離によってダメージが下がらない</div></div>`}${attDesc}</div>`;
  }
  function meleeCard() {
    const m = P.melee, d = m.def, s = G.weapons.meleeStats(m), st = P.stats, B = G.PLAYER_BASE;
    const crit = st.critChance + (s.critChance || 0), dps = s.dmg / s.swing, dps0 = d.dmg / d.swing;
    const tiles = [
      tile('ダメージ', dv(s.dmg, d.dmg)),
      tile('攻撃間隔', dv(s.swing, d.swing, { unit: '秒', lowerBetter: true })),
      tile('リーチ', dv(s.range, d.range, { unit: 'm' })),
      tile('重撃', `<b class="sv">×${s.heavy[0]}</b>`),
      tile('会心率', dv(crit * 100, (d.critChance || 0) * 100 + B.critChance * 100, { unit: '%', dec: 0, abs: true })),
      tile('会心ダメージ', dv((st.critMul - 1) * 100, (B.critMul - 1) * 100, { unit: '%', dec: 0, abs: true })),
      tile('ヘッドショット', `<b class="sv">${num(d.headMul || 1)}倍</b>`),
      tile('移動', `<b class="sv">×${num(d.moveMul)}</b>`),
    ].join('');
    return `<div class="wc ${P.meleeMode ? 'cur' : ''}" style="--rc:${R(d.rarity)}">
      <div class="wc-top">
        <div class="wc-pv">${preview('melee', d)}<span class="key">${G.weapons.keyLabel('m').replace(/[\[\]]/g, '') || '·'}</span></div>
        <div class="wc-info">
          <div class="nm">${esc(d.name)}${m.lv ? `<b class="lv">+${m.lv}</b>` : ''}</div>
          <div class="cat">${esc(d.cat)}・${G.RARITY[d.rarity].name}</div>
          <div class="dps"><b>${Math.round(dps)}</b><span>DPS</span>${Math.abs(dps - dps0) > dps0 * 0.005 ? `<span class="sd ${dps > dps0 ? 'up' : 'dn'}">(${dps > dps0 ? '+' : ''}${Math.round((dps / dps0 - 1) * 100)}%)</span>` : ''}</div>
          ${d.traitDesc ? `<div class="tr">✦ ${esc(d.traitDesc)}</div>` : ''}
        </div>
      </div>
      <div class="wc-grid">${tiles}</div></div>`;
  }

  // ---------------- skills ----------------
  const AREA_K = ['r', 'len', 'range', 'w'];
  const POW_K = ['dmg', 'dps', 'heal', 'hps'];
  function skillCard(sk, key) {
    const A = G.abilities, st = P.stats, d = sk.def, ult = !!d.ult;
    const p0 = d.p, p = A.scaleP(sk);
    const baseCd = ult ? d.cd : d.cd * A.SKILL_CD_MUL, cd = A.cdOf(sk);
    const powBase = ult ? 1 : A.SKILL_POW_MUL;
    const pow = (ult ? A.ultPower(sk) : A.power(sk)) * (1 + st.skillDmg + (ult ? st.ultDmg || 0 : 0));
    const hasPow = POW_K.some((k) => p0[k] != null) || /ダメージ|焼|撃|爆/.test(d.desc);
    const line = [`<span><label>クールタイム</label>${dv(cd, baseCd, { unit: '秒', lowerBetter: true })}</span>`];
    if (hasPow) line.push(`<span><label>威力</label>${dv(pow * 100, powBase * 100, { unit: '%', dec: 0 })}</span>`);
    for (const k of AREA_K) if (p0[k]) { line.push(`<span><label>${k === 'len' ? '長さ' : k === 'range' ? '射程' : k === 'w' ? '幅' : '範囲'}</label>${dv(p[k], p0[k], { unit: 'm' })}</span>`); break; }
    if (p0.dur) line.push(`<span><label>効果時間</label>${dv(p.dur, p0.dur, { unit: '秒' })}</span>`);
    if (sk.maxCharges > 1 || p0.charges) line.push(`<span><label>チャージ</label>${dv(sk.maxCharges || 1, p0.charges || 1, { dec: 0 })}</span>`);
    // the description: numbers that come from the skill's own parameters are recomputed; every number is bold
    const used = new Set();
    const desc = esc(d.desc).replace(/(\d+(?:\.\d+)?)(秒|m|体|個|本|%|倍)?/g, (all, n, u) => {
      const v = +n;
      let k = null;
      if (u === '秒') k = ['dur', 't'].find((x) => p0[x] === v && !used.has(x));
      else if (u === 'm') k = AREA_K.find((x) => p0[x] === v && !used.has(x));
      else if (!u) k = POW_K.concat(['n']).find((x) => p0[x] === v && !used.has(x));
      else if (u === '体' || u === '個' || u === '本') k = ['n'].find((x) => p0[x] === v && !used.has(x));
      if (!k) return `<b class="sv">${n}${u || ''}</b>`;
      used.add(k);
      const cur = AREA_K.includes(k) || k === 'dur' ? p[k] : POW_K.includes(k) ? p0[k] * pow / powBase : p[k];
      return dv(cur, v, { unit: u || '', dec: Number.isInteger(v) && Math.abs(cur - Math.round(cur)) < 0.05 ? 0 : 1 });
    });
    const augs = [...P.buffs].filter(([id]) => G.BUFF_BY_ID[id] && G.BUFF_BY_ID[id].skill === sk.id);
    const ready = A.ready(sk), left = sk.maxCharges ? `${sk.charges}/${sk.maxCharges}` : ready ? 'READY' : `${Math.ceil(sk.cd)}秒`;
    return `<div class="sc ${ult ? 'ult' : ''}" style="--rc:${R(d.rarity)}">
      <div class="sc-h"><span class="key">${key}</span><span class="ic">${d.icon}</span><span class="nm">${esc(d.name)}${sk.lv ? `<b class="lv">Lv${sk.lv}</b>` : ''}${ult ? '<em class="tag">ULT</em>' : ''}</span><span class="st ${ready ? 'ok' : ''}">${left}</span></div>
      <div class="sc-l">${line.join('')}</div>
      <div class="sc-d">${desc}</div>
      ${augs.length ? `<div class="sc-a">${augs.map(([id, n]) => { const b = G.BUFF_BY_ID[id]; return `<span ${UI.tipAttr(b)} style="--rc:${R(b.rarity)}">${b.icon}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`; }).join('')}</div>` : ''}</div>`;
  }
  function pileCard() {
    const pi = P.pileInfo();
    return `<div class="sc" style="--rc:var(--gold2)">
      <div class="sc-h"><span class="key">${G.input.keyName('crouch')}</span><span class="ic">🔨</span><span class="nm">パイルドライバー${pi.lvl ? `<b class="lv">Lv${pi.lvl}</b>` : ''}</span><span class="st ${P.pileReady() ? 'ok' : ''}">${P.pileReady() ? 'READY' : Math.ceil(P.pileCd) + '秒'}</span></div>
      <div class="sc-l"><span><label>クールタイム</label>${dv(pi.cd, 8, { unit: '秒', lowerBetter: true })}</span><span><label>威力</label>${dv(pi.dmg, 120, { dec: 0 })}</span><span><label>範囲</label>${dv(pi.radius, 5.5, { unit: 'm' })}</span></div>
      <div class="sc-d">空中で <b class="sv">${G.input.keyName('crouch')}</b>：真下へ急降下して叩きつける。高所から落ちるほど威力が上がる（10mごとに${dv(pi.heightPer10, 100, { unit: '%', dec: 0 })}、最大 ${dv(pi.dmgMax, 120 * 2.5, { dec: 0 })}）。シールドへ ×<b class="sv">${pi.shieldMul}</b></div>
      ${pi.fx.length ? `<div class="sc-x">${pi.fx.join('　')}</div>` : ''}</div>`;
  }

  // ---------------- stats, items, perks ----------------
  const GROUPS = [
    ['攻撃', ['dmg', 'fireRate', 'reloadSpeed', 'critChance', 'critMul', 'headMul', 'skillDmg', 'explosionDmg', 'shieldDmg']],
    ['生存', ['maxHp', 'defense', 'armor', 'dodge', 'hpRegen', 'lifesteal']],
    ['機動・その他', ['moveSpeed', 'weight', 'opSpeed', 'maxJumps', 'grappleRange', 'cdr', 'coinMul', 'luck']],
  ];
  function statRow(k) {
    const st = P.stats, B = G.PLAYER_BASE, def = G.STAT_NAMES[k]; if (!def) return '';
    const [ic, nm, t] = def, v = st[k] ?? 0, b = B[k] ?? 0;
    let txt;
    if (t === 'cd') txt = Math.round((v - 1) * 100) + '%';
    else if (t === 'p') { const isAbs = ['critChance', 'dodge', 'lifesteal', 'armor', 'cdr', 'luck'].includes(k); txt = (isAbs ? Math.round(v * 100) : (v >= 0 ? '+' : '') + Math.round(v * 100)) + '%'; }
    else if (t === 'x') txt = '×' + v.toFixed(2);
    else txt = String(Math.round(v * 10) / 10);
    const diff = Math.abs(v - b) > 1e-6;
    return `<div class="sg"><span>${ic} ${nm}</span><b class="sv ${diff ? (v > b ? 'up' : 'dn') : ''}">${txt}</b></div>`;
  }
  const statsBody = () => GROUPS.map(([title, keys]) => `<div class="sgh">${title}</div><div class="sgrid">${keys.map(statRow).join('')}</div>`).join('');
  function perksBody() {
    const list = [...P.buffs];
    if (!list.length) return '<div class="none">まだ加護はありません</div>';
    return `<div class="pgrid">${list.map(([id, n]) => {
      const b = G.BUFF_BY_ID[id]; if (!b) return '';
      const cnt = b.counter ? ` <span class="cnt">[${b.counter(P.buffState[id] || {})}]</span>` : '';
      return `<div class="bf" style="--rc:${R(b.rarity)}"><div class="bicon" style="--rc:${R(b.rarity)}">${b.icon}${n > 1 ? `<span class="st">${n}</span>` : ''}</div><div class="bt"><b>${esc(b.name)}</b>${cnt}<div>${b.desc.replace(/([+\-−]?\d+(?:\.\d+)?(?:%|秒|m|体)?)/g, '<b class="sv">$1</b>')}</div></div></div>`;
    }).join('')}</div>`;
  }
  function itemsBody() {
    const row = (it, title, sub) => `<div class="it" style="--rc:${R(it.rarity)}" ${UI.tipAttr(it)}><span class="ic">${it.icon}</span><span class="nm">${title}</span><span class="sub">${sub || ''}</span>${it.desc ? `<span class="ds">${esc(it.desc)}</span>` : ''}</div>`;
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
    if (compact) return `<div class="sw cp">${head}<div class="scols"><div class="col">${panel('ROUTE', '道程', UI.routeHTML())}${panel('STATS', '能力値', statsBody())}</div></div><div class="srow">${panel(`PERKS・${P.buffs.size}`, '加護', perksBody(), 'perks')}</div></div>`;
    const loadout = panel('LOADOUT', '武器', G.weapons.gunsInOrder().map(gunCard).join('') + Array.from({ length: empty }, () => `<div class="wc empty"><div class="wc-h0"><span class="key">＋</span><span class="nm">武器スロット：空き</span></div></div>`).join('') + meleeCard());
    const abil = panel('ABILITIES', 'スキル', P.skills.map((sk, i) => (sk ? skillCard(sk, G.input.skillKey(i)) : `<div class="sc empty"><div class="sc-h"><span class="key">${G.input.skillKey(i)}</span><span class="nm">— 空き —</span></div></div>`)).join('') + pileCard());
    const armorBody = () => G.ARMOR_SLOTS.map((S) => { const it = P.equip[S.id], d = it && G.ARMOR_BY_ID[it.id]; return d ? `<div class="it" style="--rc:${R(d.rarity)}"><span class="ic">${d.icon}</span><span class="nm">${esc(d.name)}</span><span class="sub">🛡${d.def}</span><span class="ds">${[...d.fixed.map((f) => '◆' + f.desc), ...(it.ench || []).map((e) => '✦' + G.enchantText(e))].join('　') || esc(S.name + '防具')}</span></div>` : `<div class="it" style="--rc:#3a332a;opacity:.45"><span class="ic">${S.icon}</span><span class="nm">${S.name} — 空き</span><span class="sub"></span></div>`; }).join('');
    const right = panel('STATS', '能力値', statsBody()) + panel('ITEMS', '所持アイテム', `<div class="igrid">${itemsBody()}</div>`);
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

  // ---------------- 3D weapon previews ----------------
  const PV = { r: null, scene: null, cam: null, items: [], raf: 0, W: 448, H: 256 };
  function pvInit() {
    if (PV.r) return true;
    try {
      const canvas = document.createElement('canvas');
      PV.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) { PV.r = null; return false; }
    PV.r.setPixelRatio(1); PV.r.setSize(PV.W, PV.H, false);
    PV.r.outputColorSpace = THREE.SRGBColorSpace; PV.r.toneMapping = THREE.ACESFilmicToneMapping;
    PV.scene = new THREE.Scene();
    PV.scene.add(new THREE.HemisphereLight(0xc8c4bc, 0x50483c, 2.4));
    const k = new THREE.DirectionalLight(0xffe8d0, 3.6); k.position.set(2, 3, 3); PV.scene.add(k);
    const r2 = new THREE.DirectionalLight(0x8090c0, 1.1); r2.position.set(-3, 1, -2); PV.scene.add(r2);
    const f = new THREE.DirectionalLight(0xffffff, 1.4); f.position.set(0, 0.5, 4); PV.scene.add(f);
    PV.scene.environment = G.envTex || null;
    PV.cam = new THREE.PerspectiveCamera(28, PV.W / PV.H, 0.01, 100);
    return true;
  }
  function pvFrame() {
    if (!PV.items.length) return;
    const t = performance.now() / 1000;
    for (const it of PV.items) {
      PV.scene.add(it.g);
      it.g.rotation.y = it.kind === 'gun' ? -Math.PI / 2 + Math.sin(t * 0.8 + it.ph) * 0.6 : t * 0.7 + it.ph;
      PV.cam.position.set(0, it.d * 0.12, it.d); PV.cam.lookAt(0, 0, 0);
      PV.r.render(PV.scene, PV.cam);
      it.ctx.clearRect(0, 0, PV.W, PV.H); it.ctx.drawImage(PV.r.domElement, 0, 0, PV.W, PV.H);
      PV.scene.remove(it.g);
    }
  }
  function pvLoop() {
    PV.raf = requestAnimationFrame(pvLoop);
    if (!UI.statusOpen() && !(G.InvUI && G.InvUI.isOpen())) { SU.unmount(); return; }
    pvFrame();
  }
  SU.renderOnce = pvFrame;
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
  SU.mount = function (root) {
    const list = pend; pend = [];
    SU.unmount();
    if (!list.length || !pvInit()) return;
    const half = Math.tan(THREE.MathUtils.degToRad(PV.cam.fov / 2)), asp = PV.W / PV.H;
    PV.items = list.map((it, i) => {
      const cv = root.querySelector(`canvas[data-pv="${it.id}"]`); if (!cv) return null;
      let model; try { model = it.kind === 'melee' ? G.weapons.meleeDisplayModel(it.def) : G.weapons.displayModel(it.def, it.atts); } catch (e) { return null; }
      const box = visBox(model), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      model.position.sub(c);
      const g = new THREE.Group(); g.add(model);
      // guns are seen side-on (barrel across the frame); melee weapons spin, fitted by their bounding sphere
      const d = it.kind === 'gun' ? Math.max(sz.z * 1.12 / (2 * half * asp), sz.y * 1.35 / (2 * half), 0.25) : Math.max(sz.length() * 0.5 / half * 1.15, 0.3);
      return { cv, ctx: cv.getContext('2d'), g, d, kind: it.kind, ph: i * 1.3 };
    }).filter(Boolean);
    pvFrame();
    PV.raf = requestAnimationFrame(pvLoop);
  };
  SU.unmount = function () { if (PV.raf) cancelAnimationFrame(PV.raf); PV.raf = 0; PV.items = []; };
})();
