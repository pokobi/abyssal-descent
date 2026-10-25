'use strict';
// ---------------------------------------------------------------------------------------------------------------------------
// Icons. Emoji were a stand-in; here every icon is a vector silhouette with a soft metallic gradient and a dark outline.
//  * EMO: emoji -> silhouette (game-icons.net, CC BY 3.0, see README). Any emoji in this table that reaches the page is swapped
//    for its drawing automatically (a MutationObserver over the document), so the many texts that use emoji need no change.
//  * Entity icons (attachments, guns, melee weapons, armour) are specific drawings, carried in text as private-use characters
//    (G.Icons.ch(key)) that the same observer swaps in. Attachments are drawn here by hand (side views of the actual parts).
//  * Canvas text (3D labels, shop sprites) draws the same shapes through Path2D: G.Icons.fillText / drawIcon.
// Emoji not in the table (coins, plain text symbols) are left as they are on purpose.
// ---------------------------------------------------------------------------------------------------------------------------
(function () {
  const IC = (G.Icons = {});
  const PATHS = G.ICON_PATHS || {};
  const EMO = {
    '🛡': ['round-shield', '#9fbad6'],
    '🎯': ['bullseye', '#ff5a4a'],
    '🔥': ['flame', '#ff8436'],
    '⚠': ['hazard-sign', '#ffb02e'],
    '⚡': ['power-lightning', '#ffe14a'],
    '🩸': ['drop', '#e8404a'],
    '👑': ['jewel-crown', '#f1c862'],
    '💥': ['bright-explosion', '#ff9a3a'],
    '⚔': ['crossed-swords', '#c9d2dc'],
    '💚': ['heart-plus', '#72d46a'],
    '☠': ['skull-crossed-bones', '#cfe6a0'],
    '💫': ['star-swirl', '#ffe36a'],
    '💀': ['death-skull', '#ebdfc4'],
    '❄': ['snowflake-2', '#8fd8ff'],
    '🔁': ['cycle', '#8fd0ff'],
    '🔨': ['flat-hammer', '#d0a878'],
    '🗡': ['plain-dagger', '#c9d2dc'],
    '✨': ['sparkles', '#ffe9a0'],
    '💰': ['cash', '#f1c862'],
    '🌀': ['vortex', '#8fb0ff'],
    '♻': ['reload-gun-barrel', '#b8e070'],
    '🔫': ['pistol-gun', '#c9d2dc'],
    '💣': ['unlit-bomb', '#9aa4b0'],
    '⚒': ['anvil-impact', '#e89050'],
    '⏳': ['hourglass', '#e8c890'],
    '👻': ['ghost', '#d8e8ff'],
    '🎲': ['rolling-dices', '#eef2f6'],
    '🔮': ['crystal-ball', '#c08cff'],
    '🪔': ['magic-lamp', '#ffb050'],
    '📦': ['locked-chest', '#c08a50'],
    '⚖': ['scales', '#e8c890'],
    '🎒': ['backpack', '#c08a50'],
    '🏃': ['run', '#8fe0a0'],
    '❤': ['glass-heart', '#ff4a5a'],
    '🗺': ['treasure-map', '#e8d4a0'],
    '🧪': ['round-bottom-flask', '#8fe04a'],
    '🌟': ['flower-star', '#ffd84a'],
    '📘': ['book-cover', '#64aaff'],
    '👁': ['eyeball', '#c8a0ff'],
    '👟': ['running-shoe', '#8fd0ff'],
    '🗿': ['moai', '#b8b0a0'],
    '⚙': ['gears', '#b8c0c8'],
    '🎁': ['present', '#ff7aa0'],
    '🔩': ['screw', '#c9d2dc'],
    '🕳': ['black-hole-bolas', '#a896c8'],
    '⚓': ['anchor', '#b8c8d8'],
    '⛓': ['crossed-chains', '#a8b0b8'],
    '😡': ['enrage', '#ff5a3a'],
    '🕯': ['candle-light', '#ffd080'],
    '🌫': ['fog', '#c8d0e0'],
    '🔋': ['battery-75', '#8fe060'],
    '💨': ['whirlwind', '#d0e8ff'],
    '🦴': ['crossed-bones', '#ebdfc4'],
    '💢': ['spiky-explosion', '#ff6060'],
    '💎': ['cut-diamond', '#6ad0ff'],
    '🏦': ['bank', '#60c0a0'],
    '⚰': ['coffin', '#b08a6a'],
    '🌵': ['thorny-vine', '#7ac060'],
    '🚶': ['walk', '#c8c0b0'],
    '🌋': ['volcano', '#ff8436'],
    '😱': ['screaming', '#e0c0ff'],
    '👹': ['ogre', '#e0603a'],
    '🔭': ['telescope', '#c9d2dc'],
    '🏹': ['crossbow', '#c08a50'],
    '🏺': ['amphora', '#e0a070'],
    '🧲': ['magnet', '#ff5a5a'],
    '🐦': ['swallow', '#ff8436'],
    '⏱': ['stopwatch', '#c9d2dc'],
    '⭕': ['plain-circle', '#ff5a4a'],
    '🎰': ['slot-machine', '#f0b040'],
    '🛒': ['shopping-cart', '#7acb6a'],
    '🫀': ['heart-organ', '#e05060'],
    '📏': ['arrow-flights', '#c9d2dc'],
    '🔪': ['bowie-knife', '#c9d2dc'],
    '🧊': ['ice-cube', '#8fd8ff'],
    '🪨': ['rock', '#b8b0a0'],
    '🔄': ['clockwise-rotation', '#8fd0ff'],
    '🌩': ['lightning-storm', '#ffe14a'],
    '📯': ['hunting-horn', '#e0b070'],
    '🧚': ['fairy', '#ff86b8'],
    '⛩': ['shinto-shrine', '#ff7050'],
    '🪽': ['feathered-wing', '#e8f0ff'],
    '🐺': ['wolf-head', '#b8c0d0'],
    '🔍': ['magnifying-glass', '#c9d2dc'],
    '🛠': ['spanner', '#c9d2dc'],
    '📊': ['histogram', '#8fd0ff'],
    '📐': ['expand', '#c8d8e8'],
    '🦘': ['jump-across', '#d0a070'],
    '🏰': ['castle', '#c8c0b0'],
    '🪶': ['feather', '#e8f0ff'],
    '🧱': ['brick-wall', '#c87a5a'],
    '😤': ['angry-eyes', '#ff8a4a'],
    '⌛': ['hourglass', '#e8c890'],
    '🦵': ['leg', '#e0b090'],
    '🗃': ['ammo-box', '#c08a50'],
    '🌑': ['evil-moon', '#a896c8'],
    '🌊': ['big-wave', '#64aaff'],
    '☄': ['comet-spark', '#ff8436'],
    '🔔': ['ringing-bell', '#f0c060'],
    '📥': ['backpack', '#c08a50'],
    '📤': ['locked-chest', '#c08a50'],
    '⛲': ['fountain', '#64aaff'],
    '🕸': ['spider-web', '#d8d8d8'],
    '🐉': ['dragon-head', '#e05a3a'],
    '📖': ['open-book', '#e8d4a0'],
    '🔑': ['key', '#f1c862'],
    '🦇': ['bat', '#a07ac0'],
    '🚪': ['door', '#c08a50'],
    '🧿': ['third-eye', '#64aaff'],
    '🏆': ['trophy', '#f1c862'],
    '💪': ['biceps', '#e0b090'],
    '💉': ['syringe', '#ff6a8a'],
    '🪓': ['battle-axe', '#c9d2dc'],
    '🤫': ['silenced', '#b0b8c8'],
    '🐌': ['snail', '#c8a070'],
    '🩹': ['bandage-roll', '#f0e0c8'],
    '♾': ['infinity', '#c08cff'],
    '🧳': ['suitcase', '#c08a50'],
    '💧': ['water-drop', '#64aaff'],
    '✴': ['spiky-explosion', '#ffb040'],
    '🎮': ['game-console', '#c9d2dc'],
    '💔': ['broken-heart', '#e05060'],
    '📿': ['prayer-beads', '#c8a070'],
    '🙏': ['prayer', '#ffe0a0'],
    '🪖': ['brodie-helmet', '#8a9a70'],
    '👥': ['two-shadows', '#b8c0d0'],
    '🥷': ['ninja-head', '#9090a8'],
    '🧙': ['wizard-face', '#c08cff'],
    '🕷': ['long-legged-spider', '#a896c8'],
    '✅': ['check-mark', '#72d46a'],
    '☝': ['pointing', '#e8d0b0'],
    '🚀': ['rocket', '#ff9a3a'],
    '🏛': ['greek-temple', '#e0d8c8'],
    '🧰': ['toolbox', '#e05040'],
    '📈': ['progression', '#72d46a'],
    '🌈': ['rainbow-star', '#ffb0f0'],
    '📜': ['scroll-unfurled', '#e8d4a0'],
    '👊': ['fist', '#e8c0a0'],
    '🧨': ['dynamite', '#ff5040'],
    '🛢': ['barrel', '#8a7050'],
    '🌿': ['herbs-bundle', '#72d46a'],
    '🐆': ['cat', '#e0b040'],
    '🏅': ['medal', '#f1c862'],
    '🦾': ['robot-grab', '#c9d2dc'],
    '💖': ['glass-heart', '#ff86b8'],
    '🦅': ['eagle-emblem', '#d0a060'],
    '💗': ['heart-beats', '#ff86b8'],
    '🎆': ['firework-rocket', '#ff8ad0'],
    '🏋': ['weight-lifting-up', '#d0b090'],
    '🪢': ['linked-rings', '#c8a070'],
    '🔰': ['sprout', '#72d46a'],
    '😈': ['imp-laugh', '#c070ff'],
    '🔱': ['trident', '#f1c862'],
    '🎭': ['drama-masks', '#e0c0a0'],
    '🖐': ['open-palm', '#e8c0a0'],
    '✋': ['open-palm', '#e8c0a0'],
    '✊': ['fist', '#e8c0a0'],
    '💾': ['save-arrow', '#8fd0ff'],
    '🌠': ['falling-star', '#ffe080'],
    '🌾': ['wheat', '#e8c070'],
    '👿': ['imp', '#c060f0'],
    '⚗': ['fizzing-flask', '#8fe04a'],
    '🪕': ['banjo', '#c08a50'],
    '🔗': ['linked-rings', '#b8c0c8'],
    '📚': ['book-pile', '#e0b070'],
    '🔷': ['cut-diamond', '#64aaff'],
    '🛷': ['ice-skate', '#8fd8ff'],
    '🌧': ['raining', '#9ab8e0'],
    '🐘': ['elephant-head', '#b0b0c0'],
    '💊': ['pill', '#ff86b8'],
    '🦠': ['virus', '#8fe04a'],
    '🎇': ['sparkles', '#ffd0ff'],
    '🥇': ['podium-winner', '#f1c862'],
    '👯': ['two-shadows', '#ffb0d0'],
    '🪝': ['hook', '#b8c8d8'],
    '🍷': ['wine-glass', '#c0304a'],
    '🍀': ['clover', '#72d46a'],
    '🎗': ['ribbon-medal', '#e0b070'],
    '🚨': ['siren', '#ff4040'],
    '🌬': ['wind-slap', '#d0e8ff'],
    '🤺': ['fencer', '#c9d2dc'],
    '🧬': ['dna1', '#8fd0ff'],
    '🏜': ['desert', '#e8c080'],
    '🪞': ['mirror-mirror', '#c8e0f0'],
    '🧭': ['compass', '#e0c080'],
    '🗝': ['key', '#f1c862'],
    '💸': ['pay-money', '#f1c862'],
    '🏁': ['checkered-flag', '#eef2f6'],
    '🍄': ['mushroom', '#e06050'],
    '🐍': ['snake', '#7ac060'],
    '📡': ['radar-dish', '#c9d2dc'],
    '📌': ['pin', '#ff5050'],
    '🌪': ['tornado', '#c8d8e8'],
    '⛰': ['mountains', '#b0a898'],
    '☁': ['dust-cloud', '#d8e0e8'],
    '☀': ['sunbeams', '#ffd050'],
    '🌞': ['sunbeams', '#ffd050'],
    '🔇': ['silenced', '#b0b8c8'],
    '🪵': ['log', '#c08a50'],
    '🔊': ['speaker', '#c9d2dc'],
    '🚫': ['cancel', '#ff5a4a'],
    '🗨': ['talk', '#eef2f6'],
    '🌅': ['sunrise', '#ffb060'],
    '🔓': ['padlock-open', '#e0c080'],
    '🔒': ['padlock', '#e0c080'],
    '🧎': ['kneeling', '#c8c0b0'],
    '🛰': ['satellite', '#c9d2dc'],
    '🌱': ['sprout', '#72d46a'],
    '🏳': ['flying-flag', '#eef2f6'],
    '🏠': ['house', '#d0a878'],
    '🥤': ['soda-can', '#ff6a6a'],
    '🧓': ['hooded-figure', '#b8a890'],
    '🎵': ['musical-notes', '#e0d0ff'],
    '🐕': ['jumping-dog', '#c8a070'],
    '🦏': ['rhinoceros-horn', '#b0b0b8'],
    '🔂': ['cycle', '#8fd0ff'],
    '🧠': ['brain', '#ff86b8'],
    '🧵': ['sewing-string', '#e0a0c0'],
    '🪦': ['tombstone', '#b0b0b8'],
    '🦺': ['kevlar-vest', '#e09040'],
    '👖': ['trousers', '#6a8ab8'],
    '🧤': ['gloves', '#c09060'],
    '🥾': ['leather-boot', '#a07048'],
    '💍': ['ring', '#f1c862'],
    '🪄': ['fairy-wand', '#c08cff'],
    '🖼': ['mona-lisa', '#e0c080'],
    '🧘': ['meditation', '#c0e0ff'],
    '🤹': ['juggler', '#ffb060'],
    '🫙': ['mason-jar', '#c8d8c8'],
    '🔌': ['plug', '#c9d2dc'],
    '😵': ['knocked-out-stars', '#ffe36a'],
    '🤠': ['jester-hat', '#c08a50'],
    '🔚': ['stop-sign', '#ff5a4a'],
    '💯': ['target-arrows', '#ff5a4a'],
    '⭐': ['flat-star', '#ffd84a'],
    '🪃': ['boomerang', '#c08a50'],
    '🐇': ['rabbit', '#e8e0d8'],
    '👣': ['footprint', '#c8c0b0'],
    '🛌': ['bed', '#b0c0e0'],
    '🔵': ['plain-circle', '#64aaff'],
    '👼': ['angel-outfit', '#fff0b8'],
    '🏷': ['price-tag', '#e0c080'],
    '🃏': ['card-joker', '#eef2f6'],
    '💛': ['shining-heart', '#ffd040'],
    '🥶': ['frozen-body', '#8fd8ff'],
    '🦉': ['owl', '#c8a070'],
    '🎬': ['clapperboard', '#eef2f6'],
    '🧛': ['vampire-dracula', '#c04050'],
    '🤜': ['fist', '#e8c0a0'],
    '🥋': ['black-belt', '#e8e0d0'],
    '🦝': ['raccoon-head', '#a0a0a8'],
    '👃': ['nose-side', '#e0b090'],
    '⛈': ['lightning-storm', '#ffe14a'],
    '🍃': ['falling-leaf', '#72d46a'],
    '🎖': ['medal', '#f1c862'],
    '🏯': ['pagoda', '#ff7050'],
    '🧥': ['robe', '#8a6ab0'],
    '💓': ['heart-beats', '#ff86b8'],
    '🦷': ['tooth', '#ebdfc4'],
    '🥂': ['champagne-cork', '#ffe0a0'],
    '🏔': ['mountaintop', '#d0d8e0'],
    '🐈': ['cat', '#e0b040'],
    '🤲': ['open-palm', '#e8c0a0'],
    '🫳': ['open-palm', '#e8c0a0'],
    '🥚': ['egg-clutch', '#f0e8d8'],
    '👺': ['oni', '#e04040'],
    '🟢': ['plain-circle', '#72d46a'],
    '🪲': ['beetle-shell', '#6aa060'],
    '🦗': ['cricket', '#8ac060'],
    '🪱': ['earth-worm', '#e090a0'],
    '🍾': ['champagne-cork', '#6ac060'],
    '🔶': ['cut-diamond', '#ffa040'],
    '🍎': ['shiny-apple', '#e04040'],
    '🎎': ['drama-masks', '#ffb0b0'],
    '🏮': ['lantern-flame', '#ff6040'],
    '☔': ['umbrella', '#9ab8e0'],
    '🔴': ['plain-circle', '#ff5a4a'],
    '⚜': ['fleur-de-lys', '#f1c862'],
    '🥁': ['drum', '#e0a060'],
    '🤚': ['open-palm', '#e8c0a0'],
    '🔦': ['flashlight', '#c9d2dc'],
    '🥈': ['podium-second', '#d0d8e0'],
    '🟠': ['plain-circle', '#ffa040'],
    '🧣': ['cloak', '#e06060'],
    '🧍': ['person', '#eef2f6'],
    '🟫': ['stone-block', '#a08060'],
    '🛗': ['elevator', '#c9d2dc'],
    '💡': ['light-bulb', '#ffe080'],
    '🍶': ['sake-bottle', '#e8e0d0'],
    '✂': ['scissors', '#c9d2dc'],
    '🗑': ['trash-can', '#c9d2dc'],
    '📱': ['smartphone', '#c9d2dc'],
    '🌙': ['night-sky', '#ffe8a0'],
    '📉': ['chart', '#ff7a6a'],
    '🖥': ['computer-fan', '#c9d2dc'],
    '⛶': ['expand', '#eef2f6'],
    '📳': ['vibrating-smartphone', '#c9d2dc'],
    '⏪': ['anticlockwise-rotation', '#a8c8ff'],
    '🍒': ['cherry', '#e8404a'], '↪': ['ricochet', '#8fd0ff'],
  };

  // ---------------- colours ----------------
  const hexRgb = (c) => { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)); };
  const mix = (c, t, k) => { const a = hexRgb(c), b = hexRgb(t); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  const C = {
    metal: '#a3aeb9', dark: '#68727d', black: '#4e565f', glass: '#86d4ff', red: '#ff3b30', orange: '#ff9a2e', brass: '#e2b257', copper: '#d9884f',
    wood: '#b47b48', rubber: '#4a4f55', gold: '#ffd34a', bone: '#ebdfc4', purple: '#b884ff', green: '#86e04a', white: '#eef2f6', blood: '#d8303c',
  };

  // ---------------- shapes (512 x 512 space) ----------------
  const R = (x, y, w, h, r) => {
    r = Math.min(r || 0, w / 2, h / 2);
    if (!r) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
  };
  const O = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const PG = (...p) => { let s = `M${p[0]} ${p[1]}`; for (let i = 2; i < p.length; i += 2) s += `L${p[i]} ${p[i + 1]}`; return s + 'Z'; };
  const L = (d, c, more) => Object.assign({ d, c }, more || {});
  const EV = (d, c, more) => Object.assign({ d, c, ev: 1 }, more || {});
  // a small game-icon in the bottom-right corner on a dark disc (what kind of variant it is)
  const badge = (name, c) => ({ d: PATHS[name] || '', c, s: 0.44, x: 282, y: 282, back: 1 });
  // zoom / tilt a drawing about the centre (badges stay put in their corner)
  const Z = (layers, k, r) => layers.map((l) => (l.back ? l : Object.assign({}, l, { gk: k, gr: r || 0 })));
  const big = (name, c, s, x, y) => ({ d: PATHS[name] || '', c, s: s || 1, x: x || 0, y: y || 0 });

  // ---------------- registry ----------------
  const SPEC = {}, FALLBACK = {};
  // overshield (next to the HP): a see-through light-blue shield with a pale rim
  const OS = () => [{ d: PATHS.shield || '', c: '#8fdcff', o: 0.62, ring: '#d8f4ff' }, { d: PATHS.shield || '', c: '#ffffff', o: 0.2, s: 0.6, x: 102, y: 90 }];
  IC.def = function (key, layers, fallback) { SPEC[key] = layers; if (fallback) FALLBACK[key] = fallback; delete SVG[key]; return key; };
  IC.has = (key) => !!SPEC[key];
  for (const e in EMO) { const [n, c] = EMO[e]; if (PATHS[n]) SPEC['e:' + e] = [big(n, c)]; }

  // private-use characters stand for entity icons inside ordinary strings
  const CH = {}, BYCH = {};
  let nextCh = 0xe000;
  IC.ch = function (key, fallback) {
    if (!CH[key]) { const ch = String.fromCharCode(nextCh++); CH[key] = ch; BYCH[ch] = key; }
    if (fallback && !FALLBACK[key]) FALLBACK[key] = fallback;
    return CH[key];
  };
  IC.keyOf = (ch) => BYCH[ch] || (EMO[ch] ? 'e:' + ch : null);
  // a string with every icon character replaced by its emoji fallback (for attributes / plain text sinks)
  IC.plain = (s) => String(s == null ? '' : s).replace(/[-]/g, (ch) => FALLBACK[BYCH[ch]] || '');

  // ---------------- SVG ----------------
  let defs = null;
  const grads = {};
  function grad(c) {
    const id = 'gxg' + c.replace('#', '');
    if (grads[id]) return id;
    grads[id] = 1;
    if (!defs) {
      const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      host.setAttribute('width', '0'); host.setAttribute('height', '0'); host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); host.appendChild(defs);
      (document.body || document.documentElement).appendChild(host);
    }
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    g.id = id; g.setAttribute('x1', '0'); g.setAttribute('y1', '0'); g.setAttribute('x2', '0.25'); g.setAttribute('y2', '1');
    g.innerHTML = `<stop offset="0" stop-color="${mix(c, '#ffffff', 0.5)}"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, '#000000', 0.42)}"/>`;
    defs.appendChild(g);
    return id;
  }
  const SVG = {};
  function svgOf(key) {
    if (SVG[key]) return SVG[key];
    const layers = SPEC[key]; if (!layers) return '';
    let ol = '', fl = '';
    for (const l of layers) {
      if (!l.d) continue;
      const s = (l.s || 1) * (l.gk || 1);
      let tf = '';
      if (l.gr) tf += `rotate(${l.gr} 256 256) `;
      if (l.gk) tf += `translate(256 256) scale(${l.gk}) translate(-256 -256) `;
      if (l.s || l.x || l.y) tf += `translate(${l.x || 0} ${l.y || 0}) scale(${l.s || 1})`;
      tf = tf ? ` transform="${tf.trim()}"` : '';
      const fr = l.ev ? ' fill-rule="evenodd"' : '';
      if (l.back) {
        const r = 256 * (l.s || 1), cx = (l.x || 0) + r, cy = (l.y || 0) + r;
        ol += `<circle cx="${cx}" cy="${cy}" r="${r * 1.04}" stroke-width="30"/>`;
        fl += `<circle cx="${cx}" cy="${cy}" r="${r * 1.04}" fill="#17110c" stroke="${mix(l.c, '#000000', 0.25)}" stroke-width="10"/>`;
      }
      if (!l.back && !l.ring) ol += `<path${tf}${fr} d="${l.d}" stroke-width="${(36 / s).toFixed(1)}"/>`;
      fl += `<path${tf}${fr} d="${l.d}" fill="url(#${grad(l.c)})"${l.ring ? ` stroke="${l.ring}" stroke-width="${(22 / s).toFixed(1)}" stroke-linejoin="round"` : ''}${l.o != null ? ` opacity="${l.o}"` : ''}/>`;
    }
    SVG[key] = `<svg viewBox="-20 -20 552 552" aria-hidden="true"><g fill="#0b0806" stroke="#0b0806" stroke-linejoin="round" opacity="0.9">${ol}</g>${fl}</svg>`;
    return SVG[key];
  }
  IC.svg = svgOf;
  IC.html = (key, cls) => (SPEC[key] ? `<i class="gx${cls ? ' ' + cls : ''}">${svgOf(key)}</i>` : '');
  // emoji / icon character / key -> markup (anything unknown is returned as text)
  IC.of = (v, cls) => { const k = SPEC[v] ? v : IC.keyOf(String(v).replace(/️/g, '')); return k ? IC.html(k, cls) : String(v); };
  const tplCache = {};
  function iconNode(key) {
    let t = tplCache[key];
    if (!t) { t = document.createElement('i'); t.className = 'gx'; t.innerHTML = svgOf(key); tplCache[key] = t; }
    return t.cloneNode(true);
  }

  // ---------------- canvas ----------------
  const p2d = {};
  const path2d = (d) => p2d[d] || (p2d[d] = new Path2D(d));
  IC.drawIcon = function (g, key, x, y, size) {
    const layers = SPEC[key]; if (!layers) return false;
    const k = size / 552;
    g.save(); g.translate(x + 20 * k, y + 20 * k); g.scale(k, k);
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(11,8,6,0.9)'; g.fillStyle = 'rgba(11,8,6,0.9)';
    const each = (fn) => { for (const l of layers) {
      if (!l.d) continue; g.save();
      if (l.gr) { g.translate(256, 256); g.rotate(l.gr * Math.PI / 180); g.translate(-256, -256); }
      if (l.gk) { g.translate(256, 256); g.scale(l.gk, l.gk); g.translate(-256, -256); }
      if (l.s || l.x || l.y) { g.translate(l.x || 0, l.y || 0); g.scale(l.s || 1, l.s || 1); }
      fn(l); g.restore();
    } };
    each((l) => { if (l.back || l.ring) return; g.lineWidth = 36 / ((l.s || 1) * (l.gk || 1)); g.stroke(path2d(l.d)); });
    each((l) => {
      if (l.back) { g.beginPath(); g.arc(256, 256, 266, 0, Math.PI * 2); g.fillStyle = '#17110c'; g.fill(); g.lineWidth = 10 / (l.s || 1); g.strokeStyle = mix(l.c, '#000000', 0.25); g.stroke(); }
      const gr = g.createLinearGradient(0, 0, 128, 512);
      gr.addColorStop(0, mix(l.c, '#ffffff', 0.5)); gr.addColorStop(0.45, l.c); gr.addColorStop(1, mix(l.c, '#000000', 0.42));
      g.fillStyle = gr; g.globalAlpha = l.o != null ? l.o : 1;
      g.fill(path2d(l.d), l.ev ? 'evenodd' : 'nonzero'); g.globalAlpha = 1;
    });
    g.restore();
    return true;
  };
  // split a string into text runs and icon keys
  let RX = null;
  function buildRx() {
    const keys = Object.keys(EMO).filter((e) => SPEC['e:' + e]).sort((a, b) => b.length - a.length).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    RX = new RegExp('(' + keys.join('|') + '|[\\ue000-\\uf8ff])\\ufe0f?', 'g');
  }
  IC.split = function (s) {
    if (!RX) buildRx();
    const out = []; let last = 0; RX.lastIndex = 0; let m;
    while ((m = RX.exec(s))) {
      const key = IC.keyOf(m[1]); if (!key || !SPEC[key]) continue;
      if (m.index > last) out.push(s.slice(last, m.index));
      out.push({ key }); last = m.index + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };
  // fillText that draws icons in place of their characters. opts: { stroke: lineWidth (outline text first), iconScale }
  IC.fillText = function (g, text, x, y, opts) {
    opts = opts || {};
    const parts = IC.split(String(text));
    if (!parts.some((p) => typeof p !== 'string')) { if (opts.stroke) g.strokeText(text, x, y); g.fillText(text, x, y); return; }
    const fs = parseFloat((g.font.match(/(\d+(?:\.\d+)?)px/) || [0, 24])[1]), isz = fs * (opts.iconScale || 1.2);
    const widths = parts.map((p) => (typeof p === 'string' ? g.measureText(p).width : isz));
    const total = widths.reduce((a, b) => a + b, 0);
    const align = g.textAlign, base = g.textBaseline;
    let cx = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
    g.textAlign = 'left';
    const iy = base === 'middle' ? y - isz / 2 : base === 'top' ? y : y - isz * 0.82;
    parts.forEach((p, i) => {
      if (typeof p === 'string') { if (opts.stroke) g.strokeText(p, cx, y); g.fillText(p, cx, y); }
      else { const sh = g.shadowBlur; g.shadowBlur = 0; IC.drawIcon(g, p.key, cx, iy, isz); g.shadowBlur = sh; }
      cx += widths[i];
    });
    g.textAlign = align;
  };

  // ---------------- page: swap icon characters / table emoji for drawings ----------------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'CANVAS', 'NOSCRIPT', 'TITLE']);
  function skipped(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP.has(e.nodeName) || e.namespaceURI === 'http://www.w3.org/2000/svg') return 'skip';
      if (e.classList && (e.classList.contains('gx') || e.classList.contains('noicon'))) return 'skip';
    }
    return null;
  }
  const quick = /[-←-⯿☀-➿\ud83c-\ud83e]/;
  function processText(tn) {
    const s = tn.nodeValue;
    if (!s || !quick.test(s)) return;
    const p = tn.parentNode; if (!p) return;
    if (skipped(p)) { if (/[-]/.test(s) && p.nodeName !== 'svg') tn.nodeValue = IC.plain(s); return; }
    const parts = IC.split(s);
    if (parts.length === 1 && typeof parts[0] === 'string') return;
    const frag = document.createDocumentFragment();
    for (const q of parts) frag.appendChild(typeof q === 'string' ? document.createTextNode(q) : iconNode(q.key));
    p.replaceChild(frag, tn);
  }
  function processTree(root) {
    if (root.nodeType === 3) { processText(root); return; }
    if (root.nodeType !== 1 || skipped(root)) {
      if (root.nodeType === 1 && /^(OPTION|SELECT)$/.test(root.nodeName)) for (const o of root.querySelectorAll ? [root, ...root.querySelectorAll('option')] : [root]) if (o.firstChild && o.firstChild.nodeType === 3) processText(o.firstChild);
      return;
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = []; let n;
    while ((n = tw.nextNode())) if (quick.test(n.nodeValue)) list.push(n);
    for (const t of list) processText(t);
    fixAttrs(root);
  }
  function fixAttrs(root) {
    if (!root.querySelectorAll) return;
    for (const el of [root, ...root.querySelectorAll('[title],[placeholder]')]) for (const a of ['title', 'placeholder']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && /[-]/.test(v)) el.setAttribute(a, IC.plain(v));
    }
  }
  IC.scan = processTree;
  IC.start = function () {
    if (IC._obs) return;
    processTree(document.body);
    IC._obs = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === 'characterData') processText(r.target);
        else if (r.type === 'attributes') { const v = r.target.getAttribute(r.attributeName); if (v && /[-]/.test(v)) r.target.setAttribute(r.attributeName, IC.plain(v)); }
        else for (const nd of r.addedNodes) if (nd.isConnected) processTree(nd);
      }
    });
    IC._obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  };
  // document.title, alert() etc. never see icon characters
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', IC.start); else IC.start();

  // ======================================================================================================
  // Attachments: drawn parts (side views; muzzle to the right), plus a corner badge for the variant
  // ======================================================================================================
  const P = {};
  // optics
  P.scope = (len, bell, col) => {
    const x0 = 256 - len / 2, x1 = 256 + len / 2;
    return [
      L(R(x0 + 70, 304, len - 140, 30, 10), C.black),                                         // mount base
      L(R(x0 + 92, 262, 36, 58, 8), C.dark), L(R(x1 - 128, 262, 36, 58, 8), C.dark),           // rings
      L(R(x0 + 60, 214, len - 130, 52, 24), col || C.metal),                                  // tube
      L(PG(x0, 196, x0 + 72, 206, x0 + 72, 276, x0, 286), C.dark),                             // eyepiece
      L(PG(x1 - 92, 206, x1, 214 - bell, x1, 266 + bell, x1 - 92, 274), col || C.metal),         // objective bell
      L(R(x1 - 10, 216 - bell, 12, 48 + bell * 2, 5), C.glass),                                // lens
      L(R(236, 178, 40, 40, 8), C.dark), L(R(228, 168, 56, 16, 6), C.black),                   // turret
    ];
  };
  P.front = (outer, inner, dot, dotCol) => [
    L(R(176, 360, 160, 40, 10), C.dark), L(R(120, 394, 272, 32, 10), C.black),
    EV(outer + inner, C.metal), L(inner, C.glass, { o: 0.45 }), L(O(256, dot, 20), dotCol),
  ];
  // muzzle devices (a stub of barrel on the left)
  const stub = L(R(24, 230, 140, 52, 12), C.black);
  // barrels
  P.barrel = (y, h, x0, x1, col) => [L(R(x0, y, x1 - x0, h, Math.min(20, h / 2)), col || C.metal), L(R(x0 + 10, y - 16, 44, h + 32, 10), C.dark)];
  // magazines
  P.mag = (col, x) => { x = x || 0; return [L(PG(196 + x, 70, 300 + x, 70, 336 + x, 400, 232 + x, 420), col || C.dark), L(R(214 + x, 412, 140, 34, 10), C.black), L(R(204 + x, 54, 88, 26, 6), C.brass)]; };
  // under-barrel: the rail clamp on top
  const clamp = [L(R(96, 108, 320, 46, 10), C.black)];
  // stocks (butt on the left)
  P.stock = [L(PG(40, 150, 140, 150, 476, 214, 476, 298, 140, 330, 40, 362), C.dark), L(R(16, 140, 46, 232, 14), C.rubber)];
  // cartridges (upright)
  P.round = (tip, casing) => [
    L(R(200, 214, 112, 236, 10), casing || C.brass), L(PG(200, 214, 312, 214, 296, 180, 216, 180), casing || C.brass),
    L(PG(216, 180, 296, 180, 290, 116, 256, 52, 222, 116), tip), L(R(188, 440, 136, 26, 6), mix(casing || C.brass, '#000000', 0.25)),
  ];
  // the trigger group
  P.trigger = (col) => [
    L(PG(318, 150, 420, 150, 470, 430, 372, 446), C.wood),                                     // grip
    EV(R(96, 150, 300, 214, 96) + R(136, 96, 220, 226, 70), C.dark),                           // guard (open at the top)
    L(R(40, 100, 432, 74, 18), C.black),                                                     // receiver
    L(PG(206, 170, 256, 170, 270, 248, 244, 318, 214, 304, 228, 244), col || '#d8dee6'),       // the trigger itself
  ];
  const ATT = {
    // optics
    o_reddot: P.front(O(256, 236, 124), O(256, 236, 88), 236, C.red),
    o_reflex: P.front(R(130, 110, 252, 236, 46), R(162, 142, 188, 180, 30), 232, C.orange),
    o_holo: [...P.front(R(84, 128, 344, 222, 28), R(118, 160, 276, 160, 16), 240, C.red), EV(O(256, 240, 56) + O(256, 240, 44), C.red)],
    o_2x: [L(R(140, 304, 232, 30, 10), C.black), L(PG(112, 214, 380, 196, 418, 214, 418, 304, 112, 304, 96, 260), C.dark), L(R(410, 214, 12, 84, 5), C.glass), L(R(186, 170, 70, 36, 10), C.black), L(O(220, 186, 10), C.red)],
    o_4x: P.scope(360, 22),
    o_8x: [...P.scope(452, 40), L(O(300, 238, 20), C.dark)],
    o_marksman: [...P.scope(400, 30), L(R(340, 178, 32, 30, 8), C.dark)],
    o_hunter: [...P.scope(380, 26, '#8a7aa8'), badge('eyeball', C.purple)],
    // muzzles
    m_supp: [stub, L(R(150, 194, 330, 124, 44), C.dark), L(R(214, 194, 14, 124), C.black), L(R(410, 194, 14, 124), C.black)],
    m_supp2: [stub, L(R(150, 194, 330, 124, 44), '#5a4a7a'), L(R(200, 246, 240, 20, 10), C.purple, { o: 0.9 }), badge('sparkles', C.purple)],
    m_comp: [stub, EV(R(156, 204, 224, 104, 18) + R(204, 222, 22, 68, 10) + R(250, 222, 22, 68, 10) + R(296, 222, 22, 68, 10), C.metal), L(R(370, 214, 44, 84, 12), C.dark)],
    m_brake: [stub, EV(R(156, 186, 270, 140, 22) + R(196, 208, 200, 26, 12) + R(196, 278, 200, 26, 12), C.metal), L(R(420, 220, 40, 72, 10), C.dark)],
    m_flash: [stub, L(R(150, 208, 96, 96, 14), C.metal), L(R(240, 208, 200, 20, 8), C.dark), L(R(240, 244, 210, 22, 8), C.dark), L(R(240, 282, 200, 22, 8), C.dark)],
    m_choke: [stub, L(R(150, 220, 230, 72, 20), C.metal), L(PG(372, 220, 470, 186, 470, 326, 372, 292), C.dark)],
    m_amp: [stub, L(PG(150, 222, 290, 222, 466, 150, 466, 362, 290, 290, 150, 290), C.copper), L(R(288, 206, 22, 100, 8), C.dark)],
    m_nozzle: [stub, L(R(150, 214, 150, 84, 18), C.dark), L(PG(296, 226, 420, 190, 420, 322, 296, 286), C.copper), badge('flame', C.orange)],
    // barrels
    b_long: [...P.barrel(234, 44, 20, 490), L(R(452, 200, 16, 36, 4), C.dark)],
    b_short: P.barrel(222, 68, 140, 380),
    b_heavy: P.barrel(200, 112, 40, 474, C.dark),
    b_fluted: [...P.barrel(214, 84, 40, 474), EV(R(110, 228, 350, 56, 20) + R(130, 238, 300, 10, 5) + R(130, 264, 300, 10, 5), C.metal)],
    b_match: [...P.barrel(238, 36, 20, 490), badge('crosshair', C.red)],
    b_rifled: [...P.barrel(214, 84, 40, 474), ...[0, 1, 2, 3, 4].map((i) => L(PG(130 + i * 66, 300, 160 + i * 66, 300, 190 + i * 66, 212, 160 + i * 66, 212), C.black, { o: 0.75 }))],
    b_master: [...P.barrel(214, 84, 40, 474, C.gold), L(R(150, 244, 260, 24, 12), '#b8862a'), badge('fleur-de-lys', C.gold)],
    b_ceramic: [...P.barrel(214, 84, 40, 474, '#e8e4dc'), L(R(160, 214, 16, 84), C.dark), L(R(300, 214, 16, 84), C.dark)],
    b_blast: [L(R(70, 168, 360, 176, 40), C.dark), L(R(400, 150, 70, 212, 20), C.metal), badge('bright-explosion', C.orange)],
    // magazines
    g_ext: [...P.mag(), L(R(236, 120, 14, 250, 6), C.brass, { o: 0.65 })],
    g_drum: [EV(O(256, 300, 160) + O(256, 300, 58), C.dark), L(O(256, 300, 40), C.metal), L(R(212, 58, 92, 120, 12), C.black)],
    g_quick: [...P.mag(), badge('power-lightning', '#ffe14a')],
    g_dual: [...P.mag(C.dark, -70), ...P.mag(C.dark, 70).slice(0, 1), L(R(110, 250, 300, 46, 10), '#c08a40')],
    g_bottom: [...P.mag('#5a4a7a'), badge('infinity', C.purple)],
    g_belt: [0, 1, 2, 3, 4].flatMap((i) => [L(R(70 + i * 76, 190 + i * 30, 52, 150, 8), C.brass), L(PG(70 + i * 76, 190 + i * 30, 122 + i * 76, 190 + i * 30, 96 + i * 76, 134 + i * 30), C.copper)]).concat([L(PG(60, 290, 470, 410, 470, 440, 60, 320), C.black)]),
    g_fuel: [L(R(150, 110, 212, 340, 70), '#b0503a'), L(R(222, 54, 68, 70, 12), C.dark), L(R(150, 200, 212, 26), C.black), badge('flame', C.orange)],
    // under-barrel
    u_vgrip: [...clamp, L(R(198, 150, 116, 290, 46), C.dark), L(R(198, 230, 116, 14), C.black), L(R(198, 300, 116, 14), C.black)],
    u_agrip: [...clamp, L(PG(110, 150, 410, 150, 300, 336, 196, 336), C.dark)],
    u_laser: [...clamp, L(R(110, 150, 230, 116, 22), C.dark), L(O(338, 208, 30), C.red), L(R(338, 196, 170, 24, 12), C.red, { o: 0.8 })],
    u_bipod: [...clamp, L(PG(214, 150, 254, 150, 136, 462, 96, 462), C.dark), L(PG(258, 150, 298, 150, 416, 462, 376, 462), C.dark), L(R(214, 150, 84, 60, 10), C.black)],
    u_stab: [...clamp, L(R(236, 150, 40, 80, 8), C.black), EV(O(256, 326, 122) + O(256, 326, 80), C.metal), L(R(160, 314, 192, 24, 12), C.glass)],
    u_handstop: [...clamp, L(PG(150, 150, 362, 150, 362, 238, 296, 290, 270, 290), C.dark)],
    // stocks
    k_light: [L(R(250, 226, 236, 56, 20), C.dark), EV(PG(36, 150, 270, 206, 270, 300, 36, 362) + PG(84, 196, 226, 232, 226, 276, 84, 318), C.metal)],
    k_heavy: P.stock,
    k_tac: [EV(R(220, 220, 266, 66, 24) + R(250, 240, 24, 26, 8) + R(296, 240, 24, 26, 8) + R(342, 240, 24, 26, 8), C.dark), L(PG(36, 150, 240, 182, 240, 322, 36, 362), C.metal), L(R(14, 142, 44, 228, 12), C.rubber)],
    k_skel: [EV(PG(36, 150, 140, 150, 476, 214, 476, 298, 140, 330, 36, 362) + PG(96, 196, 300, 222, 96, 252) + PG(96, 272, 300, 282, 96, 312), C.metal), L(R(14, 142, 44, 228, 12), C.rubber)],
    k_cheek: [...P.stock, L(R(110, 120, 220, 54, 22), '#9a4a3a')],
    // ammunition
    a_hollow: [...P.round('#c87a4a'), L(O(256, 76, 22), C.black)],
    a_ap: [...P.round('#7aa6d8', '#b8c0c8'), L(PG(236, 120, 276, 120, 256, 40), '#d8e4f0')],
    a_fire: [...P.round('#ff6a2a'), badge('flame', C.orange)],
    a_cryo: [...P.round('#7ad8ff'), badge('snowflake-2', '#8fd8ff')],
    a_toxic: [...P.round('#86d040'), badge('biohazard', C.green)],
    a_shock: [...P.round('#ffe14a'), badge('power-lightning', '#ffe14a')],
    a_explo: [...P.round('#e04040'), badge('bright-explosion', C.orange)],
    a_rico: [...P.round('#c8a070'), badge('ricochet', '#8fd0ff')],
    a_silver: P.round('#eef2f6', '#c8d0d8'),
    a_slug: [L(R(176, 64, 160, 318, 18), '#c83a30'), L(R(170, 362, 172, 102, 12), C.brass), L(R(176, 64, 160, 26, 10), '#e05a48'), L(R(166, 450, 180, 22, 6), '#a07a30')],
    a_pierce: [...P.round('#c8d0d8'), badge('arrowhead', '#c9d2dc')],
    a_bleed: [...P.round('#c02030'), L(PG(222, 116, 206, 134, 222, 150), '#c02030'), L(PG(290, 116, 306, 134, 290, 150), '#c02030'), badge('drop', C.blood)],
    a_vamp: [...P.round('#8a1a2a'), badge('bat', '#c060a0')],
    a_tracer: [L(PG(150, 470, 200, 470, 236, 300, 216, 300), '#ff7a30', { o: 0.75 }), ...P.round('#ff5030').map((l) => Object.assign({}, l, { s: 0.86, x: 60, y: 10 }))],
    a_hunter: [...P.round('#a07a50'), badge('bullseye', C.red)],
    // triggers
    t_match: [...P.trigger(C.gold), badge('checkered-flag', C.white)],
    t_hair: [...P.trigger(), badge('feather', '#e8f0ff')],
    t_auto: [...P.trigger(), badge('cycle', '#8fd0ff')],
    t_bolt: [...P.trigger(), badge('gears', '#b8c0c8')],
    t_crit: [...P.trigger('#e05050'), badge('spiky-explosion', '#ff6060')],
    t_charge: [...P.trigger(), badge('battery-75', '#8fe060')],
    t_spin: [...P.trigger(), badge('vortex', '#8fb0ff')],
  };
  // long parts lie diagonally across the tile (like most game icons), short ones are just zoomed a little
  const TILT = { o_: [1.28, -28], m_: [1.26, -30], b_: [1.16, -35], g_: [1.12, 10], u_: [1.14, 0], k_: [1.08, -28], a_: [1.06, 22], t_: [1.0, 0] };
  const ZOOM = { o_2x: 1.55, o_8x: 1.18, b_short: 1.8, b_heavy: 1.08, b_blast: 1.08, m_amp: 1.22, m_nozzle: 1.28, u_handstop: 1.4, u_agrip: 1.25 };
  for (const id in ATT) {
    const t = TILT[id.slice(0, 2)]; if (!t) continue;
    if (id === 'o_reddot' || id === 'o_reflex' || id === 'o_holo') { ATT[id] = Z(ATT[id], 1.06, 0); continue; }
    if (id === 'g_belt' || id === 'g_drum' || id === 'g_fuel' || id === 'a_slug' || id === 'a_tracer') { ATT[id] = Z(ATT[id], 1.04, id === 'a_slug' ? 18 : 0); continue; }
    ATT[id] = Z(ATT[id], ZOOM[id] || t[0], t[1]);
  }
  const SLOT_ICON = { optic: 'o_4x', muzzle: 'm_supp', barrel: 'b_long', mag: 'g_ext', under: 'u_vgrip', stock: 'k_heavy', ammo: 'a_hollow', trigger: 'P_trigger' };
  ATT.P_trigger = P.trigger();
  ATT.a_round = Z(P.round('#c87a4a'), 1.02, 22);
  SLOT_ICON.ammo = 'a_round';

  // guns the icon set has no good silhouette for are drawn here (side views, then tilted like the others). f = finish colour
  const GUNX = {
    sniper: (f) => [
      L(PG(16, 252, 120, 236, 196, 250, 196, 300, 120, 322, 26, 334), C.wood), L(R(186, 236, 124, 50, 10), f), L(R(300, 252, 196, 18, 8), C.dark), L(R(476, 244, 30, 34, 6), C.black),
      L(PG(200, 284, 238, 284, 226, 344, 194, 344), C.wood), L(R(250, 286, 10, 22, 4), C.dark), L(O(255, 312, 9), C.dark),
      L(R(222, 220, 12, 20, 3), C.black), L(R(300, 220, 12, 20, 3), C.black), L(R(196, 196, 152, 28, 14), C.black), L(PG(176, 190, 204, 196, 204, 224, 176, 230), C.black), L(PG(340, 196, 380, 186, 380, 234, 340, 224), C.black), L(R(376, 190, 6, 40, 3), C.glass),
      L(PG(402, 268, 410, 268, 434, 334, 426, 334), C.dark), L(PG(394, 268, 402, 268, 380, 334, 372, 334), C.dark),
    ],
    dmr: (f) => [
      L(PG(20, 252, 120, 238, 186, 250, 186, 300, 120, 318, 28, 330), C.black), L(R(176, 236, 150, 52, 10), f), L(R(320, 248, 150, 22, 8), C.dark), L(R(300, 244, 60, 32, 8), C.black),
      L(PG(196, 286, 232, 286, 222, 344, 190, 344), C.black), L(PG(260, 286, 300, 286, 312, 352, 276, 360), C.dark),
      L(R(214, 218, 12, 20, 3), C.black), L(R(282, 218, 12, 20, 3), C.black), L(R(196, 198, 116, 24, 12), C.black), L(PG(306, 196, 336, 190, 336, 226, 306, 220), C.black), L(R(332, 194, 6, 30, 3), C.glass),
    ],
    shotgun: (f) => [
      L(PG(16, 248, 140, 232, 140, 296, 26, 324), C.wood), L(R(130, 230, 112, 56, 12), f), L(R(236, 234, 260, 22, 9), C.dark), L(R(236, 262, 206, 18, 8), C.black),
      L(R(300, 254, 96, 34, 12), C.wood), L(PG(150, 284, 190, 284, 178, 344, 144, 344), C.wood), L(R(486, 228, 10, 10, 3), C.metal),
    ],
    gl: (f) => [
      L(PG(16, 244, 132, 228, 132, 300, 26, 322), C.black), EV(R(140, 204, 128, 112, 30) + R(158, 222, 92, 10, 5) + R(158, 290, 92, 10, 5), f), L(R(258, 218, 214, 82, 22), C.dark), L(R(458, 208, 32, 102, 8), C.black),
      L(PG(184, 312, 226, 312, 216, 376, 178, 376), C.black), L(R(300, 196, 70, 20, 6), C.black),
    ],
    rail: (f) => [
      L(PG(16, 240, 128, 226, 128, 292, 26, 322), C.black), L(R(116, 214, 236, 84, 24), f), L(R(330, 206, 176, 16, 6), C.dark), L(R(330, 290, 176, 16, 6), C.dark),
      L(R(340, 230, 156, 52, 22), '#7fe8ff', { o: 0.95 }), L(R(166, 204, 16, 104, 6), C.copper), L(R(206, 204, 16, 104, 6), C.copper), L(R(246, 204, 16, 104, 6), C.copper),
      L(PG(170, 296, 214, 296, 200, 360, 162, 360), C.black),
    ],
    tesla: (f) => [
      L(PG(16, 242, 120, 230, 120, 290, 26, 316), C.black), L(R(108, 222, 220, 70, 24), f), L(R(292, 206, 20, 102, 8), C.copper), L(R(322, 206, 20, 102, 8), C.copper), L(R(352, 206, 20, 102, 8), C.copper),
      L(PG(378, 230, 476, 204, 482, 218, 388, 248), C.dark), L(PG(378, 284, 476, 310, 482, 296, 388, 266), C.dark), L(O(468, 257, 24), '#9af0ff'),
      L(PG(150, 288, 192, 288, 180, 352, 142, 352), C.black),
    ],
    nail: (f) => [
      L(R(130, 198, 230, 94, 20), f), L(R(350, 224, 104, 42, 10), C.dark), L(R(444, 234, 36, 22, 6), C.black), L(PG(196, 288, 248, 288, 238, 384, 186, 384), C.black),
      L(PG(250, 292, 356, 292, 338, 334, 242, 334), C.brass), ...[0, 1, 2, 3, 4].map((i) => L(R(256 + i * 18, 296, 6, 32, 2), C.dark)),
    ],
    lmg: (f) => [
      L(PG(16, 246, 128, 232, 150, 252, 150, 296, 128, 314, 26, 326), C.black), L(R(140, 224, 170, 66, 12), f), L(R(304, 240, 196, 24, 9), C.dark), L(R(296, 230, 104, 44, 10), C.black),
      L(R(196, 288, 92, 74, 10), C.dark), L(PG(160, 288, 198, 288, 188, 346, 154, 346), C.black), L(R(160, 204, 110, 22, 8), C.black),
      L(PG(420, 262, 428, 262, 452, 336, 444, 336), C.dark), L(PG(412, 262, 420, 262, 398, 336, 390, 336), C.dark),
    ],
    rocket: (f) => [
      L(R(40, 226, 380, 60, 26), f), L(R(20, 220, 40, 72, 12), C.dark), L(R(380, 216, 44, 80, 12), C.dark),
      L(PG(424, 230, 470, 230, 506, 256, 470, 282, 424, 282), '#c84a3a'), L(PG(176, 284, 214, 284, 204, 346, 168, 346), C.black), L(PG(260, 284, 296, 284, 290, 330, 256, 330), C.black),
      L(R(200, 194, 70, 34, 8), C.black), L(R(262, 200, 10, 22, 3), C.glass),
    ],
    harpoon: (f) => [
      L(PG(16, 246, 128, 232, 128, 294, 26, 320), C.wood), L(R(118, 238, 160, 50, 14), f), L(R(270, 248, 140, 30, 12), C.dark), L(R(240, 256, 214, 14, 6), C.metal),
      L(PG(446, 236, 506, 263, 446, 290, 458, 263), C.metal), L(PG(150, 286, 190, 286, 178, 346, 144, 346), C.wood),
    ],
  };
  // guns: silhouette per type, in the colour of the gun's finish
  const GUN = { pistol: 'colt-m1911', revolver: 'revolver', smg: 'mp5', rifle: 'ak47', burst: 'famas', autoshotgun: 'sawed-off-shotgun', minigun: 'minigun', crossbow: 'crossbow', flame: 'flamethrower' };
  const FINISH = { black: '#8a949f', steel: '#c3ccd6', brass: '#e2b257', bone: '#ebdfc4', gold: '#ffd34a', tan: '#c9a978', rust: '#c47a4e', wood: '#b47b48' };
  const MELEE = { fist: 'brass-knuckles', knife: 'bowie-knife', blade: 'broadsword', axe: 'battle-axe', blunt: 'flanged-mace', spear: 'barbed-spear', scythe: 'scythe' };
  const ARMOR = {
    head: { cloth: 'hood', leather: 'barbute', scale: 'crested-helmet', chain: 'closed-barbute', plate: 'visored-helm' },
    chest: { cloth: 'robe', leather: 'leather-vest', scale: 'scale-mail', chain: 'chain-mail', plate: 'breastplate' },
    legs: { cloth: 'trousers', leather: 'trousers', scale: 'armored-pants', chain: 'armored-pants', plate: 'leg-armor' },
    hands: { cloth: 'gloves', leather: 'gloves', scale: 'gauntlet', chain: 'gauntlet', plate: 'gauntlet' },
    feet: { cloth: 'leather-boot', leather: 'leather-boot', scale: 'metal-boot', chain: 'metal-boot', plate: 'steeltoe-boots' },
  };
  const MATCOL = { cloth: '#d8c8a4', leather: '#b57a48', scale: '#76b088', chain: '#b4bec8', plate: '#e0e6ee' };

  // give the game's data its icons (data files are loaded before this one)
  IC.applyData = function () {
    IC.def('ui:os', OS());
    for (const [k, layers] of Object.entries(ATT)) IC.def('att:' + k, layers);
    if (G.ATTACHMENTS) for (const a of G.ATTACHMENTS) if (SPEC['att:' + a.id]) a.icon = IC.ch('att:' + a.id, a.icon);
    if (G.ATT_SLOTS) for (const [id, s] of Object.entries(G.ATT_SLOTS)) if (SLOT_ICON[id]) { IC.def('slot:' + id, ATT[SLOT_ICON[id]]); s.icon = IC.ch('slot:' + id, s.icon); }
    const gunLayers = (arch, col) => (GUNX[arch] ? Z(GUNX[arch](col), 1.2, -32) : GUN[arch] && PATHS[GUN[arch]] ? [big(GUN[arch], col)] : null);
    if (G.WEAPON_ARCH) for (const [arch, A] of Object.entries(G.WEAPON_ARCH)) { const ly = gunLayers(arch, FINISH.steel); if (ly) { IC.def('arch:' + arch, ly); A.icon = IC.ch('arch:' + arch, A.icon); } }
    if (G.WEAPONS) for (const w of G.WEAPONS) {
      const key = 'gun:' + w.arch + ':' + (w.finish || 'steel');
      if (!SPEC[key]) { const ly = gunLayers(w.arch, FINISH[w.finish] || FINISH.steel); if (!ly) continue; IC.def(key, ly); }
      w.icon = IC.ch(key, w.icon);
    }
    if (G.MELEE) for (const m of G.MELEE) {
      const n = MELEE[m.mcat]; if (!n || !PATHS[n]) continue;
      const col = m.rarity === 'legendary' ? '#ffd34a' : m.rarity === 'epic' ? '#d8b0ff' : '#c9d2dc';
      const key = 'melee:' + m.mcat + ':' + col;
      if (!SPEC[key]) IC.def(key, [big(n, col)]);
      m.icon = IC.ch(key, m.icon);
    }
    if (G.ARMOR) for (const d of G.ARMOR) {
      const n = ARMOR[d.slot] && ARMOR[d.slot][d.mat]; if (!n || !PATHS[n]) continue;
      const key = 'armor:' + d.slot + ':' + d.mat;
      if (!SPEC[key]) IC.def(key, [big(n, MATCOL[d.mat] || C.metal)]);
      d.icon = IC.ch(key, d.icon);
    }
    // a few items whose emoji is shared with something else get their own drawing
    const ITEMX = { h_medkit: ['medical-pack', '#e8484a'], g_molotov: ['fire-bottle', '#ff8a3a'], v_casket: ['locked-chest', '#ffd34a'] };
    for (const list of [G.ITEMS, G.VALUABLES]) if (list) for (const it of list) { const x = ITEMX[it.id]; if (x && PATHS[x[0]]) { IC.def('item:' + it.id, [big(x[0], x[1])]); it.icon = IC.ch('item:' + it.id, it.icon); } }
    if (G.ARMOR_SLOTS) for (const s of G.ARMOR_SLOTS) { const n = ARMOR[s.id] && ARMOR[s.id].plate; if (n) { IC.def('aslot:' + s.id, [big(n, '#9a8a70')]); s.icon = IC.ch('aslot:' + s.id, s.icon); } }
  };
  IC.warm = function () {
    if (IC._warmed) return;
    IC._warmed = true;
    if (!RX) buildRx();
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:240px;height:240px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
    for (const k in SPEC) {
      box.appendChild(iconNode(k));
      for (const l of SPEC[k]) if (l.d) path2d(l.d);
    }
    if (document.body) {
      document.body.appendChild(box);
      void box.offsetWidth;
      setTimeout(() => box.remove(), 120);
    }
  };
  IC.applyData();
})();
