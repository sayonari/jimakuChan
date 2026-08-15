// 動画用に実際の設定画面をキャプチャし，ボタン位置を JSON に保存
import { chromium } from 'playwright';
import fs from 'fs';
const root = new URL('../../', import.meta.url).href;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1280,height:800}, deviceScaleFactor: 1.5 });
await ctx.addInitScript({ path: 'fake_sr.js' });
const p = await ctx.newPage();
await p.goto(root + 'index.html'); await p.waitForTimeout(1800);
await p.evaluate(() => document.fonts.ready);
const meta = {};
async function shot(name, sel, scrollToTabs = false) {
  if (scrollToTabs) { await p.evaluate(() => { const y = document.getElementById('tabs').getBoundingClientRect().top + window.scrollY - 70; window.scrollTo(0, y); }); await p.waitForTimeout(250); }
  else { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150); }
  await p.screenshot({ path: `assets/${name}.png` });
  meta[name] = {};
  for (const s of sel) { const bb = await p.locator(s).first().boundingBox(); meta[name][s] = bb; }
}
// 基本タブ（開始前）
await shot('ui_basic', ['#btnStart', '#btnStop', '#previewFrame', '[data-bind="recog"]', '[data-bind="trans.0"]']);
// 認識中（テキスト表示）
await p.evaluate(() => { if (document.getElementById('btnStart').hidden) return; document.getElementById('btnStart').click(); }); await p.waitForTimeout(500);
await p.evaluate(() => { const tr = window.jimakuApp.engine.translator; tr.translateOne = async (text, src, dst) => ({ lang: dst, text: 'Good evening! Let\'s start today\'s stream.', ok: true, via: 'mock' }); });
await p.evaluate(() => window.__fakeSR.say('こんばんは！今日も配信はじめていきます', {cps:60}));
await p.waitForTimeout(700);
await shot('ui_running', ['#btnStop', '#previewFrame']);
// 見た目タブ
await p.click('#tabs button[data-tab="look"]'); await p.waitForTimeout(400);
await shot('ui_look', ['[data-chips="theme"]', '#styleRows'], true);
// OBSタブ
await p.click('#tabs button[data-tab="obs"]'); await p.waitForTimeout(400);
await shot('ui_obs', ['#btnObsConnect', '#btnObsAddSource', '[data-bind="obs.password"]', '#overlayUrl'], true);
// フィルタタブ
await p.click('#tabs button[data-tab="filter"]'); await p.waitForTimeout(400);
await shot('ui_filter', ['[data-bind="filterOn"]', '#filterTestIn'], true);
fs.writeFileSync('assets/ui_meta.json', JSON.stringify(meta, null, 1));
await b.close(); console.log('captured', Object.keys(meta));
