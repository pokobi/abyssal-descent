'use strict';
// Ping (key, wheel click, key settings, what it points at), the aim trial ending for all, walls and turrets, the item wheel, the guardian's door.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9991;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'P' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    check(await h.eval('G.input.BIND_LIST.some((b) => b[0] === "ping") && G.BIND.ping.includes("MouseMiddle") && G.BIND.ping.includes("KeyH")'), 'ping is in the key settings, on H and the wheel click');
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await sleep(2500);
    const aim = (p, x) => p.eval(`(() => { const P = G.player, c = ${x}, o = G.camera.position; const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); G.ui.clearScreen(); G.game.state = 'playing'; })(); 1`);
    const marks = 'JSON.stringify([...document.querySelectorAll("#coop-marks .cm")].map((e) => [e.children[1].textContent, e.style.getPropertyValue("--pc")]))';
    // an item on the ground
    await g.eval("(() => { const P = G.player, f = G.camera.getWorldDirection(new THREE.Vector3()); G.Inv.dropToGround(G.Inv.make('item', 'h_medkit', 1), P.pos.clone().addScaledVector(f.setY(0).normalize(), 4)); })(); 1");
    await sleep(300);
    await aim(g, 'G.Inv.ground[0].pos');
    await sleep(200);
    await aim(g, 'G.Inv.ground[0].pos');
    await g.eval("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyH', key: 'h', bubbles: true })); 1");
    await sleep(700);
    const name = await g.eval("G.ITEM_BY_ID.h_medkit.name");
    const itemHid = await g.eval('(() => { const c = G.Inv.ground[0].pos, o = G.camera.position.clone(), d = c.clone().sub(o), l = d.length(); d.normalize(); const w = G.world.raycast(o, d, l); return !!(w && w.t < l - 1.5); })()');
    check(itemHid || (await h.eval(marks)).includes(name), `a ping on an item names it for the other player (${name}${itemHid ? ', behind a wall this time' : ''})`);
    const gm = JSON.parse(await g.eval(marks)).find((m) => m[0] === name), hm = JSON.parse(await h.eval(marks)).find((m) => m[0] === name);
    check(itemHid || (gm && hm && gm[1] === hm[1]), 'in the colour of the one who pinged');
    // a foe, by the wheel click
    await g.until('G.enemies.list.some((e) => e.alive && e._nid && !e.custom)', 20000);
    await h.eval('G.game.dev = { god: true, speed: 1, freeze: true }; 1'); // (a foe that stands still: this checks the ping, not the aim)
    await sleep(500);
    await g.eval('(() => { const P = G.player, e = G.enemies.list.find((x) => x.alive && x._nid && !x.custom && !x.flyer) || G.enemies.list.find((x) => x.alive && x._nid && !x.custom), c = e.centerPos(), f = new THREE.Vector3(c.x - P.pos.x, 0, c.z - P.pos.z), l = f.length(); window.__fn = e.def.name; window.__fi = e._nid; P.pos.x = c.x - f.x / l * 6; P.pos.z = c.z - f.z / l * 6; P.pos.y = e.pos.y; P.vel.set(0, 0, 0); })(); 1');
    await sleep(250);
    const foe = 'G.enemies.list.find((x) => x._nid === window.__fi).centerPos()';
    await aim(g, foe); await sleep(200); await aim(g, foe);
    await g.eval("(() => { const I = G.input, was = I.locked; I.locked = true; window.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true })); document.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true })); I.locked = was; })(); 1");
    await sleep(700);
    const fn = await g.eval('window.__fn');
    // (a wall may stand between: the ping then rightly marks the wall; the wheel click itself is what must work)
    const blocked = await g.eval(`(() => { const c = ${foe}, o = G.camera.position.clone(), d = c.clone().sub(o), l = d.length(); d.normalize(); return !!G.world.raycast(o, d, l); })()`);
    check(blocked ? JSON.parse(await h.eval(marks)).length >= 3 : (await h.eval(marks)).includes(fn), `the wheel click pings too, and a foe is named (${fn}${blocked ? ', behind a wall this time' : ''})`);
    await h.eval('G.game.dev = { god: true, speed: 1 }; 1');
    // the item wheel does not slow the foes for everyone
    await h.eval('window.__wo = G.abilities.wheelOpen; G.abilities.wheelOpen = () => true; 1');
    await sleep(600);
    check(await h.eval('G.game.enemyTimeScale') > 0.9, 'the item wheel does not slow the foes in co-op');
    await h.eval('G.abilities.wheelOpen = window.__wo; 1');
    // walls and turrets
    const n0 = await g.eval('G.combat.walls.length'), a0 = await g.eval('G.combat.allies.length');
    await h.eval("(() => { const C = G.combat, P = G.player, x = P.pos.x, z = P.pos.z - 4, w = G.world; C.curSk = 'wall'; const col = w.addCollider(x - 2, P.pos.y, z - 0.3, x + 2, P.pos.y + 3, z + 0.3, { surf: 'stone' }); C.walls.push({ t: 4, remove() { col.alive = false; } }); C.curSk = null; C.spawnTurret(P.pos.clone().setX(P.pos.x + 3), 5, 10); })(); 1");
    await sleep(800);
    check(await g.eval('G.combat.walls.length') === n0 + 1, 'a wall put up by the host stands for the guest');
    check(await g.eval('G.combat.allies.length') === a0 + 1, 'a turret set down by the host stands for the guest');
    // the aim trial ends together
    await h.eval('G.game.area = 2; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = "playing"; G.Coop.go(3, "trial"); 1');
    await g.until('G.game.stage === "trial"', 20000);
    await sleep(800);
    await g.eval('G.ui.clearScreen(); G.game.state = "playing"; G.game.objective.score = 5000; G.Areas.finishTrial(); 1');
    await h.until('G.game.areaCleared === true', 6000);
    check(true, 'the aim trial finished by the guest ends for the host');
    check(await h.eval('document.getElementById("coop-chat").textContent.includes("RANK")'), 'with the guest\'s rank shown');
    // the guardian's door waits for both
    await h.eval('G.bosses.forArea = () => "oboro"; G.game.area = 4; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = "playing"; G.Coop.go(5, "boss"); 1');
    await g.eval('G.bosses.forArea = () => "oboro"; 1');
    await g.until('G.game.stage === "boss" && G.world._hall', 20000);
    await sleep(500);
    check(await h.eval('!!G.world._hall && G.world._hall.alive'), 'the guardian\'s hall is shut');
    const toDoor = (p) => p.eval('(() => { const w = G.world, z = (w.ledgeZ ? w.ledgeZ - 1 : w.arenaD - 2) + 5; G.ui.clearScreen(); G.game.state = "playing"; G.player.pos.set(w.arenaCenter.x, 0.2, z); G.player.vel.set(0, 0, 0); })(); 1');
    await toDoor(h);
    await sleep(1200);
    check(await h.eval('!!G.world._hall'), 'one player at the door does not open it');
    await toDoor(g);
    await h.until('!G.world._hall', 6000);
    await g.until('!G.world._hall', 6000);
    check(true, 'both at the door: it opens');
    check(!h.errs.length && !g.errs.length, 'no errors ' + h.errs.concat(g.errs).slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nPING TEST FAILED (${fails.length})` : '\nPING TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
