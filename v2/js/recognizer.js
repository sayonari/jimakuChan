/*
 * jimakuChan v2 – 音声認識エンジン（Web Speech API / デュアルインスタンス）
 *
 * mode 'continuous'（既定）: continuous=true の 1 セッションを回し続ける．文の区切りは Chrome の
 *   エンドポイント検出に任せつつ，shortPause ms 途中結果が止まったら「仮確定」して字幕・翻訳を先に出す．
 *   セッションが途切れないので次の文の頭が切れない．
 * mode 'restart'（v1 方式）: continuous=false を 2 インスタンスで交互に回し，確定のたびに次を先行起動．
 *
 * イベント（EventTarget）：
 *   'interim'  detail:{ text }                    途中結果（確定分は含まない）
 *   'final'    detail:{ text, confidence }         確定結果
 *   'state'    detail:{ running:boolean, listening:boolean }
 *   'error'    detail:{ error, fatal:boolean, message }
 *   'fallback' detail:{ from:'local', to:'cloud' } オンデバイス→クラウドへ自動切替
 */
(function (global) {
  'use strict';

  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;

  class Recognizer extends EventTarget {
    constructor(opts = {}) {
      super();
      this.lang = opts.lang || 'ja';
      this.processLocally = !!opts.processLocally;
      this.phrases = opts.phrases || [];        // [{phrase, boost}]
      this.shortPause = opts.shortPause || 0;   // ms, 0=無効
      this.mode = opts.mode || 'continuous';    // 'continuous' | 'restart'
      this._soft = null;                         // 仮確定した文 {text}
      this._segBase = '';                        // continuous: 直前までに確定済みの結合テキスト（表示済み分）
      this.supported = !!SR;
      this._instances = [];
      this._states = ['stopped', 'stopped'];
      this._active = 0;
      this._wantRunning = false;
      this._pauseTimer = null;
      this._restartTimer = null;
      this._errorCount = 0;
      this._localOK = null;                      // オンデバイス利用可否キャッシュ
      this._lastInterim = '';
    }

    get running() { return this._wantRunning; }
    get listening() { return this._states.some(s => s === 'running'); }

    /** オンデバイス認識の可否 ('available'|'downloadable'|'downloading'|'unavailable'|'unknown') */
    static async localAvailability(lang) {
      if (!SR || typeof SR.available !== 'function') return 'unknown';
      try { return await SR.available({ langs: [lang], processLocally: true }); }
      catch (e) { return 'unknown'; }
    }
    static async installLocal(lang) {
      if (!SR || typeof SR.install !== 'function') return false;
      try { return await SR.install({ langs: [lang], processLocally: true }); }
      catch (e) { return false; }
    }

    configure(opts = {}) {
      Object.assign(this, opts);
      if (this._wantRunning) this.restart();
    }

    async start() {
      if (!this.supported) {
        this._emit('error', { error: 'unsupported', fatal: true, message: 'このブラウザは音声認識に対応していません（Google Chrome を使ってください）' });
        return;
      }
      this._wantRunning = true;
      this._errorCount = 0;
      if (this.processLocally) {
        const a = await Recognizer.localAvailability(this.lang);
        this._localOK = (a === 'available' || a === 'unknown');
        if (!this._localOK) {
          this._emit('fallback', { from: 'local', to: 'cloud', reason: a });
        }
      }
      this._build();
      this._startInstance(0);
      this._emitState();
    }

    stop() {
      this._wantRunning = false;
      clearTimeout(this._pauseTimer); clearTimeout(this._restartTimer);
      this._instances.forEach((r, i) => { try { r.abort(); } catch (e) {} this._states[i] = 'stopped'; });
      this._emitState();
    }

    restart() { this.stop(); setTimeout(() => this.start(), 120); }

    // ---- 内部 ------------------------------------------------------------
    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
    _emitState() { this._emit('state', { running: this._wantRunning, listening: this.listening }); }

    _build() {
      this._instances.forEach(r => { try { r.abort(); } catch (e) {} });
      this._instances = [new SR(), new SR()];
      this._states = ['stopped', 'stopped'];
      this._active = 0;
      this._instances.forEach((rec, i) => this._setup(rec, i));
    }

    _setup(rec, i) {
      rec.lang = this.lang;
      rec.interimResults = true;
      rec.continuous = (this.mode === 'continuous');
      rec.maxAlternatives = 1;
      const useLocal = this.processLocally && this._localOK;
      if (useLocal) { try { rec.processLocally = true; } catch (e) {} }
      if (useLocal && this.phrases.length && 'SpeechRecognitionPhrase' in global) {
        try {
          const objs = this.phrases.map(p => new SpeechRecognitionPhrase(p.phrase, p.boost));
          try { rec.phrases = objs; } catch (e) { if (rec.phrases && rec.phrases.push) objs.forEach(o => rec.phrases.push(o)); }
        } catch (e) { console.warn('[recog] phrases 設定失敗', e); }
      }

      rec.onstart = () => { this._states[i] = 'running'; this._errorCount = 0; this._emitState(); };
      rec.onend = () => {
        this._states[i] = 'stopped';
        this._emitState();
        if (!this._wantRunning) return;
        // セッション終了時に仮確定のまま残っている文があればそのまま確定扱い
        this._soft = null; this._segBase = '';
        // どちらも止まっていれば再起動（空白を最小に）
        if (!this._states.some(s => s !== 'stopped')) {
          clearTimeout(this._restartTimer);
          this._restartTimer = setTimeout(() => this._startInstance(i), this.mode === 'continuous' ? 10 : 60);
        }
      };
      rec.onerror = (ev) => {
        this._states[i] = 'stopped';
        const err = ev.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this._wantRunning = false;
          this._emit('error', { error: err, fatal: true, message: 'マイクの使用が許可されていません．アドレスバーのマイクアイコンから許可してください．' });
          this._emitState();
          return;
        }
        if (err === 'aborted' || err === 'no-speech') return; // 通常運転
        if (err === 'language-not-supported' || err === 'phrases-not-supported') {
          if (this.processLocally || this.phrases.length) {
            this.processLocally = false; this.phrases = []; this._localOK = false;
            this._emit('fallback', { from: 'local', to: 'cloud', reason: err });
            this.restart();
            return;
          }
        }
        this._errorCount++;
        this._emit('error', { error: err, fatal: false, message: err });
        if (err === 'network' && this._errorCount > 3) {
          // 連続ネットワークエラー：少し待って再試行
          clearTimeout(this._restartTimer);
          this._restartTimer = setTimeout(() => { if (this._wantRunning) this._startInstance(i); }, 3000);
        }
      };
      rec.onresult = (ev) => this._onResult(ev, i);
    }

    _startInstance(i) {
      if (!this._wantRunning) return;
      if (this._states[i] !== 'stopped') return;
      try {
        this._states[i] = 'starting';
        this._instances[i].start();
        this._active = i;
      } catch (e) {
        this._states[i] = 'stopped';
        // 既に起動中などの例外：少し待って再試行
        clearTimeout(this._restartTimer);
        this._restartTimer = setTimeout(() => this._startInstance(i), 200);
      }
    }

    _onResult(ev, i) {
      // 先行起動後に旧インスタンスから遅れて届く結果は無視（二重表示・二重翻訳の防止）
      if (i !== this._active) return;
      if (this.mode === 'continuous') return this._onResultContinuous(ev, i);
      let finalText = '', interimText = '', conf = 0, hasNewFinal = false;
      for (let k = 0; k < ev.results.length; k++) {
        const r = ev.results[k];
        if (r.isFinal) { finalText += r[0].transcript; if (r[0].confidence) conf = r[0].confidence; if (k >= ev.resultIndex) hasNewFinal = true; }
        else interimText += r[0].transcript;
      }
      if (hasNewFinal) {
        clearTimeout(this._pauseTimer);
        // 次のインスタンスを先行起動（現在のものは onend で自然終了）
        const next = (i + 1) % 2;
        if (this._states[next] === 'stopped') this._startInstance(next);
        this._lastInterim = '';
        if (finalText.trim()) this._emit('final', { text: finalText.trim(), confidence: conf });
      } else {
        this._lastInterim = interimText;
        this._emit('interim', { text: interimText });
        if (this.shortPause > 0) {
          clearTimeout(this._pauseTimer);
          this._pauseTimer = setTimeout(() => {
            // 一定時間新しい途中結果が来なければ区切る（stop→final 発火）
            try { this._instances[i].stop(); } catch (e) {}
          }, this.shortPause);
        }
      }
    }

    /**
     * continuous モード：results[resultIndex..] のうち，確定したものは 'final'，未確定は 'interim'．
     * shortPause 経過で仮確定（'final' を先に出す）し，Chrome の本確定が来たら差分だけ追加／訂正する．
     */
    _onResultContinuous(ev, i) {
      let interim = '', conf = 0; const finals = [];
      for (let k = ev.resultIndex; k < ev.results.length; k++) {
        const r = ev.results[k];
        if (r.isFinal) { finals.push(r[0].transcript); if (r[0].confidence) conf = r[0].confidence; }
        else interim += r[0].transcript;
      }
      if (finals.length) {
        clearTimeout(this._pauseTimer);
        let text = finals.join('').trim();
        if (this._soft) {
          const soft = this._soft.text.trim(); this._soft = null;
          if (text === soft) {
            text = '';                                        // 仮確定と同じ：何もしない
          } else if (text.startsWith(soft)) {
            text = text.slice(soft.length).trim();            // 続きだけを新しい文として出す
          } else {
            this._emit('final', { text, confidence: conf, replace: true });  // 訂正（前の文を置き換え）
            text = '';
          }
        }
        if (text) this._emit('final', { text, confidence: conf });
        this._lastInterim = '';
      }
      if (interim || !finals.length) {
        // 仮確定済みの部分は途中結果から除く
        let shown = interim;
        if (this._soft && shown.startsWith(this._soft.text)) shown = shown.slice(this._soft.text.length);
        this._lastInterim = shown;
        this._emit('interim', { text: shown.trimStart() });
        if (this.shortPause > 0 && shown.trim()) {
          clearTimeout(this._pauseTimer);
          this._pauseTimer = setTimeout(() => {
            // 途中結果が止まった → 仮確定（セッションは止めないので次の文の頭が切れない）
            const t = shown.trim();
            this._soft = { text: interim };   // ここまでの途中結果全体を仮確定として記録
            this._emit('final', { text: t, confidence: 0, soft: true });
            this._lastInterim = '';
          }, this.shortPause);
        }
      }
    }
  }

  global.JimakuRecognizer = Recognizer;
})(typeof window !== 'undefined' ? window : globalThis);
