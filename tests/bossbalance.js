// Boss balance harness (not loaded by the game). In the console: eval(await (await fetch('tests/bossbalance.js')).text())
// then: __bb.run(['colossus', ...], { diff: 'hard', area: 12 })  (async, results in __bb.res)
// A bot circle-strafes around the guardian at ~10 m (jumping now and then) and deals a fixed, normalised DPS to the nearest
// target that can be hurt (a guardian with base HP 4000 would die in 60 s). Reports time to kill, damage taken, biggest hit.
window.__errs = window.__errs || [];
if (!window.__errHooked) {
  window.__errHooked = true;
  const oe = console.error;
  console.error = function (...a) { window.__errs.push(a.map((x) => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ').slice(0, 400)); oe.apply(console, a); };
  window.addEventListener('error', (e) => window.__errs.push('WIN ' + e.message + ' ' + (e.filename || '') + ':' + e.lineno));
}
window.__bb = window.__bb || { res: [] };
// a hidden tab throttles timers hard; a message-channel hop does not
const __yield = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
__bb.fight = async function (id, opts) {
  opts = opts || {};
  const GM = G.game, P = G.player, BS = G.bosses, I = G.input, C = G.combat;
  const diff = opts.diff || 'hard', lv = opts.lv || 0, area = opts.area || 12;
  GM.startRun('bb', { id: diff, lv });
  await __yield();
  G.Run.set(diff, lv);
  const keep = G.Run.bossFor; G.Run.bossFor = () => id;
  GM.dev = { god: false, speed: 1 };
  GM.enterArea(area, 'boss');
  await __yield();
  G.ui.clearScreen(); GM.state = 'playing';
  const w = G.world;
  P.pos.set(w.arenaCenter.x, 0.1, w.arenaD - 8); P.vel.set(0, 0, 0);
  for (let k = 0; k < 80 && !(BS.active && BS.active.def.id === id); k++) { P.hp = P.stats.maxHp; GM.step(0.05, 1); if (k === 40) GM.bossStartT = 0.01; }
  G.Run.bossFor = keep;
  const b = BS.active;
  const r = { id, name: G.BOSS_BY_ID[id].name, ok: !!b };
  if (!b || b.def.id !== id) { r.ok = false; return r; }
  const errs0 = __errs.length;
  const base = b.maxHp / (b.hpScale || 1);
  const dps = (4000 * (b.hpScale || 1)) / 60;
  const pmax = P.stats.maxHp;
  let t = 0, taken = 0, hits = 0, big = 0, noTgt = 0, falls = 0, jumpT = 0, dir = 1, dirT = 4;
  const dt = 0.05;
  const HUGE = 1e6, by = {}; let lastK = '-';
  const dp0 = C.damagePlayer;
  C.damagePlayer = function (amount, info) {
    const h0 = P.hp; const res = dp0.apply(this, arguments); const l = h0 - P.hp;
    if (l > 0.01) { taken += l; hits++; if (l > big) big = l; const k = (info && info.src || '?') + ':' + lastK; const o = by[k] || (by[k] = { n: 0, sum: 0, max: 0 }); o.n++; o.sum += l; o.max = Math.max(o.max, l); }
    return res;
  };
  while (t < (opts.max || 240) && !b.dead && P.alive !== false) {
    P.hp = HUGE; // measure, never die (percentages are of the real max HP)
    if (b.act) lastK = b.act.k || b.act.n || b.act.name || '?';
    // pick the nearest thing that can be hurt (adds included)
    const foes = G.enemies.list.filter((e) => e.alive && e.state !== 'spawn' && !e.untargetable && !e.burrowed);
    const parts = b.parts.filter((p) => p.alive && !p.untargetable && !p.invuln && !(p.isInvuln && p.isInvuln({ src: 'bullet' })));
    // adds close by first; otherwise the guardian part that takes the most damage (a player aims at weak points)
    let tgt = null, best = -1e9;
    for (const e of foes) { const d = e.pos.distanceTo(P.pos); if (d < 10 && 100 - d > best) { best = 100 - d; tgt = e; } }
    if (!tgt) for (const p of parts.length ? parts : foes) {
      let m = 1; try { if (p.dmgMul) m = p.dmgMul({ src: 'bullet', head: false }, { e: p, src: 'bullet', bonus: 0 }); } catch (e) { m = 1; }
      if (!(m >= 0)) m = 1;
      if (m > best) { best = m; tgt = p; }
    }
    const bc = b.pos.clone();
    if (tgt) C.damageEnemy(tgt, dps * dt, { src: 'bullet', pos: tgt.centerPos ? tgt.centerPos() : tgt.pos.clone(), silent: true });
    if (!parts.length) noTgt += dt;
    // face the guardian, hold ~10 m, strafe; flip strafe now and then; jump now and then
    const eye = P.pos.clone().setY(P.pos.y + 1.62), d = bc.clone().setY(bc.y + 1.5).sub(eye);
    P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const dist = Math.hypot(d.x, d.z);
    if (opts.behind) { const by0 = b.yaw + Math.PI + Math.sin(t * 0.7) * 0.6; P.pos.x = b.pos.x + Math.sin(by0) * 8; P.pos.z = b.pos.z + Math.cos(by0) * 8; } // a player who keeps to its back
    I.keys.KeyW = dist > 12; I.keys.KeyS = dist < 8;
    dirT -= dt; if (dirT <= 0) { dir = -dir; dirT = 2 + Math.random() * 4; }
    I.keys.KeyD = dir > 0; I.keys.KeyA = dir < 0; I.keys.ShiftLeft = true;
    jumpT -= dt; if (jumpT <= 0 && P.grounded) { if (Math.random() < 0.35) { I.keys.Space = true; I.pressed && (I.pressed.Space = true); } jumpT = 0.8; } else I.keys.Space = false;
    const y0 = P.pos.y;
    GM.step(dt, 1);
    if (P.pos.y < y0 - 5) falls++;
    if (GM.state !== 'playing') { G.ui.clearScreen(); GM.state = 'playing'; }
    t += dt;
    if ((Math.round(t / dt)) % 400 === 0) await __yield();
  }
  C.damagePlayer = dp0;
  for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'Space']) I.keys[k] = false;
  Object.assign(r, {
    baseHp: Math.round(base), maxHp: b.maxHp, killed: !!b.dead, ttk: +t.toFixed(1), noTgt: +noTgt.toFixed(1),
    pMax: pmax, taken: Math.round(taken), dpsTaken: +(taken / t).toFixed(1), pctPerMin: Math.round((taken / t) * 60 / pmax * 100),
    hits, bigHit: Math.round(big), bigPct: Math.round(big / pmax * 100), falls,
    by: Object.fromEntries(Object.entries(by).sort((a, b2) => b2[1].sum - a[1].sum).slice(0, 6).map(([k, o]) => [k, `${o.n}x sum${Math.round(o.sum / pmax * 100)}% max${Math.round(o.max / pmax * 100)}%`])),
    hpLeft: b.dead ? 0 : Math.round(b.hp / b.maxHp * 100), errs: __errs.slice(errs0).slice(0, 4),
  });
  return r;
};
__bb.run = async function (ids, opts) {
  __bb.busy = true; __bb.res = [];
  for (const id of ids) { try { __bb.res.push(await __bb.fight(id, opts)); } catch (e) { __bb.res.push({ id, err: String(e && e.stack || e).slice(0, 300) }); } __bb.cur = id; }
  __bb.busy = false; return __bb.res;
};
