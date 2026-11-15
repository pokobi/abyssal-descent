'use strict';
// The frozen lake and the ice (field_frozen.js, fields.js, player.js):
//   A  under the ice is water: a tile broken under you drops you into it, you swim (hold jump: up and a hop at the face), you climb
//      out at the rim, under the ice that holds your head stays under its underside, sinking on DEEP metres down is the void; a foe
//      that goes in sinks and is lost; the broken tile is no way for the foes.
//   B  standing on ice leaves ice on you and on the foes on it (not on stone, not in the air, not on a flyer).
//   C  frozen solid (element.js): water and ice together freeze you as they freeze a foe (a blow, the ground); frozen, only the look:
//      every other key reads nothing, what was under way stops; 2.8 s, each fresh press of jump 0.22 s off but never under half;
//      2 s after a thaw nothing freezes you; blows land as they would; the ice on the screen, the word and the key.
//   node tests/freeze_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9877;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.until("document.getElementById('loading').classList.contains('done')", 180000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.running();
    await p.eval("(() => { G.Run.field = () => 'frozen'; G.game.seed = 4242; G.game.area = 7; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(8, 'combat'); })(); 1");
    await p.until("G.world && G.world.field === 'frozen' && !!G.world.iceTiles && !G.game.transitioning", 90000); await sleep(1500);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    // helpers in the page
    await p.eval(`(() => {
      const H = window.__F = {}, GM = G.game, w = () => G.world, V = (x, y, z) => new THREE.Vector3(x, y, z);
      H.K = G.input.keys; H.B = G.BIND;
      H.press = (a) => { H.K[H.B[a][0]] = true; G.input.pressed[H.B[a][0]] = true; };
      H.up = (a) => { H.K[H.B[a][0]] = false; };
      H.clear = () => { G.input.keys = H.K = {}; };
      H.reset = () => { G.enemies.clear(); GM.objective = null; GM.waves = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 }; GM.areaCleared = false; if (w().icicles) w().icicles.next = 1e9; if (w().sky && w().sky.el) w().sky = Object.assign({}, w().sky, { el: null }); };
      // a whole tile with its eight neighbours whole, nothing standing on it (skip: the n-th such)
      H.pick = (skip) => { let n = 0; const T = w().iceTiles;
        for (const t of T) { if (t.hp < 2) continue; const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
          const nb = T.filter((u) => Math.max(Math.abs((u.x0 + u.x1) / 2 - cx), Math.abs((u.z0 + u.z1) / 2 - cz)) < 3.1);
          if (nb.length < 9 || nb.some((u) => u.hp < 2) || !w().boxFree(t.x0 - 1, 0.05, t.z0 - 1, t.x1 + 1, 2.5, t.z1 + 1)) continue;
          if (n++ < (skip || 0)) continue; H.t = t; H.c = V(cx, 0, cz); return t; }
        return null; };
      H.breakIt = (t) => { t = t || H.t; const x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2; G.FieldGen.iceHit(w(), x, z, 0.5, 1); G.FieldGen.iceHit(w(), x, z, 0.5, 1); return t.hp; };
      H.mend = () => { for (const t of w().iceTiles) if (t.hp < 2) G.FieldGen.iceSet(w(), t.k, 2); };
      H.foe = (x, y, z, def) => { const e = G.enemies.spawn(def || G.ENEMIES.filter((d) => !d.special && !d.flyer && !d.hover && !d.custom && !d.boss && !d.burrow && (!d.fields || d.fields.includes('frozen')) && (d.unlockK ?? 0) <= 2)[0], 9, V(x, y, z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.au = null; return e; };
      return 1; })()`);

    // ================= A: the water under the ice
    const a = JSON.parse(await p.eval(`(() => {
      const H = __F, GM = G.game, P = G.player, w = G.world, out = {};
      H.reset(); const t = H.pick(); if (!t) return JSON.stringify({ err: 'no whole tile' });
      P.frzGrace = 1e9; // (no freezing in A: standing on the ice leaves ice on you, and the water would freeze you - that is C's)
      const d = w.deepWater && w.deepWater[0]; out.deep = d ? [d.y, d.open] : null; out.killY = w.killY;
      P.pos.set(H.c.x, 0.02, H.c.z); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0; GM.step(0.05, 6);
      out.onIce = { y: +P.pos.y.toFixed(2), g: P.grounded, inW: P.inWater, surf: P.surfaceBelow() };
      const ice = w.colliders.find((c) => c === t.col); out.iceUnder = ice ? ice.y0 : null;
      const z0 = w.waterZones.length; H.breakIt(); out.zoneAdded = w.waterZones.length === z0 + 1 && w.waterZones.includes(t.zone);
      // the broken ice: floes that drop into the hole and float in it
      out.floes0 = (w.floes || []).filter((f) => f.k === t.k).length;
      out.waterAt = !!G.Water.at(new THREE.Vector3(H.c.x, d.y, H.c.z));
      // fall in (nothing held): into the water, sinking
      let entered = -1, minY = 99; for (let i = 0; i < 20; i++) { GM.step(0.05, 1); minY = Math.min(minY, P.pos.y); if (entered < 0 && P.inWater && P.swimming) entered = i; }
      out.fell = { entered, y: +P.pos.y.toFixed(2), sw: P.swimming, inW: P.inWater, under: G.Water.underOn(), vy: +P.vel.y.toFixed(2) };
      { const fl = (w.floes || []).filter((f) => f.k === t.k); out.floes = { n: fl.length, wet: fl.filter((f) => f.wet && Math.abs(f.m.position.y - d.y) < 0.3).length, inHole: fl.every((f) => f.m.position.x > t.x0 && f.m.position.x < t.x1 && f.m.position.z > t.z0 && f.m.position.z < t.z1) }; }
      // the water's element (an element already on you stays: cleared first)
      P.au = null; GM.step(0.05, 8); out.wet = G.Elem.playerAura();
      // hold jump: up to the face and hopping at it
      H.press('jump'); let top = -99, bot = 99; for (let i = 0; i < 60; i++) { GM.step(0.05, 1); if (i > 30) { top = Math.max(top, P.pos.y); bot = Math.min(bot, P.pos.y); } }
      out.bob = { top: +top.toFixed(2), bot: +bot.toFixed(2), headOutMin: +(bot + P.eyeH - d.y).toFixed(2) };
      // forward at the rim with jump held: out onto the ice
      P.yaw = 0; H.press('forward'); let outI = -1; for (let i = 0; i < 80; i++) { GM.step(0.05, 1); if (P.grounded && P.pos.y > -0.05) { outI = i; break; } }
      H.clear(); GM.step(0.05, 4);
      out.climb = { i: outI, y: +P.pos.y.toFixed(2), g: P.grounded, surf: P.grounded ? P.surfaceBelow() : null };
      // back into the hole, a little way down and up again: no void
      let falls = 0; const fp0 = P.fellInPit; P.fellInPit = function () { falls++; return fp0.apply(this, arguments); };
      P.pos.set(H.c.x, d.y - 0.5, H.c.z); P.vel.set(0, 0, 0); GM.step(0.05, 30); const dip = P.pos.y; H.press('jump');
      for (let i = 0; i < 50; i++) GM.step(0.05, 1);
      H.clear(); out.dip = { y: +dip.toFixed(2), noVoid: falls === 0 && P.pos.y < 0 };
      // under the ice that holds: the head stays under its underside, you can swim back to the hole
      P.pos.set(H.c.x, d.y - 1.4, H.c.z - 3); P.vel.set(0, 0, 0); H.press('jump'); let hiLid = -99; for (let i = 0; i < 30; i++) { GM.step(0.05, 1); hiLid = Math.max(hiLid, P.pos.y); }
      const PW = G.Post && G.Post.water;
      out.lid = { top: +hiLid.toFixed(2), head: +(hiLid + P.height).toFixed(2), sw: P.swimming, under: G.Water.underOn(), eye: +(G.camera.position.y - d.y).toFixed(2), lidK: PW ? PW.lid : null, hole: PW && PW.lid ? [PW.open.x, PW.open.y] : null, tile: [t.x0, t.z0] };
      P.yaw = Math.PI; H.press('forward'); H.press('jump'); let back = -1; for (let i = 0; i < 120; i++) { GM.step(0.05, 1); if (P.grounded && P.pos.y > -0.05) { back = i; break; } }
      H.clear(); out.lidBack = back;
      // let go: sinking on down to the void (back on firm ground, a share of HP gone)
      GM.dev.god = false; P.hp = P.stats.maxHp; P.invulnT = 0;
      P.pos.set(H.c.x, d.y - 0.6, H.c.z); P.vel.set(0, 0, 0); let lowest = 99, back2 = -1;
      const f1 = falls; for (let i = 0; i < 120; i++) { GM.step(0.05, 1); if (P.pos.y < lowest) lowest = P.pos.y; if (falls > f1) { back2 = i; break; } }
      out.voidd = { lowest: +lowest.toFixed(2), t: +(back2 * 0.05).toFixed(2), falls: falls - f1, y: +P.pos.y.toFixed(2), hpLost: Math.round(P.stats.maxHp - P.hp) };
      delete P.fellInPit; GM.dev.god = true; P.hp = P.stats.maxHp;
      // the broken tile is no way for the foes
      const i = w.navIdx(H.c.x, H.c.z); out.nav = { nb: w.nb[i], nf: w.nf[i] };
      // a foe on the tile when it breaks: it sinks and is lost, its body on the ground by the hole
      H.mend(); GM.step(0.05, 2); const t2 = H.pick(1) || t; P.pos.set(w.spawn.x, w.spawn.y + 0.02, w.spawn.z); P.vel.set(0, 0, 0);
      const e = H.foe(H.c.x, 0.02, H.c.z); GM.step(0.05, 10); H.breakIt(t2);
      let dead = -1, eMin = 99; for (let k = 0; k < 100; k++) { GM.step(0.05, 1); if (e.alive) eMin = Math.min(eMin, e.pos.y); if (!e.alive) { dead = k; break; } }
      out.foe = { dead: dead * 0.05, min: +eMin.toFixed(2), bodyY: +e.pos.y.toFixed(2) };
      G.enemies.clear(); H.mend(); GM.step(0.05, 2);
      return JSON.stringify(out);
    })()`));
    console.log('A', JSON.stringify(a));
    if (a.err) ok(false, a.err); else {
      ok(a.deep && a.deep[1] && a.iceUnder != null && a.deep[0] < a.iceUnder && a.deep[0] > a.iceUnder - 0.1 && Math.abs(a.killY - (a.deep[0] - 7)) < 0.01, `A: the lake is deep water, its face right under the ice's underside (${a.deep}, ice from ${a.iceUnder}), the void ${a.deep && (a.deep[0] - a.killY).toFixed(1)} m under it`);
      ok(a.onIce.g && !a.onIce.inW && a.onIce.surf === 'ice', `A: on the ice you stand on ice, not in water (${JSON.stringify(a.onIce)})`);
      ok(a.zoneAdded && a.waterAt, 'A: a broken tile opens the water to the air (its pool in w.waterZones)');
      ok(a.floes0 >= 5 && a.floes.n === a.floes0 && a.floes.wet === a.floes.n && a.floes.inHole, `A: the broken ice drops into the hole as floes afloat in it (${a.floes0}, ${JSON.stringify(a.floes)})`);
      ok(a.fell.entered >= 0 && a.fell.sw && a.fell.inW && a.fell.y < -1.5 && a.fell.vy >= -2.5, `A: falling through, you are in the water, swimming, sinking slowly (${JSON.stringify(a.fell)})`);
      ok(a.wet === 'water', `A: the water leaves water on you (${a.wet})`);
      ok(a.bob.top > a.deep[0] && a.bob.headOutMin > 0, `A: holding jump you keep your head out, hopping at the face (${JSON.stringify(a.bob)})`);
      ok(a.climb.i >= 0 && a.climb.g && a.climb.y > -0.05, `A: moving at the rim with jump held you climb out onto the ice (${JSON.stringify(a.climb)})`);
      ok(a.dip.noVoid && a.dip.y < -2.5, `A: a little way down is no void (${JSON.stringify(a.dip)})`);
      ok(a.lid.top <= -2.25 && a.lid.head <= -0.45 && a.lid.sw && a.lid.under && a.lid.eye < 0, `A: under the ice that holds, your head stays under it, your eyes in the water (${JSON.stringify(a.lid)})`);
      ok(a.lid.lidK === 1 && a.lid.hole && a.lid.hole[0] === a.lid.tile[0] && a.lid.hole[1] === a.lid.tile[1], `A: under the ice the light comes only through the hole near by (${JSON.stringify(a.lid)})`);
      ok(a.lidBack >= 0, `A: from under the ice you swim back to the hole and out (${a.lidBack} steps)`);
      ok(a.voidd.falls === 1 && a.voidd.lowest < a.killY + 0.3 && a.voidd.lowest > a.killY - 1 && a.voidd.y > -0.2 && a.voidd.hpLost > 0, `A: sinking on is the void at ${a.killY}: back on firm ground, HP lost (${JSON.stringify(a.voidd)})`);
      ok(a.nav.nb === 1 || a.nav.nf > 5, `A: the broken tile is no way for the foes (${JSON.stringify(a.nav)})`); // (under the vault the nav's floor over a hole is the vault's top: out of reach, as device_test has it)
      ok(a.foe.dead > 0 && a.foe.dead < 4 && a.foe.min < -1.2 && a.foe.bodyY > -0.2, `A: a foe that goes in sinks and is lost, its body by the hole (${JSON.stringify(a.foe)})`);
    }

    // ================= B: the ice on whoever stands on ice
    const b = JSON.parse(await p.eval(`(() => {
      const H = __F, GM = G.game, P = G.player, w = G.world, EL = G.Elem, out = {}, V = (x, y, z) => new THREE.Vector3(x, y, z);
      H.reset(); H.mend(); const t = H.pick(); const s = w.spawn;
      const eIce = H.foe(H.c.x - 0.6, 0.02, H.c.z), eStone = H.foe(s.x + 2.5, s.y + 0.02, s.z + 2);
      const fd = G.ENEMIES.find((d) => d.flyer && !d.boss && !d.custom && !d.special && (d.unlockK ?? 0) <= 3), eFly = fd ? H.foe(H.c.x + 0.6, 1.6, H.c.z, fd) : null;
      P.pos.set(s.x, s.y + 0.02, s.z); P.vel.set(0, 0, 0); P.au = null;
      let first = -1; for (let i = 0; i < 20; i++) { GM.step(0.05, 1); if (first < 0 && EL.auraOf(eIce)) first = i; }
      out.foes = { first: first * 0.05, ice: EL.auraOf(eIce), stone: EL.auraOf(eStone), fly: eFly ? EL.auraOf(eFly) : 'none', flyY: eFly ? +eFly.pos.y.toFixed(1) : null };
      out.meStone = EL.playerAura();
      GM.step(0.05, 40); out.foeKept = +EL.auraLeft(eIce).toFixed(2);
      P.pos.set(H.c.x + 1, 0.02, H.c.z + 0.8); P.vel.set(0, 0, 0); P.au = null; GM.step(0.05, 6); out.meIce = EL.playerAura();
      GM.step(0.05, 40); out.meKept = P.au ? +(P.au.t - GM.time).toFixed(2) : 0;
      // held in the air over the ice
      P.au = null; for (let i = 0; i < 20; i++) { P.pos.set(H.c.x + 1, 2, H.c.z + 0.8); P.vel.set(0, 0, 0); P.grounded = false; GM.step(0.05, 1); }
      out.meAir = EL.playerAura();
      G.enemies.clear();
      return JSON.stringify(out);
    })()`));
    console.log('B', JSON.stringify(b));
    ok(b.foes.ice === 'ice' && b.foes.first >= 0 && b.foes.first <= 0.3, `B: a foe on the ice carries ice within a tick (${b.foes.first} s)`);
    ok(b.foeKept > 7, `B: kept topped up while it stands there (${b.foeKept} s left)`);
    ok(!b.foes.stone, `B: a foe on the stone shore carries none (${b.foes.stone})`);
    ok(b.foes.fly === 'none' || !b.foes.fly, `B: a flyer over the ice carries none (${b.foes.fly} at ${b.foes.flyY})`);
    ok(!b.meStone && b.meIce === 'ice' && b.meKept > 5, `B: you: none on stone, ice on the ice, kept up (${b.meStone}, ${b.meIce}, ${b.meKept} s)`);
    ok(!b.meAir, `B: none on you in the air over the ice (${b.meAir})`);
    // ================= C: frozen solid
    const c = JSON.parse(await p.eval(`(() => {
      const H = __F, GM = G.game, P = G.player, w = G.world, EL = G.Elem, I = G.input, B = G.BIND, out = {};
      H.reset(); H.mend(); G.enemies.clear(); GM.dev = { god: false, speed: 1 }; P.hp = P.stats.maxHp; P.invulnT = 0; P.frzGrace = 0;
      const s = w.spawn, home = () => { P.pos.set(s.x, s.y + 0.02, s.z); P.vel.set(0, 0, 0); P.au = null; P.frzGrace = 0; if (P.elFrozen > 0) EL.thawPlayer(true); GM.step(0.05, 4); };
      const thaw = () => { if (P.elFrozen > 0) EL.thawPlayer(true); P.frzGrace = 0; P.au = null; };
      // --- what freezes you: water and ice together, from a blow or from the ground
      home(); EL.envPlayer('water', 2.5); P._envBare = 0; P.au = { el: 'water', t: GM.time + 6 }; G.combat.damagePlayer(5, { src: 'ranged', el: 'ice' }); out.rainIce = P.elFrozen > 0; thaw();
      home(); P.au = { el: 'ice', t: GM.time + 6 }; G.combat.damagePlayer(5, { src: 'ranged', el: 'water' }); out.iceWater = P.elFrozen > 0; thaw();
      // wet, stepping out onto the lake's ice
      H.pick(); P.pos.set(H.c.x, 0.02, H.c.z); P.vel.set(0, 0, 0); P.au = { el: 'water', t: GM.time + 6 }; let k = -1; for (let i = 0; i < 10; i++) { GM.step(0.05, 1); if (k < 0 && P.elFrozen > 0) k = i; } out.wetOnIce = { k, fz: P.elFrozen > 0 }; thaw();
      // on the ice with ice on you, the ice breaks: into the water, frozen there, held afloat
      P.pos.set(H.c.x, 0.02, H.c.z); P.vel.set(0, 0, 0); P.au = null; GM.step(0.05, 6); out.iceOn = EL.playerAura();
      H.breakIt(); let fz = -1, y0 = null, y1 = null; for (let i = 0; i < 44; i++) { GM.step(0.05, 1); if (fz < 0 && P.elFrozen > 0) fz = i; if (fz >= 0 && i === fz + 10) y0 = P.pos.y; if (fz >= 0 && i === fz + 30) y1 = P.pos.y; } // (frozen at the water's face it drops in, then is held where it floats)
      out.inWater = { fz, y0: y0 == null ? null : +y0.toFixed(2), y1: y1 == null ? null : +y1.toFixed(2), sw: P.swimming }; thaw(); H.mend(); GM.step(0.05, 2);
      // --- frozen: nothing but the look. Every bound key and both buttons held and pressed through a frame: which actions read pressed
      home();
      const codes = Object.keys(B).map((a) => B[a][0]).filter(Boolean);
      const press = () => { for (const k of codes) { I.keys[k] = true; I.pressed[k] = true; } I.mouse = [true, false, true, false, false]; I.mpressed = [true, false, true, false, false]; I.mx = 120; };
      const hit0 = I.hit, down0 = I.down, seen = {};
      I.hit = (a) => { const r = hit0(a); if (r) seen[a] = 1; return r; }; I.down = (a) => { const r = down0(a); if (r) seen[a] = 1; return r; };
      const wpn = P.weapon, mag0 = wpn.mag, wi0 = P.wIdx, cds0 = P.skills.map((x) => x && x.cd), items0 = P.itemCount('h_bandage'), yaw0 = P.yaw, pos0 = P.pos.clone();
      EL.freezePlayer(); GM.step(0.05, 1);
      for (let i = 0; i < 6; i++) { press(); GM.step(0.05, 1); }
      out.held = { pressed: Object.keys(seen).sort(), mag: [mag0, wpn.mag], ads: +G.weapons.adsT.toFixed(2), wIdx: [wi0, P.wIdx], melee: P.meleeMode, moved: +P.pos.distanceTo(pos0).toFixed(2), vy: +P.vel.y.toFixed(2),
        crouch: P.crouching, slide: P.sliding, sprint: P.sprinting, gren: G.GrenHold.active(), item: [items0, P.itemCount('h_bandage')], anim: G.ItemAnim.busy(), cds: P.skills.map((x, i) => (x && x.cd) === cds0[i]).every(Boolean),
        grapple: P.grapple.state, pile: P.pileState || null, search: !!GM.search, yaw: +(P.yaw - yaw0).toFixed(3), wheel: !!(G.abilities.press), stillFz: P.elFrozen > 0 };
      // the bag's keys do not open it; the menu still opens
      for (const k of [B.status[0], B.inventory[0]]) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k, bubbles: true, cancelable: true }));
      out.bag = G.InvUI.isOpen(); if (G.InvUI.isOpen()) G.InvUI.close();
      I.keys = {}; I.mouse = [false, false, false, false, false]; I.hit = hit0; I.down = down0;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'i', bubbles: true, cancelable: true })); out.menu = GM.state; if (GM.state === 'paused') { G.ui.clearScreen(); GM.state = 'playing'; }
      // (a control: unfrozen, the same presses do act)
      thaw(); const seen2 = {}, safe = ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'reload', 'interact', 'sprint'].map((a) => B[a][0]), m1 = wpn.mag;
      I.hit = (a) => { const r = hit0(a); if (r) seen2[a] = 1; return r; }; I.down = (a) => { const r = down0(a); if (r) seen2[a] = 1; return r; };
      for (let i = 0; i < 3; i++) { for (const k of safe) { I.keys[k] = true; I.pressed[k] = true; } I.keys[B.sprint[0]] = false; I.mouse = [true, false, false, false, false]; I.mpressed = [i === 0, false, false, false, false]; GM.step(0.05, 1); }
      I.hit = hit0; I.down = down0; I.keys = {}; I.mouse = [false, false, false, false, false];
      out.control = Object.keys(seen2).length; out.controlMag = wpn.mag < m1;
      P.meleeMode = false; if (G.GrenHold.active()) G.GrenHold.putAway(true); G.weapons.equip(true);
      GM.step(0.05, 10); home();
      // --- frozen in the air: it falls and lands; crouch does not start the pile driver
      home(); P.pos.y += 3; P.vel.set(0, 0, 0); P.grounded = false; EL.freezePlayer(); let pile = false, landed = false;
      for (let i = 0; i < 30; i++) { I.keys[B.crouch[0]] = true; I.pressed[B.crouch[0]] = true; GM.step(0.05, 1); if (P.pileState) pile = true; if (P.grounded) landed = true; }
      I.keys = {}; out.air = { pile, landed, fz: P.elFrozen > 0 }; thaw(); GM.step(0.05, 4);
      // --- what was under way stops: a reload, a heal (given back), aiming
      wpn.mag = 1; G.weapons.startReload(wpn, G.weapons.stats(wpn)); GM.step(0.05, 1); const rl0 = wpn.reloading;
      EL.freezePlayer(); GM.step(0.05, 2); out.reload = [rl0, wpn.reloading]; thaw(); GM.step(0.05, 30);
      P.hp = P.stats.maxHp * 0.5; const b0 = P.itemCount('h_bandage'); G.abilities.useItemId('h_bandage'); GM.step(0.05, 2); const b1 = P.itemCount('h_bandage'), busy = G.ItemAnim.busy();
      EL.freezePlayer(); GM.step(0.05, 2); out.heal = { before: b0, using: b1, busy, after: P.itemCount('h_bandage'), stopped: !G.ItemAnim.busy() }; thaw(); P.hp = P.stats.maxHp; GM.step(0.05, 30);
      I.mouse = [false, false, true, false, false]; GM.step(0.05, 20); const ads0 = G.weapons.adsT; EL.freezePlayer(); GM.step(0.05, 20); out.ads = [+ads0.toFixed(2), +G.weapons.adsT.toFixed(2)]; I.mouse = [false, false, false, false, false]; thaw(); GM.step(0.05, 10);
      // --- how long: left alone, and pressing jump (fresh presses) 4 and 10 times a second
      const time = (rate) => { home(); EL.freezePlayer(); let t = 0, acc = 0; while (P.elFrozen > 0 && t < 5) { acc += 0.05; if (rate && acc >= 1 / rate - 1e-6) { acc = 0; I.keys[B.jump[0]] = true; I.pressed[B.jump[0]] = true; } else I.keys[B.jump[0]] = false; GM.step(0.05, 1); t += 0.05; } I.keys = {}; return +t.toFixed(2); };
      out.len = { alone: time(0), mash4: time(4), mash10: time(10) };
      // --- the grace after a thaw: water and ice again at once do not freeze; 2 s on they do
      home(); EL.freezePlayer(); EL.thawPlayer(); P.au = { el: 'water', t: GM.time + 6 }; G.combat.damagePlayer(3, { src: 'ranged', el: 'ice' }); out.grace = { at0: P.elFrozen > 0, el: EL.playerAura() };
      GM.step(0.05, 42); P.au = { el: 'water', t: GM.time + 6 }; G.combat.damagePlayer(3, { src: 'ranged', el: 'ice' }); out.grace.after = P.elFrozen > 0; thaw();
      // --- wet on the ice, standing still: frozen; mashing, out of it and walking away
      H.pick(); P.pos.set(H.c.x, 0.02, H.c.z); P.vel.set(0, 0, 0); P.au = { el: 'water', t: GM.time + 6 }; for (let i = 0; i < 12 && !(P.elFrozen > 0); i++) GM.step(0.05, 1); const f0 = P.elFrozen > 0; // (the ground's elements come every 0.25 s)
      let n = 0; while (P.elFrozen > 0 && n < 80) { I.keys[B.jump[0]] = n % 2 === 0; if (n % 2 === 0) I.pressed[B.jump[0]] = true; GM.step(0.05, 1); n++; } I.keys = {};
      const p1 = P.pos.clone(); P.yaw = 0; I.keys[B.forward[0]] = true; GM.step(0.05, 10); I.keys = {};
      out.walkOut = { frozen: f0, thawSteps: n, moved: +P.pos.distanceTo(p1).toFixed(2), refrozen: P.elFrozen > 0 };
      // --- blows land while frozen, as they would (no shatter on you)
      home(); P.hp = P.stats.maxHp; let h0 = P.hp; G.combat.damagePlayer(10, { src: 'melee' }); const dFree = h0 - P.hp; P.invulnT = 0;
      EL.freezePlayer(); P.hp = P.stats.maxHp; h0 = P.hp; G.combat.damagePlayer(10, { src: 'melee' }); const dFz = h0 - P.hp; out.dmg = [+dFree.toFixed(2), +dFz.toFixed(2)]; thaw();
      // --- what is shown: the shell (Post.frost or the low-quality picture), the word, the bar; gone after the thaw
      home(); EL.freezePlayer(); GM.step(0.05, 8);
      const msg = document.getElementById('frz-msg'), PF = G.Post && G.Post.frost;
      out.show = { msg: !!msg && msg.classList.contains('on'), key: msg && msg.querySelector('kbd').textContent, post: !!(G.Post && G.Post.active), frost: PF ? +PF.k.toFixed(2) : null, ring: !!document.querySelector('.pst .pst-n') && [...document.querySelectorAll('.pst .pst-n')].some((e) => e.textContent === '凍結') };
      thaw(); GM.step(0.05, 14); out.shown = { msg: !!msg && msg.classList.contains('on'), frost: !!(G.Post && G.Post.frost) };
      // --- dying frozen: no thaw burst left behind, nothing held
      EL.freezePlayer(); P.dead = true; GM.step(0.05, 2); out.dead = P.elFrozen; P.dead = false; thaw();
      GM.dev = { god: true, speed: 1 }; P.hp = P.stats.maxHp; home();
      return JSON.stringify(out);
    })()`));
    console.log('C', JSON.stringify(c));
    ok(c.rainIce && c.iceWater, `C: water then an icy blow freezes you, and ice then a watery blow (${c.rainIce}, ${c.iceWater})`);
    ok(c.wetOnIce.fz && c.wetOnIce.k >= 0 && c.wetOnIce.k <= 6, `C: wet, stepping onto the ice freezes you (${JSON.stringify(c.wetOnIce)})`);
    ok(c.iceOn === 'ice' && c.inWater.fz >= 0 && c.inWater.y1 != null && Math.abs(c.inWater.y1 - c.inWater.y0) < 0.15, `C: iced, into the water: frozen there, held afloat (${c.iceOn}, ${JSON.stringify(c.inWater)})`);
    const hp = c.held;
    ok(hp.pressed.length === 1 && hp.pressed[0] === 'jump', `C: frozen, of every key pressed only jump is read (to crack the ice): ${hp.pressed.join(',')}`);
    ok(c.control >= 7 && c.controlMag, `C: (unfrozen the same presses act: ${c.control} actions, the gun fired ${c.controlMag})`);
    ok(hp.mag[0] === hp.mag[1] && hp.ads === 0, `C: frozen: no shot, no aiming (${JSON.stringify(hp.mag)}, ads ${hp.ads})`);
    ok(hp.moved < 0.05 && hp.vy <= 0.01 && !hp.crouch && !hp.slide && !hp.sprint, `C: frozen: no step, no jump, no crouch, no slide, no run (${hp.moved} m, vy ${hp.vy})`);
    ok(hp.wIdx[0] === hp.wIdx[1] && !hp.melee && !hp.gren && hp.item[0] === hp.item[1] && !hp.anim && hp.cds && !hp.wheel, `C: frozen: no weapon change, no melee, no throwable, no item, no skill (${JSON.stringify({ w: hp.wIdx, item: hp.item, cds: hp.cds })})`);
    ok(hp.grapple === 'none' && !hp.pile && !hp.search && !c.bag, `C: frozen: no grapple, no pile driver, no search, the bag stays shut (${hp.grapple}, ${hp.pile}, ${hp.search}, ${c.bag})`);
    ok(Math.abs(hp.yaw) > 0.05 && hp.stillFz, `C: frozen: the view still turns (${hp.yaw} rad)`);
    ok(c.menu === 'paused', `C: frozen: the menu still opens (${c.menu})`);
    ok(!c.air.pile && c.air.landed, `C: frozen in the air: it falls and lands, no pile driver (${JSON.stringify(c.air)})`);
    ok(c.reload[0] && !c.reload[1], `C: a reload under way stops (${JSON.stringify(c.reload)})`);
    ok(c.heal.using === c.heal.before - 1 && c.heal.busy && c.heal.after === c.heal.before && c.heal.stopped, `C: a heal under way stops, the bandage given back (${JSON.stringify(c.heal)})`);
    ok(c.ads[0] > 0.9 && c.ads[1] < 0.05, `C: aiming drops (${JSON.stringify(c.ads)})`);
    ok(Math.abs(c.len.alone - 2.8) < 0.11, `C: left alone it lasts 2.8 s (${c.len.alone})`);
    ok(c.len.mash4 < c.len.alone * 0.62 && c.len.mash4 >= c.len.alone * 0.5 - 0.06, `C: pressing jump 4 a second ends it 4-5 tenths sooner (${c.len.mash4} s)`);
    ok(c.len.mash10 >= c.len.alone * 0.5 - 0.06 && c.len.mash10 <= c.len.alone * 0.5 + 0.11, `C: however fast, never shorter than half (${c.len.mash10} s)`);
    ok(!c.grace.at0 && c.grace.after, `C: no freeze in the 2 s after a thaw; after them, again (${JSON.stringify(c.grace)})`);
    ok(c.walkOut.frozen && c.walkOut.moved > 1, `C: wet on the ice: frozen, mashed out of it and walked away (${JSON.stringify(c.walkOut)})`);
    ok(Math.abs(c.dmg[0] - c.dmg[1]) < 0.01 && c.dmg[1] > 0, `C: blows land while frozen as they would, no shatter (${JSON.stringify(c.dmg)})`);
    ok(c.show.msg && c.show.key && c.show.ring && (c.show.post ? c.show.frost > 0.9 : true), `C: shown: the ice, 凍結 and the key, its ring (${JSON.stringify(c.show)})`);
    ok(!c.shown.msg && !c.shown.frost, `C: gone after the thaw (${JSON.stringify(c.shown)})`);
    ok(!(c.dead > 0), `C: dying frozen thaws you (${c.dead})`);
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nFREEZE TEST FAILED (${fails})` : '\nFREEZE TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
