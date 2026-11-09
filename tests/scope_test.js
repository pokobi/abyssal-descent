'use strict';
// The magnification while aiming comes from the sight on the gun: a scope gives its own (2x, 2.5x, 3x, 4x, 8x) whatever the gun, a dot sight does not magnify
// (the gun's iron sights stay). No gun comes with a scope: the sniper rifles have iron sights. The sniper class's first rifle comes with the 2x scope.
// Who takes what: handguns, SMGs and shotguns dot sights only, the 8x sniper rifles only. Every sight looks its own (optics.js): the dot sights a big
// window close to the eye, the 2x-4x a lens in a thick rim with the world round it in view, the 8x alone black round its eyepiece with a rangefinder.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.save.data.settings.askTutorial = false; 1");
    // ---- the numbers
    const zoomOf = (gun, optic) => p.eval(`(() => { const w = G.weapons.make('${gun}'); ${optic ? `w.atts.optic = '${optic}'; w.ver++;` : ''} return Math.round(G.weapons.stats(w).zoom * 100) / 100; })()`);
    const z = {};
    for (const [g, o] of [['n_scout', ''], ['n_scout', 'o_reddot'], ['n_scout', 'o_holo'], ['n_scout', 'o_x2'], ['n_scout', 'o_2x'], ['n_scout', 'o_marksman'], ['n_scout', 'o_4x'], ['n_scout', 'o_8x'],
      ['a_ranger', ''], ['a_ranger', 'o_holo'], ['a_ranger', 'o_x2'], ['a_ranger', 'o_4x']]) z[g + (o ? '+' + o : '')] = await zoomOf(g, o);
    console.log('      ' + JSON.stringify(z));
    check(z.n_scout === 1.6 && z['n_scout+o_reddot'] === 1.6 && z['n_scout+o_holo'] === 1.6, 'a bare sniper rifle aims through iron sights (1.6x); a dot sight does not magnify');
    check(z['n_scout+o_x2'] === 2 && z['n_scout+o_2x'] === 2.5 && z['n_scout+o_marksman'] === 3 && z['n_scout+o_4x'] === 4 && z['n_scout+o_8x'] === 8, 'on a sniper rifle each scope gives its own: 2 / 2.5 / 3 / 4 / 8');
    check(z['a_ranger+o_x2'] === 2 && z['a_ranger+o_4x'] === 4 && z['a_ranger+o_holo'] === z.a_ranger, 'the same scope gives the same on another gun; a dot sight keeps the gun\'s own');
    check(await p.eval("G.ATTACHMENTS.filter((a) => a.mods && a.mods.zoom !== undefined).length === 0"), 'no sight changes the zoom by a factor any more (a scope sets it)');
    check(await p.eval("(() => { const a = G.ATT_BY_ID.o_x2; return !!a && a.slot === 'optic' && a.mods.magnify === 2 && a.rarity === 'common' && /2倍/.test(a.name); })()"), 'the 2x scope exists (common, optic)');
    check(await p.eval("Object.values(G.WEAPON_ARCH || {}).every((a) => !a.zoom || a.zoom <= 1.6)"), 'iron sights magnify 1.6x at most on any gun');
    // ---- who takes what
    const fit = JSON.parse(await p.eval(`(() => { const ok = (a, w) => G.attOk(G.ATT_BY_ID[a], G.WEAPON_BY_ID[w]); const dots = ['o_reddot', 'o_reflex', 'o_holo', 'o_hunter', 'o_seer', 'o_god'], scopes = ['o_x2', 'o_2x', 'o_marksman', 'o_4x', 'o_8x'];
      const r = {}; for (const w of ['s_wasp', 'starter', 'r_judge', 'g_breacher', 'x_striker']) r[w] = [dots.every((a) => ok(a, w)), scopes.some((a) => ok(a, w))];
      r.scout8 = ok('o_8x', 'n_scout'); r.dmr8 = ok('o_8x', 'd_marksman'); r.rifle8 = ok('o_8x', 'a_ranger'); r.rifle4 = ok('o_4x', 'a_ranger'); r.rifle2 = ok('o_x2', 'a_ranger'); r.dmr3 = ok('o_marksman', 'd_marksman');
      return JSON.stringify(r); })()`));
    console.log('      ' + JSON.stringify(fit));
    check(['s_wasp', 'starter', 'r_judge', 'g_breacher', 'x_striker'].every((w) => fit[w][0] && !fit[w][1]), 'SMG, handgun, revolver, shotguns: every dot sight fits, no scope does');
    check(fit.scout8 && !fit.dmr8 && !fit.rifle8 && fit.rifle4 && fit.rifle2 && fit.dmr3, 'the 8x fits sniper rifles only; the other scopes still fit rifles and marksman rifles');
    check(await p.eval("(() => { const v = G.ATTACHMENTS.filter((a) => a.slot === 'optic').map((a) => a.visual); return v.length === 11 && new Set(v).size === 11; })()"), 'each of the 11 sights has a look of its own');
    check(await p.eval(`(() => { const P = G.player; P.cls = 'soldier'; P.resetRun(); const snap = G.game.playerSnap(); snap.weapons = [{ id: 's_wasp', atts: { optic: 'o_x2', muzzle: 'm_supp' } }]; snap.attStash = []; G.game.applyPlayerSnap(snap);
      const w = P.weapons[0]; return w.id === 's_wasp' && !w.atts.optic && w.atts.muzzle === 'm_supp' && P.attStash.includes('o_x2'); })()`), 'a saved SMG that wore a scope gives the scope back to the stash (the rest stays on)');
    // ---- the sniper class
    check(await p.eval("(() => { const P = G.player; P.cls = 'sniper'; P.resetRun(); const w = P.weapons[0]; return w.id === 'n_scout' && w.atts.optic === 'o_x2' && G.weapons.stats(w).zoom === 2 && (P.kitAtts || []).includes('o_x2'); })()"), 'the sniper class starts with its rifle and a 2x scope on it');
    check(await p.eval("(() => { const P = G.player; P.cls = 'soldier'; P.resetRun(); return !P.weapons[0].atts.optic; })()"), 'another class\'s first gun has no scope');
    // ---- the view model: iron sights on a bare rifle, the scope drawn when fitted
    await p.eval("G.ui.title(); document.querySelector('#t-start').click(); 1"); await sleep(500);
    await p.eval("(() => { const b = document.querySelector('.slot-new, [data-slot]'); if (b) b.click(); return 1; })()"); await sleep(400);
    await p.eval("(() => { const c = document.querySelector('.df-card[data-id=\"normal\"]'); if (c) c.click(); return 1; })()"); await sleep(500);
    await p.eval("document.querySelector('.cls-item[data-c=\"sniper\"]').click(); document.querySelector('#cls-go').click(); 1");
    await p.until("!!G.game.run && !!G.world && G.game.state === 'playing'", 60000); await sleep(800);
    const vm = (optic) => p.eval(`(() => { const P = G.player; const w = P.weapons[0]; ${optic === null ? 'delete w.atts.optic;' : `w.atts.optic = '${optic}';`} w.ver++; P.meleeMode = false; G.weapons.equip(true); const m = G.weapons.getModel(); return JSON.stringify({ so: !!m.scopeOptic, pip: !!m.pip, sy: m.sightY, kind: m.scopeKind || '', dot: !!m.dotSight, winH: m.winH || 0, spin: (m.spin || []).length, pk: m.pip ? G.weapons.pipMaterial().uniforms.uKind.value : -1 }); })()`).then(JSON.parse);
    const kitVm = await vm('o_x2');
    check(kitVm.so && kitVm.pip && kitVm.kind === 'x2' && kitVm.pk === 0, 'the class rifle shows the 2x scope: a lens with its own reticle ' + JSON.stringify(kitVm));
    const kinds = {};
    for (const o of ['o_x2', 'o_2x', 'o_marksman', 'o_4x']) kinds[o] = (await vm(o)).pk;
    check(new Set(Object.values(kinds)).size === 4, 'the 2x, 2.5x, 3x and 4x each draw a reticle of their own ' + JSON.stringify(kinds));
    const dots = {};
    for (const o of ['o_reddot', 'o_reflex', 'o_holo', 'o_hunter', 'o_seer', 'o_god']) dots[o] = await vm(o);
    check(Object.values(dots).every((d) => d.dot && !d.so && d.winH > 0.01), 'the dot sights: a window of their own, no scope');
    check(dots.o_seer.spin === 1 && dots.o_god.spin === 0 && dots.o_hunter.spin === 0, 'the epic and better sights kept plain: 千里眼 one thin turning ring of runes, the others none');
    {
      // a dot sight's window covers about 40% of the screen's height while aiming
      await vm('o_reddot'); await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.enemies.clear(); G.input.mouse[2] = true; 1"); await sleep(1500);
      const cover = await p.eval("(() => { const m = G.weapons.getModel(); const d = -(m.group.position.z + m.winZ); return Math.round(2 * Math.atan(m.winH / d) * 180 / Math.PI / 50 * 100) / 100; })()");
      await p.eval("G.input.mouse[2] = false; 1"); await sleep(600);
      check(cover > 0.33 && cover < 0.47, 'aiming through a red dot, its window covers about 40% of the screen height (' + cover + ')');
    }
    {
      // the 8x: the screen black round its eyepiece, the rangefinder reads a distance
      await p.eval("(() => { const w = G.player.weapons[0]; w.atts.optic = 'o_8x'; w.ver++; G.weapons.equip(true); G.ui.clearScreen(); G.game.state = 'playing'; G.enemies.clear(); G.input.mouse[2] = true; return 1; })()"); await sleep(1500);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.input.mouse[2] = true; 1"); // (an area cleared by the clean-up may have put a screen up)
      await p.until('G.weapons.adsT > 0.95 && !!G.weapons.isScoped', 8000).catch(() => {}); await sleep(400);
      const r = JSON.parse(await p.eval("(() => { const el = document.getElementById('scope-overlay'); const t = el.querySelector('.x8rng'); return JSON.stringify({ on: el.style.opacity === '1', kind: el.dataset.kind, svg: !!el.querySelector('.x8 svg'), txt: t ? t.textContent : '', scoped: !!G.weapons.isScoped }); })()"));
      await p.eval("G.input.mouse[2] = false; 1"); await sleep(800);
      check(r.on && r.kind === 'x8' && r.svg && r.scoped && /^(\d+ m|--- m)$/.test(r.txt), 'the 8x blacks the screen out round its eyepiece; the rangefinder reads ' + JSON.stringify(r));
      check(await p.eval("document.getElementById('scope-overlay').style.opacity === '0'"), 'and lowering the gun lifts it');
    }
    const bare = await vm(null);
    check(!bare.so && !bare.pip && bare.sy === 0.088, 'with the scope taken off, the rifle shows iron sights, aimed down at their height ' + JSON.stringify(bare));
    const s4 = await vm('o_4x');
    check(s4.pip, 'a 4x scope is drawn as a scope with a lens (picture in picture)');
    // aiming: the camera's zoom follows the scope (the lens does the rest on a pip scope)
    {
      // the sniper's focus gauge fills only while truly aiming: not while reloading, using an item, switching, holding a grenade
      const r = JSON.parse(await p.eval(`(() => { const P = G.player, W = G.weapons, CL = G.Classes; P.cls = 'sniper'; P.resetRun(); P.meleeMode = false; W.equip(true); G.game.state = 'playing';
        const st = CL.state(), w = P.weapon, tick = (n) => { for (let i = 0; i < n; i++) { W.adsT = 1; CL.tick(0.05); } return +st.focus.toFixed(2); };
        const o = {}; st.focus = 0; o.aim = tick(10);
        st.focus = 0; w.reloading = true; o.reload = tick(10); w.reloading = false;
        const ib = G.ItemAnim.busy; G.ItemAnim.busy = () => true; st.focus = 0; o.item = tick(10); G.ItemAnim.busy = ib;
        st.focus = 0; W.switchT = 0.3; o.sw = tick(4); W.switchT = 0;
        const gh = G.GrenHold.active; G.GrenHold.active = () => true; st.focus = 0; o.gren = tick(10); G.GrenHold.active = gh;
        return JSON.stringify(o); })()`));
      check(r.aim > 0.2 && r.reload === 0 && r.item === 0 && r.sw === 0 && r.gren === 0, "the sniper's gauge fills while aiming, not while reloading, using an item, switching or holding a grenade " + JSON.stringify(r));
    }
    const aim = async (optic) => { await vm(optic); return p.eval("(() => { const W = G.weapons; W.adsT = 1; W.curStats = G.weapons.stats(G.player.weapons[0]); return Math.round(W.adsZoom() * 100) / 100 + ':' + Math.round(W.camZoom() * 100) / 100; })()"); };
    const aBare = await aim(null), aX2 = await aim('o_x2'), a8 = await aim('o_8x');
    console.log(`      aim (ads:cam): bare ${aBare}, 2x ${aX2}, 8x ${a8}`);
    check(aBare === '1.6:1.6' && aX2 === '2:1.41' && a8 === '8:8', 'fully aimed: 1.6x bare; the 2x zooms the screen a little and its lens the rest; the 8x zooms the whole screen');
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nSCOPE TEST FAILED (${fails.length})` : '\nSCOPE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
