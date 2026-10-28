"""Synthesizes the soundtrack for the Blockpad launch cut (brag-output/work/music.wav).
Everything is generated on one 120 BPM grid counted from the first sample, so drums, bass, arpeggio and the sound effects on the cuts never drift:
    python tools/make-brag-music.py <out.wav>
Structure (24 s = 48 beats): 0-2 s riser + a 4-note hook melody into the reveal, 2-24 s four-on-the-floor groove in A minor (Am F C G) with the
pads/arpeggio/melody side-chained to the kick for a pumping, "produced" feel, cuts at 2 / 5.5 / 9.5 / 13.5 / 17.5 / 20 s, a click at 11.3 s (the Board tab click)."""
import sys
import numpy as np
from scipy.signal import lfilter, butter, sosfilt
from scipy.io import wavfile

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM
DUR = 24.0
N = int(SR * DUR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(7)

# two buses: BED (pads, arpeggio, melody) gets side-chain-ducked under every kick; PUNCH (drums, bass, fx) does not
bedL = np.zeros(N); bedR = np.zeros(N)
pL = np.zeros(N); pR = np.zeros(N)

def add(sig, start, gain=1.0, pan=0.0, bus='punch'):
    """mix a mono signal in at `start` seconds; pan -1..1; bus 'bed' (ducked) or 'punch' (not ducked)"""
    i = int(round(start * SR))
    if i >= N: return
    seg = sig[: N - i]
    gl = gain * np.cos((pan + 1) * np.pi / 4); gr = gain * np.sin((pan + 1) * np.pi / 4)
    L, R = (bedL, bedR) if bus == 'bed' else (pL, pR)
    L[i:i + len(seg)] += seg * gl; R[i:i + len(seg)] += seg * gr

def lowpass(x, fc, order=2): return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)
def highpass(x, fc, order=2): return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)
def bandpass(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def hz(note): return 440.0 * 2 ** ((note - 69) / 12)

def kick(length=0.45):
    t = np.arange(int(SR * length)) / SR
    ph = 2 * np.pi * (46 * t + (115 / 30) * (1 - np.exp(-30 * t)))
    return np.tanh(1.4 * np.sin(ph)) * np.exp(-t * 8.5)

def hat(length=0.06, open_=False):
    t = np.arange(int(SR * (0.22 if open_ else length))) / SR
    return highpass(rng.standard_normal(len(t)), 7000) * np.exp(-t * (18 if open_ else 70))

def clap(length=0.25):
    t = np.arange(int(SR * length)) / SR
    n = bandpass(rng.standard_normal(len(t)), 1100, 3800)
    env = np.exp(-t * 22) + 0.6 * np.exp(-((t - 0.012) * 90) ** 2)
    return n * env

def saw(f, t): return 2 * ((f * t) % 1.0) - 1

def bass_note(f, length):
    t = np.arange(int(SR * length)) / SR
    x = 0.65 * np.sin(2 * np.pi * f * t) + 0.35 * saw(f, t)
    x = lowpass(x, 420)
    env = np.minimum(1, t / 0.006) * np.exp(-t * 3.2) * np.minimum(1, (length - t) / 0.03)
    return x * env

def pluck(f, length=0.5):
    t = np.arange(int(SR * length)) / SR
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 9) + 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 14)
    return x * np.minimum(1, t / 0.003) * np.exp(-t * 9)

def pad_chord(notes, length):
    t = np.arange(int(SR * length)) / SR
    outL = np.zeros_like(t); outR = np.zeros_like(t)
    for n in notes:
        for det, side in ((-0.07, 0), (0.0, 2), (0.07, 1)):
            f = hz(n) * 2 ** (det / 12)
            x = saw(f, t + rng.random())
            if side == 0: outL += x
            elif side == 1: outR += x
            else: outL += 0.7 * x; outR += 0.7 * x
    outL = lowpass(outL, 1500); outR = lowpass(outR, 1500)
    env = np.minimum(1, t / 0.5) * np.minimum(1, (length - t) / 0.4)
    return outL * env, outR * env

