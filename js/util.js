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
  // A description for cards and hover texts: every sentence and every effect of a list (A+10%・B-5%) goes on its own line, a 【代償】 (cost) / 【報酬】
  // (reward) line gets a red / green tag, and the numbers are picked out: a signed number is GREEN when the change is good for the player and RED when it
  // is bad, judged from the words in front of it (the clause it sits in). "クールタイム-40%" is good, "被ダメ+10%" and "敵の攻撃力+15%" are bad, "最大HP-15%" is
  // bad, "与ダメ+22%" is good. A number without a sign stays gold.
  const NL = String.fromCharCode(10);
  const NUM = /([+\-−＋]?\d+(?:\.\d+)?(?:%|％|秒|m|体|個|本|倍|回|発|枚|エリア)?)/g;
  // stats where a HIGHER value is worse for whoever has it (so a minus is the good direction)
  const LOWER_BETTER = /(クールタイム|CT|被ダメ|被弾|反動|拡散|ブレ|リロード時間|装填時間|間隔|消費|コスト|価格|費用|待機|チャージ時間|回転開始時間|ディレイ|状態異常の持続|落下ダメージ|重さ|重量|発動までの時間|隙|硬直|詠唱時間|発動時間|溜め時間|準備時間)/;
  // words just before the number that turn it round: "CT短縮+8%" is a gain, "被ダメ軽減+10%" too
  const REDUCER = /(短縮|軽減|減少|低減|カット|耐性|削減)$/;
  const SEP = /[・、。,，\n]/;
  U.numTone = (before, whole) => {
    const clause = before.split(SEP).pop();
    const near = clause.slice(-10);
    // a foe's own stat: "敵の" followed straight by the stat name (not "敵の状態異常ごとに与ダメ+10%", not "敵が3体以下で与ダメ+40%")
    const enemy = /敵(の|全体の)[^、・。]{0,10}$/.test(clause) && !/与ダメ|へのダメージ/.test(clause);
    if (/(落ちる|遅くな|下がる|低下|減る)/.test(clause)) return 'bad';
    let lower = LOWER_BETTER.test(clause);
    if (REDUCER.test(near.replace(/[\s:：]+$/, ''))) return 'up'; // reducing a bad thing (as a gain) written "+"
    // "受けるダメージ" on a foe (a mark, a weakness) is a gain; on the player it is a loss
    const foeTakes = /受けるダメージ/.test(clause) && /(敵|刻印|弱点)/.test(whole);
    if (foeTakes) lower = false;
    // for a foe's own stat a higher value is worse for the player, except the rate at which it acts (interval / cooldown), where lower is worse
    if (enemy && !foeTakes) lower = !lower;
    return lower ? 'lower' : 'higher';
  };
  U.descHTML = (s, opt) => {
    const whole = String(s || ''), lines = [];
    for (const raw of U.esc(whole).split(NL)) {
      const m = /^【(代償|報酬)】(.*)$/.exec(raw), kind = m && m[1], body = m ? m[2] : raw;
      const parts = body.replace(/。(?=.)/g, '。' + NL).split(NL).flatMap((t) => { const tok = t.split(/([・、])/); const out = [tok[0]]; for (let k = 2; k < tok.length; k += 2) { if (/\d/.test(out[out.length - 1]) && /\d/.test(tok[k])) out.push(tok[k]); else out[out.length - 1] += tok[k - 1] + tok[k]; } return out; });
      parts.forEach((t, k) => {
        const h = t.replace(NUM, (all, g, off) => {
          const sign = /^[+＋]/.test(g) ? 1 : /^[\-−]/.test(g) ? -1 : 0;
          let cls = 'cd-n';
          if (sign) {
            const tone = kind === '代償' ? 'bad' : kind === '報酬' ? 'good' : (() => { const t2 = U.numTone(t.slice(0, off), whole); return t2 === 'bad' ? 'bad' : t2 === 'up' ? (sign > 0 ? 'good' : 'bad') : (sign > 0) === (t2 === 'higher') ? 'good' : 'bad'; })();
            cls += tone === 'good' ? ' up' : ' dn';
          }
          return `<b class="${cls}">${g}</b>`;
        });
        if (opt && opt.inline) lines.push(kind ? `<b class="${kind === '代償' ? 'cost-tag' : 'reward-tag'}">${kind === '代償' ? '⚠ 代償' : '✦ 報酬'}</b>${h}` : h);
        else if (kind === '代償') lines.push(`<span class="cost-line">${k === 0 ? '<b class="cost-tag">⚠ 代償</b>' : ''}${h}</span>`);
        else if (kind === '報酬') lines.push(`<span class="reward-line">${k === 0 ? '<b class="reward-tag">✦ 報酬</b>' : ''}${h}</span>`);
        else lines.push(h);
      });
    }
    return lines.join(opt && opt.inline ? ' ' : '<br>');
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
