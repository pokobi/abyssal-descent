'use strict';
// Every skill, ultimate, grenade and gun used on each side, with the real code paths: nothing may break on the side that uses it or on the side that watches.
//   node tests/coop/skill_test.js [host|guest|both]
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9701;
const who = process.argv[2] || 'both';
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'K' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await sleep(3500);
    const ids = JSON.parse(await h.eval('JSON.stringify({ sk: (G.SKILLS || []).map((s) => s.id), gr: G.ITEMS.filter((i) => i.cat === "grenade").map((i) => i.id), gun: G.WEAPONS.map((w) => w.id), mel: G.MELEE.map((m) => m.id) })'));
    console.log('skills', ids.sk.length, 'grenades', ids.gr.length, 'guns', ids.gun.length, 'melee', ids.mel.length);
    const run = async (me, other, label) => {
      const n0 = () => h.errs.length + g.errs.length;
      const bad = [];
      const step = async (id, js, wait) => {
        const b = n0();
        // (the foes keep dying: the area is simply kept open and the player kept out of harm's way)
        try { await me.eval(`(() => { const P = G.player; G.ui.clearScreen(); G.game.state = 'playing'; P.invulnT = 3; P.pileState = null; P.grapple.state = 'none'; ${js} })(); 1`); } catch (e) { bad.push(id + ': ' + String(e.message).slice(0, 160)); }
        await sleep(wait || 120);
        if (n0() > b) bad.push(id + ': ' + h.errs.concat(g.errs).slice(-1)[0].slice(0, 220));
      };
      for (const id of ids.sk) await step(id, `const A = G.abilities, s = A.makeSlot('${id}'); s.cd = 0; if (s.maxCharges) s.charges = s.maxCharges; G.player.skills[1] = s; A.cast(s);`, 260);
      await sleep(1200);
      for (const id of ids.gr) await step(id, `G.abilities.releaseGrenade('${id}');`, 200);
      await sleep(3000);
      for (const id of ids.gun) await step(id, `const W = G.weapons, w = W.make('${id}'); w.mag = 99; G.player.weapons[0] = w; G.player.wIdx = 0; G.player.meleeMode = false; W.equip(true); W.shoot(w, W.stats(w));`, 90);
      await sleep(1500);
      check(!bad.length, `${label}: ${ids.sk.length} skills, ${ids.gr.length} grenades, ${ids.gun.length} guns` + (bad.length ? ` — ${bad.length} failed:\n   ` + bad.slice(0, 8).join('\n   ') : ''));
    };
    if (who !== 'host') await run(g, h, 'used by the guest');
    if (who !== 'guest') await run(h, g, 'used by the host');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 2).join(' | ').slice(0, 400));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 2).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nSKILL TEST FAILED (${fails.length})` : '\nSKILL TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
