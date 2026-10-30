'use strict';
// Two players on one machine (two pages, BroadcastChannel with a simulated delay), both played by bots.
//   node tests/coop/coop_test.js [--lat=80] [--jit=40] [--secs=60] [--boss=colossus] [--shots=dir] [--peer]
// --boss starts in that guardian's area; --peer uses the real PeerJS broker instead of the local channel.
const fs = require('fs'), path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const lat = +arg('lat', 60), jit = +arg('jit', 30), secs = +arg('secs', 60), boss = arg('boss', ''), shots = arg('shots', ''), usePeer = arg('peer', false);
const PORT = +process.env.COOP_PORT || 8791;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const room = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const q = usePeer ? '' : `&local=1&lat=${lat}&jit=${jit}`;
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(usePeer ? 2500 : 300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    check(await h.eval('G.Coop.players.size') === 2, 'guest joined the room');
    // software rendering takes seconds per frame here and proves nothing about the sync: the tests run without drawing unless shots are wanted
    if (!shots) { const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1'; await h.eval(off); await g.eval(off); }
    const bot = fs.readFileSync(path.join(__dirname, 'coopbot.js'), 'utf8');
    await h.eval(`(0, eval)(${JSON.stringify(bot)}); 1`);
    await g.eval(`(0, eval)(${JSON.stringify(bot)}); 1`);
    await h.eval(`G.Coop.begin(); G.game.dev = { god: ${!boss}, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.world && G.game.area >= 1 && G.Coop.fpOk !== undefined', 60000);
    check(await g.eval('G.Coop.fpOk === true'), 'both sides built the same world');
    if (boss) {
      await h.eval(`G.Dev && G.Dev.enable && 0; G.bosses.forArea = () => '${boss}'; G.Coop.go = G.Coop.go; G.game.seed = G.game.seed; 1`);
      await g.eval(`G.bosses.forArea = () => '${boss}'; 1`);
      await h.eval(`(async () => { const n = 5; G.game.area = n - 1; G.Coop.go(n, 'boss'); })(); 1`);
      await g.until('G.game.stage === "boss" && G.Coop.fpOk === true', 40000);
      await sleep(1500);
      await h.eval("G.player.pos.set(G.world.arenaCenter.x, 0.1, G.world.arenaD - 7); 1");
      await g.until('!!G.bosses.active', 40000);
      await h.eval('G.player.hp = G.player.stats.maxHp; 1');
      check(await g.eval('G.Coop.bossNodes.length > 0'), 'the guardian appeared for the guest');
    }
    { const d = boss ? 6 : 14; await h.eval(`window.__cbDmg = ${d}; 1`); await g.eval(`window.__cbDmg = ${d}; 1`); }
    await h.eval(`window.__cb = __coopbot(${secs * 1000}); 1`);
    await g.eval(`window.__cb = __coopbot(${secs * 1000}); 1`);
    const stat = async (p) => JSON.parse(await p.eval(`JSON.stringify({ area: G.game.area, stage: G.game.stage, st: G.game.state, foes: G.enemies.list.filter((e) => e.alive).length, hp: Math.round(G.player.hp), dead: G.player.dead, boss: G.bosses.active ? Math.round(G.bosses.active.hp) : null, kills: G.game.run.kills, coins: G.game.run.coins, dealt: Math.round(G.game.run.dmgDealt || 0), taken: Math.round(G.game.run.dmgTaken), fps: G.Coop.fps || 0, hid: document.hidden, list: G.enemies.list.filter((e) => e.alive).slice(0, 4).map((e) => [e._nid, e.def.id, Math.round(e.hp), Math.round(e.shield || 0), e.state, !!e.invuln, !!e.untargetable, !!e.burrowed, Math.round(e.pos.x), Math.round(e.pos.z)]), me: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)], stat: window.__cbs })`));
    let maxFoes = 0, sawHit = false, sawDamage = false;
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
      await sleep(5000);
      const a = await stat(h), b = await stat(g);
      console.log('host', JSON.stringify(a)); console.log('gst ', JSON.stringify(b));
      maxFoes = Math.max(maxFoes, b.foes, b.stat.maxFoes || 0);
      if (b.dealt > 0) sawHit = true;
      if (b.taken > 0) sawDamage = true;
      if (shots) { fs.mkdirSync(shots, { recursive: true }); await h.shot(path.join(shots, 'host.png')); await g.shot(path.join(shots, 'guest.png')); }
    }
    const a = await stat(h), b = await stat(g);
    check(maxFoes > 0, 'the guest saw foes');
    check(sawHit, 'the guest dealt damage');
    check(a.kills + b.kills > 0 || boss, 'foes were killed');
    check(sawDamage, 'the guest was hurt by foes');
    if (boss) { const nh = await h.eval('G.Coop.bossNodes ? G.Coop.bossNodes.length : 0'), ng = await g.eval('G.Coop.bossNodes ? G.Coop.bossNodes.length : 0'); check(nh === ng && nh > 0, `the guardian has the same body on both sides (${nh} / ${ng} parts)`); console.log('net', await h.eval('JSON.stringify(G.Coop.netStat || {})')); }
    check(a.area === b.area && a.stage === b.stage, `both in the same area (${a.area} ${a.stage} / ${b.area} ${b.stage})`);
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 4).join(' | '));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 4).join(' | '));
    // the guest drops out: the host carries on alone
    await g.close();
    await sleep(10000);
    check(await h.eval('G.Coop.players.size') === 1 && !h.errs.length, 'the host goes on after the guest leaves ' + h.errs.slice(0, 3).join(' | ') + ' players ' + await h.eval('G.Coop.players.size'));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nCOOP TEST FAILED (${fails.length})` : '\nCOOP TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
