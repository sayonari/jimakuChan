#!/usr/bin/env python3
# ドパガキ仕様 BGM（BPM170・4つ打ち＋シンセリード＋ベース）＋効果音を numpy だけで合成
# usage: bgm_hype.py <total_sec> <out_bgm.wav> <out_sfx.wav> <events.json>
#   events.json: {"bpm":170, "breakBeat":48, "dropBeat":52, "endBeat":104, "sfx":[{"t":秒,"k":"don|shu|pi|crash"}]}
import sys, json, math, wave
import numpy as np
total = float(sys.argv[1]); out_bgm = sys.argv[2]; out_sfx = sys.argv[3]
ev = json.load(open(sys.argv[4]))
sr = 44100; bpm = ev['bpm']; B = 60 / bpm
N = int(sr * total)
t_all = np.arange(N) / sr
BRK, DROP, END = ev['breakBeat'], ev['dropBeat'], ev['endBeat']
rng = np.random.default_rng(7)
def midi(n): return 440 * 2 ** ((n - 69) / 12)

def add(buf, start, sig):
    i = int(start * sr)
    if i >= N or i + len(sig) <= 0: return
    j = min(N, i + len(sig))
    buf[i:j] += sig[:j - i]

def saw(f, x, K=None):
    K = K or max(2, min(14, int(7000 / f)))
    s = np.zeros_like(x)
    for k in range(1, K + 1): s += np.sin(2 * np.pi * k * f * x) / k
    return s * (2 / np.pi)

def sq(f, x, K=None):
    K = K or max(2, min(12, int(6000 / f)))
    s = np.zeros_like(x)
    for k in range(1, K + 1, 2): s += np.sin(2 * np.pi * k * f * x) / k
    return s * (4 / np.pi)

def lp(x, n):  # 移動平均ローパス
    k = np.ones(n) / n
    return np.convolve(x, k, mode='same')

def ad(x, a, d): return np.clip(x / a, 0, 1) * np.exp(-np.maximum(0, x - a) / d)

# ---- 楽器 ----
def kick(len_s=0.32):
    x = np.arange(int(sr * len_s)) / sr
    ph = 2 * np.pi * np.cumsum(48 + 130 * np.exp(-x / 0.035)) / sr
    return np.tanh(1.6 * np.sin(ph)) * np.exp(-x / 0.16) * 0.9 + 0.25 * np.exp(-x / 0.006) * rng.uniform(-1, 1, x.size)
def clap():
    x = np.arange(int(sr * 0.22)) / sr
    n = rng.uniform(-1, 1, x.size)
    n = n - lp(n, 12)
    e = np.exp(-x / 0.05) + 0.7 * np.exp(-np.maximum(0, x - 0.012) / 0.03) * (x > 0.012)
    return n * e * 0.5
def hat(open_=False):
    x = np.arange(int(sr * (0.18 if open_ else 0.05))) / sr
    n = rng.uniform(-1, 1, x.size); n = n - lp(n, 4)
    return n * np.exp(-x / (0.07 if open_ else 0.012)) * (0.22 if open_ else 0.28)
def lead_note(f, dur, vel=1.0):
    x = np.arange(int(sr * (dur + 0.08))) / sr
    s = saw(f, x) + 0.8 * saw(f * 1.006, x) + 0.8 * saw(f * 0.994, x) + 0.4 * sq(f * 2, x, 5) * 0.5
    e = np.clip(x / 0.004, 0, 1) * np.where(x < dur, 1.0, np.exp(-(x - dur) / 0.03)) * (0.55 + 0.45 * np.exp(-x / 0.12))
    return s * e * vel * 0.17
def bass_note(f, dur):
    x = np.arange(int(sr * dur)) / sr
    s = saw(f, x, 6) * 0.8 + np.sin(2 * np.pi * f * x) * 0.7
    s = lp(s, 4)
    e = np.clip(x / 0.004, 0, 1) * np.where(x < dur - 0.02, 1, np.linspace(1, 0, np.sum(x >= dur - 0.02) or 1)[:np.sum(x >= dur - 0.02)] if False else 1)
    e = np.clip(x / 0.004, 0, 1) * np.clip((dur - x) / 0.03, 0, 1)
    return s * e * 0.36
