'use strict';
// The phone layer with real multi-touch events: which finger aims, tapping things, the layout editor. A PC page stays free of all of it.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9981;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const pc = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await pc.until("window.G && G.game && G.game.state === 'title'", 90000);
    check(await pc.eval('!document.getElementById("m-ui") && !window.__mobile && !document.getElementById("m-tiles")'), 'a PC page has none of the phone layer');
    await pc.close();
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?mobile=1`);
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.until("window.G && G.game && G.game.state === 'title' && window.__mobile", 90000);
    await p.eval("G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until("G.game.state === 'playing' && document.documentElement.classList.contains('m-play')", 20000);
    await sleep(800);
    const W = await p.eval('innerWidth'), H = await p.eval('innerHeight');
    console.log('screen', W, H);
    check(await p.eval('document.querySelectorAll("#m-tiles .ab").length') >= 9, 'skills and items are placed as buttons of their own');
    check(await p.eval('document.querySelector("[data-id=use]").style.display') === 'none', 'there is no interact button by default');
    // fingers: touch points are sent as the whole current set
    const touch = (type, pts) => p.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
    const yaw = () => p.eval('G.player.yaw');
    const fire = await p.eval('(() => { const r = document.querySelector("[data-id=fire]").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    const lx = W * 0.6, ly = H * 0.3;
    await touch('touchStart', [[1, lx, ly]]);
    await touch('touchMove', [[1, lx + 40, ly]]);
    await sleep(250);
    const y1 = await yaw();
    await touch('touchMove', [[1, lx + 80, ly]]);
    await sleep(250);
    const y2 = await yaw();
    check(Math.abs(y2 - y1) > 0.01, 'the first finger aims');
    // a second finger on the fire button, dragging: the aim stays with the first
    await touch('touchStart', [[1, lx + 80, ly], [2, fire[0], fire[1]]]);
    await sleep(100);
    check(await p.eval('G.input.mouse[0] === true || !!G.input.mpressed[0]'), 'the second finger fires');
    const y3 = await yaw();
    await touch('touchMove', [[1, lx + 80, ly], [2, fire[0] + 30, fire[1] - 20]]);
    await sleep(250);
    const y4 = await yaw();
    check(Math.abs(y4 - y3) < 0.008, `moving the fire finger does not move the aim (${(y4 - y3).toFixed(4)})`);
    // a third and fourth finger change nothing, the first still aims
    await touch('touchStart', [[1, lx + 80, ly], [2, fire[0] + 30, fire[1] - 20], [3, W * 0.55, H * 0.6]]);
    await touch('touchMove', [[1, lx + 80, ly], [2, fire[0] + 30, fire[1] - 20], [3, W * 0.55 + 50, H * 0.6]]);
    await sleep(250);
    const y5 = await yaw();
    check(Math.abs(y5 - y4) < 0.008, 'neither does a third finger on the look area (the gun recoils a little) ' + (y5 - y4).toFixed(4));
    await touch('touchMove', [[1, lx + 120, ly], [2, fire[0] + 30, fire[1] - 20], [3, W * 0.55 + 50, H * 0.6]]);
    let y6 = y5;
    for (let i = 0; i < 12 && Math.abs(y6 - y5) <= 0.01; i++) { await sleep(150); y6 = await yaw(); }
    check(Math.abs(y6 - y5) > 0.01, 'the first finger still aims with three down');
    await touch('touchEnd', []);
    await sleep(200);
    check(await p.eval('G.input.mouse[0] === false'), 'all fingers up: firing stops');
    // the first finger lifts: the next one takes over, with no jump (driven by pointer events: the touch protocol can only lift all fingers at once)
    const hand = await p.eval(`(() => { const L = document.getElementById('m-look'), ev = (t, id, x, y) => L.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true })), I = G.input;
      ev('pointerdown', 101, 100, 50); ev('pointerdown', 102, 200, 50); I.mx = 0;
      ev('pointermove', 102, 240, 50); const second = I.mx; ev('pointermove', 101, 130, 50); const first = I.mx;
      ev('pointerup', 101, 130, 50); const up = I.mx; ev('pointermove', 102, 260, 50); const after = I.mx - up; ev('pointerup', 102, 260, 50); I.mx = 0;
      return JSON.stringify({ second, first, jump: up - first, after }); })()`);
    const hd = JSON.parse(hand);
    check(hd.second === 0 && hd.first !== 0, 'with two fingers on the look area the first one aims ' + hand);
    check(hd.jump === 0, 'lifting it causes no jump');
    check(hd.after !== 0 && Math.abs(hd.after) < 60, 'the next finger takes over from where it is');
    // tapping: empty ground does nothing, a chest is searched
    const y8 = await yaw();
    await p.eval('G.player.pitch = 0.5; 1');
    await sleep(150);
    await touch('touchStart', [[5, W * 0.7, H * 0.4]]); await touch('touchEnd', []);
    await sleep(400);
    check(Math.abs(await p.eval('G.player.pitch') - 0.5) < 0.01 && Math.abs(await yaw() - y8) < 0.01, 'a tap on nothing leaves the view where it was');
    await p.eval("(() => { const it = G.world.interactables.find((x) => x.type === 'chest'), P = G.player; P.pos.set(it.pos.x + 2, Math.max(0, it.pos.y - 0.8), it.pos.z); P.vel.set(0, 0, 0); P.yaw = Math.PI / 2 + 0.3; P.pitch = -0.55; G.game.dev.freeze = true; })(); 1");
    await sleep(400);
    const pt = await p.eval("(() => { const it = G.world.interactables.find((x) => x.type === 'chest'), v = it.pos.clone().project(G.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; })()");
    console.log('chest on screen at', pt.map(Math.round));
    await touch('touchStart', [[6, pt[0], pt[1]]]); await touch('touchEnd', []);
    await sleep(500);
    check(await p.eval('!!G.game.search || G.world.interactables.find((x) => x.type === "chest").opened'), 'a tap on a chest starts searching it ' + await p.eval('JSON.stringify([G.game.state, G.player.dead, G.input.locked, G.world.interactables.find((x) => x.type === "chest").pos.distanceTo(G.camera.position), G.player.yaw, G.player.pitch])'));
    await p.eval('G.game.cancelSearch && G.game.cancelSearch(); 1');
    // the layout editor
    await p.eval('G.game.state = "modal"; G.ui.settings(() => {}); 1');
    await sleep(300);
    check(await p.eval('!!document.getElementById("m-layout")'), 'the settings offer the layout screen');
    await p.eval('document.getElementById("m-layout").click(); 1');
    await sleep(300);
    const b = await p.eval('(() => { const e = [...document.querySelectorAll(".me-b")].find((x) => x.textContent.includes("ジャンプ")), r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await touch('touchStart', [[7, b[0], b[1]]]); await touch('touchMove', [[7, b[0] - 90, b[1] + 30]]); await touch('touchEnd', []);
    await sleep(200);
    await p.eval('document.getElementById("me-done").click(); 1');
    await sleep(200);
    const pos = await p.eval('JSON.stringify(G.save.data.settings.mLayout.jump)');
    check(!!pos && pos !== 'undefined', 'a moved button is remembered ' + pos);
    const jr = await p.eval('(() => { const e = document.querySelector("[data-id=jump]"); return parseFloat(e.style.left) + parseFloat(e.style.width) / 2; })()');
    check(Math.abs(jr - (b[0] - 90)) < 12, `and stands where it was put (${Math.round(jr)} / ${Math.round(b[0] - 90)})`);
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nMOBILE TEST FAILED (${fails.length})` : '\nMOBILE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
