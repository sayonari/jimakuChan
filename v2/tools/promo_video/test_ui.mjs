import { chromium } from 'playwright';
const root = new URL('../../', import.meta.url).href;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const p = await ctx.newPage();
const errs=[]; p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); }); p.on('pageerror', e => errs.push('PAGEERR: '+e.message));
await p.goto(root + 'index.html'); await p.waitForTimeout(2500);
await p.screenshot({ path: '../../.output/ui_basic.png', fullPage: true });
for (const tab of ['look','obs','filter','save']) { await p.click(`#tabs button[data-tab="${tab}"]`); await p.waitForTimeout(400); await p.screenshot({ path: `../../.output/ui_${tab}.png`, fullPage: true }); }
// preset switch
await p.click('#tabs button[data-tab="basic"]'); await p.selectOption('#presetSelect','cute_streaming'); await p.waitForTimeout(800);
await p.screenshot({ path: '../../.output/ui_preset_cute.png' });
// simulate a subtitle via app API
await p.evaluate(()=>{ window.jimakuApp.showLine(0,'こんにちは，音声認識字幕ちゃんです','テスト中',true); window.jimakuApp.showLine(1,'Hello, this is jimakuChan',"",true); });
await p.waitForTimeout(700); await p.screenshot({ path: '../../.output/ui_live.png' });
console.log(errs.join('\n')||'no console errors');
await b.close();
