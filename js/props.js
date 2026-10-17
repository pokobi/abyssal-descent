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
    PG.cyl = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
    PG.cyl8 = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
    PG.cone = new THREE.ConeGeometry(1, 1, 8);
    PG.sph = new THREE.SphereGeometry(1, 12, 8);
    PG.dode = new THREE.DodecahedronGeometry(1, 0);
    PG.ico = new THREE.IcosahedronGeometry(1, 0);
    PG.oct3 = new THREE.OctahedronGeometry(1, 0);
    PG.torus = new THREE.TorusGeometry(1, 0.12, 6, 16);
    PG.box = new THREE.BoxGeometry(1, 1, 1);
    PG.plane = new THREE.PlaneGeometry(1, 1);
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; const r = 0.18 + Math.sin(t * Math.PI) * 0.22 + (t > 0.85 ? (t - 0.85) * 0.6 : 0) - (t > 0.75 && t < 0.85 ? 0.05 : 0); pts.push(new THREE.Vector2(Math.max(0.05, r), t * 0.9)); }
    PG.urn = new THREE.LatheGeometry(pts, 14);
    const bp = []; for (let i = 0; i <= 10; i++) { const t = i / 10; bp.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.06, t)); }
    PG.barrel = new THREE.LatheGeometry(bp, 16);
    const bowl = []; for (let i = 0; i <= 8; i++) { const t = i / 8; bowl.push(new THREE.Vector2(0.1 + Math.sin(t * Math.PI / 2) * 0.5, t * 0.35)); }
    PG.bowl = new THREE.LatheGeometry(bowl, 14);
    for (const k in PG) PG[k].userData.shared = true;
  };
  P.PG = PG;
  const rr = (rng, a, b) => rng ? rng.range(a, b) : a + Math.random() * (b - a);

  // ---------- light fixtures ----------
  // wall torch. dir: outward normal from wall ('px','nx','pz','nz')
  P.torch = function (w, x, y, z, dir) {
    const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir];
    const ry = Math.atan2(d[0], d[1]);
    w.batch.geo('iron', PG.box, M(x, y, z, 0.16, 0.3, 0.06, 0, ry, 0)); // wall plate
    w.batch.geo('iron', PG.box, M(x + d[0] * 0.15, y - 0.05, z + d[1] * 0.15, 0.05, 0.05, 0.3, 0, ry, 0)); // arm
    w.batch.geo('iron', PG.torus, M(x + d[0] * 0.3, y + 0.05, z + d[1] * 0.3, 0.09, 0.09, 0.09, Math.PI / 2, 0, 0));
    w.batch.geo('woodDark', PG.cyl8, M(x + d[0] * 0.3, y + 0.15, z + d[1] * 0.3, 0.045, 0.5, 0.045, d[1] * 0.25, 0, -d[0] * 0.25));
    w.batch.geo('dark', PG.cyl8, M(x + d[0] * 0.36, y + 0.42, z + d[1] * 0.36, 0.07, 0.12, 0.07), { tint: [0.15, 0.1, 0.08] });
    w.addLight(x + d[0] * 0.38, y + 0.5, z + d[1] * 0.38, { flame: 1 });
  };
  P.brazier = function (w, x, y, z, s, collide) {
    s = s || 1;
    w.batch.geo('trim', PG.oct, M(x, y + 0.35 * s, z, 0.32 * s, 0.7 * s, 0.32 * s), { gradBase: y });
    w.batch.geo('trim', PG.oct, M(x, y + 0.06 * s, z, 0.42 * s, 0.12 * s, 0.42 * s));
    w.batch.geo('iron', PG.bowl, M(x, y + 0.7 * s, z, s, s, s));
    w.batch.geo('dark', PG.dode, M(x, y + 0.9 * s, z, 0.35 * s, 0.12 * s, 0.35 * s), { tint: [0.3, 0.12, 0.05] });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; w.batch.geo('iron', PG.box, M(x + Math.cos(a) * 0.5 * s, y + 0.95 * s, z + Math.sin(a) * 0.5 * s, 0.06 * s, 0.25 * s, 0.06 * s)); }
    if (collide !== false) w.addCollider(x - 0.42 * s, y, z - 0.42 * s, x + 0.42 * s, y + 1.05 * s, z + 0.42 * s, { surf: 'metal' });
    w.addLight(x, y + 1.0 * s, z, { flame: 2.2 * s, intensity: 16 * s, range: 16 * s, prio: 1.4 });
  };
  P.candles = function (w, x, y, z, rng, light) {
    const n = 3 + Math.floor(rr(rng, 0, 4));
    for (let i = 0; i < n; i++) {
      const ox = rr(rng, -0.25, 0.25), oz = rr(rng, -0.25, 0.25), h = rr(rng, 0.12, 0.35);
      w.batch.geo('candle', PG.cyl8, M(x + ox, y + h / 2, z + oz, 0.035, h, 0.035));
      if (i === 0 && light !== false) w.addLight(x + ox, y + h + 0.05, z + oz, { flame: 0.35, intensity: 2.5, range: 5, prio: 0.5 });
      else w.lightSources.push({ pos: new THREE.Vector3(x + ox, y + h + 0.05, z + oz), color: '#ffb060', intensity: 0, range: 0, flame: 0.3, emit: true, noLight: true, ph: Math.random() * 99, prio: 0.0001 });
    }
  };
  P.chandelier = function (w, x, y, z, top) {
    w.batch.geo('iron', PG.torus, M(x, y, z, 1.1, 1.1, 1.1, Math.PI / 2, 0, 0));
    w.batch.geo('iron', PG.torus, M(x, y + 0.02, z, 0.6, 0.6, 0.6, Math.PI / 2, 0, 0));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; w.batch.geo('iron', PG.box, M(x + Math.cos(a) * 0.55, y + 0.6, z + Math.sin(a) * 0.55, 0.03, 1.3, 0.03, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7)); }
    // chain to ceiling
    const len = top - y - 1.2;
    if (len > 0) P.chain(w, x, y + 1.2, z, len);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      w.batch.geo('candle', PG.cyl8, M(x + Math.cos(a) * 1.1, y + 0.15, z + Math.sin(a) * 1.1, 0.04, 0.25, 0.04));
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
    w.batch.geo('trim', PG.oct, M(x, y0 + 0.47, z, b - 0.04, 0.14, b - 0.04));
    const sh = top - (broken ? 0 : 0.5) - (y0 + 0.54);
    // octagonal shaft whose apothem == collider half-size (no invisible margin on the flats)
    const R = r / Math.cos(Math.PI / 8);
    w.batch.geo('trim', PG.oct, M(x, y0 + 0.54 + sh / 2, z, R, sh, R), { su: 2, sv: sh / 2, gradBase: y0 });
    w.addCollider(x - r, y0 + 0.4, z - r, x + r, top, z + r);
    if (!broken) {
      w.batch.geo('trim', PG.oct, M(x, top - 0.43, z, b - 0.06, 0.14, b - 0.06));
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
    for (let i = 0; i < 4; i++) w.batch.geo('bone', PG.cyl8, M(x + rr(rng, -0.6, 0.6), y + 0.03, z + rr(rng, -0.6, 0.6), 0.025, rr(rng, 0.25, 0.45), 0.025, Math.PI / 2, rr(rng, 0, 3), 0));
    P.skull(w, x + rr(rng, -0.3, 0.3), y, z + rr(rng, -0.3, 0.3), rr(rng, 0, 6));
  };
  P.skull = function (w, x, y, z, ry, s) {
    s = s || 1;
    w.batch.geo('bone', PG.sph, M(x, y + 0.1 * s, z, 0.1 * s, 0.09 * s, 0.12 * s, 0, ry, 0));
    w.batch.geo('bone', PG.box, M(x + Math.sin(ry) * 0.06 * s, y + 0.04 * s, z + Math.cos(ry) * 0.06 * s, 0.1 * s, 0.05 * s, 0.07 * s, 0, ry, 0));
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
    if (rng && rng.chance(0.5)) P.candles(w, x + (rotX ? -0.8 : 0.3), y + 1.04, z + (rotX ? 0.25 : -0.8), rng, false);
  };
  P.statue = function (w, x, z, y, ry, rng, s) {
    s = s || 1;
    // pedestal
    w.solid('trim', x - 1.1 * s, y, z - 1.1 * s, x + 1.1 * s, y + 0.5 * s, z + 1.1 * s);
    w.solid('block', x - 0.85 * s, y + 0.5 * s, z - 0.85 * s, x + 0.85 * s, y + 1.6 * s, z + 0.85 * s, { uv: 1.5 });
    w.solid('trim', x - 0.95 * s, y + 1.6 * s, z - 0.95 * s, x + 0.95 * s, y + 1.8 * s, z + 0.95 * s);
    const b = y + 1.8 * s;
    const mk = 'trim';
    const add = (geo, lx, ly, lz, sx, sy, sz, rx, rz, ory) => {
      const c = Math.cos(ry), sn = Math.sin(ry);
      w.batch.geo(mk, geo, M(x + (lx * c + lz * sn) * s, b + ly * s, z + (-lx * sn + lz * c) * s, sx * s, sy * s, sz * s, rx || 0, ry + (ory || 0), rz || 0), { tint: [0.95, 0.95, 0.92] });
    };
    // armored knight leaning on a greatsword
    add(PG.box, -0.18, 0.45, 0, 0.22, 0.9, 0.26); add(PG.box, 0.18, 0.45, 0, 0.22, 0.9, 0.26); // legs
    add(PG.box, 0, 1.25, 0, 0.62, 0.75, 0.36); // torso
    add(PG.box, 0, 0.92, 0.0, 0.7, 0.22, 0.42); // belt/skirt
    add(PG.sph, -0.38, 1.55, 0, 0.17, 0.15, 0.2); add(PG.sph, 0.38, 1.55, 0, 0.17, 0.15, 0.2); // pauldrons
    add(PG.box, 0, 1.82, 0, 0.26, 0.3, 0.28); // helm
    add(PG.box, 0, 1.98, 0, 0.06, 0.12, 0.28); // crest
    add(PG.box, -0.36, 1.2, 0.12, 0.13, 0.55, 0.13, -0.4); add(PG.box, 0.36, 1.2, 0.12, 0.13, 0.55, 0.13, -0.4); // arms
    add(PG.box, 0, 0.75, 0.32, 0.08, 1.5, 0.03); // blade
    add(PG.box, 0, 1.5, 0.32, 0.45, 0.06, 0.06); // crossguard
    add(PG.box, 0, 1.65, 0.32, 0.05, 0.25, 0.05);
    add(PG.box, 0, 1.2, -0.22, 0.75, 1.1, 0.05, 0.05); // cape
    w.addCollider(x - 0.45 * s, b, z - 0.45 * s, x + 0.45 * s, b + 2.1 * s, z + 0.45 * s);
    if (rng && rng.chance(0.4)) { const bc = rng.chance(0.5); P.candles(w, x + 0.6 * s, y + 0.5 * s, z + 0.95 * s, rng, bc); }
  };
  P.bookshelf = function (w, x, z, y, alongX, rng) {
    const L = 2.0, D = 0.45, H = 2.4;
    const hx = alongX ? L / 2 : D / 2, hz = alongX ? D / 2 : L / 2;
    w.addCollider(x - hx, y, z - hz, x + hx, y + H, z + hz, { surf: 'wood' });
    w.batch.box('woodDark', x - hx, y, z - hz, x + hx, y + 0.08, z + hz, { uv: 1 });
    w.batch.box('woodDark', x - hx, y + H - 0.08, z - hz, x + hx, y + H, z + hz, { uv: 1 });
    if (alongX) { w.batch.box('woodDark', x - hx, y, z - hz, x - hx + 0.06, y + H, z + hz, { uv: 1 }); w.batch.box('woodDark', x + hx - 0.06, y, z - hz, x + hx, y + H, z + hz, { uv: 1 }); }
    else { w.batch.box('woodDark', x - hx, y, z - hz, x + hx, y + H, z - hz + 0.06, { uv: 1 }); w.batch.box('woodDark', x - hx, y, z + hz - 0.06, x + hx, y + H, z + hz, { uv: 1 }); }
    w.batch.box('woodDark', alongX ? x - hx : x - hx, y, alongX ? z - hz : z - hz, alongX ? x + hx : x - hx + 0.04, y + H, alongX ? z - hz + 0.04 : z + hz, { uv: 1 });
    const cols = [[0.45, 0.15, 0.1], [0.15, 0.25, 0.35], [0.2, 0.3, 0.15], [0.5, 0.4, 0.2], [0.3, 0.2, 0.3], [0.6, 0.55, 0.45]];
    for (let sh = 0; sh < 4; sh++) {
      const yy = y + 0.08 + sh * 0.58;
      w.batch.box('woodDark', x - hx, yy, z - hz, x + hx, yy + 0.04, z + hz, { uv: 1 });
      let t = -L / 2 + 0.08;
      while (t < L / 2 - 0.12) {
        const bw = rr(rng, 0.05, 0.11), bh = rr(rng, 0.28, 0.45);
        if (rr(rng, 0, 1) < 0.12) { t += 0.15; continue; }
        const c = cols[Math.floor(rr(rng, 0, cols.length))];
        if (alongX) w.batch.box('cloth2', x + t, yy + 0.04, z - hz + 0.05, x + t + bw, yy + 0.04 + bh, z + hz - 0.05, { uv: 1, tint: c, grad: false });
        else w.batch.box('cloth2', x - hx + 0.05, yy + 0.04, z + t, x + hx - 0.05, yy + 0.04 + bh, z + t + bw, { uv: 1, tint: c, grad: false });
        t += bw + 0.01;
      }
    }
  };
  P.table = function (w, x, z, y, alongX, rng) {
    const L = 2.2, Wd = 1.0;
    const hx = alongX ? L / 2 : Wd / 2, hz = alongX ? Wd / 2 : L / 2;
    w.solid('wood', x - hx, y + 0.78, z - hz, x + hx, y + 0.86, z + hz, { uv: 1.5 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.solid('woodDark', x + sx * (hx - 0.12) - 0.05, y, z + sz * (hz - 0.12) - 0.05, x + sx * (hx - 0.12) + 0.05, y + 0.78, z + sz * (hz - 0.12) + 0.05, { uv: 1 });
    if (rng && rng.chance(0.6)) P.candles(w, x + rr(rng, -0.5, 0.5), y + 0.86, z + rr(rng, -0.2, 0.2), rng, rng.chance(0.5));
    if (rng && rng.chance(0.5)) w.batch.geo('ceramic', PG.urn, M(x + rr(rng, -0.6, 0.6), y + 0.86, z, 0.35, 0.35, 0.35));
    // benches
    if (rng && rng.chance(0.7)) {
      const o = (alongX ? hz : hx) + 0.45;
      for (const sd of [-1, 1]) {
        if (alongX) w.solid('woodDark', x - hx + 0.1, y + 0.4, z + sd * o - 0.18, x + hx - 0.1, y + 0.48, z + sd * o + 0.18, { uv: 1 });
        else w.solid('woodDark', x + sd * o - 0.18, y + 0.4, z - hz + 0.1, x + sd * o + 0.18, y + 0.48, z + hz - 0.1, { uv: 1 });
      }
    }
  };
  P.cage = function (w, x, z, y, s, rng) {
    s = s || 1.4;
    const h = 2.2;
    w.solid('iron', x - s / 2, y, z - s / 2, x + s / 2, y + 0.1, z + s / 2, { uv: 1 });
    w.batch.box('iron', x - s / 2, y + h - 0.08, z - s / 2, x + s / 2, y + h, z + s / 2, { uv: 1 });
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = -s / 2 + (i / n) * s;
      for (const [bx, bz] of [[t, -s / 2], [t, s / 2], [-s / 2, t], [s / 2, t]]) w.batch.box('iron', x + bx - 0.02, y + 0.1, z + bz - 0.02, x + bx + 0.02, y + h - 0.08, z + bz + 0.02, { uv: 1 });
    }
    w.addCollider(x - s / 2, y + 0.1, z - s / 2, x + s / 2, y + h, z + s / 2, { surf: 'metal' });
    if (rng && rng.chance(0.6)) { P.bones(w, x, y + 0.1, z, rng); }
  };
  P.well = function (w, x, z, y) {
    const r = 1.3;
    w.batch.geo('block', PG.oct, M(x, y + 0.45, z, r / Math.cos(Math.PI / 8), 0.9, r / Math.cos(Math.PI / 8)), { su: 4, sv: 0.6 });
    w.batch.geo('dark', PG.oct, M(x, y + 0.91, z, r * 0.85, 0.02, r * 0.85));
    w.addCollider(x - r, y, z - r, x + r, y + 0.9, z + r);
    for (const sx of [-1, 1]) w.solid('woodDark', x + sx * (r - 0.15) - 0.1, y + 0.9, z - 0.1, x + sx * (r - 0.15) + 0.1, y + 3.0, z + 0.1, { uv: 1 });
    w.batch.box('woodDark', x - r - 0.1, y + 2.9, z - 0.08, x + r + 0.1, y + 3.05, z + 0.08, { uv: 1 });
    w.batch.geo('wood', PG.box, M(x, y + 3.15, z, 2 * r + 0.6, 0.06, 1.0, 0.45, 0, 0));
    w.batch.geo('wood', PG.box, M(x, y + 3.15, z, 2 * r + 0.6, 0.06, 1.0, -0.45, 0, 0));
    P.chain(w, x, y + 1.5, z, 1.4);
    w.batch.geo('woodDark', PG.cyl8, M(x, y + 1.35, z, 0.2, 0.3, 0.2));
  };
  P.banner = function (w, x, y, z, dir, len, color) {
    // y = top of banner; dir = outward normal from wall
    const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir];
    const ry = Math.atan2(d[0], d[1]);
    w.batch.geo('iron', PG.cyl8, M(x + d[0] * 0.12, y + 0.05, z + d[1] * 0.12, 0.03, 1.3, 0.03, 0, ry, Math.PI / 2));
    w.deferred.push((grp) => {
      const geo = new THREE.PlaneGeometry(1.1, len, 1, 6); geo.translate(0, -len / 2, 0);
      const mat = color ? w.mats.cloth.clone() : w.mats.cloth;
      if (color) mat.color.set(color);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + d[0] * 0.16, y, z + d[1] * 0.16); m.rotation.y = ry;
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
      w.batch.geo('ice', PG.oct3, M(x + rr(rng, -0.5, 0.5) * s, y + h * 0.4, z + rr(rng, -0.5, 0.5) * s, 0.2 * s, h, 0.2 * s, rr(rng, -0.4, 0.4), rr(rng, 0, 3), rr(rng, -0.4, 0.4)));
    }
    w.addCollider(x - 0.45 * s, y, z - 0.45 * s, x + 0.45 * s, y + 1.0 * s, z + 0.45 * s);
  };
  P.weaponRack = function (w, x, z, y, alongX) {
    const hx = alongX ? 1.0 : 0.2, hz = alongX ? 0.2 : 1.0;
    w.solid('woodDark', x - hx, y, z - hz, x + hx, y + 0.12, z + hz, { uv: 1 });
    w.batch.box('woodDark', x - (alongX ? hx : 0.05), y + 1.5, z - (alongX ? 0.05 : hz), x + (alongX ? hx : 0.05), y + 1.6, z + (alongX ? 0.05 : hz), { uv: 1 });
    for (let i = -2; i <= 2; i++) {
      const ox = alongX ? i * 0.35 : 0, oz = alongX ? 0 : i * 0.35;
      w.batch.geo('iron', PG.box, M(x + ox, y + 0.9, z + oz, 0.05, 1.7, 0.02, alongX ? 0 : 0, alongX ? 0 : Math.PI / 2, (i % 2) * 0.08));
      w.batch.geo('woodDark', PG.box, M(x + ox, y + 0.25, z + oz, 0.04, 0.3, 0.04));
    }
    w.addCollider(x - hx, y + 0.12, z - hz, x + hx, y + 1.7, z + hz, { surf: 'wood' });
  };
  P.gravestone = function (w, x, z, y, ry, rng) {
    const t = rng ? rng.int(0, 2) : 0;
    if (t === 0) w.batch.geo('block', PG.box, M(x, y + 0.5, z, 0.7, 1.0, 0.18, rr(rng, -0.1, 0.1), ry, rr(rng, -0.1, 0.1)), { su: 0.5, sv: 0.5 });
    else if (t === 1) { w.batch.geo('block', PG.box, M(x, y + 0.6, z, 0.16, 1.2, 0.16, 0, ry, 0)); w.batch.geo('block', PG.box, M(x, y + 0.85, z, 0.7, 0.16, 0.16, 0, ry, 0)); }
    else { w.batch.geo('trim', PG.box, M(x, y + 0.35, z, 0.6, 0.7, 0.25, 0, ry, 0)); w.batch.geo('trim', PG.cyl, M(x, y + 0.7, z, 0.3, 0.25, 0.3, Math.PI / 2, ry, 0)); }
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
    g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col; g.fillText(text, cw / 2, ch / 2 + 4);
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
    w.batch.box('cloth2', x - sx / 2, y, z - sz / 2, x + sx / 2, y + 0.02, z + sz / 2, { uv: 2, tint: color || [0.45, 0.12, 0.1], grad: false });
  };
  P.drain = function (w, x, z, y) {
    w.batch.box('iron', x - 0.5, y, z - 0.5, x + 0.5, y + 0.015, z + 0.5, { uv: 0.5, tint: [0.4, 0.4, 0.4] });
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
      const body = new THREE.Mesh(PG.box, w.mats.wood); body.scale.set(s, s, s); body.position.y = s / 2;
      g.add(body);
      for (const sy of [0.04, s - 0.04]) for (const ax of [0, 1]) {
        const b = new THREE.Mesh(PG.box, w.mats.woodDark);
        b.scale.set(ax ? s + 0.03 : 0.1, 0.08, ax ? 0.1 : s + 0.03);
        b.position.set(0, sy, 0); if (ax) b.position.z = 0; g.add(b);
      }
      const brace = new THREE.Mesh(PG.box, w.mats.woodDark); brace.scale.set(s * 1.3, 0.09, 0.04); brace.rotation.z = Math.PI / 4; brace.position.set(0, s / 2, s / 2 + 0.01); g.add(brace);
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
        const hp = new THREE.Mesh(PG.torus, w.mats.iron); hp.rotation.x = Math.PI / 2; hp.position.y = hy; hp.scale.set(0.4, 0.4, 0.25); g.add(hp);
      }
      const lid = new THREE.Mesh(PG.cyl, w.mats.woodDark); lid.scale.set(0.37, 0.03, 0.37); lid.position.y = 1.1; g.add(lid);
      if (explosive) {
        const fuse = new THREE.Mesh(PG.cyl8, w.mats.dark); fuse.scale.set(0.02, 0.18, 0.02); fuse.position.set(0.1, 1.2, 0); fuse.rotation.z = 0.4; g.add(fuse);
        const lbl = new THREE.Mesh(PG.box, w.mats.dark); lbl.scale.set(0.3, 0.25, 0.02); lbl.position.set(0, 0.6, 0.41); g.add(lbl);
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
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(PG.box, w.mats.wood); p.scale.set(L, 0.22, 0.08);
        p.position.set(0, 0.2 + i * 0.3, 0); p.rotation.z = (Math.random() - 0.5) * 0.12; g.add(p);
      }
      for (const sx of [-1.2, 1.2]) { const p = new THREE.Mesh(PG.box, w.mats.woodDark); p.scale.set(0.14, 1.4, 0.14); p.position.set(sx, 0.7, -0.1); g.add(p); }
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
  };
  P.chest = function (w, x, z, y, ry, tier) {
    if (!CHM.ruby) P.initChestMats();
    const it = { type: 'chest', pos: new THREE.Vector3(x, y + 0.5, z), r: 2.6, tier: tier || 0, opened: false, label: '宝箱を開ける', icon: tier >= 2 ? '👑' : tier ? '💎' : '📦' };
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const add = (parent, geo, m, sx, sy, sz, px, py, pz, rx, ry2, rz) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(px || 0, py || 0, pz || 0); o.rotation.set(rx || 0, ry2 || 0, rz || 0); parent.add(o); return o; };
      const T = tier || 0;
      // tier 0: weathered wood · tier 1: stained wood, steel caps, studs & a sapphire lock · tier 2: ornate gilded royal chest
      const bodyM = T >= 2 ? w.mats.gold : T === 1 ? w.mats.woodDark : w.mats.wood;
      const bandM = T >= 2 ? CHM.velvet : T === 1 ? w.mats.iron : w.mats.iron;
      const sc = T >= 2 ? 1.22 : T === 1 ? 1.08 : 1;
      const inner = new THREE.Group(); inner.scale.setScalar(sc); g.add(inner);
      add(inner, PG.box, bodyM, 1.1, 0.55, 0.7, 0, 0.275, 0);
      const lidG = new THREE.Group(); lidG.position.set(0, 0.55, -0.35); inner.add(lidG);
      const lid = add(lidG, PG.cyl, bodyM, 0.35, 1.1, 0.35, 0, 0, 0.35, 0, 0, Math.PI / 2);
      add(lidG, PG.box, bodyM, 1.1, 0.02, 0.7, 0, 0, 0.35);
      for (const bx of [-0.4, 0.4]) { add(inner, PG.box, bandM, 0.08, 0.57, 0.72, bx, 0.28, 0); add(lidG, PG.cyl, bandM, 0.36, 0.08, 0.36, bx, 0, 0.35, 0, 0, Math.PI / 2); }
      if (T >= 1) {
        // corner caps & studs
        const capM = T >= 2 ? w.mats.gold : CHM.steel;
        for (const cx of [-0.53, 0.53]) for (const cz of [-0.33, 0.33]) add(inner, PG.box, capM, 0.09, 0.57, 0.09, cx, 0.28, cz);
        for (let i = 0; i < 5; i++) add(inner, PG.sph, capM, 0.025, 0.025, 0.025, -0.3 + i * 0.15, 0.08, 0.36);
      }
      if (T >= 2) {
        // gilded trims, velvet stripe, crown & jewels
        add(inner, PG.box, CHM.velvet, 1.12, 0.08, 0.72, 0, 0.5, 0);
        add(inner, PG.box, w.mats.gold, 1.2, 0.06, 0.78, 0, 0.03, 0);
        const crown = new THREE.Group(); crown.position.set(0, 0.36, 0.35); lidG.add(crown);
        add(crown, PG.cyl8, w.mats.gold, 0.16, 0.08, 0.16);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(crown, PG.cone, w.mats.gold, 0.035, 0.14, 0.035, Math.cos(a) * 0.13, 0.1, Math.sin(a) * 0.13); }
        const jewels = [CHM.ruby, CHM.sapph, CHM.emer, CHM.ruby];
        jewels.forEach((m, i) => add(inner, PG.oct, m, 0.05, 0.065, 0.03, -0.36 + i * 0.24, 0.3, 0.37));
        add(lidG, PG.oct, CHM.ruby, 0.07, 0.09, 0.04, 0, 0.2, 0.72);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xffc860, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.scale.set(2.4, 1.6, 1); halo.position.y = 0.55; g.add(halo); it.halo = halo;
      }
      const lockM = T >= 2 ? w.mats.gold : T === 1 ? CHM.steel : w.mats.brass;
      add(inner, PG.box, lockM, 0.14, 0.18, 0.06, 0, 0.5, 0.37);
      if (T === 1) add(inner, PG.oct, CHM.sapph, 0.04, 0.05, 0.03, 0, 0.5, 0.41);
      g.position.set(x, y, z); g.rotation.y = ry;
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      grp.add(g); it.mesh = g; it.lid = lidG;
      // subtle glint light
      w.lightSources.push({ pos: new THREE.Vector3(x, y + 0.9, z), color: tier >= 2 ? '#ffd070' : tier === 1 ? '#a0c0ff' : '#ffc890', intensity: tier >= 2 ? 5 : 3, range: tier >= 2 ? 6 : 5, flame: 0, emit: false, ph: 0, prio: 0.8, steady: true, chest: it });
    });
    const cs = tier >= 2 ? 1.22 : tier === 1 ? 1.08 : 1;
    w.addCollider(x - 0.55 * cs, y, z - 0.55 * cs, x + 0.55 * cs, y + 0.75 * cs, z + 0.55 * cs, { surf: tier >= 2 ? 'metal' : 'wood' });
    w.interactables.push(it);
    return it;
  };

  // spike trap hazard
  P.spikeTrap = function (w, x, z, y, s) {
    s = s || 2;
    w.batch.box('iron', x - s / 2, y, z - s / 2, x + s / 2, y + 0.03, z + s / 2, { uv: 0.5, tint: [0.5, 0.45, 0.4] });
    const hz = { kind: 'spikes', x, z, y, s, t: Math.random() * 3, period: 3.2, up: 0, mesh: null };
    w.deferred.push((grp) => {
      const geo = new THREE.ConeGeometry(0.05, 0.6, 5);
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
