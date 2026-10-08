// マイク選択・入力レベルメーターのテスト（Chromium のフェイクデバイス．サーバーは立てず file:// で開く）
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const root = new URL('../../', import.meta.url).href;
const fake = readFileSync(new URL('./fake_sr.js', import.meta.url), 'utf8');
mkdirSync(new URL('./build/', import.meta.url), { recursive: true });
let ok = true; const check = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) ok = false; };

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
async function open(reject) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(fake);
  if (reject) await p.addInitScript('window.__fakeSR.rejectTrack = true;');
  await p.goto(root + 'index.html'); await p.waitForTimeout(2500);
  return { ctx, p, errs };
}

// (a)(b)(c) 通常
{
  const { ctx, p, errs } = await open(false);
  const opts = await p.$$eval('#micSelect option', o => o.map(x => x.textContent));
  console.log('  選択肢:', JSON.stringify(opts));
  check(opts.length >= 2 && /既定/.test(opts[0]), '(a) デバイス選択肢が出る（既定＋実デバイス）');
  const lv = await p.evaluate(async () => {
    const xs = []; for (let i = 0; i < 20; i++) { xs.push(document.getElementById('micFill').style.clipPath); await new Promise(r => setTimeout(r, 100)); } return xs;
  });
  check(new Set(lv).size > 3, '(b) メーターが動く（clip-path が変化: ' + new Set(lv).size + ' 種）');
  const st = await p.evaluate(() => window.__srStarts);
  check(st && st[0] && st[0].kind === 'audio' && st[0].state === 'live', '(c) start(track) が live な audio track で呼ばれた: ' + JSON.stringify(st && st[0]));
  check(await p.evaluate(() => document.getElementById('micSelect').disabled === false), 'select は有効');
  // デバイスを選び直すと再起動して別 track で start される
  const second = await p.$$eval('#micSelect option', o => o[1].value);
  const n0 = await p.evaluate(() => window.__srStarts.length);
  await p.selectOption('#micSelect', second); await p.waitForTimeout(1500);
  const n1 = await p.evaluate(() => window.__srStarts.length);
  check(n1 > n0, '選択変更で認識が再起動した（start 回数 ' + n0 + '→' + n1 + '）');
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('jimakuChan_v2_ui')).micDeviceId) === second, 'deviceId が UI ストレージに保存された');
  // 停止でストリームが閉じる
  await p.click('#btnStop'); await p.waitForTimeout(300);
  check(await p.evaluate(() => !window.jimakuApp.engine.mic.stream), '停止でストリームを閉じた');
  // 保存済み deviceId が無効 → 既定に戻る
  await p.evaluate(() => localStorage.setItem('jimakuChan_v2_ui', JSON.stringify({ micDeviceId: 'gone-device' })));
  await p.reload(); await p.waitForTimeout(2500);
  check(await p.evaluate(() => window.jimakuApp.engine.mic.stream && window.jimakuApp.engine.running), '存在しない deviceId でも既定に戻って認識が動く');
  await p.screenshot({ path: fileURLToPath(new URL('./build/mic_ui.png', import.meta.url)), clip: await p.$eval('#micBox', e => { const r = e.getBoundingClientRect(); return { x: r.x - 8, y: r.y + scrollY - 8, width: r.width + 16, height: r.height + 16 }; }), fullPage: true });
  // 無音警告（フェイクデバイスは常にビープ音なので強制的に低レベルを流して確認）
  await p.evaluate(() => { const m = window.jimakuApp.engine.mic; m._analyser.getFloatTimeDomainData = b => b.fill(0); });
  await p.waitForTimeout(5800);
  check(await p.evaluate(() => !document.getElementById('micWarn').hidden), '5 秒無音で「音が届いていません」表示');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
// (d) start(track) が TypeError
{
  const { ctx, p, errs } = await open(true);
  const r = await p.evaluate(() => ({ sup: window.jimakuApp.engine.trackSupported, dis: document.getElementById('micSelect').disabled, old: !document.getElementById('micOld').hidden,
    starts: window.__srStarts, running: window.jimakuApp.engine.running, listening: window.jimakuApp.engine.recognizer.listening }));
  console.log('  ', JSON.stringify(r));
  check(r.sup === false && r.dis && r.old, '(d) 未対応を検知し select 無効＋更新案内を表示');
  check(r.starts && r.starts[0] === null && r.listening, '(d) start() の既定マイクで認識が動いている');
  check(await p.evaluate(() => !!window.jimakuApp.engine.mic.stream), '(d) メーターは既定マイクで動く');
  await p.screenshot({ path: fileURLToPath(new URL('./build/mic_ui_old.png', import.meta.url)), clip: { x: 0, y: 380, width: 1280, height: 520 } });
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close();
}
await browser.close();
console.log(ok ? 'ALL PASS' : 'FAILED'); process.exit(ok ? 0 : 1);
