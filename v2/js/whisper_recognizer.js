/*
 * jimakuChan v2 – WhisperLiveKit ローカル音声認識クライアント
 *
 * Recognizer（recognizer.js）と同じイベントインターフェイスを実装する：
 *   'final' {text,confidence} / 'state' {running,listening} / 'error' {error,fatal,message}
 *
 * ブラウザのマイクを 16kHz モノラル Int16 PCM に変換し，WLK の /asr へ送る．
 *
 * 方針：**テキストの stream をクライアントで作り，文の区切りは句読点で決める**：
 *   - lines の内容行（サーバ確定＋育っている行）と buffer（未確定の仮説）を 1 本のテキストに繋ぐ
 *     （サーバは無音で lines を分断するため，そのままでは文が途中で切れる）
 *   - 既に final として出した raw 接頭辞を控え，その続きだけを見る．文末記号まで来た文はその場で確定し，
 *     未完の切れ端だけを次の入力まで残す
 *   - テキストが TAIL_FLUSH_MS 変化しなければ，未完の切れ端も確定する（サーバが末尾を確定しないため）
 *   - 無音による確定はしない（文の区切りは句読点のみ）
 */
(function (global) {
  'use strict';

  const DEBUG = Number(new URLSearchParams((global.location && global.location.search) || '').get('debug') || 0);
  function dbg(level, ...args) { if (DEBUG >= level) console.log('[wlk]', ...args); }

  const TARGET_RATE = 16000;
  const CONFIG_TIMEOUT_MS = 15000;   // config メッセージ待ち（モデル読込中の接続も考慮）
  const TAIL_FLUSH_MS = 2000;        // テキストがこの時間変化しなければ，未完の末尾も確定する

  const WORKLET_SRC = `
class JcCapture extends AudioWorkletProcessor {
  constructor(){ super(); this.chunks = []; this.len = 0; }
  process(inputs){
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.chunks.push(ch.slice(0)); this.len += ch.length;
      if (this.len >= 1024) {
        const out = new Float32Array(this.len); let o = 0;
        for (const b of this.chunks) { out.set(b, o); o += b.length; }
        this.chunks = []; this.len = 0;
        this.port.postMessage(out.buffer, [out.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('jc-capture', JcCapture);
`;

  function langCode(code) {
    if (!code) return null;
    return String(code).split('-')[0].toLowerCase();
  }

  function norm(s) {
    return String(s).replace(/[\s、。，．,.!?！？「」『』"'’“”・:：;；\-—–]/g, '').toLowerCase();
  }
  function clean(text) {
    return String(text).replace(/\s+([。．.!?！？])/g, '$1').replace(/^\s+/, '').replace(/\s+$/, '');
  }
  function hasContent(text) { return norm(text).length > 0; }

  // 先頭に紛れた句読点（サーバ分割の端や言い直しの名残）を落とす
  function stripLeadingPunct(text) {
    return String(text).replace(/^[\s、。，．,.!?！？・:：;；]+/, '');
  }

  // 発話終端の 1 文に文末記号が無ければ補う（翻訳側に整った 1 文を渡すため）
  function ensureEnd(text) {
    const s = stripLeadingPunct(clean(text));
    if (!s) return s;
    if ('。．.!?！？'.includes(s.slice(-1))) return s;
    const cjk = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/;
    return s + (cjk.test(s.slice(-1)) ? '。' : '.');
  }

  function prefixLen(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }

  const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'eg', 'ie', 'approx',
    'no', 'fig', 'al', 'inc', 'ltd', 'jr', 'sr', 'dept', 'est', 'min', 'max', 'sec', 'hr', 'km', 'kg', 'cm', 'mm']);

  // 文末記号の「直後」位置を列挙．小数点・ファイル名・略語のピリオドは文末とみなさない
  function sentenceEndIndices(text) {
    const ends = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if ('。！？!?'.includes(c)) { ends.push(i + 1); continue; }
      if (c !== '.') continue;
      const prev = text[i - 1] || '';
      const next = text[i + 1] || '';
      if (prev === '.' || next === '.') continue;   // 省略記号 "..." は文末にしない
      if (/\d/.test(prev) && /\d/.test(next)) continue;
      if (next && !/\s/.test(next)) continue;
      const w = (text.slice(0, i).match(/([A-Za-z]+)$/) || [])[1];
      if (w && ABBREV.has(w.toLowerCase())) continue;
      if (/^[A-Z]$/.test(prev)) continue;
      ends.push(i + 1);
    }
    return ends;
  }

  function splitSentences(text) {
    const out = [];
    let start = 0;
    for (const e of sentenceEndIndices(text)) { out.push(text.slice(start, e)); start = e; }
    if (start < text.length) out.push(text.slice(start));
    return out.map(s => s.trim()).filter(hasContent);
  }

  function buildUrl(base, opts = {}) {
    let u;
    try { u = new URL(base, global.location ? global.location.href : undefined); }
    catch (e) { return null; }
    if (opts.language) u.searchParams.set('language', opts.language);
    u.searchParams.set('mode', 'full');
    if (opts.context) u.searchParams.set('context', String(opts.context).slice(0, 1000));
    if (opts.apiKey) u.searchParams.set('token', opts.apiKey);
    return u.toString();
  }

  class WhisperRecognizer extends EventTarget {
    constructor(opts = {}) {
      super();
      this.url = opts.url || 'ws://127.0.0.1:11437/asr';
      this.language = langCode(opts.language);
      this.apiKey = opts.apiKey || '';
      this.context = opts.context || '';
      this._wantRunning = false;
      this._ready = false;
      this._ws = null;
      this._ctx = null;
      this._stream = null;
      this._node = null;
      this._gain = null;
      this._source = null;
      this._lines = [];
      this._streamCommitted = '';
      this._bufferText = '';
      this._lastFull = '';
      this._lastChangeAt = 0;
      this._serverLag = 0;
      this._tailTimer = null;
      this._reconnectTimer = null;
      this._configTimer = null;
      this._stopTimer = null;
      this._failCount = 0;
    }

    get running() { return this._wantRunning; }
    get listening() { return this._wantRunning && this._ready && !!this._ws && this._ws.readyState === 1; }

    configure(opts = {}) {
      Object.assign(this, opts);
      this.language = langCode(opts.language);
      if (this._wantRunning) this.restart();
    }

    start() {
      if (this._wantRunning) return;
      this._wantRunning = true;
      this._lines = [];
      this._streamCommitted = '';
      this._bufferText = '';
      this._lastFull = '';
      this._lastChangeAt = 0;
      this._startTailTimer();
      this._connect();
    }

    stop() {
      if (!this._wantRunning && !this._ws) return;
      this._wantRunning = false;
      this._ready = false;
      clearTimeout(this._reconnectTimer);
      clearTimeout(this._configTimer);
      this._stopTailTimer();
      const ws = this._ws;
      if (ws && ws.readyState === 1) {
        try { ws.send(new Uint8Array(0)); } catch (e) {}   // 音声終端を送り，サーバの最終 flush を待つ
        clearTimeout(this._stopTimer);
        this._stopTimer = setTimeout(() => {
          this._flushAll();
          this._stopAudio();
          try { ws.close(); } catch (e) {}
        }, 2500);
      } else {
        this._flushAll();
        this._stopAudio();
        try { ws && ws.close(); } catch (e) {}
      }
      this._emitState();
    }

    restart() { this.stop(); setTimeout(() => this.start(), 120); }

    // 停止時に，サーバが確定しなかった残り（open line ＋ buffer）を final として流す
    _flushAll() {
      this._emitNewFinals(true);
    }

    // サーバは無音でも末尾を確定しないことがあるため，テキストが一定時間変化しなければ末尾も確定する
    _startTailTimer() {
      this._stopTailTimer();
      this._tailTimer = setInterval(() => this._tickTail(), 250);
    }
    _stopTailTimer() { clearInterval(this._tailTimer); this._tailTimer = null; }
    _tickTail() {
      if (!this._wantRunning || !this._ready || !this._lastChangeAt) return;
      if (Date.now() - this._lastChangeAt < TAIL_FLUSH_MS) return;
      // サーバがまだ処理中（遅延）のときは確定しない．処理が追いついて初めて「話し終えた」とみなす
      if (this._serverLag > 0.5) return;
      if (!hasContent(this._streamText().slice(this._streamCommitted.length))) return;
      this._emitNewFinals(true, 'tail');
    }

    // lines の内容行（サーバ確定＋育っている行）と buffer（未確定の仮説）を 1 本のテキストに繋ぐ．
    // サーバは無音で lines を分断するので，文の区切りはクライアントが句読点で作り直す
    _streamText() {
      const parts = [];
      for (const l of this._lines) {
        if (!l || l.speaker === -2 || typeof l.text !== 'string') continue;
        const s = clean(l.text);
        if (hasContent(s)) parts.push(s);
      }
      let full = parts.join(' ');
      const buf = clean(this._bufferText || '');
      if (hasContent(buf)) {
        const nf = norm(full), nb = norm(buf);
        if (!nf || !nb || !nf.endsWith(nb)) full = full ? full + ' ' + buf : buf;
      }
      return clean(full);
    }

    // ---- 接続 ------------------------------------------------------------
    _connect() {
      const url = buildUrl(this.url, { language: this.language, context: this.context, apiKey: this.apiKey });
      if (!url) {
        this._emit('error', { error: 'whisper-url', fatal: true, message: 'URL が不正です: ' + this.url });
        return;
      }
      let ws;
      try { ws = new WebSocket(url); }
      catch (e) {
        this._emit('error', { error: 'whisper-url', fatal: true, message: 'URL が不正です: ' + this.url });
        return;
      }
      ws.binaryType = 'arraybuffer';
      this._ws = ws;

      ws.onopen = () => {
        if (this._ws !== ws) return;
        clearTimeout(this._configTimer);
        this._configTimer = setTimeout(() => {
          if (this._ws === ws && !this._ready) {
            this._emit('error', { error: 'whisper-timeout', fatal: false, message: 'WhisperLiveKit の応答がありません（モデル読み込み中かも）' });
          }
        }, CONFIG_TIMEOUT_MS);
        this._emitState();
      };

      ws.onmessage = (ev) => {
        if (this._ws !== ws) return;
        let data; try { data = JSON.parse(ev.data); } catch (e) { return; }
        this._onMessage(data);
      };

      ws.onerror = () => {
        if (this._ws !== ws) return;
        this._emit('error', { error: 'whisper-connect', fatal: false, message: 'WhisperLiveKit に接続できません（' + this.url + '）' });
      };

      ws.onclose = () => {
        if (this._ws !== ws) return;
        this._ws = null; this._ready = false;
        clearTimeout(this._configTimer);
        clearTimeout(this._stopTimer);
        this._flushAll();   // 停止時にサーバが確定しなかった残りを流す（再送信時は二重にならない）
        this._stopAudio();
        this._emitState();
        if (!this._wantRunning) return;
        this._failCount++;
        if (this._failCount > 5) {
          this._emit('error', { error: 'whisper-connect', fatal: true, message: 'WhisperLiveKit に接続できません（' + this.url + '）' });
          this.stop();
          return;
        }
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => { if (this._wantRunning) this._connect(); }, 1500);
      };
    }

    _onMessage(data) {
      if (!data) return;
      if (data.type === 'config') {
        clearTimeout(this._configTimer);
        if (data.useAudioWorklet === false) {
          this._emit('error', { error: 'whisper-pcm', fatal: true, message: 'サーバを --pcm-input 付きで起動してください' });
          this.stop();
          return;
        }
        this._ready = true;
        this._failCount = 0;
        this._emitState();
        this._startAudio().catch((e) => {
          this._emit('error', { error: 'whisper-mic', fatal: true, message: 'マイクを取得できません: ' + (e && e.message) });
          this.stop();
        });
        return;
      }
      if (data.type === 'ready_to_stop') {
        this._flushAll();
        this._stopAudio();
        clearTimeout(this._stopTimer);
        try { this._ws && this._ws.close(); } catch (e) {}
        return;
      }
      if (data.status === 'error') {
        this._emit('error', { error: 'whisper-server', fatal: false, message: data.error || 'サーバエラー' });
        return;
      }
      if (data.type === 'snapshot') {
        this._lines = Array.isArray(data.lines) ? data.lines : [];
      } else if (data.type === 'diff') {
        if (data.lines_pruned) this._lines = this._lines.slice(data.lines_pruned);
        if (Array.isArray(data.new_lines)) this._lines = this._lines.concat(data.new_lines);
      } else if (Array.isArray(data.lines)) {
        this._lines = data.lines;
      }
      this._bufferText = clean(data.buffer_transcription || '');
      this._serverLag = Number(data.remaining_time_transcription_processing) || 0;
      this._emitNewFinals();
      dbg(2, 'lines', this._lines.length, JSON.stringify(this._lines.map(l => (l.speaker === -2 ? '<sil>' : l.text))), 'buffer', JSON.stringify(this._bufferText));
    }

    _emitNewFinals(force = false, why = 'stop') {
      const full = this._streamText();
      if (full !== this._lastFull) { this._lastFull = full; this._lastChangeAt = Date.now(); }
      let committed = this._streamCommitted;
      if (!full.startsWith(committed)) committed = full.slice(0, prefixLen(full, committed));
      const pending = full.slice(committed.length);
      if (!hasContent(pending)) return;
      if (force) {
        this._streamCommitted = full;
        for (const s of splitSentences(pending)) { const text = ensureEnd(s); dbg(1, `commit(${why})`, JSON.stringify(text)); this._emit('final', { text, confidence: 1 }); }
        return;
      }
      // 文末記号まで来た文はその場で確定する（末尾の未完の切れ端だけ残す）
      const ends = sentenceEndIndices(pending);
      if (!ends.length) return;
      const complete = pending.slice(0, ends[ends.length - 1]);
      this._streamCommitted = committed + complete;
      for (const s of splitSentences(complete)) { const text = ensureEnd(s); dbg(1, 'commit', JSON.stringify(text)); this._emit('final', { text, confidence: 1 }); }
    }

    // ---- 音声キャプチャ --------------------------------------------------
    async _startAudio() {
      if (this._ctx) return;
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext({ sampleRate: TARGET_RATE });
      this._ctx = ctx;
      this._source = ctx.createMediaStreamSource(this._stream);
      this._gain = ctx.createGain();
      this._gain.gain.value = 0;
      this._source.connect(this._gain);
      this._gain.connect(ctx.destination);

      try {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, 'jc-capture');
        node.port.onmessage = (e) => this._sendPcm(e.data);
        this._source.connect(node);
        this._node = node;
      } catch (e) {
        const node = ctx.createScriptProcessor(1024, 1, 1);
        node.onaudioprocess = (ev) => this._sendPcm(ev.inputBuffer.getChannelData(0).slice(0).buffer);
        this._source.connect(node);
        node.connect(this._gain);
        this._node = node;
      }
      this._emitState();
    }

    _stopAudio() {
      if (this._node) { try { this._node.disconnect(); } catch (e) {} this._node = null; }
      if (this._source) { try { this._source.disconnect(); } catch (e) {} this._source = null; }
      if (this._gain) { try { this._gain.disconnect(); } catch (e) {} this._gain = null; }
      if (this._stream) { this._stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); this._stream = null; }
      if (this._ctx) { try { this._ctx.close(); } catch (e) {} this._ctx = null; }
    }

    _sendPcm(buffer) {
      const f32 = new Float32Array(buffer);
      if (!this._ws || this._ws.readyState !== 1) return;
      this._ws.send(this._toInt16(this._resample(f32)).buffer);
    }

    _resample(input) {
      const inRate = this._ctx ? this._ctx.sampleRate : TARGET_RATE;
      if (inRate === TARGET_RATE) return input;
      const ratio = inRate / TARGET_RATE;
      const outLen = Math.max(1, Math.floor(input.length / ratio));
      const out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0;
        const s0 = input[i0] || 0, s1 = input[Math.min(i0 + 1, input.length - 1)] || s0;
        out[i] = s0 + (s1 - s0) * frac;
      }
      return out;
    }

    _toInt16(f32) {
      const out = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return out;
    }

    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
    _emitState() { this._emit('state', { running: this._wantRunning, listening: this.listening }); }

    // ---- 接続テスト ------------------------------------------------------
    static testConnection(url, opts = {}) {
      return new Promise((resolve) => {
        const target = buildUrl(url, { language: opts.language, apiKey: opts.apiKey });
        if (!target) { resolve({ ok: false, message: 'URL が不正です' }); return; }
        let ws;
        try { ws = new WebSocket(target); }
        catch (e) { resolve({ ok: false, message: 'URL が不正です' }); return; }
        let done = false;
        const finish = (r) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch (e) {} resolve(r); };
        const timer = setTimeout(() => finish({ ok: true, ready: false, message: '接続はできました（config 待ち）' }), 8000);
        ws.onmessage = (ev) => {
          let d; try { d = JSON.parse(ev.data); } catch (e) { return; }
          if (d.type === 'config') finish({ ok: true, ready: true, message: 'サーバ準備完了' });
          else if (d.status === 'error') finish({ ok: false, message: d.error || 'サーバエラー' });
        };
        ws.onerror = () => finish({ ok: false, message: '接続できません（サーバ未起動またはURL誤り）' });
      });
    }
  }

  global.JimakuWhisperRecognizer = WhisperRecognizer;
})(typeof window !== 'undefined' ? window : globalThis);
