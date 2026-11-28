'use strict';
// The gloved hands of the first-person view. One hand mesh drawn by a person (js/handdata.js: the generic hand of the WebXR Input
// Profiles, made into a leather glove with its cuff, seams and a strap round the wrist) and its bones: the forearm, the thumb's three,
// and each finger's four (its metacarpal and three phalanges). Each joint turns about its own axes and no further than a human hand's
// does, and the joints go with each other as a hand's do (the last joint of a finger with the one before it, a finger with its
// neighbours, the little-finger side of the palm closing deeper in a fist). The skin follows the bones by dual quaternions (a bent
// knuckle keeps its volume), worked on the CPU, so the hands need no other shader.
//   X.openHand(): a hand to move, pose(f, t, w) each frame; X.hand(right, fist): closed on a grip; X.fistBare(right): a fist closed on
//   nothing; X.HAND_WRIST: the cuff's end on the hand that grips; X.warmHands: made behind the loading screen.
// The hand's space: the wrist joint at the origin, the palm to -y, the fingers to -z, the thumb to -x (a right hand), the forearm +z.
(function () {
  const X = G.GFX, D = G.HandData;
  if (!X || !D) return;
  const V3 = THREE.Vector3, QT = THREE.Quaternion;
  const H = (X.Hand = {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---- the bones (in the order of D.bones): 0 the forearm (the cuff, about the wrist); 1-3 the thumb (its root at the wrist, its
  // first joint, its second); then each finger, first to little: its metacarpal, and the bones after its knuckle, its middle joint
  // and its last joint. Each turns about its head, in its parent's frame (the palm's for those with none)
  const J = (nm) => new V3().fromArray(D.joints[nm]);
  const FN = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
  const B = [];
  B[0] = { head: new V3(), parent: -1 };
  B[1] = { head: J('thumb-metacarpal'), parent: -1 }; B[2] = { head: J('thumb-phalanx-proximal'), parent: 1 }; B[3] = { head: J('thumb-phalanx-distal'), parent: 2 };
  FN.forEach((f, i) => { const b = 4 + i * 4; B[b] = { head: J(f + '-metacarpal'), parent: -1 }; B[b + 1] = { head: J(f + '-phalanx-proximal'), parent: b }; B[b + 2] = { head: J(f + '-phalanx-intermediate'), parent: b + 1 }; B[b + 3] = { head: J(f + '-phalanx-distal'), parent: b + 2 }; });
  const UP = new V3(0, 1, 0);
  // the axis about which a bone running along d curls to the palm, turned by conv about the back of the finger (conv < 0: the finger,
  // as it curls, comes over towards the thumb - a hand's fingers point to the root of the thumb when they close)
  const flexAxis = (d, conv) => { const back = UP.clone().addScaledVector(d, -d.y).normalize(); return new V3().crossVectors(d, back.clone().negate()).normalize().applyAxisAngle(back, conv || 0); };
  // the axis that turns d towards u
  const toward = (d, u) => new V3().crossVectors(d, u).normalize();
  const CONV = [0.02, -0.04, -0.11, -0.19];
  FN.forEach((f, i) => {
    const b = 4 + i * 4, k = J(f + '-phalanx-proximal'), p = J(f + '-phalanx-intermediate'), d = J(f + '-phalanx-distal'), t = J(f + '-tip');
    const d1 = p.clone().sub(k).normalize(), d2 = d.clone().sub(p).normalize(), d3 = t.clone().sub(d).normalize();
    B[b].flex = flexAxis(k.clone().sub(B[b].head).normalize(), -0.5);
    B[b + 1].flex = flexAxis(d1, CONV[i]); B[b + 1].spread = UP.clone().addScaledVector(d1, -d1.y).normalize().negate();
    B[b + 2].flex = flexAxis(d2, CONV[i] * 1.2); B[b + 3].flex = flexAxis(d3, CONV[i] * 1.2);
  });
  {
    const T1 = B[1].head, T2 = B[2].head, T3 = B[3].head, T4 = J('thumb-tip'), td = T2.clone().sub(T1).normalize();
    // the root of the thumb: across the palm towards the root of the little finger, and out of the palm's plane to its front
    B[1].flex = toward(td, J('pinky-finger-phalanx-proximal').add(new V3(0, -0.02, 0.012)).sub(T1));
    const m = B[1].flex.clone(); if (m.y > 0) m.negate();
    B[1].abd = toward(td, m);
    const palmC = new V3(0.008, -0.032, -0.062);
    B[2].flex = toward(T3.clone().sub(T2).normalize(), palmC.clone().sub(T2));
    B[3].flex = toward(T4.clone().sub(T3).normalize(), palmC.clone().sub(T3));
  }
  // the forearm about the wrist: the hand bent to its palm (+) carries the forearm to the palm's side; bent to its little finger (+),
  // the forearm to the little finger's side
  B[0].flex = new V3(1, 0, 0); B[0].dev = new V3(0, 1, 0);

  // ---- how far each joint goes (radians). A finger: [knuckle, middle joint, last joint, spread (+ towards the little finger)]; the
  // thumb: [root (across the palm), first joint, second joint, spread (out of the palm's plane, to its front)]; the wrist: [bent to
  // the palm (+) or back, bent to the little finger (+) or the thumb]
  const LIM = {
    mcp: [-0.35, 1.57], pip: [-0.05, 1.83], dip: [-0.1, 1.31],
    spr: [[-0.35, 0.17], [-0.2, 0.2], [-0.2, 0.2], [-0.17, 0.35]],
    thumb: [[-0.35, 0.9], [-0.15, 0.95], [-0.25, 1.4], [-0.3, 0.9]],
    wrist: [[-1.05, 1.2], [-0.35, 0.55]],
  };
  H.LIM = LIM;
  const REST = { f: [0.22, 0.32, 0.2], t: [0.15, 0.22, 0.25] };
  // the angles each bone is given: per finger [knuckle, middle, last, spread] (0-15), the thumb's four (16-19), the wrist's two (20,
  // 21), the metacarpals of the ring and little fingers (22, 23)
  const A = new Float32Array(24), _m = [0, 0, 0, 0], _p = [0, 0, 0, 0];
  const PULL = [0.1, 0.12, 0.2, 0.12];
  const pull = (arr, i, k) => { let v = arr[i]; for (const j of [i - 1, i + 1]) if (j >= 0 && j < 4) { const dd = arr[j] - arr[i]; v += k * Math.sign(dd) * Math.max(0, Math.abs(dd) - 0.55); } return v; };
  function solve(f, t, w) {
    for (let i = 0; i < 4; i++) { const q = (f && f[i]) || REST.f; _m[i] = clamp(+q[0] || 0, LIM.mcp[0], LIM.mcp[1]); _p[i] = clamp(+q[1] || 0, LIM.pip[0], LIM.pip[1]); }
    for (let i = 0; i < 4; i++) {
      const q = (f && f[i]) || REST.f, m = clamp(pull(_m, i, PULL[i]), LIM.mcp[0], LIM.mcp[1]), p = clamp(pull(_p, i, PULL[i]), LIM.pip[0], LIM.pip[1]);
      // the last joint goes with the middle one: it cannot stay straight while the middle bends far, nor bend far while it is straight
      const d = clamp(clamp(+q[2] || 0, 0.55 * p - 0.08, 0.35 + 0.85 * p), LIM.dip[0], LIM.dip[1]);
      // the fingers come together as they close
      const s = clamp((+q[3] || 0) * (1 - 0.65 * clamp(m / 1.4, 0, 1)), LIM.spr[i][0], LIM.spr[i][1]);
      A[i * 4] = m; A[i * 4 + 1] = p; A[i * 4 + 2] = d; A[i * 4 + 3] = s;
    }
    const tt = t || REST.t;
    for (let k = 0; k < 4; k++) A[16 + k] = clamp(+tt[k] || 0, LIM.thumb[k][0], LIM.thumb[k][1]);
    A[20] = clamp(w ? +w[0] || 0 : 0, LIM.wrist[0][0], LIM.wrist[0][1]); A[21] = clamp(w ? +w[1] || 0 : 0, LIM.wrist[1][0], LIM.wrist[1][1]);
    // the palm hollows on the little finger's side as those fingers close
    A[22] = 0.1 * Math.max(0, A[8]); A[23] = 0.24 * Math.max(0, A[12]);
    return A;
  }
  H.solve = solve;

  // ---- each bone's place: x -> BQ x + BT (in the hand's space)
  const NB = B.length, BQ = B.map(() => new QT()), BT = B.map(() => new V3()), _ql = new QT(), _q2 = new QT(), _v = new V3(), QI = new QT();
  const qa = (out, ax, a) => out.setFromAxisAngle(ax, a);
  function place() {
    for (let b = 0; b < NB; b++) {
      const bb = B[b];
      if (b === 0) qa(_ql, bb.flex, A[20]).multiply(qa(_q2, bb.dev, A[21]));
      else if (b === 1) qa(_ql, bb.abd, A[19]).multiply(qa(_q2, bb.flex, A[16]));
      else if (b === 2) qa(_ql, bb.flex, A[17]);
      else if (b === 3) qa(_ql, bb.flex, A[18]);
      else {
        const i = (b - 4) >> 2, k = (b - 4) & 3;
        if (k === 0) { if (i >= 2) qa(_ql, bb.flex, A[20 + i]); else _ql.identity(); }
        else if (k === 1) qa(_ql, bb.spread, A[i * 4 + 3]).multiply(qa(_q2, bb.flex, A[i * 4]));
        else qa(_ql, bb.flex, A[i * 4 + k - 1]);
      }
      const pq = bb.parent < 0 ? QI : BQ[bb.parent], pt = bb.parent < 0 ? null : BT[bb.parent];
      BQ[b].copy(pq).multiply(_ql);
      _v.copy(bb.head).applyQuaternion(_ql).negate().add(bb.head).applyQuaternion(pq); if (pt) _v.add(pt);
      BT[b].copy(_v);
    }
  }
  H.place = place; H.BQ = BQ; H.BT = BT; H.B = B;

  // ---- the mesh (decoded once): its corners at rest, their normals, uv (in metres, laid on from the side each faces most), the bones
  // and weights of each
  // (the leather's grain: one repeat of it every 3.6 cm)
  const HT = 0.036;
  let MESH = null;
  const dec = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
  function mesh() {
    if (MESH) return MESH;
    const t0 = performance.now(), q = dec(D.pos, Uint16Array), n = q.length / 3, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = D.lo[k] + (D.hi[k] - D.lo[k]) * q[i * 3 + k] / 65535;
    const idx = dec(D.idx, Uint16Array), bi = dec(D.bi, Uint8Array), bq = dec(D.bw, Uint8Array), bw = new Float32Array(bq.length);
    for (let i = 0; i < bq.length; i++) bw[i] = bq[i] / 255;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const nor = g.attributes.normal.array, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]), x = pos[i * 3] / HT, y = pos[i * 3 + 1] / HT, z = pos[i * 3 + 2] / HT;
      if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else if (ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
    }
    MESH = { n, pos, nor, bi, bw, uv: new THREE.BufferAttribute(uv, 2), ix: { hand: new THREE.BufferAttribute(idx.slice(0, D.ti), 1), pad: new THREE.BufferAttribute(new Uint16Array(0), 1), strap: new THREE.BufferAttribute(idx.slice(D.ti, D.ti + D.ts), 1) } };
    X.stats.hand += Math.round(performance.now() - t0);
    return MESH;
  }
  H.mesh = mesh;

  // ---- the skin: each corner by its bones' dual quaternions, blended (so a bent joint is not pinched thin); into op / on
  const DR = new Float32Array(NB * 4), DD = new Float32Array(NB * 4);
  function skin(op, on) {
    const M = mesh(), P = M.pos, N = M.nor, bi = M.bi, bw = M.bw;
    for (let b = 0; b < NB; b++) {
      const q = BQ[b], t = BT[b], o = b * 4;
      DR[o] = q.x; DR[o + 1] = q.y; DR[o + 2] = q.z; DR[o + 3] = q.w;
      DD[o] = 0.5 * (q.w * t.x + t.y * q.z - t.z * q.y); DD[o + 1] = 0.5 * (q.w * t.y + t.z * q.x - t.x * q.z); DD[o + 2] = 0.5 * (q.w * t.z + t.x * q.y - t.y * q.x); DD[o + 3] = -0.5 * (t.x * q.x + t.y * q.y + t.z * q.z);
    }
    for (let i = 0, n = M.n; i < n; i++) {
      const i4 = i * 4, b0 = bi[i4] * 4;
      let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0;
      for (let k = 0; k < 4; k++) {
        const w = bw[i4 + k]; if (!w) continue; const o = bi[i4 + k] * 4;
        const s = DR[o] * DR[b0] + DR[o + 1] * DR[b0 + 1] + DR[o + 2] * DR[b0 + 2] + DR[o + 3] * DR[b0 + 3] < 0 ? -w : w;
        rx += s * DR[o]; ry += s * DR[o + 1]; rz += s * DR[o + 2]; rw += s * DR[o + 3]; dx += s * DD[o]; dy += s * DD[o + 1]; dz += s * DD[o + 2]; dw += s * DD[o + 3];
      }
      const l = 1 / (Math.hypot(rx, ry, rz, rw) || 1); rx *= l; ry *= l; rz *= l; rw *= l; dx *= l; dy *= l; dz *= l; dw *= l;
      // the translation: 2 (d r*)
      const tx = 2 * (rw * dx - dw * rx + ry * dz - rz * dy), ty = 2 * (rw * dy - dw * ry + rz * dx - rx * dz), tz = 2 * (rw * dz - dw * rz + rx * dy - ry * dx);
      const i3 = i * 3;
      for (let pass = 0; pass < 2; pass++) {
        const src = pass ? N : P, dst = pass ? on : op, x = src[i3], y = src[i3 + 1], z = src[i3 + 2];
        // x + 2 r x (r x x + w x)
        const cx = ry * z - rz * y + rw * x, cy = rz * x - rx * z + rw * y, cz = rx * y - ry * x + rw * z;
        let ox = x + 2 * (ry * cz - rz * cy), oy = y + 2 * (rz * cx - rx * cz), oz = z + 2 * (rx * cy - ry * cx);
        if (!pass) { ox += tx; oy += ty; oz += tz; }
        dst[i3] = ox; dst[i3 + 1] = oy; dst[i3 + 2] = oz;
      }
    }
  }
  H.skin = skin;
  const CUFF = new V3().fromArray(D.cuff.at), ZF = new V3(0, 0, 1);
  // where the cuff ends and the way the forearm runs from it, as the hand is posed now
  const cuffNow = (at, dir) => { at.copy(CUFF).applyQuaternion(BQ[0]).add(BT[0]); dir.copy(ZF).applyQuaternion(BQ[0]); };

  // ---- the glove's making, for H.dress to draw (each corner, at rest). Each kind of seam has its own numbers, each running on
  // smoothly over the glove (were they one, a triangle between two seams of different kinds would draw a false line):
  //   hRest - where the corner is (the leather's grain is fixed to it)
  //   hA - the seams down the sides of the fingers and the thumb and round their tips (where the surface faces neither back nor
  //     palm): [how much there is one, the distance across it (m), the length along it (m)]; and how much of the seam round the root
  //     of the thumb there is
  //   hB - the back's three rows of stitching: [how much, a place across them (0 on the first row, 1 on the second, 2 on the third,
  //     on smoothly between), the space between them there (m), the length along them (m)]
  //   hC - the seam round the root of the thumb [across, along]; the stitching round the cuff and along the strap's edges [across, along]
  //   hMisc - [1 on the glove (plus how much cuff or strap stitching there is), its place along a finger or the thumb as its joints counted (the knuckle 0, the middle joint 1, the last 2; the thumb's 1 and 2), the
  //     creases there (+ over the back of the joint, - across its palm side), how worn it is (the tips, the pads, the knuckles, the heel
  //     of the palm)]
  let MAKING = null;
  function making() {
    if (MAKING) return MAKING;
    const M = mesh(), n = M.n, P = M.pos, bi = M.bi, bw = M.bw, nh = D.nh;
    // (the normals smoothed over their neighbours first: which way the surface faces decides where the side seams run, and the
    // creases and the lightened mesh would make them wander)
    const N = Float32Array.from(M.nor), ix = M.ix.hand.array;
    for (let it = 0; it < 4; it++) {
      const acc = new Float32Array(n * 3);
      for (let f = 0; f < ix.length; f += 3) for (let a = 0; a < 3; a++) { const v = ix[f + a]; for (let b = 0; b < 3; b++) { const w = ix[f + b]; acc[v * 3] += N[w * 3]; acc[v * 3 + 1] += N[w * 3 + 1]; acc[v * 3 + 2] += N[w * 3 + 2]; } }
      for (let i = 0; i < nh; i++) { const l = Math.hypot(acc[i * 3], acc[i * 3 + 1], acc[i * 3 + 2]) || 1; N[i * 3] = acc[i * 3] / l; N[i * 3 + 1] = acc[i * 3 + 1] / l; N[i * 3 + 2] = acc[i * 3 + 2] / l; }
    }
    const hA = new Float32Array(n * 4), hB = new Float32Array(n * 4), hC = new Float32Array(n * 4), misc = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { hA[i * 4 + 1] = 0.03; hC[i * 4] = 0.03; hC[i * 4 + 2] = 0.03; misc[i * 4 + 1] = -0.5; }
    const wOf = (i, b) => { let s = 0; for (let k = 0; k < 4; k++) if (bi[i * 4 + k] === b) s += bw[i * 4 + k]; return s; };
    const sat = (v) => clamp(v, 0, 1), p = new V3(), nn = new V3(), r = new V3(), mfA = new Float32Array(n);
    // a chain of bones (a finger's, the thumb's): its joints, its bones, which way its back faces, the creases at each joint, how far
    // round it is to its side (m)
    const chain = (js, bs, upRef, cD, cP, rad, v0) => {
      const L = [], dirs = [], backs = [], cum = [0];
      for (let k = 0; k < bs.length; k++) { const d = js[k + 1].clone().sub(js[k]); L.push(d.length()); d.normalize(); dirs.push(d); backs.push(upRef.clone().addScaledVector(d, -upRef.dot(d)).normalize()); cum.push(cum[k] + L[k]); }
      for (let i = 0; i < nh; i++) {
        let mf = 0, best = -1, bwm = 0; for (let k = 0; k < bs.length; k++) { const w = wOf(i, bs[k]); mf += w; if (w > bwm) { bwm = w; best = k; } }
        // (the distance across the seam is given wherever the chain has any weight, so that it runs on smoothly to where there is no seam)
        const on = sat((mf - 0.35) / 0.3), o = i * 4; if (mf <= 0.02 || best < 0 || mf < mfA[i]) continue; mfA[i] = mf;
        p.fromArray(P, i * 3); nn.fromArray(N, i * 3);
        const k = best, d = dirs[k], bk = backs[k], t = r.copy(p).sub(js[k]).dot(d); r.addScaledVector(d, -t);
        const side = Math.abs(r.dot(new V3().crossVectors(d, bk))), cs = clamp(nn.dot(bk), -1, 1), last = k === bs.length - 1, ax = cum[k] + t;
        // (the side seams begin past the web between the fingers, as a glove's do)
        hA[o] = on * (k ? 1 : sat((t - 0.38 * L[0]) / (0.2 * L[0]))); hA[o + 1] = Math.asin(cs) * rad; hA[o + 2] = cum[k] + Math.min(t, L[k]) + (last ? Math.max(0, 0.0085 - side) : 0);
        // the creases: at the nearest joint along the chain (its place given, as the seam's, wherever the chain has any weight)
        let u = 1, ji = 0; for (let j = 0; j < cD.length; j++) { const uu = ax - cum[j]; if (Math.abs(uu) < Math.abs(u)) { u = uu; ji = j; } }
        const back = Math.pow(sat((cs - 0.3) / 0.5), 1.5), palm = sat((-cs - 0.3) / 0.45);
        // (the place along the chain given as joints counted - the first joint at v0, the next at v0 + 1 - running on smoothly between
        // them: the shader finds the nearest joint. The distance to the nearest joint itself would jump halfway between two joints)
        let v = v0; for (let j = 0; j < bs.length; j++) if (ax > cum[j] || j === 0) v = v0 + j + (ax - cum[j]) / L[j];
        misc[o + 1] = v; misc[o + 2] = on * (back * cD[ji] - palm * cP[ji]); if (on <= 0) continue;
        // worn: the tip and the pad of the last bone, the knuckles over the joints
        const tipW = last ? sat((t - 0.35 * L[k]) / (0.5 * L[k])) * (0.55 + 0.45 * palm) : 0, kn = back * Math.exp(-((u / 0.007) ** 2)) * (ji ? 0.55 : 0.8);
        misc[o + 3] = Math.max(misc[o + 3], on * Math.max(tipW, kn));
      }
    };
    FN.forEach((f, i) => { const b = 4 + i * 4; chain([B[b + 1].head, B[b + 2].head, B[b + 3].head, J(f + '-tip')], [b + 1, b + 2, b + 3], UP, [0.8, 1, 0.8], [1, 1, 0.8], 0.0092, 0); });
    chain([B[2].head, B[3].head, J('thumb-tip')], [2, 3], new V3(-0.62, 0.78, 0).normalize(), [0.5, 0.8], [0.9, 0.9], 0.0105, 1);
    const T1 = B[1].head, T2 = B[2].head, ta = T2.clone().sub(T1).normalize(), tp0 = T1.clone().lerp(T2, 0.42);
    const tref = new V3(0, 1, 0).addScaledVector(ta, -ta.y).normalize(), tref2 = new V3().crossVectors(ta, tref);
    // the back's three rows of stitching, from between the knuckles towards the wrist (in the plane of the back)
    const rows = [[0, 1], [1, 2], [2, 3]].map(([a, b]) => { const k0 = B[5 + a * 4].head.clone().add(B[5 + b * 4].head).multiplyScalar(0.5), p0 = new V3(k0.x, 0, k0.z + 0.012), p1 = new V3(k0.x * 0.55 + 0.002, 0, -0.028), dd = p1.clone().sub(p0), L = dd.length(); dd.normalize(); return { p0, dd, L, pp: new V3(dd.z, 0, -dd.x) }; });
    const cx = D.cuff.at[0], cy = D.cuff.at[1], cz = D.cuff.at[2] - 0.0055;
    for (let i = 0; i < nh; i++) {
      p.fromArray(P, i * 3); nn.fromArray(N, i * 3); const o = i * 4;
      // round the root of the thumb (where it is set into the glove; the round begun under the palm)
      const wth = wOf(i, 1) + wOf(i, 2) + wOf(i, 3); r.copy(p).sub(tp0); const rad = Math.hypot(r.dot(tref), r.dot(tref2));
      hA[o + 3] = sat((wth - 0.12) / 0.2) * sat((0.03 - rad) / 0.006); hC[o] = r.dot(ta); hC[o + 1] = Math.atan2(-r.dot(tref2), -r.dot(tref)) * 0.014;
      // the back's rows
      const q = new V3(p.x, 0, p.z), e = rows.map((R) => q.clone().sub(R.p0).dot(R.pp)), t = q.clone().sub(rows[1].p0).dot(rows[1].dd);
      const j = e[1] < 0 ? 0 : 1, sp = Math.max(0.004, e[j] - e[j + 1]);
      hB[o] = sat((nn.y - 0.55) / 0.3) * (wOf(i, 0) < 0.5 ? 1 : 0) * sat(t / 0.006 + 0.5) * sat((rows[1].L - t) / 0.006 + 0.5); hB[o + 1] = j + e[j] / sp; hB[o + 2] = sp; hB[o + 3] = t;
      // the stitching round the cuff, a little above its hem (on its outside)
      const rr = Math.hypot(p.x - cx, p.y - cy);
      misc[o] = 1 + sat((rr - 0.02) / 0.003) * sat((wOf(i, 0) - 0.95) / 0.03); hC[o + 2] = p.z - cz; hC[o + 3] = Math.atan2(p.y - cy, p.x - cx) * 0.03;
      // worn: the heel of the palm
      misc[o + 3] = Math.max(misc[o + 3], sat((-nn.y - 0.4) / 0.4) * sat((p.z + 0.035) / 0.02) * (wOf(i, 0) < 0.6 ? 0.5 : 0));
    }
    // the strap: a row of stitches along each of its edges (as one number: the distance from the nearer row, signed, the middle of the
    // band far from both)
    for (let i = nh; i < n; i++) {
      p.fromArray(P, i * 3); const o = i * 4; misc[o] = 2; misc[o + 3] = 0.2;
      hC[o + 2] = Math.abs(p.z - 0.019) - 0.0044; hC[o + 3] = Math.atan2(p.y - cy, p.x - cx) * 0.03;
    }
    const BA = (a, k) => new THREE.BufferAttribute(a, k);
    MAKING = { hRest: BA(P, 3), hA: BA(hA, 4), hB: BA(hB, 4), hC: BA(hC, 4), hMisc: BA(misc, 4) };
    return MAKING;
  }
  const MAKE_ATTR = ['hRest', 'hA', 'hB', 'hC', 'hMisc'];

  // three geometries over the same corners: the glove, its hard patches (none on this glove: kept, empty, for those who draw it) and
  // the strap round the wrist
  function parts(pa, na) {
    const M = mesh(), K = making(), out = {};
    for (const k of ['hand', 'pad', 'strap']) { const g = new THREE.BufferGeometry(); g.setAttribute('position', pa); g.setAttribute('normal', na); g.setAttribute('uv', M.uv); for (const a of MAKE_ATTR) g.setAttribute(a, K[a]); g.setIndex(M.ix[k]); out[k] = g; }
    return out;
  }

  // ---- the leather drawn: H.dress(material, 'glove' | 'strap') makes a MeshStandardMaterial draw, on the hand's corners (those with
  // hMisc), the glove's grain, its seams (a groove, its stitches in a thread a little paler than the leather, thin and short, gone where finer than a pixel), the creases over its joints and the wear
  // (paler, smoother) where a hand rubs; elsewhere the material is as it was
  const DRESS_V = ['attribute vec3 hRest;', 'attribute vec4 hA;', 'attribute vec4 hB;', 'attribute vec4 hC;', 'attribute vec4 hMisc;', 'varying vec3 vHRest;', 'varying vec4 vHA;', 'varying vec4 vHB;', 'varying vec4 vHC;', 'varying vec4 vHMisc;'].join('\n');
  const DRESS_F = `varying vec3 vHRest;
varying vec4 vHA;
varying vec4 vHB;
varying vec4 vHC;
varying vec4 vHMisc;
float hDashOf(float s) { float f = fract(s / 0.0034); return smoothstep(0.12, 0.22, f) * (1.0 - smoothstep(0.5, 0.6, f)); }
float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 hPerturb(vec3 sp, vec3 sn, vec2 dh, float fd) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * sn - grad);
}`;
  // the hand's part of the shading: its height (m), how much of it is thread, how much in a groove or a crease, how worn
  const DRESS_MAP = `
  float hOn = step(0.5, vHMisc.x), hPx = length(fwidth(vHRest)) + 1e-6;
  float hG1 = hNoise(vHRest * 1300.0), hG2 = hNoise(vHRest * 380.0), hG3 = hNoise(vHRest * 70.0), hGa = clamp(1.6 - hPx / 0.0006, 0.0, 1.0);
  float hH = ((hG1 - 0.5) * 0.0001 + (hG2 - 0.5) * 0.0001) * hGa;
  float hMA = vHA.x, hDA = vHA.y, hMC = vHA.w, hDC = vHC.x, hMB = vHB.x, hMD = clamp(vHMisc.x - 1.0, 0.0, 1.0), hDD = vHC.z;
  float hDB = (vHB.y - clamp(floor(vHB.y + 0.5), 0.0, 2.0)) * vHB.z;
  float hGroove = hMA * exp(-pow(hDA / 0.00075, 2.0)) + hMC * exp(-pow(hDC / 0.00075, 2.0)) + hMD * 0.4 * exp(-pow(hDD / 0.0008, 2.0));
  float hThread = hMA * hDashOf(vHA.z) * exp(-pow((abs(hDA) - 0.0021) / 0.00026, 2.0)) + hMC * hDashOf(vHC.y) * exp(-pow((abs(hDC) - 0.0021) / 0.00026, 2.0))
    + hMB * hDashOf(vHB.w) * exp(-pow(hDB / 0.00028, 2.0)) + hMD * hDashOf(vHC.w) * exp(-pow(hDD / 0.00028, 2.0));
  hThread *= clamp(1.8 - hPx / 0.0005, 0.0, 1.0);
  hH += -min(hGroove, 1.0) * 0.00055 + (hMA * exp(-pow((abs(hDA) - 0.0017) / 0.001, 2.0)) + hMC * exp(-pow((abs(hDC) - 0.0017) / 0.001, 2.0))) * 0.0002
    + hMB * exp(-pow(hDB / 0.0014, 2.0)) * 0.00028 + hThread * 0.0001;
  float hU = (vHMisc.y - clamp(floor(vHMisc.y + 0.5), 0.0, 2.0)) * 0.026, hC = vHMisc.z, hWear = clamp(vHMisc.w, 0.0, 1.0);
  float hCb = max(hC, 0.0) * exp(-pow(hU / 0.0055, 2.0)) * pow(abs(cos(hU / 0.0024 * 3.14159)), 4.0);
  float hCp = max(-hC, 0.0) * exp(-pow(hU / 0.0012, 2.0));
  hH -= (hCb * 0.0006 + hCp * 0.0006);
  hH *= hOn;
  vec3 hBase = diffuseColor.rgb * (1.0 + (hG2 - 0.5) * 0.1 * hGa) * mix(1.0, 1.22, hWear);
  hBase *= 1.0 - clamp(hGroove * 0.5 + hCb * 0.55 + hCp * 0.5, 0.0, 0.6);
  hBase = mix(hBase, diffuseColor.rgb * H_THREAD, clamp(hThread, 0.0, 1.0) * 0.8);
  diffuseColor.rgb = mix(diffuseColor.rgb, hBase, hOn);
`;
  H.dress = function (mat, look) {
    if (!mat || mat.userData.handDress) return mat;
    const strap = look === 'strap', base = mat.onBeforeCompile;
    mat.userData.handDress = look || 'glove';
    mat.onBeforeCompile = (sh, r) => {
      if (base) base(sh, r);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DRESS_V).replace('#include <begin_vertex>', '#include <begin_vertex>\nvHRest = hRest; vHA = hA; vHB = hB; vHC = hC; vHMisc = hMisc;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n#define H_THREAD ' + (strap ? '1.4' : '1.28') + '\n' + DRESS_F)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + DRESS_MAP)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, clamp(' + (strap ? '0.55' : '0.64') + ' - hWear * 0.2 + hThread * 0.08 + hGroove * 0.12 + (hG1 - 0.5) * 0.08 + (hG3 - 0.5) * 0.14, 0.3, 1.0), hOn);')
        .replace('#include <normal_fragment_maps>', 'vec3 hN0 = normal;\n#include <normal_fragment_maps>\nvec3 hN1 = hPerturb(-vViewPosition, hN0, vec2(dFdx(hH), dFdy(hH)), faceDirection);\nnormal = hOn > 0.5 ? hN1 : normal;');
    };
    const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    mat.customProgramCacheKey = () => key() + '|hand-' + (look || 'glove');
    mat.needsUpdate = true;
    return mat;
  };

  // ---- a hand to move (a right hand: a left one is this under a parent turned over in x). Its corners are its own.
  // pose(f, t, w): f, the four fingers (first to little), each [knuckle, middle joint, last joint, spread]; t, the thumb [root, first
  // joint, second joint, spread]; w (if given) the wrist [bent to the palm, bent to the little finger] - the cuff and the sleeve go with
  // the forearm (cuff(at, dir) gives where). Radians, 0 the hand laid flat; each held within LIM, the joints going with each other
  X.openHand = function () {
    const M = mesh(), pa = new THREE.BufferAttribute(Float32Array.from(M.pos), 3), na = new THREE.BufferAttribute(Float32Array.from(M.nor), 3);
    pa.setUsage(THREE.DynamicDrawUsage); na.setUsage(THREE.DynamicDrawUsage);
    const own = parts(pa, na);
    for (const k in own) { own[k].computeBoundingSphere(); own[k].boundingSphere = new THREE.Sphere(new V3(0, 0, -0.06), 0.2); }
    const ang = new Float32Array(24);
    const pose = (f, t, w) => { solve(f, t, w); place(); skin(pa.array, na.array); ang.set(A); pa.needsUpdate = true; na.needsUpdate = true; };
    const cuff = (at, dir) => { const a = A.slice(); A.set(ang); place(); cuffNow(at || new V3(), dir || new V3()); A.set(a); return { at, dir }; };
    pose(null, null, null);
    return { hand: own.hand, pad: own.pad, strap: own.strap, pose, cuff, rest: REST };
  };

  // ---- closed on something. Each grip: the fingers' and thumb's angles, the wrist's, and from - how the hand's space is laid in the
  // grip's: a basis, then a turn (r, x-y-z, radians), then a move (at).
  //   trig: the right hand on a pistol grip. The grip runs up through the origin; the palm lies on its +x side, the fingers come round
  //     its front (-z) to the other side, the first of them laid forward to the trigger, the thumb along the far side, the forearm back
  //     and down (the wrist bent to the little finger, as a hand holds a pistol)
  //   fist: the same, every finger round the grip (a hand on a hilt, a thing held)
  //   bare: a fist closed tight on nothing, placed as fist
  //   fore: the hand under a gun's fore-end (made as a right hand; the left is it in a mirror): a fore-end along z, 5 cm wide and 4.4 cm high,
  //     its underside 3 cm above the origin;
  //     the palm under it, the fingers up round its far side, the thumb along its near side
  // bases: grip - the hand's x (across the knuckles, first finger to little) down the grip, its y (the back of the hand) to +x;
  // bar - its x along +z (the first finger forward), its back down, its forearm to +x
  const GRIP = {
    trig: { f: [[-0.03, 1.12, 0.05, -0.1], [0.9, 0.95, 0.57, 0], [0.58, 1.1, 0.495, 0], [0.22, 1, 0.45, 0]], t: [0.3, 0, 0.05, 0.2], w: [-0.2, 0.45], from: { basis: 'grip', r: [0, 0.15, 0], at: [0.0629, 0.0078, 0.0674] } },
    fist: { f: [[1.02, 0.85, 0.638, 0], [1.06, 0.8, 0.6, 0], [0.78, 1, 0.75, 0], [0.34, 1.05, 0.473, 0]], t: [0.13, 0.45, 0.05, 0.58], w: [-0.2, 0.45], from: { basis: 'grip', r: [0, 0.15, 0], at: [0.0629, 0.0078, 0.0674] } },
    bare: { f: [[1.57, 1.83, 0.9, 0], [1.57, 1.83, 0.9, 0], [1.57, 1.83, 0.9, 0], [1.57, 1.83, 0.9, 0]], t: [0.8, 0.5, 0.45, 0.8], w: [-0.2, 0.45], from: { basis: 'grip', r: [0, 0.15, 0], at: [0.0629, 0.0078, 0.0674] } },
    fore: { f: [[0.06, 1.65, 0.743, 0], [0.26, 1.7, 0.765, 0], [0.26, 1.7, 0.765, 0], [0.26, 1.4, 0.63, 0]], t: [-0.2, 0.1, 0.2, -0.3], w: [-0.1, 0.3], from: { basis: 'bar', r: [0, -0.5, -0.4], at: [0.0255, -0.0294, 0.0225] } },
  };
  H.GRIP = GRIP;
  const BASIS = {
    grip: new QT().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(0, -1, 0), new V3(1, 0, 0), new V3(0, 0, 1))),
    bar: new QT().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, -1, 0), new V3(1, 0, 0))),
  };
  const PQ = new QT(), PT = new V3(), _eu = new THREE.Euler();
  function placement(P) { PQ.setFromEuler(_eu.set(P.from.r[0], P.from.r[1], P.from.r[2], 'XYZ')).multiply(BASIS[P.from.basis]); PT.fromArray(P.from.at); }
  H.placement = (P) => { placement(P); return { q: PQ.clone(), t: PT.clone() }; };
  const cache = {};
  // (for the tools that fit GRIP: made again at the next asking)
  H.reset = () => { for (const k in cache) delete cache[k]; wrists(); };
  function baked(P) {
    const M = mesh(); placement(P); solve(P.f, P.t, P.w); place();
    const op = new Float32Array(M.n * 3), on = new Float32Array(M.n * 3); skin(op, on);
    const v = new V3();
    for (let i = 0; i < M.n; i++) { v.fromArray(op, i * 3).applyQuaternion(PQ).add(PT).toArray(op, i * 3); v.fromArray(on, i * 3).applyQuaternion(PQ).toArray(on, i * 3); }
    const out = parts(new THREE.BufferAttribute(op, 3), new THREE.BufferAttribute(on, 3));
    for (const k in out) out[k].computeBoundingSphere();
    return out;
  }
  // the same geometries seen in a mirror (sharing their corners still)
  function mirrorSet(r) {
    const p = r.hand.attributes.position.clone(), n = r.hand.attributes.normal.clone(), uv = r.hand.attributes.uv, out = {};
    for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
    for (const k in r) { const g = new THREE.BufferGeometry(), ix = r[k].index.array.slice(); for (let i = 0; i < ix.length; i += 3) { const a = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = a; } g.setAttribute('position', p); g.setAttribute('normal', n); g.setAttribute('uv', uv); for (const a of MAKE_ATTR) g.setAttribute(a, r.hand.attributes[a]); g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeBoundingSphere(); out[k] = g; }
    return out;
  }
  const get = (k, right) => { const key = k + (right ? 'r' : 'l'); if (cache[key]) return cache[key]; return (cache[key] = right ? baked(GRIP[k]) : mirrorSet(get(k, true))); };
  // { hand, pad, strap }: one hand closed on a grip (right: as described; left: its mirror). fist: every finger round the grip (a hand
  // on a hilt, a thing held); else the right hand's first finger lies along to a trigger, and the left hand (the one on a gun's fore-end)
  // holds the fore-end from under it
  H.get = get;
  X.hand = (right, fist) => get(fist ? 'fist' : right ? 'trig' : 'fore', !!right);
  // a fist closed on nothing (bare hands), placed as X.hand's
  X.fistBare = (right) => get('bare', !!right);
  // (what once filled the hollow of a fist on nothing: X.fistBare closes it now)
  const EMPTY = new THREE.BufferGeometry(); EMPTY.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  X.fistCore = () => EMPTY;
  // where the glove's cuff ends and the way the forearm runs back from it (in the right hand's space; the left's is the same in a
  // mirror): X.HAND_WRIST on a grip (trig, fist and bare alike), X.HAND_WRIST_FORE under a fore-end
  // and, with it, how the forearm is turned about its own length: back - the way the back of the wrist faces (square to dir); twist -
  // the turn (radians, right-handed about dir) from straight up (+y, squared to dir) to back: 0 the back of the hand up (palm down),
  // +-PI the palm up. All in the right hand's grip space; for the left hand (its mirror) x of each vector and the twist change sign.
  // GRIP.trig/fore.forearm is the same { at, dir, back, twist } (for the arm's motions that bring a hand back onto the gun)
  function wristOf(P) {
    placement(P); solve(P.f, P.t, P.w); place();
    const at = new V3(), dir = new V3(); cuffNow(at, dir); at.applyQuaternion(PQ).add(PT); dir.applyQuaternion(PQ);
    const back = new V3(0, 1, 0).applyQuaternion(BQ[0]).applyQuaternion(PQ); back.addScaledVector(dir, -back.dot(dir)).normalize();
    const up = new V3(0, 1, 0); up.addScaledVector(dir, -up.dot(dir)).normalize();
    const twist = Math.atan2(new V3().crossVectors(up, back).dot(dir), up.dot(back));
    return { at: at.toArray(), dir: dir.toArray(), back: back.toArray(), twist };
  }
  function wrists() { X.HAND_WRIST = GRIP.trig.forearm = wristOf(GRIP.trig); X.HAND_WRIST_FORE = GRIP.fore.forearm = wristOf(GRIP.fore); }
  wrists();
  // (made behind the loading screen, not with the first use: warmup.js)
  X.warmHands = () => { mesh(); X.hand(true); X.hand(false); X.hand(true, true); X.hand(false, true); };
})();
