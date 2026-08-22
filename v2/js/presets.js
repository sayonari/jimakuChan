/*
 * jimakuChan v2 – 設定スキーマ・プリセット・保存/読込・旧版からの移行
 *
 * localStorage
 *   jimakuChan_v2_presets  : { presets:{ [id]: {name, settings, builtin, lastModified} }, current:id }
 *   jimakuChan_v2_ui       : { lang:'ja'|'en', tab, previewBg, obsPassword? }
 *   jimakuChan_v2_overlayConfig : 直近の表示設定（overlay.html 単独起動時の復元用）
 * 旧版 (v1)
 *   jimakuChan_presets     : { [id]: {name, settings:{...config_values}} }  → 自動移行
 */
(function (global) {
  'use strict';

  const VERSION = '2026.08.22 17:41';   // 更新時に日付＋時刻（JST）を書き換える
  const KEY = 'jimakuChan_v2_presets';
  const KEY_UI = 'jimakuChan_v2_ui';

  const line = (o = {}) => Object.assign({ font: 'M PLUS Rounded 1c', size: 25, weight: 900, color: '#ffffff', strokeColor: '#000000', strokeWidth: 6, nowrap: false }, o);   // nowrap: 1 行ティッカー（折り返さず，最新を右端に・過去は左へ）

  const DEFAULTS = {
    // 認識
    recog: 'ja', recogModel: 'cloud', recogMode: 'restart', shortPause: 750, timer: 7000, bouyomi: false, autoStart: true,
    wordBoost: '', wordBoostStrength: 5,
    // 翻訳
    trans: ['en', 'none', 'none'], translationMethod: 'chrome', gasKey: '',
    // 見た目
    theme: 'outline', anim: 'none', boxColor: 'rgba(0,0,0,0.55)', boxRadius: 12, strokeMode: 'round',
    lines: [line(), line(), line(), line()],
    bgcolor: '#00ff00', bgTransparent: true, textAlign: 'center', vAlign: 'bottom', whiteSpace: 'normal',
    lineSpacing: [0, 0, 0], interimLeft: ' << ', interimRight: ' >>', interimOpacity: 100,
    // フィルタ・辞書
    filterOn: true, extraBad: '', extraGood: '', wordReplace: '',
    // OBS
    obs: { url: 'ws://localhost:4455', password: '', auto: false, textSources: ['', '', '', ''] },
  };

  // 組み込みプリセット（v1 の 8 種を v2 スキーマで再定義）
  const BUILTIN = {
    default:  { name: '📋 標準', settings: {} },
    gaming:   { name: '🎮 ゲーム配信用', settings: { theme: 'outline', anim: 'pop', timer: 5000, shortPause: 1000,
                lines: [line({ size: 28, strokeColor: '#ff6b9d' }), line({ size: 24, color: '#ffeb3b', strokeColor: '#7b1fa2', strokeWidth: 4 }), line(), line()] } },
    meeting:  { name: '💼 会議・打ち合わせ用', settings: { theme: 'box', anim: 'fade', textAlign: 'left', vAlign: 'top', timer: 10000, boxColor: 'rgba(255,255,255,0.88)', boxRadius: 8,
                lines: [line({ font: 'Noto Sans JP', size: 22, weight: 500, color: '#2e3440', strokeColor: '#eceff4', strokeWidth: 0 }), line({ font: 'Noto Sans JP', size: 20, weight: 500, color: '#5e81ac', strokeColor: '#eceff4', strokeWidth: 0 }), line(), line()] } },
    language_learning: { name: '📚 語学学習用', settings: { theme: 'outline', anim: 'fade', vAlign: 'middle', timer: 15000, shortPause: 500, trans: ['en', 'none', 'none'],
                lines: [line({ size: 26, weight: 600, color: '#2d3748', strokeColor: '#bee3f8', strokeWidth: 4 }), line({ size: 22, weight: 600, color: '#d53f8c', strokeColor: '#fed7e2', strokeWidth: 3 }), line({ size: 22, weight: 600, color: '#3182ce', strokeColor: '#bee3f8', strokeWidth: 3 }), line()] } },
    accessibility: { name: '♿ アクセシビリティ重視', settings: { theme: 'box', anim: 'none', shortPause: 1500, boxColor: 'rgba(0,0,0,0.85)', boxRadius: 6,
                lines: [line({ font: 'Noto Sans JP', size: 32, strokeWidth: 2 }), line({ font: 'Noto Sans JP', size: 25, strokeWidth: 2 }), line(), line()] } },
    cute_streaming: { name: '🌸 かわいい配信用', settings: { theme: 'glow', anim: 'pop', timer: 6000, shortPause: 800,
                lines: [line({ font: 'Hachi Maru Pop', size: 30, weight: 700, strokeColor: '#ff69b4', strokeWidth: 5 }), line({ font: 'Hachi Maru Pop', size: 26, weight: 700, color: '#ff1493', strokeColor: '#ffb6c1', strokeWidth: 4 }), line(), line()] } },
    dark_theme: { name: '🌙 ダークテーマ', settings: { theme: 'shadow', anim: 'rise', shortPause: 900,
                lines: [line({ font: 'Zen Kaku Gothic New', size: 27, weight: 700, color: '#e2e8f0', strokeColor: '#1a202c', strokeWidth: 3 }), line({ font: 'Zen Kaku Gothic New', size: 23, weight: 700, color: '#81e6d9', strokeColor: '#1a202c', strokeWidth: 3 }), line(), line()] } },
    rainbow:  { name: '🌈 レインボー', settings: { theme: 'glow', anim: 'pop', timer: 5500,
                lines: [line({ font: 'Dela Gothic One', size: 29, weight: 800, strokeColor: '#ff0080' }), line({ font: 'Dela Gothic One', size: 25, weight: 800, color: '#00ff80', strokeColor: '#ff8000', strokeWidth: 5 }), line({ size: 25, weight: 800, color: '#8080ff', strokeColor: '#ff0080', strokeWidth: 5 }), line()] } },
    custom1:  { name: '🔧 カスタム１', settings: {} },
    custom2:  { name: '🔧 カスタム２', settings: {} },
    custom3:  { name: '🔧 カスタム３', settings: {} },
  };
  const BUILTIN_EN = { default: '📋 Standard', gaming: '🎮 Gaming', meeting: '💼 Meeting', language_learning: '📚 Language learning', accessibility: '♿ Accessibility', cute_streaming: '🌸 Cute stream', dark_theme: '🌙 Dark', rainbow: '🌈 Rainbow', custom1: '🔧 Custom 1', custom2: '🔧 Custom 2', custom3: '🔧 Custom 3' };

  const clone = o => JSON.parse(JSON.stringify(o));
  function deepMerge(base, over) {
    const out = clone(base);
    if (!over || typeof over !== 'object') return out;
    for (const k of Object.keys(over)) {
      const v = over[k];
      if (Array.isArray(v)) {
        out[k] = Array.isArray(out[k]) ? out[k].map((b, i) => (v[i] !== undefined ? (b && typeof b === 'object' && !Array.isArray(b) ? deepMerge(b, v[i]) : clone(v[i])) : b)) : clone(v);
        if (Array.isArray(out[k]) && v.length > out[k].length) out[k] = out[k].concat(clone(v.slice(out[k].length)));
      } else if (v && typeof v === 'object') out[k] = deepMerge(out[k] || {}, v);
      else if (v !== undefined) out[k] = v;
    }
    return out;
  }

  // ---- 旧版（v1）設定の変換 -----------------------------------------------
  const FONT_MAP = { 'M PLUS\\\\ 1p': 'M PLUS 1p', 'M PLUS\\ 1p': 'M PLUS 1p', 'M PLUS Rounded\\\\ 1c': 'M PLUS Rounded 1c', 'M PLUS Rounded\\ 1c': 'M PLUS Rounded 1c' };
  function v1Font(sel, sys, direct) {
    if (sel && sel !== 'direct') return FONT_MAP[sel] || sel.replace(/\\+ /g, ' ');
    return (direct && direct.trim()) || (sys && sys !== 'direct' ? sys : '') || 'M PLUS Rounded 1c';
  }
  function fromV1(s) {
    if (!s || typeof s !== 'object') return {};
    const num = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
    const out = {
      recog: s.recog || 'ja',
      recogModel: s.recog_model || 'cloud',
      shortPause: num(s.short_pause, 750),
      timer: s.timer === '' || s.timer === undefined ? 0 : num(s.timer, 7000),
      bouyomi: s.bouyomi === true || s.bouyomi === 'true',
      wordBoost: s.word_boost_phrases || '', wordBoostStrength: Math.min(10, num(s.word_boost_strength, 5)),
      trans: [s.trans || 'none', s.trans2 || 'none', s.trans3 || 'none'],
      translationMethod: s.translation_method || 'chrome', gasKey: s.gas_key || '',
      lines: [
        { font: v1Font(s.speech_text_font_selector, s.speech_text_system_font, s.speech_text_direct_font), size: num(s.size1, 25), weight: num(s.weight1, 900), color: s.color1 || '#ffffff', strokeColor: s.st_color1 || '#000000', strokeWidth: num(s.st_width1, 6) },
        { font: v1Font(s.trans_text_font_selector, s.trans_text_system_font, s.trans_text_direct_font), size: num(s.size2, 25), weight: num(s.weight2, 900), color: s.color2 || '#ffffff', strokeColor: s.st_color2 || '#000000', strokeWidth: num(s.st_width2, 6) },
        { font: v1Font(s.trans_text2_font_selector, s.trans_text2_system_font, s.trans_text2_direct_font), size: num(s.size3, 25), weight: num(s.weight3, 900), color: s.color3 || '#ffffff', strokeColor: s.st_color3 || '#000000', strokeWidth: num(s.st_width3, 6) },
        { font: v1Font(s.trans_text3_font_selector, s.trans_text3_system_font, s.trans_text3_direct_font), size: num(s.size4, 25), weight: num(s.weight4, 900), color: s.color4 || '#ffffff', strokeColor: s.st_color4 || '#000000', strokeWidth: num(s.st_width4, 6) },
      ],
      bgcolor: s.bgcolor || '#00ff00',
      textAlign: s.textAlign || 'center',
      vAlign: s.v_align === 'top' ? 'top' : (s.v_align === 'center' ? 'middle' : 'bottom'),
      whiteSpace: s.whiteSpace === 'nowrap' ? 'nowrap' : 'normal',
      lineSpacing: [num(s.line_spacing_1, 0), num(s.line_spacing_2, 0), num(s.line_spacing_3, 0)],
      interimLeft: s.interim_marker_left !== undefined ? s.interim_marker_left : ' << ',
      interimRight: s.interim_marker_right !== undefined ? s.interim_marker_right : ' >>',
      filterOn: !(s.anti_sexual === true || s.anti_sexual === 'true'),   // v1: チェックON=やめる
      wordReplace: s.word_replace_rules || '',
    };
    // v1 の "\\ " エスケープ済み Google フォント名の残りを掃除／全体の折り返し設定を行ごとへ
    out.lines.forEach(l => { l.font = String(l.font).replace(/\\+ /g, ' '); l.nowrap = out.whiteSpace === 'nowrap'; });
    return out;
  }

  // ---- ストア -----------------------------------------------------------
  class PresetStore {
    constructor() {
      this.data = null;
      this.load();
    }
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      if (!d || !d.presets) {
        d = { presets: {}, current: 'default' };
        // 旧版からの移行
        const v1 = this.readV1();
        if (v1) {
          for (const [id, p] of Object.entries(v1.presets)) {
            d.presets[id] = { name: (BUILTIN[id] && BUILTIN[id].name) || p.name || id, settings: fromV1(p.settings), builtin: !!BUILTIN[id], lastModified: new Date().toISOString(), migratedFrom: 'v1' };
          }
          if (v1.current && d.presets[v1.current]) d.current = v1.current;
          d.migratedFromV1 = true;
        }
      }
      // 組み込みプリセットの欠けを補う
      for (const [id, b] of Object.entries(BUILTIN)) {
        if (!d.presets[id]) d.presets[id] = { name: b.name, settings: clone(b.settings), builtin: true, lastModified: null };
      }
      if (!d.presets[d.current]) d.current = 'default';
      // 既定値の改訂（rev2, 2026-08-17）：β初期の保存値に残る旧既定を新既定へ寄せる．
      // 連続認識は文末確定が遅く重く見える→「文ごとに再起動」へ／標準・カスタム系の「せり上がり」（旧既定）→「なし」
      // （組み込みプリセット独自のアニメ指定はそのまま）
      if (!(d.defaultsRev >= 2)) {
        for (const [id, p] of Object.entries(d.presets)) {
          const s = p && p.settings; if (!s) continue;
          if (s.recogMode === 'continuous') s.recogMode = 'restart';
          const bAnim = BUILTIN[id] && BUILTIN[id].settings.anim;
          if (!bAnim && s.anim === 'rise') s.anim = 'none';
        }
        d.defaultsRev = 2;
      }
      this.data = d;
      this.save();
    }
    readV1() {
      try {
        const p = JSON.parse(localStorage.getItem('jimakuChan_presets') || 'null');
        if (!p || typeof p !== 'object') return null;
        return { presets: p, current: localStorage.getItem('selectedPreset') || 'default' };
      } catch (e) { return null; }
    }
    hasV1() { return !!localStorage.getItem('jimakuChan_presets'); }
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('save failed', e); } }

    get currentId() { return this.data.current; }
    list(lang) {
      return Object.entries(this.data.presets).map(([id, p]) => ({ id, name: (lang === 'en' && BUILTIN_EN[id]) ? BUILTIN_EN[id] : p.name, builtin: !!p.builtin }));
    }
    /** 完全な設定オブジェクトを返す（DEFAULTS + builtin + 保存値） */
    get(id) {
      const p = this.data.presets[id] || this.data.presets.default;
      const base = deepMerge(DEFAULTS, (BUILTIN[id] && BUILTIN[id].settings) || {});
      const out = deepMerge(base, p.settings || {});
      // 互換：行ごとの nowrap が無い古い保存値は，全体設定 whiteSpace=nowrap を各行へ引き継ぐ
      const ls = (p.settings && p.settings.lines) || [];
      if (p.settings && p.settings.whiteSpace === 'nowrap' && !ls.some(l => l && typeof l.nowrap === 'boolean')) out.lines.forEach(l => { l.nowrap = true; });
      return out;
    }
    select(id) { if (this.data.presets[id]) { this.data.current = id; this.save(); } return this.get(this.data.current); }
    /** 現在のプリセットに設定を保存 */
    update(settings, id = this.data.current) {
      const p = this.data.presets[id];
      if (!p) return;
      p.settings = clone(settings);
      p.lastModified = new Date().toISOString();
      this.save();
    }
    reset(id = this.data.current) {
      const p = this.data.presets[id];
      if (!p) return this.get(id);
      p.settings = {};
      p.lastModified = new Date().toISOString();
      this.save();
      return this.get(id);
    }
    exportJSON() {
      return JSON.stringify({ app: 'jimakuChan', version: VERSION, exportDate: new Date().toISOString(), data: this.data }, null, 2);
    }
    /** ファイルから読込．v2 形式 / v1 形式（presets）どちらも受け付ける */
    importJSON(text) {
      const j = JSON.parse(text);
      if (j && j.app === 'jimakuChan' && j.data && j.data.presets) {
        this.data = j.data;
      } else if (j && j.presets && j.version) {            // v1 export
        const d = { presets: {}, current: 'default' };
        for (const [id, p] of Object.entries(j.presets)) d.presets[id] = { name: (BUILTIN[id] && BUILTIN[id].name) || p.name || id, settings: fromV1(p.settings), builtin: !!BUILTIN[id], lastModified: new Date().toISOString(), migratedFrom: 'v1-file' };
        this.data = d;
      } else if (j && typeof j === 'object' && (j.recog || j.size1)) { // v1 legacy single config
        this.data.presets.default.settings = fromV1(j);
        this.data.current = 'default';
      } else {
        throw new Error('unknown format');
      }
      for (const [id, b] of Object.entries(BUILTIN)) if (!this.data.presets[id]) this.data.presets[id] = { name: b.name, settings: clone(b.settings), builtin: true, lastModified: null };
      if (!this.data.presets[this.data.current]) this.data.current = 'default';
      this.save();
      return this.get(this.data.current);
    }
  }

  // UI 状態（言語など）
  const ui = {
    load() { try { return JSON.parse(localStorage.getItem(KEY_UI) || '{}'); } catch (e) { return {}; } },
    save(o) { try { localStorage.setItem(KEY_UI, JSON.stringify(Object.assign(ui.load(), o))); } catch (e) {} },
  };

  global.JimakuPresets = { VERSION, DEFAULTS, BUILTIN, PresetStore, deepMerge, clone, fromV1, ui };
})(typeof window !== 'undefined' ? window : globalThis);