def pad_chord(notes, dur):
    x = np.arange(int(sr * dur)) / sr
    s = np.zeros_like(x)
    for n in notes:
        f = midi(n); s += saw(f, x, 8) + saw(f * 1.004, x, 8)
    e = np.clip(x / 0.02, 0, 1) * np.clip((dur - x) / 0.05, 0, 1)
    return lp(s * e, 6) * 0.045

# ---- 構成 ----
prog = [  # (ルート, 和音, フック)
    (36, [60, 64, 67], [76, 76, 79, 76, 72, 76, 79, 84]),   # C
    (43, [59, 62, 67], [74, 74, 79, 74, 71, 74, 79, 83]),   # G
    (45, [60, 64, 69], [76, 76, 81, 76, 72, 76, 81, 84]),   # Am
    (41, [60, 65, 69], [77, 77, 81, 77, 72, 77, 81, 84]),   # F
]
nbeats = int(math.ceil(total / B))
bgm = np.zeros(N); kick_t = []
kk, cl, hh, hho = kick(), clap(), hat(), hat(True)
drums = np.zeros(N); bass = np.zeros(N); lead = np.zeros(N); pad = np.zeros(N); riser = np.zeros(N)
end_t = END * B
for b in range(0, min(nbeats, END + 1)):
    bar = b // 4; bi = b % 4
    t0 = b * B
    in_break = BRK <= b < DROP
    last_bar = b >= END - 4
    root, ch, hook = prog[bar % 4]
    if not in_break:
        add(drums, t0, kk); kick_t.append(t0)
        add(drums, t0 + B / 2, hho * 0.9)
        if bi in (1, 3): add(drums, t0, cl * 0.9)
        add(drums, t0 + B / 4, hh * 0.6); add(drums, t0 + 3 * B / 4, hh * 0.6)
        # ベース：裏拍の 8 分（サイドチェイン風に 4 つ打ちの裏で鳴る）
        for h in (0.5,):
            if not last_bar or b < END:
                add(bass, t0 + h * B, bass_note(midi(root), B * 0.42))
        add(bass, t0 + 0.25 * B, bass_note(midi(root) * 2, B * 0.14)) if bi in (1, 3) else None
    else:
        # ブレイクダウン：キック抜き．スネアロール（加速）
        k = b - BRK
        div = [1, 2, 4, 4][k]
        for s in range(div):
            add(drums, t0 + s * B / div, cl * (0.35 + 0.15 * k))
        add(bass, t0, bass_note(midi(root + 12), B * 0.9) * 0.0)
    # パッド
    if not in_break or True:
        if bi == 0:
            add(pad, t0, pad_chord(ch, B * 4 * (1.0 if not in_break else 1.0)))
    # リード（8 分のフック）
    if not in_break and not last_bar:
        for s in range(8):
            n = hook[s]
            if (b < 4 and False): continue
            add(lead, t0 + s * B / 2, lead_note(midi(n), B * 0.45, 1.0 if s % 2 == 0 else 0.8)) if s < 2 else None
    # 8 分をスキップしないため上の s<2 を使わず，下で拍ごとに 2 音ずつ配置
    if not in_break and not last_bar:
        for s in range(2):
            n = hook[bi * 2 + s]
            add(lead, t0 + s * B / 2, lead_note(midi(n), B * 0.42, 1.0 if s == 0 else 0.85)) if bi * 2 + s >= 2 or True else None
    if in_break:
        # 上昇ライン（ため）
        add(lead, t0, lead_note(midi(72 + (b - BRK) * 3), B * 0.95, 0.9))
        add(lead, t0 + B / 2, lead_note(midi(79 + (b - BRK) * 3), B * 0.4, 0.7))
    # 最終小節：ジャーン（C メジャー伸ばし）
    if b == END - 4:
        for n in (72, 76, 79, 84): add(lead, t0, lead_note(midi(n), B * 3.0, 0.9))
        for n in (48, 60): add(bass, t0, bass_note(midi(n), B * 3.0))
        add(drums, t0, kk)
