/*
 * jimakuChan v2 – 翻訳（Chrome 内蔵 Translator API / Google Apps Script プロキシ）
 *
 * translateAll(text, sourceLang, targets[]) → Promise<[{lang, text, ok, via, error}]>
 *   - method 'chrome' : Chrome 138+ の Translator API（ローカル・高速）
 *   - method 'gas'    : GAS プロキシ経由 Google 翻訳（gasKey 必須）
 *   - Chrome で失敗した場合，gasKey があれば GAS にフォールバック
 */
(function (global) {
  'use strict';

  function gasNormalize(code) {
    if (!code) return code;
    if (/^zh-/i.test(code)) return code;      // zh-CN / zh-TW / zh-HK はそのまま
    return code.split('-')[0];
  }

  const LANG_NAMES_MAP = {
    ja: 'Japanese', en: 'English', ko: 'Korean',
    'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese', 'zh-HK': 'Cantonese / Chinese (HK)',
    fr: 'French', it: 'Italian', de: 'German', es: 'Spanish', pt: 'Portuguese', ru: 'Russian',
    uk: 'Ukrainian', pl: 'Polish', nl: 'Dutch', sv: 'Swedish', tr: 'Turkish', id: 'Indonesian',
    vi: 'Vietnamese', th: 'Thai', ar: 'Arabic', hi: 'Hindi', el: 'Greek', so: 'Somali'
  };
  function langName(code) {
    if (!code) return 'English';
    const norm = gasNormalize(code);
    return LANG_NAMES_MAP[code] || LANG_NAMES_MAP[norm] || code;
  }

  // 初回のモデル読み込みを含むため，ローカル LLM は長めのタイムアウトにする
  const OLLAMA_TIMEOUT_MS = 30000;

  class Translator {
    constructor() {
      this.method = 'chrome';
      this.gasKey = '';
      this.ollama = { url: 'http://localhost:11434', model: 'qwen2.5:3b' };
      this.count = 0;                // 今セッションの翻訳回数（GAS の累計はレスポンスから）
      this.gasTotal = null;          // GAS 側が返す累計回数
      this.onStatus = () => {};      // (text, level:'ok'|'busy'|'warn'|'err')
      this._chrome = global.chromeTranslator || null;
      this._ollamaWs = null;
      this._ollamaReqId = 0;
      this._ollamaPending = new Map();
      // Ollama は 1 モデル直列処理のため，実行中 1 件＋最新の待機 1 件に制限する
      this._ollamaRunning = false;
      this._ollamaQueued = null;
    }

    get chromeAvailable() { return !!(this._chrome && this._chrome.isAvailable); }
    get gasAvailable() { return !!this.gasKey; }

    async checkChrome() {
      if (!this._chrome) return false;
      try { await this._chrome.checkAvailability(); } catch (e) {}
      return this.chromeAvailable;
    }

    /** モデルの状態 'available'|'downloadable'|'downloading'|'unavailable' */
    async chromeModelStatus(src, dst) {
      if (!('Translator' in global)) return 'unavailable';
      try {
        const q = global.Translator.availability({
          sourceLanguage: this._chrome.normalizeLanguageCode(src),
          targetLanguage: this._chrome.normalizeLanguageCode(dst),
        });
        // 環境によっては応答が返らないことがあるので 4 秒で打ち切る
        return await Promise.race([q, new Promise(r => setTimeout(() => r('unknown'), 4000))]);
      } catch (e) { return 'unavailable'; }
    }

    async preloadChrome(src, dst) {
      if (!this._chrome) return false;
      return this._chrome.preloadLanguagePack(src, dst);
    }

    async translateOne(text, src, dst) {
      if (!text) return { lang: dst, text: '', ok: true, via: 'none' };
      const cSrc = this._chrome ? this._chrome.normalizeLanguageCode(src) : gasNormalize(src);
      const cDst = this._chrome ? this._chrome.normalizeLanguageCode(dst) : gasNormalize(dst);
      if (cSrc === cDst || gasNormalize(src) === gasNormalize(dst)) {
        return { lang: dst, text, ok: true, via: 'same' };
      }
      let lastErr = null;
      if (this.method === 'chrome' && this.chromeAvailable) {
        try {
          const out = await this._chrome.translate(text, cSrc, cDst);
          this.count++;
          return { lang: dst, text: out, ok: true, via: 'chrome' };
        } catch (e) { lastErr = e; console.warn('[trans] Chrome 翻訳失敗:', e && e.message); }
      }
      if (this.method === 'ollama') {
        try {
          const out = await this._ollama(text, src, dst);
          if (out && out.__superseded) return { lang: dst, text: '', ok: false, via: 'ollama', superseded: true };
          this.count++;
          return { lang: dst, text: out, ok: true, via: 'ollama' };
        } catch (e) { lastErr = e; console.warn('[trans] Ollama 翻訳失敗:', e && e.message); }
      }
      if (this.gasAvailable) {
        try {
          const out = await this._gas(text, gasNormalize(src), gasNormalize(dst));
          this.count++;
          return { lang: dst, text: out, ok: true, via: 'gas' };
        } catch (e) { lastErr = e; console.warn('[trans] GAS 翻訳失敗:', e && e.message); }
      }
      return { lang: dst, text: '', ok: false, via: 'none', error: lastErr ? (lastErr.message || String(lastErr)) : 'no-method' };
    }

    /** 複数言語へ並列翻訳 */
    async translateAll(text, src, targets) {
      const active = targets.map((t, i) => ({ t, i })).filter(x => x.t && x.t !== 'none');
      if (!active.length) return [];
      this.onStatus('翻訳中', 'busy');
      const results = await Promise.all(active.map(x => this.translateOne(text, src, x.t).then(r => Object.assign(r, { slot: x.i }))));
      const bad = results.filter(r => !r.ok && !r.superseded);
      if (bad.length === 0) {
        const v = results[0].via;
        const msg = v === 'chrome' ? 'Chrome翻訳 完了' : (v === 'gas' ? 'GAS翻訳 完了' : (v === 'ollama' ? 'Ollama翻訳 完了' : '翻訳 完了'));
        this.onStatus(msg, 'ok');
      } else {
        this.onStatus('翻訳エラー: ' + (bad[0].error || ''), 'err');
      }
      return results;
    }

    async _gas(text, src, dst) {
      const url = 'https://script.google.com/macros/s/' + encodeURIComponent(this.gasKey) + '/exec'
        + '?text=' + encodeURIComponent(text) + '&source=' + encodeURIComponent(src) + '&target=' + encodeURIComponent(dst);
      const ac = new AbortController(); const tid = setTimeout(() => ac.abort(), 12000);
      let r;
      try { r = await fetch(url, { signal: ac.signal }); } finally { clearTimeout(tid); }
      if (!r.ok) {
        if (r.status === 429) throw new Error('API上限');
        if (r.status === 403) throw new Error('API認証エラー');
        throw new Error('HTTP ' + r.status);
      }
      const body = await r.text();
      try {
        const j = JSON.parse(body);
        if (j && j.translatedText !== undefined) {
          if (j.translatedCount !== undefined) this.gasTotal = j.translatedCount;
          return String(j.translatedText);
        }
      } catch (e) { /* プレーンテキスト応答 */ }
      return body;
    }

    /** 直列キュー経由で翻訳する．実行中に来た新しい要求は待機枠を上書きし，古い待機は破棄する */
    _ollama(text, src, dst) {
      return new Promise((resolve, reject) => {
        if (this._ollamaQueued) this._ollamaQueued.resolve({ __superseded: true });
        this._ollamaQueued = { text, src, dst, resolve, reject };
        this._pumpOllama();
      });
    }

    async _pumpOllama() {
      if (this._ollamaRunning || !this._ollamaQueued) return;
      const job = this._ollamaQueued;
      this._ollamaQueued = null;
      this._ollamaRunning = true;
      try {
        job.resolve(await this._ollamaRequest(job.text, job.src, job.dst));
      } catch (e) {
        job.reject(e);
      } finally {
        this._ollamaRunning = false;
        this._pumpOllama();
      }
    }

    async _ollamaRequest(text, src, dst) {
      const cfg = this.ollama || {};
      const rawUrl = (cfg.url || 'http://localhost:11434').trim();
      const model = (cfg.model || 'qwen2.5:3b').trim();
      const srcLang = langName(src);
      const dstLang = langName(dst);
      const systemPrompt = `You are a professional realtime subtitle translator. Translate the given spoken text from ${srcLang} into natural ${dstLang}. Output ONLY the direct translation, with no explanation, no markdown formatting, no quotes, and no notes.`;

      if (/^wss?:\/\//i.test(rawUrl)) {
        return await this._ollamaWsRequest(rawUrl, {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          think: false,
          options: { temperature: 0.3 }
        });
      }

      const endpoint = rawUrl.replace(/\/+$/, '') + '/api/chat';
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), OLLAMA_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text }
            ],
            stream: false,
            think: false,
            options: { temperature: 0.3 }
          }),
          signal: ac.signal
        });
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('Ollama タイムアウト (' + Math.round(OLLAMA_TIMEOUT_MS / 1000) + 's)');
        throw new Error('Ollama 接続失敗 (CORS設定または未起動)');
      } finally {
        clearTimeout(tid);
      }

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const data = await res.json();
      const content = (data.message && data.message.content) || (data.response) || '';
      return String(content).trim().replace(/^["「『](.*)["」』]$/, '$1').trim();
    }

    _failOllamaPending(msg) {
      if (!this._ollamaPending || !this._ollamaPending.size) return;
      for (const h of this._ollamaPending.values()) { try { h.reject(new Error(msg)); } catch (e) {} }
      this._ollamaPending.clear();
    }

    _getOllamaWs(url) {
      if (this._ollamaWs && this._ollamaWs.url === url && this._ollamaWs.readyState === 1) {
        return Promise.resolve(this._ollamaWs);
      }
      return new Promise((resolve, reject) => {
        try {
          if (this._ollamaWs) { this._failOllamaPending('WebSocket ブリッジを再接続します'); try { this._ollamaWs.close(); } catch (e) {} }
          const ws = new WebSocket(url);
          const timer = setTimeout(() => {
            try { ws.close(); } catch (e) {}
            reject(new Error('WebSocket ブリッジ接続タイムアウト'));
          }, 4000);
          ws.onopen = () => {
            clearTimeout(timer);
            this._ollamaWs = ws;
            resolve(ws);
          };
          ws.onerror = () => {
            clearTimeout(timer);
            this._failOllamaPending('WebSocket ブリッジ接続失敗');
            reject(new Error('WebSocket ブリッジ接続失敗'));
          };
          ws.onclose = () => {
            if (this._ollamaWs === ws) this._ollamaWs = null;
            this._failOllamaPending('WebSocket ブリッジが切断されました');
          };
          ws.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data);
              if (data && data.id && this._ollamaPending.has(data.id)) {
                const handler = this._ollamaPending.get(data.id);
                this._ollamaPending.delete(data.id);
                if (data.error) handler.reject(new Error(data.error));
                else if (data.models !== undefined) handler.resolve(data.models);
                else handler.resolve(data.response || data.text || '');
              }
            } catch (e) {}
          };
        } catch (err) {
          reject(err);
        }
      });
    }

    async fetchOllamaModels(customUrl) {
      const cfg = this.ollama || {};
      const rawUrl = (customUrl || cfg.url || 'http://localhost:11434').trim();

      if (/^wss?:\/\//i.test(rawUrl)) {
        const ws = await this._getOllamaWs(rawUrl);
        const id = 'req_' + (++this._ollamaReqId) + '_' + Date.now();
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this._ollamaPending.delete(id);
            reject(new Error('WebSocket モデル一覧取得タイムアウト (5s)'));
          }, 5000);
          this._ollamaPending.set(id, {
            resolve: (res) => { clearTimeout(timer); resolve(Array.isArray(res) ? res : []); },
            reject: (err) => { clearTimeout(timer); reject(err); }
          });
          ws.send(JSON.stringify({ id, action: 'tags' }));
        });
      }

      const endpoint = rawUrl.replace(/\/+$/, '') + '/api/tags';
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 5000);
      let res;
      try {
        res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: ac.signal
        });
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('Ollama タイムアウト (5s)');
        throw new Error('Ollama 接続失敗 (CORS未設定またはサーバー未起動)');
      } finally {
        clearTimeout(tid);
      }

      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const data = await res.json();
      const list = (data && data.models && Array.isArray(data.models))
        ? data.models.map(m => m.name).filter(Boolean)
        : [];
      return list;
    }

    async _ollamaWsRequest(url, payload) {
      const ws = await this._getOllamaWs(url);
      const id = 'req_' + (++this._ollamaReqId) + '_' + Date.now();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this._ollamaPending.delete(id);
          reject(new Error('WebSocket 翻訳タイムアウト (' + Math.round(OLLAMA_TIMEOUT_MS / 1000) + 's)'));
        }, OLLAMA_TIMEOUT_MS);
        this._ollamaPending.set(id, {
          resolve: (res) => { clearTimeout(timer); resolve(String(res).trim().replace(/^["「『](.*)["」』]$/, '$1').trim()); },
          reject: (err) => { clearTimeout(timer); reject(err); }
        });
        ws.send(JSON.stringify(Object.assign({ id }, payload)));
      });
    }
  }

  global.JimakuTranslator = Translator;
})(typeof window !== 'undefined' ? window : globalThis);
