'use strict';
// Encyclopedia of every buff, weapon, attachment, item, skill, monster and boss (with live 3D previews).
(function () {
  const CX = (G.codex = {});
  const U = G.U;
  let renderer = null, scene = null, cam = null, model = null, raf = 0, canvas = null, animState = null;
  const TABS = [
    ['buff', '🌟 加護', () => G.BUFFS.filter((b) => b.cat !== 'pact' && !b.skill)],
    ['weapon', '🔫 武器', () => G.WEAPONS],
    ['melee', '🗡️ 近接武器', () => G.MELEE.filter((m) => !m.legacy)],
    ['attachment', '🔩 アタッチメント', () => G.ATTACHMENTS],
    ['item', '🧪 アイテム', () => G.ITEMS],
    ['armor', '🛡️ 防具', () => G.ARMOR],
    ['valuable', '💰 金品', () => G.VALUABLES],
    ['skill', '🔮 スキル', () => G.SKILLS],
    ['ult', '🌟 アルティメット', () => G.ULTS],
    ['enemy', '👹 モンスター', () => G.ENEMIES],
    ['boss', '👑 ボス', () => G.BOSSES.filter((b) => !(G.RETIRED_BOSSES || []).includes(b.id))],
    ['stage', '🗺️ フィールド', () => stages()],
    ['depth', '🌀 深淵', () => G.Depth.CODEX],
  ];
  let tab = 'buff', sel = null, query = '', backFn = null;
  const disc = (kind, o) => {
    const c = G.save.data.codex;
    if (kind === 'enemy') return !!c.enemies[o.id];
    if (kind === 'boss') return !!c.bosses[o.id];
    if (kind === 'stage') return !!G.save.data.codex.items['stage_' + o.key];
    if (kind === 'buff') return !!c.buffs[o.id];
    return !!c.items[o.id];
  };
  CX.open = function (back) {
    backFn = back;
    const total = TABS.reduce((a, t) => a + t[2]().length, 0);
    const found = TABS.reduce((a, t) => a + t[2]().filter((o) => disc(t[0], o)).length, 0);
    const s = G.ui.screen(`<div class="codex"><div class="cx-head"><h2>📖 深淵図鑑</h2>${TABS.map((t) => `<span class="cx-tab ${t[0] === tab ? 'on' : ''}" data-t="${t[0]}">${t[1]} <span class="cx-count">${t[2]().length}</span></span>`).join('')}<span class="cx-count" style="margin-left:8px">発見 ${found}/${total}</span><input id="cx-q" placeholder="🔍 検索" value="${U.esc(query)}"><button class="btn small" id="cx-back">↩ 戻る</button></div><div class="cx-body"><div class="cx-grid" id="cx-grid"></div><div class="cx-detail" id="cx-detail"></div></div></div>`, 'dim');
    s.querySelectorAll('.cx-tab').forEach((el) => el.onclick = () => { tab = el.dataset.t; sel = null; G.sfx.ui('click'); CX.open(back); });
    s.querySelector('#cx-back').onclick = () => { G.sfx.ui('click'); CX.close(); back(); };
    const q = s.querySelector('#cx-q');
    q.oninput = () => { query = q.value; renderGrid(); };
    // hidden: "dev" + Enter switches the debug mode on and opens its panel
    q.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter' || q.value.trim().toLowerCase() !== 'dev' || !G.Dev) return;
      query = ''; CX.close(); G.Dev.enable(); G.ui.toast('🛠 デバッグモードを有効にしました（F9 でパネル）', 'good');
      G.Dev.open(back);
    };
    renderGrid();
  };
  CX.close = function () { cancelAnimationFrame(raf); raf = 0; if (model && scene) scene.remove(model); model = null; };
  function list() {
    const t = TABS.find((x) => x[0] === tab);
    let a = t[2]();
    if (query) { const q = query.toLowerCase(); a = a.filter((o) => (o.name + (o.desc || '') + (o.cat || '')).toLowerCase().includes(q)); }
    return a;
  }
  function renderGrid() {
    const g = document.getElementById('cx-grid'); if (!g) return;
    const a = list();
    g.innerHTML = a.map((o, i) => `<div class="cx-item ${disc(tab, o) ? '' : 'undisc'} ${sel === o ? 'sel' : ''}" data-i="${i}" style="--rc:${G.ui.R(o.rarity || 'epic')}"><span class="ci">${o.mat ? G.armorIcon(o) : o.icon}${o.vicon ? '<small style="font-size:11px">' + o.vicon + '</small>' : ''}</span><span class="cn">${U.esc(o.name)}</span></div>`).join('');
    g.querySelectorAll('.cx-item').forEach((el) => el.onclick = () => { sel = a[+el.dataset.i]; G.sfx.ui('click'); g.querySelectorAll('.cx-item').forEach((x) => x.classList.remove('sel')); el.classList.add('sel'); renderDetail(); });
    if (!sel && a.length) sel = a[0];
    renderDetail();
  }
  const bar = (ic, label, v, max, txt) => `<div class="r"><span>${ic}</span><span>${label}</span><div class="sbar"><div style="width:${Math.min(100, v / max * 100)}%"></div></div><span class="v">${txt ?? Math.round(v)}</span></div>`;
  function renderDetail() {
    const d = document.getElementById('cx-detail'); if (!d || !sel) return;
    const o = sel, rc = G.ui.R(o.rarity || 'epic');
    const rar = G.RARITY[o.rarity];
    let html = `<div style="--rc:${rc}">`;
    const want3d = tab === 'weapon' || tab === 'enemy' || tab === 'melee' || tab === 'boss';
    if (want3d) html += `<div id="cx-3d"></div>`; else html += `<div class="cd-icon">${o.mat ? G.armorIcon(o) : o.icon}</div>`;
    html += `<div class="cd-name">${U.esc(o.name)}</div><div class="cd-cat">${rar ? rar.name + ' · ' : ''}${catText(o)}${disc(tab, o) ? ' · ✅ 発見済み' : ' · ❔ 未発見'}</div>`;
    html += `<div class="cd-desc">${U.esc(o.desc || '').replace(/\n/g, '<br>')}</div><div class="cd-stats">`;
    if (tab === 'weapon') {
      const s = o;
      html += bar('💥', 'ダメージ', s.dmg * (s.pellets || 1), 320, Math.round(s.dmg) + (s.pellets > 1 ? '×' + s.pellets : ''));
      html += bar('🔁', '連射 (RPM)', s.rpm, 1500);
      html += bar('📊', 'DPS', s.dmg * (s.pellets || 1) * s.rpm / 60, 450);
      html += bar('📦', '装弾数', s.mag, 250);
      html += bar('♻️', 'リロード', 6 - s.reload, 6, s.reload.toFixed(1) + 's');
      html += bar('🎯', '精度', 8 - s.spread, 8, s.spread.toFixed(1) + '°');
      html += bar('📏', '射程', s.range, 250, s.range + 'm');
      html += bar('🔭', '倍率', s.zoom, 4.5, '×' + s.zoom.toFixed(2));
      html += `<div style="margin-top:8px">${s.auto ? '<span class="tag">🔁 フルオート</span>' : s.burst ? `<span class="tag">🔂 ${s.burst}点バースト</span>` : '<span class="tag">☝️ セミオート</span>'}${s.proj ? '<span class="tag">🚀 投射物</span>' : ''}${s.pierce ? `<span class="tag">➶ 貫通${s.pierce}</span>` : ''}${s.element ? `<span class="tag">${G.ELEM[s.element === 'fire' ? 'fire' : s.element]?.icon || ''} 属性</span>` : ''}${s.trait ? `<span class="tag">${G.WEAPON_TRAITS[s.trait].icon} ${G.WEAPON_TRAITS[s.trait].name}: ${G.WEAPON_TRAITS[s.trait].desc}</span>` : ''}<span class="tag">🪙 ${s.price ? U.fmt(s.price) : '初期装備'}</span></div>`;
    } else if (tab === 'melee') {
      html += bar('💥', 'ダメージ', o.dmg, 110);
      html += bar('⚡', '攻撃間隔', 1 / o.swing, 5, o.swing.toFixed(2) + 's');
      html += bar('📊', 'DPS', o.dmg / o.swing, 200);
      html += bar('📏', 'リーチ', o.range, 4.5, o.range + 'm');
      html += bar('🔨', '重撃倍率', o.heavy[0], 3.5, '×' + o.heavy[0]);
      html += bar('👟', '移動速度', o.moveMul - 1, 0.2, '+' + Math.round((o.moveMul - 1) * 100) + '%');
      html += `<div style="margin-top:8px"><span class="tag">🔑 3 で持ち替え / 左:連撃 / 右:重撃</span>${o.traitDesc ? `<span class="tag">✦ ${o.traitDesc}</span>` : ''}${o.elem ? `<span class="tag">${{ burn: '🔥 炎上', frost: '❄️ 冷気', poison: '☠️ 毒', shock: '⚡ 電撃', bleed: '🩸 出血' }[o.elem]} ${Math.round(o.elemChance * 100)}%</span>` : ''}${o.critChance ? `<span class="tag">💢 会心+${Math.round(o.critChance * 100)}%</span>` : ''}${o.lifesteal ? `<span class="tag">🩸 吸血${Math.round(o.lifesteal * 100)}%</span>` : ''}<span class="tag">🪙 ${o.price ? U.fmt(o.price) : '初期装備'}</span></div>`;
    } else if (tab === 'enemy') {
      const lv = Math.max(1, o.minArea);
      html += bar('❤️', '体力 (Lv.1)', o.hp, 900);
      html += bar('⚔️', '攻撃 (Lv.1)', o.dmg, 60);
      html += bar('👟', '移動速度', o.speed, 12, o.speed.toFixed(1));
      html += bar('📐', 'サイズ', o.size, 1.6, '×' + o.size.toFixed(2));
      html += `<div style="margin-top:8px"><span class="tag">⚔️ 攻撃: ${ATK[o.attack] || '-'}</span><span class="tag">🧠 ${AI[o.ai] || o.ai}</span>${o.shield ? `<span class="tag">💠 シールド ${Math.round(o.shield * 100)}%</span>` : ''}${o.flyer ? '<span class="tag">🦇 飛行</span>' : ''}${o.elem ? `<span class="tag">${{ fire: '🔥', frost: '❄️', poison: '☠️', shock: '⚡' }[o.elem]} 属性攻撃</span>` : ''}${o.revive ? '<span class="tag">☠ 復活</span>' : ''}${o.dodge ? '<span class="tag">🌫️ 回避</span>' : ''}${o.frontArmor ? '<span class="tag">🛡 前面装甲</span>' : ''}${o.undead ? '<span class="tag">💀 不死</span>' : ''}<span class="tag">🗺️ 出現 エリア${o.minArea}〜</span><span class="tag">☠ 撃破 ${G.save.data.codex.kills[o.id] || 0}</span></div>`;
    } else if (tab === 'boss') {
      // stats from a real instance at its first appearance (same numbers the fight uses)
      const st = bossStats(o);
      if (st) {
        html += bar('❤️', '体力', st.hp, bossHpMax(), U.fmt(st.hp));
        html += bar('⚔️', '攻撃倍率', st.dmg, 3, '×' + st.dmg.toFixed(2));
        html += bar('📐', 'サイズ', st.size, 14, st.size.toFixed(1) + 'm');
        html += '<div style="margin-top:4px;font-size:12px;color:var(--dim)">基準：ノーマル・エリア6の守護者（難易度やエリアで変わります）</div>';
        if (st.weak.length) html += `<div style="margin-top:6px"><span class="tag">🎯 部位: ${st.weak.map(U.esc).join(' / ')}</span></div>`;
      }
      html += `<div style="margin-top:6px">${o.mech.map((m) => `<div style="padding:4px 0">◆ ${m}</div>`).join('')}</div><div style="margin-top:8px"><span class="tag">⚔ 出現: ${Object.keys(G.Run.BOSS_POOLS).filter((f) => G.Run.BOSS_POOLS[f].includes(o.id)).map((f) => G.Run.FIELD_NAME[f]).join('・') || '—'}の守護者</span></div>`;
    } else if (tab === 'stage') {
      html += stageDetail(o);
    } else if (tab === 'attachment') {
      html += `<div><span class="tag">${G.ATT_SLOTS[o.slot].icon} スロット: ${G.ATT_SLOTS[o.slot].name}</span><span class="tag">🪙 ${U.fmt(o.price)}</span></div>`;
    } else if (tab === 'armor') {
      const S = G.ARMOR_SLOT_BY_ID[o.slot], M = G.ARMOR_MAT_BY_ID[o.mat];
      html += bar('🛡️', '防御力', o.def, 42, String(o.def));
      html += bar('⚖️', '重さ', o.weight, 2.1, o.weight ? String(o.weight) : 'なし');
      html += `<div style="margin-top:8px"><span class="tag">${S.icon} 部位: ${S.name}</span><span class="tag">🧵 素材: ${M.name}</span><span class="tag">🪙 ${U.fmt(o.price)}</span></div>`;
      if (o.fixed.length) html += `<div style="margin-top:6px">${o.fixed.map((f) => `<div style="padding:3px 0;color:#ffd890">◆ ${f.desc}</div>`).join('')}</div>`;
      html += `<div style="margin-top:6px;font-size:12px;color:var(--dim)">🔧 総耐久 <b style="color:var(--text)">${G.armorMaxDur(o)}</b>（被弾で減り、0で壊れて消える。拾った物は0〜90%削れている／ショップは新品）</div>`;
      html += `<div style="margin-top:6px;font-size:12px;color:var(--dim)">${{ rare: 'まれにエンチャントが1つ付く（10%）。', epic: 'エンチャントが付くことが多い（1つ70%・2つ10%）。', legendary: 'エンチャントが必ず付く（1つ20%・2つ70%・3つ10%）。' }[o.rarity] || 'エンチャントは付かない。'}</div>`;
    } else if (tab === 'valuable') {
      html += `<div style="margin-top:8px"><span class="tag">💰 売値 ${U.fmt(o.value)}🪙</span><span class="tag">📐 大きさ ${o.size[0]}×${o.size[1]}</span><span class="tag">⚖️ 商人で売却専用</span></div>`;
    } else if (tab === 'item') {
      html += `<div><span class="tag">${G.ITEM_CAT[o.cat].icon} ${G.ITEM_CAT[o.cat].name}</span><span class="tag">🔑 ${o.cat === 'grenade' ? 'G で構え→左クリック投擲/右クリック下投げ' : (o.passive ? '常時：持っているだけで発動' : `${G.K('item1')} / ${G.K('item2')} で使用`)}</span><span class="tag">🪙 ${U.fmt(o.price)}</span></div>`;
    } else if (tab === 'ult') {
      html += bar('⏳', 'クールタイム', o.cd, 160, o.cd + '秒');
      html += `<div><span class="tag">🔑 Q（アルティメット専用枠）</span>${o.id === G.DEFAULT_ULT ? '<span class="tag">🎁 初期装備</span>' : `<span class="tag">🪙 ${U.fmt(o.price)}</span>`}</div>`;
    } else if (tab === 'skill') {
      html += bar('⏳', 'クールタイム', o.cd, 35, o.cd + '秒');
      html += `<div><span class="tag">🔑 ${[0, 1, 2, 3].map((i) => G.input.skillKey(i)).join(' / ')}</span>${o.p.charges ? `<span class="tag">🔋 チャージ ${o.p.charges}</span>` : ''}<span class="tag">🪙 ${U.fmt(o.price)}</span></div>`;
    } else if (tab === 'buff') {
      html += `<div><span class="tag">${G.BUFF_CAT[o.cat].icon} ${G.BUFF_CAT[o.cat].name}</span><span class="tag">${o.max > 1 ? '📚 最大' + o.max + '重ね' : '✨ 固有'}</span></div>`;
    }
    html += '</div></div>';
    d.innerHTML = html;
    if (want3d) mount3d(document.getElementById('cx-3d'), o);
  }
  const ATK = { lunge: '飛びかかり', slash: '斬撃', slam: '叩きつけ（範囲）', bounce: '跳躍圧殺', swoop: '急降下', pounce: '跳躍＋糸', throw: '火球投擲', beam: '熱線', charge: '突進', orb: '追尾呪弾', spore: '毒胞子', boulder: '岩投げ＋叩きつけ', dashslash: '迅速斬り', burrow: '地中奇襲', support: '回復・シールド付与', none: '逃走' };
  const AI = { flank: '包囲型', ranged: '遠距離型', melee: '近接型', flyer: '飛行型', support: '支援型', burrow: '潜伏型', flee: '逃走型' };
  function catText(o) {
    if (tab === 'buff') return '加護';
    if (tab === 'weapon') return o.cat;
    if (tab === 'melee') return '近接武器 · ' + o.cat;
    if (tab === 'attachment') return 'アタッチメント';
    if (tab === 'item') return G.ITEM_CAT[o.cat].name;
    if (tab === 'skill') return 'スキル';
    if (tab === 'ult') return 'アルティメット';
    if (tab === 'enemy') return 'モンスター' + (o.vicon ? ' ' + o.vicon : '');
    if (tab === 'boss') return 'ボス';
    if (tab === 'armor') return '防具（' + G.ARMOR_SLOT_BY_ID[o.slot].name + '・' + G.ARMOR_MAT_BY_ID[o.mat].name + '）';
    if (tab === 'valuable') return '金品';
    if (tab === 'depth') return o.cat;
    if (tab === 'stage') return o.where.length ? o.where[0] + (o.where.length > 1 ? ' ほか' : '') : '';
    return '';
  }
  // ---------------- the four fields ----------------
  const FIELD_INFO = {
    grave: { icon: '🪦', rarity: 'uncommon', desc: '月明かりの下の屋外の墓所。墓石と鉄柵、枯れ木、霊廟が並ぶ。守護者の待つ戦場は鉄柵に囲まれ、長い墓道の先にある。' },
    gate: { icon: '🚪', rarity: 'rare', desc: '迷宮の入口。天井は高いが閉ざされ、鉄格子の窓から夜空と月明かりが差し込む。守護者の間へは長い回廊を進み、自動で開く石の扉をくぐる（戻れない）。' },
    halls: { icon: '🏛️', rarity: 'epic', desc: '迷宮の中層。外の景色はなく、2〜3階建ての構造を階段・木の坂・橋で上下に移動する。地上の魔物は階段や坂を回り込んで迫ってくる。' },
    ruin: { icon: '🕳️', rarity: 'legendary', desc: '迷宮の最奥。中層と同じ縦に広い構造だが、崩落が進み、より暗い。橋は崩れ、柱は倒れている。' },
  };
  let STAGES = null;
  function stages() {
    if (STAGES) return STAGES;
    const R = G.Run;
    STAGES = Object.keys(FIELD_INFO).map((key, i) => {
      const B = G.Tex.BIOMES[key], F = FIELD_INFO[key];
      const where = [];
      for (const d of ['easy', 'normal', 'hard', 'extra']) R.DIFFS[d].segs.forEach(([f], k) => { if (f === key) where.push(`${R.DIFFS[d].name} 区分${k + 1}`); });
      return { id: 'stage_' + key, key, idx: i, name: B.name, icon: F.icon, rarity: F.rarity, desc: F.desc, where };
    });
    return STAGES;
  }
  const pct = (v) => (v * 100 >= 10 ? Math.round(v * 100) : (v * 100).toFixed(1)) + '%';
  function stageDetail(o) {
    const pool = (G.Run.BOSS_POOLS[o.key] || []).map((id) => G.BOSS_BY_ID[id]).filter(Boolean);
    let h = `<div style="margin-top:8px;font-weight:700">🗺️ 登場する難易度・区分</div><div style="font-size:12.5px;line-height:1.7;color:#cfc4b0">${o.where.join('　/　') || '—'}</div>`;
    h += `<div style="margin-top:10px;font-weight:700">👑 守護者（この中から1体が等確率で現れる）</div><div style="margin-top:4px">${pool.map((b) => `<span class="tag">${b.icon} ${U.esc(b.name)}</span>`).join('')}</div>`;
    const pool2 = G.game.enemyPool(13, o.key).slice().sort((a, b) => b[1] - a[1]).slice(0, 8);
    h += `<div style="margin-top:10px;font-weight:700">👹 よく現れる魔物</div><div style="margin-top:4px">${pool2.map(([e]) => `<span class="tag">${e.icon} ${U.esc(e.name)}</span>`).join('')}</div>`;
    return h;
  }
  const bossCache = {};
  // every guardian is shown at the same reference point (normal difficulty, area 6) so the numbers can be compared across the list
  const BOSS_REF = 6;
  function bossStats(o) {
    if (bossCache[o.id]) return bossCache[o.id];
    const R = G.Run, GM = G.game, keepRun = R.cur, keepArea = GM.area;
    R.cur = { id: 'normal', lv: 0 }; GM.area = BOSS_REF;
    try {
      const m = G.bosses.buildModelOnly(o.id, BOSS_REF); if (!m) return null;
      const b = m.boss;
      const box = new THREE.Box3().setFromObject(m.root);
      const names = [...new Set(b.parts.map((p) => p.def && p.def.name).filter((n) => n && n !== o.name))].slice(0, 5);
      return (bossCache[o.id] = { hp: Math.round(b.maxHp), dmg: b.dmgScale, size: box.max.y - box.min.y, weak: names });
    } finally { R.cur = keepRun; GM.area = keepArea; }
  }
  function bossHpMax() {
    let mx = 1;
    for (const b of G.BOSSES) if (!(G.RETIRED_BOSSES || []).includes(b.id)) { const st = bossStats(b); if (st) mx = Math.max(mx, st.hp); }
    return mx * 1.1;
  }
  function mount3d(host, o) {
    if (!renderer) {
      canvas = document.createElement('canvas');
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch (e) { renderer = null; host.innerHTML = `<div class="cd-icon">${o.icon}</div>`; return; }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(380, 260);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xb0a8a0, 0x302820, 1.2));
      const k = new THREE.DirectionalLight(0xffe0c0, 2.2); k.position.set(2, 3, 2); scene.add(k);
      const r2 = new THREE.DirectionalLight(0x8090c0, 1.0); r2.position.set(-2, 1, -2); scene.add(r2);
      scene.environment = G.envTex || null;
      cam = new THREE.PerspectiveCamera(35, 380 / 260, 0.01, 100);
    }
    host.appendChild(canvas);
    if (model) scene.remove(model);
    animState = null;
    if (tab === 'boss') {
      const m = G.bosses.buildModelOnly(o.id, BOSS_REF);
      if (!m) { host.innerHTML = `<div class="cd-icon">${o.icon}</div>`; return; }
      const r = m.root; r.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(r); const c = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3());
      r.position.sub(c);
      const g = new THREE.Group(); g.add(r); model = g;
      const s = Math.max(sz.x, sz.y, sz.z);
      cam.position.set(0, s * 0.18, s * 1.55); cam.lookAt(0, 0, 0); cam.far = s * 10; cam.updateProjectionMatrix();
      scene.add(model); if (!raf) loop(); return;
    }
    if (tab === 'weapon' || tab === 'melee') {
      model = tab === 'melee' ? G.weapons.meleeDisplayModel(o) : G.weapons.displayModel(o);
      const box = new THREE.Box3().setFromObject(model); const c = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3()).length();
      model.position.sub(c);
      const g = new THREE.Group(); g.add(model); model = g;
      cam.position.set(0, sz * 0.25, sz * 1.6); cam.lookAt(0, 0, 0);
    } else {
      const m = G.enemies.buildModel(o);
      model = m.group;
      const h = m.h, s = Math.max(h, m.r * 2.5);
      model.position.y = -h * 0.5;
      const g = new THREE.Group(); g.add(model); model = g;
      cam.position.set(0, h * 0.15, s * 2.2); cam.lookAt(0, 0, 0);
      animState = m;
      if (m.worm) { m.J.segs.forEach((sg, i) => sg.position.set(0, 0.8 - i * 0.05, -0.6 * (i + 1))); }
    }
    scene.add(model);
    if (!raf) loop();
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!document.getElementById('cx-3d')) { cancelAnimationFrame(raf); raf = 0; return; }
    const t = performance.now() / 1000;
    if (model) model.rotation.y = t * 0.6;
    if (animState && animState.animate && !animState.worm) animState.animate({ walk: t * 6, mv: 1, atk: Math.max(0, Math.sin(t * 1.3)) * 0.6, wind: 0, flinch: 0, t });
    renderer.render(scene, cam);
  }
})();
