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
    // (a link of a hung chain - by the hundred in a hall: 6 about its bar, 16 about the link; seven to eleven centimetres across, so
    // the facets are under two millimetres)
    PG.link = new THREE.TorusGeometry(1, 0.12, 6, 16);
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
    // (a broken stone: the same twelve flat faces, its corners shared within a face - drawn the same, with half the vertices)
    if (G.GFX && G.GFX.Geo && G.GFX.Geo.weld) {
      // (its three triangles to a face were each given their own normal, equal but for the last bits: one normal to the face, then shared)
      const dd = PG.dode.clone(), dn = dd.attributes.normal;
      for (let f = 0; f + 9 <= dn.count; f += 9) { let x = 0, y = 0, z = 0; for (let i = f; i < f + 9; i++) { x += dn.getX(i); y += dn.getY(i); z += dn.getZ(i); } const k = 1 / Math.hypot(x, y, z); for (let i = f; i < f + 9; i++) dn.setXYZ(i, x * k, y * k, z * k); }
      PG.dodeW = G.GFX.Geo.weld(dd); if (PG.boneEnds) PG.boneEnds = G.GFX.Geo.weld(PG.boneEnds); }   // (and the stacked bone ends, drawn only as instances)
    for (const k in PG) PG[k].userData.shared = true;
    // (the surfaces of what lies on the ground, P.dress: baked by gfx.js with its own, their programs made at boot with the rest)
    if (G.GFX && G.GFX.EXSRC) Object.assign(G.GFX.EXSRC, { dsoil: [1024, 0.55, SRC_SOIL], dsnow: [512, 0.9, SRC_SNOW], ddecal: [1024, 1.0, SRC_DECAL] });
  };
  P.PG = PG;
  // Many of one thing (the skulls of an ossuary, the ends of its bones): each kind is drawn as instances of one shape, by stretches of the
  // world some 24 m across (what is out of sight is then left out), instead of being written vertex by vertex into the world's own mesh -
  // which took a second for a nave of them. They cast no shadow (they lie in niches).
  P.inst = function (w, mk, geo, m4, tint) {
    if (w._atY) m4 = new THREE.Matrix4().makeTranslation(0, w._atY, 0).multiply(m4);   // (placed inside a raised stretch, terrain.js T.at: the raise goes into its own matrix)
    const I = w._inst || (w._inst = new Map()), e = m4.elements, key = mk + geo.uuid + '|' + Math.floor(e[12] / 24) + '|' + Math.floor(e[14] / 24);
    let q = I.get(key); if (!q) I.set(key, q = { mk, geo, m: [], c: [] });
    q.m.push(m4); q.c.push(tint || null);
    if (!w._instQ) {
      w._instQ = true;
      Array.prototype.push.call(w.deferred, (grp) => {   // (into the area's own group, whatever raised stretch is being built just now)
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
  // (the drawn-only flat boxes laid over the ground - a floor of boards, a slab - a metre and more across: kept once per world)
  const overAt = (w, x, z, y) => {
    let L = w._flatOver;
    if (!L) { L = w._flatOver = []; for (const b of w.visBoxes || []) if (b[4] - b[1] <= 0.16 && b[3] - b[0] >= 0.8 && b[5] - b[2] >= 0.8) L.push(b); }
    for (const b of L) if (x > b[0] && x < b[3] && z > b[2] && z < b[5] && b[4] > y - 0.02 && b[4] < y + 0.16) return true;
    return false;
  };
  P.overAt = overAt;
  // grass: a tuft at (x, y, z) and n more about it within r (gy(x, z): the ground's height there, where it is not flat)
  // (the grass's own material, kept with the place's: the waving of the tufts as it was, the normal no longer turned for a back face)
  const grassMat = (w) => {
    const M = w.mats; if (!M.tuft) return null;
    if (!M.tuftUp) {
      const m = M.tuft.clone(), base = M.tuft.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { if (base) base.call(M.tuft, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );'); };
      m.customProgramCacheKey = () => 'tuftUp';
      Object.defineProperty(M, 'tuftUp', { value: m, enumerable: false, configurable: true });   // (not one of the place's own: kept out of any listing of them)
    }
    return M.tuftUp;
  };
  // (a shape with its normals leaning up: three of up to one of its own)
  const UPG = new Map();
  const upGeo = (g) => {
    let u = UPG.get(g.uuid); if (u) return u;
    u = g.clone(); const n = u.attributes.normal;
    if (n) for (let i = 0; i < n.count; i++) { let x = n.getX(i) * 0.3, y = Math.abs(n.getY(i)) * 0.3 + 0.95, z = n.getZ(i) * 0.3; const l = Math.hypot(x, y, z); n.setXYZ(i, x / l, y / l, z / l); }
    u.userData.shared = true; UPG.set(g.uuid, u); return u;
  };
  P.grassMat = grassMat; P.upGeo = upGeo;
  P.tuft = function (w, x, y, z, s, tint, n, r, gy) {
    if (!(G.GFX && G.GFX.propGeo && G.GFX.propGeo('tuft'))) return false;
    n = n === undefined ? 6 : n; r = r || 1.3;
    for (let i = 0; i <= n; i++) {
      const a = hsh(x, z, i) * 6.283, d = i ? (0.25 + hsh(x, z, i + 20) * 0.75) * r : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, k = (s || 1) * (0.55 + hsh(px, pz, 3) * 0.6), c = 0.8 + hsh(px, pz, 5) * 0.4;
      const tg = G.GFX.propGeo('tuft')[0], gm = grassMat(w), tn = tint ? [tint[0] * c, tint[1] * c, tint[2] * c] : [c, c, c * 0.95];
      if (gm) P.inst(w, 'tuftUp', upGeo(tg.g), M(px, gy && i ? gy(px, pz) : y, pz, k * 0.5, k * 0.44, k * 0.5, 0, hsh(px, pz, 7) * 6.283, 0), tg.tint ? [tn[0] * tg.tint[0], tn[1] * tg.tint[1], tn[2] * tg.tint[2]] : tn);
      else put(w, 'tuft', px, gy && i ? gy(px, pz) : y, pz, hsh(px, pz, 7) * 6.283, k * 0.5, { sy: k * 0.44, inst: true, tint: tn });
    }
    return true;
  };

  // grass over the open ground of a field of turf (world.js calls it once everything stands): a grid of places, each moved a little
  // by where it is; thick in drifts and thin between them; none on a path, a floor of boards, under a wall or beside water
  P.meadow = function (w) {
    if (!w._dressed) { try { P.dress(w); } catch (e) { DR.err = String((e && e.stack) || e); } }   // (what lies on the ground, every field: P.dress below)
    const B = w.mats && w.mats.biome; if (!B || B.floorTex !== 'grass' || w._meadow) return; w._meadow = true;
    if (!(G.GFX && G.GFX.propGeo && G.GFX.propGeo('tuft'))) return;
    const x0 = (w.xo || 0) + 1.5, x1 = (w.xo || 0) + (w.Wn || w.W) - 1.5, z0 = (w.zo || 0) + 1.5, z1 = (w.zo || 0) + (w.Dn || w.D) - 1.5, step = 1.25;
    const cells = (x1 - x0) * (z1 - z0) / (step * step), thin = Math.min(1, 4200 / Math.max(1, cells));   // (a very large field: fewer to the metre)
    const gy = w.groundTop ? (x, z) => w.groundTop(x, z) : () => 0;
    // (grass grows only where there is ground at that height under it - not over a pit, not off the edge of a terrace - and nothing
    // standing on or laid over that ground)
    const blocked = (x, z, y) => {
      const a = w.hash.get(w._hkey(Math.floor(x / 4), Math.floor(z / 4))); if (!a) return true;   // (world.js keeps its colliders by cells of 4 m)
      let ground = false;
      for (const c of a) {
        if (c.alive === false || x < c.x0 - 0.15 || x > c.x1 + 0.15 || z < c.z0 - 0.15 || z > c.z1 + 0.15) continue;
        if (c.y1 > y + 0.03 && c.y0 < y + 1.2) return true;
        if (Math.abs(c.y1 - y) <= 0.03 && x > c.x0 + 0.2 && x < c.x1 - 0.2 && z > c.z0 + 0.2 && z < c.z1 - 0.2) ground = true;
      }
      return !ground;
    };
    const tint = null;
    // (kept clear: where the pedlar's stands and the basin will be set down, and round whatever can be used - a chest, an altar, a ware)
    const keep = []; for (const q of w.miniSlots || []) keep.push([q.x, q.z, 2.0]); if (w.miniHeal) keep.push([w.miniHeal.x, w.miniHeal.z, 2.2]);
    for (const it of w.interactables || []) if (it && it.pos) keep.push([it.pos.x, it.pos.z, 1.4]);
    for (const q of w.shopSlots || []) keep.push([q.x, q.z, 1.8]);
    const clearOf = (x, z) => { for (const k of keep) { const dx = x - k[0], dz = z - k[1]; if (dx * dx + dz * dz < k[2] * k[2]) return false; } return true; };
    // (trodden thin on the ways from the way in to the gates; thick at the foot of a wall, where P.dress found one; a little thinner out
    // in the open, where the weeds at the walls are paid for)
    const near = w._dressNear, path = w._dressPath, by = (x, z) => {
      const i = path && w.navIdx ? w.navIdx(x, z) : -1; if (i >= 0 && path[i % w.N]) return 0.35;
      return near && near.has(nearKey(x, z, gy(x, z))) ? 1.35 : 0.85;
    };
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      const drift = hsh(Math.floor(x / 6), Math.floor(z / 6), 11) * 0.6 + hsh(Math.floor(x / 2.5), Math.floor(z / 2.5), 12) * 0.4;
      if (hsh(x, z, 13) > (0.25 + drift * 0.75) * thin * by(x, z)) continue;
      const px = x + (hsh(x, z, 14) - 0.5) * step, pz = z + (hsh(x, z, 15) - 0.5) * step, y = gy(px, pz);
      if (!(y > -50) || !clearOf(px, pz) || blocked(px, pz, y) || overAt(w, px, pz, y)) continue;
      P.tuft(w, px, y, pz, 0.75 + drift * 0.55, tint, drift > 0.55 ? 2 : 1, 0.6, w.groundTop ? gy : null);
    }
  };

  // ==================================================================================================================================
  // ---------- the ground lived in (P.dress) ----------
  // No floor stays clean where nobody sweeps it. Against every wall lies what came down it and what wind and water carried there - earth
  // and roots out of doors, dust, grit and fallen mortar in a crypt, broken rock in a mine, drifted snow in the frozen halls, soot and
  // iron in the foundries, mud and weed in the drowned ones - thickest in the corners and broken off here and there; bits of things lie
  // about, most along the walls and round the feet of things; the floor itself is stained, cracked, chipped, patched with moss and
  // standing water. All of it is found from the colliders once the area stands (world.js finalize, by way of P.meadow): the foot of every
  // face that is drawn, where a floor meets it with the air free above. Where a thing lies and what it is comes from where it is (hsh and
  // value noise) - never from the level's dice - so both players of a co-op run see the same. Nothing of it has a collider, nothing lies
  // in the middle of a way, before a thing that is used, or higher than a hand; on low quality there is none of it (finalize).
  const DR = { mats: {}, G: null, err: null };
  // the surfaces, baked on the GPU with the world's own (gfx.js X.tex: added to its list before the renderer starts, so their programs
  // are made with the rest at boot). [size, normal strength, GLSL]. The 'rough' each writes is read as alpha where it is laid as a film
  // or a mark (the occlusion / roughness texture's green is what three.js reads as alpha)
  const SRC_SOIL = `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  // a metre of what has come down at the foot of a wall: fines (dust, sand, crumbled mortar) and grains of grit from a couple of millimetres
  // to a centimetre - many small, few large - each grain a little dome (lit on one side, dark in the gap under it), its shade within a few
  // per cent of the next; over it all a slow mottling of damp and colour. No flat cells: what is seen from a step away is a rough surface.
  float big = fbm(uv, 2., 1.), mid = fbm(uv, 6., 2.), fine = fbm(uv, 24., 3.), dust = fbm3(uv, 300., 4.);
  vec3 v1 = voro(uv, 90., 5.), v2 = voro(uv + .31, 190., 6.), v3 = voro(uv + .57, 380., 7.);
  float r1 = .3 + .14 * hash12(vec2(v1.z, 1.)), r2 = .34 + .12 * hash12(vec2(v2.z, 2.)), r3 = .42;
  float g1 = step(.86, v1.z) * clamp(1. - v1.x / r1, 0., 1.), g2 = step(.66, v2.z) * clamp(1. - v2.x / r2, 0., 1.), g3 = step(.36, v3.z) * clamp(1. - v3.x / r3, 0., 1.);
  float d1 = sqrt(g1) * .5, d2 = sqrt(g2) * .28, d3 = sqrt(g3) * .13;
  float top = max(d1, max(d2, d3));
  float id = (d1 >= d2 && d1 >= d3 && g1 > 0.) ? v1.z : (d2 >= d3 && g2 > 0.) ? v2.z : v3.z;
  float isG = smoothstep(0., .04, top);
  h = .35 + (big - .5) * .12 + (mid - .5) * .06 + (fine - .5) * .03 + (dust - .5) * .03 + top;
  vec3 base = vec3(.5, .475, .44) * (.86 + (mid - .5) * .26 + (big - .5) * .2);
  float tone = 1. + (hash12(vec2(id * 37.3, 4.)) - .5) * .16;
  vec3 g = base * tone * 1.07 * mix(vec3(1.), vec3(1.025, .995, .955), hash12(vec2(id * 11.1, 9.)));
  vec3 c = mix(base * (.9 + (dust - .5) * .18), g, isG);
  float damp = smoothstep(.55, .76, fbm(uv, 3., 11.));
  c *= 1. - damp * .2;
  col = S(c);
  rough = clamp(.22 + smoothstep(.3, .72, fbm(uv, 5., 10.)) * .62 + isG * .18 + (dust - .5) * .3, 0., 1.);
  metal = 0.;
}`;
  const SRC_SNOW = `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  // old snow blown against a wall: soft swells, wind ripples, a crust of fine crystals (the glints: the normal broken at the finest
  // scale), a little grit; not white paint - a white of about three quarters, greyer where it has lain longest
  float big = fbm(uv, 2., 1.), mid = fbm(uv, 9., 2.), fine = fbm(uv, 40., 3.), grain = vnoise(uv * 220., 220., 4.), crys = vnoise(uv * 640., 640., 8.);
  float wv = fbm3(uv, 3., 5.);
  float rip = sin((uv.x * 7. + uv.y * 2. + wv * 1.5) * 6.2831853) * .5 + .5;
  h = .5 + (big - .5) * .25 + (mid - .5) * .1 + rip * .03 * (.4 + big) + (fine - .5) * .03 + (grain - .5) * .012 + (crys - .5) * .01;
  vec3 c = vec3(.86, .88, .91) * (.93 + mid * .08 + (fine - .5) * .05) * (1. - smoothstep(.5, .8, big) * .08);
  vec3 v = voro(uv, 30., 6.); float grit = smoothstep(.12, .04, v.x) * step(.88, v.z);
  c = mix(c, vec3(.42, .4, .38), grit * .6);
  col = S(c);
  rough = clamp(.3 + smoothstep(.35, .7, fbm(uv, 5., 9.)) * .6 + (fine - .5) * .2, 0., 1.);
  metal = 0.;
}`;
  // sixteen marks on the floor, four by four: 0 a stain, 1 the rings a pool left drying, 2 a web of cracks, 3 one crack and a branch,
  // 4 moss, 5 standing water (and the wet round it), 6 old spatter, 7 soot, 8 rust, 9 grime, 10 rime, 11 a piece of paving gone,
  // 12 the pits where drips fall, 13 slime, 14 rotted leaves, 15 the damp coming out from the foot of a wall (the wall at the top)
  const SRC_DECAL = `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 cg = floor(uv * 4.), lp = fract(uv * 4.); float k = cg.x + cg.y * 4.;
  vec2 p = lp * 2. - 1.; float r = length(p), s = k * .173;
  float n1 = fbm(lp + s, 3., 1. + k), n2 = fbm(lp + s, 9., 2. + k), n3 = fbm(lp + s, 27., 3. + k);
  float edge = smoothstep(1., .86, max(abs(p.x), abs(p.y)));
  float a = 0.; vec3 c = vec3(.1); h = .5;
  if (k < .5) {
    float rw = r + (n1 - .5) * .7 + (n2 - .5) * .25;
    a = smoothstep(.78, .22, rw) * (.55 + .45 * n3); c = vec3(.16, .14, .12) * (.8 + .4 * n2); h = .5 - a * .02;
  } else if (k < 1.5) {
    float rw = r + (n1 - .5) * .55 + (n3 - .5) * .08, ring = 0.;
    for (int i = 0; i < 3; i++) { float R = .72 - float(i) * .19 + (n2 - .5) * .08, wd = .025 + .03 * n3; ring = max(ring, smoothstep(wd, .0, abs(rw - R)) * (1. - float(i) * .3)); }
    ring *= smoothstep(.3, .6, fbm(lp + s, 7., 21.));
    float inner = smoothstep(.8, .25, rw) * (.2 + .15 * n2);
    a = max(ring * .32, inner) * (.75 + .25 * n3); c = mix(vec3(.24, .22, .2), vec3(.56, .54, .5), ring); h = .5 + ring * .006;
  } else if (k < 2.5) {
    vec2 q = lp + (vec2(fbm3(lp + s, 3., 22.), fbm3(lp + s, 3., 23.)) - .5) * .35;
    float r1 = 1. - abs(fbm(q, 3., 24.) * 2. - 1.), r2 = 1. - abs(fbm(q + .4, 7., 25.) * 2. - 1.);
    float wd1 = .012 + .02 * n3, wd2 = .006 + .01 * n2;
    float l1 = smoothstep(1. - wd1 * 1.6, 1. - wd1 * .4, r1), l2 = smoothstep(1. - wd2 * 1.6, 1. - wd2 * .4, r2) * smoothstep(.45, .7, n1);
    float line = max(l1, l2 * .8) * smoothstep(.3, .55, fbm(lp + s, 5., 26.) + .1);
    float mask = smoothstep(.9, .4, r + (n1 - .5) * .5);
    a = line * mask * .85 + smoothstep(.9, 1., max(r1, r2)) * mask * .08; c = vec3(.06, .055, .05); h = .5 - line * mask * .35;
  } else if (k < 3.5) {
    float yc = (vnoise(vec2(p.x * 2.2 + s * 9., 0.), 1000., 5.) - .5) * .7 + (vnoise(vec2(p.x * 7. + s * 7., 1.), 1000., 6.) - .5) * .16 + (vnoise(vec2(p.x * 23., 2.), 1000., 9.) - .5) * .04;
    float d = abs(p.y - yc), wd = (.004 + .016 * (1. - abs(p.x)) * (.4 + n2)) * (.6 + .8 * vnoise(vec2(p.x * 13., 4.), 1000., 10.));
    float line = smoothstep(wd, wd * .2, d) * smoothstep(1., .65, abs(p.x));
    float yb = yc + (p.x - .15) * .55 + (vnoise(vec2(p.x * 17., 3.), 1000., 7.) - .5) * .06, wb = .006 * smoothstep(.7, .15, p.x); float br = smoothstep(wb, wb * .2, abs(p.y - yb)) * step(.15, p.x);
    line = max(line, br);
    a = line * .82 + smoothstep(.05, .0, d) * .07 * smoothstep(1., .6, abs(p.x)); c = vec3(.05, .045, .04); h = .5 - line * .3;
  } else if (k < 4.5) {
    float m = fbm(lp + s, 6., 7.) * .6 + fbm(lp + s, 18., 8.) * .4, body = smoothstep(.85, .3, r + (n1 - .5) * .6), cl = smoothstep(.42, .62, m) * body;
    a = cl * .95; c = mix(vec3(.17, .21, .1), vec3(.28, .29, .14), n3) * (.8 + .4 * fbm(lp + s, 40., 9.)); h = .5 + cl * .15 + (fbm(lp + s, 60., 10.) - .5) * .06 * cl;
  } else if (k < 5.5) {
    float rw = r + (n1 - .5) * .45 + (n2 - .5) * .15, body = smoothstep(.74, .67, rw), damp = smoothstep(.95, .7, rw) * (1. - body);
    a = body * .72 + damp * .38; c = mix(vec3(.14, .13, .12), vec3(.035, .04, .045), body); h = .5;
  } else if (k < 6.5) {
    float rw = r * 1.25 + (n1 - .5) * .6, main = smoothstep(.6, .35, rw), spots = 0.;
    for (int i = 0; i < 9; i++) { float fi = float(i); vec2 q = vec2(hash12(vec2(fi, 6.)) - .5, hash12(vec2(fi, 9.)) - .5) * 1.5; float rr = .03 + hash12(vec2(fi, 13.)) * .07; spots = max(spots, smoothstep(rr, rr * .5, length(p - q))); }
    a = max(main, spots) * (.55 + .3 * n3); c = vec3(.13, .075, .055); h = .5 - a * .01;
  } else if (k < 7.5) {
    float ang = atan(p.y, p.x) / 6.2831853 + .5, st = fbm(vec2(ang, .37), 7., 11.), reach = .5 + st * .42;
    a = smoothstep(reach, reach * .25, r) * (.6 + .4 * n2); c = vec3(.02, .018, .016);
  } else if (k < 8.5) {
    float rw = r + (n1 - .5) * .7;
    a = smoothstep(.8, .2, rw) * smoothstep(.3, .7, n2 + .15) * .8; c = mix(vec3(.3, .14, .06), vec3(.19, .1, .05), n3);
  } else if (k < 9.5) {
    a = smoothstep(.95, .3, r + (n1 - .5) * .5) * smoothstep(.32, .75, n2) * .7; c = vec3(.08, .07, .06);
  } else if (k < 10.5) {
    float fr = ridge(lp + s, 8., 12.), body = smoothstep(.85, .3, r + (n1 - .5) * .6);
    a = body * smoothstep(.4, .8, fr * .7 + n3 * .5) * .5; c = vec3(.64, .66, .68) * (.9 + .2 * n2); h = .5 + a * .06;
  } else if (k < 11.5) {
    float ang = atan(p.y, p.x) / 6.2831853 + .5, R = .55 + (fbm(vec2(ang, .5), 5., 13.) - .5) * .5;
    float inside = smoothstep(R + .02, R - .02, r), rim = smoothstep(.07, .0, abs(r - R));
    float grit = vnoise(lp * 140., 1000., 27.); a = max(inside * .96, rim * .45); c = mix(vec3(.58, .55, .5), vec3(.3, .26, .21) * (.75 + .5 * n3) * (.85 + .3 * grit), inside); h = mix(.5, .2 + n3 * .08 + grit * .05, inside);
  } else if (k < 12.5) {
    float band = smoothstep(.45, .05, abs(p.y + (n1 - .5) * .4)) * smoothstep(.95, .6, abs(p.x));
    vec3 v = voro(lp + (n2 - .5) * .1, 13., 14.); float rp = .05 + .14 * hash12(vec2(v.z * 31., 7.)); float pit = smoothstep(rp, rp * .4, v.x) * step(.68, v.z);
    a = band * (pit * .55 + .22 * n2 * n3); c = vec3(.08, .07, .065); h = .5 - pit * band * .15;
  } else if (k < 13.5) {
    float m = fbm(lp + s, 5., 15.), body = smoothstep(.9, .35, r + (n1 - .5) * .7), st = smoothstep(.35, .65, m + (fbm(lp + s, 20., 16.) - .5) * .4);
    a = body * st * .85; c = mix(vec3(.05, .07, .03), vec3(.11, .14, .06), n3); h = .5 + a * .04;
  } else if (k < 14.5) {
    float body = smoothstep(.9, .3, r + (n1 - .5) * .6);
    float lf = smoothstep(.6, .7, fbm(lp + s, 18., 17.)) * smoothstep(.35, .6, n2);
    a = body * (.35 + lf * .45) * (.7 + .3 * n2); c = mix(vec3(.15, .1, .06), vec3(.28, .19, .09), lf * n3); h = .5 + lf * body * .05;
  } else {
    float lob = .35 + (fbm(vec2(lp.x, .5), 4., 18.) - .5) * .6 + (n2 - .5) * .2, d = 1. - lp.y;
    a = smoothstep(lob, lob * .3, d) * smoothstep(1., .72, abs(p.x)) * (.55 + .35 * n3);
    a += smoothstep(.03, .0, abs(d - lob * .85)) * .15 * smoothstep(1., .72, abs(p.x)); c = vec3(.07, .07, .065);
    edge = smoothstep(1., .86, abs(p.x)) * smoothstep(-1., -.86, p.y);
  }
  col = S(c); rough = clamp(a * edge, 0., 1.); metal = 0.;
}`;
  const DC = { blotch: 0, tide: 1, crack: 2, crack1: 3, moss: 4, puddle: 5, splat: 6, soot: 7, rust: 8, grime: 9, rime: 10, chip: 11, drips: 12, slime: 13, leafmold: 14, seep: 15 };
  // the marks: [cell, what they are drawn with (dry / damp / water), size from, to (m), tint (on the screen), alpha]
  const DS = {
    blotch: [0, 'dry', 0.6, 1.6, 0xffffff, 0.5], tide: [1, 'dry', 0.8, 1.9, 0xffffff, 0.55], crack: [2, 'dry', 0.9, 2.0, 0xffffff, 0.85], crack1: [3, 'dry', 0.8, 1.9, 0xffffff, 0.85],
    moss: [4, 'dry', 0.5, 1.4, 0xffffff, 0.9], puddle: [5, 'water', 0.8, 2.0, 0xffffff, 1], splat: [6, 'dry', 0.5, 1.0, 0xffffff, 0.5], soot: [7, 'dry', 1.0, 2.4, 0xffffff, 0.7],
    rust: [8, 'dry', 0.6, 1.5, 0xffffff, 0.6], grime: [9, 'dry', 1.6, 3.4, 0xffffff, 0.42], rime: [10, 'dry', 0.8, 2.0, 0xffffff, 0.75], chip: [11, 'dry', 0.24, 0.55, 0xffffff, 1],
    drips: [12, 'dry', 0.8, 1.5, 0xffffff, 0.7], slime: [13, 'damp', 0.8, 2.2, 0xffffff, 0.85], leafmold: [14, 'dry', 0.8, 1.8, 0xffffff, 0.8], seep: [15, 'damp', 1.2, 2.6, 0xffffff, 0.6],
    oil: [5, 'water', 0.5, 1.3, 0x4a4844, 0.75], ice: [5, 'water', 0.7, 1.7, 0xb8c0c8, 0.5],
  };
  // what lies where, by the kind of place. h: the most a heap at the wall stands (m); w0, w1: its width (and more as it rises); ins:
  // how far it is let into the wall (rock stands out of its box and back by tens of centimetres); col, col2 (on the screen, mixed by
  // noise; null: from the place's own stone); rough; tex ('soil' / 'snow'); ba: the film of dust out from it; lit: things lying along
  // a wall (per metre, at most); open: lying out on the floor (per 3 m^2); corner: more in a corner; heap: a heap of fallen stone at
  // the wall (the chance per 6 m); L: the things, by weight; dec: the chance of a mark per 4.8 m^2 of floor; D: the marks, by weight;
  // seep: damp out from a wall (per 3 m); weed: weeds at the wall's foot (per metre); vine: creepers up it (per 3 m)
  const KINDS = {
    crypt: { grit: 2.6, h: 0.11, w0: 0.16, w1: 2.4, ins: 0.07, col: null, col2: 0x4a443c, rough: 0.95, tex: 'soil', ba: 0.85, lit: 0.8, open: 0.2, corner: 5, heap: 0.12,
      L: { pebble: 30, chunk: 22, slab: 8, bone: 12, shard: 8, woodbit: 5 }, dec: 0.5, D: { grime: 30, blotch: 18, crack: 14, crack1: 10, tide: 10, chip: 9, splat: 4, moss: 3 }, seep: 0.35 },
    out: { grit: 1.2, h: 0.13, w0: 0.18, w1: 2.4, ins: 0.08, col: 0x6a5a46, col2: 0x343a26, rough: 0.97, tex: 'soil', ba: 0.5, lit: 0.9, open: 0.3, corner: 6, heap: 0.18,
      L: { pebble: 22, chunk: 14, twig: 20, leaf: 30, straw: 8, slab: 6 }, dec: 0.4, D: { puddle: 20, blotch: 22, grime: 16, moss: 12, leafmold: 18, chip: 6, crack1: 6 }, seep: 0.12, weed: 2.2, vine: 0.3, drips: 0.15 },
    mine: { grit: 3.0, h: 0.12, w0: 0.2, w1: 2.6, ins: 0.32, col: null, col2: 0x3a3028, rough: 0.96, tex: 'soil', ba: 0.5, lit: 1.2, open: 0.35, corner: 6, heap: 0.3,
      L: { pebble: 34, chunk: 34, woodbit: 12, coal: 10, iron: 4 }, dec: 0.5, D: { grime: 30, blotch: 18, puddle: 12, rust: 10, crack: 8, crack1: 8, oil: 6 }, seep: 0.3 },
    frost: { grit: 0.8, h: 0.2, w0: 0.28, w1: 2.6, ins: 0.08, col: 0xc4ccd4, col2: 0xb4bcc6, rough: 0.8, tex: 'snow', ba: 0.55, lit: 0.6, open: 0.15, corner: 4, heap: 0.06,
      L: { icechunk: 22, pebble: 15, chunk: 25, bone: 15, snowlump: 22 }, dec: 0.5, D: { rime: 40, crack1: 15, crack: 10, tide: 10, grime: 15, ice: 10 }, seep: 0.2 },
    wet: { grit: 1.6, h: 0.08, w0: 0.18, w1: 2.4, ins: 0.07, col: 0x3d3b2d, col2: 0x2b3424, rough: 0.5, tex: 'soil', ba: 0.6, lit: 0.7, open: 0.2, corner: 4, heap: 0.08,
      L: { pebble: 30, chunk: 20, woodbit: 18, shard: 12, weed: 12, bone: 8 }, dec: 0.75, D: { slime: 30, puddle: 26, blotch: 14, tide: 14, crack1: 6, grime: 10 }, seep: 0.6 },
    forge: { grit: 2.6, h: 0.08, w0: 0.16, w1: 2.4, ins: 0.07, col: 0x2c2826, col2: 0x4e3426, rough: 0.92, tex: 'soil', ba: 0.6, lit: 0.9, open: 0.3, corner: 4, heap: 0.12,
      L: { coal: 30, iron: 26, pebble: 16, chunk: 16, slag: 12 }, dec: 0.6, D: { soot: 30, rust: 18, oil: 14, grime: 22, crack: 8, crack1: 8 }, seep: 0.15 },
    clean: { grit: 1.0, h: 0.05, w0: 0.12, w1: 2.4, ins: 0.07, col: null, col2: 0x6a645a, rough: 0.95, tex: 'soil', ba: 0.4, lit: 0.35, open: 0.1, corner: 3, heap: 0.04,
      L: { pebble: 30, chunk: 25, leaf: 30, shard: 15 }, dec: 0.3, D: { tide: 25, crack1: 25, grime: 30, moss: 10, chip: 10 }, seep: 0.1 },
  };
  const kindOfPlace = (w) => {
    const b = w.biome, B = w.mats.biome;
    if (b === 'frozen') return 'frost';
    if (b === 'flooded') return 'wet';
    if (b === 'foundry' || b === 'forge') return 'forge';
    if (b === 'mine' || B.floorTex === 'earth') return 'mine';
    if (B.floorTex === 'grass') return 'out';
    if (B.marble || B.outdoor === 'sky') return 'clean';
    return 'crypt';
  };
  // what is never a wall to lie against, nor a floor (water, fire, cloth, marks laid on the floor)
  const SKIPMK = new Set(['water', 'lava', 'bluefire', 'voidglow', 'poison', 'holy', 'oil', 'glow', 'web', 'vine', 'cloth', 'cloth2', 'rug', 'dark', 'candle', 'mud', 'moss', 'ice']);
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // (a colour on the screen, as the shader works in it)
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---- the shapes of what lies about: few faces each, made once (all sit on y = 0, about one unit across; flat-faced but the pebbles)
  function dressShapes() {
    const S = {};
    const h3 = (x, y, z, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453; return v - Math.floor(v); };
    const done = (g, uvk, smooth) => {
      if (!smooth) { if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); }
      const uv = g.attributes.uv; if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvk + 0.3, uv.getY(i) * uvk + 0.2);
      g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0); g.computeBoundingSphere();
      g.userData.shared = true; return g;
    };
    // a pebble: an icosahedron out of round, normals out from its middle (so it reads as worn round)
    const peb = (k, flat) => {
      const g = new THREE.IcosahedronGeometry(1, 0), p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = 0.8 + 0.38 * h3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50), k);
        p.setXYZ(i, x * r * (1 + (k - 1) * 0.12), y * r * flat, z * r); const l = Math.hypot(x, y / flat, z) || 1; n.setXYZ(i, x / l, y / flat / l, z / l);
      }
      g.scale(0.5, 0.5, 0.5); return done(g, 0.12, true);
    };
    S.peb = [peb(1, 0.62), peb(2, 0.8)];
    {
      const g = new THREE.OctahedronGeometry(0.5, 0), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = 0.75 + 0.5 * h3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50), 5); p.setXYZ(i, x * r, y * r * 0.7, z * r * (0.8 + 0.3 * h3(Math.round(x * 9), 1, Math.round(z * 9), 6))); }
      S.grit = done(g, 0.08);
    }
    // a broken piece of cut stone: a block, every corner moved, one knocked in along its diagonal (its faces fold where it broke)
    const chunk = (k) => {
      const g = new THREE.BoxGeometry(1, 0.75, 0.85).toNonIndexed(), p = g.attributes.position, cut = Math.floor(h3(k, 1, 2, 3) * 8);
      for (let i = 0; i < p.count; i++) {
        const sx = Math.sign(p.getX(i)), sy = Math.sign(p.getY(i)), sz = Math.sign(p.getZ(i)), ci = (sx > 0 ? 1 : 0) + (sy > 0 ? 2 : 0) + (sz > 0 ? 4 : 0);
        let x = p.getX(i) * (0.86 + 0.28 * h3(ci, k, 1, 0)), y = p.getY(i) * (0.86 + 0.28 * h3(ci, k, 2, 0)), z = p.getZ(i) * (0.86 + 0.28 * h3(ci, k, 3, 0));
        if (ci === cut || ci === (cut + 3) % 8) { const t = ci === cut ? 0.42 : 0.22; x *= 1 - t; y *= 1 - t; z *= 1 - t; }
        p.setXYZ(i, x, y, z);
      }
      return done(g, 0.1);
    };
    S.chunk = [chunk(1), chunk(2)];
    // a piece of a flagstone: six uneven sides, a hand thick
    {
      const sh = new THREE.Shape(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + (h3(i, 4, 1, 0) - 0.5) * 0.6, r = 0.36 + h3(i, 4, 2, 0) * 0.2; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, steps: 1 }); g.rotateX(-Math.PI / 2);
      S.slab = done(g, 0.35);
    }
    // a bone broken off: a tapering shaft of five sides
    { const g = new THREE.CylinderGeometry(0.72, 1, 1, 5, 1); g.rotateZ(Math.PI / 2); S.bone = done(g, 0.1); }
    // a sherd of a pot: a piece of its curved wall, both faces and its broken edges
    {
      const P = [], U = [], R0 = 1, R1 = 0.86, A = 1.1, n = 3, H = 0.9;
      const pt = (r, a, y) => [Math.cos(a - A / 2 + Math.PI / 2) * r, y, Math.sin(a - A / 2 + Math.PI / 2) * r];
      const quad = (a, b, c, d) => { P.push(...a, ...b, ...c, ...a, ...c, ...d); U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
      for (let i = 0; i < n; i++) {
        const a0 = i / n * A, a1 = (i + 1) / n * A, y0 = -H / 2 + (h3(i, 7, 1, 0) - 0.5) * 0.2, y1 = H / 2 - h3(i, 7, 2, 0) * 0.3;
        quad(pt(R0, a0, y0), pt(R0, a0, y1), pt(R0, a1, y1), pt(R0, a1, y0));
        quad(pt(R1, a1, y0), pt(R1, a1, y1), pt(R1, a0, y1), pt(R1, a0, y0));
        quad(pt(R1, a0, y1), pt(R1, a1, y1), pt(R0, a1, y1), pt(R0, a0, y1));
        quad(pt(R0, a0, y0), pt(R0, a1, y0), pt(R1, a1, y0), pt(R1, a0, y0));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.translate(0, 0, -0.93); g.rotateX(Math.PI / 2); S.shard = done(g, 0.15);
    }
    // a twig: a bent stick of three sides with a shoot off it (one unit long, along x)
    const twig = (k) => {
      const P = [], pts = []; let x = -0.5, z = 0, a = (h3(k, 9, 1, 0) - 0.5) * 0.4;
      for (let i = 0; i <= 3; i++) { pts.push([x, 0, z]); a += (h3(k, 9, i, 1) - 0.5) * 0.7; x += Math.cos(a) / 3; z += Math.sin(a) / 3; }
      const ring = (c, r) => [0, 1, 2].map((j) => { const t = j / 3 * 6.283; return [c[0], c[1] + Math.cos(t) * r, c[2] + Math.sin(t) * r]; });
      const tube = (cs, r0) => { const R = cs.map((c, i) => ring(c, r0 * (1 - i / cs.length * 0.6))); for (let i = 0; i + 1 < R.length; i++) for (let j = 0; j < 3; j++) { const a0 = R[i][j], a1 = R[i][(j + 1) % 3], b0 = R[i + 1][j], b1 = R[i + 1][(j + 1) % 3]; P.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0); } };
      tube(pts, 0.032);
      const b = pts[1], ba = a + (h3(k, 9, 5, 0) > 0.5 ? 0.8 : -0.8); tube([b, [b[0] + Math.cos(ba) * 0.2, 0, b[2] + Math.sin(ba) * 0.2], [b[0] + Math.cos(ba) * 0.34, 0, b[2] + Math.sin(ba) * 0.36]], 0.018);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); const U = new Float32Array(P.length / 3 * 2); for (let i = 0; i < U.length / 2; i++) { U[i * 2] = P[i * 3] * 2; U[i * 2 + 1] = (P[i * 3 + 1] + P[i * 3 + 2]) * 4; } g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      return done(g, 0.5);
    };
    S.twig = [twig(1), twig(2)];
    // a dead leaf, curled: its vein raised, its sides lifting (drawn from both faces)
    {
      const P = [0, 0, -0.5, -0.3, 0.06, -0.02, 0, 0.05, 0.02, 0, 0.05, 0.02, -0.3, 0.06, -0.02, 0, 0, 0.5, 0, 0, -0.5, 0, 0.05, 0.02, 0.3, 0.09, 0.02, 0, 0.05, 0.02, 0, 0, 0.5, 0.3, 0.09, 0.02];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); S.leaf = done(g, 1);
    }
    // weeds: a clump of blades, each its own height, bend and lean, narrowing to its tip (a unit high; dark at the root, as the grass's own)
    const weedGeo = (k, nb, hmin, lean) => {
      const P = [], CC = [];
      for (let b = 0; b < nb; b++) {
        const ang = b / nb * 6.283 + h3(b, k, 1, 0) * 1.4, r0 = 0.01 + h3(b, k, 2, 0) * 0.07, hb = hmin + h3(b, k, 3, 0) * (1 - hmin), bend = (0.12 + h3(b, k, 4, 0) * 0.5) * hb + lean * h3(b, k, 6, 0), wid = 0.012 + h3(b, k, 5, 0) * 0.018;
        const ox = Math.cos(ang), oz = Math.sin(ang), qx = -oz, qz = ox, pts = [];
        for (let i = 0; i <= 3; i++) { const t = i / 3, o = r0 + bend * t * t, y = hb * t * (1 - 0.3 * bend * t), wv = wid * (1 - t * 0.9); pts.push([ox * o - qx * wv, y, oz * o - qz * wv, t], [ox * o + qx * wv, y, oz * o + qz * wv, t]); }
        for (let i = 0; i < 3; i++) for (const v of [pts[i * 2], pts[i * 2 + 2], pts[i * 2 + 1], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3]]) { P.push(v[0], v[1], v[2]); const c = 0.38 + 0.62 * v[3]; CC.push(c, c, c); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(CC, 3));
      g.computeVertexNormals(); g.computeBoundingSphere(); g.userData.shared = true; return g;
    };
    S.weed = [weedGeo(1, 6, 0.55, 0.08), weedGeo(2, 9, 0.4, 0.2), weedGeo(3, 14, 0.25, 0.04)];
    // a splinter of wood: a long block, its ends broken slanting
    {
      const g = new THREE.BoxGeometry(1, 0.16, 0.28).toNonIndexed(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setX(i, x + (x > 0 ? (z > 0 ? -0.12 : 0.05) + (y > 0 ? -0.06 : 0) : (z > 0 ? 0.04 : -0.1))); }
      S.stick = done(g, 0.3);
    }
    return S;
  }

  // ---- materials (made once for each kind of place; the world's own are used for what lies about)
  function dressMats(kind, K, B) {
    const key = kind + '|' + (K.tex || 'soil'); if (DR.mats[key]) return DR.mats[key];
    const X = G.GFX, tx = (n) => (X && X.tex ? X.tex(n) : null), T = tx(K.tex === 'snow' ? 'dsnow' : 'dsoil') || (G.Tex.tex && G.Tex.tex.rock) || null, D = tx('ddecal');
    const M = {};
    const std = (o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: K.rough, metalness: 0 }, o)); m.envMapIntensity = 0.35; return m; };
    M.heap = std({ map: T && T.map, normalMap: T && T.normalMap, aoMap: T && T.orm, aoMapIntensity: 0.9, vertexColors: true, alphaHash: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    M.band = std({ map: T && T.map, normalMap: T && T.normalMap, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });   // (its edge is the vertices' alpha, wandering by noise: the grain is in its picture)
    if (D) {
      const dm = (rough, env) => { const m = std({ map: D.map, normalMap: D.normalMap, alphaMap: D.orm, roughness: rough, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.045, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); m.envMapIntensity = env; return m; };
      M.dry = dm(0.93, 0.35); M.damp = dm(0.45, 0.5); M.water = dm(0.06, 1.0);
    }
    M.leafD = std({ color: 0xffffff, roughness: 0.88, side: THREE.DoubleSide });
    M.snowI = std({ map: T && T.map, normalMap: T && T.normalMap, roughness: 0.8, color: 0xffffff });
    return (DR.mats[key] = M);
  }

  // the kinds of things that lie about: shape, material (a world material, or the wall's own: 'wall'), size from, to (m), how flat
  // (its height to its size), its tints
  const LT = {
    pebble: { g: 'peb', mk: 'rock', s: [0.025, 0.075], fy: [0.7, 1] },
    grit: { g: 'grit', mk: 'rock', s: [0.012, 0.035], fy: [0.6, 1] },
    chunk: { g: 'chunk', mk: 'wall', s: [0.06, 0.17], fy: [0.7, 1] },
    slab: { g: 'slab', mk: 'floor', s: [0.08, 0.18], fy: [0.14, 0.2], tint: [0.62, 0.6, 0.57] },
    bone: { g: 'bone', mk: 'bone', s: [0.08, 0.2], fy: [0.14, 0.2], sz: 'y' },
    shard: { g: 'shard', mk: 'ceramic', s: [0.05, 0.12], fy: [0.9, 1.1], sz: 'u', tint: [0.62, 0.58, 0.55] },
    woodbit: { g: 'stick', mk: 'wood', s: [0.12, 0.34], fy: [0.8, 1.2], sz: 'u', tint: [0.5, 0.45, 0.4] },
    twig: { g: 'twig', mk: 'woodDark', s: [0.18, 0.5], fy: [1, 1], sz: 'u' },
    leaf: { g: 'leaf', mk: 'leafD', s: [0.045, 0.085], fy: [1, 1], sz: 'u' },
    coal: { g: 'peb', mk: 'rock', s: [0.025, 0.08], fy: [0.7, 1], tint: [0.05, 0.045, 0.04] },
    iron: { g: 'stick', mk: 'iron', s: [0.08, 0.26], fy: [0.5, 0.8], sz: 'u', tint: [0.32, 0.2, 0.14] },
    slag: { g: 'peb', mk: 'iron', s: [0.03, 0.09], fy: [0.6, 0.9], tint: [0.12, 0.1, 0.09] },
    icechunk: { g: 'chunk', mk: 'ice', s: [0.05, 0.16], fy: [0.6, 1] },
    snowlump: { g: 'peb', mk: 'snowI', s: [0.06, 0.16], fy: [0.45, 0.6] },
    straw: { tuft: true, s: [0.4, 0.62], tint: [1.2, 1.0, 0.78] },
    weed: { tuft: true, s: [0.35, 0.6], tint: [0.55, 0.7, 0.5] },
  };
  // the ways people walk: from the way in to each gate, the shortest over the nav grid, and a metre either side of it (one storey only;
  // a field of storeys has none). Grass and what lies about are thinner there
  const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function paths(w) {
    if (!w.nf || !w.N || (w.L || 1) > 1 || !w.spawn || !w.exits || !w.exits.length) return null;
    const W = w.Wn, D = w.Dn, N = w.N, xo = w.xo || 0, zo = w.zo || 0;
    const idx = (x, z) => { const xi = Math.floor(x) + xo, zi = Math.floor(z) + zo; return xi < 0 || zi < 0 || xi >= W || zi >= D ? -1 : zi * W + xi; };
    const ok = (i) => i >= 0 && !w.nb[i] && w.nf[i] > -50;
    const dist = new Int32Array(N).fill(-1), qu = new Int32Array(N);
    const s0 = idx(w.spawn.x, w.spawn.z); if (!ok(s0)) return null;
    let h = 0, t = 0; qu[t++] = s0; dist[s0] = 0;
    while (h < t) {
      const i = qu[h++], x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of DIR4) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue; const j = zz * W + xx; if (dist[j] >= 0 || !ok(j) || Math.abs(w.nf[j] - w.nf[i]) > 0.8) continue; dist[j] = dist[i] + 1; qu[t++] = j; }
    }
    const out = new Uint8Array(N);
    for (const ex of w.exits) {
      let i = -1;
      for (let r = 0; r <= 4 && i < 0; r++) for (let dz = 0; dz <= r && i < 0; dz++) for (const sx of [-1, 1]) { const j = idx(ex.x + sx * (r - dz), (ex.z || 0) + 1.5 + dz); if (j >= 0 && dist[j] >= 0) { i = j; break; } }
      let guard = 0;
      while (i >= 0 && dist[i] > 0 && guard++ < N) {
        const x = i % W, z = (i / W) | 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < W && zz < D) out[zz * W + xx] = 1; }
        let best = -1; for (const [dx, dz] of DIR4) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue; const j = zz * W + xx; if (dist[j] >= 0 && dist[j] < dist[i] && (best < 0 || dist[j] < dist[best])) best = j; }
        i = best;
      }
    }
    return out;
  }
  // (a growing typed array: numbers written straight in, not pushed one at a time into a plain array)
  class GA {
    constructor(T) { this.T = T; this.a = new T(2048); this.n = 0; }
    need(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a.subarray(0, this.n)); this.a = b; } return this.a; }
    out() { return this.a.slice(0, this.n); }
  }
  // (smooth noise along a line, from a fixed table: the same everywhere and every time, and cheaper than the sine-hashed kind)
  const NT = new Float32Array(1024);
  { let x = 0x2545f491; for (let i = 0; i < 1024; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; NT[i] = (x >>> 0) / 4294967296; } }
  const n1d = (x, o) => { const xi = Math.floor(x), f = x - xi, u = f * f * (3 - 2 * f), i = (xi + o) & 1023; return NT[i] * (1 - u) + NT[(i + 1) & 1023] * u; };
  // (the strip of a heap: how far out each of its five rows lies, as a part of its width - the first let into the wall - and how high, as a
  // part of its height; how much light the angle at the wall takes)
  const RD = [0, 0.17, 0.46, 0.76, 1], RY = [1.03, 0.94, 0.6, 0.2], AOR = [0.72, 0.86, 0.97, 1, 1];
  // (a heap's rings out from its middle, and its height at each: loose stuff falls fast from the wall and slowly to nothing, snow is rounded)
  const RT = [0, 0.1, 0.22, 0.36, 0.5, 0.64, 0.77, 0.88, 1];
  const hProf = (t, snow) => (t >= 0.88 ? 0 : snow ? Math.pow(Math.cos(Math.min(1, t / 0.88) * Math.PI / 2), 1.1) : (Math.exp(-3.2 * t / 0.88) - Math.exp(-3.2)) / (1 - Math.exp(-3.2)));
  // (the metre cell of a point, as one number: where the grass grows thick at a wall's foot)
  const nearKey = (x, z, f) => ((Math.floor(x) + 1024) * 4096 + Math.floor(z) + 1024) * 256 + Math.round(f) + 128;
  const LEAFC = [0x6b4a26, 0x7a5a2e, 0x5a3e22, 0x8a6a3a, 0x4a3a24, 0x6a5a34].map(lin);

  P.dress = function (w) {
    if (!w || w._dressed || !w.colliders || !w.hash || !w.mats || !w.mats.biome) return;
    w._dressed = true;
    const t0 = performance.now(), B = w.mats.biome, kind = kindOfPlace(w), K = KINDS[kind], PN = G.Tex && G.Tex.pn; if (!PN) return;
    if (!DR.G) DR.G = dressShapes();
    const SH = DR.G, MT = dressMats(kind, K, B), vn = PN.vn;
    let DQn = 0; const MULTI = (w.L || 1) > 1, DMAX = MULTI ? 240 : 420;   // (a field of storeys: walls on every floor - fewer marks and things, to keep its time)
    const QS = G.save && G.save.data && G.save.data.settings, QK = QS && QS.quality === 'high' ? 1 : 0.6;   // (medium: fewer of the small things)
    const st = { runs: 0, samples: 0, heapTris: 0, bandTris: 0, decals: 0, decalTris: 0, items: 0, itemTris: 0, weeds: 0, vines: 0, corners: 0, heaps: 0 };
    const DB = () => ({ P: new GA(Float32Array), U: new GA(Float32Array), C: new GA(Float32Array), I: new GA(Uint32Array) });
    const DQ = { dry: DB(), damp: DB(), water: DB() };
    // (weeds and straw: gathered here, set down at the end as many as the budget holds - each is a tuft of 48 triangles)
    const WD = [], weed = (x, y, z, ry, s, o, pr) => { WD.push([x, y, z, ry, s, o, pr || 0]); };
    const WMAX = Math.round(260 * QK);
    let ST = 0.45;
    // ---- where things stand
    // (the heights of the floors the player reaches, lowest and highest: a box wholly above or below them is no wall of theirs, nor floor)
    let fmin = Infinity, fmax = -Infinity;
    let RC = 0;
    if (w.nf) for (let n = 0; n < w.nf.length; n++) { const v = w.nf[n]; if (!(v > -50) || w.nb[n] || (w.reachMask && !w.reachMask[n])) continue; RC++; if (v < fmin) fmin = v; if (v > fmax) fmax = v; }
    if (!(fmax >= fmin)) { fmin = -50; fmax = 500; }
    const roofed = (x, y, z) => !!(G.Weather && G.Weather.roofed && G.Weather.roofed(x, y, z, 1.7));   // (weather.js: anything solid overhead)
    const okFloor = (d) => d.alive !== false && !d.ghost && !d.trigger && !d.shotOnly && !d.enemyOnly && !d.dest && d.tag !== 'grate' && d.tag !== 'portcullis' && !(d.mk && SKIPMK.has(d.mk));
    const okSolid = (d) => d.alive !== false && !d.ghost && !d.trigger && !d.shotOnly && !d.enemyOnly;
    // the colliders of the 4 m cell at (x, z) (world.js keeps them so), sorted once: F what may be a floor near the floors reached, S
    // what may stand in the air over one
    const CC = new Map();
    const cellOf = (x, z) => {
      const key = w._hkey(Math.floor(x / 4), Math.floor(z / 4)); let e = CC.get(key);
      if (e === undefined) {
        const a = w.hash.get(key); e = null;
        if (a) { e = { F: [], S: [] }; for (const d of a) { if (okFloor(d) && d.y1 > fmin - (d.tg ? 1.4 : 0.6) && d.y1 < fmax + (d.tg ? 1.4 : 0.6)) e.F.push(d); if (okSolid(d) && d.y1 > fmin - 0.6 && d.y0 < fmax + 1.2) e.S.push(d); } }
        CC.set(key, e);
      }
      return e;
    };
    const top = (d, x, z) => (d.tg ? w.tTop(d, x, z) : d.y1);
    // (paving laid over the ground: its top is the floor there)
    const PV = w.paved && w.paved.length ? w.paved : null;
    // the floors at (x, z) with tops between y0 and y1
    const tops = [];
    const topsAt = (x, z, y0, y1) => {
      tops.length = 0; const e = cellOf(x, z); if (!e) return tops;
      for (const d of e.F) { if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue; const t = d.tg ? w.tTop(d, x, z) : d.y1; if (t >= y0 && t <= y1 && !tops.some((u) => Math.abs(u - t) < 0.04)) tops.push(t); }
      if (PV) for (const q of PV) if (x > q[0] && x < q[2] && z > q[1] && z < q[3]) { for (let i = 0; i < tops.length; i++) if (q[4] > tops[i] && q[4] - tops[i] < 0.14) tops[i] = q[4]; }
      return tops;
    };
    // nothing solid in the air over (x, z) from y0 to y1 (within r)
    const freeAt = (x, z, y0, y1, r) => {
      const e = cellOf(x, z); if (!e) return false;
      for (const d of e.S) {
        if (d.x1 < x - r || d.x0 > x + r || d.z1 < z - r || d.z0 > z + r || d.y1 <= y0 || d.y0 >= y1) continue;
        if (d.tg && top(d, x, z) <= y0 + 0.01) continue;
        return false;
      }
      return true;
    };
    // the floor at (x, z) within tol of y (the nearest), with the air free over it; null if none
    const floorNear = (x, z, y, tol) => {
      topsAt(x, z, y - tol, y + tol); let best = null;
      for (const t of tops) if (best === null || Math.abs(t - y) < Math.abs(best - y)) best = t;
      return best !== null && freeAt(x, z, best + 0.02, best + 0.35, 0.02) ? best : null;
    };
    // reached by the player: a cell round it that the nav reaches, at about that height
    const reachNear = (x, z, f) => {
      if (!w.nf || !w.navIdx) return true;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = w.navIdx(x + dx, z + dz, f + 0.3); if (i < 0 || w.nb[i] || !(w.nf[i] > -50) || Math.abs(w.nf[i] - f) > 0.7) continue; if (w.reachMask && !w.reachMask[i]) continue; return true; }
      return false;
    };
    // kept clear: round what is used (chests, altars, the pedlar's and the basin's places, the shop's wares), the gates, the way in,
    // the field's devices; out of water and fire
    const keep = [];
    for (const q of w.miniSlots || []) keep.push([q.x, q.z, 2.0]); if (w.miniHeal) keep.push([w.miniHeal.x, w.miniHeal.z, 2.2]);
    for (const it of w.interactables || []) if (it && it.pos) keep.push([it.pos.x, it.pos.z, 1.5]);
    for (const q of w.shopSlots || []) keep.push([q.x, q.z, 1.8]);
    for (const ex of w.exits || []) if (ex) keep.push([ex.x, ex.z !== undefined ? ex.z + 1 : 0, 4.2]);
    if (w.spawn) keep.push([w.spawn.x, w.spawn.z, 2.2]);
    for (const g of w.gims || []) if (g && g.x !== undefined && g.z !== undefined) keep.push([g.x, g.z, 2.2]);
    for (const h of w.hazards || []) if (h && h.x !== undefined) keep.push([h.x, h.z, (h.s || 2) * 0.75 + 0.3]);
    const zones = [].concat(w.waterZones || [], w.lavaZones || []);
    // (stamped once into half-metre cells, a hand wider all round; then a look in an array)
    const KX0 = (w.xo ? -w.xo : 0) - 6, KZ0 = (w.zo ? -w.zo : 0) - 6, KW = Math.ceil(((w.Wn || w.W) + 12) * 2), KD = Math.ceil(((w.Dn || w.D) + 12) * 2), KG = new Uint8Array(KW * KD);
    const stamp = (x0, z0, x1, z1, cx, cz, r) => {
      const i0 = Math.max(0, Math.floor((x0 - KX0) * 2)), i1 = Math.min(KW - 1, Math.floor((x1 - KX0) * 2)), j0 = Math.max(0, Math.floor((z0 - KZ0) * 2)), j1 = Math.min(KD - 1, Math.floor((z1 - KZ0) * 2));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (r) { const dx = KX0 + (i + 0.5) / 2 - cx, dz = KZ0 + (j + 0.5) / 2 - cz; if (dx * dx + dz * dz >= r * r) continue; } KG[j * KW + i] = 1; }
    };
    for (const k of keep) { const r = k[2] + 0.25; stamp(k[0] - r, k[1] - r, k[0] + r, k[1] + r, k[0], k[1], r); }
    for (const q of zones) stamp(q.x0 - 0.25, q.z0 - 0.25, q.x1 + 0.25, q.z1 + 0.25, 0, 0, 0);
    const clearOf = (x, z) => { const i = Math.floor((x - KX0) * 2), j = Math.floor((z - KZ0) * 2); return i < 0 || j < 0 || i >= KW || j >= KD || !KG[j * KW + i]; };
    // the floors the nav reaches in the metre cell at (x, z), each storey's (into NF)
    const NF = [];
    const navFloors = (x, z) => {
      NF.length = 0; if (!w.nf || !w.navIdx) return NF;
      const i0 = w.navIdx(x, z); if (i0 < 0) return NF;
      for (let l = 0, N = w.N || 0; l < (w.L || 1); l++) { const n = l * N + i0; if (!(w.nf[n] > -50) || w.nb[n] || (w.reachMask && !w.reachMask[n])) continue; NF.push(w.nf[n]); }
      return NF;
    };
    const navAt = (x, z, f, tol) => { for (const v of navFloors(x, z)) if (Math.abs(v - f) <= tol) return true; return false; };
    // (is the floor at (x, z) the one at f: on uneven ground a look at the colliders, on flat floors the nav's cell or its own floor)
    const onFloor = (x, z, f) => (TERR ? floorNear(x, z, f, 0.3) !== null : navAt(x, z, f, 0.06));
    const SLOPE = kind === 'mine' ? 0.45 : 0.2, TERR = !!(w.groundGrid && w.groundGrid.length);   // (how far the floor at a wall's foot may stand from the floor a metre out: galleries slope)
    // ---- the colour of the heaps and the film (as the shader works in it)
    const KM = { crypt: 1.45, out: 2.0, mine: 1.7, frost: 1.08, wet: 1.9, forge: 1.7, clean: 1.3 }[kind];
    const c1 = (K.col !== null ? new THREE.Color(K.col) : new THREE.Color(B.floor).lerp(new THREE.Color(B.stone), 0.35)).multiplyScalar(KM);
    if (kind === 'out') c1.lerp(new THREE.Color(B.grassTint || B.floor).multiplyScalar(KM), 0.15);
    { const lo = 0.1, m = Math.max(c1.r, c1.g, c1.b); if (m < lo) c1.multiplyScalar(lo / Math.max(1e-3, m)); }   // (no heap or film darker than a tenth: in a dim place it was a black lump)
    const C1 = [c1.r, c1.g, c1.b], C2 = lin(K.col2).map((v) => v * KM), HK = { crypt: 1.4, clean: 1.3, mine: 1.25, forge: 1.2, out: 1.1, wet: 1.1, frost: 1 }[kind];
    const cf = new THREE.Color(B.floorTex === 'grass' ? new THREE.Color(0x7e8a50).multiply(new THREE.Color(B.grassTint || '#ffffff')) : new THREE.Color(B.floor)).multiplyScalar(kind === 'out' ? 1.25 : 1.1), CF = [cf.r, cf.g, cf.b];
    const TOE = [0, 0, 0.12, 0.38, 0.62];   // (how far each row has gone over to the floor's colour)
    // ======== 1. the foot of every drawn face
    const lines = new Map();
    const isWall = (c) => {
      if (c.alive === false || c.ghost || c.trigger || c.dest || c.shotOnly || c.enemyOnly || c.tag === 'grate' || c.tag === 'portcullis' || c.bars) return false;
      if (c.tg) return !!(c.tg.cliff);   // (ground of a cliff grid: its drops are drawn as faces of rock; a smooth grid has none)
      return !!c.vis && !SKIPMK.has(c.mk);
    };
    const faces = []; let TL = 0;
    const FO = [], FOC = new Map();
    for (const b of w.footOut || []) {
      if (!b || !(b.x1 > b.x0) || !(b.z1 > b.z0) || !(b.y1 > b.y0)) continue;
      const c = { x0: b.x0, y0: b.y0, z0: b.z0, x1: b.x1, y1: b.y1, z1: b.z1, vis: true, mk: b.mk || 'trim', foot: true, alive: true }; FO.push(c);
      for (let gx = Math.floor(c.x0 / 4); gx <= Math.floor(c.x1 / 4); gx++) for (let gz = Math.floor(c.z0 / 4); gz <= Math.floor(c.z1 / 4); gz++) { const k = gx * 4096 + gz; (FOC.get(k) || FOC.set(k, []).get(k)).push(c); }
    }
    const inFoot = (x, z, y) => { const L = FOC.get(Math.floor(x / 4) * 4096 + Math.floor(z / 4)); if (L) for (const c of L) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && y > c.y0 && y < c.y1) return true; return false; };
    st.footOut = FO.length;
    const tgHigh = (c, x, z) => { const g = c.tg, hf = g.hf, cx = Math.floor(x - g.ox), cz = Math.floor(z - g.oz); if (cx < 0 || cz < 0 || cx >= hf.W || cz >= hf.D) return false; const i = cz * hf.W + cx; return !!hf.m[i] && hf.h[i] >= c.y1 - 0.6; };
    const spans = (c, x, z) => { for (const nf of navFloors(x, z)) if (c.y0 <= nf + 0.1 && c.y1 >= nf + 0.25) return true; return false; };
    for (const c of FO.length ? w.colliders.concat(FO) : w.colliders) {
      if (c.y0 > fmax + 0.1 || c.y1 < fmin + 0.25 || c.y1 - c.y0 < 0.25 || !isWall(c)) continue;
      for (let fi = 0; fi < 4; fi++) {
        const nx = fi === 0 ? 1 : fi === 1 ? -1 : 0, nz = fi === 2 ? 1 : fi === 3 ? -1 : 0;
        const pl = fi === 0 ? c.x1 : fi === 1 ? c.x0 : fi === 2 ? c.z1 : c.z0, a0 = nx ? c.z0 : c.x0, a1 = nx ? c.z1 : c.x1;
        if (a1 - a0 < 0.22) continue;
        // (ground of a grid: a side against a cell of its own grid as high, or nearly, is no face at all - read from the grid itself)
        if (c.tg) { let open = false; for (let a = a0 + 0.5; a < a1 + 0.01 && !open; a += 1) open = !tgHigh(c, nx ? pl + nx * 0.5 : Math.min(a, a1 - 0.1), nx ? Math.min(a, a1 - 0.1) : pl + nz * 0.5); if (!open) continue; }
        // (a first look along it every metre and a half: is there a floor out in front of it, at a height it stands on)
        let hit = false;
        for (let a = a0 + 0.15; a <= a1 + 0.01 && !hit; a += 1.5) { const aa = Math.min(a, a1 - 0.15); hit = spans(c, nx ? pl + nx * 0.9 : aa, nx ? aa : pl + nz * 0.9) || spans(c, nx ? pl + nx * 1.45 : aa, nx ? aa : pl + nz * 1.45); }
        if (!hit) continue;
        faces.push([c, nx, nz, pl, a0, a1]); TL += a1 - a0;
      }
    }
    // (a great deal of wall - a hall of storeys, a drowned gallery - is looked at a little less closely: the same ground, less work)
    ST = TL > 2600 ? 0.7 : TL > 1400 || (w.L || 1) > 1 || TERR ? 0.6 : kind === 'frost' && TL < 900 ? 0.32 : 0.45; st.faceLen = Math.round(TL);   // (a field of storeys: walls on every floor)
    for (const [c, nx, nz, pl, a0, a1] of faces) {
      {
        const pk = nx + ',' + nz + ',' + Math.round(pl * 1000);
        let L = lines.get(pk); if (!L) lines.set(pk, L = { nx, nz, pl, s: [], seen: new Set() });
        let lk = -9, lnf = NaN, lf = NaN;
        for (let k = Math.ceil((a0 + 0.03) / ST); k * ST <= a1 - 0.03; k++) {
          const a = k * ST;
          // (a floor the player reaches out in front of it, a metre or so: each storey of that cell. None: nothing to lie against here)
          let fs = navFloors(nx ? pl + nx * 0.9 : a, nx ? a : pl + nz * 0.9);
          if (!fs.length) fs = navFloors(nx ? pl + nx * 1.45 : a, nx ? a : pl + nz * 1.45);
          if (!fs.length) continue;
          const px = nx ? pl + nx * 0.07 : a, pz = nx ? a : pl + nz * 0.07;
          const wt = c.tg ? top(c, nx ? pl - nx * 0.05 : a, nx ? a : pl - nz * 0.05) : c.y1;
          for (const nf of fs) {
            if (c.y0 > nf + 0.1 || wt < nf + 0.25) continue;
            // (the floor at the very foot, about as high as out there: not the top of a step or a ledge)
            let f;
            if (k === lk + 1 && nf === lnf && !c.tg && !TERR) f = lf;
            else { topsAt(px, pz, nf - SLOPE, Math.min(nf + SLOPE, wt - 0.2)); if (!tops.length) continue; f = tops[0]; for (const t of tops) if (Math.abs(t - nf) < Math.abs(f - nf)) f = t; }
            const H = wt - f; if (H < 0.2 || (c.tg && H < 0.6) || c.y0 > f + 0.03) continue;
            const sk = k * 4096 + (Math.round(f * 20) & 4095); if (L.seen.has(sk)) continue;
            if (!freeAt(px, pz, f + 0.02, f + 0.45, 0.025)) continue;
            if (FO.length && !c.foot && inFoot(px, pz, f + 0.05)) continue;   // (behind a plinth: what lies there lies at the plinth's foot)
            L.seen.add(sk); lk = k; lnf = nf; lf = f;
            L.s.push({ k, a, f, H, mk: c.mk || (c.tg ? 'rock' : 'block'), rock: !!c.tg || c.mk === 'rock', keep: clearOf(px + nx * 0.4, pz + nz * 0.4) });
          }
        }
      }
    }
    for (const c of FO) {
      const hgt = c.y1 - c.y0, sx = c.x1 - c.x0, sz = c.z1 - c.z0; if (hgt > 0.4 || sx < 0.3 || sz < 0.3 || DQn >= 420 || !MT.dry) continue;
      const ix = Math.min(0.04, sx * 0.1), iz = Math.min(0.04, sz * 0.1), pts = [];
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) pts.push(i ? c.x1 - ix : c.x0 + ix, c.y1 - 0.009, j ? c.z1 - iz : c.z0 + iz, i, j);
      lay(pts, 1, 'grime', 0.55);
    }
    st['t_lines'] = Math.round(performance.now() - t0);
    // runs: along each line, samples next to each other at about one height
    const runs = [];
    for (const L of lines.values()) {
      if (!L.s.length) continue;
      L.s.sort((p, q) => p.a - q.a || p.f - q.f);
      const open = [];
      for (const s of L.s) {
        let r = null; for (const o of open) { const e = o.s[o.s.length - 1]; if (s.k - e.k >= 1 && s.k - e.k <= 2 && Math.abs(s.f - e.f) < 0.16) { r = o; break; } }
        if (!r) { r = { nx: L.nx, nz: L.nz, pl: L.pl, s: [] }; open.push(r); runs.push(r); }
        r.s.push(s);
        for (let i = open.length - 1; i >= 0; i--) if (s.k - open[i].s[open[i].s.length - 1].k > 2) open.splice(i, 1);
      }
    }
    st.runs = runs.length;
    const path = paths(w), pathNear = (x, z) => { if (!path || !w.navIdx) return false; const i = w.navIdx(x, z); return i >= 0 && !!path[i % w.N]; };
    // (the outer walls of an area of the common shell stand on a battered plinth drawn out in front of their boxes - levelgen.js dressWalls,
    // some 0.3 m at its foot - and the box says nothing of it: what lies against such a wall lies against the plinth's foot)
    const WK = G.LevelGen && G.LevelGen.wallKind ? G.LevelGen.wallKind(w) : null, PLK = { hall: 1, crypt: 1, works: 1, sky: 1, cavern: 1, fort: 1, rock: 1, mine: 1 };
    if (WK && PLK[WK] && !FO.length) for (const r of runs) {
      const edge = r.nx ? Math.abs(r.pl - (r.nx > 0 ? 0 : w.W)) : Math.abs(r.pl - (r.nz > 0 ? 0 : w.D));
      if (edge < 0.06) { r.pl += (r.nx || r.nz) * 0.32; r.plinth = true; st.plinth = (st.plinth || 0) + 1; }
    }
    // (what this will cost: some 60 000 triangles an area at most, all told. Many walls: the heaps and the film take every other sample)
    let nseg = 0; for (const r of runs) nseg += r.s.length - 1;
    const stride = nseg * 8 * 0.75 > 20000 ? 2 : 1; st.nseg = nseg; st.stride = stride;
    if (stride > 1) for (const r of runs) if (r.s.length > 3) r.s = r.s.filter((q, i) => i % 2 === 0 || i === r.s.length - 1);
    let PRE = Math.min(1, 900 / Math.max(1, nseg * ST * QK * (K.lit * 0.6 + (K.grit || 0) * 0.3) + runs.length * 0.25 * K.corner)); st.pre = Math.round(PRE * 100) / 100; if (MULTI) PRE *= 0.7;   // (grit counts for a third: eight faces to a piece)
    const P2 = (r, a, d) => [r.nx ? r.pl + r.nx * d : a, r.nx ? a : r.pl + r.nz * d];
    // a corner at the end of a run: a face across it (the inside of a corner) - the place along the line where it stands, or null
    const cornerAt = (r, end) => {
      const s = end ? r.s[r.s.length - 1] : r.s[0], dir = end ? 1 : -1;
      if (r.s.length < 3 || s.H < 0.9) return null;
      for (let d = 0.06; d <= 0.5; d += 0.14) { const [x, z] = P2(r, s.a + dir * d, 0.14); if (!freeAt(x, z, s.f + 0.05, s.f + 0.4, 0.005)) return s.a + dir * (d - 0.03); }
      return null;
    };
    // ---- out of all that: the heaps (a strip of five rows out from the wall), the film of dust, and what lies on and about them
    const HP = new GA(Float32Array), HU = new GA(Float32Array), HC = new GA(Float32Array), HI = new GA(Uint32Array), BP = new GA(Float32Array), BU = new GA(Float32Array), BC = new GA(Float32Array), BI = new GA(Uint32Array);
    const near = new Set();   // (metre cells by a wall's foot: the grass of P.meadow grows thicker there)
    const items = [];         // [kind, x, y, z, ry, size, mkOverride, tilt]
    const corners = [];
    const heapK = kind === 'frost' ? 1.15 : 1;
    for (const r of runs) {
      const n = r.s.length, sd = (r.nx * 3 + r.nz * 7) * 13.1 + Math.round(r.pl * 100) * 0.173, si = (Math.round(r.pl * 100) * 7 + r.nx * 29 + r.nz * 57) | 0;
      const fx = r.nx, fz = r.nz, pl = r.pl, PX = (a, d) => (fx ? pl + fx * d : a), PZ = (a, d) => (fx ? a : pl + fz * d);
      const cA = cornerAt(r, false), cB = cornerAt(r, true);
      if (cA !== null) corners.push({ r, a: cA, s: r.s[0], dir: -1 }); if (cB !== null) corners.push({ r, a: cB, s: r.s[n - 1], dir: 1 });
      // heaps of fallen stone: one now and then, by the six-metre stretch
      const heaps = [];
      for (let b = Math.floor(r.s[0].a / 6); b <= Math.floor(r.s[n - 1].a / 6); b++) {
        if (hsh(b, sd, 41) > K.heap) continue;
        const ha = b * 6 + 1 + hsh(b, sd, 42) * 4; if (ha < r.s[0].a + 0.6 || ha > r.s[n - 1].a - 0.6) continue;
        const s = r.s.find((q) => Math.abs(q.a - ha) < ST * 0.6); if (!s || !s.keep || s.H < 2) continue;   // (stone falls from a wall of some height)
        heaps.push(ha); st.heaps++;
      }
      // the samples: how far out the film of dust lies from the foot and how thick (wide and thick where the wall is tucked away - by a
      // corner, along a niche - thin where people pass, fading out at an open end); in the frozen halls, the drift along every wall
      const goesOn = (end) => { const q = end ? r.s[n - 1] : r.s[0], a = q.a + (end ? 0.3 : -0.3), x = PX(a, -0.05), z = PZ(a, -0.05); return !freeAt(x, z, q.f + 0.2, q.f + 0.5, 0.01) || (FO.length && inFoot(x, z, q.f + 0.3)); };
      const openA = cA === null && !goesOn(false), openB = cB === null && !goesOn(true);
      const niche = cA !== null && cB !== null && r.s[n - 1].a - r.s[0].a < 3.2;
      const prof = new Array(n);
      for (let i = 0; i < n; i++) {
        const s = r.s[i], a = s.a, nA = n1d(a * 0.37, si), nB = n1d(a * 1.9, si + 7), nC = n1d(a * 3.3, si + 13);
        let cb = 0; if (cA !== null) cb = sst(1.4, 0, Math.abs(a - cA)); if (cB !== null) cb = Math.max(cb, sst(1.4, 0, Math.abs(a - cB)));
        const pth = pathNear(PX(a, 1.0), PZ(a, 1.0)) ? 1 : 0, rec = Math.max(cb, niche ? 1 : 0);
        let W = (0.38 + 0.5 * nA + 0.15 * nB) * (0.75 + 0.6 * rec) * (pth ? 0.6 : 1) * (s.rock ? 1.25 : 1) * (kind === 'frost' ? 1.8 : 1);
        let al = Math.min(1, K.ba * 1.55 * (0.6 + 0.4 * nA) * (0.8 + 0.4 * rec) * (pth ? 0.65 : 1) * (s.keep ? 1 : 0.5));
        if (openA) { const e = sst(-0.1, 0.6, a - r.s[0].a); W *= 0.5 + 0.5 * e; al *= 0.3 + 0.7 * e; } if (openB) { const e = sst(-0.1, 0.6, r.s[n - 1].a - a); W *= 0.5 + 0.5 * e; al *= 0.3 + 0.7 * e; }
        if (TERR && !onFloor(PX(a, W), PZ(a, W), s.f)) W = Math.max(0.15, W * 0.45);
        const hd = kind === 'frost' ? K.h * (0.12 + 0.55 * sst(0.25, 0.75, nA) + 0.2 * nC) * (0.7 + 0.8 * rec) * Math.min(1, Math.max(0.2, (s.H - 0.1) / 1.2)) * (s.keep ? 1 : 0.4) : 0;
        let wd = kind === 'frost' ? (0.22 + hd * 3.6) * (0.75 + 0.5 * nB) : W * 0.6;   // (snow: deep and wide in its drifts, thin between, its width wandering)
        if (kind === 'frost' && TERR && !onFloor(PX(a, wd), PZ(a, wd), s.f)) wd = Math.max(0.15, wd * 0.5);
        prof[i] = { a, f: s.f, H: s.H, k: s.k, keep: s.keep, rock: s.rock, mk: s.mk, W, al: Math.min(0.95, al), hd, wd, h: hd, pres: nA, cb: rec };
      }
      // the film (a band of seven rows, see-through), and the drift (eight rows, drawn whole, its rim dithered away)
      if (K.ba > 0) band(r, prof, si, true, ST);
      if (kind === 'frost') band(r, prof, si, false, 0.3);
      // a niche, a short stretch between two corners: what came in stays - a heap the length of it
      if (niche && kind !== 'frost' && prof[0].keep && heapRoom()) {
        const a0 = r.s[0].a, a1 = r.s[n - 1].a, am = (a0 + a1) / 2, q = prof[n >> 1];
        dome(PX(am, -0.06), PZ(am, -0.06), q.f, fz ? 1 : 0, fx ? 1 : 0, fx, fz, (a1 - a0) / 2 + 0.15, 0.35 + hsh(am, sd, 46) * 0.25, K.h * (0.6 + 0.35 * hsh(am, sd, 47)), 0, Math.PI, 12, si + 3, false);
        litter(PX(am, -0.06), PZ(am, -0.06), q.f, fz ? 1 : 0, fx ? 1 : 0, fx, fz, (a1 - a0) / 2 + 0.15, 0.45, K.h * 0.8, 0, Math.PI, Math.round(10 * QK * Math.sqrt(PRE)), am + sd, q.mk);
      }
      // a fall of stone from a wall of some height: a heap of its own blocks against it
      for (const ha of heaps) {
        const q = prof.reduce((b, x) => (Math.abs(x.a - ha) < Math.abs(b.a - ha) ? x : b), prof[0]); if (!heapRoom()) break;
        const ra = 0.6 + hsh(ha, sd, 48) * 0.45, rn = 0.45 + hsh(ha, sd, 49) * 0.35, hh = Math.min(0.22, K.h * 1.7);
        dome(PX(ha, -0.06), PZ(ha, -0.06), q.f, fz ? 1 : 0, fx ? 1 : 0, fx, fz, ra, rn, hh, 0, Math.PI, 12, si + 5, false);
        litter(PX(ha, -0.06), PZ(ha, -0.06), q.f, fz ? 1 : 0, fx ? 1 : 0, fx, fz, ra, rn, hh, 0, Math.PI, Math.round(18 * QK), ha + sd, q.mk, true);
        decal(PX(ha, 0.35), PZ(ha, 0.35), q.f, 'grime', 1.6 + hsh(ha, sd, 44) * 0.6, hsh(ha, sd, 45) * 6.283, 0.7);
      }
      // what lies along it: more on the heaps and in the corners, the most against the wall
      for (let i = 0; i < n; i++) {
        const q = prof[i], a = q.a;
        near.add(nearKey(PX(a, 0.5), PZ(a, 0.5), q.f));
        if (!q.keep) continue;
        const lp = sst(0.42, 0.72, n1d(a * 0.33, si + 40)), e = K.lit * ST * (0.1 + 1.6 * lp + 1.4 * q.cb) * QK * PRE;
        const eg = (K.grit || 0) * ST * (0.1 + 2.2 * lp + 1.2 * q.cb) * QK * PRE * ((w.L || 1) > 1 ? 0.5 : 1), ng = Math.floor(eg) + (hsh(a, sd, 85) < eg - Math.floor(eg) ? 1 : 0);
        for (let j = 0; j < ng; j++) items.push({ a: a + (hsh(a, sd, 86 + j) - 0.5) * ST, d: q.W * (0.05 + 0.75 * Math.pow(hsh(a, sd, 96 + j), 1.3)), r, q, j: 140 + j, sd, t: 'grit' });
        const cnt = Math.floor(e) + (hsh(a, sd, 80) < e - Math.floor(e) ? 1 : 0);
        for (let j = 0; j < cnt; j++) items.push({ a: a + (hsh(a, sd, 81 + j) - 0.5) * ST, d: 0.04 + q.W * 0.8 * Math.pow(hsh(a, sd, 91 + j), 1.4), r, q, j, sd });
      }
      // weeds at the foot of a wall out of doors, and creepers up it
      const mq = prof[n >> 1], gx = PX(mq.a, 0.35), gz = PZ(mq.a, 0.35);
      const turf = kind === 'out' && floorMk(gx, gz, mq.f) === 'floor' && !roofed(gx, mq.f, gz) && !overAt(w, gx, gz, mq.f);
      if (turf && K.weed) for (let i = 0; i < n; i++) {
        const q = prof[i]; if (!q.keep || q.H < 0.6) continue;
        const e = K.weed * ST * (0.3 + 0.7 * Math.max(q.pres, q.cb)) * QK, cnt = Math.floor(e) + (hsh(q.a, sd, 140) < e - Math.floor(e) ? 1 : 0);
        for (let j = 0; j < cnt; j++) {
          const a = q.a + (hsh(q.a, sd, 141 + j) - 0.5) * ST, d = 0.05 + Math.pow(hsh(q.a, sd, 151 + j), 1.6) * (q.wd + 0.25);
          const y = q.f + Math.max(0, q.h * (1 - d / Math.max(0.05, q.wd))) * 0.85, dry = hsh(a, sd, 161 + j) < 0.3, tall = hsh(a, sd, 171 + j);
          const s = 0.5 + tall * 0.55, c = 0.75 + hsh(a, sd, 181 + j) * 0.4, tn = dry ? [1.22 * c, 1.0 * c, 0.76 * c] : [0.62 * c, 0.76 * c, 0.54 * c];
          weed(PX(a, d), y - 0.02, PZ(a, d), hsh(a, sd, 191 + j) * 6.283, s * 0.5, { sy: s * (0.55 + tall * 0.75), inst: true, tint: tn }, 1); st.weeds++;
        }
      }
      if (K.vine && turf && !r.plinth) for (let b = Math.floor(r.s[0].a / 3); b <= Math.floor(r.s[n - 1].a / 3); b++) {
        if (hsh(b, sd, 200) > K.vine * QK) continue;
        const a = b * 3 + 0.5 + hsh(b, sd, 201) * 2, s = r.s.find((q) => Math.abs(q.a - a) < ST * 0.6); if (!s || s.H < 1.4 || s.rock) continue;
        const ry = Math.atan2(fx, fz), parts = 2 + Math.floor(hsh(b, sd, 202) * 3);
        for (let j = 0; j < parts; j++) {
          const aa = a + (j - (parts - 1) / 2) * 0.32 + (hsh(b, sd, 203 + j) - 0.5) * 0.15, hv = 0.3 + hsh(b, sd, 210 + j) * 0.55, wv = 0.28 + hsh(b, sd, 220 + j) * 0.3, dd = 0.035 + j * 0.004;
          w.batch.geo('vine', PG.plane, M(PX(aa, dd), s.f + hv / 2 - 0.03, PZ(aa, dd), wv, hv, 1, 0, ry, 0), { su: wv, sv: hv, tint: [0.85, 0.92, 0.72] });
        }
        st.vines++;
      }
      // damp out from the wall's foot (the mark with the wall at its top), drips under a wall out of doors
      for (let b = Math.floor(r.s[0].a / 3); b <= Math.floor(r.s[n - 1].a / 3); b++) {
        const a = b * 3 + 0.4 + hsh(b, sd, 230) * 2.2, s = r.s.find((q) => Math.abs(q.a - a) < ST * 0.6); if (!s || !s.keep) continue;
        const rnd = hsh(b, sd, 231);
        if (rnd < K.seep) { const sz = 1.2 + hsh(b, sd, 232) * 1.4; decalW(r, a, s.f, kind === 'frost' ? 'rime' : 'seep', sz, sz * (0.55 + hsh(b, sd, 233) * 0.35), 0.85 + 0.15 * hsh(b, sd, 234)); }
        else if (K.drips && rnd < K.seep + K.drips && s.H > 1.5) decalW(r, a, s.f, 'drips', 1.0 + hsh(b, sd, 235) * 0.6, 0.5, 0.9, 0.16);
      }
    }
    st['t_runs'] = Math.round(performance.now() - t0);
    // ---- the corners: more of everything, and a heap filling the angle
    const cseen = [];
    for (const cn of corners) {
      const r = cn.r, s = cn.s; if (!s.keep) continue;
      const cp = P2(r, cn.a, 0); if (cseen.some((q) => Math.abs(q[0] - cp[0]) < 0.7 && Math.abs(q[1] - cp[1]) < 0.7 && Math.abs(q[2] - s.f) < 0.3)) continue;
      cseen.push([cp[0], cp[1], s.f]);
      st.corners++;
      const ca = cn.a, sd = Math.round(r.pl * 100) * 0.31 + ca * 1.7;
      const nC = Math.round(K.corner * QK * Math.sqrt(PRE) * (0.4 + 0.6 * hsh(ca, sd, 300)) * (cn.r.s.length >= 4 ? 1 : 0.5));
      // (the other wall runs back along -dir from the corner: the heap and what lies on it fill the angle between the two)
      if (heapRoom()) {
        const ax = r.nx ? 0 : -cn.dir, az = r.nx ? -cn.dir : 0, cp0 = P2(r, ca, 0), cx0 = cp0[0] - ax * 0.06 - r.nx * 0.06, cz0 = cp0[1] - az * 0.06 - r.nz * 0.06;
        const big = s.H > 1.5 ? 1 : 0.6, ra = (0.45 + hsh(ca, sd, 302) * 0.45) * big, rn = (0.45 + hsh(ca, sd, 303) * 0.45) * big, hh = K.h * (0.7 + 0.6 * hsh(ca, sd, 304)) * big;
        dome(cx0, cz0, s.f, ax, az, r.nx, r.nz, ra, rn, hh, 0, Math.PI / 2, 8, (sd * 7) | 0, kind === 'frost');
        litter(cx0, cz0, s.f, ax, az, r.nx, r.nz, ra, rn, hh, 0, Math.PI / 2, Math.min(18, nC * 3), ca + sd, s.mk);
      }
      const gp = P2(r, ca - cn.dir * 0.4, 0.3);
      if (kind === 'out' && floorMk(gp[0], gp[1], s.f) === 'floor' && !roofed(gp[0], s.f, gp[1]) && !overAt(w, gp[0], gp[1], s.f)) for (let j = 0; j < 3; j++) { const [x, z] = P2(r, ca - cn.dir * (0.1 + hsh(ca, sd, 360 + j) * 0.5), 0.08 + hsh(ca, sd, 370 + j) * 0.4), c = 0.75 + hsh(ca, sd, 380 + j) * 0.4; weed(x, s.f - 0.02, z, hsh(ca, sd, 390 + j) * 6.283, 0.42, { sy: 0.5 + hsh(ca, sd, 395 + j) * 0.5, inst: true, tint: [0.6 * c, 0.75 * c, 0.5 * c] }, 2); st.weeds++; }
    }
    st['t_corners'] = Math.round(performance.now() - t0);
    // ======== 2. the feet of things that stand on the floor (gravestones, braziers, barrels, crates, a well, pillars without faces of their own)
    for (const c of w.colliders) {
      if (c.alive === false || c.ghost || c.trigger || c.shotOnly || c.enemyOnly || c.tg || (c.vis && !c.dest)) continue;
      const sx = c.x1 - c.x0, sz = c.z1 - c.z0; if (sx > 2.4 || sz > 2.4 || sx < 0.2 || sz < 0.2 || c.y1 - c.y0 < 0.35) continue;
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, f = floorNear(cx + sx / 2 + 0.15, cz, c.y0 + 0.02, 0.06); if (f === null || Math.abs(c.y0 - f) > 0.06) continue;
      if (!clearOf(cx, cz) || !reachNear(cx + sx / 2 + 0.8, cz, f)) continue;
      const R = Math.max(sx, sz) / 2, sd = cx * 1.31 + cz * 0.77;
      decal(cx, cz, f, 'grime', R * 2 + 1.2, hsh(cx, cz, 400) * 6.283, 0.75);
      const nI = Math.round((2 + hsh(cx, cz, 401) * 3) * QK);
      for (let j = 0; j < nI; j++) { const ang = hsh(cx, cz, 402 + j) * 6.283, rr = R + 0.05 + hsh(cx, cz, 412 + j) * 0.35; items.push({ x: cx + Math.cos(ang) * Math.min(sx / 2 + 0.06, rr), z: cz + Math.sin(ang) * Math.min(sz / 2 + 0.06, rr), f, j, sd, free: true }); }
      if (kind === 'out' && floorMk(cx + sx / 2 + 0.15, cz, f) === 'floor' && !overAt(w, cx + sx / 2 + 0.15, cz, f)) for (let j = 0; j < 4; j++) { const ang = hsh(cx, cz, 420 + j) * 6.283, x = cx + Math.cos(ang) * (sx / 2 + 0.08), z = cz + Math.sin(ang) * (sz / 2 + 0.08), c2 = 0.75 + hsh(cx, cz, 430 + j) * 0.4; if (floorNear(x, z, f, 0.06) === null) continue; weed(x, f - 0.02, z, ang * 3, 0.4, { sy: 0.45 + hsh(cx, cz, 440 + j) * 0.5, inst: true, tint: [0.6 * c2, 0.76 * c2, 0.5 * c2] }, 2); st.weeds++; }
    }
    {
      const wa = hsh(w.W || 1, w.D || 1, 777) * 6.283, wdx = Math.cos(wa), wdz = Math.sin(wa), snow = kind === 'frost';
      for (const c of FO.length ? w.colliders.concat(FO) : w.colliders) {
        if (!heapRoom()) break;
        if (c.alive === false || !c.vis || c.ghost || c.dest || c.tg || c.trigger || SKIPMK.has(c.mk)) continue;
        const sx = c.x1 - c.x0, sz = c.z1 - c.z0; if (sx > 1.8 || sz > 1.8 || sx < 0.3 || sz < 0.3 || c.y1 - c.y0 < 0.4 || c.y0 > fmax + 0.1) continue;
        const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
        if (hsh(cx, cz, 450) > (snow ? 0.85 : 0.5)) continue;
        const fi = snow ? (Math.abs(wdx) > Math.abs(wdz) ? (wdx > 0 ? 0 : 1) : (wdz > 0 ? 2 : 3)) : Math.floor(hsh(cx, cz, 451) * 4) % 4;
        const nx = fi === 0 ? 1 : fi === 1 ? -1 : 0, nz = fi === 2 ? 1 : fi === 3 ? -1 : 0, pl = fi === 0 ? c.x1 : fi === 1 ? c.x0 : fi === 2 ? c.z1 : c.z0, half = (nx ? sz : sx) / 2;
        const ox = nx ? pl + nx * 0.4 : cx, oz = nx ? cz : pl + nz * 0.4;
        const f = floorNear(ox, oz, c.y0 + 0.02, 0.08); if (f === null || Math.abs(c.y0 - f) > 0.08 || !clearOf(ox, oz) || !reachNear(ox + nx * 0.6, oz + nz * 0.6, f)) continue;
        if (!freeAt(ox, oz, f + 0.02, f + 0.4, 0.05) || (FO.length && !c.foot && inFoot(ox, oz, f + 0.05))) continue;
        const mx = nx ? pl - nx * 0.05 : cx, mz = nx ? cz : pl - nz * 0.05, ax = nx ? 0 : 1, az = nx ? 1 : 0, si = (cx * 13 + cz * 7) | 0;
        const ra = half + 0.12, rn = snow ? 0.9 + hsh(cx, cz, 452) * 0.9 : 0.28 + hsh(cx, cz, 453) * 0.22, hh = K.h * (snow ? 0.7 : 0.45 + 0.3 * hsh(cx, cz, 454));
        dome(mx, mz, f, ax, az, nx, nz, ra, rn, hh, 0, Math.PI, snow ? 12 : 9, si, snow);
        if (!snow) litter(mx, mz, f, ax, az, nx, nz, ra, rn, hh, 0, Math.PI, Math.round(6 * QK), cx + cz, c.mk);
        st.lee = (st.lee || 0) + 1;
      }
    }
    st['t_feet'] = Math.round(performance.now() - t0);
    // ======== 3. the open floor: marks on it, a few things lying about (fewer on the ways people walk)
    const DEC = K.dec * Math.min(1, 260 / Math.max(1, RC / 4.84 * K.dec)), OPK = Math.min(1, 380 / Math.max(1, RC / 3 * K.open * QK));
    const cum = (tab) => { const e = Object.entries(tab), t = e.reduce((a, q) => a + q[1], 0); let acc = 0; return e.map((q) => [q[0], (acc += q[1] / t)]); };
    const DCUM = cum(K.D), LCUM = cum(K.L), DSUM = 0, LSUM = 0;
    const pick = (c, _s, u) => { for (const q of c) if (u < q[1]) return q[0]; return c[c.length - 1][0]; };
    const X0 = (w.xo ? -w.xo : 0), Z0 = (w.zo ? -w.zo : 0), X1 = X0 + (w.Wn || w.W), Z1 = Z0 + (w.Dn || w.D);
    const fx0 = Math.max(0, X0), fz0 = Math.max(0, Z0);
    for (let gx = fx0 + 0.5; gx < X1; gx += 2.2) for (let gz = fz0 + 0.5; gz < Z1; gz += 2.2) {
      const x = gx + hsh(gx, gz, 500) * 2.2, z = gz + hsh(gx, gz, 501) * 2.2;
      if (!w.navIdx) continue;
      const i = w.navIdx(x, z); if (i < 0) continue;
      // (every storey of that cell)
      for (let L = 0; L < (w.L || 1); L++) {
        const n = L * (w.N || 0) + i; if (L && !w.N) break;
        if (!(w.nf[n] > -50) || (w.reachMask && !w.reachMask[n])) continue;
        const f = TERR ? floorNear(x, z, w.nf[n], 0.3) : w.nf[n]; if (f === null || w.nb[n] || !clearOf(x, z)) continue;
        const pth = path && path[n % w.N] ? 1 : 0;
        const u = hsh(x, z, 502 + L);
        if (u < DEC) {
          let t = pick(DCUM, DSUM, hsh(x, z, 503 + L));
          const grass = kind === 'out' && floorMk(x, z, f) === 'floor' && !overAt(w, x, z, f);
          if (grass && (t === 'moss' || t === 'chip' || t === 'crack1')) t = 'leafmold';
          if (pth && (t === 'leafmold' || t === 'moss')) t = 'grime';
          const D0 = DS[t], sz = D0[2] + hsh(x, z, 504 + L) * (D0[3] - D0[2]);
          decal(x, z, f, t, sz, hsh(x, z, 505 + L) * 6.283, 0.7 + 0.3 * hsh(x, z, 506 + L));
        }
        const e = K.open * 4.84 / 3 * QK * OPK * (pth ? 0.25 : 1), cnt = Math.floor(e) + (hsh(x, z, 507 + L) < e - Math.floor(e) ? 1 : 0);
        for (let j = 0; j < cnt; j++) items.push({ x: x + (hsh(x, z, 510 + j) - 0.5) * 2, z: z + (hsh(x, z, 520 + j) - 0.5) * 2, f, j, sd: x + z, free: true, open: true });
      }
    }
    st['t_open'] = Math.round(performance.now() - t0);
    // ======== 4. the things themselves
    const DI = new Map();
    const inst = (geo, mk, x, y, z, rx, ry, rz, sx, sy, sz, tint) => {
      const key = geo.uuid + '|' + mk; let q = DI.get(key); if (!q) DI.set(key, q = { geo, mk, a: [], c: [] });
      q.a.push(x, y, z, rx, ry, rz, sx, sy, sz); q.c.push(tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1);
      st.itemTris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    };
    const left = 60000 - st.heapTris - st.bandTris - st.decalTris - Math.min(WD.length + 40, WMAX) * 58 - st.vines * 6, est = items.reduce((a, it) => a + (it.t === 'grit' ? 8 : 22), 0);
    const keepK = est > left * 0.85 ? Math.max(0.1, left * 0.85 / est) : 1; st.keepK = Math.round(keepK * 100) / 100;
    const wallMk = (mk) => (mk === 'wall' || mk === 'block' || mk === 'trim' || mk === 'rock' || mk === 'cobble' ? mk : 'block');
    for (const it of items) {
      if (keepK < 1 && hsh(it.a || it.x, it.d || it.z, 997 + it.j) > (it.heap ? Math.min(1, keepK * 1.6) : it.corner ? Math.min(1, keepK * 2) : keepK)) continue;
      let x, z, f, y = 0;
      if (it.y !== undefined) { x = it.x; z = it.z; f = it.f; y = it.y; }
      else if (it.free) { x = it.x; z = it.z; f = floorNear(x, z, it.f, 0.06); if (f === null || !clearOf(x, z)) continue; y = f; }
      else {
        [x, z] = P2(it.r, it.a, it.d); const f0 = it.q ? it.q.f : it.f;
        // (on flat ground within a metre of the wall the floor is the one at its foot: the nav found it there, a metre out)
        f = !TERR && it.d < 1.0 ? f0 : floorNear(x, z, f0, 0.07); if (f === null || !clearOf(x, z)) continue;
        // (on the heap's slope where it lies on the heap)
        if (it.q) { const q = it.q, t = it.d / Math.max(0.05, q.wd); y = f + (t < 1 ? q.h * (t < 0.46 ? 1 - t * 0.87 : 0.6 * (1 - (t - 0.46) / 0.54) + 0.0) : 0) * 0.85; }
        else y = f;
      }
      const sd = it.sd, j = it.j, u1 = hsh(x, z, 600 + j), u2 = hsh(x, z, 601 + j), u3 = hsh(x, z, 602 + j), u4 = hsh(x, z, 603 + j);
      let t = it.t || (it.heap ? (u1 < 0.75 ? 'chunk' : 'pebble') : pick(LCUM, LSUM, u1));
      if (it.open && (t === 'chunk' || t === 'slab') && u4 < 0.6) t = 'pebble';
      if (it.s && !it.t && kind === 'out' && u4 < 0.45) t = pick(LCUM, LSUM, u1);   // (out of doors: leaves and twigs blown into the heap)
      else if (it.s && !it.t) t = it.s < 0.02 ? 'grit' : it.s < 0.04 ? (kind === 'forge' ? 'coal' : 'pebble') : it.heap ? 'chunk' : t;   // (on a heap: the size says what it is)
      const L = LT[t]; if (!L) continue;
      let s = it.s || L.s[0] + u2 * (L.s[1] - L.s[0]); if (it.heap && !it.s) s *= 1.15 + u3 * 0.9;
      const ry = u3 * 6.283;
      if (L.tuft) { weed(x, y - 0.02, z, ry, s * 0.5, { sy: s * (t === 'straw' ? 0.22 : 0.6), inst: true, tint: L.tint }, 0); st.weeds++; continue; }
      let mk = L.mk;
      if (mk === 'wall') mk = it.mk ? wallMk(it.mk) : kind === 'mine' ? 'rock' : 'block';
      if (mk === 'floor' && kind === 'out') mk = 'cobble';
      if (!(mk in w.mats) && !MT[mk]) continue;
      const geo = Array.isArray(SH[L.g]) ? SH[L.g][Math.floor(u4 * SH[L.g].length) % SH[L.g].length] : SH[L.g];
      const fy = L.fy[0] + u4 * (L.fy[1] - L.fy[0]);
      let tint = L.tint ? L.tint.map((v) => v * (0.8 + 0.4 * u2)) : null;
      if (t === 'leaf') { const c = LEAFC[Math.floor(u4 * LEAFC.length) % LEAFC.length], k = 0.7 + 0.5 * u2; tint = [c[0] * k, c[1] * k, c[2] * k]; }
      else if (!tint) { const k = 0.78 + 0.34 * u2; tint = [k, k * (0.97 + 0.04 * u4), k * (0.92 + 0.08 * u4)]; }
      const tilt = t === 'leaf' ? 0.3 : t === 'twig' || t === 'woodbit' || t === 'iron' ? 0.06 : 0.22;
      // (half sunk: what has lain a while settles into what is under it)
      const sink = t === 'leaf' ? -0.002 : s * fy * (t === 'pebble' || t === 'grit' || t === 'chunk' || t === 'coal' || t === 'slag' ? 0.28 : 0.15);
      inst(geo, mk, x, y - sink, z, (u1 - 0.5) * tilt, ry, (u4 - 0.5) * tilt, s, s * fy, L.sz === 'y' ? s * fy : L.sz === 'u' ? s : s * (0.7 + 0.5 * u1), tint);
      st.items++;
    }
    st['t_items'] = Math.round(performance.now() - t0);
    {
      WD.sort((p, q) => q[6] - p[6]); const wk = WD.length > WMAX ? WMAX / WD.length : 1; let wn = 0;
      for (const q of WD) {
        if (wn >= WMAX || (wk < 1 && hsh(q[0], q[2], 990) > (q[6] >= 2 ? Math.min(1, wk * 2) : q[6] ? wk : wk * 0.5))) continue;
        const u = hsh(q[0], q[2], 991), g = SH.weed[Math.floor(u * 3) % 3], sx = q[4] * (0.75 + 0.6 * hsh(q[0], q[2], 992)), sy = q[5].sy * (0.8 + 0.4 * u);
        grassMat(w); P.inst(w, w.mats.tuftUp ? 'tuftUp' : 'tuft', upGeo(g), M(q[0], q[1], q[2], sx, sy, sx * (0.75 + 0.5 * hsh(q[0], q[2], 993)), (hsh(q[0], q[2], 994) - 0.5) * 0.5, q[3], (hsh(q[0], q[2], 995) - 0.5) * 0.5), q[5].tint); wn++;
      }
      st.weedsAsked = WD.length; st.weeds = wn;
    }
    // ======== build: the heaps, the film, the marks, the things
    const mesh = (P3, U2, C, I, csz, mat, ro) => {
      if (!I.n || !mat) return null;
      const g = new THREE.BufferGeometry(), ix = I.out();
      g.setAttribute('position', new THREE.BufferAttribute(P3.out(), 3)); g.setAttribute('uv', new THREE.BufferAttribute(U2.out(), 2)); g.setAttribute('color', new THREE.BufferAttribute(C.out(), csz));
      g.setIndex(P3.n / 3 > 65535 ? new THREE.BufferAttribute(ix, 1) : new THREE.BufferAttribute(Uint16Array.from(ix), 1));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.userData.dress = 1; if (ro) m.renderOrder = ro;
      return m;
    };
    const DM = {};
    for (const k in DQ) { const q = DQ[k]; if (q.I.n) DM[k] = q; }
    st.decals = DQn;
    w.deferred.push((grp) => {
      const out = [mesh(HP, HU, HC, HI, 4, MT.heap), mesh(BP, BU, BC, BI, 4, MT.band, 1)];
      for (const k in DM) { const q = DM[k]; out.push(mesh(q.P, q.U, q.C, q.I, 4, MT[k], 2)); }
      for (const m of out) if (m) { if (m.material === MT.dry || m.material === MT.damp || m.material === MT.water) m.userData.decal = true; grp.add(m); }
      const e = new THREE.Euler(), qq = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), m4 = new THREE.Matrix4(), col = new THREE.Color();
      for (const q of DI.values()) {
        const n = q.a.length / 9, mat = w.mats[q.mk] || MT[q.mk]; if (!mat) continue;
        const im = new THREE.InstancedMesh(q.geo, mat, n);
        for (let i = 0; i < n; i++) {
          const o = i * 9; e.set(q.a[o + 3], q.a[o + 4], q.a[o + 5]); qq.setFromEuler(e); v.set(q.a[o], q.a[o + 1], q.a[o + 2]); sc.set(q.a[o + 6], q.a[o + 7], q.a[o + 8]);
          im.setMatrixAt(i, m4.compose(v, qq, sc)); im.setColorAt(i, col.setRGB(q.c[i * 3], q.c[i * 3 + 1], q.c[i * 3 + 2]));
        }
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.matrixAutoUpdate = false; im.userData.dress = 1;
        grp.add(im);
      }
    });
    // (for P.meadow: the metre cells by a wall's foot, and the ways people walk)
    w._dressNear = near; w._dressPath = path;
    st.ms = Math.round((performance.now() - t0) * 10) / 10; st.kind = kind;
    st.tris = st.heapTris + st.bandTris + Math.round(st.itemTris) + st.decalTris + st.vines * 6 + st.weeds * 58;
    w._dressStats = st;

    // ---- (the heaps and the film: helpers that close over this world)
    function heapRoom() { return st.heapTris < (kind === 'frost' ? 34000 : MULTI ? 8000 : nseg > 1500 ? 11000 : 14000); }
    // the band along run r: the film of dust (film: seven rows, see-through, a hair over the floor, its alpha falling to nothing over
    // the floor) or the drift of snow (eight rows, its section rounded - deep against the wall, sinking gently to the floor - its last two
    // rows flat on the floor and dithered out). Columns at each sample and, between two in a row, enough more to be spc apart; the outer
    // rows wander in and out by slow noise, so that no straight edge is drawn
    function band(r, prof, si, film, spc) {
      const fx = r.nx, fz = r.nz, pl = r.pl, up = (fx + fz) > 0 === !!fx, ins = prof[0].rock ? 0.3 : K.ins;
      const B = film ? { P: BP, U: BU, C: BC, I: BI } : { P: HP, U: HU, C: HC, I: HI }, NR = film ? (nseg > 1500 ? 5 : 7) : 8;
      const FT = NR === 7 ? [0, 0, 0.15, 0.35, 0.6, 0.85, 1] : [0, 0, 0.3, 0.7, 1], FA = NR === 7 ? [1, 1, 0.94, 0.74, 0.45, 0.16, 0] : [1, 1, 0.75, 0.25, 0];
      const DT = [0, 0, 0.12, 0.3, 0.5, 0.7, 0.86, 1];
      const FK = { crypt: 1.9, clean: 1.8, mine: 1.7, forge: 1.5, out: 1.25, wet: 1.2, frost: 1.25 }[kind];   // (the film's stuff a little paler than the floor it lies on: the texture under it is about half)
      const cr = film ? C1[0] * FK : C1[0], cg = film ? C1[1] * FK : C1[1], cbl = film ? C1[2] * FK : C1[2];
      let prev = -1;
      for (let i = 0; i < prof.length; i++) {
        const q = prof[i], q2 = prof[i + 1], joined = q2 && q2.k - q.k <= stride * 2, m = joined ? Math.max(1, Math.round((q2.a - q.a) / spc)) : 1;
        for (let k = 0; k < m; k++) {
          const u = k / m, L = (x, y) => x + (y - x) * u, a = joined ? L(q.a, q2.a) : q.a, f = joined ? L(q.f, q2.f) : q.f;
          const W = joined ? L(q.W, q2.W) : q.W, al = joined ? L(q.al, q2.al) : q.al, hd = joined ? L(q.hd, q2.hd) : q.hd, wd = joined ? L(q.wd, q2.wd) : q.wd;
          if (!film && hd < 0.004) { prev = -1; continue; }
          const vb = B.P.n / 3, P = B.P.need(NR * 3), U = B.U.need(NR * 2), C = B.C.need(NR * 4); let p = B.P.n, uu = B.U.n, c = B.C.n;
          const tone = 0.88 + 0.24 * n1d(a * 0.9, si + 21);
          for (let j = 0; j < NR; j++) {
            let d, y, A, ao = 1;
            if (film) { const t = FT[j]; d = j === 0 ? -0.06 : t * W * (j >= 2 ? 1 + (n1d(a * 2.4 + j * 3.1, si + 60 + j) - 0.5) * 0.6 : 1); y = f + 0.018 + 0.012 * (1 - t) * (1 - t); A = al * FA[j]; }
            else { const t = DT[j]; d = j === 0 ? -ins : t * wd * (j >= 4 ? 1 + (n1d(a * 2.2 + j * 2.7, si + 70 + j) - 0.5) * 0.45 : 1); const tt = Math.min(1, t / 0.86); y = f + 0.004 + (t >= 0.86 ? 0 : hd * Math.pow(Math.cos(tt * Math.PI / 2), 1.2) * (0.92 + 0.16 * n1d(a * 3.1 + j, si + 80))); A = t < 0.6 ? 1 : t < 0.8 ? 0.85 : t < 0.9 ? 0.55 : t < 0.99 ? 0.25 : 0; ao = j < 2 ? 0.8 : 1; }
            const x = fx ? pl + fx * d : a, z = fx ? a : pl + fz * d, kk = tone * ao;
            P[p++] = x; P[p++] = y; P[p++] = z; U[uu++] = x; U[uu++] = z; C[c++] = cr * kk; C[c++] = cg * kk; C[c++] = cbl * kk; C[c++] = A;
          }
          B.P.n = p; B.U.n = uu; B.C.n = c;
          if (prev >= 0) {
            const I = B.I.need((NR - 1) * 6); let o = B.I.n;
            for (let j = 0; j < NR - 1; j++) { const a0 = prev + j, a1 = a0 + 1, b0 = vb + j, b1 = b0 + 1; if (up) { I[o++] = a0; I[o++] = b0; I[o++] = a1; I[o++] = a1; I[o++] = b0; I[o++] = b1; } else { I[o++] = a0; I[o++] = a1; I[o++] = b0; I[o++] = a1; I[o++] = b1; I[o++] = b0; } }
            B.I.n = o; if (film) st.bandTris += (NR - 1) * 2; else st.heapTris += (NR - 1) * 2;
          }
          prev = vb;
        }
        if (!joined) prev = -1;
      }
    }
    // a heap: its middle at (cx, cz) let a little into the wall(s), on the floor f; (ax, az) along the wall, (nx, nz) out from it; ra
    // along, rn out (an ellipse), hh high; th0..th1 the angles it spans (0: along, PI/2: out - a half against one wall, a quarter in a
    // corner). Loose stuff: its height falls fast from the wall and slowly to nothing; snow: rounded. The last rings lie on the floor and
    // are dithered out, their edge wandering by the angle
    function dome(cx, cz, f, ax, az, nx, nz, ra, rn, hh, th0, th1, segs, si, snow) {
      const NR = RT.length, b = HP.n / 3, P = HP.need((segs + 1) * NR * 3), U = HU.need((segs + 1) * NR * 2), C = HC.need((segs + 1) * NR * 4);
      let p = HP.n, u = HU.n, c = HC.n;
      for (let i = 0; i <= segs; i++) {
        const th = th0 + (th1 - th0) * i / segs, ct = Math.cos(th), sn = Math.sin(th), e = 0.8 + 0.4 * n1d(th * 2.3 + (si & 255), si) + 0.12 * (n1d(th * 7.1, si + 9) - 0.5);
        for (let j = 0; j < NR; j++) {
          const t = RT[j], tt = t * (1 + (e - 1) * t), ox = (ax * ct * ra + nx * sn * rn) * tt, oz = (az * ct * ra + nz * sn * rn) * tt, x = cx + ox, z = cz + oz;
          const y = f + 0.004 + hh * hProf(t, snow) * (j ? 0.9 + 0.2 * n1d(th * 5 + j * 1.7, si + 30) : 1);
          const A = t < 0.77 ? 1 : t < 0.88 ? 0.85 : t < 0.99 ? 0.4 : 0, k = (j === 0 ? 0.72 : j === 1 ? 0.84 : 1) * (0.9 + 0.2 * n1d(th * 3 + j, si + 40));
          P[p++] = x; P[p++] = y; P[p++] = z; U[u++] = x; U[u++] = z; C[c++] = C1[0] * k * HK; C[c++] = C1[1] * k * HK; C[c++] = C1[2] * k * HK; C[c++] = A;
        }
      }
      HP.n = p; HU.n = u; HC.n = c;
      const I = HI.need(segs * (NR - 1) * 6); let o = HI.n;
      for (let i = 0; i < segs; i++) for (let j = 0; j < NR - 1; j++) {
        const a0 = b + i * NR + j, a1 = a0 + 1, b0 = a0 + NR, b1 = b0 + 1;
        // (a1 is the next ring out, b0 the next angle: the quad turned so that its face looks up - from the outer ring, the middle one being a point)
        const ux = P[b0 * 3 + 3] - P[a0 * 3 + 3], uz = P[b0 * 3 + 5] - P[a0 * 3 + 5], vx = P[a1 * 3] - P[a0 * 3], vz = P[a1 * 3 + 2] - P[a0 * 3 + 2];
        if (uz * vx - ux * vz > 0) { I[o++] = a0; I[o++] = b0; I[o++] = a1; I[o++] = a1; I[o++] = b0; I[o++] = b1; } else { I[o++] = a0; I[o++] = a1; I[o++] = b0; I[o++] = a1; I[o++] = b1; I[o++] = b0; }
      }
      HI.n = o; st.heapTris += segs * (NR - 1) * 2; st.domes = (st.domes || 0) + 1; if (!w._dressDomes) w._dressDomes = []; if (w._dressDomes.length < 60) w._dressDomes.push([cx, cz, f, nx, nz, ax, az]);   // (where the heaps are: for looking at them)
    }
    // what lies on a heap: n pieces, most of them grit, a few stones the size of an egg (a power of the dice: the small far outnumber
    // the large), half sunk in it; more near the wall, some rolled down onto the floor round its rim (fallen: blocks of the wall's own stone)
    function litter(cx, cz, f, ax, az, nx, nz, ra, rn, hh, th0, th1, n, sd, mk, fallen) {
      for (let j = 0; j < n; j++) {
        const th = th0 + (th1 - th0) * hsh(sd, j, 501), t = 0.12 + 1.0 * Math.pow(hsh(sd, j, 502), 0.8), ct = Math.cos(th), sn = Math.sin(th);
        const x = cx + (ax * ct * ra + nx * sn * rn) * t, z = cz + (az * ct * ra + nz * sn * rn) * t, y = f + hh * hProf(Math.min(1, t), kind === 'frost') * 0.9;
        const u = hsh(sd, j, 503), sz = fallen && u > 0.7 ? 0.06 + 0.12 * hsh(sd, j, 504) : 0.009 + 0.05 * Math.pow(u, 2.6);
        items.push({ x, z, f, y, s: sz, j: 200 + j, sd, heap: true, mk, free: true });
      }
    }
    // ---- (the marks: helpers that close over this world)
    // a mark on the floor centred at (x, z), size sz (by asp the other way), turned ry: a quad, or on uneven ground a grid of 3 x 3 laid
    // on it. Only where all of it lies on the floor at that height (not over a step's edge or a drop): else a third smaller, else none
    function decal(x, z, f, t, sz, ry, al, asp) {
      const D0 = DS[t]; if (!D0 || !MT[D0[1]] || DQn >= DMAX) return false;
      asp = asp || 1; const flat = t === 'puddle' || t === 'oil' || t === 'ice', terr = floorTg(x, z, f), N = terr ? 3 : 1;
      for (let tries = 0, s = sz; tries < 2; tries++, s *= 0.67) {
        const hx = s / 2, hz = s * asp / 2, cr = Math.cos(ry), sr = Math.sin(ry), pts = [];
        let ok = true;
        for (let j = 0; j <= N && ok; j++) for (let i = 0; i <= N; i++) {
          const lx = (i / N - 0.5) * 2 * hx, lz = (j / N - 0.5) * 2 * hz, px = x + lx * cr + lz * sr, pz = z - lx * sr + lz * cr;
          const fy = floorNear(px, pz, f, flat ? 0.025 : terr ? 0.25 : 0.05); if (fy === null) { ok = false; break; }
          pts.push(px, fy, pz, i / N, j / N);
        }
        if (!ok || (!terr && floorNear(x, z, f, 0.05) === null)) continue;
        lay(pts, N, t, al);
        if (flat) { if (!w._dressPuddles) w._dressPuddles = []; if (w._dressPuddles.length < 40) w._dressPuddles.push([x, z, f]); }   // (where the water stands: for looking at it)
        return true;
      }
      return false;
    }
    // a mark against a wall: along the foot of run r, centred at a, so long along it and so far out from it (the damp, its tide at the
    // top of its cell, runs in under the wall; the others lie out on the floor)
    function decalW(r, a, f, t, along, out, al, dc) {
      const D0 = DS[t]; if (!D0 || !MT[D0[1]]) return false;
      const ry = Math.atan2(r.nx, r.nz);
      if (t !== 'seep') { const c = P2(r, a, dc !== undefined ? dc : out / 2); return decal(c[0], c[1], f, t, along, ry, al, out / along); }
      for (const [u, d] of [[-0.4, 0.9], [0.4, 0.9], [0, 0.5]]) { const c = P2(r, a + u * along, d * out); if (floorNear(c[0], c[1], f, 0.05) === null) return false; }
      const pts = [];
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= 1; i++) { const c = P2(r, a + (i - 0.5) * along, j ? -0.1 : out); pts.push(c[0], f, c[1], i, j); }
      lay(pts, 1, t, al);
      return true;
    }
    // the mark's points (x, y, z, u, v for each of (N+1)^2) into its material's lot: each quad turned to look up
    function lay(pts, N, t, al) {
      const D0 = DS[t], q = DQ[D0[1]], cell = D0[0], cu = (cell % 4) / 4, cv = Math.floor(cell / 4) / 4, tn = lin(D0[4]), b = q.P.n / 3, nv = pts.length / 5;
      const P = q.P.need(nv * 3), U = q.U.need(nv * 2), C = q.C.need(nv * 4), A = Math.min(1, D0[5] * al);
      for (let k = 0; k < pts.length; k += 5) {
        P[q.P.n++] = pts[k]; P[q.P.n++] = pts[k + 1] + 0.02; P[q.P.n++] = pts[k + 2];   // (over the floor's own worked surface, which stands a little proud of its box)
        U[q.U.n++] = cu + (0.004 + pts[k + 3] * 0.992) / 4; U[q.U.n++] = cv + (0.004 + pts[k + 4] * 0.992) / 4;
        C[q.C.n++] = tn[0]; C[q.C.n++] = tn[1]; C[q.C.n++] = tn[2]; C[q.C.n++] = A;
      }
      const S = N + 1, I = q.I.need(N * N * 6);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a0 = b + j * S + i, a1 = a0 + 1, b0 = a0 + S, b1 = b0 + 1;
        const ux = P[a1 * 3] - P[a0 * 3], uz = P[a1 * 3 + 2] - P[a0 * 3 + 2], vx = P[b0 * 3] - P[a0 * 3], vz = P[b0 * 3 + 2] - P[a0 * 3 + 2];
        if (uz * vx - ux * vz > 0) { I[q.I.n++] = a0; I[q.I.n++] = b0; I[q.I.n++] = a1; I[q.I.n++] = a1; I[q.I.n++] = b0; I[q.I.n++] = b1; }
        else { I[q.I.n++] = a0; I[q.I.n++] = a1; I[q.I.n++] = b0; I[q.I.n++] = a1; I[q.I.n++] = b1; I[q.I.n++] = b0; }
      }
      st.decalTris += N * N * 2; DQn++;
    }
    function floorTg(x, z, f) { const e = cellOf(x, z); if (e) for (const d of e.F) if (d.tg && x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1 && Math.abs(top(d, x, z) - f) < 0.3) return true; return false; }
    function floorMk(x, z, f) { const e = cellOf(x, z); if (e) for (const d of e.F) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1 && Math.abs(top(d, x, z) - f) < 0.03) return d.tg ? 'floor' : d.mk; return null; }
  };
  P.DR = DR;

  // ---------- light fixtures ----------
  // wall torch. dir: outward normal from wall ('px','nx','pz','nz')
  P.torch = function (w, x, y, z, dir) {
    const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir];
    const ry = Math.atan2(d[0], d[1]);
    put(w, 'sconce', x, y, z, ry);   // (a plate nailed to the wall, a bent arm, a ring with claws, a brand wound with pitched rag: gfx.js)
    // (the light stands a step out from the wall, the flame on the brand: as a point at the flame it lit the wall a hand away to white)
    w.addLight(x + d[0] * 0.8, y + 0.6, z + d[1] * 0.8, { flame: 1, fp: new THREE.Vector3(x + d[0] * 0.38, y + 0.5, z + d[1] * 0.38) });
    // (the wall behind a brand is black with its soot. So too the flame is seen against it: the wall a hand from the flame is lit
    // brighter than the flame is drawn, and the flame was lost in it)
    if (G.Tex.spr.soot) {
      // (kept to the wall it is on: the box that holds a point just inside the wall behind the brand says how far that wall goes; what
      // of the sheet would stand past its edge is cut off, picture and all. No such box, or too little of it left: no soot)
      const px = x - d[0] * 0.06, pz = z - d[1] * 0.06, py = y + 0.9; let wall = null;
      for (let i = w.colliders.length - 1; i >= 0; i--) { const c = w.colliders[i]; if (px >= c.x0 && px <= c.x1 && pz >= c.z0 && pz <= c.z1 && py >= c.y0 && py <= c.y1) { wall = c; break; } }
      if (wall) {
        const W = 1.8 + hsh(x, z, 3) * 0.3, U0 = (d[0] ? z : x) - W / 2, U1 = U0 + W, V0 = y - 0.35, V1 = y + 2.85;
        const u0 = Math.max(U0, (d[0] ? wall.z0 : wall.x0) + 0.03), u1 = Math.min(U1, (d[0] ? wall.z1 : wall.x1) - 0.03), v0 = Math.max(V0, wall.y0 + 0.03), v1 = Math.min(V1, wall.y1 - 0.03);
        if (u1 - u0 > 0.5 && v1 - v0 > 1.0) {
          const mt = w._sootM || (w._sootM = new THREE.MeshBasicMaterial({ map: G.Tex.spr.soot, color: 0x100b07, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
          const g = new THREE.PlaneGeometry(1, 1), uv = g.attributes.uv, a0 = (u0 - U0) / W, a1 = (u1 - U0) / W, b0 = (v0 - V0) / (V1 - V0), b1 = (v1 - V0) / (V1 - V0);
          uv.setXY(0, a0, b1); uv.setXY(1, a1, b1); uv.setXY(2, a0, b0); uv.setXY(3, a1, b0);
          const sm = new THREE.Mesh(g, mt), uc = (u0 + u1) / 2;
          sm.position.set(d[0] ? x + d[0] * 0.014 : uc, (v0 + v1) / 2, d[0] ? uc : z + d[1] * 0.014); sm.rotation.y = ry; sm.scale.set(u1 - u0, v1 - v0, 1); sm.renderOrder = 1; sm.matrixAutoUpdate = false; sm.updateMatrix();
          sm.userData.decal = true;
          w.group.add(sm);
        }
      }
    }
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
      if (i === 0 && light !== false) w.addLight(x + ox, y + h + 0.014, z + oz, { flame: 0.35, intensity: 2.5, range: 5, prio: 0.5 });
      else w.lightSources.push({ pos: new THREE.Vector3(x + ox, y + h + 0.014, z + oz), color: '#ffb060', intensity: 0, range: 0, flame: 0.3, emit: true, noLight: true, ph: Math.random() * 99, prio: 0.0001 });
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
      if (i % 4 === 0) w.addLight(x + Math.cos(a) * 1.1, y + 0.274 + (i % 3) * 0.0325, z + Math.sin(a) * 1.1, { flame: 0.4, intensity: 10, range: 14, prio: 1.2 });
      else w.lightSources.push({ pos: new THREE.Vector3(x + Math.cos(a) * 1.1, y + 0.274 + (i % 3) * 0.0325, z + Math.sin(a) * 1.1), color: '#ffb060', intensity: 0, range: 0, flame: 0.35, emit: true, noLight: true, ph: Math.random() * 99, prio: 0.0001 });
    }
  };
  P.chain = function (w, x, y, z, len) {
    const n = Math.max(1, Math.floor(len / 0.18));
    for (let i = 0; i < n; i++) w.batch.geo('iron', PG.link, M(x, y + i * 0.18 + 0.09, z, 0.07, 0.11, 0.07, 0, i % 2 ? Math.PI / 2 : 0, 0));
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
      w.batch.geo('trim', PG.dodeW || PG.dode, M(x, top, z, r * 0.95, 0.25, r * 0.95, rr(rng, 0, 1), rr(rng, 0, 3), 0));
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
      w.batch.geo(mk || 'block', PG.dodeW || PG.dode, M(x + ox, y + sz * 0.5, z + oz, sz, sz * rr(rng, 0.5, 1), sz * rr(rng, 0.7, 1.2), rr(rng, 0, 3), rr(rng, 0, 3), 0), { su: 0.3, sv: 0.3 });
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
    w.addCollider(x - 0.5 * s, b, z - 0.5 * s, x + 0.5 * s, b + 2.45 * s, z + 0.5 * s);
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
      if (bg) { m.scale.y = len; const dv = new THREE.Mesh(bg[1].g, mat.clone()); dv.material.color.multiplyScalar(0.35); m.add(dv); dv.userData.noAudit = true; }
      m.castShadow = true; m.receiveShadow = true;
      m.userData.noAudit = true;   // (cloth that hangs and sways: walked through, and never taken for a wall - the check of what is seen against what stops you leaves it out)
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
      // (boards, battens, iron corners: gfx.js propGeo 'crate'; without it, the box with its bands)
      const cg = G.GFX && G.GFX.propGeo ? G.GFX.propGeo('crate') : null;
      if (cg) {
        for (const q of cg) { const m = new THREE.Mesh(q.g, w.mats[q.m] || w.mats.wood); m.scale.setScalar(s); g.add(m); }
        g.position.set(x, y, z); g.rotation.y = ry;
        g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
        grp.add(g); d.mesh = g; return;
      }
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
      if (explosive) { body.material = w.mats.wood.clone(); body.material.color.set('#5e2a1c'); }
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
