// 「Chrome のタブの音声」入力のテスト（getDisplayMedia をモック．サーバーは立てず file:// で開く）
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const root = new URL('../../', import.meta.url).href;
const fake = readFileSync(new URL('./fake_sr.js', import.meta.url), 'utf8');
let ok = true; const check = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) ok = false; };

// getDisplayMedia のモック：window.__gdm.mode = 'ok' | 'invalid' | 'denied' | 'noaudio'
const mock = `(function(){
  window.__gdm = { mode: 'ok', calls: 0, streams: [] };
  const md = navigator.mediaDevices; if (!md) return;
  md.getDisplayMedia = async function(c){
    window.__gdm.calls++; window.__gdm.lastConstraints = c;
    const m = window.__gdm.mode;
    if (m === 'invalid') throw new DOMException('user gesture required', 'InvalidStateError');
    if (m === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; cv.getContext('2d');
    const vs = cv.captureStream(5);
    const tracks = [...vs.getVideoTracks()];
    if (m !== 'noaudio') {
      const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value = 440; const d = ac.createMediaStreamDestination();
      o.connect(d); o.start(); ac.resume && ac.resume();
      tracks.push(...d.stream.getAudioTracks());
    }
    const s = new MediaStream(tracks); window.__gdm.streams.push(s); return s;
  };
})();`;

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
async function open(mode, tab = true) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(fake); await p.addInitScript(mock);
  await p.addInitScript(`window.__gdm.mode = '${mode}';`);
  if (tab) await p.addInitScript(`localStorage.setItem('jimakuChan_v2_ui', JSON.stringify({ micDeviceId: 'tab' }));`);
  await p.goto(root + 'index.html'); await p.waitForTimeout(2500);
  return { ctx, p, errs };
}
const status = p => p.evaluate(() => document.getElementById('engineStatus').textContent);
const running = p => p.evaluate(() => !!window.jimakuApp.engine.running);

