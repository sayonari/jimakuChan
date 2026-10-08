/*
 * jimakuChan v2 – マイク選択 & 入力レベル計測
 *
 *  デバイス一覧（audioinput）・指定デバイスのストリーム取得・音量（dBFS）計測だけを担当する．
 *  取得した MediaStreamTrack は SpeechRecognition.start(track) にそのまま渡せる（同じ音をメーターにも使う）．
 *  レベル計測は requestAnimationFrame（画面が見えていない間は止まる）で，AnalyserNode の RMS を dBFS にして配る．
 *
 * 使い方：
 *   const mic = new JimakuMic();
 *   await mic.refreshDevices();
 *   const { track, fallback } = await mic.open(deviceId);   // deviceId 省略/null で Chrome の既定
 *   mic.close();
 *
 * 音声処理（既定オフ．mic.configure() で有効化）：
 *   source → 入力ゲイン ┐
 *   2 つ目の input(任意) ┴→ ミックス → ノイズゲート(AudioWorklet) → ミュート → destination(MediaStream) ＋ AnalyserNode（メーター）
 *   mic.outTrack が「認識に渡すべき track」．ゲイン 0 dB・ゲートなし・2 つ目なし，または AudioContext が running でない間（ユーザー操作前は
 *   suspended で，処理後 track は無音になる）は生の track を返す．切り替わると 'route' が発火する（呼び出し側で認識を再起動）．
 *
 * イベント（EventTarget）：
 *   'route'    detail:{ track }                           outTrack が変わった（処理後 ⇄ 生）
 *   'gate'     detail:{ open }                            ノイズゲートの開閉
 *   'second'   detail:{ ok, deviceId }                    2 つ目の入力を開いた／開けなかった／外れた
 *   'devices'  detail:{ devices:[{ deviceId, label }] }   デバイス一覧が更新された（devicechange・許可後のラベル取得）
 *   'level'    detail:{ db, smooth, peak }                毎フレーム．db=今の音量(dBFS)，smooth=なめらかに減衰する値，peak=ピークホールド値
 *   'fallback' detail:{ deviceId }                        指定デバイスが無く，既定のマイクに戻した
 *   'ended'    detail:{}                                  使用中のマイクが外れた等で track が終了した
 */
