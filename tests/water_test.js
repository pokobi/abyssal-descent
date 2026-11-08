'use strict';
// The water of the fields (textures.js waterize, water.js, audio.js water sounds):
//  - the water's shader builds (no shader errors) in the flooded halls and the village stream; the current is set for each;
//  - the falls of the flooded halls and the village stream are known (where they land, where it runs);
//  - what touches the water rings it: your steps, a shot (a splash instead of dust), a blast, a foe wading; a shot on dry stone does not;
//  - the sounds of water play (the game is muted: they are measured before the master volume): a step in water, a landing, a
//    splash, a sluice's rush, and the beds (the falls, the stream, the lap of still water, wading), each loud enough and none clipping.
//   node tests/water_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9969;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'hard', lv: 0 }, 0); G.game.seed = 424242; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    // (sound needs a gesture before the browser lets it run; the volume stays at 0 and the browser itself is muted)
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
    await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
    await p.eval("G.sfx.init(); G.sfx.resume(); window.__e = []; const ce = console.error; console.error = function () { window.__e.push([...arguments].map(String).join(' ').slice(0, 300)); return ce.apply(console, arguments); }; 1");
    await sleep(500);
    const ev = async (js) => JSON.parse(await p.eval(`JSON.stringify((() => { ${js} })())`));
    const wait = async (sec) => { const t0 = +(await p.eval('G.game.time')); try { await p.until(`G.game.time >= ${t0 + sec}`, sec * 6000 + 8000); } catch (e) { /* (a stopped clock shows in the checks) */ } };
    await p.eval(`window.T = {
      enter(field, layout) { const R = G.Run, GM = G.game; R.field = () => field;
        for (let n = 2; n < 60; n++) { if (R.isBoss(n) || R.isPrep(n)) continue; G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; GM.enterArea(n, 'combat'); G.enemies.clear(); GM.objective = null; GM.waves = null; GM.dev = { god: true, speed: 1 }; GM.areaCleared = false;
          if (!layout || G.world.layout === layout) { if (G.Warm) G.Warm.world(); return G.world; } } return null; },
      // ripples started in the last half second, near (x, z)
      rings(x, z, r) { const t = G.Tex.lavaT.value; return G.Tex.waterU.uRip.value.filter((v) => t - v.z < 0.6 && t - v.z >= 0 && Math.hypot(v.x - x, v.y - z) < (r || 1.5)).length; },
      clear() { for (const v of G.Tex.waterU.uRip.value) v.set(0, 0, -99, 0); },
      // the loudness of what plays in the next ms (before the master volume): rms and peak
      async meter(ms) { const an = G.sfx.tap(), buf = new Float32Array(an.fftSize); let sum = 0, n = 0, peak = 0; const t0 = performance.now();
        while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(buf); for (const v of buf) { sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); } await new Promise((r) => setTimeout(r, 20)); }
        return { rms: Math.sqrt(sum / Math.max(1, n)), peak }; },
    }; 1`);

    // ---- the flooded halls
    const fl = await ev(`const w = T.enter('flooded'); return { ok: !!w, falls: (w.waterfalls || []).length, flow: G.Tex.waterU.uFlow.value.toArray(), zones: w.waterZones.length, layout: w.layout }`);
    check(fl.ok && fl.zones > 0, `flooded halls built (${fl.layout})`);
    check(fl.falls >= 1, `the falls from the walls are known (${fl.falls})`);
    check(Math.hypot(...fl.flow) > 0.1, `the flooded halls' water runs toward the gates (${fl.flow.map((v) => v.toFixed(2))})`);
    await wait(0.5);
    const shaderErr = await ev("return window.__e.filter((e) => /Shader|WebGLProgram|GLSL|ERROR/.test(e))");
    check(!shaderErr.length, 'the water shader compiles ' + shaderErr.slice(0, 1).join(''));
    // a spot in the open water
    const spot = await ev(`const w = G.world, q = w.waterZones[0];
      for (let k = 0; k < 400; k++) { const c = w.randomOpenCell(G.game.arng, (x, z, i) => Math.abs(w.nf[i] - ((q.y || 0) - (q.deep || 0))) < 0.1 && x > q.x0 + 2 && x < q.x1 - 2 && z > q.z0 + 2 && z < q.z1 - 2 && w.boxFree(x - 0.6, 0.05, z - 0.6, x + 0.6, 1.8, z + 0.6)); if (c) return { x: c.x, z: c.z }; } return null;`);
    check(!!spot, 'an open stretch of water');
    if (spot) {
      // your steps ring the water
      await ev(`T.clear(); const P = G.player; P.pos.set(${spot.x}, 0.02, ${spot.z}); P.vel.set(0, 0, 0); window.__wk = setInterval(() => { P.vel.x = 5; }, 16); return 1`);
      await wait(0.6);
      const steps = await ev(`clearInterval(window.__wk); return T.rings(G.player.pos.x, G.player.pos.z, 4)`);
      check(steps >= 1, `wading rings the water round you (${steps})`);
      // a shot into the water splashes (and rings), a shot on dry stone does not
      const sh = await ev(`T.clear(); const a = G.Water.shot(new THREE.Vector3(${spot.x}, 0.0, ${spot.z})); const b = G.Water.shot(new THREE.Vector3(G.world.spawn.x, 0.0, G.world.spawn.z)); return { a, b, rings: T.rings(${spot.x}, ${spot.z}) }`);
      check(sh.a && !sh.b && sh.rings >= 1, `a shot into the water splashes and rings it, one on the dry landing does not (${JSON.stringify(sh)})`);
      // a hitscan round from the gun, straight down into the water
      const hs = await ev(`T.clear(); const o = new THREE.Vector3(${spot.x}, 3, ${spot.z}), d = new THREE.Vector3(0.05, -1, 0).normalize(), w = G.player.weapon, s = G.weapons.stats(w); G.weapons.traceShot(w, s, o, d, o, 1); return T.rings(${spot.x}, ${spot.z}, 2)`);
      check(hs >= 1, `a round fired into the water rings it (${hs})`);
      // a blast on the water
      const bl = await ev(`T.clear(); G.combat.explode(new THREE.Vector3(${spot.x}, 0.3, ${spot.z}), 3, 1, { noFx: true }); return T.rings(${spot.x}, ${spot.z}, 3)`);
      check(bl >= 2, `a blast throws the water up in rings (${bl})`);
      // a foe wading
      await ev(`T.clear(); const d = G.ENEMIES.find((d) => !d.flyer && !d.boss && G.ENEMY_BY_ID[d.id] && !d.special); const e = G.enemies.spawn(d, 9, new THREE.Vector3(${spot.x} + 1.5, 0, ${spot.z}), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; window.__F = e; window.__fk = setInterval(() => { e.vel.x = 3; }, 16); return 1`);
      await wait(1.0);
      const fr = await ev(`clearInterval(window.__fk); return T.rings(window.__F.pos.x, window.__F.pos.z, 3)`);
      check(fr >= 1, `a foe wading rings the water (${fr})`);
    }
    // ---- the village stream
    const hm = await ev(`const w = T.enter('hamlet', 'stream'); return w ? { streams: (w.streams || []).length, flow: G.Tex.waterU.uFlow.value.toArray() } : null`);
    check(hm && hm.streams === 1 && Math.abs(hm.flow[0]) > 0.3, `the village stream runs across the village (${JSON.stringify(hm)})`);
    // ---- the sounds (measured before the master volume)
    const quiet = await ev('return 1');
    const snd = async (js, ms) => { await p.eval(`(async () => { ${js} })()`); return p.eval(`T.meter(${ms}).then((r) => JSON.stringify(r))`).then(JSON.parse); };
    await p.eval("G.Water.holdBeds = true; G.sfx.waterBed({ wade: 0, fall: 0, brook: 0, lap: 0 }); 1"); await sleep(800);
    const base = await snd('', 300);
    const R = {
      step: await snd("G.sfx.step('water', 0.9)", 160),
      land: await snd("G.sfx.land(0.8, 'water')", 450),
      splash: await snd('G.sfx.splash(null, 1.0)', 500),
      shot: await snd('G.sfx.splash(null, 0.25)', 300),
      rush: await snd('G.sfx.waterRush(null, 1.2)', 700),
    };
    await p.eval("G.sfx.waterBed({ wade: 0, fall: 1, fallPan: 0.3, brook: 0, lap: 0 }); 1"); await sleep(900); R.falls = await snd('', 500);
    await p.eval("G.sfx.waterBed({ wade: 0, fall: 0, brook: 1, brookPan: -0.3, lap: 0 }); 1"); await sleep(900); R.brook = await snd('', 500);
    await p.eval("G.sfx.waterBed({ wade: 0, fall: 0, brook: 0, lap: 1 }); 1"); await sleep(900); R.lap = await snd('', 500);
    await p.eval("G.sfx.waterBed({ wade: 1, fall: 0, brook: 0, lap: 0 }); 1"); await sleep(900); R.wade = await snd('', 500);
    await p.eval("G.sfx.waterBed({ wade: 0, fall: 0, brook: 0, lap: 0 }); 1"); await sleep(1200); R.off = await snd('', 300);
    // (the area's own low rumble always plays: what a sound adds over it is its loudness)
    const ex = (r) => Math.sqrt(Math.max(0, r.rms * r.rms - base.rms * base.rms));
    await p.eval('G.Water.holdBeds = false; 1');
    console.log('     silence peak', base.peak.toFixed(2));
    console.log('     sound rms/peak:', Object.entries(R).map(([k, v]) => `${k} ${v.rms.toFixed(3)}/${v.peak.toFixed(2)}`).join('  '), ' (silence', base.rms.toFixed(3) + ')');
    for (const k of ['step', 'land', 'splash', 'shot', 'rush', 'falls', 'brook', 'lap', 'wade']) check((ex(R[k]) > 0.006 || R[k].peak > base.peak * 1.4 + 0.02) && R[k].peak < 0.9, `sound: ${k} plays, and does not clip (adds ${ex(R[k]).toFixed(3)}, peak ${R[k].peak.toFixed(2)})`);
    // (the rumble under it all swells and ebbs by itself: within a third of it is silence)
    check(R.off.rms < base.rms * 1.3 && R.off.rms < R.falls.rms * 0.5, `sound: the beds fall silent when there is no water near (${R.off.rms.toFixed(3)} against ${base.rms.toFixed(3)})`);
    check(ex(R.splash) > ex(R.shot), 'sound: a big splash is louder than a shot into the water');
    check(ex(R.falls) > ex(R.lap), 'sound: a fall roars louder than still water laps');
    const errs = await ev("return window.__e.slice()");
    check(!errs.length && !p.errs.length, 'no errors ' + errs.concat(p.errs).slice(0, 3).join(' | ').slice(0, 300));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nWATER TEST FAILED (${fails.length})` : '\nWATER TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
