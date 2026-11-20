'use strict';
// No shader made on the spot for things that come and go (fx.js FX.srKeep, pstatus.js ghostMat / PS.ghostWarm, vfx.js warm list): after an
// area's warm-up, blasts' shock rings (again and again), turning invisible (影の舞) twice, and the great wave (大海嘯) make no new shader
// program, and none of them holds the page's own thread (script, style, layout) over a quarter of a second.
// (A frame that comes late while the page's own work was short is not theirs: the browser's GPU process then builds shaders for its
// own drawing of the page's HTML (a browser started with an empty profile has none of them saved: seconds of it), or shares the GPU
// with other browsers on the machine. Those are written out for information, with the page's share of the frame.)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    // (the loading screen is still up when the title is reached: behind it the start's own warm-up runs on - the shaders, then the
    // carved shapes. Nobody can start a run before it is taken down, so neither does this)
    await p.until("document.getElementById('loading').classList.contains('done')", 120000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.player.cls = 'sniper'; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(2500); await p.eval('(G.game._warmP || Promise.resolve()).then(() => 1)');
    // (the faces of the text come from the net in many pieces, and the page lays itself out again as they land: wait until they are all in,
    // as the loading screen does, or that is what gets measured)
    await p.eval('Promise.race([G.ui.fontsReady || Promise.resolve(), new Promise((r) => setTimeout(r, 40000))]).then(() => 1)'); await sleep(2500);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.enemies.clear(); G.game.objective = null; 1");
    // the watcher: every new program, and what uses it
    await p.eval(`(() => {
      const R = G.renderer; window.__newp = []; window.__long = []; window.__ctx = ''; window.__ctxAt = [[0, '']]; window.__glw = [];
      // (the waits in a GL query that asks the GPU process and blocks until it answers - a program's link status and log, three.js asks
      // them at a program's first use: when that process is busy with other work, the page waits on it, but the work is not the page's)
      const GP = WebGL2RenderingContext.prototype;
      for (const k of ['getProgramParameter', 'getProgramInfoLog', 'getShaderParameter', 'getShaderInfoLog', 'getActiveUniform', 'getActiveAttrib', 'getUniformLocation', 'getAttribLocation', 'getError', 'readPixels', 'clientWaitSync', 'getUniformBlockIndex']) {
        const f = GP[k]; if (!f || f.__w) continue;
        const w = function () { const t = performance.now(), r = f.apply(this, arguments), d = performance.now() - t; if (d > 2) window.__glw.push([t, d]); return r; }; w.__w = true; GP[k] = w;
      }
      const ctxAt = (t) => { let c = ''; for (const [a, k] of window.__ctxAt) if (a <= t) c = k; return c; };
      // a heartbeat on the page's own thread (a timer, again and again): a gap in it is the time that thread was held - by the page's
      // scripts, style, layout, a collection - less the GL waits above. The GPU process held up alone does not stop it.
      let hb = performance.now(); window.__hb = [];
      const beat = () => { const n = performance.now(), g = n - hb; if (g > 100) { const wait = window.__glw.filter(([t]) => t >= hb && t <= n).reduce((s, x) => s + x[1], 0); window.__hb.push({ ctx: ctxAt(hb), d: Math.round(g), own: Math.round(Math.max(0, g - wait)), wait: Math.round(wait) }); } hb = n; setTimeout(beat, 0); };
      setTimeout(beat, 0);
      const known = new Set(R.info.programs.map((q) => q.id)); let last = performance.now();
      const who = (prog) => { const out = []; const look = (root, tag) => root && root.traverse((o) => { if (out.length > 1 || !o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const pr = R.properties.get(m); if (pr && pr.currentProgram === prog) out.push(tag + ' ' + m.type + (m.isShaderMaterial ? '{' + Object.keys(m.uniforms).join(',') + '}' : '') + (m.transparent ? ' transp' : '')); } }); look(G.scene, 'world'); look(G.weapons.vmScene, 'vm'); return out.join(' | '); };
      let nf = 0; const tick = () => { const t = performance.now(), dt = t - last; last = t; if (++nf > 3 && dt > 150) window.__long.push(window.__ctx + ' ' + Math.round(dt) + 'ms');
        for (const q of R.info.programs) if (!known.has(q.id)) { known.add(q.id); window.__newp.push('[' + window.__ctx + '] ' + who(q)); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick); return 1;
    })()`);
    const ctx = (c) => p.eval(`window.__ctx = '${c}'; window.__ctxAt.push([performance.now(), '${c}']); 1`);
    // shock rings, three times over (each made, drawn, thrown away)
    for (let i = 0; i < 3; i++) {
      await ctx('ring ' + i);
      await p.eval("(() => { const P = G.player; const r = G.fx.shockRing(P.pos.clone().add(new THREE.Vector3(0, 0, -4)), 0xffa040, 0.8, 10); let k = 0; const f = () => { r.set(2 + k * 0.4, 1); if (++k < 20) requestAnimationFrame(f); }; f(); return 1; })()");
      await sleep(900);
    }
    // a grenade's blast (its ring and the rest)
    await ctx('blast'); await p.eval("G.abilities.grenadeEffect('g_frag', G.player.pos.clone().add(new THREE.Vector3(0, 0, -6)), 10); 1"); await sleep(1500);
    // 影の舞, twice (named: it is no longer the sniper's own ultimate)
    for (let i = 0; i < 2; i++) {
      await ctx('shadow ' + i);
      const cast = await p.eval("(() => { const P = G.player; G.ui.clearScreen(); G.game.state = 'playing'; P.meleeMode = false; G.weapons.equip(true); if (!P.skills[0] || P.skills[0].id !== 'ult_shadow') P.skills[0] = G.abilities.makeSlot('ult_shadow'); const sk = P.skills[0]; sk.cd = 0; G.abilities.cast(sk); return sk.id + ' ' + !!(P.stats.invis || (P.st && Object.keys(P.st).some((k) => /shadow/.test(k)))); })()");
      if (i === 0) console.log('      cast: ' + cast);
      await sleep(2000);
      await p.eval("(() => { const P = G.player; P.stats.invis = 0; if (P.st) for (const k in P.st) if (/shadow/.test(k)) P.st[k] = 0; if (P.buffs && P.tmp) {} return 1; })()");
      await sleep(1500);
    }
    // 大海嘯 (the mage's ultimate)
    await ctx('tsunami');
    await p.eval("(() => { const P = G.player; P.cls = 'mage'; P.resetRun(); P.meleeMode = false; G.weapons.equip(true); G.ui.clearScreen(); G.game.state = 'playing'; const sk = P.skills[0]; sk.cd = 0; G.abilities.cast(sk); return sk.id; })()");
    await sleep(3000);
    const newp = JSON.parse(await p.eval('JSON.stringify(window.__newp)'));
    const long = JSON.parse(await p.eval('JSON.stringify(window.__long)'));
    await sleep(300);
    const mine = JSON.parse(await p.eval('JSON.stringify(window.__hb)')).filter((x) => /^(ring|shadow|tsunami)/.test(x.ctx));
    console.log('      new programs: ' + (newp.length ? newp.join('\n                    ') : 'none'));
    console.log('      long frames: ' + (long.join(', ') || 'none'));
    console.log("      the page's own thread held (ms): " + (mine.map((x) => `${x.ctx} ${x.d}${x.wait ? ' (GL wait ' + x.wait + ')' : ''}`).join(', ') || 'never over 0.1 s'));
    check(!newp.some((x) => /uR,uHW,uCol,uA/.test(x)), 'shock rings: their shader is made once (the warm-up) and kept, never again on the spot');
    check(!newp.some((x) => /^\[shadow/.test(x) && /vm .*transp/.test(x)), '影の舞: the see-through hands and gun make no shader on the spot (the first time or again)');
    check(!newp.some((x) => /uFront/.test(x)), '大海嘯: its sheet of water is made in the warm-up');
    check(!mine.some((x) => x.own > 250), "the page's own thread is never held over 0.25 s by them: " + (mine.map((x) => x.ctx + ' ' + x.own + 'ms').join(', ') || 'never over 0.1 s'));
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nREUSE TEST FAILED (${fails.length})` : '\nREUSE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
