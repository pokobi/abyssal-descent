'use strict';
// WebGL contexts: the page holds one - the game's. The small 3D views (the weapon cards of the bag and the status screen, the class
// screen's figure, the codex's model) are drawn by the game's renderer into targets of their own and copied to 2D canvases
// (statusui.js SU.view), so that none makes a context of its own: a phone allows a page only a few, and Chrome takes the oldest - the
// game's - when there are more. Each view must still show its model, the game renderer's own state must be as it was after a view
// has drawn, and opening and closing the screens again and again must neither make contexts nor lose the game's.
// Run: COOP_PORT=9982 node tests/glctx_test.js  (MOBILE=0: the PC page)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9988;
const MOBILE = process.env.MOBILE !== '0';
const CYCLES = +process.env.CYCLES || 20;
// every WebGL context the page makes (before its scripts run), and every loss seen on a canvas
const HOOK = `(function () {
  const L = (window.__glx = { list: [], lost: [] });
  const wrap = (P) => { if (!P) return; const o = P.getContext; P.getContext = function (t) { const c = o.apply(this, arguments);
    if (c && /webgl/.test(String(t)) && !L.list.some((x) => x.gl === c)) { const id = L.list.length; L.list.push({ id, gl: c, cv: this }); if (this.addEventListener) this.addEventListener('webglcontextlost', () => L.lost.push(id)); }
    return c; }; };
  wrap(window.HTMLCanvasElement && HTMLCanvasElement.prototype); wrap(window.OffscreenCanvas && OffscreenCanvas.prototype);
  L.alive = () => L.list.filter((x) => !x.gl.isContextLost()).length;
})();`;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page('about:blank');
    await p.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    if (MOBILE) {
      await p.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
      await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    await p.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?${MOBILE ? 'mobile=1' : 'pc=1'}` });
    await p.until("window.G && G.game && G.game.state === 'title'", 120000);
    await p.eval('G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; 1');
    await p.booted(180000); await sleep(1500);
    const alive = () => p.eval('__glx.alive()');
    // the drawn pixels of a 2D canvas (its alpha above zero), a few frames after it was put up (the views' pictures come a frame late)
    const drawn = (sel) => p.frames(6).then(() => p.eval(`(() => { const c = document.querySelector('${sel}'); if (!c || !c.width) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; })()`));
    // the game renderer's own state, as a view must leave it
    const rstate = "JSON.stringify((() => { const R = G.renderer, c = new THREE.Color(); R.getClearColor(c); return { rt: R.getRenderTarget() ? R.getRenderTarget().uuid : null, ac: R.autoClear, ex: +R.toneMappingExposure.toFixed(4), tm: R.toneMapping, cc: c.getHexString(), ca: R.getClearAlpha(), ar: R.info.autoReset, vp: R.getViewport(new THREE.Vector4()).toArray() }; })())";

    check(await alive() === 1, `at the title: one context, the game's (${await alive()})`);
    // the class screen: its figure drawn, no context of its own
    await p.eval('G.Classes.select(() => {}, () => {}); 1');
    const fig = await drawn('.cls-cv');
    check(fig > 2000, `class screen: the figure is drawn (${fig} pixels)`);
    check(await alive() === 1, `class screen: still one context (${await alive()})`);
    await p.eval('G.ui.title(); 1'); await p.frames(3);
    // a run: the bag's weapon cards
    await p.eval("G.ui.clearScreen(); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.running(null, 90000); await sleep(1500);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); await p.frames(3);
    const before = await p.eval(rstate);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.InvUI.open(null); 1");
    const card = await drawn('canvas.pv');
    check(card > 500, `bag: the weapon card is drawn (${card} pixels)`);
    // (read between the game's frames: a view draws in a frame callback of its own, after the game's)
    const during = await p.eval(rstate);
    check(during === before, `bag: the game renderer's state is as it was after the cards drew (${during === before ? 'same' : before + ' -> ' + during})`);
    await p.eval('G.InvUI.close(); 1'); await p.frames(3);
    // the status screen's cards
    await p.eval('G.ui.pause(); G.ui.statusOverlay(true, true); 1');
    const st = await drawn('#status-overlay canvas.pv');
    check(st > 500, `status screen: the weapon card is drawn (${st} pixels)`);
    await p.eval('G.ui.statusOverlay(false); 1'); await p.frames(3);
    // the codex's model
    await p.eval("G.ui.clearScreen(); G.codex.open(() => G.ui.pause()); document.querySelector('.cx-tab[data-t=\"weapon\"]').click(); document.querySelector('.cx-item').click(); 1");
    const cx = await drawn('#cx-3d canvas');
    check(cx > 500, `codex: the weapon model is drawn (${cx} pixels)`);
    check(await alive() === 1, `codex: still one context (${await alive()})`);
    await p.eval("document.querySelector('#cx-back').click(); 1"); await p.frames(3);
    // open and close them again and again
    let most = 1;
    for (let i = 0; i < CYCLES; i++) {
      await p.eval('G.Classes.select(() => {}, () => {}); 1'); await p.frames(4); most = Math.max(most, await alive()); await p.eval('G.ui.clearScreen(); 1'); await p.frames(3);
      await p.eval("G.ui.clearScreen(); G.codex.open(() => G.ui.pause()); document.querySelector('.cx-item').click(); 1"); await p.frames(4); most = Math.max(most, await alive()); await p.eval("document.querySelector('#cx-back').click(); 1"); await p.frames(3);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.InvUI.open(null); 1"); await p.frames(4); most = Math.max(most, await alive()); await p.eval('G.InvUI.close(); 1'); await p.frames(3);
    }
    check(most === 1 && await alive() === 1, `${CYCLES} times each screen opened and closed: never more than one context (most ${most})`);
    const lost = await p.eval('JSON.stringify(__glx.lost)');
    check(lost === '[]' && !(await p.eval('G.renderer.getContext().isContextLost() || !!G.game.ctxLost')), `no context lost, the game's included (${lost})`);
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { console.error(e); fails.push(String(e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nGL CONTEXT TEST FAILED (${fails.length})` : '\nGL CONTEXT TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
