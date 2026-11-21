'use strict';
// The quality setting changed in the middle of a run. On low the normal maps are taken off the materials and set aside; on medium /
// high they come back (game.js qualityMaterials). A material cloned while on low must not carry the set-aside texture as a thing the
// renderer cannot read: three.js copies userData through JSON, and a texture kept there came out as a plain object, which - put back
// as the normal map - made every frame that drew the clone throw ("Cannot read properties of undefined (reading 'elements')").
// Seen here: no error after low -> high (in the run as it is, and with clones made on low in view), the clones get the true texture
// back, and going low <-> high again and again neither loses nor makes normal maps.
// Run: COOP_PORT=9984 node tests/quality_test.js  (MOBILE=0: the PC page)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9984;
const MOBILE = process.env.MOBILE !== '0';
const HOOK = "window.__errs = []; window.addEventListener('error', (e) => { window.__errs.push(String((e && e.message) || e)); });";
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
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.save.data.settings.quality = 'low'; G.game.applyQuality(); 1");
    await p.booted(180000); await sleep(1000);
    const setQ = async (q) => { await p.eval(`G.save.data.settings.quality = '${q}'; G.game.applyQuality(); 1`); await p.frames(30); };
    // errors: what reached the window, and what the game's own frame caught and wrote on the screen (game.js: #fatal, the red box)
    const errs = () => p.eval('(() => { const f = document.querySelectorAll("#fatal > div"); return JSON.stringify(window.__errs.slice(0, 2).concat([...f].slice(0, 1).map((d) => d.textContent.slice(0, 160)))) + " x" + (window.__errs.length + f.length); })()');
    const nErr = () => p.eval('window.__errs.length + document.querySelectorAll("#fatal > div").length');
    // the standard materials in the scene (and the gun's own scene): how many, how many wear a normal map, how many wear one that is no texture
    const count = () => p.eval(`JSON.stringify((() => { const seen = new Set(); let nm = 0, bad = 0; const pass = (root) => root && root.traverse((o) => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m.isMeshStandardMaterial || seen.has(m)) continue; seen.add(m); if (m.normalMap) { nm++; if (!m.normalMap.isTexture) bad++; } } }); pass(G.scene); pass(G.weapons && G.weapons.vmScene); return { all: seen.size, nm, bad }; })())`).then(JSON.parse);

    await p.eval("G.ui.clearScreen(); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.running(null, 90000); await sleep(1500);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); await p.frames(20);
    const low0 = await count();
    check(low0.nm === 0 || low0.nm < low0.all, `on low: the run is up (${low0.all} standard materials, ${low0.nm} still with a normal map)`);
    check(await nErr() === 0, `on low: no error (${await errs()})`);

    // 1. the run as it is: low -> high
    await setQ('high');
    const hi0 = await count();
    check(await nErr() === 0, `low -> high, the run as it is: no error (${await errs()})`);
    check(hi0.nm > 0 && hi0.bad === 0, `low -> high: the normal maps are back, each a texture (${hi0.nm} maps, ${hi0.bad} not a texture)`);

    // 2. clones made while on low, put in view, then high
    await setQ('low');
    const made = await p.eval(`(() => { const out = (window.__qc = []); const seen = new Set(); G.scene.traverse((o) => { if (out.length >= 6 || !o.isMesh || !o.material || Array.isArray(o.material)) return; const m = o.material; if (!m.isMeshStandardMaterial || !m.userData._nm || seen.has(m)) return; seen.add(m);
      const c = m.clone(); const me = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), c); me.frustumCulled = false; G.camera.add(me); me.position.set((out.length - 2.5) * 0.4, 0, -2.5); out.push({ src: m, c, me }); });
      if (!G.camera.parent) G.scene.add(G.camera); return out.length; })()`);
    check(made > 0, `on low: ${made} materials with a set-aside normal map cloned and put in view`);
    const kept = await p.eval("JSON.stringify(window.__qc.map((q) => typeof q.c.userData._nm))");
    check(!/object/.test(kept), `on low: what a clone carries is not a copied-out texture (${kept})`);
    await p.frames(10);
    await setQ('high');
    check(await nErr() === 0, `low -> high with the clones in view: no error (${await errs()})`);
    const back = await p.eval("JSON.stringify(window.__qc.map((q) => (q.c.normalMap && q.c.normalMap.isTexture ? (q.c.normalMap === q.src.normalMap ? 'same' : 'other') : q.c.normalMap ? 'not-a-texture' : 'none')))");
    check(JSON.parse(back).every((s) => s === 'same'), `high: each clone wears its source's normal map (${back})`);

    // 3. again and again: nothing lost, nothing made
    const a = await count();
    for (let i = 0; i < 3; i++) { await setQ('low'); await setQ('medium'); await setQ('low'); await setQ('high'); }
    const b = await count();
    check(a.nm === b.nm && b.bad === 0, `low <-> high three times over: the same normal maps (${a.nm} -> ${b.nm}, ${b.bad} not a texture)`);
    check(await nErr() === 0, `after all of it: no error (${await errs()})`);
  } catch (e) { console.log('FAIL the test itself: ' + (e && e.stack || e)); fails.push('exception'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nFAILED (${fails.length})` : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
