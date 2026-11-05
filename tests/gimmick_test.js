'use strict';
// A guardian's summoned gimmicks (ward-eyes, egg sacs, shadow clones, abyss wedges, crystals): breaking every one of a batch takes a share of the
// guardian's own health (Boss.gimmickClear), and a batch that is not all broken by the player (a hatched egg sac) pays nothing.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9993;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(600);
    const pct = await p.eval('G.bosses.GIMMICK_PCT');
    // [guardian, how its gimmicks are raised, where they are]
    const CASES = [
      ['archon', 'b.spawnWards()', 'b.wards'],
      ['broodmother', 'b.layEggs()', 'b.eggs.filter((e) => e.alive)'],
      ['hunter', 'b.spawnClones()', 'b.clones.map((c) => c.part)'],
      ['abyssking', 'b.spawnAnchors(3)', 'b.anchors.filter((a) => a.alive)'],
      ['boneking', "b.raiseTotems({ n: 3, hp: 300, totem: '骨の結晶' })", 'b.totems.map((t) => t.p)'],
      ['arbiter', "b.raiseTotems({ n: 3, hp: 260, totem: '避雷針' })", 'b.totems.map((t) => t.p)'],
    ];
    // into the guardian's room, then step into the arena so the fight starts
    const fight = async (id) => {
      await p.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); G.game.area = 4; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(5, 'boss'); 1`);
      await p.until('G.game.stage === "boss" && !!G.world.arenaCenter', 25000);
      await sleep(500);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.pos.set(G.world.arenaCenter.x, 0.1, (G.world.ledgeZ || G.world.arenaD) - 6); G.player.grounded = true; 1");
      return p.until('!!G.bosses.active', 20000).then(() => true).catch(() => false);
    };
    for (const [id, raise, list] of CASES) {
      const up = await fight(id).catch(() => false);
      if (!up) { check(false, `${id}: the fight started`); continue; }
      await sleep(400);
      const r = await p.eval(`(async () => {
        const b = G.bosses.active; G.ui.clearScreen(); G.game.state = 'playing';
        b.hp = b.maxHp * 0.9; ${raise};
        const parts = ${list}, h0 = b.hp;
        for (const q of parts) for (let i = 0; i < 80 && q.alive; i++) G.combat.damageEnemy(q, q.maxHp + 50, { src: 'gun' });
        await new Promise((res) => setTimeout(res, 400)); // (the crystals are counted in the guardian's own update)
        return { n: parts.length, left: parts.filter((q) => q.alive).length, lost: (h0 - b.hp) / b.maxHp };
      })()`);
      check(r.n > 0 && r.left === 0 && Math.abs(r.lost - pct) < 0.02, `${id}: breaking all ${r.n} gimmicks takes ${Math.round(r.lost * 1000) / 10}% of its health (want ${pct * 100}%)`);
    }
    // a nest whose egg sac hatched pays nothing
    await fight('broodmother');
    await sleep(400);
    const r = await p.eval(`(() => { const b = G.bosses.active; G.ui.clearScreen(); G.game.state = 'playing'; b.hp = b.maxHp * 0.9; b.layEggs(); const eggs = b.eggs.filter((e) => e.alive), h0 = b.hp;
      b.hatch(eggs[0]); for (const q of eggs.slice(1)) for (let i = 0; i < 80 && q.alive; i++) G.combat.damageEnemy(q, q.maxHp + 50, { src: 'gun' });
      return (h0 - b.hp) / b.maxHp; })()`);
    check(r < 0.005, `brood mother: a nest with a hatched sac pays nothing (lost ${Math.round(r * 1000) / 10}%)`);
    check(!p.errs.length, 'no errors' + (p.errs.length ? ': ' + p.errs.slice(-2).join(' | ').slice(0, 300) : ''));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nGIMMICK TEST FAILED (${fails.length})` : '\nGIMMICK TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
