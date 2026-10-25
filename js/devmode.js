'use strict';
// Debug mode: type "dev" + Enter in the codex search. F9 (or the pause menu) opens the panel during a run.
// Everything a playtest needs: run / area / boss jumps, stats, coins, weapons, skills, boons, items, spawns, anomalies, cheats.
(function () {
  const D = (G.Dev = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const esc = (s) => U.esc(String(s ?? ''));
  let GM, P, I, panel = null, tab = 'run', back = null, query = {}, aim = null;
  const S = () => G.save.data.settings;

  // dev mode lasts only until the next new game: it is never saved, and has to be switched on again from the codex
  let live = false;
  D.keep = false;
  D.on = () => live;
  D.enable = function () { live = true; document.body.classList.add('dev-on'); G.sfx.ui('rare'); };
  D.disable = function () { live = false; document.body.classList.remove('dev-on'); };
  D.init = function () {
    GM = G.game; P = G.player; I = G.input;
    if (S().devMode) { S().devMode = false; G.save.write(); }
    // cheats are read by the game loop / combat (see the hooks at the bottom)
    GM.dev = { god: false, oneHit: false, noCd: false, freeze: false, speed: 1 };
    const badge = document.createElement('div'); badge.id = 'dev-badge'; badge.innerHTML = 'DEV <small>F9</small>'; document.body.appendChild(badge);
    const info = document.createElement('div'); info.id = 'dev-info'; document.body.appendChild(info);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F9' || !D.on()) return;
      e.preventDefault();
      if (panel) D.close(); else if (GM.run && (GM.state === 'playing' || GM.state === 'paused' || GM.state === 'buff')) D.open(GM.state === 'paused' ? () => G.ui.pause() : null);
    }, true);
    // a live readout while dev mode is on
    setInterval(() => {
      if (!D.on() || !GM.run || !P.pos) { info.textContent = ''; return; }
      const cheats = Object.entries({ 無敵: GM.dev.god, 一撃: GM.dev.oneHit, CT無: GM.dev.noCd, 敵停止: GM.dev.freeze }).filter(([, v]) => v).map(([k]) => k).join(' ');
      info.textContent = `AREA ${GM.area} ${GM.stage} · pos ${P.pos.x.toFixed(1)},${P.pos.y.toFixed(1)},${P.pos.z.toFixed(1)} · 敵 ${G.enemies.list.filter((e) => e.alive).length} · ×${GM.dev.speed} ${cheats}`;
    }, 250);
  };

  // ---------------- panel ----------------
  D.open = function (backFn) {
    back = backFn || null;
    if (GM.run && GM.state !== 'title') {
      // remember where the crosshair points (spawns / teleports go there)
      const o = G.camera.position.clone(), d = P.forward();
      const hit = G.world && G.world.raycast(o, d, 80);
      aim = hit ? hit.point.clone().addScaledVector(d, -0.6) : o.clone().addScaledVector(d, 10);
      GM._devPrev = GM.state; if (GM.state === 'playing') GM.state = 'modal'; I.exitLock();
    }
    if (!panel) { panel = document.createElement('div'); panel.id = 'dev-panel'; document.body.appendChild(panel); }
    render();
  };
  D.close = function () {
    if (panel) { panel.remove(); panel = null; }
    if (back) { const b = back; back = null; b(); return; }
    // only resume what the panel itself paused (a boon choice / shop screen underneath stays as it was)
    if (GM.run && GM.state === 'modal' && !G.ui.el.screens.firstChild) GM.resume();
  };
  const inRun = () => !!(GM.run && P.weapons && G.world && GM.state !== 'title');
  const after = () => { G.ui.refreshWeapon && G.ui.refreshWeapon(); G.ui.refreshItems && G.ui.refreshItems(); G.ui.buildAbilityRow && G.ui.buildAbilityRow(); G.ui._itemsDirty = true; if (GM.run) GM.run.dev = true; if (panel && inRun() && GM.state === 'playing') GM.state = 'modal'; };
  const act = (fn) => () => { try { fn(); } catch (e) { console.error(e); G.ui.toast('⚠ ' + e.message, 'warn'); } after(); render(); };
  const toast = (t) => G.ui.toastSmall('🛠 ' + t);

  const TABS = [['run', '🎮 ラン'], ['stat', '🧍 能力値'], ['gear', '🔫 武器'], ['skill', '🔮 スキル'], ['buff', '🌟 加護'], ['item', '🧪 アイテム'], ['spawn', '👹 出現'], ['world', '🌀 異変・他']];
  function render() {
    if (!panel) return;
    const keepScroll = panel.querySelector('.dv-body') ? panel.querySelector('.dv-body').scrollTop : 0;
    const tabs = TABS.filter(([k]) => inRun() || k === 'run').map(([k, n]) => `<span class="dv-tab${k === tab ? ' on' : ''}" data-t="${k}">${n}</span>`).join('');
    panel.innerHTML = `<div class="dv-head"><b>🛠 DEBUG</b>${tabs}<span class="dv-x" id="dv-close">✕ 閉じる（F9）</span></div><div class="dv-body">${body()}</div>`;
    panel.querySelectorAll('.dv-tab').forEach((el) => el.onclick = () => { tab = el.dataset.t; render(); });
    panel.querySelector('#dv-close').onclick = () => D.close();
    wire();
    panel.querySelector('.dv-body').scrollTop = keepScroll;
  }
  const btn = (id, label, cls) => `<button class="dv-b${cls ? ' ' + cls : ''}" data-act="${id}">${label}</button>`;
  const num = (id, val, step) => `<input class="dv-n" type="number" id="${id}" value="${val}" step="${step || 1}">`;
  const sec = (t) => `<div class="dv-sec">${t}</div>`;
  const tog = (k, label) => `<label class="dv-tog"><input type="checkbox" data-tog="${k}" ${GM.dev[k] ? 'checked' : ''}> ${label}</label>`;
  const search = (k, ph) => `<input class="dv-q" data-q="${k}" placeholder="🔍 ${ph}" value="${esc(query[k] || '')}">`;
  const match = (k, o) => { const q = (query[k] || '').toLowerCase(); return !q || (o.name + ' ' + o.id + ' ' + (o.desc || '') + ' ' + (o.cat || '')).toLowerCase().includes(q); };
  const R = (r) => G.ui.R(r || 'common');
  const ACT = {}; // data-act id -> fn

  const AREA_KINDS = ['combat', 'elite', 'cursed', 'vault', 'trial', 'shop', 'event', 'shrine', 'forge', 'casino', 'bank', 'auction', 'merc', 'offering', 'boss'];
  function body() {
    for (const k in ACT) delete ACT[k];
    const T = G.Areas.TYPES;
    const kindName = (k) => (T[k] ? T[k].icon + ' ' + T[k].name : { casino: '🎰 賭場', bank: '🏦 銀行', auction: '🔨 競売', merc: '🗡️ 傭兵', offering: '🙏 献納' }[k] || k);
    if (tab === 'run') {
      ACT.start = () => { const df = panel.querySelector('#dv-diff').value.split(':'); if (panel) panel.remove(); panel = null; back = null; D.keep = true; GM.startRun({ id: df[0], lv: +df[1] || 0 }, null); D.keep = false; GM.run.dev = true; };
      ACT.unlockAll = () => { const c = G.Run.rec(); c.easy = c.normal = c.hard = c.easy || 1; for (let k = 1; k <= 10; k++) c['extra' + k] = c['extra' + k] || 1; G.save.write(); toast('全難易度を解放'); };
      ACT.go = () => {
        const n = Math.max(1, +panel.querySelector('#dv-area').value | 0), k = panel.querySelector('#dv-kind').value, b = panel.querySelector('#dv-boss').value;
        D.bossOverride = k === 'boss' && b ? b : null; D.bossArea = n;
        GM.area = n; GM.enterArea(n, k); toast(`AREA ${n} ${kindName(k)} へ移動`);
      };
      ACT.clear = () => { if (!GM.areaCleared) GM.clearArea(); };
      ACT.bossNow = () => { const w = G.world; if (GM.stage !== 'boss' || !w.arenaCenter) return toast('ボスエリアではない'); P.pos.set(w.arenaCenter.x, (w.roadFloorY ? 0 : P.pos.y) + 0.1, w.arenaD - 6); P.vel.set(0, 0, 0); };
      ACT.gates = () => { G.Areas.openGates(true); GM.areaCleared = true; };
      ACT.next = () => { const n = GM.area + 1; GM.area = n; GM.enterArea(n, n % 5 === 0 ? 'boss' : 'combat'); };
      ACT.heal = () => { P.dead = false; P.hp = P.stats.maxHp; P.st = {}; };
      ACT.kill = () => { for (const e of G.enemies.list) if (e.alive && !e.boss) { e.hp = 0; G.combat.killEnemy(e, { src: 'clear', proc: true }, 0); } };
      ACT.killBoss = () => { const b = G.bosses.active; if (b && !b.dead) { if (b.parts) for (const p of b.parts) p.hp = 0; b.hp = 0; b.kill(); } };
      ACT.codex = () => { const c = G.save.data.codex; for (const e of G.ENEMIES) c.enemies[e.id] = 1; for (const b of G.BOSSES) c.bosses[b.id] = 1; for (const b of G.BUFFS) c.buffs[b.id] = 1; for (const a of [].concat(G.WEAPONS, G.MELEE, G.ATTACHMENTS, G.ITEMS, G.SKILLS)) c.items[a.id] = 1; G.save.data.records.bestArea = Math.max(G.save.data.records.bestArea || 0, 300); G.save.write(); toast('図鑑を全開放'); };
      ACT.tut = () => { if (panel) panel.remove(); panel = null; back = null; G.Tutorial && G.Tutorial.start ? G.Tutorial.start() : toast('チュートリアルなし'); };
      ACT.off = () => { D.disable(); D.close(); G.ui.toast('🛠 デバッグモードを終了しました', 'good'); };
      const bosses = G.BOSSES.map((b) => `<option value="${b.id}">${b.icon || '👿'} ${esc(b.name)}</option>`).join('');
      return `${sec('ラン')}
        <div class="dv-row">難易度 <select id="dv-diff">${['easy', 'normal', 'hard'].map((k) => `<option value="${k}:0" ${G.Run.cur.id === k ? 'selected' : ''}>${G.Run.DIFFS[k].name}</option>`).join('')}${Array.from({ length: 10 }, (_, i) => `<option value="extra:${i + 1}" ${G.Run.cur.id === 'extra' && G.Run.cur.lv === i + 1 ? 'selected' : ''}>エクストラ${i + 1}</option>`).join('')}</select></div>
        <div class="dv-row">${btn('start', '▶ 新しいランを開始')}</div>
        ${inRun() ? `${sec('エリア移動')}
        <div class="dv-row">エリア ${num('dv-area', GM.area || 1)} 種類 <select id="dv-kind">${AREA_KINDS.map((k) => `<option value="${k}" ${k === GM.stage ? 'selected' : ''}>${kindName(k)}</option>`).join('')}</select></div>
        <div class="dv-row">ボス <select id="dv-boss"><option value="">（エリア番号どおり）</option>${bosses}</select> ${btn('go', '🚪 移動', 'pri')}</div>
        <div class="dv-row">${btn('next', '⏭ 次のエリア')}${GM.stage === 'boss' ? btn('bossNow', '⚔ ボス戦を開始') : ''}${btn('clear', '✅ エリアクリア')}${btn('gates', '🚪 門を開く')}</div>
        ${sec('戦闘')}
        <div class="dv-row">${btn('heal', '❤️ 全回復・状態異常解除')}${btn('kill', '💀 敵を全滅')}${btn('killBoss', '👑 ボスを倒す')}</div>
        <div class="dv-row">${tog('god', '無敵')}${tog('oneHit', '一撃必殺')}${tog('noCd', 'クールタイムなし')}${tog('freeze', '敵を停止')}</div>
        <div class="dv-row">ゲーム速度 ${[0.25, 0.5, 1, 2, 4].map((v) => `<button class="dv-b${GM.dev.speed === v ? ' pri' : ''}" data-speed="${v}">×${v}</button>`).join('')}</div>` : '<div class="dv-note">ランを開始すると、エリア移動・能力値・装備などのタブが使えます。</div>'}
        ${sec('その他')}
        <div class="dv-row">${btn('codex', '📖 図鑑を全開放')}${btn('unlockAll', '🔓 全難易度を解放')}${btn('off', '⏏ デバッグモード終了', 'warn')}</div>
        <div class="dv-note">F9 でいつでもこのパネルを開閉できます。デバッグを使ったランは記録に残りません。</div>`;
    }
    if (tab === 'stat') {
      ACT.setBasic = () => {
        const g = (id) => +panel.querySelector('#' + id).value;
        P.permMaxHp = g('dv-pmh'); P.recalc(); P.hp = Math.min(P.stats.maxHp, Math.max(1, g('dv-hp'))); P.os = Math.max(0, g('dv-os'));
        GM.run.coins = Math.max(0, g('dv-coin') | 0); P.revives = Math.max(0, g('dv-rev') | 0); P.pileTome = Math.max(0, g('dv-pile') | 0);
        toast('基本値を反映');
      };
      ACT.addCoin = () => { GM.run.coins += 10000; };
      ACT.resetMods = () => { P.devMods = {}; P.recalc(); };
      const keys = Object.keys(G.PLAYER_BASE);
      ACT.setStats = () => {
        P.devMods = P.devMods || {};
        for (const k of keys) {
          const el = panel.querySelector('#dvs-' + k); if (!el) continue;
          const want = +el.value; if (!isFinite(want)) continue;
          if (k === 'maxHp') continue; // max HP: use the permanent bonus above
          const cur = P.stats[k], mod = P.devMods[k] || 0;
          if (Math.abs(want - cur) > 1e-9) P.devMods[k] = mod + (want - cur);
        }
        P.recalc(); toast('能力値を反映');
      };
      const SN = G.STAT_NAMES;
      const rows = keys.filter((k) => k !== 'maxHp' && (!query.stat || k.toLowerCase().includes(query.stat.toLowerCase()) || (SN[k] && SN[k][1].includes(query.stat)))).map((k) => `<div class="dv-st"><span>${SN[k] ? SN[k][0] + ' ' + SN[k][1] : ''}<small>${k}</small></span>${num('dvs-' + k, +(+P.stats[k]).toFixed(4), 0.01)}${P.devMods && P.devMods[k] ? '<em>✎</em>' : ''}</div>`).join('');
      return `${sec('基本')}
        <div class="dv-grid">
          <label>HP ${num('dv-hp', Math.ceil(P.hp))}</label><label>最大HP永続ボーナス ${num('dv-pmh', P.permMaxHp || 0)}</label>
          <label>オーバーシールド ${num('dv-os', Math.ceil(P.os || 0))}</label><label>コイン ${num('dv-coin', GM.run.coins)}</label>
          <label>魂の灯火 ${num('dv-rev', P.revives || 0)}</label><label>パイル書Lv ${num('dv-pile', P.pileTome || 0)}</label>
        </div>
        <div class="dv-row">${btn('setBasic', '✔ 反映', 'pri')}${btn('addCoin', '🪙 +10,000')}<span class="dv-note">最大HP: ${P.stats.maxHp}・パイルLv: ${P.pileLevel()}</span></div>
        ${sec('全能力値（最終値を入力 → 反映）')}
        <div class="dv-row">${search('stat', '能力値を絞り込み')}${btn('setStats', '✔ 反映', 'pri')}${btn('resetMods', '↺ 変更を戻す')}</div>
        <div class="dv-stats">${rows}</div>`;
    }
    if (tab === 'gear') {
      const cur = P.weapons;
      cur.forEach((w, i) => {
        ACT['wl+' + i] = () => { w.lv = Math.min(G.Areas.FORGE_MAX, (w.lv || 0) + 1); w.ver++; G.weapons.dirty = true; };
        ACT['wl-' + i] = () => { w.lv = Math.max(0, (w.lv || 0) - 1); w.ver++; G.weapons.dirty = true; };
        ACT['wx' + i] = () => { if (P.weapons.length > 1) { GM.stashAtts(w); P.weapons.splice(i, 1); P.wIdx = 0; G.weapons.equip(false); } };
      });
      ACT['ml+'] = () => { P.melee.lv = Math.min(G.Areas.FORGE_MAX, (P.melee.lv || 0) + 1); G.weapons.dirty = true; };
      ACT['ml-'] = () => { P.melee.lv = Math.max(0, (P.melee.lv || 0) - 1); G.weapons.dirty = true; };
      const wl = G.WEAPONS.filter((o) => match('w', o)).map((o) => { ACT['gw-' + o.id] = () => GM.giveWeapon(o.id); return `<div class="dv-it" style="--rc:${R(o.rarity)}"><span>${o.icon} ${esc(o.name)} <small>${esc(o.cat || '')}</small></span>${btn('gw-' + o.id, '入手')}</div>`; }).join('');
      const ml = G.MELEE.filter((o) => match('m', o)).map((o) => { ACT['gm-' + o.id] = () => { G.Pawn.tradeIn(P.melee, true); P.melee = G.weapons.makeMelee(o.id); if (P.meleeMode) G.weapons.melee.equip(false); }; return `<div class="dv-it" style="--rc:${R(o.rarity)}"><span>${o.icon} ${esc(o.name)}</span>${btn('gm-' + o.id, '装備')}</div>`; }).join('');
      const al = G.ATTACHMENTS.filter((o) => match('a', o)).map((o) => {
        ACT['ga-' + o.id] = () => { const w = P.weapon; if (w && o.compat(w.def)) { if (w.atts[o.slot]) P.attStash.push(w.atts[o.slot]); w.atts[o.slot] = o.id; w.ver++; G.weapons.equip(true); } else toast('今の武器には付かない'); };
        ACT['gs-' + o.id] = () => P.attStash.push(o.id);
        return `<div class="dv-it" style="--rc:${R(o.rarity)}"><span>${o.icon} ${esc(o.name)} <small>${G.ATT_SLOTS[o.slot].name}</small></span>${btn('ga-' + o.id, '装着')}${btn('gs-' + o.id, 'インベントリ')}</div>`;
      }).join('');
      return `${sec('所持武器')}
        ${cur.map((w, i) => `<div class="dv-it" style="--rc:${R(w.def.rarity)}"><span>${i === P.wIdx ? '▶ ' : ''}${w.def.icon} ${esc(w.def.name)} <b>Lv${w.lv || 0}</b></span>${btn('wl-' + i, '−')}${btn('wl+' + i, '+')}${btn('wx' + i, '捨てる', 'warn')}</div>`).join('')}
        <div class="dv-it"><span>🗡️ ${esc(P.melee.def.name)} <b>Lv${P.melee.lv || 0}</b></span>${btn('ml-', '−')}${btn('ml+', '+')}</div>
        ${sec('銃')}${search('w', '銃を検索')}<div class="dv-list">${wl}</div>
        ${sec('近接武器')}${search('m', '近接武器を検索')}<div class="dv-list">${ml}</div>
        ${sec('アタッチメント（手に持つ銃へ）')}${search('a', 'アタッチメントを検索')}<div class="dv-list">${al}</div>`;
    }
    if (tab === 'skill') {
      const slotRow = (i) => {
        const sk = P.skills[i], key = G.input.skillKey(i);
        ACT['sl+' + i] = () => { if (P.skills[i]) P.skills[i].lv = (P.skills[i].lv || 0) + 1; };
        ACT['sl-' + i] = () => { if (P.skills[i]) P.skills[i].lv = Math.max(0, (P.skills[i].lv || 0) - 1); };
        ACT['sx' + i] = () => { if (i > 0) P.skills[i] = null; };
        ACT['sc' + i] = () => { if (P.skills[i]) { P.skills[i].cd = 0; if (P.skills[i].maxCharges) P.skills[i].charges = P.skills[i].maxCharges; } };
        return `<div class="dv-it"><span><b>[${key}]</b> ${sk ? sk.def.icon + ' ' + esc(sk.def.name) + ` <b>Lv${sk.lv || 0}</b>` : '— 空き —'}</span>${sk ? btn('sl-' + i, '−') + btn('sl+' + i, '+') + btn('sc' + i, 'CT解除') : ''}${i > 0 && sk ? btn('sx' + i, '外す', 'warn') : ''}</div>`;
      };
      const list = (arr, isUlt) => arr.filter((o) => match('s', o)).map((o) => {
        if (isUlt) { ACT['su-' + o.id] = () => { P.skills[0] = G.abilities.makeSlot(o.id); }; return `<div class="dv-it" style="--rc:${R(o.rarity)}"><span>${o.icon} ${esc(o.name)}</span>${btn('su-' + o.id, '[' + G.input.skillKey(0) + '] に装備')}</div>`; }
        for (const i of [1, 2, 3]) ACT[`ss${i}-` + o.id] = () => { P.skills[i] = G.abilities.makeSlot(o.id); };
        return `<div class="dv-it" style="--rc:${R(o.rarity)}"><span>${o.icon} ${esc(o.name)}</span>${[1, 2, 3].map((i) => btn(`ss${i}-` + o.id, G.input.skillKey(i))).join('')}</div>`;
      }).join('');
      return `${sec('スロット')}${[0, 1, 2, 3].map(slotRow).join('')}
        <div class="dv-note">スキル強化（各スキル専用の加護）は「加護」タブで「skill」や名前で検索できます。</div>
        ${search('s', 'スキル・アルティメットを検索')}
        ${sec('アルティメット')}<div class="dv-list">${list(G.ULTS, true)}</div>
        ${sec('スキル')}<div class="dv-list">${list(G.SKILLS.filter((s) => !s.ult), false)}</div>`;
    }
    if (tab === 'buff') {
      const cats = [...new Set(G.BUFFS.map((b) => b.cat))];
      const fc = query.bcat || '';
      ACT.clearBuffs = () => { P.buffs.clear(); P.buffState = {}; P.recalc(); };
      const rows = G.BUFFS.filter((b) => (!fc || b.cat === fc) && match('b', b)).map((b) => {
        const n = P.buffs.get(b.id) || 0;
        ACT['b+' + b.id] = () => { if (b.cat === 'relic' && !n && GM.relicCount() >= 3) toast('遺物は3つまで（上限無視で追加）'); P.addBuff(b.id); };
        ACT['b-' + b.id] = () => { const c = P.buffs.get(b.id) || 0; if (c > 1) P.buffs.set(b.id, c - 1); else P.buffs.delete(b.id); P.recalc(); };
        return `<div class="dv-it${n ? ' own' : ''}" style="--rc:${R(b.rarity)}" title="${esc(b.desc)}"><span>${b.icon} ${esc(b.name)} <small>${b.cat}${b.skill ? '·' + b.skill : ''}</small>${n ? ` <b>×${n}</b>` : ''}</span>${n ? btn('b-' + b.id, '−') : ''}${btn('b+' + b.id, '+')}</div>`;
      }).join('');
      return `${sec(`加護（所持 ${P.buffs.size}）`)}
        <div class="dv-row">${search('b', '名前・効果・id で検索')}<select id="dv-bcat"><option value="">全カテゴリ</option>${cats.map((c) => `<option ${c === fc ? 'selected' : ''}>${c}</option>`).join('')}</select>${btn('clearBuffs', '全て外す', 'warn')}</div>
        <div class="dv-list tall">${rows}</div>`;
    }
    if (tab === 'item') {
      const rows = G.ITEMS.filter((o) => match('i', o)).map((o) => {
        const n = o.cat === 'grenade' ? P.grenades[o.id] || 0 : P.itemCount(o.id);
        ACT['i1-' + o.id] = () => P.addItem(o.id, 1);
        ACT['i5-' + o.id] = () => { for (let k = 0; k < 5; k++) P.addItem(o.id, 1); };
        ACT['i0-' + o.id] = () => { { let g = 99; while (P.itemCount(o.id) > 0 && g-- > 0) P.takeItem(o.id); } };
        return `<div class="dv-it" style="--rc:${R(o.rarity)}" title="${esc(o.desc)}"><span>${o.icon} ${esc(o.name)} <small>${esc(o.cat || '')}</small>${n ? ` <b>×${n}</b>` : ''}</span>${btn('i1-' + o.id, '+1')}${btn('i5-' + o.id, '+5')}${n ? btn('i0-' + o.id, '0', 'warn') : ''}</div>`;
      }).join('');
      const ar = G.ARMOR.filter((o) => match('i', o)).map((o) => { ACT['ar-' + o.id] = () => G.Inv.give(P, 'armor', o.id, 1); ACT['are-' + o.id] = () => { const it = G.Inv.makeArmor(o.id); G.Inv.equip(P, it, null); }; return `<div class="dv-it" style="--rc:${R(o.rarity)}" title="${esc(o.desc)}"><span>${o.icon} ${esc(o.name)} <small>🛡${o.def} ⚖${o.weight}</small></span>${btn('ar-' + o.id, 'インベントリへ')}${btn('are-' + o.id, '装備')}</div>`; }).join('');
      const vl = G.VALUABLES.filter((o) => match('i', o)).map((o) => { ACT['vl-' + o.id] = () => G.Inv.give(P, 'valuable', o.id, 1); return `<div class="dv-it" style="--rc:${R(o.rarity)}"><span>${o.icon} ${esc(o.name)} <small>${o.value}🪙</small></span>${btn('vl-' + o.id, '+1')}</div>`; }).join('');
      ACT.clearBag = () => { P.bag.items = []; for (const k in P.spec || {}) P.spec[k].items = []; G.Inv.changed(P.bag); };
      ACT.openInv = () => { D.close(); setTimeout(() => G.InvUI.open(null), 50); };
      return `${sec('インベントリ')}<div class="dv-row">${btn('openInv', '🎒 インベントリを開く')}${btn('clearBag', 'インベントリを空にする', 'warn')}</div>${search('i', 'アイテム・防具・金品を検索')}
        ${sec('アイテム')}<div class="dv-list">${rows}</div>${sec('防具（125種）')}<div class="dv-list">${ar}</div>${sec('金品')}<div class="dv-list">${vl}</div>`;
    }
    if (tab === 'spawn') {
      const ensSel = query.en || G.ENEMIES[0].id;
      ACT.spawn = () => {
        const def = G.ENEMY_BY_ID[panel.querySelector('#dv-en').value];
        const n = Math.max(1, Math.min(30, +panel.querySelector('#dv-ecount').value | 0)), lv = Math.max(1, +panel.querySelector('#dv-elv').value | 0);
        const el = panel.querySelector('#dv-eelite').checked, ch = panel.querySelector('#dv-echamp').checked, mk = panel.querySelector('#dv-emark').checked;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2, r = n > 1 ? 2.5 : 0;
          const p = aim.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
          const g = G.world.groundAt(V(p.x, p.y + 2, p.z), 0.4, 20); if (g > -Infinity) p.y = g;
          if (def.flyer) p.y += 3;
          const e = G.enemies.spawn(def, lv, p, { elite: el || ch, hpMul: (GM.areaMods ? GM.areaMods.hp : 1) * (ch ? 2.2 : 1), scale: ch ? 1.3 : 1 });
          if (!e) continue;
          if (ch) { e.champion = true; e.makeCurseRing(0xff3018); e.def = Object.assign({}, e.def, { name: '覇者・' + e.def.name }); }
          if (mk) { e.marked = true; e.markTarget(ch); }
          G.Depth.onSpawn(e, {});
        }
        toast(`${def.name} ×${n} を出現（Lv${lv}）`);
      };
      ACT.tele = () => { P.pos.copy(aim); P.vel.set(0, 0, 0); };
      ACT.kill2 = () => { for (const e of G.enemies.list) if (e.alive && !e.boss) { e.hp = 0; G.combat.killEnemy(e, { src: 'clear', proc: true }, 0); } };
      ACT.mimic = () => { if (G.Props.chest) G.Props.chest(G.world, aim.x, aim.z, 0, 0, 2); };
      const opts = G.ENEMIES.filter((e) => match('e', e)).map((e) => `<option value="${e.id}" ${e.id === ensSel ? 'selected' : ''}>${e.icon || ''} ${esc(e.name)}${e.special ? '（特殊）' : ''} [${e.id}]</option>`).join('');
      return `${sec('モンスター（照準の位置に出現）')}
        <div class="dv-row">${search('e', 'モンスターを検索')}</div>
        <div class="dv-row"><select id="dv-en" class="wide">${opts}</select></div>
        <div class="dv-row">数 ${num('dv-ecount', 1)} レベル ${num('dv-elv', Math.max(1, GM.area))}
          <label class="dv-tog"><input type="checkbox" id="dv-eelite"> 精鋭</label><label class="dv-tog"><input type="checkbox" id="dv-echamp"> 覇者</label><label class="dv-tog"><input type="checkbox" id="dv-emark"> 標的</label></div>
        <div class="dv-row">${btn('spawn', '👹 出現', 'pri')}${btn('kill2', '💀 全滅')}${btn('tele', '🌀 照準位置へテレポート')}${btn('mimic', '🎁 宝箱（豪華）を置く')}</div>
        <div class="dv-note">ボスと戦うには「ラン」タブでボス・種類「守護者の間」を選んで移動してください。</div>`;
    }
    if (tab === 'world') {
      const A = G.Depth.ANOMS;
      const rows = A.map((a) => { ACT['an-' + a.id] = () => { const C = G.Depth.cur || (G.Depth.cur = { list: [], t: 0 }); if (!C.list.includes(a.id)) { C.list.push(a.id); G.Depth['start_' + a.id] && G.Depth['start_' + a.id](C); } G.HudX.anomalyAlert([a.id]); }; return `<div class="dv-it"><span>${a.icon} ${esc(a.name)} <small>${esc(a.desc)}</small></span>${btn('an-' + a.id, '発生')}</div>`; }).join('');
      ACT.reward = () => GM.offerBuffs(false, {});
      ACT.boost = () => GM.offerBuffs(true, {});
      ACT.shop = () => G.Areas.spawnMiniShop && G.Areas.spawnMiniShop(true);
      ACT.dawn = () => GM.startDawn && GM.startDawn();
      return `${sec('報酬・施設')}
        <div class="dv-row">${btn('reward', '🌟 加護選択を出す')}${btn('boost', '👑 強大な加護選択')}${btn('shop', '🛒 ミニショップを出す')}${btn('dawn', '🌅 夜明け演出')}</div>
        ${sec('異変（このエリアに追加）')}<div class="dv-list">${rows}</div>`;
    }
    return '';
  }
  function wire() {
    panel.querySelectorAll('[data-act]').forEach((el) => { const f = ACT[el.dataset.act]; if (f) el.onclick = act(f); });
    panel.querySelectorAll('[data-tog]').forEach((el) => el.onchange = () => { GM.dev[el.dataset.tog] = el.checked; if (GM.run) GM.run.dev = true; });
    panel.querySelectorAll('[data-speed]').forEach((el) => el.onclick = () => { GM.dev.speed = +el.dataset.speed; render(); });
    panel.querySelectorAll('[data-q]').forEach((el) => {
      el.oninput = () => { query[el.dataset.q] = el.value; const pos = el.selectionStart; render(); const n = panel.querySelector(`[data-q="${el.dataset.q}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    });
    const bc = panel.querySelector('#dv-bcat'); if (bc) bc.onchange = () => { query.bcat = bc.value; render(); };
    const en = panel.querySelector('#dv-en'); if (en) en.onchange = () => { query.en = en.value; };
    // typing in the panel must not drive the game
    panel.querySelectorAll('input, select').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
  }

  // ---------------- hooks into the game ----------------
  const BS = G.bosses;
  const origFor = BS.forArea;
  BS.forArea = function (n) { return G.game && G.game.stage === 'boss' && D.bossOverride && n === D.bossArea ? D.bossOverride : origFor(n); };
})();
