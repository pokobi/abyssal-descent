'use strict';
// One command before a commit: looks at what changed and runs only the tests that cover it, one at a time.
//   node tests/check.js            what is changed and not committed yet (or, with nothing pending, the last commit)
//   node tests/check.js <ref>      what changed since <ref> (e.g. origin/main)
//   node tests/check.js --all      everything
//   node tests/check.js --dry      only print which tests it would run
// Always: the syntax of every script and the data tables (tests/data_check.js, no browser, under a second).
// Any game code touched: the solo gate (a bot plays 45 s). Then the tests mapped from the files below.
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), ALL = args.includes('--all'), DRY = args.includes('--dry');
const ref = args.find((a) => !a.startsWith('--'));
const X = { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }; // (git's line-ending warnings stay quiet)
const git = (...a) => execFileSync('git', a, X).split('\n').map((s) => s.trim()).filter(Boolean);
const gitText = (...a) => execFileSync('git', a, X);

// ---- what changed (diffText: only the game code, js/, for the content rules below) ----
let files, diffText = '';
if (ref) { files = git('diff', '--name-only', ref); diffText = gitText('diff', ref, '--', 'js'); }
else {
  files = [...new Set([...git('diff', '--name-only', 'HEAD'), ...git('ls-files', '--others', '--exclude-standard')])];
  diffText = gitText('diff', 'HEAD', '--', 'js');
  if (!files.length) { files = git('diff', '--name-only', 'HEAD~1', 'HEAD'); diffText = gitText('diff', 'HEAD~1', 'HEAD', '--', 'js'); console.log('nothing pending: checking the last commit'); }
}
files = files.map((f) => f.replace(/\\/g, '/')).filter((f) => !f.startsWith('docs/') && !/(^|\/)CLAUDE(\.local)?\.md$/.test(f));

