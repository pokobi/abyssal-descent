'use strict';
// ---------------------------------------------------------------------------------------------------------------------------
// Performance monitor - a TEMPORARY diagnostic. It is OFF by default and never shown during normal play.
//   F8 (or opening the page with ?perf=1) toggles the small panel; F7 copies a text report (spikes + averages) to the clipboard.
// It records, for every frame, the real frame interval and how much of it was spent where (game update per system, drawing, HUD,
// the GPU's own time for the world), and logs every "spike" (a frame that took noticeably longer than usual) with its likely cause.
// A spike is the interval from one frame's start to the next: it is laid to the frame that started it (its JS, its GPU time, the
// browser's own record of that frame), not to the frame after it.
//   JS(system) ......... our code in that frame was slow (the game update, the draw calls, a shader made on the spot)
//   GC ................. the JS heap shrank = a garbage-collection pause
//   画面（HTML） ........ the page's style / layout / paint took it (the browser's Long Animation Frames record)
//   GPU ................ the GPU's own work on the world took it (a timer query)
//   ブラウザ待ち ......... none of these: the browser / compositor / the driver / another program held the frame back
// Removing this feature later = delete js/perfmon.js and its <script> line; nothing else depends on it.
// ---------------------------------------------------------------------------------------------------------------------------
(function () {
  const PF = (G.Perf = { on: false, spikes: [], frames: 0 });
  const now = () => performance.now();
  const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
  const MB = 1048576;
  let panel = null, prevNow = 0, t0 = 0, hist = [], lastHeap = 0, allocB = 0, gcN = 0, longTasks = [], loafs = [];
  let wrapped = [], sinceUi = 0, startT = 0, longObs = null, loafObs = null;
  let cur = null, last = null; // this frame / the one before: { start, js, phases, gpu, calls, tris }
  let lastCalls = 0, lastTris = 0;
  // the GPU's time for the world (EXT_disjoint_timer_query_webgl2: results come a few frames later)
  let gl = null, tq = null, pendingQ = [], gpuHist = [];

  // which functions to time (wrapped only while the panel is on, so normal play pays nothing)
  function targets() {
    const T = [];
    const add = (name, o, f) => { if (o && typeof o[f] === 'function') T.push([name, o, f]); };
    add('player', G.player, 'update'); add('weapons', G.weapons, 'update'); add('abilities', G.abilities, 'update');
    add('enemies', G.enemies, 'update'); add('bosses', G.bosses, 'update'); add('combat', G.combat, 'update');
    add('fields', G.Fields, 'update'); add('areas', G.Areas, 'update'); add('depth', G.Depth, 'update');
    add('pstatus', G.PStatus, 'update'); add('hudx', G.HudX, 'update'); add('lights', G.LightPool, 'update'); add('fx', G.fx, 'update');
    add('HUD', G.ui, 'update'); add('itemanim', G.ItemAnim, 'update'); add('avatar', G.avatar, 'update'); add('inventoryUI', G.InvUI, 'refresh');
    add('描画:viewmodel', G.weapons, 'render');
    return T;
  }
  function wrapAll() {
    for (const [name, o, f] of targets()) {
      const orig = o[f]; if (orig._pf) continue;
      const w = function (...a) { const t = now(); try { return orig.apply(this, a); } finally { if (cur) cur.phases[name] = (cur.phases[name] || 0) + now() - t; } };
      w._pf = orig; o[f] = w; wrapped.push([o, f, orig]);
    }
    // the renderer: its time, the draw calls and triangles of every pass in the frame (the world, then the weapon in hand), the GPU's time for the world
    const R = G.renderer;
    if (R && !R.render._pf) {
      const orig = R.render;
      try { gl = R.getContext(); tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { tq = null; }
      const w = function (sc, cam) {
        const t = now(), world = sc === G.scene;
        let q = null;
        if (tq && world && cur && !cur.q) { try { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); cur.q = q; } catch (e) { q = null; } }
        try { return orig.call(this, sc, cam); } finally {
          if (q) { try { gl.endQuery(tq.TIME_ELAPSED_EXT); pendingQ.push([q, cur]); } catch (e) { /* ignore */ } }
          if (cur) { const k = world ? '描画:world' : '描画:その他'; cur.phases[k] = (cur.phases[k] || 0) + now() - t; cur.calls += R.info.render.calls; cur.tris += R.info.render.triangles; }
        }
      };
      w._pf = orig; R.render = w; wrapped.push([R, 'render', orig]);
    }
  }
  function unwrapAll() { for (const [o, f, orig] of wrapped) o[f] = orig; wrapped = []; for (const [q] of pendingQ) { try { gl.deleteQuery(q); } catch (e) { /* ignore */ } } pendingQ = []; }
  function pollGpu() {
    if (!tq || !pendingQ.length) return;
    let disjoint = false; try { disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT); } catch (e) { /* ignore */ }
    for (let i = 0; i < pendingQ.length; i++) {
      const [q, f] = pendingQ[i];
      let ready = false; try { ready = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); } catch (e) { ready = true; }
      if (!ready) continue;
      if (!disjoint) { try { f.gpu = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gpuHist.push(f.gpu); if (gpuHist.length > 600) gpuHist.shift(); } catch (e) { /* ignore */ } }
      try { gl.deleteQuery(q); } catch (e) { /* ignore */ }
      pendingQ.splice(i--, 1);
    }
  }

  // free-text events (pointer-lock timing, shader preparation ...) are kept with the spikes so the report shows what happened when
  PF.notes = [];
  PF.note = function (text) { PF.notes.push({ at: now(), text }); if (PF.notes.length > 80) PF.notes.shift(); };
  PF.begin = function (ts) {
    const interval = prevNow ? ts - prevNow : 0; prevNow = ts;
    pollGpu();
    // heap: a drop of more than ~1MB since the last frame = a collection happened in the interval just ended
    const h = mem(); let gc = false;
    if (h && lastHeap) { if (h < lastHeap - MB) { gcN++; gc = true; } else if (h > lastHeap) allocB += h - lastHeap; }
    lastHeap = h;
    // the interval just ended belongs to the frame that started it (cur, about to become `last`)
    if (cur) judge(cur, interval, gc);
    last = cur;
    if (last) { lastCalls = last.calls; lastTris = last.tris; }
    cur = { start: now(), js: 0, phases: {}, gpu: null, calls: 0, tris: 0, q: null };
    t0 = cur.start;
  };
  PF.end = function () {
    if (!cur) return;
    cur.js = now() - t0;
    PF.frames++;
    sinceUi += cur.js;
    if (sinceUi > 0 && now() - (PF._drawT || 0) > 500) { PF._drawT = now(); sinceUi = 0; draw(); }
  };
  function judge(f, iv, gc) {
    if (iv > 0 && iv < 1000) hist.push([iv, f.js]);
    if (hist.length > 600) hist.shift();
    // spike = clearly slower than the recent median, or just slow in absolute terms
    if (hist.length <= 30 || !(iv > 0)) return;
    const med = median(hist.map((x) => x[0]));
    if (!(iv > Math.max(26, med * 1.7) && iv < 5000)) return;
    let top = '', tv = 0;
    for (const k in f.phases) if (f.phases[k] > tv) { tv = f.phases[k]; top = k; }
    const G_ = G.game;
    PF.spikes.push({ at: f.start, iv, js: f.js, gc, top, topMs: tv, frame: f, st: G_ ? G_.state : '', area: G_ ? G_.area : 0, field: G.world ? G.world.field || G.world.biome || '' : '', enemies: G.enemies ? G.enemies.list.filter((e) => e.alive).length : 0 });
    if (PF.spikes.length > 300) PF.spikes.shift();
  }
  // the browser's own record of the frame (Long Animation Frames, Chrome 123+): its script time and its style / layout time
  function loafOf(k) {
    let best = null;
    for (const l of loafs) if (l.end > k.at - 4 && l.start < k.at + k.iv + 4) { if (!best || l.dur > best.dur) best = l; }
    return best;
  }
  function causeOf(k) {
    const gpu = k.frame && k.frame.gpu, lf = loafOf(k);
    if (k.gc) return 'GC（メモリ回収）';
    if (k.js > k.iv * 0.5) return `JS ${k.top || '?'} ${k.topMs.toFixed(1)}ms`;
    if (lf && lf.styleLayout > Math.max(12, k.iv * 0.3)) return `画面（HTML）の配置・描画 ${Math.round(lf.styleLayout)}ms`;
    if (lf && lf.script > k.iv * 0.5) return `JS（フレームの外）${Math.round(lf.script)}ms ${lf.who || ''}`;
    if (gpu != null && gpu > k.iv * 0.5) return `GPU ${gpu.toFixed(1)}ms`;
    return `ブラウザ待ち（JS ${k.js.toFixed(1)}ms${gpu != null ? '・GPU ' + gpu.toFixed(1) + 'ms' : ''}${lf ? '・HTML ' + Math.round(lf.styleLayout) + 'ms' : ''}）`;
  }

  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1] || 0; };
  const rel = (at) => (at - startT) / 1000;
  function stats() {
    const ivs = hist.map((x) => x[0]).filter((x) => x > 0), n = ivs.length;
    if (!n) return null;
    const sorted = ivs.slice().sort((a, b) => a - b), avg = ivs.reduce((a, b) => a + b, 0) / n;
    const worst1 = sorted.slice(Math.floor(n * 0.99));
    const low1 = 1000 / (worst1.reduce((a, b) => a + b, 0) / worst1.length);
    const R = G.renderer ? G.renderer.info : null;
    const secs = Math.max(1, (now() - startT) / 1000);
    const gs = gpuHist.slice().sort((a, b) => a - b);
    return { fps: 1000 / avg, avg, p50: sorted[n >> 1], p99: sorted[Math.floor(n * 0.99)], max: sorted[n - 1], low1, js: hist.reduce((a, b) => a + b[1], 0) / n, heap: mem() / MB, alloc: allocB / MB / secs, gcPerMin: gcN / (secs / 60), calls: lastCalls, tris: lastTris, geoms: R ? R.memory.geometries : 0, tex: R ? R.memory.textures : 0,
      gpu: gs.length ? gs.reduce((a, b) => a + b, 0) / gs.length : null, gpu95: gs.length ? gs[Math.floor(gs.length * 0.95)] : null, gpuOk: !!tq };
  }
  const gpuTxt = (s) => (s.gpu != null ? `GPU ${s.gpu.toFixed(1)}ms (95%: ${s.gpu95.toFixed(1)})` : s.gpuOk ? 'GPU 計測待ち' : 'GPU 計測不可');
  function draw() {
    if (!panel) return;
    const s = stats(); if (!s) return;
    const col = (v, a, b) => (v < a ? '#7be07b' : v < b ? '#f0c050' : '#ff6a5a');
    const rows = PF.spikes.slice(-6).reverse().map((k) => { const c = causeOf(k); return `<div style="color:${c.startsWith('GC') ? '#9ad' : c.startsWith('JS') ? '#fc8' : c.startsWith('GPU') ? '#c9f' : c.startsWith('画面') ? '#8df' : '#f99'}">${rel(k.at).toFixed(1)}s ${k.iv.toFixed(1)}ms ${c}</div>`; }).join('');
    panel.innerHTML = `<b style="color:${col(1000 / s.fps, 17, 25)}">${s.fps.toFixed(0)} fps</b>  平均${s.avg.toFixed(1)}ms  中央${s.p50.toFixed(1)}  99%:${s.p99.toFixed(1)}  最大${s.max.toFixed(0)}<br>`
      + `1%low <b style="color:${col(1000 / s.low1, 22, 34)}">${s.low1.toFixed(0)}fps</b>  JS ${s.js.toFixed(1)}ms/frame  ${gpuTxt(s)}<br>`
      + `ヒープ ${s.heap.toFixed(0)}MB  生成 <b style="color:${col(s.alloc, 8, 20)}">${s.alloc.toFixed(1)}MB/s</b>  GC ${s.gcPerMin.toFixed(0)}回/分<br>`
      + `描画 ${s.calls}回  ${(s.tris / 1000).toFixed(0)}k tri（1フレーム全体）  geo${s.geoms} tex${s.tex}<br>`
      + `<span style="opacity:.7">スパイク(${PF.spikes.length}) F7:コピー F8:閉じる</span>${rows}`;
  }
  PF.report = function () {
    const s = stats();
    const L = [`ABYSSAL DESCENT perf report  ${new Date().toISOString()}`, `UA: ${navigator.userAgent}`, `screen ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} quality ${G.save.data.settings.quality} canvas ${G.renderer ? G.renderer.domElement.width + 'x' + G.renderer.domElement.height : '-'}`];
    try { const g2 = G.renderer.getContext(), e = g2.getExtension('WEBGL_debug_renderer_info'); if (e) L.push('GPU: ' + g2.getParameter(e.UNMASKED_RENDERER_WEBGL)); } catch (e) { /* ignore */ }
    if (s) L.push(`fps ${s.fps.toFixed(1)} avg ${s.avg.toFixed(1)}ms p50 ${s.p50.toFixed(1)} p99 ${s.p99.toFixed(1)} max ${s.max.toFixed(0)} 1%low ${s.low1.toFixed(0)}fps js ${s.js.toFixed(1)}ms ${s.gpu != null ? `gpu ${s.gpu.toFixed(1)}ms gpu95 ${s.gpu95.toFixed(1)}ms` : s.gpuOk ? 'gpu -' : 'gpu n/a'} heap ${s.heap.toFixed(0)}MB alloc ${s.alloc.toFixed(1)}MB/s gc ${s.gcPerMin.toFixed(0)}/min calls ${s.calls} tris ${s.tris} (whole frame)`);
    L.push(`spikes ${PF.spikes.length}  longtasks ${longTasks.length}  long frames ${loafs.length}${loafObs ? '' : ' (n/a)'}  (time = when the slow frame began, from the start of the measurement)`);
    for (const k of PF.spikes.slice(-60)) L.push(`${rel(k.at).toFixed(1)}s  ${k.iv.toFixed(1)}ms (js ${k.js.toFixed(1)}${k.frame && k.frame.gpu != null ? ' gpu ' + k.frame.gpu.toFixed(1) : ''})  ${causeOf(k)}  state=${k.st} area=${k.area} ${k.field} enemies=${k.enemies}`);
    if (PF.notes.length) L.push('events: ' + PF.notes.slice(-30).map((n) => `${n.at < startT ? '計測前' : rel(n.at).toFixed(1) + 's'} ${n.text}`).join(' | '));
    if (longTasks.length) L.push('long tasks: ' + longTasks.slice(-20).map((x) => `${rel(x.start).toFixed(1)}s:${x.d}ms`).join(' '));
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
    PF.on = true; prevNow = 0; hist = []; allocB = 0; gcN = 0; PF.spikes = []; startT = now(); lastHeap = mem(); cur = null; last = null; gpuHist = []; loafs = []; longTasks = [];
    wrapAll();
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'perf-panel';
      panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;font:11px/1.45 ui-monospace,Consolas,monospace;color:#e8e8e8;background:rgba(0,0,0,0.72);border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:6px 9px;pointer-events:none;white-space:nowrap;max-width:46vw;overflow:hidden';
      document.body.appendChild(panel);
    }
    panel.style.display = ''; panel.textContent = '計測中…';
    try { longObs = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push({ start: e.startTime, d: Math.round(e.duration) }); if (longTasks.length > 100) longTasks.splice(0, longTasks.length - 100); }); longObs.observe({ entryTypes: ['longtask'] }); } catch (e) { longObs = null; }
    try {
      loafObs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const sc = e.scripts || [], top = sc.slice().sort((a, b) => b.duration - a.duration)[0];
          loafs.push({ start: e.startTime, end: e.startTime + e.duration, dur: e.duration, script: sc.reduce((a, x) => a + x.duration, 0), styleLayout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, who: top ? `${top.invoker || ''} ${top.sourceFunctionName || ''}`.trim() : '' });
        }
        if (loafs.length > 300) loafs.splice(0, loafs.length - 300);
      });
      loafObs.observe({ type: 'long-animation-frame' });
    } catch (e) { loafObs = null; }
  };
  PF.disable = function () {
    if (!PF.on) return;
    PF.on = false; unwrapAll(); if (panel) panel.style.display = 'none';
    if (longObs) { longObs.disconnect(); longObs = null; }
    if (loafObs) { loafObs.disconnect(); loafObs = null; }
    cur = null; last = null;
  };
  PF.toggle = () => (PF.on ? PF.disable() : PF.enable());
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F8') { e.preventDefault(); PF.toggle(); }
    else if (e.code === 'F7' && PF.on) { e.preventDefault(); PF.copy(); }
  }, true);
  if (/[?&]perf=1/.test(location.search)) window.addEventListener('load', () => setTimeout(PF.enable, 1500));
})();
