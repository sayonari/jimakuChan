#!/usr/bin/env python3
# ゆるい lo-fi 風 BGM を合成（numpy のみ）．usage: bgm.py <seconds> <out.wav>
import sys, math, wave, struct
import numpy as np
dur = float(sys.argv[1]); out = sys.argv[2]
sr = 44100; bpm = 84; beat = 60/bpm; bar = beat*4
t = np.arange(int(sr*dur))/sr
def note(f): return f
A=220.0
def midi(n): return 440*2**((n-69)/12)
# コード進行 Am7 - Fmaj7 - Cmaj7 - G  (2小節ずつ)
chords = [[57,60,64,67],[53,57,60,64],[48,52,55,59],[55,59,62,67]]
mix = np.zeros_like(t)
def env_ad(x, a, d):  # attack/decay
    return np.clip(x/a,0,1)*np.exp(-np.maximum(0,x-a)/d)
nbars = int(math.ceil(dur/bar))
for b in range(nbars):
    ch = chords[(b//2)%4]
    t0 = b*bar
    # パッド（三角波っぽい，やわらかく）
    for n in ch:
        f = midi(n)
        seg = (t>=t0)&(t<t0+bar*1.05)
        x = t[seg]-t0
        e = env_ad(x, 0.6, bar*0.9)
        w = 0.5*np.sin(2*np.pi*f*x) + 0.15*np.sin(2*np.pi*2*f*x+0.3) + 0.08*np.sin(2*np.pi*3*f*x)
        # ゆらぎ
        w *= 1+0.03*np.sin(2*np.pi*0.7*x)
        mix[seg] += 0.11*e*w
    # ベース（ルート，1拍目と3拍目）
    for k in [0,2]:
        f = midi(ch[0]-24)
        seg=(t>=t0+k*beat)&(t<t0+(k+1.6)*beat); x=t[seg]-(t0+k*beat)
        mix[seg] += 0.22*env_ad(x,0.02,0.5)*np.sin(2*np.pi*f*x)*(1+0.2*np.sin(2*np.pi*f*x*2))
    # ハイハット（8分）
    for k in range(8):
        seg=(t>=t0+k*beat/2)&(t<t0+k*beat/2+0.06); x=t[seg]-(t0+k*beat/2)
        rng=np.random.default_rng(b*8+k)
        mix[seg] += (0.045 if k%2==0 else 0.03)*np.exp(-x/0.015)*rng.uniform(-1,1,x.size)
    # キック（1拍目・3拍目裏）
    for k in [0,2.5]:
        seg=(t>=t0+k*beat)&(t<t0+k*beat+0.25); x=t[seg]-(t0+k*beat)
        mix[seg] += 0.35*np.exp(-x/0.09)*np.sin(2*np.pi*(55+80*np.exp(-x/0.03))*x)
    # メロディ（軽いアルペジオ，きらきら）
    rng=np.random.default_rng(100+b)
    for k in range(4):
        n = ch[(k*2+ (b%3))%4]+12
        f=midi(n)
        st = t0+k*beat+ (beat/2 if rng.random()<0.4 else 0)
        seg=(t>=st)&(t<st+beat*0.9); x=t[seg]-st
        mix[seg] += 0.07*env_ad(x,0.01,0.35)*(np.sin(2*np.pi*f*x)+0.3*np.sin(2*np.pi*2*f*x))
# フェードイン/アウト
fade = int(sr*1.5)
mix[:fade] *= np.linspace(0,1,fade); mix[-fade:] *= np.linspace(1,0,fade)
# ローパス風（移動平均）でこもらせる
k = np.ones(6)/6; mix = np.convolve(mix, k, mode='same')
mix = np.tanh(mix*1.4)*0.9
pcm = (mix*32767).astype('<i2')
with wave.open(out,'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
print('bgm', out, dur)
