'use strict';
// Co-op: what a guardian makes during the fight (egg sacs, shadow clones, wedges, crystals, echoes ...). A guest's guardian is a puppet and never runs that code, so
// the host describes each thing it makes (its meshes, colours and joints), the guest builds a copy, and from then on only the joints that moved are sent.
// The damageable ones become parts on the guest too, so they can be shot; the hits go to the host like any other.
(function () {
  const K = G.Coop;
  const V = G.U.V;
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const skip = (b) => /^sovereign/.test(b.def.id); // (the last guardian's set pieces run from its own code on the guests)

  // ---------------- a thing as data ----------------
  const pgName = (geo) => { const PG = G.Props.PG; for (const k in PG) if (PG[k] === geo) return k; return null; };
  const serMat = (m) => (m ? { c: m.color ? m.color.getHex() : 0xffffff, e: m.emissive ? m.emissive.getHex() : 0, ei: m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity, o: m.opacity, t: m.transparent ? 1 : 0, a: m.blending === THREE.AdditiveBlending ? 1 : 0, r: m.roughness, me: m.metalness, b: m.isMeshBasicMaterial ? 1 : 0, d: m.side === THREE.DoubleSide ? 1 : 0 } : null);
  const serGeo = (g) => { const n = pgName(g); if (n) return { pg: n }; if (g && g.parameters && g.type) return { ty: g.type, pa: g.parameters }; return { pg: 'box' }; };
  function ser(o) {
    const d = { p: [r3(o.position.x), r3(o.position.y), r3(o.position.z)], q: [r3(o.quaternion.x), r3(o.quaternion.y), r3(o.quaternion.z), r3(o.quaternion.w)], s: [r3(o.scale.x), r3(o.scale.y), r3(o.scale.z)], v: o.visible ? 1 : 0, k: [] };
    if (o.isMesh) { d.g = serGeo(o.geometry); d.m = serMat(Array.isArray(o.material) ? o.material[0] : o.material); } else if (o.isSprite) d.sp = serMat(o.material);
    for (const c of o.children) d.k.push(ser(c));
    return d;
  }
  const flat = (o, out) => { out.push(o); for (const c of o.children) flat(c, out); return out; };
  // the same order on both sides: a parent, then each child's whole branch
  function build(d) {
    let o;
    if (d.g) {
      const PG = G.Props.PG;
      const geo = d.g.pg ? PG[d.g.pg] : THREE[d.g.ty] ? new THREE[d.g.ty](...Object.values(d.g.pa)) : PG.box;
      const m = d.m || { c: 0xffffff }, pr = { color: m.c, transparent: !!m.t, opacity: m.o === undefined ? 1 : m.o, side: m.d ? THREE.DoubleSide : THREE.FrontSide };
      if (m.a) { pr.blending = THREE.AdditiveBlending; pr.depthWrite = false; }
      o = new THREE.Mesh(geo || PG.box, m.b ? new THREE.MeshBasicMaterial(pr) : new THREE.MeshStandardMaterial(Object.assign(pr, { emissive: m.e || 0, emissiveIntensity: m.ei === undefined ? 1 : m.ei, roughness: m.r === undefined ? 0.6 : m.r, metalness: m.me || 0 })));
    } else if (d.sp) o = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: d.sp.c, transparent: true, opacity: d.sp.o, blending: d.sp.a ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
    else o = new THREE.Group();
    o.position.set(...d.p); o.quaternion.set(...d.q); o.scale.set(...d.s); o.visible = !!d.v;
    for (const c of d.k) o.add(build(c));
    return o;
  }

  // ---------------- host ----------------
  K.installBossObjHost = function () {
    const BS = G.bosses, tracked = new Map(), sentParts = [];
    let nextId = 1, lastAdd = null;
    const sa = G.scene.add;
    G.scene.add = function (o) { if (arguments.length === 1 && K.own > 0) lastAdd = o; return sa.apply(G.scene, arguments); };
    const track = (o) => {
      for (const t of tracked.values()) if (t.o === o) return t;
      if (tracked.size >= 48) return null;
      const t = { id: nextId++, o, nodes: flat(o, []), last: [], inRoot: o.parent === (BS.active && BS.active.root) ? 1 : 0 };
      tracked.set(t.id, t);
      K.send({ t: 'bo', id: t.id, inRoot: t.inRoot, d: ser(o) });
      return t;
    };
    // the thing a part belongs to: climb from its hit node to just under the scene (or the guardian's own root)
    const topOf = (b, n) => { let o = n; while (o && o.parent && o.parent !== G.scene && o.parent !== b.root) o = o.parent; return o; };
    const pt = BS.Boss.prototype.part;
    BS.Boss.prototype.part = function (o) {
      const p = pt.call(this, o);
      if (!K.live || !this._cpReady || skip(this)) return p;
      const hn = p.hitW.find((h) => h.n), top = hn ? topOf(this, hn.n) : lastAdd, t = top ? track(top) : null;
      const pi = this.parts.indexOf(p);
      p._nid = -(pi + 1);
      // (a part's hit points may be set just after this: the snapshots carry them)
      const m = { t: 'bp', pi, name: p.name, shared: o.shared === false ? 0 : 1, radius: p.radius, height: p.height, bar: p.showBar ? 1 : 0, blood: p.bloodColor, obj: t ? t.id : 0,
        hw: p.hitW.map((h) => ({ n: h.n && t ? t.nodes.indexOf(h.n) : -1, r: h.r, part: h.part, o: h.o ? K.vec(h.o) : 0, w: h.w ? K.vec(h.w) : 0 })) };
      sentParts.push(m);
      K.send(m);
      return p;
    };
    K.bossReady = function (b) {
      b._cpReady = true;
      if (skip(b)) return;
      for (const fn of ['own', 'keep']) if (b[fn]) { const f = b[fn]; b[fn] = function (o) { const r = f.call(b, o); track(o); return r; }; }
    };
    K.sendBossObjs = function () {
      const rows = [];
      for (const [id, t] of tracked) {
        const alive = t.o.parent === G.scene || (BS.active && t.o.parent === BS.active.root);
        if (!alive) { tracked.delete(id); K.send({ t: 'bx', id }); continue; }
        t.nodes.forEach((n, i) => {
          const a = [r2(n.position.x), r2(n.position.y), r2(n.position.z), Math.round(n.quaternion.x * 1000), Math.round(n.quaternion.y * 1000), Math.round(n.quaternion.z * 1000), Math.round(n.quaternion.w * 1000), n.visible ? 1 : 0, r2(n.scale.x), r2(n.scale.y), r2(n.scale.z)], key = a.join();
          if (t.last[i] !== key) { t.last[i] = key; rows.push([id, i].concat(a)); }
        });
      }
      if (rows.length) K.send({ t: 'bn', r: rows });
    };
    K.clearBossObjsHost = function () { tracked.clear(); sentParts.length = 0; };
    K.resendBossObjs = function (to) { for (const t of tracked.values()) { K.send({ t: 'bo', id: t.id, inRoot: t.inRoot, d: ser(t.o) }, to); t.last = []; } for (const m of sentParts) K.send(m, to); };
  };

  // ---------------- guest ----------------
  K.installBossObjGuest = function () {
    const BS = G.bosses, objs = new Map(), waiting = new Map();
    K.handlers.bo = function (m) {
      if (objs.has(m.id)) return;
      const o = build(m.d), b = BS.active;
      (m.inRoot && b ? b.root : G.scene).add(o);
      objs.set(m.id, { o, nodes: flat(o, []), pose: [] });
      const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w.forEach(K.handlers.bp); }
    };
    K.handlers.bx = function (m) { const t = objs.get(m.id); if (t) { t.o.parent && t.o.parent.remove(t.o); objs.delete(m.id); } };
    K.handlers.bn = function (m) { for (const a of m.r) { const t = objs.get(a[0]); if (t) t.pose[a[1]] = a; } };
    K.handlers.bp = function (m) {
      const b = BS.active; if (!b || b.dead) return;
      // (a part waits for its object, and takes its own place in the list whatever arrived first)
      if (b.parts[m.pi] && !b.parts[m.pi].isGap) return;
      const t = objs.get(m.obj);
      if (m.obj && !t) { if (!waiting.has(m.obj)) waiting.set(m.obj, []); waiting.get(m.obj).push(m); return; }
      const hitW = m.hw.map((h) => ({ n: h.n >= 0 && t ? t.nodes[h.n] : undefined, r: h.r, part: h.part, o: h.o ? V(...h.o) : V(), w: h.w ? V(...h.w) : V() }));
      while (b.parts.length <= m.pi) b.parts.push({ alive: false, hitW: [], shield: 0, st: {}, isGap: true });
      const p = b.part({ name: m.name, shared: m.shared ? undefined : false, hitW, radius: m.radius, height: m.height, showBar: !!m.bar, blood: m.blood });
      b.parts.pop(); b.parts[m.pi] = p;
      if (!m.shared) { p.hp = 1; p.maxHp = 1; }
      p._nid = -(m.pi + 1);
      p.barPos = () => p.centerRef.clone().add(V(0, (p.height || 2) * 0.7, 0));
    };
    const q = new THREE.Quaternion(), T = V();
    K.poseBossObjs = function (dt) {
      const k = Math.min(1, dt * 14);
      for (const t of objs.values()) {
        t.nodes.forEach((n, i) => {
          const a = t.pose[i]; if (!a) return;
          T.set(a[2], a[3], a[4]); n.position.lerp(T, k);
          q.set(a[5] / 1000, a[6] / 1000, a[7] / 1000, a[8] / 1000).normalize(); n.quaternion.slerp(q, k);
          n.visible = !!a[9]; T.set(a[10], a[11], a[12]); n.scale.lerp(T, k);
        });
        t.o.updateMatrixWorld(true);
      }
    };
    K.clearBossObjs = function () { for (const t of objs.values()) t.o.parent && t.o.parent.remove(t.o); objs.clear(); waiting.clear(); };
  };
})();
