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

  class Translator {
    constructor() {
      this.method = 'chrome';
      this.gasKey = '';
      this.count = 0;                // 今セッションの翻訳回数（GAS の累計はレスポンスから）
      this.gasTotal = null;          // GAS 側が返す累計回数
      this.onStatus = () => {};      // (text, level:'ok'|'busy'|'warn'|'err')
      this._chrome = global.chromeTranslator || null;
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
      const bad = results.filter(r => !r.ok);
      if (bad.length === 0) this.onStatus(results[0].via === 'chrome' ? 'Chrome翻訳 完了' : results[0].via === 'gas' ? 'GAS翻訳 完了' : '翻訳 完了', 'ok');
      else this.onStatus('翻訳エラー: ' + (bad[0].error || ''), 'err');
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
  }

  global.JimakuTranslator = Translator;
})(typeof window !== 'undefined' ? window : globalThis);
