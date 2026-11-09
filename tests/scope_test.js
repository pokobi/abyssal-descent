'use strict';
// The magnification while aiming comes from the sight on the gun: a scope gives its own (2x, 2.5x, 3x, 4x, 8x) whatever the gun, a dot sight does not magnify
// (the gun's iron sights stay). No gun comes with a scope: the sniper rifles have iron sights. The sniper class's first rifle comes with the 2x scope.
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
      ['a_ranger', ''], ['a_ranger', 'o_holo'], ['a_ranger', 'o_x2'], ['a_ranger', 'o_8x']]) z[g + (o ? '+' + o : '')] = await zoomOf(g, o);
    console.log('      ' + JSON.stringify(z));
    check(z.n_scout === 1.6 && z['n_scout+o_reddot'] === 1.6 && z['n_scout+o_holo'] === 1.6, 'a bare sniper rifle aims through iron sights (1.6x); a dot sight does not magnify');
    check(z['n_scout+o_x2'] === 2 && z['n_scout+o_2x'] === 2.5 && z['n_scout+o_marksman'] === 3 && z['n_scout+o_4x'] === 4 && z['n_scout+o_8x'] === 8, 'on a sniper rifle each scope gives its own: 2 / 2.5 / 3 / 4 / 8');
    check(z['a_ranger+o_x2'] === 2 && z['a_ranger+o_8x'] === 8 && z['a_ranger+o_holo'] === z.a_ranger, 'the same scope gives the same on another gun; a dot sight keeps the gun\'s own');
    check(await p.eval("G.ATTACHMENTS.filter((a) => a.mods && a.mods.zoom !== undefined).length === 0"), 'no sight changes the zoom by a factor any more (a scope sets it)');
    check(await p.eval("(() => { const a = G.ATT_BY_ID.o_x2; return !!a && a.slot === 'optic' && a.mods.magnify === 2 && a.rarity === 'common' && /2倍/.test(a.name); })()"), 'the 2x scope exists (common, optic)');
    check(await p.eval("Object.values(G.WEAPON_ARCH || {}).every((a) => !a.zoom || a.zoom <= 1.6)"), 'iron sights magnify 1.6x at most on any gun');
    // ---- the sniper class
    check(await p.eval("(() => { const P = G.player; P.cls = 'sniper'; P.resetRun(); const w = P.weapons[0]; return w.id === 'n_scout' && w.atts.optic === 'o_x2' && G.weapons.stats(w).zoom === 2 && (P.kitAtts || []).includes('o_x2'); })()"), 'the sniper class starts with its rifle and a 2x scope on it');
    check(await p.eval("(() => { const P = G.player; P.cls = 'soldier'; P.resetRun(); return !P.weapons[0].atts.optic; })()"), 'another class\'s first gun has no scope');
    // ---- the view model: iron sights on a bare rifle, the scope drawn when fitted
    await p.eval("G.ui.title(); document.querySelector('#t-start').click(); 1"); await sleep(500);
    await p.eval("(() => { const b = document.querySelector('.slot-new, [data-slot]'); if (b) b.click(); return 1; })()"); await sleep(400);
    await p.eval("(() => { const c = document.querySelector('.df-card[data-id=\"normal\"]'); if (c) c.click(); return 1; })()"); await sleep(500);
    await p.eval("document.querySelector('.cls-item[data-c=\"sniper\"]').click(); document.querySelector('#cls-go').click(); 1");
    await p.until("!!G.game.run && !!G.world && G.game.state === 'playing'", 60000); await sleep(800);
    const vm = (optic) => p.eval(`(() => { const P = G.player; const w = P.weapons[0]; ${optic === null ? 'delete w.atts.optic;' : `w.atts.optic = '${optic}';`} w.ver++; P.meleeMode = false; G.weapons.equip(true); const m = G.weapons.getModel(); return JSON.stringify({ so: !!m.scopeOptic, pip: !!m.pip, sy: m.sightY, kind: m.scopeKind || '' }); })()`).then(JSON.parse);
    const kitVm = await vm('o_x2');
    check(kitVm.so && !kitVm.pip, 'the class rifle shows the 2x scope (a sight with its own glass) ' + JSON.stringify(kitVm));
    const bare = await vm(null);
    check(!bare.so && !bare.pip && bare.sy === 0.088, 'with the scope taken off, the rifle shows iron sights, aimed down at their height ' + JSON.stringify(bare));
    const s4 = await vm('o_4x');
    check(s4.pip, 'a 4x scope is drawn as a scope with a lens (picture in picture)');
    // aiming: the camera's zoom follows the scope (the lens does the rest on a pip scope)
    const aim = async (optic) => { await vm(optic); return p.eval("(() => { const W = G.weapons; W.adsT = 1; W.curStats = G.weapons.stats(G.player.weapons[0]); return Math.round(W.adsZoom() * 100) / 100 + ':' + Math.round(W.camZoom() * 100) / 100; })()"); };
    const aBare = await aim(null), aX2 = await aim('o_x2'), a8 = await aim('o_8x');
    console.log(`      aim (ads:cam): bare ${aBare}, 2x ${aX2}, 8x ${a8}`);
    check(aBare === '1.6:1.6' && aX2 === '2:2' && a8.startsWith('8:') && +a8.split(':')[1] < 8, 'fully aimed: 1.6x bare, 2x with the 2x scope; the 8x zooms the camera less and its lens the rest');
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nSCOPE TEST FAILED (${fails.length})` : '\nSCOPE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
