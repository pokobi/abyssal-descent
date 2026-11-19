'use strict';
// Background music. One table (B.TABLE) says which tracks play in which scene; every scene has one to three layers that
// play together, in step, and the fight's heat slides the volume from the first (quiet) layer toward the last (intense) one.
// - The music has its own small audio graph (its own AudioContext: audio.js keeps its context private). Its level follows
//   both the master volume (settings.volume, read from G.sfx.volume) and its own slider (settings.bgm, 0 = nothing plays).
// - Tracks play through <audio> elements (a 3-minute track decoded whole would take ~60 MB), and are only fetched when
//   their scene is first entered (a few MB each, kept compressed in memory): nothing is fetched at start-up.
//   Until a scene's tracks can play, the last music goes on.
// - A table with no files (or files that fail to load) plays nothing, quietly.
// - The game is only read, every 100 ms (GM.state / GM.stage, the foes, the run's damage); nothing in game.js is needed.
//   Gun shots and blasts duck the music for a moment (G.sfx.gun / launcher / explosion are wrapped, not changed).
(function () {
  const B = (G.bgm = {});
  // where the tracks live (beside the sound samples in snd/)
  B.DIR = 'snd/bgm/';
  // scene -> layers (quiet first). A layer is a file name under B.DIR, or null, or an object:
  //   { f: name, g: gain (1), tail: seconds (0), from: seconds (0) }
  //   tail: a track that ends (a fade-out, a closing chord) is not looped hard: its last `tail` seconds are crossfaded
  //   into its start again (from `from`). 0 = the file is a seamless loop and simply repeats.
  // The scenes:
  //   title : the title and the menus before a run
  //   area  : an ordinary area: [exploring, fighting, fierce fighting]
  //   boss  : a guardian's arena: [before / between the blows, the fight]
  //   room  : the merchant's hall and the quiet rooms (shrine, forge, alchemy, casino, bank, auction, mercenaries, offering, event)
  //   deep  : an area of the deep segments (the blue depths: w.blue); `fallback` when it has no tracks
  // gain: the scene's own level (1 = as mixed). A missing layer borrows its nearest neighbour; a scene with no tracks is silence.
  // Layers meant to be heard in step should be the same length (the tracks of one set, same tempo).
  B.TABLE = {
    title: { layers: [null], gain: 1 },
    area: { layers: [null, null, null], gain: 1 },
    boss: { layers: [null, null], gain: 1 },
    room: { layers: [null], gain: 1 },
    deep: { layers: [null, null, null], gain: 1, fallback: 'area' },
  };
  // the overall level under the two sliders: kept low, so that the steps, the foes and the ambience stay in front
  B.BASE = 0.32;
  const FADE_IN = 2.0, FADE_OUT = 2.6; // a change of scene: seconds of crossfade
  const ROOMS = ['event', 'shrine', 'forge', 'alchemy', 'casino', 'bank', 'auction', 'merc', 'offering']; // (areas.js AR.ROOMS, used when it is there)

  let ctx = null, out = null, sink = null, duck = null, lp = null;
  let cur = null; // the playing set: { key, scene, gain, group, layers: [layer], started, dead }
  let want = null; // the set waiting for its tracks: it replaces `cur` once they can play
  const dying = []; // sets fading out
  let heat = 0, inten = 0, lastTaken = null, lastKills = null, hidden = false, mood = 'play', moodGain = 1;
  B.trace = null; // tests: an array to fill with the levels once a tick
  B.silent = false; // tests: everything runs and is measured, but nothing reaches the speakers

  const S = () => (G.save && G.save.data && G.save.data.settings) || {};
  const level = () => { const s = S(), v = s.bgm == null ? 0.6 : +s.bgm, m = G.sfx && G.sfx.volume != null ? G.sfx.volume : s.volume == null ? 0.8 : s.volume; return Math.max(0, v) * Math.max(0, m) * B.BASE; };
  const fileOf = (l) => (l == null ? null : typeof l === 'string' ? l : l.f || null);
  const optOf = (l, k, d) => (l && typeof l === 'object' && l[k] != null ? +l[k] : d);

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

  // ---------------- which scene ----------------
  B.sceneOf = function (st, stage, blue) {
    if (st === 'title' || stage === 'title' || !stage) return 'title';
    if (stage === 'boss') return 'boss';
    if (stage === 'shop' || ((G.Areas && G.Areas.ROOMS) || ROOMS).includes(stage)) return 'room';
    if (blue) return 'deep';
    return 'area';
  };
  B.force = null; // tests: a scene name held regardless of the game
  function sceneNow() {
    if (B.force) return B.force;
    const GM = G.game;
    return GM ? B.sceneOf(GM.state, GM.stage, !!(G.world && G.world.blue)) : null;
  }
  // the scene's layers, after the fallbacks (null when it has none)
  function setOf(scene) {
    let row = B.TABLE[scene];
    const has = (r) => r && r.layers && r.layers.some((l) => fileOf(l));
    if (!has(row) && row && row.fallback) row = B.TABLE[row.fallback];
    if (!has(row)) return null;
    const L = row.layers.slice();
    for (let i = 0; i < L.length; i++) if (!fileOf(L[i])) { for (let d = 1; d < L.length; d++) { const a = L[i - d] || L[i + d]; if (fileOf(a)) { L[i] = a; break; } } }
    return { layers: L, gain: row.gain == null ? 1 : row.gain, key: L.map(fileOf).join('|') };
  }

  // ---------------- the fight's heat ----------------
  // 0 = calm, 1 = fierce: foes awake and near, damage taken lately, blows landed lately, a guardian alive
  function heatNow(dt) {
    const GM = G.game, P = G.player;
    heat *= Math.exp(-dt / 7);
    if (GM && GM.run) {
      const tk = GM.run.dmgTaken || 0, kl = GM.run.kills || 0, mhp = (P && P.stats && P.stats.maxHp) || 100;
      if (lastTaken != null && tk > lastTaken) heat += Math.min(0.6, ((tk - lastTaken) / mhp) * 2.2);
      if (lastKills != null && kl > lastKills) heat += 0.12 * Math.min(3, kl - lastKills);
      lastTaken = tk; lastKills = kl;
    }
    let near = 0;
    const list = G.enemies && G.enemies.list;
    if (list && P && P.pos) for (const e of list) {
      if (!e || !e.alive || e.boss || !e.pos || e.state === 'dead' || e.state === 'spawn') continue;
      if (!(e.aware || e.state === 'chase' || e.state === 'attack')) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      if (dx * dx + dz * dz < 28 * 28) near++;
    }
    B.near = near;
    heat = Math.min(1.2, heat);
    let k = Math.min(1, near / 6) * 0.7 + heat;
    const bs = G.bosses && G.bosses.active;
    if (bs && bs.alive !== false && bs.hp > 0) k = Math.max(k, 0.7);
    return Math.max(0, Math.min(1, k));
  }
  B.bump = (k) => { heat = Math.min(1.2, heat + (k || 0.06)); };

  // ---------------- playing a set ----------------
  // a layer: one track, played by one voice (a seamless loop) or two that take turns (`tail`: crossfaded at the end)
  function voice(ly, group) {
    const el = new Audio(); el.preload = 'auto'; el.loop = !ly.tail;
    const v = { el, g: ctx.createGain(), src: null };
    v.g.gain.value = ly.p.length ? 0 : 1; v.g.connect(ly.gain);
    try { v.src = ctx.createMediaElementSource(el); v.src.connect(v.g); } catch (e) { ly.bad = true; }
    return v;
  }
  function makeSet(scene, set) {
    const group = ctx.createGain(); group.gain.value = 0; group.connect(duck);
    const S2 = { key: set.key, scene, gain: set.gain, group, layers: [], started: false, dead: false };
    const seen = {};
    for (const l of set.layers) {
      const f = fileOf(l);
      if (seen[f]) { S2.layers.push(seen[f]); continue; } // (a borrowed layer shares the track and its gain)
      const ly = { file: f, g: optOf(l, 'g', 1), tail: Math.max(0, optOf(l, 'tail', 0)), from: Math.max(0, optOf(l, 'from', 0)), ok: false, bad: false, gain: ctx.createGain(), w: 0, p: [], on: 0 };
      ly.gain.gain.value = 0; ly.gain.connect(group);
      ly.p.push(voice(ly, group));
      if (ly.tail) ly.p.push(voice(ly, group));
      // the file is fetched whole (a few MB, still compressed) and played from memory: it can be sought on any server
      // (one that ignores range requests too), and a missing file is a quiet failed fetch, not a media error
      const el = ly.p[0].el;
      el.addEventListener('canplaythrough', () => { ly.ok = true; }, { once: true });
      el.addEventListener('error', () => { ly.bad = true; }, { once: true });
      fetch(B.DIR + f).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then((b) => {
        if (S2.gone) return;
        ly.url = URL.createObjectURL(b);
        for (const v of ly.p) v.el.src = ly.url;
      }).catch(() => { ly.bad = true; });
      seen[f] = ly; S2.layers.push(ly);
    }
    return S2;
  }
  const uniq = (set) => [...new Set(set.layers)];
  const live = (ly) => ly.p[ly.on];
  const play = (el) => { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  function startSet(s) {
    s.started = true; const t = ctx.currentTime;
    for (const ly of uniq(s)) if (!ly.bad) { const v = live(ly); try { v.el.currentTime = 0; } catch (e) {} play(v.el); }
    s.group.gain.cancelScheduledValues(t); s.group.gain.setValueAtTime(s.group.gain.value, t); s.group.gain.linearRampToValueAtTime(s.gain, t + FADE_IN);
  }
  function fadeOut(s, secs) {
    if (!s || s.dead) return;
    s.dead = true; const t = ctx.currentTime;
    s.group.gain.cancelScheduledValues(t); s.group.gain.setValueAtTime(s.group.gain.value, t); s.group.gain.linearRampToValueAtTime(0, t + secs);
    s.until = t + secs + 0.2; dying.push(s);
  }
  function drop(s) {
    s.gone = true;
    for (const ly of uniq(s)) {
      if (ly.url) { try { URL.revokeObjectURL(ly.url); } catch (e) {} ly.url = null; }
      for (const v of ly.p) { try { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); } catch (e) {} try { v.src && v.src.disconnect(); v.g.disconnect(); } catch (e) {} }
      try { ly.gain.disconnect(); } catch (e) {}
    }
    try { s.group.disconnect(); } catch (e) {}
  }
  // a track that ends: near its end, the other voice starts it again from `from`, and the two cross (equal power)
  const XIN = new Float32Array(32).map((_, i) => Math.sin((i / 31) * Math.PI / 2)), XOUT = XIN.map((_, i) => XIN[31 - i]);
  function turn(ly) {
    const a = live(ly), d = a.el.duration;
    if (!ly.tail || !isFinite(d) || a.el.paused || a.el.currentTime < d - ly.tail) return;
    const b = ly.p[1 - ly.on], t = ctx.currentTime, x = Math.max(0.2, Math.min(ly.tail, d - a.el.currentTime));
    try { b.el.currentTime = ly.from; } catch (e) {}
    play(b.el);
    for (const [v, c] of [[b, XIN], [a, XOUT]]) { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueCurveAtTime(c, t, x); }
    ly.on = 1 - ly.on;
  }
  function setScene(scene) {
    const set = scene ? setOf(scene) : null;
    const key = set ? set.key : null;
    if (cur && !cur.dead && cur.key === key) { if (want) { drop(want); want = null; } cur.scene = scene; return; } // (the same tracks: they go on)
    if (want && want.key === key) return;
    if (want) { drop(want); want = null; }
    if (!set) { if (cur) { fadeOut(cur, FADE_OUT); cur = null; } return; }
    want = makeSet(scene, set);
  }

  // the layers' volumes for a heat: equal power between the two layers either side of it
  function layerW(n, k) {
    const w = new Array(n).fill(0);
    if (n === 1) { w[0] = 1; return w; }
    const p = k * (n - 1), i = Math.min(n - 2, Math.floor(p)), f = p - i;
    w[i] = Math.cos(f * Math.PI / 2); w[i + 1] = Math.sin(f * Math.PI / 2);
    return w;
  }

  // ---------------- each tick ----------------
  let lastT = performance.now(), lastScene, lastEnded;
  function tick() {
    const now = performance.now(), dt = Math.min(0.5, (now - lastT) / 1000); lastT = now;
    if (!ctx || hidden) return;
    const t = ctx.currentTime, lv = level();
    out.gain.setTargetAtTime(lv, t, 0.08);
    sink.gain.value = B.silent ? 0 : 1;
    const GM = G.game, st = GM && GM.state;
    // death and the end of a run: the music lets go; nothing new starts until the next scene
    const died = st !== 'title' && (st === 'dead' || !!(G.player && G.player.dead)), ended = died || (st !== 'title' && !!(GM && GM.won));
    const scene = lv <= 0 || ended ? null : sceneNow();
    if (scene !== lastScene || ended !== lastEnded) {
      if (ended && cur) { fadeOut(cur, died ? 2.5 : 4); cur = null; }
      if (ended && want) { drop(want); want = null; }
      lastScene = scene; lastEnded = ended;
    }
    if (lv <= 0) { if (cur) { fadeOut(cur, 0.4); cur = null; } if (want) { drop(want); want = null; } }
    else if (!ended) setScene(scene);
    // the waiting set takes over once every track it has can play (or has failed)
    if (want) {
      const ls = uniq(want);
      if (ls.every((l) => l.ok || l.bad)) {
        if (ls.some((l) => l.ok && !l.bad)) { if (cur) fadeOut(cur, FADE_OUT); cur = want; startSet(cur); } else { drop(want); if (cur) fadeOut(cur, FADE_OUT); cur = null; }
        want = null;
      }
    }
    // the heat: fast up, slow down
    const k = scene === 'title' || scene === 'room' ? 0 : heatNow(dt);
    inten += (k - inten) * (1 - Math.exp(-dt / (k > inten ? 1.2 : 5)));
    if (cur && cur.started) {
      const w = layerW(cur.layers.length, inten), sum = new Map();
      cur.layers.forEach((ly, i) => sum.set(ly, Math.sqrt((sum.get(ly) || 0) ** 2 + w[i] ** 2)));
      for (const [ly, v] of sum) { ly.w = v; ly.gain.gain.setTargetAtTime(ly.bad ? 0 : v * ly.g, t, 0.25); }
      const ls = uniq(cur).filter((l) => l.ok && !l.bad);
      for (const l of ls) turn(l);
      // the layers keep in step (same-length tracks): a silent one that has drifted is put back beside the first
      const lead = ls[0], le = lead && live(lead).el;
      if (le) for (const l of ls) { const e = live(l).el; if (l !== lead && l.w < 0.05 && Math.abs(e.duration - le.duration) < 0.05 && Math.abs(e.currentTime - le.currentTime) > 0.06) { try { e.currentTime = le.currentTime; } catch (er) {} } }
    }
    // menus, the pause, the inventory, a choice: the music steps back (lower, duller)
    const m = st === 'paused' || st === 'modal' || st === 'buff' || st === 'inv' || st === 'resuming' ? 'menu' : 'play';
    if (m !== mood) { mood = m; moodGain = m === 'menu' ? 0.55 : 1; lp.frequency.setTargetAtTime(m === 'menu' ? 1500 : 20000, t, 0.25); }
    if (t >= duckEnd) duck.gain.setTargetAtTime(moodGain, t, 0.2);
    // the fading sets go when silent
    for (let i = dying.length - 1; i >= 0; i--) if (t > dying[i].until) { drop(dying[i]); dying.splice(i, 1); }
    if (B.trace) B.trace.push({ t: +t.toFixed(2), scene: cur ? cur.scene : null, want: want ? want.scene : null, inten: +inten.toFixed(3), near: B.near || 0,
      gains: cur ? uniq(cur).map((l) => +l.gain.gain.value.toFixed(3)) : [], voices: cur ? uniq(cur).map((l) => l.p.map((v) => +v.g.gain.value.toFixed(2)).join('/')) : [],
      pos: cur ? uniq(cur).map((l) => +live(l).el.currentTime.toFixed(2)) : [], group: cur ? +cur.group.gain.value.toFixed(3) : 0,
      duck: +duck.gain.value.toFixed(3), lp: Math.round(lp.frequency.value), out: +out.gain.value.toFixed(3), mood, dying: dying.length });
  }
  setInterval(() => { try { tick(); } catch (e) { B.err = String((e && e.stack) || e); } }, 100);

  // ---------------- ducking under the guns ----------------
  let duckEnd = 0;
  B.duck = function (depth, hold) {
    if (!ctx || !duck || !depth) return;
    const t = ctx.currentTime, low = moodGain * (1 - depth);
    duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(duck.gain.value, t);
    duck.gain.linearRampToValueAtTime(Math.min(duck.gain.value, low), t + 0.015);
    duck.gain.setTargetAtTime(moodGain, t + 0.015 + (hold || 0.06), 0.25);
    duckEnd = t + 0.015 + (hold || 0.06) + 1;
  };
  // wrap the shot and blast sounds that audio.js made (it is loaded before this file)
  function wrap(name, depth, hold, hot) {
    const A = G.sfx; if (!A || typeof A[name] !== 'function' || A[name]._bgm) return;
    const f = A[name], w = function () { try { B.duck(depth, hold); if (hot) B.bump(hot); } catch (e) {} return f.apply(this, arguments); };
    w._bgm = true; A[name] = w;
  }
  wrap('gun', 0.3, 0.05, 0.015); wrap('launcher', 0.35, 0.08, 0.03); wrap('explosion', 0.45, 0.12, 0.05); wrap('hitConfirm', 0, 0, 0.04);

  // ---------------- the tab, the slider ----------------
  // a hidden tab: every voice stops where it is and the context sleeps; back, the playing ones go on
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (!ctx) return;
    const sets = [cur, want, ...dying].filter(Boolean);
    if (hidden) { for (const s of sets) for (const l of uniq(s)) for (const v of l.p) { v.wasOn = !v.el.paused; try { v.el.pause(); } catch (e) {} } ctx.suspend(); }
    else { ctx.resume(); for (const s of sets) if (s.started) for (const l of uniq(s)) for (const v of l.p) if (v.wasOn && !l.bad) play(v.el); }
  });
  // settings.bgm (0..1) is read every tick; this only makes the change heard at once
  B.setVolume = (v) => { const s = S(); s.bgm = Math.max(0, Math.min(1, +v || 0)); if (ctx && out) out.gain.setTargetAtTime(level(), ctx.currentTime, 0.05); };
  // tests: the playing tracks sent to `secs` before their end (to hear / measure the end-of-track crossfade)
  B._seekEnd = (secs) => { if (cur) for (const ly of uniq(cur)) { const e = live(ly).el; if (isFinite(e.duration)) try { e.currentTime = Math.max(0, e.duration - secs); } catch (er) {} } };
  // what is playing now (tests, and the tools)
  B.state = () => ({ ctx: ctx ? ctx.state : null, scene: cur ? cur.scene : null, want: want ? want.scene : null, inten, heat, mood, level: level(), files: cur ? uniq(cur).map((l) => l.file) : [] });
})();
