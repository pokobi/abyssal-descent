'use strict';
// No shader made on the spot for things that come and go (fx.js FX.srKeep, pstatus.js ghostMat / PS.ghostWarm, vfx.js warm list): after an
// area's warm-up, blasts' shock rings (again and again), turning invisible (影の舞) twice, and the great wave (大海嘯) make no new shader
// program, and no frame stalls.
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
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.player.cls = 'sniper'; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(2500); await p.eval('(G.game._warmP || Promise.resolve()).then(() => 1)'); await sleep(2500);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.enemies.clear(); G.game.objective = null; 1");
    // the watcher: every new program, and what uses it
    await p.eval(`(() => {
      const R = G.renderer; window.__newp = []; window.__long = []; window.__ctx = '';
      const known = new Set(R.info.programs.map((q) => q.id)); let last = performance.now();
      const who = (prog) => { const out = []; const look = (root, tag) => root && root.traverse((o) => { if (out.length > 1 || !o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { const pr = R.properties.get(m); if (pr && pr.currentProgram === prog) out.push(tag + ' ' + m.type + (m.isShaderMaterial ? '{' + Object.keys(m.uniforms).join(',') + '}' : '') + (m.transparent ? ' transp' : '')); } }); look(G.scene, 'world'); look(G.weapons.vmScene, 'vm'); return out.join(' | '); };
      let nf = 0; const tick = () => { const t = performance.now(), dt = t - last; last = t; if (++nf > 3 && dt > 150) window.__long.push(window.__ctx + ' ' + Math.round(dt) + 'ms');
        for (const q of R.info.programs) if (!known.has(q.id)) { known.add(q.id); window.__newp.push('[' + window.__ctx + '] ' + who(q)); }
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick); return 1;
    })()`);
    const ctx = (c) => p.eval(`window.__ctx = '${c}'; 1`);
    // shock rings, three times over (each made, drawn, thrown away)
    for (let i = 0; i < 3; i++) {
      await ctx('ring ' + i);
      await p.eval("(() => { const P = G.player; const r = G.fx.shockRing(P.pos.clone().add(new THREE.Vector3(0, 0, -4)), 0xffa040, 0.8, 10); let k = 0; const f = () => { r.set(2 + k * 0.4, 1); if (++k < 20) requestAnimationFrame(f); }; f(); return 1; })()");
      await sleep(900);
    }
    // a grenade's blast (its ring and the rest)
    await ctx('blast'); await p.eval("G.abilities.grenadeEffect('g_frag', G.player.pos.clone().add(new THREE.Vector3(0, 0, -6)), 10); 1"); await sleep(1500);
    // 影の舞, twice
    for (let i = 0; i < 2; i++) {
      await ctx('shadow ' + i);
      await p.eval("(() => { const P = G.player; G.ui.clearScreen(); G.game.state = 'playing'; P.meleeMode = false; G.weapons.equip(true); const sk = P.skills[0]; sk.cd = 0; G.abilities.cast(sk); return sk.id; })()");
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
    console.log('      new programs: ' + (newp.length ? newp.join('\n                    ') : 'none'));
    console.log('      long frames: ' + (long.join(', ') || 'none'));
    check(!newp.some((x) => /uR,uHW,uCol,uA/.test(x)), 'shock rings: their shader is made once (the warm-up) and kept, never again on the spot');
    check(!newp.some((x) => /^\[shadow/.test(x) && /vm .*transp/.test(x)), '影の舞: the see-through hands and gun make no shader on the spot (the first time or again)');
    check(!newp.some((x) => /uFront/.test(x)), '大海嘯: its sheet of water is made in the warm-up');
    check(!long.some((x) => /^(ring|shadow|tsunami)/.test(x) && +x.split(' ').pop().replace('ms', '') > 250), 'no frame held over 0.25 s by them: ' + (long.join(', ') || 'none'));
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nREUSE TEST FAILED (${fails.length})` : '\nREUSE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
