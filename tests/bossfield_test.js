'use strict';
// The guardians that came up from the deep (and the madman) in the fields of their new tiers: each fights in each field's own guardian
// room (god mode, its health lowered through its phases) and must start, keep using its attacks, and keep itself, its summons and its
// gimmicks inside the room (nothing out of bounds or fallen through the floor), with no errors.
//   node tests/bossfield_test.js [ids] [fields] [seconds]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9877;
const DEEP = ['ossuary', 'hollowknight', 'lich', 'behemoth', 'weaver', 'cinderpriest', 'ashdrake', 'madman'];
const MID = ['halls', 'flooded', 'foundry', 'mine'], LOW = ['ruin', 'frozen', 'sanctum', 'pillars'];

const PAGE = `
window.__bf = async function (id, field, secs) {
  const GM = G.game, P = G.player, BS = G.bosses;
  G.Run.field = () => field; const keep = G.Run.bossFor; G.Run.bossFor = () => id;
  window.__tc = 0; if (!G.fx.__tcHook) { G.fx.__tcHook = true; const o = G.fx.telegraph; G.fx.telegraph = function () { window.__tc++; return o.apply(this, arguments); }; }
  const e0 = (window.__errs || []).length;
  GM.dev = { god: true, speed: 1 }; G.bosses.clear && G.bosses.clear(); GM.area = 6; GM.rewardPending = null; GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing';
  GM.enterArea(7, 'boss');
  await new Promise((r) => setTimeout(r, 1500));
  G.ui.clearScreen(); GM.state = 'playing';
  const w = G.world, out = { id, field, biome: w.biome };
  P.pos.set(w.arenaCenter.x, 0.1, w.arenaD - 8); P.vel.set(0, 0, 0);
  GM.step(0.05, 40);
  let b = BS.active; if (!b) { GM.bossStartT = 0.01; GM.step(0.05, 40); b = BS.active; }
  out.started = !!b; if (!b) { G.Run.bossFor = keep; return out; }
  let t = 0, a = 0, oob = 0, fell = 0, minions = 0; const bad = [];
  const inside = (p) => p && p.x > -1 && p.z > -1 && p.x < w.W + 1 && p.z < w.D + 1;
  while (t < secs && BS.active) {
    P.hp = P.stats.maxHp; P.invulnT = 0;
    a += 0.025; const R = 7 + 3 * Math.sin(t * 0.3);
    P.pos.x = Math.max(1, Math.min(w.W - 1, b.pos.x + Math.cos(a) * R)); P.pos.z = Math.max(1, Math.min(w.D - 1, b.pos.z + Math.sin(a) * R));
    if (t > secs * 0.3 && !b._h1) { b._h1 = true; b.hp = b.maxHp * 0.45; }
    if (t > secs * 0.65 && !b._h2) { b._h2 = true; b.hp = b.maxHp * 0.2; }
    if (b.hp < b.maxHp * 0.1) b.hp = b.maxHp * 0.15;
    GM.step(0.05, 1); t += 0.05;
    if (!inside(b.pos) || b.pos.y < w.killY) { oob++; if (bad.length < 3) bad.push(['boss', +b.pos.x.toFixed(1), +b.pos.y.toFixed(1), +b.pos.z.toFixed(1)]); }
    for (const e of G.enemies.list) { if (!e.alive || e.boss) continue; minions = Math.max(minions, G.enemies.list.length); if (!inside(e.pos) || e.pos.y < w.killY) { fell++; if (bad.length < 3) bad.push([e.def.name, +e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1)]); } }
    for (const g of [...(b.totems || []).map((q) => q.p || q), ...(b.wards || []), ...((b.eggs || []).filter((q) => q.alive))]) { const q = g && (g.pos || g.position); if (q && (!inside(q) || q.y < w.killY)) { fell++; if (bad.length < 3) bad.push(['gimmick', +q.x.toFixed(1), +q.y.toFixed(1), +q.z.toFixed(1)]); } }
  }
  G.Run.bossFor = keep;
  out.tele = window.__tc; out.oob = oob; out.fell = fell; out.minions = minions; out.bad = bad; out.errs = (window.__errs || []).slice(e0, e0 + 3);
  return out;
};
window.__errs = window.__errs || [];
if (!window.__errHooked) { window.__errHooked = true; const oe = console.error; console.error = function (...a) { window.__errs.push(a.map((x) => (x && x.stack ? x.stack.split(String.fromCharCode(10)).slice(0, 2).join(' | ') : String(x))).join(' ').slice(0, 300)); oe.apply(console, a); }; window.addEventListener('error', (e) => window.__errs.push('WIN ' + e.message + ' ' + (e.filename || '') + ':' + e.lineno)); }
1;`;

(async () => {
  const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : DEEP;
  const secs = +(process.argv[4] || 40);
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { if (!c) console.log(`FAIL ${m}`); if (!c) fails++; return c; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'hard', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(500);
    await p.eval(PAGE);
    for (const id of ids) {
      const fields = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : id === 'madman' ? MID.concat(LOW) : MID;
      for (const f of fields) {
        const r = await p.eval(`__bf('${id}', '${f}', ${secs})`);
        const good = ok(r.started, `${id} in ${f}: the fight starts`) & ok(r.biome === f, `${id} in ${f}: in the field's own room (${r.biome})`) & ok(r.tele > 0, `${id} in ${f}: it attacks (${r.tele} warnings)`)
          & ok(r.oob === 0, `${id} in ${f}: it stays in the room ${JSON.stringify(r.bad)}`) & ok(r.fell === 0, `${id} in ${f}: its summons and gimmicks stay in the room ${JSON.stringify(r.bad)}`) & ok(!r.errs || !r.errs.length, `${id} in ${f}: no errors ${JSON.stringify(r.errs)}`);
        console.log(`${good ? 'ok  ' : 'FAIL'} ${id} in ${f}: ${r.tele} warnings, ${r.minions} foes at most`);
      }
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nBOSS FIELD TEST FAILED (${fails})` : '\nBOSS FIELD TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
