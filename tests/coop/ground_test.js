'use strict';
// Co-op: the ground that moves and breaks is the same on every screen.
//  沈む石柱の海 (field_pillars.js): a pillar starts to sink on the host's word: a 沈め手's stamp on the host sinks it on the guest too;
//    over many turns the two screens keep in step; a screen that lost its way is put right when it asks.
//  凍てつく霊廟 (field_frozen.js): the host keeps the ice. The guest's own blast cracks and breaks it on the host; the host's on the guest;
//    a foe's blast (which both screens set off) leaves both alike; broken ice freezes over on the host's word only; a screen that asks is told.
//   node tests/coop/ground_test.js
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9451;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  let h, g;
  try {
    const q = '&local=1&lat=40&jit=20', room = 'G' + Math.random().toString(36).slice(2, 6).toUpperCase();
    h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    await h.eval("G.save.data.settings.volume = 0; G.sfx.setVolume(0); 1"); await g.eval("G.save.data.settings.volume = 0; G.sfx.setVolume(0); 1");
    await h.eval(`G.Coop.diff = { id: 'hard', lv: 0 }; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    const go = async (field, area) => {
      await h.eval(`G.Run.field = () => '${field}'; 1`); await g.eval(`G.Run.field = () => '${field}'; G.Coop.fpOk = undefined; 1`);
      await h.eval(`G.game.area = ${area - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.enemies.clear(); G.Coop.go(${area}, 'combat'); 1`);
      await g.until(`G.game.area === ${area} && G.game.stage === 'combat' && G.Coop.fpOk !== undefined && G.world.biome === '${field}'`, 25000);
      await sleep(400);
      await h.eval('G.enemies.list.slice().forEach((e) => { if (e.alive && !e.custom) { e.noReward = true; e.alive = false; e.remove && e.remove(); } }); G.enemies.list.length = 0; G.game.objective = null; G.game.waves = null; 1');
      return g.eval('G.Coop.fpOk');
    };
    const gt = (p) => p.eval('G.game.time');
    const waitT = async (p, dt) => { const t0 = await gt(p); await p.until(`G.game.time - ${t0} > ${dt}`, 60000); };
    const e0 = () => h.errs.length + g.errs.length;

    // ================= the sea of pillars
    const before = e0();
    const fp = await go('pillars', 2);
    const psig = (p) => p.eval("JSON.stringify(G.world.pillars.map((q) => [Math.round(q.x0 * 10), Math.round(q.z0 * 10), Math.round(q.top * 10)]))");
    const [ph, pg] = [await psig(h), await psig(g)];
    check(fp && ph === pg && JSON.parse(ph).length > 3, `pillars: the same sinking pillars on both sides (${JSON.parse(ph).length})`);
    const sts = (p) => p.eval("JSON.stringify(G.world.pillars.map((q) => q.st))").then(JSON.parse);
    // a 沈め手's stamp on the host: the pillar sinks on the guest too
    const k = await h.eval("G.world.pillars.findIndex((q) => q.st === 'up' && q.next - q.t > 3)");
    await h.eval(`G.FieldGen.sinkNow(G.world, G.world.pillars[${k}]); 1`);
    const gotIt = await g.until(`['warn', 'sink'].includes(G.world.pillars[${k}].st)`, 4000).then(() => true, () => false);
    check(k >= 0 && gotIt, `pillars: a pillar the host's 沈め手 stamps on starts to sink on the guest's screen too (pillar ${k})`);
    // many turns: start every pillar on the host soon, then watch both screens side by side
    await h.eval("G.world.pillars.forEach((q) => { if (q.st === 'up') q.next = q.t + Math.random() * 8; }); 1");
    await g.eval("if (!window.__plN) { window.__plN = 0; const f = G.Coop.handlers.pl; G.Coop.handlers.pl = function () { window.__plN++; return f.apply(this, arguments); }; window.__plsN = window.__plsN || 0; const f2 = G.Coop.handlers.pls; G.Coop.handlers.pls = function () { window.__plsN++; return f2.apply(this, arguments); }; } 1");
    const ORDER = ['up', 'warn', 'sink', 'down', 'rise'];
    const near = (a, b) => { const i = ORDER.indexOf(a), j = ORDER.indexOf(b); return i === j || Math.abs(i - j) === 1 || Math.abs(i - j) === 4; };
    let bad = 0, seen = 0, worst = '';
    for (let n = 0; n < 14; n++) {
      await waitT(h, 2.5);
      const [a, b] = await Promise.all([sts(h), sts(g)]);
      a.forEach((s, i) => { if (s !== 'up') seen++; if (!near(s, b[i])) { bad++; worst = `${i}: host ${s} / guest ${b[i]}`; } });
    }
    if (bad) console.log('  diag', await g.eval("JSON.stringify({ st: G.game.state, live: G.Coop.live, area: G.game.area, t: +G.game.time.toFixed(1), pl: window.__plN || 0, pls: window.__plsN || 0 })"), await h.eval("JSON.stringify({ st: G.game.state, area: G.game.area, t: +G.game.time.toFixed(1) })"));
    check(seen > 20 && bad === 0, `pillars: over ~35 s of turns the guest's pillars keep in step with the host's (${seen} sinking sightings, ${bad} out of step${worst ? ' — ' + worst : ''})`);
    // a screen that lost its way (as if it missed the word) asks and is put right
    await g.eval("if (!window.__plsN) { window.__plsN = 0; const f = G.Coop.handlers.pls; G.Coop.handlers.pls = function (m) { window.__plsN++; return f.apply(this, arguments); }; } 1");
    await g.eval("G.world.pillars.slice(0, 8).forEach((q) => { q.st = q.st === 'down' ? 'up' : 'down'; q.t = 0; q.col.alive = q.st !== 'down'; }); G.world._gq = false; 1");
    await g.until('window.__plsN > 0', 5000).catch(() => {});
    await sleep(500);
    {
      const [a, b] = await Promise.all([sts(h), sts(g)]);
      const off = a.filter((s, i) => !near(s, b[i])).length;
      if (off) {
        const [da, db] = await Promise.all([h.eval("JSON.stringify(G.world.pillars.slice(0, 12).map((q) => [q.st, +q.t.toFixed(2), +(q.next - q.t).toFixed(1)]))"), g.eval("JSON.stringify({ n: window.__plsN, gq: G.world._gq, p: G.world.pillars.slice(0, 12).map((q) => [q.st, +q.t.toFixed(2), !!q.go]) })")]);
        console.log('  host ', da); console.log('  guest', db);
      }
      // (the collider of a pillar in the same state on both sides must agree: one caught between two states as the screens are read may not)
      const cols = await Promise.all([h.eval("JSON.stringify(G.world.pillars.map((q) => [q.st, q.col.alive]))"), g.eval("JSON.stringify(G.world.pillars.map((q) => [q.st, q.col.alive]))")]);
      const ca = JSON.parse(cols[0]), cb = JSON.parse(cols[1]);
      const coff = ca.filter((v, i) => v[0] === cb[i][0] && v[1] !== cb[i][1]).length;
      check(off === 0 && coff === 0, `pillars: a guest that lost its way asks the host and is put right (${off} out of step, ${coff} colliders differ)`);
    }
    check(e0() === before, `pillars: no page errors${e0() > before ? ' — ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 300) : ''}`);

    // ================= the frozen lake
    const b2 = e0();
    const fz = await go('frozen', 2);
    const ice = (p) => p.eval("G.world.iceTiles.map((t) => t.hp).join('')");
    const [ih0, ig0] = [await ice(h), await ice(g)];
    check(fz && ih0.length > 20 && ih0 === ig0, `ice: the same ice on both sides (${ih0.length} tiles)`);
    // spots: whole tiles far from both players and from each other
    const spots = JSON.parse(await h.eval(`JSON.stringify((() => { const w = G.world, out = [], pl = [G.player.pos].concat([...G.Coop.players.values()].filter((r) => r.to).map((r) => r.to));
      for (const t of w.iceTiles) { const x = (t.x0 + t.x1) / 2, z = (t.z0 + t.z1) / 2; if (t.hp < 2) continue;
        if (!w.iceTiles.every((u) => u === t || Math.max(Math.abs((u.x0 + u.x1) / 2 - x), Math.abs((u.z0 + u.z1) / 2 - z)) > 3.1 || u.hp === 2)) continue;
        const nb = w.iceTiles.filter((u) => Math.max(Math.abs((u.x0 + u.x1) / 2 - x), Math.abs((u.z0 + u.z1) / 2 - z)) < 3.1).length; if (nb < 9) continue;
        if (pl.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 10)) continue;
        out.push({ k: t.k, x, z }); if (out.length >= 4) break; }
      return out; })())`));
    check(spots.length >= 3, `ice: found spots to strike (${spots.length})`);
    const hp = (p, kk) => p.eval(`G.world.iceTiles[${kk}].hp`);
    const blast = (p, s, extra) => p.eval(`G.combat.explode(new THREE.Vector3(${s.x}, 0.3, ${s.z}), 1, 1, Object.assign({ src: 'explosion', noFx: true }, ${extra || '{}'})); 1`);
    const same = async () => { await sleep(700); const [a, b] = [await ice(h), await ice(g)]; return a === b; };
    if (spots.length >= 3) {
      const [A, B, Cc] = spots;
      // the guest's own blast: cracked on the host, then broken
      await blast(g, A);
      const c1 = await h.until(`G.world.iceTiles[${A.k}].hp === 1`, 4000).then(() => true, () => false);
      check(c1 && await same(), `ice: the guest's blast cracks the ice on the host's screen too (host ${await hp(h, A.k)}, guest ${await hp(g, A.k)})`);
      await blast(g, A);
      const c2 = await h.until(`G.world.iceTiles[${A.k}].hp === 0`, 4000).then(() => true, () => false);
      check(c2 && await same() && !(await g.eval(`G.world.iceTiles[${A.k}].col.alive`)), `ice: a second blast breaks it on both screens (open water on the guest's too)`);
      // the host's blast
      await blast(h, B);
      const c3 = await g.until(`G.world.iceTiles[${B.k}].hp === 1`, 4000).then(() => true, () => false);
      check(c3 && await same(), `ice: the host's blast cracks it on the guest's screen`);
      // a foe's blast: both screens set it off (combat.js: a foe's blast does not crack the ice at all)
      await blast(h, Cc, "{ enemy: true }");
      await sleep(1200);
      const [fh, fg] = [await hp(h, Cc.k), await hp(g, Cc.k)];
      check(fh === fg && await same(), `ice: a foe's blast (set off on both screens) leaves the ice alike on both (host ${fh}, guest ${fg}; a foe's blast does not crack it, solo too)`);
      // freezing over: never on the guest's own clock, on the host's word
      await g.eval(`G.world.iceTiles[${A.k}].t = 999; 1`); await waitT(g, 1);
      check(await hp(g, A.k) === 0 && await hp(h, A.k) === 0, `ice: broken ice does not freeze over on the guest's clock alone`);
      await h.eval(`G.world.iceTiles[${A.k}].t = 23.8; 1`);
      const fr = await g.until(`G.world.iceTiles[${A.k}].hp === 2 && G.world.iceTiles[${A.k}].col.alive`, 5000).then(() => true, () => false);
      check(fr && await same(), `ice: it freezes over on the host's word, on both screens`);
      // a screen that lost its way asks and is put right (every tile, whole ones too)
      await g.eval(`(() => { const F = G.FieldGen, w = G.world; [${spots.map((s) => s.k).join(',')}].forEach((kk) => { const t = w.iceTiles[kk]; t.hp = t.hp === 2 ? 0 : 2; t.col.alive = t.hp > 0; }); w._gq = false; })(); 1`);
      check(await g.until(`G.world.iceTiles.map((t) => t.hp).join('') === ${JSON.stringify(await ice(h))}`, 5000).then(() => true, () => false), `ice: a guest that lost its way asks the host and is put right`);
    }
    check(e0() === b2, `ice: no page errors${e0() > b2 ? ' — ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 300) : ''}`);

    // ================= every field: one seed builds one world (each screen builds the area for itself from the host's seed)
    // (the same seed built twice on one page: its colliders and what stands in it must agree. Last: building areas aside disturbs the one in play)
    const det = JSON.parse(await h.eval(`JSON.stringify((() => { const R = G.Run, f0 = R.field, out = [], n = [];
      const fp = (w) => { let x = 0; const add = (v) => { x = (x * 31 + Math.round(v * 10)) | 0; }; for (const c of w.colliders || []) { add(c.x0); add(c.z0); add(c.x1); add(c.y1 || 0); } for (const it of w.interactables) { add(it.pos ? it.pos.x : 0); add(it.pos ? it.pos.z : 0); } return x; };
      try { for (const f of [].concat(...R.TIERS)) { R.field = () => f; for (let s = 1; s <= 3; s++) { const seed = (s * 7919 + f.length * 104729 + f.charCodeAt(0) * 31) >>> 0;
        const wa = G.LevelGen.generate(3, seed, { gates: 3, kind: 'combat' }), wb = G.LevelGen.generate(3, seed, { gates: 3, kind: 'combat' });
        if (wa.biome !== f) out.push(f + ':' + s + ' built ' + wa.biome); else if (fp(wa) !== fp(wb) || wa.colliders.length !== wb.colliders.length) out.push(f + ':' + s + ' (' + wa.colliders.length + '/' + wb.colliders.length + ')'); else n.push(f); } } } finally { R.field = f0; }
      return { out, n: n.length }; })())`));
    check(det.out.length === 0 && det.n >= 48, `every field: one seed builds the same world every time (${det.n} built twice alike${det.out.length ? '; differ: ' + det.out.join(', ') : ''})`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nGROUND TEST FAILED (${fails.length})` : '\nGROUND TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
