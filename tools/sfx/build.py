"""Cuts, cleans and encodes the downloaded CC0 sounds into the game's sfx/ folder and writes js/sfxbank.js.
usage: python -I build.py <dl/x dir> <repo dir>
"""
import subprocess, sys, os, json, csv, numpy as np

SR = 44100
X = sys.argv[1]
REPO = sys.argv[2]
OUT = os.path.join(REPO, 'sfx')
os.makedirs(OUT, exist_ok=True)

PACKS = {
    'firearm': ('The Free Firearm Sound Library', 'https://opengameart.org/content/the-free-firearm-sound-library'),
    'kimpact': ('Kenney - Impact Sounds', 'https://kenney.nl/assets/impact-sounds'),
    'kiface': ('Kenney - Interface Sounds', 'https://kenney.nl/assets/interface-sounds'),
    'krpg': ('Kenney - RPG Audio', 'https://kenney.nl/assets/rpg-audio'),
    'kscifi': ('Kenney - Sci-fi Sounds', 'https://kenney.nl/assets/sci-fi-sounds'),
    'kui': ('Kenney - UI Audio', 'https://kenney.nl/assets/ui-audio'),
    'crea1': ('rubberduck - 80 CC0 creature SFX', 'https://opengameart.org/content/80-cc0-creature-sfx'),
    'crea2': ('rubberduck - 80 CC0 creature SFX #2', 'https://opengameart.org/content/80-cc0-creture-sfx-2'),
    'rd100': ('rubberduck - 100 CC0 SFX', 'https://opengameart.org/content/100-cc0-sfx'),
    'rd100b': ('rubberduck - 100 CC0 SFX #2', 'https://opengameart.org/content/100-cc0-sfx-2'),
    'rdsci': ('rubberduck - 50 CC0 Sci-Fi SFX', 'https://opengameart.org/content/50-cc0-sci-fi-sfx'),
    'swish': ('artisticdude - Swishes Sound Pack', 'https://opengameart.org/content/swishes-sound-pack'),
    'sword': ('StarNinjas - 20 Sword Sound Effects', 'https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes'),
    'fwa': ('Vehicle - Fantasy Weapons and Apparel SFX Library', 'https://opengameart.org/content/fantasy-weapons-and-apparel-sfx-library'),
    'magic': ('JaggedStone - Magic Spell SFX', 'https://opengameart.org/content/magic-spell-sfx'),
    'dungamb': ('JaggedStone - Loopable Dungeon Ambience', 'https://opengameart.org/content/loopable-dungeon-ambience'),
    'cavern': ('Paul Wortmann - Dark Cavern Ambient', 'https://opengameart.org/content/dark-cavern-ambient'),
    'dungyd': ('yd - Dungeon Ambience', 'https://opengameart.org/content/dungeon-ambience'),
    'fireloop': ('PagDev - Fireplace Sound loop', 'https://opengameart.org/content/fireplace-sound-loop'),
    'firecr': ('AntumDeluge - Fire Crackling', 'https://opengameart.org/content/fire-crackling'),
    'synexp': ('qubodup - Synthesized explosion', 'https://opengameart.org/content/synthesized-explosion'),
    'splash': ('Peludo - Water Splash and sand footsteps', 'https://opengameart.org/content/water-splash-and-sand-footsteps'),
    'wind': ('IgnasD - Wind', 'https://opengameart.org/content/wind'),
}
P = {
    'kimpact': 'kenney_impact-sounds/Audio/', 'kiface': 'kenney_interface-sounds/Audio/', 'krpg': 'kenney_rpg-audio/Audio/',
    'kscifi': 'kenney_sci-fi-sounds/Audio/', 'kui': 'kenney_ui-audio/Audio/', 'crea1': '80-CC0-creature-SFX_0/', 'crea2': '80-CC0-creature-sfx-2/',
    'rd100': '100-CC0-SFX_0/', 'rd100b': 'sfx_100_v2/', 'rdsci': 'sci-fi-sfx/', 'swish': 'swishes/', 'sword': 'sword_-_starninjas_1/',
    'swordc': 'sword_clash_-_starninjas_0/', 'fwa': 'weapons-apparel/', 'loose': 'loose/', 'firearm': 'firearm/Prepared SFX Library/',
}


