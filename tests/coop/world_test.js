'use strict';
// Every kind of area on both sides with bots fighting in it, doors and breakable things, then getting a teammate up, chat, ping.
//   node tests/coop/world_test.js [seconds in each area, default 5]
const fs = require('fs'), path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9301;
const secs = +process.argv[2] || 5;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=40&jit=20', room = 'W' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    const bot = fs.readFileSync(path.join(__dirname, 'coopbot.js'), 'utf8');
    await h.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbDmg = 30; 1`);
    await g.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbDmg = 30; 1`);
    await h.eval(`G.Coop.diff = { id: 'hard', lv: 0 }; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    const kinds = JSON.parse(await h.eval('JSON.stringify(Object.keys(G.Areas.TYPES).filter((k) => k !== "boss"))'));
    console.log('kinds', kinds.join(' '));
    let doorDone = false, destDone = false, n = 2;
    const go = async (area, kind) => {
      await g.eval('G.Coop.fpOk = undefined; 1');
      await h.eval(`G.game.area = ${area - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.Coop.go(${area}, '${kind}'); 1`);
      await g.until(`G.game.area === ${area} && G.game.stage === '${kind}' && G.Coop.fpOk !== undefined`, 25000);
      return g.eval('G.Coop.fpOk');
    };
    const e0 = () => h.errs.length + g.errs.length;
    for (const kind of process.env.QUICK ? ['combat'] : kinds) {
      const before = e0();
      let ok = false;
      try { ok = await go(n, kind); } catch (e) { check(false, `${kind}: reached by the guest (${String(e.message).slice(0, 80)})`); await h.eval('G.game.transitioning = false; 1'); continue; }
      await g.eval(`window.__cb = __coopbot(${secs * 1000}); 1`); await h.eval(`window.__cb = __coopbot(${secs * 1000}); 1`);
      await sleep(secs * 1000 + 200);
      check(ok && e0() === before, `${kind}: same world, no errors` + (e0() > before ? ' ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 300) : ''));
      n = n >= 19 ? 2 : n + 1;
    }
    // ---- doors and breakable things, in whatever combat area has them
    for (let a = 2; a <= 20 && (!doorDone || !destDone); a++) {
      await go(a, 'combat');
      await sleep(300);
      const nd = await h.eval('(G.Strata.doors || []).length'), ns = await h.eval('G.world.destructibles.filter((d) => d.alive).length');
      if (nd && !doorDone) {
        doorDone = true;
        await h.eval('G.Strata.openDoor(G.Strata.doors[0]); 1');
        await sleep(500);
        check(await g.eval('G.Strata.doors[0].state === "open" && G.Strata.doors[0].col.alive === false'), 'a door the host opens opens for the guest');
        await g.eval('G.Strata.closeDoor(G.Strata.doors[0]); 1');
        await sleep(500);
        check(await h.eval('G.Strata.doors[0].state === "closed" && G.Strata.doors[0].col.alive === true'), 'a door the guest shuts shuts for the host');
        await h.eval('G.Strata.breakDoor(G.Strata.doors[0]); 1');
        await sleep(500);
        check(await g.eval('G.Strata.doors[0].state === "broken"'), 'a door broken on the host is broken for the guest');
      }
      if (ns && !destDone) {
        destDone = true;
        const i = await g.eval('G.world.destructibles.findIndex((d) => d.alive && !d.explosive)');
        await g.eval(`G.combat.breakDestructible(G.world.destructibles[${i}]); 1`);
        await sleep(500);
        check(await h.eval(`G.world.destructibles[${i}].alive === false`), 'a barrel the guest breaks is gone for the host');
      }
    }
    check(doorDone, 'a door was found to test');
    check(destDone, 'a breakable thing was found to test');
    // ---- getting a teammate up
    await h.eval('G.game.dev = { god: false, speed: 1 }; 1'); await g.eval('G.game.dev = { god: false, speed: 1 }; 1');
    await sleep(200);
    await g.eval("G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; G.player.revives = 0; G.player.invulnT = 0; G.player.stats.dodge = 0; G.player.os = 0; G.player.hp = 1; G.combat.damagePlayer(99999, { src: 'melee', fixed: true }); 1");
    await h.until('G.Coop.players.get(1).dead === true', 4000);
    await h.eval("(() => { G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; const t = G.Coop.players.get(1); G.player.pos.copy(t.to); G.player.vel.set(0, 0, 0); })(); 1");
    await sleep(300);
    await h.eval("G.input.keys[G.BIND.interact[0]] = true; window.__hold = setInterval(() => { G.input.keys[G.BIND.interact[0]] = true; }, 16); 1");
    await sleep(1500); console.log('rv', await h.eval("JSON.stringify([G.game.state, document.getElementById('coop-rv').style.display, document.getElementById('coop-rv').textContent, G.Coop.players.get(1).dead, G.Coop.players.get(1).pos.distanceTo(G.player.pos), G.input.down('interact'), G.player.dead])"));
    await g.until('G.player.dead === false', 12000);
    await h.eval('clearInterval(window.__hold); G.input.keys[G.BIND.interact[0]] = false; 1');
    check(await g.eval('G.player.hp > 1'), 'holding interact beside a fallen teammate gets them up');
    // ---- chat and ping
    await h.eval("G.Coop.send({ t: 'ch', n: 'Host', i: 0, x: 'テスト' }); 1");
    await sleep(500);
    check(await g.eval("document.getElementById('coop-chat').textContent.includes('テスト')"), 'a chat line reaches the other player');
    await g.eval("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' })); 1");
    await sleep(600);
    check(await h.eval("document.querySelectorAll('#coop-marks .cm').length >= 2"), 'a ping shows up on the other screen');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | ').slice(0, 400));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 3).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nWORLD TEST FAILED (${fails.length})` : '\nWORLD TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
