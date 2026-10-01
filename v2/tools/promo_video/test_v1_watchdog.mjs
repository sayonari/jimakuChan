// 回帰テスト：v1（main.html）の認識ウォッチドッグ
import { chromium } from 'playwright';
const root = new URL('../../../', import.meta.url).href;
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = []; page.on('console', m => { if (/watchdog/.test(m.text())) logs.push(m.text()); });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.addInitScript(() => {
  window.__hang = true; window.__made = 0;   // 最初は start() しても何も返さない（固まる）
  class SR extends EventTarget { constructor(){ super(); window.__made++; this._r=false; }
    _fire(t, ex){ const e = Object.assign(new Event(t), ex||{}); this['on'+t] && this['on'+t](e); this.dispatchEvent(e); }
    start(){ if(this._r) throw new Error('already'); this._r=true; if(window.__hang) return; setTimeout(()=>this._fire('start'),5); }
    stop(){ if(!this._r) return; this._r=false; setTimeout(()=>this._fire('end'),5); }
    abort(){ if(!this._r) return; this._r=false; this._fire('error',{error:'aborted'}); this._fire('end'); } }
  SR.available = async () => 'unavailable';
  window.webkitSpeechRecognition = SR; window.SpeechRecognition = SR;
});
await page.goto(root + 'main.html?recog=ja');
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__hang = false; });   // 作り直した後は正常に動く
await page.waitForTimeout(12000);
const st = await page.evaluate(() => ({ states: recognitionStates.slice(), made: window.__made, rec: watchdogRecoveries }));
console.log(logs.join('\n')); console.log(JSON.stringify(st), errs);
const ok = st.rec >= 1 && st.states.includes('running') && st.made >= 4 && !errs.length;
console.log(ok ? 'OK  v1 ウォッチドッグで再開' : 'NG');
await browser.close(); process.exit(ok ? 0 : 1);
