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
    check(await pc.eval('!document.getElementById("m-hometip")'), 'a PC page shows no iPhone note');
    check(await pc.eval('!document.getElementById("m-ui") && !window.__mobile && !document.getElementById("m-tiles")'), 'a PC page has none of the phone layer');
    await pc.close();
    // iPhone: the page declares itself a home-screen app, and Safari is told how to get there
    const ip = await ch.page('about:blank');
    await ip.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    await ip.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
    await ip.until("window.G && G.game && G.game.state === 'title' && window.__mobile", 90000);
    await ip.until('!!document.getElementById("m-hometip")', 5000).catch(() => {});
    check(await ip.eval('!!document.getElementById("m-hometip") && document.getElementById("m-hometip").textContent.includes("ホーム画面に追加")'), 'iPhone Safari is told how to play fullscreen');
    check(await ip.eval('!!document.querySelector("link[rel=manifest]") && document.querySelector("meta[name=apple-mobile-web-app-capable]").content === "yes"'), 'the page can run as a home-screen app');
    check((await ip.eval('fetch("manifest.webmanifest").then((r) => r.json()).then((m) => m.display)')) === 'fullscreen', 'the app manifest is served');
    check((await ip.eval('fetch("icons/icon-180.png").then((r) => r.status)')) === 200, 'with its icon');
    await ip.eval('document.querySelector("#m-hometip [data-a=never]").click(); 1');
    await sleep(800);
    check(await ip.eval('!document.getElementById("m-hometip") && G.save.data.settings.mNoHomeTip === 1'), 'and it stays away once dismissed');
    await ip.close();
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?mobile=1`);
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.until("window.G && G.game && G.game.state === 'title' && window.__mobile", 90000);
    await p.eval("G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until("G.game.state === 'playing' && document.documentElement.classList.contains('m-play')", 20000);
    await sleep(800);
    const W = await p.eval('innerWidth'), H = await p.eval('innerHeight');
    console.log('screen', W, H, 'field', await p.eval('G.world.biome + (G.world.layout ? "/" + G.world.layout : "")'));
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
    // a melee weapon's guard stays up as long as the reload button is held, and drops when it is let go
    await p.eval('G.game.dev.freeze = false; G.game.state = "playing"; G.ui.clearScreen(); window.__mobile.tapKey(G.BIND.w3[0]); 1');
    await sleep(700);
    const rl = await p.eval('(() => { const r = document.querySelector("[data-id=reload]").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    check(await p.eval('G.player.meleeMode === true'), 'the melee weapon is in hand ' + await p.eval('JSON.stringify([G.game.state, !!G.game.search, G.player.dead, G.player.pileState, G.player.grapple.state, G.player.melee && G.player.melee.id, G.player.weapons.length])'));
    await touch('touchStart', [[8, rl[0], rl[1]]]);
    // (the headless game runs slowly: give the guard up to 3 s of real time to come up)
    for (let i = 0; i < 30 && !(await p.eval('G.weapons.guarding() === true')); i++) await sleep(100);
    check(await p.eval('G.weapons.guarding() === true'), 'holding the reload button keeps the guard up');
    await touch('touchEnd', []);
    await sleep(400);
    check(await p.eval('G.weapons.guarding() === false'), 'and it drops when the finger lifts');
    await p.eval('window.__mobile.tapKey(G.BIND.w1[0]); 1');
    await sleep(500);
    const mag0 = await p.eval('G.player.weapon.mag = Math.max(0, G.player.weapon.mag - 5); G.player.weapon.mag');
    await touch('touchStart', [[9, rl[0], rl[1]]]); await touch('touchEnd', []);
    await sleep(300);
    check(await p.eval('G.player.meleeMode === false && !!G.player.weapon.reloading'), 'a gun still reloads from a tap on the same button');
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
    // the information panels can be placed and sized like the buttons
    await p.eval('G.game.state = "modal"; G.ui.settings(() => {}); 1');
    await sleep(300);
    await p.eval('document.getElementById("m-layout").click(); 1');
    await sleep(300);
    const frames = await p.eval('[...document.querySelectorAll(".me-b.panel")].map((e) => e.textContent).join(",")');
    check(frames.includes('コイン・時間') && frames.includes('HP・状態') && frames.includes('武器・弾') && frames.includes('エリア・目標'), 'the editor offers the information panels too (' + frames + ')');
    const before = await p.eval('(() => { const r = document.getElementById("hud-tr").getBoundingClientRect(); return [r.left, r.top, r.width]; })()');
    const fr = await p.eval('(() => { const e = [...document.querySelectorAll(".me-b.panel")].find((x) => x.textContent === "コイン・時間"), r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await touch('touchStart', [[11, fr[0], fr[1]]]); await touch('touchMove', [[11, fr[0] - 120, fr[1] + 90]]); await touch('touchEnd', []);
    await sleep(200);
    await p.eval('document.getElementById("me-done").click(); 1');
    await sleep(300);
    const after = await p.eval('(() => { const r = document.getElementById("hud-tr").getBoundingClientRect(); return [r.left, r.top, r.width]; })()');
    check(Math.abs(after[0] - (before[0] - 120)) < 6 && Math.abs(after[1] - (before[1] + 90)) < 6, `a moved information panel stands where it was put (${Math.round(before[0])},${Math.round(before[1])} -> ${Math.round(after[0])},${Math.round(after[1])})`);
    check(await p.eval('!!G.save.data.settings.mLayout.i_tr && G.save.data.settings.mLayout.i_tr.x > 0'), 'and is remembered');
    // its size
    await p.eval('G.game.state = "modal"; G.ui.settings(() => {}); document.getElementById("m-layout").click(); 1');
    await sleep(300);
    await p.eval('(() => { const e = [...document.querySelectorAll(".me-b.panel")].find((x) => x.textContent === "コイン・時間"); e.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 31, clientX: 5, clientY: 5, bubbles: true })); e.dispatchEvent(new PointerEvent("pointerup", { pointerId: 31, bubbles: true })); const s = document.getElementById("me-size"); s.value = 1.6; s.oninput({ target: s }); })(); 1');
    await sleep(200);
    const zoomed = await p.eval('getComputedStyle(document.querySelector("#hud-tr > *")).zoom');
    check(+zoomed > 0.6 * 0.8 * 1.5, 'a panel can be made bigger (zoom ' + zoomed + ')');
    await p.eval('document.getElementById("me-reset").click(); 1');
    await sleep(300);
    await p.eval('document.getElementById("me-done").click(); 1');
    await sleep(300);
    const back = await p.eval('(() => { const r = document.getElementById("hud-tr").getBoundingClientRect(); return [r.left, r.top]; })()');
    check(Math.abs(back[0] - before[0]) < 6 && Math.abs(back[1] - before[1]) < 6, 'and "初期配置" puts it back');
    // the pause and bag buttons: a press whose pointerup never came (the button was hidden under the finger) does not lock the button
    await p.eval('G.game.state = "playing"; G.ui.clearScreen(); G.input.locked = true; 1');
    await sleep(400);
    const stuck = await p.eval('(() => { const b = document.querySelector("[data-id=pause]"); b.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 41, clientX: 5, clientY: 5, bubbles: true, cancelable: true })); return G.game.state; })()');
    check(stuck === 'paused', 'the pause button pauses');
    await p.eval('G.game.resume(); 1');
    await sleep(500);
    const pb = await p.eval('(() => { const r = document.querySelector("[data-id=pause]").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
    await touch('touchStart', [[12, pb[0], pb[1]]]); await touch('touchEnd', []);
    await sleep(500);
    check(await p.eval('G.game.state') === 'paused', 'and it still works after a press that never ended');
    await p.eval('G.game.resume(); 1');
    await sleep(500);
    // states nothing on the screen could answer are put right
    await p.eval('G.game.state = "inv"; 1');
    await p.until('G.game.state === "playing"', 4000).catch(() => {});
    check(await p.eval('G.game.state') === 'playing', 'a bag that is "open" with no bag on screen is closed by itself');
    await p.eval('G.game.state = "resuming"; 1');
    await p.until('G.game.state === "playing"', 4000).catch(() => {});
    check(await p.eval('G.game.state') === 'playing', 'so is a resume that never finished');
    await p.eval('G.game.state = "paused"; G.ui.clearScreen(); 1');
    await p.until('G.game.state === "playing"', 4000).catch(() => {});
    check(await p.eval('G.game.state') === 'playing', 'and a pause with no menu');
    await touch('touchStart', [[13, pb[0], pb[1]]]); await touch('touchEnd', []);
    await sleep(500);
    check(await p.eval('G.game.state') === 'paused', 'and the pause button still answers after all that');
    await p.eval('G.game.resume(); 1');
    await sleep(500);
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
    await p.close();
    // the tutorial on a phone: the panel has its own buttons and names the on-screen buttons, not keys and a mouse
    const t = await ch.page(`http://127.0.0.1:${PORT}/index.html?mobile=1`);
    await t.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await t.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
    await t.until("window.G && G.game && G.game.state === 'title' && window.__mobile", 90000);
    await t.eval('G.renderer.compile = () => {}; G.Warm = null; G.Tutorial.start(); 1');
    await t.until("G.game.state === 'playing' && !!document.querySelector('#tut.on [data-a]')", 30000);
    await sleep(500);
    const tap = async (sel) => {
      const pt = await t.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!pt) return false;
      await t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 21, x: pt[0], y: pt[1] }] });
      await t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      return true;
    };
    const seen = [], badWords = /ホイール|マウス|クリック|Esc|Enter|WASD/;
    let last = '', bad = [], noBtn = 0, total = '';
    for (let i = 0; i < 60; i++) {
      await sleep(350);
      const txt = await t.eval("document.querySelector('#tut').textContent");
      const mm = txt.match(/(\d+) \/ (\d+)/) || [], step = mm[1]; if (mm[2]) total = mm[2]; // (the number of steps is read off the screen)
      if (step && step === total) { seen.push(step); break; }
      if (!seen.includes(step)) seen.push(step);
      if (badWords.test(txt)) bad.push(step + ': ' + (txt.match(badWords) || [])[0]);
      const ok = (await tap('#tut [data-a=next]')) || (await tap('#tut [data-a=skip]'));
      if (!ok) noBtn++;
      for (let j = 0; j < 12 && last === step; j++) { await sleep(150); const x = await t.eval("(document.querySelector('#tut').textContent.match(/(\\d+) \\/ \\d+/) || [])[1]"); if (x !== step) break; }
      last = step;
    }
    check(!!total && seen.includes(total), 'a phone can tap its way through all of the tutorial (' + seen.join(',') + ' of ' + total + ')');
    check(noBtn === 0, 'every step has a button to tap');
    check(!bad.length, 'no step names a mouse or a key a phone does not have ' + bad.join(' | '));
    check(!t.errs.length, 'no errors in the tutorial ' + t.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nMOBILE TEST FAILED (${fails.length})` : '\nMOBILE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
