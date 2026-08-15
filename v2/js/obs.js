/*
 * jimakuChan v2 – obs-websocket (v5) 最小クライアント
 *
 * OBS Studio 28 以降に同梱の WebSocket サーバ（既定 ws://localhost:4455）に接続し，
 *   - CallVendorRequest(obs-browser / emit_event) で全ブラウザソースへ字幕イベントを配信
 *   - CreateInput でブラウザソース（字幕オーバーレイ）をワンクリック追加
 *   - SetInputSettings でテキストソースを直接更新（任意）
 * を行う．依存ライブラリなし．
 */
(function (global) {
  'use strict';

  // ---- SHA-256（WebCrypto が使えない環境向けフォールバック） ----------------
  function sha256Bytes(msgBytes) {
    const K = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const l = msgBytes.length;
    const padLen = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(padLen);
    m.set(msgBytes); m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(padLen - 4, (l * 8) >>> 0);
    dv.setUint32(padLen - 8, Math.floor((l * 8) / 0x100000000));
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i-15],7) ^ rotr(W[i-15],18) ^ (W[i-15] >>> 3);
        const s1 = rotr(W[i-2],17) ^ rotr(W[i-2],19) ^ (W[i-2] >>> 10);
        W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { out[i*4]=H[i]>>>24; out[i*4+1]=(H[i]>>>16)&255; out[i*4+2]=(H[i]>>>8)&255; out[i*4+3]=H[i]&255; }
    return out;
  }
  async function sha256b64(str) {
    const bytes = new TextEncoder().encode(str);
    let digest;
    if (global.crypto && crypto.subtle) {
      try { digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); } catch (e) { /* fallthrough */ }
    }
    if (!digest) digest = sha256Bytes(bytes);
    let bin = ''; digest.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  }

  // ---- クライアント -----------------------------------------------------
  class ObsClient {
    constructor() {
      this.ws = null;
      this.url = 'ws://localhost:4455';
      this.password = '';
      this.identified = false;
      this._reqId = 0;
      this._pending = new Map();
      this._reconnectTimer = null;
      this.autoReconnect = false;
      this.onStatus = () => {};      // (state, detail) state: 'connecting'|'connected'|'disconnected'|'error'
      this.onEvent = () => {};       // (eventType, eventData)
      this._eventSubs = 1 | (1 << 9) | (1 << 5); // General | Vendors | Inputs
      this.obsVersion = null;
    }

    get connected() { return !!this.ws && this.ws.readyState === 1 && this.identified; }

    connect(url, password, { autoReconnect = false } = {}) {
      if (url) this.url = url;
      if (password !== undefined) this.password = password || '';
      this.autoReconnect = autoReconnect;
      this._manualClose = false;
      return this._open();
    }

    _open() {
      return new Promise((resolve, reject) => {
        this._closeSocket();
        this.onStatus('connecting');
        let ws;
        try { ws = new WebSocket(this.url); }
        catch (e) { this.onStatus('error', e.message); return reject(e); }
        this.ws = ws;
        let settled = false;
        const finish = (ok, err) => {
          if (settled) return; settled = true;
          ok ? resolve(this) : reject(err);
        };
        ws.onopen = () => {};
        ws.onerror = () => { this.onStatus('error', '接続できません（OBS 起動・WebSocket サーバ有効化を確認）'); finish(false, new Error('ws error')); };
        ws.onclose = (ev) => {
          const wasIdentified = this.identified;
          this.identified = false;
          this._pending.forEach(p => p.reject(new Error('closed')));
          this._pending.clear();
          this.onStatus('disconnected', ev.code === 4009 ? '認証失敗（パスワードを確認）' : (ev.reason || ''));
          finish(false, new Error(ev.code === 4009 ? 'auth failed' : 'closed'));
          if (this.autoReconnect && !this._manualClose) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(() => this._open().catch(() => {}), wasIdentified ? 2000 : 5000);
          }
        };
        ws.onmessage = async (msg) => {
          let data; try { data = JSON.parse(msg.data); } catch (e) { return; }
          const { op, d } = data;
          if (op === 0) { // Hello
            this.obsVersion = d.obsStudioVersion;
            const identify = { op: 1, d: { rpcVersion: 1, eventSubscriptions: this._eventSubs } };
            if (d.authentication) {
              const { salt, challenge } = d.authentication;
              const secret = await sha256b64(this.password + salt);
              identify.d.authentication = await sha256b64(secret + challenge);
            }
            ws.send(JSON.stringify(identify));
          } else if (op === 2) { // Identified
            this.identified = true;
            this.onStatus('connected', 'OBS ' + (this.obsVersion || ''));
            finish(true);
          } else if (op === 5) { // Event
            this.onEvent(d.eventType, d.eventData || {});
          } else if (op === 7) { // RequestResponse
            const p = this._pending.get(d.requestId);
            if (p) {
              this._pending.delete(d.requestId);
              if (d.requestStatus && d.requestStatus.result) p.resolve(d.responseData || {});
              else p.reject(Object.assign(new Error((d.requestStatus && d.requestStatus.comment) || 'request failed'), { status: d.requestStatus }));
            }
          }
        };
      });
    }

    disconnect() {
      this._manualClose = true;
      this.autoReconnect = false;
      clearTimeout(this._reconnectTimer);
      this._closeSocket();
      this.onStatus('disconnected', '');
    }
    _closeSocket() {
      if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) {} this.ws = null; }
      this.identified = false;
    }

    request(requestType, requestData = {}) {
      return new Promise((resolve, reject) => {
        if (!this.connected) return reject(new Error('not connected'));
        const requestId = 'jc' + (++this._reqId);
        this._pending.set(requestId, { resolve, reject });
        this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
        setTimeout(() => { if (this._pending.has(requestId)) { this._pending.delete(requestId); reject(new Error('timeout')); } }, 8000);
      });
    }

    // ---- 便利メソッド ---------------------------------------------------
    /** 全ブラウザソースへカスタム DOM イベントを送る（obs-browser vendor） */
    emitBrowserEvent(eventName, eventData) {
      if (!this.connected) return Promise.resolve(false);
      return this.request('CallVendorRequest', {
        vendorName: 'obs-browser',
        requestType: 'emit_event',
        requestData: { event_name: eventName, event_data: eventData },
      }).then(() => true).catch(e => { console.warn('[obs] emit_event 失敗:', e.message); this.lastError = e.message; return false; });
    }

    /** 全 WebSocket クライアントへ CustomEvent を送る（予備経路） */
    broadcast(eventData) {
      return this.request('BroadcastCustomEvent', { eventData }).catch(() => {});
    }

    async getVersion() { return this.request('GetVersion'); }
    async getCurrentScene() { const r = await this.request('GetCurrentProgramScene'); return r.currentProgramSceneName || r.sceneName; }
    async getVideoSettings() { return this.request('GetVideoSettings'); }
    async listInputs(kind) { const r = await this.request('GetInputList', kind ? { inputKind: kind } : {}); return r.inputs || []; }
    async listSceneItems(sceneName) { const r = await this.request('GetSceneItemList', { sceneName }); return r.sceneItems || []; }

    /**
     * 現在のシーンに字幕オーバーレイ（ブラウザソース）を追加．既にあれば URL だけ更新．
     * @returns {Promise<{created:boolean, inputName:string}>}
     */
    async ensureOverlaySource(url, { inputName = 'jimakuChan 字幕', width, height, localFile = null } = {}) {
      const scene = await this.getCurrentScene();
      let vw = width, vh = height;
      if (!vw || !vh) {
        try { const v = await this.getVideoSettings(); vw = vw || v.baseWidth; vh = vh || v.baseHeight; } catch (e) { vw = vw || 1920; vh = vh || 1080; }
      }
      const settings = { url, width: vw, height: vh, shutdown: false, restart_when_active: false, reroute_audio: false, fps_custom: false, css: '' };
      if (localFile) { settings.is_local_file = true; settings.local_file = localFile; } else { settings.is_local_file = false; }
      const inputs = await this.listInputs('browser_source');
      const exists = inputs.find(i => i.inputName === inputName);
      if (exists) {
        await this.request('SetInputSettings', { inputName, inputSettings: settings, overlay: true });
        // シーンに無ければ追加
        const items = await this.listSceneItems(scene);
        if (!items.find(it => it.sourceName === inputName)) {
          await this.request('CreateSceneItem', { sceneName: scene, sourceName: inputName, sceneItemEnabled: true });
        }
        return { created: false, inputName, scene };
      }
      await this.request('CreateInput', { sceneName: scene, inputName, inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: true });
      return { created: true, inputName, scene };
    }

    /** テキストソース（text_gdiplus_v2 / text_ft2_source_v2）の文字列を更新 */
    async setText(inputName, text) {
      return this.request('SetInputSettings', { inputName, inputSettings: { text }, overlay: true });
    }
  }

  global.ObsClient = ObsClient;
  global.ObsClient.sha256b64 = sha256b64;
})(typeof window !== 'undefined' ? window : globalThis);
