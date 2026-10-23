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
  const STEPS = [
    { title: 'ようこそ、深淵へ', info: true, body: () => `このチュートリアルでは、実際に体を動かしながら<b>操作</b>と<b>ゲームの流れ</b>を学びます。<br>敵に倒されることはありません（HPが減りすぎると自動で回復します）。<br><br>・説明だけのページは ${k('Enter')} か ${k('ホイールクリック')} で次へ<br>・手順を飛ばしたい時は ${k('Backspace')}<br>・途中でやめる時は ${k('Esc')} → 「チュートリアルを終了」` },
    { title: '視点と移動', body: () => `${k('マウス')} を動かして周りを見回し、${k(G.K('forward'))}${k(G.K('left'))}${k(G.K('back'))}${k(G.K('right'))} で歩き回ってみましょう。<br><small>マウスが効かない時は画面をクリックしてください（マウスがゲームに固定されます）。</small>`, goal: '15m 移動する',
      check: (s) => Math.min(1, s.dist / 15) },
    { title: '走る・歩く', body: () => G.save.data.settings.autoSprint ? `このゲームは<b>標準で常に走って</b>います。<br>${k(G.K('sprint'))} を<b>押している間だけ歩き</b>になります（足音が小さく、狙いが安定）。<br><small>設定で「常に走る」を切ると、${G.K('sprint')} で走る方式になります。</small>` : `${k(G.K('sprint'))} で走り始めます。<b>離しても、止まる・狙う・撃つ・リロード・しゃがむまでは走り続けます</b>（もう一度押すと止まります）。`, goal: () => G.save.data.settings.autoSprint ? `${G.K('sprint')} を押しながら2秒歩く` : `${G.K('sprint')} で2秒走る`,
      check: (s, dt) => { const moving = ['forward', 'back', 'left', 'right'].some((b) => I.down(b)); const ok = G.save.data.settings.autoSprint ? I.down('sprint') && moving : P.sprinting; if (ok) s.t = (s.t || 0) + dt; return Math.min(1, (s.t || 0) / 2); } },
    { title: 'ジャンプとよじ登り', body: () => `${k(G.K('jump'))} でジャンプします。<br>腰より高い段差や木箱の前で ${k(G.K('jump'))} を<b>押し続ける</b>と、縁に手をかけて<b>よじ登れます</b>。`, goal: '3回ジャンプする',
      check: (s) => Math.min(1, s.jumps / 3) },
    { title: 'しゃがみとスライディング', body: () => `${G.BIND.crouch.map(G.input.codeName).filter((v, i, a) => a.indexOf(v) === i).map(k).join(' または ')} でしゃがみます（被弾しにくく、低い攻撃をくぐれる）。<br><b>走っている最中に</b> ${k(G.input.keyName('crouch'))} を押すと<b>スライディング</b>で素早く滑り込めます。`, goal: 'スライディングする',
      check: (s) => (P.sliding ? 1 : 0) },
    { title: '射撃と照準', body: () => `${k('左クリック')} で射撃、${k('右クリック')} を押している間は<b>覗き込み（ADS）</b>で精度が上がります。<br>頭を撃つと<b>ヘッドショット</b>で大ダメージ。弾は画面右下に表示されます。`, goal: '5発撃つ ＋ 右クリックで覗き込む',
      setup: (s) => { s.mag = P.weapon ? P.weapon.mag : 0; },
      check: (s) => { const w = P.weapon; if (w && !P.meleeMode) { if (w.mag < s.mag) s.shots = (s.shots || 0) + (s.mag - w.mag); s.mag = w.mag; } if (G.weapons.adsT > 0.9) s.ads = true; return Math.min(1, (s.shots || 0) / 5) * 0.8 + (s.ads ? 0.2 : 0); } },
    { title: 'リロード', body: () => `${k(G.K('reload'))} でリロード。弾が空のまま撃とうとしても自動でリロードします。<br>リロード中は走るのが遅くなることがあるので、物陰で行いましょう。`, get goal() { return `${G.K('reload')} でリロードする`; },
      check: () => (P.weapon && P.weapon.reloading ? 1 : 0) },
    { title: '武器の持ち替えと近接攻撃', body: () => `${k(G.K('w1'))}${k(G.K('w2'))}${k(G.K('w3'))} やマウス${k('ホイール')}で武器を切り替えます。${k(G.K('w1'))}${k(G.K('w2'))} が銃、${k(G.K('w3'))} が<b>近接武器</b>（固定の枠。最初はサバイバルナイフ）。<br>近接武器を持っている間は<b>移動が速く</b>、${k('左クリック')} で<b>連撃</b>、${k('右クリック')} で隙の大きい<b>重撃</b>です。`, get goal() { return `${G.K('w3')} で持ち替え、連撃と重撃を1回ずつ`; },
      check: (s) => { const ms = G.weapons.ms; if (P.meleeMode) { s.m = true; if (ms && ms.ph === 'light') s.l = true; if (ms && (ms.ph === 'hwind' || ms.ph === 'heavy')) s.h = true; } return (s.m ? 0.34 : 0) + (s.l ? 0.33 : 0) + (s.h ? 0.33 : 0); } },
    { title: '武器の並べ替え', body: () => `銃を2丁持っている時、数字キー ${k(G.K('w1'))} か ${k(G.K('w2'))} を<b>長押し</b>すると<b>武器ホイール</b>が開きます。<br>マウスを動かして銃を選び、キーを離すと<b>その数字キーにその銃が入ります</b>（もう一方とは入れ替え）。持ち物画面で銃どうしをドラッグしても入れ替えられます。<br>ホイールを開いている間は少しスローになり、視点は動きません。<br><small>練習用に2丁目の銃を渡しました。</small>`, get goal() { return `${G.K('w1')} か ${G.K('w2')} を長押ししてホイールを開く`; },
      setup: () => { if (P.weapons.length < 2) { const d = G.WEAPONS.find((x) => x.id !== 'starter' && !x.mythic && x.rarity === 'common'); if (d) { P.weapons.push(G.weapons.make(d.id)); G.ui.refreshWeapon(); } } },
      check: () => (G.weapons.kh && G.weapons.kh.wheel ? 1 : 0) },
    { title: '戦闘', body: () => `敵が現れました。倒してみましょう！<br>敵の頭上には<b>Lv</b>と<b>HPバー</b>が出ます。青いバーは<b>シールド</b>で、爆発・電撃・EMPが効きやすいです。<br>敵の攻撃の前には<b>赤い円などの予兆</b>が出ることがあります。`, goal: () => `敵を倒す ${st ? st.kills || 0 : 0}/${st && st.spawned ? st.spawned.length || 1 : 3}`,
      setup: (s) => { s.k0 = GM.run.kills; s.spawned = []; P.weapon && (P.weapon.mag = G.weapons.stats(P.weapon).mag); for (let i = 0; i < 3; i++) { const e = GM.spawnEnemy({ near: true, noMut: true }); if (e) { e.noReward = false; s.spawned.push(e); } } G.ui.toast('⚔️ 敵が現れた！', 'warn'); },
      check: (s) => { const n = s.spawned.length; s.kills = s.spawned.filter((e) => !e.alive).length; return n ? s.kills / n : 1; } },
    { title: 'パイルドライバー', body: () => `<b>空中で</b> ${k(G.input.keyName('crouch'))} を押すと、真下へ急降下して地面を叩きつける<b>パイルドライバー</b>を放ちます。<br>着地点の周りの敵にダメージ。<b>地面から少し高さが必要</b>なので、ジャンプの頂点付近か段差の上から使いましょう。高い所から使うほど強力で、加護で成長します。`, get goal() { return `ジャンプして空中で ${G.K('crouch')}`; },
      check: () => (P.pileState ? 1 : 0) },
    { title: 'グラップル', body: () => `${k(G.K('grapple'))} で壁や天井にロープを撃ち込み、<b>押し続けると巻き取って</b>移動します。<br>${k(G.K('grapple'))} を離すと解除、ぶら下がり中に ${k(G.K('jump'))} で勢いよく跳べます。高台への移動や回避に便利です。`, get goal() { return `${G.K('grapple')} で壁や天井にロープを掛ける`; },
      check: () => (P.grapple && P.grapple.state === 'attached' ? 1 : 0) },
    { title: 'アイテム', body: () => `アイテムは<b>専用の枠</b>に入り、数字キーで使います。<br>${k(G.K('item1'))}・${k(G.K('item2'))} 消耗品（回復・補助のどちらも入る2つの枠）　${k(G.K('grenade'))} 投擲物（専用枠）<br>キーを<b>短く押す</b>と、その枠で選択中のアイテムを使います（使用中は武器が下がります）。<br>所持数は画面下中央に表示されます。`, get goal() { return `${G.K('item1')} で回復アイテムを使う`; },
      setup: () => { P.hp = Math.min(P.hp, P.stats.maxHp * 0.6); if (!P.itemCount('h_bandage')) P.addItem('h_bandage', 2); if (!P.itemCount('h_medkit')) P.addItem('h_medkit', 1); G.ui.refreshItems(); },
      check: () => (G.ItemAnim.busy() ? 1 : 0) },
    { title: 'アイテムホイール', body: () => `同じ枠に<b>複数の種類</b>がある時は、数字キーを<b>長押し</b>すると<b>選択ホイール</b>が開きます。<br>マウスを動かして選び、キーを離すと選択が切り替わります（その場では使いません）。<br>次からは短く押すだけで選んだアイテムを使えます。`, get goal() { return `${G.K('item1')} を長押ししてホイールを開き、選んで離す`; },
      setup: () => { if (!P.itemCount('h_bandage')) P.addItem('h_bandage', 1); if (!P.itemCount('h_medkit')) P.addItem('h_medkit', 1); G.ui.refreshItems(); },
      check: (s) => { const pr = G.abilities.press; if (pr && pr.wheel && pr.slot !== 'g') s.open = true; if (s.open && !pr) return 1; return s.open ? 0.6 : 0; } },
    { title: '投擲物', body: () => `${k(G.K('grenade'))} を<b>短く押す</b>と投擲物を<b>手に構えます</b>。構えたまま ${k('左クリック')} で投擲、${k('右クリック')} で転がす下投げ。<br>クリックを<b>押し続けると軌道と爆発範囲が表示</b>され、離すと投げます。<br>${k(G.K('grenade'))} 長押しで種類のホイール、もう一度 ${k(G.K('grenade'))} か武器の切替でしまえます。`, goal: () => `投擲物を投げる ${Math.min(2, st ? st.thrown || 0 : 0)}/2`,
      setup: () => { const top = (id, n) => { const h = P.itemCount(id); if (h < n) P.addItem(id, n - h); }; top('g_frag', 2); top('g_fire', 1); G.ui.refreshItems(); },
      check: (s) => Math.min(1, (s.thrown || 0) / 2) },
    { title: 'スキル', body: () => `${k(G.input.skillKey(1))}${k(G.input.skillKey(2))}${k(G.input.skillKey(3))} は<b>スキル枠</b>です。最初は空ですが、商人やイベントでスキルを手に入れると装備されます。<br>ここでは練習用に<b>ダッシュ</b>を ${k(G.input.skillKey(1))} に入れました。使うとクールタイムが画面下に表示されます。`, get goal() { return `${G.input.skillKey(1)} でスキルを使う`; },
      setup: (s) => { P.skills[1] = G.abilities.makeSlot('dash'); G.ui.buildAbilityRow && G.ui.buildAbilityRow(); s.ch = P.skills[1].charges; },
      check: (s) => { const sk = P.skills[1]; return sk && (sk.cd > 0 || sk.charges < s.ch) ? 1 : 0; } },
    { title: 'アルティメット', body: () => `${k(G.input.skillKey(0))} は<b>アルティメット</b>専用の枠です（画面下の大きな金色の枠）。<br>とても強力ですが、<b>クールタイムは約2分</b>。準備ができると音とメッセージで知らせます。<br>最初は耐久型の <b>🏰 不屈の城塞</b>（10秒間 被ダメ-60%・回復・シールド）を持っています。他のアルティメットは商人などで手に入ります。`, get goal() { return `${G.input.skillKey(0)} でアルティメットを使う`; },
      setup: (s) => { const u = P.skills[0]; if (u) u.cd = 0; },
      check: () => { const u = P.skills[0]; return u && u.cd > 0 ? 1 : 0; } },
    { title: '持ち物・ステータス画面', body: () => `${k(G.K('status'))} で<b>持ち物・装備</b>と<b>ステータス</b>が1つの画面で開きます（もう一度押すか ${k('Esc')} で閉じる）。<br>左：防具・武器とアタッチメントの付け替え・インベントリ　右：ステータス・スキル・加護の効果一覧（${k('ホイール')}でスクロール）。<br>開いている間もゲームは止まりません（移動はできますが、視点は動かせません）。`, get goal() { return `${G.K('status')} を押して持ち物・ステータス画面を開く`; },
      check: (s) => { if ((G.ui.statusOpen && G.ui.statusOpen()) || (G.InvUI && G.InvUI.isOpen())) s.o = true; return s.o ? 1 : 0; } },
    { title: 'アタッチメントの付け替え', body: () => `銃には<b>アタッチメント</b>（スコープ・マズル・マガジン等）を付けられます。拾ったものや外したものは<b>インベントリ</b>に入ります。<br>インベントリに<b>レッドドットサイト</b>を入れました。${k(G.K('status'))} で持ち物画面を開き、アタッチメントを<b>銃の枠までドラッグ</b>（付けられる場所が光ります）。ダブルクリックでも自動で付きます。<br>武器やスキルも枠どうしでドラッグすると入れ替えられます。`, goal: '持ち物画面でレッドドットを銃に付ける',
      setup: (s) => { if (!P.weapons.some((w) => w.atts.optic === 'o_reddot') && !P.attStash.includes('o_reddot')) { G.Inv.noAuto = true; P.attStash.push('o_reddot'); G.Inv.noAuto = false; } },
      check: () => (P.weapons.some((w) => w.atts.optic === 'o_reddot') ? 1 : 0) },
    { title: '宝箱とインタラクト', body: () => `${k(G.K('interact'))} で宝箱を開けたり、商品を買ったり、人に話しかけたりします。<br>目の前に<b>装飾された宝箱</b>を出しました。宝箱は ${k(G.K('interact'))} を<b>一度押すと探索が始まり</b>、古びた宝箱は1秒・上等は2秒・装飾は4秒かかります（画面中央にゲージ）。探索中に<b>目を大きく離したり離れると最初からやり直し</b>です。<br>エリアをクリアすると、取り忘れた宝箱が光って目立ちます。`, goal: '装飾された宝箱を開ける',
      setup: (s) => { const f = P.forward().setY(0).normalize(); const p = P.pos.clone().addScaledVector(f, 3); const w = G.world; if (!(w.boxFree(p.x - 0.7, p.y + 0.05, p.z - 0.7, p.x + 0.7, p.y + 1, p.z + 0.7))) p.copy(P.pos).add(V(0, 0, -2)); s.chest = G.Props.chest(w, p.x, p.z, w.floorBelow(p.x, P.pos.y + 1, p.z) > -50 ? w.floorBelow(p.x, P.pos.y + 1, p.z) : P.pos.y, Math.atan2(-f.x, -f.z), 2); w.flushDeferred(); G.fx.ring(p.clone().setY(P.pos.y + 0.1), 1.5, 0xffd070, 0.6); },
      check: (s) => (s.chest && s.chest.opened ? 1 : 0) },
    { title: '画面の見方', info: true, body: () => `・<b>左下</b>：HPバー（上の水色の細いバーは<b>オーバーシールド</b>）。その上に<b>状態異常</b>（円ゲージで残り時間）、<b>致命の一撃を防ぐ効果</b>や<b>無敵</b>、<b>味方</b>が表示されます。<br>・<b>HPバーの🪔×数字</b>：<b>魂の灯火</b>。倒れた時に1つ消費して復活できます。難易度が高いほど少なく、エクストラでは手に入りません。<br>・<b>左上</b>：エリア番号と<b>目標</b>（ゲージ付き）。<br>・<b>右上</b>：コイン、経過時間、撃破数。<b>上中央</b>：コンパス。<br>・<b>右下</b>：武器と弾数、武器スロット（数字キー順）。<b>下中央</b>：スキル・アイテム・グラップルなど。` },
    { title: 'エリアの流れ', info: true, body: () => `各エリアには<b>目標</b>があります：<b>殲滅</b>（全滅させる）、<b>生存</b>（時間まで耐える）、<b>狩猟</b>（★標的を倒す）、<b>儀式</b>（光の柱の円に立ち続ける。完了ごとに敵が湧く）。<br>敵は最大3回に分けて現れます（左上のゲージは今の群れの残り）。<br>目標を達成すると<b>加護を1つ選べます</b>。カードは<b>クリック</b>で選択（${k('ホイール')}で切り替えて ${k('Enter')} でも可）。選んでいる間も ${k(G.K('forward'))}${k(G.K('left'))}${k(G.K('back'))}${k(G.K('right'))} で動けます。` },
    { title: '次の道を選ぶ', info: true, body: () => `クリア後は<b>北の門が3つ開き</b>、門の上の看板で行き先を選べます：戦闘・精鋭・射的・邂逅・商人・宝物庫・祠・鍛冶場・呪いの闘技場・コイン部屋 など。<br>門の前には<b>旅の商人</b>も店を出します。買えない商品は灰色になります。<br>コインは撃破・クリア・速攻/無傷ボーナス・宝箱・壊せる物から手に入ります。` },
    { title: 'ボスと深淵', info: true, body: () => `<b>6エリアごとに守護者（ボス）</b>が待っています。ボスへ続く道には商人（または古の交換石機）と癒しの水盆があり、<b>奥の門をくぐると戦いが始まります</b>。<br>ボスにはそれぞれ<b>弱点や仕掛け</b>があります。誰が待っているかは入るまで分かりません。<br>最後の守護者を倒すとクリアで、成績が表示されます。` },
    { title: 'その他', info: true, body: () => `・${k('Esc')} / ${k('I')}：ポーズ。図鑑、設定、操作方法はここから。<br>・進行は<b>自動保存</b>されます。ブラウザを閉じても、タイトルの「続きから」で同じ場所から再開できます。<br>・${k(G.K('cycleGrenade'))} で投擲物の種類を順番に切替。<br>・操作の一覧は、タイトルやポーズ画面の「操作方法」でいつでも確認できます。` },
    { title: 'チュートリアル完了！', info: true, finish: true, body: () => `お疲れさまでした。これで深淵へ潜る準備は整いました。<br><br>${k('Enter')} で<b>本編を開始</b>します（新しいランが始まります）。` },
  ];

  // ---------------------------------------------------------------- lifecycle
  T.start = function (seedStr) {
    GM = G.game; P = G.player;
    T.seedStr = seedStr || '';
    GM.startRun(seedStr);
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
    G.game.startRun('');
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
      <div class="tut-t">${s.title}</div><div class="tut-b">${s.body()}</div>
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
