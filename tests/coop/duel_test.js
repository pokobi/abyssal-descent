'use strict';
// Co-op duels (js/duel.js + js/coop/duel.js), a host and a guest over a laggy link (COOP_LAT / COOP_JIT, default 40 / 20 ms):
// the duel reaches the guest, only the duellist is locked and inside the ring, the other is outside with the gauge as the only target; a guest duellist's
// parries are judged on the guest and come off the host's gauge, the blows it misses land on the guest only; shots from outside wear the gauge at 10%
// and never the health; the duel passes on after 15 s of fighting (and at once when the duellist goes down), the new duellist gets the rules again;
// the break ends it for both; a duel that runs out leaves the gauge as a shield the guest sees too.
//   node tests/coop/duel_test.js [boss id]
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9975;
const ID = process.argv[2] || 'madman';
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = `&local=1&lat=${process.env.COOP_LAT || 40}&jit=${process.env.COOP_JIT || 20}`, room = 'D' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    // blows from the guardian are counted, not felt; a bot presses guard the frame a blow flashes when this machine's player is the duellist
    const rig = "window.__hits = 0; window.__auto = false; window.__up = 0; const d0 = G.combat.damagePlayer; G.combat.damagePlayer = function (dmg, info) { if (info && info.attacker && info.attacker.boss) { __hits++; return 0; } return d0.apply(this, arguments); }; const u0 = G.bosses.update; G.bosses.update = function (dt) { const r = u0.apply(this, arguments); const d = G.Duel.cur, k = G.BIND.reload[0]; if (window.__up > 0 && --window.__up === 0) G.input.keys[k] = false; if (d && d.combo && window.__auto && G.Duel.mine()) for (const s of d.combo.list) if (s.flashed && !s.done && !s.parried && !s._p) { s._p = true; G.input.keys[k] = true; G.Duel._kt = performance.now(); window.__up = 2; } return r; }; 1";
    await h.eval(rig); await g.eval(rig);
    const settle = async () => { await h.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); await g.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); };
    await h.eval(`G.bosses.forArea = () => '${ID}'; G.game.area = 4; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
    await g.eval(`G.bosses.forArea = () => '${ID}'; G.Coop.fpOk = undefined; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
    await h.eval("G.Coop.go(5, 'boss'); 1");
    await g.until('G.game.stage === "boss" && G.Coop.fpOk !== undefined', 25000);
    await sleep(600); await settle();
    await h.eval("G.player.pos.set(G.world.arenaCenter.x, 0.1, (G.world.ledgeZ || G.world.arenaD) - 6); G.player.grounded = true; 1");
    await g.until('!!G.bosses.active', 20000);
    await h.until('!!G.bosses.active', 5000);
    check(await g.eval('!!G.bosses.active.duelSt'), 'the guest\'s guardian can duel');
    // the guest stands nearest the guardian: it becomes the first duellist
    await sleep(800);
    await g.eval("(() => { const b = G.bosses.active, P = G.player; P.pos.set(b.pos.x, P.pos.y, b.pos.z + 5); return 1; })()");
    await h.eval("(() => { const b = G.bosses.active, P = G.player; P.pos.set(b.pos.x + 9, P.pos.y, b.pos.z + 14); return 1; })()");
    await sleep(800); await settle();
    await h.eval('(() => { const b = G.bosses.active; b.hp = b.maxHp * 0.69; return 1; })()');
    await h.until('!!G.Duel.cur', 5000).catch(() => {});
    await g.until('!!G.Duel.cur', 5000).catch(() => {});
    const s1 = JSON.parse(await g.eval("JSON.stringify({ on: !!G.Duel.cur, who: G.Duel.cur && G.Duel.cur.who, lock: !!G.player.duelLock, ov: document.getElementById('duel-ov').className, ring: !!(G.Duel.cur && G.Duel.cur.ring) })"));
    const h1 = JSON.parse(await h.eval("JSON.stringify({ on: !!G.Duel.cur, who: G.Duel.cur && G.Duel.cur.who, lock: !!G.player.duelLock, ov: document.getElementById('duel-ov').className, np: G.Duel.cur && G.Duel.cur.np, lim: G.Duel.limit() })"));
    console.log('      guest', JSON.stringify(s1), 'host', JSON.stringify(h1));
    check(s1.on && h1.on && s1.who === 1 && h1.who === 1, 'the duel starts on both, with the guest (nearest) as duellist');
    check(s1.lock && /on/.test(s1.ov) && /read/.test(s1.ov), 'the guest is locked in, with the rules on screen');
    check(!h1.lock && /watch/.test(h1.ov), 'the host is not: it watches, free to move and shoot');
    check(h1.lim === 35, 'two players: 35 s (15 s each, 35 at least)');
    // the host is kept outside the ring, the guest inside
    await sleep(600);
    const pos = JSON.parse(await h.eval("JSON.stringify({ hd: Math.hypot(G.player.pos.x - G.Duel.cur.c.x, G.player.pos.z - G.Duel.cur.c.z), gd: Math.hypot(G.Coop.players.get(1).to.x - G.Duel.cur.c.x, G.Coop.players.get(1).to.z - G.Duel.cur.c.z), R: G.Duel.cur.R })"));
    check(pos.hd >= pos.R && pos.gd < pos.R, `the host outside the ring, the guest inside (${pos.hd.toFixed(1)} / ${pos.gd.toFixed(1)} of ${pos.R})`);
    await h.eval("(() => { const d = G.Duel.cur, P = G.player; P.pos.set(d.c.x + 1, P.pos.y, d.c.z + 1); return 1; })()");
    await sleep(400);
    check(await h.eval("Math.hypot(G.player.pos.x - G.Duel.cur.c.x, G.player.pos.z - G.Duel.cur.c.z) >= G.Duel.cur.R"), 'stepping into the ring pushes the host back out');
    check(await h.until("(() => { const rp = G.Coop.players.get(1); return !!(rp && rp.body && G.scene.children.some((o) => o.visible && o.children && o.children.some((c) => c.isSprite) && o.position.distanceTo(rp.body.root.position) < 0.5)); })()", 4000).catch(() => false), 'the host sees a golden aura with ⚔ 決闘中 on the guest');
    // shots from outside: the gauge, at 10%, never the health
    const w0 = JSON.parse(await h.eval("JSON.stringify([G.bosses.active.duelSt.wg, G.bosses.active.hp])"));
    await h.eval("G.combat.damageEnemy(G.bosses.active.main, 200, { src: 'bullet', noBuffs: true, silent: true }); 1");
    const w1 = JSON.parse(await h.eval("JSON.stringify([G.bosses.active.duelSt.wg, G.bosses.active.hp])"));
    check(w1[1] === w0[1] && w0[0] - w1[0] > 5 && w0[0] - w1[0] < 40, `a shot from outside takes a little off the gauge (${(w0[0] - w1[0]).toFixed(1)}), nothing off its health`);
    await g.until(`Math.abs(G.bosses.active.duelSt.wg - ${w1[0]}) < 2`, 3000).catch(() => {});
    check(await g.eval(`Math.abs(G.bosses.active.duelSt.wg - ${w1[0]}) < 2`), 'the guest\'s gauge follows');
    // the guest misses the first combo: the blows land on the guest only
    await g.until('G.Duel.cur && G.Duel.cur.combo', 40000).catch(() => {});
    const gh0 = await g.eval('__hits'), hh0 = await h.eval('__hits'), wgA = await h.eval('G.bosses.active.duelSt.wg');
    await g.until('G.Duel.cur && !G.Duel.cur.combo', 30000).catch(() => {});
    await sleep(300);
    const gh1 = await g.eval('__hits'), hh1 = await h.eval('__hits');
    check(gh1 > gh0 && hh1 === hh0, `missed blows land on the guest (${gh1 - gh0}), none on the host`);
    check(Math.abs((await h.eval('G.bosses.active.duelSt.wg')) - wgA) < 1, 'and take nothing off the gauge');
    // the guest parries the next one
    await g.eval('window.__auto = true; 1');
    await g.until('G.Duel.cur && G.Duel.cur.combo', 30000).catch(() => {});
    const gh2 = await g.eval('__hits'), wgB = await h.eval('G.bosses.active.duelSt.wg');
    await g.until('G.Duel.cur && !G.Duel.cur.combo', 30000).catch(() => {});
    await sleep(400);
    const gh3 = await g.eval('__hits'), wgC = await h.eval('G.bosses.active.duelSt.wg'), gm = await h.eval('G.bosses.active.duelSt.wgMax');
    console.log(`      parried: hits ${gh3 - gh2}, gauge ${Math.round(wgB)} -> ${Math.round(wgC)} (a parry = ${Math.round(gm / 6)})`);
    check(gh3 === gh2 && wgB - wgC >= gm / 6 - 1, 'the guest\'s parries (judged on the guest) come off the host\'s gauge, no damage');
    await g.eval('window.__auto = false; 1');
    // the duel passes on after 15 s of fighting: to the host
    // (the host runs at about half speed in a two-tab headless browser: its 15 s take longer here)
    await h.until('G.Duel.cur && G.Duel.cur.warned', 90000).catch(() => {});
    await sleep(500);
    check(await g.eval("!!(G.Duel.cur && /次の決闘/.test(G.Duel.cur.note))"), 'two seconds before, everyone is told who is next');
    await h.until('G.Duel.cur && G.Duel.cur.who === 0', 20000).catch(() => {});
    await g.until('G.Duel.cur && G.Duel.cur.who === 0', 5000).catch(() => {});
    await sleep(600);
    const sw = JSON.parse(await h.eval("JSON.stringify({ who: G.Duel.cur && G.Duel.cur.who, lock: !!G.player.duelLock, melee: G.player.meleeMode, ov: document.getElementById('duel-ov').className, d: Math.hypot(G.player.pos.x - G.Duel.cur.c.x, G.player.pos.z - G.Duel.cur.c.z) })"));
    const gsw = JSON.parse(await g.eval("JSON.stringify({ who: G.Duel.cur && G.Duel.cur.who, lock: !!G.player.duelLock, ov: document.getElementById('duel-ov').className })"));
    console.log('      after 15 s: host', JSON.stringify(sw), 'guest', JSON.stringify(gsw));
    check(sw.who === 0 && gsw.who === 0, 'after 15 s the duel passes to the host, on both machines');
    check(sw.lock && sw.melee && /read/.test(sw.ov) && sw.d < 8, 'the host is brought into the ring, melee in hand, with the rules');
    check(!gsw.lock && /watch/.test(gsw.ov), 'the guest is let go');
    // the host duellist goes down: it passes back at once
    await h.eval('G.player.dead = true; 1');
    await h.until('G.Duel.cur && G.Duel.cur.who === 1', 6000).catch(() => {});
    check(await h.eval('G.Duel.cur && G.Duel.cur.who === 1'), 'a duellist who goes down hands the duel on at once');
    await h.eval('G.player.dead = false; 1');
    await g.until('G.Duel.cur && G.Duel.cur.who === 1 && G.player.duelLock', 6000).catch(() => {});
    // the remaining time is put back so the parries can finish it
    await h.eval('G.Duel.cur.fightT = 0; G.Duel.cur.slotT = -60; 1');
    // the guest parries until the gauge breaks
    await g.eval('window.__auto = true; 1');
    await h.until('!G.Duel.cur', 150000).catch(() => {});
    await sleep(500);
    const br = JSON.parse(await h.eval("JSON.stringify({ duel: !!G.Duel.cur, wg: G.bosses.active.duelSt.wg, hp: G.bosses.active.hp / G.bosses.active.maxHp, stun: G.bosses.active.duelSt.stunT })"));
    const gbr = JSON.parse(await g.eval("JSON.stringify({ duel: !!G.Duel.cur, lock: !!G.player.duelLock, wg: G.bosses.active.duelSt.wg, ov: document.getElementById('duel-ov').className })"));
    console.log('      break: host', JSON.stringify(br), 'guest', JSON.stringify(gbr));
    check(!br.duel && br.wg === 0 && br.hp < 0.6 && br.stun > 2, 'parried down to nothing: BREAK on the host (12% of its health, stagger)');
    check(!gbr.duel && !gbr.lock && gbr.wg === 0, 'and the duel is over for the guest too');
    await g.eval('window.__auto = false; 1');
    // the second duel, left to run out: the shield stays, the guest sees it
    await h.until('G.bosses.active.duelSt.stunT <= 0', 20000).catch(() => {});
    await h.eval('(() => { const b = G.bosses.active; b.hp = b.maxHp * 0.34; return 1; })()');
    await h.until('!!G.Duel.cur', 5000).catch(() => {});
    await g.until('!!G.Duel.cur', 5000).catch(() => {});
    check(await g.eval('!!G.Duel.cur && G.bosses.active.duelSt.n === 2'), 'the second duel reaches the guest');
    await h.eval('G.Duel.cur.t = Math.max(G.Duel.cur.t, G.Duel.cur.readUntil); G.Duel.cur.fightT = G.Duel.limit() - 0.3; G.Duel.cur.slotT = 0; 1');
    await h.until('!G.Duel.cur', 5000).catch(() => {});
    await g.until('!G.Duel.cur', 5000).catch(() => {});
    await sleep(1200);
    const sh = JSON.parse(await g.eval("JSON.stringify({ duel: !!G.Duel.cur, lock: !!G.player.duelLock, wg: G.bosses.active.duelSt.wg, max: G.bosses.active.duelSt.wgMax, bar: document.getElementById('boss-duel') && document.getElementById('boss-duel').className })"));
    console.log('      timed out: guest', JSON.stringify(sh));
    check(!sh.duel && !sh.lock && sh.wg > 0 && /on/.test(sh.bar || ''), 'time ran out: the gauge stays as a shield, shown to the guest');
    const hp0 = await h.eval('G.bosses.active.hp');
    await g.eval("(() => { const b = G.bosses.active; for (let i = 0; i < 5; i++) G.combat.damageEnemy(b.main, 60, { src: 'bullet', noBuffs: true, silent: true }); return 1; })()");
    await sleep(1200);
    check(Math.abs((await h.eval('G.bosses.active.hp')) - hp0) < 1, 'the guest\'s shots wear the shield, not its health');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | ').slice(0, 500));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nCOOP DUEL TEST FAILED (${fails.length})` : '\nCOOP DUEL TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
