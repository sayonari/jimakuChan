import { chromium } from 'playwright';
import fs from 'fs';
const root = new URL('../../', import.meta.url).href;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1280,height:720} });
await ctx.addInitScript({ path: 'fake_sr.js' });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e => errs.push('PAGEERR: '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto(root + 'index.html'); await p.waitForTimeout(1500);
// 翻訳をモック（Chrome翻訳がない環境用）
await p.evaluate(() => { const tr = window.jimakuApp.engine.translator; tr.translateOne = async (text, src, dst) => ({ lang: dst, text: '[' + dst + '] ' + text, ok: true, via: 'mock' }); });
await p.evaluate(() => { if (document.getElementById('btnStart').hidden) return; document.getElementById('btnStart').click(); }); await p.waitForTimeout(600);
const s1 = await p.evaluate(() => window.__fakeSR.say('今日も配信始めていきます，よろしくお願いします', {cps:20}));
await p.waitForTimeout(400); await p.screenshot({ path: '../../.output/flow1.png' });
const s2 = await p.evaluate(() => window.__fakeSR.say('このゲームむずかしすぎる，くそっ', {cps:25}));
await p.waitForTimeout(600); await p.screenshot({ path: '../../.output/flow2.png' });
const st = await p.evaluate(() => ({ pill: document.querySelector('#pillMic').textContent, last: window.jimakuApp.engine.lastFinal, cnt: document.querySelector('#transCountLabel').textContent }));
console.log({s1,s2,st}); console.log(errs.join('\n')||'no errors');
await b.close();
