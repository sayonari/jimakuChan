// 音声処理（ゲイン・ゲート・2 つ目の入力・ミュート）と声量反応のテスト（Chromium のフェイクデバイス．サーバーは立てず file:// で開く）
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { readFileSync, mkdirSync } from 'fs';
const root = new URL('../../', import.meta.url).href;
const fake = readFileSync(new URL('./fake_sr.js', import.meta.url), 'utf8');
mkdirSync(new URL('./build/', import.meta.url), { recursive: true });
const shot = n => fileURLToPath(new URL('./build/' + n, import.meta.url));
let ok = true; const check = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) ok = false; };
const base = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(fake);
  if (init) await p.addInitScript(init);
  await p.goto(root + 'index.html'); await p.waitForTimeout(2500);
  return { ctx, p, errs };
}
const lastStart = p => p.evaluate(() => { const a = window.__srStarts, l = a[a.length - 1]; return l && Object.assign({ rawId: window.jimakuApp.engine.mic.track.id }, l); });
const setRange = (p, sel, v) => p.evaluate(([sel, v]) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const isProc = s => s && /Destination/i.test(s.label) && s.id !== s.rawId;

// ---- 実ブラウザ（autoplay 許可：AudioContext が running）----
{
  const browser = await chromium.launch({ args: [...base, '--autoplay-policy=no-user-gesture-required'] });
  const { ctx, p, errs } = await open(browser);
  const st0 = await lastStart(p);
  check(st0 && !isProc(st0) && st0.id === st0.rawId, '(0) 既定（ゲイン 0・ゲートなし・2 つ目なし）では生の track で認識: ' + JSON.stringify(st0 && st0.label));
  check(await p.evaluate(() => window.jimakuApp.engine.mic.ctxState) === 'running', 'AudioContext は running');
  await p.evaluate(() => { document.getElementById('micAdv').open = true; });

  // (1) ゲイン
  const n0 = await p.evaluate(() => window.__srStarts.length);
  await setRange(p, '#micGain', 6); await p.waitForTimeout(1500);
  const st1 = await lastStart(p), n1 = await p.evaluate(() => window.__srStarts.length);
  check(isProc(st1) && n1 > n0, '(1) ゲイン +6 dB で処理後 track（MediaStreamAudioDestinationNode）に切り替わり認識が再起動した: ' + JSON.stringify({ label: st1.label, n: [n0, n1] }));
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('jimakuChan_v2_ui')).micGain) === 6, 'ゲインが UI ストレージに保存された');
  check(await p.evaluate(() => Math.abs(window.jimakuApp.engine.mic._g1.gain.value - Math.pow(10, 6 / 20)) < 0.05), 'GainNode に +6 dB が反映');
  await setRange(p, '#micGain', 9); await p.waitForTimeout(800);
  check(await p.evaluate(() => window.__srStarts.length) === n1, 'ゲインの追加変更では認識を再起動しない');
  const lv = await p.evaluate(async () => { const xs = []; for (let i = 0; i < 20; i++) { xs.push(document.getElementById('micFill').style.clipPath); await new Promise(r => setTimeout(r, 100)); } return new Set(xs).size; });
  check(lv > 3, 'メーターは処理後の音で動く（' + lv + ' 種）');
  await setRange(p, '#micGain', 0); await p.waitForTimeout(1500);
  check(!isProc(await lastStart(p)), 'ゲイン 0 に戻すと生の track に戻る');

  // ノイズゲート：フェイクマイクは断続的なビープ→無音で閉じるはず
  await p.evaluate(() => { const e = document.getElementById('micGateOn'); e.checked = true; e.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1500);
  check(isProc(await lastStart(p)), 'ゲートをオンにすると処理後 track');
  const seen = await p.evaluate(async () => { const s = new Set(); for (let i = 0; i < 60; i++) { s.add(document.getElementById('micGateTag').hidden ? 'open' : 'closed'); await new Promise(r => setTimeout(r, 100)); } return [...s]; });
  console.log('  ゲート状態:', JSON.stringify(seen));
  check(seen.includes('closed'), 'ゲートが閉じる（ゲート閉の表示）');
  await p.evaluate(() => { const e = document.getElementById('micGateOn'); e.checked = false; e.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1200);
  check(!isProc(await lastStart(p)), 'ゲートをオフに戻すと生の track');

  // (3) 2 つ目の入力
  const opts = await p.$$eval('#mic2Select option', o => o.map(x => x.value));
  check(opts.length >= 3 && opts[0] === '', '2 つ目の入力の選択肢（なし＋実デバイス）');
  const m0 = await p.evaluate(() => window.__srStarts.length);
  await p.selectOption('#mic2Select', opts[2]); await p.waitForTimeout(1800);
  const st3 = await lastStart(p);
  check(isProc(st3) && await p.evaluate(() => window.__srStarts.length) > m0 && await p.evaluate(() => !!window.jimakuApp.engine.mic.stream2), '(3) 2 つ目の入力を選ぶとミックス track で start された: ' + JSON.stringify(st3.label));
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('jimakuChan_v2_ui')).mic2DeviceId) === opts[2], '2 つ目の deviceId が UI ストレージに保存された');
  await setRange(p, '#mic2Vol', 50);
  await p.waitForTimeout(300);
  check(await p.evaluate(() => Math.abs(window.jimakuApp.engine.mic._g2.gain.value - 0.5) < 0.05), '2 つ目の音量が GainNode に反映');
  await p.selectOption('#mic2Select', ''); await p.waitForTimeout(1500);
  check(!isProc(await lastStart(p)) && await p.evaluate(() => !window.jimakuApp.engine.mic.stream2), '「なし」に戻すと生の track');

  // (4) ミュート
  const frame = () => p.frames().find(f => /overlay\.html/.test(f.url()));
  const line0 = () => frame().evaluate(() => document.getElementById('line0').querySelector('.txt').textContent);
  p.evaluate(() => window.__fakeSR.say('ミュートの試験につかう長めの文章をゆっくり話します', { cps: 4 })).catch(() => {});   // 確定まで resolve しないので await しない
  await p.waitForTimeout(1500);
  check((await line0()).length > 0, '(4) 途中結果が overlay に出ている: ' + (await line0()));
  await p.click('#btnMute'); await p.waitForTimeout(500);
  check((await line0()) === '', '(4) ミュートで途中結果が消えた');
  check(await p.evaluate(() => !document.getElementById('micMuted').hidden), '(4) 「ミュート中」表示');
  check(await p.evaluate(() => window.jimakuApp.engine.mic.track.enabled === false && window.jimakuApp.engine.mic._mute.gain.value < 0.05), '(4) track.enabled=false かつミュート用 gain 0');
  await p.waitForTimeout(3000);
  check((await line0()) === '', '(4) ミュート中は後から届いた結果も表示しない');
  await p.keyboard.press('Control+Shift+M'); await p.waitForTimeout(500);
  check(await p.evaluate(() => !window.jimakuApp.engine.muted && document.getElementById('micMuted').hidden && window.jimakuApp.engine.mic.track.enabled), '(4) Ctrl+Shift+M で解除（ショートカット）');
  await p.keyboard.press('Control+Shift+M'); await p.waitForTimeout(300);
  check(await p.evaluate(() => window.jimakuApp.engine.muted), 'Ctrl+Shift+M でミュート');
  await p.keyboard.press('Control+Shift+M'); await p.waitForTimeout(300);

  // (2) 声量反応：オフのときは level を送らない／オンで送る
  await p.evaluate(() => { window.__lv = []; const bc = new BroadcastChannel('jimakuChan'); bc.onmessage = e => { if (e.data && e.data.type === 'level') window.__lv.push(e.data.v); }; });
  await p.waitForTimeout(1500);
  check(await p.evaluate(() => window.__lv.length) === 0, '(2) 声量反応オフでは level を送らない');
  await p.evaluate(() => { const e = document.querySelector('[data-bind="loudReact"]'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForTimeout(250);
  p.evaluate(() => window.__fakeSR.say('叫ぶと字幕が大きくなるかどうかを試すための長い文章です', { cps: 3 })).catch(() => {});
  await p.waitForTimeout(3500);
  const lvs = await p.evaluate(() => window.__lv.slice());
  console.log('  level 受信数', lvs.length, '範囲', Math.min(...lvs), '-', Math.max(...lvs));
  check(lvs.length > 10 && lvs.every(v => typeof v === 'number' && v >= 0 && v <= 1), '(2) オンで level（0〜1 の数値）を約 15Hz で送る');
  check(await frame().evaluate(() => window.jimakuOverlay.getConfig().loudReact === true), 'overlay の config に loudReact が届いた');
  await ctx.close(); await browser.close();
}

// ---- overlay 単体：level で --lv と transform が変わる，スクリーンショット ----
{
  const browser = await chromium.launch({ args: base });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 300 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(root + 'overlay.html?preview=1'); await p.waitForTimeout(1200);
  const cfg = { bgcolor: '#2b6cb0', bgTransparent: false, loudReact: true, loudStrength: 'strong', textAlign: 'center', vAlign: 'bottom',
    lines: [{ font: 'M PLUS Rounded 1c', size: 30, weight: 900, color: '#fff', strokeColor: '#c2185b', strokeWidth: 7 }, { font: 'M PLUS Rounded 1c', size: 24, weight: 800, color: '#ffe066', strokeColor: '#000', strokeWidth: 5 }] };
  const H = m => p.evaluate(m => window.jimakuOverlay.handle(m), m);
  await H({ type: 'config', config: cfg });
  await H({ type: 'text', slot: 0, text: '', interim: 'うおおおお！！ぜんぶ倒したぞー！' });
  await H({ type: 'text', slot: 1, text: 'Whoooa! I beat them all!' });
  const get = () => p.evaluate(() => { const l = document.getElementById('line0'); return { tf: getComputedStyle(l).transform, lv: l.style.getPropertyValue('--lv'), cls: l.className, origin: getComputedStyle(l).transformOrigin, l1: getComputedStyle(document.getElementById('line1')).transform }; });
  await H({ type: 'level', v: 0 }); await p.waitForTimeout(300);
  const a = await get();
  await H({ type: 'level', v: 1 }); await p.waitForTimeout(300);
  const b = await get();
  console.log('  v=0', JSON.stringify(a)); console.log('  v=1', JSON.stringify(b));
  check(a.cls.includes('loud-live') && b.lv === '1.000' && a.tf !== b.tf && (() => { const k = parseFloat(b.tf.slice(7)); return k > 1.05 && k <= 1.6; })(), '(2) level で認識行に --lv が付き transform が変わる（strong 最大 1.6 倍・画面幅で上限）');
  check(b.l1 === 'none', '(2) 翻訳行（slot1）は動かさない');
  await H({ type: 'level', v: 0.6 }); await p.waitForTimeout(250);
  await p.screenshot({ path: shot('loud_overlay.png') });
  // 確定すると反応を止める（古い行は揺らさない）
  await H({ type: 'text', slot: 0, text: 'ぜんぶ倒したぞー！', interim: '' });
  check(!(await get()).cls.includes('loud-live'), '(2) 確定済みの行は動かさない');
  // 配置に合わせた transform-origin
  await H({ type: 'config', config: Object.assign({}, cfg, { textAlign: 'left', vAlign: 'top' }) });
  await H({ type: 'text', slot: 0, text: '', interim: 'ひだりうえ' }); await H({ type: 'level', v: 1 }); await p.waitForTimeout(200);
  const lt = (await get()).origin;
  check(/^0px 0px$/.test(lt), '(2) transform-origin が配置（左・上）に合う: ' + lt);
  // オフなら無視
  await H({ type: 'config', config: Object.assign({}, cfg, { loudReact: false }) });
  await H({ type: 'text', slot: 0, text: '', interim: 'オフ' }); await H({ type: 'level', v: 1 }); await p.waitForTimeout(200);
  check((await get()).tf === 'none', '(2) loudReact オフでは level を無視');
  check(errs.length === 0, 'overlay pageerror なし ' + errs.join('|'));
  await ctx.close(); await browser.close();
}

// ---- AudioContext が suspended（ユーザー操作前）を再現：最初の pointerdown までは resume を無効にする ----
{
  const browser = await chromium.launch({ args: [...base, '--autoplay-policy=no-user-gesture-required'] });
  const { ctx, p, errs } = await open(browser, `(() => { const AC = window.AudioContext; window.__gesture = false;
    addEventListener('pointerdown', () => { window.__gesture = true; }, true);
    window.AudioContext = class extends AC { constructor(...a) { super(...a); this.suspend(); const r = this.resume.bind(this); this.resume = () => window.__gesture ? r() : Promise.resolve(); } }; })();`);
  const state = await p.evaluate(() => window.jimakuApp.engine.mic.ctxState);
  check(state === 'suspended', '(suspended) 操作前の AudioContext は suspended: ' + state);
  await setRange(p, '#micGain', 6); await p.waitForTimeout(800);
  const s1 = await lastStart(p);
  check(!isProc(s1), '(suspended) ゲイン +6 でも running でない間は生の track で認識');
  check(await p.evaluate(() => !document.getElementById('micProcNote').hidden), '(suspended) 「クリックで有効」の案内を表示');
  await p.mouse.click(640, 5); await p.waitForTimeout(1800);
  check(isProc(await lastStart(p)) && await p.evaluate(() => document.getElementById('micProcNote').hidden), '(suspended) 最初のクリックで running → 処理後 track に切り替え，案内が消える');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close(); await browser.close();
}

// ---- 処理後 track を start が拒否 → 生 track にフォールバック ----
{
  const browser = await chromium.launch({ args: [...base, '--autoplay-policy=no-user-gesture-required'] });
  const { ctx, p, errs } = await open(browser, 'window.__fakeSR.rejectProcessed = true;');
  await setRange(p, '#micGain', 6); await p.waitForTimeout(2000);
  const s = await lastStart(p);
  check(s && !isProc(s) && s.id === s.rawId, '(拒否) 処理後 track が拒否されたら生 track で認識を続ける');
  check(await p.evaluate(() => window.jimakuApp.engine.mic.procBlocked && window.jimakuApp.engine.recognizer.listening && window.jimakuApp.engine.trackSupported !== false), '(拒否) 認識は動いており，start(track) 全体の未対応とは扱わない');
  check(await p.evaluate(() => !document.getElementById('micProcNote').hidden), '(拒否) 案内を表示');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close(); await browser.close();
}

// ---- 旧 Chrome（start(track) 未対応）：音声処理は無効表示，ミュートは stop/start ----
{
  const browser = await chromium.launch({ args: [...base, '--autoplay-policy=no-user-gesture-required'] });
  const { ctx, p, errs } = await open(browser, 'window.__fakeSR.rejectTrack = true;');
  check(await p.evaluate(() => ['#micGain', '#micGateOn', '#micGate', '#mic2Select', '#mic2Vol'].every(s => document.querySelector(s).disabled)), '(旧 Chrome) 音声処理の入力が無効表示');
  await p.click('#btnMute'); await p.waitForTimeout(400);
  check(await p.evaluate(() => !window.jimakuApp.engine.recognizer.running && window.jimakuApp.engine.running), '(旧 Chrome) ミュートで recognizer を stop');
  await p.click('#btnMute'); await p.waitForTimeout(600);
  check(await p.evaluate(() => window.jimakuApp.engine.recognizer.running), '(旧 Chrome) 解除で start');
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close(); await browser.close();
}

// ---- スクリーンショット：設定画面 ----
{
  const browser = await chromium.launch({ args: [...base, '--autoplay-policy=no-user-gesture-required'] });
  const { ctx, p, errs } = await open(browser);
  await p.evaluate(() => { document.getElementById('micAdv').open = true; });
  await setRange(p, '#micGain', 6);
  await p.evaluate(() => { const e = document.getElementById('micGateOn'); e.checked = true; e.dispatchEvent(new Event('change')); });
  await p.selectOption('#mic2Select', await p.$$eval('#mic2Select option', o => o[2].value));
  await p.waitForTimeout(2500);
  const box = await p.$eval('#micBox', e => { const r = e.getBoundingClientRect(); return { x: r.x - 10, y: r.y + scrollY - 10, width: r.width + 20, height: r.height + 20 }; });
  await p.screenshot({ path: shot('audio_ui.png'), clip: box, fullPage: true });
  check(errs.length === 0, 'pageerror なし ' + errs.join('|'));
  await ctx.close(); await browser.close();
}
console.log(ok ? 'ALL PASS' : 'FAILED'); process.exit(ok ? 0 : 1);
