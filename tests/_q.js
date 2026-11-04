'use strict';
// Elements (js/element.js): leaving an element, every reaction and its order, the gun / boon cool-down, foes born with an element, 属性熟練 and the reaction boons
// as separate factors, resistances, the player's side, the colours of the numbers, the badge on the HP bar, 属性の油, 属性コア, the water skills.
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
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(800);
    // a quiet test bench: no foes of the area, crits off, a dummy far from walls
    await p.eval(`(() => {
      for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); }
      G.enemies.list.length = 0;
      G.game.spawnEnemy = G.game.spawnEnemy;
      window.T = {};
      T.def = G.ENEMY_BY_ID.brute_normal;
      T.mk = (dx, dz, o) => { const P = G.player; const e = G.enemies.spawn(T.def, 5, new THREE.Vector3(P.pos.x + (dx || 0), P.pos.y, P.pos.z + (dz || -6)), Object.assign({ noSplit: true }, o || {})); e.maxHp = e.hp = 1e6; e.shield = e.maxShield = 0; e.update = () => {}; e.state = 'chase'; e.centerRef = e.pos.clone(); e.centerRef.y += 1; e.hitW = null; return e; };
      T.clean = () => { for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); } G.enemies.list.length = 0; };
      T.hit = (e, el, amt, extra) => G.combat.damageEnemy(e, amt || 100, Object.assign({ src: 'explosion', el: el === undefined ? null : el, noMarker: true }, extra || {}));
      T.nums = []; const dn = G.fx.dmgNum; G.fx.dmgNum = function (p, v, c) { T.nums.push([String(v), c || '']); return dn.apply(this, arguments); };
      G.player.stats.critChance = 0;
      return 1; })()`);
    for (const x of JSON.parse(require('fs').readFileSync(process.env.QF, 'utf8'))) console.log('>>', await p.eval(`(() => { try { return JSON.stringify(${x}); } catch (e) { return 'ERR ' + e.stack.slice(0, 400); } })()`));
  } catch (e) { console.error(e); } finally { await ch.close(); srv.close(); process.exit(0); }
})();
