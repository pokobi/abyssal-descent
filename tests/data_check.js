'use strict';
// The data tables, checked without a browser (a few seconds): every weapon, melee weapon, attachment, consumable, skill, ultimate,
// boon, skill augment, armour piece, valuable, part, class and element table is loaded into a bare node vm (THREE and the page
// are stubbed out) and checked for what a typo or a half-done change leaves behind:
//   ids that clash, names or descriptions that are empty or show "undefined" / "NaN", rarities that do not exist, prices that are
//   not numbers, lookup tables that miss an entry, ids that point at nothing (classes, element tables), retired items still defined.
//   node tests/data_check.js            (exit code 0 = all fine)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.resolve(__dirname, '..'); // (DATA_ROOT: check another copy)
const FILES = ['util', 'data_weapons', 'data_items', 'data_armor', 'inventory', 'data_buffs', 'element', 'ultimates', 'skillaug', 'parts', 'classes'];

// ---- a page that is not there: anything touched returns something harmless ----
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : stub()), apply: () => stub(), construct: () => stub() });
const store = { getItem: () => null, setItem() {}, removeItem() {} };
const ctx = {
  THREE: stub(), document: stub(), console, Math, JSON, Date, Promise, Map, Set, WeakMap, Symbol, Proxy, Reflect, Object, Array, Number, String, RegExp, Error,
  setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {}, requestAnimationFrame() {}, performance: { now: () => 0 },
  localStorage: store, sessionStorage: store, navigator: { userAgent: '' }, location: { search: '', href: '', hostname: 'localhost' },
  addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, Image: function () {}, AudioContext: function () {},
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
const loadFails = [];
for (const f of FILES) {
  if (f === 'ultimates') vm.runInContext('G.abilities = G.abilities || {}; G.combat = G.combat || {};', ctx);
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: 'js/' + f + '.js' }); }
  catch (e) { loadFails.push(`js/${f}.js: ${e.message.slice(0, 120)}`); }
}
const G = ctx.G;
// a table that did not load (a script that throws) is a failure, not a crash of this check
for (const k of ['WEAPON_BY_ID', 'MELEE_BY_ID', 'ATT_BY_ID', 'ITEM_BY_ID', 'SKILL_BY_ID', 'BUFF_BY_ID', 'ARMOR_BY_ID']) if (!G[k]) G[k] = {};

// ---- checks ----
const fails = [];
const fail = (what) => fails.push(what);
const BAD_TEXT = /undefined|NaN|\[object |null(?![a-z])/;
const RAR = new Set(Object.keys(G.RARITY || {}));
const tables = [
  ['WEAPONS', 'WEAPON_BY_ID', true, true], ['MELEE', 'MELEE_BY_ID', true, true], ['ATTACHMENTS', 'ATT_BY_ID', true, true],
  ['ITEMS', 'ITEM_BY_ID', true, true], ['SKILLS', 'SKILL_BY_ID', true, true], ['ULTS', null, true, true],
  ['BUFFS', 'BUFF_BY_ID', true, false], ['ARMOR', 'ARMOR_BY_ID', true, true], ['VALUABLES', 'VALUABLE_BY_ID', true, false],
  ['PARTS', 'PART_BY_ID', true, false], ['ENCHANTS', 'ENCHANT_BY_ID', false, false],
];
let total = 0;
for (const [name, byId, hasRarity, hasPrice] of tables) {
  const list = G[name];
  if (!Array.isArray(list) || !list.length) { fail(`${name}: not loaded`); continue; }
  total += list.length;
  const seen = new Map();
  for (const o of list) {
    const tag = `${name} ${o.id}`;
    if (!o.id || typeof o.id !== 'string') { fail(`${name}: an entry without an id (${o.name})`); continue; }
    if (seen.has(o.id)) fail(`${tag}: the id is used twice`);
    seen.set(o.id, o);
    if (!o.name || typeof o.name !== 'string') fail(`${tag}: no name`);
    else if (BAD_TEXT.test(o.name)) fail(`${tag}: name shows "${o.name}"`);
    if (typeof o.desc === 'string' && BAD_TEXT.test(o.desc)) fail(`${tag}: description shows "${o.desc.slice(0, 60)}"`);
    if (hasRarity && !RAR.has(o.rarity)) fail(`${tag}: rarity "${o.rarity}" does not exist`);
    if (hasPrice && o.price !== undefined && !(typeof o.price === 'number' && o.price >= 0 && isFinite(o.price))) fail(`${tag}: price ${o.price}`);
    if (byId && G[byId] && G[byId][o.id] !== o) fail(`${tag}: missing from ${byId}`);
  }
}
// two different things of the same kind with the same name (a player could not tell them apart)
for (const name of ['WEAPONS', 'MELEE', 'ATTACHMENTS', 'ITEMS', 'SKILLS', 'ULTS', 'ARMOR', 'VALUABLES']) {
  const by = new Map();
  for (const o of G[name] || []) { if (by.has(o.name)) fail(`${name}: "${o.name}" is the name of both ${by.get(o.name)} and ${o.id}`); else by.set(o.name, o.id); }
}
// two consumables, or two skills / ultimates, with the same icon (they sit side by side on the item bar / skill row)
for (const list of [G.ITEMS || [], (G.SKILLS || []).concat(G.ULTS || [])]) { const by = new Map(); for (const o of list) { if (by.has(o.icon)) fail(`icon ${o.icon} is used by both ${by.get(o.icon)} and ${o.id}`); else by.set(o.icon, o.id); } }
// retired items are gone from the item table
for (const id in G.RETIRED_ITEMS || {}) if (G.ITEM_BY_ID[id]) fail(`RETIRED_ITEMS ${id}: still defined in ITEMS`);
// element tables point at things that exist
const EL = G.Elem || {};
for (const id in EL.GREN || {}) if (!G.ITEM_BY_ID[id]) fail(`Elem.GREN ${id}: no such item`);
const skOrUlt = (id) => G.SKILL_BY_ID[id] || (G.ULTS || []).find((u) => u.id === id);
for (const id in EL.SK || {}) if (!skOrUlt(id)) fail(`Elem.SK ${id}: no such skill or ultimate`);
// classes: their kit exists
for (const c of (G.Classes && G.Classes.LIST) || []) {
  if (!G.WEAPON_BY_ID[c.gun]) fail(`class ${c.id}: gun ${c.gun} does not exist`);
  if (!G.MELEE_BY_ID[c.melee]) fail(`class ${c.id}: melee ${c.melee} does not exist`);
  if (!skOrUlt(c.skill)) fail(`class ${c.id}: skill ${c.skill} does not exist`);
  if (!skOrUlt(c.ult)) fail(`class ${c.id}: ultimate ${c.ult} does not exist`);
  for (const a of Object.values(c.atts || {})) if (!G.ATT_BY_ID[a]) fail(`class ${c.id}: attachment ${a} does not exist`);
}
// boons: a known category; skill augments: their skill exists
const CAT = G.BUFF_CAT || {};
for (const b of G.BUFFS || []) if (!CAT[b.cat]) fail(`BUFFS ${b.id}: category "${b.cat}" does not exist`);
for (const a of G.SKILL_AUGS || []) if (!skOrUlt(a.skill)) fail(`SKILL_AUGS ${a.id}: skill ${a.skill} does not exist`);

for (const l of loadFails) fail('could not load ' + l);
for (const f of fails) console.log('FAIL ' + f);
console.log(`${total} entries in ${tables.length} tables checked`);
console.log(fails.length ? `\nDATA CHECK FAILED (${fails.length})` : '\nDATA CHECK PASSED');
process.exit(fails.length ? 1 : 0);
