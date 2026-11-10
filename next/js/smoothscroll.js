'use strict';
// Smooth wheel scrolling for every scrollable area of the game's screens (menus, inventory, status sheet, codex, lists ...).
// The browser moves a list in hard steps of about 100 px per wheel notch; here each notch only sets a goal and the list glides to it.
// Only the scroll position is touched (so the screens' own remembering of scroll positions keeps working), and only while the pointer is over
// something that can still scroll that way: everything else (the game's own wheel use, pinch zoom) is left alone.
(function () {
  const SS = (G.SmoothScroll = {});
  const RATE = 16; // how fast the list closes on its goal (per second); higher = snappier
  const st = new Map(); // element -> { goal, pos }
  let raf = 0, last = 0;

  const canScroll = (el, dy) => {
    if (el.nodeType !== 1 || el === document.body || el === document.documentElement) return false;
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowY)) return false;
    const max = el.scrollHeight - el.clientHeight;
    if (max < 2) return false;
    return dy > 0 ? el.scrollTop < max - 1 : el.scrollTop > 1;
  };
  const find = (el, dy) => { for (; el && el !== document.body; el = el.parentElement) if (canScroll(el, dy)) return el; return null; };
  const maxOf = (el) => Math.max(0, el.scrollHeight - el.clientHeight);

  function tick(t) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000)); last = t;
    const k = 1 - Math.exp(-RATE * dt);
    for (const [el, s] of st) {
      if (!el.isConnected) { st.delete(el); continue; }
      // something else moved it (a rebuilt screen putting the position back, a dragged scrollbar, the keyboard): the glide ends, it does not fight that
      if (Math.abs(el.scrollTop - Math.round(s.pos)) > 2) { st.delete(el); continue; }
      s.pos += (s.goal - s.pos) * k;
      if (Math.abs(s.goal - s.pos) < 0.6) { el.scrollTop = s.goal; st.delete(el); continue; }
      el.scrollTop = s.pos;
    }
    if (st.size) raf = requestAnimationFrame(tick);
  }
  // move an element's scroll position by dy pixels, smoothly
  SS.by = function (el, dy) {
    const max = maxOf(el); let s = st.get(el);
    if (!s) { s = { pos: el.scrollTop, goal: el.scrollTop }; st.set(el, s); }
    s.goal = Math.min(max, Math.max(0, s.goal + dy));
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  };
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const el = find(e.target, e.deltaY); if (!el) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientHeight * 0.9 : 1);
    e.preventDefault(); e.stopPropagation();
    // a trackpad already sends many small steps: those are applied as they come; a wheel notch (a big step) is the one that is eased
    if (Math.abs(dy) < 40 && !st.has(el)) { el.scrollTop += dy; return; }
    SS.by(el, dy);
  }, { passive: false, capture: true });
})();
