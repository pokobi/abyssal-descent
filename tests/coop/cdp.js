'use strict';
// Headless Chrome driven over the DevTools protocol, with a small static file server for the repo. No packages needed (node 22+).
// Sound stays off: --mute-audio, and every page gets the volume saved at 0 before the game reads it.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
exports.serve = function (root, port) {
  const s = http.createServer((q, r) => {
    const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    if (!p.startsWith(root)) { r.writeHead(403); return r.end(); }
    fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(d); } });
  });
  return new Promise((ok) => s.listen(port, '127.0.0.1', () => ok(s)));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.sleep = sleep;
// Drawing: on the real GPU by default. The game moves its clock at most 0.05 s a frame, so on the CPU renderer (SwiftShader,
// about one frame a second with a whole area on screen) game time crawled at a sixteenth of real time and every test that waits
// on the game (a fight, an area, a trial) took many minutes. If the GPU cannot be used, Chrome falls back to SwiftShader by itself
// (--enable-unsafe-swiftshader); ABYSS_SWIFTSHADER=1 forces it (the old behaviour).
const GPU_ARGS = process.env.ABYSS_SWIFTSHADER ? ['--use-angle=swiftshader'] : process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : ['--enable-gpu'];
exports.launch = async function (port) {
  // (a browser left over from an earlier test on this port would answer in place of the new one: its saved runs and its open pages
  // would be this test's. Say so instead of going on with it)
  let old = null; try { old = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { /* free: as it should be */ }
  if (old) throw new Error(`port ${port} is taken: a browser from an earlier test is still running (end it, then run again)`);
  // (folders of this kind left behind by a run that was cut short - stopped, timed out - are taken away when they are some hours old;
  // one a browser still holds is left)
  try { const T = os.tmpdir(), old = Date.now() - 6 * 3600e3; for (const n of fs.readdirSync(T)) if (n.startsWith('abyss-cdp-')) { const q = path.join(T, n); try { if (fs.statSync(q).mtimeMs < old) fs.rmSync(q, { recursive: true, force: true }); } catch (e) { /* in use */ } } } catch (e) { /* nothing to tidy */ }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-cdp-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--mute-audio', '--no-first-run', ...GPU_ARGS, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', '--window-size=480,300', 'about:blank'], { stdio: 'ignore' });
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { /* still starting */ } }
  if (!ver) throw new Error('chrome did not start');
  return {
    async page(url) {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
      let id = 0; const wait = new Map(), errs = [], reqs = [];
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
        // (every address the page asks for, once the test has turned the Network domain on for it)
        if (m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url);
        if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push((d.exception && d.exception.description || d.text).slice(0, 400)); }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning' && process.env.COOP_WARN) console.log('WARN', m.params.args.map((a) => a.value || '').join(' ').slice(0, 400));
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 400));
      };
      const send = (method, params) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
      await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
      // (a page behind the others is never frozen by the browser: a frozen page runs nothing and hears nothing - BroadcastChannel included)
      await send('Page.setWebLifecycleState', { state: 'active' });
      if (process.env.COOP_W) await send('Emulation.setDeviceMetricsOverride', { width: +process.env.COOP_W, height: +process.env.COOP_H, deviceScaleFactor: 1, mobile: false });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{const k='abyssal_descent_save_v1';const d=JSON.parse(localStorage.getItem(k)||'{}');d.settings=Object.assign(d.settings||{},{volume:0});"+(process.env.COOP_HARD?"d.records=d.records||{};d.records.clears={hard:1};":"")+"localStorage.setItem(k,JSON.stringify(d));}catch(e){}" });
      await send('Page.navigate', { url });
      return {
        errs, reqs, send,
        async eval(expr) {
          const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true });
          if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
          return r.result.result.value;
        },
        async until(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { let v = null; try { v = await this.eval(expr); } catch (e) { /* page still loading */ } if (v) return v; await sleep(200); }
          // (a co-op page turned away for another version: a script was changed on disk between the loads of two pages - another hand editing js/ meanwhile -
          // and the test's failure is not the game's. Said so, with what the lobby says)
          let lob = ''; try { lob = await this.eval("(document.getElementById('cl-err') || {}).textContent || ''"); } catch (e) { /* no page */ }
          throw new Error('timeout: ' + expr + (/バージョン/.test(lob || '') ? ' [VERSION MISMATCH: a script changed between page loads - ' + lob + ']' : lob ? ' [lobby: ' + lob + ']' : '')); },
        // The boot is over: the loading screen gone and the game's frames running (game.js boot). The title (G.game.state 'title') is up
        // well before that - its shaders and the faces of the text are still being made, the loading screen still covers it, and no frame
        // has run yet: a player cannot start a run then, and a test that does acts on a game that is not going yet.
        async booted(ms) { await this.until("!!window.G && !!G.game && !!document.getElementById('loading') && document.getElementById('loading').classList.contains('done')", ms || 180000); },
        // A run going: its world built, no area being changed to, its shaders made (_warming), and the page's frames coming (three of
        // them seen). The game state is not asked for unless given (state): on a PC page the run pauses at once, as no pointer lock can
        // be had headless, and the tests put it back to 'playing' themselves.
        async running(state, ms) {
          await this.until(`!!window.G && !!G.game && !!G.game.run && !!G.world && !G.game._warming && !G.game.transitioning${state ? ` && G.game.state === '${state}'` : ''}`, ms || 60000);
          await this.eval('new Promise((r) => { let n = 0; const f = () => (++n >= 3 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })');
        },
        // n more frames of the page (the game draws and reads its input once a frame: whatever was changed is seen after this)
        async frames(n) { await this.eval(`new Promise((r) => { let k = 0; const f = () => (++k >= ${n || 3} ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`); },
        // the game has run for t more seconds of its own time (frames, not the clock: a slow frame of a busy machine takes its time)
        async gameFor(t, ms) {
          const t0 = await this.eval('G.game.time');
          // (looked at every 30 ms, so that it is not overshot by much; a page whose frames hardly come - a GPU shared with other busy
          // browsers - is given a minute)
          try { const T = Date.now(); while (!(await this.eval(`G.game.time >= ${t0} + ${t}`))) { if (Date.now() - T > (ms || 60000)) throw new Error('timeout: ' + t + ' s of game time'); await sleep(30); } } catch (e) {
            throw new Error(`the game's time stood still (${e.message}): ` + await this.eval("JSON.stringify({ state: G.game.state, time: G.game.time, warming: !!G.game._warming, trans: !!G.game.transitioning, hidden: document.hidden, locked: G.input.locked, screens: [...document.querySelectorAll('#screens > *')].map((s) => s.id || s.className).slice(0, 4) })").catch(() => '?'));
          }
        },
        async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
        close() { try { ws.close(); } catch (e) { /* gone */ } return fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {}); },
      };
    },
    // (the browser and all it started are ended first, then its folder is taken away: taken away at once, the folder was still held
    // by the browser's other processes and stayed - some seventy megabytes of it for every run, in the temp folder)
    close() {
      try { if (process.platform === 'win32') require('child_process').spawnSync('taskkill', ['/PID', String(ch.pid), '/T', '/F'], { stdio: 'ignore' }); else ch.kill(); } catch (e) { try { ch.kill(); } catch (e2) { /* gone */ } }
      const nap = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { /* no waiting here */ } };
      for (let i = 0; i < 12; i++) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* still held: again in a moment */ } if (!fs.existsSync(dir)) break; nap(300); }
    },
  };
};