def riser(length):
    t = np.arange(int(SR * length)) / SR
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    steps = 24
    for k in range(steps):
        a, b = int(len(t) * k / steps), int(len(t) * (k + 1) / steps)
        fc = 300 * (14 ** (k / (steps - 1)))
        out[a:b] = bandpass(n[a:b], fc * 0.7, min(fc * 1.4, 18000))
    return out * (t / length) ** 2.2

def impact():
    t = np.arange(int(SR * 1.4)) / SR
    boom = np.sin(2 * np.pi * (38 * t + (80 / 9) * (1 - np.exp(-9 * t)))) * np.exp(-t * 3.2)
    air = lowpass(rng.standard_normal(len(t)), 3500) * np.exp(-t * 6) * 0.22
    return np.tanh(1.2 * boom) + air

def whoosh(length=0.32):
    t = np.arange(int(SR * length)) / SR
    n = rng.standard_normal(len(t)); out = np.zeros_like(t); steps = 16
    for k in range(steps):
        a, b = int(len(t) * k / steps), int(len(t) * (k + 1) / steps)
        fc = 500 * (9 ** (k / (steps - 1)))
        out[a:b] = bandpass(n[a:b], fc * 0.6, min(fc * 1.6, 16000))
    return out * np.sin(np.pi * np.clip(t / length, 0, 1) ** 0.8) ** 2

def tick():
    t = np.arange(int(SR * 0.09)) / SR
    return (np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) + 0.4 * np.sin(2 * np.pi * 3400 * t) * np.exp(-t * 130))

def shaker(length=0.07):
    t = np.arange(int(SR * length)) / SR
    return bandpass(rng.standard_normal(len(t)), 4500, 11000) * np.exp(-t * 55)

def lead(f, length=0.85):
    """the hook melody voice: warmer and rounder than the arpeggio's pluck, with a slow vibrato so it sits as a tune, not a blip"""
    t = np.arange(int(SR * length)) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t)
    x = 0.6 * np.sin(2 * np.pi * f * vib * t) + 0.3 * np.sin(2 * np.pi * 2 * f * vib * t) * np.exp(-t * 3) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 6)
    env = np.minimum(1, t / 0.02) * np.exp(-t * 2.1)
    return x * env

# ---- the groove ----
CHORDS = [  # (root midi for bass, chord notes for pad, arpeggio notes)  Am F C G, 4 beats each bar, two bars per chord
    (45, [57, 60, 64], [69, 72, 76, 81]),
    (41, [53, 57, 60], [65, 69, 72, 77]),
    (48, [55, 60, 64], [67, 72, 76, 79]),
    (43, [55, 59, 62], [67, 71, 74, 79]),
]
total_beats = int(DUR / BEAT)           # 48
GROOVE_START = 2.0                       # the reveal: drums and bass come in
kk = kick(); hh = hat(); ho = hat(open_=True); cl = clap()
kick_times = []

