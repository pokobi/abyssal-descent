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
    interact: '調べるボタン', grapple: '⚓', grenade: '💣', cycleGrenade: '💣長押し', skill1: 'ULT', skill2: 'スキル1', skill3: 'スキル2', skill4: 'スキル3', item1: '消耗品1', item2: '消耗品2',
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
    for (const a of ['forward', 'back', 'left', 'right']) ku(bind(a));
    ku(bind('sprint'));
    for (const b of btnEls) b.classList.remove('press');
  }

  // holding the fire button keeps a semi-auto / burst gun shooting as fast as it can (a phone has no fast clicking finger)
  const endFrame0 = I.endFrame;
  I.endFrame = function () { endFrame0(); if (fireN > 0 && I.locked) I.mpressed[0] = true; };

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
    { id: 'fire', lbl: '🔫', t: '射撃', s: 96, side: 'r', x: 76, by: 88, cls: 'fire', d: fireDown, u: fireUp, look: true },
    { id: 'fireL', lbl: '🔫', t: '射撃', s: 62, side: 'l', x: 44, by: 176, cls: 'fire', d: fireDown, u: fireUp, look: true },
    { id: 'ads', lbl: '🎯', t: '構え', s: 62, side: 'r', x: 172, by: 56, cls: 'ads', d: () => { const P = G.player; if (P && P.meleeMode) { mouseEv('mousedown', 2); setTimeout(() => mouseEv('mouseup', 2), 70); } else setAds(!adsOn); }, tog: 'ads' },
    { id: 'jump', lbl: '⤴', t: 'ジャンプ', s: 62, side: 'r', x: 64, by: 190, d: () => kd(bind('jump')), u: () => ku(bind('jump')) },
    { id: 'crouch', lbl: '⤵', t: 'しゃがみ', s: 54, side: 'r', x: 150, by: 150, d: () => kd(bind('crouch')), u: () => ku(bind('crouch')) },
    { id: 'reload', lbl: '🔄', t: 'リロード', s: 48, side: 'r', x: 236, by: 104, d: () => tapKey(bind('reload')) },
    { id: 'use', lbl: '✋', t: '調べる', s: 52, side: 'r', x: 232, by: 164, d: () => kd(bind('interact')), u: () => ku(bind('interact')) },
    { id: 'pause', lbl: '⏸', t: '', s: 34, side: 'r', x: 24, ty: 24, cls: 'sys', d: () => tapKey('KeyI') },
    { id: 'bag', lbl: '🎒', t: '', s: 34, side: 'r', x: 66, ty: 24, cls: 'sys', d: () => tapKey(bind('status') || 'Tab') },
  ];
  const btnEls = [];
  for (const b of BTN) {
    const el = doc.createElement('div'); el.className = 'mb ' + (b.cls || ''); el.dataset.id = b.id;
    el.innerHTML = `<span class="mi">${b.lbl}</span>${b.t && b.s >= 46 ? `<span class="mt">${b.t}</span>` : ''}`;
    btnLayer.appendChild(el); btnEls.push(el); b.el = el;
    let pid = null, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;
      pid = e.pointerId; lx = e.clientX; ly = e.clientY; lastTouch = performance.now();
      try { el.setPointerCapture(pid); } catch (er) { /* ignore */ }
      e.preventDefault(); el.classList.add('press');
      if (b.tog) el.classList.toggle('lit', !adsOn); // ads toggles on / off
      if (b.d) b.d();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (er) { /* ignore */ } }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !b.look) return;
      addLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; lastTouch = performance.now(); el.classList.remove('press'); if (b.u) b.u(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  // the extra "inventory close" button while the bag is open
  const closeBtn = doc.createElement('div'); closeBtn.id = 'm-close'; closeBtn.textContent = '✕ 閉じる';
  closeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); tapKey(bind('status') || 'Tab'); });
  app.insertBefore(closeBtn, $('screens'));

  // ---- look ----
  const LOOK_K = 2.3;
  function addLook(dx, dy) { I.mx += dx * LOOK_K; I.my += dy * LOOK_K; }
  let lookId = null, llx = 0, lly = 0;
  lookEl.addEventListener('pointerdown', (e) => {
    lastTouch = performance.now(); e.preventDefault();
    if (lookId !== null) return;
    lookId = e.pointerId; llx = e.clientX; lly = e.clientY;
    try { lookEl.setPointerCapture(lookId); } catch (er) { /* ignore */ }
  });
  lookEl.addEventListener('pointermove', (e) => { if (e.pointerId !== lookId) return; addLook(e.clientX - llx, e.clientY - lly); llx = e.clientX; lly = e.clientY; });
  const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; lastTouch = performance.now(); };
  lookEl.addEventListener('pointerup', lookEnd); lookEl.addEventListener('pointercancel', lookEnd);

  // ---- floating move stick ----
  const stick = { id: null, ox: 0, oy: 0 };
  const stickR = () => 56 * unit();
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
  function layout() {
    const u = unit(), W = window.innerWidth, H = window.innerHeight;
    root.style.setProperty('--u', u + 'px');
    root.style.setProperty('--vh1', window.innerHeight + 'px');
    for (const b of BTN) {
      const s = b.s * u, el = b.el;
      el.style.width = el.style.height = s + 'px'; el.style.fontSize = s * 0.42 + 'px';
      const cx = b.side === 'r' ? W - b.x * u : b.x * u;
      const cy = b.ty !== undefined ? b.ty * u : H - b.by * u;
      el.style.left = cx - s / 2 + 'px'; el.style.top = cy - s / 2 + 'px';
    }
    stickEl.style.setProperty('--r', stickR() + 'px');
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
    // ads button light follows the real state
    const ads = btnLayer.querySelector('[data-id=ads]'); if (ads) ads.classList.toggle('lit', adsOn);
  }
  const loop = () => { tick(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // also on a timer and on every lock change, so the controls appear even when frames are throttled
  setInterval(tick, 200);
  G.on('lockchange', () => setTimeout(tick, 0));
  window.__mobile = { kd, ku, tapKey, releaseAll, layout };
})();
