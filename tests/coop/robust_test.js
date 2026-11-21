'use strict';
// What real play does to a room: bad messages, a tab put away and brought back (guest and host), a lost drawing context, a reload, joining
// while the others change area / stand in a room / fight a guardian, a full room, another version, a broker that never answers, a closed channel,
// the host gone. Three pages: Host, G1, G2 (G2 draws for real, for the lost context).
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9951;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  const sec = async (name, fn) => { if (process.env.ONLY && name !== 'setup' && !process.env.ONLY.split(',').some((k) => name.includes(k))) return; console.log('-- ' + name); try { await fn(); } catch (e) { check(false, `${name}: ${String(e.message || e).slice(0, 300)}`); } };
  const tq = '&local=1&lat=30&jit=10', room = 'Q' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const url = (n, host) => `http://127.0.0.1:${PORT}/coop.html?room=${room}${host ? '&host=1' : ''}&name=${n}${tq}`;
  const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
  const gt = (pg) => pg.eval('G.game.time');
  // (a page put away: all of its script held where it stands - timers, frames, messages wait - as a phone does to a browser behind another app)
  const freeze = async (pg, ms) => { await pg.send('Debugger.enable'); pg.send('Debugger.pause'); await sleep(ms); await pg.send('Debugger.resume'); await pg.send('Debugger.disable'); };
  const play = 'G.ui.clearScreen(); G.game.state = "playing"; 1';
  const errN = (pgs) => pgs.reduce((a, p) => a + p.errs.length, 0);
  const newErrs = (pg, n0) => pg.errs.slice(n0).join(' | ').slice(0, 400);
  // a guest page that joins (or a fresh page that is told to join later: join=false)
  const guest = async (n, join) => {
    const pg = await ch.page(join === false ? `http://127.0.0.1:${PORT}/coop.html?name=${n}${tq}` : url(n));
    await pg.booted();
    return pg;
  };
  const seesSame = async (h, g) => {
    const a = await h.eval('G.game.area + ":" + G.game.stage'), b = await g.eval('G.game.area + ":" + G.game.stage');
    return [a === b, a, b];
  };
  let h, g1, g2;
  try {
    await sec('setup', async () => {
      h = await ch.page(url('Host', true));
      await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
      await h.booted();
      await sleep(300);
      const st = "JSON.stringify(window.G && G.Coop ? { id: G.Coop.id, role: G.Coop.role, inRoom: !!G.Coop._inRoom, net: !!G.Coop.net, ver: window.COOP_VER, err: (document.getElementById('cl-err') || {}).textContent, players: [...G.Coop.players.values()].map((p) => [p.id, p.name]), st: G.game.state } : 'no G')";
      const why = async (e) => { for (const [n, p] of [['host', h], ['G1', g1], ['G2', g2]]) if (p) console.log(n, await p.eval(st).catch((x) => x.message)); throw e; };
      g1 = await guest('G1'); await g1.until('window.G && G.Coop && G.Coop.id >= 1', 90000).catch(why);
      g2 = await guest('G2');
      await g2.until('window.G && G.Coop && G.Coop.id >= 1 && G.Coop.players.size === 3', 90000).catch(async (e) => {
        const st = "JSON.stringify(window.G && G.Coop ? { id: G.Coop.id, role: G.Coop.role, inRoom: !!G.Coop._inRoom, net: !!G.Coop.net, err: (document.getElementById('cl-err') || {}).textContent, players: [...G.Coop.players.values()].map((p) => [p.id, p.name]), st: G.game.state } : 'no G')";
        console.log('G2', await g2.eval(st).catch((x) => x.message), 'host', await h.eval(st).catch((x) => x.message), 'G1', await g1.eval(st).catch((x) => x.message));
        throw e;
      });
      await h.eval(off); await g1.eval(off);
      await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
      for (const g of [g1, g2]) await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
      for (const pg of [h, g1, g2]) await pg.running();
      for (const g of [g1, g2]) await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
      await sleep(2000);
      check(await g1.eval('G.Coop.fpOk') && await g2.eval('G.Coop.fpOk'), 'three in the room, the same world');
    });

    if (fails.length) throw new Error('the room was not made: nothing else can be checked');
    await sec('bad messages', async () => {
      // every kind the page knows, with nothing in it; then junk. The loop must go on.
      const junk = "[null, 7, 'x', [], {}, { t: 'zz' }, { t: 'hit', h: [[99999, 5, 0, 0, 0, 0], [-40, 5, 0, 0, 0, 0]] }, { t: 'need', id: 123456 }, { t: 'p', i: 77 }, { t: 'sh', i: 1, a: [0, 0, 0] }]";
      const hostSkip = "['engage', 'gate', 'trap', 'hi']", guestSkip = "['no', 'room', 'roster', 'late', 'area', 'wipe', 'won', 'go', 'gone', 'diff']";
      const feed = (from, skip) => `(() => { const K = G.Coop, n0 = K.net, skip = ${skip}; let thrown = 0;
        const all = Object.keys(K.handlers).filter((k) => !skip.includes(k)).map((t) => ({ t })).concat(${junk});
        for (const m of all) { try { K.net.onmsg(${from}, m); } catch (e) { thrown++; } }
        return JSON.stringify({ n: all.length, thrown, net: K.net === n0, live: K.live }); })()`;
      const t0 = await gt(h), e0 = h.errs.length;
      const r = JSON.parse(await h.eval(feed(1, hostSkip)));
      check(r.thrown === 0 && r.net && r.live, `the host takes ${r.n} empty / broken messages without an exception escaping (${r.thrown})`);
      // (a guest hears only the host, whose version was checked: it gets the junk, kinds it does not know, fields left out and foes it never had - not every kind of the host's empty)
      const r2 = JSON.parse(await g1.eval(feed(0, "Object.keys(G.Coop.handlers)")));
      check(r2.thrown === 0 && r2.net && r2.live, `a guest takes ${r2.n} empty / broken messages without an exception escaping (${r2.thrown})`);
      await h.eval(play); await g1.eval(play);
      await sleep(2500);
      check(await gt(h) > t0 + 1, 'the host\'s world still runs');
      const who = "JSON.stringify([...G.Coop.players.values()].map((p) => [p.id, p.name, Math.round(performance.now() - p.seen)]))";
      check(await h.eval('G.Coop.players.size') === 3 && await g1.eval('G.Coop.players.size') === 3, 'nobody was lost over it ' + await h.eval(who) + ' / ' + await g1.eval(who));
      console.log(`     (caught and logged: host ${h.errs.length - e0}) ${newErrs(h, e0).slice(0, 300)}`);
      h.errs.length = 0; g1.errs.length = 0; g2.errs.length = 0;
    });

    await sec('a guest\'s tab away for 4 s', async () => {
      await freeze(g1, 4000);
      await sleep(2500);
      check(await h.eval('G.Coop.players.size') === 3, 'the host still has the guest');
      check(await g1.eval('G.Coop.live && G.Coop.players.has(0)'), 'the guest still has the host');
      const d = await h.eval('(() => { const rp = G.Coop.players.get(1); return rp ? rp.to.distanceTo(G.Coop._g1 || rp.to) : -1; })()');
      const mine = await g1.eval('JSON.stringify([G.player.pos.x, G.player.pos.y, G.player.pos.z])');
      const there = await h.eval('(() => { const rp = G.Coop.players.get(1); return JSON.stringify(rp ? [rp.to.x, rp.to.y, rp.to.z] : null); })()');
      const a = JSON.parse(mine), b = JSON.parse(there);
      check(b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1.5 && d >= 0, `the host sees the guest where the guest is (${a.map(Math.round)} / ${b && b.map(Math.round)})`);
    });

    await sec('the host\'s tab away for 5 s', async () => {
      const t0 = await gt(h);
      await freeze(h, 5000);
      const t1 = await gt(h);
      // (at most 1 s caught up at once (core.js), plus the moments the test itself takes to resume the page and ask; the 5 s away must not all come at once)
      check(t1 - t0 < 2.5, `the host's world did not run on through the time away in one jump (${(t1 - t0).toFixed(2)} s of game time)`);
      for (const g of [g1, g2]) check(await g.eval('G.Coop.live && G.Coop.players.has(0) && !/切れ|外れ/.test(document.getElementById("coop-back").textContent)'), 'a guest waited for the host');
      await sleep(3000);
      const hp = await h.eval('JSON.stringify([G.player.pos.x, G.player.pos.y, G.player.pos.z].map(Number.isFinite))');
      check(hp === '[true,true,true]', 'the host stands somewhere');
      const a = await h.eval('G.enemies.list.filter((e) => e.alive && !e.custom).length'), b = await g1.eval('G.enemies.list.filter((e) => e.alive && !e.custom).length');
      check(Math.abs(a - b) <= 1, `the guest sees the host's foes again (${a} / ${b})`);
    });

    await sec('a guest loses its drawing context', async () => {
      const e0 = h.errs.length + g1.errs.length, t0 = await gt(h);
      await g2.eval("(() => { const x = G.renderer.getContext().getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return !!x; })()");
      await sleep(4000);
      check(h.errs.length + g1.errs.length === e0, 'no errors on the host or the other guest ' + newErrs(h, 0) + newErrs(g1, 0));
      check(await gt(h) > t0 + 2, 'the host\'s world runs on');
      check(await h.eval('G.Coop.players.size') === 3 && await h.eval('performance.now() - G.Coop.players.get(2).seen < 1500'), 'the guest without a context still talks to the host');
      console.log('     (on that guest: ' + g2.errs.slice(0, 3).join(' | ').slice(0, 300) + ')');
    });

    await sec('a guest reloads its page', async () => {
      const e0 = h.errs.length + g1.errs.length;
      g2.errs.length = 0;
      await g2.send('Page.reload', { ignoreCache: false });
      await sleep(1000);
      await g2.booted();
      await g2.until('G.Coop && G.Coop.live && G.game.run && G.Coop.fpOk !== undefined', 60000);
      const err = await g2.eval('(document.getElementById("cl-err") || {}).textContent || ""');
      check(!/満員/.test(err), 'the reloading guest is not turned away as one too many ' + err);
      check(await g2.eval('G.Coop.fpOk'), 'it comes back into the same world');
      await sleep(1500);
      check(await h.eval('G.Coop.players.size') === 3, `the host counts three, not four (${await h.eval('G.Coop.players.size')})`);
      check(await g1.eval('[...G.Coop.players.values()].filter((p) => p.name === "G2").length') === 1, 'the other guest sees it once');
      check(h.errs.length + g1.errs.length === e0, 'no errors on the others');
      await g2.eval(off);
    });

    await sec('a guest away for 12 s', async () => {
      await freeze(g1, 12000);
      await sleep(1000);
      check(await h.eval('!G.Coop.players.has(1)'), 'the host let the silent guest go');
      check(await g2.eval('!G.Coop.players.has(1)'), 'and the other guest heard of it');
      await g1.until('document.getElementById("coop-back").style.display === "flex"', 25000);
      const txt = await g1.eval('document.getElementById("coop-back").textContent');
      check(/入り直す/.test(txt), 'the guest that came back is told it was let go, with a way back in: ' + txt.slice(0, 80));
      await g1.eval('document.getElementById("coop-rejoin").click(); 1');
      await sleep(1500);
      await g1.booted();
      await g1.until('G.Coop && G.Coop.live && G.game.run && G.Coop.fpOk !== undefined', 60000);
      await g1.eval(off);
      const [same, a, b] = await seesSame(h, g1);
      check(same && await g1.eval('G.Coop.fpOk'), `one click and it is back in the same area and world (${a} / ${b})`);
      check(await h.eval('G.Coop.players.size') === 3, 'three again');
    });

    await sec('joining while the others change area', async () => {
      await g2.close(); await sleep(9500);
      check(await h.eval('G.Coop.players.size') === 2, 'G2 gone');
      g2 = await guest('G2', false);
      await g2.eval(off);
      await h.eval(`G.ui.clearScreen(); G.game.state = 'playing'; G.game.transitioning = false; G.Coop.go(G.game.area + 1, 'combat'); 1`);
      await sleep(250);
      await g2.eval(`G.Coop.open('${room}', false, 'G2'); 1`);
      await h.running(); await g2.until('G.Coop.live && G.game.run && !G.game.transitioning && !G.game._warming', 60000);
      await sleep(3000);
      const [same, a, b] = await seesSame(h, g2);
      check(same && await g2.eval('G.Coop.fpOk'), `the newcomer lands in the area the others went to (${a} / ${b})`);
      const fa = await h.eval('G.enemies.list.filter((e) => e.alive && !e.custom).length'), fb = await g2.eval('G.enemies.list.filter((e) => e.alive && !e.custom).length');
      check(Math.abs(fa - fb) <= 1, `and sees the same foes (${fa} / ${fb})`);
    });

    await sec('joining while the others stand in a shop', async () => {
      await g2.close(); await sleep(9500);
      await h.eval(`G.ui.clearScreen(); G.game.state = 'playing'; G.game.transitioning = false; G.Coop.go(G.game.area + 1, 'shop'); 1`);
      await h.running(); await sleep(1000);
      g2 = await guest('G2');
      await g2.until('G.Coop.live && G.game.run && G.Coop.fpOk !== undefined && !G.game.transitioning', 60000);
      await g2.eval(off);
      const [same, a, b] = await seesSame(h, g2);
      check(same && await g2.eval('G.Coop.fpOk'), `the newcomer is in the shop too (${a} / ${b})`);
    });

    await sec('joining in the middle of a guardian fight', async () => {
      await g2.close(); await sleep(9500);
      await h.eval(`G.ui.clearScreen(); G.game.state = 'playing'; G.game.transitioning = false; G.Coop.go(G.game.area + 1, 'boss'); 1`);
      await h.running(); await g1.until('G.game.stage === "boss" && !G.game.transitioning', 30000);
      await sleep(800);
      for (const pg of [h, g1]) await pg.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.pos.set(G.world.arenaCenter.x, 0.1, (G.world.ledgeZ || G.world.arenaD) - 6); G.player.vel.set(0, 0, 0); G.player.grounded = true; 1");
      await h.until('!!G.bosses.active && G.game.bossEngaged', 30000);
      await sleep(3000);
      g2 = await guest('G2');
      await g2.until('G.Coop.live && G.game.run && G.Coop.fpOk !== undefined && !G.game.transitioning', 60000);
      await g2.eval(off);
      await g2.until('!!G.bosses.active', 15000).catch(() => {});
      const hb = await h.eval('G.bosses.active ? G.bosses.active.def.id + ":" + Math.round(G.bosses.active.hp / G.bosses.active.maxHp * 100) : ""');
      const gb = await g2.eval('G.bosses.active ? G.bosses.active.def.id + ":" + Math.round(G.bosses.active.hp / G.bosses.active.maxHp * 100) : ""');
      check(hb && hb.split(':')[0] === gb.split(':')[0], `the newcomer sees the guardian (${hb} / ${gb})`);
      // (the fight is the host's: a newcomer is brought to the hall's door, as the others were when it began, and steps in itself - its own bossEngaged comes then)
      check(await g2.eval('G.player.pos.distanceTo(G.world.arenaCenter) < 45'), 'and is brought to the hall ' + await g2.eval('Math.round(G.player.pos.distanceTo(G.world.arenaCenter))'));
      const [same, a, b] = await seesSame(h, g2);
      check(same, `in the same hall (${a} / ${b})`);
    });

    await sec('a full room', async () => {
      const x = await guest('X');
      await x.until('/満員/.test(document.getElementById("cl-err").textContent)', 25000).catch(() => {});
      check(/満員/.test(await x.eval('document.getElementById("cl-err").textContent')), 'a fourth is told the room is full');
      check(await h.eval('G.Coop.players.size') === 3, 'and the three stay three');
      await x.close();
    });

    await sec('another version', async () => {
      const v = await guest('V', false);
      await v.eval(`window.COOP_VER = 'other'; G.Coop.open('${room}', false, 'V'); 1`);
      await v.until('/バージョン/.test(document.getElementById("cl-err").textContent)', 20000).catch(() => {});
      check(/バージョン/.test(await v.eval('document.getElementById("cl-err").textContent')), 'another version is told so');
      // trying again from the same page starts over clean (a new page load), instead of wrapping the game twice
      await v.eval(`G.Coop.open('${room}', false, 'V'); 1`).catch(() => {});
      await sleep(1500);
      await v.booted();
      await v.until('G.Coop && G.Coop.role === "guest" && document.getElementById("cl-err").textContent.length > 0', 30000).catch(() => {});
      check(await v.eval('document.querySelectorAll("#coop-chat").length <= 1 && document.querySelectorAll("#coop-hud").length === 1 && (G.Coop._opens || 1) === 1'), 'the second try is a clean start (no doubled parts)');
      await v.close();
      await sleep(500);
      check(await h.eval('G.Coop.players.size') === 3, 'the room is untouched');
    });

    await sec('a broker that never answers', async () => {
      const stub = "window.Peer = function () { const o = { on() { return o; }, destroy() {}, reconnect() {}, connect() { return { on() {} }; } }; return o; };";
      for (const [nm, isHost] of [['PG', false], ['PH', true]]) {
        const p = await ch.page(`http://127.0.0.1:${PORT}/coop.html?name=${nm}`);
        await p.booted();
        await p.eval(`${stub} CoopNet.WAIT = 2500; G.Coop.open('ZZZZZ', ${isHost}, '${nm}'); 1`);
        await p.until('/つながりません/.test(document.getElementById("cl-err").textContent)', 12000).catch(() => {});
        const t = await p.eval('document.getElementById("cl-err").textContent');
        check(/つながりません/.test(t), `${isHost ? 'making' : 'joining'} a room with no answer ends in a message (${t.slice(0, 60)})`);
        await p.close();
      }
      const p = await ch.page(`http://127.0.0.1:${PORT}/coop.html?name=PN`);
      await p.booted();
      await p.eval("window.Peer = undefined; G.Coop.open('ZZZZZ', false, 'PN'); 1").catch(() => {});
      await sleep(800);
      const t = await p.eval('document.getElementById("cl-err").textContent');
      check(/PeerJS/.test(t), `no PeerJS (blocked script) ends in a message (${t.slice(0, 60)})`);
      await p.close();
    });

    await sec('a channel that closes', async () => {
      const e0 = errN([h, g2]);
      // what PeerJS reports when the line to a guest closes: the host lets it go at once, the rest go on
      const id1 = await h.eval('[...G.Coop.players.values()].find((p) => p.name === "G1").id');
      await h.eval(`G.Coop.net.onleave(${id1}); 1`);
      await sleep(1500);
      check(await h.eval(`!G.Coop.players.has(${id1})`) && await g2.eval(`!G.Coop.players.has(${id1})`), 'the host lets the guest go and the other guest hears of it');
      check(await g2.eval('G.Coop.live && G.Coop.players.has(0)'), 'the other guest plays on');
      // and on the guest's side, its line to the host closing
      await g1.eval('G.Coop.net.onleave(0); 1');
      await sleep(800);
      const txt = await g1.eval('document.getElementById("coop-back").style.display + " " + document.getElementById("coop-back").textContent');
      check(/flex/.test(txt) && /切れ/.test(txt) && /部屋を出る/.test(txt), 'the guest is told the line to the host closed: ' + txt.slice(0, 90));
      check(errN([h, g2]) === e0, 'no errors on the others');
      await g1.close();
    });

    await sec('the host gone', async () => {
      await h.close();
      await sleep(4500);
      const w = await g2.eval('(document.getElementById("coop-wait") || {}).textContent || ""');
      check(/ホスト/.test(w), 'a guest says it is waiting for the host: ' + w.slice(0, 60));
      await g2.until('document.getElementById("coop-back").style.display === "flex" && /切れ/.test(document.getElementById("coop-back").textContent)', 40000).catch(() => {});
      check(await g2.eval('/切れ/.test(document.getElementById("coop-back").textContent)'), 'then that the host is gone');
      await g2.eval('document.getElementById("coop-quit").click(); 1');
      await sleep(1500);
      await g2.booted();
      await g2.until('G.Coop && G.Coop.lobbyEl && G.game.state === "title"', 30000);
      const lob = await g2.eval('JSON.stringify({ role: G.Coop.role, shown: G.Coop.lobbyEl.style.display !== "none", url: location.search, join: !!document.getElementById("cl-join") })');
      const L = JSON.parse(lob);
      check(!L.role && L.shown && L.join && !/room=/.test(L.url), 'leaving goes to the lobby, not back into the dead room ' + lob);
    });
    console.log('errors left: host ' + (h ? h.errs.length : '-') + ', G2 ' + (g2 ? g2.errs.length : '-') + ' ' + (g2 ? g2.errs.slice(0, 3).join(' | ').slice(0, 400) : ''));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nROBUST TEST FAILED (${fails.length})` : '\nROBUST TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
