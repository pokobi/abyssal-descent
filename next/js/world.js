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
  const TERR_M = 0.8; // (while the player moves: how far under the drawn surface of a terrain its column's top may stand; the queries reach down by it)
  class World {
    constructor(W, D, biome) {
      this.W = W; this.D = D; this.biome = biome; this.zo = 0; this.Dn = D; this.xo = 0; this.Wn = W;
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
      this.visBoxes = []; // (the drawn-only boxes, w.visual: what may hide a sign hung in the air, areas.js AR.signY)
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
    // a round thing standing at (x, z), radius r, from y0 to y1: two boxes in a cross (a square round it would stand out of it at its
    // corners, one inside it would let you walk into its sides); returns both
    roundCollider(x, z, r, y0, y1, o) {
      return [this.addCollider(x - r * 0.92, y0, z - r * 0.5, x + r * 0.92, y1, z + r * 0.5, o), this.addCollider(x - r * 0.5, y0, z - r * 0.92, x + r * 0.5, y1, z + r * 0.92, o)];
    }
    // an invisible wall from y0 up into the sky over x0..x1 / z0..z1: the rock that bounds an area (the rim round a shaft, crags, canyon
    // walls) can't be stood on or climbed over. Like the anti-perch columns (levelgen fireTops), shots, sight and the grapple pass
    // through it (the rock's face below still holds the hook); the nav grid doesn't see it (the rock's top was no way for monsters anyway)
    skyCap(x0, y0, z0, x1, z1) {
      if (x1 - x0 < 0.001 || z1 - z0 < 0.001) return null;
      const c = this.addCollider(x0, y0, z0, x1, World.SKY_Y, z1, { noGrapple: true });
      c.ghost = true; c.noFire = true; c.navIgnore = true; c.skyCap = true;
      return c;
    }
    // solid box = visible geometry + collider (the only way static solids are created => no invisible walls)
    solid(mk, x0, y0, z0, x1, y1, z1, o) {
      o = o || {};
      if (x1 - x0 < 0.001 || y1 - y0 < 0.001 || z1 - z0 < 0.001) return null;
      this.batch.box(mk, x0, y0, z0, x1, y1, z1, o);
      const c = this.addCollider(x0, y0, z0, x1, y1, z1, { surf: o.surf || (mk.startsWith('wood') ? 'wood' : mk === 'iron' ? 'metal' : mk === 'ice' ? 'ice' : 'stone'), noGrapple: o.noGrapple, tag: o.tag });
      c.vis = true; if (this._gateFrame) c.gateFrame = true; // (drawn: it hides what is behind it; a bare addCollider is unseen)
      return c;
    }
    visual(mk, x0, y0, z0, x1, y1, z1, o) { this.batch.box(mk, x0, y0, z0, x1, y1, z1, o); if (this.visBoxes && !this._gateFrame && y1 - y0 > 0.02) this.visBoxes.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]); }
    query(x0, y0, z0, x1, y1, z1, out) {
      out = out || [];
      this.stamp++;
      const ax = Math.floor(x0 / CS), bx = Math.floor(x1 / CS), az = Math.floor(z0 / CS), bz = Math.floor(z1 / CS);
      for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
        const a = this.hash.get(this._hkey(cx, cz)); if (!a) continue;
        for (const c of a) {
          if (c.st === this.stamp || !c.alive) continue; c.st = this.stamp;
          if (c.enemyOnly && this.pp) continue; // this.pp: set while the player moves
          if (c.shotOnly) continue; // (something hanging in the air that only shots strike: a bell, a crucible; nobody walks into it)
          if (c.x1 > x0 && c.x0 < x1 && c.y1 > y0 && c.y0 < y1 && c.z1 > z0 && c.z0 < z1) out.push(c);
        }
      }
      return out;
    }
    boxFree(x0, y0, z0, x1, y1, z1) {
      if (!this.pp) return this.query(x0, y0, z0, x1, y1, z1).length === 0;
      // (the player: a terrain's column is in the way only where its drawn surface is: under the box's middle, or a step and more above
      // the box's bottom beside it, see tTop)
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (const c of this.query(x0, y0 - TERR_M, z0, x1, y1, z1)) {
        if (!c.tg) { if (c.y1 > y0) return false; continue; }
        const inC = cx >= c.x0 && cx < c.x1 && cz >= c.z0 && cz < c.z1;
        if (this.tTop(c, cx, cz) > y0 + (inC ? 0.01 : 0.5)) return false;
      }
      return true;
    }
    // the drawn surface of a terrain's column (terrain.js T.surf) at the point of it nearest (x, z)
    tTop(c, x, z) {
      const s = G.Terrain.surf(c.tg, Math.min(c.x1 - 1e-4, Math.max(c.x0 + 1e-4, x)), Math.min(c.z1 - 1e-4, Math.max(c.z0 + 1e-4, z)));
      return s == null ? c.y1 : s;
    }
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
          if (c.enemyOnly) continue;
          if (c.ghost && !(opts && opts.ghost)) continue; // invisible anti-perch walls don't stop shots, sight or the grapple
          if (filt && !filt(c)) continue;
          if (c.bars && !(opts && opts.bars)) continue; // cell bars: shots and sight pass between them
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
      // While the player moves (this.pp) the ground of a terrain (its columns carry c.tg, terrain.js) is its drawn surface, not the stepped
      // tops of its columns: the feet follow the slope smoothly (the column under the middle lifts them onto it as it rises), a neighbour
      // column is passed over unless its surface stands more than a step above the feet (a drop: a wall). Everything else is as it was.
      const PP = this.pp, inC = (c) => pos.x >= c.x0 && pos.x < c.x1 && pos.z >= c.z0 && pos.z < c.z1;
      // horizontal axes
      for (const ax of ['x', 'z']) {
        const dv = vel[ax] * dt;
        if (dv === 0) continue;
        pos[ax] += dv;
        tmp.length = 0;
        this.query(pos.x - hw, pos.y + EPS - (PP ? TERR_M : 0), pos.z - hw, pos.x + hw, pos.y + h, pos.z + hw, tmp);
        for (const c of tmp) {
          if (PP && c.tg) {
            if (!(c.x1 > pos.x - hw && c.x0 < pos.x + hw && c.z1 > pos.z - hw && c.z0 < pos.z + hw && c.y0 < pos.y + h)) continue;
            const mid = inC(c), top = this.tTop(c, pos.x, pos.z), rise = top - pos.y;
            if (rise <= EPS) continue;
            if (mid && rise <= (st.canStep ? STEP : 0.3) && this.boxFree(pos.x - hw, top + EPS, pos.z - hw, pos.x + hw, top + h, pos.z + hw)) {
              pos.y = top + EPS * 0.5; if (rise > 0.3) res.stepped = Math.max(res.stepped, rise);
              continue;
            }
            if (!mid && rise <= STEP) continue;
          } else {
            // overlap still?
            if (!(c.x1 > pos.x - hw && c.x0 < pos.x + hw && c.y1 > pos.y + EPS && c.y0 < pos.y + h && c.z1 > pos.z - hw && c.z0 < pos.z + hw)) continue;
            const rise = c.y1 - pos.y;
            if (st.canStep && rise > 0 && rise <= STEP && this.boxFree(pos.x - hw, c.y1 + EPS, pos.z - hw, pos.x + hw, c.y1 + h, pos.z + hw)) {
              pos.y = c.y1 + EPS * 0.5; res.stepped = Math.max(res.stepped, rise);
              continue;
            }
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
      this.query(pos.x - hw + EPS, pos.y - (PP ? TERR_M : 0), pos.z - hw + EPS, pos.x + hw - EPS, pos.y + h, pos.z + hw - EPS, tmp);
      for (const c of tmp) {
        if (PP && c.tg) { // (only the column under the middle is the ground; it never stands over you)
          if (!inC(c)) continue;
          const top = this.tTop(c, pos.x, pos.z), up = top - pos.y;
          if (up > 0 && up <= (dy <= 0 ? Math.max(0.6, -dy + 0.05) : 0.3)) { pos.y = top; if (dy <= 0) { if (vel.y < 0) res.landed = true; vel.y = 0; } }
          continue;
        }
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
      // highest top under the footprint within maxDown below feet (while the player moves, a terrain's ground is its drawn surface under the middle)
      const PP = this.pp;
      const a = this.query(pos.x - hw + 0.003, pos.y - maxDown - (PP ? TERR_M : 0), pos.z - hw + 0.003, pos.x + hw - 0.003, pos.y + 0.01, pos.z + hw - 0.003);
      let best = -Infinity, terr = false;
      for (const c of a) {
        let top = c.y1;
        if (PP && c.tg) { if (!(pos.x >= c.x0 && pos.x < c.x1 && pos.z >= c.z0 && pos.z < c.z1)) continue; top = this.tTop(c, pos.x, pos.z); }
        if (top <= pos.y + 0.011 && top >= pos.y - maxDown - 1e-6 && top > best) { best = top; terr = !!(PP && c.tg); }
      }
      this.gTerr = terr; // (the ground found is a terrain's drawn surface: the feet are set right on it, player.js)
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
    // navPadX / navPad (strata fields): extra nav columns / rows beyond the walls, for the barred rooms dug into them; column c is x = c - navPadX, row r is z = r - navPad.
    buildNav() {
      const xo = this.navPadX || 0, zo = this.navPad || 0, W = this.W + 2 * xo, D = this.D + 2 * zo;
      this.xo = xo; this.zo = zo; this.Wn = W; this.Dn = D;
      const N = W * D, LM = this.navLayers || 1;
      const per = [], perc = [];
      const tmp = [];
      let L = 1;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const cx = x - xo + 0.5, cz = z - zo + 0.5;
        tmp.length = 0;
        this.query(cx - 0.01, -60, cz - 0.01, cx + 0.01, 60, cz + 0.01, tmp);
        tmp.sort((a, b) => a.y0 - b.y0);
        let floor = -Infinity;
        const ts = [], cs = [];
        for (const c of tmp) {
          if (c.dest || c.navIgnore) continue;
          if (floor === -Infinity) { floor = c.y1; continue; }
          if (c.y0 <= floor + 0.8) floor = Math.max(floor, c.y1);
          else if (LM > 1) { ts.push(floor); cs.push(c.y0); floor = c.y1; }
        }
        if (floor > -Infinity || !ts.length) ts.push(floor);
        if (ts.length > LM) ts.length = LM;
        per.push(ts); perc.push(cs); if (ts.length > L) L = ts.length;
      }
      this.N = N; this.L = L;
      this.nf = new Float32Array(N * L).fill(-Infinity);
      this.nb = new Uint8Array(N * L).fill(1);
      this.nhz = L > 1 ? new Uint8Array(N * L) : null;
      this.nc = L > 1 ? new Float32Array(N * L).fill(1e9) : null; // the open air above each surface ends at nc (the underside of whatever is above it)
      this.npen = new Float32Array(N * L);
      this.aadj = null; this.ndistA = null;
      for (let i = 0; i < N; i++) {
        const ts = per[i], cx = (i % W) - xo + 0.5, cz = ((i / W) | 0) - zo + 0.5;
        for (let k = 0; k < ts.length; k++) {
          const n = k * N + i, floor = ts[k];
          this.nf[n] = floor;
          if (this.nc && k < perc[i].length) this.nc[n] = perc[i][k];
          if (floor === -Infinity) { this.nb[n] = 1; continue; }
          // blocked if something solid occupies body space near the cell center
          tmp.length = 0;
          this.query(cx - 0.32, floor + 0.85, cz - 0.32, cx + 0.32, floor + 1.9, cz + 0.32, tmp);
          this.nb[n] = tmp.some((c) => !c.navIgnore) ? 1 : 0; // a cell gate counts as open: monsters path through it (and batter it down)
          // strata: the lava trench and the roof are no place to walk or spawn
          if (L > 1 && this.navHazard && this.navHazard(cx, floor, cz)) { this.nb[n] = 1; this.nhz[n] = 1; }
        }
      }
      // iron bars (cell fronts) are thin enough to slip between two cell centres: block the cells on both sides of them
      this.nbk = null;
      for (const c of this.colliders) {
        if (!c.navBlock || c.alive === false) continue;
        this.nbk = this.nbk || new Uint8Array(N * L);
        for (let z = Math.floor(c.z0 + zo - 0.001); z <= Math.floor(c.z1 + zo - 0.001); z++) for (let x = Math.floor(c.x0 + xo + 0.001); x <= Math.floor(c.x1 + xo - 0.001); x++) {
          if (x < 0 || x >= W || z < 0 || z >= D) continue;
          for (let k = 0; k < L; k++) { const n = k * N + z * W + x; if (this.nf[n] > -Infinity && this.nf[n] > c.y0 - 0.3 && this.nf[n] < c.y1 - 1) { this.nb[n] = 1; this.nbk[n] = 1; } }
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
          if (b < 0) p += 0.35;
          else if (this.nb[b]) p += this.nhz && (this.nhz[b] || this.nf[b] < this.nf[n] - 2.6) ? 0.1 : 0.35;
          else if (this.L > 1 && this.nf[b] < this.nf[n] - 2.6) p += 0.1;
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
            if (dh > 0.8 || dh < -2.6) continue;
            if (dh < -0.8 && this.dropBarred(a, b, DIAG[d] ? this.land(a, z * W + xx) : -1, DIAG[d] ? this.land(a, zz * W + x) : -1)) continue;
            adj[a * 8 + d] = b; cnt[b + 1]++;
          }
        }
        for (let b = 0; b < NL; b++) cnt[b + 1] += cnt[b];
        const ra = new Int32Array(cnt[NL]), rd = new Uint8Array(cnt[NL]), fill = cnt.slice(0, NL);
        for (let a = 0; a < NL; a++) for (let d = 0; d < 8; d++) { const b = adj[a * 8 + d]; if (b >= 0) { const e = fill[b]++; ra[e] = a; rd[e] = d; } }
        this.nadj = adj; this.rs = cnt; this.ra = ra; this.rd = rd;
      }
    }
    // the ground changed after the area was built (a pillar fell): the floor and the blocked cells in x0..x1, z0..z1 are worked out again
    // exactly as buildNav does it, and the clearance penalty around them (single-storey areas only)
    navPatch(x0, z0, x1, z1) {
      // (a field of two layers that has things changing the ground, w.navRebuild: the whole grid is worked out again)
      if (this.nf && this.L !== 1 && this.navRebuild) { this.buildNav(); this._vn = null; return; }
      if (!this.nf || this.L !== 1) return;
      const W = this.Wn, D = this.Dn, xo = this.xo, zo = this.zo, tmp = [];
      const ax = Math.max(0, Math.floor(x0) + xo), bx = Math.min(W - 1, Math.floor(x1) + xo), az = Math.max(0, Math.floor(z0) + zo), bz = Math.min(D - 1, Math.floor(z1) + zo);
      for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
        const i = z * W + x, cx = x - xo + 0.5, cz = z - zo + 0.5;
        tmp.length = 0;
        this.query(cx - 0.01, -60, cz - 0.01, cx + 0.01, 60, cz + 0.01, tmp);
        tmp.sort((a, b) => a.y0 - b.y0);
        let floor = -Infinity;
        for (const c of tmp) {
          if (c.dest || c.navIgnore) continue;
          if (floor === -Infinity) { floor = c.y1; continue; }
          if (c.y0 <= floor + 0.8) floor = Math.max(floor, c.y1);
        }
        this.nf[i] = floor;
        if (floor === -Infinity) { this.nb[i] = 1; continue; }
        tmp.length = 0;
        this.query(cx - 0.32, floor + 0.85, cz - 0.32, cx + 0.32, floor + 1.9, cz + 0.32, tmp);
        this.nb[i] = tmp.some((c) => !c.navIgnore) || (this.nbk && this.nbk[i]) ? 1 : 0;
      }
      for (let z = Math.max(0, az - 1); z <= Math.min(D - 1, bz + 1); z++) for (let x = Math.max(0, ax - 1); x <= Math.min(W - 1, bx + 1); x++) {
        const n = z * W + x; if (this.nf[n] === -Infinity) continue;
        let p = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx >= W || zz >= D) { p += 0.35; continue; }
          if (this.nf[zz * W + xx] === -Infinity || this.nb[zz * W + xx]) p += 0.35;
        }
        this.npen[n] = p;
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
      const xi = Math.floor(x) + this.xo, zi = Math.floor(z) + this.zo; if (xi < 0 || zi < 0 || xi >= this.Wn || zi >= this.Dn) return -1;
      const i = zi * this.Wn + xi;
      if (this.L > 1 && y !== undefined) {
        let best = i;
        for (let k = 1; k < this.L; k++) { const n = k * this.N + i, f = this.nf[n]; if (f === -Infinity || f > y + 0.6) break; best = n; }
        return best;
      }
      return i;
    }
    // movement limits at (z, y): the area itself, plus the barred rooms dug into the west / east walls (strata fields); returns [xlo, xhi]
    xLimits(z, y, r) {
      let lo = r, hi = this.W - r;
      if (this.nooks) for (const n of this.nooks) if (z > n.a0 - 0.2 && z < n.a1 + 0.2 && y > n.y0 - 1.2 && y < n.y1 + 1) { if (n.side === 'W') lo = Math.min(lo, n.lo + r); else hi = Math.max(hi, n.hi - r); }
      return [lo, hi];
    }
    // prison bars (or a shut cell gate) between a and b on the same storey? Sight and shots pass through them, a walker does not:
    // it has to go round through the doorway (and batter a shut gate down) instead of heading straight at you
    barsBetween(a, b) {
      if (this.doors && this.doors.length) {
        for (const d of this.doors) {
          if (d.state !== 'closed' || Math.abs(a.y - d.y) > 2) continue;
          const t = (d.plane - a.x) / ((b.x - a.x) || 1e-6); if (t < 0 || t > 1) continue;
          const z = a.z + (b.z - a.z) * t; if (z > d.lo - 0.1 && z < d.hi + 0.1) return true;
        }
      }
      if (!this.nbk) return false;
      const dx = b.x - a.x, dz = b.z - a.z, n = Math.ceil(Math.hypot(dx, dz) / 0.4);
      for (let i = 1; i < n; i++) {
        const k = i / n, x = a.x + dx * k, z = a.z + dz * k, idx = this.navIdx(x, z, a.y);
        if (idx >= 0 && this.nbk[idx]) return true;
      }
      return false;
    }
    // ---- air routes for flyers (strata fields) ----
    // A surface node's open air runs from its floor up to nc. Two nodes of neighbouring cells connect if their air overlaps by a flyer's height,
    // so a flyer can cross the chasm (open air at every height) and slip between the storeys, but never through a slab.
    airOK(a, b) {
      if (this.nf[a] > this.airMaxY || this.nf[b] > this.airMaxY) return false;
      return Math.min(this.nc[a], this.nc[b]) - Math.max(this.nf[a], this.nf[b]) - 0.2 >= 1.8;
    }
    // the height a flyer can cross at from node a to its neighbour b: the tallest gap, within the air the two share, that nothing stands in
    // along the line between the two cell centres. The floors and ceilings alone took a thin wall for air (it holds no cell centre), and the
    // route then ran a flyer in a room straight at the wall, where it stayed. near: what stands in a's air about its cell. Sets g.lo / g.hi
    // (the band to fly in on that way); false if nothing a flyer's height is left
    airGap(a, b, near, g) {
      const lo = Math.max(this.nf[a], this.nf[b]) + 0.4, hi = Math.min(this.nc[a], this.nc[b]) - 0.3;
      g.lo = lo; g.hi = hi;
      if (!near.length) return true;
      const W = this.Wn, N = this.N, ia = a % N, ib = b % N;
      const ax = ia % W - this.xo + 0.5, az = ((ia / W) | 0) - this.zo + 0.5, dx = ib % W - ia % W, dz = ((ib / W) | 0) - ((ia / W) | 0);
      const hit = this._agH || (this._agH = []); hit.length = 0;
      for (const c of near) {
        if (c.y1 + 0.25 <= lo || c.y0 - 0.15 >= hi) continue;
        // the stretch of the line a -> b that runs through the box, in plan. Only what the line crosses counts: a wall it runs beside
        // (a cell centre a hand from a wall) is no bar, the body slides along that, and neither is one it only touches at an end. A line along
        // the seam of two boxes, or through the point where two corners meet, is barred: it would slip between them
        let t0 = 0, t1 = 1;
        if (dx) { let u = (c.x0 - ax) / dx, v = (c.x1 - ax) / dx; if (u > v) { const t = u; u = v; v = t; } if (u > t0) t0 = u; if (v < t1) t1 = v; }
        else if (ax < c.x0 || ax > c.x1) continue;
        if (dz) { let u = (c.z0 - az) / dz, v = (c.z1 - az) / dz; if (u > v) { const t = u; u = v; v = t; } if (u > t0) t0 = u; if (v < t1) t1 = v; }
        else if (az < c.z0 || az > c.z1) continue;
        if (t0 <= t1 && t1 > 0 && t0 < 1) hit.push(c);
      }
      if (!hit.length) return true;
      // climb from lo to hi over what is in the way (a little clear of each top and underside), keeping the tallest gap met
      let cur = lo, glo = lo, ghi = lo;
      for (let n = 0; n < 64 && cur < hi; n++) {
        let up = cur, nxt = hi;
        for (const c of hit) { const c0 = c.y0 - 0.15, c1 = c.y1 + 0.25; if (c1 <= cur) continue; if (c0 <= cur) { if (c1 > up) up = c1; } else if (c0 < nxt) nxt = c0; }
        if (up > cur) { cur = up; continue; }
        if (nxt - cur > ghi - glo) { glo = cur; ghi = nxt; }
        cur = nxt;
      }
      hit.length = 0;
      if (ghi - glo < 1.3) return false; // (as narrow as the narrowest band airOK lets through)
      g.lo = glo; g.hi = ghi; return true;
    }
    buildAir() {
      const W = this.Wn, D = this.Dn, N = this.N, L = this.L, NL = N * L, nf = this.nf, nc = this.nc;
      const cnt = new Int32Array(NL + 1), fs = new Int32Array(NL + 1), near = [], g = { lo: 0, hi: 0 };
      // the air a flyer may not be in (E.airOk: over the middle of a house nobody can get into, the rock round a tunnel) is no way either:
      // a route across it ran the flyer up against that border, and there it stayed for good
      const am = G.enemies && G.enemies.airMask ? G.enemies.airMask() : null, okc = am ? am.ok : null;
      // the ways out, in the order of the nodes they leave, with the band of each (the arrays grow as needed)
      let cap = this._airCap || NL * 5 + 64, ne = 0;
      let fb = new Int32Array(cap), fd = new Uint8Array(cap), flo = new Float32Array(cap), fhi = new Float32Array(cap);
      for (let a = 0; a < NL; a++) {
        fs[a] = ne;
        if (nf[a] === -Infinity || nf[a] > this.airMaxY) continue;
        const i = a % N, x = i % W, z = (i / W) | 0, cx = x - this.xo + 0.5, cz = z - this.zo + 0.5;
        if (okc && !okc[i]) continue;
        // what stands in this node's air about its cell (its own floor and ceiling are not in it): the ways out of it are tested against these
        near.length = 0; this.query(cx - 1.05, nf[a] + 0.15, cz - 1.05, cx + 1.05, nc[a] - 0.15, cz + 1.05, near);
        let m = 0; for (let j = 0; j < near.length; j++) if (!near[j].navIgnore) near[m++] = near[j];
        near.length = m;
        for (let d = 0; d < 8; d++) {
          const xx = x + DIRS[d][0], zz = z + DIRS[d][1];
          if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue;
          const cb = zz * W + xx;
          if (okc && !okc[cb]) continue;
          for (let k = 0; k < L; k++) {
            const b = k * N + cb; if (nf[b] === -Infinity) break;
            if (!this.airOK(a, b)) continue;
            // (nothing stands about the cell: the whole of the air the two share)
            if (!m) { g.lo = Math.max(nf[a], nf[b]) + 0.4; g.hi = Math.min(nc[a], nc[b]) - 0.3; } else if (!this.airGap(a, b, near, g)) continue;
            if (ne === cap) {
              cap *= 2; const o = [fb, fd, flo, fhi];
              fb = new Int32Array(cap); fd = new Uint8Array(cap); flo = new Float32Array(cap); fhi = new Float32Array(cap);
              fb.set(o[0]); fd.set(o[1]); flo.set(o[2]); fhi.set(o[3]);
            }
            fb[ne] = b; fd[ne] = d; flo[ne] = g.lo; fhi[ne] = g.hi; ne++; cnt[b + 1]++;
          }
        }
      }
      fs[NL] = ne; this._airCap = ne + 256;
      for (let b = 0; b < NL; b++) cnt[b + 1] += cnt[b];
      // rs/ra/rd: the ways into each node (the distance field walks them back from the target); fs/fb/fd: the ways out, with the band of each
      const ra = new Int32Array(ne), rd = new Uint8Array(ne), fill = cnt.slice(0, NL);
      for (let a = 0; a < NL; a++) for (let e = fs[a], e1 = fs[a + 1]; e < e1; e++) { const q = fill[fb[e]]++; ra[q] = a; rd[q] = fd[e]; }
      this.aadj = { rs: cnt, ra, rd, fs, fb, fd, flo, fhi };
    }
    // the flyers' ways, worked out as the area loads (left to the first flyer's first look for a way, they were a hitch at the start of the fight)
    warmAir() {
      if (!this.nc || this.aadj) return;
      if (this.airMaxY === undefined) this.airMaxY = (this.strata ? this.strata.HT : 1e9) - 1;
      this.buildAir(); this.ndistA = new Float32Array(this.N * this.L);
    }
    // flyers' distance field towards (tx, tz, ty); stops as soon as every wanted node (the flyers' own) is settled
    updateAirFlow(tx, tz, ty, wanted) {
      if (!this.nc) return false;
      if (!this.aadj) this.warmAir();
      let t = this.navIdx(tx, tz, ty); if (t < 0) return false;
      const dist = this.ndistA; dist.fill(Infinity);
      const heap = this.heap, hk = this.hkey; let hn = 0;
      const push = (i, k) => { let n = hn++; heap[n] = i; hk[n] = k; while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= hk[n]) break; const ti = heap[p], tk = hk[p]; heap[p] = heap[n]; hk[p] = hk[n]; heap[n] = ti; hk[n] = tk; n = p; } };
      const pop = () => { const r = heap[0]; hn--; heap[0] = heap[hn]; hk[0] = hk[hn]; let n = 0; for (;;) { const l = n * 2 + 1, rr = l + 1; let m = n; if (l < hn && hk[l] < hk[m]) m = l; if (rr < hn && hk[rr] < hk[m]) m = rr; if (m === n) break; const ti = heap[m], tk = hk[m]; heap[m] = heap[n]; hk[m] = hk[n]; heap[n] = ti; hk[n] = tk; n = m; } return r; };
      const want = new Set(wanted || []); let left = want.size;
      const { rs, ra, rd } = this.aadj;
      dist[t] = 0; push(t, 0);
      let pops = 0, stopAt = Infinity;
      while (hn > 0 && pops++ < this.N * this.L * 4) {
        const kTop = hk[0], b = pop();
        if (kTop > dist[b]) continue;
        // keep going a good way past the last flyer: it moves several metres before the next update and must not step onto cells with no distance yet
        if (kTop > stopAt) break;
        if (want.has(b)) { want.delete(b); if (--left <= 0) stopAt = kTop + 12; }
        for (let e = rs[b], e1 = rs[b + 1]; e < e1; e++) {
          const a = ra[e], nd = dist[b] + (DIAG[rd[e]] ? 1.414 : 1);
          if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
        }
      }
      return true;
    }
    // the way on for a flyer at (x, y, z): direction (out.x, out.z) and the altitude band [out.lo, out.hi] to fly in; null if there is no route
    airDir(x, z, y, out) {
      if (!this.ndistA) return null;
      const i = this.navIdx(x, z, y); if (i < 0 || this.ndistA[i] === Infinity) return null;
      // over the ceiling of the highest floor there (on a roof no storey of the grid stands for): not in that node's air, and its ways and
      // its band are not for this body (taking them, a flyer on a roof sank into it, making for the room under it)
      if (y > this.nc[i]) return null;
      const A = this.aadj, dist = this.ndistA;
      let best = dist[i], be = -1;
      for (let e = A.fs[i], e1 = A.fs[i + 1]; e < e1; e++) if (dist[A.fb[e]] < best) { best = dist[A.fb[e]]; be = e; }
      if (be < 0) return null;
      // towards the next cell's centre: the way was tested along the line between the centres (a doorway is open there, its jambs stand beside it)
      const ic = i % this.N, dr = DIRS[A.fd[be]];
      out.x = ic % this.Wn - this.xo + dr[0] + 0.5 - x; out.z = ((ic / this.Wn) | 0) - this.zo + dr[1] + 0.5 - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      out.lo = A.flo[be]; out.hi = A.fhi[be];
      return out;
    }
    // the altitude band of the air a flyer at (x, y, z) is in
    airBand(x, z, y, out) {
      const i = this.navIdx(x, z, y); if (i < 0 || !this.nc || y > this.nc[i]) return null;
      out.lo = this.nf[i] + 0.4; out.hi = this.nc[i] - 0.3; return out;
    }
    // the surface of the deep water over node a (its floor under it), or -Infinity
    deepTop(a) {
      const i = a % this.N, x = (i % this.Wn) - (this.xo || 0) + 0.5, z = Math.floor(i / this.Wn) - (this.zo || 0) + 0.5;
      for (const q of this.deepWater) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && this.nf[a] < q.y - 0.6) return q.y;
      return -Infinity;
    }
    navFloor(x, z, y) { const i = this.navIdx(x, z, y); return i < 0 ? -Infinity : this.nf[i]; }
    // a drop from a down to b that a body can't take: it leaves a at a's height, and what is over b (the slab of an upper floor) stands
    // there at head height, a wall to it. The routes took the height change alone: off the upper steps of a stair that runs beside an upper
    // floor they sent foes sideways into the slab's edge, and one that had stepped onto the slab was turned back and forth on its rim
    // (c1, c2: the two cells beside a diagonal drop; it goes by their corner, so the higher of their floors may be underfoot there)
    dropBarred(a, b, c1, c2) {
      if (!this.nc) return false;
      let f = this.nf[a]; if (this.nf[b] - f >= -0.8) return false;
      if (c1 >= 0 && this.nf[c1] > f) f = this.nf[c1];
      if (c2 >= 0 && this.nf[c2] > f) f = this.nf[c2];
      return this.nc[b] < f + 1.9;
    }
    // (x, y, z) stands on the rim of something that ends part-way into its cell (the edge of an upper floor's slab beside a stair): the
    // cell's centre, and so the grid, holds only the surface far below, and that surface's route turned a foe on the rim back and forth.
    // The way off the rim is to the cell's centre: sets out to it. null where the grid holds what it stands on, or the centre has a
    // floor at this height too (something the grid leaves out), or can't be stood in, or is under deep water (a foe risen up the water is
    // climbing out onto what it is beside, canStep: turned back to the centre it sank, rose and was turned back again, for good)
    rimDir(x, z, y, out) {
      if (this.L === 1) return null;
      const i = this.navIdx(x, z, y); if (i < 0 || this.nb[i] || y - this.nf[i] <= 0.8) return null;
      if (this.deepWater && this.deepTop(i) > -Infinity) return null;
      const ic = i % this.N, cx = ic % this.Wn - this.xo + 0.5, cz = ((ic / this.Wn) | 0) - this.zo + 0.5;
      const q = this._rimQ || (this._rimQ = []); q.length = 0; this.query(cx - 0.01, y - 0.6, cz - 0.01, cx + 0.01, y + 0.1, cz + 0.01, q);
      const n = q.length; q.length = 0; if (n) return null;
      out.x = cx - x; out.z = cz - z; const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return out;
    }
    canStep(a, b) { // a->b walkable (for monsters)
      if (this.nb[a] || this.nb[b]) return false;
      const d = this.nf[b] - this.nf[a];
      if (d > 0.8 && this.deepWater && this.nf[b] <= this.deepTop(a) + 0.9) return true; // (out of deep water: rising up it, onto what stands no more than 0.9 m over its surface)
      return d <= 0.8 && d >= (this.L > 1 ? -2.6 : -6.5) && (this.L === 1 || this.land(a, b % this.N) === b); // storeys: no leaping off a slab edge (stairs and steps only)
    }
    // flood reachable set (forward edges) for validation
    reach(fromIdx) {
      const W = this.Wn, D = this.Dn, N = this.N;
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
      const W = this.Wn, D = this.Dn, N = this.N, L = this.L || 1;
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
    // ---- an ally's own walking field (stacked-storey fields): distances to (tx, tz, ty), settled a little past the ally's own cell ----
    walkField(tx, tz, ty, fx, fz, fy) {
      if (!this.nadj) return false;
      const W = this.Wn, N = this.N, L = this.L;
      let t = this.navIdx(tx, tz, ty); if (t < 0) return false;
      if (this.nb[t]) { let best = -1, bd = 1e9; for (let r = 1; r < 4 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const i = this.navIdx(tx + dx, tz + dz, ty); if (i >= 0 && !this.nb[i]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } } if (best < 0) return false; t = best; }
      const src = this.navIdx(fx, fz, fy);
      if (!this.ndistM) this.ndistM = new Float32Array(N * L);
      const dist = this.ndistM; dist.fill(Infinity);
      const heap = this.heap, hk = this.hkey; let hn = 0;
      const push = (i, k) => { let n = hn++; heap[n] = i; hk[n] = k; while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= hk[n]) break; const ti = heap[p], tk = hk[p]; heap[p] = heap[n]; hk[p] = hk[n]; heap[n] = ti; hk[n] = tk; n = p; } };
      const pop = () => { const r = heap[0]; hn--; heap[0] = heap[hn]; hk[0] = hk[hn]; let n = 0; for (;;) { const l = n * 2 + 1, rr = l + 1; let m = n; if (l < hn && hk[l] < hk[m]) m = l; if (rr < hn && hk[rr] < hk[m]) m = rr; if (m === n) break; const ti = heap[m], tk = hk[m]; heap[m] = heap[n]; hk[m] = hk[n]; heap[n] = ti; hk[n] = tk; n = m; } return r; };
      const nb = this.nb, adj = this.nadj, rs = this.rs, ra = this.ra, rd = this.rd, pen = this.npen;
      dist[t] = 0; push(t, 0);
      let pops = 0, stopAt = Infinity;
      while (hn > 0 && pops++ < N * L * 3) {
        const kTop = hk[0], b = pop();
        if (kTop > dist[b] || nb[b]) continue;
        if (kTop > stopAt) break;
        if (b === src && stopAt === Infinity) stopAt = kTop + 10;
        for (let e = rs[b], e1 = rs[b + 1]; e < e1; e++) {
          const a = ra[e], d = rd[e];
          if (nb[a]) continue;
          if (DIAG[d]) { const c1 = adj[a * 8 + DXI[d]], c2 = adj[a * 8 + DZI[d]]; if (c1 < 0 || c2 < 0 || nb[c1] || nb[c2]) continue; }
          const nd = dist[b] + (DIAG[d] ? 1.414 : 1) + pen[a];
          if (nd < dist[a]) { dist[a] = nd; push(a, nd); }
        }
      }
      return src >= 0 && dist[src] < Infinity;
    }
    // (x, y, z) is in a cell the routes leave out because something stands in part of it (half a stair's width beside a wall, the foot of
    // a pillar): sets out towards the cell of the route beside it that is nearest the target. flowDir has no heading there, and a foe then
    // went straight at its target - into that wall, where it stayed. null where the cell is open, or nothing beside it is on a route
    blockedDir(x, z, y, out) {
      const i = this.navIdx(x, z, y); if (i < 0 || !this.nb[i]) return null;
      const W = this.Wn, nd = this.ndist, ic = i % this.N, ix = ic % W, iz = (ic / W) | 0, lo = this.L > 1 ? -2.6 : -6.5;
      let best = Infinity, bd = -1;
      for (let d = 0; d < 8; d++) {
        const dx = DIRS[d][0], dz = DIRS[d][1], ax = ix + dx, az = iz + dz; if (ax < 0 || az < 0 || ax >= W || az >= this.Dn) continue;
        const a = this.land(i, az * W + ax); if (a < 0 || this.nb[a] || !(nd[a] < best)) continue;
        const dh = this.nf[a] - this.nf[i]; if (dh > 0.8 || dh < lo || this.dropBarred(i, a)) continue;
        if (dx && dz) { const c1 = this.land(i, az * W + ix), c2 = this.land(i, iz * W + ax); if (c1 < 0 || c2 < 0 || this.nb[c1] || this.nb[c2]) continue; } // (not round a corner)
        best = nd[a]; bd = d;
      }
      if (bd < 0) return null;
      out.x = ix - this.xo + DIRS[bd][0] + 0.5 - x; out.z = iz - this.zo + DIRS[bd][1] + 0.5 - z;
      const l = Math.hypot(out.x, out.z) || 1; out.x /= l; out.z /= l;
      return out;
    }
    // direction toward target following the flow field (null if unreachable)
    flowDir(x, z, out, y, field) {
      const nd = field || this.ndist;
      const W = this.Wn, N = this.N;
      const i = this.navIdx(x, z, y);
      if (i < 0 || nd[i] === Infinity) return null;
      const ic = i % N, ix = ic % W, iz = (ic / W) | 0;
      let best = nd[i], bx = 0, bz = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const ax = ix + dx, az = iz + dz;
        if (ax < 0 || az < 0 || ax >= W || az >= this.Dn) continue;
        const a = this.land(i, az * W + ax);
        if (a < 0) continue;
        let c1 = -1, c2 = -1;
        if (dx && dz) { c1 = this.land(i, az * W + ix); c2 = this.land(i, iz * W + ax); if (c1 < 0 || c2 < 0 || this.nb[c1] || this.nb[c2] || !this.canStep(i, c1) || !this.canStep(i, c2) || this.dropBarred(i, c1) || this.dropBarred(i, c2)) continue; }
        if (!this.canStep(i, a) || this.dropBarred(i, a, c1, c2)) continue; // never steer into a cell we can't actually walk into
        if (nd[a] < best) { best = nd[a]; bx = dx; bz = dz; }
      }
      if (!bx && !bz) return null;
      // aim at next cell center (smooths movement)
      out.x = ix - this.xo + bx + 0.5 - x; out.z = iz - this.zo + bz + 0.5 - z;
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
      return b >= 0 && !this.nhz[b] && this.nf[b] >= this.nf[a] - 2.6;
    }
    // over the void? (nothing to land on above the kill plane: a chasm, the gaps between the sky islands, the river of molten iron)
    voidBelow(x, y, z) { return this.floorBelow(x, y + 0.5, z) < this.killY; }
    // open void at (x, z) for something standing at y: nothing at all in the column from the kill plane up to body height
    // (no floor to stand on, and no wall either: a wall with no floor under it is not a drop, it just stops you)
    openVoid(x, y, z) { return !this.query(x - 0.01, this.killY, z - 0.01, x + 0.01, y + 1.6, z + 0.01).length; }
    // single-storey areas: may a walker at p step on to (nx, nz) without walking off into the void? (one already in the air out over
    // it, thrown there, may move as it likes: it is falling anyway. One still standing with its middle a little past the edge may not.)
    edgeSafe(p, nx, nz, airborne) {
      const b = this.navIdx(nx, nz);
      if (b >= 0 && !this.nearVoid(b)) return true; // (far from any void: nothing to check)
      if (!this.openVoid(nx, p.y, nz)) return true;
      return !!airborne && this.openVoid(p.x, p.y, p.z);
    }
    // is nav cell i within 2 m of the void (at ground level)? Worked out once per area. Near it the ground under each step is looked up
    // for real: the nav's 1 m cells are too coarse for it (a bridge's edge cuts a cell in two and its railing reads as floor; over a pit
    // under a roof the nav's "floor" is the roof's top).
    nearVoid(i) {
      if (!this._vn) {
        const W = this.Wn, D = this.Dn, v = new Uint8Array(W * D), m = new Uint8Array(W * D);
        for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (this.openVoid(x - this.xo + 0.5, 0.2, z - this.zo + 0.5)) v[z * W + x] = 1;
        for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
          if (!v[z * W + x]) continue;
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < W && zz < D) m[zz * W + xx] = 1; }
        }
        this._vn = m;
      }
      return this._vn[i % this.N] === 1;
    }
    // the nearest whole patch of ground to (x, y, z) a body can lie on and you can walk to (where a foe that fell into the void is
    // laid out), or null. Prefers ground at about the same height.
    nearestGround(x, y, z, maxR) {
      const R = maxR || 24, W = this.Wn, N = this.N, L = this.L || 1;
      const cx = Math.floor(x) + this.xo, cz = Math.floor(z) + this.zo;
      let best = null, bs = Infinity;
      for (const strict of [true, false]) {
        for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          const ix = cx + dx, iz = cz + dz; if (ix < 1 || iz < 1 || ix >= W - 1 || iz >= this.Dn - 1) continue;
          for (let k = 0; k < L; k++) {
            const n = k * N + iz * W + ix, f = this.nf[n];
            if (f === -Infinity) break;
            if (this.nb[n] || f < this.killY + 2 || f > y + 4) continue; // (not on a roof above a pit either)
            if (strict && (this.npen[n] > 0.36 || (this.reachMask && !this.reachMask[n]))) continue;
            const px = ix - this.xo + 0.5, pz = iz - this.zo + 0.5;
            const s = Math.hypot(px - x, pz - z) + Math.max(0, Math.abs(f - y) - 1) * 0.6;
            if (s >= bs || this.voidBelow(px, f + 0.2, pz)) continue;
            bs = s; best = new THREE.Vector3(px, f, pz);
          }
        }
        if (best) return best;
      }
      return null;
    }
    randomOpenCell(rng, filter) {
      for (let k = 0; k < 400; k++) {
        const x = Math.floor(rng.next() * this.Wn), z = Math.floor(rng.next() * this.Dn);
        const i = (this.L > 1 ? Math.floor(rng.next() * this.L) * this.N : 0) + z * this.Wn + x;
        if (this.nb[i] || this.nf[i] === -Infinity) continue;
        if (this.npen[i] > 0.4) continue;
        if (filter && !filter(x - this.xo + 0.5, z - this.zo + 0.5, i)) continue;
        return { x: x - this.xo + 0.5, y: this.nf[i], z: z - this.zo + 0.5, i };
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
      this.mergeStatic();
      this.batch.build(this.mats, this.group, quality !== 'low');
      scene.add(this.group);
    }
    // Draw calls: the props, trees, rocks ... the generators add as single meshes are merged, per material, into one mesh each
    // (same geometry, material, position and shadows, so they look the same; ~600 draw calls an area become a few dozen).
    // Left alone: anything the world keeps a reference to (doors, chests, destructibles, animated things, light fixtures ...)
    // and everything under it, transparent / skinned / instanced meshes, and meshes with children or their own userData.
    // A floating islet bobs as a whole, so its contents are merged inside it.
    mergeStatic() {
      const keep = new Set(), seen = new Set();
      const scan = (v, d) => {
        if (!v || typeof v !== 'object' || seen.has(v)) return;
        seen.add(v);
        if (v.isObject3D) { keep.add(v); return; }
        if (d >= 4 || v.isMaterial || v.isTexture || v.isBufferGeometry || v.isBufferAttribute || v.isVector3 || v.isColor || ArrayBuffer.isView(v)) return;
        if (v instanceof Map || v instanceof Set) { for (const x of v.values()) scan(x, d + 1); return; }
        if (Array.isArray(v)) { if (v.length && (typeof v[0] !== 'object' || v[0] === null)) return; for (const x of v) scan(x, d + 1); return; }
        for (const k in v) scan(v[k], d + 1);
      };
      for (const k in this) if (k !== 'group' && k !== 'mats' && k !== 'batch') scan(this[k], 0);
      // things that only ever move, shake or vanish as a whole: their insides are merged within them (a chest's lid stays its own)
      const units = [this.group];
      const unit = (o) => { if (o && o.isObject3D && o.children.length && !units.includes(o)) units.push(o); };
      for (const a of this.animated) if (a.kind === 'islet') unit(a.m);
      for (const d of this.destructibles) unit(d.mesh);
      for (const ex of this.exits || []) unit(ex.portcullis);
      for (const it of this.interactables) if (it.type === 'chest') unit(it.mesh);
      if (this.bossGate) unit(this.bossGate.pc);
      this.group.updateMatrixWorld(true);
      const plainBefore = THREE.Object3D.prototype.onBeforeRender;
      const OK_ATTR = { position: 1, normal: 1, uv: 1, uv1: 1, uv2: 1, color: 1 };
      const sig = (g) => { const k = Object.keys(g.attributes).sort(); for (const n of k) if (!OK_ATTR[n]) return null; return k.map((n) => n + g.attributes[n].itemSize).join(','); };
      const mergeable = (c) => {
        const g = c.geometry, m = c.material;
        if (c.isInstancedMesh || c.isSkinnedMesh || !g || !g.isBufferGeometry || !m || Array.isArray(m)) return null;
        if (m.transparent || m.opacity < 1 || c.children.length || c.renderOrder || !c.frustumCulled || c.onBeforeRender !== plainBefore || c.layers.mask !== 1) return null;
        if (Object.keys(c.userData).length || !g.attributes.position || !g.attributes.normal || g.morphAttributes.position || g.drawRange.start || g.drawRange.count !== Infinity) return null;
        const s = sig(g); if (!s) return null;
        return m.uuid + '|' + s + '|' + (c.castShadow ? 1 : 0) + (c.receiveShadow ? 1 : 0);
      };
      const inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
      for (const root of units) {
        const bins = new Map(), emptied = new Set();
        const walk = (o) => {
          for (const c of o.children) {
            if (keep.has(c) || !c.visible) continue;
            if (c.isMesh) { const k = mergeable(c); if (k) { (bins.get(k) || bins.set(k, []).get(k)).push(c); continue; } }
            else if (c.type !== 'Group' && c.type !== 'Object3D') continue; // lights, sprites, points ...
            if (c.children.length) walk(c);
          }
        };
        walk(root);
        inv.copy(root.matrixWorld).invert();
        for (const list of bins.values()) {
          if (list.length < 2) continue;
          let nv = 0, ni = 0;
          for (const c of list) { const g = c.geometry; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
          const g0 = list[0].geometry, names = Object.keys(g0.attributes), out = {};
          for (const n of names) out[n] = new Float32Array(nv * g0.attributes[n].itemSize);
          const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
          let vo = 0, io = 0;
          for (const c of list) {
            const g = c.geometry, cnt = g.attributes.position.count;
            rel.multiplyMatrices(inv, c.matrixWorld); nm.getNormalMatrix(rel);
            for (const n of names) {
              const a = g.attributes[n], sz = a.itemSize, dst = out[n];
              for (let i = 0; i < cnt; i++) {
                const o = (vo + i) * sz;
                if (n === 'position') { v.fromBufferAttribute(a, i).applyMatrix4(rel); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; }
                else if (n === 'normal') { v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize(); dst[o] = v.x; dst[o + 1] = v.y; dst[o + 2] = v.z; }
                else { dst[o] = a.getX(i); if (sz > 1) dst[o + 1] = a.getY(i); if (sz > 2) dst[o + 2] = a.getZ(i); if (sz > 3) dst[o + 3] = a.getW(i); }
              }
            }
            const flip = rel.determinant() < 0; // a mirrored mesh: keep its faces facing out
            const n = g.index ? g.index.count : cnt;
            for (let t = 0; t < n; t += 3) {
              const a = g.index ? g.index.getX(t) : t, b = g.index ? g.index.getX(t + 1) : t + 1, d = g.index ? g.index.getX(t + 2) : t + 2;
              idx[io++] = vo + a; idx[io++] = vo + (flip ? d : b); idx[io++] = vo + (flip ? b : d);
            }
            vo += cnt;
            emptied.add(c.parent); c.parent.remove(c);
          }
          const geo = new THREE.BufferGeometry();
          for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(out[n], g0.attributes[n].itemSize));
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
          geo.computeBoundingSphere(); geo.computeBoundingBox();
          const m = new THREE.Mesh(geo, list[0].material);
          m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
          m.matrixAutoUpdate = false; root.add(m); m.updateMatrixWorld(true);
        }
        // the groups the merge emptied go too (fewer objects to walk every frame)
        for (let o of emptied) while (o && o !== root && !keep.has(o) && !o.children.length && (o.type === 'Group' || o.type === 'Object3D') && o.parent) { const p = o.parent; p.remove(o); o = p; }
      }
    }
    dispose(scene) {
      scene.remove(this.group);
      this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    }
  }
  World.SKY_Y = 500; // the top of a skyCap: high over anything a hook or a jump reaches
  G.World = World;

  // ---------------- dynamic torch lights (constant light count) ----------------
  const LightPool = (G.LightPool = {
    lights: [], N: 8, active: 8, t: 0,
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
        // (a flame that is only a flame - the candles of a chandelier beside the two that light - takes no place among the lights that are lit)
        const S = world.lightSources.filter((s) => !s.noLight && s.intensity > 0);
        // stacked storeys: a light one floor up or down is behind a slab, so the ones on your own storey come first
        const vk = world.strata ? 9 : 1;
        const arr = S.map((s) => { const dy = s.pos.y - camPos.y; return [s, (s.pos.distanceToSquared(camPos) + dy * dy * (vk - 1)) / (s.prio || 1)]; }).sort((a, b) => a[1] - b[1]);
        const act = Math.min(this.N, this.active || this.N);
        for (let i = 0; i < this.N; i++) {
          const l = this.lights[i];
          l.visible = i < act; // the lights beyond the quality setting are out of the scene's light count altogether
          const s = i < act && arr[i] ? arr[i][0] : null;
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