def find(pack, name):
    """file whose basename (without extension) is name, anywhere under the pack folder"""
    root = os.path.join(X, P[pack])
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if f.startswith('._'):
                continue
            b, e = os.path.splitext(f)
            if b == name and e.lower() in ('.ogg', '.wav', '.mp3', '.flac'):
                return os.path.join(dp, f)
    raise FileNotFoundError(pack + ':' + name)


_cache = {}


def load(path):
    if path not in _cache:
        p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True)
        _cache[path] = np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)
    return _cache[path]


def env(x, win=int(SR * 0.005)):
    n = len(x) // win
    return np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1)), win


def trim(x, db_floor=-48):
    if len(x) == 0:
        return x
    e, w = env(x)
    m = e.max()
    idx = np.where(e > m * 10 ** (db_floor / 20))[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] * w - int(SR * 0.002))
    b = min(len(x), (idx[-1] + 1) * w + int(SR * 0.01))
    return x[a:b]


def fade(x, fin=0.002, fout=0.03):
    x = x.copy()
    n1 = min(len(x), int(SR * fin))
    n2 = min(len(x), int(SR * fout))
    if n1:
        x[:n1] *= np.linspace(0, 1, n1)
    if n2:
        x[-n2:] *= np.linspace(1, 0, n2) ** 2
    return x


def lowpass(x, hz):
    # simple one-pole x2
    a = np.exp(-2 * np.pi * hz / SR)
    y = np.empty_like(x)
    for _ in range(2):
        s = 0.0
        for i in range(len(x)):
            s = (1 - a) * x[i] + a * s
            y[i] = s
        x = y.copy()
    return y


def loud(x):
    """loudness proxy: RMS of the loudest 50ms window"""
    e, w = env(x, int(SR * 0.05)) if len(x) > SR * 0.05 else (np.array([np.sqrt(np.mean(x ** 2))]), 1)
    return float(e.max()) if len(e) else 0.0


def norm(x, target=0.25):
    """level every file the same (loudest 50ms at -12 dBFS), never above -1 dBFS peak"""
    l = loud(x)
    if l <= 0:
        return x
    x = x * (target / l)
    pk = np.max(np.abs(x))
    if pk > 0.89:
        x = x * (0.89 / pk)
    return x


def write(name, x, q=6):
    path = os.path.join(OUT, name + '.mp3')
    p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', str(q), path], input=x.astype(np.float64).tobytes())
    if p.returncode:
        raise RuntimeError(name)
    return name


BANK = {}   # key -> {f: [...], ...}
SRC = {}    # file -> (pack, original)


def add(key, files, **o):
    b = BANK.setdefault(key, {'f': []})
    b['f'] += files
    b.update(o)


def simple(key, pack, names, out=None, db=-48, fout=0.03, maxlen=None, rate=None, lp=None, **o):
    files = []
    for i, n in enumerate(names):
        x = trim(load(find(pack, n)), db)
        if maxlen:
            x = x[: int(SR * maxlen)]
        if lp:
            x = lowpass(x, lp)
        x = norm(fade(x, fout=fout))
        fn = write(f'{out or key}_{i + 1}', x)
        SRC[fn] = (pack if pack != 'loose' else o.get('pk', pack), n)
        files.append(fn)
    o.pop('pk', None)
    add(key, files, **o)


# ---------------- guns: single shots cut out of the near-distance recordings ----------------
desc = {}
with open(os.path.join(X, P['firearm'], 'Prepared Master Sheet.csv'), encoding='utf-8', errors='ignore') as fh:
    for r in csv.DictReader(fh):
        desc[r['Filename']] = r['Description']


