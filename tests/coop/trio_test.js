'use strict';
// Three players: a guest sees the other guest, things go between guests through the host, the gate waits for all three, a guest leaving does not stop the rest.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9801;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const a = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=GuestA${q}`);
    await a.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const b = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=GuestB${q}`);
    await b.until('window.G && G.Coop && G.Coop.id === 2', 90000);
    await sleep(800);
    check(await a.eval('G.Coop.players.size') === 3 && await a.eval('G.Coop.players.get(2).name') === 'GuestB', 'the first guest knows the second');
    const fourth = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=GuestC${q}`);
    check(await fourth.until('document.getElementById("cl-err") && document.getElementById("cl-err").textContent.includes("満員")', 60000).then(() => true, () => false), 'a fourth player is turned away');
    await fourth.close();
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    for (const p of [h, a, b]) await p.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    for (const p of [a, b]) { await p.until('G.game.run && G.Coop.fpOk !== undefined', 60000); await p.eval('G.game.dev = { god: true, speed: 1 }; 1'); }
    check(await a.eval('G.Coop.fpOk') && await b.eval('G.Coop.fpOk'), 'all three built the same world');
    await sleep(2500);
    await a.eval('G.player.pos.x += 2; 1');
    await sleep(600);
    const ax = await a.eval('G.player.pos.x'), seen = await b.eval('G.Coop.players.get(1).to.x');
    check(Math.abs(ax - seen) < 1, 'the second guest sees the first where they are');
    // an item dropped by one guest, picked up by the other
    await a.eval("G.Inv.dropToGround(G.Inv.make('item', 'h_bandage', 1), G.player.pos.clone()); 1");
    await sleep(500);
    check(await b.eval('G.Inv.ground.length') === 1 && await h.eval('G.Inv.ground.length') === 1, 'a drop reaches the host and the other guest');
    await b.eval('G.Inv.pickUp(G.Inv.ground[0]); 1');
    await sleep(500);
    check(await a.eval('G.Inv.ground.length') === 0 && await h.eval('G.Inv.ground.length') === 0, 'and is gone for both once picked up');
    // a chest between the guests
    const ci = await a.eval('G.world.interactables.findIndex((x) => x.type === "chest")');
    await a.eval(`(() => { const it = G.world.interactables[${ci}]; G.InvUI.open(it.cont || (it.cont = G.Inv.chestLoot(it.tier)), it); })(); 1`);
    await a.until('G.InvUI.isOpen()', 4000);
    await sleep(400);
    check(await b.eval(`G.world.interactables[${ci}].opened === true`), 'a chest opened by one guest is open for the other');
    const n = await a.eval(`G.world.interactables[${ci}].cont.items.length`);
    await a.eval(`(() => { const it = G.world.interactables[${ci}]; if (it.cont.items.length) G.Inv.remove(it.cont, it.cont.items[0]); G.InvUI.close(); })(); 1`);
    await sleep(500);
    check(await b.eval(`G.world.interactables[${ci}].cont.items.length`) === Math.max(0, n - 1), 'what one guest took is gone for the other');
    // foes are tougher for three, the gate waits for three
    await h.eval('for (const e of G.enemies.list) if (e.alive) { e.noReward = true; e.hp = 0; G.combat.killEnemy(e, { src: "clear" }, 0); } G.game.clearArea(); G.ui.clearScreen(); G.game.state = "playing"; 1');
    for (const p of [a, b]) await p.until('G.game.areaCleared', 8000);
    await sleep(1500);
    const toGate = (who) => who.eval('(() => { G.ui.clearScreen(); G.game.state = "playing"; const w = G.world, ex = w.exits.find((x) => x.open); const t = w.triggers.find((q) => q.kind === "exit" && q.exit === ex); const r = t._r; G.player.pos.set((r.x0 + r.x1) / 2, G.player.pos.y, (r.z0 + r.z1) / 2); G.player.vel.set(0, 0, 0); return 1; })()');
    await toGate(h); await toGate(a);
    await sleep(2000);
    check(await h.eval('G.game.area') === 1, 'two of three in the gate: nobody moves');
    await toGate(b);
    await a.until('G.game.area === 2', 15000);
    check(await b.eval('G.game.area') === 2 || await b.until('G.game.area === 2', 8000), 'the third arrives: everyone goes on');
    await h.eval(`window.__sc = G.Coop.hpScale(); 1`);
    check(await h.eval('window.__sc') > 2.1, 'foes have more health for three');
    // one guest leaves
    await b.close();
    await sleep(10000);
    check(await h.eval('G.Coop.players.size') === 2, 'the host drops the guest that left');
    check(await a.eval('G.Coop.players.size') === 2, 'and so does the other guest');
    check(!h.errs.length && !a.errs.length, 'no errors ' + h.errs.concat(a.errs).slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nTRIO TEST FAILED (${fails.length})` : '\nTRIO TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
