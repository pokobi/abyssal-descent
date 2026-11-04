'use strict';
// Co-op duels with three players: 45 s (15 s each), the duel goes round all three in turn on every machine, and a duellist who leaves the room hands it on.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9977;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=40&jit=20', room = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const a = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=A${q}`);
    await a.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const b = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=B${q}`);
    await b.until('window.G && G.Coop && G.Coop.id === 2', 90000);
    const all = [h, a, b];
    const off = 'G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.game.dev = { god: true, speed: 1 }; 1';
    for (const p of all) await p.eval(off);
    await h.eval('G.Coop.begin(); 1');
    for (const p of [a, b]) await p.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    for (const p of all) await p.eval("G.bosses.forArea = () => 'oboro'; G.Coop.fpOk = undefined; G.ui.clearScreen(); G.game.state = 'playing'; G.game.dev = { god: true, speed: 1 }; 1");
    await h.eval("G.game.area = 4; G.game.transitioning = false; G.Coop.go(5, 'boss'); 1");
    for (const p of [a, b]) await p.until('G.game.stage === "boss" && G.Coop.fpOk !== undefined', 30000);
    await sleep(800);
    for (const p of all) await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await h.eval("G.player.pos.set(G.world.arenaCenter.x, 0.1, (G.world.ledgeZ || G.world.arenaD) - 6); G.player.grounded = true; 1");
    for (const p of all) await p.until('!!G.bosses.active', 25000);
    await sleep(800);
    // A nearest: A first
    await a.eval("(() => { const bb = G.bosses.active, P = G.player; P.pos.set(bb.pos.x, P.pos.y, bb.pos.z + 5); return 1; })()");
    await b.eval("(() => { const bb = G.bosses.active, P = G.player; P.pos.set(bb.pos.x - 10, P.pos.y, bb.pos.z + 13); return 1; })()");
    await h.eval("(() => { const bb = G.bosses.active, P = G.player; P.pos.set(bb.pos.x + 10, P.pos.y, bb.pos.z + 13); return 1; })()");
    await sleep(1000);
    for (const p of all) await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await h.eval('(() => { const bb = G.bosses.active; bb.hp = bb.maxHp * 0.69; return 1; })()');
    for (const p of all) await p.until('!!G.Duel.cur', 6000).catch(() => {});
    const whoAll = async () => Promise.all(all.map((p) => p.eval('G.Duel.cur ? G.Duel.cur.who : -1')));
    const locks = async () => Promise.all(all.map((p) => p.eval('!!G.player.duelLock')));
    let w = await whoAll(), l = await locks();
    console.log('      start', JSON.stringify(w), JSON.stringify(l), 'limit', await h.eval('G.Duel.limit()'));
    check(w.every((x) => x === 1) && JSON.stringify(l) === '[false,true,false]', 'the duel starts with A (nearest) on every machine, only A locked');
    check((await h.eval('G.Duel.limit()')) === 45, 'three players: 45 s');
    // round the table: A -> B -> host -> A
    const order = [];
    for (const want of [2, 0, 1]) {
      await h.until("G.Duel.cur && G.Duel.cur.st === 'fight'", 30000).catch(() => {});
      await h.eval('G.Duel.cur.slotT = Math.max(G.Duel.cur.slotT, 14.9); G.Duel.cur.warned = true; 1');
      await h.until(`G.Duel.cur && G.Duel.cur.who === ${want}`, 8000).catch(() => {});
      for (const p of all) await p.until(`G.Duel.cur && G.Duel.cur.who === ${want}`, 5000).catch(() => {});
      await sleep(400);
      w = await whoAll(); l = await locks();
      order.push(w[0]);
      check(w.every((x) => x === want) && l.filter(Boolean).length === 1 && l[[0, 1, 2].indexOf(want)], `the duel passes to ${['the host', 'A', 'B'][want]} (${JSON.stringify(w)} ${JSON.stringify(l)})`);
    }
    // A, the duellist, leaves the room: it goes on to the next
    await h.until("G.Duel.cur && G.Duel.cur.who === 1", 3000).catch(() => {});
    a.close();
    await h.until('G.Duel.cur && G.Duel.cur.who !== 1', 20000).catch(() => {});
    const w2 = await h.eval('G.Duel.cur ? G.Duel.cur.who : -1');
    check(w2 === 2 || w2 === 0, 'the duellist leaving the room hands the duel on (' + w2 + ')');
    await b.until(`G.Duel.cur && G.Duel.cur.who === ${w2}`, 5000).catch(() => {});
    check((await b.eval('G.Duel.cur ? G.Duel.cur.who : -1')) === w2, 'and B follows');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | ').slice(0, 400));
    check(!b.errs.length, 'no errors on B ' + b.errs.slice(0, 3).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nCOOP DUEL TRIO TEST FAILED (${fails.length})` : '\nCOOP DUEL TRIO TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