def shots(path, thr_db=-12):
    x = load(path)
    e, w = env(x)
    m = e.max()
    on = []
    last = -1000
    for i in range(4, len(e)):
        if e[i] > m * 10 ** (thr_db / 20) and e[i] > 6 * max(e[max(0, i - 6):i].mean(), 1e-7) and i - last > 16:
            # step back to where it rises above the floor
            j = i
            while j > 0 and e[j - 1] < e[j] and e[j - 1] > m * 0.003:
                j -= 1
            on.append(j * w)
            last = i
    return x, on


def gun(kind, folders, tail, n=4, rate=None, lp=None, near=True, burst=False):
    files = []
    for fd in folders:
        root = os.path.join(X, P['firearm'], fd)
        for f in sorted(os.listdir(root)):
            if not f.endswith('.wav'):
                continue
            d = desc.get(f, '')
            if near and 'near distance' not in d:
                continue
            if not burst and 'gunshots' in d:
                continue
            x, on = shots(os.path.join(root, f))
            for k, a in enumerate(on):
                nxt = on[k + 1] if k + 1 < len(on) else len(x)
                b = min(nxt - int(SR * 0.012), a + int(SR * tail))
                if b - a < SR * min(0.12, tail * 0.6):
                    continue
                seg = x[max(0, a - int(SR * 0.002)): b]
                es, _ = env(seg)
                if len(es) > 12 and es[10:].max() > es.max() * 0.5 and es[10:].argmax() + 10 > es.argmax() + 8:
                    continue
                if lp:
                    seg = lowpass(seg, lp)
                seg = norm(fade(seg, fout=min(0.25, tail * 0.4)), 0.3)
                files.append((seg, fd, f))
    # keep a spread of variants (every k-th) so different guns/files are represented
    if len(files) > n:
        step = len(files) / n
        files = [files[int(i * step)] for i in range(n)]
    out = []
    for i, (seg, fd, f) in enumerate(files):
        fn = write(f'gun_{kind}_{i + 1}', seg)
        SRC[fn] = ('firearm', f'{fd}/{f}')
        out.append(fn)
    add('gun_' + kind, out, wet=0.35)


gun('pistol', ['Walther PPQ', '1911', 'Bersa'], 0.7)
gun('revolver', ['Smith & Wesson 642', 'Ruger Single Six'], 0.9)
gun('smg', ['Carl Gustav M45'], 0.32, n=6, burst=True)
gun('rifle', ['AR-15', 'AK-47'], 0.6)
gun('dmr', ['SKS', 'Marlin 336', 'Model 1894'], 0.8)
gun('sniper', ['1917', 'Arisaka', 'Savage 10 .300 Blackout', 'Tikka'], 1.4)
gun('shotgun', ['Mossberg', 'Nova', 'Model 12'], 1.0)
gun('lmg', ['AK-47'], 0.42, n=6, burst=True)
gun('minigun', ['PPSh'], 0.22, n=6, burst=True)
gun('suppressed', ['Ruger Mark III'], 0.3, lp=1800, near=False)
for k in ('lmg',):
    BANK['gun_lmg']['r'] = [0.88, 0.94]
BANK['gun_minigun']['r'] = [1.08, 1.16]

# ---------------- launchers ----------------
simple('launch_rocket', 'rdsci', ['rocket_01'], maxlen=1.4, fout=0.4)
simple('launch_rail', 'kscifi', ['laserLarge_000', 'laserLarge_002'], r=[0.62, 0.7])

# ---------------- reload / mechanical ----------------
simple('mech_magOut', 'krpg', ['metalLatch'], r=[0.9, 1.1])
simple('mech_magIn', 'krpg', ['metalClick'], r=[0.9, 1.1])
simple('mech_click', 'kui', ['switch1', 'switch3', 'switch5'], maxlen=0.15)
simple('mech_empty', 'kui', ['click1', 'click3'], r=[1.2, 1.3])
simple('mech_switch', 'kui', ['switch7', 'switch9'], maxlen=0.2)
simple('mech_grab', 'krpg', ['cloth2', 'handleSmallLeather'], maxlen=0.3)
simple('mech_shell', 'kimpact', ['impactMetal_light_001', 'impactMetal_light_004'], r=[1.4, 1.6], maxlen=0.2)

