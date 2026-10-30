// Co-op test bot: stands near the foes, shoots whatever is nearest through the game's real hit path, picks boons, walks through open gates. Works on either side.
window.__cbs = { shots: 0, gates: 0, cards: 0 };
window.__coopbot = async function (ms) {
  const GM = G.game, P = G.player, C = G.combat, t0 = performance.now();
  G.input.keys = G.input.keys || {};
  while (performance.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 120));
    if (GM.state === 'buff') { const c = document.querySelector('#screens .card'); if (c) { c.click(); window.__cbs.cards++; } continue; }
    if (GM.state === 'modal' || GM.state === 'paused' || GM.state === 'resuming') { G.ui.clearScreen(); GM.state = 'playing'; continue; }
    if (P.dead || GM.transitioning || GM._warming) continue;
    if (window.__cbRun) {
      // a whole run: walk into the guardian's hall, shoot it for a share of its health, leave by the rift
      if (G.Rift.active && G.Rift.active()) { G.Rift.enter(); continue; }
      const hid = G.enemies.list.find((e) => e.alive && !e.custom && e.burrowed);
      if (hid && !G.enemies.list.some((e) => e.alive && !e.custom && !e.burrowed)) { P.pos.set(hid.pos.x + 3, hid.pos.y + 0.2, hid.pos.z); P.vel.set(0, 0, 0); G.world.depenetrate(P.pos, P.hw, P.height); }
      const al = GM.objective && GM.objective.altars && GM.objective.altars.find((x) => !x.done);
      if (al && !GM.areaCleared && !G.enemies.list.some((e) => e.alive && !e.custom)) { P.pos.set(al.x, al.y + 0.1, al.z); P.vel.set(0, 0, 0); continue; }
      if (GM.stage === 'boss' && !GM.bossEngaged && G.world.arenaCenter) { const w0 = G.world; P.pos.set(w0.arenaCenter.x, 0.2, (w0.ledgeZ || w0.arenaD) - 6); P.vel.set(0, 0, 0); P.grounded = true; }
    }
    if (!window.__cbMortal && P.hp < P.stats.maxHp * 0.35) P.hp = P.stats.maxHp;
    const w = G.world, foes = G.enemies.list.filter((e) => e.alive && !e.dying && e.state !== 'spawn' && !e.untargetable && !e.burrowed && !(e.isInvuln && e.isInvuln({ src: 'bullet' })) && !e.invuln);
    window.__cbs.maxFoes = Math.max(window.__cbs.maxFoes || 0, foes.length);
    let tgt = null, best = 1e9;
    for (const e of foes) { const d = e.pos.distanceTo(P.pos); if (d < best) { best = d; tgt = e; } }
    if (tgt) {
      if (best > (tgt.boss ? 9 : 14)) { const d = P.pos.clone().sub(tgt.pos).setY(0).normalize(); const np = tgt.pos.clone().addScaledVector(d, 8); np.y = Math.max(tgt.pos.y, 0.1); P.pos.copy(np); P.vel.set(0, 0, 0); G.world.depenetrate(P.pos, P.hw, P.height); }
      C.damageEnemy(tgt, window.__cbRun ? Math.max(60, tgt.maxHp * 0.12) : window.__cbDmg || 40 + GM.area * 8, { src: 'bullet', pos: tgt.centerPos(), dir: tgt.pos.clone().sub(P.pos).normalize() });
      window.__cbs.shots++;
    } else if (GM.areaCleared && w.exits && w.exits.length) {
      const ex = w.exits.find((x) => x.open) || null;
      if (ex) {
        const t = w.triggers.find((q) => q.kind === 'exit' && q.exit === ex);
        if (t) { const g = t._r || t; P.pos.set((g.x0 + g.x1) / 2, P.pos.y, (g.z0 + g.z1) / 2); P.vel.set(0, 0, 0); window.__cbs.gates++; await new Promise((r) => setTimeout(r, 900)); }
      }
    }
  }
  return 'time';
};
