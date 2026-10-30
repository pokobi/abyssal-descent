'use strict';
// Hands-on tutorial: played in a real first area with no waves. Each step explains one thing and waits until you have done it
// (or press the wheel / the interact key on explanation pages: both hands stay where they are; Enter works too). Backspace skips a step. At the end a fresh run starts.
// The panel sits at the top left, where the route bar and the objective would be (both hidden meanwhile), so the view stays clear.
(function () {
  const T = (G.Tutorial = { active: false });
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, GM, el, map = null, st = null, idx = 0;
  const k = (s) => `<kbd>${s}</kbd>`;
  const K = (a) => k(G.K(a));
  // what moves the tutorial on: keys the hands are already on
  const NEXT = () => `${k('ホイールクリック')} か ${K('interact')}`;
  const nextHit = () => I.mpressed[1] || I.hit('interact') || I.pressed.Enter || I.pressed.NumpadEnter;
  const nextEat = () => { I.mpressed[1] = false; delete I.pressed.Enter; delete I.pressed.NumpadEnter; for (const c of G.BIND.interact) delete I.pressed[c]; };

  // ---------------------------------------------------------------- helpers
  const ul = (...a) => `<ul>${a.filter(Boolean).map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const WASD = () => ['forward', 'left', 'back', 'right'].map((b) => K(b)).join('');
  const CROUCH = () => G.BIND.crouch.map(G.input.codeName).filter((v, i, a) => a.indexOf(v) === i).map(k).join(' / ');
  // a goal in several parts: each shows ✅ once done
  const parts = (a) => a.map(([t, ok]) => `<span class="tut-part${ok ? ' ok' : ''}">${ok ? '✅' : '⬜'} ${t}</span>`).join('');
  // little picture tiles under the text: [icon, name, small line, colour]
  const tiles = (a) => `<div class="tut-vis">${a.map((t) => `<div class="tut-tile" style="--tc:${t[3]}"><i>${t[0]}</i><b>${t[1]}</b><small>${t[2]}</small></div>`).join('')}</div>`;
  const RAR = { common: 'コモン', uncommon: 'アンコモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' };
  const AT = (id) => G.Areas.TYPES[id];
  const invOpen = () => (G.ui.statusOpen && G.ui.statusOpen()) || (G.InvUI && G.InvUI.isOpen());
  // a chest right in front of you (on the floor, facing you)
  const putChest = (tier) => { const f = P.forward().setY(0).normalize(); const p = P.pos.clone().addScaledVector(f, 3); const w = G.world; if (!(w.boxFree(p.x - 0.7, p.y + 0.05, p.z - 0.7, p.x + 0.7, p.y + 1, p.z + 0.7))) p.copy(P.pos).add(V(0, 0, -2)); const y = w.floorBelow(p.x, P.pos.y + 1, p.z); const c = G.Props.chest(w, p.x, p.z, y > -50 ? y : P.pos.y, Math.atan2(-f.x, -f.z), tier); w.flushDeferred(); G.fx.ring(p.clone().setY(P.pos.y + 0.1), 1.5, 0xffd070, 0.6); return c; };
  const top = (id, n) => { const h = P.itemCount(id); if (h < n) P.addItem(id, n - h); };

  // ---------------------------------------------------------------- steps
  // ch: the chapter. check(s, dt) returns progress 0..1 (or true when done); setup(s) runs when the step starts.
  const CH = ['📘 はじめに', '🏃 動き', '⚔️ 戦い', '🎒 道具と持ち物', '🌟 成長と進行'];
  const STEPS = [
    { ch: 0, title: 'ようこそ、深淵へ', info: true,
      body: () => ul('実際に操作しながら、基本を覚えます（5分ほど）。', 'ここでは<b>倒されません</b>。HPが減っても自動で戻ります。', `${NEXT()} 次へ　${k('Backspace')} この手順を飛ばす`, `${k('Esc')} ポーズ（チュートリアルの終了もここから）`) },

    { ch: 1, title: '見回す・歩く・走る',
      body: () => ul(`${k('マウス')} 見回す　${WASD()} 歩く`, G.save.data.settings.autoSprint ? `普段は<b>自動で走る</b>（${K('sprint')} を押している間は歩き）` : `${K('sprint')} を一度押すと<b>走る</b>（止まる・撃つ・覗くまで続く）`),
      tip: () => 'マウスが効かない時は、画面を一度クリック。',
      goal: (s) => `20m 進む（${Math.min(20, Math.floor(s.dist))} / 20m）`,
      check: (s) => Math.min(1, s.dist / 20) },
    { ch: 1, title: 'ジャンプ・スライディング',
      body: () => ul(`${K('jump')} ジャンプ（段差の前で<b>押し続ける</b>と、よじ登る）`, `${CROUCH()} しゃがむ（低い攻撃をくぐれる）`, `<b>走りながら</b> ${k(G.input.keyName('crouch'))}：スライディング`),
      goal: (s) => parts([['ジャンプ', s.jumps > 0], ['スライディング', s.sl]]),
      check: (s) => { if (P.sliding) s.sl = true; return (s.jumps > 0 ? 0.5 : 0) + (s.sl ? 0.5 : 0); } },
    { ch: 1, title: 'パイルドライバー・グラップル',
      body: () => ul(`<b>ジャンプ中に</b> ${k(G.input.keyName('crouch'))}：真下へ急降下して、周りの敵を叩く（高い所からほど強い）`, `${K('grapple')} を<b>押している間</b>：壁や天井にロープを掛けて巻き取る。離すと外れる`, `ロープ中に ${K('jump')}：勢いよく跳ぶ`),
      tip: () => 'グラップルは、壁や木などに照準を向けてから。',
      goal: (s) => parts([['パイルドライバー', s.p], ['グラップル', s.g]]),
      check: (s) => { P.pileCd = Math.min(P.pileCd || 0, 0.5); P.grappleCd = Math.min(P.grappleCd || 0, 0.5); if (P.pileState) s.p = true; if (P.grapple && P.grapple.state === 'attached') s.g = true; return (s.p ? 0.5 : 0) + (s.g ? 0.5 : 0); } },

    { ch: 2, title: '撃つ・覗く・リロード',
      body: () => ul(`${k('左クリック')} 撃つ`, `${k('右クリック')} 押している間 覗き込む（狙いが安定する）`, `${K('reload')} リロード（空になると自動でも）`, '頭に当てると大ダメージ（ヘッドショット）'),
      tip: () => '残りの弾は画面右下。',
      goal: (s) => parts([[`撃つ ${Math.min(5, s.shots || 0)}/5`, (s.shots || 0) >= 5], ['覗く', s.ads], ['リロード', s.rl]]),
      setup: (s) => { s.mag = P.weapon ? P.weapon.mag : 0; },
      check: (s) => { const w = P.weapon; if (w && !P.meleeMode) { if (w.mag < s.mag) s.shots = (s.shots || 0) + (s.mag - w.mag); s.mag = w.mag; if (w.reloading) s.rl = true; } if (G.weapons.adsT > 0.9) s.ads = true; return Math.min(1, (s.shots || 0) / 5) * 0.6 + (s.ads ? 0.2 : 0) + (s.rl ? 0.2 : 0); } },
    { ch: 2, title: '近接武器',
      body: () => ul(`${K('w3')} 近接武器に持ち替え（${K('w1')}${K('w2')} で銃へ戻る・${k('ホイール')} でも切替）`, `${k('左クリック')} 連撃　${k('右クリック')} 重撃（遅いが強い）`, `${K('reload')} を押している間：<b>防御</b>（正面からの攻撃を軽減。照準の右のゲージが減る）`, '持っている間は、移動が少し速い'),
      goal: (s) => parts([['持ち替え', s.m], ['連撃', s.l], ['重撃', s.h], ['防御', s.gd]]),
      check: (s) => { const ms = G.weapons.ms; if (P.meleeMode) { s.m = true; if (ms && ms.ph === 'light') s.l = true; if (ms && (ms.ph === 'hwind' || ms.ph === 'hrec')) s.h = true; if (G.weapons.guarding()) s.gd = true; } return (s.m ? 0.25 : 0) + (s.l ? 0.25 : 0) + (s.h ? 0.25 : 0) + (s.gd ? 0.25 : 0); } },
    { ch: 2, title: '実戦',
      body: () => ul('敵が現れた。倒してみよう。', '敵の頭上の<b>赤いバー</b>はHP、<b>青いバー</b>はシールド（爆発・電撃に弱い）', '床に出る<b>赤い円</b>は攻撃の予告。円の外へ'),
      goal: (s) => `敵を倒す（${s.kills || 0} / ${s.spawned ? s.spawned.length || 1 : 3}）`,
      setup: (s) => { s.spawned = []; if (P.weapon) P.weapon.mag = G.weapons.stats(P.weapon).mag; for (let i = 0; i < 3; i++) { const e = GM.spawnEnemy({ near: true, noMut: true }); if (e) { e.noReward = false; s.spawned.push(e); } } G.ui.toast('⚔️ 敵が現れた！', 'warn'); },
      check: (s) => { const n = s.spawned.length; s.kills = s.spawned.filter((e) => !e.alive).length; return n ? s.kills / n : 1; } },

    { ch: 3, title: '漁る（亡骸・宝箱）',
      body: () => ul(`亡骸や宝箱の前で ${K('interact')}：調べ始める（終わるまで見続ける）`, '中身の画面で<b>「すべて取る」</b>：一度に回収（ドラッグで1つずつも）', '空になった亡骸・宝箱は、暗くなる'),
      tip: () => '目の前に宝箱を置きました。',
      goal: (s) => parts([['亡骸を空にする', s.c1], ['宝箱を開ける', s.c2]]),
      setup: (s) => {
        // the fight leaves bodies; if none is left to search (it fell somewhere), one more foe drops right here
        if (!G.Inv.corpses.some((c) => !c.searched && c.cont.items.length)) { const e = GM.spawnEnemy({ near: true, noMut: true }); if (e) { e.noReward = false; e.hp = 0; G.combat.killEnemy(e, { src: 'bullet' }, 0); } }
        s.chest = putChest(0);
      },
      check: (s) => { if (G.Inv.corpses.some((c) => c.searched && !c.cont.items.length)) s.c1 = true; if (s.chest && s.chest.opened) s.c2 = true; return (s.c1 ? 0.5 : 0) + (s.c2 ? 0.5 : 0); } },
    { ch: 3, title: '消耗品・投擲物',
      body: () => ul(`${K('item1')} ${K('item2')}：消耗品を使う（<b>長押し</b>で種類を選ぶ）`, `${K('grenade')}：投擲物を構える → ${k('左クリック')} 投げる／${k('右クリック')} 転がす`, `投擲物の種類は ${K('grenade')} 長押し、または ${K('cycleGrenade')}`),
      tip: () => '回復薬と手榴弾を渡しました。所持数は画面下中央。',
      goal: (s) => parts([[`${G.K('item1')} で回復する`, s.a], ['投擲物を投げる', (s.thrown || 0) > 0]]),
      setup: () => { P.hp = Math.min(P.hp, P.stats.maxHp * 0.6); top('h_bandage', 2); top('h_medkit', 1); top('g_frag', 2); top('g_fire', 1); G.ui.refreshItems(); },
      check: (s) => { if (G.ItemAnim.busy()) s.a = true; return (s.a ? 0.5 : 0) + ((s.thrown || 0) > 0 ? 0.5 : 0); } },
    { ch: 3, title: 'スキル・アルティメット',
      body: () => ul(`${k(G.input.skillKey(1))}${k(G.input.skillKey(2))}${k(G.input.skillKey(3))}：スキル（商人やイベントで手に入る）。練習用に「ダッシュ」を入れました`, `${k(G.input.skillKey(0))}：アルティメット（下中央の金色の枠）。とても強いが、再使用まで長い（100秒前後）`),
      tip: () => '最初のアルティメットは「不屈の城塞」（10秒間、被ダメージ60%減＋毎秒回復）。',
      goal: (s) => parts([[`${G.input.skillKey(1)} でスキル`, s.a], [`${G.input.skillKey(0)} でアルティメット`, s.b]]),
      setup: (s) => { P.skills[1] = G.abilities.makeSlot('dash'); if (G.ui.buildAbilityRow) G.ui.buildAbilityRow(); s.ch = P.skills[1].charges; const u = P.skills[0]; if (u) u.cd = 0; },
      check: (s) => { const sk = P.skills[1], u = P.skills[0]; if (sk && (sk.cd > 0 || sk.charges < s.ch)) s.a = true; if (u && u.cd > 0) s.b = true; return (s.a ? 0.5 : 0) + (s.b ? 0.5 : 0); } },
    { ch: 3, title: '持ち物・アタッチメント',
      body: () => ul(`${K('status')} 持ち物を開く／閉じる（${k('Esc')} でも閉じる）`, `<b>ドラッグ</b>で動かす　${k('R')} 回転　${k('右クリック')} メニュー（武器は長押しで捨てる）　${k('ダブルクリック')} 使う・装備`, '枠の外へドラッグで捨てる　<b>⇅ 整理</b>で並べ替え', '<b>レッドドット</b>を渡しました。銃の枠へドラッグ（付く場所が光る）'),
      tip: () => '開いている間も、ゲームは止まりません。',
      goal: (s) => parts([['持ち物を開く', s.o], ['レッドドットを銃に付ける', P.weapons.some((w) => w.atts.optic === 'o_reddot')]]),
      setup: () => { if (!P.weapons.some((w) => w.atts.optic === 'o_reddot') && !P.attStash.includes('o_reddot')) { G.Inv.noAuto = true; P.attStash.push('o_reddot'); G.Inv.noAuto = false; } },
      check: (s) => { if (invOpen()) s.o = true; const att = P.weapons.some((w) => w.atts.optic === 'o_reddot'); return (s.o ? 0.4 : 0) + (att ? 0.6 : 0); } },

    { ch: 4, title: '加護（その周回の強化）',
      body: () => ul('エリアの<b>目標</b>を達成すると、<b>加護</b>を1つ選べる', '加護は、その周回の間ずっと続く強化。取るほど強くなる', '枠の色がレアリティ。気に入らなければ<b>リロール</b>'),
      vis: (s) => tiles((s.sample || []).map((b) => [b.icon, b.name, RAR[b.rarity] || b.rarity, `var(--c-${b.rarity})`])),
      goal: (s) => (s.opened ? '好きな加護を1つ選ぶ' : `<span>${NEXT()} で加護の選択画面を開く</span>`),
      setup: (s) => { s.sample = GM.rollBuffs(3); },
      check: (s) => {
        if (!s.opened && nextHit()) {
          nextEat(); s.opened = true;
          GM.offerBuffs(false, { title: 'CHOOSE A BOON', sub: '練習：好きな加護を1つ選ぼう（選ぶとこの周回ずっと有効）', onPicked: () => { s.picked = true; } });
        }
        return s.picked ? 1 : s.opened ? 0.5 : 0;
      } },
    { ch: 4, title: '次のエリアを選ぶ',
      body: () => ul('エリアをクリアすると、奥の壁に<b>門が3つ</b>開く。門の上の<b>看板</b>が行き先', '戦闘・商人・祠…と中身が違う。入ったら戻れない'),
      vis: () => tiles(['combat', 'shop', 'shrine'].map((id) => [AT(id).icon, AT(id).name, AT(id).hint.split('／')[0], AT(id).color])),
      tip: () => '練習用に門を開けました（北の壁、まっすぐ約10秒）。入っても本編には進みません。',
      goal: () => 'どれかの門に入る',
      setup: () => { G.Areas.openGates(false, ['combat', 'shop', 'shrine']); },
      check: (s) => (s.gate ? 1 : 0) },
    { ch: 4, title: '画面の見方', info: true, hud: true,
      body: () => ul('光っている枠が、それぞれの表示です。', '🪔 魂の灯火：倒れた時に1つ使って、そのエリアの最初から復活') },
    { ch: 4, title: '準備完了！', info: true, finish: true,
      body: () => ul('<b>7エリアごとに守護者</b>（ボス）。その手前の6つ目は商人だけの<b>準備の間</b>', `進行は自動で保存。操作は ${k('Esc')} →「操作方法」でいつでも確認できます`) },
  ];
  // the screen regions the "画面の見方" step outlines: [selector(s), label, where the label goes (default: below / above)]
  const HUD_MAP = [
    [['#area-title', '#area-sub'], 'エリア名', 'r'],
    [['#compass'], 'コンパス（門や敵の方向）'],
    [['#hud-tr'], 'コイン・時間・撃破数'],
    [['#hud-bl'], 'HP・状態異常・魂の灯火'],
    [['#hud-bc'], 'スキル・アイテム'],
    [['#hud-br'], '武器と弾'],
  ];

  // ---------------------------------------------------------------- lifecycle
  T.start = function () {
    GM = G.game; P = G.player;
    GM.startRun(undefined, null); // the tutorial never saves
    G.save.data.records.runs = Math.max(0, G.save.data.records.runs - 1); G.save.write();
    T.active = true; GM.tutorial = true; document.body.classList.add('tut-on');
    GM.objective = { tutorial: true, icon: '📘', text: () => `チュートリアル ${idx + 1}/${STEPS.length}`, progress: () => (idx + (st ? st.prog || 0 : 0)) / STEPS.length, done: false };
    GM.mimicT = -1;
    G.ui.setArea('TUTORIAL', '📘 チュートリアル — 訓練場');
    G.ui.banner('TUTORIAL', '— 深淵へ降りる前に、身体を慣らそう —');
    for (const e of G.enemies.list) if (e.alive && !e.custom) { e.noReward = true; e.alive = false; if (e.remove) e.remove(); }
    ensureEl();
    idx = 0; begin();
    // count grenades for the grenade step
    if (!T._wrapped) { T._wrapped = true; const r0 = G.abilities.releaseGrenade; G.abilities.releaseGrenade = function (...a) { if (T.active && st) st.thrown = (st.thrown || 0) + 1; return r0.apply(this, a); }; }
  };
  T.stop = function () {
    T.active = false; if (GM) GM.tutorial = false; document.body.classList.remove('tut-on');
    if (el) el.classList.remove('on');
    hideMap();
    st = null;
  };
  T.finish = function () {
    T.stop();
    G.ui.toast('⚔️ 本編を開始します', 'good');
    G.ui.slotForNew((s) => G.game.startRun(undefined, s), () => G.game.toTitle());
  };
  function ensureEl() {
    if (el) return;
    el = document.createElement('div'); el.id = 'tut';
    G.ui.el.hud.appendChild(el);
    // menus (pause, settings, the boon choice...) hide the panel; the small 'click to resume' prompt does not
    const scr = document.getElementById('screens');
    if (scr) new MutationObserver(() => { const m = [...scr.children].some((c) => c.classList.contains('screen') && !c.querySelector('.clicklock')); document.body.classList.toggle('tut-menu', m); }).observe(scr, { childList: true, subtree: true });
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
    // a skipped fight leaves no foes roaming the later steps
    if (st && st.spawned) for (const e of st.spawned) if (e.alive) { e.noReward = true; e.alive = false; if (e.remove) e.remove(); }
    if (s.finish) return T.finish();
    idx = Math.min(STEPS.length - 1, idx + 1);
    begin();
  }
  // the HUD tour: a glowing outline with a label over each part of the screen
  function showMap() {
    if (!map) { map = document.createElement('div'); map.id = 'tut-map'; document.body.appendChild(map); }
    const boxes = HUD_MAP.map(([sels, label, side]) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of sels) { const e = document.querySelector(q); if (!e) continue; const r = e.getBoundingClientRect(); if (!r.width) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
      if (x0 > x1) return '';
      const below = y1 < innerHeight * 0.5;
      return `<div class="tut-box" style="left:${x0 - 6}px;top:${y0 - 6}px;width:${x1 - x0 + 12}px;height:${y1 - y0 + 12}px"><span class="${side || (below ? 'b' : 'a')}">${label}</span></div>`;
    }).join('');
    if (map._h !== boxes) { map.innerHTML = boxes; map._h = boxes; }
    map.classList.add('on');
  }
  function hideMap() { if (map) map.classList.remove('on'); }
  function render(fresh) {
    const s = STEPS[idx];
    const goal = typeof s.goal === 'function' ? s.goal(st) : s.goal;
    const pct = Math.round((st.prog || 0) * 100);
    const html = `<div class="tut-h"><span>${CH[s.ch]}</span><b>${idx + 1} / ${STEPS.length}</b></div>
      <div class="tut-t">${s.title}</div><div class="tut-b">${s.body()}</div>${s.vis ? s.vis(st) : ''}${s.tip ? `<div class="tut-tip">💡 ${s.tip()}</div>` : ''}
      ${s.info ? `<div class="tut-foot"><span>${NEXT()} ${s.finish ? '本編へ' : '次へ'}</span><span>${k('Backspace')} 飛ばす</span></div>`
        : `<div class="tut-goal">${goal}</div><div class="tut-bar"><div style="width:${pct}%"></div></div><div class="tut-foot"><span>やってみよう</span><span>${k('Backspace')} 飛ばす</span></div>`}`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.classList.add('on');
    if (fresh) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    if (s.hud) showMap(); else hideMap();
  }

  T.onGate = function (ex) { if (st && !st.gate) { st.gate = ex.type || 'combat'; G.ui.toastSmall('🚪 本番ならここで次のエリアへ（練習なので進みません）'); } };
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
    if (s.info) { if (nextHit()) { nextEat(); next(false); return; } render(); return; }
    let p = 0;
    try { p = s.check(st, dt); } catch (e) { console.error(e); p = 1; }
    st.prog = p === true ? 1 : U.clamp(+p || 0, 0, 1);
    render();
    if (st.prog >= 1 && !st.doneT) { st.doneT = G.game.time; el.classList.add('done'); }
    if (st.doneT && G.game.time - st.doneT > 0.8) { el.classList.remove('done'); next(false); }
  };
})();
