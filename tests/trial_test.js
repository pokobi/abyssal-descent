'use strict';
// The aim trial (areas.js): every target appears on screen, flashes before it goes, arrows point at any off screen, only an escaped target breaks the
// combo, a slow gun scores more per hit, misses lower the final score through accuracy, a pistol is lent when there is no gun, the panel shows the
// score / rank / the way to the next, and it is all taken down at the end. Then simulated players (four skill levels x guns) play whole rounds:
// the ranks should step up with skill and not depend much on the gun.
//   node tests/trial_test.js [sim]   (sim: only the simulated rounds)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9997;
const SIM_ONLY = process.argv[2] === 'sim';
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(500);
    const enter = async (n) => {
      await p.eval(`G.game.run.freeArea = -1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${n || 4}, 'trial'); 1`);
      await p.until("G.game.stage === 'trial' && G.game.objective && G.game.objective.kind === 'trial'", 20000);
      await sleep(300);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    };
    // the simulated player: picks the target nearest the crosshair once it has been up for its reaction time, turns toward it at its turning speed,
    // and fires when the crosshair is on it, no faster than the gun keeps up; a shot hits with its accuracy (the centre with its own chance)
    await p.eval(`(() => {
      const AR = G.Areas, u0 = AR.updateTrial, V = (x, y, z) => new THREE.Vector3(x, y, z);
      AR.updateTrial = function (dt) {
        const r = u0.apply(this, arguments), B = window.__bot, O = G.game.objective;
        if (!B || !O || O.kind !== 'trial' || O.countdown > 0 || G.game.areaCleared) return r;
        const P = G.player, eye = G.camera.position;
        const dirTo = (t) => t.pos.clone().sub(eye).normalize();
        const ang = (t) => { const f = P.forward(), d = dirTo(t); return Math.acos(Math.max(-1, Math.min(1, f.dot(d)))); };
        if (B.cur && !B.cur.alive) B.cur = null;
        if (!B.cur) { B.on = 0; let best = 1e9; for (const t of AR.targets) if (t.alive && t.maxLife - t.life >= B.react) { const a = ang(t); if (a < best) { best = a; B.cur = t; } } }
        B.cd = (B.cd || 0) - dt;
        if (!B.cur) return r;
        const d = dirTo(B.cur), wy = Math.atan2(-d.x, -d.z), wp = Math.asin(d.y);
        const step = B.turn * dt, dy = G.U.wrapAngle(wy - P.yaw), dp = wp - P.pitch;
        const l = Math.hypot(dy, dp); if (l > step) { P.yaw += dy / l * step; P.pitch += dp / l * step; } else { P.yaw = wy; P.pitch = wp; }
        const rad = Math.atan(B.cur.radius / B.cur.pos.distanceTo(eye));
        if (ang(B.cur) < rad) B.on += dt; // (a moment to settle the aim on it before the first shot)
        if (ang(B.cur) < rad && B.on >= B.settle && B.cd <= 0) {
          B.cd = 1 / AR.TRIAL.sustained(P.weapon);
          O.shots++;
          if (Math.random() < B.acc) G.combat.damageEnemy(B.cur, 99999, { src: 'bullet', head: Math.random() < B.center, weapon: P.weapon, pos: B.cur.pos.clone() });
        }
        return r;
      };
      return 1;
    })()`);
    if (!SIM_ONLY) {
      // ---- one round, checked as it goes
      await enter(4);
      await p.until('G.game.objective.countdown <= 0', 8000);
      const inView = [];
      for (let i = 0; i < 20; i++) {
        await sleep(250);
        inView.push(...JSON.parse(await p.eval("JSON.stringify(G.Areas.targets.filter((t) => t.alive && t.maxLife - t.life < 0.3).map((t) => { const v = t.pos.clone().project(G.camera); return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95; }))")));
      }
      check(inView.length >= 3 && inView.every(Boolean), `every new target appears on screen (${inView.filter(Boolean).length} / ${inView.length})`);
      check(await p.eval("!!document.getElementById('trial-hud') && /次のランク/.test(document.querySelector('#trial-hud .th-next').textContent)"), 'the panel shows the score and the way to the next rank');
      // a target about to go flashes red
      await p.until('G.Areas.targets.some((t) => t.alive && t.life < G.Areas.TRIAL.WARN)', 6000).catch(() => {});
      let blink = false; for (let i = 0; i < 8 && !blink; i++) { blink = await p.eval('G.Areas.targets.some((t) => t.alive && t.halo.visible)'); await sleep(40); }
      check(blink, 'a target about to escape blinks red');
      // turn round: arrows point at what is now behind
      await p.until('G.Areas.targets.filter((t) => t.alive).length >= 2', 5000).catch(() => {});
      await p.eval('G.Areas.targets.forEach((t) => { if (t.alive) { t.life = t.maxLife = 8; } }); G.player.yaw += Math.PI; 1');
      check(await p.until("document.querySelectorAll('#trial-arrows i').length > 0", 3000).catch(() => false), 'targets off screen get arrows at the edge');
      // shots that miss do not break the combo; an escaped target does
      await p.eval("(() => { const O = G.game.objective; O.combo = 7; O.shots += 5; return 1; })()");
      await sleep(100);
      const c1 = await p.eval('G.game.objective.combo');
      check(c1 === 7, 'missed shots leave the combo alone');
      await p.eval("(() => { const t = G.Areas.targets.find((x) => x.alive); if (t) t.life = 0.01; return 1; })()"); await sleep(200);
      check(await p.eval('G.game.objective.combo') === 0, 'an escaped target breaks it');
      // accuracy: the final score falls with misses
      const f = JSON.parse(await p.eval("(() => { const O = G.game.objective, T = G.Areas.TRIAL, k = { score: O.score, shots: O.shots, gunHits: O.gunHits }; const a = T.final({ score: 10000, shots: 10, gunHits: 10 }), b = T.final({ score: 10000, shots: 20, gunHits: 10 }), c = T.final({ score: 10000, shots: 0, gunHits: 0 }); return JSON.stringify([a, b, c]); })()"));
      check(f[0] === 10000 && f[1] === 8500 && f[2] === 10000, 'the final score = total x (0.7 + 0.3 x accuracy) ' + JSON.stringify(f));
      // the gun factor
      const wf = JSON.parse(await p.eval("JSON.stringify(['starter', 's_wasp', 'n_longbow', 'r_judge', 'g_breacher', 'k_rpg' ].filter((id) => G.WEAPON_BY_ID[id]).map((id) => [id, +G.Areas.TRIAL.factor(G.weapons.make(id)).toFixed(2)]))"));
      console.log('      gun factors', JSON.stringify(wf));
      check(wf.find((x) => x[0] === 'starter')[1] === 1 && wf.find((x) => x[0] === 's_wasp')[1] === 1 && wf.find((x) => x[0] === 'n_longbow')[1] > 2, 'quick guns x1, a bolt-action sniper gets more per hit');
      await p.eval('G.game.objective.t = G.game.objective.dur - 0.05; 1');
      await p.until('G.game.areaCleared', 5000);
      await sleep(300);
      check(await p.eval("!document.getElementById('trial-hud') && !document.getElementById('trial-arrows') && !document.getElementById('trial-clock')"), 'the panel, arrows and clock go at the end');
      check(await p.eval("['S','A','B','C'].includes(G.game.objective.rank) && G.game.objective.score === Math.round(G.game.objective.raw * G.Areas.TRIAL.accF(G.game.objective))"), 'the rank is given on the final score');
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
      // no gun at all: a pistol is lent, and taken back
      await p.eval("G.player.weapons.length = 0; G.weapons.setMelee(); 1");
      await enter(5);
      check(await p.eval("G.player.weapons.length === 1 && G.player.weapons[0].trialLoan && !G.player.meleeMode"), 'with no gun a pistol is lent for the round');
      await p.until('G.game.objective.countdown <= 0', 8000);
      await p.eval('G.game.objective.t = G.game.objective.dur - 0.05; 1');
      await p.until('G.game.areaCleared', 5000); await sleep(300);
      check(await p.eval("G.player.weapons.length === 0"), 'and taken back at the end');
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.weapons.push(G.weapons.make('starter')); G.weapons.switchTo(0); 1");
    }
    // ---- simulated rounds
    const PROF = { novice: { react: 0.5, turn: 2.2, settle: 0.35, acc: 0.5, center: 0.1 }, average: { react: 0.38, turn: 3.4, settle: 0.24, acc: 0.65, center: 0.2 }, good: { react: 0.3, turn: 5, settle: 0.15, acc: 0.78, center: 0.32 }, expert: { react: 0.22, turn: 7.5, settle: 0.08, acc: 0.88, center: 0.45 } };
    const GUNS = (process.env.GUNS || 'starter,n_longbow').split(',');
    const table = {};
    for (const gun of GUNS) for (const [name, prof] of Object.entries(PROF)) {
      await p.eval(`(() => { const P = G.player; P.weapons.length = 0; const w = G.weapons.make('${gun}'); w.mag = G.weapons.stats(w).mag; P.weapons.push(w); P.wIdx = 0; G.weapons.switchTo(0); G.game.objective = null; return 1; })()`);
      await enter(6);
      await p.eval(`window.__bot = Object.assign({ cur: null, cd: 0 }, ${JSON.stringify(prof)}); 1`);
      const ok = await p.until("(G.game.state !== 'playing' && !G.game.areaCleared ? (G.ui.clearScreen(), G.game.state = 'playing') : 0, G.game.areaCleared)", 150000).then(() => true).catch(() => false);
      if (!ok) { console.log('      stalled:', await p.eval("JSON.stringify({ st: G.game.state, stage: G.game.stage, t: G.game.objective && G.game.objective.t, cd: G.game.objective && G.game.objective.countdown, tr: G.game.transitioning, scr: document.querySelector('#screens') && document.querySelector('#screens').textContent.slice(0, 120) })")); continue; }
      const r = JSON.parse(await p.eval("JSON.stringify({ s: G.game.objective.score, r: G.game.objective.rank, hits: G.game.objective.hits, esc: G.game.objective.misses, best: G.game.objective.best })"));
      await p.eval("window.__bot = null; 1"); await sleep(1500); await p.eval("G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; 1");
      (table[gun] = table[gun] || {})[name] = r;
      console.log(`      ${gun.padEnd(10)} ${name.padEnd(8)} ${String(r.s).padStart(6)} ${r.r}  hits ${r.hits} escaped ${r.esc} best combo ${r.best}`);
    }
    const order = ['C', 'B', 'A', 'S'], rk = (x) => order.indexOf(x);
    const facs = JSON.parse(await p.eval(`JSON.stringify(Object.fromEntries(${JSON.stringify(GUNS)}.map((id) => [id, G.Areas.TRIAL.factor(G.weapons.make(id))])))`));
    const G0 = { factor: (g) => facs[g] };
    // (a slow gun is held to its own fire rate whatever the skill, so it is only shown; the quick guns are checked)
    for (const gun of GUNS.filter((g) => G0.factor(g) < 1.5)) {
      const t = table[gun];
      check(t.novice.s < t.average.s && t.average.s < t.expert.s && rk(t.novice.r) <= 1 && rk(t.expert.r) >= 2, `${gun}: the score climbs with skill, a beginner gets C-B, an expert A-S (${['novice', 'average', 'good', 'expert'].map((k) => t[k].r).join(' ')})`);
    }
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nTRIAL TEST FAILED (${fails.length})` : '\nTRIAL TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
