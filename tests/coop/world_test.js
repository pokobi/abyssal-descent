'use strict';
// Every kind of area on both sides with bots fighting in it, doors and breakable things, then getting a teammate up, chat, ping.
//   node tests/coop/world_test.js [seconds in each area, default 5]
const fs = require('fs'), path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9301;
const secs = +process.argv[2] || 5;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=40&jit=20', room = 'W' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await h.booted();
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.booted();   // (the page's boot first: a busy machine can take long over it, and the room is joined meanwhile)
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    const bot = fs.readFileSync(path.join(__dirname, 'coopbot.js'), 'utf8');
    await h.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbDmg = 30; 1`);
    await g.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbDmg = 30; 1`);
    await h.eval(`G.Coop.diff = { id: 'hard', lv: 0 }; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    for (const pg of [h, g]) await pg.running();
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    const kinds = JSON.parse(await h.eval('JSON.stringify(Object.keys(G.Areas.TYPES).filter((k) => k !== "boss"))'));
    console.log('kinds', kinds.join(' '));
    let doorDone = false, destDone = false, n = 2;
    const go = async (area, kind) => {
      await g.eval('G.Coop.fpOk = undefined; 1');
      await h.eval(`G.game.area = ${area - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.Coop.go(${area}, '${kind}'); 1`);
      await g.until(`G.game.area === ${area} && G.game.stage === '${kind}' && G.Coop.fpOk !== undefined`, 25000);
      return g.eval('G.Coop.fpOk');
    };
    const e0 = () => h.errs.length + g.errs.length;
    for (const kind of process.env.QUICK ? ['combat'] : process.env.KINDS ? process.env.KINDS.split(',') : kinds) {
      const before = e0();
      let ok = false;
      try { ok = await go(n, kind); } catch (e) { check(false, `${kind}: reached by the guest (${String(e.message).slice(0, 80)}) ` + JSON.stringify(await g.eval('JSON.stringify([G.game.area, G.game.stage, G.game.state, G.game.transitioning, G.Coop.fpOk])')) + ' ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 400)); await h.eval('G.game.transitioning = false; 1'); continue; }
      await g.eval(`window.__cb = __coopbot(${secs * 1000}); 1`); await h.eval(`window.__cb = __coopbot(${secs * 1000}); 1`);
      await sleep(secs * 1000 + 200);
      check(ok && e0() === before, `${kind}: same world, no errors` + (e0() > before ? ' ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 300) : ''));
      n = n >= 19 ? 2 : n + 1;
    }
    // ---- doors and breakable things, in whatever combat area has them
    // (the doors live in the storeyed halls / ruin: this part runs on the run's old fields, not the per-segment draw; the guest follows the host's flag)
    await h.eval('G.Run.legacy = true; 1');
    for (let a = 2; a <= 20 && (!doorDone || !destDone); a++) {
      await go(a, 'combat');
      await sleep(300);
      const nd = await h.eval('(G.Strata.doors || []).length'), ns = await h.eval('G.world.destructibles.filter((d) => d.alive).length');
      if (nd && !doorDone) {
        doorDone = true;
        await h.eval('G.Strata.openDoor(G.Strata.doors[0]); 1');
        await sleep(500);
        check(await g.eval('G.Strata.doors[0].state === "open" && G.Strata.doors[0].col.alive === false'), 'a door the host opens opens for the guest');
        await g.eval('G.Strata.closeDoor(G.Strata.doors[0]); 1');
        await sleep(500);
        check(await h.eval('G.Strata.doors[0].state === "closed" && G.Strata.doors[0].col.alive === true'), 'a door the guest shuts shuts for the host');
        await h.eval('G.Strata.breakDoor(G.Strata.doors[0]); 1');
        await sleep(500);
        check(await g.eval('G.Strata.doors[0].state === "broken"'), 'a door broken on the host is broken for the guest');
      }
      if (ns && !destDone) {
        destDone = true;
        const i = await g.eval('G.world.destructibles.findIndex((d) => d.alive && !d.explosive)');
        await g.eval(`G.combat.breakDestructible(G.world.destructibles[${i}]); 1`);
        await sleep(500);
        check(await h.eval(`G.world.destructibles[${i}].alive === false`), 'a barrel the guest breaks is gone for the host');
      }
    }
    check(doorDone, 'a door was found to test');
    check(destDone, 'a breakable thing was found to test');
    // ---- the works' steel drums (廃発電所, field_plant.js): one broken on either screen leaves its crushed drum and oil on the other too
    {
      // (the run's own choice of field kept, to be put back once the tests on chosen fields are done)
      const keep = 'window.__rf0 = window.__rf0 || G.Run.field; window.__lg0 = G.Run.legacy; 1';
      await h.eval(keep); await g.eval(keep);
      const pin = "G.Run.field = () => 'plant'; G.Run.legacy = false; 1";
      await h.eval(pin); await g.eval(pin);
      await go(8, 'combat');
      await sleep(300);
      const drums = JSON.parse(await h.eval("JSON.stringify(G.world.destructibles.map((d, i) => d.alive && d.plantDrum && !d.explosive ? i : -1).filter((i) => i >= 0))"));
      check(await h.eval('G.world.field') === 'plant' && drums.length >= 2, `two of the works' drums to break (${await h.eval('G.world.field')}: ${drums.length})`);
      if (drums.length >= 2) {
        const left = (pg, i) => pg.eval(`(() => { const d = G.world.destructibles[${i}]; return G.world.group.children.some((c) => c.name === 'drumRemains' && Math.hypot(c.position.x - d.pos.x, c.position.z - d.pos.z) < 0.1); })()`);
        await g.eval(`G.combat.breakDestructible(G.world.destructibles[${drums[0]}]); 1`);
        await h.until(`G.world.destructibles[${drums[0]}].alive === false`, 5000).catch(() => {});
        check(await g.eval(`G.world.destructibles[${drums[0]}].alive === false`) && await left(g, drums[0]), 'a drum the guest breaks leaves its crushed drum on the guest\'s screen');
        check(await h.eval(`G.world.destructibles[${drums[0]}].alive === false`) && await left(h, drums[0]), 'and on the host\'s');
        await h.eval(`G.combat.breakDestructible(G.world.destructibles[${drums[1]}]); 1`);
        await g.until(`G.world.destructibles[${drums[1]}].alive === false`, 5000).catch(() => {});
        check(await left(h, drums[1]) && await g.eval(`G.world.destructibles[${drums[1]}].alive === false`) && await left(g, drums[1]), 'a drum the host breaks leaves its crushed drum on the guest\'s screen too');
      }
    }
    // ---- the grapple of a team-mate seen on the other screen (player.js hookAnchor, core.js ha, body.js K.hookEnd): the guest hooks a
    // thing; on the host's screen the line's end is followed after every step of the world and held to the host's own copy of that thing
    {
      // (the guest stands where it sees a thing the filter picks, from 5-30 m, and looks at its middle; the number of the thing, or none)
      const placeJs = `window.__hookOn = (pick) => { const w = G.world, P = G.player, V = (x, y, z) => new THREE.Vector3(x, y, z), HR = { bars: true, filter: (c) => !c.hookThrough };
        const targets = w.colliders.filter((c) => c.alive !== false && !c.ghost && !c.noGrapple && pick(c, w));
        const spots = []; for (let n = 0; n < w.reachMask.length; n++) if (w.reachMask[n] && !w.nb[n] && w.nf[n] > -50) { const i = n % w.N; spots.push(V((i % w.Wn) - w.xo + 0.5, w.nf[n], ((i / w.Wn) | 0) - w.zo + 0.5)); }
        for (const c of targets) { const aim = V((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2);
          for (const s of spots) { const eye = V(s.x, s.y + 1.62, s.z), d = aim.clone().sub(eye), L = d.length(); if (L < 5 || L > 30) continue; d.normalize();
            const h = w.raycast(eye, d, 60, HR); if (!h || h.c !== c) continue;
            P.pos.set(s.x, s.y + 0.05, s.z); P.vel.set(0, 0, 0); P.grappleCd = 0; P.grapple.state = 'none'; P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(d.y);
            return c.idx; } }
        return -1; }; 1`;
      // (the host follows the guest's line after every step: its end now (K.hookEnd) and the point the guest sent, against a test of where
      // the thing is on the host's screen - inside(p) - and where the guest's figure is)
      const followJs = (gid, insideSrc) => `(() => { const K = G.Coop, r = window.__GL = { n: 0, endIn: 0, hkIn: 0, endOut: 0, hkOut: 0, gone: 0, posBad: 0, maxEnd: 0, maxHk: 0, lag: 0 };
        const inside = ${insideSrc};
        const look = () => { const rp = K.players.get(${gid}); if (!rp) return; const end = K.hookEnd(rp);
          if (!end) { if (r.n) r.gone++; return; }
          if (!rp.ha) return; // (still flying: its end is the hook in the air, not yet in anything)
          r.n++; const a = inside(end), b = rp.hk ? inside(new THREE.Vector3(...rp.hk)) : -1;
          if (rp.hk) r.lag = Math.max(r.lag, end.distanceTo(new THREE.Vector3(...rp.hk))); // (how far behind the point they sent is)
          if (a <= 0.02) r.endIn++; else { r.endOut++; r.maxEnd = Math.max(r.maxEnd, a); }
          if (b >= 0) { if (b <= 0.02) r.hkIn++; else { r.hkOut++; r.maxHk = Math.max(r.maxHk, b); } }
          if (!isFinite(rp.pos.x + rp.pos.y + rp.pos.z) || !isFinite(rp.to.x + rp.to.y + rp.to.z)) r.posBad++; };
        if (!window.__glHook) { window.__glHook = 1; const u = G.combat.update; G.combat.update = function () { const x = u.apply(this, arguments); if (window.__glLook) { try { window.__glLook(); } catch (e) { console.error(e); } } return x; }; }
        window.__glLook = look; return 1; })()`;
      // (how far a point is outside a collider's box on the host's screen (0 inside), and outside an object's bounds)
      const boxOf = (idx) => `(p) => { const c = G.world.colliders[${idx}]; const dx = Math.max(c.x0 - p.x, 0, p.x - c.x1), dy = Math.max(c.y0 - p.y, 0, p.y - c.y1), dz = Math.max(c.z0 - p.z, 0, p.z - c.z1); return Math.hypot(dx, dy, dz); }`;
      const objOf = (idx) => `(p) => { const c = G.world.colliders[${idx}], o = (c.follow && c.follow()) || (c.gim && c.gim.root); const b = new THREE.Box3().setFromObject(o); return b.distanceToPoint(p); }`;
      const hookOnce = async (pick) => {
        await g.eval(placeJs);
        const idx = await g.eval(`window.__hookOn(${pick})`);
        if (idx < 0) return -1;
        await g.eval(`(() => { G.ui.clearScreen(); G.game.state = 'playing'; G.game.dev = { god: true, speed: 1 }; return 1; })()`);
        await g.frames(3);
        await g.eval(`(() => { const k = G.BIND.grapple[0]; G.input.keys[k] = true; G.input.pressed[k] = true; return 1; })()`);
        await g.until(`G.player.grapple.state === 'attached'`, 8000).catch(() => {});
        if (!(await g.eval(`G.player.grapple.state === 'attached'`))) return -2;
        // (in the thing aimed at? a moving plate can move on while the hook flies, and it lands in what was behind)
        return (await g.eval(`(() => { const a = G.player.grapple.anchor; return !!a && !!a.c && a.c.idx === ${idx}; })()`)) ? idx : -3;
      };
      // (fired again, at most four times, until the hook is in the thing aimed at)
      const hookIt = async (pick) => { let r = -1; for (let k = 0; k < 4; k++) { r = await hookOnce(pick); if (r >= 0 || r === -1) return r; await letGo(); await g.frames(10); } return r; };
      const letGo = () => g.eval(`(() => { const k = G.BIND.grapple[0]; G.input.keys[k] = false; if (G.player.grapple.state === 'attached') G.player.detachGrapple(false); return 1; })()`);
      const gid = await g.eval('G.Coop.id');
      const pinTo = (f) => `G.Run.field = () => '${f}'; G.Run.legacy = false; 1`;
      // 1. a moving plate of the foundry, hooked while it moves: the line's end stays in the plate on the host's screen
      await h.eval(pinTo('foundry')); await g.eval(pinTo('foundry'));
      await go(9, 'combat'); await sleep(300);
      await h.until('G.world.movers && G.world.movers.length > 0', 5000).catch(() => {});
      await sleep(2500); // (the host's word on where the plates are in their round has come once)
      const mi = await hookIt(`(c, w) => (w.movers || []).some((m) => m.col === c)`);
      check(mi >= 0, `the guest hooks a moving plate of the foundry (${mi})`);
      if (mi >= 0) {
        await h.eval(followJs(gid, boxOf(mi)));
        const x0 = await h.eval(`G.world.colliders[${mi}].x0 + G.world.colliders[${mi}].z0 + G.world.colliders[${mi}].y0`);
        await h.gameFor(3);
        const r = JSON.parse(await h.eval('JSON.stringify(window.__GL)')), moved = Math.abs(await h.eval(`G.world.colliders[${mi}].x0 + G.world.colliders[${mi}].z0 + G.world.colliders[${mi}].y0`) - x0);
        console.log('      plate: ' + JSON.stringify(r) + ` (it moved ${moved.toFixed(2)} m on the host's screen)`);
        check(r.n > 20 && r.endOut === 0, `on the host's screen the line's end stays in the moving plate (${r.endIn}/${r.n} steps; the point the guest sent was in it ${r.hkIn}/${r.n}, at most ${r.maxHk.toFixed(2)} m off)`);
        check(r.posBad === 0, 'and the guest pulled along by it is drawn where it is (no lost position)');
        await letGo(); await h.eval('window.__glLook = null; 1');
      }
      // 2. a breakable thing hooked, broken on the host: the line is gone on the host's screen at once, and on the guest's (it lets go)
      await sleep(500);
      const bi = await hookIt(`(c, w) => !!c.dest && c.dest.alive && !c.dest.explosive`);
      check(bi >= 0, `the guest hooks a breakable thing (${bi})`);
      if (bi >= 0) {
        await h.eval(followJs(gid, boxOf(bi)));
        await h.gameFor(0.5);
        await h.eval(`(() => { const d = G.world.colliders[${bi}].dest; G.combat.breakDestructible(d); return 1; })()`);
        await h.until(`!G.Coop.hookEnd(G.Coop.players.get(${gid}))`, 3000).catch(() => {});
        const goneHost = await h.eval(`!G.Coop.hookEnd(G.Coop.players.get(${gid}))`);
        await g.until(`G.player.grapple.state !== 'attached'`, 5000).catch(() => {});
        await h.until(`!G.Coop.players.get(${gid}).hk`, 5000).catch(() => {});
        check(goneHost && await g.eval(`G.player.grapple.state !== 'attached'`) && await h.eval(`!G.Coop.players.get(${gid}).hk`), 'broken on the host, the thing the guest hooked takes the line away on both screens');
        await letGo(); await h.eval('window.__glLook = null; 1');
      }
      // 3. a great pillar of the dusk city, hooked and felled: the line's end comes down with the pillar on the host's screen
      await h.eval(pinTo('dusk')); await g.eval(pinTo('dusk'));
      await go(10, 'combat'); await sleep(300);
      const pi = await hookIt(`(c) => !!c.gim && c.gim.kind === 'pillar' && !c.gim.used`);
      if (pi < 0) console.log(`      (no great pillar to hook in this dusk area: ${pi})`);
      else {
        await h.eval(followJs(gid, objOf(pi)));
        const y0 = await h.eval(`(() => { const rp = G.Coop.players.get(${gid}); const e = G.Coop.hookEnd(rp); return e ? e.y : -1; })()`);
        await h.eval(`(() => { const g = G.world.colliders[${pi}].gim; G.Gim.trigger(g, { by: 'bullet' }); return 1; })()`);
        await h.gameFor(2.5);
        const r = JSON.parse(await h.eval('JSON.stringify(window.__GL)'));
        console.log('      pillar: ' + JSON.stringify(r) + ` (the end was ${y0.toFixed(2)} m up when it went)`);
        check(r.n > 10 && r.maxEnd < 0.3, `a falling pillar the guest hooked: on the host's screen the line's end comes down with it (${r.endIn}/${r.n} steps on it; the point sent was off it by up to ${r.maxHk.toFixed(2)} m)`);
        await letGo(); await h.eval('window.__glLook = null; 1');
      }
      // 4. the things that can now be hooked: a switch box of the power plant - the line goes to it on the host's screen
      await h.eval(pinTo('plant')); await g.eval(pinTo('plant'));
      await go(11, 'combat'); await sleep(300);
      const ei = await hookIt(`(c) => !!c.gim && c.gim.kind === 'elecbox'`);
      if (ei < 0) console.log(`      (no switch box the guest can hook here: ${ei})`);
      else {
        await h.eval(followJs(gid, boxOf(ei)));
        await h.gameFor(1);
        const r = JSON.parse(await h.eval('JSON.stringify(window.__GL)'));
        check(r.n > 5 && r.maxEnd < 0.3, `a switch box the guest hooked: the line goes to it on the host's screen (${r.endIn}/${r.n}, off by up to ${r.maxEnd.toFixed(2)} m)`);
        await letGo(); await h.eval('window.__glLook = null; 1');
      }
      // ... and the iron bars of a crypt's cells (they stop the hook now: player.js HOOK_RAY bars)
      await h.eval(pinTo('catacombs')); await g.eval(pinTo('catacombs'));
      await go(13, 'combat'); await sleep(300);
      const ri = await hookIt(`(c) => !!c.bars`);
      if (ri < 0) console.log(`      (no cell bars the guest can hook here: ${ri})`);
      else {
        await h.eval(followJs(gid, boxOf(ri)));
        await h.gameFor(1);
        const r = JSON.parse(await h.eval('JSON.stringify(window.__GL)'));
        check(r.n > 5 && r.maxEnd < 0.3, `cell bars the guest hooked: the line goes to them on the host's screen (${r.endIn}/${r.n}, off by up to ${r.maxEnd.toFixed(2)} m)`);
        await letGo(); await h.eval('window.__glLook = null; 1');
      }
      // (a fresh area for what comes after, on the run's own fields again: the guest stood where it fired from)
      const unpin = 'G.Run.field = window.__rf0; G.Run.legacy = window.__lg0; 1';
      await h.eval(unpin); await g.eval(unpin);
      await go(14, 'combat'); await sleep(500);
    }
    // ---- getting a teammate up
    // (the host stays untouchable: the area's foes put a mortal host down too now and then, and with both down the run is over - nobody
    // left to get anyone up)
    await h.eval('G.game.dev = { god: true, speed: 1 }; 1'); await g.eval('G.game.dev = { god: false, speed: 1 }; 1');
    await sleep(200);
    await g.eval("G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; G.player.revives = 0; G.player.invulnT = 0; G.player.stats.dodge = 0; G.player.os = 0; G.player.hp = 1; G.combat.damagePlayer(99999, { src: 'melee', fixed: true }); 1");
    await h.until('G.Coop.players.get(1).dead === true', 4000);
    await h.eval("(() => { G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; const t = G.Coop.players.get(1); G.player.pos.copy(t.to); G.player.vel.set(0, 0, 0); })(); 1");
    await sleep(300);
    await h.send('Page.bringToFront');
    // (held until done, let go for a moment every 6 s of game time - the getting-up once broken off (another thing in the hands) goes on
    // only after the key is let go - and a screen that comes up meanwhile - the area's reward once its foes are down, the pause a page without the pointer
    // falls into, which takes the keys away - is put away: getting a teammate up goes on only while the game is being played)
    await h.eval("G.input.keys[G.BIND.interact[0]] = true; window.__rel = G.game.time; window.__relTo = 0; window.__hold = setInterval(() => { const k = G.BIND.interact[0], now = performance.now(); if (G.game.time - window.__rel > 6) { window.__rel = G.game.time; window.__relTo = now + 50; } if (now < window.__relTo) { G.input.keys[k] = false; return; } G.input.keys[k] = true; if (G.game.state !== 'playing' && !G.player.dead) { G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; G.input.keys[G.BIND.interact[0]] = true; } }, 16); 1");
    await sleep(1500); console.log('rv', await h.eval("JSON.stringify([G.game.state, document.getElementById('coop-rv').style.display, document.getElementById('coop-rv').textContent, G.Coop.players.get(1).dead, G.Coop.players.get(1).pos.distanceTo(G.player.pos), G.input.down('interact'), G.player.dead])"));
    await g.until('G.player.dead === false', 30000).catch(async (e) => {
      console.log('      revive stuck: host ' + await h.eval("JSON.stringify({ down: G.input.down('interact'), blocked: G.player.handsBlocked ? G.player.handsBlocked() : null, hands: G.player.hands ? (G.player.hands.kind || G.player.hands.id || Object.keys(G.player.hands).join()) : null, rv: document.getElementById('coop-rv').textContent, st: G.game.state, search: !!G.game.search, grapple: G.player.grapple.state, pile: G.player.pileState || null, screens: [...document.querySelectorAll('#screens > *')].map((e) => (e.id || e.className) + ':' + e.textContent.replace(/\s+/g, ' ').slice(0, 40)), pend: !!G.game.rewardPending, cleared: G.game.areaCleared, dead: G.player.dead, live: G.Coop.live, area: G.game.area, stage: G.game.stage, field: G.world.field })") + ' / guest ' + await g.eval('JSON.stringify({ dead: G.player.dead, hp: G.player.hp, st: G.game.state, grapple: G.player.grapple.state })'));
      throw e; });
    await h.eval('clearInterval(window.__hold); G.input.keys[G.BIND.interact[0]] = false; 1');
    check(await g.eval('G.player.hp > 1'), 'holding interact beside a fallen teammate gets them up');
    // ---- chat and ping
    await h.eval("G.Coop.send({ t: 'ch', n: 'Host', i: 0, x: 'テスト' }); 1");
    await sleep(500); await g.until("document.getElementById('coop-chat').textContent.includes('テスト')", 8000).catch(() => {});   // (by what arrives: a busy machine is slower)
    check(await g.eval("document.getElementById('coop-chat').textContent.includes('テスト')"), 'a chat line reaches the other player');
    await g.eval("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' })); 1");
    await sleep(600); await h.until("document.querySelectorAll('#coop-marks .cm').length >= 2", 8000).catch(() => {});
    check(await h.eval("document.querySelectorAll('#coop-marks .cm').length >= 2"), 'a ping shows up on the other screen');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | ').slice(0, 400));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 3).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nWORLD TEST FAILED (${fails.length})` : '\nWORLD TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
