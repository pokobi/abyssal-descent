'use strict';
// Co-op, the part both sides share: the lobby, the other players (position, body, HUD line), what happens when someone falls, and the loop that keeps the world
// running while a menu is open. Everything here wraps the solo game from the outside: nothing in js/*.js knows about any of this, and index.html never loads it.
// One host runs the real game; guests run their own player and a puppet of the host's enemies and guardians (see host.js, client.js).
(function () {
  const K = (G.Coop = { role: null, id: 0, name: '', players: new Map(), swap: null, live: false, MAX: 3 });
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const GM = () => G.game;
  const qs = new URLSearchParams(location.search);
  const CSS = `
  #coop-lobby{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(8,6,4,.86);font-family:'Noto Sans JP',sans-serif;color:#e8d6b0}
  #coop-lobby .cl-box{width:min(440px,92vw);padding:22px 24px;background:rgba(14,11,8,.97);border:1px solid rgba(220,190,130,.34);border-radius:6px;display:flex;flex-direction:column;gap:12px}
  #coop-lobby h2{margin:0;font-family:'Cinzel',serif;letter-spacing:2px;color:#ffd27a;font-size:22px}
  #coop-lobby label{font-size:12px;color:#a99d88;display:flex;flex-direction:column;gap:4px}
  #coop-lobby input{padding:8px 10px;background:#0c0a08;border:1px solid rgba(220,190,130,.34);border-radius:4px;color:#f2e6cc;font:inherit}
  #coop-lobby button{padding:9px 12px;border-radius:4px;font:inherit;font-weight:700;cursor:pointer;background:linear-gradient(180deg,rgba(255,200,80,.2),rgba(14,11,8,.96));border:1px solid rgba(255,200,80,.55);color:#ffe2a0}
  #coop-lobby button:disabled{opacity:.4;cursor:default}
  #coop-lobby .cl-code{font:900 30px 'Cinzel',serif;letter-spacing:6px;color:#ffd27a;text-align:center}
  #coop-lobby .cl-note{font-size:12px;color:#a99d88;line-height:1.5}
  #coop-lobby .cl-err{font-size:13px;color:#ff8a70;min-height:18px}
  #coop-lobby .cl-row{display:flex;gap:8px}#coop-lobby .cl-row>*{flex:1}
  #coop-hud{position:fixed;left:14px;bottom:200px;z-index:800;display:flex;flex-direction:column;gap:5px;pointer-events:none;font:700 12px 'Noto Sans JP',sans-serif;color:#f2e6cc;text-shadow:0 1px 2px #000}
  #coop-hud .ch-p{width:150px}#coop-hud .ch-b{height:5px;background:rgba(0,0,0,.6);border:1px solid rgba(220,190,130,.3);border-radius:2px;overflow:hidden;margin-top:2px}
  #coop-hud .ch-b i{display:block;height:100%;background:#6fd06f}#coop-hud .ch-p.down{color:#ff7a60}#coop-hud .ch-p.down i{background:#ff5a40}
  #coop-back{position:fixed;inset:0;z-index:8500;display:none;align-items:center;justify-content:center;background:rgba(8,6,4,.55);font-family:'Noto Sans JP',sans-serif;color:#f2e6cc;cursor:pointer}
  #coop-back .cb-box{display:flex;flex-direction:column;gap:10px;align-items:center;padding:18px 26px;background:rgba(14,11,8,.95);border:1px solid rgba(220,190,130,.34);border-radius:6px}
  #coop-back button{padding:7px 14px;border-radius:4px;font:inherit;cursor:pointer;background:rgba(14,11,8,.96);border:1px solid rgba(220,190,130,.34);color:#e8d6b0}
  #coop-msg{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:8400;padding:8px 18px;background:rgba(14,11,8,.9);border:1px solid rgba(220,190,130,.34);border-radius:4px;font:700 15px 'Noto Sans JP',sans-serif;color:#ffd27a;display:none;pointer-events:none}
  `;
  const el = (tag, id, html) => { const e = document.createElement(tag); if (id) e.id = id; if (html) e.innerHTML = html; document.body.appendChild(e); return e; };

  // ---------------- messages ----------------
  K.send = function (m, to) {
    if (!K.net) return;
    if (K.stat) { const c = K.netStat = K.netStat || {}; c[m.t] = (c[m.t] || 0) + JSON.stringify(m).length; }
    if (K.role === 'guest') { K.net.send(0, m); return; }
    if (to !== undefined) { K.net.send(to, m); return; }
    for (const id of K.players.keys()) if (id) K.net.send(id, m);
  };
  K.handlers = {};
  const onMsg = (from, m) => {
    const rp = K.players.get(from);
    if (rp) rp.seen = performance.now();
    const h = K.handlers[m.t];
    if (!h) return;
    try { h(m, from); } catch (e) { console.error(e); }
  };
  K.msg = function (t) { const b = K.msgEl; b.textContent = t; b.style.display = 'block'; clearTimeout(K._mt); K._mt = setTimeout(() => { b.style.display = 'none'; }, 3500); };

  // ---------------- the people in the room ----------------
  K.addPlayer = function (id, name) {
    const rp = { id, name, pos: V(), vel: V(), to: V(), yaw: 0, hp: 1, maxHp: 1, dead: false, rev: 0, seen: performance.now(), body: null, shot: 0 };
    K.players.set(id, rp);
    return rp;
  };
  function roster() { return [...K.players.values()].map((p) => [p.id, p.name]); }
  // the third-person model of the solo game (only ever shown in grapple moments there), one copy per remote player, with the name above it
  function bodyFor(rp) {
    if (rp.body) { if (rp.body.parent !== G.scene) G.scene.add(rp.body); return rp.body; }
    const b = G.avatar.root.clone(true); b.visible = true; b.traverse((o) => { o.visible = true; o.frustumCulled = false; });
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const x = c.getContext('2d'); x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.lineWidth = 5; x.strokeStyle = '#000'; x.strokeText(rp.name, 128, 34); x.fillStyle = '#ffe2a0'; x.fillText(rp.name, 128, 34);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    s.scale.set(1.6, 0.3, 1); s.position.y = 2.05; s.renderOrder = 6; b.add(s);
    G.scene.add(b); rp.body = b;
    return b;
  }
  function updateBodies(dt) {
    for (const rp of K.players.values()) {
      if (rp.id === K.id) continue;
      rp.pos.lerp(rp.to, Math.min(1, dt * 14));
      const b = bodyFor(rp);
      b.position.copy(rp.pos);
      b.rotation.set(rp.dead ? -1.4 : 0, rp.yaw + Math.PI, 0);
      b.visible = !!G.world;
    }
  }
  function hud() {
    if (!K.hudEl) return;
    const P = G.player;
    let h = '';
    for (const rp of K.players.values()) {
      const me = rp.id === K.id, hp = me ? P.hp : rp.hp, mx = me ? P.stats.maxHp : rp.maxHp, dead = me ? P.dead : rp.dead;
      h += `<div class="ch-p${dead ? ' down' : ''}">${G.U.esc(rp.name)}${dead ? ' — 戦闘不能' : ''}<div class="ch-b"><i style="width:${Math.round(Math.max(0, hp / (mx || 1)) * 100)}%"></i></div></div>`;
    }
    if (K.hudEl._h !== h) { K.hudEl.innerHTML = h; K.hudEl._h = h; }
  }
  K.sendSelf = function () {
    const P = G.player;
    K.send({ t: 'p', i: K.id, x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), vx: +P.vel.x.toFixed(1), vy: +P.vel.y.toFixed(1), vz: +P.vel.z.toFixed(1), yaw: +P.yaw.toFixed(2), hp: Math.round(P.hp), mx: Math.round(P.stats.maxHp), d: P.dead ? 1 : 0, r: P.revives });
  };
  K.handlers.p = function (m) {
    const rp = K.players.get(m.i); if (!rp || m.i === K.id) return;
    rp.to.set(m.x, m.y, m.z); rp.vel.set(m.vx, m.vy, m.vz); rp.yaw = m.yaw; rp.hp = m.hp; rp.maxHp = m.mx; rp.dead = !!m.d; rp.rev = m.r;
    if (rp.first === undefined) { rp.first = 1; rp.pos.copy(rp.to); }
    if (K.role === 'host') for (const o of K.players.keys()) if (o && o !== m.i) K.net.send(o, m);
  };

  K.handlers.sh = function (m) {
    if (m.i !== K.id) G.fx.tracer(V(...m.a), V(...m.b), 0xffd080, 0.03, 0.09);
    if (K.role === 'host') for (const o of K.players.keys()) if (o && o !== m.i) K.net.send(o, m);
  };

  // ---------------- falling ----------------
  // No restart of the area here: a soul lantern brings you back where you stand after a moment; without one you watch until the next area. Everyone down = the run ends.
  K.onDown = function () {
    const P = G.player;
    G.sfx.death();
    K.sendSelf();
    if (P.revives > 0) {
      K.msg(`倒れた — 魂の灯火で復活する（残り ${P.revives}灯）`);
      setTimeout(() => { if (P.dead && K.live) K.rise(P.pos, P.stats.maxHp, true); }, 3000);
    } else K.msg('倒れた — 次のエリアで復帰する');
  };
  K.rise = function (pos, hp, lantern) {
    const P = G.player;
    if (lantern) P.revives--;
    P.dead = false; P.deathT = 0; P.pos.copy(pos); P.pos.y += 0.05; P.vel.set(0, 0, 0); G.world.depenetrate(P.pos, P.hw, P.height);
    P.hp = hp; P.invulnT = 3; P.st = {}; P.grapple.state = 'none'; P.pileState = null;
    GM().state = 'playing'; GM().deathFrozen = false;
    G.sfx.heal(); G.ui.showHud(true);
  };
  K.ended = function (title, sub) {
    K.live = false;
    const g = GM();
    g.state = 'modal'; G.input.exitLock();
    const b = K.backEl; b.style.display = 'flex'; b.onclick = null;
    b.innerHTML = `<div class="cb-box"><b style="font-size:20px;color:#ffd27a">${title}</b><div>${sub || ''}</div><button id="coop-quit">部屋を出る</button></div>`;
    document.getElementById('coop-quit').onclick = () => location.reload();
  };

  // ---------------- the loop around the game's own ----------------
  // the solo game stops while a menu is open; here the others are still fighting, so the world goes on (without your keys)
  function clearKeys() {
    const I = G.input;
    for (const k of Object.keys(I.keys)) I.keys[k] = false;
    for (const k of Object.keys(I.pressed)) delete I.pressed[k];
    I.mouse = [false, false, false, false, false]; I.mpressed = [false, false, false, false, false]; I.wheel = 0;
  }
  K.clearKeys = clearKeys;
  const stopped = (s) => s === 'paused' || s === 'modal' || s === 'resuming';
  let last = 0, netT = 0, seenT = 0;
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    K._fN = (K._fN || 0) + 1; if (now - (K._fT0 || 0) > 2000) { K.fps = Math.round(K._fN * 1000 / (now - (K._fT0 || now - 2000))); K._fN = 0; K._fT0 = now; }
    if (!K.live) return;
    const g = GM();
    try {
      if (!g._warming && g.run && stopped(g.state)) { clearKeys(); g.step(Math.min(0.05, dt)); }
      updateBodies(dt);
      netT -= dt;
      if (netT <= 0) {
        netT = 0.05;
        K.sendSelf();
        if (K.onNet) K.onNet(0.05);
      }
      if (K.onFrame) K.onFrame(dt);
      hud();
      updateBack();
      seenT -= dt;
      if (seenT <= 0) { seenT = 1; watchPeers(); }
    } catch (e) { console.error(e); }
  }
  function loop(now) { requestAnimationFrame(loop); tick(now); }
  // a tab that is not on screen gets no animation frames: the host still has to run the world for the others
  setInterval(() => {
    if (!K.live || !GM().run) return;
    const now = performance.now(), el2 = Math.min(1, (now - last) / 1000);
    if (el2 < 0.25) return;
    const g = GM();
    if (!g._warming && !stopped(g.state)) { try { clearKeys(); g.step(0.05, Math.max(1, Math.round(el2 / 0.05))); } catch (e) { console.error(e); } }
    tick(now);
  }, 100);
  function updateBack() {
    const g = GM(), I = G.input;
    const want = K.live && g.state === 'playing' && !I.locked && !K.noBack && !G.InvUI.isOpen();
    const b = K.backEl;
    if (want && b.style.display !== 'flex') {
      b.innerHTML = '<div class="cb-box"><b>クリックで戦闘に戻る</b><button id="coop-quit">部屋を出る</button></div>';
      b.style.display = 'flex';
      b.onclick = (e) => { if (e.target.id === 'coop-quit') { location.reload(); return; } b.style.display = 'none'; I.requestLock(); };
    } else if (!want && b.style.display === 'flex' && K.live) b.style.display = 'none';
  }
  function watchPeers() {
    const now = performance.now();
    for (const rp of [...K.players.values()]) if (rp.id !== K.id && now - rp.seen > 8000) K.drop(rp.id);
  }
  K.drop = function (id) {
    const rp = K.players.get(id); if (!rp) return;
    K.players.delete(id);
    if (rp.body) G.scene.remove(rp.body);
    if (K.role === 'guest') { if (K.live) K.ended('ホストとの接続が切れました', 'ランは終了します'); return; }
    K.msg(`${rp.name} が抜けた`);
    if (K.onLeave) K.onLeave(rp);
    K.send({ t: 'left', i: id, r: roster() });
  };
  K.handlers.left = function (m) { const rp = K.players.get(m.i); if (rp) { K.players.delete(m.i); if (rp.body) G.scene.remove(rp.body); K.msg(`${rp.name} が抜けた`); } };

  // ---------------- lobby ----------------
  function lobby() {
    const box = el('div', 'coop-lobby', `<div class="cl-box"><h2>CO-OP</h2><div id="cl-body"></div><div class="cl-err" id="cl-err"></div></div>`);
    K.lobbyEl = box;
    const body = box.querySelector('#cl-body'), err = (t) => { box.querySelector('#cl-err').textContent = t || ''; };
    const name0 = (() => { try { return localStorage.getItem('abyss_coop_name') || ''; } catch (e) { return ''; } })();
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
      <label>名前<input id="cl-name" maxlength="12" value="${G.U.esc(name0)}" placeholder="名前"></label>
      <button id="cl-host">部屋を作る</button>
      <div class="cl-row"><input id="cl-code" maxlength="5" placeholder="部屋コード" style="text-transform:uppercase"><button id="cl-join">参加する</button></div>
      <div class="cl-note">最大${K.MAX}人。ホストのPCで世界が動きます。ソロのセーブデータとは別に動き、途中保存はありません。</div></div>`;
    const nm = () => { const v = (body.querySelector('#cl-name').value || '').trim() || 'プレイヤー'; try { localStorage.setItem('abyss_coop_name', v); } catch (e) { /* no storage */ } return v; };
    body.querySelector('#cl-host').onclick = () => K.open(N().code(), true, nm());
    body.querySelector('#cl-join').onclick = () => { const c = body.querySelector('#cl-code').value.trim().toUpperCase(); if (c.length !== 5) { err('5文字の部屋コードを入れてください'); return; } K.open(c, false, nm()); };
    K.lobbyErr = err;
  }
  const N = () => window.CoopNet;
  function roomScreen() {
    const body = K.lobbyEl.querySelector('#cl-body');
    const names = [...K.players.values()].map((p) => `<div>・${G.U.esc(p.name)}${p.id === 0 ? '（ホスト）' : ''}</div>`).join('');
    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px"><div class="cl-note">部屋コード</div><div class="cl-code">${K.code}</div><div>${names}</div>`
      + (K.role === 'host' ? `<button id="cl-start"${K.players.size < 2 && !qs.has('solo') ? ' disabled' : ''}>開始する</button>` : '<div class="cl-note">ホストの開始を待っています…</div>') + '</div>';
    const b = body.querySelector('#cl-start');
    if (b) b.onclick = () => K.begin();
  }
  K.open = function (code, isHost, name) {
    K.code = code; K.name = name; K.role = isHost ? 'host' : 'guest';
    const lat = +qs.get('lat') || 0, jit = +qs.get('jit') || 0;
    const t = K.net = qs.has('local') ? N().local(code, isHost, { lat, jit }) : N().peer(code, isHost);
    t.onmsg = onMsg;
    t.onerror = (m) => { K.lobbyErr(m); K.role = null; };
    t.onleave = (id) => K.drop(id);
    if (isHost) {
      K.id = 0; K.addPlayer(0, name);
      t.onopen = () => roomScreen();
      t.onpeer = (id) => { K.addPlayer(id, '…'); };
      K.installHost();
    } else {
      t.onpeer = () => K.send({ t: 'hi', v: window.COOP_VER, name });
      K.lobbyErr('接続中…');
      K.installGuest();
    }
  };
  K.handlers.hi = function (m, from) {
    const rp = K.players.get(from); if (!rp) return;
    if (m.v !== window.COOP_VER) { K.send({ t: 'no', why: 'ゲームのバージョンが違います。ページを再読み込みしてください' }, from); K.players.delete(from); return; }
    if (K.players.size > K.MAX || K.live) { K.send({ t: 'no', why: K.live ? 'もう始まっています' : '部屋が満員です' }, from); K.players.delete(from); return; }
    rp.name = m.name;
    K.send({ t: 'room', id: from, r: roster() });
    roomScreen();
  };
  K.handlers.no = function (m) { K.lobbyErr(m.why); K.net.close(); K.net = null; };
  K.handlers.room = function (m) {
    K.id = m.id;
    K.players.clear();
    for (const [id, nm] of m.r) K.addPlayer(id, nm);
    K.lobbyErr('');
    roomScreen();
  };
  // both sides, when the run begins
  K.started = function () {
    K.lobbyEl.style.display = 'none'; K.live = true;
    for (const rp of K.players.values()) rp.seen = performance.now();
    K.hudEl.style.display = '';
  };

  function start() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    K.hudEl = el('div', 'coop-hud'); K.hudEl.style.display = 'none';
    K.backEl = el('div', 'coop-back');
    K.msgEl = el('div', 'coop-msg');
    GM().debug = true;
    // your own falling: the world must not stop behind a death screen
    GM().playerDied = function () { K.onDown(); };
    // the title screens have no place here: back to the title means back to the lobby
    GM().toTitle = function () { K.live = false; location.reload(); };
    // your shots are drawn on the others' screens (a line from you along your aim, a few per second at most)
    const sh = G.weapons.shoot;
    let shotT = 0;
    G.weapons.shoot = function (w, st) {
      const r = sh.call(G.weapons, w, st), now = performance.now();
      if (K.live && now - shotT > 110) {
        shotT = now;
        const P = G.player, c = G.camera, d = V(0, 0, -1).applyQuaternion(c.quaternion), a = P.chestPos().add(d.clone().multiplyScalar(0.6)), b = a.clone().addScaledVector(d, 45);
        K.send({ t: 'sh', i: K.id, a: K.vec(a), b: K.vec(b) });
      }
      return r;
    };
    const pu = G.player.update;
    G.player.update = function (dt) { if (this.dead) clearKeys(); return pu.call(this, dt); };
    lobby();
    last = performance.now();
    requestAnimationFrame(loop);
    const auto = qs.get('room');
    if (auto) K.open(auto, qs.has('host'), qs.get('name') || (qs.has('host') ? 'H' : 'G'));
  }
  const wait = () => { if (G.game && G.game.state === 'title') start(); else setTimeout(wait, 100); };
  window.addEventListener('load', wait);
})();
