// ナレーション生成（macOS say / Kyoko）→ wav ＋ 長さ ＋ 音量エンベロープ
import { execSync } from 'child_process';
import fs from 'fs';
export const SCENES = [
  { id: 'title',   tts: '音声認識字幕ちゃん、バージョン2。ブラウザだけで、話した言葉が、そのまま字幕になります。' },
  { id: 'setup',   tts: 'インストールは不要。Chromeでページを開いて、マイクを許可するだけ。開いた瞬間から、認識が始まります。' },
  { id: 'demo',    tts: '話すと、認識中の言葉がリアルタイムで表示され、文が確定すると翻訳も一緒に出ます。最大3か国語まで同時に翻訳。文と文の間も途切れません。' },
  { id: 'themes',  tts: '縁取り、ボックス、ネオン、シャドウ。テーマを選ぶだけで、かわいくも、かっこよくも。縁取りは外側にだけ、なめらかに太くなるので、文字がつぶれません。PCに入っているフォントも、ボタンひとつで一覧から選べます。' },
  { id: 'obs',     tts: 'OBSとの連携もかんたん。OBSのWebSocketを有効にして、パスワードを入れて接続。「字幕を追加」を押すだけ。背景は透過、クロマキーは不要です。もちろん従来どおり、「表示モード」で全画面の字幕だけにして、ウィンドウキャプチャすることもできます。' },
  { id: 'filter',  tts: '配信で言いたくない言葉は、自動で伏字に。英語などは単語単位で判定するので、伏字だらけになりません。' },
  { id: 'outro',   tts: '音声認識字幕ちゃん、バージョン2。無料、インストール不要、超軽量。今日から、あなたの配信に字幕を。' },
];
// 音声合成：既定は Microsoft ニューラル音声（edge-tts, ja-JP-NanamiNeural，要ネット）．失敗時は macOS say(Kyoko)
export function synth(text, wav, { voice = 'ja-JP-NanamiNeural', rate = '+8%' } = {}) {
  const edge = './.venv/bin/edge-tts';
  const mp3 = wav.replace(/\.wav$/, '.mp3');
  try {
    if (!fs.existsSync(edge)) throw new Error('no edge-tts');
    execSync(`${edge} --voice ${voice} --rate=${rate} --text ${JSON.stringify(text)} --write-media ${mp3}`, { stdio: 'pipe', timeout: 60000 });
    execSync(`ffmpeg -y -loglevel error -i ${mp3} -ar 44100 -ac 1 ${wav}`);
    return 'edge';
  } catch (e) {
    const aiff = wav.replace(/\.wav$/, '.aiff');
    execSync(`say -v Kyoko -r 185 -o ${aiff} ${JSON.stringify(text.replace(/，/g, '、').replace(/．/g, '。'))}`);
    execSync(`ffmpeg -y -loglevel error -i ${aiff} -ar 44100 -ac 1 ${wav}`);
    return 'say';
  }
}
export function buildNarration(scenes = SCENES, opts = {}) {
  const out = [];
  for (const s of scenes) {
    const wav = `build/${opts.prefix || ''}${s.id}.wav`;
    const engine = synth(s.tts, wav, opts);
    const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${wav}`).toString());
    out.push({ ...s, wav, dur, env: envelope(wav, 30), engine });
  }
  return out;
}
// 16bit PCM wav → 1フレーム(1/fps)ごとの RMS（0..1）
function envelope(wav, fps) {
  const buf = fs.readFileSync(wav);
  // data チャンクを探す
  let off = 12, dataOff = 0, dataLen = 0, sr = 44100;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') sr = buf.readUInt32LE(off + 12);
    if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
    off += 8 + len;
  }
  const n = dataLen / 2, per = Math.floor(sr / fps), env = [];
  for (let i = 0; i < n; i += per) {
    let s = 0, c = 0;
    for (let j = i; j < Math.min(n, i + per); j++) { const v = buf.readInt16LE(dataOff + j * 2) / 32768; s += v * v; c++; }
    env.push(Math.sqrt(s / Math.max(1, c)));
  }
  const mx = Math.max(...env, 1e-6);
  return env.map(v => Math.min(1, v / mx));
}
if (process.argv[1].endsWith('narration.mjs')) { const r = buildNarration(); console.log(r.map(x => x.id + ' ' + x.dur.toFixed(2) + 's ' + x.engine).join('\n')); }
