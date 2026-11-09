'use strict';
// Flyers never leave the field (enemies.js E.airOk, ceilAbove): in every field, bats, gargoyles and the field's own flyers chase you round
// for a while (you hop between places, some of them made to fly high) and are checked at every step: never over air they may not be in
// (outside the walk-to floor and its edge), never with the middle of the body inside rock or a wall, never over a roof (one-storey fields).
// `node tests/flyer_test.js old` runs the same with the limits off: the checks should catch flyers getting out there.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
const OLD = process.argv[2] === 'old';
const SECS = +(process.env.FLY_SECS || 14);
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; 1");
    await p.eval("G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(1500);
    await p.eval(`window.__flyRun = async function (field, seed, secs, old) {
      const GM = G.game, P = G.player, E = G.enemies;
      G.Run.field = () => field; GM.seed = seed; GM.area = 7; GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing';
      GM.enterArea(8, 'combat');
      await new Promise((r) => setTimeout(r, 1800));
      E.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
      const w = G.world; if (w.field !== field) return { field, skip: 'field ' + w.field };
      E.airMask();
      const defs = [G.ENEMIES.find((d) => d.name === '大蝙蝠'), G.ENEMIES.find((d) => d.name === '石像鬼'), ...G.ENEMIES.filter((d) => d.flyer && d.variant === 'field' && (d.fields || []).includes(field))].filter(Boolean);
      const spots = []; for (let i = 0; i < 600 && spots.length < 10; i++) { const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.reachMask && w.reachMask[idx]); if (c) spots.push(c); }
      if (!spots.length) return { field, skip: 'no spots' };
      const airOk = window.__airOk || (window.__airOk = E.airOk); // (the real mask, for the checks: the 'old' run switches the limit off)
      if (old) E.airOk = () => true;
      const res = { field, L: w.L || 1, steps: 0, samples: 0, out: 0, solid: 0, roof: 0, flyers: 0, moved: 0, maxUp: 0, ex: [] };
      const isFly = (e) => e.alive && e.flyer;
      const inSolid = (c) => w.query(c.x - 0.04, c.y - 0.04, c.z - 0.04, c.x + 0.04, c.y + 0.04, c.z + 0.04).some((b) => !b.navIgnore && !b.dest && !b.enemyOnly);
      const overRoof = (e) => {
        if ((w.L || 1) > 1) return false;
        const i = w.navIdx(e.pos.x, e.pos.z); if (i < 0) return false; const fl = w.nf[i]; if (!(fl > -50)) return false;
        return w.query(e.pos.x - 0.05, fl + 2.2, e.pos.z - 0.05, e.pos.x + 0.05, e.pos.y + 0.05, e.pos.z + 0.05).some((b) => !b.navIgnore && !b.dest && !b.enemyOnly && b.y0 > fl + 2.2 && b.y1 <= e.pos.y + 0.05);
      };
      const start = new Map();
      let t = 0, si = 0, next = 0;
      while (t < secs) {
        if (t >= next) {
          const s = spots[si++ % spots.length]; P.pos.set(s.x, s.y + 0.05, s.z); P.vel.set(0, 0, 0); next = t + 3.5;
          if (E.list.filter(isFly).length < 6) for (let k = 0; k < 3; k++) { const d = defs[(si + k) % defs.length]; GM.spawnEnemy({ def: d, near: true }); }
          if (old) for (const e of E.list) Object.getPrototypeOf(e).ceilAbove = () => Infinity;
          let n = 0; for (const e of E.list) if (isFly(e)) { if (!start.has(e)) { start.set(e, { inside: airOk(e.pos.x, e.pos.z), p: e.pos.clone(), y0: e.pos.y, t0: t }); res.flyers++; if (n++ % 2 === 0) e.alt = 9 + Math.random() * 3; } }
        }
        P.hp = P.stats.maxHp;
        GM.step(0.05, 1); t += 0.05; res.steps++;
        for (const e of E.list) {
          if (!isFly(e)) continue;
          const st = start.get(e); if (!st) continue;
          res.samples++;
          const c = e.centerPos();
          const bad = [];
          if (st.inside && !airOk(e.pos.x, e.pos.z)) { res.out++; bad.push('out'); }
          if (inSolid(c)) { res.solid++; bad.push('solid'); }
          st.trail = st.trail || []; st.trail.push(e.pos.x.toFixed(1) + ',' + e.pos.y.toFixed(1) + ',' + e.pos.z.toFixed(1)); if (st.trail.length > 6) st.trail.shift();
          if (overRoof(e)) { res.roof++; bad.push('roof'); if (!st.roofed) { st.roofed = true; res.trails = (res.trails || []).concat(e.def.name + ' age ' + (t - st.t0).toFixed(1) + 's: ' + st.trail.join(' > ')); } }
          res.maxUp = Math.max(res.maxUp, e.pos.y - P.pos.y);
          if (bad.length && res.ex.length < 4) res.ex.push(bad.join('+') + ' ' + e.def.name + ' @' + e.pos.x.toFixed(1) + ',' + e.pos.y.toFixed(1) + ',' + e.pos.z.toFixed(1));
        }
      }
      for (const [e, st] of start) res.moved += e.pos.distanceTo(st.p);
      res.moved = Math.round(res.moved); res.maxUp = +res.maxUp.toFixed(1);
      return res;
    };
    1`);
    const fields = JSON.parse(await p.eval('JSON.stringify(G.Run.TIERS.flat().filter((f) => G.Run.isField(f)))')).filter((f) => !process.env.FLY_FIELDS || process.env.FLY_FIELDS.split(',').includes(f));
    let tot = { samples: 0, out: 0, solid: 0, roof: 0, flyers: 0 };
    for (const f of fields) {
      const r = JSON.parse(await p.eval(`window.__flyRun('${f}', ${(f.length * 7919) % 100000}, ${SECS}, ${OLD}).then(JSON.stringify)`));
      if (r.skip) { console.log(`      ${f}: skipped (${r.skip})`); continue; }
      if (r.trails) for (const tr of r.trails.slice(0, 3)) console.log('        roof trail: ' + tr);
      console.log(`      ${f.padEnd(12)} L${r.L} flyers ${r.flyers} samples ${r.samples} moved ${r.moved}m  out ${r.out} solid ${r.solid} roof ${r.roof} maxUp ${r.maxUp}${r.ex.length ? '  e.g. ' + r.ex.join(' | ') : ''}`);
      for (const k of Object.keys(tot)) tot[k] += r[k];
    }
    console.log('      total ' + JSON.stringify(tot));
    check(tot.flyers > 40 && tot.samples > 5000, `flyers chased round every field (${tot.flyers} flyers, ${tot.samples} samples)`);
    check(tot.out === 0, `never out over air they may not be in (${tot.out})`);
    check(tot.roof === 0, `never over a roof (${tot.roof})`);
    check(tot.solid <= tot.samples * 0.002, `the middle of the body hardly ever inside a wall or rock (${tot.solid} of ${tot.samples})`);
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nFLYER TEST FAILED (${fails.length})` : '\nFLYER TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
