'use strict';
// Hands-on tutorial: played in a real first area with no waves. Each step explains one thing and waits until you have done it
// (or press Enter on explanation pages). Backspace skips a step. At the end a fresh run starts.
(function () {
  const T = (G.Tutorial = { active: false });
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, GM, el, st = null, idx = 0;
  const k = (s) => `<kbd>${s}</kbd>`;

  // ---------------------------------------------------------------- steps
  // check(s, dt) returns progress 0..1 (or true when done). setup(s) runs when the step starts.
  // body(): a few short lines (ul = one action per line); tip(): one small extra line under it
  const ul = (...a) => `<ul>${a.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const WASD = () => ['forward', 'left', 'back', 'right'].map((b) => k(G.K(b))).join('');
  const CROUCH = () => G.BIND.crouch.map(G.input.codeName).filter((v, i, a) => a.indexOf(v) === i).map(k).join(' / ');
  const invOpen = () => (G.ui.statusOpen && G.ui.statusOpen()) || (G.InvUI && G.InvUI.isOpen());
  // a chest right in front of you (on the floor, facing you)
  const putChest = (tier) => { const f = P.forward().setY(0).normalize(); const p = P.pos.clone().addScaledVector(f, 3); const w = G.world; if (!(w.boxFree(p.x - 0.7, p.y + 0.05, p.z - 0.7, p.x + 0.7, p.y + 1, p.z + 0.7))) p.copy(P.pos).add(V(0, 0, -2)); const y = w.floorBelow(p.x, P.pos.y + 1, p.z); const c = G.Props.chest(w, p.x, p.z, y > -50 ? y : P.pos.y, Math.atan2(-f.x, -f.z), tier); w.flushDeferred(); G.fx.ring(p.clone().setY(P.pos.y + 0.1), 1.5, 0xffd070, 0.6); return c; };
  const STEPS = [
    { title: 'ようこそ、深淵へ', info: true, body: () => ul('実際に操作しながら、基本を一つずつ覚えます。', 'ここでは<b>倒されません</b>（HPが減ると自動で回復）。', `${k('Enter')} 次へ　${k('Backspace')} 飛ばす　${k('Esc')} ポーズ（チュートリアルの終了もここから）`) },
    { title: '見回す・歩く', body: () => ul(`${k('マウス')} で見回す`, `${WASD()} で歩く`), tip: () => 'マウスが効かない時は、画面を一度クリック。', goal: '15m 歩く',
      check: (s) => Math.min(1, s.dist / 15) },
    { title: '走る', body: () => G.save.data.settings.autoSprint ? ul('普段は<b>自動で走って</b>います。', `${k(G.K('sprint'))} を押している間だけ<b>歩き</b>（足音が小さく、狙いが安定）`) : ul(`${k(G.K('sprint'))} で走る`, '止まる・撃つ・覗く・しゃがむまで走り続けます'), tip: () => '「常に走る」は設定で切り替えられます。', goal: () => G.save.data.settings.autoSprint ? `${G.K('sprint')} を押しながら2秒歩く` : `${G.K('sprint')} で2秒走る`,
      check: (s, dt) => { const moving = ['forward', 'back', 'left', 'right'].some((b) => I.down(b)); const ok = G.save.data.settings.autoSprint ? I.down('sprint') && moving : P.sprinting; if (ok) s.t = (s.t || 0) + dt; return Math.min(1, (s.t || 0) / 2); } },
    { title: 'ジャンプ・よじ登り', body: () => ul(`${k(G.K('jump'))} でジャンプ`, `段差や木箱の前で ${k(G.K('jump'))} を<b>押し続ける</b>と、よじ登る`), goal: '3回ジャンプする',
      check: (s) => Math.min(1, s.jumps / 3) },
    { title: 'しゃがみ・スライディング', body: () => ul(`${CROUCH()} でしゃがむ（低い攻撃をくぐれる）`, `<b>走りながら</b> ${k(G.input.keyName('crouch'))} でスライディング`), goal: 'スライディングする',
      check: () => (P.sliding ? 1 : 0) },
    { title: '撃つ・リロード', body: () => ul(`${k('左クリック')} 撃つ　${k('右クリック')} 押している間は覗き込み（精度が上がる）`, `${k(G.K('reload'))} リロード（空になると自動でも）`, '頭を狙うとヘッドショット（大ダメージ）'), tip: () => '残りの弾は画面右下。', goal: () => `5発撃つ ＋ 覗き込む ＋ ${G.K('reload')} でリロード`,
      setup: (s) => { s.mag = P.weapon ? P.weapon.mag : 0; },
      check: (s) => { const w = P.weapon; if (w && !P.meleeMode) { if (w.mag < s.mag) s.shots = (s.shots || 0) + (s.mag - w.mag); s.mag = w.mag; if (w.reloading) s.rl = true; } if (G.weapons.adsT > 0.9) s.ads = true; return Math.min(1, (s.shots || 0) / 5) * 0.6 + (s.ads ? 0.2 : 0) + (s.rl ? 0.2 : 0); } },
    { title: '近接武器', body: () => ul(`${k(G.K('w1'))}${k(G.K('w2'))} 銃　${k(G.K('w3'))} 近接武器（${k('ホイール')} でも切替）`, `近接武器は ${k('左クリック')} 連撃、${k('右クリック')} 重撃（遅いが強い）`, '持っている間は、移動が速い'), get goal() { return `${G.K('w3')} に持ち替え、連撃と重撃を1回ずつ`; },
      check: (s) => { const ms = G.weapons.ms; if (P.meleeMode) { s.m = true; if (ms && ms.ph === 'light') s.l = true; if (ms && (ms.ph === 'hwind' || ms.ph === 'heavy')) s.h = true; } return (s.m ? 0.34 : 0) + (s.l ? 0.33 : 0) + (s.h ? 0.33 : 0); } },
    { title: '戦闘', body: () => ul('敵が現れました。倒してみましょう。', '敵の頭上に Lv と HP。<b>青いバー</b>はシールド（爆発・電撃に弱い）', '<b>赤い円</b>などは、攻撃の予兆'), goal: () => `敵を倒す ${st ? st.kills || 0 : 0}/${st && st.spawned ? st.spawned.length || 1 : 3}`,
      setup: (s) => { s.spawned = []; P.weapon && (P.weapon.mag = G.weapons.stats(P.weapon).mag); for (let i = 0; i < 3; i++) { const e = GM.spawnEnemy({ near: true, noMut: true }); if (e) { e.noReward = false; s.spawned.push(e); } } G.ui.toast('⚔️ 敵が現れた！', 'warn'); },
      check: (s) => { const n = s.spawned.length; s.kills = s.spawned.filter((e) => !e.alive).length; return n ? s.kills / n : 1; } },
    { title: '漁る（亡骸・宝箱）', body: () => ul(`倒した敵の<b>亡骸</b>や<b>宝箱</b>の前で ${k(G.K('interact'))}：一度押すと探り始める（終わるまで目を離さない）`, '開くと中身の画面：<b>「すべて取る」</b>で一度に回収（ドラッグで1つずつも可）', '取り終えた亡骸・空の宝箱は、暗くなる'), tip: () => '目の前に宝箱も出しました。', goal: () => `亡骸から「すべて取る」${st && st.c1 ? '✅' : ''} ＋ 宝箱を開ける${st && st.c2 ? '✅' : ''}`,
      setup: (s) => {
        // the fight leaves bodies; if none is left to search (it fell somewhere), one more foe drops right here
        if (!G.Inv.corpses.some((c) => !c.searched && c.cont.items.length)) { const e = GM.spawnEnemy({ near: true, noMut: true }); if (e) { e.noReward = false; e.hp = 0; G.combat.killEnemy(e, { src: 'bullet' }, 0); } }
        s.chest = putChest(0);
      },
      check: (s) => { if (G.Inv.corpses.some((c) => c.searched && !c.cont.items.length)) s.c1 = true; if (s.chest && s.chest.opened) s.c2 = true; return (s.c1 ? 0.5 : 0) + (s.c2 ? 0.5 : 0); } },
    { title: 'パイルドライバー', body: () => ul(`<b>空中で</b> ${k(G.input.keyName('crouch'))}：真下へ急降下して、周りの敵を叩く`, '高い所から使うほど強い'), tip: () => '地面から少し高さが必要です。ジャンプの頂点で。', get goal() { return `ジャンプして、空中で ${G.K('crouch')}`; },
      check: () => (P.pileState ? 1 : 0) },
    { title: 'グラップル', body: () => ul(`${k(G.K('grapple'))} を押し続ける：壁や天井にロープを掛けて巻き取る`, `離すと解除。ぶら下がり中に ${k(G.K('jump'))} で大きく跳ぶ`), get goal() { return `${G.K('grapple')} でロープを掛ける`; },
      check: () => (P.grapple && P.grapple.state === 'attached' ? 1 : 0) },
    { title: '消耗品', body: () => ul(`${k(G.K('item1'))} ${k(G.K('item2'))}：消耗品の枠（短く押して使う）`, '同じ枠に何種類かある時は、<b>長押し</b>で選ぶ'), tip: () => '回復アイテムを2種類渡しました。所持数は画面下中央。', get goal() { return `${G.K('item1')} で回復アイテムを使う`; },
      setup: () => { P.hp = Math.min(P.hp, P.stats.maxHp * 0.6); if (!P.itemCount('h_bandage')) P.addItem('h_bandage', 2); if (!P.itemCount('h_medkit')) P.addItem('h_medkit', 1); G.ui.refreshItems(); },
      check: () => (G.ItemAnim.busy() ? 1 : 0) },
    { title: '投擲物', body: () => ul(`${k(G.K('grenade'))} で構える`, `${k('左クリック')} 投げる　${k('右クリック')} 転がす（押している間は軌道が出る）`, `種類の切替は ${k(G.K('grenade'))} 長押し、または ${k(G.K('cycleGrenade'))}`), goal: () => `投擲物を投げる ${Math.min(2, st ? st.thrown || 0 : 0)}/2`,
      setup: () => { const top = (id, n) => { const h = P.itemCount(id); if (h < n) P.addItem(id, n - h); }; top('g_frag', 2); top('g_fire', 1); G.ui.refreshItems(); },
      check: (s) => Math.min(1, (s.thrown || 0) / 2) },
    { title: 'スキル・アルティメット', body: () => ul(`${k(G.input.skillKey(1))}${k(G.input.skillKey(2))}${k(G.input.skillKey(3))}：スキル（商人やイベントで手に入る）。練習用に「ダッシュ」を入れました`, `${k(G.input.skillKey(0))}：アルティメット（画面下の金色の枠）。とても強力、再使用まで約2分`), tip: () => '最初のアルティメットは「不屈の城塞」（10秒間、被ダメージ大幅減・回復・シールド）。', get goal() { return `${G.input.skillKey(1)} でスキル ＋ ${G.input.skillKey(0)} でアルティメットを使う`; },
      setup: (s) => { P.skills[1] = G.abilities.makeSlot('dash'); G.ui.buildAbilityRow && G.ui.buildAbilityRow(); s.ch = P.skills[1].charges; const u = P.skills[0]; if (u) u.cd = 0; },
      check: (s) => { const sk = P.skills[1], u = P.skills[0]; if (sk && (sk.cd > 0 || sk.charges < s.ch)) s.a = true; if (u && u.cd > 0) s.b = true; return (s.a ? 0.5 : 0) + (s.b ? 0.5 : 0); } },
    { title: '持ち物画面', body: () => ul(`${k(G.K('status'))} 開く／閉じる（${k('Esc')} でも閉じる）`, `<b>ドラッグ</b>で移動　${k('R')} 回転`, `${k('右クリック')} メニュー　${k('ダブルクリック')} 使う／装備`, '枠の外へドラッグで捨てる　<b>⇅ 整理</b>で並べ替え'), tip: () => '銃・スキルも枠どうしのドラッグで入れ替え。開いている間もゲームは進む。', get goal() { return `${G.K('status')} で開き、アイテムを1つ動かす（整理でも可）`; },
      setup: (s) => { if (!P.bag.items.length && G.VALUABLES && G.VALUABLES[0]) G.Inv.give(P, 'valuable', G.VALUABLES[0].id, 1); s.acts = G.Inv.acts || 0; },
      check: (s) => { if (invOpen()) s.o = true; if (s.o && (G.Inv.acts || 0) > s.acts) s.m = true; return (s.o ? 0.4 : 0) + (s.m ? 0.6 : 0); } },
    { title: 'アタッチメント', body: () => ul('インベントリに<b>レッドドットサイト</b>を入れました', `${k(G.K('status'))} で開き、銃の枠へ<b>ドラッグ</b>（付く場所が光る）`, 'ダブルクリックでも自動で付く'), goal: 'レッドドットを銃に付ける',
      setup: () => { if (!P.weapons.some((w) => w.atts.optic === 'o_reddot') && !P.attStash.includes('o_reddot')) { G.Inv.noAuto = true; P.attStash.push('o_reddot'); G.Inv.noAuto = false; } },
      check: () => (P.weapons.some((w) => w.atts.optic === 'o_reddot') ? 1 : 0) },
    { title: '画面の見方', info: true, body: () => ul('<b>左下</b>　HP・状態異常・味方。🪔の数字は<b>魂の灯火</b>（倒れた時に1つ使って復活）', '<b>左上</b>　エリアと目標', '<b>右上</b>　コイン・時間・撃破数　<b>上中央</b>　コンパス', '<b>右下</b>　武器と弾　<b>下中央</b>　スキル・アイテム') },
    { title: '準備完了！', info: true, finish: true, body: () => ul('エリアの<b>目標</b>（殲滅・生存・狩猟・儀式）を達成すると、<b>加護</b>を1つ選べる', 'クリア後は<b>門が3つ</b>開く。看板を見て次の行き先を選ぶ', '<b>7エリアごとに守護者</b>（ボス）。その手前の6つ目は商人だけの<b>準備の間</b>', `進行は自動保存。操作は ${k('Esc')} →「操作方法」でいつでも確認できます`) },
  ];

  // ---------------------------------------------------------------- lifecycle
  T.start = function () {
    GM = G.game; P = G.player;
    GM.startRun();
    G.save.data.records.runs = Math.max(0, G.save.data.records.runs - 1); G.save.write();
    T.active = true; GM.tutorial = true; document.body.classList.add('tut-on');
    GM.clearRun(); // nothing to "continue" from a tutorial
    GM.objective = { tutorial: true, icon: '📘', text: () => `チュートリアル ${idx + 1}/${STEPS.length}`, progress: () => (idx + (st ? st.prog || 0 : 0)) / STEPS.length, done: false };
    GM.mimicT = -1;
    G.ui.setArea('TUTORIAL', '📘 チュートリアル — 訓練場');
    G.ui.banner('TUTORIAL', '— 深淵へ降りる前に、身体を慣らそう —');
    for (const e of G.enemies.list) if (e.alive && !e.custom) { e.noReward = true; e.alive = false; e.remove && e.remove(); }
    ensureEl();
    idx = 0; begin();
    // count grenades for the grenade step
    if (!T._wrapped) { T._wrapped = true; const r0 = G.abilities.releaseGrenade; G.abilities.releaseGrenade = function (...a) { if (T.active && st) st.thrown = (st.thrown || 0) + 1; return r0.apply(this, a); }; }
  };
  T.stop = function () {
    T.active = false; if (GM) GM.tutorial = false; document.body.classList.remove('tut-on');
    if (el) el.classList.remove('on');
    st = null;
  };
  T.finish = function () {
    T.stop();
    G.ui.toast('⚔️ 本編を開始します', 'good');
    G.game.startRun();
  };
  function ensureEl() {
    if (el) return;
    el = document.createElement('div'); el.id = 'tut';
    G.ui.el.hud.appendChild(el);
  }
  function begin() {
    const s = STEPS[idx];
    st = { dist: 0, jumps: 0, prog: 0, t0: G.game.time };
    st.prevPos = P.pos.clone(); st.prevGround = P.grounded;
    if (s.setup) { try { s.setup(st); } catch (e) { console.error(e); } }
    render(true);
  }
  function next(skipped) {
    const s = STEPS[idx];
    if (!skipped && !s.info) { G.sfx.ui('level'); G.fx.ring(P.pos.clone().setY(P.pos.y + 0.1), 2, 0x80ff90, 0.5); }
    else G.sfx.ui('click');
    if (s.finish) return T.finish();
    idx = Math.min(STEPS.length - 1, idx + 1);
    begin();
  }
  function render(fresh) {
    const s = STEPS[idx];
    const goal = typeof s.goal === 'function' ? s.goal() : s.goal;
    const pct = Math.round((st.prog || 0) * 100);
    const html = `<div class="tut-h"><span>📘 チュートリアル</span><b>${idx + 1} / ${STEPS.length}</b></div>
      <div class="tut-t">${s.title}</div><div class="tut-b">${s.body()}</div>${s.tip ? `<div class="tut-tip">💡 ${s.tip()}</div>` : ''}
      ${s.info ? `<div class="tut-foot"><span>${s.finish ? `${k('Enter')} / ${k('ホイールクリック')} 本編へ` : `${k('Enter')} / ${k('ホイールクリック')} 次へ`}</span><span>${k('Backspace')} 飛ばす</span></div>`
        : `<div class="tut-goal">🎯 ${goal}</div><div class="tut-bar"><div style="width:${pct}%"></div></div><div class="tut-foot"><span>やってみよう！</span><span>${k('Backspace')} 飛ばす</span></div>`}`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.classList.add('on');
    if (fresh) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }

  T.update = function (dt) {
    if (!T.active || !st) return;
    const s = STEPS[idx];
    // passive trackers
    const d = Math.hypot(P.pos.x - st.prevPos.x, P.pos.z - st.prevPos.z); if (d < 2) st.dist += d; st.prevPos.copy(P.pos);
    if (st.prevGround && !P.grounded && P.vel.y > 2) st.jumps++;
    st.prevGround = P.grounded;
    // the tutorial is a safe place
    if (P.hp < P.stats.maxHp * 0.35) { P.hp = P.stats.maxHp * 0.7; G.ui.toastSmall('📘 チュートリアル中なのでHPを回復しました'); }
    for (const k2 in P.st) if (P.st[k2] > 4) P.st[k2] = 4;
    if (I.pressed.Backspace) { delete I.pressed.Backspace; return next(true); }
    if (s.info) { if (I.pressed.Enter || I.pressed.NumpadEnter || I.mpressed[1]) { delete I.pressed.Enter; I.mpressed[1] = false; next(false); return; } render(); return; }
    let p = 0;
    try { p = s.check(st, dt); } catch (e) { console.error(e); p = 1; }
    st.prog = p === true ? 1 : U.clamp(+p || 0, 0, 1);
    render();
    if (st.prog >= 1 && !st.doneT) { st.doneT = G.game.time; el.classList.add('done'); }
    if (st.doneT && G.game.time - st.doneT > 0.7) { el.classList.remove('done'); next(false); }
  };
})();