# 最終小節の 4 拍目で短く止めて，END 拍にフィナーレ
add(drums, end_t, kk)
for n in (60, 64, 67, 72, 76): add(lead, end_t, lead_note(midi(n), B * 2.0, 0.9))

# ライザー（ブレイク中）：ノイズ＋上昇サイン
br0, br1 = BRK * B, DROP * B
i0, i1 = int(br0 * sr), int(br1 * sr)
x = np.arange(i1 - i0) / sr; u = x / (br1 - br0)
nz = rng.uniform(-1, 1, x.size); nz = nz - lp(nz, 3)
riser[i0:i1] += nz * (u ** 2) * 0.25
riser[i0:i1] += np.sin(2 * np.pi * np.cumsum(200 + 1800 * u ** 2) / sr) * (u ** 1.5) * 0.12
# 落ちた瞬間のクラッシュ
cr = rng.uniform(-1, 1, int(sr * 1.2)); cr = cr - lp(cr, 3)
add(riser, br1, cr * np.exp(-np.arange(cr.size) / sr / 0.35) * 0.35)
add(riser, 0.0, cr * np.exp(-np.arange(cr.size) / sr / 0.35) * 0.25)

# サイドチェイン風ダッキング（キックごとに他を凹ます）
duck = np.ones(N)
for kt in kick_t:
    i = int(kt * sr); L = int(0.22 * sr)
    if i >= N: continue
    seg = min(L, N - i)
    xx = np.arange(seg) / sr
    duck[i:i + seg] = np.minimum(duck[i:i + seg], 1 - 0.65 * np.exp(-xx / 0.07))
mix = drums * 0.95 + (bass * 1.0 + lead * 0.9 + pad * 1.0) * duck + riser
# 全体の長さに合わせたフェードアウト（最後の 0.4 秒）と先頭のクリック防止
fo = int(sr * 0.35); mix[-fo:] *= np.linspace(1, 0, fo)
mix[:64] *= np.linspace(0, 1, 64)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
pk = np.max(np.abs(mix)); mix = mix / pk * 0.80   # クリップしない
def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
write(out_bgm, mix)

# ---- 効果音 ----
sfx = np.zeros(N)
def don():
    x = np.arange(int(sr * 0.5)) / sr
    ph = 2 * np.pi * np.cumsum(38 + 160 * np.exp(-x / 0.05)) / sr
    return (np.sin(ph) * np.exp(-x / 0.18) + 0.5 * rng.uniform(-1, 1, x.size) * np.exp(-x / 0.02)) * 0.8
def shu(len_s=0.28):
    x = np.arange(int(sr * len_s)) / sr; u = x / len_s
    n = rng.uniform(-1, 1, x.size)
    # 上昇する帯域ノイズ（ローパスの窓を狭めていく）
    out = np.zeros_like(n)
    for w in (24, 10, 4):
        out += (n - lp(n, w)) * (1.0 if w == 4 else 0.5)
    return out * (u ** 2) * (1 - u ** 8) * 0.30
def pi_():
    x = np.arange(int(sr * 0.35)) / sr
    return (np.sin(2 * np.pi * midi(88) * x) + 0.5 * np.sin(2 * np.pi * midi(95) * x)) * ad(x, 0.002, 0.12) * 0.28
for e in ev['sfx']:
    k, t = e['k'], e['t']
    if k == 'don': add(sfx, t, don() * e.get('v', 1.0))
    elif k == 'shu': add(sfx, t - 0.28, shu())
    elif k == 'pi': add(sfx, t, pi_())
    elif k == 'crash': add(sfx, t, cr * np.exp(-np.arange(cr.size) / sr / 0.4) * 0.35)
pk = np.max(np.abs(sfx)) or 1
sfx = np.tanh(sfx * 1.2) * 0.75
write(out_sfx, sfx)
print('bgm_hype', out_bgm, out_sfx, round(total, 2), 'peak bgm', round(float(np.max(np.abs(mix))), 3))
