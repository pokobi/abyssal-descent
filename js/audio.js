'use strict';
// Procedural, sample-free sound design. Everything is noise-based with filtering,
// short transients and a dark convolution reverb so it reads as physical rather than "beepy".
(function () {
  const A = (G.sfx = {});
  let ctx = null, master, dry, revSend, reverb, gunBus, shaper;
  let white, pink, brown;
  let voices = 0;
  const MAXV = 56;
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

  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = A.volume;
    master.connect(comp); comp.connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(2.8, 2.6);
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
    A.startAmbience();
    preload();
  };
  A.setVolume = (v) => { A.volume = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
  A.suspend = () => { if (ctx && ctx.state === 'running') ctx.suspend(); };
  A.resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  A.now = () => (ctx ? ctx.currentTime : 0);

  // ---------- routing helpers ----------
  // returns {node, wet} destination for a sound; positional when pos given
  function dest(pos, wet, bus) {
    const g = ctx.createGain();
    let out = g;
    if (pos) {
      const L = A.listener;
      const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // manual distance attenuation + lowpass by distance (air absorption) + stereo pan
      const att = 1 / (1 + Math.max(0, dist - 2) * 0.09);
      g.gain.value = att;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 16000 / (1 + dist * 0.08));
      const p = ctx.createStereoPanner();
      // pan relative to listener yaw
      const ang = Math.atan2(dx, -dz) - (A.listenerYawNeg || 0);
      p.pan.value = Math.max(-0.85, Math.min(0.85, Math.sin(ang) * Math.min(1, dist / 4)));
      g.connect(lp); lp.connect(p); out = p;
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
    src.playbackRate.value = o.rate || 1;
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

  // ---------- recorded samples (js/sfxbank.js, files in sfx/) ----------
  // smp(key, ...) plays one variant of a bank key and returns true; it returns false (so the caller falls back to the
  // procedural sound) when samples are switched off in the settings, the key is switched off in sounds.html,
  // or its files have not finished loading yet.
  const SB = G.SFXBANK || { bank: {}, files: {} };
  const bufs = {}, lastPick = {};
  let offKeys = new Set();
  A.loadPrefs = function () { try { offKeys = new Set(JSON.parse(localStorage.getItem('abyss_sfx_off') || '[]')); } catch (e) { offKeys = new Set(); } };
  A.loadPrefs();
  A.force = null; // 'synth' | 'sample' (sounds.html comparisons)
  A.samplesOn = () => A.force ? A.force === 'sample' : G.save.data.settings.sfxSamples !== false;
  const usable = (key) => A.samplesOn() && (A.force === 'sample' || !offKeys.has(key)) && SB.bank[key];
  const pend = {};
  // sfx/sfxdata.js (tools/sfx/pack_data.js): every file as base64 in one script, which works from file:// too; loaded only when a fetch fails
  let dataP = null;
  function dataBuf(f) {
    dataP = dataP || new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'sfx/sfxdata.js'; s.onload = ok; s.onerror = () => no('no sfxdata'); document.head.appendChild(s); });
    return dataP.then(() => {
      const b64 = G.SFXDATA && G.SFXDATA[f]; if (!b64) return Promise.reject('missing ' + f);
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    });
  }
  function fetchBuf(f) {
    if (pend[f]) return pend[f];
    bufs[f] = null;
    return (pend[f] = fetch('sfx/' + f + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .catch(() => dataBuf(f)) // opened from disk (file://) or the files are blocked: take them from the packed copy instead
      .then((ab) => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
      .then((b) => (bufs[f] = b), () => (bufs[f] = false)));
  }
  // one-shots load in the background a few at a time after the audio starts; looping beds load when first needed
  function preload() {
    const list = [];
    for (const k in SB.bank) if (!SB.bank[k].loop) list.push(...SB.bank[k].f);
    let i = 0;
    const next = () => { if (i < list.length) fetchBuf(list[i++]).then(next); };
    for (let n = 0; n < 4; n++) next();
  }
  A.sampleBuf = (f) => bufs[f];
  A.fetchSample = fetchBuf;
  function smp(key, pos, vol, rate, wet, bus) {
    if (!ctx || !usable(key)) return false;
    const b = SB.bank[key], fs = b.f;
    const ready = fs.filter((f) => bufs[f]);
    if (!ready.length) return false;
    let f = ready[Math.floor(Math.random() * ready.length)];
    if (ready.length > 1 && f === lastPick[key]) f = ready[(ready.indexOf(f) + 1) % ready.length];
    lastPick[key] = f;
    const buf = bufs[f];
    const r = b.r || [0.94, 1.06];
    const pr = Math.max(0.3, Math.min(3, (rate || 1) * (r[0] + Math.random() * (r[1] - r[0]))));
    if (!voice(buf.duration / pr)) return true;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = pr;
    const out = dest(pos, wet != null ? wet : b.wet != null ? b.wet : 0.25, bus);
    out.gain.value *= (vol == null ? 1 : vol) * (b.v || 1);
    src.connect(out); src.start();
    return true;
  }
  A.smp = smp;
  // sounds.html: play one file of a key as the game would (its bank level, no random pitch)
  A.playFile = function (key, f) {
    const buf = bufs[f]; if (!ctx || !buf) return false;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const out = dest(null, (SB.bank[key] && SB.bank[key].wet) || 0.25); out.gain.value *= (SB.bank[key] && SB.bank[key].v) || 1;
    src.connect(out); src.start(); return src;
  };
  // sounds.html level matching: renders fn() into an offline buffer (dry path only) and returns its samples
  A.renderOffline = function (fn, secs) {
    const keep = { ctx, master, dry, revSend, gunBus, voices };
    const oc = new OfflineAudioContext(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate);
    ctx = oc; master = oc.createGain(); master.connect(oc.destination);
    dry = oc.createGain(); dry.connect(master); revSend = oc.createGain(); gunBus = oc.createGain(); gunBus.connect(dry); voices = 0;
    try { fn(); } finally { ({ ctx, master, dry, revSend, gunBus, voices } = keep); }
    return oc.startRendering().then((b) => b.getChannelData(0));
  };

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
  A.gun = function (kind, opts) {
    if (!ctx || !voice(1)) return;
    opts = opts || {};
    if (smp('gun_' + (opts.suppressed ? 'suppressed' : GUN[kind] ? kind : 'rifle'), null, opts.vol)) {
      if (kind === 'shotgun' && !opts.auto) A.mech('pump', 0.35);
      if (kind === 'sniper') A.mech('bolt', 0.4);
      if (kind === 'revolver') A.mech('click', 0.2);
      return;
    }
    const p = GUN[opts.suppressed ? 'suppressed' : kind] || GUN.rifle;
    const t = ctx.currentTime;
    const out = dest(null, p.wet * 0.9, gunBus);
    out.gain.value = opts.vol || 1;
    const pr = vr(1, 0.06);
    // mechanical click / transient
    nz({ t, f: [['highpass', 3500]], g: p.crack * 0.9, d: 0.012, to: out });
    // supersonic crack (broadband, quick)
    nz({ t, f: [['bandpass', 4200 * pr, 0.8]], g: p.crack, d: 0.03 + p.crack * 0.02, to: out });
    // body (gas expansion)
    nz({ t, buf: 'pink', f: [['lowpass', p.body * pr, 0.9, p.body * 0.35, p.bd]], g: p.bg, a: 0.001, d: p.bd, to: out });
    // low thump (chest punch)
    tn({ t, f0: p.thump[0] * pr, f1: p.thump[1], d: 0.09 + p.tg * 0.12, g: p.tg, to: out, type: 'triangle', lp: 400 });
    // decaying tail, through reverb mostly
    if (p.tail > 0.1) {
      const tail = dest(null, 1.2, dry); tail.gain.value = 0.35;
      nz({ t: t + 0.01, buf: 'brown', f: [['lowpass', 900, 0.6, 200, p.tail]], g: p.tail * 0.6, a: 0.01, d: p.tail, to: tail });
    }
    if (kind === 'shotgun' && !opts.auto) A.mech('pump', 0.35);
    if (kind === 'sniper') A.mech('bolt', 0.4);
    if (kind === 'revolver') A.mech('click', 0.2);
  };
  // projectile launchers / special
  A.launcher = function (kind) {
    if (!ctx) return;
    if ((kind === 'rocket' || kind === 'rail') && smp('launch_' + kind)) return;
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
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
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
  A._loopKey = (key, lv) => smpLoop(key, lv, 0.2);
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
    const bio = G.world && G.world.mats && G.world.mats.biome;
    const sk = surface === 'stone' && bio && bio.floorTex === 'grass' ? 'grass' : surface || 'stone';
    if (smp('step_' + sk, null, 0.35 * intensity, 0.92 + intensity * 0.08) || smp('step_stone', null, 0.35 * intensity)) return;
    if (!voice(0.3)) return;
    const t = ctx.currentTime, out = dest(null, 0.15);
    out.gain.value = 0.35 * intensity;
    if (surface === 'wood') {
      nz({ t, f: [['bandpass', vr(500, 0.15), 1.4]], g: 0.6, d: 0.07, to: out });
      tn({ t, f0: vr(130, 0.1), f1: 80, d: 0.06, g: 0.4, to: out });
      nz({ t: t + 0.01, f: [['bandpass', 1400, 4]], g: 0.08, d: 0.04, to: out });
    } else if (surface === 'water') {
      nz({ t, f: [['bandpass', vr(1100, 0.2), 1.0, 600, 0.15]], g: 0.6, a: 0.01, d: 0.18, to: out });
      nz({ t: t + 0.05, f: [['bandpass', 2400, 2]], g: 0.15, d: 0.1, to: out });
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
    else { nz({ t, f: [['bandpass', vr(1600, 0.2), 1.2]], g: 0.45, d: 0.04, to: out }); nz({ t: t + 0.01, buf: 'pink', f: [['lowpass', 2500]], g: 0.25, d: 0.08, to: out }); }
  };
  A.explosion = function (pos, size) {
    if (!ctx) return;
    size = size || 1;
    if (smp('explosion', pos, Math.min(1.6, 0.8 + size * 0.3), 1.08 - Math.min(0.3, size * 0.1), 1.0)) return;
    const t = ctx.currentTime, out = dest(pos, 1.0); out.gain.value = Math.min(1.6, 0.8 + size * 0.3);
    tn({ t, f0: 75, f1: 28, d: 0.8 + size * 0.3, g: 1.0, to: out, type: 'sine' });
    nz({ t, buf: 'brown', f: [['lowpass', 1200, 0.6, 120, 1.2]], g: 1.0, a: 0.004, d: 1.0 + size * 0.4, to: out });
    nz({ t, f: [['lowpass', 5000, 0.5, 600, 0.3]], g: 0.6, d: 0.25, to: out });
    // debris crackles
    for (let i = 0; i < 10; i++) nz({ t: t + 0.08 + Math.random() * 0.6, f: [['bandpass', vr(2000, 0.5), 3]], g: 0.08, d: 0.03, to: out });
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
    if (smp(mcat === 'blade' || mcat === 'knife' || mcat === 'scythe' || mcat === 'spear' ? 'melee_slice' : 'melee_blunt', null, heavy ? 1.1 : 0.8, heavy ? 0.85 : 1)) return;
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
    catacombs: [['amb_cave', 0.5]], temple: [['amb_deep', 0.6]], halls: [['amb_deep', 0.6]], gate: [['amb_cavern', 0.4]], abyss: [['amb_cavern', 0.45]],
    flooded: [['amb_cavern', 0.35], ['amb_water', 0.3]], forge: [['amb_deep', 0.5], ['amb_fire', 0.35]], frozen: [['amb_cavern', 0.35], ['amb_wind', 0.25]],
    ruins: [['amb_wind', 0.4]], bloodmoon: [['amb_wind', 0.4]], grave: [['amb_wind', 0.35]], crimson: [['amb_wind', 0.4]], ruin: [['amb_wind', 0.35], ['amb_fire', 0.2]],
    sky: [['amb_wind', 0.55]], void: [['amb_wind', 0.35], ['amb_cavern', 0.25]],
  };
  let beds = [], bedKey = null, bedV = 1;
  function setBeds(v) {
    const bk = (G.world && G.world.biome) || 'catacombs';
    const want = A.samplesOn() ? BEDS[bk] || BEDS.catacombs : [];
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
  A.refreshAmbience = () => { bedKey = null; if (amb) setBeds(bedV); };
  A.drip = function (pos) {
    if (!ctx || smp('drip', pos, 0.25, 1, 1.2) || !voice(0.5)) return;
    const t = ctx.currentTime, out = dest(pos, 1.2); out.gain.value = 0.25;
    const f = vr(1400, 0.3);
    tn({ t, f0: f, f1: f * 1.8, fd: 0.03, d: 0.06, g: 0.12, to: out });
    nz({ t, f: [['bandpass', f, 8]], g: 0.08, d: 0.04, to: out });
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
  A.chestPry = function (k, pos) {
    if (!ctx || smp('chest_pry', pos, 0.55 + k * 0.35, 0.8 + k * 0.5, 0.15)) return;
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
