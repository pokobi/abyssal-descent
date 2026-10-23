// Playtest bot (not loaded by the game). In the console: eval(await (await fetch('tests/bot.js')).text())
// then: await __bot(20000)  -> plays for ~20s of wall time: aims and shoots, picks boons, walks through gates.
window.__errs = window.__errs || [];
if (!window.__errHooked) {
  window.__errHooked = true;
  const oe = console.error;
  console.error = function (...a) { window.__errs.push(a.map((x) => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ').slice(0, 300)); oe.apply(console, a); };
  window.addEventListener('error', (e) => window.__errs.push('WIN ' + e.message));
}
window.__log = window.__log || [];
// a hidden tab throttles timers hard; a message-channel hop does not
const __hop = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
window.__stats = window.__stats || { areas: [], stuck: 0 };
window.__bot = async function (ms, opts) {
  opts = opts || {};
  const GM = G.game, P = G.player, I = G.input;
  const t0 = performance.now();
  let lastArea = GM.area, areaT0 = GM.time;
  while (performance.now() - t0 < ms) {
    if (P.dead || GM.state === 'dead') { window.__log.push('DEAD at ' + GM.area); return 'dead'; }
    if (GM.state === 'buff') { const c = document.querySelector('#screens .card'); if (c) c.click(); await new Promise((r) => setTimeout(r, 350)); if (GM.state !== 'playing') { GM.state = 'playing'; G.ui.clearScreen(); } continue; }
    if (GM.state === 'modal' || GM.state === 'paused' || GM.state === 'resuming') {
      const ch = [...document.querySelectorAll('#screens .choice')].filter((e) => !e.classList.contains('disabled'));
      if (ch.length) { ch[0].click(); await new Promise((r) => setTimeout(r, 200)); }
      GM.state = 'playing'; G.ui.clearScreen(); continue;
    }
    const w = G.world;
    const foes = G.enemies.list.filter((e) => e.alive && e.state !== 'spawn' && !e.untargetable && !e.burrowed && !(e.def && e.def.id === 'mimic_gold'));
    const bo = G.bosses.active;
    if (opts.fastBoss && bo && !bo.dead && GM.bossEngaged && GM.time - areaT0 > 20) { for (const p of bo.parts) p.hp = 0; bo.hp = 0; bo.kill(); }
    const cand = bo && !bo.dead ? bo.parts.filter((p) => p.alive && !p.untargetable && !p.invuln && !(p.isInvuln && p.isInvuln({ src: 'bullet' }))) : [];
    const pool = foes.concat(cand);
    let tgt = null, best = 1e9;
    for (const e of pool) { const d = e.pos.distanceTo(P.pos); if (d < best) { best = d; tgt = e; } }
    if (GM.stage === 'boss' && !GM.bossEngaged && w.arenaCenter) { P.pos.set(w.arenaCenter.x, 0.1, w.arenaD - 6); P.vel.set(0, 0, 0); }
    if (tgt) {
      const c = tgt.centerPos ? tgt.centerPos() : tgt.pos.clone().setY(tgt.pos.y + 1);
      const eye0 = P.pos.clone().setY(P.pos.y + 1.62);
      if (best > 18 || (opts.reposition && !w.los(eye0, c))) {
        const dir = P.pos.clone().sub(c).setY(0).normalize(); const np = c.clone().addScaledVector(dir, 9);
        const g = w.groundAt(new THREE.Vector3(np.x, c.y + 3, np.z), 0.4, 12); if (g > -Infinity) { P.pos.set(np.x, g, np.z); P.vel.set(0, 0, 0); }
      }
      const eye = P.pos.clone().setY(P.pos.y + 1.62); const d = c.clone().sub(eye);
      P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); I.mouse[0] = true; I.mpressed[0] = true;
    } else {
      I.mouse[0] = false;
      if (GM.areaCleared) {
        const ex = (w.exits || []).find((x) => x.open);
        if (ex && !GM.transitioning) { const x = (ex.gx0 + ex.gx1) / 2; P.pos.set(x, 0.05, -5); P.vel.set(0, 0, 0); P.yaw = 0; } if (GM.transitioning) await new Promise((r) => setTimeout(r, 120));
      } else if (GM.objective && GM.objective.kind === 'ritual') {
        const a = GM.objective.altars.find((a) => !a.done); if (a) { P.pos.set(a.x, a.y + 0.05, a.z); P.vel.set(0, 0, 0); }
      } else if (GM.stage === 'trial') {
        const t = (G.Areas.targets || []).find((t) => t.alive);
        if (t) { const d = t.pos.clone().sub(P.pos.clone().setY(P.pos.y + 1.62)); P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); I.mouse[0] = true; I.mpressed[0] = true; }
      }
    }
    for (let k = 0; k < 4; k++) GM.step(0.033, 1);
    I.keys.KeyW = false;
    if (GM.area !== lastArea) { window.__stats.areas.push([lastArea, Math.round(GM.time - areaT0)]); window.__log.push(`AREA ${GM.area} ${GM.stage} ${(GM.objective && GM.objective.kind) || ''}`); lastArea = GM.area; areaT0 = GM.time; }
    if (GM.time - areaT0 > 400) { window.__log.push(`SLOW area ${GM.area} ${GM.stage} ${(GM.objective && GM.objective.kind) || ''} alive=${foes.length}`); window.__stats.stuck++; return 'slow'; }
    await __hop();
  }
  return 'time';
};
