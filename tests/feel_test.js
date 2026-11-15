'use strict';
// The feel of moving and shooting.
//  Slide: crouch slides only out of a sprint - however slow the run still is (its first step) - and never otherwise, however fast you are
//  going (a blast, a slope, a skill): then it is a crouch. A slide out of a full run is as it was (12.8 m/s); out of the first step it is a
//  slide at about 60% of that speed (no faster than the run would have got there); slowed, it is held down with the run. The slide-jump keeps the run; the phone's stick and crouch button follow the same rule.
//  Recoil: aimed down the sights the view climbs a rifle 3-5 degrees over 10 shots, part of it comes back (eased, not snapped), the
//  grip takes off a clear share of the climb and all the parts together never take it all; hip fire, the air and moving kick harder,
//  crouching less; a phone's touch aim gets less of it.
//   node tests/feel_test.js        (COOP_PORT: the port; the browser is muted)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9877;

// in the page: stand on a long flat clear line (W.H: a phone or not), and the helpers
const SETUP = `(() => {
  const GM = G.game, P = G.player, w = G.world, V = (x, y, z) => new THREE.Vector3(x, y, z);
  G.enemies.clear(); GM.objective = null; GM.waves = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  const S = G.save.data.settings; S.autoSprint = false; S.crouchToggle = false;
  let spot = null;
  for (let tries = 0; tries < 600 && !spot; tries++) {
    const c = w.randomOpenCell({ next: Math.random }, () => true); if (!c) continue;
    for (let a = 0; a < 8 && !spot; a++) {
      const yaw = a * Math.PI / 4, fx = -Math.sin(yaw), fz = -Math.cos(yaw); let ok = true;
      for (let d = -1; d <= 22 && ok; d += 0.5) {
        const x = c.x + fx * d, z = c.z + fz * d, g = w.groundAt(V(x, c.y + 0.3, z), 0.35, 0.8);
        if (!(Math.abs(g - c.y) < 0.03) || !w.boxFree(x - 0.45, c.y + 0.05, z - 0.45, x + 0.45, c.y + 1.95, z + 0.45)) ok = false;
      }
      if (ok) spot = { x: c.x, y: c.y, z: c.z, yaw };
    }
  }
  window.__spot = spot;
  window.__place = () => {
    const s = __spot, K = G.input.keys; for (const k in K) K[k] = false; G.input.mouse = [false, false, false, false, false];
    if (P.sliding) P.endSlide(); P.pos.set(s.x, s.y + 0.01, s.z); P.vel.set(0, 0, 0); P.yaw = s.yaw; P.pitch = 0;
    P.crouching = false; P.crouchToggle = false; P.sprintToggle = false; P.sprinting = false; P._sjRun = false; P._slideRun = false; P.st = {}; P.lastShotT = -10; P.grounded = true;
    P.resetRecoil(); G.weapons.adsT = 0; GM.step(1 / 60, 12);
  };
  return JSON.stringify(spot);
})()`;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  const boot = async (mobile) => {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?${mobile ? 'mobile=1' : 'pc=1'}`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.booted();
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.running();
    await p.eval("(() => { G.Run.field = () => 'halls'; G.game.seed = 4242; G.game.area = 1; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(2, 'combat'); })(); 1");
    await p.until("G.world && G.world.field === 'halls' && G.game.state === 'playing' && !G.game.transitioning", 40000).catch(() => {});
    await sleep(1200);
    const spot = JSON.parse(await p.eval(SETUP));
    return { p, spot };
  };
  try {
    // ---------------- slides (PC) ----------------
    const { p, spot } = await boot(false);
    ok(!!spot, 'a long clear flat line to run on ' + JSON.stringify(spot));
    const r = JSON.parse(await p.eval(`(() => {
      const GM = G.game, P = G.player, K = G.input.keys, out = {};
      const crouch = () => { K.ControlLeft = true; G.input.pressed.ControlLeft = true; GM.step(1 / 60, 1); };   // (I.pressed is a new object every frame)
      // 1. a sprint's very first step (slow): crouch slides
      __place(); K.KeyW = true; K.ShiftLeft = true; GM.step(1 / 60, 1);
      out.slow = { sprinting: P.sprinting, v0: +P.speedH.toFixed(2) };
      const p0 = P.pos.clone(); crouch(); out.slow.sliding = P.sliding; out.slow.v1 = +P.speedH.toFixed(2);
      let n = 0; while (P.sliding && n++ < 120) GM.step(1 / 60, 1);
      out.slow.dist = +P.pos.distanceTo(p0).toFixed(2); out.slow.t = +(n / 60).toFixed(2);
      // 2. a full sprint: as it always was
      __place(); K.KeyW = true; K.ShiftLeft = true; GM.step(1 / 60, 40);
      out.full = { sprinting: P.sprinting, v0: +P.speedH.toFixed(2) }; crouch(); out.full.sliding = P.sliding; out.full.v1 = +P.speedH.toFixed(2);
      // 2b. 滑走 stacked (+95%): out of a full run, the whole of it, as before
      { const sb = P.stats.slideBoost; __place(); P.stats.slideBoost = 0.95; K.KeyW = true; K.ShiftLeft = true; GM.step(1 / 60, 40); crouch(); out.boost = { sliding: P.sliding, v1: +P.speedH.toFixed(2) }; P.stats.slideBoost = sb; }
      __place(); K.KeyW = true; K.ShiftLeft = true; GM.step(1 / 60, 40); crouch();
      // 3. the slide-jump: the run goes on through the air and after the landing; crouch again on the ground slides again
      GM.step(1 / 60, 4); K.Space = true; G.input.pressed.Space = true; GM.step(1 / 60, 1); K.Space = false; GM.step(1 / 60, 1);   // (the run is taken up again the frame after the jump)
      out.sj = { air: !P.grounded, sjRun: !!P._sjRun, sprintAir: P.sprinting };
      K.ControlLeft = false; n = 0; while (!P.grounded && n++ < 120) GM.step(1 / 60, 1); GM.step(1 / 60, 3);
      out.sj.landedSprint = P.sprinting; crouch(); out.sj.again = P.sliding;
      // 4. fast but not sprinting (thrown by a blast, down a slope): a crouch, no slide
      __place(); K.KeyW = true; GM.step(1 / 60, 10);
      const f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }; P.vel.x = f.x * 15; P.vel.z = f.z * 15; P.speedH = 15;
      crouch(); out.fast = { sprinting: P.sprinting, sliding: P.sliding, crouching: P.crouching, v: +P.speedH.toFixed(2) };
      // 5. standing still with crouch: no slide
      __place(); crouch(); out.still = { sliding: P.sliding, crouching: P.crouching };
      // 6. slowed (鈍化): the slide is held down with the run
      __place(); P.st.slow = 9; P.st.slowLv = 1; K.KeyW = true; K.ShiftLeft = true; GM.step(1 / 60, 40);
      out.slowed = { sprinting: P.sprinting, v0: +P.speedH.toFixed(2) }; P.st.slow = 9; crouch(); out.slowed.sliding = P.sliding; out.slowed.v1 = +P.speedH.toFixed(2);
      // 7. shooting while sliding does not end the slide
      __place(); K.KeyW = true; K.ShiftLeft = true; GM.step(1 / 60, 40); crouch(); G.input.mouse[0] = true; G.input.mpressed[0] = true; GM.step(1 / 60, 6); out.shootSlide = { sliding: P.sliding, shot: G.game.time - P.lastShotT < 0.2 }; G.input.mouse[0] = false;
      __place();
      return JSON.stringify(out);
    })()`));
    console.log('     ' + JSON.stringify(r));
    ok(r.slow.sprinting && r.slow.v0 < 4, `sprint: the first step of the run is slow (${r.slow.v0} m/s)`);
    ok(r.slow.sliding && r.slow.v1 > 5.5 && r.slow.v1 <= 9, `sprinting, however slow: crouch slides, not launched to the full slide speed (${r.slow.v1} m/s)`);
    ok(r.boost.sliding && Math.abs(r.boost.v1 - 12.8 * 1.95) < 0.8, `滑走 stacked: out of a full run the whole boost, as before (${r.boost.v1} m/s)`);
    ok(r.slow.dist > 1.2 && r.slow.t > 0.25 && r.slow.dist < r.slow.t * 9.7, `it goes somewhere, does not stop on the spot, and gains nothing on a run (${r.slow.dist} m in ${r.slow.t} s)`);
    ok(r.full.sprinting && r.full.sliding && Math.abs(r.full.v1 - 12.8) < 0.6, `out of a full sprint (${r.full.v0} m/s) a slide as before (${r.full.v1} m/s)`);
    ok(r.sj.air && r.sj.sjRun && r.sj.sprintAir, 'a slide-jump keeps the run in the air');
    ok(r.sj.landedSprint && r.sj.again, 'after landing the run goes on, and crouch slides again');
    ok(!r.fast.sprinting && !r.fast.sliding && r.fast.crouching, `fast (${r.fast.v} m/s) but not sprinting: a crouch, no slide`);
    ok(!r.still.sliding && r.still.crouching, 'standing: a crouch');
    ok(r.slowed.sprinting && r.slowed.sliding && r.slowed.v1 < 11 && r.slowed.v1 >= r.slowed.v0, `slowed: it slides, held down (${r.slowed.v0} -> ${r.slowed.v1} m/s)`);
    ok(r.shootSlide.sliding && r.shootSlide.shot, 'firing in a slide: the slide goes on');

    // ---------------- recoil (PC) ----------------
    const rc = JSON.parse(await p.eval(`(() => {
      const GM = G.game, P = G.player, W = G.weapons, I = G.input, R2D = 180 / Math.PI, out = {};
      const equip = (id, atts) => { const w = W.make(id); Object.assign(w.atts, atts || {}); w.ver = (w.ver || 0) + 1; P.weapons[0] = w; P.wIdx = 0; P.meleeMode = false; W.equip(true); W.switchT = 0; return w; };
      // a string of n shots (aimed or not, crouched or not): the climb after it, and where the view is 1.5 s after the last shot
      const string = (id, n, o) => {
        o = o || {}; __place(); const w = equip(id, o.atts); GM.step(1 / 60, 30);
        if (o.crouch) I.keys.ControlLeft = true; I.mouse[2] = !!o.ads; GM.step(1 / 60, 30);
        P.pitch = 0; P.resetRecoil(); let shots = 0, g = 0, peak = 0; const sh = W.shoot; W.shoot = function () { shots++; return sh.apply(this, arguments); };
        try {
          while (shots < n && g++ < 600) { w.mag = 999; I.mouse[0] = true; I.mpressed[0] = true; GM.step(1 / 60, 1); peak = Math.max(peak, P.pitch); }
          I.mouse[0] = false; GM.step(1 / 60, 8); peak = Math.max(peak, P.pitch);
          const k = []; for (let i = 0; i < 90; i++) { GM.step(1 / 60, 1); k.push(P.pitch); }
          return { climb: peak * R2D, after: k[k.length - 1] * R2D, at01: k[5] * R2D, at03: k[17] * R2D };
        } finally { W.shoot = sh; I.mouse[2] = false; I.keys.ControlLeft = false; }
      };
      const avg = (f) => { const a = [1, 2, 3, 4].map(() => f()); const m = {}; for (const k in a[0]) m[k] = +(a.reduce((s, x) => s + x[k], 0) / a.length).toFixed(3); return m; };
      out.ads = avg(() => string('a_ranger', 10, { ads: true }));
      out.hip = avg(() => string('a_ranger', 10, {}));
      out.crouch = avg(() => string('a_ranger', 10, { ads: true, crouch: true }));
      out.grip = avg(() => string('a_ranger', 10, { ads: true, atts: { under: 'u_vgrip' } }));
      out.all = avg(() => string('a_ranger', 10, { ads: true, atts: { under: 'u_stab', muzzle: 'm_brake', stock: 'k_heavy' } }));
      out.stock = avg(() => string('a_ranger', 10, { ads: true, atts: { stock: 'k_heavy' } }));
      __place();
      return JSON.stringify(out);
    })()`));
    console.log('     ' + JSON.stringify(rc));
    ok(rc.ads.climb >= 2.7 && rc.ads.climb <= 5, `rifle, 10 shots aimed: the view climbs ${rc.ads.climb} deg (about 3-5)`);
    ok(rc.ads.after > rc.ads.climb * 0.3 && rc.ads.after < rc.ads.climb * 0.8, `part of it comes back, not all (${rc.ads.after} deg left)`);
    ok(rc.ads.at01 > rc.ads.at03 && rc.ads.climb - rc.ads.at01 < (rc.ads.climb - rc.ads.after) * 0.6, `the way back is eased, not snapped (0.1 s: ${rc.ads.at01}, 0.3 s: ${rc.ads.at03})`);
    ok(rc.hip.climb > rc.ads.climb * 1.25, `from the hip it climbs more (${rc.hip.climb})`);
    ok(rc.crouch.climb < rc.ads.climb * 0.9, `crouched it climbs less (${rc.crouch.climb})`);
    ok(rc.grip.climb < rc.ads.climb * 0.8, `a vertical grip takes off a clear share (${rc.grip.climb})`);
    ok(rc.stock.after < rc.ads.after * 0.75, `a heavy stock brings more of it back (${rc.stock.after} left)`);
    ok(rc.all.climb > rc.ads.climb * 0.3 && rc.all.climb < rc.ads.climb * 0.6, `every recoil part on: much less, never none (${rc.all.climb})`);

    // ---------------- the phone: same slide rule, softer recoil ----------------
    const M = await boot(true);
    ok(!!M.spot, 'phone: a line to run on');
    const m = JSON.parse(await M.p.eval(`(() => {
      const GM = G.game, P = G.player, W = G.weapons, out = {};
      const zone = document.getElementById('m-stickzone'), zr = zone.getBoundingClientRect(), cx = zr.left + zr.width * 0.5, cy = zr.top + zr.height * 0.6;
      const pe = (el, t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const btn = document.querySelector('[data-id=crouch]'), br = btn.getBoundingClientRect();
      const crouch = () => { pe(btn, 'pointerdown', 52, br.left + 5, br.top + 5); GM.step(1 / 60, 1); };
      const lift = () => { pe(btn, 'pointerup', 52, br.left + 5, br.top + 5); };
      // the stick pushed all the way forward: a run; the crouch button slides
      __place(); pe(zone, 'pointerdown', 51, cx, cy); pe(zone, 'pointermove', 51, cx, cy - 300); GM.step(1 / 60, 2);
      out.run = { sprinting: P.sprinting, v0: +P.speedH.toFixed(2) }; crouch(); out.run.sliding = P.sliding; out.run.v1 = +P.speedH.toFixed(2); lift();
      pe(zone, 'pointerup', 51, cx, cy - 300); GM.step(1 / 60, 30);
      // pushed only part of the way (a walk), thrown fast: the button crouches
      __place(); pe(zone, 'pointerdown', 53, cx, cy); pe(zone, 'pointermove', 53, cx, cy - 25); GM.step(1 / 60, 10);
      const f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }; P.vel.x = f.x * 15; P.vel.z = f.z * 15; P.speedH = 15;
      crouch(); out.walk = { sprinting: P.sprinting, sliding: P.sliding, crouching: P.crouching }; lift(); pe(zone, 'pointerup', 53, cx, cy - 25);
      // the recoil a touch aim gets: the same shot, the phone's share
      __place(); const w = W.make('a_ranger'); P.weapons[0] = w; P.wIdx = 0; W.equip(true); const s = W.stats(w);
      const r = Math.random; Math.random = () => 0.5; P.resetRecoil(); W.adsT = 1; W.recoilShot(w, s); out.touch = P.rc.pp;
      window.G_MOBILE = false; w.rcH = 0; w.rcT = undefined; w.rcN = 0; P.resetRecoil(); W.recoilShot(w, s); out.mouse = P.rc.pp; window.G_MOBILE = true; Math.random = r; P.resetRecoil(); W.adsT = 0;
      __place();
      return JSON.stringify(out);
    })()`));
    console.log('     ' + JSON.stringify(m));
    ok(m.run.sprinting && m.run.sliding, `phone: the stick all the way forward runs, the crouch button slides (${m.run.v0} -> ${m.run.v1} m/s)`);
    ok(!m.walk.sprinting && !m.walk.sliding && m.walk.crouching, 'phone: a walk, however fast you are thrown: the button crouches');
    ok(Math.abs(m.touch / m.mouse - 0.6) < 0.02, `phone: touch aim gets 0.6 of the recoil (${(m.touch / m.mouse).toFixed(2)})`);
    const errs = (p.errs || []).concat(M.p.errs || []);
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nFEEL TEST FAILED (${fails})` : '\nFEEL TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