// ---- which tests (name -> [file, args...]) ----
const T = {
  solo_gate: ['tests/coop/solo_gate.js'], solo_smoke: ['tests/solo_smoke.js'], class: ['tests/class_test.js'], element: ['tests/element_test.js'],
  parts: ['tests/parts_test.js'], shop_free: ['tests/shop_free_test.js'], duel: ['tests/duel_test.js'], runplan: ['tests/runplan_test.js'],
  mobile: ['tests/mobile_test.js'], trial: ['tests/trial_test.js'], boss_hp: ['tests/boss_hp_test.js'],
  skill: ['tests/coop/skill_test.js'], coop: ['tests/coop/coop_test.js'], world: ['tests/coop/world_test.js'], sky: ['tests/coop/sky_test.js'],
  run: ['tests/coop/run_test.js', 'normal', '5'], field: ['tests/field_test.js'], foe: ['tests/foe_test.js'], coop_duel: ['tests/coop/duel_test.js'], bossobj: ['tests/coop/bossobj_test.js'],
  loot: ['tests/coop/loot_test.js'], give: ['tests/give_test.js'], gimmick: ['tests/gimmick_test.js'], shop: ['tests/shop_test.js'], fx: ['tests/coop/fx_test.js'], room: ['tests/coop/room_test.js'], playtest: ['tests/coop/playtest_test.js'],
};
// game file (regex on the path) -> tests. The guardians are handled apart: only the ones defined in the changed files are fought.
const MAP = [
  [/^js\/element\.js$/, ['element', 'skill']],
  [/^js\/classes\.js$/, ['class']],
  [/^js\/tutorial\.js$/, ['class', 'mobile']],
  [/^js\/(parts|pawn)\.js$/, ['parts', 'shop_free']],
  [/^js\/(inventory|invui)\.js$/, ['parts', 'shop_free', 'loot']],
  [/^js\/duel\.js$/, ['duel', 'coop_duel']],
  [/^js\/runplan\.js$/, ['runplan', 'solo_smoke']],
  [/^js\/(mobile|input)\.js$/, ['mobile']],
  [/^js\/(abilities|ultimates|skillaug|grenfx|grenhold|itemanim)\.js$/, ['skill']],
  [/^js\/data_(items|weapons)\.js$/, ['skill']],
  [/^js\/(melee|weapons)\.js$/, ['solo_smoke', 'skill']],
  [/^js\/(combat|enemies|player|game|data_enemies|data_buffs|depth)\.js$/, ['solo_smoke', 'run']],
  [/^js\/(game|parts|pawn)\.js$/, ['give', 'shop']], // (weapons handed over: never pushing out the ones held)
  [/^js\/(world|levelgen|fieldgen|fieldgen_t\d|strata|props|graves|fields)\.js$/, ['solo_smoke', 'world', 'run']], // (the new fields come up in co-op runs too)
  [/^js\/(levelgen|fieldgen|fieldgen_t\d|strata|props|fields|textures|skyvary|runplan)\.js$/, ['field']], // (every field builds; the per-segment draw; the sky moods)
  [/^js\/(areas|rooms2|midsave)\.js$/, ['solo_smoke', 'room', 'give']],
  [/^js\/(fieldfoes|enemies|data_enemies)\.js$/, ['foe']], // (the new fields' own foes: drawn in their field, bodies, attacks)
  [/^js\/bosses7\.js$/, ['boss_hp']],
  [/^js\/bosses\d?\.js$/, ['gimmick']], // (a guardian's gimmicks cleared: a share of its health)
  [/^js\/(fx|statusui|pstatus|hudextra|ui|codex|devmode|perfmon|audio|textures|icons|icondata|avatar|warmup|util|smoothscroll)\.js$/, ['solo_smoke']],
  [/^js\/coop\//, ['coop', 'world', 'run']],
  [/^(index|coop)\.html$|^css\//, ['mobile']],
];
const want = new Set(), why = {};
const add = (t, f) => { want.add(t); (why[t] = why[t] || []).push(f); };
let gameCode = false, bossIds = new Set();
const ALL_BOSSES = (fs.readFileSync(path.join(ROOT, 'tests/coop/boss_sweep.js'), 'utf8').match(/const ALL = '([^']+)'/) || [, ''])[1].split(/\s+/).filter(Boolean);
for (const f of files) {
  if (/^js\//.test(f) || /\.(html|css)$/.test(f)) gameCode = true;
  for (const [re, ts] of MAP) if (re.test(f)) for (const t of ts) add(t, f);
  if (/^js\/bosses\w*\.js$/.test(f) && fs.existsSync(path.join(ROOT, f))) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const id of ALL_BOSSES) if (new RegExp(`['"]${id}['"]`).test(src)) bossIds.add(id);
    add('bossobj', f);
  }
  // a test that was changed runs itself (the helpers: the gate)
  const own = Object.entries(T).find(([, v]) => v[0] === f);
  if (own) add(own[0], f);
  else if (/^tests\//.test(f) && !/data_check|check\.js$/.test(f)) add('solo_gate', f);
}
// the guardian sweep itself changed: a few guardians of different kinds (all of them with --all)
if (files.includes('tests/coop/boss_sweep.js')) for (const id of ['colossus', 'twins', 'heart', 'sovereign']) bossIds.add(id);
// the aim trial is long (it times eight clears): only when the game code (js/) changed says so
if (/^[+-].*(試練|trial|TRIAL)/m.test(diffText)) add('trial', 'diff mentions the trial');
if (gameCode) add('solo_gate', 'game code');
let order = ALL ? Object.keys(T) : Object.keys(T).filter((t) => want.has(t));
if (ALL) bossIds = new Set(ALL_BOSSES);
// the gate first (it also checks the syntax of every script), the long ones last
const LAST = ['trial', 'run'];
order = order.filter((t) => t === 'solo_gate').concat(order.filter((t) => t !== 'solo_gate' && !LAST.includes(t)), order.filter((t) => LAST.includes(t)));

console.log(`changed: ${files.length ? files.join(' ') : '(nothing)'}`);
console.log(`tests:   data_check${order.length ? ' ' + order.join(' ') : ''}${bossIds.size ? ` boss_sweep(${bossIds.size === ALL_BOSSES.length ? 'all' : [...bossIds].join(' ')})` : ''}`);
if (!ALL) for (const t of order) console.log(`  ${t.padEnd(10)} <- ${[...new Set(why[t])].slice(0, 3).join(', ')}`);
if (DRY) process.exit(0);

// ---- run them, one at a time ----
const results = [];
const run = (name, file, a) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file, ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || ''), secs = Math.round((Date.now() - t0) / 1000);
  const ok = r.status === 0 && !/^FAIL|FAILED/m.test(out);
  results.push({ name, ok, secs });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${String(secs).padStart(4)}s`);
  if (!ok) console.log(out.split('\n').filter((l) => /FAIL|Error|error|STUCK|DIFFERS/.test(l)).slice(0, 8).map((l) => '       ' + l.slice(0, 200)).join('\n'));
  return ok;
};
const T0 = Date.now();
// syntax of every script (fast, and nothing else is worth running when one does not parse)
const bad = [];
for (const dir of ['js', 'js/coop', 'tests', 'tests/coop']) for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.js')) { try { execFileSync(process.execPath, ['--check', path.join(ROOT, dir, f)], { stdio: 'pipe' }); } catch (e) { bad.push(`${dir}/${f}`); } }
console.log(`${bad.length ? 'FAIL' : 'ok  '} syntax       ${bad.join(' ')}`);
if (bad.length) { console.log('\nCHECK FAILED (syntax)'); process.exit(1); }
if (!run('data_check', 'tests/data_check.js', [])) { console.log('\nCHECK FAILED (data)'); process.exit(1); }
for (const t of order) run(t, T[t][0], T[t].slice(1));
if (bossIds.size) run('boss_sweep', 'tests/coop/boss_sweep.js', ['14', ...(bossIds.size === ALL_BOSSES.length ? [] : [...bossIds])]);
const failed = results.filter((r) => !r.ok);
console.log(`\n${Math.round((Date.now() - T0) / 1000)}s in all`);
console.log(failed.length ? `CHECK FAILED (${failed.map((r) => r.name).join(' ')})` : 'CHECK PASSED');
process.exit(failed.length ? 1 : 0);
