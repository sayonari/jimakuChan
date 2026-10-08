#!/usr/bin/env node
/*
 * jimakuChan v2 宣伝 PV（Twitter/X 用・ドパガキ仕様）を全自動生成する
 *   node build_hype.mjs [--quick] [--recapture]    (--quick: 12fps のプレビュー，--recapture: 実画面を撮り直す)
 * 出力: build/jimakuChan_v2_hype.mp4 (1280x720, 30fps, H.264 yuv420p + AAC)，build/contact_hype.png
 * 手順: ナレーション(edge-tts, 速め・高め) → 実画面キャプチャ(capture_hype.mjs) → カット割り(170BPM の拍に同期)
 *      → BGM＋効果音合成(bgm_hype.py) → フレーム描画(video_hype.html) → ffmpeg で動画化・音声ミックス
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import { buildNarration } from './narration.mjs';

const QUICK = process.argv.includes('--quick');
const REMIX = process.argv.includes('--remix');   // 既存の build/hype_noaudio.mp4 を使い，音声ミックスと書き出しだけやり直す
const FPS = QUICK ? 12 : 30;
const W = 1280, H = 720;
const BPM = 170, B = 60 / BPM;
const OUT = 'build/jimakuChan_v2_hype.mp4';
const log = (...a) => console.log('[hype]', ...a);
fs.mkdirSync('build', { recursive: true });

// ---- 1) 実画面キャプチャ（無ければ／--recapture）----
if (process.argv.includes('--recapture') || !fs.existsSync('build/hype/meta.json')) { log('実画面キャプチャ…'); execSync('node capture_hype.mjs', { stdio: 'inherit' }); }
const meta = JSON.parse(fs.readFileSync('build/hype/meta.json', 'utf8'));

// ---- 2) ナレーション（拍位置 beat で配置）．画面の文字は「，．」，読み上げ用は「、。」----
const LINES = [
  { id: 'n1', beat: 0,  text: '音声認識字幕ちゃん！v2 大型アップデート！', tts: '音声認識字幕ちゃん！ブイツー、大型アップデート！' },
  { id: 'n2', beat: 12, text: 'マイク，選べます！！', tts: 'マイク、選べます！' },
  { id: 'n3', beat: 21, text: '好きなマイクを，クリックで選ぶだけ！', tts: '好きなマイクを、クリックで選ぶだけ！' },
  { id: 'n4', beat: 38, text: '音が来てるか，一目でわかる！', tts: '音が来てるか、一目でわかる！' },
  { id: 'n5', beat: 48.2, text: '叫ぶと……', tts: 'さけぶと…' },
  { id: 'n6', beat: 52, text: '字幕が，でかくなる！！', tts: '字幕が、でっかくなる！' },
  { id: 'n7', beat: 62, text: 'コラボ相手の声も，字幕に！', tts: 'コラボ相手の声も、字幕に！' },
  { id: 'n8', beat: 72, text: '音量ブースト！', tts: '音量ブースト！' },
  { id: 'n9', beat: 76, text: 'ノイズゲート！', tts: 'ノイズゲート！' },
  { id: 'n10', beat: 80, text: 'ミュートも！', tts: 'ミュートも！' },
  { id: 'n11', beat: 84, text: 'Chrome を，最新版にして！', tts: 'クローム を、最新版にして！' },
  { id: 'n12', beat: 90, text: 'v2 へ，GO！！', tts: 'ブイツーへ、ゴー！' },
  { id: 'n13', beat: 96.3, text: '無料！インストール不要！', tts: '無料！インストール不要！' },
];
log('ナレーション生成…');
const narr = buildNarration(LINES, { prefix: 'hype_', rate: '+20%', pitch: '+10Hz', trim: true });
const nar = narr.map(n => ({ start: n.beat * B + 0.04, dur: n.dur, text: n.text, env: n.env, wav: n.wav }));
nar.forEach((n, i) => { if (nar[i + 1] && n.start + n.dur > nar[i + 1].start + 0.05) log(`警告: ${LINES[i].id} (${n.dur.toFixed(2)}s) が次の台詞に重なる`); });

// ---- 3) カット割り（拍単位．0.7〜1.5 秒）----
const END_BEAT = 104, TOTAL = END_BEAT * B + 0.45;
const R = (clip, ...keys) => { const r = meta[clip].rects; const us = keys.map(k => r[k]).filter(Boolean); const x0 = Math.min(...us.map(u => u.x)), y0 = Math.min(...us.map(u => u.y)), x1 = Math.max(...us.map(u => u.x + u.width)), y1 = Math.max(...us.map(u => u.y + u.height)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const crop = (clip, keys, px = 30, py = 24) => {
  let { x, y, w, h } = R(clip, ...keys); x -= px; y -= py; w += px * 2; h += py * 2;
  const cx = x + w / 2, cy = y + h / 2;
  if (w / h > 2.7) h = w / 2.7; if (w / h < 1.5) w = h * 1.5;
  x = Math.min(Math.max(0, cx - w / 2), W - w); y = Math.min(Math.max(0, cy - h / 2), H - h);
  if (w > W) { w = W; x = 0; } if (h > H) { h = H; y = 0; }
  return { x, y, w, h };
};
const T = (beat, d, lines, o = {}) => ({ s: beat * B, d: d * B, type: 'text', lines: lines.map(l => typeof l === 'string' ? { t: l } : l), ...o });
const V = (beat, d, clip, clipBeat, keys, cap, o = {}) => ({ s: beat * B, d: d * B, type: 'real', clip, clipStart: clipBeat * B, crop: crop(clip, keys, o.px, o.py), cap, ...o });
const mic = 'mic';
const cuts = [
  // 1) タイトル
  T(0, 2, ['音声認識'], { bg: 0, emoji: ['🎤', '✨'] }),
  T(2, 2, ['字幕ちゃん'], { bg: 1, emoji: ['💬', '⚡'] }),
  T(4, 2, [{ t: 'v2', size: 330 }], { bg: 2, emoji: ['🔥', '💥', '🚀'] }),
  T(6, 3, ['大型', 'アップデート！！'], { bg: 3, emoji: ['🎉', '✨', '🎊'] }),
  T(9, 3, ['ついに', '来たぞ！！'], { bg: 4, emoji: ['😆', '🔥', '⚡', '🎉'], strobe: true }),
  // 2) マイク選択（最大の目玉）
  T(12, 3, ['マイク', '選べます！！'], { bg: 0, emoji: ['🎤', '🎧', '🔥'] }),
  V(15, 3, mic, 3, ['select', 'meter'], 'マイク選択！', { bg: 1, emoji: ['👆'], px: 70, py: 40 }),
  V(18, 3, mic, 6, ['select', 'dd'], 'ズラッと一覧！', { bg: 2, px: 40, py: 20 }),
  T(21, 2, [{ t: 'クリック！', size: 190 }], { bg: 3, emoji: ['👆', '💥', '✨'] }),
  V(23, 3, mic, 11, ['select', 'dd'], '好きなマイクを選ぶ！', { bg: 4, px: 40, py: 20 }),
  V(26, 4, mic, 14, ['select', 'meter', 'mute'], '切り替わった！！', { bg: 0, emoji: ['🎉', '✨'], px: 40, py: 30 }),
  V(30, 4, mic, 18, ['select', 'meter'], '好きなマイクをクリックで選ぶだけ！', { bg: 5, emoji: ['🎤', '😆'], px: 100, py: 50 }),
  T(34, 4, ['神アプデ！！'], { bg: 2, emoji: ['🙌', '🔥', '🎉', '💖'], strobe: true }),
  // 3) 入力レベルメーター
  T(38, 3, ['音が', '来てるか'], { bg: 1, emoji: ['👂', '📶'] }),
  V(41, 3, 'meter', 3, ['meter'], '一目でわかる！', { bg: 3, emoji: ['📊'], px: 120, py: 60 }),
  V(44, 4, 'meter', 6, ['select', 'meter', 'mute'], '入力レベルメーター！', { bg: 4, emoji: ['🔊', '⚡'], px: 30, py: 20 }),
  // 4) 叫ぶと…
  T(48, 4, [{ t: '叫ぶと……', fill: '#ffd0d0', glow: '#ff0033' }], { dark: true, flash: 0, noLines: true }),
  T(52, 2, [{ t: '字幕が', size: 250 }], { bg: 0, emoji: ['😱', '💥'], flashA: 1 }),
  T(54, 2, [{ t: 'でかく', size: 250 }], { bg: 2, emoji: ['🔥', '💥', '⚡'] }),
  { s: 56 * B, d: 3 * B, type: 'real', clip: 'loud', clipStart: 56 * B - 48 * B, crop: { x: 0, y: 140, w: 1280, h: 440 }, cap: '声量で字幕がでかくなる！', bg: 5, emoji: ['📣', '🔥'] },
  { s: 59 * B, d: 3 * B, type: 'real', clip: 'loud', clipStart: 59 * B - 48 * B, crop: { x: 190, y: 190, w: 900, h: 340 }, cap: 'うおおおお！！', bg: 0, emoji: ['😤', '💥'], strobe: true },
  // 5) 2 つ目の入力
  T(62, 3, [{ t: 'コラボ相手の' }, { t: '声も！' }], { bg: 3, emoji: ['👥', '🎙️'] }),
  T(65, 2, [{ t: '字幕に！！', size: 230 }], { bg: 4, emoji: ['💬', '✨', '🎉'] }),
  V(67, 3, 'mic2', 5, ['mic2', 'dd'], '2 つ目の入力！', { bg: 1, emoji: ['🎧'], px: 30, py: 14 }),
  V(70, 2, 'mic2', 8, ['mic2', 'mic2vol'], '一緒に字幕に！', { bg: 5, emoji: ['🎧', '✨'], px: 50, py: 60 }),
  // 6) 音量ブースト！ノイズゲート！ミュートも！
  V(72, 4, 'adjust', 0, ['gain'], '音量ブースト！', { bg: 0, emoji: ['💪', '📢'], px: 60, py: 90 }),
  V(76, 4, 'adjust', 4, ['gate', 'gateSl'], 'ノイズゲート！', { bg: 2, emoji: ['✨', '🔇'], px: 40, py: 100 }),
  V(80, 4, 'adjust', 8, ['mute', 'meter'], 'ミュートも！', { bg: 4, emoji: ['🙊', '✨'], px: 50, py: 40 }),
  // 7) 締め
  T(84, 3, ['Chrome を'], { bg: 5, emoji: ['🌐', '✨'] }),
  T(87, 3, [{ t: '最新版に！', size: 220 }], { bg: 1, emoji: ['⬆️', '🆕', '✨'] }),
  T(90, 3, [{ t: 'v2 へ', size: 270 }], { bg: 3, emoji: ['👉', '🚀'] }),
  T(93, 3, [{ t: 'GO！！', size: 320, fill: '#fff200' }], { bg: 0, emoji: ['🔥', '🚀', '💥', '🎉'], strobe: true }),
  { s: 96 * B, d: (END_BEAT - 96) * B + 0.45, type: 'end', tops: [90, 262, 360], bg: 2, emoji: ['🎤', '🎉', '✨', '💬', '🔥'], strobe: true,
    lines: [{ t: 'v2 へ GO！！', size: 118, fill: '#fff200', glow: '#ff2d95' }, { t: 'sayonari.github.io/jimakuChan/v2/', size: 56, fill: '#ffffff', glow: '#00c8ff' }, { t: '無料・インストール不要', size: 108, fill: '#8cff3a', glow: '#006b3a' }] },
];
// 最後以外は，次のカット頭まで
cuts.forEach((c, i) => { if (cuts[i + 1]) c.d = cuts[i + 1].s - c.s; });
const clips = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { n: v.n }]));
const TL = { fps: FPS, B, total: TOTAL, cuts, nar: nar.map(({ wav, ...n }) => n), clips };
const bad = cuts.filter((c, i) => i < cuts.length - 1 && (c.d < 0.69 || c.d > 1.51)); if (bad.length) log('警告: カット長が範囲外', bad.map(c => c.d.toFixed(2)));
log('カット', cuts.length, '本，尺', TOTAL.toFixed(1), 's');

// ---- 4) BGM ＋ 効果音 ----
const sfx = [];
cuts.forEach((c, i) => { sfx.push({ t: c.s, k: 'don', v: c.type === 'real' ? 0.7 : 1.0 }); if (i > 0) sfx.push({ t: c.s, k: 'shu' }); if (c.type === 'real') sfx.push({ t: c.s + 0.12, k: 'pi' }); });
sfx.push({ t: 52 * B, k: 'crash' }, { t: 96 * B, k: 'crash' });
fs.writeFileSync('build/hype_events.json', JSON.stringify({ bpm: BPM, breakBeat: 48, dropBeat: 52, endBeat: END_BEAT, sfx }));
log('BGM 合成…');
execSync(`python3 bgm_hype.py ${TOTAL.toFixed(2)} build/hype_bgm.wav build/hype_sfx.wav build/hype_events.json`, { stdio: 'inherit' });

// ---- 5) フレーム描画 → ffmpeg ----
log('フレーム描画', FPS, 'fps …');
if (!REMIX) {
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(new URL('./video_hype.html', import.meta.url).href);
await page.evaluate(tl => { window.TL = tl; }, TL);
await page.evaluate(() => window.__ready);
const FR = (process.argv.find(a => a.startsWith('--frames=')) || '').slice(9);   // デバッグ用：--frames=1.5,20 で該当秒の静止画だけ build/dbg_<秒>.png に出して終了
if (FR) { for (const tt of FR.split(',').map(Number)) { await page.evaluate(x => window.seek(x), tt); await page.screenshot({ path: `build/dbg_${tt}.png` }); } await browser.close(); process.exit(0); }
const nFrames = Math.ceil(TOTAL * FPS);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), 'build/hype_noaudio.mp4']);
ff.stderr.on('data', d => process.stderr.write(d));
const t0 = Date.now();
for (let f = 0; f < nFrames; f++) {
  const t = f / FPS;
  await page.evaluate(tt => window.seek(tt), t);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % (FPS * 5) === 0) log(`frame ${f}/${nFrames}  ${t.toFixed(1)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
}
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close();
}

// ---- 6) 音声ミックス：ナレーションを拍位置に置き，BGM は声の下で自動的に下げる ----
const inputs = ['-i', 'build/hype_noaudio.mp4', '-i', 'build/hype_bgm.wav', '-i', 'build/hype_sfx.wav'];
nar.forEach(n => inputs.push('-i', n.wav));
const delays = nar.map((n, k) => `[${k + 3}:a]adelay=${Math.round(n.start * 1000)}|${Math.round(n.start * 1000)},apad[n${k}]`).join(';');
const mixN = nar.map((n, k) => `[n${k}]`).join('');
const filter = `${delays};${mixN}amix=inputs=${nar.length}:normalize=0,volume=1.7,alimiter=limit=0.95,asplit=2[v1][v2];` +
  `[1:a]volume=0.62[bgm0];[bgm0][v1]sidechaincompress=threshold=0.015:ratio=5:attack=20:release=300:makeup=1[bgm];` +
  `[2:a]volume=0.6[sfx];[bgm][v2][sfx]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.9,aformat=channel_layouts=stereo[a]`;
execSync(`ffmpeg -y -loglevel error ${inputs.join(' ')} -filter_complex "${filter}" -map 0:v -map "[a]" -c:v libx264 -preset medium -crf 23 -profile:v high -pix_fmt yuv420p -r ${FPS} -c:a aac -b:a 192k -ar 44100 -shortest -movflags +faststart ${OUT}`, { stdio: 'inherit' });

// ---- 7) コンタクトシート（2 秒ごと）----
execSync(`ffmpeg -y -loglevel error -i ${OUT} -vf "fps=1/2,scale=320:180,tile=5x4:padding=4:color=black" -frames:v 1 build/contact_hype.png`);
log(`完成: ${OUT}  ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB  ${TOTAL.toFixed(1)}s`);