(function (global) {
  'use strict';

  // Edge は start(track) に 16kHz の音声を渡さないと認識結果が返らない（Chrome は元のレートのままで可）．
  // Edge では常に 16kHz の AudioContext を通した track を渡す．
  const IS_EDGE = /\bEdg\//.test(navigator.userAgent || '');

  const DB_MIN = -100;            // 無音の下限（log(0) 回避）
  const FALL_DB_PER_SEC = 40;     // 表示用の減衰速度
  const PEAK_HOLD_MS = 1200;      // ピークを止めておく時間
  const PEAK_FALL_DB_PER_SEC = 25;

  // ノイズゲート：ブロックごとに RMS を測り，しきい値を超えたら開く（立上り 5ms），下回って 150ms 保持したのち 70ms の時定数で閉じる（≒200ms でなめらかに）
  const GATE_WORKLET = `
class JimakuGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thr = -50; this.on = false; this.g = 1; this.hold = 0; this.open = true;
    this.atk = 1 - Math.exp(-1 / (0.005 * sampleRate)); this.rel = 1 - Math.exp(-1 / (0.07 * sampleRate));
    this.port.onmessage = (e) => { if (e.data.thr != null) this.thr = e.data.thr; if (e.data.on != null) this.on = e.data.on; };
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length || !out || !out.length) return true;
    const n = inp[0].length, nc = Math.min(inp.length, out.length);
    let sum = 0;
    for (let c = 0; c < nc; c++) { const x = inp[c]; for (let i = 0; i < n; i++) sum += x[i] * x[i]; }
    const db = 20 * Math.log10(Math.sqrt(sum / (n * nc)) || 1e-6);
    let target = 1;
    if (this.on) {
      if (db >= this.thr) this.hold = 0.15 * sampleRate; else this.hold -= n;
      target = this.hold > 0 ? 1 : 0;
    }
    const k = target > this.g ? this.atk : this.rel;
    for (let i = 0; i < n; i++) { this.g += (target - this.g) * k; for (let c = 0; c < nc; c++) out[c][i] = inp[c][i] * this.g; }
    if ((target === 1) !== this.open) { this.open = target === 1; this.port.postMessage({ open: this.open }); }
    return true;
  }
}
registerProcessor('jimaku-gate', JimakuGate);`;

  class Mic extends EventTarget {
    constructor() {
      super();
      this.devices = [];
      this.stream = null;
      this.track = null;
      this.deviceId = null;       // 実際に開いているデバイス（null=既定）
      this._ctx = null; this._analyser = null; this._src = null; this._buf = null;
      this._raf = 0; this._lastT = 0;
      this._smooth = DB_MIN; this._peak = DB_MIN; this._peakAt = 0;
      // 音声処理（configure で変更．graph があれば即反映）
      this.gainDb = 0; this.gateOn = false; this.gateDb = -50; this.mix2Vol = 1; this.muted = false;
      this.procBlocked = false;          // 処理後 track を認識が拒否した → 以後は生 track
      this.gateReady = false; this.gateSupported = true; this._gatePromise = null;
      this._g1 = this._g2 = this._gate = this._mute = this._dest = this._destTrack = null;
      this.stream2 = null; this._src2 = null; this._second2Gen = 0; this._lastOut = null;
      this.supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', () => this.refreshDevices());
      }
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this._loop(); });
      // ユーザー操作前の AudioContext は suspended．最初の操作で resume する
      const wake = () => { if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume().catch(() => {}); };
      ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, wake, true));
    }

    /** 認識に渡すべき track（処理後 or 生）．処理が要らない／まだ使えないときは生の track */
    get outTrack() {
      // Edge で 16kHz 化できない間（操作前など）は track を渡さない＝既定マイクで認識（元レートの track では結果が返らないため）
      if (this.procBlocked || !this._destTrack || !this._ctx || this._ctx.state !== 'running') return IS_EDGE ? null : this.track;
      return this._needProc() ? this._destTrack : this.track;
    }
    /** 処理後 track が拒否されたときの代わり（Edge は元レートでは結果が返らないので渡さない＝既定マイク） */
    get rawFallback() { return IS_EDGE ? null : this.track; }
    _needProc() { return IS_EDGE || this.gainDb !== 0 || (this.gateOn && this.gateReady) || !!this.stream2; }
    _checkRoute() {
      const tr = this.outTrack;
      if (tr === this._lastOut) return;
      this._lastOut = tr;
      this._emit('route', { track: tr });
    }
    get ctxState() { return this._ctx ? this._ctx.state : 'closed'; }
    get needsProcessing() { return this._needProc(); }
    /** AudioContext が running になり，ゲートも読み込み終わる（または timeout ms 経つ）まで待つ．認識の開始前に呼んで，起動直後の再起動を避ける */
    async whenReady(timeout = 400) {
      const ctx = this._ctx; if (!ctx) return;
      const running = ctx.state === 'running' ? Promise.resolve() : new Promise(res => { const f = () => { if (ctx.state === 'running') { ctx.removeEventListener('statechange', f); res(); } }; ctx.addEventListener('statechange', f); });
      await Promise.race([Promise.all([running, this._gatePromise]), new Promise(r => setTimeout(r, timeout))]);
    }

    /** ゲイン・ゲート・2 つ目の音量・ミュートを変更（graph があれば即反映） */
    configure(o = {}) {
      if (o.gainDb != null) this.gainDb = Math.max(-12, Math.min(24, Number(o.gainDb) || 0));
      if (o.gateOn != null) this.gateOn = !!o.gateOn;
      if (o.gateDb != null) this.gateDb = Math.max(-70, Math.min(-30, Number(o.gateDb) || -50));
      if (o.mix2Vol != null) this.mix2Vol = Math.max(0, Math.min(2, Number(o.mix2Vol)));
      if (o.muted != null) this.muted = !!o.muted;
      this._applyParams();
      this._checkRoute();
    }
    _applyParams() {
      const ctx = this._ctx;
      if (ctx) {
        const t = ctx.currentTime;
        try {
          if (this._g1) this._g1.gain.setTargetAtTime(Math.pow(10, this.gainDb / 20), t, 0.01);
          if (this._g2) this._g2.gain.setTargetAtTime(this.mix2Vol, t, 0.01);
          if (this._mute) this._mute.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.01);
          if (this._gate) this._gate.port.postMessage({ on: this.gateOn, thr: this.gateDb });
        } catch (e) {}
      }
      if (this.track) this.track.enabled = !this.muted;       // 生の track を渡している間のミュート
      if (this.stream2) this.stream2.getAudioTracks().forEach(tr => { tr.enabled = !this.muted; });
    }

    _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

    /** audioinput の一覧を取り直す（ラベルはマイク許可後でないと空）．仮想の 'default'/'communications' は除く */
    async refreshDevices() {
      if (!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)) return this.devices;
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        this.devices = all.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
          .map(d => ({ deviceId: d.deviceId, label: d.label || '' }));
      } catch (e) { this.devices = []; }
      this._emit('devices', { devices: this.devices });
      return this.devices;
    }

    /** deviceId のマイクを開く（既存ストリームは先に閉じる）．無ければ既定に戻して 'fallback'．許可拒否などは throw */
    async open(deviceId) {
      this.close();
      const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      let stream, fallback = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? Object.assign({ deviceId: { exact: deviceId } }, base) : base });
      } catch (e) {
        if (deviceId && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: base });
          fallback = true;
        } else throw e;
      }
      this.stream = stream;
      this.track = stream.getAudioTracks()[0] || null;
      const s = this.track && this.track.getSettings ? this.track.getSettings() : {};
      this.deviceId = fallback ? null : (deviceId || null);
      if (this.track) this.track.addEventListener('ended', () => { if (this.track && this.stream === stream) this._emit('ended', {}); });
      this._startMeter(stream);
      this._applyParams();
      this._lastOut = this.outTrack;
      this.refreshDevices();      // 許可後はラベルが取れる
      if (fallback) this._emit('fallback', { deviceId });
      return { track: this.track, fallback, actualId: s.deviceId || null };
    }

    close() {
      cancelAnimationFrame(this._raf); this._raf = 0;
      this._second2Gen++;
      if (this.stream2) { this.stream2.getTracks().forEach(tr => { try { tr.stop(); } catch (e) {} }); this.stream2 = null; }
      try { this._src && this._src.disconnect(); } catch (e) {}
      try { this._ctx && this._ctx.close(); } catch (e) {}
      this._ctx = this._analyser = this._src = this._buf = null;
      this._g1 = this._g2 = this._gate = this._mute = this._dest = this._destTrack = this._src2 = null;
      this.gateReady = false; this._lastOut = null;
      if (this.stream) this.stream.getTracks().forEach(tr => { try { tr.stop(); } catch (e) {} });
      this.stream = null; this.track = null; this.deviceId = null;
      this._smooth = this._peak = DB_MIN;
      this._emit('level', { db: DB_MIN, smooth: DB_MIN, peak: DB_MIN });
    }

    _startMeter(stream) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        this._ctx = IS_EDGE ? new AC({ sampleRate: 16000 }) : new AC();
        if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
        const ctx = this._ctx;
        this._src = ctx.createMediaStreamSource(stream);
        this._g1 = ctx.createGain(); this._g2 = ctx.createGain();
        this._bus = ctx.createGain(); this._mute = ctx.createGain();
        this._dest = ctx.createMediaStreamDestination();      // 画面の destination には繋がない（自分の声が聞こえないように）
        this._destTrack = this._dest.stream.getAudioTracks()[0] || null;
        this._analyser = ctx.createAnalyser();
        this._analyser.fftSize = 1024;
        this._buf = new Float32Array(this._analyser.fftSize);
        this._src.connect(this._g1); this._g1.connect(this._bus); this._g2.connect(this._bus);
        this._bus.connect(this._mute); this._mute.connect(this._dest); this._mute.connect(this._analyser);
        ctx.addEventListener('statechange', () => { if (this._ctx === ctx) this._checkRoute(); });
        this._gatePromise = this._loadGate(ctx);
        this._lastT = 0; this._peakAt = 0;
        this._loop();
      } catch (e) { console.warn('[mic] メーター開始に失敗', e); }
    }

    /** ノイズゲート（AudioWorklet）を読み込んでミックスとミュートの間に差し込む．失敗したらゲートは使えない */
    async _loadGate(ctx) {
      try {
        if (!ctx.audioWorklet) throw new Error('no audioWorklet');
        const url = URL.createObjectURL(new Blob([GATE_WORKLET], { type: 'text/javascript' }));
        try { await ctx.audioWorklet.addModule(url); }
        catch (e) {   // file:// では blob URL を読めないことがあるので data URL で再挑戦
          await ctx.audioWorklet.addModule('data:text/javascript;base64,' + btoa(GATE_WORKLET));
        } finally { URL.revokeObjectURL(url); }
        if (this._ctx !== ctx) return;
        const gate = new AudioWorkletNode(ctx, 'jimaku-gate');
        gate.port.onmessage = (e) => { if (this._ctx === ctx && e.data && typeof e.data.open === 'boolean') this._emit('gate', { open: e.data.open }); };
        this._bus.disconnect(); this._bus.connect(gate); gate.connect(this._mute);
        this._gate = gate; this.gateReady = true;
        this._applyParams(); this._checkRoute();
      } catch (e) {
        console.warn('[mic] ノイズゲートを読み込めません', e);
        if (this._ctx === ctx) { this.gateSupported = false; this._emit('gate', { open: true, unsupported: true }); }
      }
    }

    /** 2 つ目の入力を開く／閉じる（deviceId 空で閉じる）．AudioContext が running になるまでは認識に混ざらない（outTrack 参照） */
    async setSecond(deviceId) {
      const gen = ++this._second2Gen;
      if (this.stream2) { this.stream2.getTracks().forEach(tr => { try { tr.stop(); } catch (e) {} }); this.stream2 = null; }
      try { this._src2 && this._src2.disconnect(); } catch (e) {}
      this._src2 = null;
      if (!deviceId || !this._ctx) { this._checkRoute(); return false; }
      const ctx = this._ctx;
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        if (gen === this._second2Gen) { this._emit('second', { ok: false, deviceId }); this._checkRoute(); }
        return false;
      }
      if (gen !== this._second2Gen || this._ctx !== ctx) { stream.getTracks().forEach(tr => tr.stop()); return false; }
      this.stream2 = stream;
      this._src2 = ctx.createMediaStreamSource(stream);
      this._src2.connect(this._g2);
      stream.getAudioTracks().forEach(tr => {
        tr.enabled = !this.muted;
        tr.addEventListener('ended', () => { if (this.stream2 === stream) { this.stream2 = null; this._emit('second', { ok: false, deviceId, ended: true }); this._checkRoute(); } });
      });
      this._applyParams();
      this._emit('second', { ok: true, deviceId });
      this._checkRoute();
      return true;
    }

    /** 今の音量(dBFS)をその場で測る（画面が見えていなくても使える．メーターの rAF とは独立） */
    measure() {
      if (!this._analyser) return DB_MIN;
      this._analyser.getFloatTimeDomainData(this._buf);
      let sum = 0; const b = this._buf;
      for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
      return Math.max(DB_MIN, 20 * Math.log10(Math.sqrt(sum / b.length) || 1e-6));
    }

    _loop() {
      if (!this._analyser || document.hidden || this._raf) return;
      this._raf = requestAnimationFrame((now) => {
        this._raf = 0;
        if (!this._analyser) return;
        this._analyser.getFloatTimeDomainData(this._buf);
        let sum = 0; const b = this._buf;
        for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
        const db = Math.max(DB_MIN, 20 * Math.log10(Math.sqrt(sum / b.length) || 1e-6));
        const dt = this._lastT ? Math.min(0.25, (now - this._lastT) / 1000) : 0.016;
        this._lastT = now;
        this._smooth = db > this._smooth ? db : Math.max(db, this._smooth - FALL_DB_PER_SEC * dt);
        if (db >= this._peak) { this._peak = db; this._peakAt = now; }
        else if (now - this._peakAt > PEAK_HOLD_MS) this._peak = Math.max(this._smooth, this._peak - PEAK_FALL_DB_PER_SEC * dt);
        this._emit('level', { db, smooth: this._smooth, peak: this._peak });
        this._loop();
      });
    }
  }

  global.JimakuMic = Mic;
})(typeof window !== 'undefined' ? window : globalThis);
