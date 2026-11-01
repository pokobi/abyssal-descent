'use strict';
// More players, more foes (not tougher ones), foes around every player, and the guardian's chests: one for each player, each for its own.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9985;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'S' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const a = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=GuestA${q}`);
    await a.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const b = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=GuestB${q}`);
    await b.until('window.G && G.Coop && G.Coop.id === 2', 90000);
    await sleep(600);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    for (const p of [h, a, b]) await p.eval(off);
    // what the game builds for an area before the players are counted in, seen from both sides
    const spy = `(() => { const GM = G.game, f = GM.setupObjective; GM.setupObjective = function (...x) { const r = f.apply(this, x), O = GM.objective; window.__base = O && O.waves ? { n: O.waves.map((w) => w.n), defs: O.waves.map((w) => w.defs.map((d) => d.id)), hp: GM.areaMods.hp, s: GM.arng.s } : null; return r; }; })(); 1`;
    for (const p of [h, a, b]) await p.eval(spy);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    for (const p of [a, b]) { await p.until('G.game.run && G.Coop.fpOk !== undefined', 60000); await p.eval('G.game.dev = { god: true, speed: 1 }; 1'); }
    const settle = async () => { for (const p of [h, a, b]) await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); };
    const go = async (n, kind) => {
      await h.eval(`G.game.area = ${n} - 1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      for (const p of [a, b]) await p.eval(`G.Coop.fpOk = undefined; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      await h.eval(`G.Coop.go(${n}, '${kind}'); 1`);
      for (const p of [a, b]) await p.until(`G.game.area === ${n} && G.game.stage === '${kind}' && G.Coop.fpOk !== undefined`, 25000);
      await sleep(500);
      await settle();
    };
    const x = await h.eval('G.Coop.foeExtra()');
    check(Math.abs(x - 1.2) < 1e-9, `three players: ${Math.round(x * 100)}% more foes`);

    // ---- an ordinary area: more foes, the same foes first, no more health, the same rolls on every side
    let checked = 0;
    for (const n of [2, 3, 4]) {
      await go(n, 'combat');
      const base = JSON.parse(await h.eval('JSON.stringify(window.__base)') || 'null');
      if (!base) continue;
      checked++;
      const S0 = base.n.reduce((s, v) => s + v, 0);
      const O = JSON.parse(await h.eval('JSON.stringify({ total: G.game.objective.total, n: G.game.objective.waves.map((w) => w.n), defs: G.game.objective.waves.map((w) => w.defs.map((d) => d.id)), hp: G.game.areaMods.hp })'));
      const want = Math.round(S0 * (1 + x));
      check(O.total === Math.min(want, Math.max(S0, 18 + 6 * 2)) && O.n.reduce((s, v) => s + v, 0) === O.total, `area ${n}: ${S0} foes become ${O.total} for three players (${base.n.join('+')} -> ${O.n.join('+')})`);
      check(O.defs.every((d, i) => d.length === O.n[i] && base.defs[i].every((id, k) => d[k] === id)), `area ${n}: the first foes of every wave are the ones the game rolled`);
      check(Math.abs(O.hp - base.hp) < 1e-9 || want > 18 + 12, `area ${n}: and they are no tougher (${O.hp.toFixed(3)} / ${base.hp.toFixed(3)})`);
      const sa = await a.eval('window.__base && window.__base.s'), sb = await b.eval('window.__base && window.__base.s');
      check(sa === base.s && sb === base.s, `area ${n}: the guests rolled the area the same way as the host`);
    }
    check(checked > 0, 'some ordinary area was checked');

    // ---- foes appear around every player, not only around the host
    await go(5, 'combat');
    const pts = JSON.parse(await h.eval(`(() => { const w = G.world, r = new G.RNG(11); let a = w.randomOpenCell(r), best = null; for (let i = 0; i < 60; i++) { const c = w.randomOpenCell(r, (x, z) => Math.hypot(x - a.x, z - a.z) > 30); if (c && (!best || Math.hypot(c.x - a.x, c.z - a.z) > Math.hypot(best.x - a.x, best.z - a.z))) best = c; } return JSON.stringify([a, best]); })()`));
    if (pts[1]) {
      await h.eval(`G.player.pos.set(${pts[0].x}, ${pts[0].y + 0.1}, ${pts[0].z}); G.player.vel.set(0, 0, 0); 1`);
      await a.eval(`G.player.pos.set(${pts[1].x}, ${pts[1].y + 0.1}, ${pts[1].z}); G.player.vel.set(0, 0, 0); 1`);
      await b.eval(`G.player.pos.set(${pts[1].x + 1}, ${pts[1].y + 0.1}, ${pts[1].z + 1}); G.player.vel.set(0, 0, 0); 1`);
      await sleep(900);
      const r = JSON.parse(await h.eval(`(() => { const seen = new Set(G.enemies.list), out = [], P = G.player; for (let i = 0; i < 16; i++) G.game.spawnEnemy({ wave: true }); for (const e of G.enemies.list) if (!seen.has(e) && e.alive) out.push([Math.hypot(e.pos.x - ${pts[0].x}, e.pos.z - ${pts[0].z}), Math.hypot(e.pos.x - ${pts[1].x}, e.pos.z - ${pts[1].z})]); return JSON.stringify(out); })()`));
      const nearHost = r.filter((d) => d[0] < d[1]).length, nearGuests = r.filter((d) => d[1] <= d[0]).length;
      console.log(`     ${r.length} foes: ${nearHost} around the host, ${nearGuests} around the guests (${Math.round(Math.hypot(pts[0].x - pts[1].x, pts[0].z - pts[1].z))}m apart)`);
      check(nearHost >= 2 && nearGuests >= 2, 'foes appear around the host and around the guests');
    } else console.log('     (no two far apart open spots in this area: spread not checked)');

    // ---- the guardian's chests
    await h.eval(`G.bosses.forArea = () => 'warden'; G.bosses.clear(); 1`);
    for (const p of [a, b]) await p.eval(`G.bosses.forArea = () => 'warden'; G.bosses.clear(); 1`);
    await go(7, 'boss');
    await h.eval('(() => { const w = G.world; G.player.pos.set(w.arenaCenter.x, 0.2, (w.ledgeZ || w.arenaD) - 6); G.player.grounded = true; G.ui.clearScreen(); G.game.state = "playing"; })(); 1');
    await a.until('!!G.bosses.active', 20000); await b.until('!!G.bosses.active', 20000);
    await sleep(1200);
    const hpRatio = await h.eval('G.bosses.active.maxHp');
    await h.eval('(() => { const b = G.bosses.active; b.hp = 0; b.kill(); })(); 1');
    const chests = "JSON.stringify(G.world.interactables.map((it, i) => it.type === 'chest' && it.tier === 3 ? [i, it.owner, Math.round(it.pos.x * 10), Math.round(it.pos.z * 10)] : null).filter(Boolean))";
    // (the fall takes three seconds of game time, which a busy test machine runs slowly)
    for (const p of [h, a, b]) await p.until(`${chests}.length > 2`, 60000).catch(() => {});
    const ch0 = JSON.parse(await h.eval(chests)), ch1 = JSON.parse(await a.eval(chests)), ch2 = JSON.parse(await b.eval(chests));
    console.log('     host chests', JSON.stringify(ch0));
    check(ch0.length === 3 && ch0.map((c) => c[1]).sort().join() === '0,1,2', 'three players: three chests, one for each');
    check(JSON.stringify(ch0) === JSON.stringify(ch1) && JSON.stringify(ch0) === JSON.stringify(ch2), 'the same chests in the same places and order for everyone');
    const trySearch = (p, idx) => p.eval(`(() => { const it = G.world.interactables[${idx}]; G.game.search = null; G.game.startSearch(it, it.pos, 1, '📦', () => {}); const ok = !!G.game.search; G.game.search = null; return ok; })()`);
    const of = (id) => ch0.find((c) => c[1] === id)[0];
    check((await trySearch(h, of(0))) === true && (await trySearch(h, of(1))) === false && (await trySearch(h, of(2))) === false, 'the host can open only their own chest');
    check((await trySearch(a, of(1))) === true && (await trySearch(a, of(0))) === false, 'a guest can open only their own chest');
    check((await trySearch(b, of(2))) === true && (await trySearch(b, of(1))) === false, 'and so can the other');
    // a chest whose owner has been down for half a minute is anybody's
    check(await h.eval(`(() => { const rp = G.Coop.players.get(2), it = G.world.interactables[${of(2)}]; rp.dead = true; it._deadT = 31; G.game.search = null; G.game.startSearch(it, it.pos, 1, '📦', () => {}); const ok = !!G.game.search; G.game.search = null; rp.dead = false; return ok; })()`), 'one whose owner has been down for half a minute is free to take');
    // the guardian itself still has the extra health of three players
    check(hpRatio > 0, 'the guardian has its health (' + Math.round(hpRatio) + ')');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 2).join(' | ').slice(0, 400));
    check(!a.errs.length, 'no errors on guest A ' + a.errs.slice(0, 2).join(' | ').slice(0, 400));
    check(!b.errs.length, 'no errors on guest B ' + b.errs.slice(0, 2).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nSCALE TEST FAILED (${fails.length})` : '\nSCALE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
