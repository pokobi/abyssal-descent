'use strict';
// Classes: what a run starts with (a common gun and melee weapon, one uncommon skill, one epic ultimate), one strength and one weakness,
// the grapple's cooldown, what turns up a little more often (x1.3), and how the character looks in third person (js/avatar.js, the co-op bodies).
// Every class starts equally strong; only the direction differs. Chosen after the difficulty; the last choice is remembered.
(function () {
  const CL = (G.Classes = {});
  CL.LIST = [
    { id: 'soldier', name: '兵士', icon: '🪖', col: '#9ab070', gun: 'a_ranger', melee: 'm_basic', skill: 'spear', ult: 'ult_armory', grapple: 18,
      mods: { reloadSpeed: 0.15, magSize: 0.15 }, plus: 'リロード速度+15%、装弾数+15%', minus: 'なし', favName: 'なし', fav: null,
      look: 'オリーブ色の戦闘服とヘルメット', role: '何でもこなす基準のクラス' },
    { id: 'assault', name: '突撃兵', icon: '💨', col: '#ff6a50', gun: 's_wasp', melee: 'm_basic', skill: 'dash', ult: 'ult_berserk', grapple: 15,
      mods: { moveSpeed: 0.05 }, near: 0.15, far: -0.15, plus: '10m以内の敵への与ダメ+15%、移動速度+5%', minus: '20m以上の敵への与ダメ-15%', favName: 'SMG・ショットガン',
      fav: (o) => o.kind === 'weapon' && (o.arch === 'smg' || o.arch === 'shotgun' || o.arch === 'autoshotgun'), look: '赤いバンダナとゴーグルの軽装', role: '近距離で暴れる' },
    { id: 'sniper', name: '狙撃手', icon: '🎯', col: '#7ac070', gun: 'n_scout', melee: 'm_basic', skill: 'decoy', ult: 'ult_shadow', grapple: 18,
      mods: { headMul: 0.3, maxHp: -10 }, plus: 'ヘッドショット倍率+30%', minus: '最大HP-10', favName: '狙撃銃・DMR',
      fav: (o) => o.kind === 'weapon' && (o.arch === 'sniper' || o.arch === 'dmr'), look: '緑のフード付きマントとマスク', role: '遠くから急所を撃つ' },
    { id: 'blade', name: '剣士', icon: '⚔️', col: '#c4a0f0', gun: 'p_viper', melee: 'm_machete', skill: 'haste', ult: 'ult_bladestorm', grapple: 15,
      mods: { meleeDmg: 0.2, guardHp: 0.3, magSize: -0.25 }, plus: '近接与ダメ+20%、ガードの耐久+30%', minus: '銃の装弾数-25%', favName: '近接武器',
      fav: (o) => o.kind === 'melee', look: '羽織と袴、鉢巻、背中に鞘', role: '近接で斬り込む' },
    { id: 'heavy', name: '重装兵', icon: '🛡️', col: '#e0b050', gun: 'g_breacher', melee: 'm_woodshield', skill: 'thornarmor', ult: 'ult_bastion', grapple: 28,
      mods: { maxHp: 30, armor: 0.1, moveSpeed: -0.08 }, plus: '最大HP+30、被ダメ-10%', minus: '移動速度-8%', favName: '防具・盾',
      fav: (o) => o.kind === 'armor' || (o.kind === 'melee' && !!o.guard && o.guard[0] >= 0.75), look: '板金の鎧と大きな肩当て、顔まで覆う兜', role: '前に立って受け止める' },
    { id: 'mage', name: '術士', icon: '🔮', col: '#7a9aff', gun: 't_rivet', atts: { core: 'c_water' }, melee: 'm_basic', skill: 'fireball', ult: 'ult_tsunami', grapple: 20,
      mods: { elMastery: 80, elIcd: 0.4, maxHp: -15 }, plus: '属性熟練+80、武器の属性付与の間隔1.5秒', minus: '最大HP-15', favName: '属性コア・属性のスキル',
      fav: (o) => (o.kind === 'attachment' && o.slot === 'core') || (o.kind === 'skill' && G.Elem && !!G.Elem.skEl(o.id)), look: 'フード付きのローブ。まわりに属性の光球が浮く', role: '属性反応で崩す' },
  ];
  CL.BY = Object.fromEntries(CL.LIST.map((c) => [c.id, c]));
  CL.DEFAULT = 'soldier';
  CL.of = (id) => CL.BY[id] || CL.BY[CL.DEFAULT];
  CL.last = () => { const s = G.save && G.save.data.settings; return s && CL.BY[s.lastClass] ? s.lastClass : CL.DEFAULT; };
  CL.remember = (id) => { if (!CL.BY[id] || !G.save) return; G.save.data.settings.lastClass = id; G.save.write(); };

  // the starting kit (called by Player.resetRun)
  CL.kit = function (P) {
    const c = CL.of(P.cls);
    const w = G.weapons.make(c.gun); w.kit = true;
    if (c.atts) { Object.assign(w.atts, c.atts); w.ver++; w.mag = G.weapons.stats(w).mag; }
    P.weapons = [w];
    P.melee = G.weapons.makeMelee(c.melee); P.melee.kit = true;
    P.skills = [G.abilities.makeSlot(c.ult), G.abilities.makeSlot(c.skill), null, null];
    P.skills[0].kit = true; P.skills[1].kit = true;
    P.kitAtts = Object.values(c.atts || {}); // (the mage's water core sells for nothing, once)
  };
  // the class's strength / weakness as stats (folded in by Player.recalc), the grapple's own cooldown
  CL.mods = function (P) { const c = CL.of(P.cls); return Object.assign({ grappleBase: c.grapple }, c.mods); };
  // 突撃兵: near / far
  CL.dmgAdd = function (P, dist) {
    const c = CL.of(P.cls);
    if (c.near && dist <= 10) return c.near;
    if (c.far && dist >= 20) return c.far;
    return 0;
  };
  // what turns up more often for the class (x1.3)
  CL.weight = function (o) { const c = G.player && CL.of(G.player.cls); return c && c.fav && o && c.fav(o) ? 1.3 : 1; };
  CL.pick = function (r, list) { if (!list.length) return undefined; if (list.every((o) => CL.weight(o) === 1)) return r.pick(list); return r.weighted(list, (o) => CL.weight(o)); };
  // the 不屈の城塞 of a team-mate near you takes a quarter off what you suffer (co-op hooks this in)
  CL.allyGuard = () => false;

  // ---------------- the choice: a list on the left, the chosen class on the right (a turning 3D figure, its kit, its numbers) ----------------
  const U = G.U;
  const esc = (t) => U.esc(String(t == null ? '' : t));
  const BASE_HP = 100;
  // the stats a class starts a run with: the player's base stats with the class folded in the way Player.recalc does it (no gear, no boons)
  CL.stats = function (c) {
    const s = Object.assign({}, G.PLAYER_BASE), m = CL.mods({ cls: c.id });
    for (const k in m) if (typeof m[k] === 'number') s[k] = (s[k] || 0) + m[k];
    s.maxHp = Math.max(10, Math.round(s.maxHp * Math.max(0.2, 1 + (s.maxHpPct || 0))));
    return s;
  };
  // the numbers on the class screen come from the same functions the game uses
  CL.numbers = function (c) {
    const s = CL.stats(c);
    return { hp: s.maxHp, move: Math.round((1 + (s.moveSpeed || 0)) * 100), grapple: Math.round(G.grappleCdOf(s) * 10) / 10 };
  };
  const wDef = (id) => G.WEAPON_BY_ID[id] || G.MELEE_BY_ID[id];
  const sk = (id) => G.SKILL_BY_ID[id] || (G.ULTS || []).find((u) => u.id === id) || { name: id, icon: '', desc: '' };
  const rec = (c) => { const r = G.save && G.save.data.records.byClass && G.save.data.records.byClass[c.id]; if (!r) return '—'; const cl = Object.keys(r.clears || {}).filter((k) => G.Run.DIFFS[k]).map((k) => G.Run.DIFFS[k].name).join('・'); return `最深エリア ${r.bestArea}${cl ? `／クリア ${cl}` : ''}`; };
  const bar = (label, v, lo, hi, txt, good) => { const k = Math.max(0.04, Math.min(1, (v - lo) / (hi - lo))); return `<div class="cls-bar"><span>${label}</span><i><b style="width:${(k * 100).toFixed(0)}%;background:${good ? 'var(--cc)' : '#c06050'}"></b></i><em>${txt}</em></div>`; };
  CL.detailHTML = function (c) {
    const n = CL.numbers(c), g = wDef(c.gun), mel = wDef(c.melee);
    const core = c.atts && c.atts.core && G.ATT_BY_ID[c.atts.core];
    const R = (r) => (G.RARITY[r] ? G.RARITY[r].color : '#ccc');
    const kitRow = (tag, icon, name, rar, sub) => `<div class="cls-kit"><span class="cls-tag">${tag}</span><span class="cls-kic">${icon}</span><div><b style="color:${R(rar)}">${esc(name)}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    // the skill and the ultimate: the status screen's own card for them (its cooldown, damage, range and the numbers in the text are the game's)
    const st = CL.stats(c);
    const skRow = (tag, id, ult) => { let card = ''; try { card = G.StatusUI.previewSkill(id, st); } catch (e) { const d = sk(id); card = `<div class="sc"><div class="sc-d">${esc(d.desc)}</div></div>`; } return `<div class="cls-skill${ult ? ' ult' : ''}"><span class="cls-tag">${tag}</span>${card}</div>`; };
    return `<div class="cls-head"><span class="cls-big">${c.icon}</span><div><div class="cls-title">${c.name}</div><div class="cls-sub">${esc(c.role)}</div></div></div>
      <div class="cls-cols">
        <div class="cls-col">
          <div class="cls-sec">装備</div>
          ${kitRow('銃', g.icon || '🔫', g.name, g.rarity, esc(g.cat || '') + (core ? `・${core.icon}${core.name}付き` : ''))}
          ${kitRow('近接', mel.icon || '🗡️', mel.name, mel.rarity, esc(mel.cat || ''))}
          <div class="cls-sec">スキル</div>
          ${skRow('スキル', c.skill, false)}
          ${skRow('アルティメット', c.ult, true)}
        </div>
        <div class="cls-col">
          <div class="cls-sec">特性</div>
          <div class="cls-trait up"><span>▲ 長所</span>${esc(c.plus)}</div>
          <div class="cls-trait dn"><span>▼ 短所</span>${esc(c.minus)}</div>
          <div class="cls-sec">能力</div>
          ${bar('最大HP', n.hp, 70, 140, n.hp, n.hp >= BASE_HP)}
          ${bar('移動速度', n.move, 85, 110, n.move + '%', n.move >= 100)}
          ${bar('グラップル', 32 - n.grapple, 0, 18, 'CT ' + n.grapple + '秒', n.grapple <= 18)}
          <div class="cls-sec">その他</div>
          <div class="cls-kv"><span>出やすい物</span><b>${esc(c.favName)}</b></div>
          <div class="cls-kv"><span>見た目</span><b>${esc(c.look)}</b></div>
          <div class="cls-kv"><span>記録</span><b>${esc(rec(c))}</b></div>
        </div>
      </div>`;
  };
  // the preview: its own small renderer (made once, its canvas moved into each screen), a figure in the class's clothes holding its gun, slowly turning (drag to turn it)
  const PV = { r: null, cv: null, scene: null, cam: null, fig: null, raf: 0, yaw: 0.5, drag: null };
  function pvInit() {
    if (PV.r) return true;
    try { PV.cv = document.createElement('canvas'); PV.cv.className = 'cls-cv'; PV.r = new THREE.WebGLRenderer({ canvas: PV.cv, antialias: true, alpha: true }); } catch (e) { PV.r = null; return false; }
    PV.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); PV.r.outputColorSpace = THREE.SRGBColorSpace; PV.r.toneMapping = THREE.ACESFilmicToneMapping;
    PV.scene = new THREE.Scene();
    PV.scene.add(new THREE.HemisphereLight(0xd8d0c4, 0x3a3228, 2.2));
    const key = new THREE.DirectionalLight(0xffe8d0, 3.2); key.position.set(2.5, 3.5, 3); PV.scene.add(key);
    PV.rim = new THREE.DirectionalLight(0xffffff, 2.4); PV.rim.position.set(-3, 2, -3); PV.scene.add(PV.rim);
    PV.disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
    PV.disc.rotation.x = -Math.PI / 2; PV.disc.position.y = 0.005; PV.scene.add(PV.disc);
    PV.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    // something for the metal to reflect (a dim room with a warm light above): without it plate and steel come out black
    try {
      const env = new THREE.Scene(), pm = new THREE.PMREMGenerator(PV.r);
      env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8a7f6c, side: THREE.BackSide })));
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d8 })); lamp.position.set(0, 8, 2); lamp.rotation.x = Math.PI / 2; env.add(lamp);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x9a9080 })); side.position.set(-8, 2, 0); side.rotation.y = Math.PI / 2; env.add(side);
      PV.scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose();
    } catch (e) { /* plain lights only */ }
    return true;
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function figureOf(c) {
    const F = G.avatar.buildFigure(), J = F.J;
    G.avatar.dress(J, c.id);
    // an easy stance: the gun held across the body
    J.arms[1].sh.rotation.set(-0.5, 0, 0.12); J.arms[1].el.rotation.set(-0.55, 0, 0);
    J.arms[0].sh.rotation.set(-0.35, 0, -0.2); J.arms[0].el.rotation.set(-0.6, 0, 0);
    J.legs[0].hip.rotation.x = 0.08; J.legs[1].hip.rotation.x = -0.08;
    try {
      const d = G.WEAPON_BY_ID[c.gun], g = G.weapons.displayModel(d, c.atts || {});
      const w = new THREE.Group(); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); w.add(g);
      w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(-1, 0, 0), V3(0, 0, 1), V3(0, 1, 0)));
      const hold = new THREE.Group(); hold.position.set(0, -0.02, 0.06); J.arms[1].hand.add(hold); hold.add(w);
    } catch (e) { /* the figure without a gun is still worth showing */ }
    // the heavy's shield / the swordsman's blade in the other hand
    try {
      if (c.id === 'heavy' || c.id === 'blade') {
        const mm = G.weapons.meleeDisplayModel(G.MELEE_BY_ID[c.melee]);
        const w = new THREE.Group(); w.add(mm); w.rotation.set(Math.PI, 0, 0); w.scale.setScalar(0.9);
        const h = new THREE.Group(); h.position.set(0, -0.02, 0.06); J.arms[0].hand.add(h); h.add(w);
      }
    } catch (e) { /* likewise */ }
    F.root.traverse((o) => { o.frustumCulled = false; });
    return F;
  }
  function pvShow(c, host) {
    if (!pvInit()) { host.innerHTML = `<div class="cls-noview">${c.icon}</div>`; return; }
    if (PV.cv.parentNode !== host) { host.innerHTML = ''; host.appendChild(PV.cv); }
    if (PV.fig) PV.scene.remove(PV.fig.root);
    PV.fig = figureOf(c); PV.scene.add(PV.fig.root); PV.cls = c;
    PV.disc.material.color.set(c.col); PV.rim.color.set(c.col);
    if (!PV.raf) PV.raf = requestAnimationFrame(pvLoop);
  }
  CL._pv = PV;
  function pvLoop(t) {
    if (!PV.cv || !PV.cv.isConnected) { PV.raf = 0; return; }
    PV.raf = requestAnimationFrame(pvLoop);
    CL.pvFrame(t);
  }
  CL.pvFrame = function (t) {
    const w = PV.cv.clientWidth || 300, h = PV.cv.clientHeight || 400, pr = PV.r.getPixelRatio();
    if (PV.cv.width !== Math.round(w * pr) || PV.cv.height !== Math.round(h * pr)) { PV.r.setSize(w, h, false); PV.cam.aspect = w / h; PV.cam.updateProjectionMatrix(); }
    if (!PV.drag) PV.yaw += 0.006;
    const F = PV.fig; if (!F) return;
    t = t || performance.now();
    F.root.rotation.y = PV.yaw;
    F.J.chest.rotation.y = Math.sin(t / 900) * 0.04; F.J.body.position.y = 0.95 + Math.sin(t / 700) * 0.008;
    if (F.J.orbs) G.avatar.orbTick(F.J, 1 / 60, PV.cls && PV.cls.atts && PV.cls.atts.core ? G.ATT_BY_ID[PV.cls.atts.core].mods.el : null);
    PV.cam.position.set(0, 1.3, 5.6); PV.cam.lookAt(0, 0.95, 0);
    PV.r.render(PV.scene, PV.cam);
  };
  CL.select = function (onPick, back) {
    const UI = G.ui; let cur = CL.last();
    const s = UI.screen(`<div class="cls-wrap"><h2 class="df-title">クラスを選択</h2>
      <div class="cls-main"><div class="cls-list"></div>
        <div class="cls-view"><div class="cls-model"><div class="cls-host"></div><div class="cls-hint">ドラッグで回転</div></div><div class="cls-detail"></div></div></div>
      <div class="cls-foot"><span class="cls-note">始めの装備と方向性が決まります。拾った物はどのクラスでも使えます。</span><span><button class="btn" id="cls-back">↩ 戻る</button> <button class="btn primary" id="cls-go"></button></span></div></div>`, G.game.state === 'title' ? '' : 'solid'); // (from the end of the tutorial: over the game, not see-through)
    const wrap = s.querySelector('.cls-wrap'), list = s.querySelector('.cls-list'), det = s.querySelector('.cls-detail'), host = s.querySelector('.cls-host');
    list.innerHTML = CL.LIST.map((c) => `<button class="cls-item" data-c="${c.id}" style="--cc:${c.col}"><span class="cls-iic">${c.icon}</span><span class="cls-in"><b>${c.name}</b><small>${esc(c.role)}</small></span></button>`).join('');
    const show = () => {
      const c = CL.of(cur);
      list.querySelectorAll('.cls-item').forEach((b) => b.classList.toggle('on', b.dataset.c === cur));
      wrap.style.setProperty('--cc', c.col);
      det.innerHTML = CL.detailHTML(c);
      s.querySelector('#cls-go').textContent = `${c.icon} ${c.name}で始める`;
      pvShow(c, host);
    };
    let onKey = null;
    const done = () => { if (onKey) window.removeEventListener('keydown', onKey, true); onKey = null; };
    const go = () => { done(); CL.remember(cur); G.sfx.ui('select'); onPick(cur); };
    list.querySelectorAll('.cls-item').forEach((b) => { b.onclick = () => { if (cur === b.dataset.c) return; cur = b.dataset.c; G.sfx.ui('click'); show(); }; b.ondblclick = go; });
    onKey = (e) => {
      if (!s.isConnected) { done(); return; }
      const ids = CL.LIST.map((c) => c.id), i = ids.indexOf(cur);
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { cur = ids[(i + 1) % ids.length]; G.sfx.ui('click'); show(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { cur = ids[(i + ids.length - 1) % ids.length]; G.sfx.ui('click'); show(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', onKey, true);
    // drag the figure round
    const md = s.querySelector('.cls-model');
    md.addEventListener('pointerdown', (e) => { PV.drag = { x: e.clientX, y: PV.yaw }; try { md.setPointerCapture(e.pointerId); } catch (er) { /* no capture: fine */ } });
    md.addEventListener('pointermove', (e) => { if (PV.drag) PV.yaw = PV.drag.y + (e.clientX - PV.drag.x) * 0.012; });
    const up = () => { PV.drag = null; }; md.addEventListener('pointerup', up); md.addEventListener('pointercancel', up);
    s.querySelector('#cls-go').onclick = go;
    s.querySelector('#cls-back').onclick = () => { done(); G.sfx.ui('back'); if (back) back(); };
    show();
    return s;
  };
})();
