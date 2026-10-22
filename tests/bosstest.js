// Boss test harness (not loaded by the game). In the console: eval(await (await fetch('tests/bosstest.js')).text())
// then: await __bossTest('houndlord')  -> enters that guardian's arena, forces EVERY attack of its list once (god mode), reports errors.
window.__errs = window.__errs || [];
if (!window.__errHooked) {
  window.__errHooked = true;
  const oe = console.error;
  console.error = function (...a) { window.__errs.push(a.map((x) => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ').slice(0, 400)); oe.apply(console, a); };
  window.addEventListener('error', (e) => window.__errs.push('WIN ' + e.message + ' ' + (e.filename || '') + ':' + e.lineno));
}
window.__bossTest = async function (id, opts) {
  opts = opts || {};
  const GM = G.game, P = G.player, BS = G.bosses;
  if (GM.state === 'title' || !GM.run) { GM.startRun('bt', { id: opts.diff || 'hard', lv: opts.lv || 0 }); await new Promise((r) => setTimeout(r, 1200)); }
  G.Run.set(opts.diff || 'hard', opts.lv || 0);
  const keep = G.Run.bossFor; G.Run.bossFor = () => id;
  GM.dev = { god: true, speed: 1 };
  GM.enterArea(opts.area || 6, 'boss');
  await new Promise((r) => setTimeout(r, 1500));
  G.ui.clearScreen(); GM.state = 'playing';
  const w = G.world;
  P.pos.set(w.arenaCenter.x, 0.1, w.arenaD - 8); P.vel.set(0, 0, 0);
  GM.step(0.05, 40); // crosses the gate and engages
  let b = BS.active;
  if (!b) { GM.bossStartT = 0.01; GM.step(0.05, 40); b = BS.active; }
  const errs0 = window.__errs.length;
  const res = { id, boss: !!b, attacks: [], errs: [] };
  if (!b) { G.Run.bossFor = keep; res.errs.push('no boss started'); return res; }
  const list = b.S ? b.S.attacks : null;
  // keep the player alive and near the boss; force each attack in turn
  const kinds = list ? list.map((a, i) => i) : [];
  for (const i of kinds) {
    const a = list[i];
    b.act = Object.assign({ t: 0, step: 0 }, a); b.pose = { n: a.pose || null, k: 0, head: a.head };
    let t = 0; const t0 = performance.now();
    while (b.act && t < 14) { P.hp = P.stats.maxHp; P.invulnT = 0; P.pos.x = b.pos.x + 7; P.pos.z = b.pos.z + 3; P.pos.y = Math.max(P.pos.y, 0.05); GM.step(0.05, 1); t += 0.05; }
    res.attacks.push(`${a.k}${b.act ? ' (STUCK)' : ''}:${t.toFixed(1)}s`);
    if (b.act) { b.act = null; b.cd = 1; }
    G.combat.clear && 0;
  }
  res.errs = window.__errs.slice(errs0);
  G.Run.bossFor = keep;
  return res;
};
