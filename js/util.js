'use strict';
window.G = window.G || {};
(function () {
  const U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  U.smooth = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.rand = (a = 0, b = 1) => a + (b - a) * Math.random();
  U.randi = (a, b) => Math.floor(a + (b - a + 1) * Math.random());
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  U.hashStr = (s) => { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619); } return h >>> 0; };
  U.wrapAngle = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
  U.fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  U.pct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
  U.time = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
  U.weighted = (arr, wf, rnd = Math.random) => {
    let tot = 0; for (const a of arr) tot += Math.max(0, wf(a));
    if (tot <= 0) return arr[Math.floor(rnd() * arr.length)];
    let r = rnd() * tot;
    for (const a of arr) { r -= Math.max(0, wf(a)); if (r <= 0) return a; }
    return arr[arr.length - 1];
  };
  // a description for cards and hover texts: the numbers are picked out (bold gold), every sentence and every effect of a list (A+10%・B-5%) goes
  // on its own line, and a 【代償】 (cost) / 【報酬】 (reward) line gets a red / green tag
  const NL = String.fromCharCode(10);
  const NUM = /([+\-−＋]?\d+(?:\.\d+)?(?:%|％|秒|m|体|個|本|倍|回|発|枚|エリア)?)/g;
  U.descHTML = (s) => {
    const lines = [];
    for (const raw of U.esc(s || '').split(NL)) {
      const m = /^【(代償|報酬)】(.*)$/.exec(raw), kind = m && m[1], body = m ? m[2] : raw;
      // sentences, then effects of a list when both neighbours carry a number
      const parts = body.replace(/。(?=.)/g, '。' + NL).split(NL).flatMap((t) => { const seg = t.split('・'); const out = [seg[0]]; for (let k = 1; k < seg.length; k++) { if (/\d/.test(out[out.length - 1]) && /\d/.test(seg[k])) out.push(seg[k]); else out[out.length - 1] += '・' + seg[k]; } return out; });
      parts.forEach((t, k) => {
        const h = t.replace(NUM, '<b class="cd-n">$1</b>');
        if (kind === '代償') lines.push(`<span class="cost-line">${k === 0 ? '<b class="cost-tag">⚠ 代償</b>' : ''}${h}</span>`);
        else if (kind === '報酬') lines.push(`<span class="reward-line">${k === 0 ? '<b class="reward-tag">✦ 報酬</b>' : ''}${h}</span>`);
        else lines.push(h);
      });
    }
    return lines.join('<br>');
  };
  U.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
    next() { let t = (this.s = (this.s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(a + (b - a + 1) * this.next()); }
    pick(a) { return a[Math.floor(this.next() * a.length)]; }
    chance(p) { return this.next() < p; }
    shuffle(a) { return U.shuffle(a, () => this.next()); }
    weighted(arr, wf) { return U.weighted(arr, wf, () => this.next()); }
    fork(salt) { return new RNG(U.hashStr(this.s + ':' + salt)); }
  }

  const listeners = {};
  G.on = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
  G.emit = (n, a) => { const l = listeners[n]; if (l) for (const f of l) f(a); };

  G.RARITY = {
    common: { name: 'コモン', color: '#b8b2a7', w: 60, tier: 0 },
    uncommon: { name: 'アンコモン', color: '#6fbf62', w: 32, tier: 1 },
    rare: { name: 'レア', color: '#4d9be6', w: 15, tier: 2 },
    epic: { name: 'エピック', color: '#b06be0', w: 6, tier: 3 },
    legendary: { name: 'レジェンダリー', color: '#f0a030', w: 2, tier: 4 },
    cursed: { name: '呪い', color: '#d0405a', w: 0, tier: 0 },
  };
  G.RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  // rarity weight scaled by progress & luck
  G.rarityWeight = (r, area, luck) => G.rarityWeightD(r, G.Run && G.game && G.game.run ? G.Run.depthArea(area || 1) : (area || 1), luck);
  // the same, for an explicit depth (drops use their own "loot depth", see runplan.js)
  G.rarityWeightD = (r, d, luck) => {
    const t = G.RARITY[r].tier;
    const prog = Math.min(1, d / 30);
    // epic and legendary only show up deep down: epic from about depth 7 (fully open at 22), legendary from 15 (fully open at 34)
    const ramp = (a, b) => Math.max(0, Math.min(1, (d - a) / (b - a)));
    const gate = t === 3 ? ramp(7, 22) : t >= 4 ? ramp(15, 34) : 1;
    return G.RARITY[r].w * Math.pow(1 + prog * 1.6 + (luck || 0) * 0.5, t) * gate;
  };
  G.ELEM = {
    fire: { name: '炎', icon: '🔥', color: '#ff8a3a' },
    frost: { name: '冷気', icon: '❄️', color: '#a8dcff' },
    shock: { name: '雷', icon: '⚡', color: '#ffe36b' },
    poison: { name: '毒', icon: '☠️', color: '#9be05a' },
    bleed: { name: '出血', icon: '🩸', color: '#d03030' },
    explosive: { name: '爆発', icon: '💥', color: '#ffb050' },
  };

  // shared temp vectors (created lazily once THREE exists)
  G.tmp = {};
  G.initTmp = () => {
    const V = THREE.Vector3;
    G.tmp = { v1: new V(), v2: new V(), v3: new V(), v4: new V(), v5: new V(), q1: new THREE.Quaternion(), m1: new THREE.Matrix4(), e1: new THREE.Euler() };
  };

  // persistent save
  const SAVE_KEY = 'abyssal_descent_save_v1';
  G.save = {
    data: null,
    defaults() {
      return {
        settings: { sens: 1.0, adsSens: 0.8, fov: 100, volume: 0.8, quality: 'high', dmgNums: true, crouchToggle: false, sprintToggle: false, autoSprint: false, invertY: false, shake: 1.0, bob: 1.0, fullscreen: true, showFps: false, askTutorial: true },
        codex: { enemies: {}, kills: {}, items: {}, buffs: {}, bosses: {} },
        records: { bestArea: 0, bestKills: 0, runs: 0, totalKills: 0, bestCoins: 0 },
      };
    },
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
      const def = this.defaults();
      if (!d) d = def;
      d.settings = Object.assign(def.settings, d.settings || {});
      d.codex = Object.assign(def.codex, d.codex || {});
      d.records = Object.assign(def.records, d.records || {});
      this.data = d;
      return d;
    },
    write() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } },
    // what: 'settings' (options and key bindings), 'progress' (codex, records, clears, the saved run) or 'all'. The page reloads afterwards.
    reset(what) {
      const def = this.defaults();
      if (what === 'settings' || what === 'all') this.data.settings = def.settings;
      if (what === 'progress' || what === 'all') {
        this.data.codex = def.codex; this.data.records = def.records;
        try { for (const k of ['abyss_run_v1', 'abyss_run_v1_s2', 'abyss_run_v1_s3']) localStorage.removeItem(k); } catch (e) { /* ignore */ }
      }
      this._dirty2 = false; this.write();
    },
    mark(kind, id, n) {
      const c = this.data.codex[kind]; if (!c) return;
      const first = !c[id];
      c[id] = (c[id] || 0) + (n || 1);
      if (first) this._dirty = true;
      this._dirty2 = true;
    },
  };
  G.save.load();
  setInterval(() => { if (G.save._dirty2) { G.save._dirty2 = false; G.save.write(); } }, 5000);

  G.U = U;
  G.RNG = RNG;
})();
