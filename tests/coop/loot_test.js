'use strict';
// What the players share: chests, bodies, things on the ground, the gate rule. Two pages, one machine.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 8961;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=40&jit=20', room = 'L' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    check(await g.eval("document.body.textContent.includes('ノーマル')"), 'the guest sees the difficulty the host chose');
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await sleep(1500);
    // ---- a chest
    const chest = 'G.world.interactables.findIndex((x) => x.type === "chest")';
    const ci = +(await h.eval(chest));
    check(ci >= 0 && ci === +(await g.eval(chest)), 'both worlds have the same chest ' + ci);
    await h.eval(`(() => { const it = G.world.interactables[${ci}]; it.opened = true; it.openAnim = 0; it.cont = G.Inv.chestLoot(it.tier); G.InvUI.open(it.cont, it); window.__n0 = it.cont.items.length; })(); 1`);
    await sleep(600);
    const n0 = +(await h.eval('window.__n0'));
    check(await g.eval(`(() => { const it = G.world.interactables[${ci}]; return !!(it.opened && it.cont && it.cont.items.length === ${n0}); })()`), `the chest the host opened stays on the guest's screen with its ${n0} things`);
    await g.eval(`G.InvUI.open(G.world.interactables[${ci}].cont, G.world.interactables[${ci}]); 1`);
    await sleep(500);
    check(await g.eval('!G.InvUI.isOpen()'), 'a chest someone is searching cannot be opened by another');
    await h.eval(`(() => { const it = G.world.interactables[${ci}]; G.Inv.remove(it.cont, it.cont.items[0]); G.InvUI.close(); })(); 1`);
    await sleep(600);
    check(await g.eval(`G.world.interactables[${ci}].cont.items.length === ${n0 - 1}`), 'what the host took is gone on the guest, the rest is left');
    await g.eval(`G.InvUI.open(G.world.interactables[${ci}].cont, G.world.interactables[${ci}]); 1`);
    await g.until('G.InvUI.isOpen()', 4000);
    check(true, 'the guest could open it once the host was done');
    await g.eval(`(() => { const it = G.world.interactables[${ci}]; if (it.cont.items.length) G.Inv.remove(it.cont, it.cont.items[0]); G.InvUI.close(); })(); 1`);
    await sleep(600);
    check(await h.eval(`G.world.interactables[${ci}].cont.items.length === ${Math.max(0, n0 - 2)}`), 'what the guest took is gone on the host');
    // ---- the ground
    await h.eval("G.Inv.dropToGround(G.Inv.make('item', 'h_bandage', 1), G.player.pos.clone()); 1");
    await sleep(600);
    check(await g.eval('G.Inv.ground.length === 1 && !!G.Inv.ground[0].gid'), 'an item dropped by the host lies on the guest ground too');
    await g.eval('G.Inv.pickUp(G.Inv.ground[0]); 1');
    await sleep(600);
    check(await h.eval('G.Inv.ground.length === 0'), 'picked up by the guest, gone for the host');
    await g.eval("G.Inv.dropToGround(G.Inv.make('item', 'h_medkit', 1), G.player.pos.clone()); 1");
    await sleep(600);
    check(await h.eval('G.Inv.ground.length === 1'), 'an item dropped by the guest lies on the host ground');
    // ---- a body
    await h.eval('(() => { const e = G.enemies.list.find((x) => x.alive && x._nid && !x.custom); window.__eid = e ? e._nid : 0; if (e) { e.noReward = false; G.combat.damageEnemy(e, 1e6, { src: "bullet" }); } })(); 1');
    await sleep(1200);
    const eid = +(await h.eval('window.__eid'));
    check(eid > 0 && await h.eval(`G.Inv.corpses.some((x) => x.e._nid === ${eid})`) && await g.eval(`G.Inv.corpses.some((x) => x.e && x.e._nid === ${eid})`), 'the body is there on both sides');
    const nb = await h.eval(`G.Inv.corpses.find((x) => x.e._nid === ${eid}).cont.items.length`);
    await g.eval(`(() => { const c = G.Inv.corpses.find((x) => x.e && x.e._nid === ${eid}); G.InvUI.open(c.cont, c); })(); 1`);
    await g.until('G.InvUI.isOpen()', 4000);
    check(await g.eval(`G.Inv.corpses.find((x) => x.e && x.e._nid === ${eid}).cont.items.length === ${nb}`), 'the body holds what the host rolled for it');
    await g.eval(`(() => { const c = G.Inv.corpses.find((x) => x.e && x.e._nid === ${eid}); if (c.cont.items.length) G.Inv.remove(c.cont, c.cont.items[0]); G.InvUI.close(); })(); 1`);
    await sleep(600);
    check(await h.eval(`(() => { const c = G.Inv.corpses.find((x) => x.e._nid === ${eid}); return c && c.searched && c.cont.items.length === ${Math.max(0, nb - 1)}; })()`), 'the body is kept, searched, with the rest left');
    // ---- the gate
    await h.eval('for (const e of G.enemies.list) if (e.alive) { e.noReward = true; e.hp = 0; G.combat.killEnemy(e, { src: "clear" }, 0); } G.game.clearArea(); G.ui.clearScreen(); G.game.state = "playing"; 1');
    await g.until('G.game.areaCleared', 8000);
    await sleep(1500);
    const toGate = (who) => who.eval('(() => { G.ui.clearScreen(); G.game.state = "playing"; const w = G.world, ex = w.exits.find((x) => x.open); const t = w.triggers.find((q) => q.kind === "exit" && q.exit === ex); const r = t._r; G.player.pos.set((r.x0 + r.x1) / 2, G.player.pos.y, (r.z0 + r.z1) / 2); G.player.vel.set(0, 0, 0); return !!ex; })()');
    check(await toGate(h), 'the gate is open');
    await sleep(2500);
    check(await h.eval('G.game.area === 1') && await g.eval('G.game.area === 1'), 'one player in the gate does not move anyone');
    check(await g.eval('(document.getElementById("coop-msg").textContent + document.getElementById("coop-hud").textContent).includes("門")'), 'the guest was told the host is at the gate');
    await toGate(g);
    await g.until('G.game.area === 2', 20000);
    check(await h.eval('G.game.area === 2'), 'everyone in the gate: both go on');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | '));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 3).join(' | '));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nLOOT TEST FAILED (${fails.length})` : '\nLOOT TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
