'use strict';
// Co-op: playing together. Markers for your teammates, picking up a fallen teammate (hold the interact key beside them), watching a teammate while you are out,
// a ping (H) to point at something, chat (Enter), and the team's numbers on the pause menu and the end screens.
(function () {
  const K = G.Coop;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const U = G.U;
  const COLS = ['#ffd27a', '#7ad0ff', '#ff9ab0', '#9aef8a'];
  const CSS = `
  #coop-marks{position:fixed;inset:0;z-index:700;pointer-events:none;overflow:hidden;font:700 11px 'Noto Sans JP',sans-serif;color:#fff;text-shadow:0 1px 2px #000}
  #coop-marks .cm{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:1px;white-space:nowrap}
  #coop-marks .cm i{font-style:normal;font-size:14px;line-height:1;color:var(--pc,#ffd27a)}
  #coop-marks .cm b{color:var(--pc,#ffd27a)}#coop-marks .cm span{font-size:10px;color:#d8cdb8}
  #coop-rv{position:fixed;left:50%;bottom:32%;transform:translateX(-50%);z-index:8300;width:260px;padding:7px 12px 9px;background:rgba(14,11,8,.92);border:1px solid rgba(120,230,140,.6);border-radius:4px;font:700 13px 'Noto Sans JP',sans-serif;color:#c8f5cf;text-align:center;display:none;pointer-events:none}
  #coop-rv div{height:5px;margin-top:5px;background:rgba(0,0,0,.6);border-radius:2px;overflow:hidden}#coop-rv div i{display:block;height:100%;width:0;background:#6fe08a}
  #coop-spec{position:fixed;left:50%;top:12%;transform:translateX(-50%);z-index:8300;padding:7px 18px;background:rgba(14,11,8,.9);border:1px solid rgba(220,190,130,.4);border-radius:4px;font:700 14px 'Noto Sans JP',sans-serif;color:#ffe2a0;display:none;pointer-events:none;text-align:center}
  #coop-spec small{display:block;font-size:11px;font-weight:500;color:#a99d88}
  #coop-chat{position:fixed;right:14px;bottom:175px;z-index:790;width:330px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;pointer-events:none;font:600 13px 'Noto Sans JP',sans-serif;color:#f2e6cc;text-shadow:0 1px 2px #000}
  #coop-chat div{padding:1px 6px;background:rgba(10,8,6,.5);border-radius:3px;transition:opacity .5s}
  #coop-chat div.sys{color:#c9bda6;font-size:12px}#coop-chat b{color:var(--pc,#ffd27a)}
  #coop-chatin{position:fixed;right:14px;bottom:145px;z-index:9100;width:330px;padding:6px 9px;background:#0c0a08;border:1px solid rgba(255,200,80,.6);border-radius:4px;color:#f2e6cc;font:600 13px 'Noto Sans JP',sans-serif;display:none;outline:none}
  .coop-stats{margin:10px auto 0;border-collapse:collapse;font:600 12px 'Noto Sans JP',sans-serif;color:#e8d6b0}
  .coop-stats th{font-size:11px;color:#a99d88;font-weight:600;padding:2px 9px;border-bottom:1px solid rgba(220,190,130,.3)}
  .coop-stats td{padding:2px 9px;text-align:right}.coop-stats td:first-child{text-align:left;color:#ffd27a}
  `;
  const el = (tag, id) => { const e = document.createElement(tag); if (id) e.id = id; document.body.appendChild(e); return e; };
  const colOf = (id) => COLS[id % COLS.length];

  K.installTeam = function () {
    const GM = G.game, P = G.player, I = G.input, FX = G.fx;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const marks = el('div', 'coop-marks'), rv = el('div', 'coop-rv'), spec = el('div', 'coop-spec'), log = el('div', 'coop-chat'), input = el('input', 'coop-chatin');
    rv.innerHTML = '<span></span><div><i></i></div>';
    input.maxLength = 80; input.placeholder = 'メッセージ（Enterで送信 / Escで閉じる）';
    const v = V();

    // ---------------- messages ----------------
    K.feed = function (html, sys, id) {
      const d = document.createElement('div'); if (sys) d.className = 'sys';
      if (id !== undefined) d.style.setProperty('--pc', colOf(id));
      d.innerHTML = html; log.appendChild(d);
      while (log.children.length > 7) log.firstChild.remove();
      setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 600); }, 9000);
    };
    K.handlers.ch = function (m, from) {
      K.feed(`<b>${U.esc(m.n)}</b> ${U.esc(m.x)}`, false, m.i);
      G.sfx.ui('click');
      if (K.role === 'host') K.relay(m, from);
    };
    const closeChat = () => { K.chatting = false; input.style.display = 'none'; input.value = ''; input.blur(); };
    window.addEventListener('keydown', (e) => {
      if (!K.live) return;
      if (K.chatting) {
        e.stopImmediatePropagation();
        if (e.isComposing) return; // (Enter that settles a Japanese conversion is not "send")
        if (e.code === 'Enter') {
          e.preventDefault();
          const x = input.value.trim();
          if (x) { K.send({ t: 'ch', n: K.name, i: K.id, x }); K.feed(`<b>${U.esc(K.name)}</b> ${U.esc(x)}`, false, K.id); }
          closeChat();
        } else if (e.code === 'Escape') closeChat();
        return;
      }
      if (e.repeat || GM.state !== 'playing') return;
      if (e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); K.clearKeys(); K.chatting = true; input.style.display = 'block'; input.focus(); }
    }, true);
    for (const t of ['keyup', 'keypress']) window.addEventListener(t, (e) => { if (K.chatting) e.stopImmediatePropagation(); }, true);

    // ---------------- ping: a key of its own in the key settings (H and the wheel click by default) ----------------
    // Points at what the crosshair is on: a foe (the mark follows it), an item, a chest, a body, a teammate, or a spot on the ground. Pressed twice quickly: danger.
    I.DEFAULT_BIND.ping = ['KeyH', 'MouseMiddle']; G.BIND.ping = ['KeyH', 'MouseMiddle'];
    if (!I.BIND_LIST.some((b) => b[0] === 'ping')) I.BIND_LIST.push(['ping', '📍 ピン（協力プレイ）']);
    I.applyBinds();
    const pings = [];
    let pingT = -9;
    const THINGS = { chest: ['📦', '宝箱'], npc: ['❓', '人影'], shrine: ['⛩️', '祭壇'], anvil: ['⚒️', '金床'], cauldron: ['⚗️', '練成釜'], celldoor: ['🚪', '扉'] };
    function pingAim() {
      const c = G.camera, d = V(0, 0, -1).applyQuaternion(c.quaternion), o = c.position.clone();
      const hit = G.world.raycast(o, d, 90), t = hit ? hit.t : 40;
      const eh = G.enemies.raycast(o, d, t, 0.45, new Set());
      if (eh && eh.e._nid !== undefined) return { k: 'foe', ic: '⚔', lb: eh.e.def.name, id: eh.e._nid, p: eh.e.centerPos() };
      if (eh) return { k: 'foe', ic: '⚔', lb: eh.e.def.name, p: eh.e.centerPos() };
      // the nearest thing to the line of sight, not behind a wall
      let best = null, bs = 1e9;
      const look = (pos, ic, lb, k) => {
        const to = pos.clone().sub(o), along = to.dot(d); if (along < 0.5 || along > t + 1.5) return;
        const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along)), lim = Math.max(0.9, along * 0.04);
        if (perp < lim && perp / lim < bs) { bs = perp / lim; best = { k, ic, lb, p: pos.clone() }; }
      };
      const IV = G.Inv;
      for (const g of IV.ground) { const df = IV.def(g.it); if (df) look(g.pos, df.icon, df.name, 'item'); }
      for (const q of IV.corpses) if (q.e && !q.e.removed && !(q.searched && !q.cont.items.length)) look(q.e.pos.clone().setY(q.e.pos.y + 0.4), '💀', q.e.def.name + 'の亡骸', 'item');
      for (const it of G.world.interactables) { const T = THINGS[it.type]; if (T && it.pos && !(it.type === 'chest' && it.opened && !(it.cont && it.cont.items.length))) look(it.pos, T[0], T[1], 'item'); }
      for (const ex of G.world.exits || []) if (ex.open) look(V(ex.x, 2, ex.z), '🚪', '門', 'item');
      for (const rp of K.players.values()) if (rp.id !== K.id) look(rp.pos.clone().setY(rp.pos.y + 1), '👤', rp.name, 'item');
      return best || { k: 'spot', ic: '📍', lb: '', p: o.addScaledVector(d, t - 0.1) };
    }
    function ping() {
      const now = performance.now(), quick = now - pingT < 420; pingT = now;
      const a = pingAim();
      const m = { t: 'mk', i: K.id, n: K.name, p: K.vec(a.p), k: quick ? 'danger' : a.k, ic: quick ? '⚠' : a.ic, lb: quick ? '危険！' : a.lb, id: a.id };
      if (quick) for (const q of pings.filter((x) => x.who === K.id && performance.now() - x.at < 600)) { q.e.remove(); pings.splice(pings.indexOf(q), 1); }
      K.send(m); putPing(m);
    }
    function putPing(m) {
      const pos = V(...m.p), col = parseInt(colOf(m.i).slice(1), 16);
      FX.ring(pos.clone(), m.k === 'danger' ? 2.2 : 1.2, col, 0.7); FX.beam(pos.clone(), pos.clone().setY(pos.y + 7), col, 0.05, 1.2);
      // heard by everyone wherever they stand
      G.sfx.ui(m.k === 'danger' ? 'deny' : 'select'); if (G.sfx.chime) G.sfx.chime(G.camera.position.clone());
      const e = document.createElement('div'); e.className = 'cm'; e.style.setProperty('--pc', colOf(m.i));
      e.innerHTML = `<i>${U.esc(m.ic)}</i><b>${U.esc(m.lb ? m.lb : m.n)}</b><span></span>`;
      marks.appendChild(e);
      pings.push({ pos, t: m.k === 'foe' ? 10 : 7, e, id: m.id, who: m.i, at: performance.now() });
      if (m.lb) K.feed(`📍 <b>${U.esc(m.n)}</b> ${U.esc(m.lb)}`, true, m.i);
    }
    K.handlers.mk = function (m, from) { putPing(m); if (K.role === 'host') K.relay(m, from); };
    const place = (e, pos, keepOnScreen) => {
      v.copy(pos).project(G.camera);
      const W = window.innerWidth, H = window.innerHeight, behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - 50; }
      const off = behind || x < 40 || x > W - 40 || y < 50 || y > H - 60;
      x = U.clamp(x, 40, W - 40); y = U.clamp(y, 50, H - 60);
      e.style.transform = `translate(calc(${Math.round(x)}px - 50%), calc(${Math.round(y)}px - 50%))`;
      e.style.display = !keepOnScreen && !off ? 'none' : '';
      return off;
    };

    // ---------------- teammates on the screen; getting one back up ----------------
    const REVIVE = 5; // seconds of holding the key
    let rvT = 0, rvWho = null;
    const specOrder = () => [...K.players.values()].filter((p) => p.id !== K.id && !p.dead);
    let specI = 0;
    window.addEventListener('mousedown', () => { if (K.live && P.dead && P.revives <= 0) specI++; });
    K.specCam = function () {
      const list = specOrder();
      if (!list.length || P.revives > 0) { if (spec.style.display !== 'none') spec.style.display = 'none'; return; }
      const rp = list[specI % list.length], c = G.camera, yaw = rp.yaw;
      c.position.set(rp.pos.x + Math.sin(yaw) * 3.4, rp.pos.y + 2.5, rp.pos.z + Math.cos(yaw) * 3.4);
      c.lookAt(rp.pos.x, rp.pos.y + 1.3, rp.pos.z);
      const h = `${U.esc(rp.name)} を観戦中<small>起こしてもらうか、次のエリアで復帰します（クリックで切替）</small>`;
      if (spec._h !== h) { spec._h = h; spec.innerHTML = h; }
      spec.style.display = 'block';
    };
    const pu = P.update;
    P.update = function (dt) {
      if (K.live && !K.chatting && GM.state === 'playing' && I.hit('ping')) ping();
      // the pile driver's landing is seen by the others like a skill
      const big = this.pileState || this.pileLandT > 0;
      if (big) K.own++;
      let r; try { r = pu.call(this, dt); } finally { if (big) K.own--; }
      if (this.dead && K.live) K.specCam(); else if (spec.style.display !== 'none') spec.style.display = 'none';
      return r;
    };

    function team(dt) {
      for (const rp of K.players.values()) {
        if (rp.id === K.id) continue;
        if (!rp.mk) { rp.mk = document.createElement('div'); rp.mk.className = 'cm'; rp.mk.style.setProperty('--pc', colOf(rp.id)); rp.mk.innerHTML = '<i></i><b></b><span></span>'; rp.mk.children[1].textContent = rp.name; marks.appendChild(rp.mk); }
        const d = rp.pos.distanceTo(P.pos), m = rp.mk;
        m.children[0].textContent = rp.dead ? '💀' : '▼';
        m.children[2].textContent = Math.round(d) + 'm';
        const near = d < 16 && !rp.dead;
        place(m, v.clone().copy(rp.pos).setY(rp.pos.y + (rp.dead ? 0.7 : 2.6)), !near);
        // (a teammate's fall and return are announced once)
        if (rp._wd !== rp.dead) { if (rp._wd !== undefined) K.feed(`${U.esc(rp.name)} ${rp.dead ? 'が倒れた' : 'が起き上がった'}`, true); rp._wd = rp.dead; }
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const q = pings[i]; q.t -= dt;
        // a foe that was pointed at carries its mark along, until it falls
        if (q.id !== undefined) { const f = G.enemies.list.find((x) => x._nid === q.id); if (f && f.alive) q.pos.copy(f.centerPos()).setY(f.pos.y + (f.height || 1.6) + 0.5); else q.t = 0; }
        place(q.e, q.pos, true);
        q.e.children[2].textContent = Math.round(q.pos.distanceTo(P.pos)) + 'm';
        if (q.t <= 0) { q.e.remove(); pings.splice(i, 1); }
      }
      // a teammate down beside you: hold interact
      let near = null;
      if (!P.dead && (GM.state === 'playing')) for (const rp of K.players.values()) if (rp.id !== K.id && rp.dead && rp.pos.distanceTo(P.pos) < 2.8) { near = rp; break; }
      if (near) {
        rv.style.display = 'block';
        rv.children[0].textContent = `${G.K('interact')} 長押しで ${near.name} を起こす`;
        if (rvWho !== near.id) { rvWho = near.id; rvT = 0; }
        rvT = I.down('interact') ? rvT + dt : 0;
        rv.children[1].firstChild.style.width = Math.min(100, rvT / REVIVE * 100) + '%';
        if (rvT >= REVIVE) { rvT = 0; G.sfx.heal(); K.send({ t: 'rv', to: near.id, n: K.name }); K.feed(`${U.esc(near.name)} を起こした`, true); }
      } else if (rv.style.display !== 'none') { rv.style.display = 'none'; rvT = 0; rvWho = null; }
    }
    K.handlers.rv = function (m, from) {
      if (K.role === 'host' && m.to !== 0) { K.send(m, m.to); return; }
      if (P.dead) { K.rise(P.pos, P.stats.maxHp * 0.4, false); K.msg(`${m.n} に起こされた`); }
    };

    // ---------------- the team's numbers ----------------
    const myStats = () => { const r = GM.run || {}, O = GM.objective; return { k: r.kills || 0, d: Math.round(r.dmgDealt || 0), t: Math.round(r.dmgTaken || 0), c: r.coinsTotal || 0, tr: O && O.kind === 'trial' ? O.score : undefined }; };
    K.handlers.ts = function (m, from) { const rp = K.players.get(m.i); if (rp) rp.stats = m.s; if (K.role === 'host') K.relay(m, from); };
    K.statsHTML = function () {
      const row = (n, s) => `<tr><td>${U.esc(n)}</td><td>${s.k}</td><td>${s.d.toLocaleString()}</td><td>${s.t.toLocaleString()}</td><td>${s.c.toLocaleString()}</td></tr>`;
      let h = `<table class="coop-stats"><tr><th></th><th>討伐</th><th>与ダメ</th><th>被ダメ</th><th>獲得コイン</th></tr>` + row(K.name, myStats());
      for (const rp of K.players.values()) if (rp.id !== K.id) h += row(rp.name, rp.stats || { k: 0, d: 0, t: 0, c: 0 });
      return h + '</table>';
    };
    const vic = G.ui.victory;
    G.ui.victory = function (o) { vic.call(G.ui, o); const p = document.querySelector('#screens .panel'); if (p) p.insertAdjacentHTML('beforeend', K.statsHTML()); };
    let tsT = 0;
    const base = K.onFrame;
    K.onFrame = function (dt) {
      if (base) base(dt);
      if (!K.live || !G.world || !GM.run) return;
      team(dt);
      tsT -= dt;
      if (tsT <= 0) { tsT = 2; K.send({ t: 'ts', i: K.id, s: myStats() }); }
    };
  };
})();
