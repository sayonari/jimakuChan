#!/usr/bin/env node
// ドパガキ PV 用の実画面キャプチャ（file:// ＋ init script のモックのみ．サーバーは立てない）
//   node capture_hype.mjs   → build/hype/<clip>/00001.jpg …（30fps）＋ build/hype/meta.json（各部品の座標）
// v2 本体は変更しない：マイク名・メーターの波形・ドロップダウン（ネイティブ popup は撮れないので模擬 DOM）は撮影時だけ注入する
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
const root = new URL('../../', import.meta.url).href;
const B = 60 / 170;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fake = fs.readFileSync(new URL('./fake_sr.js', import.meta.url), 'utf8');
const log = (...a) => console.log('[capture_hype]', ...a);

// ---- 撮影用モック（init script）----
const MOCK = `(() => {
  const DEV = [
    { deviceId: 'default', label: '既定 - マイク (USB Audio)' },
    { deviceId: 'communications', label: '通信既定 - マイク (USB Audio)' },
    { deviceId: 'dev-usb', label: 'マイク (USB Audio)' },
    { deviceId: 'dev-cable', label: 'CABLE Output (VB-Audio Virtual Cable)' },
    { deviceId: 'dev-mix', label: 'ステレオ ミキサー (Realtek(R) Audio)' },
    { deviceId: 'dev-cam', label: 'Webカメラ C920 のマイク' },
    { deviceId: 'dev-bt', label: 'ヘッドセット マイク (Bluetooth)' },
  ].map((d, i) => ({ kind: 'audioinput', groupId: 'g' + i, ...d, toJSON() { return this; } }));
  const md = navigator.mediaDevices;
  md.enumerateDevices = async () => DEV;
  const gum = md.getUserMedia.bind(md);
  md.getUserMedia = c => { if (c && c.audio && typeof c.audio === 'object') { c = { ...c, audio: { ...c.audio } }; delete c.audio.deviceId; } return gum(c); };
  // メーター：拍に合わせて跳ねる波形（本体のメーターは AnalyserNode の RMS を読む）
  window.__mode = 'bounce';
  const t0 = performance.now();
  AnalyserNode.prototype.getFloatTimeDomainData = function (b) {
    const t = (performance.now() - t0) / 1000, beat = t * 170 / 60, ph = beat % 1, k = Math.floor(beat);
    const r = Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1;
    let db = window.__mode === 'quiet' ? -55 : -50 + (30 + 12 * r) * Math.exp(-ph * 3.2);
    if (window.__mode === 'loud') db += 8;
    const a = Math.pow(10, Math.min(-1.5, db) / 20) * 1.414;
    for (let i = 0; i < b.length; i++) b[i] = a * Math.sin(i * 0.3 + t * 50);
  };
  // 模擬ドロップダウン
  const dd = { el: null,
    open(id) { this.close(); const s = document.getElementById(id), r = s.getBoundingClientRect(); const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const el = document.createElement('div'); el.id = '__dd';
      el.style.cssText = 'position:fixed;z-index:99999;background:#fff;color:#111;border:1px solid #777;box-shadow:0 8px 24px rgba(0,0,0,.35);font:15px/1 "Hiragino Sans",sans-serif;padding:2px 0;left:' + (r.left / z) + 'px;top:' + ((r.bottom + 4) / z) + 'px;width:' + (r.width / z) + 'px';
      [...s.options].forEach((o, i) => { const d = document.createElement('div'); d.textContent = o.textContent; d.dataset.i = i; d.style.cssText = 'padding:9px 12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'; el.appendChild(d); });
      document.body.appendChild(el); this.el = el; this.hover(0); },
    hover(i) { if (!this.el) return; [...this.el.children].forEach((d, j) => { d.style.background = i === j ? '#0078d4' : ''; d.style.color = i === j ? '#fff' : '#111'; }); },
    close() { if (this.el) this.el.remove(); this.el = null; },
    rect() { const r = this.el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; } };
  window.__dd = dd;
})();`;

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const meta = {};
fs.rmSync('build/hype', { recursive: true, force: true }); fs.rmSync('build/hype_raw', { recursive: true, force: true });
fs.mkdirSync('build/hype', { recursive: true });

