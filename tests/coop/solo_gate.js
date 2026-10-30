'use strict';
// The solo game's gate: run before every merge of co-op work. Exit code 0 = solo is untouched and still plays.
//   node tests/coop/solo_gate.js [seconds of bot play, default 45]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { serve, launch } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
(async () => {
  const js = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  const coop = fs.existsSync(path.join(ROOT, 'js', 'coop')) ? fs.readdirSync(path.join(ROOT, 'js', 'coop')).map((f) => 'coop/' + f) : [];
  const bad = js.concat(coop).filter((f) => { try { execFileSync('node', ['--check', path.join(ROOT, 'js', f)], { stdio: 'pipe' }); return false; } catch (e) { return true; } });
  check(!bad.length, 'syntax of every script ' + bad.join(' '));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(!/coop|peerjs/i.test(html), 'index.html loads nothing of co-op');
  const leaks = js.filter((f) => /\bCoop\b|CoopNet/.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')));
  check(!leaks.length, 'the solo scripts do not mention co-op ' + leaks.join(' '));
  const srv = await serve(ROOT, 8790), ch = await launch(9333);
  try {
    const p = await ch.page('http://127.0.0.1:8790/index.html');
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    check(await p.eval('typeof G.Coop === "undefined" && typeof Peer === "undefined"'), 'no co-op code in the solo page');
    const bot = JSON.stringify(fs.readFileSync(path.join(ROOT, 'tests', 'bot.js'), 'utf8'));
    await p.eval(`G.game.debug = true; (0, eval)(${bot}); 1`);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    const secs = +process.argv[2] || 45;
    const end = await p.eval(`__bot(${secs * 1000}, { fastBoss: true }).then((r) => JSON.stringify({ r, area: G.game.area, errs: window.__errs }))`);
    console.log('bot', end.slice(0, 300));
    const o = JSON.parse(end);
    check(o.area >= 1 && !o.errs.length && !p.errs.length, `bot played ${secs}s with no errors (reached area ${o.area}) ${p.errs.slice(0, 3).join(' | ')}`);
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nGATE FAILED (${fails.length})` : '\nGATE PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
