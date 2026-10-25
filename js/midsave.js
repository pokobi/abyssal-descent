'use strict';
// Mid-area save: snapshots the live state of the current area every few seconds (and when the tab is hidden/closed).
// Normal areas resume exactly where you were (enemies, waves, chests, shop, anomalies...). Boss areas resume at the fortress gate.
// Transient things (projectiles in flight, telegraphs, particles) are not saved.
(function () {
  const MS = (G.MidSave = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let GM, P;
  const r2 = (v) => Math.round(v * 100) / 100;
  const vec = (p) => [r2(p.x), r2(p.y), r2(p.z)];

  MS.init = function () {
    GM = G.game; P = G.player;
    setInterval(() => MS.tick(), 3000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) MS.tick(true); });
    window.addEventListener('pagehide', () => MS.tick(true));
    window.addEventListener('beforeunload', () => MS.tick(true));
  };
  MS.canSave = () => GM && !GM.tutorial && G.world && GM.run && GM.area && !GM.transitioning && !P.dead && ['playing', 'paused', 'resuming', 'modal', 'inv'].includes(GM.state) && GM.stage && GM.stage !== 'title' && !GM._restoring;
  MS.tick = function () {
    if (!MS.canSave()) return;
    try {
      const d = GM.loadRun(); if (!d || d.area !== GM.area) return;
      d.mid = MS.snapshot();
      localStorage.setItem(GM.runKey(), JSON.stringify(d));
    } catch (e) { /* storage unavailable */ }
  };

  // ------------------------------------------------------------------ snapshot
  function objKey(kind, obj) { return obj ? obj.id : null; }
  const serCont = (c) => (c ? { cols: c.cols, rows: c.rows, name: c.name, kind: c.kind, items: c.items.map(G.Inv.ser) } : null);
  const deCont = (o) => {
    if (!o) return null;
    const c = G.Inv.container(o.cols, o.rows, o.name, o.kind);
    for (const s of o.items || []) if (G.Inv.def({ type: s.t, id: s.id })) c.items.push(G.Inv.de(s));
    return c;
  };
  function objByKind(kind, id) {
    if (kind === 'weapon') return G.WEAPON_BY_ID[id];
    if (kind === 'melee') return G.MELEE_BY_ID[id];
    if (kind === 'skill' || kind === 'ult') return G.SKILL_BY_ID[id];
    if (kind === 'armor') return G.ARMOR_BY_ID[id];
    if (kind === 'attachment') return G.ATT_BY_ID[id];
    if (kind === 'item') return G.ITEM_BY_ID[id];
    if (kind === 'buff' || kind === 'relic') return G.BUFF_BY_ID[id];
    if (kind === 'revive') return GM.REVIVE;
    if (kind === 'forge') return GM.SVC_FORGE;
    if (kind === 'tome') return GM.SVC_TOME;
    return null;
  }
  MS.objByKind = objByKind;
  MS.snapshot = function () {
    const w = G.world;
    const S = { area: GM.area, kind: GM.stage, t: Date.now(), run: GM.run, route: GM.route };
    S.player = Object.assign(GM.playerSnap(), {
      pos: vec(P.pos), yaw: r2(P.yaw), pitch: r2(P.pitch),
      st: Object.assign({}, P.st),
      temps: [...P.temps].filter(([, t]) => t.t < 9000).map(([id, t]) => [id, { t: t.t, max: t.max, mods: t.mods, icon: t.icon, label: t.label }]),
      skillCd: P.skills.map((s) => (s ? { cd: s.cd, charges: s.charges } : null)),
      grappleCd: P.grappleCd || 0, pileCd: P.pileCd || 0, pileFree: !!P.pileFree, meleeMode: !!P.meleeMode,
    });
    S.cleared = !!GM.areaCleared;
    S.rewardPending = GM.rewardPending || null;
    // chests first: boss areas need them too (the royal chest dropped by the guardian, road chests)
    const chests = w.interactables.filter((i) => i.type === 'chest');
    const base = w.baseChests || 0;
    S.chests = chests.slice(0, base).map((c) => (c.opened ? 1 : c.trap ? 2 : 0)); // 1 opened, 2 trapped (vault mimics)
    S.extraChests = chests.slice(base).map((c) => ({ x: r2(c.pos.x), y: r2(c.pos.y - 0.5), z: r2(c.pos.z), ry: c.mesh ? r2(c.mesh.rotation.y) : 0, tier: c.tier, opened: !!c.opened, trap: !!c.trap }));
    S.pickups = (G.combat.pickups || []).filter((p) => p.m).map((p) => ({ kind: p.kind, pos: vec(p.m.position), value: p.value }));
    // what is left inside opened chests, the bodies you can still search (and what they hold) and things lying on the floor
    S.chestCont = chests.map((c) => serCont(c.cont));
    S.corpses = G.Inv.corpses.filter((c) => c.e && !c.e.removed && c.e.def && G.ENEMY_BY_ID[c.e.def.id]).map((c) => ({ id: c.e.def.id, lv: c.e.level, pos: vec(c.e.pos), yaw: r2(c.e.yaw), sc: r2((c.e.model && c.e.model.scale || 1) / (c.e.elite ? 1.15 : 1)), searched: !!c.searched, cont: serCont(c.cont) }));
    S.ground = G.Inv.ground.map((g) => ({ it: G.Inv.ser(g.it), pos: vec(g.g.position) }));
    if (GM.stage === 'boss') { S.boss = { engaged: !!GM.bossEngaged }; S.exits = (w.exits || []).map((ex) => ({ type: ex.type || null, open: !!ex.open })); return S; }
    S.elapsed = GM.time - (GM.areaStartT || 0); S.areaDamage = GM.areaDamage || 0; S.areaKills = GM.areaKills || 0; S.areaMods = GM.areaMods;
    const O = GM.objective;
    if (O) {
      S.obj = {};
      for (const k of ['kind', 'killed', 'total', 'spawned', 'wave', 'waveT', 'waveSize', 'waveKilled', 't', 'marked', 'markKilled', 'targets', 'done']) if (O[k] !== undefined && typeof O[k] !== 'function') S.obj[k] = O[k];
      if (O.altars) S.obj.altars = O.altars.map((a) => ({ p: a.p, done: a.done }));
    }
    // enemies (regular ones; allies & boss parts are excluded)
    S.enemies = G.enemies.list.filter((e) => e.alive && !e.custom && !e.ally && !e.stalker && e.def && G.ENEMY_BY_ID[e.def.id]).map((e) => ({
      id: e.def.id, lv: e.level, pos: vec(e.pos), yaw: r2(e.yaw), hp: e.hp, maxHp: e.maxHp, shield: e.shield, maxShield: e.maxShield, dmg: e.dmg, speed: e.speed,
      elite: !!e.elite, em: e.eliteMod && e.eliteMod.id, em2: e.eliteMod2 && e.eliteMod2.id, champ: !!e.champion, cursed: !!e.cursed, marked: !!e.marked,
      mut: e.mut ? Object.keys(e.mut) : null, mutRev: !!e.mutRevived, pileRes: e.pileRes || 0, wf: !!e.waveFoe, wn: e.waveNo || 0,
      noReward: !!e.noReward, revived: !!e.revived, split: !!e.split, sc: r2((e.model && e.model.scale || 1) / (e.elite ? 1.15 : 1)), mimic: e.def.id === 'mimic_gold', gs: !!e.graveSpawn,
    }));
    // world changes
    S.dest = w.destructibles.map((d) => (d.alive ? 1 : 0));
    S.exits = (w.exits || []).map((ex) => ({ type: ex.type || null, open: !!ex.open }));
    if (G.Strata && G.Strata.doors.length) S.doors = G.Strata.saveDoors();
    if (G.Graves && (w.graves || []).length) S.graves = G.Graves.save();
    S.npcs = w.interactables.filter((i) => i.type === 'npc' || i.type === 'shrine').map((i) => !!i.used);
    if (GM.shop) {
      const sh = GM.shop, slots = sh.mini ? w.miniSlots : w.shopSlots;
      S.shop = { mini: !!sh.mini, healUsed: !!sh.healUsed, rerolls: sh.rerolls || 0, offers: sh.offers.map((o) => ({ kind: o.kind, id: objKey(o.kind, o.obj), price: o.price, sold: !!o.sold, lv: o.lv || 0, free: !!o.free, ench: o.inst ? o.inst.ench : null, si: slots ? slots.indexOf(o.slot) : -1 })) };
    }
    if (G.Rooms2) S.rooms = { offerN: G.Rooms2.offerN || 0, lots: G.Rooms2.lots && GM.stage === 'auction' ? G.Rooms2.lots.map((l) => ({ sold: l.sold, price: l.price, rival: l.rival })) : null };
    const A = G.Depth.cur;
    if (A && A.list.length) S.anom = { list: A.list.slice(), stalker: !!(A.stalker && A.stalker.alive), stalkT: A.stalkT, meteorT: A.meteorT, fogs: A.fogs ? A.fogs.map((f) => vec(f.g.position)) : null };
    S.trialRestart = GM.stage === 'trial' && !GM.areaCleared;
    return S;
  };

  // ------------------------------------------------------------------ restore
  MS.apply = function (S) {
    const w = G.world;
    GM._restoring = true;
    try {
      GM.applyPlayerSnap(S.player);
      GM.run = Object.assign(GM.run, S.run, { combo: 0, lastKillT: -10, multiT: -10 });
      if (S.route) GM.route = S.route.slice();
      const pl = S.player;
      P.st = Object.assign({}, pl.st || {});
      P.temps = new Map((pl.temps || []).map(([id, t]) => [id, Object.assign({}, t)])); P.recalc();
      (pl.skillCd || []).forEach((c, i) => { const s = P.skills[i]; if (s && c) { s.cd = c.cd; s.charges = c.charges; s.maxCd = G.abilities.cdOf(s); } });
      P.grappleCd = pl.grappleCd || 0; P.pileCd = pl.pileCd || 0; P.pileFree = !!pl.pileFree;
      P.hp = Math.min(P.stats.maxHp, pl.hp); P.os = pl.os || 0;
      G.weapons.equip(true);
      if (pl.meleeMode) G.weapons.setMelee();
      if (S.kind === 'boss') return applyBoss(S);
      P.pos.set(...pl.pos); P.vel.set(0, 0, 0); P.yaw = pl.yaw; P.pitch = pl.pitch;
      w.depenetrate(P.pos, P.hw, P.height);
      GM.areaStartT = GM.time - (S.elapsed || 0); GM.areaDamage = S.areaDamage || 0; GM.areaKills = S.areaKills || 0;
      if (S.areaMods) GM.areaMods = S.areaMods;
      // objective / waves
      const O = GM.objective;
      if (O && S.obj && !S.trialRestart) {
        for (const k in S.obj) if (k !== 'altars') O[k] = S.obj[k];
        if (O.altars && S.obj.altars) O.altars.forEach((a, i) => { const s = S.obj.altars[i]; if (!s) return; a.p = s.p; a.done = s.done; if (a.done) GM.altarDone(a); else a.fill.scale.setScalar(Math.max(0.01, a.p)); });
      }
      // enemies
      for (const e of G.enemies.list.slice()) if (!e.custom && !e.ally && e.alive) { e.noReward = true; e.alive = false; e.remove && e.remove(); }
      G.enemies.list.splice(0, G.enemies.list.length, ...G.enemies.list.filter((e) => e.custom || e.ally));
      for (const s of S.enemies || []) restoreEnemy(s);
      // chests, destructibles, pickups
      restoreChests(S);
      (S.dest || []).forEach((alive, i) => { const d = w.destructibles[i]; if (d && !alive && d.alive) G.combat.removeDestructibleSilent(d); });
      restorePickups(S);
      if (S.doors) G.Strata.restoreDoors(S.doors);
      if (S.graves) G.Graves.restore(S.graves);
      // NPCs / shrine already used
      const npcs = w.interactables.filter((i) => i.type === 'npc' || i.type === 'shrine');
      (S.npcs || []).forEach((u, i) => { if (npcs[i]) npcs[i].used = u; });
      if (S.rooms && G.Rooms2) { G.Rooms2.offerN = S.rooms.offerN || 0; if (S.rooms.lots && G.Rooms2.lots) S.rooms.lots.forEach((l, i) => { if (G.Rooms2.lots[i]) Object.assign(G.Rooms2.lots[i], l); }); }
      // anomalies
      G.Depth.endArea();
      if (S.anom) {
        const A = (G.Depth.cur = { list: S.anom.list.slice(), t: 0 });
        for (const id of A.list) G.Depth['start_' + id] && G.Depth['start_' + id](A);
        if (A.list.includes('stalker')) A.stalkT = S.anom.stalker ? 0.5 : (S.anom.stalkT ?? A.stalkT);
        if (S.anom.meteorT !== undefined) A.meteorT = S.anom.meteorT;
        if (A.fogs && S.anom.fogs) A.fogs.forEach((f, i) => { if (S.anom.fogs[i]) f.g.position.set(...S.anom.fogs[i]); });
      } else G.Depth.cur = { list: [], t: 0 };
      // shop
      if (S.shop) restoreShop(S.shop);
      // cleared state: gates open with the same destinations, rewards still owed are offered again
      if (S.cleared) {
        GM.areaCleared = true; if (GM.objective) GM.objective.done = true;
        G.Areas.openGates(true, S.exits.map((e) => e.type));
      }
      P.invulnT = Math.max(P.invulnT || 0, 1.5);
      if (S.rewardPending) { GM.rewardPending = S.rewardPending; setTimeout(() => GM.giveReward(GM.rewardPending), 900); }
    } finally { GM._restoring = false; }
  };
  function restoreChests(S) {
    const w = G.world;
    const chests = w.interactables.filter((i) => i.type === 'chest');
    (S.chests || []).forEach((st, i) => { const c = chests[i]; if (!c) return; c.trap = st === 2; if (st === 1 || st === true) openSilently(c); });
    for (const c of S.extraChests || []) { const it = G.Props.chest(w, c.x, c.z, c.y, c.ry, c.tier); it.trap = c.trap; w.flushDeferred(); if (c.opened) openSilently(it); }
    // what was still inside (opened chests keep their loot; unopened ones roll it when you open them)
    w.interactables.filter((i) => i.type === 'chest').forEach((c, i) => { const o = S.chestCont && S.chestCont[i]; if (c.opened && o) c.cont = deCont(o); });
    for (const s of S.corpses || []) G.Inv.restoreCorpse(s, deCont(s.cont));
    for (const g of S.ground || []) { if (G.Inv.def({ type: g.it.t, id: g.it.id })) G.Inv.dropToGround(G.Inv.de(g.it), V(...g.pos)); }
  }
  function restorePickups(S) { for (const p of S.pickups || []) G.combat.spawnPickup(p.kind, V(...p.pos), p.value); }
  function applyBoss(S) {
    const w = G.world;
    restoreChests(S); restorePickups(S);
    if (S.cleared) {
      // guardian already slain: stand in the courtyard with the exits open
      GM.bossEngaged = true; GM.areaCleared = true; GM.bossStartT = 0; GM.dreadLifted = false;
      const c = w.arenaCenter; P.pos.set(c.x, 0, c.z + 10); P.vel.set(0, 0, 0); P.yaw = 0;
      GM.objective = { icon: '👑', text: () => '守護者は倒れた — 次の道を選べ', done: true };
      G.Areas.openGates(true, (S.exits || []).map((e) => e.type));
      if (S.rewardPending) { GM.rewardPending = S.rewardPending; setTimeout(() => GM.giveReward(GM.rewardPending), 900); }
    } else {
      // resume on the landing in front of the fortress gate
      const g = w.bossGate; P.pos.set(g.x, 0, g.z1 + 9); P.vel.set(0, 0, 0); P.yaw = 0; P.pitch = 0;
    }
    P.invulnT = Math.max(P.invulnT || 0, 1.5);
  }
  function openSilently(c) {
    c.opened = true; c.openAnim = 1;
    if (c.lid) c.lid.rotation.x = -1.9;
    else setTimeout(() => { if (c.lid) c.lid.rotation.x = -1.9; }, 0);
  }
  function restoreEnemy(s) {
    const def = G.ENEMY_BY_ID[s.id]; if (!def) return;
    const e = G.enemies.spawn(def, s.lv, V(...s.pos), { elite: s.elite, scale: s.sc || 1, noSplit: !s.split });
    Object.assign(e, { hp: s.hp, maxHp: s.maxHp, shield: s.shield, maxShield: s.maxShield, dmg: s.dmg, speed: s.speed, yaw: s.yaw, marked: s.marked, noReward: s.noReward, revived: s.revived, mutRevived: s.mutRev, waveFoe: s.wf, waveNo: s.wn });
    if (s.em) e.eliteMod = (G.enemies.ELITE_MODS || []).find((m) => m.id === s.em) || e.eliteMod;
    if (s.em2) e.eliteMod2 = { id: s.em2, icon: { regen: '💚', rage: '😡', fast: '💨' }[s.em2] || '' };
    if (s.cursed) { e.cursed = true; e.makeCurseRing(0x9a30ff); }
    if (s.marked && e.markTarget) e.markTarget(!!s.champ);
    if (s.champ) { e.champion = true; e.makeCurseRing(0xff3018); e.def = Object.assign({}, e.def, { name: '覇者・' + def.name }); }
    if (s.mut && s.mut.length) { e.mut = {}; for (const id of s.mut) e.mut[id] = true; e.mutT = U.rand(2, 5); e.mutIcons = s.mut.map((id) => G.Depth.MUT_BY_ID[id].icon).join(''); e.mutCol = G.Depth.MUT_BY_ID[s.mut[0]].col; }
    if (s.pileRes) e.pileRes = s.pileRes;
    if (s.gs) { e.graveSpawn = true; e.ignoreCount = true; } // raised by a grave: outside the cap, the waves and the target
    if (s.mimic) { e.escapeT = 20; GM.mimic = e; }
    // skip the spawn rise and give the player a breath before they attack
    e.state = 'chase'; e.stateT = 0; if (e.model.inner) e.model.inner.position.y = 0; e.model.group.scale.setScalar(1);
    e.atkCd = Math.max(e.atkCd || 0, 2);
    return e;
  }
  function restoreShop(sh) {
    const w = G.world;
    if (!sh.mini && GM.shop) {
      // the merchant hall: rebuild the shelves exactly
      const S = GM.shop;
      for (const o of S.offers) if (o.mesh) w.group.remove(o.mesh);
      w.lightSources = w.lightSources.filter((l) => !l.offer);
      S.rerolls = sh.rerolls || 0;
      S.offers = sh.offers.map((o) => ({ kind: o.kind, obj: objByKind(o.kind, o.id), inst: o.kind === 'armor' && G.ARMOR_BY_ID[o.id] ? G.Inv.make('armor', o.id, 1, { ench: o.ench || [] }) : null, price: o.price, sold: o.sold, lv: o.lv, free: o.free, slot: w.shopSlots[o.si] })).filter((o) => o.obj && o.slot);
      for (const o of S.offers) { GM.buildPedestal(o, w); if (o.sold) o.mesh.visible = false; }
      return;
    }
    if (sh.mini && w.miniSlots) {
      const preset = sh.offers.map((o) => ({ kind: o.kind, obj: objByKind(o.kind, o.id), price: o.price, sold: o.sold, lv: o.lv, slot: w.miniSlots[o.si] })).filter((o) => o.obj && o.slot);
      G.Areas.spawnMiniShop(false, false, preset, true);
      if (GM.shop) GM.shop.healUsed = sh.healUsed;
    }
  }
})();
