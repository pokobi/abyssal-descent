'use strict';
// Every guardian in turn in one session, a host and a guest fighting each with weak shots: tests/coop/boss_sweep.js [seconds each, default 14] [ids...]
const fs = require('fs'), path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 8841;
const ALL = 'colossus wyrm archon executioner broodmother twins heart hunter drake abyssking sovereign sovereign2 houndlord boneking warlock cerberus madman ossuary hollowknight lich behemoth weaver warden arbiter minotaur cinderpriest ashdrake oboro foxfire karakuri stormimp'.split(' ');
const secs = +process.argv[2] || 14, ids = process.argv.slice(3).length ? process.argv.slice(3) : ALL;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const rows = [];
  try {
    const q = '&local=1&lat=50&jit=20', room = 'B' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    const bot = fs.readFileSync(path.join(__dirname, 'coopbot.js'), 'utf8');
    await h.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbDmg = 5; 1`);
    await g.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbDmg = 5; 1`);
    await h.eval('G.Coop.stat = true; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    for (const id of ids) {
      const e0 = h.errs.length + g.errs.length, row = { id };
      try {
        await h.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); G.game.area = 4; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
        await g.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); G.Coop.fpOk = undefined; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
        await h.eval("G.Coop.go(5, 'boss'); 1");
        await g.until('G.game.stage === "boss" && G.Coop.fpOk !== undefined', 25000);
        row.world = await g.eval('G.Coop.fpOk');
        await sleep(600);
        await h.eval("G.player.pos.set(G.world.arenaCenter.x, 0.1, (G.world.ledgeZ || G.world.arenaD) - 6); G.player.grounded = true; 1");
        await g.until('!!G.bosses.active', 15000);
        await g.eval('window.__t0 = G.game.run.dmgTaken; 1');
        await g.eval(`window.__cb = __coopbot(${secs * 1000}); 1`); await h.eval(`window.__cb = __coopbot(${secs * 1000}); 1`);
        await sleep(secs * 1000);
        const nb = (p) => p.eval('JSON.stringify([G.Coop.bossNodes.length, G.bosses.active ? Math.round(G.bosses.active.hp) : -1, G.bosses.active ? G.bosses.active.parts.length : 0, Math.round(G.game.run.dmgTaken - (window.__t0 || 0))])');
        const [nh, hh, ph] = JSON.parse(await nb(h)), [ng, hg, pg, took] = JSON.parse(await nb(g));
        Object.assign(row, { nodes: nh === ng ? nh : `${nh}/${ng}`, parts: ph === pg ? ph : `${ph}/${pg}`, hp: hh, hpGuest: hg, took });
      } catch (e) { row.fail = String(e.message).slice(0, 80); const d = 'JSON.stringify([G.game.area, G.game.stage, G.game.state, !!G.game.transitioning, !!G.game._warming, G.game.bossEngaged, !!G.bosses.active, G.Coop.live, G.Coop.players.size, Math.round(G.player.pos.z), G.world.arenaD, G.world.ledgeZ, G.player.dead])'; row.h = await h.eval(d).catch(() => '?'); row.g = await g.eval(d).catch(() => '?'); }
      row.errs = h.errs.slice(0).concat(g.errs).slice(e0 ? 0 : 0).length - e0;
      if (row.errs > 0) row.first = h.errs.concat(g.errs).slice(e0, e0 + 2).join(' || ').slice(0, 400);
      console.log(JSON.stringify(row));
      rows.push(row);
    }
    console.log('net', await h.eval('JSON.stringify(G.Coop.netStat || {})'));
  } finally { ch.close(); srv.close(); }
  const bad = rows.filter((r) => r.fail || r.errs > 0 || r.world !== true || typeof r.nodes !== 'number');
  console.log(`\n${rows.length - bad.length} / ${rows.length} guardians clean; hurt the guest: ${rows.filter((r) => r.took > 0).map((r) => r.id).join(' ')}`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
