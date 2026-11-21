'use strict';
// The ways into co-op: the solo title's button, an address with ?coop (index.html moves it to coop.html), the invite link a host copies (coop.html?join=CODE,
// also the form of the links already handed out), and the way back to the solo title. Rooms run on the local test line (&local=1): no broker is reached.
//   COOP_PORT=n node tests/coop/entry_test.js
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 8796, ORIGIN = `http://127.0.0.1:${PORT}`;
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const coopReq = (u) => /\/js\/coop\/|peerjs|coop\.html/i.test(u);
const broker = (u) => /peerjs\.com|0\.peerjs/i.test(u);
const SOLO = "typeof G.Coop === 'undefined' && typeof Peer === 'undefined' && typeof CoopNet === 'undefined' && typeof COOP_VER === 'undefined' && !document.getElementById('coop-lobby')"
  + " && ['getItem', 'setItem', 'removeItem'].every((k) => /\\[native code\\]/.test(Storage.prototype[k].toString()))";
const LOBBY = "window.G && G.Coop && G.game && G.game.state === 'title' && !!document.getElementById('cl-host') && !!document.getElementById('cl-solo')";
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const open = async (url) => { const p = await ch.page('about:blank'); await p.send('Network.enable'); await p.send('Page.navigate', { url }); return p; };
  // (the lobby's name box and room code box are filled the way a player does, then its button is pressed)
  const press = (p, id, name, code) => p.eval(`(() => { const n = document.getElementById('cl-name'); if (n) n.value = ${JSON.stringify(name)};`
    + (code ? ` document.getElementById('cl-code').value = ${JSON.stringify(code)};` : '') + ` document.getElementById('${id}').click(); return 1; })()`);
  try {
    // ---- 1. the solo title has the way in; pressing it opens the co-op lobby ----
    const s = await open(ORIGIN + '/index.html');
    await s.until("window.G && G.game && G.game.state === 'title'", 90000);
    await s.booted();
    check(await s.eval(SOLO) && !s.reqs.some(coopReq), 'the solo page has nothing of co-op in it and asked for none of it');
    const btn = await s.eval(`(() => { const b = document.getElementById('t-mp'); if (!b) return null; const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const over = [...document.querySelectorAll('.title-menu .btn')].filter((o) => o !== b).some((o) => { const q = o.getBoundingClientRect(); return q.x < r.right && r.x < q.right && q.y < r.bottom && r.y < q.bottom; });
      return { text: b.textContent, w: r.width, h: r.height, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, top: !!hit && (hit === b || b.contains(hit)), over }; })()`);
    console.log('button', JSON.stringify(btn));
    check(!!btn && /協力プレイ/.test(btn.text) && btn.inView && btn.top && !btn.over && btn.h >= 28, 'the solo title shows a 協力プレイ button, on screen, not covered, not over another button');
    await s.eval("document.getElementById('t-mp').click(); 1");
    await s.until(`location.pathname === '/coop.html' && ${LOBBY}`, 90000);
    await s.booted();
    check(true, 'the button opened the co-op lobby (coop.html)');
    check(!s.reqs.some(broker), 'the lobby reached no broker before a room was asked for');
    // ---- 2. the co-op lobby goes back to the solo title, and that page has nothing of co-op ----
    const n0 = s.reqs.length;
    await s.eval("document.getElementById('cl-solo').click(); 1");
    await s.until("location.pathname === '/index.html' && window.G && G.game && G.game.state === 'title'", 90000);
    await s.booted();
    check(await s.eval(SOLO), 'back on the solo title: no co-op code, no lobby, Storage not wrapped');
    check(!s.reqs.slice(n0).some(coopReq), 'the solo page after the lobby asked for nothing of co-op ' + s.reqs.slice(n0).filter(coopReq).slice(0, 3).join(' '));
    s.close();
    // ---- 3. a room made from an index.html?coop address ----
    // (what index.html had run when it was left: noted in the tab's sessionStorage, which the move keeps. The browser's look-ahead may
    // already be fetching the files named further down - only fetched, never run, as the rest of the page is turned to text)
    const h = await ch.page('about:blank'); await h.send('Network.enable');
    await h.send('Page.addScriptToEvaluateOnNewDocument', { source: "if (location.pathname === '/index.html' && /coop/.test(location.search)) { const f = () => { try { sessionStorage.setItem('wy_pre', JSON.stringify({ G: typeof window.G, THREE: typeof window.THREE, scripts: document.scripts.length })); } catch (e) {} }; document.addEventListener('DOMContentLoaded', f); addEventListener('pagehide', f); }" });
    await h.send('Page.navigate', { url: ORIGIN + '/index.html?coop&local=1' });
    await h.until(`location.pathname === '/coop.html' && ${LOBBY}`, 90000);
    check(await h.eval("location.search === '?coop&local=1'"), 'index.html?coop moved to coop.html with its query');
    const k = h.reqs.findIndex((u) => /\/coop\.html/.test(u)), early = h.reqs.slice(0, k).filter((u) => !/\/index\.html\?coop/.test(u));
    console.log('fetched ahead before the move (not run)', early.length);
    const pre = await h.eval("sessionStorage.getItem('wy_pre')");
    console.log('index.html when it was left', pre);
    check(k > 0 && !!pre && JSON.parse(pre).G === 'undefined' && JSON.parse(pre).THREE === 'undefined' && JSON.parse(pre).scripts === 1, 'index.html?coop ran none of the solo game before the move to coop.html');
    await h.booted();
    await press(h, 'cl-host', 'Host');
    await h.until("G.Coop.role === 'host' && !!G.Coop.code && !!document.getElementById('cl-link')", 30000);
    const code = await h.eval('G.Coop.code');
    await h.eval("Object.defineProperty(navigator, 'clipboard', { value: { writeText: (u) => { window.__link = u; return Promise.resolve(); } }, configurable: true }); document.getElementById('cl-link').click(); 1");
    const link = await h.until('window.__link', 5000);
    console.log('invite link', link);
    check(link === `${ORIGIN}/coop.html?join=${code}`, 'the invite link is coop.html?join=CODE');
    // ---- 4. guests: the invite link as it is (the old form too), and an index.html?coop&join= address ----
    const g1 = await open(link + '&local=1');
    await g1.until(`${LOBBY} && document.getElementById('cl-code').value === '${code}'`, 90000);
    await g1.booted();
    await press(g1, 'cl-join', 'Guest1', code);
    await g1.until('G.Coop.id >= 1', 60000);
    check(true, 'a guest came in by the invite link (coop.html?join=)');
    const g2 = await open(`${ORIGIN}/index.html?coop&join=${code}&local=1`);
    await g2.until(`location.pathname === '/coop.html' && ${LOBBY} && document.getElementById('cl-code').value === '${code}'`, 90000);
    await g2.booted();
    await press(g2, 'cl-join', 'Guest2', code);
    await g2.until('G.Coop.id >= 1', 60000);
    await h.until('G.Coop.players.size === 3', 20000).catch(() => 0);
    check(await h.eval('G.Coop.players.size') === 3, 'a guest came in by index.html?coop&join=; the room has 3');
    // ---- 5. a guest leaves the room, then goes back to solo from the lobby ----
    await g2.eval('G.Coop.quit(); 1');
    await g2.until(`location.pathname === '/coop.html' && location.search.indexOf('room') < 0 && ${LOBBY}`, 90000);
    await g2.booted();
    const n2 = g2.reqs.length;
    await g2.eval("document.getElementById('cl-solo').click(); 1");
    await g2.until("location.pathname === '/index.html' && window.G && G.game && G.game.state === 'title'", 90000);
    await g2.booted();
    check(await g2.eval(SOLO) && !g2.reqs.slice(n2).some(coopReq), 'out of the room, back to solo: nothing of co-op on the solo page');
    const errs = [s, h, g1, g2].map((p) => p.errs).flat().filter((e) => !/peerjs|cdn\.jsdelivr/i.test(e));
    check(!errs.length, 'no errors on any page ' + errs.slice(0, 3).join(' | '));
    check(!h.reqs.concat(g1.reqs, g2.reqs).some(broker), 'no broker reached (the local line only)');
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nENTRY TEST FAILED (${fails.length})` : '\nENTRY TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
