'use strict';
// Extra HUD near the HP bar:
//  - "guards": everything that can save you from death (soul lanterns, fairy bottle, phoenix, lethal-blow guards...) with cooldown bars
//  - allies: mercenary contract (icon, Lv, HP) and temporary summons (remaining time)
//  - invulnerability: icon + countdown, golden HP bar, golden screen edge
//  - anomaly alert: a big card with a siren when an area starts with anomalies
(function () {
  const HX = (G.HudX = {});
  const U = G.U;
  let P, guardEl, allyEl, invEl, invVig, acc = 0, invMax = 0, lastInv = 0;

  function ensure() {
    if (guardEl) return;
    P = G.player;
    const hpw = document.getElementById('hp-wrap');
    const host = hpw.parentNode;
    allyEl = document.createElement('div'); allyEl.id = 'pallies';
    guardEl = document.createElement('div'); guardEl.id = 'pguard';
    const ps = document.getElementById('pstatus');
    host.insertBefore(allyEl, ps || hpw);
    host.insertBefore(guardEl, ps || hpw);
    invVig = document.createElement('div'); invVig.id = 'inv-vig'; document.body.appendChild(invVig);
  }

  // ---------------- survival guards ----------------
  // each: { icon, name, n (count badge), ready (bool), frac (cooldown progress 0..1, 1 = ready), note }
  function guards() {
    const out = [], t = G.game.time, mx = P.stats.maxHp, run = G.game.run;
    if (P.revives > 0) out.push({ kind: 'revive', icon: '🪔', name: '魂の灯火', n: P.revives, ready: true, frac: 1, note: '死亡時に復活できる' });
    const fairy = P.itemCount ? P.itemCount('h_fairy') : 0;
    if (fairy > 0) out.push({ kind: 'revive', icon: '🧚', name: '妖精の小瓶', n: fairy > 1 ? fairy : 0, ready: true, frac: 1, note: '死亡時に自動で全快復活' });
    if (P.has('d_phoenix') && !P.phoenixUsed) out.push({ kind: 'revive', icon: '🐦', name: '不死鳥', ready: true, frac: 1, note: '1回だけ全快復活＋大爆発' });
    if (P.has('d_secondwind') && !(P.buffState.d_secondwind && P.buffState.d_secondwind.used)) out.push({ kind: 'revive', icon: '💗', name: '不屈', ready: true, frac: 1, note: '倒れてもHP50%で復活（エリア毎）' });
    if (P.has('e_miser') && P.miserArea !== G.game.area) { const ok = run && run.coins >= 5000; out.push({ kind: 'revive', icon: '🧳', name: '守銭奴の執念', ready: ok, frac: ok ? 1 : Math.min(0.99, (run ? run.coins : 0) / 5000), note: ok ? 'コイン半分で復活' : '5,000🪙以上で有効' }); }
    const und = P.has('d_undying'), grit = P.has('d_grit');
    if (und || grit) {
      const cd = und ? 10 : 25, th = und ? 0.5 : 0.8, el = t - (P.lastGuardT ?? -99);
      const cdOk = el > cd, hpOk = P.hp >= mx * th;
      out.push({ kind: 'endure', icon: und ? '♾️' : '💢', name: und ? '不死身' : '踏みとどまり', ready: cdOk && hpOk, frac: cdOk ? 1 : el / cd, cd: cdOk ? 0 : cd - el, note: !cdOk ? '再使用待ち' : hpOk ? '致死の一撃を耐える' : `HP${th * 100}%以上で有効` });
    }
    if (P.has('d_lifeline')) { const s = P.buffState.d_lifeline || {}, el = t - (s.last ?? -99); out.push({ icon: '🪢', name: '命綱', ready: el > 40, frac: Math.min(1, el / 40), cd: el > 40 ? 0 : 40 - el, note: 'HP30%未満で35%回復' }); }
    if (P.has('d_emergency')) { const s = P.buffState.d_emergency || {}, el = t - (s.last ?? -99); out.push({ icon: '🚨', name: '緊急障壁', ready: el > 15, frac: Math.min(1, el / 15), cd: el > 15 ? 0 : 15 - el, note: '大きな被弾でシールド' }); }
    if (P.has('d_aegis')) { const s = P.buffState.d_aegis || {}; out.push({ icon: '🔰', name: 'イージス', ready: !!s.ready, frac: s.ready ? 1 : (s.t || 0) / 12, cd: s.ready ? 0 : 12 - (s.t || 0), note: '次の攻撃を完全に防ぐ' }); }
    // revives first, then the "survive at 1 HP" guards, then the rest
    const ord = { revive: 0, endure: 1 };
    return out.sort((a, b) => (ord[a.kind] ?? 2) - (ord[b.kind] ?? 2));
  }
  const KIND_TAG = { revive: '復活', endure: '耐える' };
  function guardHTML(g) {
    const pct = (U.clamp(g.frac, 0, 1) * 100).toFixed(1);
    return `<div class="pg ${g.kind || 'guard'} ${g.ready ? 'ready' : 'wait'}" title="${g.name} — ${g.note}">${KIND_TAG[g.kind] ? `<span class="pg-tag">${KIND_TAG[g.kind]}</span>` : ''}<span class="pg-ic">${g.icon}</span>${g.n ? `<b class="pg-n">${g.n}</b>` : ''}${g.cd > 0 ? `<i class="pg-cd">${Math.ceil(g.cd)}</i>` : ''}<div class="pg-bar"><div style="width:${pct}%"></div></div></div>`;
  }

  // ---------------- allies ----------------
  function allyHTML(a) {
    const inf = a.info ? a.info() : null; if (!inf) return '';
    const hpK = inf.maxHp ? U.clamp(inf.hp / inf.maxHp, 0, 1) : null, tK = inf.tMax ? U.clamp(inf.t / inf.tMax, 0, 1) : null;
    const down = inf.down > 0, lockK = inf.downs ? Math.min(1, inf.downs * 0.25) : 0;
    const xpBar = inf.merc && inf.lv ? `<div class="pa-xp"><div style="width:${inf.need ? U.clamp(inf.xp / inf.need, 0, 1) * 100 : 100}%"></div><span>${inf.need ? `XP ${inf.xp}/${inf.need}` : 'XP MAX'}</span></div>` : '';
    return `<div class="pa ${inf.merc ? 'merc' : ''} ${down ? 'down' : ''}"><span class="pa-ic">${inf.icon}</span><div class="pa-body"><div class="pa-name">${inf.merc ? '<em>契約</em>' : ''}${U.esc(inf.name)}${inf.lv ? ` <b>Lv${inf.lv}</b>` : ''}${inf.left ? ` <small>残${inf.left}エリア</small>` : ''}</div>`
      + (hpK !== null ? `<div class="pa-hp"><div style="width:${(hpK * 100).toFixed(1)}%"></div>${lockK ? `<i class="pa-lock" style="width:${(lockK * 100).toFixed(0)}%"></i>` : ''}<span>${down ? (inf.down === Infinity ? '戦闘不能' : `ダウン ${Math.ceil(inf.down)}秒`) : `${Math.ceil(inf.hp)}/${Math.round(inf.cap || inf.maxHp)}`}</span></div>${xpBar}` : '')
      + (tK !== null ? `<div class="pa-t"><div style="width:${(tK * 100).toFixed(1)}%"></div><span>${Math.ceil(inf.t)}秒</span></div>` : '')
      + '</div></div>';
  }

  HX.update = function (dt) {
    if (!G.player || !G.game.run) return;
    ensure();
    // ---- healing item gauge (centre ring until the heal is complete) ----
    const hg = P.healGauge;
    if (hg) {
      // the ring only covers the use motion (until the item has been used); the heal-over-time that follows shows on the HP bar alone
      hg.t += dt;
      const lf = G.ItemAnim.left(hg.id), left = lf ? lf[1] : 0;
      if (!hg.total && left > 0) hg.total = left;
      hg.total = Math.max(hg.total || 0, left, 0.05);
      if (P.dead || left <= 0) { P.healGauge = null; if (!G.game.search) G.ui.holdRing(-1); }
      else if (!(G.game.chestHold > 0) && !G.game.search) { hg.k = Math.max(hg.k || 0, Math.min(0.999, 1 - left / hg.total)); const q = G.abilities.useQueue; G.ui.holdRing(hg.k, 'pry', { center: hg.icon, label: q && q.id === hg.id && q.left > 0 ? `使用中…（あと${q.left}個）` : '使用中…', cls: 'heal' }); }
    }
    // ---- invulnerability (every frame: it is short-lived) ----
    const inv = P.invulnT || 0;
    const fresh = inv > lastInv + 0.05;
    if (fresh) invMax = inv; // a new grant
    const prevInv = lastInv;
    lastInv = inv;
    const showInv = inv > 0.3 || (inv > 0 && invMax > 0.5);
    // sounds only for real invulnerability (not the split-second i-frames of a dash)
    if (invMax >= 0.6 && inv < 1e6) {
      if (fresh && inv >= 0.6 && !HX._invOn) { HX._invOn = true; G.sfx.invulnOn && G.sfx.invulnOn(); HX._humT = 0.5; HX._tickT = 0; }
      if (HX._invOn) {
        if (inv > 1.0) { HX._humT -= dt; if (HX._humT <= 0) { HX._humT = 0.55; G.sfx.invulnHum && G.sfx.invulnHum(); } }
        else if (inv > 0) {
          // last second: ticks speed up as it runs out
          HX._tickT -= dt;
          if (HX._tickT <= 0) { const k = 1 - inv; HX._tickT = 0.26 - k * 0.16; G.sfx.invulnTick && G.sfx.invulnTick(k); }
        }
        if (inv <= 0) { HX._invOn = false; G.sfx.invulnOff && G.sfx.invulnOff(); }
      }
    } else if (HX._invOn && inv <= 0) { HX._invOn = false; }
    const hpFill = G.ui.el.hpFill;
    if (hpFill) hpFill.classList.toggle('hp-inv', showInv);
    const ending = showInv && inv < 1.0 && invMax >= 0.6;
    invVig.style.opacity = showInv ? (ending ? (0.35 + Math.abs(Math.sin(G.game.time * (14 + (1 - inv) * 20))) * 0.6) : 0.55 + Math.sin(G.game.time * 10) * 0.2).toFixed(2) : 0;
    if (hpFill) hpFill.classList.toggle('hp-inv-end', ending);
    acc -= dt;
    if (acc > 0) return;
    acc = 0.1;
    // ---- guards row ----
    const gs = guards();
    let html = '';
    if (showInv) html += `<div class="pg inv ready" title="無敵"><span class="pg-ic">🛡️</span><i class="pg-cd">${inv.toFixed(1)}</i><div class="pg-bar"><div style="width:${(U.clamp(inv / Math.max(0.01, invMax), 0, 1) * 100).toFixed(1)}%"></div></div><em>無敵</em></div>`;
    html += gs.map(guardHTML).join('');
    if (guardEl._h !== html) { guardEl.innerHTML = html; guardEl._h = html; }
    // ---- allies row ----
    const al = (G.combat.allies || []).filter((a) => a.info && !a.dead);
    const ah = al.map(allyHTML).join('');
    if (allyEl._h !== ah) { allyEl.innerHTML = ah; allyEl._h = ah; }
  };

  // ---------------- anomaly alert ----------------
  HX.anomalyAlert = function (ids) {
    const D = G.Depth;
    const el = document.createElement('div'); el.id = 'anom-alert';
    el.innerHTML = `<div class="aa-head">⚠ 異変発生 ⚠</div>` + ids.map((id) => { const a = D.ANOM_BY_ID[id]; return `<div class="aa-row"><span class="aa-ic">${a.icon}</span><div><b>${a.name}</b><div>${a.desc}</div></div></div>`; }).join('');
    document.getElementById('anom-alert') && document.getElementById('anom-alert').remove();
    G.ui.el.hud.appendChild(el);
    const fl = document.createElement('div'); fl.id = 'anom-flash'; document.body.appendChild(fl);
    setTimeout(() => fl.remove(), 1600);
    G.sfx.alarm && G.sfx.alarm();
    G.sfx.rumble(0.9, 1.2);
    G.player && G.player.addShake && G.player.addShake(0.35);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 600); }, 6200);
  };
})();
