'use strict';
// Guardians (v5, part 3): five new guardians built on the data-driven framework (bosses4.js) and the pattern library (bosses5.js).
//  dungeon / ruin: 鉄塊の看守 (warden), 雷霆の審判者 (arbiter), 迷宮の牛頭王 (minotaur)    ruin only: 蒼炎の司祭 (cinder priest), 蒼炎の骸竜 (ash drake)
(function () {
  const BS = G.bosses, U = G.U;
  const { mat, mesh, joint } = BS.h;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const PG = () => G.Props.PG;
  const tex = () => G.Tex.tex;
  const glowM = (c, k) => mat('#000', { emissive: c, emissiveIntensity: k || 2.2 });
  const M = (c, o) => mat(c, o);
  const SP = BS.SPECS;

  SP.warden = {
    hp: 5400, rig: 'human', speed: 3.4, radius: 1.9, range: 5.5, stride: 4, pitch: 0.5, cd: 1.3, blood: 0x3a0a08,
    look: () => ({ s: 1.85, helm: true, shield: true, cape: true, weapon: 'none', eyes: 0xff8a30, m: { body: M('#6a6660', { map: tex().metal.map, metalness: 0.6, roughness: 0.6 }), armor: M('#8a867e', { map: tex().metal.map, normalMap: tex().metal.normalMap, metalness: 0.6, roughness: 0.5 }), cloth: M('#6a2a1c', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 1 }), skin: M('#7a6e64', { map: tex().metal.map, metalness: 0.5 }) } }),
    // a chain with a spiked ball hanging from the right hand
    deco: (b, J) => {
      const s = 1.85, hand = J.arms[1].hand, iron = mat('#6a6a70', { metalness: 0.9, roughness: 0.4, map: tex().metal.map });
      for (let i = 0; i < 6; i++) mesh(hand, PG().torus, iron, 0.14 * s, 0.14 * s, 0.14 * s, 0, -(0.25 + i * 0.3) * s, 0.15 * s, i % 2 ? Math.PI / 2 : 0, 0, 0);
      const ball = joint(hand, 0, -2.2 * s, 0.2 * s);
      mesh(ball, PG().sph, iron, 0.62 * s, 0.62 * s, 0.62 * s);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(ball, PG().cone, iron, 0.14 * s, 0.5 * s, 0.14 * s, Math.cos(a) * 0.55 * s, Math.sin(a * 2) * 0.3 * s, Math.sin(a) * 0.55 * s, Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); }
    },
    attacks: [
      { k: 'swipe', pose: 'swing', wind: 0.75, r: 7.5, arc: -0.1, dmg: 34, knock: 12, max: 9, w: 3, combo: 2 },
      { k: 'slam', pose: 'slam', wind: 0.95, r: 6.5, dmg: 38, jumpable: true, shards: 8, shardKind: 'boulder', w: 2, max: 12 },
      { k: 'charge', wind: 0.8, speed: 19, dur: 1.1, dmg: 34, knock: 16, min: 9, w: 1.6, stunWall: 3 },
      { id: 'hook', k: 'pull', pose: 'throw', wind: 0.6, dmg: 12, then: 'hookslam', min: 8, max: 24, w: 1.4 },
      { id: 'hookslam', k: 'slam', pose: 'slam', wind: 0.55, r: 5.5, dmg: 40, jumpable: true, w: 0, max: 0 },
      { k: 'beam', pose: 'swing', arms: 1, dur: 3.0, len: 11, wid: 1.6, dmg: 13, rot: 2.3, low: true, col: 0xc8c8d0, h: 0.9, wind: 0.8, w: 1.5, heavy: true },
      { k: 'rings', pose: 'slam', n: 3, gap: 0.75, speed: 14, dmg: 34, col: 0xffa040, w: 1.3, phase: 2, heavy: true },
      { k: 'lines', pose: 'slam', mode: 'cross', n: 4, len: 40, wid: 3.2, dmg: 34, col: 0xffa040, w: 1.2, phase: 2, heavy: true },
      { k: 'shockline', pose: 'swing', n: 3, spread: 0.45, wid: 4.5, dmg: 30, col: 0xc8c8d0, w: 1.3 },
    ],
    phases: [{ at: 0.6, speed: 1.25, msg: '⛓️ 看守の鎧が砕け散った（被ダメ増加・攻撃が激化）' }],
    phaseText: (b) => (b.phase > 1 ? '⛓️ 鎧が砕けた — 今が好機　|　鎖の旋回はジャンプで' : '🛡 鎧が硬い（ダメージ×0.65）　|　HP60%で鎧が砕ける'),
    dmgMul: (b) => (b.phase > 1 ? 1.25 : 0.65),
  };

  SP.arbiter = {
    hp: 5000, rig: 'human', speed: 3.2, radius: 1.3, range: 15, keepAway: true, stride: 3, pitch: 1.0, cd: 1.1, blood: 0x4a4a10,
    look: () => ({ s: 1.5, float: true, hood: true, cloth: true, cape: true, weapon: 'staff', orb: 0xffe060, eyes: 0xfff0a0, m: { body: M('#2a2a30', { map: tex().cloth.map, roughness: 0.9 }), cloth: M('#d8d0b0', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.95 }), skin: M('#c8c0a8') } }),
    // a halo of light over the head and three sparks circling the torso
    deco: (b, J) => {
      const s = 1.5, halo = mesh(J.head, PG().torus, glowM(0xffe060, 2.2), 1.1 * s, 1.1 * s, 1.1 * s, 0, 1.1 * s, -0.1 * s, Math.PI / 2, 0, 0);
      b._orbs = [0, 1, 2].map((i) => { const o = joint(J.torso, 0, 1.0 * s, 0); mesh(o, PG().sph, glowM(0xfff0a0, 3), 0.2 * s, 0.2 * s, 0.2 * s, 2.0 * s, 0, 0); o.rotation.y = i * Math.PI * 2 / 3; return o; });
      b._halo = halo;
    },
    tick: (b, dt) => { if (b._orbs) b._orbs.forEach((o, i) => { o.rotation.y += dt * (1.4 + b.phase * 0.4); o.position.y = 1.2 + Math.sin(b.t * 2 + i) * 0.25; }); if (b._halo) b._halo.rotation.z += dt * 0.8; if (Math.random() < dt * 4) G.fx.sparks(b.pos.clone().setY(3.4), null, 1, 0xfff0a0, 3); },
    attacks: [
      { k: 'volley', pose: 'cast', wind: 0.55, n: 5, spread: 0.5, salvos: 2, gap: 0.4, proj: 'soul', speed: 21, dmg: 15, elem: 'shock', w: 3 },
      { k: 'storm', pose: 'cast', n: 9, r: 2.6, dmg: 24, w: 2.5 },
      { k: 'beam', pose: 'cast', wind: 1.0, arms: 2, dur: 3.2, dmg: 9, col: 0xffe060, h: 1.5, w: 1.3 },
      { k: 'nova', pose: 'cast', wind: 0.8, n: 18, waves: 2, proj: 'soul', speed: 12, dmg: 14, w: 1.4, max: 11, col: 0xffe060 },
      { id: 'blink', k: 'blink', wind: 0.4, then: 'novaClose', w: 1.5, min: 0, max: 7 },
      { id: 'novaClose', k: 'nova', pose: 'cast', wind: 0.45, n: 14, proj: 'soul', speed: 14, dmg: 15, w: 0, max: 0, col: 0xffe060 },
      { k: 'trail', pose: 'cast', dur: 3.0, delay: 1.0, r: 2.6, dmg: 22, col: 0xcfe0ff, w: 1.2, phase: 2, heavy: true },
      { k: 'rings', pose: 'cast', n: 3, gap: 0.7, speed: 15, dmg: 28, col: 0xffe060, w: 1.2, phase: 2, heavy: true },
      { k: 'lines', pose: 'cast', mode: 'around', n: 6, len: 40, wid: 2.8, dmg: 30, col: 0xcfe0ff, w: 1.2, phase: 2, heavy: true },
    ],
    phases: [{ at: 0.5, speed: 1.3, msg: '⚡ 審判者が雷を呼んだ — 避雷針を壊せ！', fn: (b) => b.raiseTotems({ n: 3, hp: 260, col: 0xffe060, totem: '避雷針', msg: '⚡ 避雷針が審判者を守っている — 壊せ！' }) }],
    phaseText: (b) => (b.totems.length ? `⚡ 避雷針 残り${b.totems.length} — 全て壊すまで無敵` : '落雷は予兆の円から出る　|　光の線は遮蔽物で防げ'),
  };

  SP.minotaur = {
    hp: 5600, rig: 'human', speed: 5.0, radius: 2.0, range: 4.5, stride: 5.5, pitch: 0.55, cd: 1.2, blood: 0x5a0a08,
    look: () => ({ s: 2.1, hunch: true, horns: true, weapon: 'cleavers', eyes: 0xff3010, m: { body: M('#5a3a2c', { map: tex().skin.map, normalMap: tex().skin.normalMap, roughness: 0.9 }), skin: M('#6a4636', { map: tex().skin.map }), armor: M('#3a2a20', { map: tex().cloth.map, roughness: 1 }), horn: M('#e0d4b0') } }),
    // a bull's heavy head: a wide snout and a nose ring
    deco: (b, J) => {
      const s = 2.1;
      J.head.scale.setScalar(1.35);
      mesh(J.head, PG().box, M('#4a2c20', { map: tex().skin.map }), 0.5 * s, 0.4 * s, 0.55 * s, 0, 0.05 * s, 0.4 * s);
      mesh(J.head, PG().torus, mat('#b8a060', { metalness: 0.9, roughness: 0.3 }), 0.14 * s, 0.14 * s, 0.14 * s, 0, -0.1 * s, 0.68 * s, 0, 0, 0);
    },
    attacks: [
      { k: 'swipe', pose: 'swing', wind: 0.5, r: 6, arc: -0.05, dmg: 30, knock: 10, max: 8, w: 3, combo: 3, rec: 0.35, cry: 'roar' },
      { k: 'charge', wind: 0.65, speed: 24, dur: 1.1, dmg: 38, knock: 18, min: 8, w: 2.4, stunWall: 3.6 },
      { k: 'slam', pose: 'slam', wind: 0.9, r: 6.5, dmg: 36, jumpable: true, shards: 10, shardKind: 'boulder', w: 2, max: 12 },
      { k: 'leapx', pose: 'leap', hops: 3, dmg: 30, r: 4.6, height: 6, min: 6, w: 1.4, heavy: true, col: 0xff6030 },
      { k: 'lines', pose: 'slam', mode: 'fan', n: 5, spread: 0.4, len: 42, wid: 3.4, dmg: 34, col: 0xd08040, w: 1.3 },
      { k: 'rings', pose: 'slam', n: 3, gap: 0.8, speed: 14, dmg: 32, col: 0xd08040, w: 1.2, phase: 2, heavy: true },
      { k: 'shockline', pose: 'swing', n: 3, spread: 0.4, wid: 4.5, dmg: 28, col: 0xd08040, w: 1.2, phase: 2 },
    ],
    phases: [{ at: 0.55, speed: 1.3, msg: '🐂 牛頭王が激昂した（動きが速くなる）' }],
    phaseText: (b) => (b.state === 'stunned' ? '💫 壁に激突 — 総攻撃！' : '突進を壁や柱にぶつけると怯む　|　連続跳躍に注意'),
    dmgMul: (b) => (b.state === 'stunned' ? 1.6 : 1),
  };

  SP.cinderpriest = {
    hp: 7000, rig: 'human', speed: 3.4, radius: 1.4, range: 14, keepAway: true, stride: 3, pitch: 0.85, cd: 1.1, blood: 0x103a5a,
    look: () => ({ s: 1.6, float: true, hood: true, cloth: true, cape: true, weapon: 'staff', orb: 0x4aa0ff, eyes: 0x80c0ff, m: { body: M('#10182a', { map: tex().cloth.map, roughness: 0.95 }), cloth: M('#1a3060', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.95 }), skin: M('#8aa0c0') } }),
    // a crown of blue flames
    deco: (b, J) => { const s = 1.6; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mesh(J.head, PG().cone, glowM(0x4aa0ff, 2.6), 0.1 * s, 0.55 * s, 0.1 * s, Math.cos(a) * 0.38 * s, 0.75 * s, Math.sin(a) * 0.38 * s); } },
    tick: (b, dt) => { if (Math.random() < dt * 14) { const p = b.J.head.getWorldPosition(V()); G.fx.flameLick(p.x + U.rand(-0.3, 0.3), p.y + 0.9, p.z + U.rand(-0.3, 0.3), 1.2, 0x4a9cff); } },
    attacks: [
      { k: 'volley', pose: 'cast', wind: 0.55, n: 5, spread: 0.5, salvos: 2, gap: 0.4, proj: 'soul', speed: 20, dmg: 16, elem: 'fire', w: 3 },
      { k: 'lines', pose: 'cast', mode: 'around', n: 6, len: 40, wid: 3, dmg: 30, col: 0x4aa0ff, zone: { kind: 'fire', dur: 4, dps: 9 }, w: 2 },
      { k: 'chase', pose: 'cast', n: 5, r: 3, dmg: 26, col: 0x4aa0ff, elem: 'fire', zone: { kind: 'fire', dur: 3, dps: 8 }, w: 2 },
      { k: 'meteors', pose: 'cast', n: 8, r: 3.4, dmg: 28, col: 0x4aa0ff, elem: 'fire', w: 1.6 },
      { k: 'nova', pose: 'cast', wind: 0.8, n: 20, waves: 2, proj: 'soul', speed: 12, dmg: 15, elem: 'fire', w: 1.4, max: 10, col: 0x4aa0ff },
      { id: 'blink', k: 'blink', wind: 0.4, then: 'novaClose', w: 1.4, min: 0, max: 7 },
      { id: 'novaClose', k: 'nova', pose: 'cast', wind: 0.45, n: 14, proj: 'soul', speed: 14, dmg: 16, elem: 'fire', w: 0, max: 0, col: 0x4aa0ff },
      { k: 'summon', pose: 'cast', wind: 0.8, n: 3, ids: ['wraith_normal'], minions: true, cap: 4, w: 1.1, msg: '🔥 司祭が怨霊を蒼炎で喚んだ' },
      { k: 'trail', pose: 'cast', dur: 3.2, delay: 1.1, r: 2.6, dmg: 24, col: 0x4aa0ff, zone: { kind: 'fire', dur: 3, dps: 8 }, w: 1.3, phase: 2, heavy: true },
      { k: 'beam', pose: 'cast', wind: 1.0, arms: 3, dur: 3.2, dmg: 9, col: 0x4aa0ff, h: 1.2, low: true, rot: 0.75, w: 1.2, phase: 3, heavy: true },
    ],
    phases: [
      { at: 0.66, msg: '🔥 司祭が蒼炎の灯を灯した — 壊せ！', fn: (b) => b.raiseTotems({ n: 3, hp: 300, col: 0x4aa0ff, totem: '蒼炎の灯', msg: '🔥 蒼炎の灯が司祭を守っている — 壊せ！' }) },
      { at: 0.33, speed: 1.3, msg: '🔥 蒼炎が燃え広がった（詠唱が速くなる）' },
    ],
    phaseText: (b) => (b.totems.length ? `🔥 蒼炎の灯 残り${b.totems.length} — 全て壊すまで無敵` : '足元の円から離れ続けろ　|　近づくと瞬間移動する'),
  };

  SP.ashdrake = {
    hp: 8000, rig: 'quad', speed: 5.5, radius: 3.2, range: 7, stride: 3.5, pitch: 0.3, cd: 1.3, blood: 0x103a5a,
    look: () => ({ s: 2.8, horns: true, spikes: true, eyes: [0x60c0ff], m: { body: M('#6a665c', { map: tex().rock.map, normalMap: tex().rock.normalMap, roughness: 0.95 }), claw: M('#1a1a20'), horn: M('#d8d0b8') } }),
    // ragged bone wings
    deco: (b, J) => {
      const s = 2.8, bone = M('#c8c0a8', { roughness: 0.8 }), skin = mat('#2a2a38', { roughness: 0.9, side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        const w = joint(J.body, sx * 0.7 * s, 0.7 * s, 0.3 * s);
        mesh(w, PG().cyl8, bone, 0.1 * s, 2.6 * s, 0.1 * s, sx * 1.1 * s, 0.4 * s, 0, 0, 0, -sx * 1.2);
        for (let i = 0; i < 4; i++) mesh(w, PG().box, skin, 0.04 * s, 1.6 * s, 0.8 * s, sx * (0.6 + i * 0.5) * s, (0.2 - i * 0.1) * s, (-0.2 - i * 0.2) * s, 0, 0, -sx * (1.2 - i * 0.12));
      }
    },
    tick: (b, dt) => { if (Math.random() < dt * 10) { const p = b.J.heads[0].head.getWorldPosition(V()); G.fx.flameLick(p.x, p.y + 0.2, p.z, 0.9, 0x4a9cff); } },
    attacks: [
      { k: 'swipe', pose: 'bite', wind: 0.65, r: 8.5, arc: 0.0, dmg: 40, knock: 14, max: 9, w: 2.5, combo: 2 },
      { k: 'breath', pose: 'breath', wind: 0.7, r: 16, dur: 2.6, dmg: 12, elem: 'fire', zone: 'fire', rgb: [0.3, 0.6, 1], w: 2, max: 18 },
      { k: 'charge', wind: 0.8, speed: 24, dur: 1.3, dmg: 44, knock: 20, min: 10, w: 2, stunWall: 4 },
      { k: 'slam', pose: 'leap', wind: 0.95, r: 10, dmg: 42, jumpable: true, jump: 2, w: 2, max: 14, zone: { kind: 'fire', dps: 9, dur: 4 } },
      { k: 'lines', pose: 'breath', mode: 'fan', n: 5, spread: 0.4, len: 46, wid: 3.6, dmg: 38, col: 0x4aa0ff, zone: { kind: 'fire', dur: 4, dps: 9 }, w: 1.4 },
      { k: 'rings', pose: 'leap', n: 3, gap: 0.85, speed: 14, dmg: 40, col: 0x4aa0ff, w: 1.3, heavy: true },
      { k: 'leap', pose: 'leap', wind: 0.8, air: 0.9, r: 7, dmg: 46, min: 12, w: 1.5, height: 10, phase: 2, zone: { kind: 'fire', dps: 10, dur: 5 } },
      { k: 'meteors', pose: 'breath', n: 8, r: 3.6, dmg: 32, col: 0x4aa0ff, elem: 'fire', w: 1.3, phase: 2, heavy: true },
      { k: 'leapx', pose: 'leap', hops: 3, dmg: 34, r: 5, height: 8, min: 8, w: 1.2, phase: 2, heavy: true, col: 0x4aa0ff },
    ],
    phases: [{ at: 0.5, speed: 1.25, msg: '🔥 骸竜の背が蒼く燃え上がった（動きが速くなる）' }],
    phaseText: (b) => (b.state === 'stunned' ? '💫 壁に激突 — 頭を撃て！' : '頭が弱点　|　突進を壁にぶつけると怯む　|　蒼い息の範囲から離れろ'),
    dmgMul: (b) => (b.state === 'stunned' ? 1.6 : 0.9),
  };

  // ---------------- registration ----------------
  const DEFS = [
    ['warden', '鉄塊の看守', 'IRON WARDEN', '⛓️', '地下牢の最深部で鍵を守り続けた鉄の巨人。鎖つきの鉄球で薙ぎ払い、鎖で獲物を引きずり寄せる。鎧が砕けるまでは、ほとんど刃を通さない。', ['鎧が硬い（ダメージ×0.65）— HP60%で砕ける', '鎖の旋回はジャンプでかわせる', '鎖に捕まると叩きつけが来る']],
    ['arbiter', '雷霆の審判者', 'ARBITER OF STORMS', '⚡', '裁きの雷を操る浮遊する審判者。予兆の円に落雷し、回転する光の線で逃げ場を奪う。追い詰められると避雷針で身を守る。', ['HP50%で避雷針（3つ壊すまで無敵）', '落雷は予兆の円から', '近づくと瞬間移動する']],
    ['minotaur', '迷宮の牛頭王', 'MINOS, KING OF THE LABYRINTH', '🐂', '迷宮の主。二本の斧と圧倒的な突進で獲物を追い詰める。突進を壁にぶつけて怯ませろ。三連の跳躍と、地を裂く衝撃にも注意。', ['突進を壁や柱にぶつけると怯む（×1.6）', '三連跳躍は一つずつ踏み込みを見ろ', 'HP55%で激昂']],
    ['cinderpriest', '蒼炎の司祭', 'BLUE-FLAME PRIEST', '🔥', '廃都を蒼い炎で満たす司祭。足元に灯る円と炎の筋が、逃げ場を少しずつ焼く。蒼炎の灯が健在な間は傷つかない。', ['HP66%で蒼炎の灯（全て壊すまで無敵）', '足元の予兆の円・炎の筋から離れ続けろ', 'HP33%で詠唱が速くなり、光線が加わる']],
    ['ashdrake', '蒼炎の骸竜', 'ASHEN DRAKE', '🐉', '朽ちた竜の骸が蒼炎で動き出したもの。長く吐く蒼い息、薙ぎ払う爪、そして突進。頭が弱点で、壁への激突で大きく怯む。', ['頭が弱点', '突進を壁にぶつけると怯む', 'HP50%で跳躍の連続と隕石']],
  ];
  for (const [id, name, title, icon, desc, mech] of DEFS) if (!G.BOSS_BY_ID[id]) G.BOSSES.push({ id, name, title, icon, desc, mech, field: true });
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
  const Beast = BS.CLS.houndlord;
  for (const id of ['warden', 'arbiter', 'minotaur', 'cinderpriest', 'ashdrake']) {
    const S = SP[id];
    S._v5 = true;
    S.cd = (S.cd || 1.6) * 0.9;
    BS.CLS[id] = Beast;
  }
})();
