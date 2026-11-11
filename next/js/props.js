'use strict';
// Prop / architecture builders. Static geometry goes into the world batch; destructibles & animated props get own meshes.
(function () {
  const P = (G.Props = {});
  const PG = {}; // prototype geometries
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vs = new THREE.Vector3(), vp = new THREE.Vector3();
  function M(x, y, z, sx, sy, sz, rx, ry, rz) {
    e.set(rx || 0, ry || 0, rz || 0); q.setFromEuler(e); vp.set(x, y, z); vs.set(sx, sy, sz);
    return m4.clone().compose(vp, q, vs);
  }
  P.M = M;
  P.init = function () {
    PG.oct = new THREE.CylinderGeometry(1, 1, 1, 8, 1); PG.oct.rotateY(Math.PI / 8);
    PG.cyl = new THREE.CylinderGeometry(1, 1, 1, 22, 1);
    PG.cyl8 = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
    PG.cone = new THREE.ConeGeometry(1, 1, 14);
    PG.sph = new THREE.SphereGeometry(1, 18, 12);
    PG.dode = new THREE.DodecahedronGeometry(1, 0);
    PG.ico = new THREE.IcosahedronGeometry(1, 0);
    PG.oct3 = new THREE.OctahedronGeometry(1, 0);
    PG.torus = new THREE.TorusGeometry(1, 0.12, 8, 24);
    PG.box = new THREE.BoxGeometry(1, 1, 1);
    PG.rbox = G.GFX ? G.GFX.makeRbox(1, 1, 1, 0.13, 2) : PG.box; // (a unit box with its edges softened: the parts of bodies, stretched to size like the plain one)
    PG.plane = new THREE.PlaneGeometry(1, 1);
    const pts = [];
    for (let i = 0; i <= 28; i++) { const t = i / 28; const r = 0.18 + Math.sin(t * Math.PI) * 0.22 + (t > 0.85 ? (t - 0.85) * 0.6 : 0) - (t > 0.75 && t < 0.85 ? 0.05 : 0); pts.push(new THREE.Vector2(Math.max(0.05, r), t * 0.9)); }
    // (the lip turned over and the inside wall a little way down: looked into from above, the near side of the mouth was not there)
    pts.push(new THREE.Vector2(0.245, 0.9), new THREE.Vector2(0.2, 0.83), new THREE.Vector2(0.17, 0.62), new THREE.Vector2(0.12, 0.3));
    PG.urn = new THREE.LatheGeometry(pts, 28);
    // (a barrel: the swell of its staves, a chime at each end standing proud of the head)
    const bp = [new THREE.Vector2(0.3, 0), new THREE.Vector2(0.354, 0)]; for (let i = 0; i <= 20; i++) { const t = i / 20; bp.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.06, t)); }
    bp.push(new THREE.Vector2(0.354, 1), new THREE.Vector2(0.338, 0.992), new THREE.Vector2(0.334, 0.95));
    PG.barrel = new THREE.LatheGeometry(bp, 28);
    const bowl = []; for (let i = 0; i <= 8; i++) { const t = i / 8; bowl.push(new THREE.Vector2(0.1 + Math.sin(t * Math.PI / 2) * 0.5, t * 0.35)); }
    bowl.push(new THREE.Vector2(0.565, 0.35), new THREE.Vector2(0.5, 0.3), new THREE.Vector2(0.3, 0.13), new THREE.Vector2(0.05, 0.07));   // (its inside)
    PG.bowl = new THREE.LatheGeometry(bowl, 24);
    // (a room's things: a box with its edges just taken off - on walls and floors the plain box stays; a flat hoop for a barrel)
    PG.cbox = G.GFX ? G.GFX.makeRbox(1, 1, 1, 0.035, 1) : PG.box;
    PG.hoop = new THREE.LatheGeometry([[0.985, -0.5], [1.0, -0.5], [1.014, -0.36], [1.014, 0.36], [1.0, 0.5], [0.985, 0.5]].map((q) => new THREE.Vector2(q[0], q[1])), 28);
    // a pitched lid for a tomb: one long and one wide, one high, its ridge along z
    { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0.5, 0.3); sh.lineTo(0.16, 1); sh.lineTo(-0.16, 1); sh.lineTo(-0.5, 0.3); sh.closePath();
      PG.gable = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, steps: 1 }); PG.gable.translate(0, 0, -0.5); }
    // a skull in one piece (it looks to +z, its base at the origin): the vault of it, the face under a brow, cheekbones, the jaw; and, of
    // the dark, its sockets, the nose, the line of the teeth. Far fewer faces than the three balls and a box it was, and a skull to look at
    if (G.GFX && G.GFX.Geo) {
      const Ge = G.GFX.Geo, sp = (r, a, b, sc, at) => Ge.xf(new THREE.SphereGeometry(r, a, b), at, null, sc), rbx = (w, h, d, r, at, rot) => Ge.xf(G.GFX.makeRbox(w, h, d, r, 1), at, rot);
      PG.skullB = Ge.merge([sp(1, 10, 7, [0.095, 0.09, 0.115], [0, 0.118, -0.012]), rbx(0.104, 0.074, 0.06, 0.016, [0, 0.058, 0.072]), rbx(0.122, 0.022, 0.034, 0.008, [0, 0.128, 0.082], [0.25, 0, 0]),
        sp(1, 6, 4, [0.03, 0.022, 0.03], [0.057, 0.072, 0.058]), sp(1, 6, 4, [0.03, 0.022, 0.03], [-0.057, 0.072, 0.058]), rbx(0.082, 0.03, 0.05, 0.01, [0, 0.016, 0.07])]);
      const nose = new THREE.ConeGeometry(0.016, 0.036, 3); nose.rotateX(-0.2);
      PG.skullD = Ge.merge([sp(1, 6, 4, [0.026, 0.028, 0.016], [0.036, 0.098, 0.098]), sp(1, 6, 4, [0.026, 0.028, 0.016], [-0.036, 0.098, 0.098]), Ge.xf(nose, [0, 0.062, 0.104]), rbx(0.07, 0.006, 0.012, 0.002, [0, 0.032, 0.1])]);
      // the ends of long bones stacked in a niche, a stretch one long and one high (set to the niche's size): knobs in rows, none like the next
      const ends = []; let sd = 7;
      const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) {
        const r = 0.048 + rnd() * 0.018, g = new THREE.SphereGeometry(1, 5, 2, 0, Math.PI * 2, 0, Math.PI / 2); g.rotateX(Math.PI / 2);
        ends.push(Ge.xf(g, [(i + 0.5 + (j % 2) * 0.5) / 8.5 - 0.5 + (rnd() - 0.5) * 0.02, (j + 0.5) / 3 + (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.3], null, [r, r * 2.6, 1]));
      }
      PG.boneEnds = Ge.merge(ends);
    }
    for (const k in PG) PG[k].userData.shared = true;
    // (the carved statues take a moment each to cut, gfx.js: one a frame behind the title, before a world asks for them)
    if (G.GFX && G.GFX.propGeo && typeof setTimeout === 'function') { const names = ['statue0', 'statue1', 'statue2', 'statue3'], step = () => { const n = names.shift(); if (!n) return; try { G.GFX.propGeo(n); } catch (e) { /* made when asked for */ } setTimeout(step, 30); }; setTimeout(step, 300); }
  };
  P.PG = PG;
  // Many of one thing (the skulls of an ossuary, the ends of its bones): each kind is drawn as instances of one shape, by stretches of the
  // world some 24 m across (what is out of sight is then left out), instead of being written vertex by vertex into the world's own mesh -
  // which took a second for a nave of them. They cast no shadow (they lie in niches).
  P.inst = function (w, mk, geo, m4, tint) {
    const I = w._inst || (w._inst = new Map()), e = m4.elements, key = mk + geo.uuid + '|' + Math.floor(e[12] / 24) + '|' + Math.floor(e[14] / 24);
    let q = I.get(key); if (!q) I.set(key, q = { mk, geo, m: [], c: [] });
    q.m.push(m4); q.c.push(tint || null);
    if (!w._instQ) {
      w._instQ = true;
      w.deferred.push((grp) => {
        w._instQ = false; const col = new THREE.Color();
        for (const q2 of I.values()) {
          if (!q2.m.length) continue;
          const im = new THREE.InstancedMesh(q2.geo, w.mats[q2.mk] || w.mats.wall, q2.m.length);
          for (let i = 0; i < q2.m.length; i++) { im.setMatrixAt(i, q2.m[i]); if (q2.c[i]) im.setColorAt(i, col.setRGB(q2.c[i][0], q2.c[i][1], q2.c[i][2])); else if (im.instanceColor) im.setColorAt(i, col.setRGB(1, 1, 1)); }
          im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.matrixAutoUpdate = false;
          grp.add(im);
        }
        I.clear();
      });
    }
  };
  const rr = (rng, a, b) => rng ? rng.range(a, b) : a + Math.random() * (b - a);
  // a number from 0 to 1 by where a thing stands (which of its kinds, how it is turned): the dice of the level are not thrown for looks
  const hsh = (x, z, k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + (k || 0) * 37.719) * 43758.5453; return v - Math.floor(v); };
  // a thing shaped in gfx.js (propGeo: parts by material) set down in the world's own mesh: turned by ry, sized by s (o.sy: its height
  // apart; o.rx, o.rz: leaning; o.inst: drawn as instances - for what there is much of)
  function put(w, name, x, y, z, ry, s, o) {
    const parts = G.GFX && G.GFX.propGeo ? G.GFX.propGeo(name) : null; if (!parts) return false;
    o = o || {}; s = s || 1;
    const m = M(x, y, z, o.sx || s, o.sy || s, o.sz || o.sx || s, o.rx || 0, ry || 0, o.rz || 0);
    for (const q of parts) {
      const t = o.tint && q.tint ? [o.tint[0] * q.tint[0], o.tint[1] * q.tint[1], o.tint[2] * q.tint[2]] : o.tint || q.tint;
      if (o.inst) P.inst(w, q.m, q.g, m, t); else w.batch.geo(q.m, q.g, m, { tint: t || undefined, su: o.su, sv: o.sv, gradBase: o.gradBase });
    }
    return true;
  }
  P.put = put; P.hsh = hsh;
  // grass: a tuft at (x, y, z) and n more about it within r (gy(x, z): the ground's height there, where it is not flat)
  P.tuft = function (w, x, y, z, s, tint, n, r, gy) {
    if (!(G.GFX && G.GFX.propGeo && G.GFX.propGeo('tuft'))) return false;
    n = n === undefined ? 6 : n; r = r || 1.3;
    for (let i = 0; i <= n; i++) {
      const a = hsh(x, z, i) * 6.283, d = i ? (0.25 + hsh(x, z, i + 20) * 0.75) * r : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, k = (s || 1) * (0.55 + hsh(px, pz, 3) * 0.6), c = 0.8 + hsh(px, pz, 5) * 0.4;
      put(w, 'tuft', px, gy && i ? gy(px, pz) : y, pz, hsh(px, pz, 7) * 6.283, k * 0.5, { sy: k * 0.44, inst: true, tint: tint ? [tint[0] * c, tint[1] * c, tint[2] * c] : [c, c, c * 0.95] });
    }
    return true;
  };

  // grass over the open ground of a field of turf (world.js calls it once everything stands): a grid of places, each moved a little
  // by where it is; thick in drifts and thin between them; none on a path, a floor of boards, under a wall or beside water
  P.meadow = function (w) {
    const B = w.mats && w.mats.biome; if (!B || B.floorTex !== 'grass' || w._meadow) return; w._meadow = true;
    if (!(G.GFX && G.GFX.propGeo && G.GFX.propGeo('tuft'))) return;
    const x0 = (w.xo || 0) + 1.5, x1 = (w.xo || 0) + (w.Wn || w.W) - 1.5, z0 = (w.zo || 0) + 1.5, z1 = (w.zo || 0) + (w.Dn || w.D) - 1.5, step = 1.25;
    const cells = (x1 - x0) * (z1 - z0) / (step * step), thin = Math.min(1, 4200 / Math.max(1, cells));   // (a very large field: fewer to the metre)
    const gy = w.groundTop ? (x, z) => w.groundTop(x, z) : () => 0;
    const blocked = (x, z, y) => {
      const a = w.hash.get(w._hkey(Math.floor(x / 4), Math.floor(z / 4))); if (!a) return false;   // (world.js keeps its colliders by cells of 4 m)
      for (const c of a) { if (c.alive === false || x < c.x0 - 0.15 || x > c.x1 + 0.15 || z < c.z0 - 0.15 || z > c.z1 + 0.15) continue; if (c.y1 > y + 0.03 && c.y0 < y + 1.2) return true; }
      return false;
    };
    const tint = B.grassTint ? null : null;
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      const drift = hsh(Math.floor(x / 6), Math.floor(z / 6), 11) * 0.6 + hsh(Math.floor(x / 2.5), Math.floor(z / 2.5), 12) * 0.4;
      if (hsh(x, z, 13) > (0.25 + drift * 0.75) * thin) continue;
      const px = x + (hsh(x, z, 14) - 0.5) * step, pz = z + (hsh(x, z, 15) - 0.5) * step, y = gy(px, pz);
      if (!(y > -50) || blocked(px, pz, y)) continue;
      P.tuft(w, px, y, pz, 0.75 + drift * 0.55, tint, drift > 0.55 ? 2 : 1, 0.6, w.groundTop ? gy : null);
    }
  };

  // ---------- light fixtures ----------
  // wall torch. dir: outward normal from wall ('px','nx','pz','nz')
  P.torch = function (w, x, y, z, dir) {
    const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir];
    const ry = Math.atan2(d[0], d[1]);
    put(w, 'sconce', x, y, z, ry);   // (a plate nailed to the wall, a bent arm, a ring with claws, a brand wound with pitched rag: gfx.js)
    w.addLight(x + d[0] * 0.38, y + 0.5, z + d[1] * 0.38, { flame: 1 });
  };
  P.brazier = function (w, x, y, z, s, collide) {
    s = s || 1;
    put(w, 'brazier', x, y, z, hsh(x, z) * 2, s);   // (three legs of wrought iron, a basket of bars, coals: gfx.js)
    if (collide !== false) w.addCollider(x - 0.42 * s, y, z - 0.42 * s, x + 0.42 * s, y + 1.05 * s, z + 0.42 * s, { surf: 'metal' });
    w.addLight(x, y + 1.0 * s, z, { flame: 2.2 * s, intensity: 16 * s, range: 16 * s, prio: 1.4 });
  };
  P.candles = function (w, x, y, z, rng, light) {
    const n = 3 + Math.floor(rr(rng, 0, 4));
    for (let i = 0; i < n; i++) {
      const ox = rr(rng, -0.25, 0.25), oz = rr(rng, -0.25, 0.25), h = rr(rng, 0.12, 0.35);
      put(w, 'candle', x + ox, y + h / 2, z + oz, hsh(x + ox, z + oz) * 6.28, 0.035, { sy: h, inst: true });
      if (i === 0 && light !== false) w.addLight(x + ox, y + h + 0.05, z + oz, { flame: 0.35, intensity: 2.5, range: 5, prio: 0.5 });
      else w.lightSources.push({ pos: new THREE.Vector3(x + ox, y + h + 0.05, z + oz), color: '#ffb060', intensity: 0, range: 0, flame: 0.3, emit: true, noLight: true, ph: Math.random() * 99, prio: 0.0001 });
    }
  };
  P.chandelier = function (w, x, y, z, top) {
    put(w, 'chandelier', x, y, z, 0);   // (a ring hung by rods from a boss, a lesser ring, pans with prickets: gfx.js)
    // chain to ceiling
    const len = top - y - 1.2;
    if (len > 0) P.chain(w, x, y + 1.2, z, len);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      put(w, 'candle', x + Math.cos(a) * 1.1, y + 0.15 + (i % 3) * 0.015, z + Math.sin(a) * 1.1, a * 3, 0.036, { sy: 0.22 + (i % 3) * 0.035 });
      if (i % 4 === 0) w.addLight(x + Math.cos(a) * 1.1, y + 0.35, z + Math.sin(a) * 1.1, { flame: 0.4, intensity: 10, range: 14, prio: 1.2 });
      else w.lightSources.push({ pos: new THREE.Vector3(x + Math.cos(a) * 1.1, y + 0.35, z + Math.sin(a) * 1.1), color: '#ffb060', intensity: 0, range: 0, flame: 0.35, emit: true, noLight: true, ph: Math.random() * 99, prio: 0.0001 });
    }
  };
  P.chain = function (w, x, y, z, len) {
    const n = Math.max(1, Math.floor(len / 0.18));
    for (let i = 0; i < n; i++) w.batch.geo('iron', PG.torus, M(x, y + i * 0.18 + 0.09, z, 0.07, 0.11, 0.07, 0, i % 2 ? Math.PI / 2 : 0, 0));
  };

  // ---------- architecture ----------
  P.pillarSquare = function (w, x, z, y0, h, s, mk) {
    s = s || 0.9; mk = mk || 'block';
    const b = s / 2 + 0.15;
    w.solid('trim', x - b, y0, z - b, x + b, y0 + 0.45, z + b);
    w.solid('trim', x - b + 0.08, y0 + 0.45, z - b + 0.08, x + b - 0.08, y0 + 0.6, z + b - 0.08);
    w.solid(mk, x - s / 2, y0 + 0.6, z - s / 2, x + s / 2, y0 + h - 0.5, z + s / 2, { uv: 2 });
    w.solid('trim', x - b + 0.08, y0 + h - 0.5, z - b + 0.08, x + b - 0.08, y0 + h - 0.35, z + b - 0.08);
    w.solid('trim', x - b, y0 + h - 0.35, z - b, x + b, y0 + h, z + b);
  };
  P.pillarRound = function (w, x, z, y0, h, r, broken, rng) {
    r = r || 0.4;
    const b = r + 0.18;
    const top = broken ? y0 + h * rr(rng, 0.3, 0.7) : y0 + h;
    w.solid('trim', x - b, y0, z - b, x + b, y0 + 0.4, z + b);
    put(w, 'colbase', x, y0 + 0.48, z, 0, r * 1.02, { sy: 0.17, su: 3, sv: 0.3 });
    const sh = top - (broken ? 0 : 0.5) - (y0 + 0.54);
    // octagonal shaft whose apothem == collider half-size (no invisible margin on the flats)
    const R = r / Math.cos(Math.PI / 8);
    put(w, 'shaft', x, y0 + 0.54 + sh / 2, z, hsh(x, z) * 0.4, r, { sy: sh, su: 3, sv: sh / 1.4, gradBase: y0 });   // (a fluted shaft, swelling a little below its middle)
    w.addCollider(x - r, y0 + 0.4, z - r, x + r, top, z + r);
    if (!broken) {
      put(w, 'colcap', x, top - 0.445, z, 0, r, { sy: 0.18, su: 3, sv: 0.3 });
      w.solid('trim', x - b, top - 0.36, z - b, x + b, top, z + b);
    } else {
      // jagged top + rubble at base
      w.batch.geo('trim', PG.dode, M(x, top, z, r * 0.95, 0.25, r * 0.95, rr(rng, 0, 1), rr(rng, 0, 3), 0));
      P.rubble(w, x + rr(rng, -1.5, 1.5), y0, z + rr(rng, -1.5, 1.5), rng, 0.8);
    }
  };
  P.rubble = function (w, x, y, z, rng, s, mk) {
    s = s || 1;
    const n = 3 + Math.floor(rr(rng, 0, 5));
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      const sz = rr(rng, 0.12, 0.38) * s;
      const ox = rr(rng, -0.6, 0.6) * s, oz = rr(rng, -0.6, 0.6) * s;
      w.batch.geo(mk || 'block', PG.dode, M(x + ox, y + sz * 0.5, z + oz, sz, sz * rr(rng, 0.5, 1), sz * rr(rng, 0.7, 1.2), rr(rng, 0, 3), rr(rng, 0, 3), 0), { su: 0.3, sv: 0.3 });
      maxH = Math.max(maxH, sz);
    }
    if (s > 1.2) w.addCollider(x - 0.5 * s, y, z - 0.5 * s, x + 0.5 * s, y + maxH * 0.9, z + 0.5 * s);
  };
  P.bones = function (w, x, y, z, rng) {
    const lb = G.GFX && G.GFX.propGeo ? G.GFX.propGeo('longbone') : null;   // (long bones with their knobbed ends, a few ribs: gfx.js)
    for (let i = 0; i < 4; i++) w.batch.geo('bone', lb ? lb[0].g : PG.cyl8, M(x + rr(rng, -0.6, 0.6), y + 0.03, z + rr(rng, -0.6, 0.6), lb ? 0.018 : 0.025, rr(rng, 0.25, 0.45), lb ? 0.018 : 0.025, Math.PI / 2, rr(rng, 0, 3), 0));
    put(w, 'ribs', x + (hsh(x, z, 1) - 0.5) * 0.7, y, z + (hsh(x, z, 2) - 0.5) * 0.7, hsh(x, z, 3) * 6);
    P.skull(w, x + rr(rng, -0.3, 0.3), y, z + rr(rng, -0.3, 0.3), rr(rng, 0, 6));
  };
  P.skull = function (w, x, y, z, ry, s) {
    s = s || 1;
    if (PG.skullB) { const m4 = M(x, y, z, s, s, s, 0, ry, 0); P.inst(w, 'bone', PG.skullB, m4); P.inst(w, 'dark', PG.skullD, m4); return; }
    w.batch.geo('bone', PG.sph, M(x, y + 0.1 * s, z, 0.1 * s, 0.09 * s, 0.12 * s, 0, ry, 0));
    w.batch.geo('bone', PG.cbox, M(x + Math.sin(ry) * 0.06 * s, y + 0.04 * s, z + Math.cos(ry) * 0.06 * s, 0.1 * s, 0.05 * s, 0.07 * s, 0, ry, 0));
    w.batch.geo('dark', PG.sph, M(x + Math.sin(ry) * 0.09 * s - Math.cos(ry) * 0.035 * s, y + 0.11 * s, z + Math.cos(ry) * 0.09 * s + Math.sin(ry) * 0.035 * s, 0.025 * s, 0.025 * s, 0.025 * s));
    w.batch.geo('dark', PG.sph, M(x + Math.sin(ry) * 0.09 * s + Math.cos(ry) * 0.035 * s, y + 0.11 * s, z + Math.cos(ry) * 0.09 * s - Math.sin(ry) * 0.035 * s, 0.025 * s, 0.025 * s, 0.025 * s));
  };
  P.sarcophagus = function (w, x, z, y, rotX, rng) {
    const L = 2.3, Wd = 1.0;
    const hx = rotX ? L / 2 : Wd / 2, hz = rotX ? Wd / 2 : L / 2;
    w.solid('trim', x - hx, y, z - hz, x + hx, y + 0.25, z + hz);
    w.solid('block', x - hx + 0.08, y + 0.25, z - hz + 0.08, x + hx - 0.08, y + 0.85, z + hz - 0.08, { uv: 1.5 });
    const lidOff = rng && rng.chance(0.3) ? 0.25 : 0;
    w.solid('trim', x - hx + (rotX ? lidOff : 0), y + 0.85, z - hz + (rotX ? 0 : lidOff), x + hx + (rotX ? lidOff : 0), y + 1.0, z + hz + (rotX ? 0 : lidOff));
    // carved cross on lid
    if (rotX) { w.batch.box('trim', x - 0.7, y + 1.0, z - 0.06, x + 0.7, y + 1.04, z + 0.06, { uv: 1 }); w.batch.box('trim', x + 0.25, y + 1.0, z - 0.3, x + 0.37, y + 1.04, z + 0.3, { uv: 1 }); }
    else { w.batch.box('trim', x - 0.06, y + 1.0, z - 0.7, x + 0.06, y + 1.04, z + 0.7, { uv: 1 }); w.batch.box('trim', x - 0.3, y + 1.0, z - 0.37, x + 0.3, y + 1.04, z - 0.25, { uv: 1 }); }
    // (a pitched lid over the flat one, a pilaster at each corner, a moulding under the lid: to look at - the box that stops you is the same)
    {
      const lx = rotX ? lidOff : 0, lz = rotX ? 0 : lidOff;
      w.batch.geo('trim', PG.gable, M(x + lx, y + 1.0, z + lz, Wd - 0.1, 0.2, L - 0.1, 0, rotX ? Math.PI / 2 : 0, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.batch.box('trim', x + sx * (hx - 0.04) - 0.09, y + 0.25, z + sz * (hz - 0.04) - 0.09, x + sx * (hx - 0.04) + 0.09, y + 0.85, z + sz * (hz - 0.04) + 0.09, { uv: 1 });
      w.batch.box('trim', x - hx - 0.02, y + 0.78, z - hz - 0.02, x + hx + 0.02, y + 0.85, z + hz + 0.02, { uv: 1 });
    }
    if (rng && rng.chance(0.5)) P.candles(w, x + (rotX ? -0.8 : 0.3), y + 1.2, z + (rotX ? 0.25 : -0.8), rng, false);
  };
  P.statue = function (w, x, z, y, ry, rng, s) {
    s = s || 1;
    // pedestal
    w.solid('trim', x - 1.1 * s, y, z - 1.1 * s, x + 1.1 * s, y + 0.5 * s, z + 1.1 * s);
    w.solid('block', x - 0.85 * s, y + 0.5 * s, z - 0.85 * s, x + 0.85 * s, y + 1.6 * s, z + 0.85 * s, { uv: 1.5 });
    w.solid('trim', x - 0.95 * s, y + 1.6 * s, z - 0.95 * s, x + 0.95 * s, y + 1.8 * s, z + 0.95 * s);
    const b = y + 1.8 * s;
    // (carved figures, gfx.js: a knight on his sword, a mourner in a hood, an angel of the graveyard, a knight broken off at the neck)
    put(w, 'statue' + [0, 1, 2, 0, 1, 3, 2][Math.floor(hsh(x, z) * 7)], x, b, z, ry, s * 1.2);
    w.addCollider(x - 0.45 * s, b, z - 0.45 * s, x + 0.45 * s, b + 2.1 * s, z + 0.45 * s);
    if (rng && rng.chance(0.4)) { const bc = rng.chance(0.5); P.candles(w, x + 0.6 * s, y + 0.5 * s, z + 0.95 * s, rng, bc); }
  };
  P.bookshelf = function (w, x, z, y, alongX, rng) {
    const L = 2.0, D = 0.45, H = 2.4;
    const hx = alongX ? L / 2 : D / 2, hz = alongX ? D / 2 : L / 2;
    w.addCollider(x - hx, y, z - hz, x + hx, y + H, z + hz, { surf: 'wood', tag: 'grate' }); // (open at the front: the books stand back in it)
    const fry = alongX ? 0 : Math.PI / 2;
    put(w, 'shelf', x, y, z, fry);   // (sides, plinth, cornice, shelves, back: gfx.js)
    const cols = [[0.45, 0.15, 0.1], [0.15, 0.25, 0.35], [0.2, 0.3, 0.15], [0.5, 0.4, 0.2], [0.3, 0.2, 0.3], [0.6, 0.55, 0.45]];
    for (let sh = 0; sh < 4; sh++) {
      const yy = y + 0.08 + sh * 0.58;
      let t = -L / 2 + 0.08;
      while (t < L / 2 - 0.12) {
        const bw = rr(rng, 0.05, 0.11), bh = rr(rng, 0.28, 0.45);
        if (rr(rng, 0, 1) < 0.12) {   // (a gap: now and then a skull or a candle end stands in it)
          const gx = alongX ? x + t + 0.07 : x, gz = alongX ? z : z + t + 0.07, hk = hsh(gx, gz, sh);
          if (hk < 0.25) P.skull(w, gx, yy + 0.04, gz, fry + (hk - 0.12) * 4, 0.9); else if (hk < 0.45) put(w, 'candle', gx, yy + 0.04 + 0.05, gz, hk * 9, 0.03, { sy: 0.1, inst: true });
          t += 0.15; continue;
        }
        const c = cols[Math.floor(rr(rng, 0, cols.length))];
        {   // (a book with a rounded spine and its bands, the leaves showing above: drawn as instances, each its own leather)
          const bx = alongX ? x + t + bw / 2 : x, bz = alongX ? z : z + t + bw / 2, hk = hsh(bx, bz, sh), back = -0.03 + hk * 0.05, k = 0.55 + hk * 0.35;
          put(w, 'book', bx + (alongX ? 0 : back), yy + 0.04, bz + (alongX ? back : 0), fry, bw, { sx: bw, sy: bh, sz: 0.3 - hk * 0.04, inst: true, tint: [c[0] * k, c[1] * k, c[2] * k] });
        }
        t += bw + 0.01;
      }
    }
  };
  P.table = function (w, x, z, y, alongX, rng) {
    const L = 2.2, Wd = 1.0;
    const hx = alongX ? L / 2 : Wd / 2, hz = alongX ? Wd / 2 : L / 2;
    const fry = alongX ? 0 : Math.PI / 2, hard = (x0, y0, z0, x1, y1, z1) => { const c = w.addCollider(x0, y0, z0, x1, y1, z1, { surf: 'wood' }); c.vis = true; return c; };
    put(w, 'table', x, y, z, fry);   // (four boards on four legs, aprons, a stretcher: gfx.js. What stops you is as it was)
    hard(x - hx, y + 0.78, z - hz, x + hx, y + 0.86, z + hz);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) hard(x + sx * (hx - 0.12) - 0.05, y, z + sz * (hz - 0.12) - 0.05, x + sx * (hx - 0.12) + 0.05, y + 0.78, z + sz * (hz - 0.12) + 0.05);
    { const hk = hsh(x, z, 5), u = (hsh(x, z, 6) - 0.5) * 1.2, v = (hsh(x, z, 7) - 0.5) * 0.3; if (hk < 0.75) put(w, 'tablet' + Math.floor(hk * 4) % 3, x + (alongX ? u : v), y + 0.862, z + (alongX ? v : u), fry + (hk - 0.4) * 1.5); }   // (what was left lying on it)
    if (rng && rng.chance(0.6)) P.candles(w, x + rr(rng, -0.5, 0.5), y + 0.86, z + rr(rng, -0.2, 0.2), rng, rng.chance(0.5));
    if (rng && rng.chance(0.5)) w.batch.geo('ceramic', PG.urn, M(x + rr(rng, -0.6, 0.6), y + 0.86, z, 0.35, 0.35, 0.35));
    // benches
    if (rng && rng.chance(0.7)) {
      const o = (alongX ? hz : hx) + 0.45;
      for (const sd of [-1, 1]) {
        if (alongX) { put(w, 'bench', x, y, z + sd * o, 0); hard(x - hx + 0.1, y + 0.4, z + sd * o - 0.18, x + hx - 0.1, y + 0.48, z + sd * o + 0.18); }
        else { put(w, 'bench', x + sd * o, y, z, Math.PI / 2); hard(x + sd * o - 0.18, y + 0.4, z - hz + 0.1, x + sd * o + 0.18, y + 0.48, z + hz - 0.1); }
      }
    }
  };
  P.cage = function (w, x, z, y, s, rng) {
    s = s || 1.4;
    const h = 2.2;
    w.solid('iron', x - s / 2, y, z - s / 2, x + s / 2, y + 0.1, z + s / 2, { uv: 1 });
    put(w, 'cage', x, y, z, Math.floor(hsh(x, z) * 4) * Math.PI / 2, 1, { sx: s / 1.4, sy: 1, sz: s / 1.4 });   // (posts, bars, rails, a door with its lock: gfx.js)
    w.addCollider(x - s / 2, y + 0.1, z - s / 2, x + s / 2, y + h, z + s / 2, { surf: 'metal', tag: 'grate' });
    if (rng && rng.chance(0.6)) { P.bones(w, x, y + 0.1, z, rng); }
  };
  P.well = function (w, x, z, y) {
    const r = 1.3;
    w.batch.geo('block', PG.oct, M(x, y + 0.45, z, r / Math.cos(Math.PI / 8), 0.9, r / Math.cos(Math.PI / 8)), { su: 4, sv: 0.6 });
    w.batch.geo('dark', PG.oct, M(x, y + 0.91, z, r * 0.85, 0.02, r * 0.85));
    w.addCollider(x - r, y, z - r, x + r, y + 0.9, z + r);
    for (const sx of [-1, 1]) { const c = w.addCollider(x + sx * (r - 0.15) - 0.1, y + 0.9, z - 0.1, x + sx * (r - 0.15) + 0.1, y + 3.0, z + 0.1, { surf: 'wood' }); c.vis = true; }
    put(w, 'wellhead', x, y, z, 0);   // (a coping, two posts and a beam, a roof of boards, a windlass with rope and crank, a bucket: gfx.js)
  };
  P.banner = function (w, x, y, z, dir, len, color) {
    // y = top of banner; dir = outward normal from wall
    const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir];
    const ry = Math.atan2(d[0], d[1]);
    w.batch.geo('iron', PG.cyl8, M(x + d[0] * 0.12, y + 0.05, z + d[1] * 0.12, 0.022, 1.3, 0.022, 0, ry, Math.PI / 2));
    for (const e2 of [-1, 1]) w.batch.geo('iron', PG.sph, M(x + d[0] * 0.12 + d[1] * e2 * 0.66, y + 0.05, z + d[1] * 0.12 - d[0] * e2 * 0.66, 0.04, 0.04, 0.04));   // (the rod's knobs)
    w.deferred.push((grp) => {
      const bg = G.GFX && G.GFX.propGeo ? G.GFX.propGeo('banner') : null;   // (in folds, two tails, frayed, a device on it: gfx.js)
      const geo = bg ? bg[0].g : new THREE.PlaneGeometry(1.1, len, 1, 6); if (!bg) geo.translate(0, -len / 2, 0);
      const mat = color ? w.mats.cloth.clone() : w.mats.cloth;
      if (color) mat.color.set(color);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + d[0] * 0.16, y, z + d[1] * 0.16); m.rotation.y = ry;
      if (bg) { m.scale.y = len; const dv = new THREE.Mesh(bg[1].g, mat.clone()); dv.material.color.multiplyScalar(0.35); m.add(dv); }
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
      w.animated.push({ kind: 'banner', m, ph: Math.random() * 10 });
    });
  };
  P.web = function (w, x, y, z, ry, s) {
    w.deferred.push((grp) => {
      const m = new THREE.Mesh(PG.plane, w.mats.web);
      m.position.set(x, y, z); m.rotation.set(0, ry, 0); m.scale.set(s, s, s);
      grp.add(m);
    });
  };
  P.vines = function (w, x, y, z, dir, h, rng) {
    const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir];
    const ry = Math.atan2(d[0], d[1]);
    for (let i = 0; i < 3; i++) {
      const ox = rr(rng, -1, 1);
      w.batch.geo('vine', PG.plane, M(x + d[0] * 0.04 + d[1] * ox, y - h / 2 - i * 0.3, z + d[1] * 0.04 - d[0] * ox, 0.9, h, 1, 0, ry, 0), { su: 1, sv: h });
    }
  };
  P.crystals = function (w, x, y, z, rng, s) {
    s = s || 1;
    for (let i = 0; i < 5; i++) {
      const h = rr(rng, 0.5, 1.6) * s;
      const cg = G.GFX && G.GFX.propGeo ? G.GFX.propGeo('crystal') : null;   // (six-sided, drawn to a point: gfx.js)
      w.batch.geo('ice', cg ? cg[0].g : PG.oct3, M(x + rr(rng, -0.5, 0.5) * s, y + h * 0.4, z + rr(rng, -0.5, 0.5) * s, (cg ? 0.16 : 0.2) * s, cg ? h * 0.75 : h, (cg ? 0.16 : 0.2) * s, rr(rng, -0.4, 0.4), rr(rng, 0, 3), rr(rng, -0.4, 0.4)), { tint: [0.6, 0.7, 0.8] });
    }
    w.roundCollider(x, z, 0.6 * s, y, y + 1.0 * s, { tag: 'grate' }); // (a cluster of spikes: round enough; seen through between them)
  };
  P.weaponRack = function (w, x, z, y, alongX) {
    const hx = alongX ? 1.0 : 0.2, hz = alongX ? 0.2 : 1.0;
    w.solid('woodDark', x - hx, y, z - hz, x + hx, y + 0.12, z + hz, { uv: 1 });
    put(w, 'rack', x, y + 0.1, z, alongX ? 0 : Math.PI / 2);   // (posts, a rail with pegs, a rest; pikes, a great sword, an axe, a shield: gfx.js)
    w.addCollider(x - hx, y + 0.12, z - hz, x + hx, y + 1.7, z + hz, { surf: 'wood', tag: 'grate' }); // (a rack: you see through it between the weapons, and it stops you)
  };
  P.gravestone = function (w, x, z, y, ry, rng) {
    const t = rng ? rng.int(0, 2) : 0;
    const lx = t === 0 ? rr(rng, -0.1, 0.1) : (hsh(x, z, 1) - 0.5) * 0.14, lz = t === 0 ? rr(rng, -0.1, 0.1) : (hsh(x, z, 2) - 0.5) * 0.14;   // (they lean, each its own way)
    put(w, 'grave' + t, x, y - 0.03, z, ry, 0.9 + hsh(x, z, 3) * 0.25, { rx: lx, rz: lz });
    w.addCollider(x - 0.38, y, z - 0.38, x + 0.38, y + 1.0, z + 0.38);
  };
  // a floating text label (no physical board): a soft translucent plate with glowing text, readable from both sides
  P.label = function (w, text, x, y, z, ry, width, opts) {
    opts = opts || {};
    const cw = 768, ch = 160, c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'), col = opts.color || '#ffe2a0';
    g.fillStyle = 'rgba(8,6,4,0.42)'; g.beginPath(); g.roundRect ? g.roundRect(6, 6, cw - 12, ch - 12, 40) : g.rect(6, 6, cw - 12, ch - 12); g.fill();
    g.strokeStyle = col; g.globalAlpha = 0.5; g.lineWidth = 3; g.stroke(); g.globalAlpha = 1;
    g.font = '900 ' + (opts.size || 84) + 'px "Noto Sans JP","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col; (G.Icons ? G.Icons.fillText : (g2, t2, x2, y2, o2) => { if (o2 && o2.stroke) g2.strokeText(t2, x2, y2); g2.fillText(t2, x2, y2); })(g, text, cw / 2, ch / 2 + 4);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const grp = new THREE.Group();
    for (const side of [0, Math.PI]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * ch / cw), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      m.rotation.y = side; m.position.z = side ? -0.02 : 0.02; grp.add(m);
    }
    grp.position.set(x, y, z); grp.rotation.y = ry || 0;
    w.group.add(grp);
    return grp;
  };
  P.rug = function (w, x, z, y, sx, sz, color) {
    if (!put(w, 'rug', x, y, z, 0, 1, { sx, sy: 1, sz, tint: color || [0.45, 0.12, 0.1] })) w.batch.box('cloth2', x - sx / 2, y, z - sz / 2, x + sx / 2, y + 0.02, z + sz / 2, { uv: 2, tint: color || [0.45, 0.12, 0.1], grad: false });
  };
  P.drain = function (w, x, z, y) {
    if (!put(w, 'drain', x, y, z, 0)) w.batch.box('iron', x - 0.5, y, z - 0.5, x + 0.5, y + 0.015, z + 0.5, { uv: 0.5, tint: [0.4, 0.4, 0.4] });
  };

  // ---------- destructibles ----------
  // Destructibles are separate meshes with a collider linked to a hp pool.
  function destructible(w, type, mesh, x, y, z, hx, h, hz, o) {
    const d = Object.assign({ type, mesh, hp: 30, alive: true, pos: new THREE.Vector3(x, y + h / 2, z), surf: 'wood', coins: [1, 4] }, o || {});
    d.col = w.addCollider(x - hx, y, z - hz, x + hx, y + h, z + hz, { surf: d.surf, dest: d });
    w.destructibles.push(d);
    return d;
  }
  P.crate = function (w, x, z, y, rng, s) {
    s = s || rr(rng, 0.8, 1.05);
    const ry = rng && rng.chance(0.5) ? 0 : 0;
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(PG.cbox, w.mats.wood); body.scale.set(s, s, s); body.position.y = s / 2;
      g.add(body);
      for (const sy of [0.04, s - 0.04]) for (const ax of [0, 1]) {
        const b = new THREE.Mesh(PG.cbox, w.mats.woodDark);
        b.scale.set(ax ? s + 0.03 : 0.1, 0.08, ax ? 0.1 : s + 0.03);
        b.position.set(0, sy, 0); if (ax) b.position.z = 0; g.add(b);
      }
      const brace = new THREE.Mesh(PG.cbox, w.mats.woodDark); brace.scale.set(s * 1.3, 0.09, 0.04); brace.rotation.z = Math.PI / 4; brace.position.set(0, s / 2, s / 2 + 0.01); g.add(brace);
      const brace2 = brace.clone(); brace2.position.z = -s / 2 - 0.01; g.add(brace2);
      g.position.set(x, y, z); g.rotation.y = ry;
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      grp.add(g); d.mesh = g;
    });
    const d = destructible(w, 'crate', null, x, y, z, s / 2, s, s / 2, { hp: 35, surf: 'wood', mat: 'wood' });
    return d;
  };
  P.barrel = function (w, x, z, y, rng, explosive) {
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(PG.barrel, explosive ? w.mats.ceramic : w.mats.wood);
      if (explosive) { body.material = w.mats.wood.clone(); body.material.color.set('#7a3020'); }
      body.scale.set(1, 1.1, 1); g.add(body);
      for (const hy of [0.15, 0.55, 0.95]) {
        // (a flat iron hoop, sitting on the swell where it is)
        const hr = (0.36 + Math.sin(hy / 1.1 * Math.PI) * 0.06) * 1.004, hp = new THREE.Mesh(PG.hoop, w.mats.iron); hp.position.y = hy; hp.scale.set(hr, 0.075, hr); g.add(hp);
      }
      const lid = new THREE.Mesh(PG.cyl, w.mats.woodDark); lid.scale.set(0.336, 0.03, 0.336); lid.position.y = 1.058; g.add(lid);   // (the head, let in below the chime)
      if (explosive) {
        const fuse = new THREE.Mesh(PG.cyl8, w.mats.dark); fuse.scale.set(0.02, 0.18, 0.02); fuse.position.set(0.1, 1.2, 0); fuse.rotation.z = 0.4; g.add(fuse);
        const lbl = new THREE.Mesh(PG.cbox, w.mats.dark); lbl.scale.set(0.3, 0.25, 0.02); lbl.position.set(0, 0.6, 0.41); g.add(lbl);
      }
      g.position.set(x, y, z); g.rotation.y = rr(rng, 0, 6);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      grp.add(g); d.mesh = g;
    });
    const d = destructible(w, explosive ? 'xbarrel' : 'barrel', null, x, y, z, 0.38, 1.12, 0.38, { hp: explosive ? 20 : 40, surf: 'wood', mat: 'wood', explosive: !!explosive });
    return d;
  };
  P.urn = function (w, x, z, y, rng) {
    const s = rr(rng, 0.8, 1.3);
    w.deferred.push((grp) => {
      const m = new THREE.Mesh(PG.urn, w.mats.ceramic);
      m.scale.set(s, s, s); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      grp.add(m); d.mesh = m;
    });
    const d = destructible(w, 'urn', null, x, y, z, 0.3 * s, 0.85 * s, 0.3 * s, { hp: 8, surf: 'stone', mat: 'ceramic', coins: [2, 7] });
    return d;
  };
  P.barricade = function (w, x, z, y, alongX, rng) {
    const L = 3;
    const hx = alongX ? L / 2 : 0.25, hz = alongX ? 0.25 : L / 2;
    w.deferred.push((grp) => {
      const g = new THREE.Group(), GP = G.GFX && G.GFX.propGeo, plankG = GP ? GP('plank') : null, stakeG = GP ? GP('stake') : null;
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh((plankG && plankG[0].g) || PG.cbox, w.mats.wood); p.scale.set(L * (0.9 + (i * 7 % 3) * 0.05), 0.22 - (i % 2) * 0.03, 0.07); p.position.x = ((i * 5) % 3 - 1) * 0.06;
        p.position.y = 0.2 + i * 0.3; p.rotation.z = (Math.random() - 0.5) * 0.12; g.add(p);
      }
      for (const sx of [-1.2, 1.2]) {
        if (!stakeG) { const p = new THREE.Mesh(PG.cbox, w.mats.woodDark); p.scale.set(0.14, 1.4, 0.14); p.position.set(sx, 0.7, -0.1); g.add(p); continue; }
        const p = new THREE.Mesh(stakeG[0].g, w.mats.woodDark); p.scale.set(0.13, 1.5, 0.13); p.position.set(sx, 0, -0.1); p.rotation.y = sx; g.add(p);
        const q = new THREE.Mesh(stakeG[0].g, w.mats.woodDark); q.scale.set(0.09, 1.25, 0.09); q.position.set(sx * 0.92, 0, -0.75); q.rotation.set(0.62, 0, 0); g.add(q);   // (a prop behind it)
      }
      g.position.set(x, y, z); g.rotation.y = alongX ? 0 : Math.PI / 2;
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      grp.add(g); d.mesh = g;
    });
    const d = destructible(w, 'barricade', null, x, y, z, hx, 1.3, hz, { hp: 70, surf: 'wood', mat: 'wood', coins: [0, 2] });
    return d;
  };
  // treasure chest: interactable
  // shared chest materials (gems, velvet, steel)
  const CHM = {};
  P.initChestMats = function () {
    CHM.velvet = new THREE.MeshStandardMaterial({ color: 0x7a0a18, roughness: 0.85 });
    CHM.steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 });
    CHM.ruby = new THREE.MeshStandardMaterial({ color: 0xff2040, emissive: 0x800010, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.2 });
    CHM.sapph = new THREE.MeshStandardMaterial({ color: 0x3060ff, emissive: 0x0a2080, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.2 });
    CHM.emer = new THREE.MeshStandardMaterial({ color: 0x20d060, emissive: 0x086020, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.2 });
    CHM.obsidian = new THREE.MeshStandardMaterial({ color: 0x241634, metalness: 0.55, roughness: 0.22, emissive: 0x180828, emissiveIntensity: 0.65 });
    CHM.bossGold = new THREE.MeshStandardMaterial({ color: 0xffdf70, metalness: 0.48, roughness: 0.14, emissive: 0x6a4408, emissiveIntensity: 0.55 });
    CHM.royalVelvet = new THREE.MeshStandardMaterial({ color: 0x5a0838, roughness: 0.7, emissive: 0x240014, emissiveIntensity: 0.4 });
    CHM.amethyst = new THREE.MeshStandardMaterial({ color: 0xe058ff, emissive: 0x9018c8, emissiveIntensity: 0.95, roughness: 0.08, metalness: 0.2 });
    // (what the chests of this world are fitted with: old brass gone dull, black iron, sealing wax)
    CHM.oldBrass = new THREE.MeshStandardMaterial({ color: 0x8c7036, metalness: 0.8, roughness: 0.5 });
    CHM.blackIron = new THREE.MeshStandardMaterial({ color: 0x33363b, metalness: 0.7, roughness: 0.55 });
    CHM.wax = new THREE.MeshStandardMaterial({ color: 0x6e1414, roughness: 0.45 });
  };
  P.chest = function (w, x, z, y, ry, tier) {
    if (!CHM.ruby) P.initChestMats();
    const it = { type: 'chest', pos: new THREE.Vector3(x, y + 0.5, z), r: 2.6, tier: tier || 0, opened: false, label: '宝箱を開ける', icon: tier >= 3 ? '🏆' : tier >= 2 ? '👑' : tier ? '💎' : '📦' };
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const add = (parent, geo, m, sx, sy, sz, px, py, pz, rx, ry2, rz) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(px || 0, py || 0, pz || 0); o.rotation.set(rx || 0, ry2 || 0, rz || 0); parent.add(o); return o; };
      const T = tier || 0;
      // Chests of this world: oak and iron. A better one is of darker wood, bound closer and fitted with steel; the best in old brass, a
      // cross let into its lid; a guardian's is an iron coffer on feet, in chains, under a seal. No crowns, no jewels, nothing that shines
      // of itself - what tells them apart from afar is their size, their metal, and a faint glow of the brass (the two best).
      const iron = w.mats.iron, brass = CHM.oldBrass, dark = w.mats.dark;
      const bodyM = T >= 3 ? CHM.blackIron : T >= 1 ? w.mats.woodDark : w.mats.wood;
      const bandM = T >= 2 ? brass : T === 1 ? CHM.steel : iron;
      const sc = T >= 3 ? 1.38 : T >= 2 ? 1.22 : T === 1 ? 1.08 : 1;
      const inner = new THREE.Group(); inner.scale.setScalar(sc); g.add(inner);
      add(inner, PG.cbox, bodyM, 1.1, 0.55, 0.7, 0, 0.275, 0);
      add(inner, PG.cbox, bodyM, 1.16, 0.07, 0.76, 0, 0.035, 0);                       // (a plinth round its foot)
      const lidG = new THREE.Group(); lidG.position.set(0, 0.55, -0.35); inner.add(lidG);
      add(lidG, PG.cyl, bodyM, 0.35, 1.1, 0.35, 0, 0, 0.35, 0, 0, Math.PI / 2);
      add(lidG, PG.cbox, bodyM, 1.12, 0.035, 0.72, 0, 0.005, 0.35);                    // (the lid's rim)
      // straps over lid and body, a stud or two on each
      for (const bx of T >= 1 ? [-0.4, 0, 0.4] : [-0.36, 0.36]) {
        if (bx === 0 && T < 3) { add(lidG, PG.cyl, bandM, 0.358, 0.07, 0.358, 0, 0, 0.35, 0, 0, Math.PI / 2); continue; } // (the middle one stops at the lock)
        add(inner, PG.cbox, bandM, 0.075, 0.57, 0.72, bx, 0.28, 0); add(lidG, PG.cyl, bandM, 0.358, 0.075, 0.358, bx, 0, 0.35, 0, 0, Math.PI / 2);
        for (const sy of [0.14, 0.42]) add(inner, PG.sph, bandM, 0.022, 0.022, 0.016, bx, sy, 0.362);
      }
      if (T >= 1) {
        // corner irons, a ring to carry it by at each end
        for (const cx of [-0.53, 0.53]) for (const cz of [-0.33, 0.33]) add(inner, PG.cbox, bandM, 0.09, 0.57, 0.09, cx, 0.28, cz);
        for (const sx of [-1, 1]) { add(inner, PG.torus, iron, 0.075, 0.075, 0.075, sx * 0.575, 0.27, 0, 0, Math.PI / 2, 0); add(inner, PG.cbox, iron, 0.03, 0.05, 0.09, sx * 0.56, 0.34, 0); }
      }
      if (T >= 2) {
        // rails of the same metal along the rim and the foot; a cross let into the lid
        add(inner, PG.cbox, bandM, 1.13, 0.04, 0.73, 0, 0.52, 0); add(inner, PG.cbox, bandM, 1.18, 0.035, 0.78, 0, 0.075, 0);
        add(lidG, PG.cbox, bandM, 0.42, 0.014, 0.05, 0, 0.35, 0.35); add(lidG, PG.cbox, bandM, 0.05, 0.014, 0.26, 0, 0.35, 0.35);
      }
      // the lock: a plate, its keyhole, the hasp coming down from the lid
      add(inner, PG.cbox, bandM, 0.17, 0.2, 0.035, 0, 0.44, 0.362);
      add(inner, PG.cyl8, dark, 0.016, 0.012, 0.016, 0, 0.455, 0.381, Math.PI / 2, 0, 0); add(inner, PG.cbox, dark, 0.012, 0.04, 0.012, 0, 0.428, 0.381);
      add(lidG, PG.cbox, bandM, 0.07, 0.15, 0.03, 0, -0.03, 0.722);
      if (T >= 3) {
        // the guardians': on four feet, two chains across it to a great padlock, sealed with wax
        for (const cx of [-0.47, 0.47]) for (const cz of [-0.28, 0.28]) add(inner, PG.cbox, CHM.blackIron, 0.14, 0.09, 0.14, cx, -0.045, cz);
        for (const s2 of [-1, 1]) for (let i = 0; i < 7; i++) { const t = i / 6, lx = s2 * (0.52 - t * 0.44), ly = 0.5 - t * 0.14; add(inner, PG.torus, iron, 0.034, 0.034, 0.034, lx, ly, 0.385, i % 2 ? Math.PI / 2 : 0, 0, s2 * 0.3); }
        add(inner, PG.cbox, CHM.steel, 0.2, 0.2, 0.07, 0, 0.3, 0.41); add(inner, PG.torus, CHM.steel, 0.07, 0.07, 0.07, 0, 0.41, 0.41);
        add(inner, PG.cyl8, CHM.wax, 0.05, 0.02, 0.05, 0.06, 0.26, 0.45, Math.PI / 2, 0, 0);
      }
      if (T >= 2) {
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: T >= 3 ? 0xff9a58 : 0xffc878, transparent: true, opacity: T >= 3 ? 0.2 : 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.set(T >= 3 ? 2.6 : 2.0, T >= 3 ? 1.8 : 1.4, 1); halo.position.y = T >= 3 ? 0.6 : 0.5; g.add(halo); it.halo = halo;
      }
      g.position.set(x, y, z); g.rotation.y = ry;
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      grp.add(g); it.mesh = g; it.lid = lidG;
      // subtle glint light
      w.lightSources.push({ pos: new THREE.Vector3(x, y + 0.9, z), color: tier >= 3 ? '#ff9a58' : tier >= 2 ? '#ffd070' : '#ffc890', intensity: tier >= 3 ? 8 : tier >= 2 ? 5 : 3, range: tier >= 3 ? 8 : tier >= 2 ? 6 : 5, flame: 0, emit: false, ph: 0, prio: tier >= 3 ? 1.4 : 0.8, steady: true, chest: it });
    });
    const cs = tier >= 3 ? 1.38 : tier >= 2 ? 1.22 : tier === 1 ? 1.08 : 1;
    w.addCollider(x - 0.55 * cs, y, z - 0.55 * cs, x + 0.55 * cs, y + 0.75 * cs, z + 0.55 * cs, { surf: tier >= 2 ? 'metal' : 'wood' });
    w.interactables.push(it);
    return it;
  };

  // spike trap hazard
  P.spikeTrap = function (w, x, z, y, s) {
    s = s || 2;
    if (!(s === 2 && put(w, 'spikeplate', x, y, z, 0))) w.batch.box('iron', x - s / 2, y, z - s / 2, x + s / 2, y + 0.03, z + s / 2, { uv: 0.5, tint: [0.5, 0.45, 0.4] });
    const hz = { kind: 'spikes', x, z, y, s, t: Math.random() * 3, period: 3.2, up: 0, mesh: null };
    w.deferred.push((grp) => {
      const sp = G.GFX && G.GFX.propGeo ? G.GFX.propGeo('spike') : null, geo = sp ? sp[0].g : new THREE.ConeGeometry(0.05, 0.6, 5);
      const n = Math.floor(s / 0.33);
      const im = new THREE.InstancedMesh(geo, w.mats.iron, n * n);
      let k = 0; const mm = new THREE.Matrix4();
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { mm.makeTranslation(x - s / 2 + (i + 0.5) * s / n, y + 0.3, z - s / 2 + (j + 0.5) * s / n); im.setMatrixAt(k++, mm); }
      im.castShadow = true;
      const g = new THREE.Group(); g.add(im); grp.add(g);
      hz.mesh = g; g.position.y = -0.62;
    });
    w.hazards.push(hz);
  };
})();
