'use strict';
// A long session of three (a host and two guests, bots all), through areas and guardians: errors, how far the guests' picture is from the host's
// (foes: count, place, health; chests opened; gates open), memory over time, and what goes over the wire (messages and bytes a second, by kind).
//   node tests/coop/long_test.js [minutes of game time, default 12] [difficulty, default normal]
const fs = require('fs'), path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9951;
const SPEED = Math.max(1, +process.env.TEST_SPEED || 3);
const mins = (+process.argv[2] || 12) / SPEED, diff = process.argv[3] || 'normal';
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let bad = 0;
  try {
    const q = '&local=1&lat=40&jit=20', room = 'L' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const url = (n, host) => `http://127.0.0.1:${PORT}/coop.html?room=${room}${host ? '&host=1' : ''}&name=${n}${q}`;
    const h = await ch.page(url('Host', true));
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await h.booted(); await sleep(300);
    const g1 = await ch.page(url('G1')); await g1.booted(); await g1.until('window.G && G.Coop && G.Coop.id >= 1', 90000);
    const g2 = await ch.page(url('G2')); await g2.booted(); await g2.until('window.G && G.Coop && G.Coop.id >= 1 && G.Coop.players.size === 3', 90000);
    const pages = { host: h, g1, g2 };
    // (the host and G1 skip drawing to spare the machine; G2 draws, so its GPU memory means something)
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g1.eval(off);
    // every message out, counted by kind
    const tap = "(() => { const K = G.Coop, s0 = K.net.send; window.__ns = {}; window.__ns0 = performance.now(); K.net.send = function (id, m) { const c = __ns[m.t] = __ns[m.t] || [0, 0]; c[0]++; c[1] += JSON.stringify(m).length; return s0.call(this, id, m); }; return 1; })()";
    const bot = fs.readFileSync(path.join(__dirname, 'coopbot.js'), 'utf8');
    for (const p of Object.values(pages)) await p.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbRun = true; ${tap}; 1`);
    await h.eval(`G.Coop.diff = { id: '${diff}', lv: ${diff === 'extra' ? 1 : 0} }; G.Coop.begin(); G.game.dev = { god: true, speed: ${SPEED} }; 1`);
    for (const g of [g1, g2]) await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    for (const p of Object.values(pages)) await p.running();
    for (const g of [g1, g2]) await g.eval(`G.game.dev = { god: true, speed: ${SPEED} }; 1`);
    for (const p of Object.values(pages)) await p.eval(`window.__cb = __coopbot(${mins * 60000}); 1`);
    const look = "JSON.stringify({ a: G.game.area, k: G.game.stage, tr: !!G.game.transitioning || !!G.game._warming, f: G.Coop.fpOk, won: !!G.game.won, cl: !!G.game.areaCleared,"
      + " foes: G.enemies.list.filter((e) => e.alive && !e.custom && !e.dying && e._nid).map((e) => [e._nid, Math.round(e.pos.x * 10) / 10, Math.round(e.pos.y * 10) / 10, Math.round(e.pos.z * 10) / 10, e.hp / e.maxHp]),"
      + " boss: G.bosses.active && !G.bosses.active.dead ? [G.bosses.active.def.id, G.bosses.active.hp / G.bosses.active.maxHp] : null,"
      + " chests: G.world ? G.world.interactables.filter((i) => i.opened).length : 0, exits: G.world && G.world.exits ? G.world.exits.filter((x) => x.open).length : 0,"
      + " heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0, geo: G.renderer.info.memory.geometries, tex: G.renderer.info.memory.textures, prog: (G.renderer.info.programs || []).length,"
      + " foesAll: G.enemies.list.length, scene: G.scene.children.length, fps: G.Coop.fps })";
    const t0 = Date.now(), mem = { host: [], g1: [], g2: [] }, gaps = [];
    let lastArea = 0, lastT = Date.now(), areas = new Set();
    while (Date.now() - t0 < mins * 60000) {
      await sleep(8000);
      const s = {};
      try { for (const [n, p] of Object.entries(pages)) s[n] = JSON.parse(await p.eval(look)); } catch (e) { console.log('page gone', e.message); bad++; break; }
      const at = Math.round((Date.now() - t0) / 1000);
      for (const n of Object.keys(pages)) mem[n].push([at, s[n].heap, s[n].geo, s[n].tex, s[n].prog, s[n].foesAll, s[n].scene]);
      areas.add(s.host.a + s.host.k);
      if (s.host.a !== lastArea) { lastArea = s.host.a; lastT = Date.now(); console.log(`${at}s area ${s.host.a} ${s.host.k} (G1 ${s.g1.a} ${s.g1.k} ${s.g1.f}, G2 ${s.g2.a} ${s.g2.k} ${s.g2.f})`); }
      // the guests' picture against the host's (only when all stand settled in the same area)
      for (const n of ['g1', 'g2']) {
        const A = s.host, B = s[n];
        if (A.a !== B.a || A.k !== B.k || A.tr || B.tr) continue;
        if (B.f === false) { console.log(`WORLD DIFFERS ${n} at ${A.a}`); bad++; }
        const hm = new Map(A.foes.map((r) => [r[0], r])), gm = new Map(B.foes.map((r) => [r[0], r]));
        let dmax = 0, hpOff = 0, onlyH = 0, onlyG = 0; const ds = [];
        for (const [id, r] of hm) { const o = gm.get(id); if (!o) { onlyH++; continue; } const d = Math.hypot(r[1] - o[1], r[2] - o[2], r[3] - o[3]); ds.push(d); dmax = Math.max(dmax, d); if (Math.abs(r[4] - o[4]) > 0.1) hpOff++; }
        for (const id of gm.keys()) if (!hm.has(id)) onlyG++;
        ds.sort((x, y) => x - y);
        gaps.push({ at, n, foes: hm.size, onlyH, onlyG, med: ds.length ? ds[ds.length >> 1] : 0, dmax, hpOff, chests: A.chests - B.chests, exits: A.exits - B.exits, boss: A.boss && B.boss ? Math.abs(A.boss[1] - B.boss[1]) : (A.boss ? 'guest none' : 0) });
      }
      if (s.host.won && s.g1.won && s.g2.won) { console.log('all reached the end'); break; }
      if (Date.now() - lastT > Math.max(40000, 90000 / SPEED)) { console.log('STUCK', JSON.stringify({ a: s.host.a, k: s.host.k, cl: s.host.cl, foes: s.host.foes.length, boss: s.host.boss })); bad++; lastT = Date.now(); }
    }
    for (const p of Object.values(pages)) await p.eval('window.__cbStop = true; 1').catch(() => {});
    console.log('\n== areas seen: ' + [...areas].join(' '));
    console.log('== the guests against the host (each line one look; med / max: foe place, m; hpOff: foes >10% apart in health; onlyH / onlyG: foes only one side has)');
    for (const r of gaps) console.log(`  ${r.at}s ${r.n} foes ${r.foes} onlyH ${r.onlyH} onlyG ${r.onlyG} med ${r.med.toFixed(2)} max ${r.dmax.toFixed(2)} hpOff ${r.hpOff} chestsΔ ${r.chests} exitsΔ ${r.exits} bossΔ ${typeof r.boss === 'number' ? r.boss.toFixed(3) : r.boss}`);
    console.log('== memory (s, heap MB, geometries, textures, programs, foe list, scene children)');
    for (const [n, rows] of Object.entries(mem)) console.log(`  ${n}: ` + rows.map((r) => `${r[0]}s:${r[1]}/${r[2]}/${r[3]}/${r[4]}/${r[5]}/${r[6]}`).join(' '));
    console.log('== wire: messages and bytes a second, by kind (top 10 by bytes)');
    for (const [n, p] of Object.entries(pages)) {
      const w = JSON.parse(await p.eval('JSON.stringify({ s: (performance.now() - __ns0) / 1000, c: __ns })'));
      const rows = Object.entries(w.c).sort((a, b) => b[1][1] - a[1][1]);
      const tot = rows.reduce((a, r) => [a[0] + r[1][0], a[1] + r[1][1]], [0, 0]);
      console.log(`  ${n}: total ${(tot[0] / w.s).toFixed(1)} msg/s ${(tot[1] / w.s / 1024).toFixed(1)} KB/s over ${Math.round(w.s)} s | ` + rows.slice(0, 10).map(([t, c]) => `${t} ${(c[0] / w.s).toFixed(1)}/s ${(c[1] / w.s / 1024).toFixed(2)}KB/s`).join(', '));
    }
    console.log('errors', h.errs.length, g1.errs.length, g2.errs.length, JSON.stringify(h.errs.concat(g1.errs, g2.errs).slice(0, 6)).slice(0, 900));
    if (h.errs.length + g1.errs.length + g2.errs.length) bad++;
  } finally { ch.close(); srv.close(); }
  console.log(bad ? `\nLONG TEST: ${bad} problems` : '\nLONG TEST PASSED');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