# ---------------- movement ----------------
simple('step_stone', 'kimpact', [f'footstep_concrete_00{i}' for i in range(5)])
simple('step_wood', 'kimpact', [f'footstep_wood_00{i}' for i in range(5)])
simple('step_grass', 'kimpact', [f'footstep_grass_00{i}' for i in range(5)], maxlen=0.3)
simple('step_water', 'rd100b', ['sfx100v2_footstep_wet_01', 'sfx100v2_footstep_wet_02', 'sfx100v2_footstep_wet_03'])
simple('step_metal', 'kimpact', ['impactMetal_medium_001', 'impactMetal_medium_002', 'impactMetal_medium_004'], r=[1.1, 1.3])
simple('jump', 'fwa', ['boots-leather-jump-01', 'boots-leather-jump-03'], maxlen=0.35)
simple('land', 'kimpact', [f'impactSoft_heavy_00{i}' for i in range(5)])
simple('land_wood', 'kimpact', [f'impactWood_heavy_00{i}' for i in range(3)])
simple('mantle', 'krpg', ['cloth1', 'cloth3'], maxlen=0.4)

# ---------------- combat ----------------
simple('hit_flesh', 'kimpact', [f'impactPunch_medium_00{i}' for i in range(5)], maxlen=0.3)
simple('hit_shield', 'kimpact', ['impactMetal_heavy_000', 'impactMetal_heavy_002', 'impactMetal_heavy_003'])
simple('shield_break', 'rd100b', ['sfx100v2_glass_02', 'sfx100v2_glass_03', 'sfx100v2_glass_05'])
simple('impact_stone', 'kimpact', [f'impactGeneric_light_00{i}' for i in range(5)])
simple('impact_wood', 'kimpact', [f'impactWood_light_00{i}' for i in range(5)])
simple('impact_metal', 'kimpact', [f'impactMetal_light_00{i}' for i in range(5)], maxlen=0.25)
simple('bounce', 'kimpact', ['impactMetal_light_002', 'impactGeneric_light_001'], maxlen=0.2)

# explosions: a crunchy body over a sub-bass boom, pre-mixed
exps = []
for i in range(5):
    body = trim(load(find('kscifi', f'explosionCrunch_00{i}')))
    sub = trim(load(find('kscifi', f'lowFrequency_explosion_00{i % 2}')))
    n = max(len(body), len(sub))
    m = np.zeros(n)
    m[: len(body)] += norm(body, 0.25)
    m[: len(sub)] += norm(sub, 0.3)
    fn = write(f'explosion_{i + 1}', norm(fade(m, fout=0.3), 0.3))
    SRC[fn] = ('kscifi', f'explosionCrunch_00{i} + lowFrequency_explosion_00{i % 2}')
    exps.append(fn)
add('explosion', exps, wet=0.6)

simple('swing', 'swish', [f'swish-{i}' for i in (1, 3, 5, 7, 9, 11)])
simple('swing_blade', 'sword', [f'sword.{i}' for i in (3, 4, 6)], maxlen=0.6)
simple('melee_slice', 'krpg', ['knifeSlice', 'knifeSlice2', 'chop'])
simple('melee_blunt', 'kimpact', [f'impactPunch_heavy_00{i}' for i in range(5)])
simple('throw', 'swish', ['swish-4', 'swish-8'])
simple('hurt', 'kimpact', ['impactPunch_medium_001', 'impactPunch_medium_003'], maxlen=0.3)

