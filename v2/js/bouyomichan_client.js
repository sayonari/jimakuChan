/**
 * 棒読みちゃん WebSocket クライアント（jimakuChan v2）
 *  - 接続先: ws://localhost:50002/ws/（棒読みちゃん WebSocket プラグイン）
 *  - 1 本の接続を再利用し，送信は FIFO キューで順番を保証．未接続時は自動接続，失敗時は 3 秒後に再試行
 *  互換 API: new BouyomiChanClient().talk(text)
 */
(function (global) {
  'use strict';
  const HOST = 'localhost', PORT = 50002;
  const enc = new TextEncoder();
  function makePacket(str) {
    const body = enc.encode(str);
    const d = new Uint8Array(15 + body.length); const v = new DataView(d.buffer);
    v.setInt16(0, 1, true);      // command: 0x0001 読み上げ
    v.setInt16(2, -1, true);     // speed
    v.setInt16(4, -1, true);     // tone
    v.setInt16(6, -1, true);     // volume
    v.setInt16(8, 0, true);      // voice
    d[10] = 0;                   // code: UTF-8
    v.setUint32(11, body.length, true);
    d.set(body, 15);
    return d;
  }
  const shared = { ws: null, queue: [], connecting: false, retryTimer: null };
  function flush() {
    if (!shared.ws || shared.ws.readyState !== 1) return;
    while (shared.queue.length) { try { shared.ws.send(makePacket(shared.queue.shift()).buffer); } catch (e) { break; } }
  }
  function connect() {
    if (shared.connecting || (shared.ws && (shared.ws.readyState === 0 || shared.ws.readyState === 1))) return;
    shared.connecting = true;
    let ws;
    try { ws = new WebSocket('ws://' + HOST + ':' + PORT + '/ws/'); } catch (e) { shared.connecting = false; return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { shared.connecting = false; shared.ws = ws; flush(); };
    ws.onerror = () => {};
    ws.onclose = () => {
      shared.connecting = false; if (shared.ws === ws) shared.ws = null;
      if (shared.queue.length) { clearTimeout(shared.retryTimer); shared.retryTimer = setTimeout(connect, 3000); }
    };
    ws.onmessage = () => {};
  }
  function BouyomiChanClient() {}
  BouyomiChanClient.prototype.talk = function (text) {
    if (!text) return;
    shared.queue.push(String(text));
    if (shared.queue.length > 20) shared.queue.splice(0, shared.queue.length - 20); // 溜まりすぎ防止
    if (shared.ws && shared.ws.readyState === 1) flush(); else connect();
  };
  BouyomiChanClient.prototype.close = function () { try { shared.ws && shared.ws.close(); } catch (e) {} };
  global.BouyomiChanClient = BouyomiChanClient;
})(typeof window !== 'undefined' ? window : globalThis);
