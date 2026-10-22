'use strict';
// The last guardian: the Crimson Sovereign (extra difficulty, area 18), on its own field (fieldgen.js F.finalArena).
// It floats over an arena of 7x7 stone tiles and tears them away - patterns of missing floor over a bottomless dark - while it fights.
// Whoever falls takes a heavy hit and is put back on the entrance ledge (player.js fellInPit).
(function () {
  const BS = G.bosses, U = G.U;
  const { mat, mesh, joint } = BS.h;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const PG = () => G.Props.PG;
  const tex = () => G.Tex.tex;
  const glowM = (c, k) => mat('#000', { emissive: c, emissiveIntensity: k || 2.2 });
  const M = (c, o) => mat(c, o);
  const N = 7;

  // ================================================================ terrain: tiles that can be torn away and given back
  const TR = (BS.terrain = {});
  TR.tiles = () => (G.world && G.world.tiles) || [];
  TR.at = (x, z) => TR.tiles().find((t) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1) || null;
  TR.playerTile = () => { const P = G.player; return TR.at(P.pos.x, P.pos.z); };
  TR.collapse = function (list, warn) {
    let n = 0;
    for (const t of list) if (t.state === 'up') { t.state = 'warn'; t.warn = t.timer = warn + Math.random() * 0.25; t.rot = Math.random() < 0.5 ? 1 : -1; n++; }
    if (n) { G.sfx.rumble && G.sfx.rumble(1.2, 0.9); }
    return n;
  };
  TR.restore = function (list, delay) {
    for (const t of list) if (t.state === 'down' || t.state === 'fall') { t.state = 'wait'; t.timer = (delay || 0) + Math.random() * 0.9; }
  };
  TR.restoreAll = function (instant) {
    for (const t of TR.tiles()) {
      if (instant) { t.state = 'up'; t.dy = 0; t.mesh.visible = true; t.mesh.position.y = -0.5; t.mesh.rotation.set(0, 0, 0); t.mesh.material.emissive.setRGB(0, 0, 0); if (t.col) t.col.alive = true; }
      else if (t.state === 'down' || t.state === 'fall') { t.state = 'wait'; t.timer = Math.random() * 0.8; }
    }
  };
  TR.update = function (dt) {
    const w = G.world, gt = G.game.time;
    for (const t of TR.tiles()) {
      const m = t.mesh;
      if (t.state === 'warn') {
        t.timer -= dt; const k = 1 - t.timer / t.warn, pulse = 0.55 + 0.45 * Math.sin(gt * 18);
        m.material.emissive.setRGB((0.3 + 0.7 * k) * pulse, 0.03, (0.1 + 0.3 * k) * pulse);
        m.position.y = -0.5 + Math.sin(gt * 45 + t.i * 2) * 0.03 * k;
        if (Math.random() < dt * 8) G.fx.dust(V(t.x0 + Math.random() * (t.x1 - t.x0), 0.2, t.z0 + Math.random() * (t.z1 - t.z0)), V(0, 1, 0), 0x8a3a5a, 2);
        if (t.timer <= 0) { t.state = 'fall'; t.vy = 0.5; w.removeCollider(t.col); m.material.emissive.setRGB(0.5, 0.05, 0.15); G.sfx.stoneGrind && Math.random() < 0.5 && G.sfx.stoneGrind(V(t.cx, 0, t.cz), 0.5); }
      } else if (t.state === 'fall') {
        t.vy += 30 * dt; t.dy -= t.vy * dt; m.position.y = -0.5 + t.dy; m.rotation.x += dt * 0.9 * t.rot; m.rotation.z += dt * 0.5 * t.rot;
        if (t.dy < -28) { t.state = 'down'; m.visible = false; }
      } else if (t.state === 'wait') {
        t.timer -= dt;
        if (t.timer <= 0) { t.state = 'rise'; t.dy = -11; m.visible = true; m.rotation.set(0, 0, 0); m.material.emissive.setRGB(0.25, 0.08, 0.2); m.position.y = -0.5 + t.dy; }
      } else if (t.state === 'rise') {
        t.dy += 10 * dt; m.position.y = -0.5 + Math.min(0, t.dy);
        if (t.dy >= 0) { t.dy = 0; t.state = 'up'; m.position.y = -0.5; m.material.emissive.setRGB(0, 0, 0); if (t.col) t.col.alive = true; G.fx.dust(V(t.cx, 0.1, t.cz), V(0, 1, 0), 0x8a3a5a, 6); }
      }
    }
  };
  const ups = () => TR.tiles().filter((t) => t.state === 'up');
  // the patterns: each returns the tiles to tear away; `hold` is how long they stay gone
  const C3 = (N - 1) / 2;
  const PAT = {
    scatter: (k) => ({ list: U.shuffle(ups().slice()).slice(0, k), hold: 5.5 }),
    rings: (r) => ({ list: ups().filter((t) => Math.max(Math.abs(t.i - C3), Math.abs(t.j - C3)) === r), hold: 6.5 }),
    half: () => {
      const pt = TR.playerTile() || { i: 1, j: 3 }, axisX = Math.random() < 0.5;
      const side = (axisX ? pt.i : pt.j) <= C3 ? -1 : 1; // the half you are standing on
      return { list: ups().filter((t) => { const v = (axisX ? t.i : t.j) - C3; return v !== 0 && Math.sign(v) === side; }), hold: 6.5 };
    },
    checker: () => { const pt = TR.playerTile(), par = pt ? (pt.i + pt.j) % 2 : Math.round(Math.random()); return { list: ups().filter((t) => (t.i + t.j) % 2 === par), hold: 5.5 }; },
    cross: () => ({ list: ups().filter((t) => t.i !== C3 && t.j !== C3), hold: 8 }),
    center: () => ({ list: ups().filter((t) => Math.abs(t.i - C3) <= 1 && Math.abs(t.j - C3) <= 1), hold: 6.5 }),
  };
  const PHASE_PAT = [
    [['scatter', 6]],
    [['scatter', 9], ['half'], ['rings', 3]],
    [['checker'], ['cross'], ['center'], ['half'], ['rings', 3]],
    [['cross'], ['checker'], ['center'], ['rings', 2]],
  ];
  TR.run = function (b, name, arg) {
    const p = PAT[name](arg); if (!p.list.length) return 0;
    const warn = [2.1, 1.9, 1.6, 1.4][Math.min(3, b.phase - 1)];
    const n = TR.collapse(p.list, warn);
    if (n) { G.ui.toastSmall('⚠ 足元が赤く光る — 床が崩れる！'); b._restoreQ = (b._restoreQ || []).concat([{ list: p.list, t: warn + 0.6 + p.hold }]); }
    return n;
  };
  // phase changes tear a big piece away at once
  TR.event = function (b, name, arg) { TR.run(b, name, arg); b.tNext = 9; };
  TR.tick = function (b, dt) {
    const w = G.world; if (!w || !w.final || !w.tiles) return;
    TR.update(dt);
    if (b._restoreQ) { for (const q of b._restoreQ) { q.t -= dt; if (q.t <= 0) { TR.restore(q.list, 0); q.done = true; } } b._restoreQ = b._restoreQ.filter((q) => !q.done); }
    if (b.dead) return;
    b.tNext = (b.tNext ?? 8) - dt;
    if (b.tNext <= 0) {
      const set = PHASE_PAT[Math.min(3, b.phase - 1)], pick = set[Math.floor(Math.random() * set.length)];
      TR.run(b, pick[0], pick[1]);
      if (b.phase >= 3 && Math.random() < 0.35) setTimeout(() => { if (!b.dead) TR.run(b, 'rings', 3); }, 1300);
      b.tNext = [13, 11, 9.5, 8][Math.min(3, b.phase - 1)] + Math.random() * 3;
    }
  };

  // ================================================================ the guardian
  const SP = BS.SPECS;
  const PINK = 0xff4a9a;
  SP.sovereign = {
    hp: 16000, rig: 'human', speed: 3.0, radius: 2.0, range: 13, stride: 2.5, pitch: 0.3, cd: 1.0, blood: 0x6a0a3a, turn: 3.2,
    look: () => ({ s: 2.2, float: true, crown: true, cape: true, cloth: true, weapon: 'sword', eyes: PINK, m: { body: M('#2a0a24', { map: tex().metal.map, metalness: 0.7, roughness: 0.45 }), armor: M('#4a0f3a', { map: tex().metal.map, normalMap: tex().metal.normalMap, metalness: 0.75, roughness: 0.4 }), cloth: M('#8a1048', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.9 }), gold: glowM(0xff7ab8, 1.4), skin: M('#c08aa8'), blade: glowM(0xff5aa8, 1.6) } }),
    // great wings of blades, a burning halo behind, shards circling
    deco: (b, J) => {
      const s = 2.2, bl = mat('#1a0616', { metalness: 0.9, roughness: 0.3, emissive: 0x3a0a2a, emissiveIntensity: 0.6 });
      for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) mesh(J.torso, PG().box, bl, 0.1 * s, (3.4 - i * 0.35) * s, 0.5 * s, sx * (1.1 + i * 0.55) * s, (2.4 - i * 0.12) * s, -0.9 * s, 0, 0, -sx * (0.55 + i * 0.24));
      b._halo = mesh(J.torso, PG().torus, glowM(PINK, 2.0), 2.6 * s, 2.6 * s, 0.4 * s, 0, 2.0 * s, -1.1 * s);
      b._shards = [0, 1, 2, 3, 4, 5].map((i) => { const o = joint(J.torso, 0, 0.6 * s, 0); mesh(o, PG().cone, glowM(0xff7ab8, 2.4), 0.18 * s, 0.7 * s, 0.18 * s, 3.0 * s, 0, 0, 0, 0, Math.PI / 2); o.rotation.y = i * Math.PI / 3; return o; });
    },
    init: (b) => { b.tNext = 8; },
    tick: (b, dt) => {
      if (b._shards) b._shards.forEach((o, i) => { o.rotation.y += dt * (0.9 + b.phase * 0.3); o.position.y = 1.4 + Math.sin(b.t * 2 + i) * 0.4; });
      if (b._halo) b._halo.rotation.z += dt * 0.5;
      if (Math.random() < dt * 10) { const p = b.pos.clone(); G.fx.flameLick(p.x + U.rand(-1.8, 1.8), 6.5 + U.rand(0, 2.5), p.z + U.rand(-1.8, 1.8), 1.8, PINK); }
      TR.tick(b, dt);
    },
    dispose: (b) => { TR.restoreAll(true); },
    attacks: [
      // phase 1
      { k: 'volley', pose: 'cast', wind: 0.55, n: 5, spread: 0.5, salvos: 3, gap: 0.4, proj: 'darkorb', speed: 22, dmg: 18, w: 3 },
      { k: 'chase', pose: 'cast', n: 5, r: 3.2, dmg: 28, col: PINK, w: 2 },
      { k: 'meteors', pose: 'cast', n: 8, r: 3.4, dmg: 28, col: PINK, w: 2 },
      { k: 'lines', pose: 'slam', mode: 'cross', n: 4, len: 44, wid: 3.4, dmg: 34, col: PINK, w: 1.6 },
      { k: 'rings', pose: 'slam', n: 3, gap: 0.8, speed: 15, dmg: 32, col: PINK, w: 1.5 },
      { k: 'trail', pose: 'cast', dur: 3.2, delay: 1.1, r: 2.6, dmg: 24, col: PINK, w: 1.2 },
      // phase 2
      { k: 'spiral', pose: 'cast', arms: 4, dur: 3.6, proj: 'darkorb', dmg: 14, speed: 12, rot: 1.5, w: 1.6, phase: 2 },
      { k: 'storm', pose: 'cast', n: 10, r: 2.7, dmg: 26, w: 1.5, phase: 2 },
      { k: 'mblink', hits: 3, dmg: 28, r: 5.2, col: PINK, tele: 0.45, w: 1.4, phase: 2, heavy: true },
      { k: 'gravity', pose: 'cast', r: 8.5, dmg: 38, col: PINK, w: 1.2, phase: 2, heavy: true },
      { k: 'summon', pose: 'cast', wind: 0.9, n: 3, ids: ['wraith_normal', 'wraith_shadow'], minions: true, cap: 3, w: 0.9, phase: 2, msg: '🌑 君主が虚ろの亡霊を呼んだ' },
      // phase 3
      { k: 'beam', pose: 'cast', wind: 1.0, arms: 3, dur: 3.4, dmg: 10, col: 0xff2a7a, h: 1.2, low: true, rot: 0.8, w: 1.6, phase: 3, heavy: true },
      { k: 'lines', pose: 'slam', mode: 'around', n: 8, len: 44, wid: 3, dmg: 34, col: PINK, w: 1.5, phase: 3, heavy: true },
      { k: 'nova', pose: 'cast', wind: 0.8, n: 24, waves: 3, proj: 'darkorb', speed: 12, dmg: 15, w: 1.3, phase: 3, col: PINK },
      // phase 4
      { k: 'leapx', pose: 'cast', hops: 4, dmg: 34, r: 5.4, height: 9, w: 1.6, phase: 4, heavy: true, col: PINK },
      { k: 'rings', pose: 'slam', n: 5, gap: 0.6, speed: 17, dmg: 36, col: PINK, w: 2, phase: 4, heavy: true },
      { k: 'meteors', pose: 'cast', n: 12, r: 3.4, dmg: 30, stagger: 0.16, col: PINK, w: 2, phase: 4, heavy: true },
    ],
    phases: [
      { at: 0.75, speed: 1.1, msg: '🌑 紅い月が満ちる — 床が崩れ始めた', fn: (b) => TR.event(b, 'rings', 3) },
      { at: 0.5, speed: 1.2, msg: '🌑 君主が翼を広げた — 足場が痩せていく', fn: (b) => TR.event(b, 'cross') },
      { at: 0.25, speed: 1.35, msg: '🌑 終焉の紅月 — 奈落が口を開く', fn: (b) => TR.event(b, 'center') },
    ],
    phaseText: (b) => `🌑 足元が赤く光ったら床が崩れる — 落ちると大ダメージ（入口へ戻される）${b.phase > 1 ? `　|　第${b.phase}幕` : ''}`,
  };

  // ---------------- registration ----------------
  G.BOSSES.push({ id: 'sovereign', name: '虚無の君主', title: 'CRIMSON SOVEREIGN', icon: '🌑', desc: '深淵の最奥、紅い月の下に浮かぶ闘技場の主。床の石畳を剥がし、奈落を口を開けさせながら戦う。足元が赤く光ったら、床が崩れる合図。', mech: ['エクストラのエリア18に必ず現れる', '床が定期的に崩れて奈落になる（赤く光ってから約2秒）', '落ちると最大HPの約40%のダメージを受け、入口の足場へ戻される', 'HPが減るほど、崩れ方が大きく速くなる'], field: true, ending: true });
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
  SP.sovereign._v5 = true;
  BS.CLS.sovereign = BS.CLS.houndlord;
})();
