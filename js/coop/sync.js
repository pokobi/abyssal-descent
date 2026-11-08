'use strict';
// Co-op: what the players share on the ground of an area.
//  - chests and bodies: the one who opens a chest or searches a body holds it while the screen is up (the others are told it is busy); everything taken or moved is
//    sent as it happens, so the rest stay where the others left them and what is left can still be taken. Contents are the host's: a body or chest is filled once.
//  - things dropped on the ground are seen by everyone and gone for everyone once picked up.
//  - the gates: the way on opens only when everyone who is up stands in the same gate; the others are told who has arrived.
(function () {
  const K = G.Coop;
  const V = G.U.V;
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
      (G.Strata.doors || []).forEach((d, i) => { if (d.state !== (d.s0 || 'closed')) K.send({ t: 'dr', i, s: d.state, a: GM.area }, to); }); // (a crypt gate starts open)
      if (G.Gim && G.Gim.list.some((g) => g.used)) K.send({ t: 'gms', u: G.Gim.save(), a: GM.area }, to);
      G.world.destructibles.forEach((d, i) => { if (!d.alive) K.send({ t: 'ds', i, a: GM.area }, to); });
      if (K.groundSnap) K.groundSnap(to);
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
        else { d.state = 'closed'; d.col.alive = true; d.it.opened = false; if (S.leafCols) S.leafCols(d, false); if (G.sfx.chain) G.sfx.chain(0.35, 0.3); }
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

    // ---------------- the fields' devices (gimmick.js): whoever sets one off, it goes off on every screen ----------------
    // Each screen runs it from the same moment: what it does to the monsters is done where they live (the host; the others only see it),
    // what it does to a player each screen does to its own. Its own effects are not mirrored again by the effect relay (fxsync).
    if (G.Gim) {
      const GmT = G.Gim.trigger;
      G.Gim.trigger = function (g, o) {
        K._noMirror = (K._noMirror || 0) + 1;
        let r; try { r = GmT.call(G.Gim, g, o); } finally { K._noMirror--; }
        if (r && K.live && !K._net) K.send({ t: 'gm', i: g.i, a: GM.area, by: (o && o.by) || '' });
        return r;
      };
      K.handlers.gm = function (m, from) {
        if (K.role === 'host') K.relay(m, from);
        if (m.a !== GM.area) return;
        const g = G.Gim.list[m.i]; if (!g) return;
        // (one that gathers itself again may still be a moment from whole on this screen's clock: it is whole, since it went off there)
        if (g.used && !g.run) G.Gim.ready(g);
        if (g.used) return;
        K._net = true;
        try { GmT.call(G.Gim, g, { by: m.by, net: true }); } finally { K._net = false; }
      };
      // a newcomer: the ones already spent stand spent (a fallen pillar lies where it fell, a tipped pot hangs over)
      K.handlers.gms = function (m) { if (m.a === GM.area) G.Gim.restore(m.u); };
    }

    // ---------------- ground that moves and breaks: the host's is everyone's ----------------
    // The sea of pillars (field_pillars.js): a pillar starts to sink on the host's word (its own clock, or a 沈め手's stamp); every step of
    // its turn after that (warning, sinking, down, rising, up) is the host's word too, each screen playing it out from that moment: a
    // screen whose clock runs slow (a heavy frame, a menu) is set right at every step, never drifting away from the host's.
    // The frozen lake (field_frozen.js): the host keeps the ice. A blow seen only on a guest's screen (its own blast, the icicles that fall
    // round it) goes to the host; a foe's blast, which every screen sets off on its own, counts on the host's alone. What changes is
    // sent to everyone as it stands; broken ice freezes over on the host's word, when nobody, on any screen, stands in its place.
    // A screen that comes into such an area asks how it stands (and a newcomer is told).
    const FG = G.FieldGen;
    if (FG && FG.tickPillars && FG.iceHit) {
      const ST = ['up', 'warn', 'sink', 'down', 'rise'];
      const r2 = (v) => Math.round(v * 100) / 100;
      const tp = FG.tickPillars, ih = FG.iceHit, ti = FG.tickIce, ic = FG.iceClear;
      let foeBlast = 0;
      const ask = (w) => { if (!w._gq) { w._gq = true; K.send({ t: 'gq', a: GM.area }); } };
      const iceSend = (w, ks, to) => { if (ks.length) K.send({ t: 'ice', a: GM.area, s: ks.map((k) => [k, w.iceTiles[k].hp]) }, to); };
      K.groundSnap = function (to, periodic) {
        const w = G.world; if (!w) return;
        if (w.pillars && w.pillars.length) K.send({ t: 'pls', a: GM.area, s: w.pillars.map((p) => [ST.indexOf(p.st), r2(p.t)]), per: periodic ? 1 : 0 }, to);
        if (w.iceTiles) K.send({ t: 'ice', a: GM.area, all: w.iceTiles.map((t) => t.hp).join('') }, to); // (every tile: one digit each)
      };
      FG.tickPillars = function (w, dt) {
        if (!K.live) return tp.call(FG, w, dt);
        if (K.role !== 'host') {
          ask(w);
          // (a pillar that stands waits for the host's word to go)
          for (const p of w.pillars) if (p.st === 'up') p.next = 1e9;
          return tp.call(FG, w, dt);
        }
        for (const p of w.pillars) p._was = p.st;
        const r = tp.call(FG, w, dt);
        // (every few seconds everyone is told how the ground stands: a screen that stopped a while (a menu, a hitch) catches up)
        w._gsT = (w._gsT || 0) + dt; if (w._gsT > 4) { w._gsT = 0; K.groundSnap(undefined, true); }
        const ch = [];
        w.pillars.forEach((p, i) => { if (p._was !== p.st) ch.push([i, ST.indexOf(p.st)]); });
        if (ch.length) K.send({ t: 'pl', a: GM.area, c: ch });
        return r;
      };
      // (a step on the host: the same step here, from its start; a pillar already in it stays as it is)
      const setPillar = (w, p, st, t) => {
        p.st = st; p.t = t; p.go = false;
        p.col.alive = st !== 'down';
        const ign = st !== 'up';
        if (!!p.col.navIgnore !== ign) { p.col.navIgnore = ign; w.navPatch(p.x0, p.z0, p.x1, p.z1); w._vn = null; }
      };
      K.handlers.pl = function (m) {
        const w = G.world; if (K.role === 'host' || m.a !== GM.area || !w || !w.pillars) return;
        for (const [i, c] of m.c || []) { const p = w.pillars[i], st = ST[c]; if (p && st && p.st !== st) setPillar(w, p, st, 0); }
      };
      K.handlers.pls = function (m) {
        const w = G.world; if (K.role === 'host' || m.a !== GM.area || !w || !w.pillars) return;
        const near = (a, b) => { const i = ST.indexOf(a), j = ST.indexOf(b); return i === j || Math.abs(i - j) === 1 || Math.abs(i - j) === 4; };
        m.s.forEach(([c, t], i) => {
          const p = w.pillars[i], st = ST[c]; if (!p || !st) return;
          if (m.per && near(p.st, st)) return; // (the regular word: a pillar a step behind or ahead is only the moment the word took)
          if (p.st === st && Math.abs(p.t - t) < 0.4) return;
          setPillar(w, p, st, t);
        });
      };
      // (a foe's blast on a guest's screen: the host has its own of it. combat.js lets no foe's blast reach the ice today; this keeps it once if one ever does)
      const cx = C.explode;
      C.explode = function (pos, r, dmg, info) {
        if (!(K.live && K.role !== 'host' && info && (info.enemy || info.pjx))) return cx.call(C, pos, r, dmg, info);
        foeBlast++;
        try { return cx.call(C, pos, r, dmg, info); } finally { foeBlast--; }
      };
      FG.iceHit = function (w, x, z, r, n) {
        if (!K.live) return ih.call(FG, w, x, z, r, n);
        if (K.role === 'host') { const ks = ih.call(FG, w, x, z, r, n); iceSend(w, ks); return ks; }
        if (!foeBlast && w && w.iceTiles) K.send({ t: 'ih', a: GM.area, p: [r2(x), r2(z), r2(r), n || 1] });
        return [];
      };
      FG.tickIce = function (w, dt) {
        if (!K.live) return ti.call(FG, w, dt);
        if (K.role !== 'host') { ask(w); return []; }
        const ks = ti.call(FG, w, dt);
        if (!w.pillars) { w._gsT = (w._gsT || 0) + dt; if (w._gsT > 4) { w._gsT = 0; K.groundSnap(undefined, true); } }
        iceSend(w, ks);
        return ks;
      };
      FG.iceClear = function (w, t) {
        if (!ic.call(FG, w, t)) return false;
        if (K.live) for (const rp of K.players.values()) if (rp.id !== K.id && !rp.dead && rp.to && rp.to.x > t.x0 - 0.4 && rp.to.x < t.x1 + 0.4 && rp.to.z > t.z0 - 0.4 && rp.to.z < t.z1 + 0.4 && rp.to.y < 0.5) return false;
        return true;
      };
      K.handlers.ih = function (m) {
        const w = G.world; if (K.role !== 'host' || m.a !== GM.area || !w || !w.iceTiles) return;
        const [x, z, r, n] = m.p; FG.iceHit(w, x, z, r, n);
      };
      K.handlers.ice = function (m) {
        const w = G.world; if (K.role === 'host' || m.a !== GM.area || !w || !w.iceTiles) return;
        if (m.all) for (let k = 0; k < m.all.length; k++) FG.iceSet(w, k, +m.all[k]);
        else for (const [k, hp] of m.s) FG.iceSet(w, k, hp);
      };
      K.handlers.gq = function (m, from) { if (K.role === 'host' && m.a === GM.area) K.groundSnap(from); };
    }

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
      // (the game takes its clock down only when your own time runs out; here the round can end because someone else's did)
      G.ui.trialClock(-1);
      const O = GM.objective, r = ft.call(G.Areas);
      if (K.live && O) { K.feed(`🎯 ${U.esc(K.name)}: RANK ${O.rank || '-'}（${U.fmt(O.score || 0)}）`, true); if (!K._net) K.send({ t: 'trd', n: K.name, s: O.score, r: O.rank }); }
      return r;
    };
    K.handlers.trd = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      K.feed(`🎯 ${U.esc(m.n)}: RANK ${m.r || '-'}（${U.fmt(m.s || 0)}）`, true);
      if (GM.stage === 'trial' && !GM.areaCleared) { K._net = true; try { G.Areas.finishTrial(); } finally { K._net = false; } }
    };

    // ---------------- graves: whoever wakes one, the foe is the host's to raise, and the grave is gone for everyone ----------------
    const gt0 = G.Graves.trigger;
    G.Graves.trigger = function (o) { gt0.call(G.Graves, o); if (K.live && !K._net) K.send({ t: 'grv', i: o.i, a: GM.area }); };
    K.handlers.grv = function (m, from) {
      if (K.role === 'host') K.relay(m, from);
      if (m.a !== GM.area) return;
      const o = G.Graves.list.find((q) => q.i === m.i && !q.used); if (!o) return;
      K._net = true; try { G.Graves.trigger(o); } finally { K._net = false; }
    };

    // ---------------- the guardian's chest: one for each player, each with contents of its own, and the colour of the one it is for ----------------
    // (the chest the game makes at the centre is the first; both sides lay out the rest the same way, from the players listed when the guardian fell)
    const obd = GM.onBossDefeated;
    GM.onBossDefeated = function (boss) {
      const r = obd.call(GM, boss);
      try { K.bossChests(boss); } catch (e) { console.error(e); }
      return r;
    };
    const nameTag = (text, col) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
      g.font = '700 34px "Noto Sans JP", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, 128, 34); g.fillStyle = col; g.fillText(text, 128, 34);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(3.4, 0.85, 1); return s;
    };
    K.bossChests = function (boss) {
      const w = G.world, c = w.arenaCenter;
      if (!K.live || !c || G.Run.isLast(GM.area)) return;
      const bd = boss && boss.baseDef && G.BOSS_BY_ID[boss.baseDef.id];
      if (bd && bd.final) return; // (the deepest throne's own hoard stays as it is)
      const ids = (K.role === 'host' ? [...K.players.keys()] : K._bossIds || [...K.players.keys()]).slice().sort((a, b) => a - b);
      const first = w.interactables.filter((it) => it.type === 'chest' && it.tier === 3 && Math.abs(it.pos.x - c.x) < 0.01 && Math.abs(it.pos.z - c.z) < 0.01).pop();
      if (!first || ids.length < 1) return;
      const y = first.pos.y - 0.5, chests = [first], n = ids.length;
      for (let i = 1; i < n; i++) {
        for (const R of [4.4, 6, 7.6, 9.2]) {
          const a = 0.5 * Math.PI + (i - 1) / Math.max(1, n - 1) * 2 * Math.PI + (R - 4.4) * 0.08;
          const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
          if (!w.boxFree(x - 0.95, y + 0.05, z - 0.95, x + 0.95, y + 1.5, z + 0.95)) continue;
          chests.push(G.Props.chest(w, x, z, y, Math.atan2(c.x - x, c.z - z), 3));
          break;
        }
      }
      w.flushDeferred();
      K._owned = chests;
      chests.forEach((it, i) => {
        const id = ids[i]; if (id === undefined) return;
        const rp = K.players.get(id), col = K.colOf(id), hex = parseInt(col.slice(1), 16);
        it.owner = id; it._deadT = 0;
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.9, 40), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(it.pos.x, y + 0.07, it.pos.z); w.group.add(ring);
        const tag = nameTag(rp ? rp.name : '', col); tag.position.set(it.pos.x, y + 3.2, it.pos.z); w.group.add(tag);
        w.lightSources.push({ pos: new THREE.Vector3(it.pos.x, y + 1.4, it.pos.z), color: col, intensity: 7, range: 8, flame: 0, emit: false, ph: 0, prio: 1.4, steady: true });
      });
    };
    // only its owner opens it (the others are told whose it is); one whose owner is gone, or has been down for half a minute, is anybody's
    const ss = GM.startSearch;
    GM.startSearch = function (it) {
      if (K.live && it && it.type === 'chest' && it.owner !== undefined && it.owner !== K.id) {
        const rp = K.players.get(it.owner);
        if (rp && !(rp.dead && (it._deadT || 0) > 30)) { G.ui.toastSmall(`🔒 ${rp.name} の宝箱です（自分の色の宝箱を開けよう）`); G.sfx.ui('deny'); return; }
      }
      return ss.apply(GM, arguments);
    };

    // ---------------- the gates ----------------
    // which doors appear can depend on a player's own bank: everyone takes the host's
    const rg = G.Areas.rollGates;
    G.Areas.rollGates = function (n) {
      if (K.role === 'host') { const l = rg.call(G.Areas, n); if (K.live) K.send({ t: 'gt', n, l }); return l; }
      return K._gates && K._gates.n === n ? K._gates.l : rg.call(G.Areas, n);
    };
    K.handlers.gt = function (m) { K._gates = m; };
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
      if (GM.stage !== 'boss' || !w.arenaD || GM.bossEngaged || w._hall || w._hallOpen) return;
      const z = hallZ(w);
      w._hall = w.addCollider(0, -40, z - 0.3, w.W, 80, z + 0.3, { surf: 'metal', noGrapple: true, navIgnore: true });
    };
    const hallOpen = (w) => { w._hallOpen = true; if (w._hall) { w._hall.alive = false; w._hall = null; } }; // (for good: a wall put back around people walking through traps them inside it)
    // Someone else stepped in first: you are brought along, onto real floor with nothing in the way (the road runs far below the arena, so moving you only sideways would leave you inside the ground).
    K.toHall = function () {
      const w = G.world;
      if (GM.bossEngaged || P.dead || !w.arenaCenter) return;
      const x0 = w.arenaCenter.x, z0 = (w.ledgeZ ? w.ledgeZ : w.arenaD) - 4;
      let at = null;
      for (let d = 0; d < 24 && !at; d += 2) for (const dx of [0, -2, 2, -4, 4]) {
        const x = x0 + dx, z = z0 - d, y = w.floorBelow(x, 3, z);
        if (y > -1.5 && w.boxFree(x - 0.6, y + 0.05, z - 0.6, x + 0.6, y + 2, z + 0.6)) { at = [x, y, z]; break; }
      }
      P.pos.set(...(at || [x0, 0.2, z0])); P.vel.set(0, 0, 0); P.grounded = true;
      K.msg('仲間が守護者の間へ入った');
    };
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
      if (G.world !== lastWorld) { lastWorld = G.world; K._owned = []; prep(); at = null; for (const p of K.players.values()) p.at = null; }
      hallDoor(G.world);
      if (GM.bossEngaged) hallOpen(G.world);
      for (const it of K._owned || []) { const rp = K.players.get(it.owner); it._deadT = rp && rp.dead ? (it._deadT || 0) + dt : 0; }
      if (GM.area !== lastArea) { lastArea = GM.area; for (const id of Object.keys(locks)) delete locks[id]; hold = null; pending = null; G.ui.trialClock(-1); if (K.clearViz) K.clearViz(); }
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
