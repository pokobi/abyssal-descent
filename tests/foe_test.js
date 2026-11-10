'use strict';
// The new fields' own foes (fieldfoes.js): each builds its body, appears only in its own field's draw, and in a real area it attacks
// (its own attack runs to its end without errors) and its blows reach a player standing in front of it.
//   node tests/foe_test.js [foe id ...]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
const only = process.argv.slice(2);
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'hard', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(600);
    const foes = await p.eval("JSON.stringify(G.ENEMIES.filter((e) => e.fields).map((e) => [e.id, e.fields[0], e.attack, e.name]))").then(JSON.parse);
    const nf = await p.eval("G.Run.TIERS.flat().filter((f) => G.Run.ready(f) && !['grave', 'gate', 'halls', 'ruin'].includes(f)).length");
    check(foes.length === nf * 2, `two foes for each of the ${nf} new fields (${foes.length})`);
    // the draw: each only in its field
    const pool = await p.eval(`JSON.stringify((() => { const out = {}; for (const f of G.Run.TIERS.flat()) out[f] = G.game.enemyPool(40, f).filter(([e]) => e.fields).map(([e]) => e.id); return out; })())`).then(JSON.parse);
    for (const [id, f] of foes) {
      const where = Object.keys(pool).filter((k) => pool[k].includes(id));
      check(where.length === 1 && where[0] === f, `${id} is drawn only in ${f} (${where.join(',') || 'nowhere'})`);
    }
    for (const [id, field, attack, name] of foes.filter(([id]) => !only.length || only.includes(id))) {
      const r = await p.eval(`(async () => {
        const R = G.Run, GM = G.game, P = G.player, sl = (ms) => new Promise((res) => setTimeout(res, ms));
        R._f0 = R._f0 || R.field; R.field = () => '${field}';
        G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing';
        GM.enterArea(9, 'combat'); G.enemies.clear(); GM.objective = null; GM.waves = null;
        GM.dev = { speed: 1 };
        const e0 = window.__errs = (window.__errs || 0);
        const def = G.ENEMY_BY_ID['${id}'];
        const w = G.world;
        // stand the player on open floor, the foe 7 m in front of it. The foe's spot has to be floor a foe can walk too: it falls on the line
        // between two cells, and with one of them outside the walkable floor (the lip of a channel, the edge of the map) the foe had no route
        // and stood there, or was held 3 m from you - a run failed about one time in ten on where it was put, not on what the foe did
        const walk = (x, z, y) => { const n = w.navIdx(x, z, y + 0.1); return n >= 0 && !w.nb[n] && (!w.reachMask || !!w.reachMask[n]); };
        let at = null;
        for (let k = 0; k < 400 && !at; k++) { const c = w.randomOpenCell(GM.arng, (x, z, i) => !w.reachMask || w.reachMask[i]); if (!c) continue; const ahead = { x: c.x, y: c.y, z: c.z - 6.5 }; const fy = w.floorBelow(ahead.x, c.y + 1.5, ahead.z); if (isFinite(fy) && Math.abs(fy - c.y) < 0.3 && w.boxFree(ahead.x - 0.8, fy + 0.1, ahead.z - 0.8, ahead.x + 0.8, fy + 2.5, ahead.z + 0.8) && walk(ahead.x, ahead.z - 0.4, fy) && walk(ahead.x, ahead.z + 0.4, fy) && w.groundAt(new THREE.Vector3(c.x, c.y + 0.5, c.z - 3), 0.3, 1) > -Infinity) at = [c, Object.assign(ahead, { y: fy })]; }
        if (!at) return JSON.stringify({ err: 'no spot' });
        P.pos.set(at[0].x, at[0].y + 0.05, at[0].z); P.vel.set(0, 0, 0); P.yaw = 0; P.hp = P.stats.maxHp;
        const e = G.enemies.spawn(def, 10, new THREE.Vector3(at[1].x, at[1].y + (def.flyer ? 3 : 0), at[1].z), { noLoot: true });
        if (!e) return JSON.stringify({ err: 'no spawn' });
        e.state = 'chase'; e.atkCd = 0.2; e.aware = true;
        const hp0 = G.game.run.dmgTaken || 0;
        let attacked = false, ended = false, maxT = 0;
        // (a few tries: a lunge can fall short from where it happened to start; it should land within some 10 s)
        for (let i = 0; i < 200; i++) { await sl(50); if (e.attackState && e.attackState.kind === '${attack}') attacked = true; if (attacked && !e.attackState) ended = true; if (attacked && ended && i > 60 && ((G.game.run.dmgTaken || 0) > hp0 || '${attack}' === 'raise')) break; P.hp = P.stats.maxHp; P.invulnT = 0; }
        const took = (G.game.run.dmgTaken || 0) - hp0, raised = G.enemies.list.filter((o) => o.alive && o.raisedBy === e).length;
        const model = !!(e.model && e.model.group && e.model.hits && e.model.hits.length);
        e.alive = false; e.remove && e.remove(); G.enemies.clear();
        return JSON.stringify({ attacked, ended, took: Math.round(took), raised, model, h: e.height, r: e.radius });
      })()`).then(JSON.parse);
      console.log(id, JSON.stringify(r));
      check(!r.err, `${id}: set up (${r.err || 'ok'})`);
      if (r.err) continue;
      check(r.model, `${id} (${name}): its body builds with hit spots`);
      check(r.attacked && r.ended, `${id}: uses its attack «${attack}» and finishes it`);
      if (attack === 'raise') check(r.raised >= 2, `${id}: raises skeletons out of the floor (${r.raised})`);
      else check(r.took > 0, `${id}: its attack reaches a player in front of it (${r.took} damage)`);
    }
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 3).join(' | ').slice(0, 400) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nFOE TEST FAILED (${fails.length})` : '\nFOE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
