'use strict';
// World container: merged static geometry, AABB colliders + spatial hash, raycasts, kinematic box movement, nav grid & flow field.
(function () {
  const CS = 4; // hash cell size (m)
  // the 8 nav directions; for a diagonal, the indices of its two straight parts (corner-cutting check)
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const dirIdx = (dx, dz) => DIRS.findIndex((d) => d[0] === dx && d[1] === dz);
  const DIAG = DIRS.map((d) => (d[0] && d[1] ? 1 : 0));
  const DXI = DIRS.map((d) => (d[0] && d[1] ? dirIdx(d[0], 0) : -1)), DZI = DIRS.map((d) => (d[0] && d[1] ? dirIdx(0, d[1]) : -1));

  // ---------------- geometry batching ----------------
  class Batch {
    constructor() { this.g = {}; }
    _grp(k) { return this.g[k] || (this.g[k] = { p: [], n: [], u: [], c: [], i: [] }); }
    // world-space UV box. o: {uv: meters per repeat, tint: [r,g,b], grad: bool, skip: {top,bottom,...}}
    box(mk, x0, y0, z0, x1, y1, z1, o) {
      o = o || {};
      const G0 = this._grp(mk);
      const s = 1 / (o.uv || 2);
      const tint = o.tint || [1, 1, 1];
      const grad = o.grad !== false;
      const yb = o.gradBase ?? Math.min(0, y0);
      const ou = o.uo || 0, ov = o.vo || 0;
      const F = (pts, nx, ny, nz, uvf) => {
        const base = G0.p.length / 3;
        for (const p of pts) {
          G0.p.push(p[0], p[1], p[2]); G0.n.push(nx, ny, nz);
          const uv = uvf(p); G0.u.push(uv[0] * s + ou, uv[1] * s + ov);
          let f = 1;
          if (grad) f = 0.62 + 0.38 * Math.min(1, Math.max(0, (p[1] - yb) / 2.6));
          G0.c.push(tint[0] * f, tint[1] * f, tint[2] * f);
        }
        G0.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      const sk = o.skip || {};
      if (!sk.px) F([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 1, 0, 0, (p) => [-p[2], p[1]]);
      if (!sk.nx) F([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], -1, 0, 0, (p) => [p[2], p[1]]);
      if (!sk.pz) F([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 0, 0, 1, (p) => [p[0], p[1]]);
      if (!sk.nz) F([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0, 0, -1, (p) => [-p[0], p[1]]);
      if (!sk.top) F([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 0, 1, 0, (p) => [p[0], -p[2]]);
      if (!sk.bottom) F([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 0, -1, 0, (p) => [p[0], p[2]]);
    }
    // arbitrary geometry with transform matrix
    geo(mk, geo, mat, o) {
      o = o || {};
      const G0 = this._grp(mk);
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
      const base = G0.p.length / 3;
      const v = new THREE.Vector3(), n = new THREE.Vector3();
      const nm = new THREE.Matrix3().getNormalMatrix(mat);
      const tint = o.tint || [1, 1, 1];
      const su = o.su || 1, sv = o.sv || 1;
      const yb = o.gradBase ?? -999;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mat);
        n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
        G0.p.push(v.x, v.y, v.z); G0.n.push(n.x, n.y, n.z);
        if (uv) G0.u.push(uv.getX(i) * su, uv.getY(i) * sv); else G0.u.push(v.x * 0.5, v.y * 0.5);
        let f = 1;
        if (yb > -999) f = 0.62 + 0.38 * Math.min(1, Math.max(0, (v.y - yb) / 2.6));
        G0.c.push(tint[0] * f, tint[1] * f, tint[2] * f);
      }
      if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) G0.i.push(base + ix[i]); }
      else for (let i = 0; i < pos.count; i++) G0.i.push(base + i);
    }
    build(mats, parent, shadows) {
      const out = [];
      for (const k in this.g) {
        const d = this.g[k];
        if (!d.p.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(d.u, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
        g.setIndex(d.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(d.i, 1) : new THREE.Uint16BufferAttribute(d.i, 1));
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, mats.vc ? (mats.vc[k] || mats.vc.wall) : (mats[k] || mats.wall));
        m.castShadow = shadows !== false && k !== 'water' && k !== 'lava' && k !== 'web' && k !== 'vine';
        m.receiveShadow = true;
        m.matrixAutoUpdate = false; m.updateMatrix();
        parent.add(m); out.push(m);
      }
      this.g = {};
      return out;
    }
  }
  G.Batch = Batch;

  // ---------------- world ----------------
  class World {
    constructor(W, D, biome) {
      this.W = W; this.D = D; this.biome = biome;
      this.mats = G.Tex.materials(biome);
      this.batch = new Batch();
      this.colliders = [];
      this.hash = new Map();
      this.stamp = 0;
      this.group = new THREE.Group();
      this.deferred = [];
      this.lightSources = [];
      this.interactables = [];
      this.destructibles = [];
      this.triggers = [];
      this.animated = [];
      this.waterZones = [];
      this.lavaZones = [];
      this.hazards = [];
      this.spawn = { x: W / 2, y: 0, z: D - 4, yaw: 0 };
      this.enemySpawns = [];
      this.pitY = -40;
      this.killY = -9;
    }
    // ---- colliders ----
    _hkey(cx, cz) { return (cx + 64) * 4096 + (cz + 64); }
    addCollider(x0, y0, z0, x1, y1, z1, o) {
      const c = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), surf: (o && o.surf) || 'stone', noGrapple: !!(o && o.noGrapple), dest: (o && o.dest) || null, alive: true, st: 0, idx: this.colliders.length, tag: o && o.tag };
      this.colliders.push(c);
      const ax = Math.floor(c.x0 / CS), bx = Math.floor(c.x1 / CS), az = Math.floor(c.z0 / CS), bz = Math.floor(c.z1 / CS);
      for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
        const k = this._hkey(cx, cz);
        let a = this.hash.get(k); if (!a) { a = []; this.hash.set(k, a); }
        a.push(c);
      }
      return c;
    }
    removeCollider(c) { c.alive = false; }
    // solid box = visible geometry + collider (the only way static solids are created => no invisible walls)
    solid(mk, x0, y0, z0, x1, y1, z1, o) {
      o = o || {};
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
      this.batch.box(mk, x0, y0, z0, x1, y1, z1, o);
      return this.addCollider(x0, y0, z0, x1, y1, z1, { surf: o.surf || (mk.startsWith('wood') ? 'wood' : mk === 'iron' ? 'metal' : 'stone'), noGrapple: o.noGrapple, tag: o.tag });
    }
    visual(mk, x0, y0, z0, x1, y1, z1, o) { this.batch.box(mk, x0, y0, z0, x1, y1, z1, o); }
    query(x0, y0, z0, x1, y1, z1, out) {
      out = out || [];
      this.stamp++;
      const ax = Math.floor(x0 / CS), bx = Math.floor(x1 / CS), az = Math.floor(z0 / CS), bz = Math.floor(z1 / CS);
      for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
        const a = this.hash.get(this._hkey(cx, cz)); if (!a) continue;
        for (const c of a) {
          if (c.st === this.stamp || !c.alive) continue; c.st = this.stamp;
          if (c.x1 > x0 && c.x0 < x1 && c.y1 > y0 && c.y0 < y1 && c.z1 > z0 && c.z0 < z1) out.push(c);
        }
      }
      return out;
    }
    boxFree(x0, y0, z0, x1, y1, z1) { return this.query(x0, y0, z0, x1, y1, z1).length === 0; }
    floorBelow(x, y, z) {
      const a = this.query(x - 0.01, -60, z - 0.01, x + 0.01, y + 0.01, z + 0.01);
      let best = -100;
      for (const c of a) if (c.y1 <= y + 0.02 && c.y1 > best) best = c.y1;
      return best;
    }
    // ray vs world AABBs (2D DDA over hash cells). returns {t, point, normal, c} or null
    raycast(o, d, maxT, opts) {
      const st = ++this.stamp;
      let best = maxT, hit = null, hn = 0;
      let cx = Math.floor(o.x / CS), cz = Math.floor(o.z / CS);
      const sx = d.x > 0 ? 1 : d.x < 0 ? -1 : 0, sz = d.z > 0 ? 1 : d.z < 0 ? -1 : 0;
      const tdx = sx ? CS / Math.abs(d.x) : Infinity, tdz = sz ? CS / Math.abs(d.z) : Infinity;
      let tmx = sx > 0 ? ((cx + 1) * CS - o.x) / d.x : sx < 0 ? (cx * CS - o.x) / d.x : Infinity;
      let tmz = sz > 0 ? ((cz + 1) * CS - o.z) / d.z : sz < 0 ? (cz * CS - o.z) / d.z : Infinity;
      const ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
      const filt = opts && opts.filter;
      let t = 0, guard = 0;
      const maxC = Math.ceil(Math.max(this.W, this.D) / CS) + 4;
      while (t <= best && guard++ < 200) {
        const a = this.hash.get(this._hkey(cx, cz));
        if (a) for (const c of a) {
          if (c.st === st || !c.alive) continue; c.st = st;
          if (c.ghost && !(opts && opts.ghost)) continue; // invisible anti-perch walls don't stop shots, sight or the grapple
          if (filt && !filt(c)) continue;
          let t1 = (c.x0 - o.x) * ix, t2 = (c.x1 - o.x) * ix;
          let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
          t1 = (c.y0 - o.y) * iy; t2 = (c.y1 - o.y) * iy;
          let a1 = Math.min(t1, t2), a2 = Math.max(t1, t2);
          if (a1 > tmin) { tmin = a1; ax = 1; } if (a2 < tmax) tmax = a2;
          t1 = (c.z0 - o.z) * iz; t2 = (c.z1 - o.z) * iz;
          a1 = Math.min(t1, t2); a2 = Math.max(t1, t2);
          if (a1 > tmin) { tmin = a1; ax = 2; } if (a2 < tmax) tmax = a2;
          if (tmax >= Math.max(tmin, 0) && tmin >= 0 && tmin < best) { best = tmin; hit = c; hn = ax; }
        }
        if (tmx < tmz) { t = tmx; tmx += tdx; cx += sx; } else { t = tmz; tmz += tdz; cz += sz; }
        if (cx < -3 || cz < -3 || cx > maxC || cz > maxC) break;
        if (!sx && !sz) break;
      }
      if (!hit) return null;
      const n = new THREE.Vector3();
      if (hn === 0) n.x = -Math.sign(d.x); else if (hn === 1) n.y = -Math.sign(d.y); else n.z = -Math.sign(d.z);
      return { t: best, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best), normal: n, c: hit };
    }
    los(a, b) {
      const d = new THREE.Vector3().subVectors(b, a);
      const L = d.length(); if (L < 0.01) return true;
      d.divideScalar(L);
      return !this.raycast(a, d, L - 0.05);
    }

    // ---- kinematic AABB movement (player). pos = feet center.
    moveBox(pos, vel, dt, hw, h, st) {
      const EPS = 0.002, STEP = st.stepH ?? 0.5;
      const res = { hitWall: false, hitCeil: false, landed: false, stepped: 0 };
      const tmp = [];
      // horizontal axes
      for (const ax of ['x', 'z']) {
        const dv = vel[ax] * dt;
        if (dv === 0) continue;
        pos[ax] += dv;
        tmp.length = 0;
        this.query(pos.x - hw, pos.y + EPS, pos.z - hw, pos.x + hw, pos.y + h, pos.z + hw, tmp);
        for (const c of tmp) {
          // overlap still?
          if (!(c.x1 > pos.x - hw && c.x0 < pos.x + hw && c.y1 > pos.y + EPS && c.y0 < pos.y + h && c.z1 > pos.z - hw && c.z0 < pos.z + hw)) continue;
          const rise = c.y1 - pos.y;
          if (st.canStep && rise > 0 && rise <= STEP && this.boxFree(pos.x - hw, c.y1 + EPS, pos.z - hw, pos.x + hw, c.y1 + h, pos.z + hw)) {
            pos.y = c.y1 + EPS * 0.5; res.stepped = Math.max(res.stepped, rise);
            continue;
          }
          if (dv > 0) pos[ax] = (ax === 'x' ? c.x0 : c.z0) - hw - EPS;
          else pos[ax] = (ax === 'x' ? c.x1 : c.z1) + hw + EPS;
          vel[ax] = 0; res.hitWall = true;
        }
      }
      // vertical
      const dy = vel.y * dt;
      pos.y += dy;
      tmp.length = 0;
      this.query(pos.x - hw + EPS, pos.y, pos.z - hw + EPS, pos.x + hw - EPS, pos.y + h, pos.z + hw - EPS, tmp);
      for (const c of tmp) {
        if (!(c.y1 > pos.y && c.y0 < pos.y + h)) continue;
        if (dy <= 0 && c.y1 - pos.y <= Math.max(0.6, -dy + 0.05)) { pos.y = c.y1; if (vel.y < 0) res.landed = true; vel.y = 0; }
        else if (dy > 0) { pos.y = c.y0 - h - EPS; vel.y = 0; res.hitCeil = true; }
        else { // penetration from side while falling - push up if small, else leave to depenetrate
          if (c.y1 - pos.y < 0.6) { pos.y = c.y1; vel.y = 0; res.landed = true; }
        }
      }
      return res;
    }
    groundAt(pos, hw, maxDown) {
      // highest top under the footprint within maxDown below feet
      const a = this.query(pos.x - hw + 0.003, pos.y - maxDown, pos.z - hw + 0.003, pos.x + hw - 0.003, pos.y + 0.01, pos.z + hw - 0.003);
      let best = -Infinity;
      for (const c of a) if (c.y1 <= pos.y + 0.011 && c.y1 > best) best = c.y1;
      return best;
    }
    // push out of any overlapping collider (safety net for spawn / teleports)
    depenetrate(pos, hw, h) {
      for (let iter = 0; iter < 6; iter++) {
        const a = this.query(pos.x - hw, pos.y + 0.01, pos.z - hw, pos.x + hw, pos.y + h, pos.z + hw);
        if (!a.length) return true;
        const c = a[0];
        const opts = [
          [c.y1 - pos.y, 'up'], [pos.x + hw - c.x0, 'nx'], [c.x1 - (pos.x - hw), 'px'], [pos.z + hw - c.z0, 'nz'], [c.z1 - (pos.z - hw), 'pz'],
        ].sort((p, q) => p[0] - q[0]);
        const [d, k] = opts[0];
        if (k === 'up') pos.y += d + 0.01; else if (k === 'nx') pos.x -= d + 0.01; else if (k === 'px') pos.x += d + 0.01; else if (k === 'nz') pos.z -= d + 0.01; else pos.z += d + 0.01;
      }
      return false;
    }

    // ---- nav grid (1m) ----
    // A world with storeys over storeys (this.navLayers > 1, the strata fields) keeps one nav node per walkable surface in a
    // cell: node = layer * N + cell, layers sorted bottom-up. Ordinary worlds have one layer, so node == cell as before.
    buildNav() {
      const W = this.W, D = this.D;
      const N = W * D, LM = this.navLayers || 1;
      const tops = [];
      const per = [];
      const tmp = [];
      let L = 1;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const cx = x + 0.5, cz = z + 0.5;
        tmp.length = 0;
        this.query(cx - 0.01, -60, cz - 0.01, cx + 0.01, 60, cz + 0.01, tmp);
        tmp.sort((a, b) => a.y0 - b.y0);
        let floor = -Infinity;
        const ts = [];
        for (const c of tmp) {
          if (c.dest) continue;
          if (floor === -Infinity) { floor = c.y1; continue; }
          if (c.y0 <= floor + 0.8) floor = Math.max(floor, c.y1);
          else if (LM > 1) { ts.push(floor); floor = c.y1; }
        }
        if (floor > -Infinity || !ts.length) ts.push(floor);
        if (ts.length > LM) ts.length = LM;
        per.push(ts); if (ts.length > L) L = ts.length;
      }
      this.N = N; this.L = L;
      this.nf = new Float32Array(N * L).fill(-Infinity);
      this.nb = new Uint8Array(N * L).fill(1);
      this.nhz = L > 1 ? new Uint8Array(N * L) : null;
      this.npen = new Float32Array(N * L);
      for (let i = 0; i < N; i++) {
        const ts = per[i], cx = (i % W) + 0.5, cz = ((i / W) | 0) + 0.5;
        for (let k = 0; k < ts.length; k++) {
          const n = k * N + i, floor = ts[k];
          this.nf[n] = floor;
          if (floor === -Infinity) { this.nb[n] = 1; continue; }
          // blocked if something solid occupies body space near the cell center
          tmp.length = 0;
          this.query(cx - 0.32, floor + 0.85, cz - 0.32, cx + 0.32, floor + 1.9, cz + 0.32, tmp);
          this.nb[n] = tmp.length ? 1 : 0;
          // strata: the lava trench and the roof are no place to walk or spawn
          if (L > 1 && this.navHazard && this.navHazard(cx, floor, cz)) { this.nb[n] = 1; this.nhz[n] = 1; }
        }
      }
      // clearance penalty
      for (let n = 0; n < N * L; n++) {
        if (this.nf[n] === -Infinity) continue;
        const i = n % N, x = i % W, z = (i / W) | 0;
        let p = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= D) { p += 0.35; continue; }
          const b = this.land(n, zz * W + xx);
          if (b < 0 || this.nb[b]) p += 0.35;
        }
        this.npen[n] = p;
      }
      this.ndist = new Float32Array(N * L).fill(Infinity);
      this.heap = new Int32Array(N * L * 8 + 16);
      this.hkey = new Float32Array(N * L * 8 + 16);
      // strata: the geometry of every step (which node you land on, if the height change is walkable) never changes,
      // so it is worked out once here, with the reverse edges the flow field walks (only blocking can change later)
      this.nadj = null;
      if (L > 1) {
        const NL = N * L, adj = new Int32Array(NL * 8).fill(-1), cnt = new Int32Array(NL + 1);
        for (let a = 0; a < NL; a++) {
          if (this.nf[a] === -Infinity) continue;
          const i = a % N, x = i % W, z = (i / W) | 0;
          for (let d = 0; d < 8; d++) {
            const xx = x + DIRS[d][0], zz = z + DIRS[d][1];
            if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue;
            const b = this.land(a, zz * W + xx);
            if (b < 0) continue;
            const dh = this.nf[b] - this.nf[a];
            if (dh > 0.8 || dh < -6.5) continue;
            adj[a * 8 + d] = b; cnt[b + 1]++;
          }
        }
        for (let b = 0; b < NL; b++) cnt[b + 1] += cnt[b];
        const ra = new Int32Array(cnt[NL]), rd = new Uint8Array(cnt[NL]), fill = cnt.slice(0, NL);
        for (let a = 0; a < NL; a++) for (let d = 0; d < 8; d++) { const b = adj[a * 8 + d]; if (b >= 0) { const e = fill[b]++; ra[e] = a; rd[e] = d; } }
        this.nadj = adj; this.rs = cnt; this.ra = ra; this.rd = rd;
      }
    }
    // the node you end up on stepping from node a into cell cb (the highest surface no more than a step above you); -1: none
    land(a, cb) {
      if (this.L === 1) return cb;
      const N = this.N, fa = this.nf[a];
      let best = -1, bf = -Infinity;
      for (let k = 0; k < this.L; k++) { const n = k * N + cb, f = this.nf[n]; if (f === -Infinity) break; if (f <= fa + 0.8 && f > bf) { bf = f; best = n; } }
      return best;
    }
    // y (optional): the surface at or just below that height (strata); without it, the lowest one
    navIdx(x, z, y) {
      const xi = Math.floor(x), zi = Math.floor(z); if (xi < 0 || zi < 0 || xi >= this.W || zi >= this.D) return -1;
      const i = zi * this.W + xi;
      if (this.L > 1 && y !== undefined) {
        let best = i;
        for (let k = 1; k < this.L; k++) { const n = k * this.N + i, f = this.nf[n]; if (f === -Infinity || f > y + 0.6) break; best = n; }
        return best;
      }
      return i;
    }
    navFloor(x, z, y) { const i = this.navIdx(x, z, y); return i < 0 ? -Infinity : this.nf[i]; }
    canStep(a, b) { // a->b walkable (for monsters)
      if (this.nb[a] || this.nb[b]) return false;
      const d = this.nf[b] - this.nf[a];
      return d <= 0.8 && d >= -6.5 && (this.L === 1 || this.land(a, b % this.N) === b);
    }
    // flood reachable set (forward edges) for validation
    reach(fromIdx) {
      const W = this.W, D = this.D, N = W * D;
      const seen = new Uint8Array(N * (this.L || 1));
      const q = [fromIdx]; seen[fromIdx] = 1;
      while (q.length) {
        const a = q.pop();
        const ac = a % N, ax = ac % W, az = (ac / W) | 0;
        for (let k = 0; k < 4; k++) {
          const bx = ax + (k === 0 ? 1 : k === 1 ? -1 : 0), bz = az + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (bx < 0 || bz < 0 || bx >= W || bz >= D) continue;
          const b = this.land(a, bz * W + bx);
          if (b >= 0 && !seen[b] && this.canStep(a, b)) { seen[b] = 1; q.push(b); }
        }
      }
      return seen;
    }
    // Dijkstra on reversed edges from target => ndist[i] = cost to reach target from i
    updateFlow(tx, tz, ty) {
      const W = this.W, D = this.D, N = W * D, L = this.L || 1;
      let t = this.navIdx(tx, tz, ty);
      if (t < 0) return;
      if (this.nb[t]) { // target inside blocked cell: use nearest open neighbour
        let best = -1, bd = 1e9;
        for (let r = 1; r < 4 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const i = this.navIdx(tx + dx, tz + dz, ty); if (i >= 0 && !this.nb[i]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
        }
        if (best < 0) return; t = best;
      }
      const dist = this.ndist; dist.fill(Infinity);
      const heap = this.heap, hk = this.hkey; let hn = 0;
      const push = (i, k) => { let n = hn++; heap[n] = i; hk[n] = k; while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= hk[n]) break; const ti = heap[p], tk = hk[p]; heap[p] = heap[n]; hk[p] = hk[n]; heap[n] = ti; hk[n] = tk; n = p; } };
      const pop = () => { const r = heap[0]; hn--; heap[0] = heap[hn]; hk[0] = hk[hn]; let n = 0; for (;;) { const l = n * 2 + 1, rr = l + 1; let m = n; if (l < hn && hk[l] < hk[m]) m = l; if (rr < hn && hk[rr] < hk[m]) m = rr; if (m === n) break; const ti = heap[m], tk = hk[m]; heap[m] = heap[n]; hk[m] = hk[n]; heap[n] = ti; hk[n] = tk; n = m; } return r; };
      dist[t] = 0; push(t, 0);
      let pops = 0;
      const blk = (n) => n < 0 || this.nb[n];
      if (this.nadj) {
        const nb = this.nb, adj = this.nadj, rs = this.rs, ra = this.ra, rd = this.rd, pen = this.npen;
        while (hn > 0 && pops++ < N * L * 3) {
          const kTop = hk[0];
          const b = pop();
          if (kTop > dist[b] || nb[b]) continue;
          for (let e = rs[b], e1 = rs[b + 1]; e < e1; e++) {
            const a = ra[e], d = rd[e];
            if (nb[a]) continue;
            if (DIAG[d]) { const c1 = adj[a * 8 + DXI[d]], c2 = adj[a * 8 + DZI[d]]; if (c1 < 0 || c2 < 0 || nb[c1] || nb[c2]) continue; }
            const nd = dist[b] + (DIAG[d] ? 1.414 : 1) + pen[a];
            if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
          }
        }
        this.flowTarget = t;
        return;
      }
      while (hn > 0 && pops++ < W * D * 3 * L) {
        const kTop = hk[0];
        const b = pop();
        if (kTop > dist[b]) continue;
        const bc = b % N, bx = bc % W, bz = (bc / W) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const ax = bx + dx, az = bz + dz;
          if (ax < 0 || az < 0 || ax >= W || az >= D) continue;
          for (let k = 0; k < L; k++) {
            const a = k * N + az * W + ax;
            if (this.nf[a] === -Infinity) break;
            if (!this.canStep(a, b)) continue;
            if (dx && dz) { // no corner cutting
              if (blk(this.land(a, az * W + bx)) || blk(this.land(a, bz * W + ax))) continue;
            }
            const nd = dist[b] + (dx && dz ? 1.414 : 1) + this.npen[a];
            if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
          }
        }
      }
      this.flowTarget = t;
    }
    // direction toward target following the flow field (null if unreachable)
    flowDir(x, z, out, y) {
      const W = this.W, N = W * this.D;
      const i = this.navIdx(x, z, y);
      if (i < 0 || this.ndist[i] === Infinity) return null;
      const ic = i % N, ix = ic % W, iz = (ic / W) | 0;
      let best = this.ndist[i], bx = 0, bz = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const ax = ix + dx, az = iz + dz;
        if (ax < 0 || az < 0 || ax >= W || az >= this.D) continue;
        const a = this.land(i, az * W + ax);
        if (a < 0) continue;
        if (dx && dz) { const c1 = this.land(i, az * W + ix), c2 = this.land(i, iz * W + ax); if (c1 < 0 || c2 < 0 || this.nb[c1] || this.nb[c2]) continue; }
        if (!this.canStep(i, a)) continue; // never steer into a cell we can't actually walk into
        if (this.ndist[a] < best) { best = this.ndist[a]; bx = dx; bz = dz; }
      }
      if (!bx && !bz) return null;
      // aim at next cell center (smooths movement)
      out.x = ix + bx + 0.5 - x; out.z = iz + bz + 0.5 - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return out;
    }
    // strata: may a walker at p step on to (nx, nz)? false over the lava trench / off into nothing
    walkerSafe(p, nx, nz) {
      if (this.L === 1) return true;
      const a = this.navIdx(p.x, p.z, p.y), cb = this.navIdx(nx, nz);
      if (a < 0 || cb < 0) return false;
      if (a % this.N === cb) return true;
      const b = this.land(a, cb);
      return b >= 0 && !this.nhz[b];
    }
    randomOpenCell(rng, filter) {
      for (let k = 0; k < 400; k++) {
        const x = Math.floor(rng.next() * this.W), z = Math.floor(rng.next() * this.D);
        const i = (this.L > 1 ? Math.floor(rng.next() * this.L) * this.N : 0) + z * this.W + x;
        if (this.nb[i] || this.nf[i] === -Infinity) continue;
        if (this.npen[i] > 0.4) continue;
        if (filter && !filter(x + 0.5, z + 0.5, i)) continue;
        return { x: x + 0.5, y: this.nf[i], z: z + 0.5, i };
      }
      return null;
    }

    // ---- lights ----
    addLight(x, y, z, o) {
      this.lightSources.push(Object.assign({ pos: new THREE.Vector3(x, y, z), color: this.mats.biome.torch, intensity: 9, range: 13, flame: 1, emit: true, ph: Math.random() * 100 }, o || {}));
    }

    flushDeferred() { const d = this.deferred; this.deferred = []; for (const f of d) f(this.group); }
    finalize(scene, quality) {
      for (const f of this.deferred) f(this.group);
      this.deferred = [];
      this.batch.build(this.mats, this.group, quality !== 'low');
      scene.add(this.group);
    }
    dispose(scene) {
      scene.remove(this.group);
      this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
  }
  G.World = World;

  // ---------------- dynamic torch lights (constant light count) ----------------
  const LightPool = (G.LightPool = {
    lights: [], N: 8, t: 0,
    init(scene) {
      for (let i = 0; i < this.N; i++) {
        const l = new THREE.PointLight(0xff9a50, 0, 14, 2);
        l.userData.src = null; scene.add(l); this.lights.push(l);
      }
    },
    reset() { for (const l of this.lights) { l.intensity = 0; l.userData.src = null; } },
    update(dt, world, camPos, time) {
      if (!world) return;
      this.t -= dt;
      if (this.t <= 0) {
        this.t = 0.25;
        const S = world.lightSources;
        const arr = S.map((s) => [s, s.pos.distanceToSquared(camPos) / (s.prio || 1)]).sort((a, b) => a[1] - b[1]);
        for (let i = 0; i < this.N; i++) {
          const l = this.lights[i];
          const s = arr[i] ? arr[i][0] : null;
          if (l.userData.src !== s) { l.userData.src = s; l.userData.fade = 0; }
        }
      }
      for (const l of this.lights) {
        const s = l.userData.src;
        if (!s) { l.intensity = 0; continue; }
        l.userData.fade = Math.min(1, (l.userData.fade || 0) + dt * 3);
        l.position.copy(s.pos); l.position.y += 0.25;
        l.color.set(s.color); l.distance = s.range;
        const fl = s.steady ? 1 : 0.82 + 0.1 * Math.sin(time * 9.1 + s.ph) + 0.08 * Math.sin(time * 23.3 + s.ph * 2) + 0.05 * (Math.random() - 0.5);
        l.intensity = s.intensity * fl * l.userData.fade * (s.on === false ? 0 : 1) * (G.LIGHT_K || 1);
      }
    },
  });
})();