# ---------------- monsters ----------------
simple('mon_growl', 'crea1', ['monster_04', 'monster_06', 'monster_07'])
simple('mon_growl', 'crea2', ['monster_12', 'monster_09'], out='mon_growl_b')
simple('mon_roar', 'crea1', ['roar_01', 'roar_02'])
simple('mon_roar', 'crea2', ['roar_04', 'roar_05', 'roar_06'], out='mon_roar_b')
simple('mon_snarl', 'crea1', ['monster_03', 'troll_02'])
simple('mon_snarl', 'crea2', ['monster_15', 'monster_08', 'grunt_06'], out='mon_snarl_b')
simple('mon_screech', 'crea1', ['scream_01', 'scream_02', 'alien_03'])
simple('mon_screech', 'crea2', ['attack_04'], out='mon_screech_b')
simple('mon_hiss', 'crea1', ['alien_06', 'breath'])
simple('mon_hiss', 'crea2', ['attack_03', 'breath_02'], out='mon_hiss_b')
simple('mon_chitter', 'crea1', ['bug_01', 'bug_02', 'bug_03'])
simple('mon_chitter', 'crea2', ['bug_05', 'bug_07', 'bug_10', 'bug_12'], out='mon_chitter_b')
simple('mon_groan', 'crea1', ['troll_01', 'grunt_01', 'grunt_03'])
simple('mon_groan', 'crea2', ['weird_06', 'weird_08'], out='mon_groan_b')
simple('mon_wail', 'crea1', ['howl'])
simple('mon_wail', 'crea2', ['monster_17', 'monster_19'], out='mon_wail_b')
simple('mon_gurgle', 'crea1', ['burble_01', 'burble_02'])
simple('mon_gurgle', 'crea2', ['slime_02', 'slime_04', 'slime_06'], out='mon_gurgle_b')
simple('mon_buzz', 'crea2', ['bug_06', 'bug_09', 'bug_11'])
simple('mon_die', 'crea2', ['die_01', 'die_02', 'die_03', 'die_04'])
simple('spit', 'crea1', ['spit_01', 'spit_02', 'spit_03'])
simple('attack_wind', 'swish', ['swish-2', 'swish-6'], r=[0.7, 0.8])

# ---------------- magic / elements ----------------
simple('magic', 'loose', [f'magical_{i}' for i in range(1, 7)], pk='magic', fout=0.15)
simple('fire', 'kscifi', ['thrusterFire_000', 'thrusterFire_003'], maxlen=0.7, fout=0.35)
simple('ice', 'rd100', ['glass_01', 'glass_02', 'glass_03'])
simple('break_wood', 'kimpact', [f'impactPlank_medium_00{i}' for i in range(3)])
simple('break_ceramic', 'rd100', ['dishes_01', 'dishes_02', 'dishes_03'])
simple('break_stone', 'rd100b', ['sfx100v2_stones_01', 'sfx100v2_stones_02', 'sfx100v2_stones_03'])
simple('heal', 'loose', ['magical_3'], pk='magic', fout=0.2)

# ---------------- pickups / ui ----------------
simple('coins', 'krpg', ['handleCoins', 'handleCoins2'])
simple('pickup', 'krpg', ['handleSmallLeather2', 'dropLeather'])
simple('ui_hover', 'kui', ['rollover2', 'rollover3'])
simple('ui_click', 'kiface', ['click_001', 'click_002'])
simple('ui_open', 'krpg', ['bookOpen', 'bookFlip3'])
simple('ui_card', 'krpg', ['bookFlip1', 'bookFlip2'], maxlen=0.35)
simple('ui_select', 'kiface', ['confirmation_001', 'confirmation_002'])
simple('ui_error', 'kiface', ['error_004', 'error_006'])
simple('ui_skill', 'kiface', ['select_003', 'select_006'])
simple('ui_ready', 'kiface', ['tick_002'])
simple('ui_deny', 'kiface', ['back_002'])
simple('bell', 'rd100', ['gong_01', 'gong_02'], db=-60, fout=0.4)
simple('shield_up', 'kscifi', ['forceField_000', 'forceField_002'], fout=0.2)
simple('ult_ready', 'kiface', ['maximize_006'])
simple('tick', 'kiface', ['tick_001', 'tick_004'])
simple('chest_pry', 'krpg', ['creak1', 'creak2', 'creak3'], maxlen=0.35)
simple('chest_unlock', 'rd100', ['key_open_01', 'key_open_02'])
simple('ratchet', 'kui', ['click2', 'click4'])
simple('grapple_hit', 'kimpact', ['impactMetal_heavy_001', 'impactMetal_heavy_004'])