// (1) UI：選択肢・案内文・見出し
{
  const { ctx, p, errs } = await open('invalid', false);
  const opts = await p.$$eval('#micSelect option', o => o.map(x => ({ v: x.value, t: x.textContent })));
  const tabOpt = opts.find(o => o.v === 'tab');
  check(tabOpt && tabOpt.t === 'Chrome のタブの音声（開始時にタブを選ぶ）', '(1) value=tab の選択肢と文言: ' + JSON.stringify(tabOpt));
  check(await p.evaluate(() => document.querySelector('label[for=micSelect] [data-i18n=lMic]').textContent) === '音声入力', '(1) 欄の見出しは「音声入力」');
  check(/マイクのほか/.test(await p.$eval('.miclinehint', e => e.textContent)), '(1) .miclinehint の案内文あり');
  await p.selectOption('#micSelect', 'tab'); await p.waitForTimeout(300);
  check(await p.evaluate(() => { const e = document.getElementById('micOld'); return !e.hidden && /タブを選ぶ画面/.test(e.textContent); }), '(1) 選ぶと micOld に micTabNote が出る');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
// (1b) getDisplayMedia が無いと選択肢が出ない
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(fake); await p.addInitScript(mock);
  await p.addInitScript('try { navigator.mediaDevices.getDisplayMedia = undefined; } catch (e) {}');
  await p.goto(root + 'index.html'); await p.waitForTimeout(2500);
  check(await p.$$eval('#micSelect option', o => !o.some(x => x.value === 'tab')), '(1b) getDisplayMedia なしでは tab 選択肢が出ない');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
// (2) 自動開始 → InvalidStateError → msgTabClick で止まる．クリックで開始 → 成功
{
  const { ctx, p, errs } = await open('invalid');
  check(await p.evaluate(() => window.__gdm.calls) >= 1, '(2) 自動開始で getDisplayMedia が呼ばれた');
  check(!(await running(p)), '(2) 自動開始(InvalidStateError)で認識を止めた');
  check(/タブの音声を使うには「開始」を押して/.test(await status(p)), '(2) engineStatus に msgTabClick: ' + await status(p));
  check(await p.evaluate(() => (window.__srStarts || []).length) === 0, '(2) 既定マイクで認識を始めていない');
  await p.evaluate(() => { window.__gdm.mode = 'ok'; });
  await p.click('#btnStart'); await p.waitForTimeout(2500);
  check(await running(p), '(2) 「開始」クリックで認識が動く');
  const c = await p.evaluate(() => window.__gdm.lastConstraints);
  check(c && c.video === true && c.audio && typeof c.audio === 'object', '(2) getDisplayMedia({video:true, audio:{...}}): ' + JSON.stringify(c));
  const st = await p.evaluate(() => window.__srStarts);
  const last = st && st[st.length - 1];
  check(last && last.kind === 'audio' && last.state === 'live', '(3) start(track) が live な audio track で呼ばれた: ' + JSON.stringify(last));
  const info = await p.evaluate(() => { const s = window.__gdm.streams[0]; return { v: s.getVideoTracks().map(t => t.enabled), a: s.getAudioTracks().length, same: window.jimakuApp.engine.mic.stream === s, isTab: window.jimakuApp.engine.mic.isTab }; });
  check(info.v.length === 1 && info.v.every(x => x === false) && info.a === 1, '(3) 映像 track は enabled=false: ' + JSON.stringify(info));
  check(info.same && info.isTab, '(3) mic.stream がタブのストリーム');
  check(await p.evaluate(() => window.jimakuApp.engine.recognizer.noStallFallback === true), '(4) タブ使用中は noStallFallback=true');
  // restart
  const g0 = await p.evaluate(() => window.__gdm.calls), n0 = await p.evaluate(() => window.__srStarts.length);
  const recog = await p.$eval('[data-bind="recog"][data-restart]', e => [...e.options].map(o => o.value));
  const cur = await p.$eval('[data-bind="recog"]', e => e.value);
  const other = recog.find(v => v !== cur);
  await p.selectOption('[data-bind="recog"]', other); await p.waitForTimeout(2500);
  const g1 = await p.evaluate(() => window.__gdm.calls), n1 = await p.evaluate(() => window.__srStarts.length);
  check(n1 > n0, '(5) 認識言語の変更で認識が再起動した（start ' + n0 + '→' + n1 + '）');
  check(g1 === g0, '(5) 再起動で getDisplayMedia の呼び出し回数が増えない（' + g0 + '→' + g1 + '）');
  check(await running(p), '(5) 再起動後も動作中');
  const st2 = await p.evaluate(() => window.__srStarts); const l2 = st2[st2.length - 1];
  check(l2 && l2.kind === 'audio' && l2.state === 'live', '(5) 再起動後も live な audio track で start');
  // 結果が来なくても direct に切り替わらない（recognizer 側のフラグで確認＋待ち）
  check(await p.evaluate(() => document.getElementById('micSelect').value) === 'tab', '(4) 選択は tab のまま（direct に切り替わっていない）');
  // 停止ボタン
  await p.click('#btnStop'); await p.waitForTimeout(500);
  const ended = await p.evaluate(() => window.__gdm.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  check(ended, '(6) 停止ボタンでタブの track が stop された');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
// (7) NotAllowedError
{
  const { ctx, p, errs } = await open('denied');
  await p.click('#btnStart'); await p.waitForTimeout(1500);
  check(!(await running(p)) && /タブが選ばれなかった/.test(await status(p)), '(7) NotAllowedError で止まり msgTabCancel: ' + await status(p));
  check(await p.evaluate(() => (window.__srStarts || []).length) === 0, '(7) 既定マイクで認識しない');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
// (8) 音声 track なし
{
  const { ctx, p, errs } = await open('noaudio');
  await p.click('#btnStart'); await p.waitForTimeout(1500);
  check(!(await running(p)) && /共有されていません/.test(await status(p)), '(8) 音声なしで止まり msgTabNoAudio: ' + await status(p));
  check(await p.evaluate(() => window.__gdm.streams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), '(8) 取得したストリームを stop した');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
// (9) 共有停止（audio track の ended）
{
  const { ctx, p, errs } = await open('ok');   // モックは操作の有無を見ないので自動開始でそのまま動く
  await p.waitForTimeout(500);
  check(await running(p), '(9) 前提：認識が動いている');
  const n0 = await p.evaluate(() => window.__srStarts.length);
  await p.evaluate(() => { const t = window.__gdm.streams[0].getAudioTracks()[0]; t.stop(); t.dispatchEvent(new Event('ended')); });
  await p.waitForTimeout(1500);
  check(!(await running(p)) && /タブの共有が終わった/.test(await status(p)), '(9) ended で既定マイクに切り替えず止まり msgTabEnded: ' + await status(p));
  check(await p.evaluate(n => window.__srStarts.length === n && window.__srStarts.every(s => s && s.kind === 'audio'), n0), '(9) 既定マイクの start() が走っていない');
  check(await p.evaluate(() => document.getElementById('micSelect').value) === 'tab', '(9) 選択は tab のまま');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
await browser.close();
console.log(ok ? 'ALL PASS' : 'FAILED'); process.exit(ok ? 0 : 1);
