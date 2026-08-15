import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:1200,height:520} });
await p.setContent(`<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@900&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0f0;font-family:'M PLUS Rounded 1c';font-weight:900;font-size:40px;color:#fff;padding:10px}
.l{position:relative;display:inline-block;margin:6px 0}
.l::before{content:attr(data-text);position:absolute;inset:0;z-index:-1;color:transparent;white-space:pre-wrap}
.a::before{-webkit-text-stroke:16px #123}
.b::before{text-shadow:var(--sh)}
</style>
<div><span class="l a" data-text="ハ！Wアメ縁取り 今日も配信！">ハ！Wアメ縁取り 今日も配信！</span></div>
<div><span class="l b" id="b" data-text="ハ！Wアメ縁取り 今日も配信！">ハ！Wアメ縁取り 今日も配信！</span></div>
<div><span class="l b" id="c" data-text="ハ！Wアメ縁取り 今日も配信！">ハ！Wアメ縁取り 今日も配信！</span></div>`);
await p.evaluate(() => document.fonts.ready);
const mk = (r, color) => { const out=[]; const step=Math.max(1.5, r/6); for (let rr=r; rr>0.5; rr-=step){ const n=Math.min(36, Math.max(8, Math.round(2*Math.PI*rr/1.6))); for(let i=0;i<n;i++){ const a=2*Math.PI*i/n; out.push(`${(rr*Math.cos(a)).toFixed(2)}px ${(rr*Math.sin(a)).toFixed(2)}px 0 ${color}`);} } return out.join(','); };
const t0=Date.now();
await p.evaluate(({s1,s2})=>{ document.getElementById('b').style.setProperty('--sh', s1); document.getElementById('c').style.setProperty('--sh', s2); }, { s1: mk(8,'#123'), s2: mk(27,'#a03') });
console.log('shadows for r=8:', mk(8,'#123').split(',').length, ' r=27:', mk(27,'#a03').split(',').length);
await p.waitForTimeout(300);
const t1=Date.now(); for(let i=0;i<10;i++){ await p.evaluate(i=>{ document.getElementById('c').textContent='ハ！Wアメ縁取り 今日も配信！'+i; document.getElementById('c').dataset.text='ハ！Wアメ縁取り 今日も配信！'+i; },i); await p.screenshot(); }
console.log('10 repaints+shots ms:', Date.now()-t1);
await p.screenshot({ path: '../../.output/stroke_proto.png' });
await b.close();