for b in range(total_beats):
    tb = b * BEAT
    chord = CHORDS[(b // 8) % 4]          # 8 beats (2 bars) per chord
    # pad: one chord per 8 beats, wide stereo, present from the first second (ducked bus: breathes under every kick)
    if b % 8 == 0:
        pl, pr = pad_chord(chord[1], 8 * BEAT + 0.3)
        add(pl, tb, 0.062, -1, bus='bed'); add(pr, tb, 0.062, 1, bus='bed')
    # arpeggio: 8th notes, quiet in the hook, full after the reveal
    for e in range(2):
        te = tb + e * BEAT / 2
        step = (b * 2 + e)
        note = chord[2][[0, 1, 2, 3, 2, 1, 3, 2][step % 8]]
        g = 0.05 if te < GROOVE_START else 0.085
        add(pluck(hz(note)), te, g, pan=-0.35 if step % 2 == 0 else 0.35, bus='bed')
    if tb >= GROOVE_START and tb < DUR - 2 * BEAT:
        add(kk, tb, 0.62); kick_times.append(tb)
        add(hat(), tb + BEAT / 2, 0.11 if b % 2 == 0 else 0.09, pan=0.2)
        if b % 2 == 1: add(cl, tb, 0.2, pan=-0.05)                  # clap on 2 and 4
        if b % 4 == 3: add(ho, tb + BEAT / 2, 0.1, pan=0.2)
        for qi, off in enumerate((0.25, 0.75)):                     # a light shaker on the off-16ths for groove texture
            add(shaker(), tb + off * BEAT, 0.035, pan=0.3 if qi == 0 else -0.3)
        # bass: root on the beat and the "and" of 3, an octave up on the "and" of 4 (locked to the kick: not ducked)
        root = hz(chord[0])
        add(bass_note(root, BEAT * 0.9), tb, 0.34)
        if b % 4 == 2: add(bass_note(root * 2, BEAT * 0.45), tb + BEAT / 2, 0.2)
        if b % 4 == 3: add(bass_note(root, BEAT * 0.45), tb + BEAT / 2, 0.24)

# ---- the hook: a riser plus a plain 4-note motif (A C E A, one per beat) so the opening has a tune, not just noise ----
add(riser(GROOVE_START), 0, 0.2)
for i, note in enumerate([69, 72, 76, 69]):
    add(lead(hz(note), BEAT * 1.6), i * BEAT, 0.16, pan=0.0, bus='bed')
# ---- sound effects on the cuts (all on the beat grid) ----
cuts = [2.0, 5.5, 9.5, 13.5, 17.5, 20.0]
for c in cuts:
    add(impact(), c, 0.45 if c in (2.0, 20.0) else 0.28)
    if c > 2.0: add(whoosh(), c - 0.3, 0.14, pan=0.0)
add(tick(), 11.3, 0.22)                                              # the Board tab click
# ---- ending: a final chord ring-out on the last bar, fade ----
fl, fr = pad_chord([57, 60, 64, 69], 3.0)
add(fl, 21.0, 0.09, -1, bus='bed'); add(fr, 21.0, 0.09, 1, bus='bed')

# ---- side-chain: duck the bed (pads/arpeggio/melody) under every kick, classic pumping compression, so the drop breathes ----
duck = np.ones(N)
for kt in kick_times:
    i0 = int(round(kt * SR)); length = min(int(0.16 * SR), N - i0)
    if length <= 0: continue
    tt = np.arange(length) / SR
    duck[i0:i0 + length] = np.minimum(duck[i0:i0 + length], 1 - 0.38 * np.exp(-tt / 0.05))
L = bedL * duck + pL; R = bedR * duck + pR

# ---- a little space: dotted-8th stereo echo on the arpeggio band, then a soft limiter and the final fade ----
def echo(x, delay, fb, mix):
    d = int(delay * SR); y = x.copy()
    for k in range(1, 4):
        y[d * k:] += x[:-d * k] * (fb ** k) if d * k < len(x) else 0
    return x * (1 - mix) + y * mix

L2 = echo(highpass(L, 120), 0.375, 0.42, 0.18); R2 = echo(highpass(R, 120), 0.375 * 1.0, 0.42, 0.18)
R2 = np.roll(R2, int(0.011 * SR))                                    # tiny Haas offset for width
peak = max(np.abs(L2).max(), np.abs(R2).max())
L2 = np.tanh(L2 / peak * 1.5) / np.tanh(1.5); R2 = np.tanh(R2 / peak * 1.5) / np.tanh(1.5)
fade = np.clip((DUR - t_all) / 0.9, 0, 1) ** 1.5
fade_in = np.clip(t_all / 0.08, 0, 1)
out = np.stack([L2 * fade * fade_in, R2 * fade * fade_in], axis=1) * 0.89
wavfile.write(sys.argv[1], SR, (out * 32767).astype(np.int16))
print('wrote', sys.argv[1], round(DUR, 1), 's')
