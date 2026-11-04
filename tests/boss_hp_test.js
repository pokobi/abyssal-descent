'use strict';
// The small guardians (bosses7.js) carry less health than the big ones of the field they are met on: each small one is below the field's big average
// (about 70% of it), in every field and difficulty.
const path = require('path');
const { serve, launch } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    for (const diff of ['normal', 'hard']) {
      const rows = JSON.parse(await p.eval(`(() => {
        const R = G.Run, GM = G.game, keep = R.cur, ka = GM.area, out = [];
        R.cur = { id: '${diff}', lv: 0 };
        try {
          const seen = new Set();
          for (let n = 1; n <= R.areas(); n++) {
            const f = R.field(n); if (seen.has(f) || !R.BOSS_POOLS[f]) continue; seen.add(f);
            GM.area = n;
            const hp = {};
            for (const id of R.BOSS_POOLS[f]) { if (!G.bosses.has(id)) continue; const m = G.bosses.buildModelOnly(id, n); if (m) { hp[id] = Math.round(m.boss.maxHp); if (m.dispose) m.dispose(); else if (m.boss.dispose) m.boss.dispose(); } }
            const small = Object.keys(hp).filter((id) => G.BOSS_BY_ID[id].small), big = Object.keys(hp).filter((id) => !G.BOSS_BY_ID[id].small);
            const avg = big.reduce((a, id) => a + hp[id], 0) / big.length;
            out.push({ f, n, avg: Math.round(avg), small: small.map((id) => [id, hp[id], +(hp[id] / avg).toFixed(2)]) });
          }
        } finally { R.cur = keep; GM.area = ka; }
        return JSON.stringify(out);
      })()`));
      for (const r of rows) {
        console.log(`      ${diff} ${r.f} (area ${r.n}) big avg ${r.avg}: ${r.small.map((s) => s.join(' ')).join(' / ')}`);
        check(r.small.length && r.small.every((s) => s[2] < 0.85 && s[2] > 0.5), `${diff} ${r.f}: every small guardian has less health than the big ones (about 70%)`);
      }
    }
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nBOSS HP TEST FAILED (${fails.length})` : '\nBOSS HP TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