# ---------------- ambience ----------------
simple('drip', 'rd100', ['plop_01', 'plop_02'], r=[0.9, 1.5])
simple('thunder', 'rd100b', ['sfx100v2_thunder_01'], db=-60, fout=0.8)
simple('crackle', 'loose', ['fire-1'], pk='firecr', maxlen=0.9, fout=0.3)
simple('lava', 'crea2', ['slime_01', 'slime_03'], r=[0.45, 0.6])
simple('wind', 'loose', ['Wind'], pk='wind', db=-60, fout=0.8)


def loopify(x, xf=1.5):
    """seamless loop: the last xf seconds are crossfaded into the start"""
    n = int(SR * xf)
    a, b = x[:n], x[-n:]
    t = np.linspace(0, 1, n)
    head = a * np.sqrt(t) + b * np.sqrt(1 - t)
    return np.concatenate([head, x[n:-n]])


def bed(name, pack, src, start, secs, gain=0.25, lp=None):
    x = load(find('loose', src) if pack != 'rd100b' and pack != 'rdsci' else find(pack, src))
    x = x[int(SR * start): int(SR * (start + secs))]
    if lp:
        x = lowpass(x, lp)
    rms = np.sqrt(np.mean(x ** 2))
    x = loopify(x * (gain / max(rms, 1e-9) * 0.25))
    pk = np.max(np.abs(x))
    if pk > 0.89:
        x *= 0.89 / pk
    fn = write('amb_' + name, x, q=7)
    SRC[fn] = (pack, src)
    add('amb_' + name, [fn], loop=1)


bed('cave', 'dungamb', 'dungeon_ambient_1_0', 5, 32)
bed('cavern', 'cavern', 'dark_cavern_ambient_002', 10, 32)
bed('deep', 'dungyd', 'dungeon002_0', 20, 32)
bed('water', 'rd100b', 'sfx100v2_loop_water_03', 0, 9.6)
bed('fire', 'fireloop', 'fire', 0, 28)
bed('wind', 'wind', 'Wind', 0, 6.6)
x = load(find('kscifi', 'thrusterFire_001'))
fn = write('loop_flame', loopify(norm(x[: int(SR * 4.9)], 0.25), 0.8), q=7)
SRC[fn] = ('kscifi', 'thrusterFire_001')
add('loop_flame', [fn], loop=1)

# ---------------- levels: matched to the procedural sounds (sounds.html __calibrate), with floors for cues that must stay audible ----------------
CAL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cal.json'), encoding='utf-8'))
for k, b in BANK.items():
    v = CAL.get(k)
    if v is None:
        continue
    if k.startswith('mon_'):
        v = max(v, 0.3)
    elif k.startswith('mech_') or k in ('swing', 'swing_blade', 'throw', 'attack_wind', 'ice', 'heal', 'ui_skill', 'ui_card', 'chest_pry', 'pickup', 'jump'):
        v = max(v, 0.22)
    b['v'] = round(v, 3)

# ---------------- manifest ----------------
files = {}
for fn, (pk, orig) in SRC.items():
    files[fn] = [pk if pk in PACKS else 'loose', orig]
js = "'use strict';\n// Sample bank: built by the sound pipeline from CC0 packs (see README / sounds.html). Keys are looked up by js/audio.js;\n// a key that is missing, switched off in sounds.html or not loaded yet falls back to the procedural sound.\n"
js += 'G.SFXBANK = ' + json.dumps({'packs': PACKS, 'bank': BANK, 'files': files}, ensure_ascii=False, separators=(',', ':')) + ';\n'
with open(os.path.join(REPO, 'js', 'sfxbank.js'), 'w', encoding='utf-8') as fh:
    fh.write(js)
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(len(BANK), 'keys', len(SRC), 'files', round(tot / 1e6, 2), 'MB')
