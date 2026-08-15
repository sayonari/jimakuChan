import { chromium } from 'playwright';
const root = new URL('../../', import.meta.url).href;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:1280,height:900} });
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto(root + 'index.html'); await p.waitForTimeout(1500);
await p.click('#langEn'); await p.waitForTimeout(500);
await p.click('#tabs button[data-tab="filter"]'); await p.waitForTimeout(300);
await p.fill('#filterTestIn', 'what the fuck, this class is hell'); await p.waitForTimeout(300);
await p.screenshot({ path: '../../.output/ui_en_filter.png', fullPage: true });
// export/import roundtrip
const json = await p.evaluate(() => window.jimakuApp.store.exportJSON());
const ok = await p.evaluate(j => { try { window.jimakuApp.store.importJSON(j); return true; } catch(e) { return e.message; } }, json);
// v1 migration test
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('jimakuChan_presets', JSON.stringify({ default:{ name:'x', settings:{ recog:'en-US', trans:'ja', size1:'30', color1:'#ff0000', speech_text_font_selector:'M PLUS Rounded\\\\ 1c', anti_sexual:true, timer:'5000', v_align:'top' } } })); localStorage.setItem('selectedPreset','default'); });
await p.reload(); await p.waitForTimeout(1500);
const mig = await p.evaluate(() => { const S = window.jimakuApp.S; return { recog:S.recog, trans:S.trans, size:S.lines[0].size, color:S.lines[0].color, font:S.lines[0].font, filterOn:S.filterOn, timer:S.timer, vAlign:S.vAlign }; });
console.log({ ok, mig, errs });
await b.close();