async function record(name, dur, { page: pageUrl = 'index.html', setup, script }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['microphone'], recordVideo: { dir: `build/hype_raw/${name}`, size: { width: 1280, height: 720 } } });
  await ctx.addInitScript(fake); await ctx.addInitScript(MOCK);
  const tp = Date.now();
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('  pageerror', name, e.message));
  await p.goto(root + pageUrl); await p.waitForTimeout(2800);
  const m = {};
  if (setup) await setup(p, m);
  const t0 = Date.now(); const off = (t0 - tp) / 1000;
  const at = async s => { const w = t0 + s * 1000 - Date.now(); if (w > 0) await sleep(w); };
  await script(p, at, m);
  await at(dur + 0.2);
  const vp = await p.video().path();
  await ctx.close();
  fs.mkdirSync(`build/hype/${name}`, { recursive: true });
  execSync(`ffmpeg -y -loglevel error -ss ${off.toFixed(3)} -t ${dur} -i "${vp}" -vf fps=30 -q:v 2 build/hype/${name}/%05d.jpg`);
  const n = fs.readdirSync(`build/hype/${name}`).length;
  meta[name] = { n, dur, rects: m };
  log(name, n, 'frames', 'offset', off.toFixed(2));
}
const rectsOf = (p, sels) => p.evaluate(sels => { const o = {}; for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); o[k] = { x: r.x, y: r.y, width: r.width, height: r.height }; } } return o; }, sels);
const SELS = { select: '#micSelect', meter: '#micMeter', mute: '#btnMute', micbox: '#micBox', gain: '#micGain', gate: '#micGateOn', gateSl: '#micGate', mic2: '#mic2Select', mic2vol: '#mic2Vol', adv: '#micAdv' };
const prep = (adv, top = 24) => async (p, m) => {
  await p.evaluate(([adv, top]) => {
    document.documentElement.style.zoom = 1.5;
    document.getElementById('micAdv').open = adv;
    for (const e of document.querySelectorAll('*')) { const ps = getComputedStyle(e).position; if (ps === 'sticky' || ps === 'fixed') e.style.visibility = 'hidden'; }
    const r = document.getElementById('micBox').getBoundingClientRect(); scrollTo(0, scrollY + r.top - top);
  }, [adv, top]);
  await p.waitForTimeout(600);
  Object.assign(m, await rectsOf(p, SELS));
};
const setRange = (p, sel, v) => p.evaluate(([sel, v]) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const optIndex = (p, sel, re) => p.evaluate(([sel, re]) => [...document.querySelector(sel).options].findIndex(o => new RegExp(re).test(o.textContent)), [sel, re]);

// A) マイクを選ぶ（シーン2，26 拍）
await record('mic', 26 * B, { setup: prep(false, 40), script: async (p, at, m) => {
  const iu = await optIndex(p, '#micSelect', 'USB Audio\\)$');
  await at(2.12); await p.evaluate(() => __dd.open('micSelect')); m.dd = await p.evaluate(() => __dd.rect());
  for (const [t, i] of [[2.5, 1], [2.9, 3], [3.25, 4], [3.6, iu]]) { await at(t); await p.evaluate(i => __dd.hover(i), i); }
  await at(4.7); await p.evaluate(() => __dd.close());
  await p.selectOption('#micSelect', { index: iu });
} });
// B) 入力レベルメーター（シーン3，10 拍）
await record('meter', 10 * B, { setup: prep(false, 40), script: async () => {} });
// C) overlay の声量反応（シーン4，14 拍）
await record('loud', 14 * B, { page: 'overlay.html?preview=1', setup: async p => {
  const cfg = { bgcolor: '#2a0a5e', bgTransparent: false, loudReact: true, loudStrength: 'strong', textAlign: 'center', vAlign: 'middle', interimLeft: '', interimRight: '',
    lines: [{ font: 'Rounded M+ 2c', size: 90, weight: 900, color: '#ffffff', strokeColor: '#ff1493', strokeWidth: 18 }, { font: 'Rounded M+ 2c', size: 34, weight: 800, color: '#ffe066', strokeColor: '#000', strokeWidth: 8 }] };
  await p.evaluate(c => window.jimakuOverlay.handle({ type: 'config', config: c }), cfg);
  await p.evaluate(() => window.jimakuOverlay.handle({ type: 'text', slot: 0, text: '', interim: 'うおおおお！！' }));
}, script: async (p, at) => {
  const B = 60 / 170; const t0 = Date.now();
  // 声量を level メッセージで 15Hz 駆動：最初は小声→ 2.7 秒で一気に叫ぶ→拍に合わせて脈動→ 4.5 秒で一度しぼむ
  const lv = t => t < 2.6 ? 0.08 : t < 3.0 ? 0.08 + (t - 2.6) / 0.4 * 0.92 : t < 4.4 ? 0.6 + 0.4 * Math.exp(-((t / B) % 1) * 2.5) : t < 4.8 ? 0.15 : 0.7 + 0.3 * Math.exp(-((t / B) % 1) * 2.5);
  while ((Date.now() - t0) / 1000 < 14 * B + 0.2) { const t = (Date.now() - t0) / 1000; await p.evaluate(v => window.jimakuOverlay.handle({ type: 'level', v }), lv(t)); await sleep(60); }
} });
// D) 2 つ目の入力（シーン5，10 拍）
await record('mic2', 10 * B, { setup: prep(true, 24), script: async (p, at, m) => {
  const ib = await optIndex(p, '#mic2Select', 'Bluetooth');
  await at(1.8); await p.evaluate(() => __dd.open('mic2Select')); m.dd = await p.evaluate(() => __dd.rect());
  for (const [t, i] of [[2.1, 2], [2.4, 4], [2.7, ib]]) { await at(t); await p.evaluate(i => __dd.hover(i), i); }
  await at(3.1); await p.evaluate(() => __dd.close());
  await p.selectOption('#mic2Select', { index: ib });
  await at(3.4); await setRange(p, '#mic2Vol', 140);
} });
// E) 音量ブースト・ノイズゲート・ミュート（シーン6，12 拍）
await record('adjust', 12 * B, { setup: prep(true, 24), script: async (p, at) => {
  for (let i = 0; i <= 12; i++) { await at(0.1 + i * 0.09); await setRange(p, '#micGain', i); }
  await at(1.5); await p.evaluate(() => { const e = document.getElementById('micGateOn'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  for (let i = 0; i <= 10; i++) { await at(2.0 + i * 0.07); await setRange(p, '#micGate', -50 + i * 1.5); }
  await at(3.0); await p.click('#btnMute');
} });
fs.writeFileSync('build/hype/meta.json', JSON.stringify(meta, null, 1));
await browser.close(); log('done');
