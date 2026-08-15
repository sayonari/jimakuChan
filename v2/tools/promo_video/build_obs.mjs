#!/usr/bin/env node
/*
 * jimakuChan v2 紹介動画を全自動生成する
 *   node build.mjs [--quick]     (--quick: 12fps でプレビュー用に速く出す)
 * 出力: build/jimakuChan_v2_intro.mp4  (1280x720, H.264 yuv420p, AAC, Twitter 投稿可)
 *
 * 手順: ナレーション(say/Kyoko) → タイムライン計算 → UIキャプチャ → BGM合成 → フレーム描画(Playwright)
 *      → ffmpeg で動画化 → 音声ミックス（BGM を声の下で少し下げる）
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import { buildNarration } from './narration.mjs';
const OBS_SCENES = [
  { id: 'intro',   tts: '音声認識字幕ちゃんの字幕を、OBSに映す方法を説明します。OBS 28以降なら、WebSocketで直接つなぐのがおすすめです。' },
  { id: 'ws',      tts: 'まずOBSで、メニューの「ツール」から「WebSocketサーバー設定」を開きます。「WebSocketサーバーを有効にする」にチェックを入れ、「パスワードを表示」を押して、パスワードを控えてください。' },
  { id: 'connect', tts: '字幕ちゃんの「OBS連携」タブを開き、パスワードを貼り付けて、「OBSに接続」。右上の表示が「OBS 接続中」になれば成功です。' },
  { id: 'add',     tts: '「現在のシーンに字幕を追加」を押すと、OBSのシーンにブラウザソース「jimakuChan 字幕」が自動で追加されます。位置や大きさは、OBSの上で自由に動かせます。' },
  { id: 'live',    tts: 'あとは話すだけ。字幕はOBSに直接届き、背景は透過なので、クロマキーは不要です。見た目タブで変えたテーマや色も、その場でOBSに反映されます。' },
  { id: 'classic', tts: 'WebSocketが使えない場合は、「表示ウィンドウ」ボタンで緑背景の窓を開き、OBSのウィンドウキャプチャで取り込んで、フィルタの「クロマキー」で緑を抜いてください。' },
  { id: 'tips',    tts: 'うまく映らないときは、ブラウザソースを右クリックして「対話」を開き、ページが表示されているか確認してください。「表示されていないときにソースをシャットダウン」は、オフにしておきましょう。' },
  { id: 'outro',   tts: '以上、OBSとの連携方法でした。楽しい配信を！' },
];

const QUICK = process.argv.includes('--quick');
const AUDIO_ONLY = process.argv.includes('--audio-only');   // 既存の build/video_obs_noaudio.mp4 を使う
const FPS = QUICK ? 12 : 30;
const GAP = 0.7;             // シーン間の間
const W = 1280, H = 720;
const OUT = 'build/jimakuChan_v2_obs_guide.mp4';
const log = (...a) => console.log('[build]', ...a);

fs.mkdirSync('build', { recursive: true });

// 1) ナレーション
log('ナレーション生成…');
const narr = buildNarration(OBS_SCENES, { prefix: 'obs_' });
let tcur = 0.4;
const scenes = narr.map(n => { const s = { id: n.id, start: tcur, dur: n.dur, text: n.tts.replace(/、/g, '，').replace(/。/g, '．'), env: n.env, wav: n.wav }; tcur += n.dur + GAP; return s; });
const TOTAL = tcur + 0.8;
log('総尺', TOTAL.toFixed(1), 's');

// 2) UI キャプチャ（無ければ）
if (!fs.existsSync('assets/ui_meta.json')) { log('UI キャプチャ…'); execSync('node capture_ui.mjs', { stdio: 'inherit' }); }
const meta = JSON.parse(fs.readFileSync('assets/ui_meta.json', 'utf8'));

// 3) BGM
log('BGM 合成…');
execSync(`python3 bgm.py ${TOTAL.toFixed(2)} build/bgm_obs.wav`, { stdio: 'inherit' });

// 4) フレーム描画 → ffmpeg(image2pipe)
if (!AUDIO_ONLY) {
log('フレーム描画', FPS, 'fps …');
const TL = { fps: FPS, gap: GAP, scenes: scenes.map(s => ({ id: s.id, start: s.start, dur: s.dur, text: s.text, env: s.env })), meta, total: TOTAL };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(new URL('./video_obs.html', import.meta.url).href);
await page.evaluate(tl => { window.TL = tl; }, TL);
await page.evaluate(() => window.__ready);

const nFrames = Math.ceil(TOTAL * FPS);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), 'build/video_obs_noaudio.mp4']);
ff.stderr.on('data', d => process.stderr.write(d));
const t0 = Date.now();
for (let f = 0; f < nFrames; f++) {
  const t = f / FPS;
  await page.evaluate(tt => window.seek(tt), t);
  const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % (FPS * 5) === 0) log(`frame ${f}/${nFrames}  ${(t).toFixed(1)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
log('動画（無音）完成');
}

// 5) 音声ミックス：ナレーションを各シーンの開始位置に配置，BGM は声のあるところで自動的に下げる(sidechaincompress)
const inputs = ['-i', 'build/video_obs_noaudio.mp4', '-i', 'build/bgm_obs.wav'];
scenes.forEach(s => inputs.push('-i', s.wav));
const delays = scenes.map((s, k) => `[${k + 2}:a]adelay=${Math.round(s.start * 1000)}|${Math.round(s.start * 1000)},apad[n${k}]`).join(';');
const mixN = scenes.map((s, k) => `[n${k}]`).join('');
const filter = `${delays};${mixN}amix=inputs=${scenes.length}:normalize=0,volume=1.6,alimiter=limit=0.95,asplit=2[v1][v2];` +
  `[1:a]volume=0.55[bgm0];[bgm0][v1]sidechaincompress=threshold=0.02:ratio=6:attack=40:release=500:makeup=1[bgm];` +
  `[bgm][v2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.98[a]`;
execSync(`ffmpeg -y -loglevel error ${inputs.join(' ')} -filter_complex "${filter}" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart ${OUT}`, { stdio: 'inherit' });
const size = (fs.statSync(OUT).size / 1e6).toFixed(1);
log(`完成: ${OUT}  ${size} MB  ${TOTAL.toFixed(1)}s`);
