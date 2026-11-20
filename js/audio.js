'use strict';
// Procedural, sample-free sound design. Everything is noise-based with filtering,
// short transients and a dark convolution reverb so it reads as physical rather than "beepy".
(function () {
  const A = (G.sfx = {});
  let muffle = null, gunMuf = null, uw = false, frost = false;
  // every sound dulled, as through water or ice (the shots' own way too, lifted as the compressor lifts what is left of the rest)
  function applyMuffle(tc) {
    const f = uw ? 620 : frost ? 900 : 22000;
    for (const m of [muffle, gunMuf]) if (m) m.frequency.setTargetAtTime(f, ctx.currentTime, tc);
    if (gunDry) gunDry.gain.setTargetAtTime(uw ? 1 : frost ? 1.1 : 1, ctx.currentTime, 0.05);
    A.applySet();
  }
  // your head under the water (water.js): every sound dull and far, as through the water (in the new set the water round you answers a
  // little too: more of the room, and never the far echo of open ground)
  A.underwater = function (on) { if (!muffle || !ctx) return; uw = !!on; applyMuffle(on ? 0.05 : 0.12); };
  let ctx = null, master, dry, revSend, reverb, gunBus, shaper, eqLo, eqHi, irOld, irIn, irOut, gunDry, gunOut;
  let white, pink, brown;
  let voices = 0;
  const MAXV = 56;
  // Two sets of sound, chosen in the settings (設定 → 音の種類). 'new' (the default): rooms and open ground answer differently (a
  // reverb with early reflections whose high end dies first, a far echo outdoors), what is behind you is duller, a shot has weight under
  // it, the metal of the action and the place answering back, a blast throws debris that falls after it. 'classic': as it was.
  const NEW = () => true;   // (the old synthesized set is no longer offered: an old save's 'classic' is passed over)
  const outdoor = () => { const b = G.world && G.world.mats && G.world.mats.biome; return !!(b && b.outdoor); };
  A.volume = G.save.data.settings.volume;
  A.listener = { x: 0, y: 0, z: 0 };

  function makeNoise(type, secs) {
    const len = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  function makeIR(secs, decay) {
    const len = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const w = Math.random() * 2 - 1;
        lp = lp * 0.55 + w * 0.45; // darken
        let v = lp * Math.pow(1 - t, decay);
        // early reflections (stone room)
        if (i < ctx.sampleRate * 0.09 && Math.random() < 0.004) v += (Math.random() * 2 - 1) * 0.9;
        d[i] = v;
      }
    }
    return b;
  }

  // a room's answer: a few sharp early returns (each ear its own), then a tail that grows out of them and loses its high end first.
  // o: { rt (s to -60 dB), hf, hfFall, er (how many early returns), erSpan (s), slap (s: one far echo), tailG, pre (s) }
  function makeIR2(secs, o) {
    const sr = ctx.sampleRate, len = Math.floor(sr * secs), b = ctx.createBuffer(2, len, sr), pre = Math.floor(sr * (o.pre || 0.012));
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0, lp2 = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr, w = Math.random() * 2 - 1, k = Math.max(0.04, (o.hf || 0.55) * Math.exp(-t * (o.hfFall || 1.6)));
        lp += (w - lp) * k; lp2 += (lp - lp2) * 0.9;
        d[i] = lp2 * Math.exp(-t * (6.9 / (o.rt || secs * 0.7))) * Math.min(1, t / 0.06) * (o.tailG || 1) * 2.2;
      }
      for (let n = 0; n < (o.er || 10); n++) {
        const tt = (o.pre || 0.012) + 0.004 + Math.pow(Math.random(), 1.5) * (o.erSpan || 0.075), i = Math.floor(tt * sr), g = Math.max(0.15, 0.9 - tt * 6) * (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.5);
        for (let j = 0; j < 24 && i + j < len; j++) d[i + j] += g * Math.exp(-j / 5) * (j % 2 ? -0.6 : 1);
      }
      if (o.slap) { const i0 = Math.floor(sr * (o.slap + (c ? 0.013 : 0))); for (let j = 0; j < sr * 0.12 && i0 + j < len; j++) d[i0 + j] += (Math.random() * 2 - 1) * 0.35 * Math.exp(-j / (sr * 0.03)); }
    }
    return b;
  }
  // put the chosen set in force (the reverb, the tone of the whole): at the start, when the setting changes, when the ground changes
  A.applySet = function () {
    if (!ctx || !reverb) return;
    const n = NEW(), o = outdoor() && !(n && uw);
    reverb.buffer = n ? (o ? irOut : irIn) : irOld; revSend.gain.value = (n && o ? 0.4 : 0.55) * (n && uw ? 1.35 : 1) * (n && frost ? 1.2 : 1);
    eqLo.gain.value = n ? 2.5 : 0; eqHi.gain.value = n ? 2 : 0;
    if (n && A._setKey !== n + '|' + outdoor()) shotWarm(!outdoor());   // (the guns in your hands, ready for the new place before they are fired)
    A._setKey = n + '|' + outdoor();
  };
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = A.volume;
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 22000; muffle.Q.value = 0.5; // (closed under the water: A.underwater)
    eqLo = ctx.createBiquadFilter(); eqLo.type = 'lowshelf'; eqLo.frequency.value = 90; eqLo.gain.value = 0;
    eqHi = ctx.createBiquadFilter(); eqHi.type = 'highshelf'; eqHi.frequency.value = 7500; eqHi.gain.value = 0;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08; // (a ceiling: nothing clips)
    // (after the limiter, a last soft edge just under 0 dBFS: a front sharper than the limiter's attack, the shots turned up, still never
    // goes over - it bends only what is left over -0.35 dBFS, and bends it into the last 0.35 dB)
    const edge = ctx.createWaveShaper(), ec = new Float32Array(4097);
    for (let i = 0; i < 4097; i++) { const x = i / 2048 - 1, a = Math.abs(x); ec[i] = a <= 0.96 ? x : Math.sign(x) * (0.96 + 0.0395 * Math.tanh((a - 0.96) / 0.0395)); }
    edge.curve = ec;
    master.connect(muffle); muffle.connect(eqLo); eqLo.connect(eqHi); eqHi.connect(comp); comp.connect(lim); lim.connect(edge); edge.connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
    reverb = ctx.createConvolver(); irOld = makeIR(2.8, 2.6); reverb.buffer = irOld;
    irIn = makeIR2(3.0, { rt: 2.3, hf: 0.5, hfFall: 1.3, er: 12, erSpan: 0.07 }); irOut = makeIR2(1.8, { rt: 1.0, hf: 0.35, hfFall: 2.6, er: 5, erSpan: 0.12, slap: 0.21, tailG: 0.6 });
    const revLP = ctx.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 3200;
    const revHP = ctx.createBiquadFilter(); revHP.type = 'highpass'; revHP.frequency.value = 120;
    revSend = ctx.createGain(); revSend.gain.value = 0.55;
    revSend.connect(revHP); revHP.connect(reverb); reverb.connect(revLP); revLP.connect(master);
    // gun bus: mild saturation for punch
    shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    shaper.curve = curve;
    gunBus = ctx.createGain(); gunBus.gain.value = 0.9;
    gunBus.connect(shaper); shaper.connect(dry);
    // (the new set's shots go a way of their own to the limiter, round the compressor: it caught the front of every shot and held it
    // some 8 dB down, then lifted what hung on after it, and a shot came out as soft and long as the hum of the room. What the room gives
    // back of a shot still goes the common way)
    gunDry = ctx.createGain(); gunOut = ctx.createGain(); gunOut.gain.value = A.volume;
    gunMuf = ctx.createBiquadFilter(); gunMuf.type = 'lowpass'; gunMuf.frequency.value = 22000; gunMuf.Q.value = 0.5;
    gunDry.connect(gunOut); gunOut.connect(gunMuf); gunMuf.connect(lim);
    white = makeNoise('white', 2); pink = makeNoise('pink', 2); brown = makeNoise('brown', 3);
    A.applySet();
    A.startAmbience();
    preloadSamples();
    // (the code that writes a take, run once now while the run is being made: the first time it runs it is many times slower)
    setTimeout(() => { try { const t0 = performance.now(); shotTake('pistol', SHOT.pistol, [], true); mechTake('magIn', 'rifle'); A.shotStats.jit = performance.now() - t0; } catch (e) { /* none, then */ } }, 30);
  };
  A.setVolume = (v) => { A.volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); if (gunOut) gunOut.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
  A.suspend = () => { if (ctx && ctx.state === 'running') ctx.suspend(); };
  A.resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  A.now = () => (ctx ? ctx.currentTime : 0);
  // (tests: a meter on everything before the master volume, so a muted game can still be measured)
  A.tap = () => { if (!ctx) return null; if (!A._tap) { A._tap = ctx.createAnalyser(); A._tap.fftSize = 2048; dry.connect(A._tap); gunDry.connect(A._tap); } return A._tap; };

  // ---------- routing helpers ----------
  // returns {node, wet} destination for a sound; positional when pos given
  function dest(pos, wet, bus) {
    const set = NEW(); if (A._setKey !== set + '|' + outdoor()) A.applySet();
    const g = ctx.createGain();
    let out = g;
    // (a position that is not a number must not take the whole frame down: the sound just plays unplaced)
    if (pos && !Number.isFinite(pos.x + pos.y + pos.z + A.listener.x + A.listener.y + A.listener.z)) pos = null;
    if (pos) {
      const L = A.listener;
      const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // manual distance attenuation + lowpass by distance (air absorption) + stereo pan
      const att = 1 / (1 + Math.max(0, dist - 2) * 0.09);
      // (whoever asks for this sets a level of its own on what it is handed - and so used to wipe the fall-off with distance out: a far sound
      // was as loud as a near one. In the new set the fall-off is a stage of its own behind that level. The old set is left as it was)
      let head = g;
      if (set) { head = ctx.createGain(); head.gain.value = att; g.connect(head); } else g.gain.value = att;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 16000 / (1 + dist * 0.08));
      const p = ctx.createStereoPanner();
      // pan relative to listener yaw
      const ang = Math.atan2(dx, -dz) - (A.listenerYawNeg || 0);
      p.pan.value = Math.max(-0.85, Math.min(0.85, Math.sin(ang) * Math.min(1, dist / 4)));
      if (set) { const c = Math.cos(ang); if (c < 0) lp.frequency.value *= 0.62 + 0.38 * (1 + c); } // (what is behind you is duller)
      head.connect(lp); lp.connect(p); out = p;
      wet = (wet || 0.3) * (1 + Math.min(1.5, dist * 0.03));
    }
    out.connect(bus || dry);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; out.connect(s); s.connect(revSend); }
    return g;
  }
  function envGain(t0, a, peak, d, to, curve) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(to);
    return g;
  }
  function voice(dur) {
    if (voices >= MAXV) return false;
    voices++; setTimeout(() => voices--, (dur + 0.1) * 1000);
    return true;
  }
  // filtered noise burst
  function nz(o) {
    const t0 = o.t || ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = o.buf === 'pink' ? pink : o.buf === 'brown' ? brown : white;
    src.playbackRate.value = (o.rate || 1) * (NEW() ? 0.97 + Math.random() * 0.06 : 1); // (no two alike)
    let node = src;
    for (const f of o.f || []) {
      const bq = ctx.createBiquadFilter(); bq.type = f[0]; bq.frequency.setValueAtTime(f[1], t0);
      if (f[3]) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f[3]), t0 + (f[4] || o.d));
      bq.Q.value = f[2] || 0.7;
      node.connect(bq); node = bq;
    }
    const g = envGain(t0, o.a || 0.002, o.g || 0.5, o.d || 0.1, o.to);
    node.connect(g);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + (o.a || 0.002) + (o.d || 0.1) + 0.05);
    return src;
  }
  // tonal component (pitch sweep)
  function tn(o) {
    const t0 = o.t || ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t0 + (o.fd || o.d));
    let node = osc;
    if (o.lp) { const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = o.lp; node.connect(bq); node = bq; }
    const g = envGain(t0, o.a || 0.003, o.g || 0.4, o.d || 0.2, o.to);
    node.connect(g);
    osc.start(t0); osc.stop(t0 + (o.a || 0.003) + (o.d || 0.2) + 0.05);
    return osc;
  }
  const vr = (v, p) => v * (1 + (Math.random() * 2 - 1) * p);

  // ---------- things struck, scraped and spoken (the new set) ----------
  // A thing struck rings in modes of its own. One short burst of noise (the contact) goes through a narrow band at each mode - as
  // narrow as that mode rings long - so one burst makes all of it, and every strike comes out a little different, as noise does.
  // m: [[Hz, level, seconds to die away (-60 dB)], ...]; o: { g: the contact's own click, hp: its lowest Hz, d: how long the contact
  // lasts, at: the strikes (seconds after t, ascending: a rattle is one burst each), lv: their levels }
  // (the bursts are written into a buffer of their own, fresh noise each time, rather than shaped by automation: a sound asked for
  // "now" is often a few ms late reaching the audio thread, and a burst under a millisecond long, automated, would be over before it began)
  function strike(t, out, m, o) {
    o = o || {};
    const sr = ctx.sampleRate, d = o.d || 0.003, at = o.at || [0], lv = o.lv || [], te = d / 4, nr = Math.max(1, Math.round(0.0007 * sr)), nd = Math.round(te * 8 * sr);
    let last = -1; const starts = [];
    for (let i = 0; i < at.length; i++) { last = Math.max(at[i], last + 0.003); starts.push(last); }
    const buf = ctx.createBuffer(1, Math.ceil((last + 0.0007 + te * 8) * sr) + 2, sr), b = buf.getChannelData(0);
    for (let i = 0; i < starts.length; i++) {
      const k = lv[i] === undefined ? 1 : lv[i], i0 = Math.round(starts[i] * sr);
      for (let j = 0; j < nr + nd && i0 + j < b.length; j++) b[i0 + j] += (Math.random() * 2 - 1) * k * (j < nr ? j / nr : Math.exp(-(j - nr) / (te * sr)));
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const e = src;
    if (o.g) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.hp || 2000; hp.Q.value = 0.7; const cg = ctx.createGain(); cg.gain.value = o.g; e.connect(hp); hp.connect(cg); cg.connect(out); }
    // (a burst of white noise of energy length Le leaves a band that rings with time constant tau at an amplitude of 2*sqrt(Le/(3*sr))/tau)
    const L = 2 * Math.sqrt((d / 8 + 0.00023) / (3 * sr));
    let long = 0;
    for (const [f0, g, t60] of m) {
      const f = Math.min(sr * 0.45, f0 * vr(1, 0.02)), tau = (t60 * vr(1, 0.12)) / 6.9, bp = ctx.createBiquadFilter(), mg = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = Math.max(0.7, Math.min(700, Math.PI * f * tau));
      mg.gain.value = (g * vr(1, 0.2) * tau) / L;
      e.connect(bp); bp.connect(mg); mg.connect(out); long = Math.max(long, t60);
    }
    src.start(t);
    // (the source ends with its buffer; the bands ring on after it by themselves)
  }
  // A part sliding over another (a bolt drawn back, a magazine leaving its well, a hand on leather): noise in a band that moves as it
  // goes, its level jagged - friction is a run of little catches, and no two runs alike. o: { buf, q, rough (0..1) }
  function scrape(t, out, f0, f1, d, g, o) {
    o = o || {};
    const n = Math.max(8, Math.round(d * 500)), c = new Float32Array(n), r = o.rough === undefined ? 0.6 : o.rough;
    let s = 1;
    for (let i = 0; i < n; i++) { const x = i / (n - 1); s += (1 - r + r * 2 * Math.random() * Math.random() * 2 - s) * 0.6; c[i] = g * Math.pow(Math.sin(Math.PI * x), 0.6) * Math.max(0, s); }
    c[n - 1] = 0;
    // (the level is written into the noise itself, a buffer of its own: a level curve automated from "now" was at times dropped whole
    // when the call reached the audio thread a little late, and the sound with it)
    const sr = ctx.sampleRate, len = Math.max(2, Math.ceil(d * sr)), buf = ctx.createBuffer(1, len, sr), b = buf.getChannelData(0), from = (o.buf === 'pink' ? pink : white).getChannelData(0);
    for (let j = 0, k = Math.floor(Math.random() * from.length); j < len; j++, k++) { const x = (j / len) * (n - 1), i = Math.floor(x), w = x - i; b[j] = from[k % from.length] * (c[i] * (1 - w) + (i + 1 < n ? c[i + 1] : 0) * w); }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q || 1.5; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    src.connect(bp); bp.connect(out);
    src.start(t);
  }
  // A throat: the folds buzzing (a sawtooth whose pitch runs along p: [[0..1 of d, Hz], ...], wavering), breath with it, through a
  // mouth - bands at the formants, moving along fm: [[0..1, [F1, F2, F3]], ...]; its level along a jagged curve (a voice is never
  // steady). o: { d, g, a (rise, 0..1 of d), p, fm, q, fg, breath, vib: [Hz, depth], rough (0..1), det (a second fold, cents off) }
  function throat(t, out, o) {
    const d = o.d, n = Math.max(16, Math.round(d * 240)), c = new Float32Array(n), a = o.a || 0.2;
    let s = 1;
    for (let i = 0; i < n; i++) { const x = i / (n - 1), env = Math.min(1, x / a) * Math.min(1, (1 - x) / 0.35); s += (1 - (o.rough || 0) * Math.random() - s) * 0.5; c[i] = o.g * Math.pow(env, 1.4) * s; }
    c[n - 1] = 0;
    // (the level as a run of short ramps, not one automated curve: see scrape)
    const mix = ctx.createGain(); mix.gain.setValueAtTime(0, t); for (let i = 1; i < n; i++) mix.gain.linearRampToValueAtTime(c[i], t + (i / (n - 1)) * d);
    const srcs = [], folds = [];
    for (const cents of o.det ? [0, o.det] : [0]) {
      const os = ctx.createOscillator(), k = Math.pow(2, cents / 1200); os.type = o.type || 'sawtooth';
      os.frequency.setValueAtTime(o.p[0][1] * k, t); for (const [x, f] of o.p.slice(1)) os.frequency.linearRampToValueAtTime(f * k, t + x * d);
      const og = ctx.createGain(); og.gain.value = cents ? 0.6 : 1; os.connect(og); og.connect(mix); srcs.push(os); folds.push(os);
    }
    if (o.vib) { const l = ctx.createOscillator(); l.frequency.value = vr(o.vib[0], 0.15); const lg = ctx.createGain(); lg.gain.value = o.p[0][1] * o.vib[1]; l.connect(lg); for (const os of folds) lg.connect(os.frequency); srcs.push(l); }
    let br = null;
    if (o.breath) { br = ctx.createBufferSource(); br.buffer = pink; const bg = ctx.createGain(); bg.gain.value = o.breath; br.connect(bg); bg.connect(mix); }
    for (let i = 0; i < o.fm[0][1].length; i++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q[i];
      bp.frequency.setValueAtTime(o.fm[0][1][i], t); for (const [x, F] of o.fm.slice(1)) bp.frequency.linearRampToValueAtTime(F[i], t + x * d);
      const fg = ctx.createGain(); fg.gain.value = o.fg[i]; mix.connect(bp); bp.connect(fg); fg.connect(out);
    }
    for (const s2 of srcs) { s2.start(t); s2.stop(t + d + 0.05); }
    if (br) { br.start(t, Math.random() * 1.5); br.stop(t + d + 0.05); }
  }

  // (the new set's remade sounds: each one's level, so that it stands as loud against the rest as the old one did)
  const NV = { supp: 0.5, ric: 0.4, imp: 0.65, cer: 0.45, stn: 0.25, wail: 0.1, gurgle: 0.04, slosh: 0.16, coin: 1, hover: 0.13, click: 1, select: 0.85, deny: 0.85, error: 3.0, ready: 0.6, zap: 0.45, magic: 0.62 };

  // ---------- recorded sounds (snd/, listed in sndbank.js) ----------
  // Where a sound has recordings, one of them is the sound: a different one each time, its pitch and level a little off the last, put
  // in the same place and the same room as everything else. Where it has none - or they have not arrived yet, or the old set of sounds
  // is chosen in the settings - smp() reports "not played" and the caller goes on to the synthesized sound, as it always did.
  const SB = { bank: (window.G && window.G.SND) || {}, files: {} }, bufs = {}, asked = {}, lastOf = {};
  let gunsIn = Promise.resolve();   // (the guns' recordings all in: see preloadSamples)
  const usable = (key) => !!SB.bank[key] && NEW() && !A.noSamples;   // (A.noSamples: the synthesized sounds only, to measure the one against the other)
  A.samplesOn = () => NEW() && Object.keys(bufs).length > 0;
  const fetchBuf = (f) => {
    if (asked[f]) return asked[f];
    if (!ctx || !window.fetch) return Promise.resolve(false);
    return (asked[f] = fetch('snd/' + f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('no ' + f))))
      .then((ab) => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no))).then((b) => { bufs[f] = b; return b; }).catch(() => false));
  };
  A.fetchSample = fetchBuf;
  // (all of them asked for at the start, so that a sound's first playing is already the recording)
  // (when the guns' recordings are in, the takes of the guns in your hands are made in the time the page has to spare: see shotWarm)
  const preloadSamples = () => {
    try {
      const guns = [];
      // (a lazy set - the old version's gun recordings, only played when soundcheck.html asks for that version - is fetched when asked
      // for: see A.fetchLazy)
      for (const k in SB.bank) { if (SB.bank[k].lazy) continue; for (const f of SB.bank[k].f) { const q = fetchBuf(f); if (k.startsWith('gun_') || RSET.test(k)) guns.push(q); } }
      gunsIn = Promise.all(guns); gunsIn.then(() => { if (NEW()) shotWarm(!outdoor()); });
    } catch (e) { /* none, then */ }
  };
  // (the recorded gun set's keys: gs_ a shot near, gq_ suppressed, gr_ a place answering, gd_ a shot far off - see shotPlan)
  const RSET = /^g[sqrd]_/;
  A.fetchLazy = () => { const q = []; for (const k in SB.bank) if (SB.bank[k].lazy) for (const f of SB.bank[k].f) q.push(fetchBuf(f)); return Promise.all(q); };
  // key, where (or nothing: in the head), level, speed, how much of the room (or the bank's own)
  const smp = (key, pos, vol, rate, wet) => {
    if (!ctx || !usable(key)) return false;
    const b = SB.bank[key], n = b.f.length;
    let i = Math.floor(Math.random() * n); if (n > 1 && i === lastOf[key]) i = (i + 1) % n;   // (never the same one twice running)
    const buf = bufs[b.f[i]];
    if (!buf) { fetchBuf(b.f[i]); return false; }
    if (!voice(Math.min(1.5, buf.duration))) return true;   // (too much sounding already: it is dropped, and nothing stands in for it)
    lastOf[key] = i;
    try {
      const src = ctx.createBufferSource(); src.buffer = buf;
      src.playbackRate.value = (rate || 1) * (b.rate || 1) * vr(1, b.p === undefined ? 0.05 : b.p);
      const out = dest(pos || null, wet === undefined ? (b.wet === undefined ? 0.2 : b.wet) : wet, b.bus === 'gun' ? gunBus : undefined);   // (a gun's recording goes the way the synthesized shot went: through the bus that thickens it)
      out.gain.value *= (vol === undefined || vol === null ? 1 : vol) * (b.v || 1) * vr(1, 0.1);
      src.connect(out); src.start();
    } catch (e) { return false; }
    return true;
  };
  A.smp = smp;

  // ---------- weapons ----------
  const GUN = {
    pistol: { thump: [150, 55], tg: 0.55, body: 2600, bd: 0.12, bg: 0.6, crack: 0.35, wet: 0.5, tail: 0.25 },
    revolver: { thump: [120, 40], tg: 0.8, body: 2000, bd: 0.2, bg: 0.8, crack: 0.5, wet: 0.7, tail: 0.5 },
    smg: { thump: [170, 70], tg: 0.4, body: 3000, bd: 0.07, bg: 0.45, crack: 0.25, wet: 0.35, tail: 0.15 },
    rifle: { thump: [130, 48], tg: 0.6, body: 2400, bd: 0.11, bg: 0.6, crack: 0.45, wet: 0.5, tail: 0.3 },
    dmr: { thump: [110, 40], tg: 0.75, body: 2100, bd: 0.16, bg: 0.7, crack: 0.55, wet: 0.65, tail: 0.45 },
    sniper: { thump: [90, 32], tg: 0.95, body: 1800, bd: 0.28, bg: 0.85, crack: 0.75, wet: 0.9, tail: 0.9 },
    shotgun: { thump: [95, 35], tg: 1.0, body: 1500, bd: 0.22, bg: 0.95, crack: 0.4, wet: 0.75, tail: 0.6 },
    lmg: { thump: [120, 45], tg: 0.6, body: 2200, bd: 0.1, bg: 0.6, crack: 0.4, wet: 0.45, tail: 0.25 },
    minigun: { thump: [160, 70], tg: 0.35, body: 2600, bd: 0.05, bg: 0.4, crack: 0.2, wet: 0.25, tail: 0.1 },
    suppressed: { thump: [180, 90], tg: 0.25, body: 900, bd: 0.07, bg: 0.4, crack: 0.05, wet: 0.15, tail: 0.05 },
    nail: { thump: [220, 120], tg: 0.25, body: 1600, bd: 0.05, bg: 0.4, crack: 0.15, wet: 0.2, tail: 0.05 },
  };
  // every named weapon has its own voice: a stable pitch / body / crack / tail drawn from its id, one of five characters, and a flavour for its trait
  const hs = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const hr = (h, k) => (Math.imul(h ^ Math.imul(k, 0x9E3779B1), 2246822519) >>> 0) % 1000 / 1000; // 0..1, a different value per k
  const CHAR = ['plain', 'ring', 'boom', 'snap', 'rasp'];
  function gunVoice(base, o) {
    if (!o.id) return { p: base, h: 0, c: 'plain', cf: 4200 };
    const h = hs(o.id), p = Object.assign({}, base), pit = 0.78 + hr(h, 1) * 0.52;
    p.thump = [base.thump[0] * pit, base.thump[1] * pit];
    p.body = base.body * (0.75 + hr(h, 2) * 0.55);
    p.tail = base.tail * (0.75 + hr(h, 4) * 0.8) * (o.rar === 'mythic' ? 1.5 : o.rar === 'legendary' ? 1.3 : 1);
    p.tg = base.tg * (0.85 + hr(h, 5) * 0.4);
    p.bd = base.bd * (0.8 + hr(h, 6) * 0.5);
    const c = CHAR[Math.floor(hr(h, 7) * CHAR.length)];
    if (c === 'boom') { p.tg *= 1.35; p.body *= 0.7; p.tail *= 1.3; p.crack *= 0.7; }
    else if (c === 'snap') { p.tail *= 0.2; p.crack *= 1.4; p.bd *= 0.6; p.tg *= 0.8; }
    return { p, h, c, cf: 3000 + hr(h, 3) * 3200 };
  }
  // ---------- the new set's shot, in layers ----------
  // A shot as the one firing it hears it. At its heart the recording of the real gun (a microphone a few paces off: the report itself,
  // its own echo after it); only the swell of the pressure under 25 Hz is taken off it (a microphone that near takes the swell itself,
  // which eats the headroom and is heard as nothing). Over and under it, what the microphone misses at the shooter's place: the front
  // of the blast (a step in the pressure: its edge is the crack, 2-5 kHz, a few ms, the top over 6 kHz kept down), a supersonic round's
  // own crack (an N-shaped wave a third of a ms long), the blast (rough, 0.6-3 kHz, a few tens of ms), the body of the report (a rough
  // block of 120-500 Hz, driven, its overtones carrying the weight: the thickness of a shot), the push in the chest (60-120 Hz, cut at
  // 150 ms - held long, it covers all the rest and the shot comes out dull), the steel of the action (the dull knock of a heavy part
  // stopped, 300-900 Hz, and its ring, 5-80 ms after), and the place answering (a room: hard early returns and a low bloom; open
  // ground: the slap off something far, 80-250 ms after, and a long roll). All of it is written into one buffer: a few takes of each
  // kind for each place, made before they are needed and played in turn, each a little different - one source a shot.
  // fc: the front's top (Hz), fl: its level, ft: how fast it dies (s); nw: the round's crack, nd: its length (s); fw: the step in the
  // pressure, fT: its first (positive) part (s); bf: the blast's middle (Hz), bl: its level, b1 / b2: how fast it dies (s: the burst,
  // what hangs on after it), hold: the share of what hangs on, dr: how hard it is driven; bb: the body's level, bbf: its middle (Hz),
  // bb1 / bb2: how fast it dies (s); bo: the push (Hz), bg: its level, bd: how fast it dies (s); act: the action, ag: its level;
  // rv: the recording's level, rr: its speed; er: a room's returns; ech: open ground's slap; tail: open ground's roll (s), tl: its level;
  // cas: the empty case falling ([how often, s after]); len: the take (s); lv: the whole; wet: how much of it goes to the room's reverb;
  // sat: how hard the whole is driven into its top
  const SHOT = {
    pistol: { fc: 3600, fl: 0.525, ft: 0.0014, nw: 0.12, nd: 0.00024, fw: 0.45, fT: 0.0006, bf: 1400, bl: 0.4, b1: 0.006, b2: 0.02, hold: 0.08, dr: 2, bb: 0.5, bbf: 320, bb1: 0.01, bb2: 0.0186, bo: 115, bg: 0.32, bd: 0.02, act: 'slide', ag: 0.55, rv: 0.95, rr: 1, er: 0.3, ech: 0.3, tail: 0.8, tl: 0.22, cas: [0.8, 0.42], len: 0.26, lv: 0.9, wet: 0.2 },
    revolver: { fc: 3000, fl: 0.6, ft: 0.0018, nw: 0, nd: 0, fw: 0.7, fT: 0.0009, bf: 1000, bl: 0.5625, b1: 0.008, b2: 0.035, hold: 0.1, dr: 2.4, bb: 0.75, bbf: 240, bb1: 0.016, bb2: 0.0289, bo: 85, bg: 0.5, bd: 0.028, sat: 2.6, act: 'frame', ag: 0.5, rv: 1, rr: 0.97, er: 0.35, ech: 0.35, tail: 1, tl: 0.3, len: 0.42, lv: 1, wet: 0.24 },
    smg: { fc: 3800, fl: 0.48, ft: 0.0012, nw: 0.1, nd: 0.00022, fw: 0.4, fT: 0.0005, bf: 1500, bl: 0.375, b1: 0.005, b2: 0.016, hold: 0.06, dr: 1.9, bb: 0.42, bbf: 330, bb1: 0.008, bb2: 0.0124, bo: 125, bg: 0.26, bd: 0.016, act: 'blowback', ag: 0.45, rv: 0.9, rr: 1, er: 0.25, ech: 0.25, tail: 0.6, tl: 0.15, cas: [0.2, 0.4], len: 0.2, lv: 0.85, wet: 0.16 },
    rifle: { fc: 3400, fl: 0.6, ft: 0.0015, nw: 0.3, nd: 0.0003, fw: 0.55, fT: 0.0007, bf: 1200, bl: 0.5, b1: 0.007, b2: 0.026, hold: 0.08, dr: 2.2, bb: 0.65, bbf: 270, bb1: 0.013, bb2: 0.0227, bo: 95, bg: 0.45, bd: 0.024, act: 'carrier', ag: 0.5, rv: 0.95, rr: 0.99, er: 0.3, ech: 0.35, tail: 1, tl: 0.28, cas: [0.45, 0.45], len: 0.28, lv: 0.9, wet: 0.2 },
    dmr: { fc: 3200, fl: 0.63, ft: 0.0016, nw: 0.38, nd: 0.00034, fw: 0.65, fT: 0.0008, bf: 1100, bl: 0.5625, b1: 0.008, b2: 0.032, hold: 0.1, dr: 2.4, bb: 0.75, bbf: 250, bb1: 0.015, bb2: 0.0268, bo: 88, bg: 0.52, bd: 0.027, act: 'carrier', ag: 0.5, rv: 1, rr: 0.98, er: 0.33, ech: 0.4, tail: 1.2, tl: 0.33, cas: [0.9, 0.5], len: 0.32, lv: 0.85, wet: 0.24 },
    sniper: { fc: 2900, fl: 0.675, ft: 0.0018, nw: 0.45, nd: 0.0004, fw: 0.8, fT: 0.001, bf: 950, bl: 0.625, b1: 0.01, b2: 0.045, hold: 0.12, dr: 2.6, bb: 0.9, bbf: 220, bb1: 0.02, bb2: 0.0371, bo: 72, bg: 0.62, bd: 0.03, sat: 2.2, act: 'ring', ag: 0.45, rv: 1, rr: 0.97, er: 0.38, ech: 0.45, tail: 1.6, tl: 0.45, cas: [1, 0.68], len: 0.45, lv: 1, wet: 0.3 },
    shotgun: { fc: 2700, fl: 0.75, ft: 0.002, nw: 0.06, nd: 0.0003, fw: 0.85, fT: 0.0012, bf: 850, bl: 0.6875, b1: 0.011, b2: 0.045, hold: 0.12, dr: 2.4, bb: 0.95, bbf: 210, bb1: 0.022, bb2: 0.0371, bo: 75, bg: 0.62, bd: 0.03, sat: 2.2, act: 'clank', ag: 0.45, rv: 1, rr: 0.95, er: 0.38, ech: 0.45, tail: 1.3, tl: 0.42, len: 0.4, lv: 1, wet: 0.28 },
    lmg: { fc: 3300, fl: 0.6, ft: 0.0015, nw: 0.3, nd: 0.0003, fw: 0.6, fT: 0.0007, bf: 1150, bl: 0.5, b1: 0.007, b2: 0.025, hold: 0.08, dr: 2.3, bb: 0.7, bbf: 260, bb1: 0.013, bb2: 0.0186, bo: 90, bg: 0.48, bd: 0.022, act: 'heavy', ag: 0.55, rv: 0.95, rr: 0.97, er: 0.3, ech: 0.35, tail: 0.9, tl: 0.26, cas: [0.25, 0.45], len: 0.26, lv: 0.88, wet: 0.18 },
    minigun: { fc: 3800, fl: 0.45, ft: 0.0011, nw: 0.2, nd: 0.00025, fw: 0.38, fT: 0.0005, bf: 1450, bl: 0.35, b1: 0.0045, b2: 0.013, hold: 0.05, dr: 1.9, bb: 0.45, bbf: 320, bb1: 0.008, bb2: 0.0103, bo: 115, bg: 0.3, bd: 0.014, act: 'rotary', ag: 0.4, rv: 0.9, rr: 1.03, er: 0.2, ech: 0.2, tail: 0.5, tl: 0.1, cas: [0.12, 0.4], len: 0.15, lv: 0.8, wet: 0.12 },
    // (launched, not fired: the transient of the launch itself; the rest - the rocket's motor going away, the chain - after it)
    rocket: { fc: 2600, fl: 0.45, ft: 0.002, nw: 0, nd: 0, fw: 0.6, fT: 0.0014, bf: 900, bl: 0.75, b1: 0.02, b2: 0.12, hold: 0.4, dr: 2.2, bb: 0.8, bbf: 200, bb1: 0.03, bb2: 0.12, bo: 60, bg: 0.6, bd: 0.07, act: 'tube', ag: 0.45, rv: 0, rr: 1, er: 0.3, ech: 0.4, tail: 1.2, tl: 0.35, len: 0.5, lv: 0.55, wet: 0.3 },
    gl: { fc: 2000, fl: 0.3, ft: 0.002, nw: 0, nd: 0, fw: 0.65, fT: 0.002, bf: 650, bl: 0.5, b1: 0.012, b2: 0.04, dr: 1.8, bb: 0.7, bbf: 230, bb1: 0.02, bb2: 0.07, bo: 95, bg: 0.55, bd: 0.05, act: 'breech', ag: 0.55, rv: 0, rr: 1, er: 0.3, ech: 0.3, tail: 0.7, tl: 0.2, len: 0.3, lv: 0.56, wet: 0.25 },
    rail: { fc: 5500, fl: 0.6, ft: 0.0012, nw: 0.9, nd: 0.0005, fw: 0.4, fT: 0.0007, bf: 2500, bl: 0.5, b1: 0.006, b2: 0.05, dr: 2.5, bb: 0.6, bbf: 260, bb1: 0.015, bb2: 0.08, bo: 60, bg: 0.6, bd: 0.08, sat: 2.3, act: 'rails', ag: 0.6, rv: 0, rr: 1, er: 0.35, ech: 0.45, tail: 1.5, tl: 0.4, len: 0.6, lv: 1, wet: 0.3 },
    harpoon: { fc: 2500, fl: 0.35, ft: 0.0016, nw: 0, nd: 0, fw: 0.4, fT: 0.001, bf: 900, bl: 0.5, b1: 0.01, b2: 0.03, dr: 1.8, bb: 0.4, bbf: 300, bb1: 0.012, bb2: 0.04, bo: 120, bg: 0.35, bd: 0.04, act: 'spring', ag: 0.7, rv: 0, rr: 1, er: 0.3, ech: 0.2, tail: 0.5, tl: 0.12, len: 0.4, lv: 0.65, wet: 0.2 },
    nail: { fc: 5200, fl: 0.25, ft: 0.001, nw: 0, nd: 0, fw: 0.12, fT: 0.0004, bf: 2600, bl: 0.22, b1: 0.004, b2: 0.022, dr: 1.2, bb: 0.3, bbf: 380, bb1: 0.006, bb2: 0.02, bo: 165, bg: 0.16, bd: 0.014, act: 'piston', ag: 0.8, rv: 0, rr: 1, er: 0.2, ech: 0.15, tail: 0.3, tl: 0.04, len: 0.16, lv: 0.65, wet: 0.12 },
  };
  // A suppressed shot: the gas let out through the baffles (a dull puff, no front to it; a supersonic round still cracks, less), the
  // body and the push smaller - and over it the action working, which is most of what is heard of it. [how heavy, the puff's Hz, its level]
  const SUPP = { pistol: [0.9, 950, 1], revolver: [1.1, 800, 0.9], smg: [0.85, 850, 1], rifle: [1.1, 620, 1.08], dmr: [1.2, 560, 0.9], sniper: [1.3, 500, 1], shotgun: [1.4, 420, 0.9], lmg: [1.15, 600, 1], minigun: [0.8, 800, 1], nail: [0.7, 1100, 1] };
  // q: the kind's own plan (the version the game plays it at, see GUNP / GDEF), or nothing for the published shot. The suppressed shot is
  // made over that plan, so that each gun keeps its own weight behind the can - a heavy rifle's low blow and body, a pistol's small one:
  // made from SHOT alone, every suppressed gun was the same light puff and lost the weight its plan gives it (a sniper's rifle with a
  // suppressor on it sounded as none of the new set). What the can takes away it takes from the plan too: the wide and the bright head,
  // the edge, the shotgun's cracks, the burst and the air after it; the low blow and the body stay, a little smaller.
  const suppOf = (kind, q) => {
    const p0 = SHOT[kind] || SHOT.rifle, [k, pf, sl] = SUPP[kind] || [1, 700, 1];
    const p = q ? Object.assign({}, p0, q, { headx: 0, brx: 0, edx: 0, popx: 0, kx: 0, lnx: 0, bsx: 0, airx: 0, spn: 0, spf: 0, lowx: (q.lowx || 0) * 0.7, low2x: (q.low2x || 0) * 0.5,
      bodyx: (q.bodyx || 0) * 0.6, thick: q.thick ? q.thick * 0.5 : 0, hicut: 9000 }) : p0;
    return Object.assign({}, p, { fc: 2600, fl: 0.08 * k, nw: p.nw * 0.5, fw: 0.16 * k, fT: p.fT * 1.8, bf: pf, bl: 0.55 * k, b1: 0.009 * k, b2: 0.03 * k, dr: 1.3, bb: p.bb * 0.5, bbf: p.bbf * 1.3, bb2: p.bb2 * 0.6,
      bg: p.bg * 0.55, bd: p.bd * 0.8, ag: p.ag * 1.3, rv: 0, er: p.er * 0.45, ech: p.ech * 0.3, tail: p.tail * 0.3, tl: p.tl * 0.2, lv: p0.lv * 0.55 * sl, wet: 0.1 });
  };
  // The actions, as what happens in them: ['s', s after the shot, from Hz, to Hz, how long (s), level] a part sliding over another;
  // ['k', s after, Hz, level] the dull knock of a heavy part stopped (its mass); ['r', s after, modes [[Hz, level, s to die away], ...],
  // level, the contact's click] the steel of it ringing - low and dull mostly, a little high ring only
  const ACT = {
    // a slide drawn back by the recoil to its stop on the frame, the case thrown out, the slide run home and locking
    slide: [['s', 0.004, 1400, 2100, 0.008, 0.08], ['k', 0.012, 520, 1], ['r', 0.012, [[780, 0.8, 0.05], [1500, 0.6, 0.06], [2600, 0.35, 0.045], [4300, 0.12, 0.03]], 0.8, 0.3],
      ['r', 0.028, [[4800, 0.15, 0.04]], 0.3, 0.1], ['s', 0.032, 1900, 1300, 0.01, 0.07], ['k', 0.045, 620, 0.9], ['r', 0.045, [[950, 0.7, 0.045], [1900, 0.5, 0.05], [3300, 0.25, 0.04]], 0.8, 0.4]],
    // a revolver's frame and cylinder ringing after the blow, low
    frame: [['r', 0.002, [[460, 0.45, 0.22], [1040, 0.5, 0.28], [2150, 0.32, 0.2], [3470, 0.12, 0.12]], 0.8, 0], ['k', 0.004, 380, 0.6]],
    // an open bolt thrown back against its plate and run forward again
    blowback: [['s', 0.003, 1200, 1900, 0.008, 0.07], ['k', 0.012, 480, 1], ['r', 0.012, [[700, 0.8, 0.04], [1500, 0.6, 0.05], [2700, 0.3, 0.035]], 0.8, 0.3],
      ['k', 0.04, 560, 0.8], ['r', 0.04, [[880, 0.7, 0.035], [1900, 0.5, 0.04], [3300, 0.2, 0.03]], 0.7, 0.3]],
    // a bolt carrier unlocking, run back into its buffer (the spring in it twanging), the case out, run home and locking: two heavy knocks
    carrier: [['s', 0.007, 1300, 2100, 0.012, 0.08], ['k', 0.022, 420, 1], ['r', 0.022, [[620, 0.8, 0.06], [1350, 0.8, 0.07], [2500, 0.4, 0.05], [3900, 0.12, 0.035], [520, 0.25, 0.14]], 0.8, 0.3],
      ['s', 0.048, 2000, 1200, 0.01, 0.06], ['k', 0.06, 520, 1], ['r', 0.06, [[820, 0.8, 0.05], [1700, 0.6, 0.06], [3000, 0.25, 0.04]], 0.8, 0.4], ['r', 0.064, [[2600, 0.25, 0.03]], 0.4, 0.2]],
    // a heavy bolt to the rear, the belt's links rattling over the feed tray, the bolt slamming forward
    heavy: [['s', 0.008, 1100, 1800, 0.014, 0.08], ['k', 0.028, 340, 1.1], ['r', 0.028, [[480, 0.9, 0.07], [1100, 0.9, 0.08], [2100, 0.4, 0.06], [3400, 0.12, 0.04]], 0.8, 0.3],
      ['r', 0.04, [[3900, 0.18, 0.02]], 0.3, 0.3], ['r', 0.047, [[4200, 0.15, 0.02]], 0.3, 0.3], ['r', 0.055, [[3700, 0.13, 0.02]], 0.25, 0.3],
      ['k', 0.07, 420, 1.1], ['r', 0.07, [[640, 0.8, 0.06], [1450, 0.7, 0.07], [2600, 0.3, 0.045]], 0.8, 0.3]],
    // turned by a motor: the bolt's cam knocking in its track, a link dropping
    rotary: [['k', 0.003, 700, 0.5], ['r', 0.003, [[1500, 0.5, 0.025], [2900, 0.3, 0.02]], 0.5, 0.3], ['r', 0.011, [[4200, 0.18, 0.03]], 0.3, 0.2]],
    // a bolt action does not move: the barrel and the receiver ring after the blow, low
    ring: [['r', 0.002, [[520, 0.5, 0.25], [1150, 0.45, 0.3], [2300, 0.3, 0.22], [3700, 0.12, 0.12]], 0.8, 0], ['k', 0.003, 300, 0.7]],
    // a pump gun's receiver clanking with the blow (the pump itself is worked after it: mech 'pump')
    clank: [['k', 0.003, 330, 0.9], ['r', 0.003, [[380, 0.6, 0.15], [860, 0.7, 0.18], [1650, 0.4, 0.12], [2900, 0.15, 0.08]], 0.9, 0.2]],
    // a self-loader's bolt back and home
    autoshot: [['s', 0.01, 1000, 1700, 0.014, 0.08], ['k', 0.034, 360, 1.1], ['r', 0.034, [[520, 0.8, 0.06], [1200, 0.8, 0.07], [2300, 0.35, 0.05]], 0.8, 0.3],
      ['k', 0.074, 430, 1], ['r', 0.074, [[700, 0.8, 0.05], [1600, 0.6, 0.06], [2900, 0.25, 0.04]], 0.8, 0.4]],
    // a launch tube ringing with the blast; a grenade launcher's breech; a rail gun's rails singing as the slug leaves them; a harpoon's spring
    tube: [['k', 0.003, 260, 0.8], ['r', 0.003, [[430, 0.5, 0.18], [1050, 0.6, 0.22], [2100, 0.3, 0.15]], 0.8, 0.2]],
    breech: [['k', 0.002, 420, 0.8], ['r', 0.002, [[650, 0.5, 0.09], [1600, 0.5, 0.1], [2900, 0.25, 0.07]], 0.8, 0.3]],
    rails: [['r', 0.001, [[1900, 0.5, 0.3], [4300, 0.45, 0.35], [7100, 0.25, 0.25], [9800, 0.12, 0.2]], 0.8, 0.4], ['k', 0.002, 380, 0.6]],
    spring: [['k', 0.002, 400, 0.8], ['r', 0.002, [[420, 0.4, 0.25], [1300, 0.5, 0.2], [2900, 0.3, 0.12]], 0.9, 0.4], ['s', 0.004, 1500, 3000, 0.03, 0.08]],
    // a nail driven by air: the piston slamming down, the air let out, the piston back
    piston: [['k', 0, 600, 0.8], ['r', 0, [[1700, 0.8, 0.05], [3500, 0.5, 0.06], [5600, 0.25, 0.04]], 0.9, 0.6], ['s', 0.004, 4200, 6500, 0.045, 0.12], ['k', 0.028, 700, 0.6], ['r', 0.028, [[2100, 0.5, 0.04], [4200, 0.3, 0.03]], 0.7, 0.4]],
  };
  // (tanh, near enough and quick: for driving a whole take sample by sample)
  const ftanh = (x) => (x <= -3 ? -1 : x >= 3 ? 1 : (x * (27 + x * x)) / (27 + 9 * x * x));
  // (a filter run over an array in place: the cookbook's biquad - 'lp', 'hp', or 'bp' with its peak at 0 dB)
  function bqRun(x, type, f, q, sr) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    b0 /= a0; b1 /= a0; b2 /= a0; const a1 = (-2 * cs) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
  }
  // a part struck, written into a take (from sample i0): each mode a decaying sine a little off its Hz, with a phase of its own (a
  // recursive oscillator: a multiply-add a sample), the contact a click of noise. pan: -1 (left) .. 1 (right)
  function ringIn(L, R, i0, modes, g, click, pan, sr) {
    const n0 = L.length, gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan), ra = Math.max(1, Math.round(0.00025 * sr));
    for (const [f0, a, t60] of modes) {
      const f = Math.min(sr * 0.45, f0 * vr(1, 0.02)), k = Math.exp(-6.9 / (t60 * vr(1, 0.12) * sr)), w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w) * k, k2 = k * k;
      const m = a * vr(1, 0.2), ph = Math.random() * 6.283, n = Math.min(n0 - i0, Math.ceil(t60 * 1.3 * sr));
      let ym1 = Math.sin(ph - w) / k, y0 = Math.sin(ph);
      for (let j = 0; j < n; j++) { const v = y0 * m * (j < ra ? j / ra : 1); L[i0 + j] += v * gl; R[i0 + j] += v * gr; const y = c * y0 - k2 * ym1; ym1 = y0; y0 = y; }
    }
    if (click) {
      const n = Math.min(n0 - i0, Math.round(0.0012 * sr)), te = 0.00018 * sr; let last = 0;
      for (let j = 0; j < n; j++) { const w = Math.random() * 2 - 1, v = (w - last) * 0.5 * click * Math.exp(-j / te); last = w; L[i0 + j] += v * gl; R[i0 + j] += v * gr; }
    }
  }
  // a part sliding over another, written into a take: noise in a band, its level jagged (friction is a run of little catches)
  function slideIn(L, R, i0, f0, f1, d, g, pan, sr) {
    const n = Math.max(8, Math.min(L.length - i0, Math.round(d * sr))), x = new Float32Array(n), gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan);
    let s = 1; for (let j = 0; j < n; j++) { if (j % 24 === 0) s += (0.4 + Math.random() * 1.2 - s) * 0.6; x[j] = (Math.random() * 2 - 1) * s * Math.pow(Math.sin((Math.PI * j) / n), 0.6); }
    bqRun(x, 'bp', Math.sqrt(f0 * f1), 1.6, sr);
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * gl * 2.5; R[i0 + j] += x[j] * gr * 2.5; }
  }
  // (work arrays kept from take to take and cleared: made new each time, a take left some MB behind it, and the collector's pauses
  // came with it)
  const scr = [];
  const work = (k, n) => { if (!scr[k] || scr[k].length < n) scr[k] = new Float32Array(Math.ceil(n * 1.25)); const a = scr[k].subarray(0, n); a.fill(0); return a; };
  // a heavy part stopped by another (a slide on its frame, a carrier in its buffer, a bolt home): the dull knock of its mass - a short
  // burst of noise round f and a lower tone under it, dying in a few tens of ms, driven a little - before the ring of its steel
  function knockIn(L, R, i0, f, g, pan, sr) {
    const n = Math.min(L.length - i0, Math.round(0.06 * sr)); if (n <= 0) return;
    const x = work(3, n), te = 0.004 * sr, kd = Math.exp(-1 / (0.018 * sr)), gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan), w = (2 * Math.PI * f * vr(0.55, 0.05)) / sr, ra = 0.0006 * sr;
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * Math.exp(-j / te);
    bqRun(x, 'bp', f * vr(1, 0.08), 1, sr);
    let e = 1; const ph = Math.random() * 6.283;
    for (let j = 0; j < n; j++) { const y = ftanh(1.5 * (x[j] * 3 + 0.5 * e * Math.sin(ph + w * j) * Math.min(1, j / ra))); e *= kd; L[i0 + j] += y * gl; R[i0 + j] += y * gr; }
  }
  // one take of a shot (stereo): the layers above; recs: the recordings of this kind that have arrived; room: inside
  function shotTake(kind, p, recs, room) {
    const sr = ctx.sampleRate, at = (s) => Math.round(s * sr), rec = recs.length ? recs[Math.floor(Math.random() * recs.length)] : null;
    const rr = p.rr * vr(1, 0.02), recN = rec ? Math.min(at(0.9), Math.floor((rec.length - 2) / rr)) : 0, len = Math.max(at(p.len), recN, room ? 0 : at(0.5)) + at(0.002);
    const buf = ctx.createBuffer(2, len, sr), L = buf.getChannelData(0), R = buf.getChannelData(1), D = work(0, len), B = work(1, len);
    const boost = rec || !p.rv ? 1 : 1.3;   // (no recording yet: the blast carries more)
    // the recording, at the heart of it: only the swell under 25 Hz taken off (a fourth-order high-pass: 50 Hz and up is left as it was)
    if (rec) {
      const s = rec.getChannelData(0), x = D.subarray(0, recN);
      for (let i = 0; i < recN; i++) { const q = i * rr, k = Math.floor(q), w = q - k; x[i] = s[k] * (1 - w) + s[k + 1] * w; }
      bqRun(x, 'hp', 25, 0.54, sr); bqRun(x, 'hp', 25, 1.31, sr);
      let pk = 0; for (let i = 0; i < recN; i++) pk = Math.max(pk, Math.abs(x[i]));
      const g = p.rv / (pk || 1), fo = Math.min(recN, at(0.06));
      for (let i = 0; i < recN; i++) x[i] *= g * (i > recN - fo ? (recN - i) / fo : 1);
    }
    // the front: a burst of noise rising in a tenth of a ms, its top at fc, little over 6 kHz
    { const n = at(p.ft * 7), x = new Float32Array(n), a = Math.max(2, at(0.00012));
      for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * (i < a ? i / a : Math.exp(-(i - a) / (p.ft * sr)));
      const y = Float32Array.from(x); bqRun(x, 'hp', 1500, 0.7, sr); bqRun(x, 'lp', 6000, 0.7, sr); bqRun(y, 'bp', p.fc * vr(1, 0.06), 1.1, sr);
      for (let i = 0; i < n; i++) D[i] += (x[i] * 0.4 + y[i] * 1.4) * p.fl; }
    // the round's crack: up at once, down through nothing to as far below, up again at once
    if (p.nw) { const i0 = at(0.0002), n = Math.max(4, at(p.nd * vr(1, 0.1))); for (let i = 0; i <= n; i++) D[i0 + i] += p.nw * (1 - (2 * i) / n); }
    // the step in the pressure (a blast wave's own shape: up at once, falling through nothing into a pull as deep, and back)
    if (p.fw) { const T = p.fT * vr(1, 0.08) * sr, n = Math.min(len, Math.ceil(T * 9)); for (let i = 0; i < n; i++) B[i] += p.fw * (1 - i / T) * Math.exp(-i / T); }
    // the blast: rough noise round bf, dying fast and then slowly, driven
    { const n = Math.min(len - at(0.0003), at(p.b2 * 6 + 0.01)), x = work(2, n), a = at(0.0006), k1 = Math.exp(-1 / (p.b1 * vr(1, 0.1) * sr)), k2 = Math.exp(-1 / (p.b2 * vr(1, 0.1) * sr)), hold = p.hold || 0.1;
      let e1 = 1 - hold, e2 = hold;
      for (let i = 0; i < n; i++) { let e; if (i < a) e = i / a; else { e = e1 + e2; e1 *= k1; e2 *= k2; } x[i] = (Math.random() * 2 - 1) * e; }
      bqRun(x, 'bp', p.bf * vr(1, 0.08), 0.55, sr); bqRun(x, 'hp', 350, 0.7, sr);
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(x[i]));
      const d = (p.dr * vr(1, 0.1)) / (pk || 1), td = ftanh(p.dr), i0 = at(0.0003), g = (p.bl * boost) / td; for (let i = 0; i < n; i++) B[i0 + i] += g * ftanh(d * x[i]); }
    // the body of the report: a rough block of low and middle round bbf (a few hundred Hz), rising with the blast and dying over a
    // tenth of a second, driven hard - its overtones (120-500 Hz and up) carry the weight to small speakers, where 60 Hz is not heard
    if (p.bb) { const n = Math.min(len, at(Math.min(0.25, p.bb2 * 5) + 0.01)), x = work(2, n), a = at(0.0015), k1 = Math.exp(-1 / (p.bb1 * vr(1, 0.1) * sr)), k2 = Math.exp(-1 / (p.bb2 * vr(1, 0.1) * sr));
      let e1 = 0.7, e2 = 0.3;
      for (let i = 0; i < n; i++) { let e; if (i < a) e = i / a; else { e = e1 + e2; e1 *= k1; e2 *= k2; } x[i] = (Math.random() * 2 - 1) * e; }
      bqRun(x, 'bp', p.bbf * vr(1, 0.08), 0.6, sr); bqRun(x, 'lp', p.bbf * 2.6, 0.7, sr);
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(x[i]));
      const d = 2.4 / (pk || 1), g = (p.bb * boost) / ftanh(2.4); for (let i = 0; i < n; i++) B[i] += g * ftanh(d * x[i]); }
    // the push: a low tone sagging as it dies, driven (its overtones at two and three times), cut by 150 ms
    if (p.bg) { const n = Math.min(len, at(Math.min(p.pcut || 0.15, p.bd * 6))), a = at(0.0012), fo = at(0.02), f0 = p.bo * vr(1, 0.05), kd = Math.exp(-1 / (p.bd * sr)), kf = Math.exp(-1 / (0.016 * sr)), td = ftanh(2.2);
      let ph = 0, e = 1, sag = 0.4;
      for (let i = 0; i < n; i++) {
        ph += (2 * Math.PI * f0 * (0.6 + sag)) / sr; sag *= kf;
        const v = (ftanh(2.2 * (Math.sin(ph) + 0.3 * Math.sin(2 * ph))) / td) * (i > n - fo ? (n - i) / fo : 1);
        if (i < a) D[i] += p.bg * (i / a) * v; else { D[i] += p.bg * e * v; e *= kd; }
      } }
    // (a plan's: a wide head, a short body under it, the low blow driven with the rest - see GUNP)
    if (p.headx && !p.headpost) headIn(D, 0, p.headx, p.headt || 0.0025, sr, null, p.headd);
    if (p.bodyx) bodyIn(D, at(0.0004), p, sr);
    // (a plan's lowk: its low blow cut at lowk of its time constants instead of 6 - what is left by then is far under the rest)
    const lw = (X, i0, t) => (p.lowk ? X.subarray(0, Math.min(X.length, i0 + Math.round(t * p.lowk * sr))) : X);
    if (p.lowx && p.lowpre) { const i0 = at(0.0015 + (p.lowd || 0)), lt = p.lowt || 0.07; lowIn(lw(D, i0, lt), lw(B, i0, lt), i0, 105, 58, lt, p.lowx * 0.5, sr, p.lowa); lowIn(lw(D, i0, lt * 0.8), lw(B, i0, lt * 0.8), i0, 230, 125, lt * 0.8, (p.low2x || 0) * 0.5, sr, p.lowa); }
    // (a plan's: the bright head - driven with the rest, or laid over the drive below; the room's returns carry brroom of it)
    const brb = p.brx ? brightBuf(p, sr) : null, br0 = at(p.br0 || 0);
    if (brb && p.brpre) addIn(D, brb, br0, 1);
    for (let i = 0; i < len; i++) { const v = D[i] + B[i]; L[i] = v; R[i] = v; D[i] = v; }
    // (a plan's: a shotgun's burst of small cracks driven with the rest - the room answers it too)
    if (p.popx && p.poppre) popIn(L, R, at(0.0003), p, sr, D);
    // the place. A room: hard early returns off the stone close round (dulled a little, the push not in them), and a low bloom after
    // them (the room's air answering, its low end in it). Open ground: the ground's one return, and the slap of the shot off something far
    { const H = B; for (let i = 0; i < len; i++) H[i] = D[i];
      if (brb && p.brroom) addIn(H, brb, br0, p.brroom);
      bqRun(H, 'lp', p.erlp || 2800, 0.7, sr); bqRun(H, 'hp', 250, 0.7, sr);
      const tap = (S, ms, g, pan) => {
        if (p.wid !== undefined) pan = Math.max(-1, Math.min(1, pan * p.wid));
        const d = at((ms * vr(1, 0.12)) / 1000), gg = g * (Math.random() < 0.3 ? -1 : 1), gl = gg * Math.min(1, 1 - pan), gr = gg * Math.min(1, 1 + pan);
        for (let i = 0; i + d < len; i++) { const v = S[i]; L[i + d] += v * gl; R[i + d] += v * gr; }
      };
      if (p.thick) for (const [ms, g, pan] of [[8.5, 0.3, 0.6], [13, 0.26, -0.5], [19, 0.22, 0.3], [27, 0.17, -0.6], [36, 0.12, 0.5], [48, 0.08, -0.3]]) tap(H, ms, g * p.thick, pan);
      if (room) {
        for (const [ms, g, pan] of [[4.6, 0.34, -0.5], [7.4, 0.3, 0.6], [11.8, 0.24, -0.2], [16.5, 0.18, 0.7], [23, 0.1, -0.7], [31, 0.06, 0.3]]) tap(H, ms, g * p.er, pan);
        bqRun(D, 'lp', p.bloomlp || 420, 0.7, sr);
        for (const [ms, g, pan] of [[19, 0.18, -0.4], [34, 0.16, 0.5], [52, 0.12, -0.2], [75, 0.08, 0.4], [104, 0.05, -0.5]]) tap(D, ms, g * p.er, pan);
      } else {
        tap(H, 3.4, 0.5 * p.er, 0);
        bqRun(D, 'lp', p.echlp || 1800, 0.7, sr); bqRun(D, 'hp', 120, 0.7, sr);
        const te = vr(130, 0.35); tap(D, te, 0.28 * p.ech, -0.4); tap(D, te * 1.75, 0.16 * p.ech, 0.5);
      } }
    // (the shot driven into its top, as a microphone that near is: its edge stays as sharp, its peaks lose a few dB, and what follows
    // them - the blast, the body - stands that much nearer them; each take comes to the same top, how loud a kind is is lv)
    { let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
      const d = (p.sat || 1.8) / (pk || 1), td = ftanh(p.sat || 1.8);
      for (let i = 0; i < len; i++) { L[i] = ftanh(d * L[i]) / td; R[i] = ftanh(d * R[i]) / td; } }
    // (a plan's: the head laid over the drive, so that it is not squashed with the rest; a shotgun's burst of small cracks)
    if (p.headx && p.headpost) headIn(L, 0, p.headx, p.headt || 0.0025, sr, R, p.headd);
    if (p.popx && !p.poppre) popIn(L, R, at(0.0003), p, sr);
    // (a plan's: the bright head over the drive, kept as sharp as it was made; the air the report leaves hissing after it)
    if (brb && !p.brpre) { addIn(L, brb, br0, 1); addIn(R, brb, br0, 1); }
    if (p.edx && !p.edpost) edgeIn(L, R, at(p.ed0 || 0), p, sr);
    if (p.airx) airIn(L, R, at(p.air0 || 0.003), p, sr);
    // (round 6's: the low blow as a short falling kick and a lump of low noise, and the report bursting on into its tail, over the drive)
    if (p.kx) kickIn(L, R, at(p.kd || 0.001), p, sr);
    if (p.bsx && p.bspre) { const [yl, yr] = burstIn(len, p, sr); for (let i = 0; i < len; i++) { L[i] += yl[i] * p.bsx; R[i] += yr[i] * p.bsx; } }
    // (a plan's: the top over some 6 kHz taken down a little, so that the louder shot is no harder on the ear than the published one)
    if (p.hicut) { bqRun(L, 'lp', p.hicut, 0.6, sr); bqRun(R, 'lp', p.hicut, 0.6, sr); }
    // the action, in the hands a little to the right (over the drive: steel ringing is not driven)
    for (const e of p.actx ? (ACT[p.act] || []).concat(p.actx) : ACT[p.act] || []) {
      const i0 = at(e[1] * vr(1, 0.06)); if (i0 >= len) continue;
      if (e[0] === 's') slideIn(L, R, i0, e[2], e[3], e[4], e[5] * p.ag, 0.25, sr);
      else if (e[0] === 'k') knockIn(L, R, i0, e[2], e[3] * p.ag * 0.6, 0.25, sr);
      else ringIn(L, R, i0, e[2], e[3] * p.ag * 0.6, e[4], 0.25, sr);
    }
    // (a plan's: a low blow of its own over the drive, its overtones with it)
    if (p.lowx && !p.lowpre) { const i0 = at(0.0015 + (p.lowd || 0)), lt = p.lowt || 0.07; lowIn(lw(L, i0, lt), lw(R, i0, lt), i0, 105, 58, lt, p.lowx, sr, p.lowa); lowIn(lw(L, i0, lt * 0.8), lw(R, i0, lt * 0.8), i0, 230, 125, lt * 0.8, p.low2x || 0, sr, p.lowa); }
    if (p.vly !== undefined) valleyIn(L, R, p, sr);
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    if (pk > 1) for (let i = 0; i < len; i++) { L[i] /= pk; R[i] /= pk; }
    return buf;
  }
  // open ground's answer to a shot: the far, low roll of it thrown back from all round (it swells as the returns come in, then dies),
  // and a few far returns of the blast itself. Shared by all the guns, played faster for a short one (a few takes, made once)
  const tails = [], cases = [];
  function tailTake() {
    if (tails.length >= 3) return tails[Math.floor(Math.random() * tails.length)];
    const sr = ctx.sampleRate, len = Math.round(2 * sr), buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const b = buf.getChannelData(c), x = new Float32Array(len);
      for (let i = 0; i < len; i++) x[i] = Math.random() * 2 - 1;
      bqRun(x, 'lp', 520, 0.6, sr); bqRun(x, 'lp', 520, 0.6, sr); bqRun(x, 'hp', 70, 0.7, sr);
      let pk = 0;
      for (let i = 0; i < len; i++) { const t = i / sr, r = Math.min(1, Math.max(0, (t - 0.04) / 0.12)); x[i] *= r * r * (3 - 2 * r) * Math.exp(-Math.max(0, t - 0.16) / 0.36); pk = Math.max(pk, Math.abs(x[i])); }
      for (let i = 0; i < len; i++) b[i] = (x[i] / (pk || 1)) * 0.7;
      for (const [tt, g] of [[vr(0.22, 0.2), 0.9], [vr(0.38, 0.2), 0.6], [vr(0.62, 0.2), 0.35]]) {
        const i0 = Math.round((tt + (c ? vr(0.006, 0.5) : 0)) * sr), n = Math.round(0.08 * sr), y = new Float32Array(n);
        for (let j = 0; j < n; j++) y[j] = (Math.random() * 2 - 1) * Math.min(1, j / (0.004 * sr)) * Math.exp(-j / (0.02 * sr));
        bqRun(y, 'lp', 1100, 0.7, sr); bqRun(y, 'hp', 150, 0.7, sr);
        let q = 0; for (let j = 0; j < n; j++) q = Math.max(q, Math.abs(y[j]));
        for (let j = 0; j < n && i0 + j < len; j++) b[i0 + j] += (y[j] / (q || 1)) * g;
      }
    }
    tails.push(buf); return buf;
  }
  // an empty brass case thrown out to the right, landing on the floor and bouncing: a thin tube ringing high, quieter each time
  function caseTake() {
    if (cases.length >= 4) return cases[Math.floor(Math.random() * cases.length)];
    const sr = ctx.sampleRate, len = Math.round(0.5 * sr), buf = ctx.createBuffer(2, len, sr), L = buf.getChannelData(0), R = buf.getChannelData(1), f = vr(1, 0.08);
    let t = 0;
    for (const lv of [1, vr(0.55, 0.2), vr(0.3, 0.25), vr(0.15, 0.3)]) {
      ringIn(L, R, Math.round(t * sr), [[3900 * f, 0.6, 0.12], [6400 * f, 0.45, 0.09], [9100 * f, 0.25, 0.06], [11800 * f, 0.12, 0.04]], lv, 0.6, 0.6, sr);
      t += vr(0.1, 0.25) * (1.15 - lv * 0.4);
    }
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    for (let i = 0; i < len; i++) { L[i] /= pk || 1; R[i] /= pk || 1; }
    cases.push(buf); return buf;
  }
  const shotSets = {}, shotLast = {};
  let lastTail = -9, lastCase = -9;
  const shotQ = [];
  let shotIdle = false;
  A.shotStats = { made: 0, ms: 0, max: 0, log: [], clear() { for (const k in shotSets) delete shotSets[k]; } };   // (how many takes were written, the time they took, the longest: for the measurements)
  // ---------- each gun's own shot (the game's, and soundcheck.html's rounds 3 and 4) ----------
  // A take as shotTake makes it from SHOT alone is the shot as it was published ('pub'). Each kind has plans laid over that: round 3's
  // 2, with 1 a milder and 3 a stronger one the same way; round 4's A / B / C over 2 (see R4 below). The game's own is a kind's B where it
  // has one (every gun but the assault rifle and the submachine gun), its 2 where not - unless GDEF names another (round 5: C for all but
  // the pistol, the assault rifle and the submachine gun; round 7: K for the shotgun, the sniper's rifle, the revolver and the machine gun). A.gunFlavor: 0 the game's own, 'pub' the published shot, 1-3 / 'A'-'K' a
  // kind's plan (one it has not falls back to the game's own).
  // What a plan sets over SHOT's: lowx / low2x: a low blow laid over the drive (105 Hz falling to 58, 230 to 125), lowt: how fast it
  // dies (s); pcut: the push cut at (s); headx: a wide head (1-4 kHz), headt: how fast it dies (s), headd: driven, headpost: laid over
  // the drive; bodyx: a short body under it - bodyf (Hz), bodya (s to rise), bodyh (s held), bodyt (s to die), bodyc (s, cut), bodyn
  // (its share of noise), bodylo / bodyhi (its band, Hz); popx: a shotgun's burst of small cracks, popn how many, popT over how long
  // (s); mv: the working of the action after it (the pump, the bolt) louder; hicut: the top cut (Hz, 9 kHz unless a plan says). lvl: dB of loudness over the published take (K-weighted,
  // its first 300 ms); duck: the rest of the sound pulled down as your own shot goes off [dB, s held, s to come back]
  A.gunFlavor = 0;
  // (every shot of the new set this much louder than the published one: soundcheck.html's round 2 was heard best at 120 %)
  const GUNV = 1.2;
  const O = Object.assign;
  // round 2's A, k as much of it: the push (60-120 Hz) stronger and longer, the body lower, a low blow of its own over the drive
  const lowB = (p, k, t) => ({ bg: p.bg * (1 + 0.6 * k), bd: p.bd * (1 + 0.6 * k), bo: Math.max(p.bo, 100), pcut: 0.24, bbf: p.bbf * 0.75, lowx: 0.55 * k, low2x: 0.45 * k, lowt: t || 0.075 });
  // a handgun: short, but the weight of its round in it - a body at 150-300 Hz and the low blow's upper part (230 Hz) strong, the low
  // one short and a little after the head; the head kept full over the drive (w: how heavy - a revolver more than a pistol)
  const hand = (p, k, w) => O(lowB(p, 0.6 * k * w, 0.035 + 0.015 * w), { lowd: 0.002, low2x: 0.8 * k * w, pcut: 0.09 + 0.03 * w, bbf: 250 - 50 * w, bb: p.bb * (1 + 0.25 * k), bodyx: 0.9 * k * w, bodyf: 200 - 30 * w, bodya: 0.002,
    bodyh: 0.005 + 0.004 * w, bodyt: 0.014 + 0.008 * w, bodyc: 0.06 + 0.02 * w, bodyn: 0.5, bodylo: 100, bodyhi: 320, headx: 0.8 * k, headt: 0.003, headd: 2.5, headpost: 1, mv: 1 + 0.3 * k,
    lvl: 0.5 + 1.1 * k * w, duck: [-5 - 4 * k * w, 0.035 + 0.01 * w, 0.08 + 0.04 * k * w] });
  // a long gun fired once: a big low blow a little after a strong, full head; a room rings more, open ground rolls it far and long
  const longG = (p, k, room) => O(lowB(p, 0.82 * k, 0.09 + 0.02 * k), { lowd: 0.003, lowa: 0.003, pcut: 0.3, headx: 1.2 * k, headt: 0.0035, headd: 3, headpost: 1, fl: p.fl * (1 + 0.3 * k), nw: p.nw * (1 + 0.4 * k), len: 0.55, mv: 1.2,
    lvl: 0.8 + 1.2 * k, duck: [-9 - 5.5 * k, 0.05 + 0.035 * k, 0.15 + 0.13 * k] }, room ? { er: p.er * (1 + 0.25 * k), wet: p.wet * (1 + 0.3 * k) } : { ech: p.ech * (1 + 0.6 * k), tail: p.tail * (1 + 0.6 * k), tl: p.tl * (1 + 0.9 * k) });
  // a shotgun: the report bursting - a scatter of small cracks over its first 15-25 ms, driven with the rest - over a big body (80-250
  // Hz) that opens after it and holds longer than any other gun's (the blast's own front lower, so that the burst leads); a room rings
  // with it, open ground throws it back wide; the pump after it plain to hear
  // (pushed further, more of the burst than of the body: the body takes the room the burst needs)
  const scat = (p, k, room) => O({ bbf: p.bbf * 0.8, bg: p.bg * (1 + 0.15 * k), bd: p.bd * (1 + 0.25 * k), lowx: 0.15 * Math.min(k, 1.2), low2x: 0.3 * Math.min(k, 1.2), lowt: 0.12 + 0.02 * k, lowd: 0.004, lowa: 0.006, pcut: 0.3,
    bodyx: 0.6 * Math.min(k, 1.3), bodyf: 140, bodya: 0.004, bodyh: 0.016 + 0.004 * k, bodyt: 0.05 + 0.01 * k, bodyc: 0.18 + 0.02 * k, bodyn: 0.45, bodylo: 80, bodyhi: 230,
    popx: 1.2 + 1.8 * k, popn: Math.round(16 + 14 * k), popT: 0.012 + 0.008 * k, poppre: 1, popk: 0.15, popd: 0.0004, hold: 0.08, b2: p.b2 * 0.8, fl: p.fl * 0.5,
    len: 0.5, mv: 1.5, lvl: 0.8 + 1.3 * k, duck: [-9 - 5 * k, 0.05 + 0.025 * k, 0.15 + 0.07 * k] },
    room ? { er: p.er * (1 + 0.4 * k), wet: p.wet * (1 + 0.35 * k) } : { ech: p.ech * (1 + 0.7 * k), tail: p.tail * (1 + 0.35 * k), tl: p.tl * (1 + 0.7 * k) });
  const GUNP = {
    // the assault rifle: round 2's E - the low blow, and the rest pulled down as it goes off (3: a little more of both)
    rifle: { 2: (p) => O(lowB(p, 1), { lvl: 1, duck: [-10, 0.05, 0.12] }), 3: (p) => O(lowB(p, 1.3), { lvl: 1.8, duck: [-12, 0.05, 0.13] }) },
    // the submachine gun: the rifle's way, lighter and thinner - a smaller, shorter low blow, the rest pulled down less and for less
    smg: { 2: (p) => O(lowB(p, 0.45, 0.045), { pcut: 0.13, bbf: p.bbf * 0.85, lvl: 0.3, duck: [-6, 0.03, 0.07] }), 3: (p) => O(lowB(p, 0.65, 0.055), { pcut: 0.16, bbf: p.bbf * 0.8, lvl: 0.7, duck: [-7, 0.035, 0.08] }) },
    pistol: { 1: (p) => hand(p, 0.6, 1), 2: (p) => hand(p, 1, 1), 3: (p) => hand(p, 1.6, 1) },
    // (the revolver: the pistol's way, heavier and lower)
    revolver: { 1: (p) => hand(p, 0.6, 1.3), 2: (p) => hand(p, 1, 1.3), 3: (p) => hand(p, 1.6, 1.3) },
    sniper: { 1: (p, r) => longG(p, 0.6, r), 2: (p, r) => longG(p, 1, r), 3: (p, r) => longG(p, 1.6, r) },
    // (the marksman's rifle: between the rifle and the sniper's)
    dmr: { 2: (p, r) => longG(p, 0.55, r) },
    shotgun: { 1: (p, r) => scat(p, 0.6, r), 2: (p, r) => scat(p, 1, r), 3: (p, r) => scat(p, 1.6, r) },
    // (the machine gun: the rifle's way, heavier, its weight holding on through the fire)
    lmg: { 1: (p) => O(lowB(p, 1.1, 0.08), { bbf: p.bbf * 0.72, lvl: 1.1, duck: [-10, 0.05, 0.12] }), 2: (p) => O(lowB(p, 1.5, 0.085), { bbf: p.bbf * 0.7, lvl: 1.8, duck: [-11, 0.05, 0.13] }),
      3: (p) => O(lowB(p, 1.75, 0.095), { bbf: p.bbf * 0.68, lvl: 2.2, duck: [-13, 0.055, 0.14] }) },
    // (the rotary gun: the submachine gun's way, lighter still)
    minigun: { 2: (p) => O(lowB(p, 0.35, 0.04), { pcut: 0.1, lvl: 0, duck: [-5, 0.02, 0.05] }) },
    // (what is launched: the launch given weight - not pulled down round it, as a friend's launch cannot be told from your own)
    rocket: { 2: (p) => O(lowB(p, 0.9, 0.12), { bo: p.bo, pcut: 0.3, lvl: 1 }) },
    gl: { 2: (p) => O(lowB(p, 0.8, 0.08), { bo: p.bo, lvl: 1 }) },
    rail: { 2: (p) => O(lowB(p, 1.1, 0.12), { bo: p.bo, pcut: 0.3, lvl: 1.5 }) },
    harpoon: { 2: (p) => O(lowB(p, 0.5, 0.05), { lvl: 0.5 }) },
    nail: { 2: (p) => O(lowB(p, 0.3, 0.03), { pcut: 0.08, lvl: 0, duck: [-4, 0.02, 0.05] }) },
  };
  // Round 4: round 3's 2 was heard as muffled - its top cut at 9 kHz, its head no brighter than the published one's, only the low blow and
  // the body made bigger. Over 2: A takes the muffle off only (a bright head over the low blow, the top left uncut, the room's returns and
  // open ground's slap let bright); B (the game's own) is brighter and louder, each gun in its own way; C further still. Not made harder on
  // the ear by cutting the top but by the length: the bright head is short (10-35 ms) and falls off upward as a real report does.
  // What a plan sets for it: brx a bright head (brightBuf: its level at its peak; brt / brt2 how fast its sharp part and the rest die (s),
  // brs the sharp part's share, brc its length (s), brd how hard it is driven, brroom how much of it the room's returns carry, brpre:
  // driven with the rest); airx / airt / airlo / airhi / air0: the air after it (airIn); erlp / echlp / bloomlp: the room's returns,
  // open ground's slap and the room's low bloom let that bright (Hz); popl / poph: a shotgun's burst of cracks between those (Hz); lowk:
  // the low blow cut at that many of its time constants (6 unless a plan says: what is left by 5 is far under the rest); clip:
  // dB a take may be brought up into a soft top to reach its loudness (levelTake); shave: dB its peaks may be turned down (0: none); topx:
  // its top that much under TOP (a take brought up into its top stands near it for longer: the master's limiter is left alone under it)
  const R4 = { A: 0, B: 1, C: 2 };
  const lit = (v, o) => O({ hicut: 0, lowk: 5, brx: [1.2, 1.8, 2.4][R4[v]], brt: 0.0013, brt2: [0.008, 0.01, 0.012][R4[v]], brs: 0.5, brc: [0.022, 0.028, 0.035][R4[v]], brd: 2.5, brroom: 1,
    erlp: 5200, echlp: 3600, bloomlp: 600, clip: [6, 7, 10][R4[v]], shave: 0, topx: 0.9, airx: [0.05, 0.08, 0.13][R4[v]], airt: [0.025, 0.03, 0.045][R4[v]] }, o);
  // (louder by l dB a version over 2, and the rest pulled down round it a little deeper and longer)
  const louder = (q, v, l) => ({ lvl: q.lvl + l[R4[v]], duck: q.duck.map((d) => d * [1, 1.15, 1.3][R4[v]]) });
  const r4 = (kind, f) => { for (const v of ['A', 'B', 'C']) GUNP[kind][v] = (p, r) => f(v, R4[v], GUNP[kind][2](p, r), p, r); };
  // the pistol: short and sharp - a bright head of some 20 ms, a little air after it - and the weight of its round kept (the low blow's
  // lower part made up for what the head takes of the loudness)
  r4('pistol', (v, k, q) => O(q, lit(v, { brx: [2.8, 2.6, 2.8][k], brs: 0.4, brt2: [0.007, 0.008, 0.009][k], brc: [0.02, 0.022, 0.028][k], airx: [0.15, 0.15, 0.22][k], airt: [0.022, 0.025, 0.035][k] }),
    { lowx: q.lowx * 1.4 }, louder(q, v, [0.3, 1.2, 2.7])));
  // the revolver: the pistol's way, bigger, heavier and sharper
  r4('revolver', (v, k, q) => O(q, lit(v, { brx: [3, 2.2, 2.9][k], airx: [0.07, 0.08, 0.13][k] }), { bodyx: q.bodyx * [1.15, 1.25, 1.25][k] }, louder(q, v, [0, 2, 3])));
  // the sniper's rifle: the round's crack sharp and strong at the very front, the big low blow after it; on open ground the roll after it
  // keeps its middle and upper part through its first 0.3 s
  r4('sniper', (v, k, q, p, r) => O(q, lit(v, { brs: 0.7, brt: 0.001, brx: [1.8, 2, 3.2][k], airx: [0.08, 0.08, 0.36][k] }), k ? { nw: q.nw * [1, 1.4, 1.5][k] } : {},
    k && !r ? { airx: [0, 0.12, 0.3][k], airt: [0, 0.1, 0.14][k], airlo: 1000, airhi: 5000, echlp: 5000 } : {}, louder(q, v, [-0.5, 1, 2])));
  // the shotgun: the report bursting - its cracks spread up to 12 kHz, each sharp, more of them and further apart, driven with the rest
  // so that the room answers them - over the big body, and the air of it hissing after (A: the bright head over round 3's burst only)
  r4('shotgun', (v, k, q) => O(q, lit(v, { brx: 1 }), k ? { brx: 0, popl: 900, poph: 12000, popd: 0.00015, popk: 0.15, poppre: 1, popn: [0, 26, 28][k], popT: [0, 0.032, 0.036][k], popx: [0, 7, 8.5][k], fl: 0.2, bl: 0.4,
    airx: [0, 0.15, 0.26][k], airt: [0, 0.035, 0.055][k], air0: 0.02 } : {}, louder(q, v, [0.5, 1.2, 2.7])));
  // the machine gun: a short bright head on each shot, so that in fast fire each stands out of the weight under it (the low blow a
  // little less in B, the rest pulled down round it as in 2)
  r4('lmg', (v, k, q) => O(q, lit(v, { brx: [4.2, 4, 6.5][k], brt2: 0.006, brc: 0.018, airx: [0.06, 0.08, 0.45][k], airt: [0.02, 0.02, 0.045][k] }), k === 1 ? { lowx: q.lowx * 0.85, low2x: q.low2x * 0.85 } : {},
    { lvl: q.lvl + [0.3, 1.6, 2.6][k] }));
  // (the rest in B's way only: the marksman's rifle as the sniper's, lighter; the rotary gun as the machine gun's, shorter; what is
  // launched given a bright launch of its own)
  const r4B = (kind, f) => { GUNP[kind].B = (p, r) => f(GUNP[kind][2](p, r), p, r); };
  r4B('dmr', (q) => O(q, lit('B', { brs: 0.7, brt: 0.001, brx: 1.8, airx: 0.06 }), { nw: q.nw * 1.2 }, louder(q, 'B', [0, 0.4, 0])));
  r4B('minigun', (q) => O(q, lit('B', { brx: 1.6, brt2: 0.004, brc: 0.012, airx: 0, clip: 4 }), { lvl: q.lvl + 0.5 }));
  r4B('rocket', (q) => O(q, lit('B', { brx: 1.2, brt2: 0.012, brc: 0.035, airx: 0.1, airt: 0.06, clip: 4 }), { lvl: q.lvl + 0.5 }));
  r4B('gl', (q) => O(q, lit('B', { brx: 1.2, brt2: 0.008, brc: 0.022, airx: 0.05, clip: 4 }), { lvl: q.lvl + 0.5 }));
  r4B('rail', (q) => O(q, lit('B', { brx: 2, brt: 0.001, brs: 0.7, airx: 0.1, airt: 0.05, clip: 4 }), { lvl: q.lvl + 0.5 }));
  r4B('harpoon', (q) => O(q, lit('B', { brx: 0.6, airx: 0.03, clip: 3 }), { lvl: q.lvl + 0.3 }));
  r4B('nail', (q) => O(q, lit('B', { brx: 0.8, brt2: 0.004, brc: 0.012, airx: 0, clip: 3 }), { lvl: q.lvl + 0.3 }));
  // (round 5: C for the rest too, each as the gun nearest it - the marksman's rifle as the sniper's, the rotary gun as the machine gun's,
  // short, what is launched a brighter launch - and C the game's own for all of them)
  const r4C = (kind, f) => { GUNP[kind].C = (p, r) => f(GUNP[kind][2](p, r), p, r); };
  r4C('dmr', (q) => O(q, lit('C', { brs: 0.7, brt: 0.001, brx: 2.6, airx: 0.2, airt: 0.06 }), { nw: q.nw * 1.35 }, louder(q, 'C', [0, 0, 1.4])));
  r4C('minigun', (q) => O(q, lit('C', { brx: 2.2, brt2: 0.004, brc: 0.012, airx: 0.05, airt: 0.015, clip: 5 }), { lvl: q.lvl + 1.2 }));
  r4C('rocket', (q) => O(q, lit('C', { brx: 1.7, brt2: 0.014, brc: 0.04, airx: 0.16, airt: 0.08, clip: 5 }), { lvl: q.lvl + 1.2 }));
  r4C('gl', (q) => O(q, lit('C', { brx: 1.7, brt2: 0.009, brc: 0.026, airx: 0.09, clip: 5 }), { lvl: q.lvl + 1.2 }));
  r4C('rail', (q) => O(q, lit('C', { brx: 2.8, brt: 0.001, brs: 0.7, airx: 0.16, airt: 0.07, clip: 5 }), { lvl: q.lvl + 1.2 }));
  r4C('harpoon', (q) => O(q, lit('C', { brx: 0.85, airx: 0.05, clip: 4 }), { lvl: q.lvl + 0.7 }));
  r4C('nail', (q) => O(q, lit('C', { brx: 1.1, brt2: 0.004, brc: 0.012, airx: 0, clip: 4 }), { lvl: q.lvl + 0.7 }));
  // Round 5, over C. D sharp and tight: a sharp head of its own at the very front (edgeIn), laid in after the take's level is set and not
  // bent at all, the take a little under it (topx), moved behind it and brought in under it, and a valley after it (valleyIn). The take
  // itself is bent into its top by fewer dB than C's. Its own front (the front's burst, the round's crack, the wide head, the step) is
  // left to the sharp head and taken down, so that it does not stand in the sharp head's place and its peak leaves the body the room it
  // had; its bright head is smaller and comes after the valley (br0), so that what follows the gap is not dull; the low blow a little
  // smaller and later; the room's returns and the air drawn in to the middle and shorter. E: D's head, and the report thrown out round
  // you after it (spreadIn; the room's returns and the air wider and longer). F: E as far as it goes. A gun fired once pulls the rest
  // down deeper and for longer round it.
  const R5 = { D: 0, E: 1, F: 2 };
  const qv = (q, p, k) => (q[k] !== undefined ? q[k] : p[k]);
  const sharpP = (q, p, k, one, o) => O({ edpost: 1, edsh: 0.0018, edx: 1, edh: 0.0013, ed1: 0.0005, ed2: 0.0009, eds: 0.5, edc: 0.0033, edhp: 1800, edlp: 15000, edg: 3, edf: 0.3, edfi: 0.005, edtx: 0.9, topx: 0.72,
    vly: 0.3, vl0: 0.0003, vl1: 0.0065, vl2: 0.015, vlhp: 1000, clip: 6, lowx: q.lowx * 0.6, low2x: (q.low2x || 0) * 0.85, lowd: (q.lowd || 0) + 0.001,
    brx: q.brx * 0.4, br0: 0.007, brs: 0.3, fl: qv(q, p, 'fl') * 0.3, nw: qv(q, p, 'nw') * 0.4, headx: (q.headx || 0) * 0.3, fw: p.fw * 0.42, duck: one ? [q.duck[0] * 1.12, q.duck[1] * 1.4, q.duck[2] * 1.25] : q.duck },
  k ? { airx: q.airx * [1, 1.5, 2][k], airt: q.airt * [1, 1.4, 1.9][k], wid: [1, 1.3, 1.6][k], tl: qv(q, p, 'tl') * [1, 1.25, 1.6][k] } : { er: qv(q, p, 'er') * 0.7, ech: qv(q, p, 'ech') * 0.6, tl: qv(q, p, 'tl') * 0.7, airt: q.airt * 0.7, airw: 0.35, wid: 0.4 }, o);
  // (the spread, E (k 1) and F (2): a room's walls throwing it back bright, close round you, and its air after; open ground: a few near
  // returns and the far ones coming back from all round, one after another, rolling off)
  const sprP = (k, room, o) => (k ? O(room ? { spn: [0, 10, 18][k], sp0: 0.008, sp1: [0, 0.045, 0.07][k], spg: [0, 0.35, 0.5][k], sphp: 700, splp: 9000, spf: [0, 6, 12][k], sf0: 0.05, sf1: [0, 0.16, 0.3][k], sfg: [0, 0.1, 0.16][k], sft: [0, 0.07, 0.14][k], sflp: 5000, spw: [0, 0.85, 1][k], spsrc: 0.03 }
    : { spn: [0, 6, 10][k], sp0: 0.008, sp1: [0, 0.035, 0.05][k], spg: [0, 0.25, 0.35][k], sphp: 600, splp: 8000, spf: [0, 14, 22][k], sf0: 0.08, sf1: [0, 0.65, 1][k], sfg: [0, 0.8, 1][k], sft: [0, 0.4, 0.6][k], sflp: 6000, spw: [0, 0.85, 1][k], spsrc: 0.04, len: [0, 0.75, 1.1][k] }, o) : {});
  const r5 = (kind, f) => { for (const v of ['D', 'E', 'F']) GUNP[kind][v] = (p, r) => f(v, R5[v], GUNP[kind].C(p, r), p, r); };
  // the shotgun: its cracks drawn closer to the front; in D the head in the middle and its cracks close round it, in E and F the head
  // in the middle and what bursts after it thrown out wide - it bursts round you
  r5('shotgun', (v, k, q, p, r) => O(q, sharpP(q, p, k, true, { edh: 0.001, vly: 0.55, edf: 0.5, clip: 7.5, popd: 0.0001, popT: 0.026, popk: 0.35, popw: [0.35, 1.4, 1.66][k], popw0: [0.2, 0.25, 0.3][k], popc: 0.012 }), sprP(k, r, r ? { spn: [0, 12, 20][k], spg: [0, 0.75, 0.85][k], sp1: [0, 0.065, 0.09][k] } : { spf: [0, 16, 24][k], sfg: [0, 1, 1.2][k], spn: [0, 9, 12][k], sp1: [0, 0.06, 0.07][k], spg: [0, 0.35, 0.42][k] })));
  // the sniper's rifle: the round's crack first and sharpest of all (an N-wave of its own on the head); on open ground what rolls away
  // after it longest
  r5('sniper', (v, k, q, p, r) => O(q, sharpP(q, p, k, true, { edn: 0.5, edd: 0.00012 }), sprP(k, r, r ? {} : { sf1: [0, 0.9, 1.3][k], sft: [0, 0.45, 0.7][k], sfg: [0, 1.15, 1.6][k], spg: [0, 0.25, 0.45][k], len: [0, 1, 1.4][k] })));
  // the revolver: a big round's crack, broader and a little longer than the pistol's
  r5('revolver', (v, k, q, p, r) => O(q, sharpP(q, p, k, true, { edh: 0.0015, ed2: 0.0012, edhp: 1500, edn: 0.3, edd: 0.0002 }), sprP(k, r)));
  // the machine gun: each shot's head held a little longer, the take further under it and its low blow and air shorter, so that in fast
  // fire what is left of one shot sits as far under the next one's head as in C; its spread short and low, and as much on each side
  // with opposite signs (spside) - wide round you, nothing of it in the middle where the next head is
  r5('lmg', (v, k, q, p, r) => O(q, sharpP(q, p, k, false, { edh: 0.0024, edc: 0.0045, edf: 0.45, topx: 0.62, clip: 5, vly: 0.2, brx: q.brx * 0.25, br0: 0.011, lowx: q.lowx * 0.3, low2x: (q.low2x || 0) * 0.5, lowt: q.lowt * 0.7,
    airx: q.airx * [1, 1, 1][k], airt: q.airt * [0.42, 0.5, 0.55][k], tl: qv(q, p, 'tl') * [0.7, 1, 1][k] }),
    sprP(k, r, { spside: 1, spn: [0, 5, 8][k], sp1: [0, 0.025, 0.035][k], spf: [0, 5, 8][k], sf0: 0.07, sf1: [0, 0.35, 0.5][k], sfg: r ? [0, 0.15, 0.3][k] : [0, 0.5, 0.55][k], sft: [0, 0.2, 0.3][k], len: qv(q, p, 'len') })));
  // Round 6, over C. C was heard as a ball bouncing and stopping: its low blow and push are tones (some 60-140 Hz) that ring on for a
  // tenth of a second and more, while over 1 kHz it was gone 20 dB down within 30-40 ms - the note left alone. G / H / I take the note out
  // of the low end and let the report burst on: the low blow a short falling kick and a lump of low noise (kickIn), the push short and
  // small, the body all noise; over it a burst of broad noise going on from the head into its tail with no gap, wider as it goes (burstIn).
  // One thing grows from G to I: G (k 0) keeps the weight, H (1) half of it, I (2) the least of it, the burst and its tail the more.
  // The take is bent less (clip) and kept a little further under the limiter (topx): it is made loud by the burst, not by its peak.
  const R6 = { G: 0, H: 1, I: 2 };
  const popP = (q, p, k, o) => O({ lowx: 0, low2x: 0, bg: qv(q, p, 'bg') * [0.45, 0.28, 0.14][k], bd: Math.min(qv(q, p, 'bd'), 0.022), pcut: 0.07, bodyn: 1, bodyx: (q.bodyx || 0) * [1, 0.6, 0.3][k],
    bb: qv(q, p, 'bb') * [1, 0.75, 0.5][k], kx: 0.5 * [1, 0.5, 0.22][k], lnx: 0.42 * [1, 0.5, 0.22][k], kf0: 160, kf1: 45, kft: 0.007, kt: 0.03, lnt: 0.045, vly: undefined, edx: 0, spside: 0,
    bspre: 1, bsx: [1.6, 1.8, 2][k], bsK: q.lvl, bsa: 0.002, bsw3: [0.2, 0.45, 0.35], bsd: 0.04, bsp: 0.8, bsc: 0.012, clip: 10, topx: 0.9 }, o);
  // (each gun's burst: its three slopes (s) - a shotgun's long and loud, a sniper's longest, a revolver's shorter, a machine gun's short
  // enough to be gone before the next shot's head; tl: the roll on open ground)
  // (the burst's share by kind, place (in a room, on open ground) and version, so that G, H and I come out as loud as C, K-weighted)
  const BSM = { shotgun: [[2.46, 1.83, 1.44], [1.19, 0.94, 0.88]], sniper: [[1.52, 1.39, 1.35], [0.61, 0.63, 0.63]], revolver: [[1.65, 1.92, 1.56], [0.87, 0.77, 0.71]], lmg: [[1.44, 1.47, 1.58], [1.1, 1.12, 1.17]] };
  const r6 = (kind, f) => { for (const v of ['G', 'H', 'I']) GUNP[kind][v] = (p, r) => { const o = f(v, R6[v], GUNP[kind].C(p, r), p, r); o.bsx *= BSM[kind][r ? 0 : 1][R6[v]]; return o; }; };
  const tx = (k, a) => a.map((x) => x * [1, 1.15, 1.35][k]);
  r6('shotgun', (v, k, q, p, r) => O(q, sprP(1, r), popP(q, p, k, { bst: tx(k, [0.004, 0.03, r ? 0.075 : 0.14]), kf0: 150, kt: 0.035, lnt: 0.05, clip: r ? 12.5 : 10, popn: 34, popT: 0.028, popk: 0.25, popd: 0.00012, popw: 1.3, popw0: 0.25, popc: 0.012 })));
  r6('sniper', (v, k, q, p, r) => O(q, sprP(1, r, r ? {} : { sf1: 0.9, sft: 0.45, sfg: 1.15, spg: 0.25, len: 1 }), popP(q, p, k, { bst: tx(k, [0.003, 0.035, r ? 0.09 : 0.2]), kf0: 140, kt: 0.04, lnt: 0.055 })));
  r6('revolver', (v, k, q, p, r) => O(q, sprP(1, r), popP(q, p, k, { bst: tx(k, [0.0025, 0.02, r ? 0.055 : 0.1]), kf0: 180, kf1: 55, kt: 0.026, lnt: 0.035, clip: r ? 12.5 : 10 })));
  r6('lmg', (v, k, q, p, r) => O(q, sprP(1, r, { spn: 5, sp1: 0.025, spf: 5, sf0: 0.07, sf1: 0.35, sfg: r ? 0.15 : 0.5, sft: 0.2, len: qv(q, p, 'len') }),
    popP(q, p, k, { bst: [0.0015, 0.009, 0.02].map((x) => x * [1, 1.05, 1.1][k]), kf0: 170, kf1: 55, kt: 0.018, lnt: 0.02, bsc: 0.006, bsp: 0.6, clip: 12.5, bsx: [2, 2.2, 2.4][k], airt: q.airt * 0.5 })));
  // Round 7, C and round 6 put together: J and K. Round 6's burst was liked and so was C's low end, its note and all. J / K keep C's low
  // blow, push and body as they are (no kick, no lump of low noise) and lay the burst over them - G's in J, I's (longer, more of it) in
  // K - with its fast first slope all but left out and its rise slower, so that its top does not stand on the low blow's. A take is set
  // to its loudness by what is heard most, the burst, and the low end goes down with it: the low blow is made that much bigger, to be as
  // loud under the burst as it is in C. FUSE, by kind, for J and K: the burst's share of G's / I's, the low blow's of C's, the burst's
  // rise (s; 0: as in round 6, a machine gun's burst being short as it is)
  const FUSE = { shotgun: [[0.4, 1.65, 0.005], [0.6, 1.8, 0.005]], sniper: [[0.5, 1, 0.004], [0.7, 1.1, 0.004]], revolver: [[0.6, 1.15, 0.004], [0.8, 1.25, 0.004]], lmg: [[1.4, 1.25, 0], [1.8, 1.4, 0]] };
  for (const kind in FUSE) ['J', 'K'].forEach((v, k) => {
    GUNP[kind][v] = (p, r) => {
      const c = GUNP[kind].C(p, r), g = GUNP[kind][k ? 'I' : 'G'](p, r), [bm, low, rise] = FUSE[kind][k], o = O({}, g, { kx: 0, lnx: 0, bsx: g.bsx * bm });
      // (what C has not set is left to the shot's own, not set to nothing)
      for (const key of ['lowx', 'low2x', 'bg', 'bd', 'pcut', 'bodyn', 'bodyx', 'bb', 'clip', 'topx']) { if (c[key] === undefined) delete o[key]; else o[key] = c[key]; }
      o.lowx *= low; if (o.low2x) o.low2x *= low;
      if (rise) { o.bsa = rise; o.bsw3 = [0.05, 0.5, 0.45]; }
      return o;
    };
  });
  // (the version each kind is played at in the game, where it is not its B or its 2)
  const GDEF = { shotgun: 'K', sniper: 'K', revolver: 'K', lmg: 'K', dmr: 'C', minigun: 'C', rocket: 'C', gl: 'C', rail: 'C', harpoon: 'C', nail: 'C' };
  // (the published take's loudness, K-weighted energy of its first 300 ms in dB at 48 kHz, by kind and place: the mean of 60 takes made
  // with the recordings, written down here so that a plan's take is set to it without published takes being made first)
  const KPUB = { 'pistol:in': 23.7, 'pistol:out': 23.5, 'revolver:in': 25.3, 'revolver:out': 25.2, 'smg:in': 22.7, 'smg:out': 23, 'rifle:in': 24.6, 'rifle:out': 24.6, 'dmr:in': 24.8, 'dmr:out': 24.9,
    'sniper:in': 25.7, 'sniper:out': 25.7, 'shotgun:in': 25.4, 'shotgun:out': 25.4, 'shotgun:a:in': 27, 'shotgun:a:out': 27.2, 'lmg:in': 24.7, 'lmg:out': 24.6, 'minigun:in': 22.6, 'minigun:out': 22.5,
    'rocket:in': 27.9, 'rocket:out': 28.2, 'gl:in': 25.9, 'gl:out': 26, 'rail:in': 25.7, 'rail:out': 25.7, 'harpoon:in': 24.1, 'harpoon:out': 24.1, 'nail:in': 22, 'nail:out': 21.8 };
  // (a take's peaks after its gain kept under this, its level and GUNV in: the master's limiter starts at -1.5 dBFS and the game plays at
  // 0.8, so that a shot's own peak stays under it with a little room for the place's sound laid on it; SHAVE: dB the peaks may be taken down)
  const TOP = 1.15, SHAVE = 3;
  // (A wide head: noise between 1 and 4 kHz, up at once and dying in a few ms - a burst, not a tick - written into X from i0; hd: driven,
  // so that it fills its few ms at the same peak, what the drive adds over 4.5 kHz cut)
  function headIn(X, i0, g, tau, sr, Y, hd) {
    const n = Math.min(X.length - i0, Math.round(tau * 10 * sr)); if (n <= 0) return;
    const x = new Float32Array(n), a = Math.max(2, Math.round(0.00015 * sr)), k = tau * sr;
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * (j < a ? j / a : 0.7 * Math.exp(-(j - a) / k) + 0.3 * Math.exp(-(j - a) / (k * 3)));
    bqRun(x, 'hp', 1000, 0.7, sr); bqRun(x, 'hp', 1000, 0.7, sr); bqRun(x, 'lp', 4000, 0.7, sr); bqRun(x, 'lp', 4000, 0.7, sr);
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]));
    if (hd) { const td = ftanh(hd); for (let j = 0; j < n; j++) x[j] = ftanh((hd * x[j]) / (pk || 1)) / td; bqRun(x, 'lp', 4500, 0.7, sr); bqRun(x, 'lp', 4500, 0.7, sr); pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j])); }
    for (let j = 0; j < n; j++) { const v = (g * x[j]) / (pk || 1); X[i0 + j] += v; if (Y) Y[i0 + j] += v; }
  }
  // (A short body: a tone falling to bodyf in some 12 ms and on below it, driven, and noise in its band with it; held, dying, cut - a drum's one blow)
  function bodyIn(X, i0, p, sr) {
    const n = Math.min(X.length - i0, Math.round(p.bodyc * sr)); if (n <= 0) return;
    const x = new Float32Array(n), y = new Float32Array(n), a = Math.round((p.bodya || 0.001) * sr), h = Math.round(p.bodyh * sr), k = p.bodyt * sr, fo = Math.round(0.015 * sr), f0 = p.bodyf * vr(1, 0.05), kf = Math.exp(-1 / (0.012 * sr)), kf2 = Math.exp(-1 / (0.06 * sr)), td = ftanh(2.5);
    let ph = 0, q = 1, q2 = 1;
    for (let j = 0; j < n; j++) { ph += (2 * Math.PI * f0 * (0.8 + 0.5 * q + 0.2 * q2)) / sr; q *= kf; q2 *= kf2; x[j] = ftanh(2.5 * Math.sin(ph)) / td; y[j] = Math.random() * 2 - 1; }
    bqRun(y, 'hp', p.bodylo, 0.7, sr); bqRun(y, 'lp', p.bodyhi, 0.7, sr); bqRun(y, 'lp', p.bodyhi, 0.7, sr);
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(y[j]));
    const nz = p.bodyn || 0.5;
    for (let j = 0; j < n; j++) { const e = (j < a ? j / a : j < a + h ? 1 : Math.exp(-(j - a - h) / k)) * (j > n - fo ? (n - j) / fo : 1); X[i0 + j] += p.bodyx * e * (x[j] * (1 - nz) + (y[j] / (pk || 1)) * nz * 1.6); }
  }
  // (A shotgun's report bursting: not one crack but a scatter of small ones over its first popT s - the load and the gas leaving the
  // muzzle in pulses - each a burst of noise of some popd s, thicker and stronger at first (popk: how much), each a little to one side
  // or the other; all of it kept between 500 Hz and 4 kHz, nothing of it high enough to hurt. M: their sum written there too)
  // (a plan's popw: the cracks spread that wide (1: as made), popw0 as wide as that at the first of them, popw by popc s - the head itself
  // kept in the middle, what bursts after it thrown out to the sides)
  function popPan(p, pan, j0, sr) {
    if (p.popw === undefined) return pan;
    const k = Math.min(1, j0 / ((p.popc || 0.01) * sr)), w = (p.popw0 === undefined ? p.popw : p.popw0) * (1 - k) + p.popw * k;
    return Math.max(-1, Math.min(1, pan * w));
  }
  function popIn(L, R, i0, p, sr, M) {
    const T = p.popT || 0.018, n = Math.min(L.length - i0, Math.round((T + 0.006) * sr)), pk0 = p.popk || 1, pd = p.popd || 0.0003; if (n <= 0) return;
    const x = new Float32Array(n), y = new Float32Array(n);
    for (let k = 0; k < p.popn; k++) {
      const j0 = Math.round(T * Math.pow(Math.random(), 1 + 0.6 * pk0) * sr), te = pd * (0.4 + Math.random()) * sr, m = Math.round(te * 6), a = (0.35 + 0.65 * Math.random()) * Math.exp((-1.2 * pk0 * j0) / (T * sr)) * (Math.random() < 0.5 ? -1 : 1), pan = popPan(p, Math.random() * 1.2 - 0.6, j0, sr), gl = Math.min(1, 1 - pan), gr = Math.min(1, 1 + pan);
      for (let j = 0; j < m && j0 + j < n; j++) { const v = (Math.random() * 2 - 1) * a * Math.exp(-j / te); x[j0 + j] += v * gl; y[j0 + j] += v * gr; }
    }
    const lo = p.popl || 500, hi = p.poph || 4000;
    for (const z of [x, y]) { bqRun(z, 'hp', lo, 0.7, sr); bqRun(z, 'hp', lo, 0.7, sr); bqRun(z, 'lp', hi, 0.7, sr); bqRun(z, 'lp', hi, 0.7, sr); }
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]), Math.abs(y[j]));
    const g = p.popx / (pk || 1); for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * g; R[i0 + j] += y[j] * g; if (M) M[i0 + j] += (x[j] + y[j]) * 0.5 * g; }
  }
  // (A bright head: the crack of the report as broad as it is in the open - noise from brhp Hz (some 1.8 kHz) up to brlp (14 kHz), part
  // of it tilted down over 3.5 kHz so that it falls off upward as a real report does and no narrow band stands out of it; up at once, a
  // sharp part (brs of it) dying in brt s and the rest in brt2 s, cut at brc s - short, so that it is bright, not harsh; driven by brd so
  // that its few ms stand full at its peak, brx at its peak. Written into the work array 2: laid in before anything else is written there)
  function brightBuf(p, sr) {
    const c = p.brc || 0.02, n = Math.max(8, Math.round(c * sr));
    const x = work(2, n), a = Math.max(2, Math.round(0.0001 * sr)), k1 = (p.brt || 0.002) * sr, k2 = (p.brt2 || 0.007) * sr, s1 = p.brs === undefined ? 0.6 : p.brs, fo = Math.max(2, Math.round(c * 0.3 * sr));
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * (j < a ? j / a : s1 * Math.exp(-(j - a) / k1) + (1 - s1) * Math.exp(-(j - a) / k2)) * (j > n - fo ? (n - j) / fo : 1);
    const hp = p.brhp || 1800; bqRun(x, 'hp', hp, 0.7, sr); bqRun(x, 'hp', hp, 0.7, sr);
    const kc = 1 - Math.exp((-2 * Math.PI * 3500) / sr), tl = p.brtl === undefined ? 0.5 : p.brtl;
    let px = 0, py = 0, ym = 0; const y = work(3, n);
    for (let j = 0; j < n; j++) { ym += kc * (x[j] - ym); y[j] = ym; px = Math.max(px, Math.abs(x[j])); py = Math.max(py, Math.abs(ym)); }
    for (let j = 0; j < n; j++) x[j] = (x[j] / (px || 1)) * (1 - tl) + (y[j] / (py || 1)) * tl;
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]));
    const d = p.brd || 0; if (d) { const td = ftanh(d); for (let j = 0; j < n; j++) x[j] = ftanh((d * x[j]) / (pk || 1)) / td; }
    bqRun(x, 'lp', p.brlp || 14000, 0.6, sr); bqRun(x, 'hp', hp * 0.6, 0.7, sr);
    pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]));
    const g = p.brx / (pk || 1); for (let j = 0; j < n; j++) x[j] *= g;
    return x;
  }
  // (y laid into X from i0, g of it)
  function addIn(X, y, i0, g) { const n = Math.min(y.length, X.length - i0); for (let j = 0; j < n; j++) X[i0 + j] += y[j] * g; }
  // (The air the report leaves after it: noise between airlo and airhi Hz, up in 2 ms and dying in airt s, each side its own so that it
  // stands wide round you - the hiss of the gas, and on open ground the crack thrown back from all round. One run of noise, the right
  // side 11 ms further along it than the left: as unlike as two of their own)
  function airIn(L, R, i0, p, sr) {
    const n = Math.min(L.length - i0, Math.round(p.airt * 4 * sr)); if (n <= 0) return;
    const a = Math.round(0.002 * sr), k = -1 / (p.airt * sr), o = Math.round(0.011 * sr), x = work(3, n + o);
    for (let j = 0; j < n + o; j++) x[j] = Math.random() * 2 - 1;
    bqRun(x, 'hp', p.airlo || 2000, 0.7, sr); bqRun(x, 'hp', p.airlo || 2000, 0.7, sr); bqRun(x, 'lp', p.airhi || 10000, 0.7, sr);
    const e = (j) => (j < a ? j / a : Math.exp((j - a) * k));
    let pk = 0; for (let j = 0; j < n; j++) { const w = e(j); pk = Math.max(pk, Math.abs(x[j] * w), Math.abs(x[j + o] * w)); }
    const g = p.airx / (pk || 1);
    if (p.airw === undefined) { for (let j = 0; j < n; j++) { const w = e(j) * g; L[i0 + j] += x[j] * w; R[i0 + j] += x[j + o] * w; } return; }
    const aw = p.airw;
    for (let j = 0; j < n; j++) { const w = e(j) * g; L[i0 + j] += x[j] * w; R[i0 + j] += (x[j + o] * aw + x[j] * (1 - aw)) * w; }
  }
  // (Round 5's sharp head: the crack of the report at its very front - noise from edhp Hz (some 4 kHz) up to edlp, up in a twentieth of a
  // ms, held edh s, then a sharp part (eds of it) dying in ed1 s and the rest in ed2 s, cut at edc s (a few ms: a crack, not a hiss);
  // broad, so that no narrow band stands out of it; edn: a round's crack of its own on it (an N-wave of edd s, edn of the noise's peak);
  // the whole driven by edg last, so that its ms stands dense at its peak. Laid over the drive, in the
  // middle: edx at its peak. top: laid in after the take's level is set (edpost) - not bent with it, edx of top (the take's own top, or
  // edtx of TOP where the take is set lower under it), kept under it by fitIn;
  // the take moved edsh s later first, so that the sharpest of the head stands alone in front of the take's own front, and that front
  // brought in under it from edf of itself over edfi s)
  function edgeIn(L, R, i0, p, sr, top) {
    const c = p.edc || 0.003, n = Math.min(L.length - i0, Math.round(c * sr)); if (n <= 8) return;
    const x = new Float32Array(n), a = Math.max(1, Math.round(0.00005 * sr)), h = a + Math.round((p.edh || 0) * sr), k1 = (p.ed1 || 0.0004) * sr, k2 = (p.ed2 || 0.0015) * sr, s1 = p.eds === undefined ? 0.6 : p.eds, fo = Math.max(2, Math.round(c * 0.35 * sr));
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * (j < a ? (j + 1) / (a + 1) : j < h ? 1 : s1 * Math.exp(-(j - h) / k1) + (1 - s1) * Math.exp(-(j - h) / k2)) * (j > n - fo ? (n - j) / fo : 1);
    const hp = p.edhp || 3000; bqRun(x, 'hp', hp, 0.7, sr); bqRun(x, 'hp', hp, 0.7, sr); bqRun(x, 'lp', p.edlp || 15000, 0.7, sr);
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]));
    if (p.edn) { const m = Math.max(3, Math.round((p.edd || 0.00015) * sr)), j0 = Math.round(0.0001 * sr); for (let j = 0; j <= m && j0 + j < n; j++) x[j0 + j] += p.edn * pk * (1 - (2 * j) / m); }
    if (p.edg) { const td = ftanh(p.edg); for (let j = 0; j < n; j++) x[j] = ftanh((p.edg * x[j]) / (pk || 1)) / td; }
    pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]));
    const sc = top || 1, g = (p.edx * sc) / (pk || 1); for (let j = 0; j < n; j++) x[j] *= g;
    if (top && p.edsh) { const k = Math.min(L.length - 1, Math.round(p.edsh * sr)), fi = Math.round((p.edfi || 0) * sr), f0 = p.edf === undefined ? 1 : p.edf; for (const X of [L, R]) { X.copyWithin(k, 0, X.length - k); X.fill(0, 0, k); for (let j = 0; j < fi && k + j < X.length; j++) X[k + j] *= f0 + (1 - f0) * (j / fi); } }
    if (top) { A.shotStats.edfit = Math.min(A.shotStats.edfit === undefined ? 1 : A.shotStats.edfit, fitIn(L, R, x, x, i0, top, sr)); return; }
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j]; R[i0 + j] += x[j]; }
  }
  // (Round 6's low blow, with no note in it: a kick - a tone falling from kf0 to kf1 Hz in some kft s, dying in kt s, so that it is gone
  // before an ear can take a pitch from it - and a lump of noise under 170 Hz dying in lnt s, the weight of it; kx / lnx: their peaks)
  function kickIn(L, R, i0, p, sr) {
    const n = Math.min(L.length - i0, Math.round(Math.max(p.kt, p.lnt || 0) * 6 * sr)); if (n <= 8) return;
    const a = Math.max(1, Math.round(0.0008 * sr)), kd = Math.exp(-1 / (p.kt * sr)), kf = Math.exp(-1 / ((p.kft || 0.007) * sr)), f0 = p.kf0 || 160, f1 = p.kf1 || 45;
    let ph = 0, e = 1, q = 1;
    for (let j = 0; j < n; j++) { ph += (2 * Math.PI * (f1 + (f0 - f1) * q)) / sr; q *= kf; const v = p.kx * Math.sin(ph) * (j < a ? j / a : e); if (j >= a) e *= kd; L[i0 + j] += v; R[i0 + j] += v; }
    if (!p.lnx) return;
    const x = work(3, n), te = p.lnt * sr, ra = Math.round(0.002 * sr);
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * (j < ra ? j / ra : Math.exp(-(j - ra) / te));
    bqRun(x, 'lp', 170, 0.7, sr); bqRun(x, 'lp', 170, 0.7, sr); bqRun(x, 'hp', 38, 0.7, sr);
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(x[j]));
    const g = p.lnx / (pk || 1); for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * g; R[i0 + j] += x[j] * g; }
  }
  // (Round 6's burst: the report going on from its head into its tail with no gap - broad noise from bslo to bshi Hz, up at once and
  // falling smoothly through three slopes (bst: their times, bsw3: their shares), growing darker as it goes (bsd s to go over to its
  // darker part, under a third of bshi); in the middle at the head, and the further it goes the more each side is a noise of its own
  // (bsp wide by bsc s): it bursts round you, not inside your head. bsx at its peak)
  function burstIn(len, p, sr) {
    const t = p.bst, w3 = p.bsw3 || [0.5, 0.32, 0.18], n = Math.min(len, Math.round(t[2] * 7 * sr));
    const lo = p.bslo || 700, hi = p.bshi || 11000, N = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], M = [];
    for (const z of N) { for (let j = 0; j < n; j++) z[j] = Math.random() * 2 - 1; bqRun(z, 'hp', lo, 0.7, sr); bqRun(z, 'hp', lo, 0.7, sr); }
    for (const z of N) { const y = Float32Array.from(z); bqRun(z, 'lp', hi, 0.7, sr); bqRun(y, 'lp', hi * 0.3, 0.7, sr); bqRun(y, 'lp', hi * 0.3, 0.7, sr); M.push(y); }
    const a = Math.max(1, Math.round((p.bsa || 0.0002) * sr)), k = t.map((x) => Math.exp(-1 / (x * sr))), kdk = Math.exp(-1 / ((p.bsd || 0.03) * sr)), sp = p.bsp === undefined ? 0.8 : p.bsp, sc = (p.bsc || 0.01) * sr;
    const yl = new Float32Array(len), yr = new Float32Array(len);
    let e0 = w3[0], e1 = w3[1], e2 = w3[2], dk = 1, pk = 0;
    for (let j = 0; j < n; j++) {
      const e = j < a ? (j / a) * (w3[0] + w3[1] + w3[2]) : e0 + e1 + e2, u = 1 - dk, w = sp * Math.min(1, j / sc), c = Math.sqrt(1 - w * w * 0.5);
      if (j >= a) { e0 *= k[0]; e1 *= k[1]; e2 *= k[2]; } dk *= kdk;
      const s = (i) => N[i][j] * (1 - u) + M[i][j] * u * 1.6;
      yl[j] = e * (s(0) * c + s(1) * w * 0.7); yr[j] = e * (s(0) * c + s(2) * w * 0.7);
      pk = Math.max(pk, Math.abs(yl[j]), Math.abs(yr[j]));
    }
    for (let j = 0; j < n; j++) { yl[j] /= pk || 1; yr[j] /= pk || 1; }
    return [yl, yr];
  }
  // (the burst laid into a take after its level is set: as loud as the take wants to reach its loudness (bsK dB over the published take's)
  // and its peak lets it go no further - the burst fills it out where it has room under its top (fitIn), at most bsx of the top)
  function burstPost(b, pl) {
    const p = pl.p, sr = b.sampleRate, L = b.getChannelData(0), R = b.getChannelData(1), top = (TOP * (pl.topx || 1)) / (p.lv * pl.gv), [yl, yr] = burstIn(b.length, p, sr);
    const want = Math.pow(10, (KPUB[pl.kk] + 10 * Math.log10(sr / 48000) + p.bsK) / 10), have = kEnergy(b), eb = kEnergy({ sampleRate: sr, length: b.length, getChannelData: (c) => (c ? yr : yl) });
    const g = Math.min(p.bsx * top, Math.sqrt(Math.max(0, want - have) / (eb || 1e-12)));
    for (let j = 0; j < yl.length; j++) { yl[j] *= g; yr[j] *= g; }
    A.shotStats.bsg = 20 * Math.log10(g / top + 1e-9);
    fitIn(L, R, yl, yr, 0, top, sr);
  }
  // (yl / yr laid into a take from i0, turned down where the sum would go over top: a gain under 1 round each such place only - down a
  // third of a ms before it, back in 8 ms - so that what is laid in never takes the take over its top. Returns the share of it that went
  // in (its energy, 1: all of it))
  function fitIn(L, R, yl, yr, i0, top, sr) {
    const n = Math.min(yl.length, L.length - i0), q = new Float32Array(n).fill(1);
    for (const [X, Y] of [[L, yl], [R, yr]]) for (let j = 0; j < n; j++) { const y = Y[j], x = X[i0 + j], v = x + y; if (v > top && y > 0) q[j] = Math.min(q[j], Math.max(0, (top - x) / y)); else if (v < -top && y < 0) q[j] = Math.min(q[j], Math.max(0, (-top - x) / y)); }
    const ka = Math.exp(-1 / (0.0003 * sr)), kr = Math.exp(-1 / (0.008 * sr));
    for (let j = n - 2; j >= 0; j--) q[j] = Math.min(q[j], 1 - (1 - q[j + 1]) * ka);
    for (let j = 1; j < n; j++) q[j] = Math.min(q[j], 1 - (1 - q[j - 1]) * kr);
    let e0 = 0, e1 = 0;
    for (let j = 0; j < n; j++) { const a = yl[j] * yl[j] + yr[j] * yr[j]; e0 += a; e1 += a * q[j] * q[j]; L[i0 + j] += yl[j] * q[j]; R[i0 + j] += yr[j] * q[j]; }
    return e0 ? e1 / e0 : 1;
  }
  // (Round 5's valley after the head: what is over vlhp Hz taken down to vly of itself from vl0 s, held so to vl1 s and back by vl2 s,
  // the low blow under it left as it is - so that the head stands out of what follows it with a gap round it, as a shot's crack does)
  function valleyIn(L, R, p, sr) {
    const i0 = Math.round(p.vl0 * sr), i1 = Math.round(p.vl1 * sr), i2 = Math.round(p.vl2 * sr), n = Math.min(L.length, i2), d = 1 - p.vly, ra = Math.max(1, Math.round(0.0008 * sr));
    for (const X of [L, R]) {
      const h = X.slice(0, n), f = p.vlhp || 1200; bqRun(h, 'hp', f, 0.7, sr); bqRun(h, 'hp', f, 0.7, sr);
      for (let j = i0; j < n; j++) { const w = j < i0 + ra ? (j - i0) / ra : j < i1 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (j - i1)) / (i2 - i1)); X[j] -= h[j] * d * w; }
    }
  }
  // (Round 5's spread: the report thrown back round you, after its head, from both sides and from further off - written into a take
  // after its level is set, so that it neither takes the head's level down nor stands over its top. Its source: the take's own first
  // spsrc s, the middle of it. Near returns (spn of them, sp0-sp1 s after, spg, sphp-splp Hz, the later darker): each side at a time
  // and a sign of its own, spw wide - wide round you, and little of them in the middle (spside of them as much on each side, of opposite
  // signs and at the same time: wide, and nothing of them in the middle, where the next shot's head is). Far ones (spf of them, sf0-sf1 s after, sfg
  // dying in sft s): each a few returns close together, the further the duller (sflp at the first, a fifth of it at the last), thrown
  // to either side. Turned down where it would go over the take's top (fitIn))
  function spreadIn(b, pl) {
    const p = pl.p, sr = b.sampleRate, L = b.getChannelData(0), R = b.getChannelData(1), len = b.length, top = (TOP * (p.edtx || pl.topx || 1)) / (p.lv * pl.gv);
    const ns = Math.min(len, Math.round((p.spsrc || 0.03) * sr)), S = new Float32Array(ns), fo = Math.round(ns * 0.3);
    for (let i = 0; i < ns; i++) S[i] = (L[i] + R[i]) * 0.5 * (i > ns - fo ? (ns - i) / fo : 1);
    const yl = new Float32Array(len), yr = new Float32Array(len), w = p.spw === undefined ? 0.9 : p.spw;
    const band = (lo, hi) => { const y = Float32Array.from(S); bqRun(y, 'hp', lo, 0.7, sr); bqRun(y, 'hp', lo, 0.7, sr); bqRun(y, 'lp', hi, 0.7, sr); return y; };
    // (src's g of it, at d s on the left and d + dd on the right, each side's share by pan, each side's sign its own)
    const put = (X, Y, d, dd, g, pan) => {
      const sl = Math.random() < 0.5 ? -1 : 1, sg = Math.random() < 0.5 ? -1 : 1, side = p.spside && Math.random() < p.spside, il = Math.round(d * sr), ir = side ? il : Math.round((d + dd) * sr);
      const gl = side ? g * sl : g * Math.min(1, 1 - pan) * sl, gr = side ? -g * sl : g * Math.min(1, 1 + pan) * sg;
      for (let j = 0; j < ns && il + j < len; j++) yl[il + j] += (X[j] + Y[j]) * gl;
      for (let j = 0; j < ns && ir + j < len; j++) yr[ir + j] += (X[j] + Y[j]) * gr;
    };
    if (p.spn) {
      const N1 = band(p.sphp || 700, p.splp || 9000), N2 = band(p.sphp || 700, (p.splp || 9000) * 0.45), Xa = new Float32Array(ns), Xb = new Float32Array(ns), span = p.sp1 - p.sp0;
      for (let k = 0; k < p.spn; k++) {
        const u = (k + Math.random()) / p.spn, d = p.sp0 + span * u, g = p.spg * (0.55 + 0.45 * Math.random()) * Math.exp(-1.2 * u), pan = (k % 2 ? 1 : -1) * w * (0.55 + 0.45 * Math.random());
        for (let j = 0; j < ns; j++) { Xa[j] = N1[j] * (1 - u); Xb[j] = N2[j] * u; }
        put(Xa, Xb, d, (Math.random() * 2 - 1) * 0.0012, g, pan);
      }
    }
    if (p.spf) {
      const F1 = band(250, p.sflp || 5000), F2 = band(250, (p.sflp || 5000) * 0.45), F3 = band(200, (p.sflp || 5000) * 0.2), Xa = new Float32Array(ns), Xb = new Float32Array(ns), span = p.sf1 - p.sf0;
      for (let k = 0; k < p.spf; k++) {
        const u = Math.pow((k + Math.random()) / p.spf, 1.3), d = p.sf0 + span * u, g = p.sfg * (0.5 + 0.5 * Math.random()) * Math.exp(-(d - p.sf0) / p.sft);
        const m = u < 0.5 ? u * 2 : u * 2 - 1, X = u < 0.5 ? F1 : F2, Y = u < 0.5 ? F2 : F3;
        for (let j = 0; j < ns; j++) { Xa[j] = X[j] * (1 - m); Xb[j] = Y[j] * m; }
        for (const [dt, gg] of [[0, 1], [0.002 + Math.random() * 0.004, 0.6], [0.005 + Math.random() * 0.007, 0.35]]) put(Xa, Xb, d + dt, (Math.random() * 2 - 1) * 0.002, g * gg, (Math.random() * 2 - 1) * w);
      }
    }
    A.shotStats.spr = Math.min(A.shotStats.spr === undefined ? 1 : A.shotStats.spr, fitIn(L, R, yl, yr, 0, top, sr));
  }
  // (The rest of the sound - the place's own, steps, voices, all that goes the common way - pulled down as your own shot goes off, and
  // back. In fast fire each shot pulls it down less (no deeper than DUCKCAP), holds it less and lets it back sooner: the fire never shuts
  // the rest out - foes' steps and voices still come through it - and it is back soon after the fire stops)
  const DUCKCAP = -6;
  let duckT = -9;
  function duckOthers(t, dk) {
    const k = Math.min(1, Math.max(0, (t - duckT - 0.06) / 0.34)), db = dk[0] * k + Math.max(dk[0], DUCKCAP) * (1 - k), hold = dk[1] * (0.4 + 0.6 * k), back = dk[2] * (0.5 + 0.5 * k);
    duckT = t;
    const g = dry.gain, lo = Math.pow(10, db / 20);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(lo, t + 0.003); g.setValueAtTime(lo, t + 0.003 + hold); g.setTargetAtTime(1, t + 0.003 + hold, back);
  }
  function kEnergy(b) {
    const sr = b.sampleRate, n = Math.min(b.length, Math.round(0.3 * sr)), L = b.getChannelData(0), R = b.getChannelData(1), x = work(1, n);
    for (let i = 0; i < n; i++) x[i] = (L[i] + R[i]) * 0.5;
    bqRun(x, 'hp', 38, 0.5, sr);
    // (the high shelf of the K weighting: +4 dB over some 1.7 kHz)
    const Ag = Math.pow(10, 4 / 40), w = (2 * Math.PI * 1682) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.7072), sq = 2 * Math.sqrt(Ag) * al;
    const a0 = Ag + 1 - (Ag - 1) * cs + sq, b0 = (Ag * (Ag + 1 + (Ag - 1) * cs + sq)) / a0, b1 = (-2 * Ag * (Ag - 1 + (Ag + 1) * cs)) / a0, b2 = (Ag * (Ag + 1 + (Ag - 1) * cs - sq)) / a0, a1 = (2 * (Ag - 1 - (Ag + 1) * cs)) / a0, a2 = (Ag + 1 - (Ag - 1) * cs - sq) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, e = 0;
    for (let i = 0; i < n; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; e += y * y; }
    return e;
  }
  // A planned take brought to its loudness: lvl dB over the published take's (KPUB), by one gain on the whole; its peaks then kept under
  // the top by a gain that dips round them - down a fraction of a ms before each (looking ahead), back in 12 ms - so that the limiter
  // never has to hold the shot down after its front; where that would take the front down more than SHAVE dB, the whole is set lower.
  // A plan's clip: where its loudness wants more than its peak lets it have, the take is first brought up into a soft top (by as much as
  // clip dB), sample by sample - the head and the low blow riding on each other are bent into it where they meet, not turned down round
  // it, so that nothing of the head's level is lost (what is bent only adds to its top); with shave 0 nothing is turned down after that
  function levelTake(b, pl) {
    const kp = pl.kref !== undefined ? pl.kref : KPUB[pl.kk]; if (kp === undefined) return 1;   // (kref: a recorded take's own target, see RKREF)
    const C = [b.getChannelData(0), b.getChannelData(1)], n = b.length, sr = b.sampleRate, top = (TOP * (pl.topx || 1)) / (pl.p.lv * pl.gv);
    const sv = pl.shave === undefined ? SHAVE : pl.shave, gk = () => Math.pow(10, (kp + 10 * Math.log10(sr / 48000) + pl.lvl - 10 * Math.log10(kEnergy(b) || 1e-12)) / 20);
    let pk = 0; for (const d of C) for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    let gK = gk();
    if (pl.clip) {
      let room = Math.pow(10, pl.clip / 20), most = 1;
      for (let k = 0; k < 3 && room > 1.001; k++) {
        const over = (gK * pk) / top; if (over <= 1.002) break;
        const gi = Math.min(over, room); room /= gi; most *= gi;
        pk = softTop(C, n, gi / pk, pk / gi, pk); gK = gk();
      }
      A.shotStats.clip = Math.max(A.shotStats.clip || 0, 20 * Math.log10(most));
    }
    const g = Math.min(gK, (top * Math.pow(10, sv / 20)) / (pk || 1));
    // (nothing over the top: the gain alone)
    if (g * pk <= top) { for (const d of C) for (let i = 0; i < n; i++) d[i] *= g; return g; }
    const q = work(0, n), ka = Math.exp(-1 / (0.0004 * sr)), kr = Math.exp(-1 / (0.012 * sr));
    for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(C[0][i]), Math.abs(C[1][i])) * g; q[i] = m > top ? top / m : 1; }
    for (let i = n - 2; i >= 0; i--) q[i] = Math.min(q[i], 1 - (1 - q[i + 1]) * ka);
    let lo = 1; for (let i = 1; i < n; i++) { q[i] = Math.min(q[i], 1 - (1 - q[i - 1]) * kr); lo = Math.min(lo, q[i]); }
    for (const d of C) for (let i = 0; i < n; i++) d[i] *= g * q[i];
    A.shotStats.shave = Math.max(A.shotStats.shave || 0, -20 * Math.log10(lo));
    return g;
  }
  // (a soft top: each sample brought gi up, what is then under 0.7 left as it is and what is over it bent into the last 0.3 under 1, then
  // taken back down by go - what was under the knee comes back as it was. pk: the peak before; returns the peak after)
  function softTop(C, n, gi, go, pk) {
    const kn = 0.7, w = 1 - kn, lim = kn / gi;
    let m = 0;
    for (const d of C) for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > lim) { const v = (kn + w * ftanh((a * gi - kn) / w)) * go; d[i] = d[i] < 0 ? -v : v; if (v > m) m = v; } else if (a > m) m = a; }
    return Math.min(m, pk);
  }
  // ---------- the recorded shot (2026-11-20: the game's own for every gun that has recordings) ----------
  // A shot made of recordings of real guns (snd/g*_*.ogg, all CC0: snd/SOURCES_GUNS.md). At its heart one shot of the kind, near (gs_:
  // one recording a gun, always the same - each kind's first is its own, a named gun may be given another by its id (rIdx): a gun
  // sounds as itself every time, only its pitch and level a hair off at each shot), its top over 3.5 kHz lifted a little (hs: the
  // crack of it), and the place answering it from recordings too: in a room, hard early returns made of the shot itself thrown back
  // off the stone close round (short and dense, the very top dulled) and the tail of a shot fired
  // indoors (gr_in); on open ground, the ground's one return and the long return of a mountain (gr_out: the slap, a swell some 0.5 s
  // after, a second one later). Only the push in the chest under it is synthesized, kept under 150 Hz. A shot far off - a foe's, a
  // friend's - is a far recording (gd_: the top gone, its returns carrying it), laid in over the near one as the distance grows
  // (newShot, RFAR). A suppressed shot is a suppressed recording (gq_), lighter or heavier by the gun (SUPP's weight, as suppOf keeps
  // it). Each take is the shot with its early returns, and which of the place's tails go with it (buf.tail: the recordings shared, not
  // copied into each take), played smaller in fast fire as the old roll was. A take is set to the loudness the old version's take had (RKREF), so that nothing is louder or quieter than it was.
  // RP, by kind: rate the recordings' speed (1: the pitch is moved where it is played, not by reading the recording slower - that dulled
  // its top); hs dB its top over 3.5 kHz (hf Hz where a kind says) is lifted by
  // (none where the recording is sharp already - the pistol's, the sniper's rifle's: more of it was hard on the ear); lo the push's level (against the shot's peak; kept small: more of it took the
  // crack's share of the whole), lf its Hz (from, to), lt how fast it dies
  // (s); er the room's early returns, ri the room's tail, gnd the ground's return, ro the mountain's; far the far set, frate its speed;
  // sq the suppressed set; clip: dB its peak may be bent into the soft top to reach its loudness (levelTake: a recording's peak is
  // sharp, and a heavy gun's old take was loud for its peak - 10 to 12.5 dB bent in it). The weight (round 3: the shots were heard as
  // light, and the top is not to be cut to make them heavy): the push longer and bigger (lo, lt - short for a gun fired fast, so that
  // its lows do not pile up into a mud), bd dB the recording's own body lifted round bf Hz (150-400 Hz), bt the body ringing on after
  // the burst - the recording's 150-400 Hz thrown back at 7-85 ms (to 41 ms for a gun fired fast: bq). Heavier from the pistol up:
  // pistol < smg < rifle < marksman's < shotgun, sniper's. md dB the middle (some 900 Hz) taken down, broad: the loudness is held
  // where it was (K-weighted), and the low and the top could not both be more of it with the middle as it was
  const RP = {
    pistol: { clip: 5, rate: 1, hs: 0, lo: 0.7, lf: [95, 55], lt: 0.055, bd: 6, bf: 240, bt: 0.32, md: 2, er: 1, ri: 0.3, gnd: 0.3, ro: 0.4, far: 'shot', frate: 1.08, sq: 'pistol' },
    revolver: { clip: 9, rate: 1, hs: 5, hf: 2500, lo: 0.5, lf: [85, 48], lt: 0.07, bd: 8, bf: 210, bt: 0.45, md: 2, er: 1, ri: 0.34, gnd: 0.32, ro: 0.48, far: 'shot', frate: 1, sq: 'pistol' },
    smg: { rate: 1, hs: 6, hf: 3000, lo: 0.55, lf: [105, 60], lt: 0.026, bd: 9, bf: 240, bt: 0.42, bq: 1, md: 3, er: 0.9, ri: 0.24, gnd: 0.28, ro: 0.32, far: 'auto', frate: 1.1, sq: 'smg' },
    rifle: { rate: 1, hs: 4, hf: 3000, lo: 0.8, lf: [90, 52], lt: 0.07, bd: 6, bf: 215, bt: 0.4, md: 2, er: 1, ri: 0.3, gnd: 0.3, ro: 0.45, far: 'shot', frate: 1, sq: 'rifle' },
    dmr: { rate: 1, hs: 9, lo: 0.95, lf: [85, 48], lt: 0.08, bd: 9, bf: 200, bt: 0.5, md: 5, er: 1, ri: 0.34, gnd: 0.32, ro: 0.5, far: 'shot', frate: 0.95, sq: 'rifle' },
    sniper: { clip: 5, rate: 1, hs: 0, lo: 0.75, lf: [75, 42], lt: 0.1, bd: 10.5, bf: 185, bt: 0.7, md: 3, er: 1.05, ri: 0.38, gnd: 0.34, ro: 0.6, far: 'shot', frate: 0.9, sq: 'heavy' },
    shotgun: { clip: 6.5, rate: 1, hs: 5, lo: 0.8, lf: [80, 45], lt: 0.09, bd: 7.5, bf: 180, bt: 0.52, md: 3, er: 1.05, ri: 0.38, gnd: 0.34, ro: 0.55, far: 'shotgun', frate: 1, sq: 'heavy' },
    lmg: { clip: 6, rate: 1, hs: 4.5, hf: 2500, lo: 0.7, lf: [88, 50], lt: 0.045, bd: 8, bf: 200, bt: 0.36, bq: 1, md: 2.5, er: 0.95, ri: 0.28, gnd: 0.3, ro: 0.42, far: 'auto', frate: 0.95, sq: 'rifle' },
    minigun: { rate: 1, hs: 3.5, lo: 0.65, lf: [110, 65], lt: 0.022, bd: 9, bf: 230, bt: 0.28, bq: 1, md: 2, er: 0.8, ri: 0.18, gnd: 0.26, ro: 0.26, far: 'auto', frate: 1.05, sq: 'smg' },
  };
  // (the body's returns after the burst: [ms after, level])
  const RBT = [[7, 0.9], [15, 0.75], [26, 0.6], [41, 0.45], [60, 0.32], [85, 0.2]];
  // (from how far a shot begins to be the far recording, and by how far it is all of it (m) - see newShot)
  const RFAR = [12, 55];
  // (a room's early returns: [ms after, level, pan] - close stone all round, so many and soon, gone by some 35 ms)
  const RER = [[1.9, 0.32, -0.6], [3.1, 0.3, 0.55], [4.4, 0.27, -0.25], [5.8, 0.25, 0.7], [7.5, 0.22, -0.5], [9.4, 0.19, 0.3], [11.8, 0.16, -0.7], [14.6, 0.13, 0.6], [18, 0.1, -0.2], [22, 0.08, 0.45], [27, 0.06, -0.4], [33, 0.045, 0.2]];
  // (the old version's take's loudness - K-weighted energy of its first 300 ms in dB at 48 kHz, the mean of 12 takes made as shotMake
  // made them, with the recordings it had: docs/tools/snd_gunkref.js - by suppressed, kind, a self-loading shotgun, place (a suppressed
  // self-loading shotgun as a suppressed shotgun). A recorded take is set to it, and played at the old version's level: as loud as it was)
  const RKREF = { 'pistol:in': 26.5, 'pistol:out': 26.3, 'revolver:in': 29.7, 'revolver:out': 30.4, 'smg:in': 22.8, 'smg:out': 22.9, 'rifle:in': 25.4, 'rifle:out': 25.4, 'dmr:in': 27.7, 'dmr:out': 27.8, 'sniper:in': 29.7, 'sniper:out': 30.2, 'shotgun:in': 30.2, 'shotgun:out': 30.6, 'shotgun:a:in': 31.8, 'shotgun:a:out': 32.4, 'lmg:in': 28.5, 'lmg:out': 28.7, 'minigun:in': 23.6, 'minigun:out': 23.6, 's:pistol:in': 22.6, 's:pistol:out': 22.7, 's:revolver:in': 23.6, 's:revolver:out': 23.7, 's:smg:in': 22.4, 's:smg:out': 22.1, 's:rifle:in': 24.3, 's:rifle:out': 24.4, 's:dmr:in': 24.5, 's:dmr:out': 24.8, 's:sniper:in': 25.4, 's:sniper:out': 25.9, 's:shotgun:in': 25.5, 's:shotgun:out': 25.4, 's:lmg:in': 25, 's:lmg:out': 25.1, 's:minigun:in': 21.9, 's:minigun:out': 21.8 };
  // (the recordings of a set that have arrived, each with its file's name on it (for the measurements); ri: only the ri-th, or none yet)
  const RLOAD = (key, ri) => { const b = SB.bank[key]; if (!b) return []; const fs = ri === undefined ? b.f : b.f[ri] ? [b.f[ri]] : [b.f[0]];
    return fs.map((f) => { const x = bufs[f]; if (!x) { fetchBuf(f); return null; } x.nm = f; return x; }).filter(Boolean); };
  const rLast = {};
  // (which of a set's recordings a gun is: a rare or better gun's from its id - half of them the set's own first, the rest one of the
  // others - and the first for a common or uncommon one (the kind's plain gun sounds as the kind) and a shot with no gun's id; the same
  // gun always the same. rid: the id to go by, or nothing - see rId)
  const rId = (o) => (o.rar === 'common' || o.rar === 'uncommon' ? null : o.id || o.rid); // (rid: a friend's gun in co-op, coop/core.js)
  const rIdx = (key, id) => { const b = SB.bank[key], n = b ? b.f.length : 0; if (!id || n < 2) return 0; const h = hs(id); return hr(h, 11) < 0.5 ? 0 : 1 + Math.floor(hr(h, 12) * (n - 1)); };
  // (a recording read into X from i0 at speed r, its file's peak (0.89, as they were made) brought to g; mute: nothing of it - the take
  // with its recordings left out, for the measurements: docs/tools/snd_recshare2.js)
  function recIn(X, i0, buf, r, g, mute) {
    const s = buf.getChannelData(0), n = Math.max(0, Math.min(X.length - i0, Math.floor((s.length - 2) / r))), k0 = g / 0.89;
    if (!mute) for (let i = 0; i < n; i++) { const q = i * r, k = Math.floor(q), w = q - k; X[i0 + i] += (s[k] * (1 - w) + s[k + 1] * w) * k0; }
    return n;
  }
  // (the push: a falling tone rising in 2 ms and dying in lt, run twice through a low-pass at 140 Hz - nothing of it over 150 Hz)
  function pushIn(X, R, k, sr) {
    const n = Math.min(X.length, Math.round(R.lt * 7 * sr)), a = Math.round(0.002 * sr), kd = Math.exp(-1 / (R.lt * sr)), kf = Math.exp(-1 / (0.025 * sr));
    let ph = 0, e = 1, q = 1;
    for (let j = 0; j < n; j++) { ph += (2 * Math.PI * (R.lf[1] + (R.lf[0] - R.lf[1]) * q)) / sr; q *= kf; X[j] = Math.sin(ph) * (j < a ? j / a : e) * R.lo * k; if (j >= a) e *= kd; }
    const Y = X.subarray(0, Math.min(X.length, n + Math.round(0.03 * sr))); bqRun(Y, 'lp', 140, 0.6, sr); bqRun(Y, 'lp', 140, 0.6, sr);
  }
  // the place's tail: two different returns, one on each side (wide, as a place answers from all round), from d0 s at level g; lp:
  // dulled (Hz). What is kept with a take is only which returns and how (the recordings themselves are shared, played as they are
  // when the shot is: playTail) - written out into a buffer only for the measurements (bakeTail)
  function placeIn(key, g, d0, lp) {
    const set = RLOAD(key); if (!set.length || !g) return null;
    // (always the same two: the set's first on the left, its second on the right)
    return { a: set[0], c: set[1] || set[0], r: 1, g, d0, lp };
  }
  const TAILW = [[-1, 0, 1], [1, 0.0013, 1.01]];   // ([pan, s later, speed] of the two returns)
  function bakeTail(d, mute) {
    const sr = ctx.sampleRate, i0 = Math.round(d.d0 * sr), n = i0 + Math.round(0.0013 * sr) + Math.floor((Math.max(d.a.length, d.c.length) - 2) / (d.r * 0.99));
    const t = ctx.createBuffer(2, n, sr), TL = t.getChannelData(0), TR = t.getChannelData(1);
    recIn(TL, i0, d.a, d.r, d.g, mute); recIn(TR, i0 + Math.round(TAILW[1][1] * sr), d.c, d.r * TAILW[1][2], d.g, mute);
    if (d.lp) { bqRun(TL, 'lp', d.lp, 0.7, sr); bqRun(TR, 'lp', d.lp, 0.7, sr); }
    return t;
  }
  function playTail(d, g, rate, to, t) {
    TAILW.forEach(([pan, dt, k], i) => {
      const s = ctx.createBufferSource(), v = ctx.createGain(), pn = ctx.createStereoPanner();
      s.buffer = i ? d.c : d.a; s.playbackRate.value = d.r * k * rate; v.gain.value = (g * d.g) / 0.89; pn.pan.value = pan;
      let n = s; if (d.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = d.lp; f.Q.value = 0.7; s.connect(f); n = f; }
      n.connect(v); v.connect(pn); pn.connect(to); s.start(t + d.d0 + dt);
    });
  }
  // one recorded take: {b: the shot and its early returns, t: the place's tail (or null) - written out into a buffer unless live}
  function recTake(pl, mute, live) {
    const sr = ctx.sampleRate, R = pl.R, room = pl.room, rec = pl.recs[0], far = pl.far;
    const r = far ? R.frate : R.rate, n = Math.floor((rec.length - 2) / r) + Math.round(0.04 * sr);
    const b = ctx.createBuffer(2, n, sr), L = b.getChannelData(0), Rr = b.getChannelData(1), D = work(0, n), H = work(1, n);
    recIn(D, 0, rec, r, 1, mute);
    // (far off, the top is gone - the far recordings of a machine gun keep some of theirs; in a room the shot comes through the stone:
    // duller still)
    if (far) bqRun(D, 'lp', room ? 2400 : 3000, 0.7, sr);
    if (R.slp) bqRun(D, 'lp', R.slp, 0.7, sr);
    // (its body lifted: the recording and so much more of its own band round bf; and that band ringing on after the burst, thrown back
    // a few times over 7-85 ms, each return smaller - the body of the report held on, all of it the recording's)
    if ((R.bd || R.bt) && !far) {
      const X = work(2, n); for (let i = 0; i < n; i++) X[i] = D[i]; bqRun(X, 'bp', R.bf, 0.9, sr);
      const k = Math.pow(10, (R.bd || 0) / 20) - 1, Y = work(3, n);
      for (let i = 0; i < n; i++) Y[i] = X[i];
      for (let i = 0; i < n; i++) D[i] += X[i] * k;
      if (R.bt) for (const [ms, g] of RBT) { if (R.bq && ms > 41) break; const d = Math.round((ms * sr) / 1000), gg = g * R.bt; for (let i = 0; i + d < n; i++) D[i + d] += Y[i] * gg; }
    }
    // (its middle taken down a little, broad round 900 Hz: the recording less so much of its own band there)
    if (R.md && !far) { const X = work(2, n); for (let i = 0; i < n; i++) X[i] = D[i]; bqRun(X, 'bp', 900, 0.6, sr); const k = 1 - Math.pow(10, -R.md / 20); for (let i = 0; i < n; i++) D[i] -= X[i] * k; }
    // (its top over 3.5 kHz lifted: the recording and so much more of its high-passed self)
    if (R.hs && !far) { const X = work(2, n); for (let i = 0; i < n; i++) X[i] = D[i]; bqRun(X, 'hp', R.hf || 3500, 0.7, sr); const k = Math.pow(10, R.hs / 20) - 1; for (let i = 0; i < n; i++) D[i] += X[i] * k; }
    for (let i = 0; i < n; i++) { L[i] = D[i]; Rr[i] = D[i]; H[i] = D[i]; }
    if (!far) {
      bqRun(H, 'lp', room ? 7500 : 6000, 0.7, sr); bqRun(H, 'hp', 250, 0.7, sr);
      // (each return where it is, every third turned over: no chance in a take, so that a gun's takes are all the same)
      const tap = (ms, g, pan, j) => {
        const d = Math.round((ms * sr) / 1000), gg = g * (j % 3 === 2 ? -1 : 1), gl = gg * Math.min(1, 1 - pan), gr = gg * Math.min(1, 1 + pan);
        for (let i = 0; i + d < n; i++) { L[i + d] += H[i] * gl; Rr[i + d] += H[i] * gr; }
      };
      if (room) RER.forEach(([ms, g, pan], j) => tap(ms, g * R.er, pan, j)); else tap(3.1, R.gnd, 0, 0);
      if (R.lo) { const X = work(2, n); pushIn(X, R, 1, sr); for (let i = 0; i < n; i++) { L[i] += X[i]; Rr[i] += X[i]; } }
    }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]));
    if (pk > 1) for (let i = 0; i < n; i++) { L[i] /= pk; Rr[i] /= pk; }
    const k = pk > 1 ? 1 / pk : 1;
    const t = room ? placeIn('gr_in', R.ri * k * (far ? 1.6 : 1), far ? 0.012 : 0.006, far ? 1800 : 0) : placeIn('gr_out', R.ro * k * (far ? 1.4 : 1), far ? 0.03 : 0.02, 0);
    return { b, t: t && !live ? bakeTail(t, mute) : t };
  }
  const RSLP = { pistol: 5000, smg: 4200, rifle: 4000, heavy: 4500 };
  // the plan of a recorded shot, laid over the old version's (old: its level, what it pulls down, its case, the working after it)
  function recPlan(kind, supp, auto, room, far, old, id) {
    let R = RP[kind];
    // (suppressed: the suppressed recording a little slower and its push bigger the heavier the gun, its top dulled - the can's own hiss
    // and the action's clatter in the recordings (the machine pistol's most of all) stood over the shot - and the place answering less;
    // a little of the weight too, the quiet kept: the push smaller, the body a little)
    if (supp) { const w = (SUPP[kind] || [1])[0]; R = O({}, R, { rate: R.rate * (1.06 - 0.06 * w), hs: 0, lo: R.lo * 0.3 * w, bd: (R.bd || 0) * 0.7 + 1.5, bt: (R.bt || 0) * 0.6, md: 0, er: R.er * 0.6, ri: R.ri * 0.45, ro: R.ro * 0.35, gnd: R.gnd * 0.6, slp: RSLP[R.sq] }); }
    // (a far shot is the far set's first, whatever the gun: far off one is not told from another)
    const set = supp ? 'gq_' + R.sq : far ? 'gd_' + R.far : 'gs_' + kind, kk = (supp ? 's:' : '') + kind + (auto ? ':a' : '') + (room ? ':in' : ':out'), ri = far ? 0 : rIdx(set, id);
    return { kind, p: O({}, old.p, { tail: 0, wet: old.p.wet * 0.6 }), R, recs: RLOAD(set, ri), ri, room, auto, far, supp, n: 'R', lvl: 0, kref: RKREF[kk] !== undefined ? RKREF[kk] : RKREF[kk.replace(':a', '')],
      duck: old.duck, clip: R.clip || 4, shave: 3, topx: 1, gv: old.gv, kk, key: 'R:' + kk + (far ? ':far' : '') + ':' + ri };
  }
  // what a shot of this kind is, here and now: its layers (the plan fl picks laid over them), the recordings of it that have arrived
  // (until they have, its takes are of the layers alone, kept apart), its loudness, what it pulls down, and the key its takes are kept under
  // (fl: 0 the game's own - the recorded shot (recPlan) for a kind in RP once its recordings are in, the old version until then and for
  // the rest; 'R' the recorded shot; 'old' the old version, as the game played it before (soundcheck.html's 前の版); far: a far take;
  // id: the gun's (which recording it is: rIdx))
  function shotPlan(kind, supp, auto, room, fl, far, id) {
    if (fl === undefined) fl = A.gunFlavor;
    const useR = !!RP[kind] && (fl === 0 || fl === 'R') && !A.noSamples;
    if (fl === 'R' || fl === 'old') fl = 0;
    const base = SHOT[kind] || SHOT.rifle, P = fl === 'pub' ? null : GUNP[kind], n = P ? (P[fl] ? fl : P[GDEF[kind]] ? GDEF[kind] : P.B ? 'B' : P[2] ? 2 : 0) : 0, q = n ? P[n](base, room) : null;
    let p = supp ? suppOf(kind, q) : q ? O({ hicut: 9000 }, base, q) : base;
    if (auto) p = O({}, p, { act: 'autoshot', len: 0.3, lv: p.lv * 0.85 });   // (a self-loading shotgun: its bolt works, there is no pump)
    // (a suppressed shot is not changed by the plan, only pulled down round less)
    const duck = q && q.duck ? (supp ? [q.duck[0] * 0.35, q.duck[1] * 0.6, q.duck[2] * 0.6] : q.duck) : null;
    const bk = p.rv && usable('gun_' + kind) ? SB.bank['gun_' + kind] : null, recs = bk ? bk.f.map((f) => bufs[f] || (fetchBuf(f), null)).filter(Boolean) : [];
    const old = { kind, p, recs, room, auto, n, lvl: q && !supp ? q.lvl || 0 : null, duck, shave: q && !supp ? q.shave : undefined, clip: q && !supp ? q.clip : 0, topx: q && !supp ? q.topx : undefined, gv: fl === 'pub' ? 1 : GUNV, kk: kind + (auto ? ':a' : '') + (room ? ':in' : ':out'),
      key: (supp ? 's:' : '') + kind + (auto ? ':a' : '') + (room ? ':in' : ':out') + (recs.length ? ':r' : '') + (n ? ':' + n : '') };
    if (useR) { const r = recPlan(kind, supp, auto, room, !!far && !supp, old, id); if (r.recs.length) return r; }
    return old;
  }
  // (for the measurements: docs/tools/gf3_*.js, gf4_*.js)
  A.shotLab = { rId, plan: shotPlan, take: (pl, mute) => (pl.R ? recTake(pl, mute) : shotTake(pl.kind, pl.p, pl.recs, pl.room)), kEnergy, level: levelTake, KPUB, GUNP, RKREF, RP, RFAR, rLast, make: (pl) => shotMake(pl), bake: (d) => bakeTail(d) };
  function shotMake(pl) {
    const t0 = performance.now(), S = A.shotStats;
    let b;
    if (pl.R) {
      // (a recorded take: set to its loudness, and its place's tail by the same gain)
      const o = recTake(pl, false, true), g = levelTake(o.b, pl); b = o.b;
      if (o.t) { o.t.g *= g; b.tail = o.t; }
    } else {
      b = shotTake(pl.kind, pl.p, pl.recs, pl.room);
      if (pl.lvl !== null) levelTake(b, pl);
      if (pl.lvl !== null && pl.p.edx && pl.p.edpost) edgeIn(b.getChannelData(0), b.getChannelData(1), Math.round((pl.p.ed0 || 0) * b.sampleRate), pl.p, b.sampleRate, (TOP * (pl.p.edtx || pl.topx || 1)) / (pl.p.lv * pl.gv));
      if (pl.lvl !== null && pl.p.bsx && !pl.p.bspre) burstPost(b, pl);
      if (pl.lvl !== null && (pl.p.spn || pl.p.spf)) spreadIn(b, pl);
    }
    const ms = performance.now() - t0;
    S.made++; S.ms += ms; S.max = Math.max(S.max, ms); S.log.push(pl.key + ' ' + ms.toFixed(1)); if (S.log.length > 200) S.log.shift();
    (shotSets[pl.key] || (shotSets[pl.key] = [])).push(b); return b;
  }
  // (a kind's first take is written when it is first fired, or before, when the place changes and it is in your hands; the rest when the
  // page has time to spare, one or two at a time: a take is some ms of work)
  function shotFill() {
    if (shotIdle || !shotQ.length) return;
    shotIdle = true;
    const run = (dl) => {
      const t0 = performance.now(), budget = dl && !dl.didTimeout && dl.timeRemaining ? dl.timeRemaining() - 2 : 6;
      do {
        const [kind, supp, auto, room, fl, far, id] = shotQ.shift(), pl = shotPlan(kind, supp, auto, room, fl, far, id), set = shotSets[pl.key];
        if (pl.p.rv && !pl.recs.length && usable('gun_' + kind)) { if (!set || !set.length) shotMake(pl); continue; }   // (its recordings are still on their way: one take of the layers alone, to fire with until they come)
        if (!set || set.length < (pl.R ? 1 : 5)) shotMake(pl);   // (a recorded shot: one take - a gun sounds the same each time)
      } while (shotQ.length && performance.now() - t0 < budget);
      shotIdle = false; shotFill();
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 500 }); else setTimeout(run, 50);
  }
  function shotWarm(room) {
    const P = G.player;
    // (a gun with something on its muzzle may be suppressed: its suppressed takes are made too - a few ms of spare time, if not)
    for (const w of (P && P.weapons) || []) {
      const d = w && w.def, k = d && (d.sound === 'tesla' ? 'nail' : d.sound); if (!SHOT[k]) continue;
      // (a launcher's shot is played without its gun's name (A.launcher: newShot(kind, {})): its takes made the same way, or the first
      // launch wrote one on the spot)
      const auto = !!(k === 'shotgun' && d.autoShot); const rid = LAUNCH.has(k) ? rId({}) : rId({ id: d.id, rar: d.rarity }); shotQ.push([k, false, auto, room, 0, false, rid]); if (d.trait === 'silent' || (w.atts && w.atts.muzzle)) shotQ.push([k, true, auto, room, 0, false, rid]);
    }
    shotFill();
  }
  const LAUNCH = new Set(['rocket', 'gl', 'rail', 'harpoon', 'crossbow']);
  // (a gun come into the hands any way at all - taken from the ground or bought straight into a free hand, not only changed to with
  // its click (mech 'switch'): weapons.js equip asks, and the takes of the guns now held are queued for the time the page has to spare,
  // once for each set of guns and place. Their first shot wrote its first take on the spot: 10 - 50 ms)
  let gunKey = '';
  A.gunPrep = function () {
    if (!ctx || !NEW()) return;
    const P = G.player, k = ((P && P.weapons) || []).map((w) => (w && w.def ? w.def.id + (w.atts && w.atts.muzzle ? '+s' : '') : '')).join(',') + '|' + outdoor();
    if (k === gunKey) return;
    gunKey = k; shotWarm(!outdoor());
  };
  // (soundcheck.html: the plans of a kind made ready before they are fired, in the time the page has to spare)
  A.shotPrep = function (kind, fls, room) { if (!ctx || !NEW()) return; gunsIn.then(() => { for (const fl of fls) shotQ.push([kind, false, false, room, fl]); shotFill(); }); };
  // (one of a plan's takes, never the same one twice running; the first written now, the rest queued for the time the page has to spare)
  function takeOf(pl, q) {
    const set = shotSets[pl.key];
    if (!set || !set.length) { const b = shotMake(pl); if (!pl.R) { for (let i = 0; i < 4; i++) shotQ.push(q); shotFill(); } return b; }
    let i = Math.floor(Math.random() * set.length); if (set.length > 1 && i === shotLast[pl.key]) i = (i + 1) % set.length; shotLast[pl.key] = i; return set[i];
  }
  const tailLast = {};
  function newShot(kind, opts) {
    const supp = !!opts.suppressed, room = !outdoor(), auto = kind === 'shotgun' && !!opts.auto, v = Math.pow(opts.vol || 1, 0.4), t = ctx.currentTime, fl = A.gunFlavor;
    const pl = shotPlan(kind, supp, auto, room, fl, false, rId(opts)), p = pl.p, buf = takeOf(pl, [kind, supp, auto, room, fl, false, rId(opts)]);
    // (each named gun a little off the next one's pitch)
    // (a recorded shot: its pitch a hair off at each shot (+-1.2 %) and its level (+-0.4 dB), nothing more)
    const at = opts.pos || null, out = dest(at, p.wet, gunDry), src = ctx.createBufferSource(), rate = (opts.id && !supp ? 0.97 + hr(hs(opts.id), 1) * 0.06 : 1) * vr(1, pl.R ? 0.012 : 0.015);
    out.gain.value = v * p.lv * pl.gv * vr(1, pl.R ? 0.045 : 0.05); src.buffer = buf; src.playbackRate.value = rate;
    if (pl.R) A.shotStats.play = [pl.key, pl.recs[0] && pl.recs[0].nm, rate, out.gain.value];
    if (!pl.R) { src.connect(out); src.start(t); }
    else {
      // A recorded shot. How far off it is: a foe's from its place; a friend's (no place and no gun's id: coop/core.js plays it at 0.8 -
      // d / 80 for d m off) from that level; opts.dist where the caller knows it. From RFAR[0] m the far recording comes in over the near
      // one, by RFAR[1] m it is all of it (as much of the one going as of the other coming: the loudness is the fall-off's alone)
      let dist = opts.dist;
      if (dist === undefined && at && Number.isFinite(at.x + at.y + at.z)) { const L = A.listener; dist = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z); }
      if (dist === undefined && !at && !opts.id && opts.vol !== undefined) dist = Math.max(0, (0.8 - opts.vol) * 80);
      const m0 = supp ? 0 : Math.min(1, Math.max(0, ((dist || 0) - RFAR[0]) / (RFAR[1] - RFAR[0]))), m = m0 * m0 * (3 - 2 * m0), gn = Math.cos((m * Math.PI) / 2), gf = Math.sin((m * Math.PI) / 2);
      // (the place's tail: in fast fire each shot's share of it smaller, so that the fire's tail is as one shot's - a foe's fire and your own apart)
      const tk = at || !opts.id ? 'o' : 'm', share = Math.max(0.25, Math.min(1, (t - (tailLast[tk] || -9)) / 0.35)); tailLast[tk] = t;
      const play = (b, g) => {
        const s1 = ctx.createBufferSource(), g1 = ctx.createGain(); g1.gain.value = g; s1.buffer = b; s1.playbackRate.value = rate; s1.connect(g1); g1.connect(out); s1.start(t);
        if (b.tail) playTail(b.tail, g * share, rate, out, t);
      };
      if (gn > 0.02) play(buf, gn);
      if (gf > 0.02) { const fp = shotPlan(kind, false, auto, room, fl, true, rId(opts)); if (fp.R && fp.far) play(takeOf(fp, [kind, false, auto, room, fl, true, rId(opts)]), gf); else play(buf, gf); }
    }
    // (the rest pulled down round your own shot only: one asked for from a place - a foe's, a guardian's - or with no gun's id - a friend's -
    // is another's, and leaves the rest as it is)
    const own = !at && !!opts.id;
    if (own && pl.duck) duckOthers(t, pl.duck);
    // (on open ground the roll after it; in fast fire each shot's share of it is smaller, so that the fire rolls as one shot would)
    if (!room && p.tail) {
      const share = Math.max(0.2, Math.min(1, (t - lastTail) / 0.4)), e = dest(at, 0, gunDry), s2 = ctx.createBufferSource(); lastTail = t;
      e.gain.value = v * p.lv * p.tl * share * 0.8 * pl.gv; s2.buffer = tailTake(); s2.playbackRate.value = Math.min(2, 1.5 / p.tail) * vr(1, 0.04); s2.connect(e); s2.start(t);
    }
    if (p.cas && opts.id && t - lastCase > 0.15 && Math.random() < p.cas[0]) {   // (your own gun's empties only: a shot asked for without a gun's id is another's - a guardian's, a friend's)
      lastCase = t;
      const e = dest(null, 0.1, gunDry), s3 = ctx.createBufferSource();
      e.gain.value = v * (room ? 0.035 : 0.018) * (p.cg || 1) * vr(1, 0.2); s3.buffer = caseTake(); s3.playbackRate.value = vr(1, 0.05); s3.connect(e); s3.start(t + p.cas[1] * vr(1, 0.15));
    }
    if (at) return;   // (another's gun: its working is not in your hands)
    const mv = p.mv || 1;
    if (kind === 'shotgun' && !opts.auto) A.mech('pump', 0.35, 0.7 * mv, own);
    if (kind === 'sniper') { A.mech('boltBack', 0.4, 0.7 * mv, own); A.mech('boltFwd', 0.6, 0.7 * mv, own); }
    if (kind === 'revolver') A.mech('click', 0.2, 0.75 * mv, own);
  }
  A.gun = function (kind, opts) {
    if (!ctx || !voice(1)) return;
    opts = opts || {};
    // (the arc thrower's shot is the nail gun's at half, as weapons.js plays your own: a friend's comes here as 'tesla', which has no
    // shot of its own and was the assault rifle's layers)
    if (kind === 'tesla') { kind = 'nail'; opts = Object.assign({}, opts, { vol: (opts.vol || 1) * 0.5 }); }
    if (NEW()) { newShot(kind, opts); return; }
    // (the old set, as it was)
    const gv = gunVoice(GUN[opts.suppressed ? 'suppressed' : kind] || GUN.rifle, opts.suppressed ? {} : opts), p = gv.p;
    const t = ctx.currentTime;
    const out = dest(null, p.wet * 0.9, gunBus);
    out.gain.value = opts.vol || 1;
    const pr = vr(1, 0.06);
    // mechanical click / transient
    nz({ t, f: [['highpass', 3500]], g: p.crack * 0.9, d: 0.012, to: out });
    // supersonic crack (broadband, quick)
    nz({ t, f: [['bandpass', gv.cf * pr, 0.8]], g: p.crack, d: 0.03 + p.crack * 0.02, to: out });
    // body (gas expansion)
    nz({ t, buf: 'pink', f: [['lowpass', p.body * pr, 0.9, p.body * 0.35, p.bd]], g: p.bg, a: 0.001, d: p.bd, to: out });
    // low thump (chest punch)
    tn({ t, f0: p.thump[0] * pr, f1: p.thump[1], d: 0.09 + p.tg * 0.12, g: p.tg, to: out, type: 'triangle', lp: 400 });
    // decaying tail, through reverb mostly
    if (p.tail > 0.1) {
      const tail = dest(null, 1.2, dry); tail.gain.value = 0.35;
      nz({ t: t + 0.01, buf: 'brown', f: [['lowpass', 900, 0.6, 200, p.tail]], g: p.tail * 0.6, a: 0.01, d: p.tail, to: tail });
    }
    if (!opts.suppressed && opts.id) {
      // character
      if (gv.c === 'ring') tn({ t: t + 0.004, f0: 1300 + hr(gv.h, 8) * 1700, d: 0.2, g: 0.13, to: out, type: 'sine' });
      else if (gv.c === 'rasp') nz({ t, f: [['bandpass', 1100 + hr(gv.h, 9) * 900, 2.2]], g: 0.35, a: 0.002, d: 0.07, to: out });
      // trait flavour
      const tr = opts.trait;
      if (tr === 'shock' || tr === 'thunder' || tr === 'stormcall' || tr === 'chainHit') { nz({ t, f: [['bandpass', 6500, 3, 2500, 0.1]], g: 0.3, d: 0.1, to: out }); tn({ t, f0: 900, f1: 260, d: 0.09, g: 0.12, to: out, type: 'square', lp: 2500 }); }
      else if (tr === 'incendiary' || tr === 'explosiveRounds' || tr === 'flameWave' || tr === 'cluster') { nz({ t, buf: 'brown', f: [['lowpass', 700, 0.7, 150, 0.3]], g: 0.5, a: 0.01, d: 0.3, to: out }); tn({ t, f0: 75, f1: 32, d: 0.25, g: 0.4, to: out, type: 'sine' }); }
      else if (tr === 'cryo') tn({ t: t + 0.005, f0: 3400, f1: 2300, d: 0.16, g: 0.1, to: out, type: 'sine' });
      else if (tr === 'ricochet' || tr === 'homing') tn({ t: t + 0.03, f0: 2500, f1: 1500, d: 0.12, g: 0.09, to: out, type: 'triangle' });
      else if (tr === 'lifesteal' || tr === 'devour' || tr === 'reap' || tr === 'voidmaw') tn({ t, f0: 110, f1: 70, d: 0.18, g: 0.3, to: out, type: 'sawtooth', lp: 320 });
      else if (tr === 'toxic') nz({ t: t + 0.01, f: [['bandpass', 1800, 1.2, 700, 0.18]], g: 0.2, d: 0.2, to: out });
      else if (tr === 'double' || tr === 'echo') { nz({ t: t + 0.05, f: [['highpass', 3000]], g: p.crack * 0.5, d: 0.012, to: out }); tn({ t: t + 0.05, f0: p.thump[0] * 0.8, f1: p.thump[1], d: 0.08, g: p.tg * 0.4, to: out, type: 'triangle', lp: 400 }); }
    }
    if (kind === 'shotgun' && !opts.auto) A.mech('pump', 0.35);
    if (kind === 'sniper') A.mech('bolt', 0.4);
    if (kind === 'revolver') A.mech('click', 0.2);
  };
  // projectile launchers / special
  A.launcher = function (kind) {
    if (!ctx) return;
    if ((kind === 'rocket' || kind === 'rail' || kind === 'crossbow') && smp('launch_' + kind)) return;
    if (!voice(1)) return;
    if (NEW() && SHOT[kind]) {
      // (the new set: the launch itself in layers, as a shot is; then what goes on after it, its low end shorter than it was - it held
      // the whole of it under a dull roar)
      newShot(kind, {});
      const t = ctx.currentTime, out = dest(null, 0.5);
      if (kind === 'rocket') { nz({ t: t + 0.01, buf: 'pink', f: [['bandpass', 1500, 0.7, 500, 0.6]], g: 0.45, a: 0.04, d: 0.55, to: out }); nz({ t, f: [['bandpass', 900, 1.2, 2500, 0.5]], g: 0.35, a: 0.05, d: 0.5, to: out }); }
      else if (kind === 'gl') A.mech('click', 0.3);
      else if (kind === 'rail') { nz({ t, f: [['bandpass', 1800, 1.5]], g: 0.3, d: 0.12, to: out }); tn({ t, f0: 3400, f1: 900, d: 0.35, g: 0.05, to: out, type: 'sine' }); }
      else if (kind === 'harpoon') A.chain(0.5, 0.25);
      return;
    }
    const t = ctx.currentTime, out = dest(null, 0.6);
    if (kind === 'rocket') {
      nz({ t, buf: 'pink', f: [['lowpass', 1800, 0.7, 300, 0.5]], g: 0.9, a: 0.01, d: 0.6, to: out });
      tn({ t, f0: 90, f1: 40, d: 0.35, g: 0.7, to: out, type: 'triangle' });
      nz({ t, f: [['bandpass', 900, 1.2, 2500, 0.5]], g: 0.35, a: 0.05, d: 0.5, to: out });
    } else if (kind === 'gl') {
      tn({ t, f0: 140, f1: 50, d: 0.14, g: 0.8, to: out, type: 'triangle' });
      nz({ t, buf: 'pink', f: [['lowpass', 1200, 0.8, 300]], g: 0.6, d: 0.18, to: out });
      A.mech('click', 0.3);
    } else if (kind === 'crossbow') {
      nz({ t, f: [['bandpass', 600, 2]], g: 0.6, d: 0.05, to: out });
      tn({ t, f0: 220, f1: 110, d: 0.18, g: 0.35, to: out, type: 'triangle', lp: 1200 });
      nz({ t: t + 0.01, f: [['bandpass', 2400, 3, 1200, 0.2]], g: 0.15, d: 0.2, to: out });
    } else if (kind === 'rail') {
      tn({ t, f0: 70, f1: 30, d: 0.6, g: 0.9, to: out, type: 'triangle' });
      nz({ t, buf: 'pink', f: [['lowpass', 3000, 0.7, 400, 0.7]], g: 0.9, d: 0.7, to: out });
      nz({ t, f: [['bandpass', 1800, 1.5]], g: 0.4, d: 0.12, to: out });
    } else if (kind === 'harpoon') {
      nz({ t, f: [['bandpass', 700, 1.5]], g: 0.6, d: 0.08, to: out });
      tn({ t, f0: 160, f1: 60, d: 0.2, g: 0.6, to: out, type: 'triangle' });
      A.chain(0.5, 0.25);
    }
  };
  // looping sources (flamethrower, minigun spin, slide, grapple reel, burning)
  // a looping recorded bed: {set(v), stop()}; null when the key is off or not loaded
  function smpLoop(key, target, wet, to) {
    if (!ctx || !usable(key)) return null;
    const f = SB.bank[key].f[0], buf = bufs[f];
    if (!buf) { fetchBuf(f); return null; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = SB.bank[key].rate || 1;   // (the same air played slower: a deeper place)
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(g); g.connect(to || dest(null, wet));
    src.start(0, Math.random() * buf.duration);
    const lv = target * (SB.bank[key].v || 1);
    g.gain.setTargetAtTime(lv, ctx.currentTime, 0.04);
    return {
      set(v) { g.gain.setTargetAtTime(Math.max(0.0001, lv * v), ctx.currentTime, 0.05); },
      stop(fade) { g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade || 0.06); setTimeout(() => { try { src.stop(); } catch (e) {} }, (fade || 0.06) * 7000); },
    };
  }
  A.loop = function (kind) {
    if (!ctx) return { stop() {}, set() {} };
    if (kind === 'flame') { const l = smpLoop('loop_flame', 0.45, 0.4); if (l) return l; }
    const src = ctx.createBufferSource();
    src.buffer = kind === 'flame' ? pink : kind === 'slide' ? white : brown;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const out = dest(null, kind === 'flame' ? 0.4 : 0.15);
    let lfo = null;
    if (kind === 'flame') { f.type = 'lowpass'; f.frequency.value = NEW() ? 2600 : 1400; f.Q.value = 0.5; }
    else if (kind === 'slide') { f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7; }
    else if (kind === 'spin') { f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 4; }
    else if (kind === 'wind') { f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.8; }
    src.connect(f); f.connect(g); g.connect(out);
    src.start();
    const target = { flame: 0.45, slide: 0.18, spin: 0.25, wind: 0.0 }[kind] || 0.2;
    g.gain.setTargetAtTime(target, ctx.currentTime, 0.04);
    return {
      set(v, freq) { g.gain.setTargetAtTime(Math.max(0.0001, target * v), ctx.currentTime, 0.05); if (freq) f.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05); },
      stop() { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06); setTimeout(() => { try { src.stop(); } catch (e) {} }, 400); if (lfo) lfo.stop(); },
    };
  };

  // mechanical sounds: reload parts
  // (the new set) The action and the reload as the hands hear them, close and dry. A heavy part stopped is the dull knock of its mass
  // (200-900 Hz) and a short ring of its steel; a magazine seated is two sounds, its body striking home and then the catch biting; a
  // polymer frame or magazine knocks shorter and rings less than steel. A light gun's parts sound higher and lighter, a heavy gun's lower
  // and harder (by the gun in your hands). Each is written into a buffer as a shot is (knockIn, ringIn, slideIn), a few takes of each
  // kept and played in turn. [kind]: { len (s), e: the events, as in ACT }; MECHV: each part's level
  const MECH = {
    magOut: { len: 0.3, e: [['k', 0, 900, 0.35], ['r', 0, [[2300, 0.25, 0.02], [4100, 0.1, 0.015]], 0.4, 0.5], ['s', 0.012, 900, 600, 0.07, 0.35],
      ['k', 0.075, 620, 0.6], ['r', 0.075, [[880, 0.5, 0.06], [1850, 0.3, 0.05], [3200, 0.1, 0.03]], 0.6, 0.3], ['r', 0.09, [[2500, 0.18, 0.03]], 0.3, 0.2]] },
    magIn: { len: 0.32, e: [['s', 0, 600, 1000, 0.05, 0.3], ['k', 0.05, 460, 1], ['r', 0.05, [[680, 0.6, 0.07], [1450, 0.5, 0.08], [2700, 0.2, 0.05]], 0.7, 0.3],
      ['k', 0.085, 900, 0.55], ['r', 0.085, [[1750, 0.4, 0.04], [3300, 0.15, 0.03]], 0.6, 0.5]] },
    boltBack: { len: 0.3, e: [['s', 0, 900, 1500, 0.07, 0.35], ['k', 0.068, 420, 0.95], ['r', 0.068, [[560, 0.6, 0.06], [1250, 0.5, 0.08], [2400, 0.22, 0.05]], 0.7, 0.3]] },
    boltFwd: { len: 0.3, e: [['s', 0, 1300, 800, 0.05, 0.3], ['k', 0.052, 380, 1.1], ['r', 0.052, [[520, 0.6, 0.07], [1150, 0.6, 0.09], [2200, 0.25, 0.06]], 0.7, 0.3],
      ['k', 0.064, 720, 0.5], ['r', 0.064, [[1700, 0.35, 0.04], [3100, 0.1, 0.03]], 0.5, 0.4]] },
    pump: { len: 0.42, e: [['s', 0, 700, 450, 0.1, 0.4], ['k', 0.09, 300, 1.1], ['r', 0.09, [[420, 0.5, 0.07], [950, 0.5, 0.08], [1900, 0.18, 0.05]], 0.7, 0.3],
      ['s', 0.15, 500, 800, 0.08, 0.35], ['k', 0.235, 340, 1.2], ['r', 0.235, [[480, 0.6, 0.08], [1100, 0.6, 0.1], [2200, 0.22, 0.06]], 0.8, 0.3]] },
    shell: { len: 0.2, e: [['k', 0, 700, 0.45], ['r', 0, [[1300, 0.3, 0.03], [2600, 0.12, 0.02]], 0.5, 0.4], ['s', 0.006, 1200, 900, 0.03, 0.15], ['k', 0.045, 1100, 0.3], ['r', 0.045, [[2200, 0.2, 0.03]], 0.4, 0.4]] },
    click: { len: 0.15, e: [['k', 0, 900, 0.35], ['r', 0, [[1500, 0.3, 0.03], [2900, 0.18, 0.025]], 0.5, 0.5], ['k', 0.016, 1100, 0.45], ['r', 0.016, [[1800, 0.35, 0.035], [3500, 0.12, 0.02]], 0.6, 0.5]] },
    empty: { len: 0.15, e: [['k', 0, 800, 0.5], ['r', 0, [[1200, 0.4, 0.03], [2600, 0.22, 0.04], [4200, 0.07, 0.03]], 0.6, 0.6]] },
    cylinder: { len: 0.32, e: [['s', 0, 900, 800, 0.24, 0.12], ['k', 0, 1000, 0.2], ['r', 0, [[2200, 0.2, 0.025]], 0.35, 0.4], ['k', 0.035, 1000, 0.2], ['r', 0.035, [[2200, 0.2, 0.025]], 0.35, 0.4],
      ['k', 0.07, 1000, 0.2], ['r', 0.07, [[2250, 0.2, 0.025]], 0.35, 0.4], ['k', 0.105, 1000, 0.2], ['r', 0.105, [[2200, 0.2, 0.025]], 0.35, 0.4], ['k', 0.14, 1000, 0.2], ['r', 0.14, [[2150, 0.2, 0.025]], 0.35, 0.4],
      ['k', 0.175, 1000, 0.2], ['r', 0.175, [[2200, 0.2, 0.025]], 0.35, 0.4], ['k', 0.215, 600, 0.45], ['r', 0.215, [[900, 0.3, 0.05], [1900, 0.2, 0.04]], 0.5, 0.3]] },
    switch: { len: 0.32, e: [['s', 0, 600, 400, 0.11, 0.25], ['k', 0.095, 300, 0.8], ['r', 0.095, [[450, 0.4, 0.05], [1000, 0.35, 0.06], [2000, 0.12, 0.04]], 0.6, 0.3]] },
    cell: { len: 0.4, e: [['s', 0, 500, 800, 0.04, 0.2], ['k', 0.035, 260, 1], ['r', 0.035, [[380, 0.5, 0.08], [850, 0.4, 0.1], [1700, 0.15, 0.07], [120, 0.2, 0.25]], 0.7, 0.3],
      ['k', 0.085, 900, 0.4], ['r', 0.085, [[1800, 0.25, 0.04]], 0.4, 0.4]] },
    grab: { len: 0.15, e: [['s', 0, 1100, 700, 0.08, 0.15]] },
  };
  const MECHV = { magOut: 0.245, magIn: 0.32, boltBack: 0.3, boltFwd: 0.31, pump: 0.23, shell: 0.2, click: 0.22, empty: 0.16, cylinder: 0.12, switch: 0.18, cell: 0.14, grab: 0.05 };
  // how heavy the gun in your hands is (its parts lower and harder), and whether its frame and magazine are polymer
  const WT = { pistol: 0.75, revolver: 0.85, smg: 0.85, rifle: 1, burst: 1, dmr: 1.05, sniper: 1.1, shotgun: 1.15, autoshotgun: 1.15, lmg: 1.25, minigun: 1.3, crossbow: 0.9, rocket: 1.2, gl: 1.1, flame: 1.1, rail: 1.15, nail: 0.8, harpoon: 1, tesla: 0.9 };
  const POLY = { pistol: 1, smg: 1, nail: 1, tesla: 1 };
  const handArch = () => { const P = G.player, w = P && P.weapons && P.weapons[P.wIdx]; return (w && w.def && w.def.arch) || 'rifle'; };
  const mechSets = {}, mechLast = {};
  function mechTake(kind, arch) {
    const M = MECH[kind]; if (!M) return null;
    const key = kind + ':' + arch, set = mechSets[key] || (mechSets[key] = []);
    if (set.length >= 3) { let i = Math.floor(Math.random() * set.length); if (i === mechLast[key]) i = (i + 1) % set.length; mechLast[key] = i; return set[i]; }
    const sr = ctx.sampleRate, wt = WT[arch] || 1, fk = 1 / Math.sqrt(wt), kk = Math.sqrt(wt), poly = !!POLY[arch], len = Math.round(M.len * sr), buf = ctx.createBuffer(2, len, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (const e of M.e) {
      const i0 = Math.round(e[1] * vr(1, 0.06) * sr); if (i0 >= len) continue;
      if (e[0] === 's') slideIn(L, R, i0, e[2] * fk, e[3] * fk, e[4], e[5], 0.15, sr);
      else if (e[0] === 'k') knockIn(L, R, i0, e[2] * fk, e[3] * kk, 0.15, sr);
      else ringIn(L, R, i0, e[2].map(([f, a, t60]) => [f * fk, poly ? a * 0.55 : a, poly ? t60 * 0.5 : t60]), e[3], e[4], 0.15, sr);
    }
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    for (let i = 0; i < len; i++) { L[i] /= pk || 1; R[i] /= pk || 1; }
    set.push(buf); return buf;
  }
  // (own: the working of your own gun after a shot - it goes the guns' way, and is not pulled down with the rest round the shot)
  A.mech = function (kind, delay, vol, own) {
    if (!ctx || !voice(0.4)) return;
    if (!delay && smp('mech_' + kind, null, vol)) return;
    if (delay && SB.bank['mech_' + kind] && usable('mech_' + kind)) { setTimeout(() => A.mech(kind, 0, vol, own), delay * 1000); return; }
    const t = ctx.currentTime + (delay || 0);
    if (NEW()) {
      if (kind === 'bolt') { A.mech('boltBack', delay, vol, own); A.mech('boltFwd', (delay || 0) + 0.2, vol, own); return; }
      if (kind === 'switch') shotWarm(!outdoor());   // (a gun taken up: its shots made ready before it is fired)
      const arch = handArch(), b = mechTake(kind, arch); if (!b) return;
      const out = dest(null, 0.08, own ? gunDry : undefined), src = ctx.createBufferSource();
      out.gain.value = (vol || 1) * (MECHV[kind] || 0.4) * Math.sqrt(WT[arch] || 1) * vr(1, 0.08); src.buffer = b; src.playbackRate.value = vr(1, 0.025);
      src.connect(out); src.start(t);
      return;
    }
    const out = dest(null, 0.25); out.gain.value = vol || 1;
    const clack = (tt, f, g, q) => {
      nz({ t: tt, f: [['bandpass', vr(f, 0.08), q || 6]], g, d: 0.035, to: out });
      nz({ t: tt, f: [['highpass', 2500]], g: g * 0.35, d: 0.008, to: out });
      tn({ t: tt, f0: vr(f * 0.18, 0.1), f1: f * 0.1, d: 0.04, g: g * 0.4, to: out });
    };
    switch (kind) {
      case 'magOut': clack(t, 1500, 0.35); nz({ t: t + 0.02, f: [['bandpass', 900, 1.5]], g: 0.12, d: 0.12, to: out }); break;
      case 'magIn': clack(t, 1300, 0.5); clack(t + 0.07, 2200, 0.4, 9); break;
      case 'boltBack': nz({ t, f: [['bandpass', 1800, 2, 1200, 0.08]], g: 0.15, d: 0.08, to: out }); clack(t + 0.07, 1700, 0.45); break;
      case 'boltFwd': nz({ t, f: [['bandpass', 1300, 2, 2000, 0.06]], g: 0.15, d: 0.06, to: out }); clack(t + 0.06, 2100, 0.55); break;
      case 'bolt': A.mech('boltBack', delay); A.mech('boltFwd', (delay || 0) + 0.2); break;
      case 'pump': nz({ t, f: [['bandpass', 900, 1.8, 600, 0.1]], g: 0.25, d: 0.1, to: out }); clack(t + 0.09, 1100, 0.45); nz({ t: t + 0.16, f: [['bandpass', 800, 1.8, 1300, 0.08]], g: 0.2, d: 0.08, to: out }); clack(t + 0.24, 1500, 0.5); break;
      case 'shell': clack(t, 1900, 0.3, 8); tn({ t, f0: 2600, d: 0.05, g: 0.05, to: out }); break;
      case 'click': clack(t, 2600, 0.3, 10); break;
      case 'empty': clack(t, 3000, 0.22, 12); break;
      case 'cylinder': for (let i = 0; i < 6; i++) clack(t + i * 0.035, 2400 + i * 50, 0.12, 10); break;
      case 'switch': nz({ t, buf: 'pink', f: [['bandpass', 700, 1]], g: 0.18, d: 0.12, to: out }); clack(t + 0.1, 1600, 0.3); break;
      case 'cell': clack(t, 900, 0.4, 3); nz({ t: t + 0.05, f: [['bandpass', 400, 1.2]], g: 0.15, d: 0.25, to: out }); break;
      case 'grab': nz({ t, buf: 'pink', f: [['bandpass', 1200, 0.8]], g: 0.12, d: 0.08, to: out }); break;
    }
  };

  // ---------- movement ----------
  // (the new set: the level of each synthesized floor, so that it stands as loud as a recorded step on stone)
  const STEPK = { water: 2, metal: 0.85, ice: 2.2 };
  // an iron plate struck (a step, a landing): its modes are not multiples of one another (a struck plate's), each a damped tone with
  // a band of noise round it (rough, not a chime), each dying in its own time and a little off every time; where the boot lands some
  // modes are hardly struck - and a loose grating rattles after it. k: how long it rings
  function plate(t, out, k) {
    const f0 = vr(300, 0.12);
    for (const [m, g, d] of [[1, 0.12, 0.7], [1.59, 0.09, 0.52], [2.14, 0.07, 0.4], [2.83, 0.05, 0.3], [3.61, 0.035, 0.2], [4.7, 0.025, 0.14]]) {
      if (m > 1.5 && Math.random() < 0.25) continue;
      const f = f0 * m * vr(1, 0.02), gg = g * vr(1, 0.3), dd = d * k * vr(1, 0.15);
      tn({ t: t + 0.003, f0: f, f1: f * 0.997, d: dd, g: gg, a: 0.002, to: out });
      nz({ t: t + 0.002, f: [['bandpass', f, 6]], g: gg * 12, a: 0.002, d: dd * 0.45, to: out });
    }
    nz({ t: t + 0.004, f: [['bandpass', vr(2800, 0.2), 4]], g: 0.25, d: 0.025, to: out });
    if (Math.random() < 0.6) for (let i = 0, c = 1 + Math.floor(Math.random() * 2); i < c; i++) nz({ t: t + 0.05 + i * 0.035 + Math.random() * 0.03, f: [['bandpass', vr(1900, 0.25), 5]], g: 0.15, d: 0.025, to: out });
  }
  // the rime on ice crunching under a sole: a few grains of sound, never the same; a thin squeak now and then, a crack more rarely
  function rime(t, out) {
    nz({ t, f: [['bandpass', vr(2000, 0.2), 1.0]], g: 0.4, a: 0.002, d: 0.05, to: out });
    for (let i = 0, c = 2 + Math.floor(Math.random() * 3); i < c; i++) nz({ t: t + 0.004 + Math.random() * 0.045, f: [['bandpass', vr(3200, 0.3), 2]], g: 0.25, d: 0.008, to: out });
    if (Math.random() < 0.3) { const f = vr(1600, 0.3); tn({ t: t + 0.02, f0: f, f1: f * 0.8, d: 0.05, g: 0.03, to: out }); }
    if (Math.random() < 0.12) nz({ t: t + 0.03, f: [['highpass', 4200]], g: 0.1, d: 0.012, to: out });
  }
  A.step = function (surface, intensity) {
    if (!ctx) return;
    const sk = surface || 'stone';   // (turf is told from stone by what is underfoot: player.js surfaceBelow)
    if (smp('step_' + sk, null, 0.35 * intensity, 0.92 + intensity * 0.08) || (sk !== 'wood' && sk !== 'metal' && sk !== 'water' && sk !== 'ice' && smp('step_stone', null, 0.35 * intensity))) return; // (a floor with no recording of its own is synthesized: boards must not sound of stone)
    const n = NEW();
    if (!voice(n && surface === 'metal' ? 0.6 : 0.3)) return;
    const t = ctx.currentTime, out = dest(null, 0.15);
    out.gain.value = 0.35 * intensity * (n ? STEPK[surface] || 1 : 1);
    if (surface === 'wood') {
      nz({ t, f: [['bandpass', vr(500, 0.15), 1.4]], g: 0.6, d: 0.07, to: out });
      tn({ t, f0: vr(130, 0.1), f1: 80, d: 0.06, g: 0.4, to: out });
      nz({ t: t + 0.01, f: [['bandpass', 1400, 4]], g: 0.08, d: 0.04, to: out });
    } else if (surface === 'water') {
      // the foot breaking the surface: a slap, the slosh of the water round the leg, a bubble or two, drops falling back
      nz({ t, f: [['bandpass', vr(1150, 0.2), 1.0, 420, 0.11]], g: 0.55, a: 0.005, d: 0.11, to: out });
      nz({ t: t + 0.015, buf: 'pink', f: [['lowpass', 1900], ['highpass', 180]], g: 0.32, a: 0.025, d: 0.24, to: out });
      bubbles(t + 0.03, 1 + Math.floor(Math.random() * 3), out, 420, 1250, 0.05);
      nz({ t: t + 0.06, f: [['highpass', 3600]], g: 0.05, a: 0.01, d: 0.12, to: out });
      if (Math.random() < 0.6) { const f = vr(2600, 0.3); tn({ t: t + 0.14 + Math.random() * 0.12, f0: f, f1: f * 1.3, fd: 0.012, d: 0.02, g: 0.02, to: out }); }
    } else if (surface === 'metal' && !n) {
      nz({ t, f: [['bandpass', vr(900, 0.1), 3]], g: 0.4, d: 0.08, to: out });
      tn({ t, f0: vr(380, 0.05), d: 0.1, g: 0.08, to: out });
    } else if (surface === 'metal') {
      // an iron plate or grating under a boot: the heel's dull thud, then the plate rings
      nz({ t, buf: 'pink', f: [['lowpass', vr(600, 0.15), 0.8]], g: 0.75, d: 0.05, to: out });
      tn({ t, f0: vr(150, 0.08), f1: 85, d: 0.06, g: 0.3, to: out });
      plate(t, out, 0.85 + intensity * 0.2);
    } else if (surface === 'ice' && n) {
      // ice: a hard, short knock, and the rime under the sole
      nz({ t, buf: 'pink', f: [['bandpass', vr(950, 0.2), 1.2]], g: 0.9, d: 0.035, to: out });
      tn({ t, f0: vr(190, 0.1), f1: 120, d: 0.03, g: 0.18, to: out });
      rime(t, out);
    } else {
      // stone + grit
      nz({ t, buf: 'pink', f: [['lowpass', vr(900, 0.2), 0.9]], g: 0.75, d: 0.06, to: out });
      tn({ t, f0: vr(95, 0.1), f1: 55, d: 0.05, g: 0.45, to: out });
      nz({ t: t + 0.012, f: [['bandpass', vr(3200, 0.2), 1.5]], g: 0.08 * (0.5 + Math.random()), d: 0.05, to: out });
    }
  };
  A.jump = function () {
    if (!ctx || smp('jump', null, 0.35)) return;
    if (NEW()) { SN.jump(); return; }
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.35;
    nz({ t, buf: 'pink', f: [['bandpass', 700, 0.8]], g: 0.3, d: 0.09, to: out });
    nz({ t: t + 0.02, f: [['bandpass', 1500, 0.6, 600, 0.2]], g: 0.12, a: 0.03, d: 0.18, to: out });
  };
  A.land = function (intensity, surface) {
    if (ctx && surface === 'water') { A.splash(null, 0.55 + Math.min(1, intensity) * 0.8); return; } // (a splash, with its own thump when it is a big one)
    if (!ctx) return;
    if (NEW()) { if (voice(0.6)) SN.land(Math.max(0, Math.min(1, intensity)), surface === 'dirt' ? 'grass' : surface || 'stone'); return; }
    if (smp(surface === 'wood' ? 'land_wood' : 'land', null, Math.min(1.2, 0.3 + intensity * 0.9), 1.1 - Math.min(0.25, intensity * 0.25))) return;
    const t = ctx.currentTime, out = dest(null, 0.25);
    out.gain.value = Math.min(1.2, 0.3 + intensity * 0.9);
    tn({ t, f0: 110, f1: 45, d: 0.12 + intensity * 0.1, g: 0.8, to: out, type: 'triangle', lp: 300 });
    nz({ t, buf: 'pink', f: [['lowpass', surface === 'wood' ? 700 : 1100, 0.8]], g: 0.7, d: 0.1, to: out });
    if (intensity > 0.4) nz({ t: t + 0.02, f: [['bandpass', 2600, 1]], g: 0.15 * intensity, d: 0.15, to: out });
    if (surface === 'wood') nz({ t: t + 0.01, f: [['bandpass', 400, 3]], g: 0.3, d: 0.15, to: out });
  };
  A.whoosh = function (dur, intensity, up) {
    if (!ctx || !voice(dur)) return;
    const t = ctx.currentTime, out = dest(null, 0.2); out.gain.value = intensity || 0.6;
    nz({ t, buf: 'pink', f: [['bandpass', up ? 400 : 1600, 1.4, up ? 1800 : 300, dur]], g: 0.8, a: dur * 0.3, d: dur * 0.7, to: out });
    nz({ t, buf: 'brown', f: [['lowpass', 500]], g: 0.4, a: dur * 0.2, d: dur * 0.6, to: out });
  };
  A.mantle = function () {
    if (!ctx || smp('mantle', null, 0.5)) return;
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.5;
    nz({ t, buf: 'pink', f: [['bandpass', 600, 1]], g: 0.4, d: 0.08, to: out });
    nz({ t: t + 0.12, buf: 'pink', f: [['lowpass', 800]], g: 0.5, d: 0.06, to: out });
    tn({ t: t + 0.12, f0: 100, f1: 60, d: 0.06, g: 0.3, to: out });
  };
  // chain rattle (grapple)
  A.chain = function (dur, vol) {
    if (!ctx || !voice(dur)) return;
    const t = ctx.currentTime, out = dest(null, 0.2); out.gain.value = vol || 0.5;
    const n = Math.floor(dur * 40);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (dur / n) + Math.random() * 0.01;
      nz({ t: tt, f: [['bandpass', vr(2800, 0.25), 9]], g: 0.18 * (1 - i / n * 0.6), d: 0.018, to: out });
    }
  };
  A.grappleFire = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.3);
    tn({ t, f0: 180, f1: 70, d: 0.12, g: 0.5, to: out, type: 'triangle' });
    nz({ t, f: [['bandpass', 1500, 2, 600, 0.2]], g: 0.4, d: 0.2, to: out });
    A.chain(0.3, 0.45);
  };
  A.grappleHit = function (pos) {
    if (!ctx || smp('grapple_hit', pos, 0.8, 1, 0.5)) return;
    const t = ctx.currentTime, out = dest(pos, 0.5);
    nz({ t, f: [['bandpass', 2000, 5]], g: 0.6, d: 0.06, to: out });
    nz({ t, buf: 'pink', f: [['lowpass', 1200]], g: 0.5, d: 0.12, to: out });
    tn({ t, f0: 1180, d: 0.18, g: 0.06, to: out });
    tn({ t, f0: 2730, d: 0.12, g: 0.03, to: out });
  };
  A.ratchet = function () {
    if (!ctx || smp('ratchet', null, 0.35) || !voice(0.1)) return;
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.35;
    nz({ t, f: [['bandpass', vr(2200, 0.1), 8]], g: 0.25, d: 0.02, to: out });
  };

  // ---------- combat ----------
  A.hitFlesh = function (pos, head, big) {
    if (!ctx) return;
    if (!head && smp('hit_flesh', pos, big ? 1 : 0.7, big ? 0.9 : 1, 0.15)) return;
    if (!voice(0.3)) return;
    const t = ctx.currentTime, out = dest(pos, 0.15);
    out.gain.value = big ? 1 : 0.7;
    nz({ t, buf: 'pink', f: [['lowpass', vr(900, 0.2), 1.2]], g: 0.7, d: 0.07, to: out });
    tn({ t, f0: vr(160, 0.1), f1: 70, d: 0.06, g: 0.4, to: out });
    nz({ t: t + 0.01, f: [['bandpass', 600, 2]], g: 0.25, d: 0.1, to: out }); // wet
    if (head) {
      // satisfying crunch for headshots (from player perspective, non-positional)
      const o2 = dest(null, 0.1); o2.gain.value = 0.6;
      nz({ t, f: [['bandpass', 2400, 2]], g: 0.5, d: 0.03, to: o2 });
      nz({ t: t + 0.015, buf: 'pink', f: [['lowpass', 1500]], g: 0.6, d: 0.08, to: o2 });
      tn({ t, f0: 900, f1: 500, d: 0.05, g: 0.08, to: o2 });
    }
  };
  A.hitConfirm = function (kill) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.05); out.gain.value = kill ? 0.55 : 0.3;
    nz({ t, f: [['bandpass', kill ? 1400 : 2000, 4]], g: 0.4, d: 0.03, to: out });
    if (kill) { tn({ t, f0: 180, f1: 60, d: 0.18, g: 0.5, to: out, type: 'triangle' }); nz({ t: t + 0.02, buf: 'pink', f: [['lowpass', 900]], g: 0.4, d: 0.2, to: out }); }
  };
  A.hitShield = function (pos) {
    if (!ctx || smp('hit_shield', pos, 0.7, 1, 0.4) || !voice(0.3)) return;
    const t = ctx.currentTime, out = dest(pos, 0.4); out.gain.value = 0.7;
    // dense metallic "tock" - inharmonic partials, but kept low & damped
    const base = vr(620, 0.06);
    [1, 2.32, 3.71, 5.1].forEach((m, i) => tn({ t, f0: base * m, d: 0.18 - i * 0.03, g: 0.12 / (i + 1), to: out }));
    nz({ t, f: [['bandpass', 1800, 2]], g: 0.35, d: 0.04, to: out });
    nz({ t, buf: 'pink', f: [['lowpass', 700]], g: 0.25, d: 0.05, to: out });
  };
  // shield shatter: a sharp crack, a burst of glassy shards raining down, and a heavy low thud
  A.shieldBreak = function (pos) {
    if (!ctx) return;
    if (smp('shield_break', pos, 1.15, 1, 0.7)) { const t = ctx.currentTime, out = dest(pos, 0.5); tn({ t, f0: 150, f1: 42, d: 0.35, g: 0.75, to: out, type: 'triangle', lp: 400 }); return; }
    const t = ctx.currentTime, out = dest(pos, 0.7);
    out.gain.value *= 1.15;
    // initial crack (broadband snap)
    nz({ t, f: [['highpass', 1800]], g: 0.9, d: 0.025, to: out });
    nz({ t, buf: 'pink', f: [['bandpass', 1200, 0.8]], g: 0.7, d: 0.06, to: out });
    // falling shards: short inharmonic glassy pings with random pitch, spread over ~0.45s
    for (let i = 0; i < 22; i++) {
      const tt = t + 0.01 + Math.pow(Math.random(), 1.6) * 0.45;
      const f = vr(2400, 0.45);
      const g = 0.05 + Math.random() * 0.06;
      tn({ t: tt, f0: f, f1: f * 0.97, d: 0.05 + Math.random() * 0.12, g, to: out });
      tn({ t: tt, f0: f * 2.71, d: 0.03 + Math.random() * 0.05, g: g * 0.4, to: out });
      nz({ t: tt, f: [['bandpass', f * 1.4, 8]], g: g * 1.5, d: 0.012, to: out });
    }
    // glass grit hiss + low thud of the energy collapsing
    nz({ t: t + 0.02, f: [['highpass', 3000], ['lowpass', 9000]], g: 0.25, a: 0.01, d: 0.35, to: out });
    tn({ t, f0: 150, f1: 42, d: 0.35, g: 0.75, to: out, type: 'triangle', lp: 400 });
    nz({ t, buf: 'brown', f: [['lowpass', 600, 0.7, 120, 0.4]], g: 0.6, d: 0.4, to: out });
  };
  // headshot: crisp skull crack + bone crunch + a short dull metallic "tock" so it reads instantly
  A.headshot = function (kill) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.12);
    out.gain.value = kill ? 0.85 : 0.7;
    nz({ t, f: [['bandpass', 3200, 2.2]], g: 0.75, d: 0.018, to: out });              // crack
    for (let i = 0; i < 4; i++) nz({ t: t + 0.006 + i * 0.011, f: [['bandpass', vr(1700, 0.25), 3]], g: 0.35, d: 0.014, to: out }); // crunch
    tn({ t, f0: 1250, f1: 1180, d: 0.16, g: 0.14, to: out });                        // tock (inharmonic, damped)
    tn({ t, f0: 3080, d: 0.07, g: 0.05, to: out });
    tn({ t, f0: 220, f1: 90, d: 0.09, g: 0.5, to: out, type: 'triangle', lp: 500 });   // body
    if (kill) { nz({ t: t + 0.03, buf: 'pink', f: [['lowpass', 1400, 0.8, 300, 0.25]], g: 0.6, d: 0.25, to: out }); tn({ t: t + 0.02, f0: 110, f1: 45, d: 0.3, g: 0.6, to: out, type: 'triangle', lp: 300 }); }
  };
  A.ricochet = function (pos) {
    if (!ctx || !voice(0.3) || Math.random() < 0.5) return;
    const t = ctx.currentTime, out = dest(pos, 0.3); out.gain.value = 0.3;
    if (NEW()) {
      // (the new set) a bullet glancing off: the knock of it, then the whine of it tumbling away - a falling note that throbs as it
      // turns over - and the air it tears
      const f = vr(3000, 0.25), d = vr(0.3, 0.25), f1 = f * vr(0.55, 0.15), t1 = t + 0.008;
      out.gain.value *= NV.ric;
      strike(t, out, [[vr(2300, 0.1), 0.1, 0.03], [vr(4100, 0.1), 0.06, 0.02]], { g: 0.3, hp: 3000 });
      const o = ctx.createOscillator(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), env = envGain(t1, 0.02, 0.12, d, out);
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t1); o.frequency.exponentialRampToValueAtTime(f1, t1 + d);
      lfo.frequency.setValueAtTime(vr(48, 0.3), t1); lfo.frequency.linearRampToValueAtTime(vr(26, 0.3), t1 + d);
      am.gain.value = 0.6; lg.gain.value = 0.4; lfo.connect(lg); lg.connect(am.gain); o.connect(am); am.connect(env);
      o.start(t1); lfo.start(t1); o.stop(t1 + d + 0.05); lfo.stop(t1 + d + 0.05);
      nz({ t: t1, f: [['bandpass', f * 0.9, 4, f1, d]], g: 0.15, a: 0.02, d, to: out });
      return;
    }
    nz({ t, f: [['bandpass', 2800, 6, 1400, 0.25]], g: 0.3, d: 0.25, to: out });
  };
  A.impact = function (pos, surface) {
    if (!ctx || smp('impact_' + (surface === 'wood' || surface === 'metal' ? surface : 'stone'), pos, 0.45, 1, 0.3) || !voice(0.2)) return;
    const t = ctx.currentTime, out = dest(pos, 0.3); out.gain.value = 0.45;
    if (surface === 'wood') { nz({ t, f: [['bandpass', 700, 2]], g: 0.5, d: 0.05, to: out }); tn({ t, f0: 220, f1: 120, d: 0.05, g: 0.2, to: out }); }
    else if (surface === 'metal') { nz({ t, f: [['bandpass', 2400, 5]], g: 0.4, d: 0.05, to: out }); tn({ t, f0: vr(1500, 0.1), d: 0.12, g: 0.06, to: out }); }
    else if (NEW()) {
      // (the new set) a bullet into stone: the crack of it and the stone's short hard knock (stone hardly rings), a puff of grit, and a
      // few chips falling after it
      out.gain.value *= NV.imp;
      strike(t, out, [[vr(950, 0.15), 0.26, 0.03], [vr(1750, 0.15), 0.16, 0.025], [vr(3100, 0.15), 0.07, 0.018]], { g: 0.22, hp: 1500, d: 0.002 });
      nz({ t: t + 0.003, buf: 'pink', f: [['bandpass', vr(2400, 0.2), 0.8]], g: 0.18, a: 0.003, d: vr(0.09, 0.3), to: out });
      const n = Math.floor(Math.random() * 4);
      if (n) { const at = [], lv = []; for (let i = 0; i < n; i++) { at.push(0.01 + Math.random() * 0.2); lv.push(0.3 + Math.random() * 0.7); } at.sort((a, b) => a - b); strike(t + 0.04, out, [[vr(2600, 0.2), 0.05, 0.02], [vr(4000, 0.2), 0.025, 0.015]], { at, lv }); }
    }
    else { nz({ t, f: [['bandpass', vr(1600, 0.2), 1.2]], g: 0.45, d: 0.04, to: out }); nz({ t: t + 0.01, buf: 'pink', f: [['lowpass', 2500]], g: 0.25, d: 0.08, to: out }); if (NEW()) for (let i = 0; i < 2; i++) nz({ t: t + 0.05 + Math.random() * 0.18, f: [['bandpass', vr(3200, 0.3), 4]], g: 0.05, d: 0.02, to: out }); } // (chips of stone falling)
  };
  A.explosion = function (pos, size) {
    if (!ctx) return;
    size = size || 1;
    if (smp('explosion', pos, Math.min(1.6, 0.8 + size * 0.3), 1.08 - Math.min(0.3, size * 0.1), 1.0)) return;
    const t = ctx.currentTime, out = dest(pos, 1.0); out.gain.value = Math.min(1.6, 0.8 + size * 0.3);
    smp('explosion_tail', pos, Math.min(1, 0.45 + size * 0.2), 1.05 - Math.min(0.25, size * 0.08), 0.8); // (under it, a recorded blast rolling away)
    tn({ t, f0: 75, f1: 28, d: 0.8 + size * 0.3, g: 1.0, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 1200, 0.6, 120, 1.2]], g: 1.0, a: 0.004, d: 1.0 + size * 0.4, to: out });
    nz({ t, f: [['lowpass', 5000, 0.5, 600, 0.3]], g: 0.6, d: 0.25, to: out });
    // debris crackles
    for (let i = 0; i < 10; i++) nz({ t: t + 0.08 + Math.random() * 0.6, f: [['bandpass', vr(2000, 0.5), 3]], g: 0.08, d: 0.03, to: out });
    if (NEW()) {
      // the pressure felt before it is heard, the crack of it, and what it threw up coming down again
      tn({ t, f0: 44, f1: 19, d: 1.1 + size * 0.4, g: 0.45, to: out, type: 'sine' });
      nz({ t, f: [['highpass', 2600]], g: 0.3, d: 0.018, to: out });
      for (let i = 0; i < 9 + Math.round(size * 3); i++) { const dl = 0.45 + Math.random() * (1.0 + size * 0.3); nz({ t: t + dl, buf: i % 3 ? 'white' : 'pink', f: [['bandpass', vr(i % 3 ? 3000 : 900, 0.4), i % 3 ? 4 : 1.5]], g: 0.05 + Math.random() * 0.05, d: 0.02 + Math.random() * 0.05, to: out }); }
      if (outdoor()) { const e = dest(pos, 1.0, dry); e.gain.value = 0.25; nz({ t: t + 0.26, buf: 'brown', f: [['lowpass', 700, 0.6, 150, 0.9]], g: 0.8, a: 0.03, d: 1.1, to: e }); }
    }
  };
  A.melee = function (hit) {
    if (!ctx) return;
    if (smp('swing', null, 0.6)) { if (hit) setTimeout(() => smp('melee_blunt', null, 0.8), 80); return; }
    const t = ctx.currentTime, out = dest(null, 0.2);
    nz({ t, buf: 'pink', f: [['bandpass', 500, 1, 1500, 0.15]], g: 0.4, a: 0.03, d: 0.12, to: out });
    if (hit) { tn({ t: t + 0.08, f0: 140, f1: 60, d: 0.1, g: 0.7, to: out, type: 'triangle' }); nz({ t: t + 0.08, buf: 'pink', f: [['lowpass', 1100]], g: 0.7, d: 0.1, to: out }); }
  };
  // melee weapon swing: blades whistle, blunt weapons whoosh low
  A.swing = function (heavy, mcat) {
    if (!ctx) return;
    const blade0 = mcat === 'blade' || mcat === 'knife' || mcat === 'scythe' || mcat === 'spear';
    if (smp('swing', null, heavy ? 0.9 : 0.6, mcat === 'blunt' || mcat === 'axe' ? 0.75 : heavy ? 0.85 : 1)) { if (blade0) smp('swing_blade', null, 0.35, heavy ? 0.9 : 1.05); return; }
    const t = ctx.currentTime, out = dest(null, 0.15); out.gain.value = heavy ? 0.9 : 0.6;
    const blade = mcat === 'blade' || mcat === 'knife' || mcat === 'scythe' || mcat === 'spear';
    const f0 = mcat === 'blunt' || mcat === 'axe' ? 380 : mcat === 'fist' ? 600 : 1100;
    nz({ t, buf: 'pink', f: [['bandpass', f0 * 0.6, 1.4, f0 * 1.8, heavy ? 0.22 : 0.12]], g: heavy ? 0.55 : 0.4, a: heavy ? 0.06 : 0.03, d: heavy ? 0.22 : 0.13, to: out });
    if (blade) nz({ t: t + 0.02, buf: 'white', f: [['bandpass', vr(3600, 0.1), 6]], g: 0.12, a: 0.03, d: 0.1, to: out });
  };
  // (the new set) under a recorded blow, the weight of it: the dull knock of a body struck (lower for a blunt weapon), a few takes kept
  const hitSets = {};
  function hitWeight(cut, heavy) {
    if (!NEW() || !voice(0.2)) return;
    const key = cut ? 'cut' : 'blunt', set = hitSets[key] || (hitSets[key] = []);
    let b = set.length >= 3 ? set[Math.floor(Math.random() * set.length)] : null;
    if (!b) {
      const sr = ctx.sampleRate, len = Math.round(0.12 * sr); b = ctx.createBuffer(2, len, sr); const L = b.getChannelData(0), R = b.getChannelData(1);
      knockIn(L, R, 0, cut ? 380 : 230, 1, 0, sr); knockIn(L, R, Math.round(0.004 * sr), cut ? 700 : 420, 0.5, 0, sr);
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(L[i])); for (let i = 0; i < len; i++) { L[i] /= pk || 1; R[i] /= pk || 1; }
      set.push(b);
    }
    const out = dest(null, 0.1), src = ctx.createBufferSource(); out.gain.value = (heavy ? 0.5 : 0.36) * (cut ? 0.7 : 1) * vr(1, 0.1); src.buffer = b; src.playbackRate.value = (heavy ? 0.88 : 1) * vr(1, 0.04); src.connect(out); src.start();
  }
  A.meleeHit = function (hit, mcat, heavy) {
    if (!ctx || !hit) return;
    const cut = mcat === 'blade' || mcat === 'knife' || mcat === 'scythe' || mcat === 'spear';
    // (a blade: the steel, and under it the blow landing on a body)
    if (smp(cut ? 'melee_slice' : 'melee_blunt', null, heavy ? 1.1 : 0.8, heavy ? 0.85 : 1)) { if (cut) smp('hit_flesh', null, heavy ? 0.8 : 0.55, heavy ? 0.85 : 0.95, 0.15); hitWeight(cut, heavy); return; }
    const t = ctx.currentTime, out = dest(null, 0.25); out.gain.value = heavy ? 1.1 : 0.8;
    if (mcat === 'blade' || mcat === 'knife' || mcat === 'scythe' || mcat === 'spear') {
      // wet slice: sharp transient + short squelch
      nz({ t, buf: 'white', f: [['highpass', 2500]], g: 0.35, d: 0.04, to: out });
      nz({ t: t + 0.01, buf: 'pink', f: [['bandpass', vr(900, 0.2), 2, 400, 0.1]], g: 0.5, a: 0.01, d: 0.12, to: out });
      tn({ t, f0: vr(5200, 0.1), f1: 4800, d: 0.18, g: 0.05, to: out });
    } else {
      // blunt: deep thud + crunch
      tn({ t, f0: heavy ? 110 : 150, f1: 45, d: heavy ? 0.22 : 0.12, g: 0.9, to: out, type: 'triangle' });
      nz({ t, buf: 'pink', f: [['lowpass', 900]], g: 0.7, d: 0.1, to: out });
      for (let i = 0; i < 3; i++) nz({ t: t + 0.01 + i * 0.012, f: [['bandpass', vr(2200, 0.4), 3]], g: 0.2, d: 0.012, to: out });
    }
    if (heavy) tn({ t, f0: 70, f1: 35, d: 0.3, g: 0.7, to: out });
  };
  A.throwG = function () {
    if (!ctx) return;
    if (smp('throw', null, 0.5)) { A.mech('click', 0, 0.6); return; }
    const t = ctx.currentTime, out = dest(null, 0.1);
    A.mech('click', 0, 0.6);
    nz({ t: t + 0.08, buf: 'pink', f: [['bandpass', 600, 1, 1600, 0.2]], g: 0.35, a: 0.04, d: 0.16, to: out });
  };
  A.bounce = function (pos, v) {
    if (!ctx || smp('bounce', pos, Math.min(1, v * 0.12), 1, 0.2) || !voice(0.1)) return;
    const t = ctx.currentTime, out = dest(pos, 0.2); out.gain.value = Math.min(1, v * 0.12);
    nz({ t, f: [['bandpass', 1300, 4]], g: 0.4, d: 0.04, to: out });
    tn({ t, f0: 300, f1: 200, d: 0.04, g: 0.2, to: out });
  };

  // ---------- player state ----------
  // ---------- the body, the hands, the interface (the new set) ----------
  // What happens to a body in gear, and what the hands do: weight and leather and iron, a breath - not tones. Each sound is written
  // into a buffer by its build(L, R, sr, at) (knockIn, ringIn, slideIn and the helpers here), a few takes of each kept and played in
  // turn, a little different each time. fxPlay: [key, how many takes, length (s), build, level, where (null: in the head), room, speed,
  // a last low-pass over the whole (Hz: so that nothing of it reaches far over 6 kHz)]
  const fxSets = {};
  // (priming: A.sndPrep asks the sounds below what they would write - the key, the takes, the build - without playing them: fxPlay then
  // only notes it and gives back a level that leads nowhere)
  let priming = null, primeOut = null;
  function fxPlay(key, n, secs, build, gain, pos, wet, rate, lp) {
    if (priming) { if (!priming.has(key)) priming.set(key, [key, n, secs, build, lp]); return primeOut || (primeOut = ctx.createGain()); }
    const set = fxSets[key] || (fxSets[key] = []);
    let b;
    if (set.length < n) {
      const sr = ctx.sampleRate; b = ctx.createBuffer(2, Math.max(1, Math.round(secs * sr)), sr);
      const L = b.getChannelData(0), R = b.getChannelData(1);
      build(L, R, sr, (s) => Math.round(s * sr));
      if (lp) for (const c of [L, R]) { bqRun(c, 'lp', lp, 0.7, sr); bqRun(c, 'lp', lp, 0.7, sr); }
      let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
      for (let i = 0; i < L.length; i++) { L[i] /= pk || 1; R[i] /= pk || 1; }
      set.push(b);
    } else b = set[Math.floor(Math.random() * set.length)];
    const out = dest(pos || null, wet === undefined ? 0.15 : wet), src = ctx.createBufferSource();
    out.gain.value = gain; src.buffer = b; src.playbackRate.value = rate || vr(1, 0.03); src.connect(out); src.start();
    return out;
  }
  // breath through a throat (noise through two formants): let out with effort (quick to rise, falling away), or drawn in (a slow swell)
  function breathIn(L, R, i0, d, g, out, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 0) return;
    const x = new Float32Array(n);
    for (let j = 0; j < n; j++) { const u = j / n, e = out ? Math.min(1, u / 0.08) * Math.pow(1 - u, 1.6) : Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 1.5); x[j] = (Math.random() * 2 - 1) * e; }
    const y = Float32Array.from(x);
    bqRun(x, 'bp', out ? vr(520, 0.15) : vr(700, 0.15), 2.2, sr); bqRun(y, 'bp', out ? vr(1150, 0.15) : vr(1500, 0.15), 3, sr);
    for (let j = 0; j < n; j++) { const v = (x[j] * 1.6 + y[j]) * g * 4; L[i0 + j] += v; R[i0 + j] += v; }
  }
  // the gear on a body jolted: buckles and plates ticking, leather and cloth shifting
  function gearIn(L, R, i0, g, sr) {
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) { const f = vr(1900, 0.3); ringIn(L, R, Math.min(L.length - 1, i0 + Math.round(Math.random() * 0.06 * sr)), [[f, 0.4, 0.04], [f * 1.63, 0.2, 0.03]], g * (0.4 + Math.random() * 0.6), 0.4, Math.random() * 1.2 - 0.6, sr); }
    slideIn(L, R, i0, 900, 500, 0.09, g * 0.9, 0, sr);
  }
  // the weight of a thing landing on a body or a body on the ground: a low tone sagging from f0 to f1 as it dies (tau s), driven -
  // its overtones (twice and three times it) carry it to small speakers, where the tone itself is not heard
  function lowIn(L, R, i0, f0, f1, tau, g, sr, rise) {
    const n = Math.min(L.length - i0, Math.round(tau * 6 * sr)); if (n <= 0) return;
    const kd = Math.exp(-1 / (tau * sr)), kf = Math.exp(-1 / (0.03 * sr)), a = Math.max(1, Math.round((rise || 0.0015) * sr)), td = ftanh(2);
    let ph = 0, e = 1, q = 1;
    for (let j = 0; j < n; j++) { ph += (2 * Math.PI * (f1 + (f0 - f1) * q)) / sr; q *= kf; const v = (g * ftanh(2 * Math.sin(ph))) / td * (j < a ? j / a : e); if (j >= a) e *= kd; L[i0 + j] += v; R[i0 + j] += v; }
  }
  // a short burst of noise under lp Hz (a body, a sole, earth), dying in d s
  function thudIn(L, R, i0, lp, d, g, sr) {
    const n = Math.min(L.length - i0, Math.round(d * 6 * sr)); if (n <= 0) return;
    const x = new Float32Array(n), te = d * sr, k = g * Math.sqrt(12000 / lp);
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * Math.min(1, j / (0.0008 * sr)) * Math.exp(-j / te);
    bqRun(x, 'lp', lp, 0.7, sr); bqRun(x, 'lp', lp, 0.7, sr);
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * k; R[i0 + j] += x[j] * k; }
  }
  // each sound's level (so that it stands as loud against the rest as the old one did)
  const BV = { hurt: 0.48, heal: 0.038, drink: 0.021, jump: 0.026, land: 0.62, ok: 0.165, level: 0.31, clear: 0.47, focus: 0.053, focusFull: 0.125, invOn: 0.17, invHum: 0.037, invTick: 0.19, invOff: 0.114,
    timeIn: 0.7, timeOut: 0.335, timeTick: 0.16, tick: 0.215, duel: 0.33 };
  // (a landing's level by what is underfoot and how far it fell: light, middling, heavy)
  const LANDG = { stone: [0.75, 0.85, 0.85], wood: [0.98, 0.93, 0.78], grass: [0.74, 0.76, 0.74], ice: [0.8, 0.9, 0.85], metal: [1, 1.3, 1.15] };
  const SN = {
    // struck: the blow landing on the body, flesh and cloth under it, the gear jolted, the breath knocked out (heavier, lower)
    hurt(amount) {
      const k = Math.min(1, 0.4 + amount / 40);
      fxPlay('hurt8', 5, 0.45, (L, R, sr, at) => {
        lowIn(L, R, 0, vr(100, 0.08), 55, 0.05, 0.55, sr); lowIn(L, R, 0, vr(270, 0.08), 165, 0.06, 0.65, sr);
        thudIn(L, R, 0, 520, 0.03, 1.3, sr); knockIn(L, R, 0, vr(230, 0.1), 1, 0, sr); knockIn(L, R, 0, vr(340, 0.1), 0.6, 0, sr);
        gearIn(L, R, at(0.015), 0.1, sr); breathIn(L, R, at(0.05), vr(0.18, 0.15), 0.12, true, sr);
      }, (0.75 + 0.25 * k) * BV.hurt, null, 0.1, (k > 0.8 ? 0.92 : 1) * vr(1, 0.04), 2500);
    },
    // mended: a long breath drawn in, the gear settling, the chest easing and the breath let out
    heal() {
      fxPlay('heal4', 3, 0.8, (L, R, sr, at) => {
        breathIn(L, R, 0, vr(0.5, 0.1), 0.8, false, sr); slideIn(L, R, at(0.05), 450, 260, 0.35, 1, 0, sr);
        thudIn(L, R, at(0.4), 500, 0.06, 0.9, sr); lowIn(L, R, at(0.4), vr(110, 0.08), 70, 0.08, 0.35, sr); breathIn(L, R, at(0.5), 0.24, 0.35, true, sr);
      }, BV.heal, null, 0.3, undefined, 4500);
    },
    // a draught: the flask's lip at the teeth, then gulps (each a wet knock and the throat's low swallow)
    drink() {
      fxPlay('drink', 3, 0.7, (L, R, sr, at) => {
        ringIn(L, R, 0, [[vr(2300, 0.1), 0.3, 0.05], [vr(3900, 0.1), 0.15, 0.04]], 0.3, 0.5, 0.2, sr);
        for (let i = 0; i < 4; i++) { const i0 = at(0.08 + i * vr(0.12, 0.1)); thudIn(L, R, i0, 700, 0.02, 0.6, sr); knockIn(L, R, i0 + at(0.01), vr(150, 0.1), 0.35, 0, sr); }
      }, BV.drink, null, 0.1);
    },
    // off the ground: the boot pushing off, the gear lifting, cloth through the air, a short breath
    jump() {
      fxPlay('jump', 4, 0.32, (L, R, sr, at) => {
        slideIn(L, R, 0, 700, 1100, 0.035, 0.6, 0, sr); thudIn(L, R, 0, 500, 0.008, 0.5, sr); gearIn(L, R, at(0.02), 0.3, sr);
        slideIn(L, R, at(0.03), 1500, 600, 0.14, 0.3, 0, sr); breathIn(L, R, at(0.01), 0.1, 0.25, true, sr);
      }, BV.jump, null, 0.1);
    },
    // down again (k 0..1: how far it fell): the body's weight, the soles on what is there - stone gritting, boards booming and creaking,
    // turf and earth, an iron plate ringing, ice crunching (and cracking under a heavy fall) - the gear clattering, a grunt from a high one
    land(k, s) {
      const b = k < 0.35 ? 0 : k < 0.7 ? 1 : 2, soft = s === 'grass';
      fxPlay('land7:' + s + b, 3, s === 'metal' ? 1.1 : 0.6, (L, R, sr, at) => {
        lowIn(L, R, 0, vr(110, 0.06), 45, 0.022 * (1 + 0.3 * b), 1 + 0.25 * b, sr);
        if (s !== 'metal') lowIn(L, R, 0, vr(260, 0.08), 180, 0.03 * (1 + 0.3 * b), 0.3 * (1 + 0.25 * b), sr);
        thudIn(L, R, 0, soft ? 700 : 1100, 0.012, 0.7 * (1 + 0.25 * b), sr);
        // (the floor and the room booming on under it a little while, as the old landing did)
        thudIn(L, R, at(0.01), 130, 0.13 + 0.04 * b, 0.13 + 0.07 * b, sr);
        if (s === 'stone' || s === 'ice') for (let i = 0; i < 6 + b * 4; i++) ringIn(L, R, at(0.004 + Math.random() * 0.08), [[vr(3200, 0.3), 0.2, 0.012]], 0.07, 0.4, Math.random() - 0.5, sr);
        if (s === 'wood') { ringIn(L, R, 0, [[vr(170, 0.08), 0.6, 0.16], [vr(410, 0.08), 0.4, 0.12], [vr(890, 0.08), 0.15, 0.08]], 0.4, 0.2, 0, sr); slideIn(L, R, at(0.06), 600, 420, 0.1, 0.06, 0, sr); }
        if (s === 'metal') { const f0 = vr(300, 0.1); ringIn(L, R, at(0.002), [[f0, 0.5, 0.85], [f0 * 1.59, 0.4, 0.65], [f0 * 2.14, 0.3, 0.5], [f0 * 2.83, 0.2, 0.35], [f0 * 3.61, 0.12, 0.25]], [0.55, 1.3, 2.6][b], 0.2, 0, sr); }
        if (s === 'ice') { for (let i = 0; i < 4 + b * 3; i++) ringIn(L, R, at(Math.random() * 0.05), [[vr(3600, 0.3), 0.3, 0.03]], 0.1, 0.4, Math.random() - 0.5, sr); if (b === 2) iceCrackIn(L, R, at(0.01), 0.3, 0, sr); }
        if (soft) slideIn(L, R, at(0.004), 3000, 2200, 0.1, 0.07, 0, sr);
        gearIn(L, R, at(0.006), 0.1 + 0.06 * b, sr);
        if (b === 2) breathIn(L, R, at(0.04), 0.18, 0.15, true, sr);
      }, BV.land * [0.55, 0.8, 1][b] * (LANDG[s] || LANDG.stone)[b], null, 0.25, undefined, 7000);
    },
    // the interface. Done: an iron latch closing firmly on its keeper
    ok() { fxPlay('ui:ok2', 3, 0.25, (L, R, sr, at) => { knockIn(L, R, 0, vr(420, 0.08), 0.8, 0, sr); ringIn(L, R, 0, [[vr(1150, 0.05), 0.4, 0.06], [vr(2500, 0.05), 0.2, 0.04]], 0.5, 0.2, 0, sr); knockIn(L, R, at(0.03), vr(700, 0.08), 0.4, 0, sr); }, BV.ok, null, 0.08, undefined, 5000); },
    // risen in strength: a hammer on an anvil, twice, the old iron ringing low after it
    level() {
      fxPlay('ui:level4', 2, 1.5, (L, R, sr, at) => {
        for (const [tt, g] of [[0, 1], [0.2, 0.75]]) { lowIn(L, R, at(tt), vr(120, 0.05), 70, 0.07, g * 0.45, sr); knockIn(L, R, at(tt), vr(300, 0.05), g, 0, sr); ringIn(L, R, at(tt), [[vr(310, 0.03), 0.8, 1], [vr(620, 0.03), 0.45, 0.7], [vr(1430, 0.03), 0.25, 0.5], [vr(2410, 0.03), 0.1, 0.35]], g * 0.7, 0.2, 0, sr); }
      }, BV.level, null, 0.25, undefined, 4000);
    },
    // a place cleared: a great stone settling into its bed, and deep iron ringing a long while under it
    clear() {
      fxPlay('ui:clear2', 1, 2.2, (L, R, sr, at) => {
        lowIn(L, R, 0, 70, 42, 0.35, 1.1, sr); knockIn(L, R, 0, 90, 1, 0, sr); slideIn(L, R, 0, 320, 200, 0.6, 0.5, 0, sr); thudIn(L, R, 0, 400, 0.05, 0.8, sr);
        ringIn(L, R, at(0.02), [[180, 0.5, 1.8], [412, 0.35, 1.4], [757, 0.2, 1], [1190, 0.08, 0.6]], 0.8, 0.1, 0, sr);
      }, BV.clear, null, 0.4, undefined, 4000);
    },
    // a working gathering in the hands: an iron ratchet ticking one notch higher each time; full, a heavy catch locking and ringing
    focus(k) {
      if (k < 4) fxPlay('focus' + Math.min(3, Math.max(0, k | 0)), 2, 0.12, (L, R, sr) => { knockIn(L, R, 0, 600 + k * 70, 0.5, 0, sr); const f = 1400 + k * 160; ringIn(L, R, 0, [[f, 0.4, 0.03], [f * 1.7, 0.2, 0.02]], 0.6, 0.5, 0, sr); }, BV.focus, null, 0.05, 1);
      else fxPlay('focusFull', 2, 0.5, (L, R, sr) => { knockIn(L, R, 0, vr(380, 0.05), 0.9, 0, sr); ringIn(L, R, 0, [[vr(700, 0.03), 0.5, 0.3], [vr(1650, 0.03), 0.4, 0.22], [vr(2900, 0.03), 0.2, 0.14]], 0.8, 0.5, 0, sr); }, BV.focusFull, null, 0.05);
    },
    // warded: old bronze struck soft and humming low under the hand; ticking dully as it runs down; let go with a scrape and a clank
    invulnOn() { fxPlay('invOn2', 2, 1.2, (L, R, sr, at) => { knockIn(L, R, 0, vr(250, 0.05), 0.8, 0, sr); ringIn(L, R, 0, [[vr(262, 0.03), 0.5, 0.9], [vr(620, 0.03), 0.4, 0.8], [vr(1100, 0.03), 0.25, 0.6], [vr(1750, 0.03), 0.1, 0.4]], 0.8, 0, 0, sr); breathIn(L, R, at(0.02), 0.4, 0.2, false, sr); }, BV.invOn, null, 0.6, undefined, 3500); },
    invulnHum() { fxPlay('invHum', 2, 0.45, (L, R, sr) => ringIn(L, R, 0, [[vr(262, 0.03), 0.4, 0.4], [vr(620, 0.03), 0.25, 0.35]], 0.6, 0, 0, sr), BV.invHum, null, 0.5); },
    invulnTick(k) { fxPlay('invTick' + Math.round(k * 3), 2, 0.12, (L, R, sr) => { knockIn(L, R, 0, 500 + k * 400, 0.6, 0, sr); ringIn(L, R, 0, [[1200 + k * 600, 0.3, 0.04]], 0.4, 0.4, 0, sr); }, BV.invTick * (0.8 + 0.4 * k), null, 0.3, 1); },
    invulnOff() { fxPlay('invOff2', 2, 0.5, (L, R, sr, at) => { slideIn(L, R, 0, 1400, 700, 0.18, 0.4, 0, sr); knockIn(L, R, at(0.16), vr(320, 0.05), 0.7, 0, sr); ringIn(L, R, at(0.16), [[vr(500, 0.03), 0.3, 0.2], [vr(1200, 0.03), 0.2, 0.15]], 0.5, 0, 0, sr); }, BV.invOff, null, 0.5, undefined, 3500); },
    // time held back: heavy gears catching and grinding down; let go, they run free; while held, a clock's escapement ticks slow
    timeIn(k) {
      const g = 0.55 + 0.45 * k;
      fxPlay('timeIn2', 2, 1.3, (L, R, sr, at) => { slideIn(L, R, 0, 900, 280, 0.7, 0.5, 0, sr); for (const [tt, f, v] of [[0, 260, 1], [0.12, 210, 0.8], [0.3, 160, 0.9], [0.62, 120, 0.7]]) { knockIn(L, R, at(tt), f, v, 0, sr); ringIn(L, R, at(tt), [[f * 2.3, 0.3, 0.12], [f * 4.1, 0.15, 0.08]], v * 0.5, 0.1, 0, sr); } }, BV.timeIn * g, null, 0.7, undefined, 4000);
      if (k >= 0.8) A.bell();
    },
    timeOut(k) { fxPlay('timeOut2', 2, 0.7, (L, R, sr, at) => { lowIn(L, R, 0, 50, 75, 0.15, 0.7, sr); slideIn(L, R, 0, 300, 1100, 0.5, 0.35, 0, sr); lowIn(L, R, at(0.45), 85, 48, 0.07, 1, sr); knockIn(L, R, at(0.45), vr(260, 0.05), 0.7, 0, sr); ringIn(L, R, at(0.45), [[600, 0.3, 0.12], [1380, 0.2, 0.08]], 0.4, 0.1, 0, sr); }, BV.timeOut * (0.5 + 0.4 * k), null, 0.6, undefined, 4000); },
    timeTick(k) { fxPlay('timeTick2', 3, 0.2, (L, R, sr, at) => { knockIn(L, R, 0, vr(1100, 0.05), 0.5, 0, sr); ringIn(L, R, 0, [[vr(2300, 0.05), 0.3, 0.05], [vr(3700, 0.05), 0.15, 0.03]], 0.4, 0.3, 0, sr); lowIn(L, R, at(0.01), 150, 95, 0.03, 0.9, sr); knockIn(L, R, at(0.01), vr(140, 0.05), 0.6, 0, sr); }, BV.timeTick * (0.5 + 0.4 * k), null, 0.35); },
    // a pendulum clock: tick and tock, the urgent one higher and harder, the last seconds a slow deep tock
    tick(lvl, sec) {
      const f = lvl === 2 ? 500 : lvl === 1 ? 1200 : 900, up = lvl === 1 ? (1200 + (5 - (sec || 5)) * 80) / 1200 : 1;
      fxPlay('tock' + lvl, 3, 0.15, (L, R, sr) => { knockIn(L, R, 0, f, 0.7, 0, sr); knockIn(L, R, 0, f * 0.28, 0.35, 0, sr); ringIn(L, R, 0, [[f * 2.3, 0.3, 0.04], [f * 3.9, 0.12, 0.025]], 0.5, 0.5, 0, sr); }, BV.tick * (lvl === 2 ? 0.6 : lvl === 1 ? 3.8 : 0.9), null, 0.05, up);
    },
    // a duel's turn passing: one short strike of a hammer on iron (two, quick, when the turn is yours)
    duelTurn(mine) {
      fxPlay('duelT' + (mine ? 1 : 0), 2, 0.5, (L, R, sr, at) => {
        for (const tt of mine ? [0, 0.11] : [0]) { knockIn(L, R, at(tt), vr(mine ? 420 : 340, 0.04), 0.9, 0, sr); ringIn(L, R, at(tt), [[vr(mine ? 980 : 800, 0.02), 0.5, 0.3], [vr(mine ? 2260 : 1840, 0.02), 0.35, 0.22], [vr(mine ? 3800 : 3100, 0.02), 0.12, 0.12]], 0.7, 0.6, 0, sr); }
      }, BV.duel, null, 0.2, undefined, 6000);
    },
  };
  A.hurt = function (amount) {
    if (!ctx || smp('hurt', null, Math.min(1, 0.4 + amount / 40), 1, 0.1)) return;
    if (NEW()) { SN.hurt(amount); return; }
    const t = ctx.currentTime, out = dest(null, 0.1);
    const k = Math.min(1, 0.4 + amount / 40);
    out.gain.value = k;
    tn({ t, f0: 120, f1: 50, d: 0.18, g: 0.9, to: out, type: 'triangle', lp: 260 });
    nz({ t, buf: 'pink', f: [['lowpass', 600]], g: 0.8, d: 0.12, to: out });
    // breath/grunt-ish exhale
    nz({ t: t + 0.03, buf: 'pink', f: [['bandpass', 700, 2.5, 450, 0.25], ['bandpass', 1100, 1.2]], g: 0.45, a: 0.02, d: 0.25, to: out });
  };
  A.heartbeat = function (strength) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0); out.gain.value = 0.6 * strength;
    tn({ t, f0: 60, f1: 40, d: 0.12, g: 0.9, to: out, lp: 150 });
    tn({ t: t + 0.18, f0: 55, f1: 38, d: 0.1, g: 0.6, to: out, lp: 150 });
  };
  A.heal = function () {
    if (!ctx || smp('heal', null, 0.5, 1, 0.4)) return;
    if (NEW()) { SN.heal(); return; }
    const t = ctx.currentTime, out = dest(null, 0.4); out.gain.value = 0.5;
    nz({ t, buf: 'pink', f: [['bandpass', 500, 1, 1800, 0.5]], g: 0.3, a: 0.15, d: 0.4, to: out });
    nz({ t: t + 0.05, f: [['bandpass', 1200, 3]], g: 0.15, a: 0.05, d: 0.25, to: out }); // liquid
    tn({ t, f0: 330, f1: 440, d: 0.5, g: 0.05, to: out });
  };
  A.drink = function () {
    if (!ctx) return;
    // (an item in the hands has sounds of its own for its whole use, the swallows of a draught among them: the old gulp, laid over them
    // at the moment it takes effect, is not)
    if (NEW() && A._use) return;
    if (NEW()) { SN.drink(); return; }
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.5;
    for (let i = 0; i < 4; i++) nz({ t: t + i * 0.12, f: [['bandpass', vr(700, 0.2), 4, 400, 0.08]], g: 0.4, d: 0.08, to: out });
  };
  A.death = function () {
    if (!ctx) return;
    if (A._use) A.useEnd(A._use, true);   // (what the hands were doing is cut short with the life)
    const t = ctx.currentTime, out = dest(null, 0.9);
    tn({ t, f0: 90, f1: 25, d: 2.2, g: 0.8, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 600, 0.7, 80, 2]], g: 0.9, a: 0.05, d: 2.2, to: out });
  };

  // ---------- an item in use (itemanim.js): what the hands make of it, stage by stage ----------
  // A use's motion goes by stages (itemanim.js PLAN; IA.stages gives them in seconds, the quickening of a perk in them). Each stage has
  // sounds of its own: linen drawn off a roll and wound on, a canvas kit's stud and flap, a cork twisted and drawn, swallows, teeth in
  // an apple, a steel plate pushed home into its carrier. Each is a take written into a buffer (mono: the hands are in front of the
  // face) by the parts below and the ones above (knockIn, ringIn, thudIn, lowIn, breathIn), a couple of takes of each, never two of
  // a row alike. They are laid on the moments of the stages by the game's own clock, a frame ahead (A.useTick); a use put down cuts
  // them off in a few hundredths of a second, and nothing of it comes after (A.useEnd). Nothing in them reaches far over 5 kHz.
  // (a band-pass whose middle moves, f0 to f1 Hz (exponentially), at q: a state-variable filter run over an array in place, its peak
  // brought to 0 dB)
  function svfRun(x, f0, f1, q, sr) {
    const n = x.length, r = Math.pow(f1 / f0, 1 / Math.max(1, n - 1)), dq = 1 / q, top = sr * 0.16;
    let f = f0, lo = 0, bp = 0;
    for (let i = 0; i < n; i++) { const k = 2 * Math.sin((Math.PI * Math.min(f, top)) / sr); lo += k * bp; const hi = x[i] - lo - dq * bp; bp += k * hi; x[i] = bp * dq; f *= r; }
    return x;
  }
  // (what a band of noise f wide at q keeps of white noise: its level brought back up by this)
  const bandK = (f, q, sr) => Math.sqrt((sr * q) / (Math.PI * f));
  // cloth, skin and canvas worked against each other: noise in a band moving from f0 to f1, a swell over d s (its top at o.a, 0..1),
  // its level jagged (fibres catching: o.grain, 0..1), and o.cr times a second a fibre or a fold giving with a tick
  function rubIn(L, R, i0, d, f0, f1, q, g, o, sr) {
    o = o || {};
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 8) return;
    const x = work(4, n), a = o.a === undefined ? 0.4 : o.a, gr = o.grain === undefined ? 0.5 : o.grain, cr = (o.cr || 0) / sr, st = Math.max(1, Math.round(sr * 0.0015)), kd = Math.exp(-1 / (0.0003 * sr));
    let s = 1, tk = 0;
    for (let j = 0; j < n; j++) {
      if (j % st === 0) s += (1 - gr + gr * 4 * Math.random() * Math.random() - s) * 0.6;
      if (cr && Math.random() < cr) tk += (1.5 + 3 * Math.random()) * (o.crg || 1);
      const u = j / n, e = u < a ? u / a : Math.pow((1 - u) / (1 - a), 1.3);
      x[j] = (Math.random() * 2 - 1) * e * (Math.max(0, s) + tk); tk *= kd;
    }
    svfRun(x, f0, f1, q, sr);
    const k = g * bandK(Math.sqrt(f0 * f1), q, sr) * 0.6;
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * k; R[i0 + j] += x[j] * k; }
  }
  // crackling - fibres tearing, a crust breaking under teeth, a thin tube crumpling: ticks r0 going to r1 a second over d s, each a few
  // tenths of a ms of noise, their sizes uneven (most small, a few big), through a band at f
  function crackIn(L, R, i0, d, r0, r1, f, q, g, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 8) return;
    const x = work(5, n), kd = Math.exp(-1 / (0.00025 * sr));
    let tk = 0;
    for (let j = 0; j < n; j++) { const u = j / n; if (Math.random() < (r0 + (r1 - r0) * u) / sr) tk += Math.pow(Math.random(), 2.2) * 2 + 0.15; x[j] = (Math.random() * 2 - 1) * tk; tk *= kd; }
    svfRun(x, f, f, q, sr);
    const k = g * bandK(f, q, sr) * 0.5;
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * k; R[i0 + j] += x[j] * k; }
  }
  // a creak: a thing held against another slipping in jerks (a cork in its neck, a strap, a rubber plunger in its glass) - a pulse at
  // each slip, p0 going to p1 a second, never quite even, each ringing a body at f (and at 1.8 f)
  function creakIn(L, R, i0, d, p0, p1, f, q, g, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 8) return;
    const x = work(5, n), y = work(6, n);
    let ph = Math.random();
    for (let j = 0; j < n; j++) { const u = j / n; ph += (p0 * Math.pow(p1 / p0, u)) / sr; if (ph >= 1) { ph -= 1 + (Math.random() - 0.5) * 0.35; const v = Math.pow(Math.sin(Math.PI * u), 0.5) * (0.5 + Math.random() * 0.5); x[j] = v; y[j] = v; } }
    svfRun(x, f, f, q, sr); svfRun(y, f * 1.8, f * 1.8, q * 1.2, sr);
    const k = g * q * 0.9;
    for (let j = 0; j < n; j++) { const v = (x[j] + 0.5 * y[j]) * k; L[i0 + j] += v; R[i0 + j] += v; }
  }
  // a bubble in a liquid: a short tone rising as it forms and closes (a bloop), dying in d s
  function bubIn(L, R, i0, f0, d, g, sr) {
    const n = Math.min(L.length - i0, Math.round(d * 4 * sr)); if (n <= 0) return;
    let ph = Math.random() * 6.283;
    for (let j = 0; j < n; j++) { const t = j / sr; ph += (2 * Math.PI * f0 * (1 + 0.9 * (1 - Math.exp(-t / (d * 0.8))))) / sr; const v = g * Math.sin(ph) * Math.min(1, t / 0.0015) * Math.exp(-t / d); L[i0 + j] += v; R[i0 + j] += v; }
  }
  // (things struck that come into these: thin glass, a brass stud, a nickel cap, a steel plate held in the hands - each [Hz, level, s])
  const GLS = () => [[vr(2100, 0.1), 0.3, 0.06], [vr(3400, 0.1), 0.15, 0.04]];
  const PLT = (t60) => [[vr(420, 0.06), 0.4, t60 * 1.5], [vr(1010, 0.06), 0.3, t60 * 1.2], [vr(1730, 0.06), 0.2, t60], [vr(2650, 0.06), 0.1, t60 * 0.8]];
  // the takes: key -> [how many takes, length (s), build(X, sr, at), a last low-pass (Hz)]. X is written twice (as the left and the
  // right of the parts): it is one channel
  const UT = {};
  const ut = (key, n, secs, lp, build) => { UT[key] = [n, secs, build, lp]; };
  // the other things the hands do: a sleeve and the arm in it moving (lowered, raised), a gloved hand shifting its grip
  ut('u:sleeve', 3, 0.45, 4000, (X, sr, at) => { rubIn(X, X, 0, vr(0.34, 0.1), vr(700, 0.1), vr(480, 0.1), 1.1, 0.5, { a: 0.35, grain: 0.6, cr: 25 }, sr); rubIn(X, X, at(0.05), 0.2, 1500, 1200, 1.6, 0.12, { a: 0.5, grain: 0.7 }, sr); if (Math.random() < 0.5) gearIn(X, X, at(0.1), 0.05, sr); });
  ut('u:cloth', 3, 0.22, 4500, (X, sr, at) => { rubIn(X, X, 0, vr(0.16, 0.15), vr(1100, 0.1), vr(1300, 0.1), 1.3, 0.4, { a: 0.4, grain: 0.6, cr: 40 }, sr); thudIn(X, X, at(0.01), 900, 0.01, 0.25, sr); });
  // the bandage (a linen roll): taken up; its end drawn off (the cloth tearing a little from the roll), twice; wound on four times, each
  // turn tighter (over the top of the arm quick and bright, under it slower, the roll's layers parting as it turns, the last of a turn
  // drawn snug); the end pressed down twice
  ut('u:band:draw', 2, 0.5, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.38, 800, 1200, 1.1, 0.5, { a: 0.3, cr: 30 }, sr); rubIn(X, X, at(0.1), 0.14, 1700, 1400, 1.8, 0.35, { a: 0.4, grain: 0.7, cr: 60 }, sr); thudIn(X, X, at(0.12), 800, 0.012, 0.35, sr); });
  ut('u:band:pull0', 2, 0.32, 4500, (X, sr, at) => { rubIn(X, X, 0, vr(0.22, 0.1), 1300, 2100, 1.4, 0.5, { a: 0.6, grain: 0.8, cr: 180 }, sr); crackIn(X, X, at(vr(0.1, 0.15)), 0.12, 300, 900, 2200, 1.2, 0.35, sr); });
  ut('u:band:pull1', 2, 0.2, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.12, 1500, 2000, 1.4, 0.4, { a: 0.5, grain: 0.8, cr: 150 }, sr); crackIn(X, X, at(0.03), 0.06, 200, 400, 2000, 1.2, 0.15, sr); });
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    ut('u:band:wind' + i, 2, 0.5, 4500, (X, sr, at) => {
      rubIn(X, X, 0, vr(0.2, 0.1), vr(1000 + 150 * k, 0.08), vr(1400 + 200 * k, 0.08), 1.2 + 0.6 * k, 0.55 + 0.1 * k, { a: 0.45, grain: 0.6, cr: 60 + 60 * k }, sr);
      rubIn(X, X, at(0.17), vr(0.28, 0.1), 800 + 100 * k, 650 + 100 * k, 1.1 + 0.4 * k, 0.3 + 0.05 * k, { a: 0.4, grain: 0.5, cr: 40 + 30 * k }, sr);
      crackIn(X, X, at(0.02), 0.4, 70, 50, 1800, 1, 0.12, sr);
      if (i) rubIn(X, X, at(0.36), 0.08, 1100 + 200 * k, 1300 + 200 * k, 3 + 2 * k, 0.2 * k, { a: 0.3, grain: 0.9 }, sr);
    });
  }
  for (let i = 0; i < 2; i++) ut('u:band:pat' + i, 2, 0.22, 3500, (X, sr, at) => { thudIn(X, X, 0, vr(750 + 100 * i, 0.1), 0.018 - 0.004 * i, 0.9 - 0.2 * i, sr); lowIn(X, X, 0, vr(170 + 20 * i, 0.1), 120 + 10 * i, 0.025 - 0.005 * i, 0.25 - 0.1 * i, sr); rubIn(X, X, 0, 0.06, 1200 + 100 * i, 900 + 100 * i, 1.2, 0.25, { a: 0.2, grain: 0.6, cr: 80 }, sr); });
  // the kit (a canvas pouch on a leather strap, a brass stud on its flap; linen, paper, a glass phial and the syrette in it): brought up;
  // the stud undone; the flap thrown back and flopping over; the hand in it, digging, the syrette out of its loop; the needle in and a
  // breath through the teeth; the syrette's tin tube squeezed flat; out, and the breath let go; the kit lowered
  ut('u:kit:draw', 2, 0.55, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.36, 650, 950, 1, 0.5, { a: 0.35, grain: 0.6, cr: 20 }, sr); creakIn(X, X, at(0.08), 0.16, 70, 120, 650, 5, 0.3, sr); ringIn(X, X, at(vr(0.2, 0.15)), GLS(), 0.12, 0.2, 0, sr); thudIn(X, X, at(0.22), 500, 0.02, 0.45, sr); knockIn(X, X, at(0.2), vr(700, 0.1), 0.12, 0, sr); });
  ut('u:kit:stud', 2, 0.25, 4800, (X, sr, at) => { rubIn(X, X, 0, 0.07, 1000, 1400, 1.4, 0.3, { a: 0.7, grain: 0.7 }, sr); knockIn(X, X, at(0.06), vr(1500, 0.08), 0.8, 0, sr); ringIn(X, X, at(0.06), [[vr(2500, 0.06), 0.4, 0.03], [vr(3900, 0.06), 0.2, 0.02]], 0.35, 0.5, 0, sr); thudIn(X, X, at(0.065), 1200, 0.006, 0.4, sr); });
  ut('u:kit:flap', 2, 0.3, 4000, (X, sr) => rubIn(X, X, 0, vr(0.2, 0.1), 700, 1100, 1, 0.45, { a: 0.5, grain: 0.5, cr: 15 }, sr));
  ut('u:kit:flop', 2, 0.2, 4000, (X, sr) => { thudIn(X, X, 0, 900, 0.012, 0.6, sr); rubIn(X, X, 0, 0.08, 900, 700, 1.1, 0.3, { a: 0.15 }, sr); lowIn(X, X, 0, 220, 160, 0.02, 0.15, sr); });
  ut('u:kit:dig', 2, 0.5, 4800, (X, sr, at) => { rubIn(X, X, 0, 0.4, 900, 1300, 1, 0.4, { a: 0.5, grain: 0.7, cr: 40 }, sr); crackIn(X, X, at(0.08), 0.25, 80, 140, 2000, 0.9, 0.25, sr); ringIn(X, X, at(vr(0.22, 0.2)), GLS(), 0.25, 0.5, 0, sr); ringIn(X, X, at(vr(0.32, 0.1)), GLS(), 0.1, 0.4, 0, sr); });
  ut('u:kit:out', 2, 0.25, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.12, 1400, 1900, 1.5, 0.4, { a: 0.7, grain: 0.7, cr: 60 }, sr); knockIn(X, X, at(0.11), 1200, 0.25, 0, sr); ringIn(X, X, at(0.11), [[vr(2900, 0.08), 0.2, 0.03]], 0.1, 0.3, 0, sr); });
  ut('u:kit:squeeze', 2, 0.5, 4500, (X, sr, at) => { crackIn(X, X, 0, 0.42, 90, 30, 1700, 1.3, 0.5, sr); creakIn(X, X, at(0.02), 0.38, 35, 25, 800, 4, 0.25, sr); rubIn(X, X, 0, 0.4, 500, 400, 1.5, 0.12, { a: 0.3, grain: 0.8 }, sr); });
  ut('u:kit:lower', 2, 0.5, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.3, 900, 650, 1, 0.45, { a: 0.4, grain: 0.6, cr: 20 }, sr); creakIn(X, X, at(0.1), 0.12, 110, 70, 650, 5, 0.25, sr); ringIn(X, X, at(vr(0.25, 0.15)), GLS(), 0.08, 0.2, 0, sr); thudIn(X, X, at(0.3), 500, 0.02, 0.3, sr); });
  // (both doses: the needle into the skin and a breath drawn sharp through the teeth; drawn out, and the breath let go)
  ut('u:jab', 2, 0.45, 4000, (X, sr, at) => { thudIn(X, X, 0, 600, 0.008, 0.35, sr); knockIn(X, X, 0, vr(320, 0.1), 0.25, 0, sr); breathIn(X, X, at(0.02), vr(0.26, 0.1), 0.55, false, sr); });
  ut('u:out', 2, 0.42, 4000, (X, sr, at) => { rubIn(X, X, 0, 0.04, 1600, 1400, 2, 0.25, { a: 0.3 }, sr); breathIn(X, X, at(0.04), vr(0.32, 0.1), 0.5, true, sr); });
  // the syringe (glass, a rubber plunger, a nickel cap on its needle): taken up; the cap into the other fist and pulled off (a squeak,
  // a tick), let fall and landing on the floor (a little tube of metal, bouncing, rolling); in; the plunger dragging down its glass and
  // bottoming; out; tossed aside (the air) and landing on the floor, glass and metal, bouncing and rolling away
  ut('u:syr:draw', 2, 0.3, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.2, 900, 1300, 1.2, 0.4, { cr: 30 }, sr); ringIn(X, X, at(0.14), [[vr(2600, 0.1), 0.25, 0.04], [vr(4100, 0.1), 0.12, 0.03]], 0.12, 0.3, 0, sr); thudIn(X, X, at(0.14), 900, 0.008, 0.25, sr); });
  ut('u:syr:grip', 2, 0.12, 4500, (X, sr) => { thudIn(X, X, 0, 900, 0.008, 0.4, sr); rubIn(X, X, 0, 0.06, 1400, 1200, 1.4, 0.25, { a: 0.3 }, sr); });
  ut('u:syr:cap', 2, 0.2, 4800, (X, sr, at) => { creakIn(X, X, 0, 0.07, 260, 180, 2300, 8, 0.35, sr); knockIn(X, X, at(0.065), vr(1700, 0.08), 0.4, 0, sr); ringIn(X, X, at(0.065), [[vr(2800, 0.06), 0.3, 0.05], [vr(4400, 0.06), 0.15, 0.03]], 0.25, 0.4, 0, sr); });
  ut('u:syr:capland', 2, 0.55, 4500, (X, sr, at) => {
    for (const [tt, gb] of [[0, 1], [vr(0.09, 0.15), 0.45], [vr(0.15, 0.1), 0.2]]) { ringIn(X, X, at(tt), [[vr(2700, 0.08), 0.35, 0.07], [vr(4300, 0.08), 0.2, 0.05], [vr(1500, 0.1), 0.15, 0.05]], gb, 0.6, 0, sr); knockIn(X, X, at(tt), 1200, gb * 0.3, 0, sr); }
    crackIn(X, X, at(0.18), 0.25, 60, 20, 3000, 2, 0.06, sr);
  });
  ut('u:syr:push', 2, 0.5, 4500, (X, sr, at) => { creakIn(X, X, 0, 0.44, 95, 55, 1150, 6, 0.35, sr); rubIn(X, X, 0, 0.44, 1200, 1000, 3, 0.12, { a: 0.4, grain: 0.5 }, sr); ringIn(X, X, at(0.02), [[vr(1700, 0.05), 0.15, 0.3]], 0.05, 0, 0, sr); });
  ut('u:syr:home', 2, 0.15, 4500, (X, sr) => { knockIn(X, X, 0, vr(950, 0.08), 0.5, 0, sr); ringIn(X, X, 0, [[vr(2300, 0.05), 0.25, 0.04], [vr(3600, 0.05), 0.12, 0.03]], 0.2, 0.3, 0, sr); });
  ut('u:syr:toss', 2, 0.2, 3500, (X, sr) => rubIn(X, X, 0, 0.14, 500, 900, 0.9, 0.3, { a: 0.6, grain: 0.2 }, sr));
  ut('u:syr:land', 2, 0.7, 4800, (X, sr, at) => {
    for (const [tt, gb] of [[0, 0.9], [vr(0.11, 0.15), 0.4], [vr(0.18, 0.1), 0.2]]) { ringIn(X, X, at(tt), [[vr(2100, 0.1), 0.4, 0.09], [vr(3300, 0.1), 0.3, 0.06], [vr(5000, 0.1), 0.12, 0.04]], gb, 0.6, 0, sr); knockIn(X, X, at(tt), 900, gb * 0.3, 0, sr); }
    crackIn(X, X, at(0.2), 0.35, 50, 15, 2600, 2, 0.07, sr); rubIn(X, X, at(0.2), 0.35, 2400, 2000, 3, 0.03, { a: 0.2, grain: 0.8 }, sr);
  });
  // a draught (a corked vessel of glass or stoneware): taken from the belt, the glass knocking, the liquid in it moving; the cork twisted
  // (it squeaks in its neck, one way and back), drawn (a creak rising) and out (a low pop, the air after it); tipped up (the liquid going
  // over, the lip at the mouth); three swallows, each a glug in the vessel and the throat's swallow under it, each a little different; down
  ut('u:drk:draw', 2, 0.55, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.3, 800, 1200, 1.1, 0.35, { cr: 25 }, sr); ringIn(X, X, at(0.12), [[vr(1800, 0.1), 0.25, 0.06], [vr(3100, 0.1), 0.15, 0.04]], 0.15, 0.3, 0, sr); rubIn(X, X, at(0.1), 0.3, 350, 650, 1.6, 0.3, { a: 0.3, grain: 0.9 }, sr); bubIn(X, X, at(vr(0.18, 0.1)), vr(380, 0.15), 0.025, 0.25, sr); bubIn(X, X, at(vr(0.27, 0.1)), vr(300, 0.15), 0.03, 0.2, sr); });
  for (let i = 0; i < 2; i++) ut('u:drk:tw' + i, 2, 0.16, 4800, (X, sr) => { creakIn(X, X, 0, vr(0.12, 0.1), vr(i ? 90 : 70, 0.15), vr(i ? 60 : 120, 0.15), vr(i ? 1250 : 1400, 0.1), 7, 0.5, sr); rubIn(X, X, 0, 0.1, 1800, 1600, 2.5, 0.08, { a: 0.5, grain: 0.9 }, sr); });
  ut('u:drk:pull', 2, 0.12, 4800, (X, sr) => creakIn(X, X, 0, 0.08, 110, 200, 1500, 6, 0.35, sr));
  ut('u:drk:pop', 2, 0.3, 4500, (X, sr, at) => { lowIn(X, X, 0, vr(520, 0.08), 360, 0.018, 0.8, sr); knockIn(X, X, 0, vr(600, 0.1), 0.5, 0, sr); thudIn(X, X, 0, 1500, 0.004, 0.4, sr); rubIn(X, X, at(0.005), 0.05, 2200, 1800, 1.2, 0.1, { a: 0.1 }, sr); bubIn(X, X, at(0.06), vr(420, 0.1), 0.02, 0.15, sr); });
  ut('u:drk:raise', 2, 0.45, 4000, (X, sr, at) => { rubIn(X, X, 0, 0.35, 300, 600, 1.5, 0.35, { a: 0.5, grain: 0.9 }, sr); bubIn(X, X, at(vr(0.15, 0.2)), vr(340, 0.15), 0.03, 0.2, sr); });
  ut('u:drk:lip', 2, 0.12, 4500, (X, sr) => { ringIn(X, X, 0, [[vr(2000, 0.08), 0.2, 0.04], [vr(3300, 0.08), 0.1, 0.03]], 0.12, 0.3, 0, sr); thudIn(X, X, 0, 900, 0.005, 0.2, sr); });
  for (let i = 0; i < 3; i++) {
    ut('u:drk:g' + i, 2, 0.42, 3500, (X, sr, at) => {
      bubIn(X, X, 0, vr(260 + 25 * i, 0.1), 0.035, 0.7, sr); bubIn(X, X, at(vr(0.05, 0.2)), vr(330 - 20 * i, 0.12), 0.03, 0.45, sr); if (i === 1) bubIn(X, X, at(vr(0.08, 0.2)), vr(240, 0.12), 0.03, 0.35, sr);
      rubIn(X, X, 0, 0.14, 400, 700, 1.4, 0.25, { a: 0.3, grain: 0.9 }, sr);
      lowIn(X, X, at(0.11 + 0.01 * i), vr(140, 0.08), 85, 0.035, 0.7, sr); knockIn(X, X, at(0.1 + 0.01 * i), vr(420, 0.1), 0.35, 0, sr); thudIn(X, X, at(0.1 + 0.01 * i), 450, 0.02, 0.4, sr);
      if (i === 2) breathIn(X, X, at(0.24), 0.14, 0.2, true, sr);
    });
  }
  ut('u:drk:lower', 2, 0.55, 4000, (X, sr, at) => { rubIn(X, X, 0, 0.3, 700, 500, 1.1, 0.3, { a: 0.4, cr: 20 }, sr); rubIn(X, X, at(0.06), 0.25, 330, 550, 1.6, 0.25, { a: 0.4, grain: 0.9 }, sr); bubIn(X, X, at(vr(0.2, 0.15)), vr(300, 0.1), 0.03, 0.2, sr); ringIn(X, X, at(0.32), [[vr(1800, 0.1), 0.2, 0.05], [vr(3000, 0.1), 0.1, 0.03]], 0.08, 0.3, 0, sr); });
  // food: taken from the pouch; three bites, each the teeth going in, the bite torn away and chewed - a golden apple (a hard skin
  // snapping and its flesh crunching, juicy), a troll's heart (wet meat giving, sinew drawn out and tearing), herbs (leaves crushed, a
  // stalk snapping); down, and swallowed
  ut('u:eat:draw', 2, 0.4, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.3, 800, 1200, 1.1, 0.4, { cr: 25 }, sr); thudIn(X, X, at(0.12), 700, 0.012, 0.3, sr); });
  for (let i = 0; i < 3; i++) {
    const c3 = [vr(0.18, 0.1), vr(0.26, 0.08), vr(0.34, 0.06)];
    ut('u:eat:apple' + i, 2, 0.48, 4000, (X, sr, at) => {
      crackIn(X, X, 0, 0.05, 2500, 900, i ? 2200 : 2600, 0.9, 0.9 - 0.1 * i, sr); knockIn(X, X, 0, vr(i ? 900 : 1100, 0.1), 0.4 - 0.1 * i, 0, sr); thudIn(X, X, 0, 1800, 0.006, 0.4, sr);
      crackIn(X, X, at(0.03), 0.12, 700, 150, 2000, 1, 0.45, sr); rubIn(X, X, at(0.03), 0.1, 1400, 1100, 1.6, 0.2, { a: 0.3, grain: 0.9 }, sr);
      c3.forEach((tt, c) => { crackIn(X, X, at(tt), 0.05, 900, 200, 1300, 1, 0.25 * (1 - 0.2 * c), sr); lowIn(X, X, at(tt), 130, 90, 0.02, 0.25, sr); });
    });
    ut('u:eat:heart' + i, 2, 0.48, 3500, (X, sr, at) => {
      rubIn(X, X, 0, 0.14, 450, 750, 1.2, 0.8, { a: 0.25, grain: 1, cr: 120 }, sr); thudIn(X, X, 0, 700, 0.015, 0.6, sr); lowIn(X, X, 0, vr(150, 0.1), 100, 0.03, 0.3, sr);
      crackIn(X, X, at(0.05), 0.12, 250, 80, 900, 1.5, 0.35, sr); creakIn(X, X, at(0.05), 0.1, 40, 25, 600, 3, 0.2, sr);
      c3.forEach((tt) => { rubIn(X, X, at(tt), 0.07, 500, 400, 1.3, 0.3, { a: 0.4, grain: 1, cr: 80 }, sr); lowIn(X, X, at(tt), 120, 85, 0.02, 0.2, sr); });
    });
    ut('u:eat:herb' + i, 2, 0.48, 4200, (X, sr, at) => {
      crackIn(X, X, 0, 0.06, 1500, 600, 3000, 0.8, 0.35, sr); knockIn(X, X, at(0.01), vr(1500, 0.1), 0.3, 0, sr); ringIn(X, X, at(0.01), [[vr(1900, 0.1), 0.2, 0.015]], 0.1, 0.3, 0, sr);
      crackIn(X, X, at(0.04), 0.12, 400, 100, 2400, 1, 0.25, sr); rubIn(X, X, at(0.04), 0.1, 2000, 1800, 1.5, 0.1, { a: 0.3, grain: 0.8 }, sr);
      c3.forEach((tt) => { crackIn(X, X, at(tt), 0.05, 500, 150, 1600, 1, 0.15, sr); lowIn(X, X, at(tt), 140, 95, 0.015, 0.15, sr); });
    });
  }
  ut('u:eat:lower', 2, 0.5, 3500, (X, sr, at) => { lowIn(X, X, 0, vr(135, 0.08), 85, 0.035, 0.6, sr); knockIn(X, X, 0, vr(400, 0.1), 0.3, 0, sr); thudIn(X, X, 0, 450, 0.02, 0.35, sr); rubIn(X, X, at(0.12), 0.3, 700, 500, 1.1, 0.25, { cr: 20 }, sr); });
  // the plate (forged steel, slid into a carrier on the chest): drawn out of its pouch, the steel ringing a little in the hand; turned
  // over and back (a glove on its edge); to the chest; its edge into the carrier; pushed down twice (sliding, and stopping on the
  // straps); home; patted twice, steel under canvas
  ut('u:plt:draw', 2, 0.5, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.3, 1000, 750, 1.3, 0.55, { a: 0.5, grain: 0.6, cr: 40 }, sr); ringIn(X, X, at(0.28), PLT(0.1), 0.3, 0.2, 0, sr); knockIn(X, X, at(0.28), vr(380, 0.1), 0.4, 0, sr); thudIn(X, X, at(0.29), 700, 0.01, 0.3, sr); });
  for (let i = 0; i < 2; i++) ut('u:plt:turn' + i, 2, 0.25, 4500, (X, sr, at) => { rubIn(X, X, 0, 0.14, 1300 + 150 * i, 1600, 2, 0.3, { a: 0.5, grain: 0.8, cr: 60 }, sr); ringIn(X, X, at(0.1), PLT(0.05), 0.1, 0.1, 0, sr); thudIn(X, X, at(0.1), 900, 0.006, 0.2, sr); });
  ut('u:plt:chest', 2, 0.4, 4000, (X, sr, at) => { rubIn(X, X, 0, 0.3, 700, 1000, 1, 0.45, { a: 0.6, cr: 30 }, sr); gearIn(X, X, at(0.25), 0.1, sr); });
  ut('u:plt:slip', 2, 0.3, 4500, (X, sr) => { rubIn(X, X, 0, 0.18, 1100, 900, 1.6, 0.5, { a: 0.3, grain: 0.8, cr: 80 }, sr); knockIn(X, X, 0, vr(650, 0.1), 0.35, 0, sr); ringIn(X, X, 0, PLT(0.05), 0.12, 0.2, 0, sr); });
  for (let i = 0; i < 2; i++) {
    ut('u:plt:push' + i, 2, 0.25, 4500, (X, sr) => rubIn(X, X, 0, vr(0.2, 0.1), 900 - 50 * i, 600 - 50 * i, 1.4, 0.55, { a: 0.85, grain: 0.6, cr: 50 }, sr));
    ut('u:plt:stop' + i, 2, 0.3, 4000, (X, sr) => { knockIn(X, X, 0, vr(280 - 30 * i, 0.08), 0.9, 0, sr); lowIn(X, X, 0, vr(120 - 10 * i, 0.08), 80, 0.04, 0.5, sr); thudIn(X, X, 0, 600, 0.02, 0.6, sr); ringIn(X, X, 0, PLT(0.08), 0.2, 0.1, 0, sr); });
    ut('u:plt:pat' + i, 2, 0.3, 4000, (X, sr) => { knockIn(X, X, 0, vr(330 + 30 * i, 0.08), 0.8 - 0.1 * i, 0, sr); ringIn(X, X, 0, [[vr(440, 0.05), 0.3, 0.09], [vr(1050, 0.05), 0.25, 0.07], [vr(1800, 0.05), 0.12, 0.05]], 0.3, 0.2, 0, sr); thudIn(X, X, 0, 700, 0.015, 0.5, sr); rubIn(X, X, 0, 0.05, 1100, 900, 1.2, 0.2, { a: 0.2 }, sr); });
  }
  ut('u:plt:seat', 2, 0.4, 3500, (X, sr, at) => { lowIn(X, X, 0, vr(100, 0.06), 62, 0.05, 0.6, sr); knockIn(X, X, 0, vr(230, 0.08), 0.7, 0, sr); thudIn(X, X, 0, 450, 0.025, 0.5, sr); creakIn(X, X, at(0.02), 0.12, 50, 35, 700, 4, 0.2, sr); });
  // a tool or a token worked in the hand
  ut('u:dev:use', 2, 0.3, 4500, (X, sr, at) => { knockIn(X, X, 0, vr(800, 0.1), 0.5, 0, sr); ringIn(X, X, 0, [[vr(1500, 0.08), 0.3, 0.05], [vr(2600, 0.08), 0.15, 0.03]], 0.2, 0.3, 0, sr); rubIn(X, X, at(0.03), 0.12, 1200, 1000, 1.4, 0.3, { cr: 40 }, sr); });
  // the sounds of a use on its stages: [s, take, { max: cut off after (s), floor: on the floor ahead and to the right }]. st is
  // IA.stages(id): { plan, dur, apply, stages: [[name, s], ...] }. What follows another of its own line is cut where that one begins
  const FOOD = { h_apple: 'apple', h_troll: 'heart' };
  function useCues(id, st) {
    const S = {}, d = st.dur, C = [];
    for (const [nm, s] of st.stages) S[nm] = s;
    const q = (t, k, o) => C.push(Object.assign({ t: Math.max(0, t), k }, o));
    // (a line of them, each cut where the next begins: ts holds one moment more than keys, where the last of them is cut)
    const line = (ts, keys) => keys.forEach((k, i) => q(ts[i], k, { max: ts[i + 1] - ts[i] }));
    switch (st.plan) {
      case 'bandage': {
        const pull2 = S.unwind + 0.62 * (S.wind - S.unwind);
        q(0, 'u:band:draw'); line([S.unwind, pull2, S.wind], ['u:band:pull0', 'u:band:pull1']);
        line([S.wind, S.turn2, S.turn3, S.turn4, S.pin], ['u:band:wind0', 'u:band:wind1', 'u:band:wind2', 'u:band:wind3']);
        line([S.pin, S.press2, S.lower], ['u:band:pat0', 'u:band:pat1']); q(S.lower, 'u:sleeve');
        break;
      }
      case 'kit': {
        const flop = S.takeOut - 0.03 * d, out = S.takeOut + 0.07 * d;
        q(0, 'u:kit:draw'); q(S.reach, 'u:cloth'); q(S.unclasp, 'u:kit:stud'); q(S.open, 'u:kit:flap', { max: flop - S.open }); q(flop, 'u:kit:flop');
        line([S.takeOut, out], ['u:kit:dig']); q(out, 'u:kit:out'); q(S.ready, 'u:cloth');
        q(S.jab, 'u:jab'); line([S.squeeze, S.out], ['u:kit:squeeze']); q(S.out, 'u:out'); q(S.away, 'u:cloth'); q(S.lower, 'u:kit:lower');
        break;
      }
      case 'syringe': {
        const home = S.out - 0.02 * d;
        q(0, 'u:syr:draw'); q(S.uncap, 'u:syr:grip'); q(S.capOff, 'u:syr:cap'); q(S.aim, 'u:cloth');
        q(S.capDrop + 0.5, 'u:syr:capland', { floor: 1.6 }); q(S.jab, 'u:jab'); line([S.push, home], ['u:syr:push']); q(home, 'u:syr:home');
        q(S.out, 'u:out'); q(S.toss, 'u:syr:toss'); q(S.toss + 0.05 * d + 0.6, 'u:syr:land', { floor: 2.2 }); q(S.lower, 'u:sleeve');
        break;
      }
      case 'drink': {
        const tw2 = S.twist + 0.5 * (S.pop - S.twist), give = S.pop + 0.55 * (S.away - S.pop);
        q(0, 'u:drk:draw'); q(S.reach, 'u:cloth'); line([S.twist, tw2, S.pop], ['u:drk:tw0', 'u:drk:tw1']);
        line([S.pop, give], ['u:drk:pull']); q(give, 'u:drk:pop'); q(S.away, 'u:cloth'); q(S.raise, 'u:drk:raise', { max: S.gulp1 - 0.01 * d - S.raise });
        q(S.gulp1 - 0.01 * d, 'u:drk:lip'); line([S.gulp1, S.gulp2, S.gulp3, S.lower], ['u:drk:g0', 'u:drk:g1', 'u:drk:g2']); q(S.lower, 'u:drk:lower');
        break;
      }
      case 'eat': {
        const f = FOOD[id] || 'herb';
        q(0, 'u:eat:draw'); q(S.raise, 'u:cloth');
        line([S.bite1, S.bite2, S.bite3, S.lower], ['u:eat:' + f + '0', 'u:eat:' + f + '1', 'u:eat:' + f + '2']); q(S.lower, 'u:eat:lower');
        break;
      }
      case 'plate': {
        const s1 = S.push1 + 0.06 * d, s2 = S.push2 + 0.06 * d;
        q(0, 'u:plt:draw'); line([S.look, S.look + 0.09 * d, S.insert], ['u:plt:turn0', 'u:plt:turn1']); q(S.insert, 'u:plt:chest', { max: S.slip - S.insert });
        q(S.slip, 'u:plt:slip', { max: S.push1 - S.slip }); line([S.push1, s1], ['u:plt:push0']); q(s1, 'u:plt:stop0'); line([S.push2, s2], ['u:plt:push1']); q(s2, 'u:plt:stop1');
        q(S.seat, 'u:plt:seat'); line([S.pat1, S.pat2, S.lower], ['u:plt:pat0', 'u:plt:pat1']); q(S.lower, 'u:sleeve');
        break;
      }
      // (a tool: up, worked, turned over in the hand a while, down)
      default: q(0, 'u:cloth'); if (S.use !== undefined) { q(S.use, 'u:dev:use'); q(S.use + 0.2 * d, 'u:cloth'); q(S.use + 0.38 * d, 'u:cloth'); } if (S.lower !== undefined) q(S.lower, 'u:sleeve');
    }
    return C.sort((a, b) => a.t - b.t);
  }
  // (a take of one of them: made the first times it is asked for, then one of those that is not the last one played)
  const useSets = {};
  A.useStats = { made: 0, ms: 0, worst: 0, by: {}, bytes: 0 };
  function useTake(k, fresh) {
    const D = UT[k]; if (!D) return null;
    const set = useSets[k] || (useSets[k] = []);
    if (set.length >= D[0]) { if (fresh) return null; let i = Math.floor(Math.random() * set.length); if (set.length > 1 && i === set.last) i = (i + 1) % set.length; set.last = i; return set[i]; }
    const t0 = performance.now(), sr = ctx.sampleRate, b = ctx.createBuffer(1, Math.max(1, Math.round(D[1] * sr)), sr), X = b.getChannelData(0);
    D[2](X, sr, (s) => Math.round(s * sr));
    if (D[3]) { bqRun(X, 'lp', D[3], 0.7, sr); bqRun(X, 'lp', D[3], 0.7, sr); }
    // (brought to one loudness by its loudest 100 ms, not by its peak: a take with one big tick in it is not left the quieter for it)
    const w = Math.round(0.1 * sr), hop = Math.round(0.01 * sr); let e = 0, top = 0;
    for (let i = 0; i < X.length; i++) { e += X[i] * X[i]; if (i >= w) e -= X[i - w] * X[i - w]; if (i % hop === 0 || i === X.length - 1) top = Math.max(top, e / Math.min(w, i + 1)); }
    const fo = Math.min(X.length, Math.round(0.01 * sr)), kn = 0.25 / (Math.sqrt(top) || 1);   // (its last 10 ms brought down to nothing: no take ends on a click)
    for (let i = 0; i < X.length; i++) X[i] *= kn * Math.min(1, (X.length - i) / fo);
    set.push(b); set.last = set.length - 1;
    const ms = performance.now() - t0; A.useStats.made++; A.useStats.ms += ms; A.useStats.worst = Math.max(A.useStats.worst, ms); A.useStats.by[k] = Math.max(A.useStats.by[k] || 0, ms); A.useStats.bytes += X.length * 4;
    return b;
  }
  // (every take made in the time the page has to spare, from when the sound starts: none is made in the middle of a use)
  let usePrepQ = null;
  A.usePrep = function () {
    if (!ctx || usePrepQ) return;
    usePrepQ = []; for (const k in UT) for (let i = 0; i < UT[k][0]; i++) usePrepQ.push(k);
    const run = (dl) => {
      const t0 = performance.now();
      while (usePrepQ.length) { useTake(usePrepQ.shift(), true); if (!dl || dl.timeRemaining() < 4 || performance.now() - t0 > 8) break; }
      if (usePrepQ.length) later();
    };
    const later = () => { if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 30); };
    later();
  };
  // (begun a few seconds after the sound itself starts - at the title, or as a run is first made - in the time the page has to spare)
  { const init0 = A.init; A.init = function () { const had = !!ctx; init0.apply(this, arguments); if (!had && ctx) setTimeout(() => A.usePrep(), 3000); }; }
  // each take's level: a hand's work, some 5 dB under a walking step on stone at the most (its K-weighted loudness), the small things of
  // it (a glove shifting, a sleeve) further under
  const UL = { 'u:sleeve': 0.0116, 'u:cloth': 0.0098, 'u:band:draw': 0.0149, 'u:band:pull0': 0.0214, 'u:band:pull1': 0.0192, 'u:band:wind0': 0.0173, 'u:band:wind1': 0.0185, 'u:band:wind2': 0.0192, 'u:band:wind3': 0.0237, 'u:band:pat0': 0.0687, 'u:band:pat1': 0.0552, 'u:kit:draw': 0.0168, 'u:kit:stud': 0.0289, 'u:kit:flap': 0.0173, 'u:kit:flop': 0.0475, 'u:kit:dig': 0.0171, 'u:kit:out': 0.0161, 'u:jab': 0.0185, 'u:kit:squeeze': 0.0204, 'u:out': 0.0187, 'u:kit:lower': 0.0165, 'u:syr:draw': 0.0169, 'u:syr:grip': 0.0255, 'u:syr:cap': 0.0241, 'u:syr:capland': 0.0408, 'u:syr:push': 0.018, 'u:syr:home': 0.0609, 'u:syr:toss': 0.0151, 'u:syr:land': 0.0508, 'u:drk:draw': 0.0171, 'u:drk:tw0': 0.0226, 'u:drk:tw1': 0.0224, 'u:drk:pull': 0.0268, 'u:drk:pop': 0.0802, 'u:drk:raise': 0.0188, 'u:drk:lip': 0.0532, 'u:drk:g0': 0.0371, 'u:drk:g1': 0.0344, 'u:drk:g2': 0.0329, 'u:drk:lower': 0.017, 'u:eat:draw': 0.016, 'u:eat:apple0': 0.0518, 'u:eat:apple1': 0.0445, 'u:eat:apple2': 0.0359, 'u:eat:heart0': 0.0416, 'u:eat:heart1': 0.0374, 'u:eat:heart2': 0.0358, 'u:eat:herb0': 0.0402, 'u:eat:herb1': 0.0397, 'u:eat:herb2': 0.0353, 'u:eat:lower': 0.0513, 'u:plt:draw': 0.0197, 'u:plt:turn0': 0.015, 'u:plt:turn1': 0.0148, 'u:plt:chest': 0.0162, 'u:plt:slip': 0.0245, 'u:plt:push0': 0.0246, 'u:plt:push1': 0.0256, 'u:plt:stop0': 0.062, 'u:plt:stop1': 0.0692, 'u:plt:seat': 0.0668, 'u:plt:pat0': 0.0809, 'u:plt:pat1': 0.0694, 'u:dev:use': 0.0482 };
  function useFire(h, c, when) {
    const b = useTake(c.k); if (!b) return;
    let pos = null;
    if (c.floor) { const w = 0.6 + (A.listenerYawNeg || 0), Lz = A.listener; pos = { x: Lz.x + Math.sin(w) * c.floor * 0.7, y: Lz.y - 1.5, z: Lz.z - Math.cos(w) * c.floor * 0.7 }; }
    const out = dest(pos, c.floor ? 0.3 : 0.1), src = ctx.createBufferSource(), g = out.gain.value * (UL[c.k] || 0.03), rate = vr(1, 0.02);
    out.gain.value = g; src.buffer = b; src.playbackRate.value = rate; src.connect(out); src.start(when);
    let until = when + b.duration / rate;
    if (c.max && c.max < b.duration / rate) { const e = when + Math.max(0.03, c.max); out.gain.setValueAtTime(g, Math.max(when, e - 0.04)); out.gain.linearRampToValueAtTime(0, e); src.stop(e + 0.005); until = e; }
    h.live.push({ out, src, when, until });
  }
  // a use begins (itemanim.js IA.play): its sounds, from the stages of its motion. null in the old set of sounds (it keeps its old ones)
  A.useBegin = function (id, st) {
    if (!ctx || !NEW() || !st || !st.stages) return null;
    if (A._use) A.useEnd(A._use, true);
    A.usePrep();
    const h = { id, cues: useCues(id, st), i: 0, t: 0, live: [], end: false };
    A._use = h; A.useTick(h, 0, 0);
    return h;
  };
  // the use's own clock (t s since it began; dt the frame's): what falls due in the next tenth of a second is laid on its moment now. The takes
  // of what is coming are made a little ahead, one a frame, if they are not made already
  A.useTick = function (h, t, dt) {
    if (!h || h.end || !ctx) return;
    h.t = t;
    const now = ctx.currentTime, look = 0.1;   // (a tenth of a second ahead: a long frame next does not leave a sound late)
    while (h.i < h.cues.length && h.cues[h.i].t <= t + look) { const c = h.cues[h.i++]; useFire(h, c, now + Math.max(0, c.t - t)); }
    for (let j = h.i; j < h.cues.length && h.cues[j].t <= t + 0.6; j++) { const D = UT[h.cues[j].k]; if (D && (useSets[h.cues[j].k] || []).length < 1) { useTake(h.cues[j].k, true); break; } }
    if (h.live.length > 12) h.live = h.live.filter((q) => q.until > now);
  };
  // a use over: done in full (what comes after it - a thing tossed landing - still comes, on its moment), or cut short (cut: put down,
  // struck out of the hands, the hands wanted for something else, death) - all of it brought down to nothing in 60 ms, and none to come
  A.useEnd = function (h, cut) {
    if (!h || h.end) return;
    h.end = true; if (A._use === h) A._use = null;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!cut) { for (; h.i < h.cues.length; h.i++) { const c = h.cues[h.i]; useFire(h, c, now + Math.max(0, c.t - h.t)); } return; }
    for (const q of h.live) {
      if (q.until <= now) continue;
      try {
        const gp = q.out.gain;
        if (q.when >= now) { gp.cancelScheduledValues(0); gp.value = 0; q.src.stop(now); continue; }
        gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now); gp.linearRampToValueAtTime(0, now + 0.06); q.src.stop(now + 0.07);
      } catch (e) { /* already stopped */ }
    }
    h.live = [];
  };
  // (for the sound page and the tools: the sounds a use would have, without playing them)
  A.useCues = (id, st) => useCues(id, st).map((c) => ({ t: c.t, k: c.k, g: UL[c.k] || 0.03, max: c.max || 0, floor: c.floor || 0 }));
  A.useLevels = UL;

  // ---------- monsters ----------
  // kinds: growl, snarl, screech, roar, hiss, chitter, groan, gurgle, wail, rumble, buzz
  A.monster = function (pos, kind, pitch, vol) {
    if (!ctx) return;
    if (kind === 'machine') { A.plantFoe(pos, 'mIdle'); return; }   // (the plant's crawler has no voice: a servo, see A.plantFoe)
    pitch = pitch || 1; vol = vol || 1;
    if (smp('mon_' + kind, pos, 0.75 * vol, pitch, 0.45)) return;
    if (!voice(1)) return;
    const t = ctx.currentTime, out = dest(pos, 0.45); out.gain.value *= 0.75 * vol;
    if (NEW() && (kind === 'wail' || kind === 'gurgle' || kind === 'slosh')) {
      out.gain.value *= NV[kind];
      if (kind === 'wail') {
        // (the new set) the dead keening: a hollow voice, much breath in it, rising and falling away; its vowel opening from oo to ah
        // and closing again, a second voice a little off it
        const f = vr(250, 0.1) * pitch, d = vr(1.15, 0.15), sp = Math.sqrt(pitch);
        throat(t, out, { d, g: 0.5, a: 0.22, p: [[0, f * 0.82], [vr(0.28, 0.2), f * 1.06], [0.6, f * vr(0.98, 0.04)], [1, f * vr(0.68, 0.1)]],
          fm: [[0, [330 * sp, 820 * sp, 2400 * sp]], [0.45, [vr(720, 0.1) * sp, vr(1150, 0.1) * sp, 2550 * sp]], [1, [380 * sp, 860 * sp, 2300 * sp]]],
          q: [6, 7, 9], fg: [1, 0.55, 0.18], breath: 0.6, vib: [5.2, 0.025], rough: 0.25, det: vr(14, 0.3) });
      } else if (kind === 'gurgle') {
        // (the new set) a thick liquid working in a throat: bloops (a bubble forming in it - a low note that climbs as it closes), never
        // evenly spaced, over a wet churn
        let tt = t + 0.01;
        for (let i = 0, n = 4 + Math.floor(Math.random() * 4); i < n; i++) { const f = vr(240, 0.35) * pitch; tn({ t: tt, f0: f, f1: f * vr(1.9, 0.2), fd: vr(0.05, 0.3), a: 0.006, d: vr(0.08, 0.3), g: vr(0.45, 0.35), to: out, type: 'sine' }); tt += vr(0.07, 0.5); }
        scrape(t, out, vr(420, 0.15) * pitch, vr(260, 0.15) * pitch, tt - t + 0.05, 0.5, { buf: 'pink', q: 2.2, rough: 0.9 });
      } else {
        // (the new set) a slime dragging itself: a wet squelch (thick, so low and uneven), the sticky snap of it parting from the
        // floor, now and then a bloop
        scrape(t, out, vr(700, 0.2) * pitch, vr(300, 0.2) * pitch, vr(0.3, 0.2), 0.9, { buf: 'pink', q: 2, rough: 0.85 });
        const at = [], lv = []; let a0 = vr(0.06, 0.4);
        for (let i = 0, k = 1 + Math.floor(Math.random() * 3); i < k; i++) { at.push(a0); lv.push(vr(0.7, 0.4)); a0 += vr(0.07, 0.5); }
        strike(t, out, [[vr(1250, 0.2) * pitch, 0.12, 0.035], [vr(2100, 0.2) * pitch, 0.06, 0.025]], { at, lv, d: 0.005 });
        if (Math.random() < 0.7) { const f = vr(170, 0.3) * pitch; tn({ t: t + vr(0.12, 0.4), f0: f, f1: f * 1.8, fd: 0.06, a: 0.008, d: 0.1, g: 0.35, to: out, type: 'sine' }); }
      }
      return;
    }
    const vox = (f, d, g, formants, type) => {
      // saw/noise source shaped by formant filters
      const osc = ctx.createOscillator(); osc.type = type || 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * vr(0.85, 0.1), t + d);
      const lfo = ctx.createOscillator(); lfo.frequency.value = vr(18, 0.3);
      const lg = ctx.createGain(); lg.gain.value = f * 0.12; lfo.connect(lg); lg.connect(osc.frequency);
      const mix = ctx.createGain(); mix.gain.value = 1;
      osc.connect(mix);
      const n = ctx.createBufferSource(); n.buffer = pink; const ng = ctx.createGain(); ng.gain.value = 0.9; n.connect(ng); ng.connect(mix);
      const g2 = envGain(t, d * 0.25, g, d * 0.75, out);
      for (const fm of formants) { const bq = ctx.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = fm[0] * pitch; bq.Q.value = fm[1]; const fg = ctx.createGain(); fg.gain.value = fm[2]; mix.connect(bq); bq.connect(fg); fg.connect(g2); }
      osc.start(t); lfo.start(t); n.start(t, Math.random()); osc.stop(t + d + 0.1); lfo.stop(t + d + 0.1); n.stop(t + d + 0.1);
    };
    switch (kind) {
      case 'growl': vox(vr(70, 0.15) * pitch, vr(0.6, 0.2), 0.5, [[300, 3, 1], [700, 4, 0.6], [1200, 5, 0.25]]); break;
      case 'snarl': vox(vr(110, 0.15) * pitch, 0.35, 0.55, [[500, 3, 1], [1100, 4, 0.5]]); nz({ t, buf: 'pink', f: [['bandpass', 1800 * pitch, 2]], g: 0.2, a: 0.05, d: 0.3, to: out }); break;
      case 'screech': vox(vr(420, 0.1) * pitch, 0.4, 0.3, [[1400, 6, 0.7], [2600, 7, 0.4]], 'square'); break;
      case 'roar': vox(vr(55, 0.1) * pitch, 1.3, 0.8, [[220, 2.5, 1], [520, 3, 0.8], [900, 4, 0.4]]); nz({ t, buf: 'brown', f: [['lowpass', 500]], g: 0.5, a: 0.2, d: 1.1, to: out }); break;
      case 'hiss': nz({ t, f: [['bandpass', 3500 * pitch, 1.5]], g: 0.35, a: 0.05, d: 0.5, to: out }); break;
      case 'chitter': for (let i = 0; i < 7; i++) nz({ t: t + i * 0.045, f: [['bandpass', vr(2200, 0.2) * pitch, 6]], g: 0.25, d: 0.025, to: out }); break;
      case 'groan': vox(vr(85, 0.1) * pitch, 1.0, 0.45, [[350, 4, 1], [600, 5, 0.5]], 'triangle'); break;
      case 'wail': vox(vr(260, 0.1) * pitch, 1.1, 0.25, [[800, 5, 1], [1300, 6, 0.4]], 'triangle'); break;
      case 'gurgle': for (let i = 0; i < 5; i++) nz({ t: t + i * 0.07, f: [['bandpass', vr(400, 0.3) * pitch, 5, 200, 0.06]], g: 0.4, d: 0.07, to: out }); break;
      case 'rumble': nz({ t, buf: 'brown', f: [['lowpass', 300 * pitch]], g: 0.8, a: 0.2, d: 1.0, to: out }); tn({ t, f0: 45, f1: 35, d: 1.0, g: 0.5, to: out }); break;
      case 'buzz': vox(vr(140, 0.05) * pitch, 0.5, 0.2, [[900, 3, 1]], 'sawtooth'); break;
      case 'slosh': nz({ t, buf: 'pink', f: [['bandpass', 500 * pitch, 2, 250, 0.3]], g: 0.6, a: 0.03, d: 0.3, to: out }); break;
    }
  };
  // a thing of bones coming apart
  A.bones = function (pos, vol) { if (ctx) smp('bones', pos, vol || 0.8, 1, 0.3); };
  A.monsterDie = function (pos, kind, pitch) {
    if (!ctx) return;
    if (kind === 'machine') { A.plantFoe(pos, 'mDie'); return; }
    if (smp('mon_die', pos, 0.7, (pitch || 1) * 0.9, 0.4)) { const t = ctx.currentTime, out = dest(pos, 0.3); tn({ t: t + 0.2, f0: 90, f1: 40, d: 0.2, g: 0.4, to: out, type: 'triangle' }); return; }
    A.monster(pos, kind === 'chitter' ? 'hiss' : kind === 'slosh' ? 'gurgle' : 'groan', (pitch || 1) * 0.9, 0.9);
    const t = ctx.currentTime, out = dest(pos, 0.3);
    tn({ t: t + 0.2, f0: 90, f1: 40, d: 0.2, g: 0.4, to: out, type: 'triangle' });
    nz({ t: t + 0.2, buf: 'pink', f: [['lowpass', 700]], g: 0.4, d: 0.2, to: out });
  };
  A.attackWind = function (pos, big) {
    if (!ctx || smp('attack_wind', pos, big ? 0.9 : 0.5, big ? 0.8 : 1, 0.2) || !voice(0.4)) return;
    const t = ctx.currentTime, out = dest(pos, 0.2); out.gain.value = big ? 0.9 : 0.5;
    nz({ t, buf: 'pink', f: [['bandpass', big ? 300 : 700, 1, big ? 900 : 2000, 0.3]], g: 0.5, a: 0.15, d: 0.2, to: out });
  };
  A.spit = function (pos) {
    if (!ctx || smp('spit', pos, 0.6, 1, 0.25) || !voice(0.3)) return;
    const t = ctx.currentTime, out = dest(pos, 0.25);
    nz({ t, f: [['bandpass', 900, 2, 400, 0.15]], g: 0.5, d: 0.15, to: out });
    tn({ t, f0: 200, f1: 90, d: 0.1, g: 0.2, to: out });
  };
  A.magic = function (pos, kind) {
    if (!ctx || smp('magic', pos, 0.6, kind === 'dark' ? 0.7 : 1, 0.6) || !voice(0.6)) return;
    const t = ctx.currentTime, out = dest(pos, 0.6); out.gain.value = 0.6;
    if (NEW()) {
      // (the new set) a working of power: breath drawn through a throat - a whispered vowel opening (hoo to haa: two bands moving
      // apart), swelling and falling - over a low swell of air; the dark one deeper and slower
      out.gain.value *= NV.magic;
      const dk = kind === 'dark', d = vr(dk ? 0.6 : 0.5, 0.15), k = dk ? 0.62 : 1;
      const src = ctx.createBufferSource(); src.buffer = pink; const env = ctx.createGain();
      const pk = t + d * vr(0.25, 0.2); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(vr(1, 0.15), pk); env.gain.setTargetAtTime(0, pk, d * 0.17);
      src.connect(env);
      for (const [f0, f1, q, g] of [[320, vr(720, 0.1), 5, 1.4], [800, vr(1150, 0.1), 7, 0.9], [2500, vr(2700, 0.1), 9, 0.25]]) {
        const bp = ctx.createBiquadFilter(), gg = ctx.createGain(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0 * k, t); bp.frequency.linearRampToValueAtTime(f1 * k, t + d * 0.6); bp.frequency.linearRampToValueAtTime(f0 * k * 1.1, t + d);
        gg.gain.value = g; env.connect(bp); bp.connect(gg); gg.connect(out);
      }
      src.start(t, Math.random() * 1.2); src.stop(t + d + 0.05);
      nz({ t, buf: 'brown', f: [['lowpass', dk ? 260 : 400]], g: 0.4, a: d * 0.3, d: d * 0.8, to: out });
      return;
    }
    // low, airy and organic - no pure beeps
    nz({ t, buf: 'pink', f: [['bandpass', kind === 'dark' ? 300 : 600, 2, kind === 'dark' ? 150 : 1200, 0.5]], g: 0.6, a: 0.1, d: 0.5, to: out });
    nz({ t, buf: 'brown', f: [['lowpass', 400]], g: 0.4, a: 0.05, d: 0.4, to: out });
  };
  A.zap = function (pos) {
    if (!ctx || !voice(0.3)) return;
    const t = ctx.currentTime, out = dest(pos, 0.35); out.gain.value = 0.55;
    if (NEW()) {
      // (the new set) an arc: a crackle of sharp snaps never evenly spaced (thick at first, thinning), the raw buzz of the current
      // under it, and the knock of the air it splits
      out.gain.value *= NV.zap;
      const sr = ctx.sampleRate, span = vr(0.16, 0.25), len = Math.ceil((span + 0.01) * sr), buf = ctx.createBuffer(1, len, sr), b = buf.getChannelData(0);
      for (let i = 0, n = 26 + Math.floor(Math.random() * 22); i < n; i++) {
        const i0 = Math.floor(Math.pow(Math.random(), 1.8) * span * sr), k = Math.pow(Math.random(), 2) * (1 - i0 / len * 0.6), te = (0.00015 + Math.random() * 0.0004) * sr;
        for (let j = 0; j < te * 6 && i0 + j < len; j++) b[i0 + j] += (Math.random() * 2 - 1) * k * Math.exp(-j / te);
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1000;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = vr(2600, 0.2); bp.Q.value = 2;
      const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 0.6; g2.gain.value = 2.2;
      src.connect(hp); hp.connect(g1); g1.connect(out); src.connect(bp); bp.connect(g2); g2.connect(out); src.start(t);
      // the buzz: a raw low tone, its level as jagged as the arc
      const f = vr(118, 0.08), o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), bg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * vr(0.9, 0.05), t + span);
      lp.type = 'bandpass'; lp.frequency.value = vr(1300, 0.15); lp.Q.value = 0.9;
      bg.gain.setValueAtTime(0, t); for (let i = 1, n = Math.round(span * 200); i <= n; i++) bg.gain.linearRampToValueAtTime(0.16 * (1 - i / n) * (0.4 + Math.random() * 0.6), t + (i / n) * span);
      o.connect(lp); lp.connect(bg); bg.connect(out); o.start(t); o.stop(t + span + 0.05);
      nz({ t, buf: 'brown', f: [['lowpass', 260]], g: 0.4, d: 0.12, to: out });
      return;
    }
    for (let i = 0; i < 6; i++) nz({ t: t + Math.random() * 0.12, f: [['highpass', 1500], ['lowpass', 5000]], g: 0.25, d: 0.02, to: out });
    nz({ t, buf: 'brown', f: [['lowpass', 260]], g: 0.4, d: 0.15, to: out });
  };
  A.fire = function (pos, big) {
    if (!ctx || smp('fire', pos, big ? 1 : 0.6, big ? 0.85 : 1, 0.4) || !voice(0.6)) return;
    const t = ctx.currentTime, out = dest(pos, 0.4); out.gain.value = big ? 1 : 0.6;
    nz({ t, buf: 'pink', f: [['lowpass', 1200, 0.6, 500, 0.5]], g: 0.7, a: 0.06, d: 0.6, to: out });
    for (let i = 0; i < 6; i++) nz({ t: t + Math.random() * 0.4, f: [['bandpass', vr(2400, 0.4), 3]], g: 0.12, d: 0.02, to: out });
  };
  // ---------- ice round your own body (the new set) ----------
  // Thick ice under strain creaks - the stick and slip of it, a run of small catches at a few tens to a couple of hundred a second
  // through the narrow bands of the slab - and gives with sharp cracks (a broad snap, a short high ring of the plate, the dull knock of
  // its mass). Shattered, it falls apart in shards, each a thin high ring, many at once and then fewer, and chunks knocking on the floor.
  function iceCrackIn(L, R, i0, g, pan, sr) {
    const n = Math.min(L.length - i0, Math.round(0.004 * sr)); if (n <= 0) return;
    const x = new Float32Array(n), te = 0.0007 * sr, gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan);
    for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * Math.exp(-j / te);
    bqRun(x, 'hp', 1000, 0.7, sr);
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * gl * 1.6; R[i0 + j] += x[j] * gr * 1.6; }
    const f = vr(2400, 0.2);
    ringIn(L, R, i0, [[f, 0.5, 0.05], [f * 1.71, 0.35, 0.04], [f * 2.63, 0.15, 0.025]], g * 0.5, 0.3, pan, sr);
    knockIn(L, R, i0, vr(300, 0.15), g * 0.5, pan, sr);
  }
  function iceCreakIn(L, R, i0, d, g, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 0) return;
    const x = new Float32Array(n), r0 = vr(70, 0.35), wob = Math.random() * 6.283, up = vr(1.6, 0.3);
    let next = 0;
    for (let j = 0; j < n; j++) {
      const u = j / n, env = Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.3);
      if (j >= next) { x[j] += (0.5 + Math.random()) * env; const r = r0 * (1 + (up - 1) * u) * (1 + 0.35 * Math.sin(wob + u * 19)) * (0.7 + Math.random() * 0.6); next = j + Math.max(2, Math.round(sr / r)); }
    }
    const y = Float32Array.from(x); bqRun(x, 'bp', vr(420, 0.2), 3, sr); bqRun(y, 'bp', vr(1150, 0.2), 4, sr);
    for (let j = 0; j < n; j++) { const v = (x[j] * 7 + y[j] * 3.8) * g; L[i0 + j] += v; R[i0 + j] += v * 0.9; }
  }
  function iceShardIn(L, R, i0, g, pan, sr) {
    const f = vr(3600, 0.35);
    ringIn(L, R, i0, [[f, 0.5, vr(0.07, 0.3)], [f * 1.68, 0.3, 0.05], [f * 2.57, 0.12, 0.03]], g, 0.5, pan, sr);
  }
  const iceOut = (b, pos, g, wet) => { const out = dest(pos || null, wet), src = ctx.createBufferSource(); out.gain.value = g; src.buffer = b; src.connect(out); src.start(); };
  const iceBuf = (secs) => ctx.createBuffer(2, Math.round(secs * ctx.sampleRate), ctx.sampleRate);
  const iceNorm = (b) => { const L = b.getChannelData(0), R = b.getChannelData(1); let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); for (let i = 0; i < L.length; i++) { L[i] /= pk || 1; R[i] /= pk || 1; } return b; };
  // frozen in it, pressing to break out: the ice creaks and cracks a little (k 0..1: how hard; never twice the same)
  A.frostCrack = function (k) {
    if (!ctx) return;
    if (!NEW()) { A.ice(null); return; }
    if (!voice(0.4)) return;
    k = Math.max(0, Math.min(1, k === undefined || k === null ? 0.5 : k));
    const sr = ctx.sampleRate, d = (0.15 + 0.2 * k) * vr(1, 0.12), b = iceBuf(d + 0.08), L = b.getChannelData(0), R = b.getChannelData(1);
    iceCreakIn(L, R, 0, d, 0.6 + 0.4 * k, sr);
    for (let i = 0, n = 1 + Math.round(k * 2 + Math.random() * 0.6); i < n; i++) iceCrackIn(L, R, Math.round((0.02 + Math.random() * (d - 0.03)) * sr), (0.6 + 0.4 * Math.random()) * (0.6 + 0.4 * k), Math.random() * 1.2 - 0.6, sr);
    iceOut(iceNorm(b), null, (0.32 + 0.3 * k) * vr(1, 0.08), 0.15);
  };
  // the ice round you shattering: a great crack, the slab bursting, shards flying and falling - many at once, then fewer - and chunks
  // knocking on the floor
  A.frostBreak = function () {
    if (!ctx) return;
    if (!NEW()) { A.ice(null); return; }
    if (!voice(1)) return;
    const sr = ctx.sampleRate, b = iceBuf(1), L = b.getChannelData(0), R = b.getChannelData(1), at = (s) => Math.round(s * sr);
    iceCrackIn(L, R, 0, 1, 0, sr); iceCrackIn(L, R, at(0.006), 0.7, -0.4, sr);
    knockIn(L, R, 0, vr(200, 0.1), 1.2, 0, sr);
    ringIn(L, R, 0, [[vr(900, 0.1), 0.4, 0.15], [vr(1900, 0.1), 0.3, 0.12]], 0.6, 0, 0, sr);
    { const n = at(0.05), x = new Float32Array(n); for (let j = 0; j < n; j++) x[j] = (Math.random() * 2 - 1) * Math.exp(-j / (0.012 * sr)); bqRun(x, 'hp', 700, 0.7, sr); for (let j = 0; j < n; j++) { L[j] += x[j] * 1.2; R[j] += x[j] * 1.2; } }
    for (let i = 0; i < 30; i++) { const u = Math.random(), tt = 0.02 + 0.85 * Math.pow(u, 1.6); iceShardIn(L, R, at(tt), 0.5 * (1 - tt * 0.7) * (0.4 + Math.random() * 0.6), Math.random() * 1.6 - 0.8, sr); }
    for (let i = 0; i < 4; i++) knockIn(L, R, at(0.25 + Math.random() * 0.5), vr(600, 0.3), 0.45 * (0.5 + Math.random() * 0.5), Math.random() * 1.2 - 0.6, sr);
    iceOut(iceNorm(b), null, 0.72 * vr(1, 0.05), 0.3);
  };
  // frozen in it, every sound comes through the ice: dulled (a little less than through water), the room a little more; on and off
  // smoothly over a tenth of a second (the shots' own way as well)
  A.frostMuffle = function (on) { if (!muffle || !ctx) return; frost = !!on && NEW(); applyMuffle(0.035); };
  A.ice = function (pos) {
    if (!ctx || smp('ice', pos, 0.6, 1, 0.5) || !voice(0.5)) return;
    if (NEW()) {
      // (the new set) water freezing hard: a deep crack as the ice takes hold, the dull knock of its mass, the crackle of it spreading
      const sr = ctx.sampleRate, b = iceBuf(0.45), L = b.getChannelData(0), R = b.getChannelData(1);
      iceCrackIn(L, R, 0, 1, 0, sr); knockIn(L, R, 0, vr(260, 0.1), 0.9, 0, sr);
      for (let i = 0; i < 14; i++) { const tt = Math.random() * 0.28; iceShardIn(L, R, Math.round(tt * sr), 0.25 * (1 - tt * 1.5) + 0.05, Math.random() * 1.2 - 0.6, sr); }
      iceCreakIn(L, R, Math.round(0.02 * sr), 0.25, 0.35, sr);
      iceOut(iceNorm(b), pos, 0.3, 0.5);
      return;
    }
    const t = ctx.currentTime, out = dest(pos, 0.5); out.gain.value = 0.6;
    for (let i = 0; i < 12; i++) nz({ t: t + Math.random() * 0.25, f: [['bandpass', vr(3000, 0.3), 6]], g: 0.12, d: 0.03, to: out });
    nz({ t, buf: 'pink', f: [['bandpass', 1200, 1.5, 3000, 0.3]], g: 0.3, a: 0.02, d: 0.3, to: out });
  };
  A.rumble = function (dur, vol) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = vol || 0.8;
    nz({ t, buf: 'brown', f: [['lowpass', 220]], g: 0.9, a: dur * 0.3, d: dur * 0.7, to: out });
  };
  A.stoneGrind = function (pos, dur) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(pos, 0.7); out.gain.value = 0.9;
    nz({ t, buf: 'brown', f: [['lowpass', 500]], g: 0.8, a: 0.2, d: dur, to: out });
    for (let i = 0; i < dur * 10; i++) nz({ t: t + Math.random() * dur, f: [['bandpass', vr(800, 0.4), 3]], g: 0.12, d: 0.05, to: out });
    A.chain(dur * 0.8, 0.35);
  };
  A.breakObj = function (pos, mat) {
    if (mat === 'metal') { A.drumBreak(pos); return; }   // (the power station's steel drums: the only things of metal that break, field_plant.js)
    if (!ctx || smp('break_' + (mat === 'wood' || mat === 'ceramic' ? mat : 'stone'), pos, 0.8, 1, 0.4)) return;
    const t = ctx.currentTime, out = dest(pos, 0.4);
    // shards / rubble: n pieces landing over sp seconds, each a strike of one set of notes (a set per size)
    const pieces = (t0, n, sp, m, g, hp) => { const at = [], lv = []; for (let i = 0; i < n; i++) { at.push(0.015 + Math.pow(Math.random(), 1.4) * sp); lv.push(0.3 + Math.random() * 0.7); } at.sort((a, b) => a - b); strike(t0, out, m, { g, hp, at, lv }); };
    if (mat === 'ceramic' && NEW()) {
      // (the new set) a fired pot breaking: the whole of it cracking (it rings high and short), shards of three sizes falling and
      // clinking (each size its own notes), the dull knock of what was in it, and grit running out after
      out.gain.value *= NV.cer;
      strike(t, out, [[vr(1500, 0.12), 0.14, 0.07], [vr(2700, 0.12), 0.11, 0.06], [vr(4300, 0.12), 0.07, 0.045], [vr(6400, 0.12), 0.04, 0.03]], { g: 0.45, hp: 2000 });
      nz({ t, buf: 'pink', f: [['lowpass', 700]], g: 0.35, d: 0.07, to: out });
      for (const [fb, n, sp] of [[2300, 3, 0.25], [3600, 4, 0.3], [5600, 3, 0.34]]) { const f = vr(fb, 0.15); pieces(t, n + Math.floor(Math.random() * 4), sp, [[f, 0.07, 0.05], [f * vr(1.62, 0.05), 0.04, 0.035]], 0.08, 3000); }
      scrape(t + 0.03, out, 4000, 2500, vr(0.22, 0.2), 0.05, { q: 0.8, rough: 0.9 });
      return;
    }
    if (mat !== 'wood' && NEW()) {
      // (the new set) stone giving way: a hard crack, the low knock of the mass, rubble of two sizes knocking down (stone hardly rings:
      // short, low notes), and grit running
      out.gain.value *= NV.stn;
      strike(t, out, [[vr(650, 0.12), 0.3, 0.05], [vr(1250, 0.12), 0.18, 0.035], [vr(2200, 0.12), 0.09, 0.025]], { g: 0.5, hp: 1500 });
      tn({ t, f0: vr(110, 0.1), f1: 48, d: vr(0.22, 0.2), g: 0.6, to: out, type: 'sine' });
      nz({ t, buf: 'pink', f: [['lowpass', 900]], g: 0.6, d: 0.2, to: out });
      for (const [fb, n, sp, g] of [[700, 3, 0.5, 0.2], [1600, 4, 0.55, 0.1]]) { const f = vr(fb, 0.2); pieces(t + 0.05, n + Math.floor(Math.random() * 4), sp, [[f, g, 0.04], [f * vr(1.9, 0.1), g * 0.5, 0.03]], 0.1, 1800); }
      scrape(t + 0.05, out, 3000, 1800, vr(0.45, 0.2), 0.05, { buf: 'pink', q: 0.8, rough: 0.9 });
      return;
    }
    if (mat === 'wood') {
      nz({ t, f: [['bandpass', 600, 1.5]], g: 0.7, d: 0.12, to: out });
      for (let i = 0; i < 6; i++) nz({ t: t + Math.random() * 0.15, f: [['bandpass', vr(1100, 0.4), 3]], g: 0.25, d: 0.04, to: out });
      tn({ t, f0: 180, f1: 80, d: 0.1, g: 0.4, to: out });
    } else if (mat === 'ceramic') {
      for (let i = 0; i < 10; i++) nz({ t: t + Math.random() * 0.12, f: [['bandpass', vr(2600, 0.3), 5]], g: 0.22, d: 0.05, to: out });
      nz({ t, buf: 'pink', f: [['lowpass', 1400]], g: 0.4, d: 0.08, to: out });
    } else {
      nz({ t, buf: 'pink', f: [['lowpass', 900]], g: 0.8, d: 0.25, to: out });
      for (let i = 0; i < 8; i++) nz({ t: t + 0.05 + Math.random() * 0.3, f: [['bandpass', vr(1500, 0.5), 2]], g: 0.15, d: 0.05, to: out });
    }
  };
  // a small bright bell (the decoy bell, holy water)
  A.chime = function (pos) {
    if (!ctx || !voice(0.4)) return;
    const t = ctx.currentTime, out = dest(pos, 0.5); out.gain.value = 0.5;
    [[1, 0.35], [2.76, 0.16], [5.4, 0.07]].forEach(([m, g]) => tn({ t, f0: 990 * m, d: 1.3 - m * 0.15, g, to: out, type: 'sine' }));
    nz({ t, f: [['bandpass', 4000, 3]], g: 0.15, d: 0.02, to: out });
  };
  // gas escaping (smoke, poison gas, burning thermite)
  A.hiss = function (pos, dur) {
    if (!ctx || !voice(Math.min(1.5, dur || 1))) return;
    const t = ctx.currentTime, out = dest(pos, 0.5); out.gain.value = 0.45;
    nz({ t, buf: 'pink', f: [['highpass', 2200], ['lowpass', 7000]], g: 0.5, a: 0.04, d: dur || 1, to: out });
  };
  // ---------- pickups / ui ----------
  A.coin = function (n) {
    if (!ctx || !voice(0.3)) return;
    const t = ctx.currentTime, out = dest(null, 0.25); out.gain.value = 0.28;
    if (NEW()) {
      // (the new set) a coin landing on stone: a thin disc rings in modes far from one another; a bounce or two after the first
      // strike; old gold, so dull and short
      const b = vr(2100, 0.08), at = [0], lv = [1];
      if (Math.random() < 0.8) { at.push(vr(0.06, 0.25)); lv.push(vr(0.45, 0.3)); if (Math.random() < 0.6) { at.push(at[1] + vr(0.04, 0.25)); lv.push(vr(0.2, 0.3)); } }
      out.gain.value *= NV.coin;
      strike(t, out, [[b, 0.08, 0.22], [b * 1.47, 0.06, 0.18], [b * 2.09, 0.045, 0.14], [b * 2.71, 0.03, 0.1], [b * 3.62, 0.015, 0.07]], { g: 0.1, hp: 4000, at, lv });
      return;
    }
    const base = vr(2100, 0.08);
    [1, 1.43, 2.12].forEach((m, i) => tn({ t, f0: base * m, d: 0.12 - i * 0.02, g: 0.08, to: out }));
    nz({ t, f: [['bandpass', 3800, 4]], g: 0.15, d: 0.02, to: out });
  };
  A.coins = function (n) {
    if (!ctx || smp('coins', null, 0.3 + Math.min(8, n) * 0.06)) return;
    for (let i = 0; i < Math.min(8, n); i++) setTimeout(() => A.coin(), i * 45 + Math.random() * 20);
  };
  A.pickup = function () {
    if (!ctx || smp('pickup', null, 0.4)) return;
    const t = ctx.currentTime, out = dest(null, 0.2); out.gain.value = 0.4;
    nz({ t, buf: 'pink', f: [['bandpass', 900, 1.5]], g: 0.3, d: 0.08, to: out });
    A.mech('grab', 0.03);
  };
  // (the new set) what is pressed and chosen is a thing of the world - a stone piece set down, an iron catch, a coin, a page - not a tone
  const UIN = {
    // a page brushed
    hover: (t, out) => { out.gain.value = 0.18 * NV.hover; scrape(t, out, vr(2600, 0.1), 1800, vr(0.035, 0.2), 0.3, { q: 1.2, rough: 0.6 }); },
    // a small iron catch ticking against wood
    click: (t, out) => {
      out.gain.value = 0.35 * NV.click;
      strike(t, out, [[vr(1050, 0.05), 0.1, 0.035], [vr(2380, 0.05), 0.06, 0.025], [vr(3900, 0.05), 0.03, 0.018]], { g: 0.12, hp: 2500, d: 0.002 });
      tn({ t, f0: vr(210, 0.05), f1: 150, d: 0.04, g: 0.2, to: out, type: 'sine' });
    },
    // a stone piece set down hard on stone, and a coin
    select: (t, out) => {
      out.gain.value = 0.6 * NV.select;
      tn({ t, f0: vr(140, 0.06), f1: 70, d: vr(0.2, 0.1), g: 0.6, to: out, type: 'sine' });
      strike(t, out, [[vr(520, 0.05), 0.25, 0.05], [vr(1240, 0.05), 0.12, 0.035], [vr(2300, 0.05), 0.06, 0.025]], { g: 0.2, hp: 1500 });
      A.coin();
    },
    // a muffled knock on a shut lid
    deny: (t, out) => { out.gain.value = 0.3 * NV.deny; strike(t, out, [[vr(170, 0.04), 0.35, 0.07], [vr(410, 0.05), 0.14, 0.045], [vr(980, 0.05), 0.05, 0.025]], { g: 0.06, hp: 800, d: 0.01 }); },
    // a locked iron latch rattled: two dull clanks
    error: (t, out) => {
      out.gain.value = 0.45 * NV.error;
      strike(t, out, [[vr(330, 0.05), 0.25, 0.07], [vr(1020, 0.05), 0.1, 0.09], [vr(1780, 0.05), 0.06, 0.06], [vr(2650, 0.05), 0.03, 0.04]], { g: 0.1, hp: 1500, d: 0.008, at: [0, vr(0.12, 0.1)], lv: [1, 0.8] });
    },
    // a small catch snapping home, a little ring after it
    ready: (t, out) => { out.gain.value = 0.18 * NV.ready; strike(t, out, [[vr(1900, 0.03), 0.05, 0.18], [vr(3050, 0.03), 0.035, 0.12], [vr(4700, 0.03), 0.02, 0.08]], { g: 0.1, hp: 3000 }); },
  };
  A.ui = function (kind) {
    if (!ctx) return;
    if (kind === 'buy' ? smp('coins', null, 0.6) : kind === 'rare' ? false : smp('ui_' + kind, null, 0.5, 1, 0.08)) return;
    if (NEW() && (kind === 'ok' || kind === 'level' || kind === 'clear')) { SN[kind](); return; }
    const t = ctx.currentTime, out = dest(null, 0.12);
    if (NEW() && UIN[kind]) { UIN[kind](t, out); return; }
    switch (kind) {
      case 'hover': out.gain.value = 0.18; nz({ t, f: [['bandpass', 1800, 3]], g: 0.3, d: 0.02, to: out }); break;
      case 'click': out.gain.value = 0.35; nz({ t, f: [['bandpass', 1100, 2]], g: 0.4, d: 0.03, to: out }); tn({ t, f0: 220, f1: 140, d: 0.05, g: 0.2, to: out }); break;
      case 'open': out.gain.value = 0.35; nz({ t, buf: 'pink', f: [['bandpass', 500, 1, 1400, 0.25]], g: 0.4, a: 0.05, d: 0.25, to: out }); break;
      case 'card': out.gain.value = 0.35; nz({ t, buf: 'pink', f: [['bandpass', 1600, 1.2, 800, 0.15]], g: 0.4, a: 0.01, d: 0.15, to: out }); break;
      case 'select': out.gain.value = 0.6; tn({ t, f0: 150, f1: 70, d: 0.25, g: 0.6, to: out, type: 'triangle' }); nz({ t, buf: 'pink', f: [['lowpass', 1200]], g: 0.4, d: 0.2, to: out }); A.coin(); break;
      case 'buy': out.gain.value = 0.5; A.coins(5); tn({ t, f0: 120, f1: 70, d: 0.18, g: 0.4, to: out, type: 'triangle' }); break;
      case 'error': out.gain.value = 0.45; tn({ t, f0: 110, d: 0.12, g: 0.35, to: out, type: 'square', lp: 600 }); tn({ t: t + 0.14, f0: 95, d: 0.14, g: 0.35, to: out, type: 'square', lp: 600 }); break;
      case 'rare': out.gain.value = 0.5; nz({ t, buf: 'pink', f: [['bandpass', 700, 1, 2600, 0.6]], g: 0.4, a: 0.1, d: 0.6, to: out }); A.coins(3); break;
      case 'clear': out.gain.value = 0.9; tn({ t, f0: 98, d: 1.6, g: 0.25, to: out, type: 'triangle', lp: 900 }); tn({ t, f0: 147, d: 1.6, g: 0.18, to: out, type: 'triangle', lp: 900 }); tn({ t: t + 0.15, f0: 196, d: 1.6, g: 0.15, to: out, type: 'triangle', lp: 900 }); nz({ t, buf: 'brown', f: [['lowpass', 300]], g: 0.4, d: 1.2, to: out }); break;
      case 'level': out.gain.value = 0.7; [131, 165, 196, 262].forEach((f, i) => tn({ t: t + i * 0.09, f0: f, d: 0.9, g: 0.16, to: out, type: 'triangle', lp: 1000 })); break;
      case 'skill': out.gain.value = 0.35; nz({ t, buf: 'pink', f: [['bandpass', 600, 1.4, 1600, 0.2]], g: 0.4, a: 0.04, d: 0.25, to: out }); break;
      case 'ready': out.gain.value = 0.18; nz({ t, f: [['bandpass', 1500, 6]], g: 0.25, d: 0.06, to: out }); tn({ t, f0: 520, d: 0.1, g: 0.05, to: out, type: 'triangle' }); break;
      case 'deny': out.gain.value = 0.3; tn({ t, f0: 130, d: 0.1, g: 0.3, to: out, type: 'triangle', lp: 500 }); break;
    }
  };
  // ---- time slowing / stopping: a falling sweep going in, a low hum and slow clock ticks while it lasts, a rising sweep coming out ----
  A.timeIn = function (k) {
    if (!ctx || !voice(1.3)) return;
    if (NEW()) { SN.timeIn(k); return; }
    const t = ctx.currentTime, out = dest(null, 0.7), g = 0.55 + 0.45 * k; out.gain.value = 0.9;
    tn({ t, f0: 560, f1: 40, d: 1.15, g: 0.5 * g, to: out, type: 'sine' });
    tn({ t, f0: 280, f1: 36, d: 1.25, g: 0.32 * g, to: out, type: 'sawtooth', lp: 700 });
    nz({ t, buf: 'pink', f: [['lowpass', 5200, 0.8, 160, 1.05]], g: 0.45 * g, a: 0.01, d: 1.05, to: out });
    nz({ t, f: [['bandpass', 3200, 2.2, 420, 0.8]], g: 0.16 * g, d: 0.8, to: out });
    if (k >= 0.8) { A.bell(); tn({ t: t + 0.05, f0: 90, f1: 28, d: 1.0, g: 0.5, to: out, type: 'triangle' }); }
  };
  A.timeOut = function (k) {
    if (!ctx || !voice(0.9)) return;
    if (NEW()) { SN.timeOut(k); return; }
    const t = ctx.currentTime, out = dest(null, 0.6), g = 0.5 + 0.4 * k; out.gain.value = 0.8;
    tn({ t, f0: 60, f1: 1000, d: 0.55, g: 0.34 * g, to: out, type: 'sine' });
    nz({ t, buf: 'white', f: [['bandpass', 600, 2, 6500, 0.5]], g: 0.2 * g, a: 0.05, d: 0.5, to: out });
    tn({ t: t + 0.45, f0: 900, f1: 880, d: 0.25, g: 0.1 * g, to: out, type: 'triangle', lp: 3500 });
  };
  A.timeTick = function (k) {
    if (!ctx) return;
    if (NEW()) { SN.timeTick(k); return; }
    const t = ctx.currentTime, out = dest(null, 0.35); out.gain.value = 0.5 + 0.4 * k;
    nz({ t, f: [['bandpass', 2300 + Math.random() * 400, 6]], g: 0.3, d: 0.03, to: out });
    tn({ t, f0: 1500, f1: 900, d: 0.06, g: 0.1, to: out, type: 'triangle' });
    tn({ t: t + 0.01, f0: 140, f1: 90, d: 0.12, g: 0.18 * (0.5 + k), to: out, type: 'sine' });
  };
  let tdr = null;
  A.timeDrone = function (k) {
    if (!ctx) return;
    if (!tdr) {
      const out = dest(null, 0.5); out.gain.value = 0.0001;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter();
      o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = 46; o2.frequency.value = 69; lp.type = 'lowpass'; lp.frequency.value = 260;
      o1.connect(lp); o2.connect(lp); lp.connect(out); o1.start(); o2.start();
      tdr = { out, o1, o2, t: 0, w: 0 };
    }
    const now = ctx.currentTime; tdr.t = performance.now();
    tdr.out.gain.setTargetAtTime(0.05 + 0.1 * k, now, 0.15); tdr.o1.frequency.setTargetAtTime(46 - 14 * k, now, 0.3);
    if (!tdr.w) tdr.w = setInterval(() => { if (performance.now() - tdr.t > 300) { tdr.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); clearInterval(tdr.w); tdr.w = 0; } }, 120);
  };
  // a duel's turn passing: one short strike of a hammer on iron; two, quick, when the turn is yours (the new set; the old one: a click)
  A.duelTurn = function (mine) { if (!ctx) return; if (!NEW()) { A.ui('click'); return; } if (voice(0.5)) SN.duelTurn(!!mine); };
  // the duel's warning flash: a bright, high blade-ring "shing!" (a scrape sweeping up into inharmonic steel partials that hang a moment)
  A.shing = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.4); out.gain.value = 0.6;
    nz({ t, f: [['highpass', 2800, 0.7], ['bandpass', 4200, 2.5, 9500, 0.08]], g: 0.5, a: 0.003, d: 0.085, to: out });
    tn({ t, f0: 2000, f1: 4600, fd: 0.045, d: 0.07, g: 0.2, to: out, type: 'triangle' });
    [[3300, 0.24, 0.5], [4950, 0.17, 0.4], [6600, 0.11, 0.3], [8250, 0.06, 0.22]].forEach(([f, g, d]) => tn({ t: t + 0.04, f0: f, f1: f * 1.004, d, g, to: out, type: 'sine' }));
    nz({ t: t + 0.04, f: [['bandpass', 7400, 7]], g: 0.16, d: 0.2, to: out });
  };
  // 飛燕: the air torn open as the crescent leaves the blade (a hiss sweeping up and away, a thin whistle over it, a low swish under it)
  A.skySlash = function () {
    if (!ctx || !voice(0.6)) return;
    const t = ctx.currentTime, out = dest(null, 0.35); out.gain.value = 0.8;
    nz({ t, buf: 'pink', f: [['bandpass', 900, 1.2, 5200, 0.28]], g: 0.7, a: 0.01, d: 0.42, to: out });
    nz({ t, f: [['highpass', 4200, 0.7]], g: 0.28, a: 0.004, d: 0.2, to: out });
    tn({ t, f0: 1300, f1: 3600, d: 0.32, g: 0.07, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 380]], g: 0.35, a: 0.01, d: 0.26, to: out });
  };
  // 一閃: a heavy, sharp crack (the snap, a deep thump under it, a bright ring left hanging in the air)
  A.focusBeam = function () {
    if (!ctx || !voice(1.0)) return;
    const t = ctx.currentTime, out = dest(null, 0.5); out.gain.value = 0.9;
    nz({ t, f: [['highpass', 1800, 0.7]], g: 0.85, a: 0.001, d: 0.06, to: out });
    tn({ t, f0: 180, f1: 42, d: 0.38, g: 0.6, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 900, 0.7, 200, 0.4]], g: 0.6, a: 0.002, d: 0.45, to: out });
    tn({ t: t + 0.01, f0: 3200, f1: 2600, d: 0.55, g: 0.07, to: out, type: 'triangle' });
    nz({ t: t + 0.02, f: [['bandpass', 6000, 6]], g: 0.12, d: 0.42, to: out });
  };
  // a parry: two blades meeting hard, "kakiin!" (a sharp crack, a short thud, then struck-steel partials ringing out); pos = null for your own
  A.clang = function (pos) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(pos || null, 0.6); out.gain.value = 0.75;
    nz({ t, f: [['highpass', 1800, 0.7], ['bandpass', 3600, 1.4]], g: 0.75, a: 0.001, d: 0.05, to: out });
    tn({ t, f0: 520, f1: 240, d: 0.09, g: 0.35, to: out, type: 'triangle' });
    [[1240, 0.32, 0.95], [2010, 0.26, 0.82], [2870, 0.2, 0.7], [3960, 0.14, 0.55], [5230, 0.09, 0.42]].forEach(([f, g, d]) => tn({ t: t + 0.004, f0: f * 1.025, f1: f, fd: 0.03, d, g, to: out, type: 'sine' }));
    nz({ t: t + 0.01, f: [['bandpass', 4300, 9]], g: 0.18, d: 0.36, to: out });
  };
  A.bell = function () {
    // deep bronze bell for boss/portal moments
    if (!ctx || smp('bell', null, 0.5, 0.75, 1.0)) return;
    const t = ctx.currentTime, out = dest(null, 1.0); out.gain.value = 0.5;
    const base = 82;
    [[1, 0.5], [2.0, 0.3], [2.4, 0.22], [3.0, 0.15], [4.16, 0.1], [5.4, 0.06]].forEach(([m, g]) => tn({ t, f0: base * m, d: 3.5 - m * 0.3, g, to: out, type: 'sine' }));
    nz({ t, f: [['bandpass', 600, 2]], g: 0.3, d: 0.05, to: out });
  };

  // invulnerability: a bright rising shimmer when it starts, soft sparkles while it lasts,
  // quickening ticks as it is about to run out, and a falling "glass" tone when it ends
  A.invulnOn = function () {
    if (!ctx) return;
    if (NEW()) { SN.invulnOn(); return; }
    const t = ctx.currentTime, out = dest(null, 0.8); out.gain.value = 0.45;
    [523, 659, 784, 1046].forEach((f, i) => tn({ t: t + i * 0.05, f0: f, f1: f * 1.01, d: 0.7, g: 0.12, to: out, type: 'triangle', lp: 4000 }));
    nz({ t, buf: 'pink', f: [['bandpass', 2500, 2, 6000, 0.4]], g: 0.25, a: 0.08, d: 0.5, to: out });
    tn({ t, f0: 180, f1: 360, d: 0.4, g: 0.15, to: out, type: 'sine' });
  };
  A.invulnHum = function () {
    if (!ctx) return;
    if (NEW()) { SN.invulnHum(); return; }
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.16;
    tn({ t, f0: vr(1568, 0.05), d: 0.35, g: 0.12, to: out, type: 'sine' });
    tn({ t: t + 0.04, f0: vr(2093, 0.05), d: 0.3, g: 0.07, to: out, type: 'sine' });
  };
  A.invulnTick = function (k) {
    if (!ctx) return;
    if (NEW()) { SN.invulnTick(Math.max(0, Math.min(1, k || 0))); return; }
    // k: 0 → 1 as the end approaches (higher and louder)
    const t = ctx.currentTime, out = dest(null, 0.3); out.gain.value = 0.35 + k * 0.25;
    const f = 880 + k * 660;
    tn({ t, f0: f, f1: f * 0.94, d: 0.09, g: 0.25, to: out, type: 'square', lp: 3000 });
    tn({ t, f0: f * 0.5, d: 0.08, g: 0.12, to: out, type: 'triangle' });
  };
  A.invulnOff = function () {
    if (!ctx) return;
    if (NEW()) { SN.invulnOff(); return; }
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.45;
    [1046, 784, 587, 392].forEach((f, i) => tn({ t: t + i * 0.06, f0: f, f1: f * 0.9, d: 0.35, g: 0.12, to: out, type: 'triangle', lp: 3000 }));
    nz({ t, buf: 'white', f: [['bandpass', 3500, 6]], g: 0.18, d: 0.12, to: out });
  };
  // ---- the last guardian's sky (bosses6.js): gravity turning over, the climb into the dark, the new attacks ----
  // the warning: a low chord that bends upward with a reversed cymbal swelling into it
  A.gravWarn = function (dur) {
    if (!ctx || !voice(dur + 0.3)) return;
    const t = ctx.currentTime, out = dest(null, 0.9); out.gain.value = 0.75;
    [55, 82.5, 110].forEach((f, i) => tn({ t, f0: f, f1: f * 2, fd: dur, d: dur, a: dur * 0.6, g: 0.22 - i * 0.04, to: out, type: i ? 'sine' : 'triangle', lp: 900 }));
    nz({ t, buf: 'pink', f: [['highpass', 1500], ['bandpass', 3000, 0.6, 9000, dur]], g: 0.3, a: dur * 0.95, d: 0.05, to: out });
    tn({ t: t + dur * 0.5, f0: 1760, f1: 3520, d: dur * 0.5, a: dur * 0.45, g: 0.04, to: out, type: 'sine' });
  };
  // torn off the ground: a thump, a rush of air going up, a rising whistle
  A.gravLift = function () {
    if (!ctx || !voice(1.6)) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.9;
    tn({ t, f0: 120, f1: 40, d: 0.25, g: 0.6, to: out, type: 'sine' });
    nz({ t, buf: 'pink', f: [['bandpass', 300, 0.8, 4200, 1.2]], g: 0.55, a: 0.05, d: 1.3, to: out });
    tn({ t: t + 0.05, f0: 220, f1: 1300, d: 1.2, g: 0.12, to: out, type: 'triangle', lp: 2500 });
  };
  // hanging in the air: a thin wind and a slow, unsettling throb (call every frame while it lasts; it fades by itself once the calls stop)
  let gfl = null;
  A.gravFloat = function (k) {
    if (!ctx) return;
    if (!gfl) {
      const out = dest(null, 0.6); out.gain.value = 0.0001;
      const src = ctx.createBufferSource(); src.buffer = pink; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.4;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 52;
      const og = ctx.createGain(); og.gain.value = 0.35;
      src.connect(bp); bp.connect(out); o.connect(og); og.connect(out); src.start(); o.start();
      gfl = { out, bp, o, t: 0, w: 0, src };
    }
    const now = ctx.currentTime; gfl.t = performance.now();
    gfl.out.gain.setTargetAtTime(0.18 + 0.2 * k, now, 0.1); gfl.bp.frequency.setTargetAtTime(700 + 900 * k, now, 0.2); gfl.o.frequency.setTargetAtTime(52 - 14 * k, now, 0.2);
    if (!gfl.w) gfl.w = setInterval(() => { if (performance.now() - gfl.t > 250) { gfl.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); clearInterval(gfl.w); gfl.w = 0; } }, 100);
  };
  // the creak just before the fall: a stretched, cracking tone
  A.gravCreak = function () {
    if (!ctx || !voice(0.8)) return;
    const t = ctx.currentTime, out = dest(null, 0.5); out.gain.value = 0.7;
    tn({ t, f0: 180, f1: 95, d: 0.7, g: 0.25, to: out, type: 'sawtooth', lp: 700 });
    for (let i = 0; i < 5; i++) nz({ t: t + i * 0.11, f: [['bandpass', 1800 + i * 300, 5]], g: 0.2, d: 0.04, to: out });
  };
  // the drop: a falling whistle and air tearing past
  A.gravDrop = function () {
    if (!ctx || !voice(1.1)) return;
    const t = ctx.currentTime, out = dest(null, 0.5); out.gain.value = 0.85;
    if (NEW()) { nz({ t, buf: 'pink', f: [['bandpass', 4000, 0.7, 500, 0.9]], g: 0.62, a: 0.1, d: 0.85, to: out }); nz({ t, buf: 'brown', f: [['lowpass', 320]], g: 0.55, a: 0.25, d: 0.8, to: out }); return; }   // (the new set: the air tearing past and roaring, no whistle)
    tn({ t, f0: 1500, f1: 160, d: 0.9, g: 0.16, to: out, type: 'sine' });
    tn({ t, f0: 1520, f1: 170, d: 0.9, g: 0.08, to: out, type: 'triangle' });
    nz({ t, buf: 'pink', f: [['bandpass', 4000, 0.7, 500, 0.9]], g: 0.5, a: 0.1, d: 0.85, to: out });
  };
  // smashed into the floor: a very low hit, a crack and stone falling apart
  A.gravCrash = function () {
    if (!ctx || !voice(1.6)) return;
    const t = ctx.currentTime, out = dest(null, 0.8); out.gain.value = 1.0;
    tn({ t, f0: 90, f1: 24, d: 0.9, g: 0.9, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 900, 0.7, 120, 1.2]], g: 0.9, d: 1.3, to: out });
    nz({ t, f: [['bandpass', 2400, 1.2]], g: 0.45, d: 0.08, to: out });
    for (let i = 0; i < 6; i++) nz({ t: t + 0.12 + i * 0.07, f: [['bandpass', 600 + Math.random() * 900, 3]], g: 0.18, d: 0.06, to: out });
  };
  // the climb into the dark between the forms: a long swell of a rising chord over a rushing wind
  A.ascend = function (dur) {
    if (!ctx || !voice(dur + 0.5)) return;
    const t = ctx.currentTime, out = dest(null, 1.2); out.gain.value = 0.8;
    [65.4, 98, 130.8, 196, 261.6].forEach((f, i) => tn({ t: t + i * 0.25, f0: f, f1: f * 1.5, fd: dur, d: dur - i * 0.25, a: dur * 0.5, g: 0.12, to: out, type: i % 2 ? 'sine' : 'triangle', lp: 1800 }));
    nz({ t, buf: 'pink', f: [['bandpass', 250, 0.6, 5000, dur]], g: 0.45, a: dur * 0.7, d: dur * 0.35, to: out });
    tn({ t: t + dur * 0.85, f0: 523, f1: 1046, d: 1.6, g: 0.1, to: out, type: 'sine' });
  };
  // star shards gathering into a ring: glassy chimes falling into place
  A.starRing = function () {
    if (!ctx || !voice(1.4)) return;
    const t = ctx.currentTime, out = dest(null, 1.0); out.gain.value = 0.5;
    [1318, 1568, 1976, 2349, 2637].forEach((f, i) => tn({ t: t + i * 0.07, f0: f, f1: f * 0.98, d: 1.1, g: 0.08, to: out, type: 'sine' }));
    nz({ t, buf: 'pink', f: [['highpass', 4000]], g: 0.15, a: 0.3, d: 0.8, to: out });
  };
  A.starBurst = function () {
    if (!ctx || !voice(0.9)) return;
    const t = ctx.currentTime, out = dest(null, 0.8); out.gain.value = 0.6;
    for (let i = 0; i < 8; i++) tn({ t: t + i * 0.02, f0: 2000 + Math.random() * 1500, f1: 700, d: 0.5, g: 0.05, to: out, type: 'sine' });
    nz({ t, f: [['bandpass', 3500, 1]], g: 0.3, d: 0.25, to: out });
  };
  // a rift opening in the air, then the curtain of light coming down on it
  A.riftOpen = function () {
    if (!ctx || !voice(1)) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.55;
    nz({ t, f: [['bandpass', 800, 4, 3000, 0.9]], g: 0.25, a: 0.6, d: 0.3, to: out });
    tn({ t, f0: 440, f1: 466, d: 0.9, a: 0.5, g: 0.05, to: out, type: 'sawtooth', lp: 1500 });
  };
  A.riftFall = function () {
    if (!ctx || !voice(0.9)) return;
    const t = ctx.currentTime, out = dest(null, 0.7); out.gain.value = 0.8;
    if (NEW()) { nz({ t, f: [['highpass', 600]], g: 0.6, d: 0.35, to: out }); scrape(t, out, 2600, 300, 0.32, 0.5, { q: 2, rough: 0.85 }); tn({ t, f0: 75, f1: 40, d: 0.5, g: 0.85, to: out, type: 'sine' }); return; }   // (the new set: stone grinding down in place of the sweep)
    nz({ t, buf: 'white', f: [['highpass', 600]], g: 0.6, d: 0.35, to: out });
    tn({ t, f0: 2600, f1: 300, d: 0.3, g: 0.12, to: out, type: 'square', lp: 4000 });
    tn({ t, f0: 75, f1: 40, d: 0.5, g: 0.5, to: out, type: 'sine' });
  };
  // the lance of light: a rising charge, and its strike
  A.lanceCharge = function (dur) {
    if (!ctx || !voice(dur + 0.2)) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.5;
    tn({ t, f0: 200, f1: 1600, fd: dur, d: dur, a: dur * 0.9, g: 0.12, to: out, type: 'sawtooth', lp: 3000 });
    tn({ t, f0: 100, f1: 800, fd: dur, d: dur, a: dur * 0.9, g: 0.12, to: out, type: 'sine' });
  };
  A.lanceHit = function (pos) {
    if (!ctx || !voice(1.2)) return;
    const t = ctx.currentTime, out = dest(pos, 0.8); out.gain.value = 1;
    if (NEW()) { tn({ t, f0: 300, f1: 40, d: 0.6, g: 0.6, to: out, type: 'sine' }); nz({ t, f: [['bandpass', 1500, 0.8, 300, 0.8]], g: 0.7, d: 0.9, to: out }); strike(t, out, [[vr(420, 0.05), 0.3, 0.5], [vr(980, 0.05), 0.2, 0.4], [vr(1850, 0.05), 0.1, 0.3]], { g: 0.2, hp: 1200 }); return; }   // (the new set: struck iron ringing low in place of the falling tone)
    tn({ t, f0: 300, f1: 40, d: 0.6, g: 0.6, to: out, type: 'sine' });
    nz({ t, f: [['bandpass', 1500, 0.8, 300, 0.8]], g: 0.7, d: 0.9, to: out });
    tn({ t, f0: 1760, f1: 880, d: 0.7, g: 0.1, to: out, type: 'triangle' });
  };
  // two giant hands meeting: a vast clap and the boom that follows
  A.clap = function () {
    if (!ctx || !voice(1.4)) return;
    const t = ctx.currentTime, out = dest(null, 1.0); out.gain.value = 1;
    nz({ t, f: [['bandpass', 1200, 0.9]], g: 0.95, d: 0.12, to: out });
    nz({ t, buf: 'brown', f: [['lowpass', 500, 0.7, 80, 1]], g: 0.8, d: 1.1, to: out });
    tn({ t, f0: 110, f1: 30, d: 0.8, g: 0.6, to: out, type: 'sine' });
  };
  // the golden barrier going up, and absorbing a hit
  A.shieldUp = function () {
    if (!ctx || smp('shield_up', null, 0.5, 1, 0.7)) return;
    const t = ctx.currentTime, out = dest(null, 0.7); out.gain.value = 0.5;
    [392, 523, 659, 784].forEach((f, i) => tn({ t: t + i * 0.04, f0: f, f1: f * 1.02, d: 0.9, g: 0.12, to: out, type: 'triangle', lp: 3500 }));
    nz({ t, buf: 'pink', f: [['bandpass', 1200, 1.5, 4000, 0.5]], g: 0.3, a: 0.1, d: 0.6, to: out });
  };
  A.shieldHit = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.4); out.gain.value = 0.45;
    tn({ t, f0: 1400, f1: 900, d: 0.25, g: 0.18, to: out, type: 'triangle' }); tn({ t, f0: 2100, f1: 1700, d: 0.18, g: 0.08, to: out });
    nz({ t, buf: 'white', f: [['bandpass', 3000, 3]], g: 0.25, d: 0.06, to: out });
  };
  // ultimate: a rising choir chord with a deep impact; and a bright chime when it is ready again
  A.ultCast = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.9); out.gain.value = 0.6;
    [196, 247, 294, 392, 494].forEach((f, i) => tn({ t: t + i * 0.03, f0: f * 0.5, f1: f, fd: 0.35, d: 1.2, g: 0.12, to: out, type: 'sawtooth', lp: 2400 }));
    tn({ t, f0: 90, f1: 40, d: 0.6, g: 0.6, to: out }); nz({ t, buf: 'pink', f: [['bandpass', 400, 1, 3000, 0.5]], g: 0.4, a: 0.05, d: 0.8, to: out });
  };
  A.ultReady = function () {
    if (!ctx || smp('ult_ready', null, 0.4, 1, 0.6)) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.4;
    [659, 880, 1319].forEach((f, i) => tn({ t: t + i * 0.08, f0: f, d: 0.8, g: 0.12, to: out, type: 'triangle', lp: 4000 }));
  };
  // anomaly alert: two-tone siren over a low horn
  A.alarm = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.55;
    for (let i = 0; i < 3; i++) {
      tn({ t: t + i * 0.42, f0: 560, f1: 760, fd: 0.2, d: 0.38, g: 0.22, to: out, type: 'sawtooth', lp: 2200 });
      tn({ t: t + i * 0.42 + 0.005, f0: 280, f1: 380, fd: 0.2, d: 0.38, g: 0.16, to: out, type: 'square', lp: 1200 });
    }
    tn({ t, f0: 55, d: 1.8, g: 0.5, to: out, type: 'sawtooth', lp: 260 });
    tn({ t, f0: 58.3, d: 1.8, g: 0.4, to: out, type: 'sawtooth', lp: 260 });
    nz({ t, buf: 'brown', f: [['lowpass', 200]], g: 0.6, a: 0.05, d: 1.6, to: out });
  };
  // ritual chant pulse: a choir-like fifth that climbs with progress k (0..1); faster and brighter near the end
  A.chant = function (k, pos) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(pos, 0.7); out.gain.value = 0.32 + k * 0.25;
    const f = 147 * Math.pow(2, k * 1.0);
    tn({ t, f0: f, d: 0.55, g: 0.2, a: 0.06, to: out, type: 'triangle', lp: 1400 + k * 2000 });
    tn({ t, f0: f * 1.5, d: 0.55, g: 0.13, a: 0.06, to: out, type: 'triangle', lp: 1400 + k * 2000 });
    if (k > 0.75) tn({ t: t + 0.02, f0: f * 2, d: 0.35, g: 0.12, to: out, type: 'sine' });
    nz({ t, buf: 'pink', f: [['bandpass', 900 + k * 1800, 3]], g: 0.08 + k * 0.08, a: 0.04, d: 0.3, to: out });
  };
  // ritual complete: rising arpeggio + bell + whoosh
  A.ritualDone = function (pos) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(pos, 0.9); out.gain.value = 0.7;
    [294, 370, 440, 587, 740].forEach((f, i) => tn({ t: t + i * 0.07, f0: f, d: 1.4, g: 0.16, to: out, type: 'triangle', lp: 3000 }));
    nz({ t, buf: 'pink', f: [['bandpass', 500, 1, 3000, 0.8]], g: 0.35, a: 0.15, d: 0.9, to: out });
    A.bell();
  };
  // ---------- ambience (no BGM: dungeon room tone) ----------
  let amb = null;
  A.startAmbience = function () {
    if (!ctx || amb) return;
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(dry);
    const s2 = ctx.createBufferSource(); s2.buffer = pink; s2.loop = true;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 500; f2.Q.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.012;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.13; const lg2 = ctx.createGain(); lg2.gain.value = 0.01; lfo2.connect(lg2); lg2.connect(g2.gain);
    s2.connect(f2); f2.connect(g2); g2.connect(dry); g2.connect(revSend);
    src.start(); s2.start(); lfo.start(); lfo2.start();
    amb = { g, g2 };
  };
  // recorded room tone per area look: [bank key, level] layers, crossfaded when the area changes.
  // the procedural rumble stays underneath, quieter while a recorded bed plays.
  const BEDS = {
    catacombs: [['amb_deep', 0.5]], temple: [['amb_deep', 0.6]], halls: [['amb_deep', 0.6]], gate: [['amb_deep', 0.4]], abyss: [['amb_deep', 0.45]],
    flooded: [['amb_deep', 0.35], ['amb_water', 0.3]], forge: [['amb_deep', 0.5], ['amb_fire', 0.35]], frozen: [['amb_deep', 0.35], ['amb_wind', 0.25]],
    ruins: [['amb_wind', 0.4]], bloodmoon: [['amb_wind', 0.4]], grave: [['amb_wind', 0.35]], crimson: [['amb_wind', 0.4]], ruin: [['amb_wind', 0.35], ['amb_fire', 0.2]],
    sky: [['amb_wind', 0.55]], void: [['amb_wind', 0.35], ['amb_deep', 0.25]],
  };
  // (by the field's own name where it has one: the hollow and drip of a cave, wind over open ground, the roar of the foundry's fires)
  // (water is heard only where there is water - the flooded field: the recorded caves dripped, and it dripped everywhere)
  const FBEDS = {
    catacombs: [['amb_deep', 0.5]], rooms: [['amb_deep', 0.55]], castle: [['amb_deep', 0.5]], mine: [['amb_deep', 0.5]], shaft: [['amb_deep', 0.45], ['amb_wind', 0.2]],
    pillars: [['amb_deep', 0.45]], flooded: [['amb_deep', 0.35], ['amb_water', 0.4]], foundry: [['amb_deep', 0.45], ['amb_fire', 0.4]], frozen: [['amb_wind', 0.45]],
    hamlet: [['amb_wind', 0.4]], battlefield: [['amb_wind', 0.5]], dusk: [['amb_wind', 0.4]],
  };
  let beds = [], bedKey = null, bedV = 1;
  function setBeds(v) {
    const fk = G.world && G.world.field, byField = fk && FBEDS[fk], bk = byField ? 'f:' + fk : (G.world && G.world.biome) || 'catacombs';
    const want = A.samplesOn() ? byField || BEDS[bk] || BEDS.catacombs : [];
    if (bk !== bedKey || beds.length !== want.length) {
      for (const b of beds) b.stop(1.2);
      beds = [];
      for (const [k, lv] of want) {
        const l = smpLoop(k, lv, 0.2);
        if (l) beds.push(l);
        else if (usable(k)) A.fetchSample(SB.bank[k].f[0]).then((b) => { if (b && bedKey === bk) { bedKey = null; setBeds(bedV); } });
      }
      bedKey = bk;
    }
    for (const b of beds) b.set(v);
    if (amb) amb.g.gain.setTargetAtTime(0.12 * v * (beds.length ? 0.55 : 1), ctx.currentTime, 0.5);
  }
  A.setAmbience = function (v) { bedV = v; if (amb) setBeds(v); };
  A.drip = function (pos) {
    if (!ctx || smp('drip', pos, 0.25, 1, 1.2) || !voice(0.5)) return;
    const t = ctx.currentTime, out = dest(pos, 1.2); out.gain.value = 0.25;
    const f = vr(1400, 0.3);
    tn({ t, f0: f, f1: f * 1.8, fd: 0.03, d: 0.06, g: 0.12, to: out });
    nz({ t, f: [['bandpass', f, 8]], g: 0.08, d: 0.04, to: out });
    if (Math.random() < 0.5) tn({ t: t + 0.05 + Math.random() * 0.06, f0: f * 0.6, f1: f * 1.1, fd: 0.03, d: 0.05, g: 0.05, to: out }); // (the bubble the drop leaves)
  };
  // ---------- water ----------
  // A body breaking the surface: the slap of it, the hollow body of the splash, a hiss of spray, the drops falling back, and the
  // bubbles it leaves behind. A real bubble rings as it forms (a short tone whose pitch climbs as it closes up), so each is a quick
  // rising chirp, low for a big one, high for a small one.
  function bubbles(t, n, to, f0, f1, g) {
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * 0.14 * (1 + i * 0.25), f = vr(f0 + Math.random() * (f1 - f0), 0.08);
      tn({ t: tt, f0: f, f1: f * (1.45 + Math.random() * 0.7), fd: 0.02 + Math.random() * 0.035, a: 0.002, d: 0.035 + Math.random() * 0.05, g: g * (0.45 + Math.random() * 0.7), to });
    }
  }
  A.bubbles = (pos, n, gain) => { if (!ctx || !voice(0.3)) return; const out = dest(pos, 0.4); out.gain.value *= gain ?? 0.5; bubbles(ctx.currentTime, n || 2, out, 480, 1500, 0.06); };
  // size 0 .. 1.5: a stray shot, a step, a landing, a body, a blast
  A.splash = function (pos, size) {
    if (!ctx || !voice(0.8)) return;
    size = Math.max(0.1, Math.min(1.5, size ?? 0.6));
    if (smp(size >= 0.6 ? 'splash_big' : 'splash_small', pos, 0.48 + size * 0.36, 1.1 - size * 0.12, 0.3 + size * 0.15)) return; // (a recording of water thrown up, where there is one)
    const t = ctx.currentTime, out = dest(pos, 0.3 + size * 0.15); out.gain.value *= 0.48 + size * 0.36; // (a big one stays well clear of clipping)
    nz({ t, f: [['bandpass', vr(1500 - size * 450, 0.15), 0.9, 360, 0.1 + size * 0.08]], g: 0.5 + size * 0.3, a: 0.003, d: 0.08 + size * 0.12, to: out });
    nz({ t: t + 0.008, buf: 'pink', f: [['lowpass', 2300 - size * 700], ['highpass', 160]], g: 0.22 + size * 0.28, a: 0.015, d: 0.2 + size * 0.38, to: out });
    nz({ t: t + 0.03, f: [['highpass', 3400]], g: 0.06 + size * 0.07, a: 0.01, d: 0.16 + size * 0.24, to: out });
    bubbles(t + 0.04, 2 + Math.round(size * 5), out, 360 - size * 120, 1300 - size * 350, 0.055 + size * 0.03);
    if (size > 0.7) tn({ t, f0: 95, f1: 42, d: 0.22 + size * 0.1, g: 0.2 * size, to: out, lp: 260 });
    for (let i = 0, n = 1 + Math.round(size * 3); i < n; i++) { const f = vr(2800, 0.3); tn({ t: t + 0.12 + Math.random() * (0.25 + size * 0.2), f0: f, f1: f * 1.3, fd: 0.012, d: 0.022, g: 0.022 + size * 0.01, to: out }); }
  };
  // the water falling a long way at once (a sluice bursting): a rushing roar that swells and dies over dur seconds
  A.waterRush = function (pos, dur) {
    if (!ctx || !voice(dur)) return;
    const t = ctx.currentTime, out = dest(pos, 0.5); out.gain.value *= 0.9;
    nz({ t, buf: 'brown', f: [['lowpass', 1300], ['highpass', 60]], g: 0.75, a: 0.35, d: dur, to: out });
    nz({ t, buf: 'pink', f: [['bandpass', 1100, 0.6]], g: 0.35, a: 0.25, d: dur * 0.9, to: out });
    nz({ t, f: [['highpass', 3800], ['lowpass', 9000]], g: 0.12, a: 0.3, d: dur * 0.8, to: out });
    bubbles(t + 0.2, 10, out, 260, 900, 0.07);
  };
  // the beds of running water, kept going and only turned up and down (water.js sets them a few times a second):
  //   wade - you moving through it: a swish; fall - the nearest fall from the walls: a deep roar and a hiss, on its side;
  //   brook - the stream: a babble that wanders in pitch; lap - the still water round you: a low lap that comes and goes
  let wb = null;
  function waterBeds() {
    if (wb || !ctx) return wb;
    const bed = (buf, filters, pan, wet) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      let n = s; const fl = [];
      for (const [type, f, q] of filters) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; n.connect(b); n = b; fl.push(b); }
      const am = ctx.createGain(); am.gain.value = 1; n.connect(am);
      const g = ctx.createGain(); g.gain.value = 0; am.connect(g);
      let o = g, p = null; if (pan) { p = ctx.createStereoPanner(); g.connect(p); o = p; }
      o.connect(dry); if (wet) { const w = ctx.createGain(); w.gain.value = wet; o.connect(w); w.connect(revSend); }
      s.start(0, Math.random() * 1.5);
      return { s, g, p, f: fl, am };
    };
    const lfo = (freq, depth, to) => { const o = ctx.createOscillator(); o.frequency.value = freq; const k = ctx.createGain(); k.gain.value = depth; o.connect(k); k.connect(to); o.start(); return o; };
    wb = {
      wade: bed(pink, [['bandpass', 850, 0.8], ['highpass', 200]], false, 0.15),
      fall: bed(brown, [['lowpass', 1500], ['highpass', 45]], true, 0.45),
      fallHiss: bed(white, [['highpass', 3200], ['lowpass', 8500]], true, 0.3),
      brook: bed(pink, [['bandpass', 1500, 1.1], ['highpass', 350]], true, 0.3),
      lap: bed(brown, [['lowpass', 420], ['highpass', 50]], true, 0.35),
    };
    // the brook's band wanders (a babble, not a hiss); the lap swells and ebbs
    lfo(0.9, 520, wb.brook.f[0].frequency); lfo(2.3, 260, wb.brook.f[0].frequency);
    wb.lap.am.gain.value = 0.6; lfo(0.31, 0.4, wb.lap.am.gain); lfo(0.53, 0.2, wb.lap.am.gain);
    wb.wade.am.gain.value = 0.75; lfo(1.7, 0.25, wb.wade.am.gain);
    return wb;
  }
  A.waterBed = function (o) {
    const b = waterBeds(); if (!b) return;
    const t = ctx.currentTime, set = (n, v, pan) => { n.g.gain.setTargetAtTime(Math.max(0, v), t, 0.18); if (n.p && pan !== undefined) n.p.pan.setTargetAtTime(pan, t, 0.2); };
    set(b.wade, (o.wade || 0) * 0.55); set(b.fall, (o.fall || 0) * 0.55, o.fallPan); set(b.fallHiss, (o.fall || 0) * 0.09, o.fallPan);
    set(b.brook, (o.brook || 0) * 0.55, o.brookPan); set(b.lap, (o.lap || 0) * 0.2, o.lapPan);
    // (called about ten times a second) the stream's bubbles and gurgles, the odd plop in still water, the slosh of your legs
    if (o.brook > 0.05 && Math.random() < o.brook * 0.6 && voice(0.3)) { const out = dest(null, 0.3); out.gain.value = 0.55 * o.brook; if (o.brookPan) { const p = ctx.createStereoPanner(); p.pan.value = o.brookPan; out.disconnect(); out.connect(p); p.connect(dry); } bubbles(t, 1 + (Math.random() < 0.45 ? 1 : 0), out, 520, 1700, 0.05); }
    if (o.lap > 0.2 && Math.random() < o.lap * 0.06 && voice(0.3)) { const out = dest(null, 0.5); out.gain.value = 0.3 * o.lap; bubbles(t, 1, out, 300, 700, 0.06); }
    if (o.wade > 0.2 && Math.random() < o.wade * 0.35 && voice(0.3)) { const out = dest(null, 0.2); out.gain.value = 0.5 * o.wade; bubbles(t, 1, out, 600, 1500, 0.04); nz({ t, buf: 'pink', f: [['bandpass', vr(1200, 0.3), 1.2]], g: 0.08 * o.wade, a: 0.03, d: 0.15, to: out }); }
  };

  // ominous low drone for the boss approach: detuned sub tones + a breathing, filtered rumble
  A.drone = function () {
    if (!ctx) return { set() {}, stop() {} };
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(dest(null, 0.35));
    const oscs = [];
    for (const [f, g] of [[41, 0.5], [41.7, 0.4], [61.5, 0.22], [123.4, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(out); o.start(); oscs.push(o);
    }
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.value = 0.6; src.connect(lp); lp.connect(ng); ng.connect(out); src.start();
    // slow "breathing" swell
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 0.35; lfo.connect(lg); lg.connect(ng.gain); lfo.start();
    return {
      set(v) { out.gain.setTargetAtTime(Math.max(0.0001, v * 0.55), ctx.currentTime, 0.4); lp.frequency.setTargetAtTime(120 + v * 220, ctx.currentTime, 0.5); },
      stop() { out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => { try { oscs.forEach((o) => o.stop()); src.stop(); lfo.stop(); } catch (e) {} }, 1600); },
    };
  };
  // The hidden "extra" difficulty. k = 0 .. 1 (extra 1 .. 10): the lower, the heavier.
  // sting: the way down (ui.js: the dark closes in over half a second, then the world changes) - air drawn in as the dark closes, then,
  // as it changes, the floor going out from under (a sub tone falling away), one dull blow, and a great iron door far below: a toll of
  // partials that do not agree, dying over three seconds, with cold air after it. short: only the toll, smaller (a step of the level).
  // rise: the way back up - the same air, let out. drone: sub tones that sit lower (and louder) the higher the level.
  A.hellSting = function (k, short) {
    if (!ctx) return;
    k = Math.max(0, Math.min(1, k || 0));
    const t0 = ctx.currentTime, out = dest(null, 0.5); out.gain.value = 0.85;
    const hit = short ? t0 : t0 + 0.54, m = short ? 0.55 : 1;
    if (!short) {
      nz({ t: t0, buf: 'brown', f: [['bandpass', 160, 0.9, 760, 0.52]], g: 0.55, a: 0.46, d: 0.56, to: out });
      nz({ t: t0, buf: 'pink', f: [['highpass', 1800, 0.6, 5200, 0.52]], g: 0.08, a: 0.48, d: 0.56, to: out });
      tn({ t: t0, f0: 92, f1: 50, d: 0.56, g: 0.3, to: out, type: 'sine' });
      tn({ t: hit, f0: 78, f1: 31 - k * 9, d: 2.8 + k * 1.2, g: 0.85, to: out, type: 'sine' });
      tn({ t: hit, f0: 60, f1: 25, d: 0.34, g: 0.95, to: out, type: 'sine' });
      nz({ t: hit, buf: 'brown', f: [['lowpass', 300, 0.7, 70, 0.5]], g: 0.6, a: 0.004, d: 0.55, to: out });
      nz({ t: hit + 0.08, buf: 'white', f: [['bandpass', 3200, 0.5]], g: 0.045, a: 0.5, d: 3.0, to: out });
    }
    const base = 104 - k * 26;
    for (const [r, g, d] of [[1, 0.3, 3.6], [1.47, 0.2, 3.0], [2.09, 0.13, 2.3], [2.56, 0.09, 1.9], [3.34, 0.06, 1.3], [4.2, 0.035, 0.9]])
      tn({ t: hit + 0.012, f0: base * r, f1: base * r * 0.988, d: d * (short ? 0.6 : 1), g: g * m, to: out, type: 'sine' });
  };
  A.hellRise = function () {
    if (!ctx) return;
    const t0 = ctx.currentTime, out = dest(null, 0.4); out.gain.value = 0.6;
    nz({ t: t0, buf: 'brown', f: [['bandpass', 520, 0.8, 150, 0.9]], g: 0.4, a: 0.3, d: 1.0, to: out });
    tn({ t: t0, f0: 46, f1: 74, d: 0.7, g: 0.3, to: out, type: 'sine' });
    tn({ t: t0 + 0.54, f0: 196, f1: 194, d: 1.4, g: 0.07, to: out, type: 'sine' });
  };
  A.hellDrone = function (k) {
    if (!ctx) return { set() {}, stop() {} };
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(dest(null, 0.3));
    const oscs = [];
    const mk = (f, g, type) => { const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(out); o.start(); oscs.push([o, f]); return o; };
    mk(36, 0.6); mk(36.6, 0.5); mk(54, 0.18); mk(72.3, 0.07, 'triangle');
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120; lp.Q.value = 2;
    const ng = ctx.createGain(); ng.gain.value = 0.5; src.connect(lp); lp.connect(ng); ng.connect(out); src.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(ng.gain); lfo.start();
    const set = (v) => {
      v = Math.max(0, Math.min(1, v)); const now = ctx.currentTime;
      out.gain.setTargetAtTime(0.35 + v * 0.45, now, 0.6);
      for (const [o, f] of oscs) o.frequency.setTargetAtTime(f * (1 - v * 0.42), now, 0.8); // the whole drone sinks
      lp.frequency.setTargetAtTime(150 - v * 80, now, 0.8);
    };
    set(k || 0);
    return { set, stop() { out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => { try { oscs.forEach(([o]) => o.stop()); src.stop(); lfo.stop(); } catch (e) { /* ignore */ } }, 1600); } };
  };
  // breathy whisper somewhere around the listener
  A.whisper = function (pos) {
    if (!ctx || !voice(0.5)) return;
    const t = ctx.currentTime, out = dest(pos, 0.6); out.gain.value = 0.5;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + i * vr(0.16, 0.4);
      nz({ t: tt, buf: 'white', f: [['bandpass', vr(1800, 0.35), 6, vr(900, 0.3), 0.18], ['highpass', 600]], g: 0.16, a: 0.04, d: vr(0.16, 0.3), to: out });
      nz({ t: tt, buf: 'pink', f: [['bandpass', vr(3200, 0.2), 9]], g: 0.05, a: 0.03, d: 0.12, to: out });
    }
  };
  // ---- spawn graves: a grave stirring (k 0..1: how close it is to opening) and the moment it opens ----
  A.graveStir = function (k, pos) {
    if (!ctx || !voice(0.8)) return;
    const t = ctx.currentTime, out = dest(pos, 0.7); out.gain.value = 0.4 + k * 0.6;
    // a low wet thump from underneath, earth shifting, and a thin breath that comes nearer
    tn({ t, f0: 78 + k * 40, f1: 40, d: 0.32, g: 0.7, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 300 + k * 350, 0.7]], g: 0.55, a: 0.04, d: 0.4, to: out });
    if (k > 0.25) nz({ t: t + 0.04, buf: 'pink', f: [['bandpass', 800 + k * 1500, 4, 450, 0.45]], g: 0.1 + 0.12 * k, a: 0.12, d: 0.5, to: out });
    if (k > 0.7) tn({ t, f0: 210 + k * 120, f1: 150, d: 0.4, g: 0.05, to: out, type: 'sawtooth', lp: 900 });
  };
  A.graveRise = function (pos) {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(pos, 0.9); out.gain.value = 0.9;
    tn({ t, f0: 90, f1: 30, d: 0.6, g: 0.9, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 900, 0.7, 150, 0.7]], g: 0.9, a: 0.01, d: 0.8, to: out });
    for (let i = 0; i < 9; i++) nz({ t: t + Math.random() * 0.35, f: [['bandpass', vr(1800, 0.5), 3]], g: 0.18, d: 0.05, to: out });  // the earth cracking
    nz({ t: t + 0.1, buf: 'pink', f: [['bandpass', 600, 3, 2400, 0.7]], g: 0.35, a: 0.2, d: 0.7, to: out });                              // a hollow gust
  };
  // boiling lava: one bloop (blue: a little higher and glassier), and a bed of bubbling that swells as you near lava
  A.lavaPop = function (pos, blue) {
    if (!ctx || !voice(0.25)) return;
    const t = ctx.currentTime, out = dest(pos, 0.3); out.gain.value = 0.14;
    const f = vr(blue ? 150 : 105, 0.35);
    tn({ t, f0: f * 0.6, f1: f * 1.6, fd: 0.09, d: 0.16, g: 0.5, to: out, type: 'sine' });
    nz({ t: t + 0.03, buf: 'brown', f: [['bandpass', f * 2, 2]], g: 0.25, d: 0.08, to: out });
    if (Math.random() < 0.3) tn({ t: t + 0.1, f0: f * 0.8, f1: f * 1.7, fd: 0.07, d: 0.12, g: 0.25, to: out, type: 'sine' }); // a second, smaller one
  };
  let boil = null;
  A.boilBed = function (v, blue) {
    if (!ctx) return;
    if (!boil) {
      const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 230; f.Q.value = 1.3;
      const mod = ctx.createGain(); mod.gain.value = 0.65;   // the bubbling flutter
      const l1 = ctx.createOscillator(); l1.frequency.value = 5.3; const lg1 = ctx.createGain(); lg1.gain.value = 0.35; l1.connect(lg1); lg1.connect(mod.gain);
      const l2 = ctx.createOscillator(); l2.frequency.value = 8.7; const lg2 = ctx.createGain(); lg2.gain.value = 0.2; l2.connect(lg2); lg2.connect(mod.gain);
      const g = ctx.createGain(); g.gain.value = 0.0001;      // how near the lava is
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 90;
      src.connect(f); f.connect(hp); hp.connect(mod); mod.connect(g); g.connect(dest(null, 0.1));
      src.start(); l1.start(); l2.start();
      boil = { g, f };
    }
    boil.g.gain.setTargetAtTime(Math.max(0.0001, v * 0.055), ctx.currentTime, 0.25);
    boil.f.frequency.setTargetAtTime(blue ? 170 : 120, ctx.currentTime, 0.4);
  };
  // distant thunder roll
  A.thunder = function (delay) {
    if (!ctx) return;
    if (!delay && smp('thunder', null, 0.9, 1, 0.5)) return;
    if (delay && usable('thunder') && SB.bank.thunder.f.some((f) => bufs[f])) { setTimeout(() => A.thunder(0), delay * 1000); return; }
    const t = ctx.currentTime + (delay || 0), out = dest(null, 0.5); out.gain.value = 0.9;
    nz({ t, buf: 'white', f: [['lowpass', 2400]], g: 0.35, a: 0.005, d: 0.25, to: out });
    nz({ t: t + 0.05, buf: 'brown', f: [['lowpass', 260, 0.8, 80, 3]], g: 1.0, a: 0.15, d: 3.2, to: out });
  };
  // prying an ornate chest: a wooden creak plus a rattling lock, both rising in pitch with progress (k 0..1)
  // (what is searched: a chest creaks and its lock rattles; a body, a bag, a heap is gone through with the hands - cloth and leather)
  let pryAt = 0;
  A.chestPry = function (k, pos, soft) {
    if (!ctx) return;
    if (soft) {
      if (smp('rummage', pos, 0.5 + k * 0.2, 0.92 + k * 0.16, 0.1)) return;
      if (!voice(0.2)) return;
      const t = ctx.currentTime, out = dest(pos, 0.1);
      nz({ t, buf: 'pink', f: [['bandpass', vr(900, 0.3), 0.9], ['lowpass', 2600]], g: 0.22 + k * 0.1, a: 0.03, d: vr(0.14, 0.3), to: out });
      return;
    }
    // (a recorded creak lasts: one at a time, not one on top of the other at every tick)
    if (usable('chest_pry')) { const now = ctx.currentTime; if (now < pryAt) return; if (smp('chest_pry', pos, 0.5 + k * 0.3, 0.85 + k * 0.3, 0.15)) { pryAt = now + 0.55 - k * 0.2; return; } }
    const t = ctx.currentTime, out = dest(pos, 0.15);
    nz({ t, buf: 'brown', f: [['bandpass', vr(260 + k * 480, 0.15), 6, vr(420 + k * 700, 0.1), 0.14]], g: 0.55 + k * 0.35, a: 0.012, d: vr(0.13, 0.3), to: out, rate: 0.6 });
    nz({ t: t + 0.012, buf: 'white', f: [['bandpass', vr(3000 + k * 1600, 0.2), 10]], g: 0.22 + k * 0.28, d: 0.03, to: out });
    if (Math.random() < 0.6) tn({ t: t + 0.02, f0: vr(1700 + k * 900, 0.1), f1: vr(1400 + k * 700, 0.1), d: 0.05, g: 0.06 + k * 0.08, to: out, type: 'triangle' });
  };
  // the lock finally snaps: click + thud + a short shimmer
  A.chestUnlock = function (pos) {
    if (!ctx || smp('chest_unlock', pos, 0.7, 1, 0.3)) return;
    const t = ctx.currentTime, out = dest(pos, 0.3);
    nz({ t, buf: 'white', f: [['bandpass', 2600, 4]], g: 0.7, d: 0.05, to: out });
    tn({ t, f0: 2300, f1: 1400, d: 0.12, g: 0.25, to: out, type: 'triangle' });
    tn({ t: t + 0.02, f0: 150, f1: 55, d: 0.28, g: 0.7, to: out });
    for (let i = 0; i < 3; i++) tn({ t: t + 0.09 + i * 0.07, f0: 1500 + i * 450, d: 0.5, g: 0.07, to: out });
  };
  // 一点集中 (狙撃手): k = 1..3 a soft rising blip as the gauge fills, 4 = full (a small two-note chime)
  A.focus = function (k) {
    if (!ctx) return;
    if (NEW()) { SN.focus(k); return; }
    const t = ctx.currentTime, out = dest(null, 0.05);
    if (k < 4) { out.gain.value = 0.2; tn({ t, f0: 640 + k * 170, d: 0.05, g: 0.25, to: out, type: 'sine' }); }
    else { out.gain.value = 0.3; tn({ t, f0: 1180, d: 0.16, g: 0.22, to: out, type: 'triangle' }); tn({ t: t + 0.07, f0: 1770, d: 0.24, g: 0.18, to: out, type: 'triangle' }); }
  };
  // clock tick for timed challenges: 0 = normal, 1 = urgent (higher, louder), 2 = half-second tock in the last seconds
  A.tick = function (lvl, sec) {
    if (!ctx || smp('tick', null, lvl === 2 ? 0.35 : lvl === 1 ? 0.95 : 0.6, lvl === 1 ? 1.3 : lvl === 2 ? 0.8 : 1, 0.05)) return;
    if (NEW()) { SN.tick(lvl, sec); return; }
    const t = ctx.currentTime, out = dest(null, 0.05); out.gain.value = lvl === 2 ? 0.35 : lvl === 1 ? 0.95 : 0.6;
    const f = lvl === 2 ? 900 : lvl === 1 ? 1500 + (5 - (sec || 5)) * 120 : 1150;
    nz({ t, buf: 'white', f: [['bandpass', f * 2, 8]], g: 0.5, d: 0.025, to: out });
    tn({ t, f0: f, f1: f * 0.92, d: lvl === 1 ? 0.12 : 0.06, g: 0.35, to: out, type: 'triangle' });
    if (lvl === 1) tn({ t: t + 0.005, f0: f * 2.01, d: 0.08, g: 0.12, to: out, type: 'sine' });
  };
  // soft gust of wind for open-air stages
  A.wind = function (v) {
    if (!ctx || smp('wind', null, 0.18 * (v || 1), 1, 0.1) || !voice(0.3)) return;
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.18 * (v || 1);
    nz({ t, buf: 'pink', f: [['bandpass', vr(450, 0.4), 0.9]], g: 0.25, a: 0.6 + Math.random() * 0.6, d: 1.8 + Math.random() * 1.4, to: out });
    nz({ t: t + 0.3, buf: 'pink', f: [['bandpass', vr(1300, 0.3), 2.5]], g: 0.07, a: 0.8, d: 1.6, to: out });
  };
  // ---------- the power plant's electricity (elec.js: live floors, high-voltage arcs, their switch boxes) ----------
  // Real current, not rays: the hum of 50 Hz mains and its overtones (a transformer's core hums at twice the line, 100 Hz, and the
  // overtones carry it to small speakers), the sizzle of a discharge bunched at every half cycle of the current, the crack of an arc
  // striking, the knock and ring of a contactor pulling in and of a breaker's latch thrown. Every sound is written into buffers (a few
  // takes of each, played in turn). The running sound of a live device is a loop written once (whole cycles of 50 Hz; its noise run
  // twice through its filters and the second pass kept, so its end meets its start: no seam), played through a chain of its own that
  // follows you. A running sound fades out by itself 0.3 s after its device last asked for it (a pause, death, an area left: no ask,
  // no sound), at most four run at once (the nearest), and none farther than 42 m.
  const EHZ = 50;
  A.elecStats = { prep: {}, mix: {} };
  // one cycle of mains hum: harmonics of 50 Hz at these levels (index 0 = 50 Hz), driven into a soft clip by drive (its rasp);
  // ph: the harmonics' phases (random when not given)
  function humTab(amps, drive, ph) {
    const P = Math.round(ctx.sampleRate / EHZ), t = new Float32Array(P);
    ph = ph || amps.map(() => Math.random() * 6.283);
    let pk = 0;
    for (let i = 0; i < P; i++) { let v = 0; for (let h = 0; h < amps.length; h++) if (amps[h]) v += amps[h] * Math.sin((2 * Math.PI * (h + 1) * i) / P + ph[h]); t[i] = v; pk = Math.max(pk, Math.abs(v)); }
    const k = ftanh(drive);
    for (let i = 0; i < P; i++) t[i] = ftanh((drive * t[i]) / (pk || 1)) / k;
    return t;
  }
  const tabAt = (t, ph) => { const P = t.length, i0 = Math.floor(ph), f = ph - i0, i = i0 % P; return t[i] + (t[(i + 1) % P] - t[i]) * f; };
  // (the hum of a live floor's plates, of a wire's arc - rougher, more overtones - and of the hall's supply coming up)
  const HUMF = [0.2, 1, 0.3, 0.45, 0.12, 0.2, 0.05, 0.1, 0, 0.05, 0, 0.03];
  const HUMA = [0.35, 1, 0.55, 0.5, 0.3, 0.35, 0.2, 0.25, 0.12, 0.15, 0.08, 0.1, 0.05, 0.06];
  const HUMW = [0.35, 1, 0.4, 0.5, 0.2, 0.3, 0.1, 0.15, 0.05, 0.08];
  // |sin| of the line, sharpened: the current peaks twice a cycle, and a discharge sizzles in bunches at each peak (0..1)
  const pulse = (i, sr, e) => Math.pow(Math.abs(Math.sin((Math.PI * 2 * EHZ * i) / sr)), e);
  // a tick of noise (a spark, a strike) written from i0, te samples to fall by e; wrap: round the end of x to its start (a loop)
  function tickIn(x, i0, amp, te, wrap) {
    const n = x.length, m = Math.ceil(te * 7);
    for (let j = 0; j < m; j++) { let k = i0 + j; if (k >= n) { if (!wrap) break; k -= n; } x[k] += (Math.random() * 2 - 1) * amp * Math.exp(-j / te); }
  }
  // a loop's filters: x is one period; run twice through them, the second pass kept (it starts where the first ended)
  function loopRun(x, fl, sr) {
    const n = x.length, y = new Float32Array(2 * n); y.set(x); y.set(x, n);
    for (const [ty, f, q] of fl) bqRun(y, ty, f, q, sr);
    x.set(y.subarray(n)); return x;
  }
  // a slow wander that loops: sines of whole turns in n samples (-1..1), as a table (worked out every 32 samples: it moves slowly)
  function wander(n, ms) {
    const ph = ms.map(() => Math.random() * 6.283), w = new Float32Array(n);
    for (let i = 0; i < n; i += 32) { let v = 0; for (let k = 0; k < ms.length; k++) v += Math.sin((2 * Math.PI * ms[k] * i) / n + ph[k]); v /= ms.length; for (let j = i, e = Math.min(n, i + 32); j < e; j++) w[j] = v; }
    return w;
  }
  // pulse() over one cycle of the line, as a table (a loop's worth of it read from here)
  function pulseTab(sr, e) { const P = Math.round(sr / EHZ), t = new Float32Array(P); for (let i = 0; i < P; i++) t[i] = pulse(i, sr, e); return t; }
  // a gate that loops: stretches s0..s1 s long, each at a level of its own (the discharge busier a while, then quieter), eased
  function gateLoop(n, sr, s0, s1, lo, hi) {
    const g = new Float32Array(n); let i = 0;
    while (i < n) { const len = Math.round((s0 + Math.random() * (s1 - s0)) * sr), v = lo + Math.pow(Math.random(), 1.5) * (hi - lo); for (let j = 0; j < len && i < n; j++, i++) g[i] = v; }
    const k = Math.exp(-1 / (0.012 * sr)), o = Float32Array.from(g); let s = o[n - 1];
    for (let r = 0; r < 2; r++) for (let j = 0; j < n; j++) { s = o[j] + (s - o[j]) * k; if (r) g[j] = s; }
    return g;
  }
  // an arc striking: m strikes of noise a few tenths of a ms each, within span s (the first the loudest), high-passed - a crack
  function arcCrackIn(L, R, i0, g, m, span, pan, sr) {
    const n = Math.min(L.length - i0, Math.round((span * 2 + 0.01) * sr)); if (n <= 0) return;
    const x = new Float32Array(n);
    let o = 0;
    for (let s = 0; s < m && o < n; s++) { tickIn(x, o, s ? 0.35 + Math.random() * 0.5 : 1, (0.00015 + Math.random() * 0.00035) * sr, false); o += Math.round(((Math.random() * 2 * span) / Math.max(1, m - 1)) * sr) + 1; }
    bqRun(x, 'hp', 700, 0.7, sr);
    const gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan);
    for (let j = 0; j < n; j++) { L[i0 + j] += x[j] * gl; R[i0 + j] += x[j] * gr; }
  }
  // the buzz of the current: the hum's cycle (tab) played d s from i0, its pitch going f0 to f1 Hz in fd s, at env(t) * g
  function buzzIn(L, R, i0, d, tab, f0, f1, fd, env, g, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)), P = tab.length; let ph = Math.random() * P;
    for (let j = 0; j < n; j++) { const t = j / sr, f = f0 * Math.pow(f1 / f0, Math.min(1, t / fd)); ph += (P * f) / sr; if (ph >= P) ph -= P; const v = tabAt(tab, ph) * env(t) * g; L[i0 + j] += v; R[i0 + j] += v; }
  }
  // the sizzle (ジジジ): noise bunched at the current's peaks (e: how sharply), at env(t) * g, through a band at f; each ear its own
  function sizzleIn(L, R, i0, d, env, g, f, q, e, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 0) return;
    for (const X of [L, R]) {
      const z = new Float32Array(n);
      for (let j = 0; j < n; j++) z[j] = (Math.random() * 2 - 1) * (0.15 + 0.85 * pulse(j, sr, e)) * env(j / sr);
      bqRun(z, 'bp', f, q, sr); bqRun(z, 'hp', f * 0.45, 0.7, sr);
      for (let j = 0; j < n; j++) X[i0 + j] += z[j] * g;
    }
  }
  // sparks spitting (パチパチ): ticks r0 going to r1 a second over d s, uneven (most small), each to a side of its own, through f
  function sparksIn(L, R, i0, d, r0, r1, g, f, sr) {
    const n = Math.min(L.length - i0, Math.round(d * sr)); if (n <= 0) return;
    const xl = new Float32Array(n), xr = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const u = j / n;
      if (Math.random() < (r0 * Math.pow(r1 / r0, u)) / sr) { const a = Math.pow(Math.random(), 2) * (1 - 0.7 * u), p = Math.random() * 2 - 1, te = (0.00006 + Math.random() * 0.00025) * sr; tickIn(xl, j, a * Math.min(1, 1 - p), te, false); tickIn(xr, j, a * Math.min(1, 1 + p), te, false); }
    }
    for (const x of [xl, xr]) { bqRun(x, 'bp', f, 0.7, sr); bqRun(x, 'hp', 1500, 0.7, sr); }
    for (let j = 0; j < n; j++) { L[i0 + j] += xl[j] * g; R[i0 + j] += xr[j] * g; }
  }
  // the running sound of a live device, as a loop: kind 'zone' (a live floor: a low, broad hum, a soft sizzle, sparse crackle, now
  // and then a spark leaping a gap on the plates) or 'arc' (a live wire: the harsh buzz of an arc burning, a roar of noise pulsing at
  // the current's peaks, a dense crackle and the snaps of its channel jumping)
  const ELOOP = {};
  function elecLoop(kind) {
    const sr = ctx.sampleRate, arc = kind === 'arc', P = Math.round(sr / EHZ), n = P * (arc ? 90 : 120);
    const b = ctx.createBuffer(2, n, sr), C = [b.getChannelData(0), b.getChannelData(1)];
    const amps = arc ? HUMA : HUMF, drive = arc ? 2.8 : 1.5, ph = amps.map(() => Math.random() * 6.283);
    // (each ear the same 50 and 100 Hz, its upper harmonics at phases of their own: wide, and nothing cancels when the two are summed)
    const tabs = [humTab(amps, drive, ph), humTab(amps, drive, ph.map((p, h) => (h > 1 ? Math.random() * 6.283 : p)))];
    const wb = wander(n, arc ? [2, 5, 11] : [1, 3, 7]), ww = wander(n, [4, 9, 17]);
    const gate = gateLoop(n, sr, arc ? 0.04 : 0.08, arc ? 0.25 : 0.4, arc ? 0.35 : 0.15, 1);
    const ev = [], sn = [];
    for (let e = 0, m = Math.round((arc ? 110 : 34) * (n / sr)); e < m; e++) { const i0 = Math.floor(Math.random() * n); ev.push([i0, Math.pow(Math.random(), 2.4) * (0.4 + 0.6 * gate[i0]), (0.00008 + Math.random() * 0.0003) * sr, (Math.random() * 2 - 1) * (arc ? 0.25 : 0.7)]); }
    for (let e = 0, m = Math.round((arc ? 9 : 2.2) * (n / sr)); e < m; e++) {
      const st = []; let o = 0;
      for (let s = 0, k = 1 + Math.floor(Math.random() * (arc ? 4 : 2)); s < k; s++) { st.push([o, s ? 0.3 + Math.random() * 0.4 : 1, (0.0002 + Math.random() * 0.0003) * sr]); o += Math.round((0.0008 + Math.random() * 0.003) * sr); }
      sn.push([Math.floor(Math.random() * n), 0.6 + 0.4 * Math.random(), (Math.random() * 2 - 1) * (arc ? 0.2 : 0.6), st]);
    }
    const mix = { hum: 0, sizzle: 0, crackle: 0, snap: 0 }, rms = (x, g) => { let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i]; return Math.sqrt(s / n) * g; };
    // the sizzle: noise bunched at the current's peaks, busier and quieter by turns (one for both ears: the right reads it 9 half
    // cycles later - the same bunching, other noise)
    const z = new Float32Array(n), pz = pulseTab(sr, arc ? 3 : 6), off = (P / 2) * 9;
    for (let i = 0, j = 0; i < n; i++, j++) { if (j === P) j = 0; z[i] = (Math.random() * 2 - 1) * (0.2 + 0.8 * pz[j]) * gate[i] * (arc ? 0.7 + 0.3 * ww[i] : 1); }
    loopRun(z, arc ? [['bp', 1500, 0.45], ['hp', 450, 0.7]] : [['bp', 3400, 0.7], ['hp', 1600, 0.7], ['lp', 6500, 0.7]], sr);
    const zg = arc ? 0.88 : 0.8, kg = arc ? 5.5 : 8, qg = arc ? 2.8 : 3.6;
    for (let c = 0; c < 2; c++) {
      const X = C[c], t = tabs[c], side = c ? 1 : -1;
      const hg = arc ? 0.5 : 0.62;
      for (let i = 0, j = 0; i < n; i++, j++) { if (j === P) j = 0; X[i] = t[j] * hg * (arc ? 0.75 + 0.25 * wb[i] : 0.88 + 0.12 * wb[i]); }
      if (!c) mix.hum = rms(X, 1);
      // the crackle, and the snaps (a little louder, a strike or a few)
      const k = new Float32Array(n), q = new Float32Array(n);
      for (const [i0, a, te, pan] of ev) tickIn(k, i0, a * Math.min(1, 1 + side * pan), te, true);
      loopRun(k, arc ? [['bp', 3200, 0.6], ['hp', 900, 0.7]] : [['bp', 2600, 0.6], ['hp', 900, 0.7], ['lp', 6500, 0.7]], sr);
      for (const [i0, a, pan, st] of sn) for (const [o, sa, te] of st) tickIn(q, (i0 + o) % n, a * sa * Math.min(1, 1 + side * pan), te, true);
      loopRun(q, arc ? [['hp', 500, 0.7]] : [['hp', 500, 0.7], ['lp', 6500, 0.7]], sr);
      if (!c) { mix.sizzle = rms(z, zg); mix.crackle = rms(k, kg); mix.snap = rms(q, qg); }
      for (let i = 0, j = c ? off : 0; i < n; i++, j++) { if (j >= n) j -= n; X[i] += z[j] * zg + k[i] * kg + q[i] * qg; }
    }
    // (brought to one level by its rms, not its highest peak: the sparks are random, and a loop scaled by its biggest one came out
    // some dB louder or quieter each time it was written; the few peaks left over 0.7 are bent softly under 1)
    let sq = 0, pk = 0; for (const X of C) for (let i = 0; i < n; i++) sq += X[i] * X[i];
    const sc = 0.1 / (Math.sqrt(sq / (2 * n)) || 1);
    for (const X of C) for (let i = 0; i < n; i++) { let v = X[i] * sc; const a = Math.abs(v); if (a > 0.7) v = Math.sign(v) * (0.7 + 0.29 * ftanh((a - 0.7) / 0.29)); X[i] = v; pk = Math.max(pk, Math.abs(v)); }
    for (const m in mix) mix[m] = +(20 * Math.log10(Math.max(1e-9, mix[m] * sc))).toFixed(1);
    mix.peak = +pk.toFixed(2);
    A.elecStats.mix[kind] = mix;
    return b;
  }
  // the loops written ahead (elec.js asks when an area with devices is set up; once a session: one of each kind, some tens of ms;
  // each running sound starts somewhere else in it, a little faster or slower, with the sparks of elec.js over it)
  A.elecPrep = function () {
    if (!ctx) return;
    A.elecStats.loops = ELOOP;
    for (const k of ['zone', 'arc']) if (!ELOOP[k]) { const t0 = performance.now(); ELOOP[k] = [elecLoop(k)]; A.elecStats.prep[k] = +(performance.now() - t0).toFixed(1); }
  };
  // the running sounds: one per live device, kept by key (the device). k: its level (0..1)
  const EHUM = { zone: 0.29, arc: 0.38 }, HUMMAX = 4, HUMFAR = 42;
  const hums = new Map(); let humSweep = 0;
  function humEnd(h, fade) {
    if (!hums.has(h.key)) return;
    hums.delete(h.key);
    const now = ctx.currentTime;
    try { h.g.gain.cancelScheduledValues(now); h.g.gain.setTargetAtTime(0.0001, now, fade || 0.05); } catch (e) { /* gone */ }
    setTimeout(() => { try { h.src.stop(); } catch (e) { /* stopped */ } for (const x of [h.src, h.g, h.lp, h.p, h.s]) try { x.disconnect(); } catch (e) { /* none */ } }, ((fade || 0.05) * 8 + 0.05) * 1000);
    if (!hums.size && humSweep) { clearInterval(humSweep); humSweep = 0; }
  }
  function humStart(key, kind) {
    A.elecPrep();
    const set = ELOOP[kind] || ELOOP.zone, buf = set[Math.floor(Math.random() * set.length)];
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = vr(1, 0.012);
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000;
    const p = ctx.createStereoPanner(), s = ctx.createGain(); s.gain.value = 0;
    src.connect(g); g.connect(lp); lp.connect(p); p.connect(dry); p.connect(s); s.connect(revSend);
    src.start(ctx.currentTime, Math.random() * buf.duration);
    const h = { key, kind, src, g, lp, p, s, dist: 0, seen: 0, at: -1 };
    hums.set(key, h);
    // (a sweep for the ones no longer asked for: a running sound fades by its own automation, this lets its nodes go)
    if (!humSweep) humSweep = setInterval(() => { const now = performance.now(); for (const x of [...hums.values()]) if (now - x.seen > 700) humEnd(x, 0.05); }, 300);
    return h;
  }
  // (elec.js, every frame a device is live) where its sound comes from (the nearest point of the floor or the wire to you)
  A.elecHum = function (key, kind, pos, k) {
    if (!ctx || !pos || ctx.state !== 'running') return;
    const L = A.listener, dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(dist)) return;
    let h = hums.get(key);
    if (!h) {
      if (dist >= HUMFAR) return;
      if (hums.size >= HUMMAX) {
        let worst = null; for (const x of hums.values()) if (!worst || x.dist > worst.dist) worst = x;
        if (worst.dist <= dist) return;
        humEnd(worst, 0.1);
      }
      h = humStart(key, kind);
    }
    h.dist = dist; h.seen = performance.now();
    if (dist >= HUMFAR) { humEnd(h, 0.15); return; }
    const now = ctx.currentTime;
    if (now - h.at < 0.08) return;
    h.at = now;
    // as dest() places a sound: the fall-off with distance, the air taking the highs, what is behind you duller, the pan; the room more
    const att = 1 / (1 + Math.max(0, dist - 2) * 0.09), edge = Math.min(1, (HUMFAR - dist) / 8);
    const lv = Math.max(0.0001, EHUM[kind] * att * edge * (k === undefined ? 1 : k));
    const ang = Math.atan2(dx, -dz) - (A.listenerYawNeg || 0), c = Math.cos(ang);
    let f = Math.max(900, 16000 / (1 + dist * 0.08)); if (c < 0) f *= 0.62 + 0.38 * (1 + c);
    const gg = h.g.gain;
    gg.cancelScheduledValues(now); gg.setTargetAtTime(lv, now, 0.06);
    gg.setTargetAtTime(0.0001, now + 0.3, 0.06);   // (the dead man's fade: asked for again before then, it is pushed back)
    h.lp.frequency.setTargetAtTime(f, now, 0.08);
    h.p.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, Math.sin(ang) * Math.min(1, dist / 4))), now, 0.08);
    h.s.gain.setTargetAtTime(0.22 * (1 + Math.min(1.5, dist * 0.03)), now, 0.1);
  };
  // stop one running sound (key), or every one (no key)
  A.elecHumStop = function (key, fade) {
    if (!ctx) return;
    if (key === undefined || key === null) { for (const h of [...hums.values()]) humEnd(h, fade); return; }
    const h = hums.get(key); if (h) humEnd(h, fade);
  };
  A.elecHumN = () => hums.size;
  // the warning (about d s, in the whole hall): the plant's supply coming up - its hum climbing from low and slow to 50 Hz and loud,
  // the building's weight under it - stuttering with the lamps (dips held a few frames, more of them toward the end), the contacts
  // chattering at each dip, a sizzle swelling into the moment it goes live. Returns { keep(), stop(fade) }: kept alive by keep() every
  // frame of the warning; left without it (a pause), it fades in 0.25 s, and after 0.6 s without it stays silent (a stall of a frame or
  // two lets it come back)
  A.elecWarn = function (d) {
    if (!ctx) return null;
    d = d || 1.5;
    const secs = d + 0.4, gain = 0.42;
    const out = fxPlay('e:warn', 2, secs, (L, R, sr) => {
      const n = L.length, P = Math.round(sr / EHZ), base = HUMW.map(() => Math.random() * 6.283);
      const tl = humTab(HUMW, 1.3, base), tr = humTab(HUMW, 1.3, base.map((p, h) => (h > 1 ? Math.random() * 6.283 : p)));
      const st = new Float32Array(n), ks = Math.exp(-1 / (0.004 * sr)), chat = [];
      let seg = 0, lv = 1, sm = 1;
      for (let i = 0; i < n; i++) {
        const u = Math.min(1, i / (d * sr));
        if (--seg <= 0) { seg = Math.round((0.033 + Math.random() * 0.1) * sr); const dip = i < d * sr && Math.random() < 0.2 + 0.45 * u; lv = dip ? 0.3 + Math.random() * 0.3 : 0.9 + Math.random() * 0.2; if (dip) chat.push(i); }
        sm = lv + (sm - lv) * ks; st[i] = sm;
      }
      const env = (t) => (t < d ? 0.05 + 0.95 * Math.pow(t / d, 1.8) : Math.exp(-(t - d) / 0.08));
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr, u = Math.min(1, t / d), f = EHZ * (0.62 + 0.38 * (1 - Math.pow(1 - u, 2.2))); ph += (P * f) / sr; if (ph >= P) ph -= P; const e = env(t) * st[i] * 0.8; L[i] += tabAt(tl, ph) * e; R[i] += tabAt(tr, ph) * e; }
      const w = new Float32Array(n);
      for (let i = 0; i < n; i++) w[i] = (Math.random() * 2 - 1) * env(i / sr);
      bqRun(w, 'lp', 110, 0.7, sr); bqRun(w, 'lp', 110, 0.7, sr);
      for (let i = 0; i < n; i++) { L[i] += w[i] * 2.2; R[i] += w[i] * 2.2; }
      for (const i of chat) arcCrackIn(L, R, i, 0.12 + 0.25 * (i / n), 1 + Math.floor(Math.random() * 3), 0.01, Math.random() * 1.2 - 0.6, sr);
      sizzleIn(L, R, 0, secs, (t) => Math.pow(Math.min(1, t / d), 2.5) * (t < d ? 1 : Math.exp(-(t - d) / 0.05)), 0.22, 3800, 0.8, 6, sr);
    }, gain, null, 0.35, 1, 9000);
    let last = ctx.currentTime;
    const gg = out.gain;
    gg.setValueAtTime(gain, last); gg.setTargetAtTime(0.0001, last + 0.25, 0.05);
    return {
      keep() { const now = ctx.currentTime; if (now - last > 0.6 || now - last < 0.08) return; last = now; gg.cancelScheduledValues(now); gg.setValueAtTime(gain, now); gg.setTargetAtTime(0.0001, now + 0.25, 0.05); },
      stop(fade) { last = -9; const now = ctx.currentTime; gg.cancelScheduledValues(now); gg.setTargetAtTime(0.0001, now, fade || 0.06); },
    };
  };
  // gone live (at pos): the crack of the current striking, the knock and ring of the contactor pulling in, and the buzz coming on hard
  // (the rush of current at the start) and settling as the running sound takes over (ブゥン)
  A.elecOn = function (pos, kind) {
    if (!ctx || !voice(0.9)) return;
    const arc = kind === 'arc';
    fxPlay(arc ? 'e:on:a' : 'e:on:z', 3, 0.9, (L, R, sr, at) => {
      arcCrackIn(L, R, 0, 1, arc ? 5 : 3, arc ? 0.03 : 0.02, 0, sr);
      thudIn(L, R, 0, 1400, 0.008, arc ? 0.5 : 0.35, sr);
      knockIn(L, R, at(0.004), vr(240, 0.1), 0.45, 0, sr);
      ringIn(L, R, at(0.004), [[vr(860, 0.05), 0.25, 0.14], [vr(1590, 0.05), 0.18, 0.1], [vr(2630, 0.05), 0.1, 0.07]], 0.35, 0.6, 0, sr);
      buzzIn(L, R, at(0.008), 0.88, humTab(arc ? HUMA : HUMF, arc ? 2.4 : 1.8), EHZ * 1.04, EHZ, 0.15, (t) => Math.min(1, t / 0.006) * (0.45 + 0.55 * Math.exp(-t / 0.08)) * Math.min(1, Math.max(0, 0.88 - t) / 0.4), 0.55, sr);
      if (arc) sizzleIn(L, R, at(0.006), 0.4, (t) => Math.exp(-t / 0.12), 0.6, 1500, 0.5, 3, sr);
      else sizzleIn(L, R, at(0.006), 0.35, (t) => Math.exp(-t / 0.1), 0.35, 3400, 0.7, 6, sr);
    }, 0.4, pos, 0.3, null, 12000);
  };
  // dropped (at pos): the breaker's latch thrown (バチン: a hard snap of steel), the arc torn as its contacts part, and the hum running
  // down, lower and darker as it dies (ブゥン…, about 0.6 s)
  A.elecOff = function (pos, kind) {
    if (!ctx || !voice(0.8)) return;
    const arc = kind === 'arc';
    fxPlay(arc ? 'e:off:a' : 'e:off:z', 3, 0.82, (L, R, sr, at) => {
      ringIn(L, R, 0, [[vr(2300, 0.05), 0.3, 0.05], [vr(3700, 0.05), 0.22, 0.035], [vr(5600, 0.05), 0.12, 0.025]], 0.5, 1.2, 0, sr);
      knockIn(L, R, 0, vr(420, 0.1), 0.7, 0, sr);
      arcCrackIn(L, R, at(0.002), arc ? 0.9 : 0.6, arc ? 4 : 2, 0.03, 0, sr);
      const tb = humTab(arc ? HUMA : HUMF, arc ? 2.2 : 1.5), td = humTab([1, 0.6, 0.15, 0.1], 1.1), i0 = at(0.006), n = Math.min(L.length - i0, Math.round(0.78 * sr)), P = tb.length;
      let ph = 0;
      for (let j = 0; j < n; j++) { const t = j / sr, f = EHZ * Math.pow(0.52, Math.min(1, t / 0.6)), e = Math.min(1, t / 0.004) * Math.exp(-t / 0.25) * Math.min(1, (0.78 - t) / 0.12); ph += (P * f) / sr; if (ph >= P) ph -= P; const v = (tabAt(tb, ph) * e + tabAt(td, ph) * (1 - e)) * e * 0.75; L[i0 + j] += v; R[i0 + j] += v; }
      if (arc) sizzleIn(L, R, at(0.004), 0.15, (t) => Math.exp(-t / 0.04), 0.5, 1800, 0.5, 3, sr);
    }, arc ? 0.5 : 0.42, pos, 0.3, null, 11000);
  };
  // a switch box shorted by a shot or a blow (at pos): the bang of the fault (パン), its buzz the instant before the box gives, the steel
  // cabinet ringing from inside and its door rattling once, sparks spraying out thick and thinning, a fizz under them
  A.elecShort = function (pos) {
    if (!ctx || !voice(0.9)) return;
    fxPlay('e:short', 3, 0.9, (L, R, sr, at) => {
      tickIn(L, 0, 1, 0.0011 * sr, false); tickIn(R, 0, 1, 0.0011 * sr, false);
      lowIn(L, R, 0, 160, 70, 0.03, 0.7, sr);
      thudIn(L, R, 0, 900, 0.015, 0.7, sr);
      buzzIn(L, R, 0, 0.07, humTab(HUMA, 3), EHZ, EHZ, 1, (t) => Math.min(1, Math.max(0, 0.07 - t) / 0.03), 0.3, sr);
      const cab = [[vr(185, 0.06), 0.3, 0.28], [vr(310, 0.06), 0.35, 0.3], [vr(470, 0.06), 0.3, 0.24], [vr(690, 0.06), 0.22, 0.2], [vr(1040, 0.06), 0.18, 0.15], [vr(1520, 0.06), 0.12, 0.11], [vr(2280, 0.06), 0.08, 0.08]];
      ringIn(L, R, at(0.001), cab, 0.5, 0, 0, sr);
      ringIn(L, R, at(vr(0.05, 0.3)), cab, 0.14, 0.3, 0.2, sr);
      sparksIn(L, R, at(0.004), 0.6, 450, 15, 1.4, 4200, sr);
      sizzleIn(L, R, at(0.004), 0.3, (t) => Math.exp(-t / 0.08), 0.18, 5000, 0.6, 1, sr);
    }, 0.85, pos, 0.3, null, 13000);
  };
  // the current through you (ジッ: a floor's tick; big: a wire's strike, longer, with the crack of it) - in the head, small, under the
  // sound of being hurt
  A.elecShock = function (big) {
    if (!ctx || !voice(0.25)) return;
    fxPlay(big ? 'e:shock:b' : 'e:shock', 3, big ? 0.22 : 0.15, (L, R, sr) => {
      const d = big ? 0.19 : 0.12, env = (t) => Math.min(1, t / 0.002) * (t < d * 0.6 ? 1 : Math.max(0, 1 - (t - d * 0.6) / (d * 0.4)));
      sizzleIn(L, R, 0, d, env, 1, 2800, 1, 4, sr);
      buzzIn(L, R, 0, d, humTab([0, 1, 0.6, 0.7, 0.4, 0.5, 0.3, 0.3], 2.6), EHZ, EHZ, 1, env, 0.25, sr);
      if (big) arcCrackIn(L, R, 0, 0.9, 3, 0.02, 0, sr);
    }, big ? 0.085 : 0.08, null, 0.05, null, 9000);
  };
  // a spark leaping (at pos), over the running sound and in the warning: 'warn' (small: the plates and insulators trying), 'zone' (a
  // spark across a floor's plates), 'arc' (a wire's channel jumping, or striking a body): a crack, a few sparks after, a breath of buzz
  const SNAPK = { warn: [0.35, 0.16], zone: [0.65, 0.22], arc: [1, 0.34] };
  A.elecSnap = function (pos, kind) {
    if (!ctx || !voice(0.3)) return;
    const [s, gain] = SNAPK[kind] || SNAPK.zone;
    fxPlay('e:snap:' + kind, 4, 0.32, (L, R, sr, at) => {
      arcCrackIn(L, R, 0, 1, 1 + Math.floor(Math.random() * (1 + 3 * s)), 0.012, Math.random() * 0.6 - 0.3, sr);
      sparksIn(L, R, at(0.006), 0.2 + 0.1 * s, 120 * s + 40, 10, 0.5 + 0.4 * s, 3200, sr);
      buzzIn(L, R, at(0.002), 0.04 + 0.08 * s, humTab(kind === 'arc' ? HUMA : HUMF, 1.5 + 1.5 * s), EHZ, EHZ, 1, (t) => Math.min(1, t / 0.003) * Math.exp(-t / (0.02 + 0.04 * s)), 0.35, sr);
    }, gain, pos, 0.3, null, 12000);
  };
  A.crackle = function (pos) {
    if (!ctx || smp('crackle', pos, 0.25, 1, 0.2) || !voice(0.2)) return;
    const t = ctx.currentTime, out = dest(pos, 0.2); out.gain.value = 0.25;
    for (let i = 0; i < 3; i++) nz({ t: t + Math.random() * 0.1, f: [['bandpass', vr(2000, 0.5), 3]], g: 0.2, d: 0.015, to: out });
    nz({ t, buf: 'pink', f: [['lowpass', 700]], g: 0.1, a: 0.05, d: 0.2, to: out });
  };
  A.lava = function (pos) {
    if (!ctx || smp('lava', pos, 0.3, 1, 0.4) || !voice(0.5)) return;
    const t = ctx.currentTime, out = dest(pos, 0.4); out.gain.value = 0.3;
    nz({ t, buf: 'brown', f: [['bandpass', vr(200, 0.3), 3, 90, 0.4]], g: 0.6, a: 0.02, d: 0.4, to: out });
  };
  // ---------- the power station's own two (fieldfoes.js: 感電した作業員, 暴走した点検機) ----------
  // The dead lineman: the knock of its good boot and the scuff of the dragged one, the crackle when the current jerks through it, the
  // buzz rising in its arms (with a breath drawn) before it takes hold, the hold's strike, the charge gathering as it falls and its
  // going. The inspection crawler: its motor's whine with the rattle of its track plates and their rumble (a take a little over 0.4 s,
  // played over and over while it moves, each fading over the next), faster in the run; a servo when it stands; the wind-up's relay,
  // spooling motor and buzzer; the lurch into the run, the slam, the whine of the charge gathering and the crack of the ring; its
  // death (the motor running down and stuttering, a short, parts knocking off, a hiss). Written into takes as the plant's current is
  // (fxPlay: [takes, length s, level, build]). Levels set against the foes' own: docs/tools/snd_plantfoe.js
  const MOTOR = () => humTab([1, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1, 0.08], 1.6);
  const clatter = (L, R, sr, at, d, n, g) => { for (let k = 0; k < n; k++) ringIn(L, R, at(Math.random() * d), [[vr(2100, 0.25), 0.4, 0.025], [vr(3500, 0.2), 0.2, 0.02], [vr(900, 0.2), 0.3, 0.03]], g * (0.4 + Math.random() * 0.6), 0.6, Math.random() * 0.8 - 0.4, sr); };
  const swell = (d) => (t) => Math.sin(Math.PI * Math.min(1, t / d));
  const PFS = {
    wStep: [4, 0.3, 0.16, (L, R, sr, at) => { thudIn(L, R, 0, 420, 0.016, 1, sr); slideIn(L, R, at(0.004), 1800, 3200, 0.045, 0.18, 0, sr); }],
    wDrag: [4, 0.5, 0.08, (L, R, sr) => { slideIn(L, R, 0, 600, 1500, 0.42, 0.9, Math.random() * 0.4 - 0.2, sr); thudIn(L, R, 0, 300, 0.012, 0.35, sr); }],
    wTwitch: [3, 0.45, 0.18, (L, R, sr, at) => {
      arcCrackIn(L, R, 0, 1, 2 + Math.floor(Math.random() * 3), 0.04, Math.random() * 0.6 - 0.3, sr); sparksIn(L, R, at(0.01), 0.28, 320, 30, 0.9, 3600, sr);
      buzzIn(L, R, 0, 0.25, humTab(HUMF, 2), EHZ, EHZ, 1, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.08), 0.35, sr); gearIn(L, R, at(0.015), 0.35, sr); thudIn(L, R, at(0.01), 250, 0.02, 0.4, sr);
    }],
    wWind: [3, 0.85, 0.15, (L, R, sr, at) => {
      buzzIn(L, R, 0, 0.82, humTab(HUMA, 2.6), 50, 68, 0.8, (t) => Math.min(1, t / 0.6) * (t < 0.78 ? 1 : Math.max(0, (0.82 - t) / 0.04)), 0.5, sr);
      sizzleIn(L, R, 0, 0.82, (t) => Math.pow(Math.min(1, t / 0.8), 1.5), 0.8, 2600, 1, 4, sr); sparksIn(L, R, at(0.1), 0.7, 20, 260, 0.8, 3000, sr); breathIn(L, R, at(0.05), 0.55, 0.22, false, sr);
    }],
    wHit: [3, 0.55, 0.55, (L, R, sr, at) => {
      thudIn(L, R, 0, 650, 0.03, 1.1, sr); lowIn(L, R, 0, 120, 60, 0.05, 0.6, sr); arcCrackIn(L, R, at(0.004), 1.2, 4, 0.03, 0, sr);
      sizzleIn(L, R, at(0.004), 0.4, (t) => Math.exp(-t / 0.12), 0.7, 3000, 1, 4, sr); sparksIn(L, R, at(0.006), 0.3, 400, 30, 0.8, 3800, sr); gearIn(L, R, at(0.01), 0.4, sr);
    }],
    wDie: [2, 0.72, 0.23, (L, R, sr) => {
      sizzleIn(L, R, 0, 0.68, (t) => Math.pow(t / 0.68, 1.3), 0.9, 2800, 1, 5, sr); buzzIn(L, R, 0, 0.68, humTab(HUMA, 3), 50, 95, 0.68, (t) => Math.min(1, t / 0.65), 0.45, sr); sparksIn(L, R, 0, 0.68, 30, 300, 0.7, 3400, sr);
    }],
    wZap: [2, 0.7, 0.8, (L, R, sr, at) => {
      arcCrackIn(L, R, 0, 1.4, 6, 0.05, 0, sr); lowIn(L, R, 0, 140, 50, 0.07, 0.9, sr); thudIn(L, R, 0, 900, 0.02, 0.8, sr);
      sparksIn(L, R, at(0.004), 0.5, 500, 15, 1.2, 4200, sr); sizzleIn(L, R, at(0.004), 0.5, (t) => Math.exp(-t / 0.1), 0.6, 3200, 1, 4, sr);
    }],
    mMove: [3, 0.62, 0.08, (L, R, sr, at) => {
      const f = vr(115, 0.04), env = swell(0.62);
      buzzIn(L, R, 0, 0.62, MOTOR(), f, f * 1.02, 0.6, env, 0.45, sr); buzzIn(L, R, 0, 0.62, humTab([1], 1), f * 7.3, f * 7.3, 1, env, 0.05, sr);
      clatter(L, R, sr, at, 0.58, 8, 0.22); slideIn(L, R, 0, 180, 520, 0.62, 0.35, 0, sr);
    }],
    mRun: [3, 0.45, 0.17, (L, R, sr, at) => {
      const f = vr(190, 0.04), env = swell(0.45);
      buzzIn(L, R, 0, 0.45, MOTOR(), f, f * 1.03, 0.45, env, 0.5, sr); buzzIn(L, R, 0, 0.45, humTab([1], 1), f * 7.3, f * 7.3, 1, env, 0.06, sr);
      clatter(L, R, sr, at, 0.42, 12, 0.3); slideIn(L, R, 0, 200, 700, 0.45, 0.5, 0, sr);
    }],
    mIdle: [3, 0.42, 0.06, (L, R, sr, at) => { buzzIn(L, R, 0, 0.3, humTab([1, 0.3, 0.2], 1.2), 420, 610, 0.25, swell(0.3), 0.25, sr); ringIn(L, R, at(0.31), [[vr(2400, 0.1), 0.4, 0.02], [vr(4100, 0.1), 0.2, 0.015]], 0.3, 0.8, 0, sr); }],
    mWind: [2, 1.12, 0.16, (L, R, sr, at) => {
      ringIn(L, R, 0, [[160, 0.5, 0.06], [540, 0.35, 0.04], [1900, 0.15, 0.02]], 0.5, 1, 0, sr); thudIn(L, R, 0, 500, 0.012, 0.5, sr);
      buzzIn(L, R, at(0.02), 1.06, MOTOR(), 90, 420, 1.0, (t) => Math.min(1, t / 0.2) * (t < 1.0 ? 1 : Math.max(0, (1.06 - t) / 0.06)), 0.45, sr);
      buzzIn(L, R, at(0.02), 1.06, humTab([1], 1), 600, 2900, 1.0, (t) => Math.min(1, t / 0.3) * (t < 1.0 ? 1 : 0), 0.06, sr);
      const bz = humTab([1, 0, 0.33, 0, 0.2, 0, 0.14, 0, 0.11], 2.4);
      for (let i = 0; i < 3; i++) buzzIn(L, R, at(0.06 + i * 0.32), 0.16, bz, 430, 430, 1, (t) => Math.min(1, t / 0.005) * Math.max(0, Math.min(1, (0.16 - t) / 0.01)), 0.3, sr);
    }],
    mCharge: [2, 0.55, 0.55, (L, R, sr, at) => {
      ringIn(L, R, 0, [[130, 0.6, 0.1], [360, 0.4, 0.07], [1050, 0.25, 0.05], [2300, 0.1, 0.03]], 0.8, 1, 0, sr); thudIn(L, R, 0, 500, 0.03, 1, sr);
      buzzIn(L, R, 0, 0.5, MOTOR(), 420, 360, 0.5, (t) => Math.exp(-t / 0.2), 0.4, sr); slideIn(L, R, 0, 200, 700, 0.5, 0.4, 0, sr); clatter(L, R, sr, at, 0.3, 6, 0.3);
    }],
    mHit: [2, 0.5, 0.6, (L, R, sr) => { ringIn(L, R, 0, [[205, 0.6, 0.18], [540, 0.5, 0.14], [1290, 0.3, 0.08], [2700, 0.15, 0.05]], 0.9, 1, 0, sr); thudIn(L, R, 0, 800, 0.025, 1.2, sr); lowIn(L, R, 0, 95, 55, 0.06, 0.7, sr); }],
    mRingW: [2, 0.7, 0.23, (L, R, sr, at) => {
      buzzIn(L, R, 0, 0.62, humTab([1, 0.05], 1), 1700, 5600, 0.62, (t) => (0.2 + 0.8 * Math.min(1, t / 0.62)) * Math.min(1, t / 0.02), 0.09, sr);
      sizzleIn(L, R, 0, 0.62, (t) => Math.pow(t / 0.62, 1.4), 0.7, 3000, 1, 5, sr); sparksIn(L, R, at(0.1), 0.52, 10, 200, 0.6, 3400, sr); buzzIn(L, R, 0, 0.62, humTab(HUMF, 2), EHZ, EHZ, 1, (t) => Math.min(1, t / 0.6), 0.25, sr);
    }],
    mRing: [2, 0.8, 0.68, (L, R, sr, at) => {
      arcCrackIn(L, R, 0, 1.5, 7, 0.06, 0, sr); lowIn(L, R, 0, 130, 45, 0.09, 1, sr); thudIn(L, R, 0, 1100, 0.025, 0.9, sr);
      buzzIn(L, R, 0, 0.3, humTab(HUMA, 3), EHZ, EHZ, 1, (t) => Math.exp(-t / 0.1), 0.45, sr); sparksIn(L, R, at(0.004), 0.6, 600, 15, 1.2, 4200, sr); sizzleIn(L, R, at(0.004), 0.55, (t) => Math.exp(-t / 0.14), 0.6, 3200, 1, 4, sr);
    }],
    mDie: [2, 1.75, 0.36, (L, R, sr, at) => {
      buzzIn(L, R, 0, 1.3, MOTOR(), 380, 32, 1.3, (t) => Math.max(0, 1 - t / 1.3) * (Math.sin(t * 41) > -0.6 ? 1 : 0.2), 0.5, sr);
      arcCrackIn(L, R, 0, 1.2, 4, 0.04, 0, sr); arcCrackIn(L, R, at(0.25), 0.7, 3, 0.03, 0.3, sr); sparksIn(L, R, 0, 1.0, 260, 8, 0.9, 3800, sr);
      ringIn(L, R, at(0.45), [[120, 0.6, 0.12], [330, 0.4, 0.08], [980, 0.2, 0.05]], 0.6, 1, -0.2, sr); ringIn(L, R, at(0.85), [[700, 0.5, 0.06], [1650, 0.3, 0.04], [3100, 0.15, 0.02]], 0.4, 1, 0.3, sr);
      slideIn(L, R, at(0.1), 2500, 5000, 1.4, 0.18, 0, sr);
    }],
  };
  A.plantFoe = function (pos, kind) {
    const d = PFS[kind]; if (!ctx || !d || !voice(d[1])) return;
    fxPlay('pf:' + kind, d[0], d[1], d[3], d[2], pos || null, 0.3, null, 12000);
  };
  A.plantFoeNet = function (pos, kind) { A.plantFoe(pos, kind); };   // (the same: an attack's, which fxsync.js sends to the other players)
  // A steel drum of the power station broken (field_plant.js; combat.js breakDestructible gives its material, 'metal'): its thin side
  // buckling in with a hollow knock (the low thump of the panel, the shell ringing), a second pop as it caves, the thud of it going over,
  // the lid sprung off - its clang, then rattling down faster and faster as it settles - and what was in it glugging out and running
  const DRUMS = [3, 1.5, 0.19, (L, R, sr, at) => {
    const shell = () => [[vr(235, 0.06), 0.5, 0.32], [vr(400, 0.06), 0.42, 0.28], [vr(660, 0.06), 0.3, 0.2], [vr(1080, 0.06), 0.2, 0.14], [vr(1720, 0.06), 0.12, 0.09], [vr(2600, 0.06), 0.06, 0.06]];
    lowIn(L, R, 0, 190, 92, 0.05, 0.85, sr); thudIn(L, R, 0, 700, 0.022, 0.9, sr); ringIn(L, R, at(0.002), shell(), 0.55, 1, -0.1, sr); slideIn(L, R, at(0.004), 1800, 3600, 0.06, 0.25, 0, sr);
    const t2 = vr(0.085, 0.25); lowIn(L, R, at(t2), 150, 85, 0.035, 0.45, sr); ringIn(L, R, at(t2), shell().map((m) => [m[0] * 1.08, m[1], m[2] * 0.6]), 0.3, 0.7, 0.15, sr);
    const t3 = vr(0.27, 0.15); thudIn(L, R, at(t3), 400, 0.03, 1, sr); lowIn(L, R, at(t3), 110, 55, 0.06, 0.6, sr); ringIn(L, R, at(t3 + 0.003), shell().map((m) => [m[0] * 0.95, m[1] * 0.7, m[2]]), 0.25, 0.6, 0, sr);
    // (the lid: sprung off, its clang, then on its rim rattling down faster and faster)
    const tl = t3 + vr(0.05, 0.3), lid = [[vr(830, 0.05), 0.5, 0.18], [vr(1960, 0.05), 0.3, 0.11], [vr(3350, 0.05), 0.16, 0.06]], pan = Math.random() * 0.8 - 0.4;
    ringIn(L, R, at(tl), lid, 0.4, 1, pan, sr);
    let tt = tl + 0.16, gap = 0.11, g = 0.22; while (tt < 1.38 && gap > 0.012) { ringIn(L, R, at(tt), lid.map((m) => [m[0] * vr(1, 0.02), m[1], m[2] * 0.4]), g, 0.5, pan, sr); tt += gap; gap *= 0.84; g *= 0.93; }
    // (what was in it: glugs as it runs out, and the pour)
    slideIn(L, R, at(t3 + 0.08), 380, 900, 0.9, 0.3, -pan * 0.5, sr);
    for (let i = 0, t = t3 + 0.1; i < 6 && t < 1.35; i++, t += vr(0.12, 0.4)) {
      const n = Math.min(L.length - at(t), Math.round(0.07 * sr)), f0 = vr(190, 0.3), gg = 0.3 * (1 - i / 7);
      for (let j = 0, ph = 0; j < n; j++) { const u = j / n; ph += (2 * Math.PI * f0 * (1 + u * 1.1)) / sr; const v = Math.sin(ph) * Math.sin(Math.PI * u) * gg; L[at(t) + j] += v; R[at(t) + j] += v; }
    }
  }];
  A.drumBreak = function (pos) {
    if (!ctx || !voice(DRUMS[1])) return;
    fxPlay('drum:break', DRUMS[0], DRUMS[1], DRUMS[3], DRUMS[2], pos || null, 0.4, null, 12000);
  };
  // The takes of a sound written ahead, not played: as fxPlay writes them (the same build, the same levelling to its peak), up to its
  // count. Returns whether there was one left to write
  function fxTake(key, n, secs, build, lp) {
    const set = fxSets[key] || (fxSets[key] = []);
    if (set.length >= n) return false;
    const sr = ctx.sampleRate, b = ctx.createBuffer(2, Math.max(1, Math.round(secs * sr)), sr), L = b.getChannelData(0), R = b.getChannelData(1);
    build(L, R, sr, (x) => Math.round(x * sr));
    if (lp) for (const c of [L, R]) { bqRun(c, 'lp', lp, 0.7, sr); bqRun(c, 'lp', lp, 0.7, sr); }
    let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    for (let i = 0; i < L.length; i++) { L[i] /= pk || 1; R[i] /= pk || 1; }
    set.push(b);
    return true;
  }
  // The power station's own sounds (its two foes', its drums') written ahead when one of its areas is made (elec.js setup, behind the
  // black screen while the area's shaders are made): written as they were first played, each first few took up to 25 ms on the spot - the
  // first wind-up, the first fall. Written a little at a time (a take or two, some 4 ms, then 16 ms left to the page: longer slices held
  // the black screen up, the warm-up's own checks waiting behind them), so neither the black screen nor play is held up; one
  // asked for meanwhile is written as before. A.prepStats: how long it took in all, in how many slices
  A.prepStats = { plant: null };
  let prepping = false;
  A.plantFoePrep = function () {
    if (!ctx || prepping) return;
    const jobs = Object.keys(PFS).map((k) => ['pf:' + k, PFS[k][0], PFS[k][1], PFS[k][3]]).concat([['drum:break', DRUMS[0], DRUMS[1], DRUMS[3]]]);
    if (jobs.every((j) => (fxSets[j[0]] || []).length >= j[1])) return;
    prepping = true;
    const st = A.prepStats.plant = { ms: 0, slices: 0, takes: 0, start: performance.now(), end: 0 };
    let i = 0;
    const slice = () => {
      const t0 = performance.now();
      try { while (i < jobs.length && performance.now() - t0 < 4) { const [k, n, secs, build] = jobs[i]; if (fxTake(k, n, secs, build, 12000)) st.takes++; else i++; } } catch (e) { i = jobs.length; }
      st.ms += performance.now() - t0; st.slices++;
      if (i < jobs.length) setTimeout(slice, 16); else { prepping = false; st.end = performance.now(); st.ms = +st.ms.toFixed(1); }
    };
    setTimeout(slice, 0);
  };
  // The body's, the hands' and the interface's own sounds (SN: struck, mended, a jump and a landing on each ground, time held back and
  // let go, warded, the clear, a level, the ratchet, the clock ...), all their takes written ahead once a session, a little at a time
  // as the power station's are (some 4 ms, then 16 ms left to the page), from a moment after the sound starts. Each was written the
  // first times it was played, in that frame (2 - 14 ms a take: the clear's 13, a landing on iron 8, time held back 7). What each would
  // write is asked of the sound itself (fxPlay priming: nothing is played), so every take is as it would have been. A.prepStats.snd
  let sndPrepped = false;
  A.sndPrep = function () {
    if (!ctx || sndPrepped || !NEW()) return;
    sndPrepped = true;
    const asks = [() => SN.hurt(10), () => SN.jump()];
    for (const s of ['stone', 'wood', 'grass', 'ice', 'metal']) for (const k of [0.2, 0.5, 0.9]) asks.push(() => SN.land(k, s));
    asks.push(() => SN.heal(), () => SN.ok(), () => SN.clear(), () => SN.level(), () => SN.timeIn(0), () => SN.timeOut(0), () => SN.timeTick(0),
      () => SN.invulnOn(), () => SN.invulnHum(), () => SN.invulnOff());
    for (const k of [0, 1 / 3, 2 / 3, 1]) asks.push(() => SN.invulnTick(k));
    for (const k of [0, 1, 2, 3, 4]) asks.push(() => SN.focus(k));
    for (const l of [0, 1, 2]) asks.push(() => SN.tick(l, 5));
    asks.push(() => SN.duelTurn(true), () => SN.duelTurn(false), () => SN.drink());
    priming = new Map();
    try { for (const a of asks) { try { a(); } catch (e) { /* written when first played */ } } } finally { const m = priming; priming = null; A._sndJobs = [...m.values()]; }
    // (first, the guns' own shared ones: open ground's answer to a shot (tails, 3) and the brass case landing (cases, 4) - the first
    // shots out of doors wrote one each, some 12 ms)
    const jobs = [() => (tails.length < 3 ? (tailTake(), true) : false), () => (cases.length < 4 ? (caseTake(), true) : false)].concat(A._sndJobs);
    const st = A.prepStats.snd = { ms: 0, slices: 0, takes: 0, jobs: jobs.length, start: performance.now(), end: 0 };
    let i = 0;
    const slice = () => {
      const t0 = performance.now();
      try { while (i < jobs.length && performance.now() - t0 < 4) { const j = jobs[i]; if (typeof j === 'function' ? j() : fxTake(j[0], j[1], j[2], j[3], j[4])) st.takes++; else i++; } } catch (e) { i = jobs.length; }
      st.ms += performance.now() - t0; st.slices++;
      if (i < jobs.length) setTimeout(slice, 16); else { st.end = performance.now(); st.ms = +st.ms.toFixed(1); }
    };
    setTimeout(slice, 0);
  };
  // (begun a moment after the sound itself starts - at the title, or as a run is first made, a guest's as well - and, if an area is being
  // readied then, after its black screen: not in it, where the slices would wait on the area's own warm-up and it on them)
  { const init1 = A.init; A.init = function () { const had = !!ctx; init1.apply(this, arguments); if (!had && ctx) setTimeout(() => { const GM = G.game; (GM && GM._warming && GM._warmP ? GM._warmP : Promise.resolve()).then(() => setTimeout(() => A.sndPrep(), 300), () => A.sndPrep()); }, 1200); }; }
})();
