import subprocess, sys, os, csv, numpy as np

SR = 22050
EXT = ('.ogg', '.wav', '.mp3', '.flac')


def decode(path, sr=SR):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


def env(x, win):
    n = len(x) // win
    if n == 0:
        return np.array([np.sqrt(np.mean(x ** 2)) if len(x) else 0.0])
    return np.sqrt(np.mean(x[: n * win].reshape(n, win) ** 2, axis=1))


def db(v):
    return 20 * np.log10(max(v, 1e-9))


def stats(path):
    x = decode(path)
    if len(x) == 0:
        return None
    dur = len(x) / SR
    pk = float(np.max(np.abs(x)))
    rms = float(np.sqrt(np.mean(x ** 2)))
    e = env(x, 220)  # 10ms frames
    em = e.max() if len(e) else 0
    on = int(np.argmax(e > em * 0.1)) * 0.01 if em > 0 else 0
    above = np.where(e > em * 10 ** (-40 / 20))[0]
    eff = (above[-1] - above[0] + 1) * 0.01 if len(above) else 0
    # transient count: frames where envelope jumps x4 over the previous 50ms and is > -20dB of max
    tr = 0
    last = -100
    for i in range(5, len(e)):
        if e[i] > em * 0.1 and e[i] > 4 * max(e[i - 5:i].mean(), 1e-6) and i - last > 8:
            tr += 1
            last = i
    sp = np.abs(np.fft.rfft(x[: min(len(x), SR * 4)]))
    fr = np.fft.rfftfreq(min(len(x), SR * 4), 1 / SR)
    cen = float((sp * fr).sum() / max(sp.sum(), 1e-9))
    clip = float(np.mean(np.abs(x) > 0.99))
    return dict(dur=round(dur, 3), peak=round(db(pk), 1), rms=round(db(rms), 1), onset=round(on, 2), eff=round(eff, 2), trans=tr, cent=int(cen), clip=round(clip, 4))


def main(root, out):
    rows = []
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if f.lower().endswith(EXT) and not f.startswith('._'):
                p = os.path.join(dp, f)
                s = stats(p)
                if s:
                    rows.append(dict(path=os.path.relpath(p, root).replace('\\', '/'), **s))
    rows.sort(key=lambda r: r['path'])
    with open(out, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(len(rows))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
