'use strict';
// The fields (fieldgen.js, fieldgen_t*.js, strata.js) and the per-segment field draw (runplan.js):
//   - every field builds its areas over many seeds and depths by itself (no fall-back to the plain generator), with chests and three exits
//   - its rooms (event / shrine / forge / vault ...) and the merchant's hall build in its colours
//   - its guardian's hall builds for guardians of several arena styles, with the gate, the road and the merchant's nook
//   - the draw: one field of the right tier per segment, the same for the same seed, no field twice in a run while the tier has another
//   - the sky (skyvary.js): every mood of every field lays over the light without error
//   node tests/field_test.js [field ...]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9993;
const only = process.argv.slice(2);
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(500);
    const keys = await p.eval(`JSON.stringify(Object.keys(G.FieldGen.gen))`).then(JSON.parse);
    const list = only.length ? keys.filter((k) => only.includes(k)) : keys;
    console.log('fields:', list.join(' '));
    for (const key of list) {
      const r = await p.eval(`(() => {
        const R = G.Run, LG = G.LevelGen, f0 = R.field, out = { n: 0, falls: 0, chests: 0, exits: 0, errs: [], ms: 0, rooms: 0, boss: 0 };
        R.field = () => '${key}';
        try {
          const t0 = performance.now();
          for (let s = 1; s <= 10; s++) for (const area of [2, 9, 16]) {
            try {
              const w = LG.generate(area, (s * 7919 + area * 131) >>> 0, { gates: 3, kind: s % 3 ? 'combat' : 'elite' });
              out.n++; if (w.field !== '${key}') out.falls++;
              out.chests += (w.interactables || []).filter((i) => i.type === 'chest').length;
              if ((w.exits || []).length === 3) out.exits++;
            } catch (e) { out.errs.push('area ' + area + ' seed ' + s + ': ' + e.message); }
          }
          out.ms = Math.round((performance.now() - t0) / Math.max(1, out.n));
          for (const kind of ['event', 'shrine', 'forge', 'alchemy', 'vault', 'casino', 'trial']) {
            try { const w = LG.room(9, 4242 + kind.length, kind, 3); if (w && w.exits && w.exits.length) out.rooms++; else out.errs.push('room ' + kind + ': no exits'); } catch (e) { out.errs.push('room ' + kind + ': ' + e.message); }
          }
          try { const w = LG.shop(6, 777, 1); if (w) out.rooms++; } catch (e) { out.errs.push('shop: ' + e.message); }
          for (const bid of ['colossus', 'houndlord', 'warden', 'oboro', 'lich']) {
            try {
              const w = LG.boss(7, 31337 + bid.length * 17, bid);
              if (w && w.arenaCenter && w.bossGate && w.stoneVendor && w.roadText && w.reachMask) out.boss++;
              else out.errs.push('boss ' + bid + ': ' + JSON.stringify({ c: !!(w && w.arenaCenter), g: !!(w && w.bossGate), v: !!(w && w.stoneVendor), t: !!(w && w.roadText), r: !!(w && w.reachMask) }));
            } catch (e) { out.errs.push('boss ' + bid + ': ' + e.message); }
          }
        } finally { R.field = f0; }
        return JSON.stringify(out);
      })()`).then(JSON.parse);
      console.log(key, JSON.stringify(r));
      check(r.errs.length === 0, `${key}: no errors${r.errs.length ? ' — ' + r.errs.slice(0, 3).join(' | ') : ''}`);
      check(r.falls <= 1, `${key}: its own generator builds the areas (${r.n - r.falls}/${r.n}, at most one fall-back)`);
      check(r.exits === r.n, `${key}: three exits in every area (${r.exits}/${r.n})`);
      check(r.chests >= r.n * 0.8, `${key}: chests are placed (${r.chests} in ${r.n} areas)`);
      check(r.rooms === 8, `${key}: rooms and the merchant's hall build (${r.rooms}/8)`);
      check(r.boss === 5, `${key}: the guardian's hall builds for 5 guardians (${r.boss}/5)`);
      check(r.ms < 400, `${key}: an area builds in ${r.ms} ms`);
    }
    // the draw
    const d = await p.eval(`(() => {
      const R = G.Run, out = { bad: [], diffs: 0, same: 0, dup: 0, fields: {} };
      for (const id of ['easy', 'normal', 'hard', 'extra']) for (let s = 1; s <= 300; s++) {
        const a = R.fieldsFor(s * 104729, { id, lv: 1 }), b = R.fieldsFor(s * 104729, { id, lv: 1 });
        if (JSON.stringify(a) === JSON.stringify(b)) out.same++;
        const D = R.DIFFS[id];
        if (a.length !== D.segs.length) out.bad.push(id + ' length');
        a.forEach((f, k) => { if (!R.drawPool(D.segs[k][0]).includes(f)) out.bad.push(id + ' ' + f + ' not in the pool of ' + D.segs[k][0]); if (!R.isField(f)) out.bad.push(id + ' ' + f + ' not built'); out.fields[f] = (out.fields[f] || 0) + 1; });
        const ready = (b) => R.drawPool(b).filter((f) => R.isField(f)).length, key = (b) => R.drawPool(b).join();
        const need = {}; D.segs.forEach(([b]) => { need[key(b)] = (need[key(b)] || 0) + 1; });
        const over = D.segs.some(([b]) => need[key(b)] > ready(b));
        if (!over && new Set(a).size !== a.length) out.dup++;
        out.diffs++;
      }
      return JSON.stringify(out);
    })()`).then(JSON.parse);
    console.log('draw', JSON.stringify(d.fields));
    check(d.bad.length === 0, `the draw keeps every segment in its tier and draws only built fields${d.bad.length ? ' — ' + d.bad.slice(0, 3).join(' | ') : ''}`);
    check(d.same === d.diffs, `the same seed draws the same fields (${d.same}/${d.diffs})`);
    check(d.dup === 0, `no field twice in a run while its tier has another (${d.dup} runs with a repeat)`);
    // the sky: every mood of every field
    const s = await p.eval(`(() => {
      const S = G.Sky, out = { n: 0, errs: [] };
      for (const key in S.V) for (const v of S.V[key]) {
        try { const B = G.Tex.BIOMES[key] || G.Tex.BIOMES.grave; const o = S.env(B, v, false), m = S.env(B, v, true); if (!o.fog || !(o.fogD > 0) || !(m.fogD > 0)) out.errs.push(key + ':' + v.id); S.start(G.scene, v, false); S.update(0.5, G.camera || { position: new THREE.Vector3() }); S.stop(); out.n++; } catch (e) { out.errs.push(key + ':' + v.id + ' ' + e.message); }
      }
      return JSON.stringify(out);
    })()`).then(JSON.parse);
    check(s.errs.length === 0 && s.n > 30, `every sky mood applies (${s.n})${s.errs.length ? ' — ' + s.errs.slice(0, 3).join(' | ') : ''}`);
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 2).join(' | ').slice(0, 300) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nFIELD TEST FAILED (${fails.length})` : '\nFIELD TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
