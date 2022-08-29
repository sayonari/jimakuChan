/**
 * 接続先
 */
 const HOST = 'localhost';
 const PORT = 50002;  // WebSocketサーバー経由
 
 /**
  * コンストラクタ
  */
 const BouyomiChanClient = function() {
 }
 
 /**
  * 読み上げる
  */
 BouyomiChanClient.prototype.talk = function(cmntStr) {
     this.cmntStr = cmntStr;
     let _socket = new WebSocket('ws://' + HOST + ':' + PORT + '/ws/');
     this.socket = _socket;
     this.socket.binaryType = 'arraybuffer';
     this.socket.onopen = this.socket_onopen.bind(this);
     this.socket.onerror = this.socket_onerror.bind(this);
     this.socket.onclose = this.socket_onclose.bind(this);
     this.socket.onmessage = this.socket_onmessage.bind(this);
 }
 
 /**
  * WebSocketが接続した
  */
 BouyomiChanClient.prototype.socket_onopen = function(e) {
     console.log("socket_onopen");
 
     // 棒読みちゃんデータを生成
     let data = this.makeBouyomiChanDataToSend(this.cmntStr);
     console.log(data);
     // 送信
     this.socket.send(data.buffer);
 }
 
 
 /**
  * WebSocketが接続に失敗した
  */
 BouyomiChanClient.prototype.socket_onerror = function(e) {
     console.log("socket_onerror");
 
     this.socket.close();
 }
 
 /**
  * WebSocketがクローズした
  */
 BouyomiChanClient.prototype.socket_onclose = function(e) {
     console.log("socket_onclose");
 }
 
 /**
  * WebSocketがデータを受信した
  */
 BouyomiChanClient.prototype.socket_onmessage = function(e) {
     console.log("socket_onmessage");
     console.log(e.data);
 
     // データ受信したら切断する
     this.socket.close();
 }
 
 
 /**
  * 棒読みちゃんへ送信するデータの生成
  */
 BouyomiChanClient.prototype.makeBouyomiChanDataToSend = function(cmntStr) {
     let command = 0x0001; //[0-1]  (16Bit) コマンド          （ 0:メッセージ読み上げ）
     let speed = -1; //[2-3]  (16Bit) 速度              （-1:棒読みちゃん画面上の設定）
     let tone = -1; //[4-5]  (16Bit) 音程              （-1:棒読みちゃん画面上の設定）
     let volume = -1; //[6-7]  (16Bit) 音量              （-1:棒読みちゃん画面上の設定）
     let voice = 0; //[8-9]  (16Bit) 声質              （ 0:棒読みちゃん画面上の設定、1:女性1、2:女性2、3:男性1、4:男性2、5:中性、6:ロボット、7:機械1、8:機械2、10001～:SAPI5）
     let code = 0; //[10]   ( 8Bit) 文字列の文字コード（ 0:UTF-8, 1:Unicode, 2:Shift-JIS）
     let len = 0; //[11-14](32Bit) 文字列の長さ
 
     let cmntByteArray = stringToUtf8ByteArray(cmntStr);
 
     len = cmntByteArray.length;
     let bytesLen = 2 + 2 + 2 + 2 + 2 + 1 + 4 + cmntByteArray.length;
     let data = new Uint8Array(bytesLen);
     let pos = 0;
     data[pos++] = command & 0xFF;
     data[pos++] = (command >> 8) & 0xFF;
     data[pos++] = speed & 0xFF;
     data[pos++] = (speed >> 8) & 0xFF;
     data[pos++] = tone & 0xFF;
     data[pos++] = (tone >> 8) & 0xFF;
     data[pos++] = volume & 0xFF;
     data[pos++] = (volume >> 8) & 0xFF;
     data[pos++] = voice & 0xFF;
     data[pos++] = (voice >> 8) & 0xFF;
     data[pos++] = code & 0xFF;
     data[pos++] = len & 0xFF;
     data[pos++] = (len >> 8) & 0xFF;
     data[pos++] = (len >> 16) & 0xFF;
     data[pos++] = (len >> 24) & 0xFF;
     for (let i = 0; i < cmntByteArray.length; i++) {
         data[pos++] = cmntByteArray[i];
     }
     return data;
 }
 
 ///////////////////////////////////////////////////////////////////////////////////////
 // Util
 /**
  * string --> UTF8 byteArray変換
  */
 function stringToUtf8ByteArray(str) {
     let out = [], p = 0;
     for (var i = 0; i < str.length; i++) {
         let c = str.charCodeAt(i);
         if (c < 128) {
             out[p++] = c;
         }
         else if (c < 2048) {
             out[p++] = (c >> 6) | 192;
             out[p++] = (c & 63) | 128;
         }
         else if (
             ((c & 0xFC00) == 0xD800) && (i + 1) < str.length &&
             ((str.charCodeAt(i + 1) & 0xFC00) == 0xDC00)) {
 
             // Surrogate Pair
             c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF);
             out[p++] = (c >> 18) | 240;
             out[p++] = ((c >> 12) & 63) | 128;
             out[p++] = ((c >> 6) & 63) | 128;
             out[p++] = (c & 63) | 128;
         }
         else {
             out[p++] = (c >> 12) | 224;
             out[p++] = ((c >> 6) & 63) | 128;
             out[p++] = (c & 63) | 128;
         }
     }
     return out;
 }