/*
 * jimakuChan v2 – 設定画面 & エンジンホスト
 *
 *  index.html が「認識・翻訳・フィルタ・タイマー」をすべて担当し，結果を
 *   - プレビュー iframe（overlay.html?preview=1）           postMessage
 *   - 表示ウィンドウ（overlay.html?popup=1，クロマキー用）  postMessage + BroadcastChannel
 *   - OBS ブラウザソース（overlay.html）                     obs-websocket → obs-browser emit_event
 *  へ同じメッセージで配る．
 */
(function () {
  'use strict';

  const { PresetStore, DEFAULTS, VERSION, clone, deepMerge, ui } = window.JimakuPresets;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const t = (k, ...a) => window.i18n.t(k, ...a);

  // ======================================================================
  // 状態
  // ======================================================================
  const store = new PresetStore();
  let S = store.get(store.currentId);          // 現在の設定（完全形）
  let uiState = ui.load();
  const engine = {
    recognizer: null, translator: new window.JimakuTranslator(), obs: new window.ObsClient(),
    filterRecog: null, filterTrans: [null, null, null], replaceRules: [],
    running: false,
    lastFinal: '', interim: '',
    speechTimer: null, transTimer: null, speechTimerStart: 0, transTimerStart: 0, barRAF: null,
    popup: null, bc: null,
    interimThrottle: 0,
  };
  try { engine.bc = new BroadcastChannel('jimakuChan'); } catch (e) {}

  const FONTS = [
    'M PLUS Rounded 1c', 'M PLUS 1p', 'Zen Kaku Gothic New', 'Zen Maru Gothic', 'Noto Sans JP', 'Sawarabi Gothic',
    'Kosugi Maru', 'Mochiy Pop One', 'Hachi Maru Pop', 'Yusei Magic', 'Reggae One', 'RocknRoll One', 'Dela Gothic One', 'Kaisei Decol', 'Nico Moji',
    // ローカル同梱（font.css）
    'Mamelon', 'YasashisaB', 'HuiFont29', 'MkPOP', 'bananaslipplus', 'katyou', 'TanukiMagic', 'hakidame', 'umeboshi', 'Jiyucho', 'HitmoR', 'nishikiteki', 'Nikumaru', 'KTEGAKI', 'JKGL', 'OhisamaFont', 'nukamiso', 'genkai', 'CP',
  ];
  const FONT_LABEL = { Mamelon: 'マメロン', YasashisaB: 'やさしさB', HuiFont29: 'ふい字', MkPOP: '851マカポップ', bananaslipplus: 'バナナスリップplus', katyou: '花鳥風月', TanukiMagic: 'たぬき油性マジック', hakidame: '吐き溜', umeboshi: '梅干し', Jiyucho: 'じゆうちょう', HitmoR: 'Hitmo', nishikiteki: 'にしき的', Nikumaru: 'にくまる', KTEGAKI: 'kawaii手書き', JKGL: 'JK Gothic L', OhisamaFont: 'おひさま', nukamiso: 'ぬかみそ', genkai: '源界明朝', CP: 'チェックポイント', 'Nico Moji': 'ニコモジ' };
  const TRANS_LANGS = [['none', '— なし / none —'], ['ja', '日本語'], ['en', 'English'], ['ko', '한국어'], ['zh-CN', '中文(简体)'], ['zh-TW', '中文(繁體)'], ['zh-HK', '中文(香港)'], ['fr', 'Français'], ['it', 'Italiano'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['ru', 'Русский'], ['uk', 'Українська'], ['pl', 'Polski'], ['nl', 'Nederlands'], ['sv', 'Svenska'], ['tr', 'Türkçe'], ['id', 'Bahasa Indonesia'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['ar', 'العربية'], ['hi', 'हिन्दी'], ['el', 'Ελληνικά'], ['so', 'Soomaali']];

  // ======================================================================
  // ユーティリティ
  // ======================================================================
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function setPath(obj, path, val) {
    const ks = path.split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  let toastTimer = null;
  function toast(msg, kind = '') {
    const el = $('#toast'); el.textContent = msg; el.className = 'toast show ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
  function b64url(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function baseUrl() { return location.href.replace(/[#?].*$/, '').replace(/index\.html$/, ''); }
  function overlayUrl(withCfg = true) {
    const u = baseUrl() + 'overlay.html';
    return withCfg ? u + '?cfg=' + b64url(displayConfig()) : u;
  }
  /** OBS ブラウザソース用の設定（自己署名 https や file:// でも読めるように） */
  function overlaySourceSpec() {
    const cfg = '?cfg=' + b64url(displayConfig());
    if (location.protocol === 'file:') {
      // OBS には file:// を「ローカルファイル」として渡す（クエリは付けられないので設定は接続後に配信）
      const path = decodeURIComponent(location.pathname).replace(/index\.html$/, '') + 'overlay.html';
      return { local: true, localFile: path, url: 'file://' + path, note: 'file' };
    }
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.protocol === 'https:') {
      // 自己署名 https は OBS(CEF) が拒否するので http ポート（run_server.py が 4444 で併設）を使う
      const base = location.pathname.replace(/[^/]*$/, '');
      return { local: false, url: 'http://' + location.hostname + ':4444' + base + 'overlay.html' + cfg, note: 'localhost-http' };
    }
    return { local: false, url: overlayUrl(true), note: 'web' };
  }

  // ======================================================================
  // 表示設定（overlay に送る部分）
  // ======================================================================
  function displayConfig() {
    return {
      bgcolor: S.bgcolor, bgTransparent: S.bgTransparent, textAlign: S.textAlign, vAlign: S.vAlign, whiteSpace: S.whiteSpace,
      theme: S.theme, anim: S.anim, boxColor: S.boxColor, boxRadius: S.boxRadius, strokeMode: S.strokeMode || 'round',
      lines: S.lines, lineSpacing: S.lineSpacing, interimLeft: S.interimLeft, interimRight: S.interimRight, interimOpacity: S.interimOpacity,
    };
  }

  // ---- 配信（sink） -----------------------------------------------------
  function sendLocal(msg) {
    const f = $('#previewFrame');
    try { f.contentWindow && f.contentWindow.postMessage({ jimakuChan: msg }, '*'); } catch (e) {}
    try { engine.popup && !engine.popup.closed && engine.popup.postMessage({ jimakuChan: msg }, '*'); } catch (e) {}
    try { engine.bc && engine.bc.postMessage(msg); } catch (e) {}
  }
  function sendObs(msg) {
    if (!engine.obs.connected) return;
    engine.obs.emitBrowserEvent('jimakuChan', msg);
  }
  function broadcast(msg) { sendLocal(msg); sendObs(msg); }
  const pushConfig = debounce(() => {
    const cfg = displayConfig();
    broadcast({ type: 'config', config: cfg });
    try { localStorage.setItem('jimakuChan_v2_overlayConfig', JSON.stringify(cfg)); } catch (e) {}
    $('#overlayUrl').value = overlayUrl(true);
  }, 120);

  // ---- 行の表示 ---------------------------------------------------------
  function showLine(slot, text, interim = '', animate = false) {
    const msg = { type: 'text', slot, text, interim, animate };
    sendLocal(msg);
    // OBS: 途中結果は間引く
    const now = Date.now();
    if (interim && now - engine.interimThrottle < 120) return;
    engine.interimThrottle = now;
    sendObs(msg);
    // テキストソース（任意）
    const name = S.obs.textSources && S.obs.textSources[slot];
    if (name && engine.obs.connected && !interim) engine.obs.setText(name, text).catch(() => {});
  }
  function clearLines(slots, soft = true) {
    broadcast({ type: 'clear', slots, soft });
    if (engine.obs.connected) slots.forEach(i => { const n = S.obs.textSources && S.obs.textSources[i]; if (n) engine.obs.setText(n, '').catch(() => {}); });
  }

  // ======================================================================
  // タイマー（消去）
  // ======================================================================
  function startSpeechTimer() {
    stopSpeechTimer();
    if (!(S.timer > 0)) return;
    engine.speechTimerStart = Date.now();
    engine.speechTimer = setTimeout(() => { engine.speechTimer = null; clearLines([0]); engine.lastFinal = ''; }, S.timer);
    tickBars();
  }
  function stopSpeechTimer() { clearTimeout(engine.speechTimer); engine.speechTimer = null; setBar('#barSpeech', '#barSpeechT', 0, ''); }
  function startTransTimer() {
    clearTimeout(engine.transTimer);
    if (!(S.timer > 0)) return;
    engine.transTimerStart = Date.now();
    engine.transTimer = setTimeout(() => { engine.transTimer = null; clearLines([1, 2, 3]); }, S.timer);
    tickBars();
  }
  function setBar(bar, txt, pct, label) { $(bar).style.width = pct + '%'; $(txt).textContent = label; }
  function tickBars() {
    cancelAnimationFrame(engine.barRAF);
    const step = () => {
      let alive = false;
      if (engine.speechTimer) { const r = Math.max(0, S.timer - (Date.now() - engine.speechTimerStart)); setBar('#barSpeech', '#barSpeechT', r / S.timer * 100, (r / 1000).toFixed(1) + 's'); alive = true; } else setBar('#barSpeech', '#barSpeechT', 0, '');
      if (engine.transTimer) { const r = Math.max(0, S.timer - (Date.now() - engine.transTimerStart)); setBar('#barTrans', '#barTransT', r / S.timer * 100, (r / 1000).toFixed(1) + 's'); alive = true; } else setBar('#barTrans', '#barTransT', 0, '');
      if (alive) engine.barRAF = requestAnimationFrame(step);
    };
    engine.barRAF = requestAnimationFrame(step);
  }

  // ======================================================================
  // フィルタ・置換
  // ======================================================================
  const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let filtersReady = Promise.resolve();
  function rebuildFilters() { filtersReady = _rebuildFilters().catch(e => console.warn('[filter]', e)); return filtersReady; }
  async function _rebuildFilters() {
    const on = S.filterOn;
    const extraBad = lines(S.extraBad), extraGood = lines(S.extraGood);
    if (!on) { engine.filterRecog = null; engine.filterTrans = [null, null, null]; $('#filterInfo').textContent = ''; return; }
    const F = window.JimakuFilter;
    const [fr, ...ft] = await Promise.all([F.createFilter(S.recog, extraBad, extraGood), ...S.trans.map(l => (l && l !== 'none') ? F.createFilter(l, extraBad, extraGood) : Promise.resolve(null))]);
    engine.filterRecog = fr; engine.filterTrans = ft;
    const n = (fr ? fr.bad.length : 0);
    $('#filterInfo').textContent = t('filterLoaded', n);
    updateFilterTest();
  }
  function updateFilterTest() {
    const v = $('#filterTestIn').value;
    const out = $('#filterTestOut');
    if (!v) { out.textContent = ''; return; }
    let r = applyReplace(v);
    // 認識言語＋翻訳言語のリストをすべて通した結果を表示
    [engine.filterRecog, ...engine.filterTrans].forEach(f => { if (f) r = f.apply(r); });
    out.textContent = '→ ' + r;
  }
  function rebuildReplace() {
    engine.replaceRules = lines(S.wordReplace).map(l => {
      const m = l.split(/→|->|=>/);
      if (m.length < 2 || !m[0].trim()) return null;
      const from = m[0].trim(), to = m.slice(1).join('→').trim();
      return { re: new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), to };
    }).filter(Boolean);
  }
  function applyReplace(text) { let r = text; for (const x of engine.replaceRules) r = r.replace(x.re, x.to); return r; }
  // 認識結果の整形：日本語・中国語などで形態素ごとに入る半角スペースを除去
  const CJK = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Script=Thai}ー、。，．！？「」（）・〜]';
  const RE_CJK_SPACE = new RegExp('(?<=' + CJK + ')[ \\u3000]+(?=' + CJK + '|[A-Za-z0-9])|(?<=[A-Za-z0-9])[ \\u3000]+(?=' + CJK + ')', 'gu');
  const RE_CJK_SPACE_EDGE = new RegExp('(?<=' + CJK + ')[ \\u3000]+(?=[!?,.、。，．！？])|(?<=[、。，．！？（「])[ \\u3000]+', 'gu');
  function tidy(text) {
    let r = String(text || '');
    if (/^(ja|zh|th|ko)/i.test(S.recog)) r = r.replace(RE_CJK_SPACE, '').replace(RE_CJK_SPACE_EDGE, '');
    return r.replace(/\s{2,}/g, ' ').trim();
  }
  const filt = (f, s) => (f ? f.apply(s) : s);

  // ======================================================================
  // エンジン（認識 → 表示 → 翻訳）
  // ======================================================================
  let utteranceSeq = 0;
  function buildRecognizer() {
    if (engine.recognizer) { engine.recognizer.stop(); }
    const R = new window.JimakuRecognizer({
      lang: S.recog, processLocally: S.recogModel === 'local', shortPause: Number(S.shortPause) || 0, mode: S.recogMode || 'continuous',
      phrases: S.recogModel === 'local' ? lines(S.wordBoost).map(p => ({ phrase: p, boost: Number(S.wordBoostStrength) || 5 })) : [],
    });
    R.addEventListener('state', e => setMicPill(e.detail));
    R.addEventListener('error', e => {
      if (e.detail.fatal) { toast(e.detail.error === 'unsupported' ? t('msgUnsupported') : t('msgMicDenied'), 'err'); setRunning(false); }
      else $('#engineStatus').textContent = e.detail.message || '';
    });
    R.addEventListener('fallback', () => { toast(t('msgFallbackCloud'), 'err'); S.recogModel = 'cloud'; syncSeg('recogModel'); saveSettings(); });
    R.addEventListener('interim', e => onInterim(e.detail.text));
    R.addEventListener('final', e => onFinal(e.detail.text));
    engine.recognizer = R;
    return R;
  }
  function onInterim(text) {
    const shown = filt(engine.filterRecog, applyReplace(tidy(text)));
    engine.interim = shown;
    if (!shown) return;
    if (engine.speechTimer) stopSpeechTimer();      // 話している間は消さない
    showLine(0, '', shown, false);                    // 途中結果だけを表示（前の文は消す）
  }
  async function onFinal(text) {
    const replaced = applyReplace(tidy(text));
    const shown = filt(engine.filterRecog, replaced);
    engine.lastFinal = shown; engine.interim = '';
    showLine(0, shown, '', true);
    startSpeechTimer();
    if (S.bouyomi && window.BouyomiChanClient) { try { new BouyomiChanClient().talk(shown); } catch (e) {} }
    // 翻訳
    const targets = S.trans.slice();
    if (!targets.some(x => x && x !== 'none')) return;
    const seq = ++utteranceSeq;
    setPill('#pillTrans', 'busy', t('pillTransBusy'));
    const results = await engine.translator.translateAll(replaced, S.recog, targets);
    if (seq !== utteranceSeq) return;                 // 新しい発話が来ていたら古い結果は捨てる
    let any = false;
    results.forEach(r => {
      const slot = r.slot + 1;
      if (r.ok) { showLine(slot, filt(engine.filterTrans[r.slot], r.text), '', true); any = true; }
    });
    if (any) startTransTimer();
    const bad = results.filter(r => !r.ok);
    setPill('#pillTrans', bad.length ? 'err' : 'on', bad.length ? (bad[0].error || 'error') : (results[0].via === 'chrome' ? 'Chrome' : results[0].via === 'gas' ? 'GAS' : t('pillTransIdle')));
    updateTransCount();
  }
  function updateTransCount() {
    const tr = engine.translator;
    const n = tr.gasTotal != null && S.translationMethod === 'gas' ? tr.gasTotal : tr.count;
    $('#transCountLabel').textContent = n ? t('transCount', n) : '';
  }

  function setRunning(on) {
    engine.running = on;
    $('#btnStart').hidden = on; $('#btnStop').hidden = !on;
    if (!on) { setMicPill({ running: false, listening: false }); stopSpeechTimer(); clearTimeout(engine.transTimer); engine.transTimer = null; }
  }
  async function startEngine() {
    if (engine.running) return;
    setRunning(true);
    engine.lastFinal = ''; engine.interim = '';
    clearLines([0, 1, 2, 3], false);
    const R = buildRecognizer();
    // 伏字リストの読込を待ってから開始（最大 4 秒）
    await Promise.race([filtersReady, new Promise(r => setTimeout(r, 4000))]);
    await R.start();
    if (R.running) { toast(t('msgStarted'), 'ok'); $('#engineStatus').textContent = ''; }
    else setRunning(false);
  }
  function stopEngine(silent) {
    if (engine.recognizer) engine.recognizer.stop();
    setRunning(false);
    if (!silent) toast(t('msgStopped'));
  }
  const restartEngine = debounce(() => { if (engine.running) { stopEngine(true); startEngine(); } }, 400);

  function setMicPill(st) {
    const p = $('#pillMic');
    p.className = 'pill ' + (st.running ? (st.listening ? 'on' : 'busy') : '');
    p.querySelector('span').textContent = st.running ? (st.listening ? t('pillMicListen') : t('pillMicOn')) : t('pillMicOff');
  }
  function setPill(sel, cls, text) { const p = $(sel); p.className = 'pill ' + (cls || ''); p.querySelector('span').textContent = text; }

  // ======================================================================
  // 翻訳（Chrome API 状態・モデル DL）
  // ======================================================================
  let modelCheckGen = 0;
  async function refreshTranslatorUI() {
    const gen = ++modelCheckGen;
    const tr = engine.translator;
    tr.method = S.translationMethod; tr.gasKey = S.gasKey;
    const ok = await tr.checkChrome();
    const st = $('#chromeApiStatus');
    st.textContent = ok ? t('chromeApiOk') : t('chromeApiNo');
    st.className = 'status ' + (ok ? 'ok' : 'warn');
    $('#rowGas').style.opacity = (S.translationMethod === 'gas' || !ok) ? 1 : .6;
    // モデル状態バッジ
    let needDl = false;
    await Promise.all(S.trans.map(async (l, i) => {
      const b = $('#modelBadge' + i);
      if (!l || l === 'none' || S.translationMethod !== 'chrome' || !ok) { b.hidden = true; return; }
      const s = await tr.chromeModelStatus(S.recog, l);
      if (gen !== modelCheckGen) return;      // 古いチェック結果は捨てる
      b.hidden = false;
      const map = { available: ['ok', t('modelReady')], downloadable: ['warn', t('modelDl')], downloading: ['warn', t('modelDling')], unavailable: ['err', t('modelNo')], unknown: ['', '?'] };
      const [cls, label] = map[s] || ['', s];
      b.className = 'badge ' + cls; b.textContent = label;
      if (s === 'downloadable') needDl = true;
    }));
    if (gen === modelCheckGen) $('#btnDownloadModels').hidden = !needDl;
  }
  async function downloadModels() {
    const btn = $('#btnDownloadModels'); btn.disabled = true;
    const tr = engine.translator;
    tr._chrome.onDownloadStatusChange = (s) => { $('#chromeApiStatus').textContent = s.message || ''; };
    for (const l of S.trans) { if (l && l !== 'none') { try { await tr.preloadChrome(S.recog, l); } catch (e) { console.warn(e); } } }
    btn.disabled = false;
    refreshTranslatorUI();
  }

  // ======================================================================
  // ローカル認識モデル
  // ======================================================================
  async function refreshLocalModelUI() {
    const el = $('#localModelStatus'), btn = $('#btnInstallLocal');
    if (S.recogModel !== 'local') { el.textContent = ''; btn.hidden = true; return; }
    const a = await window.JimakuRecognizer.localAvailability(S.recog);
    const map = { available: ['ok', t('localOk')], downloadable: ['warn', t('localDl')], downloading: ['warn', t('localDling')], unavailable: ['err', t('localNo')], unknown: ['', t('localUnknown')] };
    const [cls, label] = map[a] || ['', a];
    el.className = 'status ' + cls; el.textContent = label;
    btn.hidden = a !== 'downloadable';
  }

  // ======================================================================
  // OBS
  // ======================================================================
  function setObsUI(state, detail) {
    const connected = state === 'connected';
    setPill('#pillObs', connected ? 'on' : (state === 'connecting' ? 'busy' : (state === 'error' ? 'err' : '')), connected ? t('pillObsOn') : t('pillObsOff'));
    $('#btnObsConnect').hidden = connected; $('#btnObsDisconnect').hidden = !connected;
    $('#btnObsAddSource').disabled = !connected; $('#btnObsTest').disabled = !connected;
    const st = $('#obsStatus'); st.textContent = detail || ''; st.className = 'status ' + (connected ? 'ok' : (state === 'error' || state === 'disconnected' && detail ? 'err' : ''));
  }
  async function obsConnect(auto = false) {
    try {
      await engine.obs.connect(S.obs.url || 'ws://localhost:4455', S.obs.password || '', { autoReconnect: true });
      if (!auto) toast(t('msgObsConnected'), 'ok');
      // 接続直後に表示設定を送る（既にシーンにある場合のため）
      sendObs({ type: 'config', config: displayConfig() });
      if (engine.lastFinal) sendObs({ type: 'text', slot: 0, text: engine.lastFinal });
    } catch (e) {
      if (!auto) toast(t('msgObsFailed'), 'err');
    }
  }
  async function obsAddSource() {
    try {
      const spec = overlaySourceSpec();
      const r = await engine.obs.ensureOverlaySource(spec.url, { localFile: spec.local ? spec.localFile : null });
      toast(r.created ? t('msgObsAdded') : t('msgObsUpdated'), 'ok');
      $('#obsStatus').textContent = (spec.note === 'localhost-http' ? t('obsNoteLocalhost') : spec.note === 'file' ? t('obsNoteFile') : '') ;
      // 読み込み直後に設定を数回送る（ページのロード完了を待つ）
      [800, 2000, 4000].forEach(ms => setTimeout(() => sendObs({ type: 'config', config: displayConfig() }), ms));
    } catch (e) { toast('OBS: ' + (e.message || e), 'err'); }
  }
  async function obsTest() {
    const ok1 = await engine.obs.emitBrowserEvent('jimakuChan', { type: 'config', config: displayConfig() });
    showLine(0, t('msgTest'), '', true);
    if (S.trans[0] && S.trans[0] !== 'none') showLine(1, t('msgTestTrans'), '', true);
    engine.lastFinal = t('msgTest');
    startSpeechTimer(); startTransTimer();
    const st = $('#obsStatus');
    if (ok1) { st.textContent = t('obsTestSent'); st.className = 'status ok'; }
    else { st.textContent = t('obsTestFailed'); st.className = 'status err'; }
  }

  // ======================================================================
  // 表示ウィンドウ（ポップアップ）
  // ======================================================================
  function openPopup() {
    const url = baseUrl() + 'overlay.html?popup=1&cfg=' + b64url(displayConfig());
    const w = window.open(url, 'jimakuChanDisplay', 'popup=yes,width=1280,height=240,left=100,top=100');
    if (!w) { toast(t('popupBlocked'), 'err'); return; }
    engine.popup = w;
    setTimeout(() => { sendLocal({ type: 'config', config: displayConfig() }); if (engine.lastFinal) sendLocal({ type: 'text', slot: 0, text: engine.lastFinal }); }, 700);
  }

  // ======================================================================
  // 表示モード（設定を隠して字幕だけ．同じ URL で v1 のように運用できる）
  // ======================================================================
  let hintTimer = null;
  function setDisplayMode(on, save = true) {
    document.body.classList.toggle('display-mode', on);
    sendLocal({ type: 'previewMode', mode: on ? 'color' : 'auto' });   // 表示モードでは背景色（クロマキー用）
    if (save) ui.save({ displayMode: on });
    if (on) { showHint(); }
    else { document.body.classList.remove('show-hint'); }
  }
  function showHint() { document.body.classList.add('show-hint'); clearTimeout(hintTimer); hintTimer = setTimeout(() => document.body.classList.remove('show-hint'), 2500); }
  function toggleDisplayMode() { setDisplayMode(!document.body.classList.contains('display-mode')); }

  // ======================================================================
  // 設定 ⇄ DOM
  // ======================================================================
  function saveSettings() { store.update(S); }
  const saveSettingsDebounced = debounce(saveSettings, 250);

  function bindAll() {
    // data-bind
    $$('[data-bind]').forEach(el => {
      const path = el.dataset.bind;
      const isCheck = el.type === 'checkbox';
      const isNum = el.type === 'number' || el.type === 'range';
      const write = () => {
        const v = isCheck ? el.checked : (isNum ? Number(el.value) : el.value);
        setPath(S, path, v);
        onSettingChanged(path, el);
      };
      el.addEventListener(isCheck || el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input', write);
      if (el.type === 'color' || el.type === 'range') el.addEventListener('input', write);
    });
    // segmented
    $$('[data-seg]').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        setPath(S, seg.dataset.seg, b.dataset.val); syncSeg(seg.dataset.seg); onSettingChanged(seg.dataset.seg, seg);
      }));
    });
    // chips
    $$('[data-chips]').forEach(box => {
      box.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        setPath(S, box.dataset.chips, b.dataset.val); syncChips(box.dataset.chips); onSettingChanged(box.dataset.chips, box);
      }));
    });
  }
  function syncSeg(path) {
    const seg = $(`[data-seg="${path}"]`); if (!seg) return;
    const v = String(getPath(S, path));
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === v));
  }
  function syncChips(path) {
    const box = $(`[data-chips="${path}"]`); if (!box) return;
    const v = String(getPath(S, path));
    box.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.val === v));
    if (path === 'theme') $('#lBoxColor').parentElement.style.opacity = (v === 'box' || v === 'pill') ? 1 : .55;
  }
  function syncNums() { $$('[data-num]').forEach(el => { el.textContent = getPath(S, el.dataset.num); }); }

  /** S → DOM 全反映 */
  function renderAll() {
    $$('[data-bind]').forEach(el => {
      const v = getPath(S, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (v !== undefined && v !== null) el.value = v;
    });
    $$('[data-seg]').forEach(seg => syncSeg(seg.dataset.seg));
    $$('[data-chips]').forEach(box => syncChips(box.dataset.chips));
    syncNums();
    renderStyleRows();
    renderPresetSelect();
    $('#overlayUrl').value = overlayUrl(true);
  }

  function onSettingChanged(path, el) {
    syncNums();
    saveSettingsDebounced();
    // 表示に関わるもの → overlay へ
    if (/^(theme|anim|boxColor|boxRadius|strokeMode|lines|bgcolor|bgTransparent|textAlign|vAlign|whiteSpace|lineSpacing|interim)/.test(path)) pushConfig();
    if (path === 'theme') syncChips('theme');
    if (/^(recog|shortPause|recogModel|recogMode|wordBoost)/.test(path)) {
      if (el && el.dataset && el.dataset.restart) restartEngine(); else if (path === 'recogModel' || path === 'recogMode') restartEngine();
    }
    if (path === 'recogModel' || path === 'recog') refreshLocalModelUI();
    if (/^(recog$|trans\.|translationMethod|gasKey)/.test(path)) refreshTranslatorUI();
    if (/^(recog$|trans\.|filterOn|extraBad|extraGood)/.test(path)) rebuildFiltersDebounced();
    if (/^trans\.(\d)/.test(path)) { const k = Number(RegExp.$1); if (!S.trans[k] || S.trans[k] === 'none') clearLines([k + 1], false); }
    if (path === 'wordReplace') { rebuildReplace(); updateFilterTest(); }
    if (path.startsWith('obs.')) { /* 保存のみ */ }
    if (path === 'timer' && !(S.timer > 0)) { stopSpeechTimer(); clearTimeout(engine.transTimer); engine.transTimer = null; }
  }
  const rebuildFiltersDebounced = debounce(rebuildFilters, 500);

  // ---- 文字スタイル表 ---------------------------------------------------
  const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function fontOptionsHtml(current) {
    const local = engine.localFonts || [];
    const known = FONTS.includes(current) || local.includes(current);
    const opt = f => `<option value="${escAttr(f)}" style="font-family:'${escAttr(f)}'"${f === current ? ' selected' : ''}>${escAttr(FONT_LABEL[f] || f)}</option>`;
    let h = `<optgroup label="${t('fontGroupWeb')}">` + FONTS.map(opt).join('') + '</optgroup>';
    if (local.length) h += `<optgroup label="${t('fontGroupLocal')}">` + local.map(opt).join('') + '</optgroup>';
    h += `<option value="__direct__"${known ? '' : ' selected'}>${t('fontDirect')}</option>`;
    return h;
  }
  async function loadLocalFonts() {
    if (!('queryLocalFonts' in window)) { toast(t('localFontsUnsupported'), 'err'); return; }
    try {
      const list = await window.queryLocalFonts();
      const fams = [...new Set(list.map(f => f.family))].sort((a, b) => a.localeCompare(b, 'ja'));
      engine.localFonts = fams;
      try { localStorage.setItem('jimakuChan_v2_localFonts', JSON.stringify(fams)); } catch (e) {}
      renderStyleRows();
      toast(t('localFontsLoaded', fams.length), 'ok');
    } catch (e) { toast(t('localFontsDenied'), 'err'); }
  }
  function renderStyleRows() {
    const names = ['rowRecog', 'rowTrans1', 'rowTrans2', 'rowTrans3'];
    const tb = $('#styleRows'); tb.innerHTML = '';
    S.lines.forEach((l, i) => {
      const tr = document.createElement('tr');
      const known = FONTS.includes(l.font) || (engine.localFonts || []).includes(l.font);
      tr.innerHTML = `
        <td>${t(names[i])}</td>
        <td><div class="row" style="margin:0;flex-wrap:nowrap"><select data-font="${i}">${fontOptionsHtml(l.font)}</select><input type="text" data-fontdirect="${i}" value="${known ? '' : (l.font || '')}" placeholder="${t('fontDirectPh')}" style="width:9em"${known ? ' hidden' : ''}></div></td>
        <td><input type="color" data-line="${i}.color" value="${l.color}"></td>
        <td><input type="color" data-line="${i}.strokeColor" value="${l.strokeColor}"></td>
        <td><div class="rangecell"><input type="range" data-line="${i}.size" min="0" max="80" step="0.5" value="${l.size}" title="0 = この行を表示しない"><span class="num">${l.size}</span><span class="unit">pt</span></div></td>
        <td><div class="rangecell"><input type="range" data-line="${i}.weight" min="100" max="900" step="100" value="${l.weight}"><span class="num">${l.weight}</span></div></td>
        <td><div class="rangecell"><input type="range" data-line="${i}.strokeWidth" min="0" max="20" step="0.5" value="${l.strokeWidth}"><span class="num">${l.strokeWidth}</span><span class="unit">pt</span></div></td>`;
      tb.appendChild(tr);
    });
    tb.querySelectorAll('[data-line]').forEach(el => {
      const [i, k] = el.dataset.line.split('.');
      const h = () => { S.lines[i][k] = (el.type === 'range') ? Number(el.value) : el.value; const n = el.parentElement.querySelector('.num'); if (n) n.textContent = el.value; onSettingChanged('lines', el); };
      el.addEventListener('input', h); el.addEventListener('change', h);
    });
    tb.querySelectorAll('[data-font]').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = sel.dataset.font; const direct = tb.querySelector(`[data-fontdirect="${i}"]`);
        if (sel.value === '__direct__') { direct.hidden = false; direct.focus(); if (direct.value) { S.lines[i].font = direct.value; onSettingChanged('lines', sel); } }
        else { direct.hidden = true; S.lines[i].font = sel.value; onSettingChanged('lines', sel); }
      });
    });
    tb.querySelectorAll('[data-fontdirect]').forEach(inp => {
      inp.addEventListener('input', debounce(() => { const i = inp.dataset.fontdirect; if (inp.value.trim()) { S.lines[i].font = inp.value.trim(); onSettingChanged('lines', inp); } }, 300));
    });
  }

  // ---- プリセット --------------------------------------------------------
  function renderPresetSelect() {
    const sel = $('#presetSelect');
    sel.innerHTML = store.list(window.i18n.lang).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.value = store.currentId;
    document.title = 'jimakuChan: ' + t('appName') + ' [' + sel.options[sel.selectedIndex].text + ']';
  }
  function selectPreset(id) {
    S = store.select(id);
    renderAll();
    afterSettingsReplaced();
  }
  function afterSettingsReplaced() {
    pushConfig(); rebuildReplace(); rebuildFilters(); refreshTranslatorUI(); refreshLocalModelUI(); updateTransCount();
    if (engine.running) restartEngine();
  }

  // ---- 翻訳言語セレクト -------------------------------------------------
  function fillTransSelects() {
    $$('.trans-select').forEach(sel => { sel.innerHTML = TRANS_LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); });
  }

  // ---- 保存・読込・起動ファイル -----------------------------------------
  function downloadFile(content, name, type = 'application/json') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportSettings() { saveSettings(); downloadFile(store.exportJSON(), 'jimakuChan_settings.json'); toast(t('msgSaved'), 'ok'); }
  function importSettings() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { S = store.importJSON(String(r.result)); renderAll(); afterSettingsReplaced(); toast(t('msgImported'), 'ok'); } catch (e) { toast(t('msgImportErr'), 'err'); } };
      r.readAsText(f);
    };
    inp.click();
  }
  function makeLauncher(os) {
    const url = baseUrl() + 'index.html';
    const flags = '--disable-features=CalculateNativeWinOcclusion,UseEcoQoSForBackgroundProcess --disable-background-timer-throttling --disable-renderer-backgrounding --autoplay-policy=no-user-gesture-required';
    if (os === 'win') {
      const c = `@echo off\r\nset "JIMAKU_PROFILE=%LOCALAPPDATA%\\Google\\Chrome\\User Data\\user_jimaku_001"\r\nstart "" chrome.exe ${flags} --user-data-dir="%JIMAKU_PROFILE%" --new-window "${url}"\r\nexit /b\r\n`;
      downloadFile(c, 'jimakuChan_nonStop.bat', 'text/plain');
    } else {
      const c = `#!/bin/sh\n"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ${flags} --user-data-dir="$HOME/Library/Application Support/Google/Chrome/user_jimaku_001" --new-window "${url}" &\n`;
      downloadFile(c, 'jimakuChan_nonStop.command', 'text/plain');
    }
  }

  // ======================================================================
  // 初期化
  // ======================================================================
  function initTabs() {
    $$('#tabs button').forEach(b => b.addEventListener('click', () => {
      $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
      $$('.tabpane').forEach(p => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
      ui.save({ tab: b.dataset.tab });
    }));
    if (uiState.tab) { const b = $(`#tabs button[data-tab="${uiState.tab}"]`); if (b) b.click(); }
  }
  function initLang() {
    const lang = uiState.lang || 'ja';
    const apply = (l) => {
      window.i18n.setLanguage(l);
      $('#langJa').classList.toggle('on', l === 'ja'); $('#langEn').classList.toggle('on', l === 'en');
      ui.save({ lang: l });
      renderStyleRows(); renderPresetSelect(); setMicPill({ running: engine.running, listening: engine.recognizer && engine.recognizer.listening });
      setObsUI(engine.obs.connected ? 'connected' : 'disconnected', '');
      $$('#tabs button').forEach(() => {});
      refreshTranslatorUI(); refreshLocalModelUI(); rebuildFilters();
    };
    $('#langJa').addEventListener('click', () => apply('ja'));
    $('#langEn').addEventListener('click', () => apply('en'));
    apply(lang);
  }
  function initPreview() {
    const modes = ['auto', 'color', 'checker', 'black'];
    let idx = 0;
    const btn = $('#btnPreviewBg');
    const label = () => { const m = modes[idx]; btn.textContent = m === 'checker' ? t('previewBgChecker') : m === 'black' ? t('previewBgBlack') : (m === 'color' ? t('previewBg') : t('previewBg') + ' (auto)'); };
    btn.addEventListener('click', () => { idx = (idx + 1) % modes.length; sendLocal({ type: 'previewMode', mode: modes[idx] }); label(); });
    label();
    $('#btnPreviewTall').addEventListener('click', () => { const c = $('#previewCard'); c.classList.toggle('tall'); $('#btnPreviewTall').textContent = c.classList.contains('tall') ? t('previewSmall') : t('previewTall'); });
    $('#previewFrame').addEventListener('load', () => { sendLocal({ type: 'config', config: displayConfig() }); });
  }

  function init() {
    $('#verBadge').textContent = 'v' + VERSION; $('#footVer').textContent = 'Version ' + VERSION;
    fillTransSelects();
    bindAll();
    renderAll();
    initTabs();
    initLang();
    initPreview();
    rebuildReplace(); rebuildFilters(); refreshTranslatorUI(); refreshLocalModelUI();

    // ボタン
    $('#btnStart').addEventListener('click', startEngine);
    $('#btnStop').addEventListener('click', () => stopEngine(false));
    $('#btnPopup').addEventListener('click', openPopup); $('#btnPopup2').addEventListener('click', openPopup);
    $('#btnDisplayMode').addEventListener('click', () => setDisplayMode(true)); $('#btnDisplayMode2').addEventListener('click', () => setDisplayMode(true));
    window.addEventListener('message', e => { if (e.data && e.data.jimakuChanEvent === 'click' && document.body.classList.contains('display-mode')) setDisplayMode(false); });
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('display-mode')) setDisplayMode(false); });
    window.addEventListener('mousemove', () => { if (document.body.classList.contains('display-mode')) showHint(); });
    if (uiState.displayMode) setDisplayMode(true, false);      // 前回表示モードで終わっていれば同じ URL で表示モードから始まる
    $('#presetSelect').addEventListener('change', e => selectPreset(e.target.value));
    $('#btnPresetSave').addEventListener('click', () => { saveSettings(); toast(t('msgSaved'), 'ok'); });
    $('#btnPresetReset').addEventListener('click', () => { S = store.reset(); renderAll(); afterSettingsReplaced(); toast(t('msgReset')); });
    $('#btnDownloadModels').addEventListener('click', downloadModels);
    $('#btnInstallLocal').addEventListener('click', async () => { $('#localModelStatus').textContent = t('localDling'); await window.JimakuRecognizer.installLocal(S.recog); refreshLocalModelUI(); });
    $('#btnObsConnect').addEventListener('click', () => obsConnect(false));
    $('#btnObsDisconnect').addEventListener('click', () => engine.obs.disconnect());
    $('#btnObsAddSource').addEventListener('click', obsAddSource);
    $('#btnObsTest').addEventListener('click', obsTest);
    $('#btnCopyOverlay').addEventListener('click', () => { navigator.clipboard.writeText($('#overlayUrl').value).then(() => toast(t('msgCopied'), 'ok')); });
    $('#btnExport').addEventListener('click', exportSettings);
    $('#btnImport').addEventListener('click', importSettings);
    $('#btnBatWin').addEventListener('click', () => makeLauncher('win'));
    $('#btnBatMac').addEventListener('click', () => makeLauncher('mac'));
    $('#filterTestIn').addEventListener('input', updateFilterTest);
    $('#btnLocalFonts').addEventListener('click', loadLocalFonts);
    try { engine.localFonts = JSON.parse(localStorage.getItem('jimakuChan_v2_localFonts') || '[]'); if (engine.localFonts.length) renderStyleRows(); } catch (e) {}
    $('#btnMigrate').hidden = !store.hasV1();
    $('#btnMigrate').addEventListener('click', () => { localStorage.removeItem('jimakuChan_v2_presets'); store.load(); S = store.get(store.currentId); renderAll(); afterSettingsReplaced(); toast(t('migrated'), 'ok'); });
    if (store.data.migratedFromV1 && !uiState.migrateNoticeShown) { toast(t('migrated'), 'ok'); ui.save({ migrateNoticeShown: true }); }

    // プレビューへ初期設定（iframe の load を取り逃した場合の保険）
    setTimeout(() => sendLocal({ type: 'config', config: displayConfig() }), 900);

    // テーマ（既定ライト）
    const applyTheme = (th) => { document.documentElement.dataset.theme = th; $('#themeToggle').textContent = th === 'dark' ? '☀️' : '🌙'; ui.save({ theme: th }); };
    applyTheme(uiState.theme || 'light');
    $('#themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

    // 自動開始（既定 ON）：ページを開いたらすぐ認識
    if (S.autoStart !== false) setTimeout(() => startEngine(), 400);

    // OBS
    engine.obs.onStatus = (state, detail) => setObsUI(state, detail);
    setObsUI('disconnected', '');
    if (S.obs.auto) setTimeout(() => obsConnect(true), 500);

    // BroadcastChannel: 表示側からの hello に設定を返す
    if (engine.bc) engine.bc.onmessage = (e) => { if (e.data && e.data.type === 'hello') { sendLocal({ type: 'config', config: displayConfig() }); if (engine.lastFinal) sendLocal({ type: 'text', slot: 0, text: engine.lastFinal }); } };

    // 翻訳ステータス
    engine.translator.onStatus = (text, level) => { /* pill 側で表示 */ };

    // 認識中にタブを閉じようとしたら確認
    window.addEventListener('beforeunload', (e) => { if (engine.running) { e.preventDefault(); e.returnValue = ''; } });

    // 秘密のショートカット: Ctrl/Cmd+Shift+D で表示ウィンドウ
    window.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); openPopup(); } });

    window.jimakuApp = { get S() { return S; }, store, engine, showLine, startEngine, stopEngine, displayConfig, overlayUrl };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
