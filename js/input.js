'use strict';
(function () {
  const I = (G.input = {
    keys: {}, pressed: {}, released: {},
    mx: 0, my: 0, wheel: 0,
    mouse: [false, false, false, false, false], mpressed: [false, false, false, false, false], mreleased: [false, false, false, false, false],
    locked: false, el: null, lastLockExit: 0,
  });
  const B = (G.BIND = {
    forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
    reload: ['KeyR'], interact: ['KeyE'], grapple: ['KeyF'], grenade: ['KeyG'], cycleGrenade: ['KeyT'],
    skill1: ['KeyQ'], skill2: ['KeyX'], skill3: ['KeyZ'], skill4: ['KeyV'],
    item1: ['Digit4'], item2: ['Digit5'],
    w1: ['Digit1'], w2: ['Digit2'], w3: ['Digit3'],
    status: ['Tab'], inventory: ['KeyB'],
  });
  // ---- rebinding: settings.keys = { action: code } replaces an action's main key; the code is taken away from every other action ----
  const DEF = JSON.parse(JSON.stringify(B)); I.DEFAULT_BIND = DEF;
  I.BIND_LIST = [
    ['skill1', '🌟 アルティメット'], ['skill2', '✨ スキル1'], ['skill3', '✨ スキル2'], ['skill4', '✨ スキル3'],
    ['crouch', '🧎 しゃがみ／🔨 パイルドライバー（空中）'], ['grapple', '⚓ グラップル'], ['interact', '✋ インタラクト'], ['reload', '🔄 リロード'],
    ['grenade', '💣 投擲物'], ['cycleGrenade', '🔁 投擲物の切替'],
    ['item1', '🧪 消耗品（枠1）'], ['item2', '🧪 消耗品（枠2）'],
    ['jump', '⤴️ ジャンプ'], ['sprint', '🏃 スプリント／歩き'], ['forward', '⬆ 前進'], ['back', '⬇ 後退'], ['left', '⬅ 左'], ['right', '➡ 右'],
    ['inventory', '🎒 持ち物・ステータス画面（サブキー）'], ['w1', '🔫 武器1'], ['w2', '🔫 武器2'], ['w3', '🗡️ 近接武器'], ['status', '🎒 持ち物・ステータス画面'],
  ];
  let bound = new Set();
  I.applyBinds = function () {
    const S = G.save && G.save.data && G.save.data.settings, ov = (S && S.keys) || {};
    for (const a in DEF) B[a] = DEF[a].slice();
    for (const a in ov) {
      if (!B[a] || !ov[a]) continue;
      for (const b in B) if (b !== a) B[b] = B[b].filter((k) => k !== ov[a]);
      B[a] = [ov[a]].concat(B[a].slice(1).filter((k) => k !== ov[a]));
    }
    bound = new Set(Object.values(B).flat());
  };
  const KN = { ControlLeft: 'Ctrl', ControlRight: 'Ctrl', ShiftLeft: 'Shift', ShiftRight: 'Shift', AltLeft: 'Alt', AltRight: 'Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Backspace: 'BS' };
  I.codeName = (c) => (!c ? '—' : KN[c] || (/^Key/.test(c) ? c.slice(3) : /^Digit/.test(c) ? c.slice(5) : /^Numpad/.test(c) ? 'Num' + c.slice(6) : c));
  I.keyName = (a) => I.codeName(B[a] && B[a][0]);
  I.skillKey = (i) => I.keyName('skill' + (i + 1));
  G.K = (a) => I.keyName(a); // shorthand for texts: the key currently bound to an action
  I.down = (a) => B[a].some((k) => I.keys[k]);
  I.hit = (a) => B[a].some((k) => I.pressed[k]);
  I.up = (a) => B[a].some((k) => I.released[k]);
  const GAMEKEYS = new Set(['Tab', 'Space', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyF', 'KeyG', 'KeyR', 'KeyE', 'KeyX', 'KeyZ', 'KeyC', 'KeyV', 'KeyT', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7']);

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (!e.repeat) I.pressed[e.code] = true;
    I.keys[e.code] = true;
    if (I.locked || G.game && (G.game.state === 'playing' || G.game.state === 'buff' || G.game.state === 'inv')) {
      if (GAMEKEYS.has(e.code) || bound.has(e.code) || e.ctrlKey) e.preventDefault();
    }
  }, { capture: true });
  window.addEventListener('keyup', (e) => {
    I.keys[e.code] = false; I.released[e.code] = true;
    if (I.locked) e.preventDefault();
  }, { capture: true });
  // a real alt-tab drops held keys; a momentary focus blip (the browser eating Ctrl+W while Ctrl is the pile key, an overlay) keeps them,
  // because Windows never re-sends a key that is still held down
  let blurT = 0;
  window.addEventListener('blur', () => { I.mouse = [false, false, false, false, false]; clearTimeout(blurT); blurT = setTimeout(() => { if (!document.hasFocus()) I.keys = {}; }, 600); });
  window.addEventListener('focus', () => clearTimeout(blurT));
  window.addEventListener('mousedown', (e) => {
    if (e.button === 1 && (I.locked || (G.game && G.game.state === 'playing'))) e.preventDefault();
    if (!I.locked) return;
    I.mouse[e.button] = true; I.mpressed[e.button] = true;
  });
  window.addEventListener('mouseup', (e) => { I.mouse[e.button] = false; I.mreleased[e.button] = true; });
  window.addEventListener('contextmenu', (e) => { if (I.locked || (G.game && G.game.state === 'playing')) e.preventDefault(); });
  window.addEventListener('mousemove', (e) => {
    if (!I.locked) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    // Chromium occasionally emits a single huge spike on lock/unlock or when crossing monitors; drop it.
    if (Math.abs(dx) > 350 || Math.abs(dy) > 350) return;
    I.mx += dx; I.my += dy;
  });
  window.addEventListener('wheel', (e) => {
    // while the Tab status sheet is open the wheel scrolls it instead of switching weapons
    if (G.ui && G.ui.statusOpen && G.ui.statusOpen()) { G.ui.statusScroll(e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1)); return; }
    if (I.locked || (G.game && G.game.state === 'buff')) { I.wheel += Math.sign(e.deltaY); }
  }, { passive: true });
  // safety net so Ctrl+W during crouch-walk can't silently kill a run
  window.addEventListener('beforeunload', (e) => {
    if (G.game && !G.game.debug && (G.game.state === 'playing' || G.game.state === 'paused' || G.game.state === 'buff')) { e.preventDefault(); e.returnValue = ''; }
  });

  // A pointer lock with raw (unadjusted) input can take hundreds of ms to come back on some Windows setups, and the page stalls meanwhile
  // (menus / inventory / pause all give the lock up and take it again). The first lock stays raw; if a RE-lock turns out slow
  // we switch to a plain lock for the rest of the session.
  let lockT0 = 0, rawSlow = false;
  try { rawSlow = sessionStorage.getItem('ad.rawSlow') === '1'; } catch (e) { /* ignore */ }
  I.lockStats = { n: 0, last: 0, max: 0, plain: () => rawSlow };
  document.addEventListener('pointerlockchange', () => {
    const was = I.locked;
    I.locked = document.pointerLockElement === I.el;
    if (I.locked && lockT0) {
      const dt = performance.now() - lockT0; lockT0 = 0;
      const S = I.lockStats; S.last = Math.round(dt); S.max = Math.max(S.max, S.last); S.n++;
      if (G.Perf && G.Perf.note) G.Perf.note(`ポインターロック取得 ${S.last}ms${rawSlow ? '（通常ロック）' : '（生入力）'}`);
      if (S.n >= 2 && dt > 250 && !rawSlow) { rawSlow = true; try { sessionStorage.setItem('ad.rawSlow', '1'); } catch (e) { /* ignore */ } if (G.Perf && G.Perf.note) G.Perf.note('再ロックが遅いので、以降は通常のロックに切り替え'); }
    }
    // leaving the lock normally drops held keys; during the boon choice we keep them so you keep moving
    if (!I.locked) { if (!(G.game && G.game.state === 'buff') && !document.hasFocus()) I.keys = {}; else if (!(G.game && G.game.state === 'buff')) { const keep = {}; for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']) if (I.keys[k]) keep[k] = true; I.keys = keep; } I.mouse = [false, false, false, false, false]; I.lastLockExit = performance.now(); }
    if (was !== I.locked) G.emit('lockchange', I.locked);
  });
  document.addEventListener('pointerlockerror', () => { G.emit('lockerror'); });

  I.requestLock = function () {
    if (!I.el) return;
    // Esc drops out of fullscreen along with the pointer lock: going back into the game goes back into fullscreen too
    if (G.save && G.save.data && G.save.data.settings.fullscreen) I.fullscreen();
    lockT0 = performance.now();
    try {
      if (rawSlow) { I.el.requestPointerLock(); return; }
      const p = I.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = I.el.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => G.emit('lockerror')); } catch (e) { G.emit('lockerror'); } });
    } catch (e) { try { I.el.requestPointerLock(); } catch (e2) { G.emit('lockerror'); } }
  };
  I.exitLock = function () { if (document.pointerLockElement) document.exitPointerLock(); };
  I.fullscreen = function () {
    const de = document.documentElement;
    if (!document.fullscreenElement && de.requestFullscreen) {
      de.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        // Keyboard lock lets Ctrl+W / Esc-tap reach the game instead of the browser
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyT', 'KeyN', 'Tab']).catch(() => {});
      }).catch(() => {});
    }
  };
  I.endFrame = function () {
    I.pressed = {}; I.released = {}; I.mx = 0; I.my = 0; I.wheel = 0;
    I.mpressed = [false, false, false, false, false]; I.mreleased = [false, false, false, false, false];
  };
  I.clear = function () { I.keys = {}; I.mouse = [false, false, false, false, false]; I.endFrame(); };
  // after a menu closes: drop edge events and mouse buttons, but keep movement keys that are still physically held
  if (G.save && G.save.data) I.applyBinds(); else bound = new Set(Object.values(B).flat());
  I.softClear = function () { I.mouse = [false, false, false, false, false]; I.endFrame(); };
})();
