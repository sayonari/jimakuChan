/*
 * jimakuChan v2 – センシティブワードフィルタ
 *
 * goodBadWordlist（https://github.com/sayonari/goodBadWordlist）の
 * BadList.txt / GoodList.txt を読み込み，字幕テキストを伏字にする．
 *
 * v1 からの主な変更（伏字過多対策）
 *  - ラテン文字・キリル文字など「単語を空白で区切る言語」の単語は
 *    単語境界つきでマッチさせる（class の "ass"，hello の "hell" を伏字にしない）
 *  - ハングルは語頭のみ境界チェック（助詞が後ろに付くため）
 *  - 日本語・中国語・タイ語など分かち書きしない言語は従来通り部分一致
 *  - GoodList の語は長いものから先に保護し，私用領域文字のプレースホルダで退避
 *  - BadList は長い語から先にマッチ（「アナル」より「アナルセックス」を優先）
 *  - 404 (リストが無い言語) を誤ってワードとして読み込まない
 *  - 全角英字 (ＳＥＸ) など NFKC 正規化した形も同時に検出
 */
(function (global) {
  'use strict';

  const REPO_BASE = 'https://raw.githubusercontent.com/sayonari/goodBadWordlist/main/';

  // 言語コード → リポジトリ内フォルダ名
  function langToDir(code) {
    if (!code) return null;
    if (/^zh-(CN|TW|HK)$/i.test(code)) return code;
    return code.split('-')[0].toLowerCase();
  }

  async function fetchList(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return [];               // 404 などはリスト無しとして扱う
      const t = await r.text();
      if (/^\s*404/.test(t)) return [];   // 念のため
      return t.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
    } catch (e) {
      console.warn('[filter] リスト取得失敗:', url, e);
      return [];
    }
  }

  const listCache = new Map();
  async function loadLists(lang) {
    const dir = langToDir(lang);
    if (!dir) return { bad: [], good: [] };
    if (listCache.has(dir)) return listCache.get(dir);
    const p = Promise.all([
      fetchList(REPO_BASE + dir + '/BadList.txt'),
      fetchList(REPO_BASE + dir + '/GoodList.txt'),
    ]).then(([bad, good]) => ({ bad, good }));
    listCache.set(dir, p);
    return p;
  }

  // ---- 正規表現ユーティリティ -------------------------------------------
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // 空白で単語を区切る文字体系だけで構成されているか
  const RE_SPACED = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Armenian}\p{Script=Georgian}0-9'’\-\s.]+$/u;
  const RE_HANGUL = /^[\p{Script=Hangul}\s]+$/u;

  function toFullWidth(s) {
    return s.replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  }

  // 1 語 → 正規表現断片
  function wordPattern(word) {
    const variants = new Set([word]);
    const nfkc = word.normalize('NFKC');
    variants.add(nfkc);
    if (/^[\x20-\x7e]+$/.test(nfkc)) variants.add(toFullWidth(nfkc)); // 全角英数
    const alt = [...variants].map(v => esc(v).replace(/\s+/g, '\\s*')).join('|');

    if (RE_SPACED.test(word)) {
      // 単語境界（前後が文字・数字でない）．複数形 s のみ許容
      return `(?<![\\p{L}\\p{N}])(?:${alt})s?(?![\\p{L}\\p{N}])`;
    }
    if (RE_HANGUL.test(word)) {
      return `(?<![\\p{L}])(?:${alt})`;
    }
    return `(?:${alt})`;
  }

  function buildRegex(words) {
    const uniq = [...new Set(words.map(w => w.trim()).filter(Boolean))];
    if (uniq.length === 0) return null;
    uniq.sort((a, b) => b.length - a.length);      // 長い語を優先
    return new RegExp(uniq.map(wordPattern).join('|'), 'giu');
  }

  // ---- フィルタ本体 -----------------------------------------------------
  class WordFilter {
    /**
     * @param {string[]} bad  伏字にする語
     * @param {string[]} good 保護する語（bad の部分文字列を含む正当な語）
     * @param {object}   opts { maskChar:'*', keepLength:true }
     */
    constructor(bad = [], good = [], opts = {}) {
      this.opts = Object.assign({ maskChar: '*', keepLength: true }, opts);
      this.setWords(bad, good);
    }

    setWords(bad, good) {
      this.bad = bad || [];
      this.good = (good || []).slice().sort((a, b) => b.length - a.length);
      this.badRe = buildRegex(this.bad);
      this.goodRe = buildRegex(this.good);
      return this;
    }

    get enabled() { return !!this.badRe; }

    apply(text) {
      if (!text || !this.badRe) return text;
      let work = text;
      const stash = [];

      // 1) 保護語を私用領域文字のトークンへ退避
      if (this.goodRe) {
        work = work.replace(this.goodRe, m => {
          const id = stash.push(m) - 1;
          // U+E000 + index(0..0x18FF を 1 文字で表現) + U+E001
          return '\uE000' + String.fromCharCode(0xE100 + id) + '\uE001';
        });
      }

      // 2) 伏字化
      work = work.replace(this.badRe, m => {
        if (!this.opts.keepLength) return this.opts.maskChar.repeat(3);
        // トークン文字が含まれる場合は長さ計算から除外
        const len = [...m.replace(/[\uE000-\uE9FF]/g, '')].length || 3;
        return this.opts.maskChar.repeat(len);
      });

      // 3) 復元
      if (stash.length) {
        work = work.replace(/\uE000([\uE100-\uE9FF])\uE001/g, (_, c) => stash[c.charCodeAt(0) - 0xE100] || '');
      }
      return work;
    }
  }

  /**
   * 言語コードからフィルタを構築（リポジトリ + ユーザー追加語）
   */
  async function createFilter(lang, extraBad = [], extraGood = [], opts = {}) {
    const { bad, good } = await loadLists(lang);
    return new WordFilter(bad.concat(extraBad), good.concat(extraGood), opts);
  }

  global.JimakuFilter = { WordFilter, createFilter, loadLists, langToDir, REPO_BASE };
})(typeof window !== 'undefined' ? window : globalThis);
