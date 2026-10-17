'use strict';
// ---------------------------------------------------------------------------------------------------------------------------
// Performance monitor - a TEMPORARY diagnostic. It is OFF by default and never shown during normal play.
//   F8 (or opening the page with ?perf=1) toggles the small panel; F7 copies a text report (spikes + averages) to the clipboard.
// It records, for every frame, the real frame interval and how much of it was spent where (game update per system, drawing, HUD),
// and logs every "spike" (a frame that took noticeably longer than usual) with its most likely cause:
//   JS(system) .... one of our systems was slow         GC .... the JS heap shrank = a garbage-collection pause
//   描画待ち/ブラウザ . the page's own code was fast but the frame was late (GPU / compositor / the browser itself)
// Removing this feature later = delete js/perfmon.js and its <script> line; nothing else depends on it.
// ---------------------------------------------------------------------------------------------------------------------------
(function () {
  const PF = (G.Perf = { on: false, spikes: [], frames: 0 });
  const now = () => performance.now();
  const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  const MB = 1048576;
  let panel = null, prevNow = 0, t0 = 0, phases = {}, hist = [], lastHeap = 0, allocB = 0, gcN = 0, gcFrame = false, longTasks = [];
  let wrapped = [], sinceUi = 0, startT = 0, longObs = null;

  // which functions to time (wrapped only while the panel is on, so normal play pays nothing)
  function targets() {
    const T = [];
    const add = (name, o, f) => { if (o && typeof o[f] === 'function') T.push([name, o, f]); };
    add('player', G.player, 'update'); add('weapons', G.weapons, 'update'); add('abilities', G.abilities, 'update');
    add('enemies', G.enemies, 'update'); add('bosses', G.bosses, 'update'); add('combat', G.combat, 'update');
    add('fields', G.Fields, 'update'); add('areas', G.Areas, 'update'); add('depth', G.Depth, 'update');
    add('pstatus', G.PStatus, 'update'); add('hudx', G.HudX, 'update'); add('lights', G.LightPool, 'update'); add('fx', G.fx, 'update');
    add('HUD', G.ui, 'update'); add('itemanim', G.ItemAnim, 'update'); add('avatar', G.avatar, 'update'); add('inventoryUI', G.InvUI, 'refresh');
    add('描画:world', G.renderer, 'render'); add('描画:viewmodel', G.weapons, 'render');
    return T;
  }
  function wrapAll() {
    for (const [name, o, f] of targets()) {
      const orig = o[f]; if (orig._pf) continue;
      const w = function (...a) { const t = now(); try { return orig.apply(this, a); } finally { phases[name] = (phases[name] || 0) + now() - t; } };
      w._pf = orig; o[f] = w; wrapped.push([o, f, orig]);
    }
  }
  function unwrapAll() { for (const [o, f, orig] of wrapped) o[f] = orig; wrapped = []; }

  PF.begin = function (ts) {
    const interval = prevNow ? ts - prevNow : 0; prevNow = ts;
    PF._interval = interval; t0 = now(); phases = {};
    // heap: a drop of more than ~1MB between frames = a collection happened
    const h = mem(); gcFrame = false;
    if (h && lastHeap) { if (h < lastHeap - MB) { gcN++; gcFrame = true; } else if (h > lastHeap) allocB += h - lastHeap; }
    lastHeap = h;
  };
  PF.end = function () {
    const js = now() - t0, iv = PF._interval;
    PF.frames++;
    if (iv > 0 && iv < 1000) hist.push([iv, js]);
    if (hist.length > 600) hist.shift();
    // spike = clearly slower than the recent median, or just slow in absolute terms
    if (hist.length > 30 && iv > 0) {
      const med = median(hist.map((x) => x[0]));
      if (iv > Math.max(26, med * 1.7) && iv < 5000) {
        let top = '', tv = 0;
        for (const k in phases) if (phases[k] > tv) { tv = phases[k]; top = k; }
        let cause;
        if (gcFrame) cause = 'GC（メモリ回収）';
        else if (js > iv * 0.6) cause = `JS ${top || '?'} ${tv.toFixed(1)}ms`;
        else cause = `描画待ち/ブラウザ（JSは${js.toFixed(1)}msだけ）`;
        const G_ = G.game;
        PF.spikes.push({ t: +((now() - startT) / 1000).toFixed(1), iv: +iv.toFixed(1), js: +js.toFixed(1), cause, top: top ? `${top} ${tv.toFixed(1)}` : '', st: G_ ? G_.state : '', area: G_ ? G_.area : 0, field: G.world ? G.world.field || '' : '', enemies: G.enemies ? G.enemies.list.length : 0 });
        if (PF.spikes.length > 300) PF.spikes.shift();
      }
    }
    sinceUi += iv;
    if (sinceUi > 500) { sinceUi = 0; draw(); }
  };

  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1] || 0; };
  function stats() {
    const ivs = hist.map((x) => x[0]).filter((x) => x > 0), n = ivs.length;
    if (!n) return null;
    const sorted = ivs.slice().sort((a, b) => a - b), avg = ivs.reduce((a, b) => a + b, 0) / n;
    const worst1 = sorted.slice(Math.floor(n * 0.99));
    const low1 = 1000 / (worst1.reduce((a, b) => a + b, 0) / worst1.length);
    const R = G.renderer ? G.renderer.info : null;
    const secs = Math.max(1, (now() - startT) / 1000);
    return { fps: 1000 / avg, avg, p50: sorted[n >> 1], p99: sorted[Math.floor(n * 0.99)], max: sorted[n - 1], low1, js: hist.reduce((a, b) => a + b[1], 0) / n, heap: mem() / MB, alloc: allocB / MB / secs, gcPerMin: gcN / (secs / 60), calls: R ? R.render.calls : 0, tris: R ? R.render.triangles : 0, geoms: R ? R.memory.geometries : 0, tex: R ? R.memory.textures : 0 };
  }
  function draw() {
    if (!panel) return;
    const s = stats(); if (!s) return;
    const col = (v, a, b) => (v < a ? '#7be07b' : v < b ? '#f0c050' : '#ff6a5a');
    const rows = PF.spikes.slice(-6).reverse().map((k) => `<div style="color:${k.cause.startsWith('GC') ? '#9ad' : k.cause.startsWith('JS') ? '#fc8' : '#f99'}">${k.t}s ${k.iv}ms ${k.cause}${k.top && !k.cause.startsWith('JS') ? ' ·' + k.top : ''}</div>`).join('');
    panel.innerHTML = `<b style="color:${col(1000 / s.fps, 17, 25)}">${s.fps.toFixed(0)} fps</b>  平均${s.avg.toFixed(1)}ms  中央${s.p50.toFixed(1)}  99%:${s.p99.toFixed(1)}  最大${s.max.toFixed(0)}<br>`
      + `1%low <b style="color:${col(1000 / s.low1, 22, 34)}">${s.low1.toFixed(0)}fps</b>  JS ${s.js.toFixed(1)}ms/frame<br>`
      + `ヒープ ${s.heap.toFixed(0)}MB  生成 <b style="color:${col(s.alloc, 8, 20)}">${s.alloc.toFixed(1)}MB/s</b>  GC ${s.gcPerMin.toFixed(0)}回/分<br>`
      + `描画 ${s.calls}回  ${(s.tris / 1000).toFixed(0)}k tri  geo${s.geoms} tex${s.tex}<br>`
      + `<span style="opacity:.7">スパイク(${PF.spikes.length}) F7:コピー F8:閉じる</span>${rows}`;
  }
  PF.report = function () {
    const s = stats();
    const L = [`ABYSSAL DESCENT perf report  ${new Date().toISOString()}`, `UA: ${navigator.userAgent}`, `screen ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} quality ${G.save.data.settings.quality}`];
    try { const gl = G.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); if (e) L.push('GPU: ' + gl.getParameter(e.UNMASKED_RENDERER_WEBGL)); } catch (e) { /* ignore */ }
    if (s) L.push(`fps ${s.fps.toFixed(1)} avg ${s.avg.toFixed(1)}ms p50 ${s.p50.toFixed(1)} p99 ${s.p99.toFixed(1)} max ${s.max.toFixed(0)} 1%low ${s.low1.toFixed(0)}fps js ${s.js.toFixed(1)}ms heap ${s.heap.toFixed(0)}MB alloc ${s.alloc.toFixed(1)}MB/s gc ${s.gcPerMin.toFixed(0)}/min calls ${s.calls} tris ${s.tris}`);
    L.push(`spikes ${PF.spikes.length}  longtasks ${longTasks.length}`);
    for (const k of PF.spikes.slice(-60)) L.push(`${k.t}s  ${k.iv}ms (js ${k.js})  ${k.cause}  state=${k.st} area=${k.area} ${k.field} enemies=${k.enemies}`);
    if (longTasks.length) L.push('long tasks: ' + longTasks.slice(-20).map((x) => `${x.t}s:${x.d}ms`).join(' '));
    return L.join('\n');
  };
  PF.copy = function () {
    const text = PF.report();
    console.log(text);
    const ok = () => { if (G.ui && G.ui.toastSmall) G.ui.toastSmall('📋 計測レポートをコピーした'); };
    try { navigator.clipboard.writeText(text).then(ok, () => fallback(text)); } catch (e) { fallback(text); }
  };
  function fallback(text) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); if (G.ui && G.ui.toastSmall) G.ui.toastSmall('📋 計測レポートをコピーした'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  PF.enable = function () {
    if (PF.on) return;
    PF.on = true; prevNow = 0; hist = []; allocB = 0; gcN = 0; PF.spikes = []; startT = now(); lastHeap = mem();
    wrapAll();
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'perf-panel';
      panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;font:11px/1.45 ui-monospace,Consolas,monospace;color:#e8e8e8;background:rgba(0,0,0,0.72);border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:6px 9px;pointer-events:none;white-space:nowrap;max-width:46vw;overflow:hidden';
      document.body.appendChild(panel);
    }
    panel.style.display = ''; panel.textContent = '計測中…';
    try { longObs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push({ t: +((e.startTime - 0) / 1000).toFixed(1), d: Math.round(e.duration) }); if (longTasks.length > 100) longTasks.shift(); }); longObs.observe({ entryTypes: ['longtask'] }); } catch (e) { longObs = null; }
  };
  PF.disable = function () {
    if (!PF.on) return;
    PF.on = false; unwrapAll(); if (panel) panel.style.display = 'none'; if (longObs) { longObs.disconnect(); longObs = null; }
  };
  PF.toggle = () => (PF.on ? PF.disable() : PF.enable());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F8') { e.preventDefault(); PF.toggle(); }
    else if (e.code === 'F7' && PF.on) { e.preventDefault(); PF.copy(); }
  }, true);
  if (/[?&]perf=1/.test(location.search)) window.addEventListener('load', () => setTimeout(PF.enable, 1500));
})();
