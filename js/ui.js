'use strict';
// HUD + menus. Everything is icon-first (emoji) with rarity colour coding.
(function () {
  const UI = (G.ui = {});
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  let P;
  const R = (r) => (G.RARITY[r] ? G.RARITY[r].color : '#aaa');
  UI.R = R;

  UI.init = function () {
    P = G.player;
    UI.el = {
      hud: $('hud'), hpFill: $('hp-fill'), hpTrail: $('hp-trail'), hpText: $('hp-text'), osFill: $('os-fill'), coinVal: $('coin-val'), coins: $('coins'), coinPops: $('coin-pops'),
      runMeta: $('run-meta'), wName: $('weapon-name'), wAtts: $('weapon-atts'), ammoMag: $('ammo-mag'), ammoMax: $('ammo-max'), ammo: $('ammo'), reloadBar: $('reload-bar'), wSlots: $('weapon-slots'),
      abilityRow: $('ability-row'), itemRow: $('item-row'), buffs: $('hud-buffs'), tempfx: $('tempfx'), feed: $('feed'), toasts: $('toasts'), interact: $('interact-panel'),
      boss: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'), bossTrail: $('boss-trail'), bossShield: $('boss-shield'), bossShieldFill: $('boss-shield-fill'), bossPhase: $('boss-phase'),
      banner: $('banner'), areaTitle: $('area-title'), areaSub: $('area-sub'), objective: $('objective'), crosshair: $('crosshair'), hitmarker: $('hitmarker'), dirind: $('dirind'),
      grappleInd: $('grapple-ind'), pileInd: $('pile-ind'), dmgFlash: $('dmg-flash'), lowhp: $('lowhp'), scope: $('scope-overlay'), speed: $('speedlines'), screens: $('screens'), fade: $('fade'),
      statusOv: $('status-overlay'), tint: $('status-tint'), compass: $('compass-strip'), fps: $('fps'),
    };
    UI.speedCtx = UI.el.speed.getContext('2d');
    const tt = document.createElement('div'); tt.id = 'tooltip'; tt.style.display = 'none'; document.body.appendChild(tt); UI.tt = tt;
    document.addEventListener('mousemove', (e) => {
      if (G.input.locked) { tt.style.display = 'none'; return; }
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (!t) { tt.style.display = 'none'; return; }
      tt.innerHTML = t.getAttribute('data-tip');
      tt.style.setProperty('--rc', t.getAttribute('data-rc') || 'var(--line)');
      tt.style.display = 'block';
      const x = Math.min(window.innerWidth - tt.offsetWidth - 10, e.clientX + 16), y = Math.min(window.innerHeight - tt.offsetHeight - 10, e.clientY + 16);
      tt.style.left = x + 'px'; tt.style.top = y + 'px';
    });
    UI.dirHits = [];
    UI.buildAbilityRow();
  };

  // ---------------- small helpers ----------------
  UI.tipFor = function (o, extra) {
    if (!o) return '';
    const rar = G.RARITY[o.rarity];
    const cat = o.kind === 'buff' ? (G.BUFF_CAT[o.cat] ? G.BUFF_CAT[o.cat].icon + ' ' + G.BUFF_CAT[o.cat].name + '加護' : '加護') : o.kind === 'weapon' ? '🔫 ' + o.cat : o.kind === 'attachment' ? G.ATT_SLOTS[o.slot].icon + ' アタッチメント / ' + G.ATT_SLOTS[o.slot].name : o.kind === 'skill' ? '🔮 スキル（CT ' + o.cd + '秒）' : o.kind === 'item' ? G.ITEM_CAT[o.cat].icon + ' ' + G.ITEM_CAT[o.cat].name : '';
    return `<div class="tt-name">${o.icon || ''} ${U.esc(o.name)}</div><div class="tt-cat">${rar ? rar.name + ' · ' : ''}${cat}</div><div style="margin-top:6px">${U.esc(o.desc || '')}</div>${extra || ''}`;
  };
  UI.tipAttr = (o, extra) => `data-tip="${UI.tipFor(o, extra).replace(/"/g, '&quot;')}" data-rc="${R(o.rarity)}"`;
  UI.toast = function (text, cls) {
    const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = text;
    UI.el.toasts.appendChild(d);
    while (UI.el.toasts.children.length > 4) UI.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 3100);
  };
  let lastSmall = '', lastSmallT = 0;
  UI.toastSmall = function (text) {
    const now = performance.now();
    if (text === lastSmall && now - lastSmallT < 1200) return;
    lastSmall = text; lastSmallT = now;
    UI.toast(text, 'small');
  };
  UI.feed = function (text, cls) {
    const d = document.createElement('div'); d.className = cls || ''; d.textContent = text;
    UI.el.feed.appendChild(d);
    while (UI.el.feed.children.length > 6) UI.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 3000);
  };
  UI.coinPop = function (a, reason) {
    const d = document.createElement('div'); d.textContent = '+' + U.fmt(a) + (reason ? ' ' + reason : '');
    UI.el.coinPops.appendChild(d); setTimeout(() => d.remove(), 1100);
    UI.el.coins.classList.remove('bump'); void UI.el.coins.offsetWidth; UI.el.coins.classList.add('bump');
  };
  UI.hitMarker = function (kind) {
    const h = UI.el.hitmarker;
    h.className = kind || '';
    h.style.transition = 'none'; h.style.opacity = 1; h.style.transform = kind === 'kill' ? 'scale(1.4)' : 'scale(1.1)';
    void h.offsetWidth;
    h.style.transition = 'opacity .25s, transform .2s'; h.style.opacity = 0; h.style.transform = 'scale(1)';
    G.sfx.hitConfirm(kind === 'kill');
  };
  UI.damageFlash = function (k, srcPos) {
    const f = UI.el.dmgFlash;
    f.style.transition = 'none'; f.style.opacity = Math.min(0.9, 0.3 + k * 0.6); void f.offsetWidth;
    f.style.transition = 'opacity .5s'; f.style.opacity = 0;
    if (srcPos) {
      const d = document.createElement('div'); d.className = 'di';
      UI.el.dirind.appendChild(d);
      UI.dirHits.push({ el: d, pos: srcPos.clone ? srcPos.clone() : srcPos, t: 1.2 });
    }
  };
  UI.healFlash = function () {
    const f = UI.el.tint; f.style.background = 'radial-gradient(ellipse at center, rgba(40,120,40,0) 50%, rgba(60,160,60,0.35) 100%)';
    f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth; f.style.transition = 'opacity .6s'; f.style.opacity = 0;
  };
  UI.whiteFlash = function (k) {
    const f = UI.el.tint; f.style.background = '#fff';
    f.style.transition = 'none'; f.style.opacity = k; void f.offsetWidth; f.style.transition = 'opacity 1.6s'; f.style.opacity = 0;
  };
  UI.fadeFlash = function () { const f = UI.el.fade; f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 250); };
  const TINTS = { chrono: 'radial-gradient(ellipse at center, rgba(60,80,140,0) 40%, rgba(80,100,180,0.4) 100%)', cloak: 'radial-gradient(ellipse at center, rgba(40,40,60,0) 40%, rgba(40,40,70,0.55) 100%)', rage: 'radial-gradient(ellipse at center, rgba(140,20,0,0) 50%, rgba(160,30,0,0.35) 100%)', web: 'radial-gradient(ellipse at center, rgba(200,200,200,0) 40%, rgba(220,220,220,0.35) 100%)', rewind: 'radial-gradient(ellipse at center, rgba(80,120,180,0.2) 20%, rgba(80,120,200,0.5) 100%)' };
  UI.tint = function (k, dur) {
    UI.tintT = dur; UI.tintK = k;
    const f = UI.el.tint; f.style.transition = 'opacity .3s'; f.style.background = TINTS[k] || 'none'; f.style.opacity = 1;
  };
  UI.scope = function (on, kind) { if (kind && UI.el.scope.dataset.kind !== kind) UI.el.scope.dataset.kind = kind; UI.el.scope.style.opacity = on ? 1 : 0; UI.el.crosshair.style.opacity = on ? 0 : UI.el.crosshair.style.opacity; };
  UI.pileIndicator = function (on) { UI.el.pileInd.classList.toggle('hidden', !on); };
  UI.grappleHint = function (pv, state, cd) {
    const ch = UI.el.crosshair, gi = UI.el.grappleInd;
    const ok = pv && pv.ok && state === 'none' && cd <= 0;
    ch.classList.toggle('grapple-ok', !!ok);
    gi.classList.remove('show');
  };
  UI.speedLines = function (k) {
    const c = UI.el.speed, g = UI.speedCtx;
    if (k <= 0.01) { if (c.style.opacity !== '0') { c.style.opacity = 0; } return; }
    if (c.width !== window.innerWidth >> 1) { c.width = window.innerWidth >> 1; c.height = window.innerHeight >> 1; }
    c.style.opacity = Math.min(0.85, k);
    g.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height / 2, R0 = Math.min(cx, cy) * 0.55, R1 = Math.hypot(cx, cy);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, r0 = R0 + Math.random() * R0 * 0.6;
      g.lineWidth = 0.5 + Math.random() * 1.2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * R1, cy + Math.sin(a) * R1); g.stroke();
    }
  };

  // ---------------- HUD refresh ----------------
  UI.refreshWeapon = function () {
    const w = P.weapon; if (!w) return;
    const md = P.melee && P.melee.def;
    if (P.meleeMode && md) {
      UI.el.wName.innerHTML = `<span style="color:${R(md.rarity)}">${md.icon} ${U.esc(md.name)}${P.melee.lv ? ' +' + P.melee.lv : ''}</span> <span style="font-size:11px;color:var(--dim)">左:連撃 右:重撃</span>`;
      UI.el.wAtts.innerHTML = '';
    } else {
      UI.el.wName.innerHTML = `<span style="color:${R(w.def.rarity)}">${w.def.icon} ${U.esc(w.def.name)}${w.lv ? ' +' + w.lv : ''}</span>${w.def.trait ? ' <span title="">' + G.WEAPON_TRAITS[w.def.trait].icon + '</span>' : ''}`;
      UI.el.wAtts.innerHTML = Object.keys(G.ATT_SLOTS).map((s) => w.atts[s] ? G.ATT_BY_ID[w.atts[s]].icon : '').join('');
    }
    UI.el.wSlots.innerHTML = '';
    const n = P.stats.weaponSlots;
    const slot = (key, html, active) => { const d = document.createElement('div'); d.className = 'wslot' + (active ? ' active' : ''); d.innerHTML = `<b>${key}</b>${html}`; UI.el.wSlots.appendChild(d); };
    // slots in key order (hold a number key to rearrange); free gun slots are listed last
    const o = G.weapons.order();
    const empty = '<span style="opacity:.5">空き</span>';
    let free = Math.max(0, n - P.weapons.length);
    o.forEach((t, i) => {
      if (!t) { if (free > 0) { free--; slot(i + 1, empty, false); } return; }
      const lab = t === 'm' ? (md ? md.icon + ' ' + U.esc(md.name) : '') : t.def.icon + ' ' + U.esc(t.def.name);
      slot(i < 3 ? i + 1 : '⇕', lab, t === 'm' ? P.meleeMode : !P.meleeMode && t === P.weapon);
    });
    for (; free > 0; free--) slot('⇕', empty, false);
  };
  // tile icons: only touch the DOM when the icon really changes (the icon layer swaps characters for drawings)
  UI.setIc = (el, v) => { const ic = el.querySelector('.ic'); v = String(v); if (ic._v !== v) { ic._v = v; ic.textContent = v; } };
  UI.buildAbilityRow = function () {
    const row = UI.el.abilityRow; row.innerHTML = '';
    UI.abEls = [];
    const mk = (key, small) => { const d = document.createElement('div'); d.className = 'ab' + (small ? ' small' : ''); d.innerHTML = `<span class="key">${key}</span><span class="ic"></span><div class="cd"></div><div class="cdt"></div><span class="cnt"></span><div class="bar"></div>`; return d; };
    const keys = [0, 1, 2, 3].map((i) => G.input.skillKey(i));
    // Q = ultimate (big, gold), then the skills X/Z/V and the pile driver (also a skill), then the grapple
    for (let i = 0; i < 4; i++) { const d = mk(keys[i]); if (i === 0) { d.classList.add('ult'); d.insertAdjacentHTML('beforeend', '<span class="ulttag">ULT</span>'); } row.appendChild(d); UI.abEls.push(d); if (i === 0) row.insertAdjacentHTML('beforeend', '<span class="ab-sep"></span>'); }
    UI.pileEl = mk(G.input.keyName('crouch')); UI.pileEl.classList.add('pileab'); UI.pileEl.title = `パイルドライバー（空中で${G.input.keyName('crouch')}）`; UI.setIc(UI.pileEl, '🔨'); row.appendChild(UI.pileEl);
    row.insertAdjacentHTML('beforeend', '<span class="ab-sep"></span>');
    UI.grEl = mk(G.input.keyName('grapple')); UI.setIc(UI.grEl, '⚓'); row.appendChild(UI.grEl);
    const irow = UI.el.itemRow; irow.innerHTML = '';
    UI.gnEl = mk(G.input.keyName('grenade'), true); irow.appendChild(UI.gnEl);
    UI.itEls = [];
    for (const [si, S] of G.ITEM_SLOTS.entries()) { const d = mk(G.input.keyName('item' + (si + 1)), true); d.title = S.name; d.insertAdjacentHTML('beforeend', `<span class="slotcap">${S.icon}</span>`); irow.appendChild(d); UI.itEls.push(d); }
  };
  // ---- big timer for the shooting gallery ----
  UI.trialClock = function (left, dur) {
    let el = document.getElementById('trial-clock');
    if (left < 0) { if (el) el.remove(); const v = document.getElementById('trial-vig'); if (v) v.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'trial-clock'; el.innerHTML = '<div class="tc-ring"></div><b></b>'; UI.el.hud.appendChild(el); }
    let vig = document.getElementById('trial-vig');
    if (!vig) { vig = document.createElement('div'); vig.id = 'trial-vig'; document.body.appendChild(vig); }
    const frac = Math.max(0, left / dur), urgent = left <= 5, warn = left <= 10;
    const col = urgent ? '#ff4030' : warn ? '#ffb040' : '#f1d79b';
    el.querySelector('b').textContent = left > 0 ? left.toFixed(left < 10 ? 1 : 0) : '0';
    el.style.setProperty('--c', col); el.style.setProperty('--p', (frac * 100).toFixed(1) + '%');
    const beat = 1 - (left % 1);
    el.style.transform = `translateX(-50%) scale(${warn ? 1 + Math.pow(beat, 6) * (urgent ? 0.28 : 0.14) : 1})`;
    vig.style.opacity = urgent ? (0.35 + Math.pow(beat, 4) * 0.5).toFixed(2) : warn ? (0.15 + Math.pow(beat, 6) * 0.2).toFixed(2) : 0;
    vig.style.boxShadow = `inset 0 0 220px 60px ${urgent ? 'rgba(255,40,20,0.75)' : 'rgba(255,170,40,0.6)'}`;
  };
  // ---- the wheel's shape: a hub in the middle and one cut-stone shard per entry around it, a gap between the shards.
  // The gaps are straight lines shifted off the centre the same way for every shard (a pinwheel); both rims are true circles. ----
  const WH = { hub: 74, in: 90, out: 190, gap: 5, shift: 22 };
  function wheelShapes(n) {
    const clip = (poly, px, py, nx, ny) => { // keep what lies on the side of the line (px,py) that (nx,ny) points to
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const A = poly[i], B = poly[(i + 1) % poly.length];
        const da = (A[0] - px) * nx + (A[1] - py) * ny, db = (B[0] - px) * nx + (B[1] - py) * ny;
        if (da >= 0) out.push(A);
        if ((da >= 0) !== (db >= 0)) { const k = da / (da - db); out.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]); }
      }
      return out;
    };
    const step = Math.PI * 2 / n, paths = [], centers = [];
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i - 0.5) * step, a1 = a0 + step; // the shard of slot i lies between two boundary angles
      const pts = [];
      // outer rim, then inner rim (which follows the hub): both sampled finely so they read as circles
      const nOut = Math.max(8, Math.round(step / 0.06));
      for (let k = 0; k <= nOut; k++) { const a = a0 - 0.2 + (step + 0.4) * k / nOut; pts.push([Math.cos(a) * WH.out, Math.sin(a) * WH.out]); }
      const nIn = Math.max(8, Math.round(step / 0.06));
      for (let k = nIn; k >= 0; k--) { const a = a0 - 0.2 + (step + 0.4) * k / nIn; pts.push([Math.cos(a) * WH.in, Math.sin(a) * WH.in]); }
      let poly = pts;
      // boundary lines: shifted sideways (pinwheel); this shard keeps the near side of its two lines, with half a gap to spare
      for (const [a, sd] of [[a0, 1], [a1, -1]]) {
        const nx = -Math.sin(a), ny = Math.cos(a); // the normal points clockwise
        const o = WH.shift + (sd > 0 ? WH.gap : -WH.gap);
        poly = clip(poly, nx * o, ny * o, nx * sd, ny * sd);
      }
      paths.push('M' + poly.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z');
      let cx = 0, cy = 0; for (const q of poly) { cx += q[0]; cy += q[1]; } cx /= poly.length; cy /= poly.length;
      const ca = -Math.PI / 2 + i * step, rc = (WH.in + WH.out) / 2 + 4;
      centers.push([Math.cos(ca) * rc * 0.5 + cx * 0.5, Math.sin(ca) * rc * 0.5 + cy * 0.5, Math.cos(ca) * 9, Math.sin(ca) * 9]);
    }
    return { paths, centers };
  }
  function wheelHtml(n, head, cells) {
    const sh = wheelShapes(n), V = WH.out + 22;
    return `<svg class="iw-svg" viewBox="${-V} ${-V} ${V * 2} ${V * 2}" width="${V * 2}" height="${V * 2}"><circle class="iw-hub" r="${WH.hub}"/>` +
      sh.paths.map((d, i) => `<path class="iw-seg" data-i="${i}" d="${d}" style="--tx:${sh.centers[i][2]}px;--ty:${sh.centers[i][3]}px"/>`).join('') + '</svg>' +
      `<div class="iw-center">${head}<div class="iw-name"></div></div>` +
      cells.map((c, i) => `<div class="iw-it${c.sel ? ' sel' : ''}" data-i="${i}" style="left:${sh.centers[i][0]}px;top:${sh.centers[i][1]}px;--rc:${c.rc}"><span>${c.icon}</span><b>${c.sub}</b></div>`).join('');
  }
  // ---- radial item wheel (hold an item key) ----
  UI.itemWheel = function (slot, list, cur) {
    UI.itemWheelClose();
    const S = slot === 'g' ? { name: '投擲物', icon: '💣' } : G.ITEM_SLOTS.find((s) => s.id === slot);
    const d = document.createElement('div'); d.id = 'iwheel';
    const n = list.length, R0 = 120;
    d.innerHTML = wheelHtml(n, `<div style="font-size:26px">${S.icon}</div><div>${S.name}</div>`, list.map((id) => {
      const it = G.ITEM_BY_ID[id];
      return { sel: id === cur, rc: R(it.rarity), icon: it.icon, sub: '×' + (slot === 'g' ? P.grenades[id] : P.itemCount(id)) };
    }));
    UI.el.hud.appendChild(d);
    UI._iw = { list, sel: Math.max(0, list.indexOf(cur)), vx: 0, vy: 0, el: d };
    UI.itemWheelMove(0, 0);
  };
  // ---- radial weapon wheel (hold 1-3): the pick is assigned to that key ----
  UI.weaponWheel = function (k, list, cur) {
    UI.itemWheelClose();
    const W = G.weapons;
    const d = document.createElement('div'); d.id = 'iwheel'; d.className = 'ww';
    const n = list.length, R0 = 120;
    d.innerHTML = wheelHtml(n, `<div style="font-size:24px">🔁</div><div>キー <b style="color:var(--gold2)">${k + 1}</b> に割り当て</div>`, list.map((t) => {
      const inf = W.tokInfo(t), key = W.order().indexOf(t);
      return { sel: t === cur, rc: R(inf.rarity), icon: inf.icon, sub: key < 3 ? key + 1 : '⇕' };
    }));
    UI.el.hud.appendChild(d);
    UI._iw = { list, sel: Math.max(0, list.indexOf(cur)), vx: 0, vy: 0, el: d, info: (t) => { const inf = W.tokInfo(t); return `<b style="color:${R(inf.rarity)}">${inf.icon} ${U.esc(inf.name)}</b>${inf.sub ? `<div class="iw-desc">${inf.sub}</div>` : ''}`; } };
    UI.itemWheelMove(0, 0);
  };
  UI.itemWheelMove = function (dx, dy) {
    const w = UI._iw; if (!w) return;
    w.vx = U.clamp(w.vx + dx, -160, 160); w.vy = U.clamp(w.vy + dy, -160, 160);
    if (Math.hypot(w.vx, w.vy) > 28) { let a = Math.atan2(w.vy, w.vx) + Math.PI / 2; if (a < 0) a += Math.PI * 2; w.sel = Math.round(a / (Math.PI * 2) * w.list.length) % w.list.length; }
    w.el.querySelectorAll('.iw-it, .iw-seg').forEach((e) => e.classList.toggle('sel', +e.dataset.i === w.sel));
    { const sg = w.el.querySelector(`.iw-seg[data-i="${w.sel}"]`), c = w.list[w.sel]; if (sg) { const t = (w.info ? G.weapons.tokInfo(c) : G.ITEM_BY_ID[c]); sg.style.setProperty('--rc', t ? R(t.rarity) : '#f1d79b'); } }
    if (w.info) { w.el.querySelector('.iw-name').innerHTML = w.info(w.list[w.sel]); return; }
    const it = G.ITEM_BY_ID[w.list[w.sel]]; w.el.querySelector('.iw-name').innerHTML = it ? `<b style="color:${R(it.rarity)}">${it.name}</b><div class="iw-desc">${U.esc(it.desc)}</div>` : '';
  };
  UI.itemWheelClose = function () { const w = UI._iw; if (!w) return null; w.el.remove(); UI._iw = null; return w.list[w.sel]; };
  UI.abilityFlash = function (sk) {
    const i = P.skills.indexOf(sk); if (i < 0) return;
    const el = UI.abEls[i]; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };
  UI.abilityDeny = function (sk) { const i = P.skills.indexOf(sk); if (i >= 0) { const el = UI.abEls[i]; el.style.transform = 'translateX(3px)'; setTimeout(() => el.style.transform = '', 80); } };
  UI.refreshItems = function () { UI._itemsDirty = true; };
  // change-only DOM writes: the HUD is refreshed every frame, but a write that changes nothing still costs (garbage, style work)
  const sText = (el, v) => { v = String(v); if (el._t !== v) { el._t = v; el.textContent = v; } };
  const sStyle = (el, k, v) => { const c = el._s || (el._s = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } };
  const sClass = (el, k, on) => { on = !!on; const c = el._c || (el._c = {}); if (c[k] !== on) { c[k] = on; el.classList.toggle(k, on); } };
  const sHtml = (el, v) => { if (el._h !== v) { el._h = v; el.innerHTML = v; } };
  function setCd(el, frac, secs, ready) {
    const cd = el._cd || (el._cd = el.querySelector('.cd')), ct = el._cdt || (el._cdt = el.querySelector('.cdt'));
    const pc = Math.round(frac * 100);
    if (el._pc !== pc) { el._pc = pc; cd.style.setProperty('--p', pc + '%'); }
    sText(ct, secs > 0 ? (secs < 10 ? secs.toFixed(1) : Math.ceil(secs)) : '');
    sClass(el, 'ready', ready);
  }
  let slowT = 0, lastHp = -1, trailHp = 0;
  UI.update = function (dt) {
    const e = UI.el;
    if (!P || !P.weapons) return;
    const st = P.stats;
    // HP
    const hpk = Math.max(0, P.hp) / st.maxHp;
    sStyle(e.hpFill, 'width', (hpk * 100).toFixed(2) + '%');
    // the pale "damage trail": jumps up with the bar, but after a hit it holds a moment and then drains down to it.
    // (driven here, not by a CSS transition: continuous regeneration changes the width every frame and restarted that transition forever,
    // which left the old, higher level standing as a bar that looked like a promise of "healing up to here")
    { let tr = UI._tr === undefined ? hpk : UI._tr;
      if (hpk >= tr) { tr = hpk; UI._trHold = 0; }
      else { if (lastHp - P.hp > 0.5) UI._trHold = 0.25; if (UI._trHold > 0) UI._trHold -= dt; else tr = Math.max(hpk, tr - dt * 1.1); }
      UI._tr = tr; sStyle(e.hpTrail, 'width', (tr * 100).toFixed(2) + '%'); }
    lastHp = P.hp;
    { const hk = Math.ceil(Math.max(0, P.hp)) + '|' + st.maxHp + '|' + (P.os > 0.5 ? Math.ceil(P.os) : 0) + '|' + (P.revives || 0); if (UI._hk !== hk) { UI._hk = hk; e.hpText.innerHTML = `${Math.ceil(Math.max(0, P.hp))}<small> / ${st.maxHp}</small>${P.os > 0.5 ? ` <span class="os-num" title="オーバーシールド">${G.Icons ? G.Icons.html('ui:os') : '🛡'}+${Math.ceil(P.os)}</span>` : ''} <span class="revives" title="魂の灯火（死亡時に燃えて復活する）">🪔×${P.revives || 0}</span>`; } }
    sStyle(e.osFill, 'width', Math.min(100, P.os / Math.max(50, st.maxHp) * 100).toFixed(1) + '%');
    sStyle(e.lowhp, 'opacity', hpk < 0.3 ? ((0.5 + Math.sin(G.game.time * 6) * 0.25) * (1 - hpk / 0.3)).toFixed(3) : 0);
    if (hpk < 0.3 && !P.dead) { UI._hb = (UI._hb || 0) - dt; if (UI._hb <= 0) { UI._hb = 0.5 + hpk * 2; G.sfx.heartbeat(1 - hpk / 0.3); } }
    // ammo
    const w = P.weapon, ws = G.weapons.curStats;
    if (w && ws && P.meleeMode) {
      sText(e.ammoMag, '⚔'); sText(e.ammoMax, '近接');
      sClass(e.ammo, 'low', false); sStyle(e.reloadBar, 'opacity', 0);
      const ch = e.crosshair.children;
      sStyle(ch[0], 'top', '-13px'); sStyle(ch[1], 'top', '4px'); sStyle(ch[2], 'left', '-13px'); sStyle(ch[3], 'left', '4px');
      sStyle(e.crosshair, 'opacity', P.sprinting ? 0.25 : 0.8); sClass(e.crosshair, 'ads', false);
    } else if (w && ws) {
      sText(e.ammoMag, st.infAmmo > 0 ? '∞' : w.mag);
      sText(e.ammoMax, ws.mag);
      sClass(e.ammo, 'low', w.mag <= Math.max(1, ws.mag * 0.25));
      sStyle(e.reloadBar, 'opacity', w.reloading ? 1 : 0);
      if (w.reloading) sStyle(e.reloadBar.firstChild, 'width', ((1 - w.reloadT / w.reloadDur) * 100).toFixed(1) + '%');
      // crosshair spread
      const sp = G.weapons.currentSpread(ws);
      const vf = THREE.MathUtils.degToRad(G.camera.fov);
      const gap = 6 + Math.tan(THREE.MathUtils.degToRad(sp) / 2) / Math.tan(vf / 2) * window.innerHeight / 2;
      const ch = e.crosshair.children;
      const gq = Math.round(gap * 2) / 2; // half-pixel steps: no style write for sub-pixel jitter
      sStyle(ch[0], 'top', (-gq - 9) + 'px'); sStyle(ch[1], 'top', gq + 'px'); sStyle(ch[2], 'left', (-gq - 9) + 'px'); sStyle(ch[3], 'left', gq + 'px');
      const ads = G.weapons.adsT > 0.6;
      const scoped = !!G.weapons.isScoped;
      sStyle(e.crosshair, 'opacity', P.sprinting ? 0.25 : scoped || G.weapons.dotAds ? 0 : 1);
      sClass(e.crosshair, 'ads', ads);
    }
    // abilities
    for (let i = 0; i < 4; i++) {
      const sk = P.skills[i], el = UI.abEls[i];
      if (!sk) { sClass(el, 'empty', true); UI.setIc(el, '·'); setCd(el, 0, 0, false); sText(el._cnt || (el._cnt = el.querySelector('.cnt')), ''); if (el.hasAttribute('data-tip')) el.removeAttribute('data-tip'); continue; }
      sClass(el, 'empty', false);
      UI.setIc(el, sk.def.icon);
      const ready = G.abilities.ready(sk);
      const frac = sk.maxCharges ? (sk.charges > 0 ? 0 : sk.cd / Math.max(0.01, sk.maxCd)) : sk.cd / Math.max(0.01, sk.maxCd);
      setCd(el, Math.max(0, Math.min(1, frac)), sk.maxCharges && sk.charges > 0 ? 0 : sk.cd, ready);
      sText(el._cnt || (el._cnt = el.querySelector('.cnt')), (sk.maxCharges ? sk.charges + '/' + sk.maxCharges : '') + (sk.lv ? ' Lv' + sk.lv : ''));
      const bar = el._bar || (el._bar = el.querySelector('.bar')); sStyle(bar, 'width', sk.maxCharges && sk.charges < sk.maxCharges ? ((1 - sk.cd / Math.max(0.01, sk.maxCd)) * 100).toFixed(1) + '%' : '0');
    }
    const gcd = P.grappleCd, gmax = G.grappleCdOf(st);
    setCd(UI.grEl, gcd / Math.max(0.01, gmax), gcd, gcd <= 0);
    sClass(UI.grEl, 'active-on', P.grapple.state === 'attached');
    const pmax = P.pileCdMax();
    setCd(UI.pileEl, P.pileFree ? 0 : (P.pileCd || 0) / pmax, P.pileFree ? 0 : P.pileCd || 0, P.pileReady());
    sClass(UI.pileEl, 'active-on', !!P.pileState);
    const lv = P.pileLevel(); sText(UI.pileEl._cnt || (UI.pileEl._cnt = UI.pileEl.querySelector('.cnt')), lv ? 'Lv' + lv : '');
    // items (throttled)
    slowT -= dt;
    if (slowT <= 0 || UI._itemsDirty) {
      slowT = 0.2; UI._itemsDirty = false;
      const gid = P.grenadeSel, gn = P.grenades[gid] || 0;
      const gi = G.ITEM_BY_ID[gid];
      UI.setIc(UI.gnEl, gi && gn ? gi.icon : '💣');
      UI.gnEl.querySelector('.cnt').textContent = gn ? '×' + gn : '';
      UI.gnEl.classList.toggle('empty', !gn);
      const types = Object.keys(P.grenades).filter((k) => P.grenades[k] > 0).length;
      { const gk = G.input.keyName('grenade'); UI.gnEl.querySelector('.key').textContent = types > 1 ? `${gk} (${G.input.keyName('cycleGrenade')})` : gk; }
      G.ITEM_SLOTS.forEach((S, i) => {
        const el = UI.itEls[i], id = P.selItem(S.id), kinds = P.slotItems(S.id).length;
        if (!id) { el.classList.add('empty'); UI.setIc(el, '·'); el.querySelector('.cnt').textContent = ''; return; }
        el.classList.remove('empty');
        UI.setIc(el, G.ITEM_BY_ID[id].icon); el.querySelector('.cnt').textContent = '×' + P.itemCount(id) + (kinds > 1 ? ` +${kinds - 1}` : '');
      });
      // buffs grid
      const sig = [...P.buffs].map(([k, n]) => k + n).join();
      if (sig !== UI._bsig) {
        UI._bsig = sig;
        const old = new Set((UI._bids || []));
        e.buffs.innerHTML = [...P.buffs].map(([id, n]) => { const b = G.BUFF_BY_ID[id]; return `<div class="bicon${old.has(id) ? '' : ' new'}" style="--rc:${R(b.rarity)}">${b.icon}${n > 1 ? `<span class="st">${n}</span>` : ''}</div>`; }).join('');
        UI._bids = [...P.buffs.keys()];
        // never clip: add columns when the rows run out
        { const rows = Math.max(3, Math.floor((innerHeight - (UI._bTop || 170) - 230) / 38)); const cols = Math.max(4, Math.ceil(P.buffs.size / rows)); e.buffs.style.gridTemplateColumns = `repeat(${cols}, 34px)`; }
      }
      // temp effects
      sHtml(e.tempfx, [...P.temps].filter(([id, t]) => t.t < 999 && !id.startsWith('regen_')).map(([, t]) => t).map((t) => `<div class="tfx">${t.icon}<span>${Math.ceil(t.t)}s</span></div>`).join('') + (P.os > 0 ? `<div class="tfx">💠${Math.ceil(P.os)}</div>` : ''));
      // coins & meta
      sText(e.coinVal, U.fmt(G.game.run.coins));
      const r = G.game.run;
      sHtml(e.runMeta, `⏱ <b>${U.time(r.playT !== undefined ? r.playT : G.game.time - r.startT)}</b>　💀 <b>${r.kills}</b>　⚔️ <b>${U.fmt(Math.round(r.dmgDealt || 0))}</b><br>🌱 シード <b>${G.game.seed}</b><br><span style="letter-spacing:2px">${(G.game.route || []).slice(-12).map((k) => G.Areas.TYPES[k].icon).join('')}</span>`);
      UI.updateObjective();
      // the boon grid always sits just below the top-left panel (objective / run info grow and shrink)
      { const tl = document.getElementById('hud-tl'); if (tl) { const y = Math.max(170, Math.round(tl.getBoundingClientRect().bottom + 10)); if (UI._bTop !== y) { UI._bTop = y; e.buffs.style.top = y + 'px'; e.buffs.style.maxHeight = `calc(100vh - ${y + 230}px)`; } } }
    }
    // directional damage indicators
    for (let i = UI.dirHits.length - 1; i >= 0; i--) {
      const h = UI.dirHits[i]; h.t -= dt;
      const to = h.pos.clone().sub(P.pos);
      const ang = Math.atan2(to.x, -to.z) + P.yaw;
      h.el.style.transform = `rotate(${ang}rad)`;
      h.el.style.opacity = Math.min(1, h.t);
      if (h.t <= 0) { h.el.remove(); UI.dirHits.splice(i, 1); }
    }
    if (UI.tintT > 0) { UI.tintT -= dt; if (UI.tintT <= 0) UI.el.tint.style.opacity = 0; }
    UI.updateCompass();
  };
  let compassT = 0;
  UI.updateCompass = function () {
    const nowT = performance.now(); if (nowT - compassT < 33) return; compassT = nowT; // 30 Hz is plenty for a compass strip
    const strip = UI.el.compass; const W2 = 230;
    const items = [];
    const card = [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]];
    const yawH = -P.yaw; // heading (0 = north/-z)
    const rel = (a) => U.wrapAngle(a - yawH);
    for (const [l, a] of card) items.push([rel(a), `<span class="cdir" style="left:${W2}px">${l}</span>`]);
    for (let a = -Math.PI; a < Math.PI; a += Math.PI / 4) if (Math.abs(a % (Math.PI / 2)) > 0.1) items.push([rel(a), `<span style="left:${W2}px">·</span>`]);
    const w = G.world;
    if (w && w.exits) for (const ex of w.exits) if (ex.open && ex.type) items.push([rel(Math.atan2(ex.x - P.pos.x, -(ex.z - P.pos.z))), `<span class="mark" style="left:${W2}px">${G.Areas.TYPES[ex.type].icon}</span>`]);
    if (w) for (const it of w.interactables) if (it.type === 'chest' && !it.opened) items.push([rel(Math.atan2(it.pos.x - P.pos.x, -(it.pos.z - P.pos.z))), `<span class="mark" style="left:${W2}px;font-size:11px">📦</span>`]);
    let n = 0;
    for (const e of G.enemies.list) { if (!e.alive || e.noBar || e.boss && !e.showBar || n > 40) continue; n++; items.push([rel(Math.atan2(e.pos.x - P.pos.x, -(e.pos.z - P.pos.z))), `<span class="enemy${e.elite ? ' elite' : ''}" style="left:${W2}px"></span>`]); }
    let html = '';
    for (const [a, h] of items) { if (Math.abs(a) > Math.PI / 2) continue; const x = W2 + a / (Math.PI / 2) * W2; html += h.replace(`left:${W2}px`, `left:${x.toFixed(1)}px`); }
    sHtml(strip, html);
  };
  // the frenzy timer: a quiet thin bar with the time left until the foes grow frantic (and, once they have, until the next step)
  UI.enrageGauge = function () {
    const E = G.game.enrage; if (!E || !E.on || !E.grace) return '';
    const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
    if (E.lv > 0) {
      const into = (E.t - E.grace) % E.step, k = E.lv >= 10 ? 1 : into / E.step;
      return `<div class="en-g hot"><span>🔥 激化 Lv${E.lv}（被ダメ+${E.lv * 15}% ／ 敵の動き+${E.lv * 3}%）${E.lv < 10 ? ' 次まで ' + fmt(E.step - into) : ''}</span><i><b style="width:${Math.round(k * 100)}%"></b></i></div>`;
    }
    return `<div class="en-g"><span>⏳ 激化まで ${fmt(E.grace - E.t)}</span><i><b style="width:${Math.round(U.clamp(E.t / E.grace, 0, 1) * 100)}%"></b></i></div>`;
  };
  UI.updateObjective = function () {
    const o = G.game.objective; const el = UI.el.objective;
    if (!o) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.classList.toggle('done', !!o.done);
    const an = G.Depth && G.Depth.anomText();
    let bar = '';
    if (o.done && (o.progress || o.segs)) bar = '<div class="ob-bar"><div style="width:100%"></div></div>';
    else if (o.segs) {
      const sg = o.segs(), tot = sg.reduce((s, x) => s + x.w, 0) || 1;
      if (sg.length > 1) bar = `<div class="ob-segs">${sg.map((x) => `<div class="ob-seg${x.cur ? ' cur' : ''}${x.k >= 1 ? ' full' : ''}${x.ticks ? ' tk' : ''}" style="flex:${x.w / tot}"><div style="width:${Math.round(U.clamp(x.k, 0, 1) * 100)}%"></div>${x.ticks && x.k < 1 ? `<i style="left:${Math.round((x.lock || 0) * 100)}%" class="${x.lock ? 'on' : ''}"></i>` : ''}</div>`).join('')}</div>`;
      else bar = `<div class="ob-bar"><div style="width:${Math.round(U.clamp(sg[0] ? sg[0].k : 0, 0, 1) * 100)}%"></div></div>`;
    } else if (o.progress) bar = `<div class="ob-bar"><div style="width:${Math.round(o.progress() * 100)}%"></div></div>`;
    const sub = !o.done && o.sub ? o.sub() : o.done && o.kind ? '✅ 目標達成' : '';
    const html = `<div class="ob-row"><span class="ob-ic">${o.icon}</span><span>${o.text()}</span></div>${sub ? `<div class="ob-sub">${sub}</div>` : ''}${an ? `<div class="ob-row" style="color:#ff9a7a;font-size:12px">⚠ 異変: ${an}</div>` : ''}${UI.enrageGauge()}${bar}`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  };
  // the whole run as a strip of nodes grouped by field: visited areas show what they were, the guardians are marked, "you are here" glows
  const ROUTE_ICON = { combat: '⚔', elite: '💀', cursed: '☠', vault: '🗝', trial: '🎯', shop: '🛒', boss: '👑', event: '？', shrine: '⛩', forge: '⚒', casino: '🎰', bank: '🏦', auction: '🔨', merc: '🗡', offering: '🕯' };
  UI.routeHTML = function () {
    const R = G.Run, GM = G.game, n = GM.area || 1, tot = R.areas();
    if (!GM.run) return '';
    const segs = [];
    for (let a = 1; a <= tot; a++) {
      const f = R.field(a), last = segs[segs.length - 1];
      if (!last || last.f !== f || R.seg(a) !== last.s) segs.push({ f, s: R.seg(a), nodes: [] });
      const boss = R.isBoss(a), done = a < n, cur = a === n, kind = (GM.route || [])[a - 1];
      segs[segs.length - 1].nodes.push(`<i class="rt-n${boss ? ' boss' : ''}${done ? ' done' : ''}${cur ? ' cur' : ''}" title="エリア${a}${boss ? '（守護者）' : ''}">${boss ? '👑' : done || cur ? (ROUTE_ICON[kind] || a) : a}</i>`);
    }
    const nb = Math.min(tot, Math.ceil(n / 6) * 6);
    return `<div class="rt-bar">${segs.map((s) => `<div class="rt-seg"><span class="rt-name">${G.Run.FIELD_NAME[s.f] || s.f}</span><span class="rt-nodes">${s.nodes.join('')}</span></div>`).join('')}</div><div class="rt-next">${n >= tot ? '最後の守護者が待つ' : nb === n ? '👑 守護者の間' : `👑 守護者まで あと${nb - n}エリア（エリア${nb}）`}</div>`;
  };
  UI.setArea = function (title, sub) {
    const D = G.Run.def();
    UI.el.areaTitle.innerHTML = title + ` <span class="ar-diff" style="--dc:${D.col}">${G.Run.label()}</span>`;
    UI.el.areaSub.textContent = sub;
    let rb = document.getElementById('route-bar');
    if (!rb) { rb = document.createElement('div'); rb.id = 'route-bar'; UI.el.areaSub.after(rb); }
    rb.innerHTML = UI.routeHTML();
  };
  UI.banner = function (big, sub, boss, hold) {
    const b = UI.el.banner;
    UI.bannerUntil = performance.now() + 3200; if (hold) UI.bannerHold = UI.bannerUntil - 400;
    b.innerHTML = `<div class="bn-big">${big}</div><div class="bn-line"></div><div class="bn-sub">${sub}</div>`;
    b.classList.toggle('boss', !!boss);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  };
  // guardians' displayed level (the boss bar and the codex use the same number)
  UI.bossLv = (lv) => Math.round(lv * 1.6 + 8) + (G.Run ? G.Run.lvOff() : 0); // + the difficulty's level offset, like every other enemy
  UI.bossBar = function (o) {
    const e = UI.el;
    if (!o) { e.boss.classList.add('hidden'); document.body.classList.remove('boss-on'); return; }
    e.boss.classList.remove('hidden'); document.body.classList.add('boss-on');
    // guardians wear a higher level than the area (display only; their stats are unchanged)
    const nm = `${o.lv ? `<span class="boss-lv">Lv.${UI.bossLv(o.lv)}</span>` : ''}${U.esc(o.name)}  —  ${U.esc(o.title)}`;
    if (e.bossName._h !== nm) { e.bossName.innerHTML = nm; e.bossName._h = nm; }
    // multi-boss fights (the twins): one bar per boss, side by side
    let sp = document.getElementById('boss-split');
    if (o.split) {
      if (!sp) { sp = document.createElement('div'); sp.id = 'boss-split'; e.boss.insertBefore(sp, e.boss.querySelector('#boss-shield')); }
      if (!sp.children.length || sp.children.length !== o.split.length) sp.innerHTML = o.split.map((_, i) => `<div class="bs-one ${i ? 'right' : 'left'}"><div class="bs-nm"></div><div class="bs-bar"><div class="bs-trail"></div><div class="bs-fill"></div><span class="bs-st"></span></div></div>`).join('');
      o.split.forEach((b, i) => {
        const el = sp.children[i], k2 = Math.max(0, b.hp) / Math.max(1, b.max);
        el.className = `bs-one ${i ? 'right' : 'left'} ${b.col || ''}${b.down ? ' down' : ''}${b.enraged ? ' enraged' : ''}${b.linked ? ' linked' : ''}`;
        const nm = `${U.esc(b.name)}${b.enraged ? ' 😡' : ''}`;
        if (el._nm !== nm) { el.querySelector('.bs-nm').innerHTML = nm; el._nm = nm; }
        el.querySelector('.bs-fill').style.width = (k2 * 100) + '%'; el.querySelector('.bs-trail').style.width = (k2 * 100) + '%';
        el.querySelector('.bs-st').textContent = b.down ? `膝をついた — 復活まで ${b.down.toFixed(1)}秒` : `${Math.round(k2 * 100)}%`;
      });
      sp.style.display = ''; e.boss.querySelector('#boss-bar').style.display = 'none';
    } else if (sp) { sp.style.display = 'none'; e.boss.querySelector('#boss-bar').style.display = ''; }
    const k = Math.max(0, o.hp) / o.max;
    e.bossFill.style.width = (k * 100) + '%'; e.bossTrail.style.width = (k * 100) + '%';
    e.bossShield.style.display = o.maxShield ? '' : 'none';
    if (o.maxShield) e.bossShieldFill.style.width = (o.shield / o.maxShield * 100) + '%';
    e.bossPhase.textContent = o.phase || '';
  };
  UI.showInteract = function (o) {
    const p = UI.el.interact;
    if (!o) { if (UI._ikey !== null || !p.classList.contains('hidden')) p.classList.add('hidden'); UI._ikey = null; return; }
    if (UI._ikey === o.key && !o.force) return;
    UI._ikey = o.key;
    p.classList.remove('hidden');
    p.style.setProperty('--rc', o.rc || 'var(--line)');
    p.innerHTML = `<div class="ip-head"><div class="ip-icon">${o.icon}</div><div><div class="ip-name">${U.esc(o.name)}</div><div class="ip-cat">${o.cat || ''}</div></div></div>${o.desc ? `<div class="ip-desc">${o.desc}</div>` : ''}${o.stats ? `<div class="ip-stats">${o.stats}</div>` : ''}${o.note ? `<div class="ip-note">${o.note}</div>` : ''}<div class="ip-foot"><div class="ip-price ${o.afford === false ? 'no' : ''}">${o.price !== undefined ? '🪙 ' + (typeof o.price === 'string' ? o.price : U.fmt(o.price)) : ''}</div><div class="ip-key">${G.K('interact')} ${o.action || '購入'}</div></div>`;
  };
  // ---- centre-screen hold gauge (ornate chests) ----
  UI.holdRing = function (k, mode, o) {
    let el = UI._hr;
    if (!el) {
      el = UI._hr = document.createElement('div'); el.id = 'hold-ring';
      el.innerHTML = '<div class="hr-ring"></div><div class="hr-key">E</div><div class="hr-lab"></div>';
      UI.el.hud.appendChild(el);
    }
    const now = performance.now();
    // a hide request in the same game frame as a show (ritual gauge vs. the interaction pass) is ignored
    if (k < 0) { if (now > (UI._hrDone || 0) && UI._hrShownAt !== G.game.time && el.className !== '') el.className = ''; return; }
    UI._hrShownAt = G.game.time;
    if (mode === 'done') {
      UI._hrDone = now + 450;
      el.className = 'on done'; el.style.setProperty('--p', '100%');
      el.querySelector('.hr-key').textContent = '✓'; el.querySelector('.hr-lab').textContent = '開いた！';
      return;
    }
    if (now < (UI._hrDone || 0)) return;
    const cn = 'on' + (mode === 'pry' ? ' pry' : '') + (k > 0.75 ? ' near' : '') + (o && o.cls ? ' ' + o.cls : '');
    if (el.className !== cn) el.className = cn;
    const pv = (k * 100).toFixed(1) + '%'; if (el._pv !== pv) { el._pv = pv; el.style.setProperty('--p', pv); }
    const hk = el._hk || (el._hk = el.querySelector('.hr-key')), hl = el._hl || (el._hl = el.querySelector('.hr-lab'));
    const kt = o && o.center ? o.center : k > 0 ? Math.floor(k * 100) + '%' : G.K('interact');
    const lt = o && o.label ? o.label : mode === 'pry' ? 'こじ開け中…' : k > 0 ? `${G.K('interact')} を押し続けて` : `${G.K('interact')} 長押しで開ける`;
    if (hk.textContent !== kt) hk.textContent = kt; if (hl.textContent !== lt) hl.textContent = lt;
  };
  UI.shakeInteract = function () { const p = UI.el.interact; p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); };
  UI.showHud = function (on) { UI.el.hud.classList.toggle('hidden', !on); };
  UI.statusOverlay = function (on, force, compact) {
    const o = UI.el.statusOv;
    if (!on) { o.classList.add('hidden'); if (G.StatusUI) G.StatusUI.unmount(); return; }
    // holding Tab auto-repeats keydown: only build the sheet once per press, otherwise it keeps jumping back to the top
    if (!o.classList.contains('hidden') && !force) return;
    const keep = o.scrollTop;
    o.classList.remove('hidden');
    o.innerHTML = UI.statusHTML(compact);
    o.scrollTop = force ? keep : 0;
    if (G.StatusUI) G.StatusUI.mount(o);
  };
  UI.statusOpen = () => !UI.el.statusOv.classList.contains('hidden');
  UI.statusScroll = function (dy) {
    const o = UI.el.statusOv, step = Math.sign(dy) * Math.min(400, Math.max(40, Math.abs(dy)));
    // scroll the sheet itself, or a scrollable column inside it if the sheet has no room to move
    const before = o.scrollTop; o.scrollTop += step;
    if (o.scrollTop !== before) return;
    for (const el of o.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY)) { el.scrollTop += step; }
  };
  UI.statsTable = function () {
    const st = P.stats;
    const rows = Object.entries(G.STAT_NAMES).map(([k, [ic, nm, t]]) => {
      let v = st[k];
      if (t === 'p') v = (k === 'critChance' || k === 'dodge' || k === 'lifesteal' || k === 'armor' || k === 'cdr') ? Math.round(v * 100) + '%' : U.pct(v);
      else if (t === 'x') v = '×' + v.toFixed(2);
      else if (t === 'cd') v = Math.round((v - 1) * 100) + '%';
      else v = Math.round(v * 10) / 10;
      return `<div class="si-stat"><span>${ic} ${nm}</span><b>${v}</b></div>`;
    });
    return rows.join('');
  };

  // ---------------- screens ----------------
  UI.screen = function (html, cls) {
    UI.el.screens.innerHTML = `<div class="screen ${cls || ''}">${html}</div>`;
    const s = UI.el.screens.firstChild;
    s.querySelectorAll('button, .card, .choice, .cx-tab, .cx-item').forEach((b) => b.addEventListener('mouseenter', () => G.sfx.ui('hover')));
    return s;
  };
  UI.clearScreen = function () { UI.el.screens.innerHTML = ''; UI.tt.style.display = 'none'; UI._buffApi = null; };

  UI.title = function () {
    const rec = G.save.data.records;
    const s = UI.screen(`<div class="title-wrap">
      <div class="title-logo">ABYSSAL DESCENT</div>
      <div class="title-jp">深 淵 降 下</div>
      <div class="title-menu">
        ${G.game.loadRun() ? `<button class="btn primary" id="t-cont">▶ 続きから（エリア ${G.game.loadRun().area}）</button>` : ''}
        <button class="btn ${G.game.loadRun() ? '' : 'primary'}" id="t-start">⚔️ 深淵へ潜る${G.game.loadRun() ? '（新しく始める）' : ''}</button>
        <div class="title-seed">🌱 シード <input id="t-seed" placeholder="ランダム" maxlength="12"></div>
        <button class="btn" id="t-tut">📘 チュートリアル</button>
        <button class="btn" id="t-codex">📖 図鑑</button>
        <button class="btn" id="t-settings">⚙️ 設定</button>
        <button class="btn" id="t-help">🎮 操作方法</button>
      </div>
      <div class="title-rec">🏆 クリア ${['easy', 'normal', 'hard'].map((k) => `<b style="color:${(rec.clears || {})[k] ? G.Run.DIFFS[k].col : '#5a5048'}">${G.Run.DIFFS[k].name}${(rec.clears || {})[k] ? '✓' : ''}</b>`).join(' ')}${(() => { const m = G.Run.maxExtra(), c = m - ((rec.clears || {})['extra' + m] ? 0 : 1); return c > 0 ? `　<b style="color:${G.Run.DIFFS.extra.col}">エクストラ ${c}✓</b>` : ''; })()}　|　💀 最多撃破 <b>${rec.bestKills}</b>　|　🎲 挑戦回数 <b>${rec.runs}</b>　|　☠ 累計撃破 <b>${rec.totalKills}</b></div>
      <div class="title-foot">クリックでゲーム開始時にマウスがロックされます　·　推奨: フルスクリーン（Ctrl+W 等の誤操作防止）</div>
    </div>`);
    let diffPick = null;
    const go = () => { G.sfx.init(); G.sfx.ui('select'); const v = s.querySelector('#t-seed').value.trim(); G.game.startRun(v, diffPick); };
    const tut = () => { G.sfx.init(); G.sfx.ui('select'); G.Tutorial.start(s.querySelector('#t-seed') ? s.querySelector('#t-seed').value.trim() : ''); };
    // a new run first asks whether you want the tutorial (can be turned off)
    const newRun = () => UI.difficulty((d) => { diffPick = d; askTut(); }, () => UI.title());
    const askTut = () => {
      const S = G.save.data.settings;
      if (S.askTutorial === false) return go();
      G.sfx.init(); G.sfx.ui('open');
      const seedV = s.querySelector('#t-seed').value.trim();
      UI.choice('📘 チュートリアルを受けますか？', '基本操作（移動・射撃・近接・グラップル・パイルドライバー）、アイテムや投擲物の使い方とホイール、エリアの流れまで、実際に体を動かしながら学べます（約5〜8分）。<br>チュートリアルが終わると、そのまま本編が始まります。', [
        { icon: '📘', label: 'チュートリアルを受ける', sub: 'はじめての方におすすめ', onPick: () => { G.sfx.ui('select'); G.Tutorial.start(seedV); } },
        { icon: '⚔️', label: 'すぐに本編を始める', onPick: () => { G.sfx.ui('select'); G.game.startRun(seedV, diffPick); } },
        { icon: '🚫', label: '今後は聞かずに本編を始める', sub: '設定からいつでも戻せます', onPick: () => { S.askTutorial = false; G.save.write(); G.sfx.ui('select'); G.game.startRun(seedV, diffPick); } },
      ], () => UI.title());
    };
    s.querySelector('#t-start').onclick = () => {
      if (!G.game.loadRun()) return newRun();
      UI.choice('新しく始めますか？', '中断中のランのデータは消えます。', [{ icon: '⚔️', label: '新しく始める', onPick: () => { G.game.clearRun(); newRun(); } }, { icon: '↩', label: 'やめる', onPick: () => UI.title() }]);
    };
    const ct = s.querySelector('#t-cont'); if (ct) ct.onclick = () => { G.sfx.init(); G.sfx.ui('select'); G.game.continueRun(); };
    s.querySelector('#t-codex').onclick = () => { G.sfx.init(); G.sfx.ui('open'); G.codex.open(() => UI.title()); };
    s.querySelector('#t-tut').onclick = () => {
      if (!G.game.loadRun()) return tut();
      UI.choice('チュートリアルを始めますか？', '中断中のランのデータは消えます。', [{ icon: '📘', label: 'チュートリアルを始める', onPick: () => { G.game.clearRun(); tut(); } }, { icon: '↩', label: 'やめる', onPick: () => UI.title() }]);
    };
    s.querySelector('#t-settings').onclick = () => { G.sfx.init(); G.sfx.ui('open'); UI.settings(() => UI.title()); };
    s.querySelector('#t-help').onclick = () => { G.sfx.init(); G.sfx.ui('open'); UI.help(() => UI.title()); };
  };
  UI.help = function (back) {
    const k = (a, b) => `<kbd>${a}</kbd><span>${b}</span>`;
    const s = UI.screen(`<div class="panel" style="width:min(820px,94vw)"><h2>🎮 操作方法</h2>
      <div class="keys">
        ${k(['forward', 'left', 'back', 'right'].map(G.K).join(' '), '移動')}${k(G.K('jump'), 'ジャンプ（段差の前で押し続けるとよじ登り）')}${k('空中で' + G.K('crouch'), 'パイルドライバー（標準装備・強化で成長）')}
        ${k(G.K('sprint'), '歩く（標準は常に走る・設定で変更可／空中ダッシュは加護で解放）')}${k(G.BIND.crouch.map(G.input.codeName).filter((v, i, a) => a.indexOf(v) === i).join(' / '), 'しゃがみ（スプリント中でスライディング）')}
        ${k('左クリック', '射撃 ／ 近接武器時は連撃')}${k('右クリック', 'ADS（照準） ／ 近接武器時は重撃（隙大）')}
        ${k(G.K('reload'), 'リロード')}${k(G.K('w3'), '近接武器に持ち替え（キー3は近接武器の固定枠・持っている間は移動が速い）')}
        ${k(G.K('grapple'), `グラップル（押し続けて巻き取り / 離すと解除 / ${G.K('jump')}で跳躍解除）`)}${k(G.K('interact'), 'インタラクト（購入・宝箱・出口）')}
        ${k(G.input.skillKey(0), 'アルティメット（強力・CT約2分）')}${k([1, 2, 3].map((i) => G.input.skillKey(i)).join(' / '), 'スキル（持ち物画面でドラッグして入れ替え）')}
        ${k(G.K('grenade'), '投擲物を投げる（長押しで選択ホイール）')}${k(G.K('cycleGrenade'), '投擲物の切替')}
        ${k(['item1', 'item2'].map(G.K).join(' / '), '消耗品の使用（どちらの枠にも入る）・長押しで選択ホイール')}${k(['w1', 'w2', 'w3'].map(G.K).join('・') + ' / ホイール', '武器の切替（ホイールは全武器を順に）')}${k(['w1', 'w2'].map(G.K).join('・') + ' 長押し', '銃1・銃2の入れ替え（持ち物画面のドラッグでも可）')}
        ${k(G.K('status') + ' / ' + G.K('inventory'), '持ち物・装備・ステータスの画面（防具・アタッチメントの付け替え、武器1/2の入れ替え、持ち物の整理、加護や効果の一覧）')}${k('Esc / I', 'ポーズ（Iはもう一度押すと再開）')}
      </div>
      <h3>🗺️ 流れ</h3>
      <div style="font-size:13.5px;line-height:1.7;color:#ddd3c0">エリアの目標を達成すると北の3つの門が開き、行き先（戦闘・精鋭・射的・邂逅・商人・宝物庫・祠・鍛冶場・呪いの闘技場）を自由に選べます。門の前には旅の商人（または古の交換石機）も店を出します。6エリアごとに守護者（ボス）が待ち構え、最後の守護者を倒すとクリアです（ボス戦の舞台は守護者ごとに変わります）。敵はエリアが進むほど強く（Lv表示）、一部はシールドを持ちます（EMP・電撃・爆発が有効）。コインは撃破・クリア・ボーナス・宝箱・破壊可能オブジェクトから得られます。</div>
      <div style="margin-top:18px;text-align:right"><button class="btn" id="h-back">↩ 戻る</button></div></div>`, 'dim');
    s.querySelector('#h-back').onclick = () => { G.sfx.ui('click'); back(); };
  };
  UI.settings = function (back) {
    const S = G.save.data.settings;
    if (S.askTutorial === undefined) S.askTutorial = true;
    const rowR = (id, label, min, max, step, fmt) => `<div class="set-row"><span>${label}</span><input type="range" id="s-${id}" min="${min}" max="${max}" step="${step}" value="${S[id]}"><span class="v" id="v-${id}">${fmt(S[id])}</span></div>`;
    const rowC = (id, label) => `<div class="set-row"><span>${label}</span><input type="checkbox" id="s-${id}" ${S[id] ? 'checked' : ''}><span></span></div>`;
    const s = UI.screen(`<div class="panel" style="width:min(640px,94vw)"><h2>⚙️ 設定</h2>
      ${rowR('sens', '🖱️ マウス感度', 0.1, 3, 0.05, (v) => (+v).toFixed(2))}
      ${rowR('adsSens', '🎯 ADS感度倍率', 0.2, 1.5, 0.05, (v) => (+v).toFixed(2))}
      ${rowR('fov', '👁️ 視野角（水平）', 80, 120, 1, (v) => v + '°')}
      ${rowR('volume', '🔊 音量', 0, 1, 0.01, (v) => Math.round(v * 100) + '%')}
      ${rowR('shake', '📳 画面揺れ', 0, 1.5, 0.05, (v) => Math.round(v * 100) + '%')}
      ${rowR('bob', '🚶 視点の揺れ', 0, 1.5, 0.05, (v) => Math.round(v * 100) + '%')}
      <div class="set-row"><span>🖥️ 画質</span><select id="s-quality"><option value="low">低（影なし）</option><option value="med">中</option><option value="high">高</option></select><span></span></div>
      ${rowC('dmgNums', '🔢 ダメージ表記')}${rowC('crouchToggle', '🧎 しゃがみ切替式')}${rowC('autoSprint', '🏃 常に走る（Shiftで歩く）')}${rowC('sprintToggle', '🏃 スプリント切替式（常に走るがOFFの時）')}${rowC('invertY', '↕️ 上下反転')}${rowC('fullscreen', '⛶ 開始時フルスクリーン')}${rowC('showFps', '📈 FPS表示')}${rowC('askTutorial', '📘 新しく始める時にチュートリアルを確認')}
      <div class="set-row"><span>⌨️ キー配置</span><button class="btn small" id="s-keys">キー設定を開く</button><span></span></div>
      <div class="set-row"><span>🗑️ データのリセット</span><button class="btn small" id="s-reset">リセットする…</button><span></span></div>
      <div style="margin-top:18px;text-align:right"><button class="btn" id="s-back">↩ 戻る</button></div></div>`, 'dim');
    s.querySelector('#s-reset').onclick = () => { G.sfx.ui('click'); UI.resetData(() => UI.settings(back)); };
    s.querySelector('#s-quality').value = S.quality;
    s.querySelector('#s-keys').onclick = () => { G.sfx.ui('click'); UI.keyConfig(() => UI.settings(back)); };
    for (const id of ['sens', 'adsSens', 'fov', 'volume', 'shake', 'bob']) {
      const inp = s.querySelector('#s-' + id), v = s.querySelector('#v-' + id);
      inp.oninput = () => { S[id] = +inp.value; v.textContent = inp.parentElement.querySelector('.v').textContent = id === 'fov' ? S[id] + '°' : id === 'volume' || id === 'shake' || id === 'bob' ? Math.round(S[id] * 100) + '%' : (+S[id]).toFixed(2); if (id === 'volume') G.sfx.setVolume(S[id]); G.save.write(); };
    }
    for (const id of ['dmgNums', 'crouchToggle', 'autoSprint', 'sprintToggle', 'invertY', 'fullscreen', 'showFps', 'askTutorial']) { const inp = s.querySelector('#s-' + id); inp.onchange = () => { S[id] = inp.checked; G.save.write(); }; }
    s.querySelector('#s-quality').onchange = (e) => { S.quality = e.target.value; G.save.write(); G.game.applyQuality(); };
    s.querySelector('#s-back').onclick = () => { G.sfx.ui('click'); back(); };
  };
  // data reset: choose what, then confirm (nothing can be undone); the page reloads afterwards
  UI.resetData = function (back) {
    const kinds = {
      settings: ['⚙️ 設定のみ', '操作感度・音量・画質・キー配置などを初期値に戻します。プレイ進捗はそのまま。'],
      progress: ['📖 プレイ進捗のみ', '図鑑・記録・クリア履歴（エクストラの解放）・中断データを消します。設定はそのまま。'],
      all: ['🧹 すべて', '設定とプレイ進捗の両方を消し、初めて起動した状態に戻します。'],
    };
    const pick = () => {
      const s = UI.screen(`<div class="panel" style="width:min(560px,94vw)"><h2>🗑️ データのリセット</h2>
        <div style="font-size:13.5px;color:#ddd3c0;line-height:1.6;margin-bottom:10px">消すものを選んでください。リセット後、ゲームを再読み込みします。</div>
        <div class="col">${Object.entries(kinds).map(([k, [t, d]]) => `<button class="choice" data-k="${k}" style="display:block;width:100%;text-align:left;color:#e8dcc0;font:inherit"><b>${t}</b><div style="font-size:12px;opacity:.8;margin-top:2px">${d}</div></button>`).join('')}</div>
        <div style="margin-top:14px;text-align:right"><button class="btn" id="rs-back">↩ 戻る</button></div></div>`, 'dim');
      s.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { G.sfx.ui('click'); confirm(b.dataset.k); });
      s.querySelector('#rs-back').onclick = () => { G.sfx.ui('click'); back(); };
    };
    const confirm = (k) => {
      const s = UI.screen(`<div class="panel" style="width:min(520px,94vw);text-align:center"><h2>⚠️ 本当にリセットしますか？</h2>
        <div style="font-size:15px;color:#ecdcb8;margin:8px 0"><b>${kinds[k][0]}</b></div>
        <div style="font-size:13px;color:#ddd3c0;line-height:1.6">${kinds[k][1]}<br><b style="color:#ff8a7a">この操作は元に戻せません。</b>${G.game && G.game.run && G.game.state !== 'title' ? '<br>プレイ中の冒険は、そのまま終了します。' : ''}</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:18px"><button class="btn primary" id="rs-yes" style="background:#8a2a2a">リセットする</button><button class="btn" id="rs-no">やめる</button></div></div>`, 'dim');
      s.querySelector('#rs-no').onclick = () => { G.sfx.ui('click'); pick(); };
      s.querySelector('#rs-yes').onclick = () => { G.sfx.ui('select'); G.save.reset(k); if (G.game) G.game.state = 'title'; s.querySelector('.panel').innerHTML = '<h2>リセットしました</h2><div style="margin-top:8px">再読み込みします…</div>'; setTimeout(() => location.reload(), 500); };
    };
    pick();
  };
  // key configuration: click a row, press a key (Esc cancels). A key already used elsewhere is swapped over.
  UI.keyConfig = function (back) {
    const I = G.input, S = G.save.data.settings;
    let waiting = null;
    const render = () => {
      const rows = I.BIND_LIST.map(([a, label]) => `<div class="set-row kc-row"><span>${label}</span><button class="btn small kc-btn${waiting === a ? ' wait' : ''}" data-a="${a}">${waiting === a ? 'キーを押す…（Escで取消）' : I.keyName(a)}</button><span>${S.keys && S.keys[a] ? '✎' : ''}</span></div>`).join('');
      const s = UI.screen(`<div class="panel" style="width:min(640px,94vw);max-height:90vh;overflow:auto"><h2>⌨️ キー設定</h2>
        <div class="kc-note">項目をクリックして新しいキーを押してください。他の操作で使用中のキーを選ぶと、その操作と入れ替わります。</div>
        ${rows}
        <div style="margin-top:18px;display:flex;justify-content:space-between"><button class="btn small" id="kc-reset">↺ 初期設定に戻す</button><button class="btn" id="kc-back">↩ 戻る</button></div></div>`, 'dim');
      s.querySelectorAll('.kc-btn').forEach((b) => { b.onclick = () => { G.sfx.ui('click'); waiting = b.dataset.a; render(); }; });
      s.querySelector('#kc-reset').onclick = () => { G.sfx.ui('click'); S.keys = {}; I.applyBinds(); G.save.write(); if (UI.buildAbilityRow && G.player && G.player.skills) UI.buildAbilityRow(); render(); };
      s.querySelector('#kc-back').onclick = () => { G.sfx.ui('click'); waiting = null; window.removeEventListener('keydown', onKey, true); back(); };
    };
    const onKey = (e) => {
      if (!waiting) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'Escape') { waiting = null; render(); return; }
      const a = waiting, code = e.code, prev = G.BIND[a][0];
      S.keys = S.keys || {};
      // whoever had this key as its main key takes our old one
      for (const [b] of I.BIND_LIST) if (b !== a && G.BIND[b][0] === code) S.keys[b] = prev;
      S.keys[a] = code;
      I.applyBinds(); G.save.write(); G.sfx.ui('select');
      if (UI.buildAbilityRow && G.player && G.player.skills) UI.buildAbilityRow();
      waiting = null; render();
    };
    window.addEventListener('keydown', onKey, true);
    render();
  };
  UI.pause = function () {
    const s = UI.screen(`<div class="panel" style="min-width:340px;text-align:center"><h2>⏸ PAUSED</h2>
      <div class="col">
        <button class="btn primary" id="p-resume">▶ 再開</button>
        <button class="btn" id="p-status">📊 ステータス</button>
        <button class="btn" id="p-codex">📖 図鑑</button>
        <button class="btn" id="p-settings">⚙️ 設定</button>
        <button class="btn" id="p-help">🎮 操作方法</button>
        ${G.Dev && G.Dev.on() ? '<button class="btn" id="p-dev">🛠 デバッグ（F9）</button>' : ''}
        ${G.Tutorial.active ? '<button class="btn" id="p-tutend">📘 チュートリアルを終了して本編へ</button>' : ''}
        <button class="btn" id="p-quit">🏳 諦めてタイトルへ</button>
      </div><div style="margin-top:12px;font-size:12px;color:var(--dim)">エリア ${G.game.area} · シード ${G.game.seed}</div></div>`, 'dim');
    s.querySelector('#p-resume').onclick = () => G.game.resume();
    s.querySelector('#p-status').onclick = () => { G.sfx.ui('open'); const sc = UI.screen(`<div class="panel" style="width:min(1000px,94vw);display:grid;grid-template-columns:1.3fr 1fr;gap:24px">${UI.statusHTML()}<div style="grid-column:1/-1;text-align:right"><button class="btn" id="st-back">↩ 戻る</button></div></div>`, 'dim'); sc.querySelector('#st-back').onclick = () => UI.pause(); };
    s.querySelector('#p-codex').onclick = () => { G.sfx.ui('open'); G.codex.open(() => UI.pause()); };
    s.querySelector('#p-settings').onclick = () => { G.sfx.ui('open'); UI.settings(() => UI.pause()); };
    s.querySelector('#p-help').onclick = () => { G.sfx.ui('open'); UI.help(() => UI.pause()); };
    { const d = s.querySelector('#p-dev'); if (d) d.onclick = () => { G.sfx.ui('open'); G.ui.clearScreen(); G.Dev.open(() => UI.pause()); }; }
    const te = s.querySelector('#p-tutend'); if (te) te.onclick = () => { G.sfx.ui('select'); G.Tutorial.finish(); };
    s.querySelector('#p-quit').onclick = () => { G.sfx.ui('click'); UI.choice('本当に諦めますか？', 'このランの進行は失われます（記録は保存されます）。', [{ icon: '🏳', label: '諦める', onPick: () => G.game.abandon() }], () => UI.pause()); };
  };
  UI.clickToResume = function () {
    const s = UI.screen(`<div class="clicklock" id="cl">🖱️ クリックして再開</div>`);
    s.style.pointerEvents = 'auto';
    s.onclick = () => G.game.resume();
  };
  // the player's money in a bold framed box (merchant, pawn shop, vending stone, gambling ...)
  UI.coinBox = (cls) => `<div class="coinbox ${cls || ''}"><span>🪙</span><b>${U.fmt((G.game.run && G.game.run.coins) || 0)}</b><small>所持金</small></div>`;
  UI.choice = function (title, desc, options, cancel) {
    const s = UI.screen(`<div class="panel" style="width:min(520px,94vw);position:relative">${/所持 🪙/.test(desc || '') ? UI.coinBox('float') : ''}<h2>${title}</h2><div style="font-size:13.5px;color:#ddd3c0;line-height:1.6">${desc || ''}</div><div class="choice-list">${options.map((o, i) => `<div class="choice${o.disabled ? ' disabled' : ''}" data-i="${i}" ${o.tip ? o.tip : ''}><span class="ci">${o.icon}</span><div><b>${U.esc(o.label)}</b>${o.sub ? `<div style="font-size:12px;color:var(--dim)">${o.sub}</div>` : ''}</div></div>`).join('')}</div>${cancel ? '<div style="margin-top:14px;text-align:right"><button class="btn small" id="c-cancel">キャンセル</button></div>' : ''}</div>`, 'dim');
    s.querySelectorAll('.choice').forEach((el) => el.onclick = () => {
      const o = options[+el.dataset.i];
      // unaffordable / unavailable options are greyed out and simply don't respond
      if (o.disabled) { G.sfx.ui('deny'); el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); return; }
      G.sfx.ui('click'); o.onPick();
    });
    if (cancel) s.querySelector('#c-cancel').onclick = () => { G.sfx.ui('click'); cancel(); };
  };

  // ---------------- buff selection ----------------
  UI.buffSelect = function (choices, opts) {
    opts = opts || {};
    const st = P.stats;
    const sideBuffs = [...P.buffs].map(([id, n]) => { const b = G.BUFF_BY_ID[id]; return `<div class="bicon" style="--rc:${R(b.rarity)}" ${UI.tipAttr(b)}>${b.icon}${n > 1 ? `<span class="st">${n}</span>` : ''}</div>`; }).join('');
    const cards = choices.map((b, i) => {
      const n = P.buffs.get(b.id) || 0;
      return `<div class="card" data-i="${i}" style="--rc:${R(b.rarity)};animation-delay:${i * 0.12}s"><div class="c-rar">${G.RARITY[b.rarity].name}</div><div class="c-icon">${b.icon}</div><div class="c-name">${U.esc(b.name)}</div><div class="c-cat">${G.BUFF_CAT[b.cat].icon} ${G.BUFF_CAT[b.cat].name}${b.skill ? ` · <span class="c-own">${G.SKILL_BY_ID[b.skill].icon} ${G.SKILL_BY_ID[b.skill].name}専用</span>` : b.cat === 'pile' ? ' · <span class="c-own">🔨 パイルドライバー専用</span>' : ''}</div><div class="c-desc">${U.esc(b.desc)}</div><div class="c-stack">${n ? `所持 ${n} → ${n + 1}${b.max > 1 ? ' / 最大' + b.max : ''}` : b.max > 1 ? `最大 ${b.max} 重ね` : '固有効果'}</div></div>`;
    }).join('');
    const s = UI.screen(`<div class="bs-wrap">
      <div class="side-info"><h3 style="margin-top:0">❤️ HP <b style="float:right">${Math.ceil(P.hp)} / ${st.maxHp}</b></h3><div class="si-stat"><span>🪙 コイン</span><b>${U.fmt(G.game.run.coins)}</b></div><div class="si-stat"><span>🗺️ エリア</span><b>${G.game.area}</b></div>${UI.statsTable()}<h3>🌟 所持加護（${P.buffs.size}）</h3><div class="si-buffs">${sideBuffs || '<span style="color:var(--dim);font-size:12px;grid-column:1/-1">なし</span>'}</div></div>
      <div class="bs-title">${opts.title || 'CHOOSE A BOON'}</div>
      <div class="bs-sub">${opts.sub || '加護を一つ選べ'}　<span class="bs-keys">クリック：選択 ／ ホイール：切替 → Enter：決定${opts.rerolls > 0 ? ' ／ R：リロール' : ''}${opts.noSkip ? '' : ' ／ Backspace：スキップ'} ／ 選択中もWASDで移動可能</span></div>
      <div class="bs-cards">${cards}</div>
      <div class="bs-actions">${opts.rerolls > 0 ? `<button class="btn" id="bs-reroll">🎲 リロール（残り${opts.rerolls}）</button>` : ''}${opts.noSkip ? '' : `<button class="btn small" id="bs-skip">⏭ スキップ（+${opts.skipCoins || 60}🪙）</button>`}</div>
    </div>`, 'live');
    let picked = false;
    const pick = (i) => {
      if (picked) return; picked = true;
      G.input.requestLock();
      const els = s.querySelectorAll('.card');
      els.forEach((el, k) => el.classList.add(k === i ? 'picked' : 'unpicked'));
      G.sfx.ui(G.RARITY[choices[i].rarity].tier >= 3 ? 'rare' : 'select');
      setTimeout(() => opts.onPick(choices[i]), 300);
    };
    s.querySelectorAll('.card').forEach((el) => { el.onclick = () => pick(+el.dataset.i); });
    const rr = s.querySelector('#bs-reroll'); if (rr) rr.onclick = () => { G.sfx.ui('card'); opts.onReroll(); };
    const sk = s.querySelector('#bs-skip'); if (sk) sk.onclick = () => { if (picked) return; picked = true; G.input.requestLock(); G.sfx.ui('click'); opts.onSkip(); };
    // keyboard / wheel / click control while the mouse stays locked
    let hl = 0;
    const els = [...s.querySelectorAll('.card')];
    const paint = () => els.forEach((el, k) => el.classList.toggle('hl', k === hl));
    paint();
    els.forEach((el, k) => el.addEventListener('mouseenter', () => { if (!picked) { hl = k; paint(); } }));
    UI._buffApi = {
      pick: (i) => { if (i < choices.length) pick(i); },
      move: (d) => { if (picked) return; hl = (hl + d + choices.length) % choices.length; paint(); G.sfx.ui('click'); },
      confirm: () => pick(hl),
      reroll: () => { const r = s.querySelector('#bs-reroll'); if (r && !picked) r.onclick(); },
      skip: () => { const k = s.querySelector('#bs-skip'); if (k && !picked) k.onclick(); },
    };
    UI._buffKeys = null;
    setTimeout(() => G.sfx.ui('card'), 100); setTimeout(() => G.sfx.ui('card'), 220); setTimeout(() => G.sfx.ui('card'), 340);
  };
  window.addEventListener('keydown', (e) => { if (G.game && G.game.state === 'buff' && UI._buffKeys) UI._buffKeys(e.code); });

  // ---- difficulty select (new run) ----
  UI.difficulty = function (onPick, back) {
    const R = G.Run, D = R.DIFFS, rec = R.rec();
    const canExtra = R.unlocked('extra', 1); // extra stays hidden until hard has been cleared
    let xlv = Math.max(1, R.maxExtra()), extra = false, drone = null;
    const lvK = () => (xlv - 1) / 9; // 0 .. 1 over extra 1 .. 10
    const card = (id) => {
      const d = D[id];
      const cleared = id === 'extra' ? Object.keys(rec).filter((k) => /^extra\d+$/.test(k)).length : rec[id];
      const sw = id === 'hard' && canExtra ? `<button class="df-up" data-sw="1">▲ 裏難易度<small>上げる</small></button>` : id === 'extra' ? `<button class="df-up down" data-sw="0">▼ ハードへ戻る</button>` : '';
      return `<div class="df-card${id === 'extra' ? ' extra' : ''}" data-id="${id}" style="--dc:${d.col}">
        ${id === 'extra' ? '<div class="df-flame"></div>' : ''}
        <div class="df-ic">${d.icon}</div><div class="df-en">${d.en}</div><div class="df-name">${d.name}${cleared ? '<span class="df-clr">CLEAR</span>' : ''}</div>
        <div class="df-desc">${d.desc}</div>
        <div class="df-meta">全${d.areas}エリア・ボス${d.areas / 6}体</div>
        ${id === 'extra' ? `<div class="df-lv"><button class="btn small" data-x="-1">◀</button><b id="df-xlv">エクストラ ${xlv}</b><button class="btn small" data-x="1">▶</button></div><div class="df-meta" id="df-xmul"></div>` : ''}
        ${sw}
      </div>`;
    };
    const s = UI.screen(`<div class="df-wrap"><h2 class="df-title">難易度を選択</h2><div class="df-cards"></div>
      <div style="text-align:center;margin-top:22px"><button class="btn" id="df-back">↩ 戻る</button></div></div>`);
    const cardsEl = s.querySelector('.df-cards'), wrap = s.querySelector('.df-wrap');
    const stopDrone = (restore) => { if (drone) { drone.stop(); drone = null; } if (watch) { clearInterval(watch); watch = null; } if (restore && G.game.titleWorld) G.game.titleWorld(false); };
    // the backdrop of the hidden mode is the blue-flame ruin of field 4 (the title scene's world is swapped, and swapped back)
    let watch = null;
    // the higher the level, the thicker the fog of the ruin behind the cards
    const applyLevel = () => { const k = lvK(); s.style.setProperty('--hk', k.toFixed(3)); const f = extra && G.scene && G.scene.fog; if (f && f.density !== undefined) { if (f._b === undefined) f._b = f.density; f.density = f._b * (1 + k * 0.9); } };
    const render = () => {
      cardsEl.innerHTML = (extra ? ['extra'] : ['easy', 'normal', 'hard']).map(card).join(''); // in the hidden mode the extra card stands alone, in the middle
      cardsEl.classList.toggle('solo', extra);
      s.classList.toggle('df-hell', extra); applyLevel();
      const upd = () => { const b = s.querySelector('#df-xlv'); if (b) { b.textContent = `エクストラ ${xlv}`; s.querySelector('#df-xmul').textContent = xlv >= 10 ? '至高の試練' : ''; } };
      upd();
      s.querySelectorAll('[data-x]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const nx = xlv + (+b.dataset.x); if (nx >= 1 && nx <= R.maxExtra()) { xlv = nx; upd(); applyLevel(); G.sfx.ui('click'); if (G.sfx.hellSting) G.sfx.hellSting(lvK() * 0.8); if (drone) drone.set(lvK()); } else G.sfx.ui('deny'); });
      s.querySelectorAll('[data-sw]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); setExtra(b.dataset.sw === '1'); });
      cardsEl.querySelectorAll('.df-card').forEach((c) => c.onclick = () => {
        const id = c.dataset.id; G.sfx.ui('select'); stopDrone(false); onPick({ id, lv: id === 'extra' ? xlv : 0 });
      });
    };
    // switching between hard and extra: the cards melt away (blur + shrink) while the world behind blurs and washes out, swap, then both focus back in
    let veiling = false;
    const veil = (swap) => {
      if (veiling) return; veiling = true;
      const c = G.renderer && G.renderer.domElement, T = 'filter 0.3s ease, transform 0.3s ease, opacity 0.3s ease';
      wrap.style.transition = T; if (c) c.style.transition = T;
      wrap.style.opacity = '0'; wrap.style.filter = 'blur(8px)'; wrap.style.transform = 'scale(0.96)';
      if (c) { c.style.filter = 'blur(12px) brightness(1.5)'; c.style.transform = 'scale(1.05)'; }
      setTimeout(() => {
        swap();
        wrap.style.transition = 'none'; wrap.style.transform = 'scale(1.04)'; void wrap.offsetWidth;
        wrap.style.transition = T; wrap.style.opacity = '1'; wrap.style.filter = 'none'; wrap.style.transform = 'none';
        if (c) { c.style.filter = ''; c.style.transform = ''; }
        setTimeout(() => { wrap.style.transition = ''; wrap.style.filter = ''; wrap.style.transform = ''; wrap.style.opacity = ''; if (c) c.style.transition = ''; veiling = false; }, 330);
      }, 320);
    };
    const setExtra = (on) => veil(() => {
      if (!s.isConnected) return;
      extra = on; render();
      if (on) {
        if (G.sfx.hellSting) G.sfx.hellSting(lvK());
        if (!drone && G.sfx.hellDrone) drone = G.sfx.hellDrone(lvK());
        if (G.game.titleWorld) G.game.titleWorld(true);
        if (G.scene.fog) G.scene.fog._b = undefined;
        applyLevel();
        if (!watch) watch = setInterval(() => { if (!s.isConnected) stopDrone(false); }, 300);
      } else { stopDrone(true); G.sfx.ui('click'); }
    });
    render();
    s.querySelector('#df-back').onclick = () => { G.sfx.ui('click'); stopDrone(extra); back(); };
  };
  UI.victory = function (o) {
    const r = G.game.run, R = G.Run;
    const s = UI.screen(`<div class="panel victory-panel" style="width:min(780px,94vw);text-align:center">
      <div class="vic-title">CLEAR</div><div style="color:#e8d8b0;margin-top:-4px;letter-spacing:6px">深 淵 を 制 し た</div>
      <div class="vic-diff" style="--dc:${R.def().col}">${R.def().icon} ${R.label()}</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="sv">🗺️ ${G.game.area}/${R.areas()}</div><div class="sl">踏破エリア</div></div>
        <div class="stat-box"><div class="sv">💀 ${r.kills}</div><div class="sl">撃破数</div></div>
        <div class="stat-box"><div class="sv">⚔️ ${U.fmt(Math.round(r.dmgDealt || 0))}</div><div class="sl">与えたダメージ</div></div>
        <div class="stat-box"><div class="sv">🪙 ${U.fmt(r.coinsTotal)}</div><div class="sl">獲得コイン</div></div>
        <div class="stat-box"><div class="sv">⏱ ${U.time(r.playT !== undefined ? r.playT : G.game.time - r.startT)}</div><div class="sl">クリアタイム</div></div>
        <div class="stat-box"><div class="sv">🌟 ${P.buffs.size}</div><div class="sl">取得加護</div></div>
        <div class="stat-box"><div class="sv">🩸 ${U.fmt(Math.round(r.dmgTaken || 0))}</div><div class="sl">被ダメージ</div></div>
        <div class="stat-box"><div class="sv">🪔 ${P.revives || 0}</div><div class="sl">残った灯火</div></div>
      </div>
      ${o.unlock ? `<div class="vic-unlock">🔓 ${o.unlock} が解放されました</div>` : ''}
      <div style="font-size:13px;color:var(--dim)">シード ${G.game.seed}${o.first ? '　·　<b style="color:var(--gold2)">🏆 初クリア！</b>' : ''}</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">
        <button class="btn primary" id="v-title">🏠 タイトルへ</button><button class="btn" id="v-again">🎲 同じ難易度でもう一度</button>
      </div></div>`, 'dim');
    s.querySelector('#v-title').onclick = () => { G.sfx.ui('click'); G.game.toTitle(); };
    s.querySelector('#v-again').onclick = () => { G.sfx.ui('select'); G.game.startRun('', Object.assign({}, R.cur)); };
  };
  UI.death = function (stats) {
    const r = G.game.run;
    const s = UI.screen(`<div class="panel" style="width:min(760px,94vw);text-align:center">
      <div class="death-title">YOU DIED</div><div style="color:var(--dim);margin-top:-4px;letter-spacing:6px">力 尽 き た</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="sv">🗺️ ${G.game.area}/${G.Run.areas()}</div><div class="sl">到達エリア（${G.Run.label()}）</div></div>
        <div class="stat-box"><div class="sv">💀 ${r.kills}</div><div class="sl">撃破数</div></div>
        <div class="stat-box"><div class="sv">⚔️ ${U.fmt(Math.round(r.dmgDealt || 0))}</div><div class="sl">与えたダメージ</div></div>
        <div class="stat-box"><div class="sv">🪙 ${U.fmt(r.coinsTotal)}</div><div class="sl">獲得コイン</div></div>
        <div class="stat-box"><div class="sv">⏱ ${U.time(r.playT !== undefined ? r.playT : G.game.time - r.startT)}</div><div class="sl">生存時間</div></div>
        <div class="stat-box"><div class="sv">🌟 ${P.buffs.size}</div><div class="sl">取得加護</div></div>
      </div>
      <div style="font-size:13px;color:var(--dim)">致命傷: ${U.esc(stats.cause || '不明')}　·　シード ${G.game.seed}${stats.newRecord ? '　·　<b style="color:var(--gold2)">🏆 新記録！</b>' : ''}</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">
        <button class="btn primary" id="d-retry">🔁 同じシードで再挑戦</button><button class="btn" id="d-new">🎲 新しいシード</button><button class="btn" id="d-title">🏠 タイトルへ</button>
      </div></div>`, 'dim');
    s.querySelector('#d-retry').onclick = () => { G.sfx.ui('select'); G.game.startRun(String(G.game.seed)); };
    s.querySelector('#d-new').onclick = () => { G.sfx.ui('select'); G.game.startRun(''); };
    s.querySelector('#d-title').onclick = () => { G.sfx.ui('click'); G.game.toTitle(); };
  };
  UI.revivePrompt = function (left, cause, onRevive, onGiveUp) {
    const s = UI.screen(`<div class="panel revive-panel" style="width:min(520px,94vw);text-align:center">
      <div class="death-title" style="font-size:44px">FALLEN</div><div style="color:var(--dim);margin-top:-2px;letter-spacing:4px">致命傷: ${U.esc(cause || '不明')}</div>
      <div class="revive-ticket">🪔</div>
      <div style="font-size:15px;color:#ecdcb8">魂の灯火を燃やし、深淵より還りますか？ <b style="color:var(--gold2)">残り ${left} 灯</b></div>
      <div style="font-size:12px;color:var(--dim);margin-top:4px">このエリアの入口から再開します（持ち物・バフ・敵は入った時点に戻る／HP全快・クールタイムリセット）</div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;flex-wrap:wrap">
        <button class="btn primary" id="rv-yes">🪔 灯火を燃やす（Enter）</button><button class="btn" id="rv-no">💀 闇に還る</button>
      </div></div>`, 'dim');
    let done = false;
    const yes = () => { if (done) return; done = true; window.removeEventListener('keydown', key); G.sfx.ui('rare'); onRevive(); };
    const no = () => { if (done) return; done = true; window.removeEventListener('keydown', key); G.sfx.ui('click'); onGiveUp(); };
    const key = (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); yes(); } };
    window.addEventListener('keydown', key);
    s.querySelector('#rv-yes').onclick = yes;
    s.querySelector('#rv-no').onclick = no;
    G.sfx.ui('open');
  };
  // info card shown when something new is obtained (so effects are learnable on first sight)
  // big centre-screen "you got X" panel for things that arrive without you choosing a card (events, shrines, chests, gifts);
  // queued so several gains never overlap, non-blocking (the game keeps running underneath)
  const gainQ = []; let gainBusy = false; const gainSeen = new Map();
  UI.gain = function (o, hint) {
    if (!o || (G.game && (G.game._buying || (G.game.quietUntil || 0) > performance.now()))) return; // nothing big in the middle of the screen after a purchase
    const key = (o.kind || '') + ':' + (o.id || o.name), now = performance.now();
    if (gainQ.some((q) => q.key === key) || now - (gainSeen.get(key) || -1e9) < 2500) return;
    gainSeen.set(key, now);
    gainQ.push({ o, hint, key }); if (!gainBusy) gainNext();
  };
  function gainKind(o) {
    // [style, tag, family label]: boons (permanent blessings) and gear (things you carry / use) look clearly different
    if (o.kind === 'buff') return o.curse || o.cat === 'curse' ? ['curse', '呪いを受けた', '呪い CURSE'] : o.cat === 'relic' ? ['boon relic', '遺物を獲得', '遺物 RELIC'] : o.cat === 'pact' ? ['curse', '誓いを結んだ', '誓約 PACT'] : ['boon', '加護を獲得', '加護 BOON'];
    if (o.kind === 'item') return ['gear', o.cat === 'grenade' ? '投擲物を獲得' : 'アイテムを獲得', o.cat === 'grenade' ? '投擲物 THROWABLE' : 'アイテム ITEM'];
    if (o.kind === 'weapon') return ['gear', '武器を獲得', '武器 WEAPON'];
    if (o.kind === 'melee') return ['gear', '近接武器を獲得', '近接武器 MELEE'];
    if (o.kind === 'skill' || o.kind === 'ult') return ['gear skill', o.ult ? 'アルティメットを獲得' : 'スキルを獲得', o.ult ? 'アルティメット ULT' : 'スキル SKILL'];
    if (o.kind === 'attachment') return ['gear', 'アタッチメントを獲得', 'アタッチメント ATTACHMENT'];
    return ['gear', '獲得', ''];
  }
  function gainNext() {
    if (gainQ.length && UI.el.screens.firstChild) { gainBusy = true; setTimeout(gainNext, 300); return; } // a card / shop screen is up: wait for it
    const q = gainQ.shift();
    if (!q) { gainBusy = false; return; }
    gainBusy = true;
    let host = document.getElementById('gain-host');
    if (!host) { host = document.createElement('div'); host.id = 'gain-host'; UI.el.hud.appendChild(host); }
    const o = q.o, [kind, tag, fam] = gainKind(o), rar = G.RARITY[o.rarity];
    const d = document.createElement('div'); d.className = 'gain ' + kind; d.style.setProperty('--rc', R(o.rarity));
    const hold = gainQ.length >= 2 ? 1700 : 3000;
    d.style.setProperty('--hold', hold + 'ms');
    d.innerHTML = `${fam ? `<div class="g-fam">${fam}</div>` : ''}<div class="g-tag">${tag}</div><div class="g-main"><div class="g-ic">${o.icon || ''}</div><div class="g-t"><div class="g-name">${U.esc(o.name)}</div><div class="g-rar">${rar ? rar.name : ''}${o.cat && G.BUFF_CAT && G.BUFF_CAT[o.cat] ? '・' + G.BUFF_CAT[o.cat].name : ''}</div></div></div><div class="g-desc">${U.esc(o.desc || '')}</div>${q.hint && String(q.hint).length > 6 ? `<div class="g-hint">${U.esc(String(q.hint).replace(/^\[|\]$/g, ''))}</div>` : ''}`;
    host.appendChild(d);
    const tier = rar ? rar.tier : 0;
    G.sfx.ui(kind === 'curse' ? 'deny' : tier >= 3 ? 'rare' : kind.startsWith('gear') ? 'select' : 'level');
    setTimeout(() => { d.classList.add('out'); }, hold);
    setTimeout(() => { d.remove(); gainNext(); }, hold + 450);
  }
  // centre-screen messages are stacked top-down every frame: anomaly alert (the star) > banner > gain panel > toasts > shop panel
  const vis = (el) => el && !el.classList.contains('hidden') && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
  UI.layoutCenter = function () {
    const H = innerHeight, tut = document.body.classList.contains('tut-on');
    let y = 0;
    const put = (el, nat, on) => {
      if (!el) return;
      if (!on) { if (el._lcTop !== nat) { el.style.top = nat + 'px'; el._lcTop = nat; } return; }
      let top = Math.max(nat, y);
      const h = el.offsetHeight;
      if (top + h > H - 8) top = Math.max(nat * 0.5, H - 8 - h);
      if (el._lcTop !== top) { el.style.top = top + 'px'; el._lcTop = top; }
      y = top + h + 10;
    };
    const aa = document.getElementById('anom-alert');
    if (aa) {
      // fit between the top-left objective panel and the right-hand info: shrink, or drop below the panel when there is no room
      const tl = document.getElementById('hud-tl'), tr = tl ? tl.getBoundingClientRect() : null;
      const side = tr ? tr.right + 14 : 0, room = innerWidth - 2 * side;
      if (room >= 380) { aa.style.minWidth = Math.min(440, room) + 'px'; aa.style.maxWidth = room + 'px'; put(aa, H * 0.07, true); }
      else { aa.style.minWidth = ''; aa.style.maxWidth = ''; put(aa, Math.max(H * 0.07, tr ? tr.bottom + 10 : 0), true); }
    }
    const bn = UI.el.banner, bnOn = bn.classList.contains('show') && performance.now() < (UI.bannerUntil || 0);
    put(bn, H * (tut ? 0.52 : 0.26), bnOn);
    const gh = document.getElementById('gain-host');
    put(gh, H * 0.3, !!(gh && gh.firstChild));
    put(UI.el.toasts, H * (tut ? 0.6 : 0.22), UI.el.toasts.childElementCount > 0);
    put(UI.el.interact, H * 0.56, vis(UI.el.interact));
  };
  UI.itemCard = function (o, keyHint, opts) {
    if (!o) return;
    if (!(opts && opts.noBanner)) UI.gain(o, keyHint);
    let host = document.getElementById('item-cards');
    if (!host) { host = document.createElement('div'); host.id = 'item-cards'; UI.el.hud.appendChild(host); }
    const d = document.createElement('div'); d.className = 'icard'; d.style.setProperty('--rc', R(o.rarity));
    d.innerHTML = `<div class="ic-i">${o.icon}</div><div><div class="ic-n">${U.esc(o.name)} <span class="ic-k">${keyHint || ''}</span></div><div class="ic-d">${U.esc(o.desc || '')}</div></div>`;
    host.appendChild(d);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => d.remove(), 6500);
  };
  UI.fps = function (v) { UI.el.fps.textContent = G.save.data.settings.showFps ? Math.round(v) + ' FPS' : ''; };
})();
