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
  // (the four ways of the stick are one control: texts that list all four, "WASD", say "スティック" once - back / left / right name nothing)
  const TOUCH_NAME = { forward: 'スティック', back: '', left: '', right: '', jump: 'ジャンプボタン', sprint: 'スティック全押し', crouch: 'しゃがみ', reload: 'リロード',
    interact: '対象をタップ', grapple: 'グラップル', grenade: '投擲', cycleGrenade: '投擲の長押し', skill1: 'ULT', skill2: 'スキル1', skill3: 'スキル2', skill4: 'スキル3', item1: '消耗品1', item2: '消耗品2',
    w1: '武器1', w2: '武器2', w3: '近接', status: 'バッグ', inventory: 'バッグ', ping: 'ピン' };
  const keyName0 = I.keyName;
  I.keyName = (a) => (a in TOUCH_NAME ? TOUCH_NAME[a] : keyName0(a));

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
    for (const b of BTN) b.pid = null;
    tiles.clear();
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
  const rot = doc.createElement('div'); rot.id = 'm-rotate'; rot.innerHTML = '<div><div class="mr-ic"><svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="1.6"/><path d="M10.6 4.6h2.8M11 19.2h2"/></svg></div><div class="mr-t">横向きにしてください</div><div class="mr-s">このゲームは横画面で遊びます</div></div>';
  const app = $('app');
  app.insertBefore(ui, $('hud'));
  app.insertBefore(btnLayer, $('screens'));
  app.appendChild(rot);
  const lookEl = $('m-look'), stickZone = $('m-stickzone'), stickEl = $('m-stick');

  // ---- the buttons' signs: line drawings in the HUD's old gold (an emoji is drawn by the phone in its own bright colours - a toy water pistol for "fire") ----
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    // a cartridge, point up
    fire: svg('<path d="M9.2 9.5 C9.2 6 10.4 3.6 12 2.6 C13.6 3.6 14.8 6 14.8 9.5"/><path d="M8.6 9.5h6.8v10.2H8.6z"/><path d="M8 19.7h8v1.9H8z"/><path d="M8.6 12.2h6.8"/>'),
    // the sight picture: a ring, its cross and a dot
    ads: svg('<circle cx="12" cy="12" r="7.6"/><path d="M12 1.8v5.2M12 17v5.2M1.8 12H7M17 12h5.2"/><circle cx="12" cy="12" r="1.1" class="f"/>'),
    jump: svg('<path d="M5 13.5 12 6.5l7 7"/><path d="M5 19 12 12l7 7" opacity=".55"/><path d="M5 3.4h14"/>'),
    crouch: svg('<path d="M5 10.5 12 17.5l7-7"/><path d="M5 5 12 12l7-7" opacity=".55"/><path d="M5 20.6h14"/>'),
    reload: svg('<path d="M19.2 12.6A7.3 7.3 0 1 1 16.8 6.6"/><path d="M17.6 2.6v4.6h-4.6"/>'),
    use: svg('<path d="M8 12.5V5.2a1.3 1.3 0 0 1 2.6 0V11"/><path d="M10.6 10V3.8a1.3 1.3 0 0 1 2.6 0V11"/><path d="M13.2 10.2V5a1.3 1.3 0 0 1 2.6 0v6.6"/><path d="M15.8 9.4a1.3 1.3 0 0 1 2.6 0v4.4c0 4.4-2.6 7.6-6.6 7.6-2.6 0-4.2-1.3-5.4-3.4L4.2 14.4a1.3 1.3 0 0 1 2.2-1.4L8 15"/>'),
    pause: svg('<path d="M8.2 5v14M15.8 5v14" stroke-width="2.6"/>'),
    // a satchel: flap, strap, buckle
    bag: svg('<path d="M4.2 9.4h15.6v10.4a1.2 1.2 0 0 1-1.2 1.2H5.4a1.2 1.2 0 0 1-1.2-1.2z"/><path d="M4.2 9.4 6 5.6h12l1.8 3.8"/><path d="M8.6 5.6V3.8h6.8v1.8"/><path d="M10 9.4v3.8h4V9.4"/>'),
    ping: svg('<path d="M12 21.4s-6.4-6.2-6.4-11a6.4 6.4 0 0 1 12.8 0c0 4.8-6.4 11-6.4 11z"/><circle cx="12" cy="10.4" r="2.2"/>'),
  };
  // ---- buttons (sizes and offsets are in "u", 1u = viewport height / 360) ----
  // side: r = measured from the right edge, l = from the left;  by = centre height above the bottom;  ty = centre below the top. Measured inside the screen's
  // safe area (the notch, the rounded corners and the home bar are kept clear). nm: the name in the layout editor where the button shows no text of its own
  const BTN = [
    { id: 'fire', lbl: ICON.fire, t: '射撃', s: 88, side: 'r', x: 70, by: 82, cls: 'fire', d: fireDown, u: fireUp, look: true },
    { id: 'fireL', lbl: ICON.fire, t: '射撃', s: 56, side: 'l', x: 40, by: 172, cls: 'fire', d: fireDown, u: fireUp, look: true },
    // (a little higher than it used to be, so that the row of skill and item tiles along the bottom passes under it on a small phone)
    { id: 'ads', lbl: ICON.ads, t: '構え', s: 54, side: 'r', x: 160, by: 72, cls: 'ads', d: () => { const P = G.player; if (P && P.meleeMode) { mouseEv('mousedown', 2); setTimeout(() => mouseEv('mouseup', 2), 70); } else setAds(!adsOn); }, tog: 'ads' },
    { id: 'jump', lbl: ICON.jump, t: 'ジャンプ', s: 54, side: 'r', x: 58, by: 176, d: () => kd(bind('jump')), u: () => ku(bind('jump')) },
    { id: 'crouch', lbl: ICON.crouch, t: 'しゃがみ', s: 46, side: 'r', x: 134, by: 138, d: () => kd(bind('crouch')), u: () => ku(bind('crouch')) },
    { id: 'reload', lbl: ICON.reload, t: 'リロード', s: 44, side: 'r', x: 214, by: 98, d: () => { const P = G.player; if (P && P.meleeMode) kd(bind('reload')); else tapKey(bind('reload')); }, u: () => ku(bind('reload')) },
    { id: 'use', lbl: ICON.use, t: '調べる', s: 46, side: 'r', x: 210, by: 154, d: () => kd(bind('interact')), u: () => ku(bind('interact')) },
    { id: 'pause', lbl: ICON.pause, t: '', nm: 'ポーズ', s: 40, side: 'r', x: 26, ty: 26, cls: 'sys', d: () => { asPlaying(); tapKey('KeyI'); } },
    { id: 'bag', lbl: ICON.bag, t: '', nm: 'バッグ', s: 40, side: 'r', x: 74, ty: 26, cls: 'sys', d: () => { asPlaying(); if (G.InvUI && G.InvUI.isOpen()) G.InvUI.close(); else tapKey(bind('status') || 'Tab'); } },
    // a ping, where the game has one (the team play page adds its key; nothing else does)
    { id: 'ping', lbl: ICON.ping, t: '', nm: 'ピン', s: 40, side: 'r', x: 122, ty: 26, cls: 'sys', d: () => { const k = bind('ping'); if (k) tapKey(k); }, only: () => !!bind('ping') },
  ];
  // (the game's keys only answer in the state they expect: a button on screen means the state is "playing" even if the game was left in "resuming")
  function asPlaying() { const GM = GMr(); if (GM && GM.state === 'resuming') { GM.state = 'playing'; G.ui.clearScreen(); } }
  const btnEls = [];
  for (const b of BTN) {
    const el = doc.createElement('div'); el.className = 'mb ' + (b.cls || ''); el.dataset.id = b.id;
    el.innerHTML = `<span class="mi">${b.lbl}</span>${b.t && b.s >= 44 ? `<span class="mt">${b.t}</span>` : ''}`;
    btnLayer.appendChild(el); btnEls.push(el); b.el = el; b.pid = null;
    // A press ends when its own pointer lets go, wherever that is heard: the pause and bag buttons vanish under the finger the moment the menu opens, and a pointerup that
    // never reaches a hidden button used to leave it "held" for good (its next taps were ignored).
    b.end = (e) => { if (b.pid === null || (e && e.pointerId !== b.pid)) return; const id = b.pid; b.pid = null; lastTouch = performance.now(); if (b.look) aimEnd({ pointerId: id }); el.classList.remove('press'); if (b.u) b.u(); };
    el.addEventListener('pointerdown', (e) => {
      if (b.pid !== null) b.end();
      b.pid = e.pointerId; lastTouch = performance.now();
      if (b.look) aimAdd(e, false);
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      e.preventDefault(); el.classList.add('press');
      if (b.tog) el.classList.toggle('lit', !adsOn); // ads toggles on / off
      if (b.d) b.d();
      if (navigator.vibrate && !opts().mNoVib) { try { navigator.vibrate(8); } catch (er) { /* ignore */ } }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== b.pid || !b.look) return;
      aimMove(e);
    });
    el.addEventListener('pointerup', b.end); el.addEventListener('pointercancel', b.end); el.addEventListener('lostpointercapture', b.end);
  }
  // the same for anything that ended somewhere else: every finger that lifts lets go of what it held (after the elements' own handlers have run)
  const liftAll = (e) => {
    for (const b of BTN) b.end(e);
    if (e.pointerId === stick.id) stickEnd(e);
    if (aimers.some((a) => a.id === e.pointerId)) aimEnd(e);
    if (tiles.has(e.pointerId)) tileEnd(e);
  };
  window.addEventListener('pointerup', liftAll); window.addEventListener('pointercancel', liftAll);
  // the extra "inventory close" button while the bag is open
  const closeBtn = doc.createElement('div'); closeBtn.id = 'm-close'; closeBtn.textContent = '✕ 閉じる';
  closeBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const GM = GMr();
    if (G.InvUI && G.InvUI.isOpen()) G.InvUI.close(); // (the bag itself closes, whatever state the game thinks it is in)
    else if (GM && GM.state === 'inv') GM.resume();
    else tapKey(bind('status') || 'Tab');
  });
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
    // the weapon / ammo panel: a tap takes up the next weapon in order (the mouse wheel's turn on the PC: a bigger mark than the slots' small names);
    // a finger that drags from it aims, as anywhere on the view
    if (e.target.closest && e.target.closest('#weapon-info')) {
      lastTouch = performance.now(); e.preventDefault(); aimAdd(e, true); wiTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      return;
    }
    if (!e.target.closest || !e.target.closest('.ab, .wslot')) return;
    const code = tileCode(e.target); if (!code) return;
    lastTouch = performance.now(); e.preventDefault();
    tiles.set(e.pointerId, { code, x: e.clientX, y: e.clientY });
    try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    kd(code);
  });
  let wiTap = null;
  hud.addEventListener('pointermove', (e) => {
    if (wiTap && e.pointerId === wiTap.id) { aimMove(e); return; }
    const t = tiles.get(e.pointerId); if (!t) return;
    // holding a tile opens the item / weapon wheel; the finger then steers it exactly like the mouse does
    I.mx += e.clientX - t.x; I.my += e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
  });
  const tileEnd = (e) => { const t = tiles.get(e.pointerId); if (!t) return; tiles.delete(e.pointerId); lastTouch = performance.now(); ku(t.code); };
  hud.addEventListener('pointerup', tileEnd); hud.addEventListener('pointercancel', tileEnd);
  const wiEnd = (e) => {
    if (!wiTap || e.pointerId !== wiTap.id) return;
    const w = wiTap; wiTap = null;
    if (e.type === 'pointerup' && performance.now() - w.t < 300 && Math.hypot(e.clientX - w.x, e.clientY - w.y) < 14 && I.locked && GMr() && GMr().state === 'playing') I.wheel += 1;
  };
  window.addEventListener('pointerup', wiEnd); window.addEventListener('pointercancel', wiEnd);

  // ---- the bag: an item being carried turns when a second finger taps (the R key of the PC) ----
  // The bag follows its dragging finger through window-wide pointer events that do not ask which finger moved, so the second finger's own events are kept from it.
  let dragPid = null, turnPid = null;
  window.addEventListener('pointerdown', (e) => {
    if (!doc.querySelector('.iv-ghost')) { dragPid = e.pointerId; turnPid = null; return; }
    if (e.pointerId === dragPid) return;
    turnPid = e.pointerId; e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault();
    keyEv('keydown', 'KeyR'); setTimeout(() => keyEv('keyup', 'KeyR'), 40);
  }, true);
  for (const t of ['pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, (e) => { if (turnPid !== null && e.pointerId === turnPid) { if (t !== 'pointermove') turnPid = null; e.stopImmediatePropagation(); } }, true);
  // ---- the bag: a finger held still on an item (or a weapon, a piece of armour worn) opens its menu - the PC's right click: use, fit, split, move, mend ... ----
  // The press has already picked the item up (the bag starts a drag at once): it is put back down where it was, and the bag is given the right button's press and
  // release at the same spot, as a mouse would give them. Until it lifts, that finger is no longer heard by the bag.
  const MENU_SEL = '#inv-ui .iv-it, #inv-ui .iv-wbox, #inv-ui .iv-eq';
  let hold = null, holdPid = null;
  window.addEventListener('pointerdown', (e) => {
    if (e.__m2 || hold || e.button !== 0 || !e.target || !e.target.closest || !e.target.closest(MENU_SEL)) return;
    const pid = e.pointerId, x = e.clientX, y = e.clientY;
    hold = { pid, x, y, t: setTimeout(() => { hold = null; itemMenu(pid, x, y); }, 520) };
  }, true);
  const holdOff = (e) => { if (hold && e.pointerId === hold.pid && (e.type !== 'pointermove' || Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10)) { clearTimeout(hold.t); hold = null; } };
  for (const t of ['pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, holdOff, true);
  function itemMenu(pid, x, y) {
    if (!G.InvUI || !G.InvUI.isOpen()) return;
    const pe = (el, type, b) => { const ev = new PointerEvent(type, { pointerId: 90, button: b, buttons: b === 2 ? 2 : 0, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'mouse' }); ev.__m2 = 1; el.dispatchEvent(ev); };
    if (doc.querySelector('.iv-ghost')) pe(window, 'pointerup', 0);
    holdPid = pid;
    const at = doc.elementFromPoint(x, y), el = at && at.closest(MENU_SEL);
    if (!el) return;
    pe(el, 'pointerdown', 2); pe(window, 'pointerup', 2);
    if (navigator.vibrate && !opts().mNoVib) { try { navigator.vibrate(12); } catch (er) { /* ignore */ } }
  }
  for (const t of ['pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, (e) => { if (holdPid !== null && e.pointerId === holdPid) { if (t !== 'pointermove') holdPid = null; e.stopImmediatePropagation(); } }, true);

  // ---- layout, orientation, visibility ----
  const unit = () => Math.max(0.78, Math.min(1.5, window.innerHeight / 360));
  // the HUD's skill / item tiles live in a layer of their own, so each can be placed like a button
  const tileLayer = doc.createElement('div'); tileLayer.id = 'm-tiles'; hud.appendChild(tileLayer);
  // (their row is laid out to fit the room between the HP panel and the fire button: tileRow below. g: the group, a wider gap between groups)
  const TILES = [
    { id: 'ult', t: 'ULT', g: 0, get: () => G.ui.abEls && G.ui.abEls[0] }, { id: 's1', t: 'スキル1', g: 0, get: () => G.ui.abEls && G.ui.abEls[1] },
    { id: 's2', t: 'スキル2', g: 0, get: () => G.ui.abEls && G.ui.abEls[2] }, { id: 's3', t: 'スキル3', g: 0, get: () => G.ui.abEls && G.ui.abEls[3] },
    { id: 'pile', t: 'パイル', g: 1, get: () => G.ui.pileEl }, { id: 'grap', t: 'グラップル', g: 1, get: () => G.ui.grEl },
    { id: 'gren', t: '投擲', g: 2, get: () => G.ui.gnEl }, { id: 'it1', t: '消耗品1', g: 2, get: () => G.ui.itEls && G.ui.itEls[0] },
    { id: 'it2', t: '消耗品2', g: 2, get: () => G.ui.itEls && G.ui.itEls[1] },
  ].map((t) => Object.assign(t, { side: 'c', s: 36, x: 0, by: 22, lbl: t.t, tile: true }));
  // the screen's safe area in px (the notch, the rounded corners, the home bar): read from CSS env() through a hidden probe
  const sa = { l: 0, r: 0, t: 0, b: 0 };
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  doc.body.appendChild(probe);
  function readSafe() { try { const cs = getComputedStyle(probe); sa.t = parseFloat(cs.paddingTop) || 0; sa.r = parseFloat(cs.paddingRight) || 0; sa.b = parseFloat(cs.paddingBottom) || 0; sa.l = parseFloat(cs.paddingLeft) || 0; } catch (e) { /* ignore */ } }
  readSafe();
  // the row of tiles: as big as the room allows (30..40 u), between the HP panel's right edge and the fire button's left edge, on the bottom edge
  let rowEdge = -1;
  function tileRow() {
    const u = unit(), W = window.innerWidth, S = opts(), hb = doc.getElementById('hud-bl'), hr = hb ? hb.getBoundingClientRect() : null;
    const movedHp = S.mLayout.i_bl && S.mLayout.i_bl.x !== undefined, fire = BTN[0], fo = S.mLayout.fire;
    let L = sa.l + 8 * u;
    if (!movedHp) L = Math.max(L, hr && hr.width > 4 ? hr.right : sa.l + 150 * u);
    rowEdge = hr ? Math.round(hr.right) : -1;
    L += 6 * u;
    const R = (fo && fo.x !== undefined) ? W - sa.r - 120 * u : centre(fire)[0] - sizeOf(fire) / 2 - 6 * u;
    const gap = 4 * u, gg = 9 * u, n = TILES.length, room = R - L;
    const t = Math.max(30 * u, Math.min(40 * u, (room - (n - 3) * gap - 2 * gg) / n)), total = n * t + (n - 3) * gap + 2 * gg;
    let x = L + Math.max(0, (room - total) / 2) + t / 2;
    TILES.forEach((tl, i) => { if (i && tl.g !== TILES[i - 1].g) x += gg - gap; tl.cx = x; tl.s = t / u; tl.by = (t / 2 + 4 * u) / u; x += t + gap; });
  }
  const adopt = () => { for (const t of TILES) { const el = t.get(); if (el && el.parentNode !== tileLayer) { tileLayer.appendChild(el); t.el = el; place(t); } else if (el) t.el = el; } };
  // The HUD's information panels can be placed too: S.mLayout[id] = { x, y (the panel's top left corner, 0..1 of the screen), s (size factor) }.
  // def: where it sits (in u) until it is moved, only used to draw its frame in the editor while the HUD is not on screen.
  const PANELS = [
    { id: 'i_tl', t: 'エリア・目標', sel: '#hud-tl', def: (W, H, u) => ({ x: 10 * u, y: 6 * u, w: 150 * u, h: 50 * u }) },
    { id: 'i_tr', t: 'コイン・時間', sel: '#hud-tr', def: (W, H, u) => ({ x: W - 100 * u - 84 * u, y: 6 * u, w: 84 * u, h: 22 * u }) },
    { id: 'i_br', t: '武器・弾', sel: '#hud-br', def: (W, H, u) => ({ x: W - 10 * u - 110 * u, y: 50 * u, w: 110 * u, h: 58 * u }) },
    { id: 'i_bl', t: 'HP・状態', sel: '#hud-bl', def: (W, H, u) => ({ x: 8 * u, y: H - 6 * u - 40 * u, w: 170 * u, h: 40 * u }) },
    { id: 'i_bf', t: '加護アイコン', sel: '#hud-buffs', def: (W, H, u) => ({ x: 10 * u, y: 78 * u, w: 90 * u, h: 40 * u }) },
  ].map((p) => Object.assign(p, { panel: true }));
  const panelEl = (p) => doc.querySelector(p.sel);
  const factor = (id) => { const o = opts().mLayout[id]; return (o && o.s) || 1; };
  function placePanels() {
    const W = window.innerWidth, H = window.innerHeight;
    for (const p of PANELS) {
      const el = panelEl(p); if (!el) continue;
      const o = opts().mLayout[p.id];
      if (!(o && o.x !== undefined)) { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; continue; }
      el.style.left = o.x * W + 'px'; el.style.top = o.y * H + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto';
      // (a screen of another shape must not push it out of sight)
      const r = el.getBoundingClientRect();
      if (r.width) { if (r.right > W) el.style.left = Math.max(0, W - r.width) + 'px'; if (r.bottom > H) el.style.top = Math.max(0, H - r.height) + 'px'; }
    }
  }
  // what the player has chosen: S.mLayout = { id: { x, y (centre, 0..1 of the screen), s (size factor) } }, S.mHud, S.mOpacity, S.mStick, S.mUseBtn
  const opts = () => { const S = G.save.data.settings; if (!S.mLayout) S.mLayout = {}; return S; };
  const ITEMS = BTN.concat(TILES);
  const centre = (b) => {
    const u = unit(), W = window.innerWidth, H = window.innerHeight, o = opts().mLayout[b.id];
    if (o && o.x !== undefined) return [o.x * W, o.y * H];
    return [b.side === 'r' ? W - sa.r - b.x * u : b.side === 'c' ? (b.cx !== undefined ? b.cx : W / 2 + b.x * u) : sa.l + b.x * u, b.ty !== undefined ? sa.t + b.ty * u : H - sa.b - b.by * u];
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
  // (a tablet's taller screen shows the panels bigger, as it does the buttons; a narrow phone gives the HP bar less length, so that the tiles keep their size)
  const devK = () => Math.max(1, Math.min(1.45, window.innerHeight / 390));
  function hudScale() {
    const S = opts(), k = 0.8 * (S.mHud || 1) * devK(), z = (v, id) => (v * k * (id ? factor(id) : 1)).toFixed(3), fb = factor('i_bl') * ((window.innerWidth - sa.l - sa.r) / unit() < 700 ? 0.78 : 1);
    hudCss.textContent = `html.m #hud-tl > * { zoom: ${z(0.62, 'i_tl')}; } html.m #hud-tr > * { zoom: ${z(0.62, 'i_tr')}; } html.m #hud-br > * { zoom: ${z(0.62, 'i_br')}; } html.m #hud-buffs { zoom: ${z(0.62, 'i_bf')}; }
      html.m #hud-bl > *, html.m #pstatus { zoom: ${z(0.6, 'i_bl')}; }
      html.m #interact-panel { zoom: ${z(0.62)}; } html.m #bossbar { zoom: ${z(0.72)}; } html.m #toasts { zoom: ${z(0.72)}; } html.m #banner { zoom: ${z(0.7)}; }
      html.m #item-cards, html.m #gain-host, html.m #anom-alert { zoom: ${z(0.66)}; } html.m #pile-ind, html.m #gren-hint, html.m #airjump-hint { zoom: ${z(0.7)}; }
      html.m #hp-bars { width: calc(var(--u) * 170 / ${z(0.6, 'i_bl')} * ${(k * fb).toFixed(3)}); }`;
    const op = S.mOpacity === undefined ? 1 : S.mOpacity;
    btnLayer.style.opacity = op; tileLayer.style.opacity = op;
  }
  // the menus' size: as large as a landscape phone allows (they scroll when taller), full size from a tablet up; S.mMenu: the player's factor
  const menuZoom = () => Math.max(0.6, Math.min(1.25, Math.max(0.72, Math.min(1, window.innerHeight / 520)) * (opts().mMenu || 1)));
  function layout() {
    const u = unit();
    readSafe();
    root.style.setProperty('--u', u + 'px');
    root.style.setProperty('--vh1', window.innerHeight + 'px');
    root.style.setProperty('--mz', menuZoom().toFixed(3));
    // (the coins / time panel sits left of the system buttons at the top right, the ping's among them when there is one)
    root.style.setProperty('--trR', (sa.r + (bind('ping') ? 148 : 100) * u) + 'px');
    adopt();
    hudScale();
    tileRow();
    for (const b of ITEMS) place(b);
    stickEl.style.setProperty('--r', stickR() + 'px');
    placePanels();
  }
  window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  // (the address bar coming and going changes the visible height without always firing a resize on the window)
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (Math.abs(window.innerHeight - parseFloat(root.style.getPropertyValue('--vh1'))) > 1) layout(); });
  layout();
  // the tile row follows the HP panel's width (its numbers grow, the HUD comes up after the title)
  setInterval(() => { const hb = doc.getElementById('hud-bl'), r = hb ? Math.round(hb.getBoundingClientRect().right) : -1; if (r !== rowEdge && !doc.getElementById('m-edit')) { tileRow(); for (const t of TILES) place(t); } }, 400);

  // keep the page still (no pull-to-refresh / bounce / zoom)
  const vp = doc.querySelector('meta[name=viewport]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

  // A touch asks for fullscreen + landscape, and opens the sound. Both need a "user activation", which a finger gives as it lifts (pointerup / touchend), not as
  // it lands: the game's own sound start listens to pointerdown, which on a phone can leave the sound made but still closed (suspended) - it is opened here.
  // Fullscreen is asked again (at most every 4 s) after the browser left it (Android's back gesture); a browser without it (iPhone Safari) is not asked.
  let fsT = -1e9;
  const activated = () => {
    if (!doc.hidden && !(GMr() && GMr().ctxLost)) { try { if (G.sfx && G.sfx.init) G.sfx.init(); } catch (e) { /* ignore */ } try { if (G.bgm && G.bgm.init) G.bgm.init(); } catch (e) { /* ignore */ } }
    if (!doc.fullscreenElement && doc.documentElement.requestFullscreen && performance.now() - fsT > 4000) { fsT = performance.now(); I.fullscreen(); }
  };
  window.addEventListener('pointerup', activated, true); window.addEventListener('touchend', activated, true);

  // Whatever the cause, a state that nothing on the screen can answer does not last: left in it, no button would do anything.
  //  - "a bag is open" with no bag, "resuming" while the view is already locked, a pause with no menu: back to playing
  let sickK = '', sickT = 0;
  function unstick() {
    const GM = GMr();
    if (!GM || !GM.run || GM.transitioning || GM._warming) { sickK = ''; return; }
    const st = GM.state, inv = !!(G.InvUI && G.InvUI.isOpen()), scr = doc.querySelector('#screens > *');
    let k = '';
    if (st === 'inv' && !inv) k = 'inv';
    else if (st === 'resuming' && I.locked) k = 'resuming';
    else if (st === 'paused' && !scr && !inv) k = 'paused';
    else if (st === 'playing' && !I.locked && !tap && !inv) k = 'unlocked';
    if (!k) { sickK = ''; return; }
    const now = performance.now();
    if (k !== sickK) { sickK = k; sickT = now; return; }
    if (now - sickT < 700) return;
    sickK = ''; sickT = 0;
    if (k === 'inv' || k === 'paused') GM.resume();
    else if (k === 'resuming') { GM.state = 'playing'; G.ui.clearScreen(); }
    else I.requestLock();
  }
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
    unstick();
    adopt();
    // the interact button, for those who keep it, shows only when there is something to use; a fallen teammate needs it held
    { const use = BTN.find((b) => b.id === 'use'), rv = doc.getElementById('coop-rv'); use.el.style.display = rv && rv.style.display === 'block' || (opts().mUseBtn && lastUse) ? '' : 'none'; }
    // ads button light follows the real state
    const ads = btnLayer.querySelector('[data-id=ads]'); if (ads) ads.classList.toggle('lit', adsOn);
    // buttons that exist only where the game has their key (the ping)
    for (const b of BTN) if (b.only) { const on = b.only(); b.el.style.display = on ? '' : 'none'; if (on !== b.wasOnly) { b.wasOnly = on; layout(); } }
    // an item being carried in the bag: the second finger's tap turns it (the R key of the PC)
    root.classList.toggle('m-drag', !!doc.querySelector('.iv-ghost'));
    wake(!!GM && !!GM.run && st !== 'title' && !portrait && !doc.hidden);
  }
  // ---- the screen stays lit through a run (Wake Lock, where the browser has it; it is let go by the browser when the tab is hidden) ----
  // (a refusal is not asked again for 5 s)
  let wl = null, wlAsk = false, wlNo = -1e9;
  function wake(on) {
    if (!('wakeLock' in navigator)) return;
    if (on && !wl && !wlAsk && performance.now() - wlNo > 5000) {
      wlAsk = true;
      try {
        navigator.wakeLock.request('screen').then((l) => { wlAsk = false; if (wl) { l.release(); return; } wl = l; l.addEventListener('release', () => { if (wl === l) wl = null; }); }, () => { wlAsk = false; wlNo = performance.now(); });
      } catch (e) { wlAsk = false; wlNo = performance.now(); }
    } else if (!on && wl) { const l = wl; wl = null; try { l.release(); } catch (e) { /* ignore */ } }
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
      <b id="me-name">ボタン・情報パネルを動かす／タップで選択</b>
      <label>大きさ<input type="range" id="me-size" min="0.5" max="2" step="0.05" value="1"></label>
      <label>UI全体<input type="range" id="me-hud" min="0.6" max="1.4" step="0.05" value="${S.mHud || 1}"></label>
      <label>濃さ<input type="range" id="me-op" min="0.25" max="1" step="0.05" value="${S.mOpacity === undefined ? 1 : S.mOpacity}"></label>
      <label>スティック<input type="range" id="me-stick" min="0.6" max="1.6" step="0.05" value="${S.mStick || 1}"></label>
      <label class="me-c"><input type="checkbox" id="me-use"${S.mUseBtn ? ' checked' : ''}>調べるボタンも出す</label>
      <button id="me-reset">初期配置</button><button id="me-done">完了</button></div>`;
    doc.body.appendChild(ed);
    let sel = null;
    const ps = new Map();
    const draw = (b) => {
      const p = ps.get(b);
      if (b.panel) { const s = factor(b.id), o = S.mLayout[b.id]; p.style.width = b.bw * s + 'px'; p.style.height = b.bh * s + 'px'; p.style.left = (o && o.x !== undefined ? o.x * window.innerWidth : b.x0) + 'px'; p.style.top = (o && o.x !== undefined ? o.y * window.innerHeight : b.y0) + 'px'; p.style.fontSize = '11px'; return; }
      const s = sizeOf(b), [cx, cy] = centre(b); p.style.width = p.style.height = s + 'px'; p.style.left = cx - s / 2 + 'px'; p.style.top = cy - s / 2 + 'px'; p.style.fontSize = Math.max(9, s * 0.2) + 'px';
    };
    const pick = (b) => { sel = b; for (const [q, p] of ps) p.classList.toggle('sel', q === b); ed.querySelector('#me-name').textContent = b.t || b.nm || b.id; ed.querySelector('#me-size').value = (S.mLayout[b.id] && S.mLayout[b.id].s) || 1; };
    // (the frames of the information panels are drawn first so that a button lying over one stays reachable)
    for (const b of ITEMS) {
      if (b.id === 'use' && !S.mUseBtn) continue;
      if (b.only && !b.only()) continue;
      const p = doc.createElement('div'); p.className = 'me-b' + (b.tile ? ' tile' : ''); p.textContent = b.t || b.nm;
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
    // the information panels: a frame the size of the real panel (or of its usual size while the HUD is not up), dragged by its top left corner
    for (const b of PANELS) {
      const el = panelEl(b), r = el ? el.getBoundingClientRect() : null, d = b.def(window.innerWidth, window.innerHeight, unit()), real = r && r.width > 6 && r.height > 6, s0 = factor(b.id);
      b.bw = (real ? r.width : d.w) / s0; b.bh = (real ? r.height : d.h) / s0; b.x0 = real ? r.left : d.x; b.y0 = real ? r.top : d.y;
      const p = doc.createElement('div'); p.className = 'me-b panel'; p.textContent = b.t;
      ed.appendChild(p); ps.set(b, p); draw(b);
      let pid = null, ox = 0, oy = 0;
      p.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { p.setPointerCapture(pid); } catch (er) { /* ignore */ } const bx = p.getBoundingClientRect(); ox = e.clientX - bx.left; oy = e.clientY - bx.top; pick(b); ed.classList.add('drag'); });
      p.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid) return;
        const W = window.innerWidth, H = window.innerHeight, w = b.bw * factor(b.id), h = b.bh * factor(b.id), o = S.mLayout[b.id] || (S.mLayout[b.id] = {});
        o.x = Math.max(0, Math.min(1 - w / W, (e.clientX - ox) / W)); o.y = Math.max(0, Math.min(1 - h / H, (e.clientY - oy) / H));
        draw(b); placePanels();
      });
      const up = (e) => { if (e.pointerId === pid) { pid = null; ed.classList.remove('drag'); } };
      p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
    }
    ed.querySelector('#me-size').oninput = (e) => { if (!sel) return; const o = S.mLayout[sel.id] || (S.mLayout[sel.id] = {}); o.s = +e.target.value; if (sel.panel && o.x === undefined) { o.x = sel.x0 / window.innerWidth; o.y = sel.y0 / window.innerHeight; } draw(sel); if (sel.panel) { hudScale(); placePanels(); } };
    ed.querySelector('#me-hud').oninput = (e) => { S.mHud = +e.target.value; hudScale(); };
    ed.querySelector('#me-op').oninput = (e) => { S.mOpacity = +e.target.value; hudScale(); };
    ed.querySelector('#me-stick').oninput = (e) => { S.mStick = +e.target.value; };
    ed.querySelector('#me-use').onchange = (e) => { S.mUseBtn = e.target.checked; };
    ed.querySelector('#me-reset').onclick = () => { S.mLayout = {}; S.mHud = S.mOpacity = S.mStick = S.mMenu = undefined; G.save.write(); ed.remove(); layout(); editor(back); };
    ed.querySelector('#me-done').onclick = () => { G.save.write(); ed.remove(); layout(); if (back) back(); };
  }
  // The settings, on a phone: the layout screen first; the mouse's sensitivity is the drag's; what a phone has no use for (keys, the PC's fullscreen box, the
  // frame counter that is not shown) is taken out; the touch options (the menus' size, the buttons' buzz) are put in under 操作
  const settings0 = G.ui.settings;
  G.ui.settings = function (back) {
    settings0.call(G.ui, back);
    const pan = doc.querySelector('#screens .panel'), p = pan && pan.querySelector('h2'); if (!p) return;
    p.insertAdjacentHTML('afterend', '<button class="btn" id="m-layout" style="width:100%;margin-bottom:8px">ボタン配置・UIの大きさ</button>');
    doc.getElementById('m-layout').onclick = () => editor(() => G.ui.settings(back));
    const row = (sel) => { const e = pan.querySelector(sel); return e && e.closest('.set-row'); };
    const sens = row('#s-sens'); if (sens && sens.firstElementChild) sens.firstElementChild.textContent = '👆 視点感度（ドラッグ）';
    for (const sel of ['#s-keys', '#s-fullscreen', '#s-showFps']) {
      const r = row(sel); if (!r) continue;
      const h = r.previousElementSibling; r.remove();
      if (h && h.classList.contains('set-head') && (!h.nextElementSibling || h.nextElementSibling.classList.contains('set-head'))) h.remove();
    }
    const S = opts(), page = pan.querySelector('.set-page[data-page=ctrl]'); if (!page) return;
    const pc = (v) => Math.round(v * 100) + '%';
    page.insertAdjacentHTML('beforeend', `<div class="set-head">タッチ操作</div>
      <div class="set-row"><span>🔠 メニューの文字の大きさ</span><input type="range" id="m-menu" min="0.85" max="1.25" step="0.05" value="${S.mMenu || 1}"><span class="v" id="m-menu-v">${pc(S.mMenu || 1)}</span></div>
      <div class="set-row"><span>📳 ボタンを押した時の振動</span><input type="checkbox" id="m-vib"${S.mNoVib ? '' : ' checked'}><span></span></div>`);
    const mi = page.querySelector('#m-menu');
    // (applied when the finger lets go: the panel under the finger changing size while it is dragged would move the slider away from it)
    mi.oninput = () => { page.querySelector('#m-menu-v').textContent = pc(+mi.value); };
    mi.onchange = () => { S.mMenu = +mi.value; G.save.write(); root.style.setProperty('--mz', menuZoom().toFixed(3)); };
    page.querySelector('#m-vib').onchange = (e) => { S.mNoVib = e.target.checked ? undefined : 1; G.save.write(); };
  };
  // the controls screen names the phone's controls (the PC's list names keys and mouse buttons)
  const help0 = G.ui.help;
  G.ui.help = function (back) {
    help0.call(G.ui, back);
    const keys = doc.querySelector('#screens .keys'); if (!keys) return;
    const k = (a, b) => `<kbd>${a}</kbd><span>${b}</span>`;
    keys.innerHTML = k('左側をドラッグ', '移動（スティックをいっぱいに倒すと走る。設定の「常に走る」で逆にもできる）') + k('右側をドラッグ', '視点（感度は設定の「視点感度」）')
      + k('射撃', '射撃（押している間は撃ち続ける）／近接武器では連撃。左上にもう1つ') + k('構え', 'ADS（押すたびに入／切）／近接武器では重撃／投擲物を構えている時は下手投げ')
      + k('ジャンプ', 'ジャンプ（段差の前で押し続けるとよじ登り）／水の中では浮く') + k('しゃがみ', 'しゃがみ（走っている間はスライディング）')
      + k('パイル', '空中でパイルドライバー') + k('リロード', 'リロード／近接武器では押している間 防御（正面の攻撃を軽減）')
      + k('グラップル', '押している間 巻き取り／離すと解除／ジャンプで跳躍解除') + k('画面の物をタップ', '調べる・宝箱・商人・扉（設定の「ボタン配置」で調べるボタンも出せる）')
      + k('ULT・スキル1〜3', 'スキル（インベントリで入れ替え）') + k('投擲', '投擲物を構える → 射撃で投げる／長押しで選択ホイール')
      + k('消耗品1・2', '使う／長押しで選択ホイール（指を動かして選ぶ）') + k('右上の武器の枠', '武器の持ち替え（弾数の表示をタップで順に）')
      + k('バッグ', 'インベントリ・装備・ステータス（防具・アタッチメントの付け替え）') + k('バッグの中', 'ドラッグで移動／長押しでメニュー（使う・装着・分ける など）／2回タップで反対側へ移す・使う／持ったまま2本目の指でタップで回転') + k('ポーズ', 'ポーズ（図鑑・設定・操作方法）')
      + (bind('ping') ? k('ピン', '見ている所に印を付ける') : '');
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
