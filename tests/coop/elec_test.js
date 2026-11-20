'use strict';
// The power plant's live devices in co-op (js/elec.js, js/coop/sync.js): the host's clock is everyone's.
//  1. both screens build the same w.elec in the same area (ids and places of the live floors and the arcs);
//  2. a surge on the host: the same devices warn, then go live, on the guest;
//  3. the host stops a device at its switch box: it stops on the guest too, and only that one;
//  4. the guest strikes a live switch box: the host stops it, and it is stopped on both;
//  5. a stopped device comes live again (after its sleep) on both;
//  7. a live floor hurts the one standing on it, on that one's own screen only (the guest, then the host);
//  8. a guest who builds the area again, and a guest who drops out and comes back, find the devices as the host has them;
//  6. the area cleared: every device stops on both;
//  9. no errors on any page.
//   COOP_PORT=9952 node tests/coop/elec_test.js
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9952;
const AREA = 8;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [], errs = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  // (every area of this run is the power plant: set on each page before the run starts, and on a page that comes in later before it loads)
  const PLANT = "(function () { const f = () => { if (window.G && G.Run && G.Run.field) G.Run.field = () => 'plant'; else setTimeout(f, 5); }; f(); })();";
  try {
    const q = '&local=1&lat=30&jit=10', room = 'E' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const url = (n, host) => `http://127.0.0.1:${PORT}/coop.html?room=${room}${host ? '&host=1' : ''}&name=${n}${q}`;
    const h = await ch.page(url('Host', true));
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 120000);
    await h.booted();
    await sleep(300);
    let g = await ch.page(url('Guest'));
    await g.booted();
    await g.until('window.G && G.Coop && G.Coop.id === 1', 120000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval(PLANT + ' 1'); await g.eval(PLANT + ' 1');
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 90000);
    for (const pg of [h, g]) await pg.running(undefined, 120000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    // into a plant area of the deep
    await g.eval('G.Coop.fpOk = undefined; 1');
    await h.eval(`G.game.area = ${AREA - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.Coop.go(${AREA}, 'combat'); 1`);
    await g.until(`G.game.area === ${AREA} && G.game.stage === 'combat' && G.Coop.fpOk !== undefined`, 90000);
    for (const pg of [h, g]) await pg.running(undefined, 120000);
    const play = 'G.ui.clearScreen(); G.game.state = "playing"; 1';
    await h.eval(play); await g.eval(play);
    check(await g.eval('G.Coop.fpOk') === true, 'the guest builds the same world as the host');
    check(await h.eval('G.world.field') === 'plant' && await g.eval('G.world.field') === 'plant', 'both stand in the power plant');

    // the host's foes held still and out of the way, one of the test's own that cannot fall (so the area is not cleared before its time)
    const spawn = JSON.parse(await h.eval(`(() => {
      const GM = G.game, P = G.player; GM.dev = { god: true, speed: 1, freeze: true };
      for (const e of G.enemies.list) if (e.alive && !e.custom) { e.alive = false; e.remove(); e.removed = true; }
      const e = GM.spawnEnemy({ def: G.ENEMY_BY_ID.skeleton_normal, at: { x: P.pos.x + 3, y: P.pos.y, z: P.pos.z } });
      e.maxHp = e.hp = 1e7; window.__F = e;
      return JSON.stringify([P.pos.x, P.pos.y, P.pos.z]);
    })()`));
    await g.eval('G.game.dev = { god: true, speed: 1, freeze: true }; 1');

    // ---------------- 1. the same devices ----------------
    const elecOf = (pg) => pg.eval(`JSON.stringify({ z: (G.world.elec.zones || []).map((s) => [s.id, s.x0, s.z0, s.x1, s.z1, s.y, s.box ? [s.box.x, s.box.y, s.box.z] : null]),
      a: (G.world.elec.arcs || []).map((s) => [s.id, s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z, s.box ? [s.box.x, s.box.y, s.box.z] : null]), l: G.Elec.list.map((d) => d.id) })`);
    const eh = await elecOf(h), eg = await elecOf(g), E1 = JSON.parse(eh);
    console.log(`      devices: ${E1.z.length} floors, ${E1.a.length} arcs (${E1.l.join(' ')})`);
    check(E1.z.length > 0 && E1.a.length > 0, 'the area has live floors and arcs');
    check(eh === eg, 'both screens have the same w.elec (ids, places, boxes) and the same list of devices');

    // ---------------- helpers ----------------
    const S = async (pg) => JSON.parse(await pg.eval('JSON.stringify(G.Elec.list.map((d) => [d.id, d.state, +d.sleep.toFixed(1)]))'));
    const norm = (s) => (s === 'dying' ? 'off' : s);
    const st = (rows, id) => { const r = rows.find((x) => x[0] === id); return r ? r[1] : null; };
    const sl = (rows, id) => { const r = rows.find((x) => x[0] === id); return r ? r[2] : 0; };
    const sameAll = (a, b) => a.map((r) => r[0] + ':' + norm(r[1])).join() === b.map((r) => r[0] + ':' + norm(r[1])).join();
    // waits until the states on the pages pass the test (or the time is up); returns the last seen
    const waitFor = async (pages, pred, ms) => {
      const t0 = Date.now(); let last = null;
      while (Date.now() - t0 < (ms || 15000)) { last = []; for (const pg of pages) last.push(await S(pg)); if (pred(...last)) return { ok: true, s: last }; await sleep(120); }
      return { ok: false, s: last };
    };
    const fmt = (rows) => rows.map((r) => `${r[0]}=${r[1]}${r[2] > 0 ? '(' + r[2] + ')' : ''}`).join(' ');
    // puts the host where a device is nearest (a floor's middle), so a surge picks it first
    const hostAt = (id) => h.eval(`(() => { const d = G.Elec.list.find((x) => x.id === ${JSON.stringify(id)}), P = G.player; P.pos.set(d.c.x, d.kind === 'zone' ? d.y + 0.05 : d.c.y, d.c.z); P.vel.set(0, 0, 0); return 1; })()`);
    const hostHome = () => h.eval(`(() => { const P = G.player; P.pos.set(${spawn.join(',')}); P.vel.set(0, 0, 0); return 1; })()`);
    const surge = async (id) => {
      await hostAt(id);
      await h.eval('G.Elec.waveT = 0.05; 1');
      await h.until('!!G.Elec.warn', 15000);
      return (await S(h)).filter((r) => r[1] === 'warn').map((r) => r[0]);
    };
    const hitBox = (pg, id) => pg.eval(`(() => { const d = G.Elec.list.find((x) => x.id === ${JSON.stringify(id)}); if (!d || !d.box) return 0; G.Gim.hit(d.box.g, 10, 'bullet', d.box.p.clone()); return 1; })()`);
    const zones = E1.z.map((z) => z[0]), withBox = new Set(E1.z.filter((z) => z[6]).map((z) => z[0]).concat(E1.a.filter((a) => a[7]).map((a) => a[0])));

    // ---------------- 2. a surge ----------------
    const Z0 = zones.find((id) => withBox.has(id)) || zones[0];
    const W1 = await surge(Z0);
    console.log(`      surge 1 at ${Z0}: ${W1.join(' ')}`);
    let r = await waitFor([g], (a) => W1.every((id) => st(a, id) === 'warn' || st(a, id) === 'on'), 8000);
    check(r.ok && W1.includes(Z0), `the guest sees the same devices warn (${W1.join(' ')}; guest ${r.s ? fmt(r.s[0]) : '-'})`);
    const warnSeen = r.ok && W1.some((id) => st(r.s[0], id) === 'warn');
    check(warnSeen, 'and the warning comes before they go live on the guest (seen warn)');
    check(await g.eval('G.Elec.warn ? 1 : 0') === 1 || !warnSeen, 'the guest plays the warning (its lamps stutter)');
    r = await waitFor([h, g], (a, b) => W1.every((id) => st(a, id) === 'on' && st(b, id) === 'on'), 10000);
    check(r.ok, `then they go live on both (host ${r.s ? fmt(r.s[0]) : '-'} / guest ${r.s ? fmt(r.s[1]) : '-'})`);
    check(r.ok && sameAll(r.s[0], r.s[1]), 'every device stands the same on both');
    await hostHome();
    await h.eval(play); await g.eval(play);

    // ---------------- 7. a live floor hurts whoever stands on it, on their own screen ----------------
    const zLive = W1.find((id) => zones.includes(id)) || Z0;
    const standOn = (pg, id) => pg.eval(`(() => { const d = G.Elec.list.find((x) => x.id === ${JSON.stringify(id)}), P = G.player; P.pos.set(d.c.x, d.y + 0.05, d.c.z); P.vel.set(0, 0, 0); P.hp = P.stats.maxHp; return 1; })()`);
    const lastMe = (pg) => pg.eval('JSON.stringify(G.Elec.lastMe || null)');
    const mortal = 'G.game.dev = { god: false, speed: 1, freeze: true }; G.player.invulnT = 0; 1', god = 'G.game.dev = { god: true, speed: 1, freeze: true }; 1';
    await h.eval(mortal); await g.eval(mortal);
    {
      const h0 = await lastMe(h);
      await standOn(g, zLive);
      const hp0 = await g.eval('G.player.stats.maxHp');
      await g.gameFor(1.6);
      const gm = JSON.parse(await lastMe(g)), hp1 = await g.eval('G.player.hp');
      check(gm && gm.dev === zLive && gm.dmg > 0 && hp1 < hp0, `the guest on the live floor ${zLive} is hurt on its own screen (${gm ? gm.dmg.toFixed(1) : 0} a tick, hp ${hp0} -> ${Math.round(hp1)})`);
      check(await lastMe(h) === h0, 'and the host, standing elsewhere, is not');
      await g.eval(`(() => { const P = G.player; P.pos.set(${spawn[0] + 2}, ${spawn[1]}, ${spawn[2]}); P.vel.set(0, 0, 0); P.hp = P.stats.maxHp; return 1; })()`);
      await g.gameFor(0.5);
      const g0 = await lastMe(g);
      await standOn(h, zLive);
      const hh0 = await h.eval('G.player.stats.maxHp');
      await h.gameFor(1.6);
      const hm = JSON.parse(await lastMe(h)), hh1 = await h.eval('G.player.hp');
      check(hm && hm.dev === zLive && hm.dmg > 0 && hh1 < hh0, `the host on it is hurt on its own screen (${hm ? hm.dmg.toFixed(1) : 0} a tick, hp ${hh0} -> ${Math.round(hh1)})`);
      check(await lastMe(g) === g0, 'and the guest is not');
    }
    await h.eval(god); await g.eval(god);
    await h.eval('G.player.hp = G.player.stats.maxHp; 1'); await g.eval('G.player.hp = G.player.stats.maxHp; 1');
    await hostHome();
    await h.eval(play); await g.eval(play);

    // ---------------- 3. the host stops one at its box ----------------
    const A = W1.find((id) => withBox.has(id));
    check(!!A, `a live device with a switch box (${A})`);
    await hitBox(h, A);
    r = await waitFor([h, g], (a, b) => norm(st(a, A)) === 'off' && norm(st(b, A)) === 'off', 8000);
    check(r.ok && sl(r.s[0], A) > 0, `the host's blow stops ${A} on the host, and it sleeps (${r.s ? fmt(r.s[0]) : '-'})`);
    check(r.ok, `and on the guest (${r.s ? fmt(r.s[1]) : '-'})`);
    const others = W1.filter((id) => id !== A);
    check(r.ok && others.every((id) => st(r.s[0], id) === 'on' && st(r.s[1], id) === 'on'), `only that one: the rest stay live on both (${others.join(' ') || 'none'})`);
    check(r.ok && sl(r.s[1], A) > 0, 'the guest knows it sleeps');

    // ---------------- 4. the guest strikes one ----------------
    // (a live one with a box other than A: one of this surge, or the next surge's)
    let B = others.find((id) => withBox.has(id));
    if (!B) {
      const cand = zones.filter((id) => id !== A && withBox.has(id)).concat([...withBox].filter((id) => !zones.includes(id) && id !== A));
      await h.until('!G.Elec.warn', 8000).catch(() => {});
      const W2 = await surge(cand[0]);
      console.log(`      surge 2 at ${cand[0]}: ${W2.join(' ')}`);
      await waitFor([h, g], (a, b) => W2.every((id) => st(a, id) === 'on' && st(b, id) === 'on'), 10000);
      B = W2.find((id) => withBox.has(id));
      await hostHome();
      await h.eval(play); await g.eval(play);
    }
    check(!!B && B !== A, `another live device with a box for the guest (${B})`);
    await hitBox(g, B);
    const gNow = await S(g);
    console.log(`      just after the guest's blow, on the guest: ${B}=${st(gNow, B)}`);
    r = await waitFor([h, g], (a, b) => norm(st(a, B)) === 'off' && norm(st(b, B)) === 'off', 8000);
    check(r.ok && sl(r.s[0], B) > 0, `the guest's blow stops ${B} on the host, and it sleeps (${r.s ? fmt(r.s[0]) : '-'})`);
    check(r.ok, `and on the guest (${r.s ? fmt(r.s[1]) : '-'})`);
    check(await h.eval(`JSON.stringify(G.Elec.lastDrop && G.Elec.lastDrop.dev)`) === JSON.stringify(B), 'the host stopped it as its own (lastDrop)');

    // ---------------- 5. a stopped one comes live again ----------------
    await h.until('!G.Elec.warn', 8000).catch(() => {});
    await h.eval(`(() => { const d = G.Elec.list.find((x) => x.id === ${JSON.stringify(A)}); d.sleep = 0.05; return 1; })()`);
    await h.gameFor(0.2);
    // (the others that are still live stay so; the surge picks among the stopped ones not sleeping, A nearest)
    const W3 = await surge(A);
    console.log(`      surge 3 at ${A}: ${W3.join(' ')}`);
    check(W3.includes(A), `the host wakes ${A} again after its sleep`);
    r = await waitFor([h, g], (a, b) => st(a, A) === 'on' && st(b, A) === 'on', 10000);
    check(r.ok, `${A} is live again on both (host ${r.s ? fmt(r.s[0]) : '-'} / guest ${r.s ? fmt(r.s[1]) : '-'})`);
    await hostHome();
    await h.eval(play); await g.eval(play);
    r = await waitFor([h, g], (a, b) => sameAll(a, b) && !a.some((x) => x[1] === 'warn'), 8000);
    check(r.ok, 'every device stands the same on both');

    // ---------------- 8. building the area again / coming back ----------------
    await g.eval('G.Elec.setup(G.world); 1');
    const fresh = await S(g);
    console.log(`      the guest's devices as built again: ${fmt(fresh)}`);
    r = await waitFor([h, g], (a, b) => sameAll(a, b) && st(b, A) === 'on', 8000);
    check(fresh.every((x) => x[1] === 'off') && r.ok, `a guest that builds the area again finds them as the host has them (host ${r.s ? fmt(r.s[0]) : '-'} / guest ${r.s ? fmt(r.s[1]) : '-'})`);
    // a guest who drops out while a device is live, and comes back
    errs.push(...g.errs);
    await g.close();
    await h.until('G.Coop.players.size === 1', 30000).catch(() => {});
    check(await h.eval('G.Coop.players.size') === 1, 'the guest dropped out');
    // (the field is set before the page's scripts run: the run of the guest that comes back starts at once)
    g = await ch.page('about:blank');
    await g.send('Page.addScriptToEvaluateOnNewDocument', { source: PLANT });
    await g.send('Page.navigate', { url: url('Guest') });
    await g.until(`window.G && G.Coop && G.Coop.id >= 2 && G.game.run && G.world && G.game.area === ${AREA} && G.Coop.fpOk !== undefined`, 180000);
    await g.eval(off);
    await g.running(undefined, 120000);
    await g.eval('G.game.dev = { god: true, speed: 1, freeze: true }; ' + play);
    check(await g.eval('G.Coop.fpOk') === true && await g.eval('G.world.field') === 'plant', 'the guest comes back into the same plant area');
    r = await waitFor([h, g], (a, b) => sameAll(a, b) && st(b, A) === 'on', 15000);
    check(r.ok, `and finds the devices as the host has them (host ${r.s ? fmt(r.s[0]) : '-'} / guest ${r.s ? fmt(r.s[1]) : '-'})`);
    // (the page that came back pauses at once, as no pointer lock can be had headless: its clock is set going again first)
    await g.eval(play); await g.gameFor(0.5); await h.eval(play);
    const slSame = (a, b) => E1.l.every((id) => Math.abs(sl(a, id) - sl(b, id)) < 1.5);
    r = await waitFor([h, g], (a, b) => sameAll(a, b) && slSame(a, b), 10000);
    check(r.ok, `with the same sleeps (host ${r.s ? fmt(r.s[0]) : '-'} / guest ${r.s ? fmt(r.s[1]) : '-'})`);

    // ---------------- 6. the area cleared ----------------
    await h.eval('G.game.clearArea(); 1');
    r = await waitFor([h, g], (a, b) => a.every((x) => norm(x[1]) === 'off') && b.every((x) => norm(x[1]) === 'off'), 10000);
    check(r.ok, `the area cleared: every device stops on both (host ${r.s ? fmt(r.s[0]) : '-'} / guest ${r.s ? fmt(r.s[1]) : '-'})`);
    check(await g.eval('G.game.areaCleared') === true, 'the guest is told the area is cleared');
    await h.eval('G.Elec.waveT = 0.05; 1');
    await h.gameFor(1);
    r = await waitFor([h, g], (a, b) => a.every((x) => norm(x[1]) === 'off') && b.every((x) => norm(x[1]) === 'off'), 2000);
    check(r.ok && !(await h.eval('!!G.Elec.warn')) && !(await g.eval('!!G.Elec.warn')), 'and no surge comes after');

    // ---------------- 9. no errors ----------------
    errs.push(...h.errs, ...g.errs);
    check(!errs.length, 'no errors ' + errs.slice(0, 3).join(' | ').slice(0, 600));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nELEC TEST FAILED (${fails.length})` : '\nELEC TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
