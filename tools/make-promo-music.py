"""Synthesizes the music BED (no sound effects baked in — those are now real, cue-placed sounds mixed in separately by
opus-sound-layer's mix.py, which also handles the ducking) for the 54 s Blockpad walkthrough:
    python tools/make-promo-music.py <out.wav>
120 BPM, A minor (Am F C G, one chord per 4 s / 8 beats, cycling to fill 54 s), side-chain-ducked pads/arpeggio/melody
under the kick for a pumping, produced feel, the 4-note hook motif from the launch cut doubling as the main melody's
opening phrase, a 2 s pickup before the beat enters (so the cold open of the video has room to breathe before the
groove locks in), a final chord ring-out with a fade on the last bars."""
import sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
BPM = 120.0
BEAT = 60.0 / BPM
DUR = 54.0
N = int(SR * DUR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(11)

bedL = np.zeros(N); bedR = np.zeros(N)
pL = np.zeros(N); pR = np.zeros(N)

def add(sig, start, gain=1.0, pan=0.0, bus='punch'):
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
def saw(f, t): return 2 * ((f * t) % 1.0) - 1

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

def shaker(length=0.07):
    t = np.arange(int(SR * length)) / SR
    return bandpass(rng.standard_normal(len(t)), 4500, 11000) * np.exp(-t * 55)

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

def lead(f, length=0.85):
    t = np.arange(int(SR * length)) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t)
    x = 0.6 * np.sin(2 * np.pi * f * vib * t) + 0.3 * np.sin(2 * np.pi * 2 * f * vib * t) * np.exp(-t * 3) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 6)
    env = np.minimum(1, t / 0.02) * np.exp(-t * 2.1)
    return x * env

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

CHORDS = [
    (45, [57, 60, 64], [69, 72, 76, 81]),   # Am
    (41, [53, 57, 60], [65, 69, 72, 77]),   # F
    (48, [55, 60, 64], [67, 72, 76, 79]),   # C
    (43, [55, 59, 62], [67, 71, 74, 79]),   # G
]
GROOVE_START = 2.0                          # the cold open (hero hit + riser) gets room before the beat locks in
total_beats = int(DUR / BEAT)
kk = kick(); kick_times = []

for b in range(total_beats):
    tb = b * BEAT
    if tb >= DUR - 2 * BEAT: break
    chord = CHORDS[(b // 8) % len(CHORDS)]
    if b % 8 == 0:
        pl, pr = pad_chord(chord[1], 8 * BEAT + 0.3)
        add(pl, tb, 0.062, -1, bus='bed'); add(pr, tb, 0.062, 1, bus='bed')
    for e in range(2):
        te = tb + e * BEAT / 2
        step = (b * 2 + e)
        note = chord[2][[0, 1, 2, 3, 2, 1, 3, 2][step % 8]]
        g = 0.05 if te < GROOVE_START else 0.08
        add(pluck(hz(note)), te, g, pan=-0.35 if step % 2 == 0 else 0.35, bus='bed')
    if tb >= GROOVE_START:
        add(kk, tb, 0.6); kick_times.append(tb)
        add(hat(), tb + BEAT / 2, 0.11 if b % 2 == 0 else 0.09, pan=0.2)
        if b % 2 == 1: add(clap(), tb, 0.19, pan=-0.05)
        if b % 4 == 3: add(hat(open_=True), tb + BEAT / 2, 0.1, pan=0.2)
        for qi, off in enumerate((0.25, 0.75)):
            add(shaker(), tb + off * BEAT, 0.03, pan=0.3 if qi == 0 else -0.3)
        root = hz(chord[0])
        add(bass_note(root, BEAT * 0.9), tb, 0.33)
        if b % 4 == 2: add(bass_note(root * 2, BEAT * 0.45), tb + BEAT / 2, 0.19)
        if b % 4 == 3: add(bass_note(root, BEAT * 0.45), tb + BEAT / 2, 0.23)

# the launch cut's 4-note hook motif, doubling as this film's opening melodic phrase (sits over the cold open)
for i, note in enumerate([69, 72, 76, 69]):
    add(lead(hz(note), BEAT * 1.6), i * BEAT, 0.14, pan=0.0, bus='bed')

# final chord ring-out, ducked by the last kicks then left to ring into the fade
fl, fr = pad_chord([57, 60, 64, 69], 3.2)
add(fl, DUR - 3.2, 0.085, -1, bus='bed'); add(fr, DUR - 3.2, 0.085, 1, bus='bed')

duck = np.ones(N)
for kt in kick_times:
    i0 = int(round(kt * SR)); length = min(int(0.16 * SR), N - i0)
    if length <= 0: continue
    tt = np.arange(length) / SR
    duck[i0:i0 + length] = np.minimum(duck[i0:i0 + length], 1 - 0.34 * np.exp(-tt / 0.05))
L = bedL * duck + pL; R = bedR * duck + pR

def echo(x, delay, fb, mix):
    """an echo SEND, not a full-mix filter: the dry signal keeps its full range (its bass included);
    only the repeats themselves are thinned (classic "the echo gets smaller and duller"), fixing an
    earlier version that ran the whole mix through a 120 Hz high-pass and lost the sub-bass entirely"""
    d = int(delay * SR); y = x.copy(); tap = highpass(x, 120)
    for k in range(1, 4):
        y[d * k:] += tap[:-d * k] * (fb ** k) if d * k < len(x) else 0
    return x * (1 - mix) + y * mix

L2 = echo(L, 0.375, 0.4, 0.17); R2 = echo(R, 0.375, 0.4, 0.17)
# (no Haas offset here: a hard ~11ms L/R delay measured too wide to fold to mono cleanly; stereo width
# now comes only from the pads' own detuned L/R voicing, which keeps the low end centred and mono-safe)
peak = max(np.abs(L2).max(), np.abs(R2).max())
L2 = np.tanh(L2 / peak * 1.5) / np.tanh(1.5); R2 = np.tanh(R2 / peak * 1.5) / np.tanh(1.5)
fade = np.clip((DUR - t_all) / 1.1, 0, 1) ** 1.5
fade_in = np.clip(t_all / 0.1, 0, 1)
out = np.stack([L2 * fade * fade_in, R2 * fade * fade_in], axis=1) * 0.86
wavfile.write(sys.argv[1], SR, (out * 32767).astype(np.int16))
print('wrote', sys.argv[1], round(DUR, 1), 's')
