// 回帰テスト：認識ウォッチドッグ（止まった認識の自動再開）と翻訳タイムアウト・翻訳器の作り直し
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const js = f => readFileSync(new URL('../../js/' + f, import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (/watchdog|作り直|タイムアウト/.test(m.text())) console.log('  [page]', m.text()); });
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: `
  // start() しても onstart/onend が来ない「固まる」インスタンスを作れる偽 SR
  window.__hang = false; window.__made = 0;
  class SR { constructor(){ window.__made++; this._r=false; }
    start(){ if(this._r) throw new Error('already'); this._r=true; if(window.__hang) return; setTimeout(()=>this.onstart&&this.onstart(),5); }
    stop(){ if(!this._r) return; this._r=false; setTimeout(()=>this.onend&&this.onend(),5); }
    abort(){ if(!this._r) return; this._r=false; this.onerror&&this.onerror({error:'aborted'}); this.onend&&this.onend(); } }
  window.SpeechRecognition = SR;
  // 1 回目だけ返ってこない翻訳器
  let n = 0; window.__created = 0; window.__destroyed = 0;
  window.Translator = { availability: async()=>'available', create: async()=>{ window.__created++; return {
    translate: t => (++n === 2) ? new Promise(()=>{}) : Promise.resolve('EN:' + t), destroy(){ window.__destroyed++; } }; } };
` });
await page.addScriptTag({ content: js('recognizer.js') });
await page.addScriptTag({ content: js('chrome_translator.js') });

let ok = true; const check = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) ok = false; };

// --- 1. 'starting' のまま固まった認識を作り直すか
const r1 = await page.evaluate(async () => {
  window.__hang = true;
  const R = new JimakuRecognizer({ lang: 'ja' }); let rec = null;
  R.addEventListener('recovered', e => { rec = e.detail; window.__hang = false; });
  await R.start();
  await new Promise(r => setTimeout(r, 13000));
  const res = { rec, states: R._states.slice(), made: window.__made };
  R.stop(); return res;
});
check(r1.rec && r1.rec.reason === 'stuck-starting', '固まった認識を検知: ' + JSON.stringify(r1.rec));
check(r1.states.includes('running'), '作り直し後に動いている: ' + r1.states.join(','));

// --- 2. 古いインスタンスの遅れたイベントが新しい状態を壊さないか
const r2 = await page.evaluate(async () => {
  const R = new JimakuRecognizer({ lang: 'ja' });
  await R.start(); await new Promise(r => setTimeout(r, 50));
  const old = R._instances[0];
  R._build(); R._startInstance(0); await new Promise(r => setTimeout(r, 50));
  old.onend && old.onend();                         // 古い方から遅れて onend
  await new Promise(r => setTimeout(r, 300));
  const res = R._states.slice(); R.stop(); return res;
});
check(r2[0] === 'running', '古いインスタンスの onend を無視: ' + r2.join(','));

// --- 3. 翻訳タイムアウトと作り直し
const r3 = await page.evaluate(async () => {
  const T = window.chromeTranslator; T.translateTimeout = 1500; T.maxUsesPerTranslator = 3;
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const t0 = Date.now();
    try { out.push([await T.translate('文' + i, 'ja', 'en'), Date.now() - t0]); }
    catch (e) { out.push(['ERR ' + e.name, Date.now() - t0]); }
  }
  await new Promise(r => setTimeout(r, 200));
  return { out, created: window.__created, recycle: T.recycleCount, timeouts: T.timeoutCount };
});
console.log('    ', JSON.stringify(r3));
check(r3.out[1][0] === 'ERR TimeoutError' && r3.out[1][1] < 2500, '返ってこない翻訳を打ち切る');
check(r3.out[2][0] === 'EN:文3', 'タイムアウト後の翻訳は作り直した翻訳器で成功');
check(r3.recycle >= 1, '規定回数で翻訳器を作り直す（' + r3.recycle + '回）');

await browser.close();
process.exit(ok ? 0 : 1);
