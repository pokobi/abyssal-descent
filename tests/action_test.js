'use strict';
// Actions that take the hands for a while run one at a time: start another and the one under way is put down (the one started last
// goes on). Every pair is tried for real, with the game's own keys: A is started, then B, and what is under way a few frames later
// is written in a table:
//   中 = A was put down, B goes on      止 = B did not start, A goes on      両 = both go on      無 = neither      - = cannot be tried
//   (A and B the same key: what that key does again)
// Then the details: a reload put down starts over; a shotgun keeps the shells already in; an item put down before it takes effect is
// given back; an item in the hands is put down by a fresh press of fire / the sights (held from before: not); a frozen player's melee swing stops; aiming down the sights makes a small sound, not again within 0.25 s.
//   node tests/action_test.js            (COOP_PORT: the port; RECORD=1: only print the table, no checks)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9893;
const RECORD = !!process.env.RECORD;

// ---- in the page ----
function page() {
  const GM = G.game, P = G.player, W = G.weapons, I = G.input, A = G.abilities, IA = G.ItemAnim, GH = G.GrenHold, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const dt = 1 / 60;
  G.enemies.clear(); GM.objective = null; GM.waves = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  G.renderer.render = () => {}; G.renderer.compile = () => {};
  const S0 = G.save.data.settings; S0.autoSprint = false; S0.crouchToggle = false;
  const w = G.world;
  // a long clear flat line, open above, with a wall at its end (for the grapple)
  let spot = null;
  for (let tries = 0; tries < 900 && !spot; tries++) {
    const c = w.randomOpenCell({ next: Math.random }, () => true); if (!c) continue;
    for (let a = 0; a < 8 && !spot; a++) {
      const yaw = a * Math.PI / 4, fx = -Math.sin(yaw), fz = -Math.cos(yaw); let ok = true;
      for (let d = -1; d <= 8 && ok; d += 0.5) {
        const x = c.x + fx * d, z = c.z + fz * d, g = w.groundAt(V(x, c.y + 0.3, z), 0.35, 0.8);
        if (!(Math.abs(g - c.y) < 0.03) || !w.boxFree(x - 0.45, c.y + 0.05, z - 0.45, x + 0.45, c.y + 9, z + 0.45)) ok = false;
      }
      if (!ok) continue;
      const h = w.raycast(V(c.x, c.y + 1.6, c.z), V(fx, 0, fz), 38);
      if (h && h.t > 9) spot = { x: c.x, y: c.y, z: c.z, yaw };
    }
  }
  if (!spot) return JSON.stringify({ err: 'no spot' });
  const gun1 = W.make('a_ranger'), gun2 = W.make('g_breacher');
  let holds = { keys: {}, mouse: [false, false, false, false, false] }, shots = 0;
  const sh0 = W.shoot; W.shoot = function () { shots++; return sh0.apply(this, arguments); };
  // one frame: what is held down, and what is pressed in this frame (keys; a mouse button)
  const frame = (press, mb) => {
    I.keys = Object.assign({}, holds.keys); I.mouse = holds.mouse.slice();
    for (const c of press || []) { I.keys[c] = true; I.pressed[c] = true; }
    if (mb !== undefined) { I.mouse[mb] = true; I.mpressed[mb] = true; }
    GM.step(dt, 1);
  };
  const frames = (n) => { for (let i = 0; i < n; i++) frame(); };
  const dummy = { pos: null };
  const reset = (melee) => {
    holds = { keys: {}, mouse: [false, false, false, false, false] }; I.keys = {}; I.mouse = [false, false, false, false, false];
    GM.state = 'playing'; P.elFrozen = 0;
    if (G.InvUI.isOpen()) G.InvUI.close();
    if (GM.search) GM.cancelSearch(); A.useQueue = null; if (GH.active()) GH.putAway(true); if (IA.busy()) IA.abort(); P.healGauge = null;
    if (P.sliding) P.endSlide(); P.pileState = null; P.pileCd = 0; P.mantle = null;
    if (P.grapple.state !== 'none') P.detachGrapple(false); P.grappleCd = 0;
    P.pos.set(spot.x, spot.y + 0.01, spot.z); P.vel.set(0, 0, 0); P.yaw = spot.yaw; P.pitch = 0; P.grounded = true; P.crouching = false; P.sprintToggle = false; P.sprinting = false;
    P.hp = 40; if (P.resetRecoil) P.resetRecoil();
    for (const g of [gun1, gun2]) { g.reloading = false; g.reloadT = 0; g.mag = Math.max(1, W.stats(g).mag - 4); }
    P.weapons = [gun1, gun2]; P.wIdx = 0; P.wOrder = null; P.meleeMode = !!melee; W.equip(true);
    W.switchT = 0; W.adsT = 0; W.anim.throwT = 0;
    P.inv = { h_bandage: 6, h_medkit: 4 }; P.isel.c1 = 'h_bandage'; P.isel.c2 = 'h_medkit'; P.grenades = { g_frag: 5 }; P.grenadeSel = 'g_frag';
    for (const sk of P.skills) if (sk) { sk.cd = 0; if (sk.maxCharges) sk.charges = sk.maxCharges; }
    for (let i = 0; i < 40 && W.meleePhase && W.meleePhase() !== 'idle'; i++) frame();
    frames(6);
  };
  const sk2 = () => P.skills[1] || P.skills[2] || P.skills[3];
  // the actions: start (with the game's keys), on (is it under way), hold (what stays held down while it goes on), mode (gun / melee)
  const ACT = {
    reload: { mode: 'gun', start() { frame(['KeyR']); }, on: () => !!(P.weapon && P.weapon.reloading) },
    item: { start() { frame(['Digit4']); frame(); }, on: () => !!IA.left('h_bandage') },
    // (another item: the medkit, from whichever pocket it is in; selected there, its key pressed)
    item2: { start() { const sl = ['c1', 'c2'].find((q) => P.slotItems(q).includes('h_medkit')) || 'c1'; P.isel[sl] = 'h_medkit'; frame([sl === 'c1' ? 'Digit4' : 'Digit5']); frame(); }, on: () => !!IA.left('h_medkit') },
    queue: { start() { A.queueUse('h_bandage', 3); frame(); }, on: () => !!A.useQueue },
    grenade: { start() { frame(['KeyG']); frame(); frames(3); }, on: () => GH.active() },
    swing: { mode: 'melee', start() { frame(null, 0); }, on: () => W.meleePhase() === 'light' },
    heavy: { mode: 'melee', start() { frame(null, 2); }, on: () => /^h/.test(W.meleePhase()) },
    guard: { mode: 'melee', hold: { keys: ['KeyR'] }, start() { frames(2); }, on: () => W.guarding() },
    switch: { start() { frame([P.meleeMode ? 'Digit1' : 'Digit2']); }, on: () => W.switchT > 0 || W.meleePhase() === 'draw' },
    search: { start() { GM.startSearch(dummy, G.camera.position.clone().addScaledVector(P.forward(), 1.4), 3, '🔒', () => {}, 'test'); frame(); }, on: () => !!GM.search },
    pile: { start() { P.pos.y += 7; P.grounded = false; P.vel.set(0, 0, 0); frame(); frame(['ControlLeft']); }, on: () => !!P.pileState },
    slide: { hold: { keys: ['KeyW', 'ShiftLeft'] }, start() { frames(20); holds.keys.ControlLeft = true; frame(['ControlLeft']); }, on: () => P.sliding },
    ads: { mode: 'gun', hold: { mouse: [2] }, start() { frames(24); }, on: () => W.adsT > 0.5 && W._wantAds !== false },   // (_wantAds: the sights wanted up this frame, weapons.js)
    sprint: { hold: { keys: ['KeyW', 'ShiftLeft'] }, start() { frames(8); }, on: () => P.sprinting },
    bag: { start() { G.InvUI.open(null); frame(); }, on: () => G.InvUI.isOpen() },
    // instant ones (B only): did it happen
    fire: { mode: 'gun', start() { shots = 0; holds.mouse[0] = true; frame(null, 0); frames(3); }, on: () => shots > 0 },
    skill: { start() { const k = sk2(); this.c0 = k ? [k.cd, k.charges] : null; frame([['KeyX', 'KeyZ', 'KeyV'][P.skills.indexOf(k) - 1]]); }, on() { const k = sk2(); return !!(k && this.c0 && (k.cd > this.c0[0] || (k.maxCharges && k.charges < this.c0[1]))); } },
    jump: { start() { frame(['Space']); }, on: () => !P.grounded },
    grapple: { start() { frame(['KeyF']); frame(); }, on: () => P.grapple.state !== 'none' },
  };
  // (the bag open: the game takes no keys but the moving ones then, game.js - not tried here; its own use button uses an item: the item column)
  const ROWS = ['reload', 'item', 'queue', 'grenade', 'swing', 'heavy', 'guard', 'switch', 'search', 'pile', 'slide', 'ads', 'sprint'];
  const COLS = ['reload', 'item', 'item2', 'grenade', 'swing', 'heavy', 'guard', 'switch', 'search', 'pile', 'fire', 'skill', 'ads', 'jump', 'grapple', 'slide', 'bag'];
  const out = {};
  for (const a of ROWS) {
    out[a] = {};
    for (const b of COLS) {
      const Aa = ACT[a], Bb = ACT[b];
      if (Aa.mode && Bb.mode && Aa.mode !== Bb.mode) { out[a][b] = '-'; continue; }
      if (a === 'pile' && (b === 'pile' || b === 'slide' || b === 'jump')) { out[a][b] = '-'; continue; }
      if (a === 'bag' && b === 'bag') { out[a][b] = '-'; continue; }
      try {
        reset((Aa.mode || Bb.mode) === 'melee');
        const add = (h) => { if (!h) return; for (const k of h.keys || []) holds.keys[k] = true; for (const m of h.mouse || []) holds.mouse[m] = true; };
        add(Aa.hold); Aa.start();
        if (!Aa.on()) { out[a][b] = '?A'; continue; }
        add(Bb.hold); Bb.start(); frames(2);
        const ao = !!Aa.on(), bo = !!Bb.on();
        out[a][b] = ao && bo ? '両' : ao ? '止' : bo ? '中' : '無';
      } catch (e) { out[a][b] = 'E:' + e.message.slice(0, 40); }
    }
  }
  // ---- the details ----
  const D = {};
  const toasts = []; const ts0 = G.ui.toastSmall, fd0 = G.ui.feed; G.ui.toastSmall = function (m) { toasts.push(String(m)); return ts0.apply(this, arguments); }; G.ui.feed = function (m) { toasts.push(String(m)); return fd0.apply(this, arguments); };
  const secs = (t) => frames(Math.round(t / dt));
  // a reload put down halfway starts over
  reset(false); frame(['KeyR']); const rd = P.weapon.reloadDur; secs(rd * 0.5); const mag0 = P.weapon.mag;
  toasts.length = 0; frame(['Digit4']); frame();
  D.reloadCut = { reloading: P.weapon.reloading, mag: P.weapon.mag - mag0, said: toasts.join(' / ') };
  for (let i = 0; i < 600 && IA.busy(); i++) frame();
  frame(['KeyR']); D.reloadCut.restart = +(P.weapon.reloadT / P.weapon.reloadDur).toFixed(3);
  // a shotgun loaded shell by shell keeps the shells already in
  reset(false); frame(['Digit2']); secs(0.5); P.weapon.mag = 1; const sm = W.stats(P.weapon).mag; frame(['KeyR']); const srd = P.weapon.reloadDur; const sAt = [];
  for (const f of [0.1, 0.3, 0.45]) { secs(srd * f - (sAt.length ? [0.1, 0.3, 0.45][sAt.length - 1] * srd : 0)); sAt.push(P.weapon.mag); }   // (the counter while the shells go in)
  secs(srd * 0.15);
  frame(['Digit4']); frame(); D.shells = { mag: P.weapon.mag, max: sm, reloading: P.weapon.reloading, during: sAt };
  // an item put down before it takes effect is given back; after, it is spent
  reset(false); const n0 = P.itemCount('h_bandage'), hp0 = P.hp; frame(['Digit4']); frame(); secs(0.3); toasts.length = 0; frame(['KeyR']); frame();
  D.itemBack = { count: P.itemCount('h_bandage') - n0, hp: P.hp - hp0, gauge: !!P.healGauge, busy: IA.busy(), said: toasts.join(' / ') };
  reset(false); const n1 = P.itemCount('h_bandage'), hp1 = P.hp; frame(['Digit4']); frame(); secs(((IA.left('h_bandage') || [1])[0]) + 0.1); frame(['KeyR']); frame();   // (just after the bandage has taken effect: itemanim.js PLAN)
  D.itemSpent = { count: P.itemCount('h_bandage') - n1, healed: P.hp > hp1 };
  // the same item's key again: nothing changes
  reset(false); frame(['Digit4']); frame(); secs(0.2); const l0 = IA.left('h_bandage'); frame(['Digit4']); frame(); const l1 = IA.left('h_bandage');
  D.sameKey = { still: !!l1, on: !!(l0 && l1 && l1[1] < l0[1]) };
  // an item in the hands put down by a fresh press of fire / the sights (abilities.js tickUseCut): given back before it takes effect,
  // kept after; the weapon comes back up over a draw no longer than what was left of the use, then fires / aims if the button is held
  {
    // (the heal over time of an earlier bandage stopped: it would be taken for this one's)
    const rst = (m) => { reset(m); P.temps.clear(); P.recalc(); P.hp = 40; };
    const cut = {}, use = () => { frame(['Digit4']); frame(); };
    // (fire, before the effect: a click, held on)
    rst(false); const n0 = P.itemCount('h_bandage'), hp0 = P.hp; use(); secs(0.3); const lf = IA.left('h_bandage'); shots = 0; toasts.length = 0;
    holds.mouse[0] = true; frame(null, 0);
    cut.fire = { busy: IA.busy(), count: P.itemCount('h_bandage') - n0, hp: P.hp - hp0, gauge: !!P.healGauge, raise: +W.switchT.toFixed(3), left: lf && +lf[1].toFixed(3), said: toasts.join(' / ') };
    frames(3); cut.fire.shotInDraw = shots; secs(0.5); cut.fire.shotAfter = shots;
    // (a gun that fires a shot a pull: held through the draw, it fires with no new press)
    rst(false); frame(['Digit2']); secs(0.5); shots = 0; use(); secs(0.3); holds.mouse[0] = true; frame(null, 0); secs(0.6); cut.semi = { busy: IA.busy(), shots };
    // (the sights)
    rst(false); use(); secs(0.3); holds.mouse[2] = true; frame(null, 2); cut.ads = { busy: IA.busy(), count: P.itemCount('h_bandage') }; secs(0.4 + W.stats(P.weapon).adsTime * 1.5); cut.ads.adsT = +W.adsT.toFixed(2);
    // (held down before the use began: nothing, until it is let go and pressed again)
    rst(false); holds.mouse[0] = true; holds.mouse[2] = true; frames(3); use(); secs(0.3); cut.held = { on: !!IA.left('h_bandage') };
    holds.mouse[0] = false; frame(); holds.mouse[0] = true; frame(null, 0); cut.held.again = !IA.busy();
    // (the mobile fire button: pressed each frame while held - held before the use, it does nothing)
    rst(false); holds.mouse[0] = true; frame(null, 0); use(); for (let i = 0; i < 20; i++) frame(null, 0); cut.mobile = { on: !!IA.left('h_bandage') };
    // (after the effect: kept, the rest of the motion cut short; the draw no longer than what was left)
    rst(false); const n2 = P.itemCount('h_bandage'), hp2 = P.hp; use(); secs((IA.left('h_bandage') || [1])[0] + 0.04); const l2 = IA.left('h_bandage');
    frame(null, 0); cut.after = { applied: !!l2 && l2[0] === 0, busy: IA.busy(), count: P.itemCount('h_bandage') - n2, raise: +W.switchT.toFixed(3), left: l2 && +l2[1].toFixed(3) }; secs(0.6); cut.after.healed = P.hp > hp2;
    // (the bag open: not put down)
    rst(false); use(); secs(0.3); G.InvUI.open(null); frame(null, 0); frame(null, 2); cut.bag = { on: !!IA.left('h_bandage') }; G.InvUI.close();
    // (a queue: stopped, said as before)
    rst(false); const n3 = P.itemCount('h_bandage'); A.queueUse('h_bandage', 3); frame(); secs(0.3); toasts.length = 0; frame(null, 0);
    cut.queue = { queue: !!A.useQueue, busy: IA.busy(), count: P.itemCount('h_bandage') - n3, said: toasts.join(' / ') };
    // (melee: a swing / a heavy blow once the draw is done, the button held)
    rst(true); use(); secs(0.3); holds.mouse[0] = true; frame(null, 0); const mb = IA.busy(); secs(0.45); cut.swing = { busy: mb, phase: W.meleePhase() };
    rst(true); use(); secs(0.3); holds.mouse[2] = true; frame(null, 2); const mh = IA.busy(); secs(0.45); cut.heavy = { busy: mh, phase: W.meleePhase() };
    D.cut = cut;
  }
  // frozen solid in the middle of a heavy blow: the blow stops there
  reset(true); frame(null, 2); secs(0.1); const ph0 = W.meleePhase(); G.Elem.freezePlayer(); frame(); D.freezeSwing = { before: ph0, after: W.meleePhase() }; G.Elem.thawPlayer(true); P.frzGrace = 0;
  // a revive (co-op) is one of the hands' actions too: a module's own hook is put down like the rest
  reset(false); let rvOn = true; P.handsHooks = P.handsHooks || {}; const hk0 = P.handsHooks.test; P.handsHooks.test = { active: () => rvOn, stop: () => { rvOn = false; }, word: 'test' };
  frame(['KeyR']); D.hook = { stopped: !rvOn }; delete P.handsHooks.test; if (hk0) P.handsHooks.test = hk0;
  // the sights up: one small sound, not again within 0.25 s
  reset(false); const grabs = []; const mech0 = G.sfx.mech; G.sfx.mech = function (k) { if (k === 'grab') grabs.push(GM.time); return mech0.apply(this, arguments); };
  holds.mouse[2] = true; frames(3); holds.mouse[2] = false; frames(3); holds.mouse[2] = true; frames(3); const g1 = grabs.length;
  holds.mouse[2] = false; frames(30); holds.mouse[2] = true; frames(3); holds.mouse[2] = false; frames(2);
  G.sfx.mech = mech0; D.adsSound = { quick: g1, later: grabs.length };
  // a skill or the ultimate put to use in the middle of a reload puts the reload down (a shotgun keeps the shells already in); pressed
  // while it cannot be used (on its cooldown) it leaves the reload going. (A skill and an ultimate used on yourself: no aim needed)
  {
    const keep = P.skills.slice();
    P.skills[1] = A.makeSlot('thornarmor'); P.skills[0] = A.makeSlot('ult_bastion');
    const sk = P.skills[1], ult = P.skills[0];
    const row = (gun, mag, frac, act) => {
      reset(false); P.temps.clear(); P.recalc();
      P.wIdx = P.weapons.indexOf(gun); W.equip(true); W.switchT = 0; frames(30);
      gun.mag = mag; toasts.length = 0; W.startReload(gun, W.stats(gun)); const dur = gun.reloadDur;
      secs(dur * frac); const at = gun.mag;
      act(); frames(2);
      const r = { max: W.stats(gun).mag, at, reloading: gun.reloading, mag: gun.mag, said: toasts.join(' / ') };
      secs(dur * 1.2); r.later = gun.mag; r.reloadingLater = gun.reloading;
      return r;
    };
    const cast = (s, cd) => () => { s.cd = cd; if (s.maxCharges) s.charges = cd ? 0 : s.maxCharges; A.cast(s); };
    D.skillReload = {
      skill: row(gun1, 5, 0.5, cast(sk, 0)), skillShells: row(gun2, 1, 0.6, cast(sk, 0)), skillOnCd: row(gun1, 5, 0.5, cast(sk, 5)),
      ult: row(gun1, 5, 0.5, cast(ult, 0)), ultShells: row(gun2, 1, 0.6, cast(ult, 0)), ultOnCd: row(gun1, 5, 0.5, cast(ult, 30)),
    };
    P.temps.clear(); P.skills = keep; P.recalc();
  }
  // the pile driver's label (#pile-ind) goes with the slam however it ends: landed, fallen into the pit, dead and risen, carried off
  {
    const el = document.getElementById('pile-ind'), shown = () => !!el && !el.classList.contains('hidden');
    const start = () => { reset(false); G.enemies.clear(); P.dead = false; P.hp = P.stats.maxHp; P.pileState = null; P.pileCd = 0; P.pos.set(spot.x, spot.y + 7, spot.z); P.vel.set(0, 0, 0); P.grounded = false; P.lastSafe.copy(V(spot.x, spot.y + 0.05, spot.z)); frame(); P.startPile(); frames(3); return shown(); };
    const pl = {};
    { const on = start(); secs(2); pl.landed = { on, after: shown(), state: P.pileState }; }
    { const on = start(); P.fellInPit(); frames(5); pl.pit = { on, after: shown(), state: P.pileState }; }
    // (dead in the middle of it, then risen again: game.js's revive puts pileState to null)
    { const on = start(); P.dead = true; frames(3); const dead = shown(); P.dead = false; P.deathT = 0; P.pileState = null; P.pos.set(spot.x, spot.y + 0.05, spot.z); P.vel.set(0, 0, 0); frames(5); pl.revived = { on, whileDead: dead, after: shown(), state: P.pileState }; }
    // (carried off by a guardian, bosses6.js: pileState put to null from outside)
    { const on = start(); P.pileState = null; frames(3); pl.carried = { on, after: shown() }; }
    D.pileLabel = pl;
  }
  G.ui.toastSmall = ts0; G.ui.feed = fd0;
  reset(false);
  return JSON.stringify({ spot, rows: ROWS, cols: COLS, out, D });
}

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.booted();
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.running();
    await p.eval("(() => { G.Run.field = () => 'dusk'; G.game.seed = 4242; G.game.area = 1; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(2, 'combat'); })(); 1");
    await p.until("G.world && G.world.field === 'dusk' && G.game.state === 'playing' && !G.game.transitioning", 40000).catch(() => {});
    await sleep(1500);
    const r = JSON.parse(await p.eval('(' + page.toString() + ')()'));
    if (r.err) { ok(false, r.err); throw new Error(r.err); }
    const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length * (/[^\x00-\x7f]/.test(s) ? 2 : 1)));
    console.log('A \\ B     ' + r.cols.map((c) => pad(c, 8)).join(''));
    for (const a of r.rows) console.log(pad(a, 10) + r.cols.map((b) => pad(r.out[a][b], 8)).join(''));
    if (!RECORD) {
      // what has to hold: an action that takes the hands, started while another one is under way, puts that one down (中); in the pile
      // driver's slam none begins (止); firing breaks off a search; a reload / an item / a draw keep the gun from firing (止, as before)
      const HANDS = ['reload', 'item', 'queue', 'grenade', 'swing', 'heavy', 'guard', 'switch', 'search'];
      const BH = ['reload', 'item2', 'grenade', 'switch', 'search', 'pile'];
      const MELEE = ['swing', 'heavy', 'guard'];
      const bad = [];
      for (const a of HANDS) for (const b of BH) {
        const v = r.out[a][b]; if (v === '-') continue;
        if (a === b) continue;
        const want = '中';
        if (v !== want) bad.push(`${a}→${b} ${v}`);
      }
      for (const b of ['reload', 'item2', 'grenade', 'switch', 'search', 'swing', 'heavy', 'guard', 'fire']) if (r.out.pile[b] !== '止') bad.push(`pile→${b} ${r.out.pile[b]}`);
      for (const a of ['reload', 'switch']) if (r.out[a].fire !== '止') bad.push(`${a}→fire ${r.out[a].fire}`);
      if (r.out.search.fire !== '中') bad.push(`search→fire ${r.out.search.fire}`);
      if (r.out.search.ads !== '止') bad.push(`search→ads ${r.out.search.ads}`);
      // (an item in the hands is put down by a fresh press of fire / the sights / a melee attack: 無 while the weapon comes back up, 中 after)
      for (const b of ['fire', 'ads', 'swing', 'heavy']) for (const a of ['item', 'queue']) if (!['無', '中'].includes(r.out[a][b])) bad.push(`${a}→${b} ${r.out[a][b]} (a fresh press puts the item down)`);
      for (const b of ['item2', 'search']) if (r.out.ads[b] !== '中') bad.push(`ads→${b} ${r.out.ads[b]}`);
      for (const a of MELEE) for (const b of MELEE) if (a !== b && r.out[a][b] !== '止') bad.push(`${a}→${b} ${r.out[a][b]} (the melee weapon's own order)`);
      for (const a of ['grenade']) for (const b of ['swing', 'heavy']) if (r.out[a][b] !== '止') bad.push(`${a}→${b} ${r.out[a][b]} (an attack waits, as firing does)`);
      ok(!bad.length, 'every pair as the rule says' + (bad.length ? ': ' + bad.join(', ') : ''));
      const D = r.D; console.log('     ' + JSON.stringify(D));
      ok(!D.reloadCut.reloading && D.reloadCut.mag === 0 && D.reloadCut.restart > 0.97, `a bandage puts a reload down; no rounds come in, and the next reload starts over (${D.reloadCut.restart})`);
      ok(/リロードを中断/.test(D.reloadCut.said), 'it says so: ' + D.reloadCut.said);
      ok(!D.shells.reloading && D.shells.mag > 1 && D.shells.mag < D.shells.max, `a shotgun put down at 60% keeps the shells already in (${D.shells.mag} of ${D.shells.max})`);
  { const d = D.shells.during; ok(d[0] >= 1 && d[1] > d[0] && d[2] > d[1] && d[2] <= D.shells.mag, `a shotgun's ammo counter goes up one shell at a time while it reloads (${d.join(' → ')} → ${D.shells.mag})`); }
      ok(D.itemBack.count === 0 && D.itemBack.hp === 0 && !D.itemBack.gauge && !D.itemBack.busy, 'a bandage put down before it takes effect is given back, no heal, no gauge');
      ok(/中断/.test(D.itemBack.said), 'it says so: ' + D.itemBack.said);
      ok(D.itemSpent.count === -1 && D.itemSpent.healed, 'one put down after it took effect is spent, and has healed');
      ok(D.sameKey.still && D.sameKey.on, 'the same item\'s key again changes nothing');
      const K = D.cut; console.log('     ' + JSON.stringify(K));
      ok(!K.fire.busy && K.fire.count === 0 && K.fire.hp === 0 && !K.fire.gauge && /中断/.test(K.fire.said), `a fresh click of fire puts the bandage down before it takes effect: given back, no heal (${K.fire.said})`);
      ok(K.fire.raise > 0.2 && K.fire.raise <= K.fire.left && K.fire.shotInDraw === 0 && K.fire.shotAfter > 0, `the gun comes back up over a draw (${K.fire.raise} s, no shot in it), then fires with the button held (${K.fire.shotAfter} shots)`);
      ok(!K.semi.busy && K.semi.shots > 0, `a gun that fires a shot a pull fires too, held through the draw with no new press (${K.semi.shots})`);
      ok(!K.ads.busy && K.ads.count === 6 && K.ads.adsT > 0.5, `a fresh press of the sights puts it down too (given back) and the sights come up, held (${K.ads.adsT})`);
      ok(K.held.on && K.held.again, 'a button held down from before the use does not put it down; let go and pressed again, it does');
      ok(K.mobile.on, 'the mobile fire button held from before the use (pressed each frame) does not put it down');
      ok(K.after.applied && !K.after.busy && K.after.count === -1 && K.after.healed && K.after.raise <= K.after.left + 1e-6, `pressed after it took effect: kept and healing, the rest of the motion cut short, back no later than its end (${K.after.raise} <= ${K.after.left})`);
      ok(K.bag.on, 'clicks with the bag open do not put it down');
      ok(!K.queue.queue && !K.queue.busy && K.queue.count === 0 && /まとめて使うのを中止/.test(K.queue.said), `a queue stops, the one in the hands given back (${K.queue.said})`);
      ok(K.swing.busy === false && K.swing.phase === 'light' && K.heavy.busy === false && /^h/.test(K.heavy.phase), `melee: a swing / a heavy blow puts it down and goes once the weapon is back, held (${K.swing.phase}, ${K.heavy.phase})`);
      ok(/^h/.test(D.freezeSwing.before) && D.freezeSwing.after === 'idle', `frozen solid in a heavy blow: the blow stops (${D.freezeSwing.before} -> ${D.freezeSwing.after})`);
      ok(D.hook.stopped, 'a module\'s own hands action (the co-op revive) is put down too');
      ok(D.adsSound.quick === 1 && D.adsSound.later === 2, `the sights up: a sound, not again within 0.25 s (${D.adsSound.quick}, then ${D.adsSound.later})`);
      ok(r.out.reload.skill === '中', `a skill used in a reload puts the reload down (the table's reload → skill: ${r.out.reload.skill})`);
      const SR = D.skillReload;
      for (const [k, who] of [['skill', 'a skill'], ['ult', 'the ultimate']]) {
        const a = SR[k], s = SR[k + 'Shells'], c = SR[k + 'OnCd'];
        ok(!a.reloading && a.mag === a.at && a.later === a.at && !a.reloadingLater && /リロードを中断/.test(a.said), `${who} in the middle of a rifle's reload puts it down: no rounds come in, and it says so (${a.at} -> ${a.mag}, later ${a.later}; ${a.said})`);
        ok(!s.reloading && s.mag > 1 && s.mag < s.max, `${who} in a shotgun's reload keeps the shells already in (${s.mag} of ${s.max})`);
        ok(c.reloading && c.later === c.max && !c.reloadingLater, `${who} pressed on its cooldown leaves the reload going, and it ends full (${c.later} of ${c.max})`);
      }
      const PL = D.pileLabel; console.log('     ' + JSON.stringify(PL));
      ok(PL.landed.on && !PL.landed.after, 'the pile driver\'s label shows during the slam and goes when it lands');
      ok(PL.pit.on && !PL.pit.after && !PL.pit.state, 'fallen into the pit in the middle of the slam: the label goes');
      ok(PL.revived.on && !PL.revived.after && !PL.revived.state, 'dead in the middle of the slam and risen again: the label goes');
      ok(PL.carried.on && !PL.carried.after, 'carried off in the middle of the slam (its state cleared from outside): the label goes');
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nACTION TEST FAILED (${fails})` : '\nACTION TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
