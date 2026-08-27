/*
 * jimakuChan v2 – オーバーレイ（表示専用）
 *
 * 受信経路（どれでも同じメッセージ形式）：
 *   1. BroadcastChannel('jimakuChan')      … 同じブラウザ内（設定画面の iframe / 別ウィンドウ）
 *   2. window 'jimakuChan' DOM イベント     … OBS ブラウザソース（obs-websocket → obs-browser emit_event）
 *   3. window.postMessage                    … iframe 親からの直接送信
 *
 * メッセージ：
 *   {type:'config', config:{...}}                       表示設定
 *   {type:'text', slot:0-3, text:'', interim:'', animate:bool}   行の更新（slot0=認識，1..3=翻訳）
 *   {type:'clear', slots:[0,1,2,3]}                     行を消す
 *   {type:'ping'}                                       生存確認 → 'pong' を返す（BroadcastChannel のみ）
 */
(function () {
  'use strict';

  const stage = document.getElementById('stage');
  const lines = [0, 1, 2, 3].map(i => document.getElementById('line' + i));
  const txts = lines.map(l => l.querySelector('.win > .txt'));
  const wins = lines.map(l => l.querySelector('.win'));
  const mkL = lines.map(l => l.querySelector('.mk.mkl'));
  const mkR = lines.map(l => l.querySelector('.mk.mkr'));
  const params = new URLSearchParams(location.search);
  const isPreview = params.get('preview') === '1';
  const inOBS = !!window.obsstudio;
  const isPopup = params.get('popup') === '1';
  // 透過は OBS ブラウザソース内（または ?transparent=1）でのみ有効．ポップアップ窓は常に背景色（クロマキー用）
  const allowTransparent = (inOBS || params.get('transparent') === '1') && !isPopup;
  let previewMode = 'auto';   // 'auto' | 'color' | 'checker' | 'black'
  document.body.classList.toggle('preview', isPreview);

  const DEFAULT = {
    bgcolor: '#00ff00', bgTransparent: false, strokeMode: 'round',
    textAlign: 'center', vAlign: 'bottom', whiteSpace: 'normal',
    theme: 'outline', anim: 'none', boxColor: 'rgba(0,0,0,0.55)', boxRadius: 12,
    lines: [
      { font: 'M PLUS Rounded 1c', size: 25, weight: 900, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6 },
      { font: 'M PLUS Rounded 1c', size: 25, weight: 900, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6 },
      { font: 'M PLUS Rounded 1c', size: 25, weight: 900, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6 },
      { font: 'M PLUS Rounded 1c', size: 25, weight: 900, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6 },
    ],
    lineSpacing: [0, 0, 0],
    interimLeft: ' << ', interimRight: ' >>',
    keepHeight: false,
  };
  let cfg = JSON.parse(JSON.stringify(DEFAULT));
  let lastCfgKey = null;                    // 直前に適用した設定（ts を除く JSON）．同一なら再適用しない（fade-out 中の再描画を避ける）
  const STORE_KEY = 'jimakuChan_v2_overlayConfig';
  const cfgKey = c => { try { return JSON.stringify(Object.assign({}, c || {}, { ts: 0 })); } catch (e) { return String(Math.random()); } };

  // ---- 設定の適用 -------------------------------------------------------
  function applyConfig(c, { persist = false } = {}) {
    const key = cfgKey(c);
    if (key === lastCfgKey) return;         // 変更なし（ハートビート等）
    lastCfgKey = key;
    if (persist && c && !isPreview) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {} }   // 再読み込み後も最新設定で起動できるように
    cfg = Object.assign({}, DEFAULT, c || {});
    cfg.lines = (c && c.lines ? c.lines : []).map((l, i) => Object.assign({}, DEFAULT.lines[i], l || {}));
    while (cfg.lines.length < 4) cfg.lines.push(Object.assign({}, DEFAULT.lines[cfg.lines.length]));

    applyBackground();
    stage.dataset.valign = cfg.vAlign;
    stage.dataset.align = cfg.textAlign;
    stage.dataset.theme = cfg.theme;
    stage.dataset.anim = cfg.anim;
    stage.classList.toggle('keep-height', !!cfg.keepHeight);
    stage.style.setProperty('--box', cfg.boxColor);
    stage.style.setProperty('--radius', cfg.boxRadius + 'px');
    stage.style.setProperty('--interim-opacity', String(Math.max(0, Math.min(100, Number(cfg.interimOpacity ?? 100))) / 100));
    cfg.lines.forEach((l, i) => {
      const el = lines[i];
      el.dataset.stroke = cfg.strokeMode === 'sharp' ? 'sharp' : 'round';
      el.dataset.wrap = isTicker(i) ? 'nowrap' : 'wrap';
      setMarks(i);
      el.classList.toggle('is-hidden', !(Number(l.size) > 0));   // サイズ 0 = その行を表示しない（翻訳だけ出したい等）
      const px = (Number(l.strokeWidth) || 0) * 4 / 3;               // pt → px
      const extra = themeShadows(cfg.theme, px, l.strokeColor);
      if (cfg.strokeMode === 'sharp') { el.style.setProperty('--extra-shadow', extra || 'none'); el.style.setProperty('--stroke-shadow', 'none'); }
      else { const d = dilateShadows(px, l.strokeColor); el.style.setProperty('--stroke-shadow', [d, extra].filter(Boolean).join(',') || 'none'); el.style.setProperty('--extra-shadow', 'none'); }
      el.style.setProperty('--font', quoteFont(l.font));
      el.style.setProperty('--size', l.size + 'pt');
      el.style.setProperty('--weight', l.weight);
      el.style.setProperty('--color', l.color);
      el.style.setProperty('--sc', l.strokeColor);
      el.style.setProperty('--sw', l.strokeWidth + 'pt');
      el.style.setProperty('--gap', (i < 3 ? (cfg.lineSpacing[i] || 0) : 0) + 'px');
      el.style.setProperty('--glow', l.strokeColor);
    });
    // 保持しているテキストを再描画（マーカー変更などを反映）．フェード消去中の行は消去を中断しない
    state.forEach((s, i) => { const fading = lines[i].classList.contains('fade-out'); render(i, false); if (fading) lines[i].classList.add('fade-out'); });
  }
  function applyBackground() {
    let bg = cfg.bgcolor, checker = false;
    if (isPreview) {
      const mode = previewMode === 'auto' ? (cfg.bgTransparent ? 'checker' : 'color') : previewMode;
      if (mode === 'checker') { bg = 'transparent'; checker = true; }
      else if (mode === 'black') bg = '#000';
    } else if (allowTransparent && cfg.bgTransparent) {
      bg = 'transparent';
    }
    document.documentElement.style.setProperty('--bg', bg);
    document.body.classList.toggle('checker', checker);
  }
  // 縁取り：半径 r(px) の円周上に影を並べて文字を膨張させる（角が丸くなめらか）
  const shadowCache = new Map();
  function dilateShadows(r, color) {
    if (!(r > 0.3)) return '';
    const key = r.toFixed(2) + '|' + color;
    if (shadowCache.has(key)) return shadowCache.get(key);
    const out = [];
    const step = Math.max(1.4, r / 6);                    // リング間隔（最大 6 リング）
    for (let rr = r; rr > 0.4; rr -= step) {
      const n = Math.min(36, Math.max(8, Math.round(2 * Math.PI * rr / 1.5)));  // 隣接影の間隔 ≒1.5px
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n + (rr === r ? 0 : 0.2);
        out.push((rr * Math.cos(a)).toFixed(2) + 'px ' + (rr * Math.sin(a)).toFixed(2) + 'px 0 ' + color);
      }
    }
    const v = out.join(',');
    shadowCache.set(key, v);
    return v;
  }
  function themeShadows(theme, r, color) {
    if (theme === 'glow') return `0 0 ${(r * 2 + 6).toFixed(1)}px ${color}, 0 0 ${(r * 4 + 14).toFixed(1)}px ${color}`;
    if (theme === 'shadow') return `0 ${(r * .8 + 3).toFixed(1)}px ${(r * 1.5 + 8).toFixed(1)}px rgba(0,0,0,.6)`;
    return '';
  }
  function quoteFont(f) {
    if (!f) return "'M PLUS Rounded 1c'";
    return f.split(',').map(s => { s = s.trim().replace(/^['"]|['"]$/g, ''); return "'" + s.replace(/'/g, "\\'") + "'"; }).join(', ');
  }

  // ---- テキスト描画 -----------------------------------------------------
  const state = [0, 1, 2, 3].map(() => ({ text: '', interim: '' }));
  // 「1行表示」（行ごとの nowrap；未指定なら旧来の全体設定 whiteSpace に従う）：折り返さず 1 行で表示し，最新（右端）が常に見える．
  // 表示内容の更新・消え方は通常表示と同じ（新しい文で置き換え，タイマーで消える）．蓄積はしない（2026-08-17 西村指示）
  const isTicker = i => { const l = cfg.lines[i] || {}; return typeof l.nowrap === 'boolean' ? l.nowrap : cfg.whiteSpace === 'nowrap'; };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /*
   * 1 行表示の両端マーカー：認識中マーカー（既定 '<<' '>>'）を行の左右へ貼り付けたまま動かさない．
   * 文はその内側の窓を流れ，あふれた頭は左マーカーの内側へ吸い込まれていく（2026-08-27 西村指示）．
   * 通常（折り返し）表示では従来どおり途中結果の前後にだけマーカーを付ける．
   */
  function setMarks(i) {
    const ticker = isTicker(i);
    const a = ticker ? String(cfg.interimLeft == null ? '' : cfg.interimLeft).trim() : '';
    const b = ticker ? String(cfg.interimRight == null ? '' : cfg.interimRight).trim() : '';
    [[mkL[i], a], [mkR[i], b]].forEach(([el, v]) => {
      if (!el) return;
      el.textContent = v; el.dataset.text = v;
      el.classList.toggle('is-off', !v);
    });
  }
  // 窓からあふれている間だけ左側をぼかす（吸い込まれて見えるように）
  function updateOverflow(i) {
    const w = wins[i]; if (!w) return;
    w.classList.toggle('is-over', isTicker(i) && w.scrollWidth > w.clientWidth + 1);
  }

  function render(i, animate) {
    const s = state[i];
    const hasInterim = s.interim && s.interim.length > 0;
    const ticker = isTicker(i);
    const inter = hasInterim ? (ticker ? (s.text ? ' ' : '') + s.interim : cfg.interimLeft + s.interim + cfg.interimRight) : '';
    const plain = (s.text || '') + inter;
    const line = lines[i], txt = txts[i];
    // 内容が同じなら DOM を触らない（OBS 定期同期の再送で再描画・アニメが起きないように）．フェード中は消去を中断して再表示する
    if (!animate && plain === (txt.dataset.text || '') && line.classList.contains('is-empty') === !plain && !line.classList.contains('fade-out')) { updateOverflow(i); return; }
    line.classList.remove('fade-out');
    if (!plain) {
      txt.innerHTML = ''; txt.dataset.text = '';
      line.classList.add('is-empty');
      updateOverflow(i);
      return;
    }
    line.classList.remove('is-empty');
    txt.dataset.text = plain;
    txt.innerHTML = esc(s.text || '') + (hasInterim ? '<span class="interim">' + esc(inter) + '</span>' : '');
    updateOverflow(i);
    if (animate) {
      line.classList.remove('animate'); void line.offsetWidth; line.classList.add('animate');
    }
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    // OBS 経由（obs_data）では数値配列が失われるため，同梱された JSON 文字列を優先する
    if (typeof msg.json === 'string') { try { msg = JSON.parse(msg.json); } catch (e) {} }
    switch (msg.type) {
      case 'config': applyConfig(msg.config, { persist: true }); break;
      case 'text': {
        const i = msg.slot | 0; if (i < 0 || i > 3) return;
        state[i].text = msg.text || '';
        state[i].interim = msg.interim || '';
        render(i, isTicker(i) ? false : !!msg.animate);   // 1行表示では出現アニメは行全体が動いて見づらいので使わない
        break;
      }
      case 'clear': {
        // slots が空配列（旧経路で数値配列が落ちた場合）や未指定なら全行
        let slots = Array.isArray(msg.slots) ? msg.slots.map(Number).filter(i => i >= 0 && i <= 3) : [];
        if (typeof msg.slotList === 'string') slots = msg.slotList.split(',').map(Number).filter(i => i >= 0 && i <= 3);
        if (!slots.length) slots = [0, 1, 2, 3];
        slots.forEach(i => {
          if (msg.soft) {
            lines[i].classList.add('fade-out');
            setTimeout(() => { if (lines[i].classList.contains('fade-out')) { state[i] = { text: '', interim: '' }; render(i, false); } }, 360);
          } else { state[i] = { text: '', interim: '' }; render(i, false); }
        });
        break;
      }
      case 'previewMode': previewMode = msg.mode || 'auto'; applyBackground(); break;
      case 'ping': reply({ type: 'pong', inOBS }); break;
    }
  }

  // ---- 受信経路 ---------------------------------------------------------
  let bc = null;
  try { bc = new BroadcastChannel('jimakuChan'); bc.onmessage = e => handle(e.data); } catch (e) {}
  function reply(m) { try { bc && bc.postMessage(m); } catch (e) {} }

  window.addEventListener('jimakuChan', e => { gotAny(); handle(e.detail); });      // OBS ブラウザソース
  document.addEventListener('jimakuChan', e => { gotAny(); handle(e.detail); });
  window.addEventListener('message', e => {
    if (!(e.data && e.data.jimakuChan)) return;
    if (e.source !== window.parent && e.source !== window.opener) return;   // 親フレーム／開いた元だけ受け付ける
    handle(e.data.jimakuChan);
  });

  // URL の cfg（base64url JSON）で初期スタイル
  // URL の cfg（ソース追加時点のスナップショット）と，最後に受信して保存した設定のうち新しい方を使う
  // （OBS でブラウザソースを再読み込みしても最新の設定で表示されるように）
  const cfgParam = params.get('cfg');
  let urlCfg = null, savedCfg = null;
  if (cfgParam) {
    try { urlCfg = JSON.parse(decodeURIComponent(escape(atob(cfgParam.replace(/-/g, '+').replace(/_/g, '/'))))); }
    catch (e) { console.warn('cfg parse error', e); }
  }
  try { const saved = localStorage.getItem(STORE_KEY); savedCfg = saved ? JSON.parse(saved) : null; } catch (e) {}
  if (urlCfg && savedCfg) applyConfig((Number(savedCfg.ts) || 0) > (Number(urlCfg.ts) || 0) ? savedCfg : urlCfg);
  else applyConfig(urlCfg || savedCfg || null);

  // OBS 内で何も受信していない間は小さく待機表示（ページが読めているかの確認用）．最初のメッセージで消える
  let waitEl = null;
  if (inOBS && !isPreview) {
    waitEl = document.createElement('div');
    waitEl.textContent = 'jimakuChan 字幕：接続待ち… (' + new Date().toLocaleTimeString() + ')';
    waitEl.style.cssText = 'position:fixed;left:8px;top:8px;font:14px/1.4 sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:4px 8px;border-radius:6px;opacity:.85';
    document.body.appendChild(waitEl);
    setTimeout(() => { if (waitEl) { waitEl.remove(); waitEl = null; } }, 60000);
  }
  function gotAny() { if (waitEl) { waitEl.remove(); waitEl = null; } }
  // 初期表示（何も受信していない間）
  if (params.get('demo') === '1') {
    state[0].text = params.get('t0') || '音声認識字幕ちゃん v2';
    render(0, true);
  }
  // プレビュー iframe 内クリック → 親へ通知（表示モードのトグル用）
  if (isPreview) document.addEventListener('click', () => { try { window.parent.postMessage({ jimakuChanEvent: 'click' }, '*'); } catch (e) {} });
  // ホストに設定を要求（同一ブラウザ内）
  reply({ type: 'hello', inOBS, preview: isPreview });

  window.addEventListener('resize', () => { for (let i = 0; i < 4; i++) updateOverflow(i); });

  window.jimakuOverlay = { handle, applyConfig, getConfig: () => cfg };
})();
