'use strict';
// Procedural, sample-free sound design. Everything is noise-based with filtering,
// short transients and a dark convolution reverb so it reads as physical rather than "beepy".
(function () {
  const A = (G.sfx = {});
  let muffle = null;
  // your head under the water (water.js): every sound dull and far, as through the water
  A.underwater = function (on) { if (!muffle || !ctx) return; muffle.frequency.setTargetAtTime(on ? 620 : 22000, ctx.currentTime, on ? 0.05 : 0.12); };
  let ctx = null, master, dry, revSend, reverb, gunBus, shaper, eqLo, eqHi, irOld, irIn, irOut;
  let white, pink, brown;
  let voices = 0;
  const MAXV = 56;
  // Two sets of sound, chosen in the settings (設定 → 音の種類). 'new' (the default): rooms and open ground answer differently (a
  // reverb with early reflections whose high end dies first, a far echo outdoors), what is behind you is duller, a shot has weight under
  // it, the metal of the action and the place answering back, a blast throws debris that falls after it. 'classic': as it was.
  const NEW = () => G.save.data.settings.sound !== 'classic';
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
    const n = NEW(), o = outdoor();
    reverb.buffer = n ? (o ? irOut : irIn) : irOld; revSend.gain.value = n && o ? 0.4 : 0.55;
    eqLo.gain.value = n ? 2.5 : 0; eqHi.gain.value = n ? 2 : 0;
    A._setKey = n + '|' + o;
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
    master.connect(muffle); muffle.connect(eqLo); eqLo.connect(eqHi); eqHi.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
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
    white = makeNoise('white', 2); pink = makeNoise('pink', 2); brown = makeNoise('brown', 3);
    A.applySet();
    A.startAmbience();
    preloadSamples();
  };
  A.setVolume = (v) => { A.volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
  A.suspend = () => { if (ctx && ctx.state === 'running') ctx.suspend(); };
  A.resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  A.now = () => (ctx ? ctx.currentTime : 0);
  // (tests: a meter on everything before the master volume, so a muted game can still be measured)
  A.tap = () => { if (!ctx) return null; if (!A._tap) { A._tap = ctx.createAnalyser(); A._tap.fftSize = 2048; dry.connect(A._tap); } return A._tap; };

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

  // ---------- recorded sounds (snd/, listed in sndbank.js) ----------
  // Where a sound has recordings, one of them is the sound: a different one each time, its pitch and level a little off the last, put
  // in the same place and the same room as everything else. Where it has none - or they have not arrived yet, or the old set of sounds
  // is chosen in the settings - smp() reports "not played" and the caller goes on to the synthesized sound, as it always did.
  const SB = { bank: (window.G && window.G.SND) || {}, files: {} }, bufs = {}, asked = {}, lastOf = {};
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
  const preloadSamples = () => { try { for (const k in SB.bank) for (const f of SB.bank[k].f) fetchBuf(f); } catch (e) { /* none, then */ } };
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
  // How heavy each kind of gun sounds over its recording (the recordings were all taken some paces off: they carry the crack of a
  // shot, not its weight, and so a shotgun came out little heavier than a pistol). rate: the recording played slower - lower and
  // longer; w: the blow under it (a sub-bass thump and the low body of the report); tail: seconds of the place ringing after it.
  const GUNW = {
    pistol: { rate: 1, w: 0.45, tail: 0 }, smg: { rate: 1, w: 0.3, tail: 0 }, minigun: { rate: 1, w: 0.25, tail: 0 }, nail: { rate: 1, w: 0.2, tail: 0 },
    rifle: { rate: 0.97, w: 0.65, tail: 0.25 }, lmg: { rate: 0.95, w: 0.85, tail: 0.3 }, dmr: { rate: 0.92, w: 1.25, tail: 0.55 },
    revolver: { rate: 0.9, w: 1.3, tail: 0.45 }, shotgun: { rate: 0.84, w: 1.9, tail: 0.8 }, sniper: { rate: 0.86, w: 2.0, tail: 1.1 },
  };
  A.gun = function (kind, opts) {
    if (!ctx || !voice(1)) return;
    opts = opts || {};
    // (a recording where there is one for this kind of gun; each named gun plays it at a pitch of its own, a little off the next gun's)
    const GW = (!opts.suppressed && GUNW[kind]) || { rate: 1, w: opts.suppressed ? 0.25 : 0.8, tail: 0 };
    if (smp('gun_' + (opts.suppressed ? 'suppressed' : GUN[kind] ? kind : 'rifle'), null, opts.vol, (opts.id && !opts.suppressed ? 0.95 + hr(hs(opts.id), 1) * 0.1 : 1) * GW.rate)) {
      // (under the recording, the push in the chest: a microphone some paces off does not carry it)
      { const gp = GUN[opts.suppressed ? 'suppressed' : kind] || GUN.rifle, t = ctx.currentTime, lo = dest(null, 0.1, gunBus), k = GW.w, v = opts.vol || 1; lo.gain.value = v;
        tn({ t, f0: gp.thump[0] * 0.55, f1: gp.thump[1] * 0.8, d: 0.08 + gp.tg * 0.08, g: gp.tg * 0.5, to: lo, type: 'sine' });
        if (k > 0.6) {
          tn({ t, f0: 64, f1: 30, d: 0.13 + k * 0.09, g: 0.5 * k, to: lo, type: 'sine' });                                              // the blow
          tn({ t: t + 0.004, f0: 118, f1: 46, d: 0.09 + k * 0.05, g: 0.28 * k, to: lo, type: 'triangle', lp: 300 });                    // its knock
          nz({ t, buf: 'pink', f: [['lowpass', 300, 0.7, 80, 0.18 + k * 0.12]], g: 0.42 * k, a: 0.002, d: 0.2 + k * 0.15, to: lo });   // the low body of the report
        }
        if (GW.tail > 0) {   // (the place ringing after a heavy shot: dark, long; out of doors one far return as well)
          const e = dest(null, 0.9, gunBus); e.gain.value = v * 0.6;
          nz({ t: t + 0.04, buf: 'pink', f: [['lowpass', 1100, 0.6, 180, GW.tail]], g: 0.16 * k, a: 0.04, d: GW.tail, to: e });
          if (outdoor()) nz({ t: t + 0.28, buf: 'pink', f: [['lowpass', 800, 0.6, 160, GW.tail * 0.8]], g: 0.09 * k, a: 0.06, d: GW.tail * 0.9, to: e });
        } }
      if (kind === 'shotgun' && !opts.auto) A.mech('pump', 0.35);
      if (kind === 'sniper') A.mech('bolt', 0.4);
      if (kind === 'revolver') A.mech('click', 0.2);
      return;
    }
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
    if (NEW()) {
      // the weight under the shot; the metal of the action; the place answering back (a room: two quick dark returns, open ground: one far echo)
      tn({ t, f0: 62 * pr, f1: 34, d: 0.11 + p.tg * 0.06, g: p.tg * 0.5, to: out, type: 'sine' });
      if (!opts.suppressed) {
        tn({ t: t + 0.006, f0: vr(2300, 0.08), d: 0.035, g: 0.04 + p.crack * 0.05, to: out, type: 'triangle' });
        tn({ t: t + 0.008, f0: vr(3650, 0.08), d: 0.025, g: 0.025 + p.crack * 0.04, to: out, type: 'sine' });
        const fast = kind === 'minigun' || kind === 'smg' || kind === 'nail';
        if (outdoor()) { if (!fast) { const e = dest(null, 0.9, dry); e.gain.value = 0.2 * (opts.vol || 1); nz({ t: t + 0.17 + Math.random() * 0.04, buf: 'pink', f: [['lowpass', 1300, 0.7, 300, 0.4]], g: p.bg * 0.5, a: 0.02, d: 0.35 + p.tail * 0.5, to: e }); } }
        else { const e = dest(null, 0.5, dry); e.gain.value = 0.3 * (opts.vol || 1); for (const [dl, gg] of fast ? [[0.036, 0.42]] : [[0.034, 0.5], [0.071, 0.3]]) nz({ t: t + dl, buf: 'pink', f: [['lowpass', p.body * 0.5, 0.8, p.body * 0.2, p.bd]], g: p.bg * gg, a: 0.002, d: p.bd * 1.2, to: e }); }
      }
    }
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
    if (kind === 'flame') { f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.5; }
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
  A.mech = function (kind, delay, vol) {
    if (!ctx || !voice(0.4)) return;
    if (!delay && smp('mech_' + kind, null, vol)) return;
    if (delay && SB.bank['mech_' + kind] && usable('mech_' + kind)) { setTimeout(() => A.mech(kind, 0, vol), delay * 1000); return; }
    const t = ctx.currentTime + (delay || 0);
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
  A.step = function (surface, intensity) {
    if (!ctx) return;
    const sk = surface || 'stone';   // (turf is told from stone by what is underfoot: player.js surfaceBelow)
    if (smp('step_' + sk, null, 0.35 * intensity, 0.92 + intensity * 0.08) || (sk !== 'wood' && sk !== 'metal' && sk !== 'water' && smp('step_stone', null, 0.35 * intensity))) return; // (a floor with no recording of its own is synthesized: boards must not sound of stone)
    if (!voice(0.3)) return;
    const t = ctx.currentTime, out = dest(null, 0.15);
    out.gain.value = 0.35 * intensity;
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
    } else if (surface === 'metal') {
      nz({ t, f: [['bandpass', vr(900, 0.1), 3]], g: 0.4, d: 0.08, to: out });
      tn({ t, f0: vr(380, 0.05), d: 0.1, g: 0.08, to: out });
    } else {
      // stone + grit
      nz({ t, buf: 'pink', f: [['lowpass', vr(900, 0.2), 0.9]], g: 0.75, d: 0.06, to: out });
      tn({ t, f0: vr(95, 0.1), f1: 55, d: 0.05, g: 0.45, to: out });
      nz({ t: t + 0.012, f: [['bandpass', vr(3200, 0.2), 1.5]], g: 0.08 * (0.5 + Math.random()), d: 0.05, to: out });
    }
  };
  A.jump = function () {
    if (!ctx || smp('jump', null, 0.35)) return;
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.35;
    nz({ t, buf: 'pink', f: [['bandpass', 700, 0.8]], g: 0.3, d: 0.09, to: out });
    nz({ t: t + 0.02, f: [['bandpass', 1500, 0.6, 600, 0.2]], g: 0.12, a: 0.03, d: 0.18, to: out });
  };
  A.land = function (intensity, surface) {
    if (ctx && surface === 'water') { A.splash(null, 0.55 + Math.min(1, intensity) * 0.8); return; } // (a splash, with its own thump when it is a big one)
    if (!ctx || smp(surface === 'wood' ? 'land_wood' : 'land', null, Math.min(1.2, 0.3 + intensity * 0.9), 1.1 - Math.min(0.25, intensity * 0.25))) return;
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
    nz({ t, f: [['bandpass', 2800, 6, 1400, 0.25]], g: 0.3, d: 0.25, to: out });
  };
  A.impact = function (pos, surface) {
    if (!ctx || smp('impact_' + (surface === 'wood' || surface === 'metal' ? surface : 'stone'), pos, 0.45, 1, 0.3) || !voice(0.2)) return;
    const t = ctx.currentTime, out = dest(pos, 0.3); out.gain.value = 0.45;
    if (surface === 'wood') { nz({ t, f: [['bandpass', 700, 2]], g: 0.5, d: 0.05, to: out }); tn({ t, f0: 220, f1: 120, d: 0.05, g: 0.2, to: out }); }
    else if (surface === 'metal') { nz({ t, f: [['bandpass', 2400, 5]], g: 0.4, d: 0.05, to: out }); tn({ t, f0: vr(1500, 0.1), d: 0.12, g: 0.06, to: out }); }
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
  A.meleeHit = function (hit, mcat, heavy) {
    if (!ctx || !hit) return;
    const cut = mcat === 'blade' || mcat === 'knife' || mcat === 'scythe' || mcat === 'spear';
    // (a blade: the steel, and under it the blow landing on a body)
    if (smp(cut ? 'melee_slice' : 'melee_blunt', null, heavy ? 1.1 : 0.8, heavy ? 0.85 : 1)) { if (cut) smp('hit_flesh', null, heavy ? 0.8 : 0.55, heavy ? 0.85 : 0.95, 0.15); return; }
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
  A.hurt = function (amount) {
    if (!ctx || smp('hurt', null, Math.min(1, 0.4 + amount / 40), 1, 0.1)) return;
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
    const t = ctx.currentTime, out = dest(null, 0.4); out.gain.value = 0.5;
    nz({ t, buf: 'pink', f: [['bandpass', 500, 1, 1800, 0.5]], g: 0.3, a: 0.15, d: 0.4, to: out });
    nz({ t: t + 0.05, f: [['bandpass', 1200, 3]], g: 0.15, a: 0.05, d: 0.25, to: out }); // liquid
    tn({ t, f0: 330, f1: 440, d: 0.5, g: 0.05, to: out });
  };
  A.drink = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.1); out.gain.value = 0.5;
    for (let i = 0; i < 4; i++) nz({ t: t + i * 0.12, f: [['bandpass', vr(700, 0.2), 4, 400, 0.08]], g: 0.4, d: 0.08, to: out });
  };
  A.death = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.9);
    tn({ t, f0: 90, f1: 25, d: 2.2, g: 0.8, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 600, 0.7, 80, 2]], g: 0.9, a: 0.05, d: 2.2, to: out });
  };

  // ---------- monsters ----------
  // kinds: growl, snarl, screech, roar, hiss, chitter, groan, gurgle, wail, rumble, buzz
  A.monster = function (pos, kind, pitch, vol) {
    if (!ctx) return;
    pitch = pitch || 1; vol = vol || 1;
    if (smp('mon_' + kind, pos, 0.75 * vol, pitch, 0.45)) return;
    if (!voice(1)) return;
    const t = ctx.currentTime, out = dest(pos, 0.45); out.gain.value *= 0.75 * vol;
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
    // low, airy and organic - no pure beeps
    nz({ t, buf: 'pink', f: [['bandpass', kind === 'dark' ? 300 : 600, 2, kind === 'dark' ? 150 : 1200, 0.5]], g: 0.6, a: 0.1, d: 0.5, to: out });
    nz({ t, buf: 'brown', f: [['lowpass', 400]], g: 0.4, a: 0.05, d: 0.4, to: out });
  };
  A.zap = function (pos) {
    if (!ctx || !voice(0.3)) return;
    const t = ctx.currentTime, out = dest(pos, 0.35); out.gain.value = 0.55;
    for (let i = 0; i < 6; i++) nz({ t: t + Math.random() * 0.12, f: [['highpass', 1500], ['lowpass', 5000]], g: 0.25, d: 0.02, to: out });
    nz({ t, buf: 'brown', f: [['lowpass', 260]], g: 0.4, d: 0.15, to: out });
  };
  A.fire = function (pos, big) {
    if (!ctx || smp('fire', pos, big ? 1 : 0.6, big ? 0.85 : 1, 0.4) || !voice(0.6)) return;
    const t = ctx.currentTime, out = dest(pos, 0.4); out.gain.value = big ? 1 : 0.6;
    nz({ t, buf: 'pink', f: [['lowpass', 1200, 0.6, 500, 0.5]], g: 0.7, a: 0.06, d: 0.6, to: out });
    for (let i = 0; i < 6; i++) nz({ t: t + Math.random() * 0.4, f: [['bandpass', vr(2400, 0.4), 3]], g: 0.12, d: 0.02, to: out });
  };
  A.ice = function (pos) {
    if (!ctx || smp('ice', pos, 0.6, 1, 0.5) || !voice(0.5)) return;
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
    if (!ctx || smp('break_' + (mat === 'wood' || mat === 'ceramic' ? mat : 'stone'), pos, 0.8, 1, 0.4)) return;
    const t = ctx.currentTime, out = dest(pos, 0.4);
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
  A.ui = function (kind) {
    if (!ctx) return;
    if (kind === 'buy' ? smp('coins', null, 0.6) : kind === 'rare' ? false : smp('ui_' + kind, null, 0.5, 1, 0.08)) return;
    const t = ctx.currentTime, out = dest(null, 0.12);
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
    const t = ctx.currentTime, out = dest(null, 0.7), g = 0.55 + 0.45 * k; out.gain.value = 0.9;
    tn({ t, f0: 560, f1: 40, d: 1.15, g: 0.5 * g, to: out, type: 'sine' });
    tn({ t, f0: 280, f1: 36, d: 1.25, g: 0.32 * g, to: out, type: 'sawtooth', lp: 700 });
    nz({ t, buf: 'pink', f: [['lowpass', 5200, 0.8, 160, 1.05]], g: 0.45 * g, a: 0.01, d: 1.05, to: out });
    nz({ t, f: [['bandpass', 3200, 2.2, 420, 0.8]], g: 0.16 * g, d: 0.8, to: out });
    if (k >= 0.8) { A.bell(); tn({ t: t + 0.05, f0: 90, f1: 28, d: 1.0, g: 0.5, to: out, type: 'triangle' }); }
  };
  A.timeOut = function (k) {
    if (!ctx || !voice(0.9)) return;
    const t = ctx.currentTime, out = dest(null, 0.6), g = 0.5 + 0.4 * k; out.gain.value = 0.8;
    tn({ t, f0: 60, f1: 1000, d: 0.55, g: 0.34 * g, to: out, type: 'sine' });
    nz({ t, buf: 'white', f: [['bandpass', 600, 2, 6500, 0.5]], g: 0.2 * g, a: 0.05, d: 0.5, to: out });
    tn({ t: t + 0.45, f0: 900, f1: 880, d: 0.25, g: 0.1 * g, to: out, type: 'triangle', lp: 3500 });
  };
  A.timeTick = function (k) {
    if (!ctx) return;
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
    const t = ctx.currentTime, out = dest(null, 0.8); out.gain.value = 0.45;
    [523, 659, 784, 1046].forEach((f, i) => tn({ t: t + i * 0.05, f0: f, f1: f * 1.01, d: 0.7, g: 0.12, to: out, type: 'triangle', lp: 4000 }));
    nz({ t, buf: 'pink', f: [['bandpass', 2500, 2, 6000, 0.4]], g: 0.25, a: 0.08, d: 0.5, to: out });
    tn({ t, f0: 180, f1: 360, d: 0.4, g: 0.15, to: out, type: 'sine' });
  };
  A.invulnHum = function () {
    if (!ctx) return;
    const t = ctx.currentTime, out = dest(null, 0.6); out.gain.value = 0.16;
    tn({ t, f0: vr(1568, 0.05), d: 0.35, g: 0.12, to: out, type: 'sine' });
    tn({ t: t + 0.04, f0: vr(2093, 0.05), d: 0.3, g: 0.07, to: out, type: 'sine' });
  };
  A.invulnTick = function (k) {
    if (!ctx) return;
    // k: 0 → 1 as the end approaches (higher and louder)
    const t = ctx.currentTime, out = dest(null, 0.3); out.gain.value = 0.35 + k * 0.25;
    const f = 880 + k * 660;
    tn({ t, f0: f, f1: f * 0.94, d: 0.09, g: 0.25, to: out, type: 'square', lp: 3000 });
    tn({ t, f0: f * 0.5, d: 0.08, g: 0.12, to: out, type: 'triangle' });
  };
  A.invulnOff = function () {
    if (!ctx) return;
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
  // the hidden "extra" difficulty: a sinking sound. k = 0 .. 1 (extra 1 .. 10): the lower, the heavier.
  // sting: a long fall in pitch into the sub-bass, with a dull thud; drone: sub tones that sit lower (and louder) the higher the level
  A.hellSting = function (k) {
    if (!ctx) return;
    k = Math.max(0, Math.min(1, k || 0));
    const t = ctx.currentTime, out = dest(null, 0.5); out.gain.value = 0.9;
    const lo = 34 - k * 14; // 34 Hz at extra 1, 20 Hz at extra 10
    tn({ t, f0: 130 - k * 30, f1: lo, d: 2.8 + k * 1.2, g: 0.9, to: out, type: 'sine' });
    tn({ t: t + 0.05, f0: 190, f1: lo * 1.5, d: 2.2, g: 0.35, to: out, type: 'triangle', lp: 260 });
    nz({ t, buf: 'brown', f: [['lowpass', 420 - k * 200, 0.7, 60, 2.6]], g: 0.8, a: 0.04, d: 2.6 + k, to: out });
    tn({ t: t + 0.02, f0: 70, f1: 24, d: 0.5, g: 1.0, to: out, type: 'sine' }); // the thud
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
    const t = ctx.currentTime, out = dest(null, 0.05);
    if (k < 4) { out.gain.value = 0.2; tn({ t, f0: 640 + k * 170, d: 0.05, g: 0.25, to: out, type: 'sine' }); }
    else { out.gain.value = 0.3; tn({ t, f0: 1180, d: 0.16, g: 0.22, to: out, type: 'triangle' }); tn({ t: t + 0.07, f0: 1770, d: 0.24, g: 0.18, to: out, type: 'triangle' }); }
  };
  // clock tick for timed challenges: 0 = normal, 1 = urgent (higher, louder), 2 = half-second tock in the last seconds
  A.tick = function (lvl, sec) {
    if (!ctx || smp('tick', null, lvl === 2 ? 0.35 : lvl === 1 ? 0.95 : 0.6, lvl === 1 ? 1.3 : lvl === 2 ? 0.8 : 1, 0.05)) return;
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
})();
