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
exports.launch = async function (port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abyss-cdp-'));
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--mute-audio', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=480,300', 'about:blank'], { stdio: 'ignore' });
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch (e) { /* still starting */ } }
  if (!ver) throw new Error('chrome did not start');
  return {
    async page(url) {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
      let id = 0; const wait = new Map(), errs = [];
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
        if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push((d.exception && d.exception.description || d.text).slice(0, 400)); }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 400));
      };
      const send = (method, params) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
      await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
      if (process.env.COOP_W) await send('Emulation.setDeviceMetricsOverride', { width: +process.env.COOP_W, height: +process.env.COOP_H, deviceScaleFactor: 1, mobile: false });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{const k='abyssal_descent_save_v1';const d=JSON.parse(localStorage.getItem(k)||'{}');d.settings=Object.assign(d.settings||{},{volume:0});localStorage.setItem(k,JSON.stringify(d));}catch(e){}" });
      await send('Page.navigate', { url });
      return {
        errs,
        async eval(expr) {
          const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true });
          if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
          return r.result.result.value;
        },
        async until(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { let v = null; try { v = await this.eval(expr); } catch (e) { /* page still loading */ } if (v) return v; await sleep(200); } throw new Error('timeout: ' + expr); },
        async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
        close() { try { ws.close(); } catch (e) { /* gone */ } return fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {}); },
      };
    },
    close() { ch.kill(); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* chrome still holds it */ } },
  };
};
