'use strict';
// Co-op duels (js/duel.js). The host runs the duel and the guardian; the duellist's own machine judges each parry by its own clock (what it sees is what
// counts) and takes the blows it misses. Everyone else keeps playing outside the ring with guns and skills, and what they deal goes into the white gauge
// (at 10%) instead of the guardian's health. Every 15 s of fighting the duel passes to the next living player (2 s warning; the new duellist gets the rules
// and 4 s to read them); a duellist who goes down hands it on at once. The time limit is 15 s per player (35 s at least).
//   host -> all:  dbg (begin), dsy (twice a second: clocks, duellist, gauge), dcb (a combo: its blows' times), dpx (a parry, for the effects), dsw (new
//                 duellist), dnx (who is next), dbr (BREAK), den (end), dwg (a gauge left as a shield)
//   duellist -> host: dpr (parried blow i of combo k)
(function () {
  const K = G.Coop;
  const r2 = (v) => Math.round(v * 100) / 100;
  K.installDuel = function () {
    const D = G.Duel, BS = G.bosses;
    if (!D) return;
    const host = K.role === 'host';
    D.authority = host;
    D.SLOT = 15;
    D.myId = () => K.id;
    D.players = () => [...K.players.values()].map((rp) => (rp.id === K.id ? { id: rp.id, pos: G.player.pos, alive: !G.player.dead } : { id: rp.id, pos: rp.to, alive: !rp.dead && !rp.gone }));
    D.nameOf = (id) => (id === K.id ? 'あなた' : (K.players.get(id) || {}).name || '仲間');
    D.limit = () => Math.max(D.LIMIT, ((D.cur && D.cur.np) || 1) * D.SLOT);
    const alive = () => D.players().filter((p) => p.alive).map((p) => p.id).sort((a, b) => a - b);
    const nextOf = (who) => { const a = alive().filter((id) => id !== who); if (!a.length) return null; const after = a.find((id) => id > who); return after ?? a[0]; };
    const bossOk = () => { const b = BS.active; return b && !b.dead && b.duelSt ? b : null; };
    const state = (d) => ({ t: 'dsy', ti: r2(d.t), f: r2(d.fightT), r: r2(d.readUntil), w: d.who, n: d.b.duelSt.n, g: Math.round(d.b.duelSt.wg), gm: Math.round(d.b.duelSt.wgMax), np: d.np, c: [r2(d.c.x), r2(d.c.z)] });

    // ---------------- the golden aura on a teammate who is duelling ----------------
    let aura = null;
    function auraTick(dt) {
      const d = D.cur, rp = d && d.who !== K.id ? K.players.get(d.who) : null;
      if (!rp || !rp.body) { if (aura) aura.visible = false; return; }
      if (!aura) {
        aura = new THREE.Group();
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 4.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc840, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        col.position.y = 2.1; aura.add(col);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; aura.add(ring);
        const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
        x.font = "bold 34px 'Noto Sans JP', sans-serif"; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText('⚔ 決闘中', 128, 32); x.fillStyle = '#ffd760'; x.fillText('⚔ 決闘中', 128, 32);
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
        tag.scale.set(2.2, 0.55, 1); tag.position.y = 2.75; tag.renderOrder = 998; aura.add(tag);
        aura.userData.col = col;
        G.scene.add(aura);
      }
      if (aura.parent !== G.scene) G.scene.add(aura);
      aura.visible = true;
      aura.position.copy(rp.body.root.position);
      aura.userData.col.material.opacity = 0.18 + Math.sin(performance.now() / 180) * 0.06;
    }

    if (host) {
      // ---------------- the host: runs the duel ----------------
      let pend = null, syT = 0, wgT = 0;
      D.want = (b) => { pend = b; };
      D.onBegin = (d) => { d.np = alive().length; K.send(Object.assign(state(d), { t: 'dbg' })); };
      D.onCombo = (d) => { K.send({ t: 'dcb', k: d.combo.id, t0: r2(d.combo.t0), l: d.combo.list.map((s) => [r2(s.at), r2(s.from), r2(s.hold)]) }); };
      D.onParry = (d, i) => { K.send({ t: 'dpx', k: d.combo.id, i }); }; // the host itself parried
      D.onSwitch = (d) => { d.note = ''; d.warned = false; K.send({ t: 'dsw', w: d.who, ti: r2(d.t), r: r2(d.readUntil) }); };
      D.onEnd = (d, broke) => { K.send({ t: 'den', b: broke ? 1 : 0, g: Math.round(d.b.duelSt.wg), gm: Math.round(d.b.duelSt.wgMax) }); };
      const bfx = D.breakFx;
      D.breakFx = function (b) { K.send({ t: 'dbr' }); return bfx.call(D, b); };
      K.handlers.dpr = function (m, from) {
        const d = D.cur; if (!d || d.who !== from || !d.combo || d.combo.id !== m.k) return;
        const s = d.combo.list[m.i]; if (!s || s.parried) return;
        s.parried = true;
        D.parried(d, s, false);
        for (const id of K.players.keys()) if (id && id !== from) K.send({ t: 'dpx', k: m.k, i: m.i }, id);
      };
      // the duellist changes every 15 s of fighting, or at once when they go down
      function rotate(dt) {
        const d = D.cur; if (!d) return;
        const live = alive();
        if (!live.length) { D.finish(false); return; }
        if (!live.includes(d.who)) { const n = nextOf(d.who); if (n !== null) D.switchTo(n); return; }
        if (live.length < 2 || d.st !== 'fight') return;
        const n = nextOf(d.who); if (n === null) return;
        if (!d.warned && d.slotT >= D.SLOT - 2) { d.warned = true; d.note = `次の決闘：${D.nameOf(n)}（2秒後）`; K.send({ t: 'dnx', id: n }); }
        if (d.slotT >= D.SLOT) D.switchTo(n);
      }
      const bu = BS.update;
      BS.update = function (dt) {
        const d0 = D.cur;
        // in a duel the guardian aims only at the duellist: the host's own target swapping (and its sending of effects) stays out of it
        if (d0 && K.live) { K.live = false; try { bu.call(BS, dt); } finally { K.live = true; } }
        else bu.call(BS, dt);
        if (pend) { const b = pend; pend = null; if (b === BS.active && !b.dead && !D.cur) D.begin(b); }
        if (D.cur) rotate(dt);
        auraTick(dt);
        if (!K.live) return;
        syT -= dt; wgT -= dt;
        if (D.cur && syT <= 0) { syT = 0.5; K.send(state(D.cur)); }
        const b = bossOk();
        if (!D.cur && b && b.duelSt.wg > 0 && wgT <= 0) { wgT = 0.5; K.send({ t: 'dwg', g: Math.round(b.duelSt.wg), gm: Math.round(b.duelSt.wgMax) }); }
      };
    } else {
      // ---------------- a guest: follows the host's duel, judges its own parries ----------------
      const adopt = (m) => {
        const b = bossOk(); if (!b) return null;
        let d = D.cur;
        if (!d) { b.duelSt.n = (m.n || 1) - 1; d = D.begin(b, m.w, { x: m.c[0], z: m.c[1] }); }
        d.np = m.np || d.np;
        if (Math.abs(d.t - m.ti) > 0.15) d.t = m.ti;
        d.fightT = m.f; d.readUntil = m.r;
        b.duelSt.wg = m.g; b.duelSt.wgMax = m.gm;
        if (d.who !== m.w) D.switchTo(m.w);
        return d;
      };
      K.handlers.dbg = adopt;
      K.handlers.dsy = adopt;
      K.handlers.dcb = function (m) {
        const d = D.cur; if (!d) return;
        D.startCombo(m.l.map(([at, from, hold]) => ({ at, from, hold, flashed: false, done: false, parried: false, fail: false })), m.t0);
        d.combo.id = m.k; d.comboN = m.k;
      };
      D.onCombo = () => {};
      D.onParry = (d, i) => { K.send({ t: 'dpr', k: d.combo.id, i }); }; // this guest parried: the host takes it off the gauge
      K.handlers.dpx = function (m) {
        const d = D.cur; if (!d || !d.combo || d.combo.id !== m.k) return;
        const s = d.combo.list[m.i]; if (!s || s.parried) return;
        s.parried = true; D.parried(d, s, false);
      };
      K.handlers.dsw = function (m) { const d = D.cur; if (!d) return; d.t = m.ti; D.switchTo(m.w); d.readUntil = m.r; d.note = ''; };
      K.handlers.dnx = function (m) { const d = D.cur; if (!d) return; d.note = `次の決闘：${D.nameOf(m.id)}（2秒後）`; if (m.id === K.id) G.ui.toast('⚔ まもなくあなたの決闘 — 金色の閃光に合わせて構え！', 'warn'); };
      K.handlers.dbr = function () { const b = BS.active; if (b) D.breakFx(b); };
      K.handlers.den = function (m) { const b = bossOk(); if (b) { b.duelSt.wg = m.g; b.duelSt.wgMax = m.gm; } if (D.cur) D.finish(!!m.b); };
      K.handlers.dwg = function (m) { const b = bossOk(); if (b && !D.cur) { b.duelSt.wg = m.g; b.duelSt.wgMax = m.gm; } };
      const bu = BS.update;
      BS.update = function (dt) {
        bu.call(BS, dt);
        const b = BS.active;
        if (D.cur) { if (!b || b.dead || D.cur.b !== b) D.abort(); else D.tick(dt); }
        auraTick(dt);
        D.bar(b && !b.dead ? b : null);
      };
    }
    // a guardian gone (area left, run over) ends any duel
    const clr = BS.clear;
    BS.clear = function () { if (D.cur) D.abort(); return clr.apply(this, arguments); };
  };
})();
