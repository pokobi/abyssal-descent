'use strict';
// ---------------------------------------------------------------------------------------------------------------------------
// Smartphone / tablet layer.  Loaded ONLY when index.html detects a touch device (window.G_MOBILE); a PC never runs any of this.
// It drives the game through the same inputs the keyboard and mouse use (window key / mouse events and G.input.mx/my), so no
// game code had to change:   left stick = move   right side drag = look   buttons = fire / aim / jump / crouch / reload / ...
// Pointer lock does not exist on phones, so "locked" is emulated: requestLock() / exitLock() just flip G.input.locked and emit
// the same 'lockchange' event, which keeps pausing / resuming exactly as on the PC.
// ---------------------------------------------------------------------------------------------------------------------------
(function () {
  if (!window.G_MOBILE || !window.G) return;
  const G = window.G, I = G.input, doc = document, root = doc.documentElement;
  const GMr = () => G.game;
  const $ = (id) => doc.getElementById(id);
  let lastTouch = 0;

  // ---- first launch on a phone: lighter graphics ----
  try {
    const S = G.save.data.settings;
    if (!S.mobileInit) { S.mobileInit = 1; S.quality = 'low'; S.fullscreen = false; G.save.write(); if (G.game && G.game.applyQuality && G.game.state) G.game.applyQuality(); }
  } catch (e) { /* ignore */ }

  // ---- emulated pointer lock ----
  I.requestLock = function () { if (!I.el || I.locked) return; I.locked = true; G.emit('lockchange', true); };
  I.exitLock = function () { if (!I.locked) return; I.locked = false; releaseAll(); G.emit('lockchange', false); };
  // fullscreen + landscape lock (both need a user gesture; where unsupported, the rotate overlay below does the job)
  I.fullscreen = function () {
    const de = doc.documentElement;
    const lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } };
    try {
      if (!doc.fullscreenElement && de.requestFullscreen) { const p = de.requestFullscreen({ navigationUI: 'hide' }); if (p && p.then) p.then(lock).catch(lock); else lock(); } else lock();
    } catch (e) { lock(); }
  };

  // texts that name a key ("[4 で使用]", "Tab で…") name the on-screen button instead
  const TOUCH_NAME = { forward: 'スティック', back: 'スティック', left: 'スティック', right: 'スティック', jump: 'ジャンプボタン', sprint: 'スティック全押し', crouch: 'しゃがみ', reload: 'リロード',
    interact: '対象をタップ', grapple: '⚓', grenade: '💣', cycleGrenade: '💣長押し', skill1: 'ULT', skill2: 'スキル1', skill3: 'スキル2', skill4: 'スキル3', item1: '消耗品1', item2: '消耗品2',
    w1: '武器1', w2: '武器2', w3: '近接', status: '🎒ボタン', inventory: '🎒ボタン' };
  const keyName0 = I.keyName;
  I.keyName = (a) => TOUCH_NAME[a] || keyName0(a);

  // ---- helpers: synthetic key / mouse events ----
  const down = new Set();
  const keyEv = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const kd = (c) => { if (!c || down.has(c)) return; down.add(c); keyEv('keydown', c); };
  const ku = (c) => { if (down.delete(c)) keyEv('keyup', c); };
  const tapKey = (c) => { keyEv('keydown', c); setTimeout(() => keyEv('keyup', c), 45); };
  const mouseEv = (type, b) => { const e = new MouseEvent(type, { button: b, bubbles: true, cancelable: true }); e.__m = 1; window.dispatchEvent(e); };
  const bind = (a) => (G.BIND[a] && G.BIND[a][0]) || null;
  let adsOn = false, fireN = 0;
  function setAds(on) { if (on === adsOn) return; adsOn = on; mouseEv(on ? 'mousedown' : 'mouseup', 2); }
  function fireDown() { if (fireN++ === 0) mouseEv('mousedown', 0); }
  function fireUp() { if (fireN > 0 && --fireN === 0) mouseEv('mouseup', 0); }
  function releaseAll() {
    for (const c of [...down]) ku(c);
    if (adsOn) { adsOn = false; mouseEv('mouseup', 2); }
    if (fireN > 0) { fireN = 0; mouseEv('mouseup', 0); }
    stick.id = null; if (stickEl) stickEl.classList.remove('on');
    aimers.length = 0;
    for (const a of ['forward', 'back', 'left', 'right']) ku(bind(a));
    ku(bind('sprint'));
    for (const b of btnEls) b.classList.remove('press');
  }

  // holding the fire button keeps a semi-auto / burst gun shooting as fast as it can (a phone has no fast clicking finger)
  const endFrame0 = I.endFrame;
  I.endFrame = function () { endFrame0(); if (fireN > 0 && I.locked) I.mpressed[0] = true; endTap(); };

  // touches that follow a real finger produce "compatibility" mouse events; while playing they must not reach the game
  ['mousedown', 'mouseup', 'mousemove', 'contextmenu'].forEach((t) => window.addEventListener(t, (e) => {
    if (e.__m) return;
    if (I.locked && e.isTrusted && performance.now() - lastTouch < 1500) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); }
  }, true));
  window.addEventListener('contextmenu', (e) => { if (!(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) e.preventDefault(); });
  doc.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---- DOM ----
  const ui = doc.createElement('div'); ui.id = 'm-ui';
  ui.innerHTML = '<div id="m-look"></div><div id="m-stickzone"></div><div id="m-stick"><i></i></div>';
  const btnLayer = doc.createElement('div'); btnLayer.id = 'm-btns';
  const rot = doc.createElement('div'); rot.id = 'm-rotate'; rot.innerHTML = '<div><div class="mr-ic">📱</div><div class="mr-t">横向きにしてください</div><div class="mr-s">このゲームは横画面専用です</div></div>';
  const app = $('app');
  app.insertBefore(ui, $('hud'));
  app.insertBefore(btnLayer, $('screens'));
  app.appendChild(rot);
  const lookEl = $('m-look'), stickZone = $('m-stickzone'), stickEl = $('m-stick');

  // ---- buttons (sizes and offsets are in "u", 1u = viewport height / 360) ----
  // side: r = measured from the right edge, l = from the left;  by = centre height above the bottom;  ty = centre below the top
  const BTN = [
    { id: 'fire', lbl: '🔫', t: '射撃', s: 88, side: 'r', x: 70, by: 82, cls: 'fire', d: fireDown, u: fireUp, look: true },
    { id: 'fireL', lbl: '🔫', t: '射撃', s: 56, side: 'l', x: 40, by: 172, cls: 'fire', d: fireDown, u: fireUp, look: true },
    { id: 'ads', lbl: '🎯', t: '構え', s: 54, side: 'r', x: 160, by: 50, cls: 'ads', d: () => { const P = G.player; if (P && P.meleeMode) { mouseEv('mousedown', 2); setTimeout(() => mouseEv('mouseup', 2), 70); } else setAds(!adsOn); }, tog: 'ads' },
    { id: 'jump', lbl: '⤴', t: 'ジャンプ', s: 54, side: 'r', x: 58, by: 176, d: () => kd(bind('jump')), u: () => ku(bind('jump')) },
    { id: 'crouch', lbl: '⤵', t: 'しゃがみ', s: 46, side: 'r', x: 134, by: 138, d: () => kd(bind('crouch')), u: () => ku(bind('crouch')) },
    { id: 'reload', lbl: '🔄', t: 'リロード', s: 42, side: 'r', x: 214, by: 92, d: () => { const P = G.player; if (P && P.meleeMode) kd(bind('reload')); else tapKey(bind('reload')); }, u: () => ku(bind('reload')) },
    { id: 'use', lbl: '✋', t: '調べる', s: 46, side: 'r', x: 210, by: 150, d: () => kd(bind('interact')), u: () => ku(bind('interact')) },
    { id: 'pause', lbl: '⏸', t: '', s: 34, side: 'r', x: 24, ty: 24, cls: 'sys', d: () => tapKey('KeyI') },
    { id: 'bag', lbl: '🎒', t: '', s: 34, side: 'r', x: 66, ty: 24, cls: 'sys', d: () => tapKey(bind('status') || 'Tab') },
  ];
  const btnEls = [];
  for (const b of BTN) {
    const el = doc.createElement('div'); el.className = 'mb ' + (b.cls || ''); el.dataset.id = b.id;
    el.innerHTML = `<span class="mi">${b.lbl}</span>${b.t && b.s >= 46 ? `<span class="mt">${b.t}</span>` : ''}`;
    btnLayer.appendChild(el); btnEls.push(el); b.el = el;
    let pid = null;
    el.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId; lastTouch = performance.now();
      if (b.look) aimAdd(e, false);
      try { el.setPointerCapture(pid); } catch (er) { /* ignore */ }
      e.preventDefault(); el.classList.add('press');
      if (b.tog) el.classList.toggle('lit', !adsOn); // ads toggles on / off
      if (b.d) b.d();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (er) { /* ignore */ } }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !b.look) return;
      aimMove(e);
    });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; lastTouch = performance.now(); if (b.look) aimEnd(e); el.classList.remove('press'); if (b.u) b.u(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  // the extra "inventory close" button while the bag is open
  const closeBtn = doc.createElement('div'); closeBtn.id = 'm-close'; closeBtn.textContent = '✕ 閉じる';
  closeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tapKey(bind('status') || 'Tab'); });
  app.insertBefore(closeBtn, $('screens'));

  // ---- look ----
  // Only one finger steers the view, however many are on the glass. A finger on the look area beats a finger on a fire button, and among equals the first one down
  // keeps it: press fire with the index finger while the thumb aims and the aim stays with the thumb; lift the thumb and the next finger takes over without a jump.
  const LOOK_K = 2.3;
  function addLook(dx, dy) { I.mx += dx * LOOK_K; I.my += dy * LOOK_K; }
  const aimers = [];
  const aimOwner = () => aimers.find((a) => a.area) || aimers[0];
  function aimAdd(e, area) { aimers.push({ id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), area }); }
  function aimMove(e) {
    const a = aimers.find((q) => q.id === e.pointerId); if (!a) return;
    if (a === aimOwner()) addLook(e.clientX - a.x, e.clientY - a.y);
    a.x = e.clientX; a.y = e.clientY;
  }
  function aimEnd(e) { const i = aimers.findIndex((q) => q.id === e.pointerId); if (i < 0) return null; return aimers.splice(i, 1)[0]; }
  lookEl.addEventListener('pointerdown', (e) => {
    lastTouch = performance.now(); e.preventDefault();
    aimAdd(e, true);
    try { lookEl.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  });
  lookEl.addEventListener('pointermove', aimMove);
  const lookEnd = (e) => {
    const a = aimEnd(e); lastTouch = performance.now();
    if (a && e.type === 'pointerup' && performance.now() - a.t0 < 280 && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 14) tapTarget(e.clientX, e.clientY);
  };
  lookEl.addEventListener('pointerup', lookEnd); lookEl.addEventListener('pointercancel', lookEnd);

  // ---- tapping what you want to search, open or talk to ----
  // The game picks what can be used from where the crosshair points, so a tap asks it the same question about the tapped spot: for one unseen frame the view points
  // there (nothing is drawn in that frame); if the game finds something, the view stays on it and it is used (a search then goes on as long as you keep looking at it),
  // otherwise the view goes back as if nothing had happened.
  let lastUse = null, tap = null;
  const showI = G.ui.showInteract;
  G.ui.showInteract = function (o) { lastUse = o; return showI.call(G.ui, o); };
  function tapTarget(x, y) {
    const GM = GMr(), P = G.player;
    if (!GM || GM.state !== 'playing' || !I.locked || tap || P.dead) return;
    holdFrame();
    const c = G.camera, v = new THREE.Vector3(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    tap = { yaw: P.yaw, pitch: P.pitch };
    P.yaw = Math.atan2(-v.x, -v.z); P.pitch = Math.asin(Math.max(-1, Math.min(1, v.y)));
  }
  // (the renderer only exists once the game has booted)
  function holdFrame() {
    const R = G.renderer; if (!R || R._mHold) return;
    R._mHold = true;
    const render0 = R.render, clear0 = R.clear;
    R.render = function (a, b) { if (!tap) render0.call(R, a, b); };
    R.clear = function (a, b, c) { if (!tap) clear0.call(R, a, b, c); };
  }
  const endTap = () => {
    if (!tap) return;
    const t = tap; tap = null;
    if (lastUse) { const k = bind('interact'); if (k) I.pressed[k] = true; }
    else { const P = G.player; P.yaw = t.yaw; P.pitch = t.pitch; }
  };

  // ---- floating move stick ----
  const stick = { id: null, ox: 0, oy: 0 };
  const stickR = () => 56 * unit() * (opts().mStick || 1);
  function stickSet(dx, dy) {
    const R = stickR(), len = Math.hypot(dx, dy), k = len > R ? R / len : 1, nx = dx * k, ny = dy * k;
    const knob = stickEl.firstElementChild; knob.style.transform = `translate(${nx}px, ${ny}px)`;
    const dz = 0.26 * R;
    (ny < -dz ? kd : ku)(bind('forward')); (ny > dz ? kd : ku)(bind('back'));
    (nx < -dz ? kd : ku)(bind('left')); (nx > dz ? kd : ku)(bind('right'));
    // pushed all the way forward = sprint
    (ny < -0.82 * R && Math.abs(nx) < 0.7 * R ? kd : ku)(bind('sprint'));
  }
  stickZone.addEventListener('pointerdown', (e) => {
    lastTouch = performance.now(); e.preventDefault();
    if (stick.id !== null) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
    try { stickZone.setPointerCapture(stick.id); } catch (er) { /* ignore */ }
    stickEl.style.left = stick.ox + 'px'; stickEl.style.top = stick.oy + 'px'; stickEl.classList.add('on');
    stickSet(0, 0);
  });
  stickZone.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) stickSet(e.clientX - stick.ox, e.clientY - stick.oy); });
  const stickEnd = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null; lastTouch = performance.now(); stickEl.classList.remove('on');
    for (const a of ['forward', 'back', 'left', 'right', 'sprint']) ku(bind(a));
  };
  stickZone.addEventListener('pointerup', stickEnd); stickZone.addEventListener('pointercancel', stickEnd);

  // ---- the HUD's own skill / item / weapon tiles are touch buttons too ----
  const hud = $('hud');
  const tileCode = (el) => {
    const U = G.ui;
    if (el.closest('#weapon-slots')) { const w = el.closest('.wslot'), n = w && w.querySelector('b') ? w.querySelector('b').textContent.trim() : ''; return /^[1-3]$/.test(n) ? 'Digit' + n : null; }
    const ab = el.closest('.ab'); if (!ab || !U) return null;
    const i = U.abEls ? U.abEls.indexOf(ab) : -1;
    if (i >= 0) return bind('skill' + (i + 1));
    if (ab === U.pileEl) return bind('crouch');
    if (ab === U.grEl) return bind('grapple');
    if (ab === U.gnEl) return bind('grenade');
    const k = U.itEls ? U.itEls.indexOf(ab) : -1;
    return k >= 0 ? bind('item' + (k + 1)) : null;
  };
  const tiles = new Map(); // pointerId -> { code, x, y }
  hud.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.ab, .wslot')) return;
    const code = tileCode(e.target); if (!code) return;
    lastTouch = performance.now(); e.preventDefault();
    tiles.set(e.pointerId, { code, x: e.clientX, y: e.clientY });
    try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    kd(code);
  });
  hud.addEventListener('pointermove', (e) => {
    const t = tiles.get(e.pointerId); if (!t) return;
    // holding a tile opens the item / weapon wheel; the finger then steers it exactly like the mouse does
    I.mx += e.clientX - t.x; I.my += e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
  });
  const tileEnd = (e) => { const t = tiles.get(e.pointerId); if (!t) return; tiles.delete(e.pointerId); lastTouch = performance.now(); ku(t.code); };
  hud.addEventListener('pointerup', tileEnd); hud.addEventListener('pointercancel', tileEnd);

  // ---- layout, orientation, visibility ----
  const unit = () => Math.max(0.78, Math.min(1.5, window.innerHeight / 360));
  // the HUD's skill / item tiles live in a layer of their own, so each can be placed like a button
  const tileLayer = doc.createElement('div'); tileLayer.id = 'm-tiles'; hud.appendChild(tileLayer);
  const TILES = [
    { id: 'ult', t: 'ULT', s: 36, x: -130, get: () => G.ui.abEls && G.ui.abEls[0] }, { id: 's1', t: 'スキル1', s: 36, x: -92, get: () => G.ui.abEls && G.ui.abEls[1] },
    { id: 's2', t: 'スキル2', s: 36, x: -54, get: () => G.ui.abEls && G.ui.abEls[2] }, { id: 's3', t: 'スキル3', s: 36, x: -16, get: () => G.ui.abEls && G.ui.abEls[3] },
    { id: 'pile', t: 'パイル', s: 36, x: 22, get: () => G.ui.pileEl }, { id: 'grap', t: 'グラップル', s: 36, x: 62, get: () => G.ui.grEl },
    { id: 'gren', t: '投擲', s: 30, x: 100, get: () => G.ui.gnEl }, { id: 'it1', t: '消耗品1', s: 30, x: 132, get: () => G.ui.itEls && G.ui.itEls[0] },
    { id: 'it2', t: '消耗品2', s: 30, x: 164, get: () => G.ui.itEls && G.ui.itEls[1] },
  ].map((t) => Object.assign(t, { side: 'c', by: 22, lbl: t.t, tile: true }));
  const adopt = () => { for (const t of TILES) { const el = t.get(); if (el && el.parentNode !== tileLayer) { tileLayer.appendChild(el); t.el = el; place(t); } else if (el) t.el = el; } };
  // what the player has chosen: S.mLayout = { id: { x, y (centre, 0..1 of the screen), s (size factor) } }, S.mHud, S.mOpacity, S.mStick, S.mUseBtn
  const opts = () => { const S = G.save.data.settings; if (!S.mLayout) S.mLayout = {}; return S; };
  const ITEMS = BTN.concat(TILES);
  const centre = (b) => {
    const u = unit(), W = window.innerWidth, H = window.innerHeight, o = opts().mLayout[b.id];
    if (o && o.x !== undefined) return [o.x * W, o.y * H];
    return [b.side === 'r' ? W - b.x * u : b.side === 'c' ? W / 2 + b.x * u : b.x * u, b.ty !== undefined ? b.ty * u : H - b.by * u];
  };
  const sizeOf = (b) => { const o = opts().mLayout[b.id]; return b.s * unit() * ((o && o.s) || 1); };
  function place(b) {
    const el = b.el; if (!el) return;
    const s = sizeOf(b), [cx, cy] = centre(b);
    el.style.width = el.style.height = s + 'px'; el.style.fontSize = s * (b.tile ? 0.5 : 0.42) + 'px';
    el.style.left = cx - s / 2 + 'px'; el.style.top = cy - s / 2 + 'px';
  }
  // the HUD's size: every panel scales together (1 = the default, already smaller than before)
  const hudCss = doc.createElement('style'); doc.head.appendChild(hudCss);
  function hudScale() {
    const S = opts(), k = 0.8 * (S.mHud || 1), z = (v) => (v * k).toFixed(3);
    hudCss.textContent = `html.m #hud-tl > *, html.m #hud-tr > *, html.m #hud-br > *, html.m #hud-buffs { zoom: ${z(0.62)}; } html.m #hud-bl > *, html.m #pstatus { zoom: ${z(0.6)}; }
      html.m #interact-panel { zoom: ${z(0.62)}; } html.m #bossbar { zoom: ${z(0.72)}; } html.m #toasts { zoom: ${z(0.72)}; } html.m #banner { zoom: ${z(0.7)}; }
      html.m #item-cards, html.m #gain-host, html.m #anom-alert { zoom: ${z(0.66)}; } html.m #pile-ind, html.m #gren-hint, html.m #airjump-hint { zoom: ${z(0.7)}; }
      html.m #hp-bars { width: calc(var(--u) * 170 / ${z(0.6)} * ${k.toFixed(3)}); }`;
    const op = S.mOpacity === undefined ? 1 : S.mOpacity;
    btnLayer.style.opacity = op; tileLayer.style.opacity = op;
  }
  function layout() {
    const u = unit();
    root.style.setProperty('--u', u + 'px');
    root.style.setProperty('--vh1', window.innerHeight + 'px');
    adopt();
    for (const b of ITEMS) place(b);
    stickEl.style.setProperty('--r', stickR() + 'px');
    hudScale();
  }
  window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  layout();

  // keep the page still (no pull-to-refresh / bounce / zoom)
  const vp = doc.querySelector('meta[name=viewport]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

  // the first touch asks for fullscreen + landscape (a gesture is required)
  let fsTried = 0;
  window.addEventListener('pointerdown', () => { if (fsTried < 2 && !doc.fullscreenElement) { fsTried++; I.fullscreen(); } }, true);

  let wasOn = false;
  function tick() {
    const GM = GMr(), st = GM && GM.state;
    const portrait = window.innerHeight > window.innerWidth;
    rot.classList.toggle('on', portrait);
    if (portrait && st === 'playing') tapKey('KeyI'); // the game stops while the phone is upright
    const play = (st === 'playing' || st === 'resuming') && !portrait;
    root.classList.toggle('m-play', play);
    root.classList.toggle('m-inv', st === 'inv');
    if (wasOn && !play) releaseAll();
    wasOn = play;
    adopt();
    // the interact button, for those who keep it, shows only when there is something to use; a fallen teammate needs it held
    { const use = BTN.find((b) => b.id === 'use'), rv = doc.getElementById('coop-rv'); use.el.style.display = rv && rv.style.display === 'block' || (opts().mUseBtn && lastUse) ? '' : 'none'; }
    // ads button light follows the real state
    const ads = btnLayer.querySelector('[data-id=ads]'); if (ads) ads.classList.toggle('lit', adsOn);
  }
  const loop = () => { tick(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // also on a timer and on every lock change, so the controls appear even when frames are throttled
  setInterval(tick, 200);
  G.on('lockchange', () => setTimeout(tick, 0));
  // ---- settings: where every button sits and how big it is ----
  function editor(back) {
    const S = opts(), ed = doc.createElement('div'); ed.id = 'm-edit';
    ed.innerHTML = `<div id="me-bar">
      <b id="me-name">ボタンを動かす／タップで選択</b>
      <label>大きさ<input type="range" id="me-size" min="0.5" max="2" step="0.05" value="1"></label>
      <label>UI全体<input type="range" id="me-hud" min="0.6" max="1.4" step="0.05" value="${S.mHud || 1}"></label>
      <label>濃さ<input type="range" id="me-op" min="0.25" max="1" step="0.05" value="${S.mOpacity === undefined ? 1 : S.mOpacity}"></label>
      <label>スティック<input type="range" id="me-stick" min="0.6" max="1.6" step="0.05" value="${S.mStick || 1}"></label>
      <label class="me-c"><input type="checkbox" id="me-use"${S.mUseBtn ? ' checked' : ''}>調べるボタンも出す</label>
      <button id="me-reset">初期配置</button><button id="me-done">完了</button></div>`;
    doc.body.appendChild(ed);
    let sel = null;
    const ps = new Map();
    const draw = (b) => { const p = ps.get(b), s = sizeOf(b), [cx, cy] = centre(b); p.style.width = p.style.height = s + 'px'; p.style.left = cx - s / 2 + 'px'; p.style.top = cy - s / 2 + 'px'; p.style.fontSize = Math.max(9, s * 0.2) + 'px'; };
    const pick = (b) => { sel = b; for (const [q, p] of ps) p.classList.toggle('sel', q === b); ed.querySelector('#me-name').textContent = b.t || b.lbl; ed.querySelector('#me-size').value = (S.mLayout[b.id] && S.mLayout[b.id].s) || 1; };
    for (const b of ITEMS) {
      if (b.id === 'use' && !S.mUseBtn) continue;
      const p = doc.createElement('div'); p.className = 'me-b' + (b.tile ? ' tile' : ''); p.textContent = b.tile ? b.t : b.lbl + (b.t ? ' ' + b.t : '');
      ed.appendChild(p); ps.set(b, p); draw(b);
      let pid = null, ox = 0, oy = 0;
      p.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { p.setPointerCapture(pid); } catch (er) { /* ignore */ } const [cx, cy] = centre(b); ox = e.clientX - cx; oy = e.clientY - cy; pick(b); ed.classList.add('drag'); });
      p.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid) return;
        const o = S.mLayout[b.id] || (S.mLayout[b.id] = {});
        o.x = Math.max(0.02, Math.min(0.98, (e.clientX - ox) / window.innerWidth)); o.y = Math.max(0.03, Math.min(0.97, (e.clientY - oy) / window.innerHeight));
        draw(b);
      });
      const up = (e) => { if (e.pointerId === pid) { pid = null; ed.classList.remove('drag'); } };
      p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
    }
    ed.querySelector('#me-size').oninput = (e) => { if (!sel) return; (S.mLayout[sel.id] || (S.mLayout[sel.id] = {})).s = +e.target.value; draw(sel); };
    ed.querySelector('#me-hud').oninput = (e) => { S.mHud = +e.target.value; hudScale(); };
    ed.querySelector('#me-op').oninput = (e) => { S.mOpacity = +e.target.value; hudScale(); };
    ed.querySelector('#me-stick').oninput = (e) => { S.mStick = +e.target.value; };
    ed.querySelector('#me-use').onchange = (e) => { S.mUseBtn = e.target.checked; };
    ed.querySelector('#me-reset').onclick = () => { S.mLayout = {}; S.mHud = S.mOpacity = S.mStick = undefined; G.save.write(); ed.remove(); layout(); editor(back); };
    ed.querySelector('#me-done').onclick = () => { G.save.write(); ed.remove(); layout(); if (back) back(); };
  }
  const settings0 = G.ui.settings;
  G.ui.settings = function (back) {
    settings0.call(G.ui, back);
    const p = doc.querySelector('#screens .panel h2'); if (!p) return;
    p.insertAdjacentHTML('afterend', '<button class="btn" id="m-layout" style="width:100%;margin-bottom:8px">📱 ボタン配置・UIサイズ</button>');
    doc.getElementById('m-layout').onclick = () => editor(() => G.ui.settings(back));
  };
  // ---- iPhone: Safari cannot go fullscreen, an app added to the home screen can. Said once on the title screen, until dismissed ----
  const isIPhone = /iPhone|iPod/.test(navigator.userAgent), standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  let tip = null;
  function homeTip() {
    if (!isIPhone || standalone) return;
    const S = opts(), on = GMr() && GMr().state === 'title' && !S.mNoHomeTip && !doc.querySelector('#screens .panel');
    if (on && !tip) {
      tip = doc.createElement('div'); tip.id = 'm-hometip';
      tip.innerHTML = '<b>全画面で遊ぶには</b><span>Safariの共有ボタン（□↑）→「ホーム画面に追加」→ 追加したアイコンから起動。<br>Safariとは記録が別になることがあります。</span><div><button data-a="later">閉じる</button><button data-a="never">今後表示しない</button></div>';
      tip.addEventListener('click', (e) => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; if (a === 'never') { S.mNoHomeTip = 1; G.save.write(); } tip.remove(); tip = 0; });
      doc.body.appendChild(tip);
    } else if (!on && tip) { tip.remove(); tip = null; }
  }
  setInterval(homeTip, 500);
  window.__mobile = { kd, ku, tapKey, releaseAll, layout, editor };
})();
