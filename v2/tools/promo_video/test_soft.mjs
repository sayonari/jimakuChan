import { chromium } from 'playwright';
const root = new URL('../../', import.meta.url).href;
const b = await chromium.launch(); const ctx = await b.newContext(); await ctx.addInitScript({ path: 'fake_sr.js' });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto(root + 'index.html'); await p.waitForTimeout(1200);
await p.evaluate(() => { const tr = window.jimakuApp.engine.translator; tr.translateOne = async (text, src, dst) => ({ lang: dst, text: '[en] ' + text, ok: true, via: 'mock' }); window.__finals=[]; });
await p.evaluate(() => { if (document.getElementById('btnStart').hidden) return; document.getElementById('btnStart').click(); }); await p.waitForTimeout(400);
await p.evaluate(() => { const R = window.jimakuApp.engine.recognizer; R.addEventListener('final', e => window.__finals.push(e.detail)); const inst = window.webkitSpeechRecognition.active; inst._emit('', 'こんばんは 今日 も', false); setTimeout(()=>inst._emit('', 'こんばんは 今日 も よろしく', false), 200); });
await p.waitForTimeout(1300); // shortPause 750 → 仮確定
const a = await p.evaluate(() => ({ finals: window.__finals, last: window.jimakuApp.engine.lastFinal }));
// 続きを話す → Chrome が全体を本確定
await p.evaluate(() => { const inst = window.webkitSpeechRecognition.active; inst._emit('', 'こんばんは 今日 も よろしく お願いします', false); setTimeout(()=>inst._emit('こんばんは 今日 も よろしく お願いします', '', true), 150); });
await p.waitForTimeout(600);
const b2 = await p.evaluate(() => ({ finals: window.__finals, last: window.jimakuApp.engine.lastFinal }));
console.log(JSON.stringify({a, b2, errs}, null, 1));
await b.close();
