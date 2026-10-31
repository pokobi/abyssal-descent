'use strict';
// Co-op: what the players share on the ground of an area.
//  - chests and bodies: the one who opens a chest or searches a body holds it while the screen is up (the others are told it is busy); everything taken or moved is
//    sent as it happens, so the rest stay where the others left them and what is left can still be taken. Contents are the host's: a body or chest is filled once.
//  - things dropped on the ground are seen by everyone and gone for everyone once picked up.
//  - the gates: the way on opens only when everyone who is up stands in the same gate; the others are told who has arrived.
(function () {
  const K = G.Coop;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const U = G.U;

  K.installSync = function () {
    const IV = G.Inv, UIV = G.InvUI, GM = G.game, P = G.player;
    const locks = {};
    let hold = null, pending = null, lastArea = -1, lastWorld = null, gateEl = null, at = null;

    // ---------------- chests and bodies ----------------
    const cidOf = (src) => {
      if (!src || !G.world) return null;
      if (src.e) return src.e._nid ? 'b' + src.e._nid : null;
      if (src.type === 'chest' && src.tier !== undefined) { const i = G.world.interactables.indexOf(src); return i >= 0 ? 'c' + i : null; }
      return null;
    };
    const find = (id) => {
      if (id[0] === 'c') { const it = G.world.interactables[+id.slice(1)]; return it && it.type === 'chest' ? it : null; }
      const n = +id.slice(1);
      return IV.corpses.find((c) => c.e && c.e._nid === n) || null;
    };
    const snap = (c) => ({ cols: c.cols, rows: c.rows, name: c.name, k: c.kind, it: c.items.map(IV.ser) });
    const apply = (src, id, d) => {
      const c = IV.container(d.cols, d.rows, d.name, d.k);
      c.items = d.it.map(IV.de);
      src.cont = c;
      if (id[0] === 'c') { src.opened = true; if (src.openAnim === undefined) src.openAnim = 0; }
      else { src.searched = true; if (src.e && src.e.clearTarget) src.e.clearTarget(); }
      IV.ver++;
    };
    // the host fills a chest (the same seeded contents the game itself would roll) or marks a body searched
    const ensure = (src, id) => {
      if (id[0] === 'c') {
        if (!src.cont) src.cont = K.seeded((GM.seed ^ U.hashStr('chest' + GM.area + ':' + Math.round(src.pos.x) + ',' + Math.round(src.pos.z))) >>> 0, () => IV.chestLoot(src.tier));
        src.opened = true; if (src.openAnim === undefined) src.openAnim = 0;
      } else { src.searched = true; if (src.e && src.e.clearTarget) src.e.clearTarget(); }
    };
    const release = () => { if (!hold) return; const h = hold; hold = null; if (K.role === 'host') delete locks[h.id]; else K.send({ t: 'cclose', id: h.id }); };

    const open0 = UIV.open, close0 = UIV.close;
    UIV.open = function (cont, src) {
      const id = K.live && cont && !K._real ? cidOf(src) : null;
      if (!id) return open0.call(UIV, cont, src);
      if (K.role === 'host') {
        if (locks[id] !== undefined) { K.msg('他の人が漁っています'); return; }
        locks[id] = 0; hold = { id, cont, src };
        K.send({ t: 'cs', id, d: snap(cont) });
        open0.call(UIV, cont, src);
        if (!UIV.isOpen()) release();
        return;
      }
      pending = { id, src };
      K.send({ t: 'copen', id });
    };
    UIV.close = function () { const was = UIV.isOpen(); const r = close0.apply(UIV, arguments); if (was) release(); return r; };
    K.handlers.copen = function (m, from) {
      const src = find(m.id);
      if (!src) { K.send({ t: 'cdata', id: m.id, gone: 1 }, from); return; }
      ensure(src, m.id);
      if (locks[m.id] !== undefined) { K.send({ t: 'cdata', id: m.id, ok: 0, d: snap(src.cont) }, from); return; }
      locks[m.id] = from;
      const d = snap(src.cont);
      K.send({ t: 'cdata', id: m.id, ok: 1, d }, from);
      for (const o of K.players.keys()) if (o && o !== from) K.send({ t: 'cs', id: m.id, d }, o);
    };
    K.handlers.cdata = function (m) {
      const pd = pending; pending = null;
      if (!pd || pd.id !== m.id) return;
      const src = find(m.id) || pd.src;
      if (m.gone) { apply(src, m.id, { cols: 3, rows: 2, name: '', k: 'corpse', it: [] }); K.msg('中身はもう残っていない'); return; }
      apply(src, m.id, m.d);
      if (!m.ok) { K.msg('他の人が漁っています'); return; }
      hold = { id: m.id, cont: src.cont, src };
      K._real = true;
      try { open0.call(UIV, src.cont, src); } finally { K._real = false; }
      if (!UIV.isOpen()) release();
    };
    // what the one holding it did, and the state of a container somebody opened
    K.handlers.cs = K.handlers.cset = function (m, from) {
      if (!(hold && hold.id === m.id)) { const src = find(m.id); if (src) apply(src, m.id, m.d); }
      if (K.role === 'host') K.relay(m, from);
    };
    K.handlers.cclose = function (m, from) { if (locks[m.id] === from) delete locks[m.id]; };
    const ch = IV.changed;
    IV.changed = function (c) {
      const r = ch.apply(IV, arguments);
      if (K.live && hold && c === hold.cont) K.send({ t: 'cset', id: hold.id, d: snap(hold.cont) });
      return r;
    };
    const ol = K.onLeave;
    K.onLeave = function (rp) { for (const id of Object.keys(locks)) if (locks[id] === rp.id) delete locks[id]; if (ol) ol(rp); };

    // a newcomer is told how the area stands
    K.catchUp = function (to) {
      G.world.interactables.forEach((it, i) => { if (it.type === 'chest' && it.opened && it.cont) K.send({ t: 'cs', id: 'c' + i, d: snap(it.cont) }, to); });
      for (const gr of IV.ground) if (gr.gid) K.send({ t: 'gd', gid: gr.gid, it: IV.ser(gr.it), p: K.vec(gr.g.position) }, to);
      (G.Strata.doors || []).forEach((d, i) => { if (d.state !== 'closed') K.send({ t: 'dr', i, s: d.state, a: GM.area }, to); });
      G.world.destructibles.forEach((d, i) => { if (!d.alive) K.send({ t: 'ds', i, a: GM.area }, to); });
    };
    // ---------------- things on the ground ----------------
    const dg = IV.dropToGround, pu = IV.pickUp;
    let gidN = 1;
    IV.dropToGround = function (it, pos) {
      const n = IV.ground.length;
      const r = dg.call(IV, it, pos);
      if (K.live && !K._net && IV.ground.length > n) {
        const gr = IV.ground[IV.ground.length - 1];
        gr.gid = K.id * 1e6 + gidN++;
        K.send({ t: 'gd', gid: gr.gid, it: IV.ser(gr.it), p: K.vec(gr.g.position) });
      }
      return r;
    };
    IV.pickUp = function (gr) {
      const gid = gr.gid, ok = pu.call(IV, gr);
      if (ok && gid && K.live) K.send({ t: 'gp', gid });
      return ok;
    };
    K.handlers.gd = function (m, from) {
      if (!G.world) return;
      K._net = true;
      try {
        dg.call(IV, IV.de(m.it), V(...m.p));
        const gr = IV.ground[IV.ground.length - 1];
        gr.gid = m.gid; gr.g.position.set(...m.p); gr.pos = gr.g.position.clone().add(V(0, 0.3, 0));
      } finally { K._net = false; }
      if (K.role === 'host') K.relay(m, from);
    };
    K.handlers.gp = function (m, from) {
      const i = IV.ground.findIndex((g) => g.gid === m.gid);
      if (i >= 0) { G.world.group.remove(IV.ground[i].g); IV.ground.splice(i, 1); }
      if (K.role === 'host') K.relay(m, from);
    };

    // ---------------- doors, breakable things, trapped chests ----------------
    const S = G.Strata, C = G.combat;
    const doorIdx = (d) => (S.doors || []).indexOf(d);
    const dOpen = S.openDoor, dClose = S.closeDoor, dBreak = S.breakDoor;
    const sendDoor = (d) => { if (K.live && !K._net) K.send({ t: 'dr', i: doorIdx(d), s: d.state, a: GM.area }); };
    S.openDoor = function (d) { const was = d.state, r = dOpen.call(S, d); if (d.state !== was) sendDoor(d); return r; };
    S.breakDoor = function (d) { const was = d.state, r = dBreak.call(S, d); if (d.state !== was) sendDoor(d); return r; };
    S.closeDoor = function (d) {
      // (nobody may stand in the doorway, on anyone's screen)
      for (const rp of K.players.values()) if (rp.id !== K.id && !rp.dead && Math.abs(rp.to.x - d.plane) < 1.4 && rp.to.z > d.lo - 0.7 && rp.to.z < d.hi + 0.7 && rp.to.y > d.y - 1.5 && rp.to.y < d.y + d.h) return false;
      const was = d.state, r = dClose.call(S, d);
      if (d.state !== was) sendDoor(d);
      return r;
    };
    K.handlers.dr = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      if (m.a !== GM.area) return;
      const d = (S.doors || [])[m.i]; if (!d || d.state === m.s) return;
      K._net = true;
      try {
        if (m.s === 'open') dOpen.call(S, d);
        else if (m.s === 'broken') dBreak.call(S, d);
        else { d.state = 'closed'; d.col.alive = true; d.it.opened = false; if (G.sfx.chain) G.sfx.chain(0.35, 0.3); }
      } finally { K._net = false; }
    };
    // how battered a gate is follows the host (only foes batter them)
    K.handlers.dh = function (m) { const d = (S.doors || [])[m.i]; if (d && m.a === GM.area) { d.hp = m.hp; d.shake = 1; if (d.g) S.paintDoor(d); } };
    const bd = C.breakDestructible;
    C.breakDestructible = function (d) {
      const was = d.alive, r = bd.call(C, d);
      if (was && K.live && !K._net) { const i = G.world.destructibles.indexOf(d); if (i >= 0) K.send({ t: 'ds', i, a: GM.area }); }
      return r;
    };
    K.handlers.ds = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      if (m.a !== GM.area) return;
      const d = G.world.destructibles[m.i]; if (!d || !d.alive) return;
      const mats = G.world.mats;
      C.removeDestructibleSilent(d);
      G.fx.debris(d.pos, d.mat === 'ceramic' ? mats.ceramic : mats.wood, d.type === 'urn' ? 10 : 12, d.type === 'urn' ? 0.12 : 0.2, 6);
      G.fx.dust(d.pos, null, 0x7a6a50, 6);
      G.sfx.breakObj(d.pos, d.mat);
      if (d.explosive) { const dd = P.pos.distanceTo(d.pos); if (dd < 4) C.damagePlayer(25 * (1 - dd / 4), { src: 'explosion', pos: d.pos }); }
    };
    const trap = G.Areas.springTrap;
    G.Areas.springTrap = function (it) { const i = G.world.interactables.indexOf(it); if (K.live && i >= 0) K.send({ t: 'co', i, a: GM.area }); return trap.call(G.Areas, it); };
    K.handlers.co = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      if (m.a !== GM.area) return;
      const it = G.world.interactables[m.i]; if (it) { it.opened = true; if (it.openAnim === undefined) it.openAnim = 0; }
    };

    // ---------------- the end of the run: the first through the rift takes everyone along ----------------
    const vic = GM.victory;
    GM.victory = function () { const was = GM.won; vic.call(GM); if (!was && GM.won && K.live) K.send({ t: 'won' }); };
    K.handlers.won = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      if (GM.won) return;
      if (P.dead) K.rise(P.pos, P.stats.maxHp * 0.4, false);
      vic.call(GM);
    };

    // ---------------- the aim trial: everyone shoots at their own targets, the round ends for all at once, and the scores are shown ----------------
    const ft = G.Areas.finishTrial;
    G.Areas.finishTrial = function () {
      const O = GM.objective, r = ft.call(G.Areas);
      if (K.live && O) { K.feed(`🎯 ${U.esc(K.name)}: RANK ${O.rank || '-'}（${U.fmt(O.score || 0)}）`, true); if (!K._net) K.send({ t: 'trd', n: K.name, s: O.score, r: O.rank }); }
      return r;
    };
    K.handlers.trd = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      K.feed(`🎯 ${U.esc(m.n)}: RANK ${m.r || '-'}（${U.fmt(m.s || 0)}）`, true);
      if (GM.stage === 'trial' && !GM.areaCleared) { K._net = true; try { G.Areas.finishTrial(); } finally { K._net = false; } }
    };

    // ---------------- the gates ----------------
    // The game's own check would take whoever steps into an open gate on alone, so its boxes are emptied here and kept aside; the check is done below for everyone.
    const prep = () => {
      for (const t of G.world.triggers) if (t.kind === 'exit' && !t._r) { t._r = { x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 }; t.x0 = 1e9; t.x1 = -1e9; }
    };
    const gateAt = (p) => {
      for (const t of G.world.triggers) {
        const r = t._r; if (!r || !t.exit || !t.exit.open) continue;
        if (p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1) return t.exit.type || 'combat';
      }
      const w = G.world;
      if (w._hall && p.z > hallZ(w) && p.z - hallZ(w) < 10) return 'hall';
      return null;
    };
    const kindName = (k) => { if (k === 'hall') return '👑 守護者の間'; const T = G.Areas.TYPES[k]; return T ? `${T.icon} ${T.name}` : k; };
    const standing = () => [...K.players.values()].filter((p) => !p.dead);
    // the guardian's hall opens the same way: everyone in front of its door first (an unseen wall until then)
    const hallZ = (w) => (w.ledgeZ ? w.ledgeZ - 1 : w.arenaD - 2);
    const hallDoor = (w) => {
      if (GM.stage !== 'boss' || !w.arenaD || GM.bossEngaged || w._hall) return;
      const z = hallZ(w);
      w._hall = w.addCollider(0, -40, z - 0.3, w.W, 80, z + 0.3, { surf: 'metal', noGrapple: true, navIgnore: true });
    };
    const hallOpen = (w) => { if (w._hall) { w._hall.alive = false; w._hall = null; } };
    K.handlers.hall = function () { if (G.world) hallOpen(G.world); };
    K.handlers.at = function (m, from) {
      const rp = K.players.get(from); if (!rp) return;
      rp.at = m.k;
      if (K.role === 'host') { K.relay({ t: 'at', k: m.k, i: from }, from); announce(rp); }
    };
    // a relayed presence carries who it is about
    const at0 = K.handlers.at;
    K.handlers.at = function (m, from) { if (m.i !== undefined && K.role === 'guest') { const rp = K.players.get(m.i); if (rp) rp.at = m.k; return; } at0(m, from); };
    K.handlers.gn = function (m) { K.msg(m.x); };
    const announce = (rp) => {
      const live = standing(), n = live.filter((p) => p.at).length;
      const x = rp.at ? `${rp.name} が ${kindName(rp.at)} の門に入った（${n}/${live.length}）` : `${rp.name} が門から離れた`;
      K.msg(x); K.send({ t: 'gn', x });
    };
    const banner = () => {
      if (!gateEl) { gateEl = document.createElement('div'); gateEl.id = 'coop-gate'; document.body.appendChild(gateEl); }
      const live = standing(), n = live.filter((p) => p.at).length, mine = at;
      const kinds = new Set(live.filter((p) => p.at).map((p) => p.at));
      let h = '';
      if (mine && n < live.length) h = mine === 'hall' ? `⏳ 全員が扉の前に集まると開きます（${n}/${live.length}）` : `⏳ 全員が門に集まるのを待っています（${n}/${live.length}）<small>全員が同じ門に入ると次のエリアへ進みます</small>`;
      if (mine && kinds.size > 1) h = `⚠ 別々の門にいます<small>行き先をそろえてください（${[...kinds].map(kindName).join(' / ')}）</small>`;
      if (gateEl._h !== h) { gateEl._h = h; gateEl.innerHTML = h; gateEl.style.display = h ? 'block' : 'none'; }
    };
    K.onFrame = function (dt) {
      if (!G.world || !GM.run) return;
      if (G.world !== lastWorld) { lastWorld = G.world; prep(); at = null; for (const p of K.players.values()) p.at = null; }
      hallDoor(G.world);
      if (GM.bossEngaged) hallOpen(G.world);
      if (GM.area !== lastArea) { lastArea = GM.area; for (const id of Object.keys(locks)) delete locks[id]; hold = null; pending = null; if (K.clearViz) K.clearViz(); }
      const me = K.players.get(K.id);
      const want = !P.dead && !GM.transitioning ? gateAt(P.pos) : null;
      if (want !== at) {
        at = want; if (me) me.at = at;
        K.send({ t: 'at', k: at });
        if (K.role === 'host' && me) announce(me);
      }
      if (K.role === 'host') {
        K._dhT = (K._dhT || 0) + 1;
        if (K._dhT % 20 === 0) (S.doors || []).forEach((d, i) => { if (d.state === 'closed' && d._shp !== d.hp) { if (d._shp !== undefined) K.send({ t: 'dh', i, hp: Math.round(d.hp), a: GM.area }); d._shp = d.hp; } });
      }
      if (K.role === 'host' && !GM.transitioning) {
        const live = standing();
        if (live.length && live.every((p) => p.at) && new Set(live.map((p) => p.at)).size === 1) {
          const kind = live[0].at;
          if (kind === 'hall') { hallOpen(G.world); K.send({ t: 'hall' }); K.msg('守護者の間の扉が開く'); K.send({ t: 'gn', x: '守護者の間の扉が開く' }); }
          else if (!(K._goT > 0)) { K._goT = 1.5; const x = live.length > 1 ? '全員そろった — まもなく出発' : '次のエリアへ'; K.msg(x); K.send({ t: 'gn', x }); }
          K._goT -= dt;
          if (kind !== 'hall' && K._goT <= 0) { K._goT = 0; K.go(GM.area + 1, kind); }
        } else K._goT = 0;
      }
      banner();
    };
  };
})();
