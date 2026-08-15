import { chromium } from 'playwright';
const root = new URL('../../', import.meta.url).href;
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto(root + 'index.html'); await p.waitForTimeout(2000);
console.log(await p.evaluate(async () => {
  const S = window.jimakuApp.S; const tr = window.jimakuApp.engine.translator;
  return { hasT: 'Translator' in window, avail: tr.chromeAvailable, st: await tr.chromeModelStatus(S.recog, S.trans[0]), badge: document.getElementById('modelBadge0').outerHTML, method: S.translationMethod };
}));
await b.close();
