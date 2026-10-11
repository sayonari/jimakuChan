// 回帰テスト（Issue #14）：start(track) が例外を出さずに黙って動かない環境で，
// 作り直しが続いたら 処理後 track → 生 track → start()（既定マイク）へ段階的に下がって認識が動くか
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const root = new URL('../../', import.meta.url).href;
const fake = readFileSync(new URL('./fake_sr.js', import.meta.url), 'utf8');
let ok = true; const check = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) ok = false; };

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (/start\(track\)|watchdog/.test(m.text())) console.log('  [page]', m.text()); });
await p.addInitScript(fake);
await p.addInitScript('window.__fakeSR.stallTrack = true;');
await p.goto(root + 'index.html');

// 既定の設定で自動開始 → start(track) が黙る → watchdog が作り直す … を待つ（最大 90 秒）
const ready = () => p.evaluate(() => { const R = window.jimakuApp.engine.recognizer; return !!(R && R.listening && R.audioTrack === null || (R && R.listening && R._trackSupported === false)); });
const t0 = Date.now();
for (;;) { await p.waitForTimeout(1000); if (await ready() || Date.now() - t0 > 90000) break; }
console.log('  切替までの秒数:', Math.round((Date.now() - t0) / 1000));
const st = await p.evaluate(() => ({ starts: window.__srStarts.map(s => s && s.label), sel: document.getElementById('micSelect').value, dis: document.getElementById('micSelect').disabled,
  note: document.getElementById('micOld').textContent, noteShown: !document.getElementById('micOld').hidden,
  saved: JSON.parse(localStorage.getItem('jimakuChan_v2_ui') || '{}').micDeviceId, toast: document.body.innerText.includes('「マイク選択を使わない」に切り替えました') }));
console.log('  start の履歴:', JSON.stringify(st.starts));
check(st.starts[st.starts.length - 1] === null, '最後は start()（既定マイク）で認識');
check(st.sel === 'direct' && !st.dis, 'プルダウンが「マイク選択を使わない」になり，選び直せる（無効化しない）');
check(st.saved === 'direct', 'localStorage に保存された');
check(st.noteShown && /選び直/.test(st.note), '案内を表示: ' + st.note);
check(st.toast, '切り替えたことをトーストで知らせた');
await p.waitForTimeout(1500);   // 既定マイクを開き直すのを待つ（非同期）
check(await p.evaluate(() => { const m = window.jimakuApp.engine.mic; return !!(m.stream && m.stream.getAudioTracks()[0].readyState === 'live'); }), 'メーターは既定マイクで動く');
const said = await p.evaluate(() => window.__fakeSR.say('テストです', { cps: 20 }));
await p.waitForTimeout(500);
check(said && /テストです/.test(await p.evaluate(() => window.jimakuApp.engine.lastFinal) || ''), '切替後に認識結果が確定する');

// 停止→開始：track で再挑戦しない
let n0 = await p.evaluate(() => window.__srStarts.length);
await p.click('#btnStop'); await p.waitForTimeout(500); await p.click('#btnStart'); await p.waitForTimeout(3000);
let re = await p.evaluate(n0 => ({ after: window.__srStarts.slice(n0), listening: window.jimakuApp.engine.recognizer.listening }), n0);
check(re.listening && re.after.length > 0 && re.after.every(x => x === null), '停止→開始後はすぐ start() で動く: ' + JSON.stringify(re.after));

// 再読み込み：最初から start() で動く（20 秒待たない）
await p.reload(); await p.waitForTimeout(3500);
re = await p.evaluate(() => ({ starts: window.__srStarts, listening: window.jimakuApp.engine.recognizer && window.jimakuApp.engine.recognizer.listening, sel: document.getElementById('micSelect').value, shown: !document.getElementById('micOld').hidden }));
check(re.listening && re.starts.every(x => x === null) && re.sel === 'direct' && re.shown, '再読み込み後は最初から start() で動く: ' + JSON.stringify(re.starts));

// 英語表示でも趣旨が同じ
const en = await p.evaluate(() => { const b = document.querySelector('[data-lang="en"], #btnLangEn, #langEn'); if (b) b.click(); return !!b; });
if (en) { await p.waitForTimeout(300); const r = await p.evaluate(() => ({ note: document.getElementById('micOld').textContent, opt: [...document.getElementById('micSelect').options].pop().textContent })); check(/select one above/.test(r.note) && /Don't choose/.test(r.opt), '英語表示: ' + JSON.stringify(r)); }
else console.log('  （言語切替ボタンが見つからないので英語表示の確認は省略）');

// 利用者が自分でマイクを選び直す → track で認識（直った環境を想定して stall を外す）
await p.evaluate(() => { window.__fakeSR.stallTrack = false; });
n0 = await p.evaluate(() => window.__srStarts.length);
const dev = await p.$$eval('#micSelect option', o => o[1].value);
await p.selectOption('#micSelect', dev); await p.waitForTimeout(3000);
re = await p.evaluate(n0 => ({ after: window.__srStarts.slice(n0).map(s => s && s.kind), listening: window.jimakuApp.engine.recognizer.listening, shown: !document.getElementById('micOld').hidden,
  saved: JSON.parse(localStorage.getItem('jimakuChan_v2_ui')).micDeviceId }), n0);
check(re.listening && re.after.length && re.after.every(x => x === 'audio') && !re.shown && re.saved === dev, 'マイクを選び直すと start(track) に戻り，案内も消える: ' + JSON.stringify(re));

check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
await browser.close();
console.log(ok ? 'ALL PASS' : 'FAILED'); process.exit(ok ? 0 : 1);
