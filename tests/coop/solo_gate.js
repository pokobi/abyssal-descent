'use strict';
// The solo game's gate: run before every merge of co-op work. Exit code 0 = solo is untouched and still plays.
//   node tests/coop/solo_gate.js [seconds of bot play, default 45]      (COOP_PORT=n: its server on n, its browser on n + 1000)
// What the solo page (index.html with no ?coop in its address) must never do: ask for any of js/coop/ or PeerJS, wrap the browser's Storage,
// or have co-op code in it. And a co-op run, played in the same browser, must leave the solo save (settings, records) exactly as it was.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 8790, CDP = process.env.COOP_PORT ? PORT + 1000 : 9333, ORIGIN = `http://127.0.0.1:${PORT}`;
const KEY = 'abyssal_descent_save_v1', OWN = 'abyssal_descent_coop_v1';
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
const coopReq = (u) => /\/js\/coop\/|peerjs|coop\.html/i.test(u);
(async () => {
  const js = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const coop = fs.existsSync(path.join(ROOT, 'js', 'coop')) ? fs.readdirSync(path.join(ROOT, 'js', 'coop')).map((f) => 'coop/' + f) : [];
  const bad = js.concat(coop).filter((f) => { try { execFileSync('node', ['--check', path.join(ROOT, 'js', f)], { stdio: 'pipe' }); return false; } catch (e) { return true; } });
  check(!bad.length, 'syntax of every script ' + bad.join(' '));
  // (index.html only looks at its own address: ?coop moves to coop.html. No co-op script, library or tag is named in it)
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(!/peerjs|js\/coop|<script[^>]*coop/i.test(html), 'index.html names no co-op script or library');
  const leaks = js.filter((f) => /\bCoop\b|CoopNet/.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
  check(!leaks.length, 'the solo scripts do not mention co-op ' + leaks.join(' '));
  const srv = await serve(ROOT, PORT), ch = await launch(CDP);
  // a page whose every request is seen: opened blank, the Network domain on, then sent to the address
  const open = async (url) => { const p = await ch.page('about:blank'); await p.send('Network.enable'); await p.send('Page.navigate', { url }); return p; };
  // the save as it lies in the browser, read on a page of the same site that runs no game (nothing of the game, solo or co-op, between it and the storage)
  const rawSave = async (p) => {
    await p.send('Page.navigate', { url: ORIGIN + '/css/style.css' });
    await p.until("location.pathname === '/css/style.css' && document.readyState === 'complete'", 20000);
    return p.eval(`JSON.stringify([localStorage.getItem('${KEY}'), localStorage.getItem('${OWN}')])`).then(JSON.parse);
  };
  try {
    const p = await open(ORIGIN + '/index.html');
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.booted();
    check(await p.eval('typeof G.Coop === "undefined" && typeof Peer === "undefined" && typeof CoopNet === "undefined" && typeof COOP_VER === "undefined"'), 'no co-op code in the solo page');
    check(await p.eval("['getItem', 'setItem', 'removeItem'].every((k) => /\\[native code\\]/.test(Storage.prototype[k].toString()))"), 'Storage is the browser\'s own (not wrapped)');
    check(await p.eval(`(() => { const s = localStorage.getItem('${KEY}'); return !!s && JSON.parse(s).settings.volume === G.save.data.settings.volume; })()`), 'the solo save key is read as it is');
    check(p.reqs.some((u) => /\/js\/game\.js/.test(u)) && !p.reqs.some(coopReq), `the solo page asked for nothing of co-op (${p.reqs.length} requests) ${p.reqs.filter(coopReq).slice(0, 3).join(' ')}`);
    const bot = JSON.stringify(fs.readFileSync(path.join(ROOT, 'tests', 'bot.js'), 'utf8'));
    await p.eval(`G.game.debug = true; (0, eval)(${bot}); 1`);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    const secs = +process.argv[2] || 45;
    const end = await p.eval(`__bot(${secs * 1000}, { fastBoss: true }).then((r) => JSON.stringify({ r, area: G.game.area, errs: window.__errs }))`);
    console.log('bot', end.slice(0, 300));
    const o = JSON.parse(end);
    check(o.area >= 1 && !o.errs.length && !p.errs.length, `bot played ${secs}s with no errors (reached area ${o.area}) ${p.errs.slice(0, 3).join(' | ')}`);
    check(!p.reqs.some(coopReq), 'still nothing of co-op asked for after the run');
    // ---- a co-op run in the same browser, then the solo save again ----
    const [before, own0] = await rawSave(p);
    check(!!before, 'the solo save is there before co-op');
    await p.send('Page.navigate', { url: `${ORIGIN}/coop.html?room=G${Math.random().toString(36).slice(2, 6).toUpperCase()}&host=1&name=Gate&local=1` });
    await p.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await p.booted();
    await p.eval('G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await p.running(null, 90000);
    await p.gameFor(3);
    // (changed in co-op: a setting and the records of a run; all of it must land in the co-op key)
    await p.eval('G.save.data.settings.volume = 0.33; G.save.data.records.runs += 7; G.save.write(); 1');
    await p.eval('G.Coop.quit(); 1');
    await p.until('window.G && G.Coop && G.game.state === "title" && !G.Coop.live && !G.game.run', 60000);
    const [after, own1] = await rawSave(p);
    check(after === before, 'the solo save is byte for byte what it was before the co-op run');
    let ownOk = false; try { ownOk = JSON.parse(own1).settings.volume === 0.33; } catch (e) { /* no co-op key */ }
    check(ownOk && own1 !== own0, 'the co-op run saved under its own key');
    await p.send('Page.navigate', { url: ORIGIN + '/index.html' });
    await p.until("window.G && G.game && G.game.state === 'title' && location.pathname === '/index.html'", 90000);
    await p.booted();
    const b = JSON.parse(before);
    check(await p.eval(`typeof G.Coop === "undefined" && G.save.data.settings.volume === ${JSON.stringify(b.settings.volume)} && G.save.data.records.runs === ${JSON.stringify(b.records.runs)}`), 'the solo page after co-op: its own settings and records, no co-op code');
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nGATE FAILED (${fails.length})` : '\nGATE PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
