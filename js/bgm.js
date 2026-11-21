'use strict';
// Background music. One table (B.TABLE) says which track plays where: the title, each field's ordinary areas, the blue
// depths, the merchant's hall, the quiet rooms and the guardians. One track plays at a time; a change of track is a 2-second
// crossfade, and when the next place has the same track it simply goes on (no restart).
// - The music has its own small audio graph (its own AudioContext: audio.js keeps its context private). Its level follows
//   both the master volume (settings.volume, read from G.sfx.volume) and its own slider (settings.bgm, 0 = nothing plays).
// - Tracks play through <audio> elements (a 3-minute track decoded whole would take ~60 MB), and are only fetched when
//   their place is first entered (a few MB each, kept compressed in memory): nothing is fetched at start-up.
//   Until a track can play, the last music goes on.
// - A missing file plays nothing, quietly.
// - The game is only read, every 100 ms (GM.state / GM.stage / GM.bossEngaged, the world's field and blue): nothing in
//   game.js is needed. Every player hears the music of their own screen (a guest builds its areas through the same enterArea).
// - Gun shots and blasts duck the music for a moment (G.sfx.gun / launcher / explosion are wrapped, not changed).
(function () {
  const B = (G.bgm = {});
  // where the tracks live (beside the sound samples in snd/; their sources: snd/bgm/SOURCES_BGM.md)
  B.DIR = 'snd/bgm/';
  // the tracks. g: playback gain, the rest of the loudness match (the files are levelled to -18 LUFS, as far as their peaks allow).
  // tail: a track that ends (a fade-out, a closing chord): its last `tail` seconds are crossfaded into its start again.
  // Without tail the file is a seamless loop and simply repeats.
  B.TRACKS = {
    tg_shadows: { f: 'tg_shadows.ogg', g: 1 }, // When the Shadows Gather (Tsorthan Grove, CC0)
    yd_insistent: { f: 'yd_insistent.ogg', g: 1 }, // Insistent (yd, CC0)
    yd_factory: { f: 'yd_factory.ogg', g: 1 }, // Factory ambiance (yd, CC0)
    tg_machines: { f: 'tg_machines.ogg', g: 1.14 }, // Machines (Tsorthan Grove, CC0)
    tg_drone: { f: 'tg_drone.ogg', g: 1 }, // Dark Ambient Drone (Tsorthan Grove, CC0)
    subspace_horror: { f: 'subspace_horror.ogg', g: 1.28 }, // Horror Atmosphere (SubspaceAudio, CC0)
    km_lightlessdawn: { f: 'km_lightlessdawn.ogg', g: 1.95, tail: 6 }, // Lightless Dawn (Kevin MacLeod, CC BY 4.0)
    yd_dungeon: { f: 'yd_dungeon.ogg', g: 1.56, tail: 5 }, // Dungeon Ambience (yd, CC0)
    km_ossuary5rest: { f: 'km_ossuary5rest.ogg', g: 1, tail: 6 }, // Ossuary 5 - Rest (Kevin MacLeod, CC BY 4.0)
    vitalezzz_hunter: { f: 'vitalezzz_hunter.ogg', g: 1 }, // Hunter-class Lifeform (vitalezzz, CC0)
    km_industrialcinematic: { f: 'km_industrialcinematic.ogg', g: 1.24, tail: 6 }, // Industrial Cinematic (Kevin MacLeod, CC BY 4.0)
    km_blackvortex: { f: 'km_blackvortex.ogg', g: 1, tail: 4 }, // Black Vortex (Kevin MacLeod, CC BY 4.0)
    km_ossuary4animate: { f: 'km_ossuary4animate.ogg', g: 1, tail: 4 }, // Ossuary 4 - Animate (Kevin MacLeod, CC BY 4.0)
  };
  // where each track plays (one line each: change a name to change the music there; null = silence)
  B.TABLE = {
    title: 'tg_shadows', // the title and the menus before a run
    // ordinary areas, by field (runplan.js R.TIERS ids), in groups of a like mood
    field: {
      grave: 'yd_insistent', hamlet: 'yd_insistent', battlefield: 'yd_insistent', dusk: 'yd_insistent', // outdoors at night
      gate: 'yd_insistent', catacombs: 'yd_insistent', castle: 'yd_insistent', halls: 'yd_insistent', shaft: 'yd_insistent', // stone underground
      flooded: 'yd_insistent', frozen: 'yd_insistent', // water and ice
      plant: 'yd_factory', foundry: 'yd_factory', mine: 'tg_machines', // machines
      sanctum: 'tg_drone', pillars: 'tg_drone', ruin: 'tg_drone', spire: 'tg_drone', // the abyss
    },
    fieldOther: 'yd_insistent', // a field not in the list above
    // the blue depths (runplan.js R.blue: hard's last segment, every extra one), whatever the field: in turn, segment by segment
    deep: ['subspace_horror', 'km_lightlessdawn'],
    shop: 'yd_dungeon', // the merchant's hall (and the preparation area before a guardian)
    room: 'km_ossuary5rest', // the quiet rooms (shrine, forge, alchemy, casino, bank, auction, mercenaries, offering, event)
    // the guardians, from the moment the fight starts (the approach keeps the field's music, and so does the arena once it is won)
    boss: { last: 'km_ossuary4animate', deep: 'km_blackvortex', machine: 'km_industrialcinematic', other: 'vitalezzz_hunter' },
  };
  B.MACHINE = ['plant', 'foundry', 'mine']; // the fields whose guardian fights take boss.machine
  // the overall level under the two sliders: kept low, so that the steps, the foes and the ambience stay in front
  // (measured at the defaults: the music about 3 dB under the field's ambience, 8 dB under footsteps, 17 dB under a rifle shot)
  B.BASE = 0.45;
  const FADE_IN = 2.0, FADE_OUT = 2.2; // a change of track: seconds of crossfade
  const ROOMS = ['event', 'shrine', 'forge', 'alchemy', 'casino', 'bank', 'auction', 'merc', 'offering']; // (areas.js AR.ROOMS, used when it is there)

  let ctx = null, out = null, sink = null, duck = null, lp = null;
  let cur = null; // the playing track: { id, gain, el voices, started, dead }
  let want = null; // the track waiting to be able to play: it replaces `cur` once it can
  const dying = []; // tracks fading out
  let hidden = false, mood = 'play', moodGain = 1;
  B.trace = null; // tests: an array to fill with the levels once a tick
  B.silent = false; // tests: everything runs and is measured, but nothing reaches the speakers

  const S = () => (G.save && G.save.data && G.save.data.settings) || {};
  const level = () => { const s = S(), v = s.bgm == null ? 0.6 : +s.bgm, m = G.sfx && G.sfx.volume != null ? G.sfx.volume : s.volume == null ? 0.8 : s.volume; return Math.max(0, v) * Math.max(0, m) * B.BASE; };

  // the context is made on the first press or click (browsers keep audio closed until then)
  function init() {
    if (ctx) { if (ctx.state === 'suspended' && !hidden) ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
    out = ctx.createGain(); out.gain.value = level();
    duck = ctx.createGain(); duck.gain.value = 1;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5; // (closed a little behind the menus)
    sink = ctx.createGain(); sink.gain.value = B.silent ? 0 : 1;
    duck.connect(lp); lp.connect(out); out.connect(sink); sink.connect(ctx.destination);
  }
  { const wake = () => { init(); if (ctx) { window.removeEventListener('pointerdown', wake, true); window.removeEventListener('keydown', wake, true); window.removeEventListener('touchstart', wake, true); } };
    window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true); window.addEventListener('touchstart', wake, true); }
  B.init = init;

  // ---------------- which track ----------------
  // st: GM.state, stage: GM.stage (the area's kind), field: the world's field id, blue: the blue depths, seg: the run's segment,
  // fight: a guardian fight under way, last: the run's last guardian
  B.trackOf = function (o) {
    const T = B.TABLE;
    if (o.st === 'title' || o.stage === 'title' || !o.stage) return T.title;
    if (o.stage === 'shop') return T.shop;
    if (((G.Areas && G.Areas.ROOMS) || ROOMS).includes(o.stage)) return T.room;
    if (o.stage === 'boss' && o.fight) return o.last ? T.boss.last : o.blue ? T.boss.deep : B.MACHINE.includes(o.field) ? T.boss.machine : T.boss.other;
    if (o.blue && T.deep && T.deep.length) return T.deep[Math.max(0, o.seg || 0) % T.deep.length];
    return (o.field && T.field[o.field]) || T.fieldOther;
  };
  B.force = null; // tests: a track id held regardless of the game
  function placeNow() {
    const GM = G.game, R = G.Run, w = G.world;
    if (!GM) return null;
    const n = GM.area || 1;
    return {
      st: GM.state, stage: GM.stage, field: w && w.field, blue: !!(w && w.blue), seg: R && R.seg ? R.seg(n) : 0,
      fight: !!GM.bossEngaged && !GM.areaCleared, last: !!(R && R.isLast && R.isLast(n)),
    };
  }
  function trackNow() { if (B.force !== null) return B.force; const o = placeNow(); return o ? B.trackOf(o) : null; }

  // ---------------- playing a track ----------------
  // one voice (a seamless loop) or two that take turns (`tail`: the end crossfaded into the start)
  function voice(t, first) {
    const el = new Audio(); el.preload = 'auto'; el.loop = !t.tail;
    const v = { el, g: ctx.createGain(), src: null };
    v.g.gain.value = first ? 1 : 0; v.g.connect(t.gain);
    try { v.src = ctx.createMediaElementSource(el); v.src.connect(v.g); } catch (e) { t.bad = true; }
    return v;
  }
  function makeTrack(id) {
    const def = B.TRACKS[id] || {};
    const t = { id, file: def.f, g: def.g == null ? 1 : def.g, tail: Math.max(0, def.tail || 0), ok: false, bad: !def.f, gain: ctx.createGain(), p: [], on: 0, started: false, dead: false };
    t.gain.gain.value = 0; t.gain.connect(duck);
    if (t.bad) return t;
    t.p.push(voice(t, true));
    if (t.tail) t.p.push(voice(t, false));
    // the file is fetched whole (a few MB, still compressed) and played from memory: it can be sought on any server
    // (one that ignores range requests too), and a missing file is a quiet failed fetch, not a media error
    const el = t.p[0].el;
    el.addEventListener('canplaythrough', () => { t.ok = true; t.readyT = performance.now(); }, { once: true });
    el.addEventListener('error', () => { t.bad = true; }, { once: true });
    t.askT = performance.now();
    fetch(B.DIR + t.file).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then((b) => {
      if (t.gone) return;
      t.url = URL.createObjectURL(b); t.kb = Math.round(b.size / 1024);
      for (const v of t.p) v.el.src = t.url;
    }).catch(() => { t.bad = true; });
    return t;
  }
  const live = (t) => t.p[t.on];
  const play = (el) => { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  function startTrack(t) {
    t.started = true; const now = ctx.currentTime, v = live(t);
    try { v.el.currentTime = 0; } catch (e) {}
    play(v.el);
    t.gain.gain.cancelScheduledValues(now); t.gain.gain.setValueAtTime(0, now); t.gain.gain.linearRampToValueAtTime(t.g, now + FADE_IN);
  }
  function fadeOut(t, secs) {
    if (!t || t.dead) return;
    t.dead = true; const now = ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now); t.gain.gain.setValueAtTime(t.gain.gain.value, now); t.gain.gain.linearRampToValueAtTime(0, now + secs);
    t.until = now + secs + 0.2; dying.push(t);
  }
  function drop(t) {
    t.gone = true;
    if (t.url) { try { URL.revokeObjectURL(t.url); } catch (e) {} t.url = null; }
    for (const v of t.p) { try { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); } catch (e) {} try { v.src && v.src.disconnect(); v.g.disconnect(); } catch (e) {} }
    try { t.gain.disconnect(); } catch (e) {}
  }
  // a track that ends: near its end, the other voice starts it again, and the two cross (equal power)
  const XIN = new Float32Array(32).map((_, i) => Math.sin((i / 31) * Math.PI / 2)), XOUT = XIN.map((_, i) => XIN[31 - i]);
  function turn(t) {
    const a = live(t), d = a.el.duration;
    if (!t.tail || !isFinite(d) || a.el.paused || a.el.currentTime < d - t.tail) return;
    const b = t.p[1 - t.on], now = ctx.currentTime, x = Math.max(0.2, Math.min(t.tail, d - a.el.currentTime));
    try { b.el.currentTime = 0; } catch (e) {}
    play(b.el);
    for (const [v, c] of [[b, XIN], [a, XOUT]]) { v.g.gain.cancelScheduledValues(now); v.g.gain.setValueCurveAtTime(c, now, x); }
    t.on = 1 - t.on; t.turns = (t.turns || 0) + 1;
  }
  function setTrack(id) {
    if (cur && !cur.dead && cur.id === id) { if (want) { drop(want); want = null; } return; } // (the same track: it goes on)
    if (want && want.id === id) return;
    if (want) { drop(want); want = null; }
    if (!id) { if (cur) { fadeOut(cur, FADE_OUT); cur = null; } return; }
    want = makeTrack(id);
  }

  // ---------------- each tick ----------------
  let lastEnded = false;
  function tick() {
    if (!ctx || hidden) return;
    const now = ctx.currentTime, lv = level();
    out.gain.setTargetAtTime(lv, now, 0.08);
    sink.gain.value = B.silent ? 0 : 1;
    const GM = G.game, st = GM && GM.state;
    // death and the end of a run: the music lets go; nothing new starts until the title
    const died = st !== 'title' && (st === 'dead' || !!(G.player && G.player.dead)), ended = died || (st !== 'title' && !!(GM && GM.won));
    if (ended && !lastEnded) { if (cur) { fadeOut(cur, died ? 2.5 : 4); cur = null; } if (want) { drop(want); want = null; } }
    lastEnded = ended;
    if (lv <= 0) { if (cur) { fadeOut(cur, 0.4); cur = null; } if (want) { drop(want); want = null; } }
    else if (!ended) setTrack(trackNow());
    // the waiting track takes over once it can play (or quietly gives up)
    if (want && (want.ok || want.bad)) {
      if (want.ok && !want.bad) { if (cur) fadeOut(cur, FADE_OUT); cur = want; startTrack(cur); } else { drop(want); if (cur) fadeOut(cur, FADE_OUT); cur = null; }
      want = null;
    }
    if (cur && cur.started && !cur.bad) turn(cur);
    // menus, the pause, the inventory, a choice: the music steps back (lower, duller)
    const m = st === 'paused' || st === 'modal' || st === 'buff' || st === 'inv' || st === 'resuming' ? 'menu' : 'play';
    if (m !== mood) { mood = m; moodGain = m === 'menu' ? 0.55 : 1; lp.frequency.setTargetAtTime(m === 'menu' ? 1500 : 20000, now, 0.25); }
    if (now >= duckEnd) duck.gain.setTargetAtTime(moodGain, now, 0.2);
    // the fading tracks go when silent
    for (let i = dying.length - 1; i >= 0; i--) if (now > dying[i].until) { drop(dying[i]); dying.splice(i, 1); }
    if (B.trace) B.trace.push({ t: +now.toFixed(2), id: cur ? cur.id : null, want: want ? want.id : null, gain: cur ? +cur.gain.gain.value.toFixed(3) : 0,
      voices: cur ? cur.p.map((v) => +v.g.gain.value.toFixed(2)).join('/') : '', pos: cur && cur.p.length ? +live(cur).el.currentTime.toFixed(2) : 0, el: cur && cur.p.length ? (live(cur).el.paused ? 'paused' : 'on') + live(cur).el.readyState : '', turns: cur ? cur.turns || 0 : 0,
      duck: +duck.gain.value.toFixed(3), lp: Math.round(lp.frequency.value), out: +out.gain.value.toFixed(3), mood, dying: dying.map((d) => d.id + ':' + d.gain.gain.value.toFixed(2)).join(','), ctx: ctx.state });
  }
  setInterval(() => { try { tick(); } catch (e) { B.err = String((e && e.stack) || e); } }, 100);

  // ---------------- ducking under the guns ----------------
  let duckEnd = 0;
  B.duck = function (depth, hold) {
    if (!ctx || !duck || !depth) return;
    const now = ctx.currentTime, low = moodGain * (1 - depth);
    duck.gain.cancelScheduledValues(now); duck.gain.setValueAtTime(duck.gain.value, now);
    duck.gain.linearRampToValueAtTime(Math.min(duck.gain.value, low), now + 0.015);
    duck.gain.setTargetAtTime(moodGain, now + 0.015 + (hold || 0.06), 0.25);
    duckEnd = now + 0.015 + (hold || 0.06) + 1;
  };
  // wrap the shot and blast sounds that audio.js made (it is loaded before this file)
  function wrap(name, depth, hold) {
    const A = G.sfx; if (!A || typeof A[name] !== 'function' || A[name]._bgm) return;
    const f = A[name], w = function () { try { B.duck(depth, hold); } catch (e) {} return f.apply(this, arguments); };
    w._bgm = true; A[name] = w;
  }
  wrap('gun', 0.3, 0.05); wrap('launcher', 0.35, 0.08); wrap('explosion', 0.45, 0.12);

  // ---------------- the tab, the slider ----------------
  // a hidden tab: every voice stops where it is and the context sleeps; back, the playing ones go on
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!ctx) return;
    const all = [cur, want, ...dying].filter(Boolean);
    if (hidden) { for (const t of all) for (const v of t.p) { v.wasOn = !v.el.paused; try { v.el.pause(); } catch (e) {} } ctx.suspend(); }
    else { ctx.resume(); for (const t of all) if (t.started) for (const v of t.p) if (v.wasOn && !t.bad) play(v.el); }
  });
  // settings.bgm (0..1) is read every tick; this only makes the change heard at once
  // a phone back from another app: the context may still be asleep (or 'interrupted', Safari) until the next touch
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, () => { if (ctx && !hidden && ctx.state !== 'running' && ctx.state !== 'closed') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); const all = [cur, ...dying].filter(Boolean); for (const t of all) if (t.started && !t.bad) for (const v of t.p) if (v.wasOn) play(v.el); } }, true);
  B.setVolume = (v) => { const s = S(); s.bgm = Math.max(0, Math.min(1, +v || 0)); if (ctx && out) out.gain.setTargetAtTime(level(), ctx.currentTime, 0.05); };
  // what is playing now (tests, and the tools)
  B.state = () => ({ ctx: ctx ? ctx.state : null, track: cur ? cur.id : null, want: want ? want.id : null, mood, level: level(), place: placeNow(), load: cur ? { kb: cur.kb, ms: cur.readyT && cur.askT ? Math.round(cur.readyT - cur.askT) : null } : null });
  // tests: a meter on the music as it leaves (after both sliders, before the speakers)
  B.meter = () => { if (!ctx) return null; if (!B._an) { B._an = ctx.createAnalyser(); B._an.fftSize = 2048; out.connect(B._an); } return B._an; };
  // tests: the playing track sent to a share (0..1) of its length
  B._seekTo = (k) => { if (cur) { const e = live(cur).el; if (isFinite(e.duration)) try { e.currentTime = e.duration * k; } catch (er) {} } };
  // tests: the playing track sent to `secs` before its end (to measure the end-of-track crossfade)
  B._seekEnd = (secs) => { if (cur) { const e = live(cur).el; if (isFinite(e.duration)) try { e.currentTime = Math.max(0, e.duration - secs); } catch (er) {} } };
})();
