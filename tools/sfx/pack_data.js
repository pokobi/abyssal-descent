// Packs sfx/*.mp3 into sfx/sfxdata.js (base64) so the sound bank also loads when the game is opened straight from disk (file://),
// where fetch() of the mp3 files is blocked. Run: node tools/sfx/pack_data.js
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', '..', 'sfx'), out = {};
for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.mp3')) out[f.slice(0, -4)] = fs.readFileSync(path.join(dir, f)).toString('base64');
fs.writeFileSync(path.join(dir, 'sfxdata.js'), 'window.G = window.G || {}; G.SFXDATA = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, 'files packed');
