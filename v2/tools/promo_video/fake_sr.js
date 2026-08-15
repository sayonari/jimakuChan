// テスト／動画用：Web Speech API のモック．window.__fakeSR.say('テキスト', {chars:120}) で途中結果→確定を再現
(function(){
  const insts = [];
  class FakeSR {
    constructor(){ this.lang='ja'; this.interimResults=true; this.continuous=false; this._running=false; insts.push(this); }
    start(){ if (this._running) throw new Error('already started'); this._running=true; setTimeout(()=>{ this.onstart && this.onstart(); }, 5); FakeSR.active = this; }
    stop(){ if(!this._running) return; this._finish(); }
    abort(){ if(!this._running) return; this._running=false; this.onerror && this.onerror({error:'aborted'}); this.onend && this.onend(); }
    _finish(){ if(!this._running) return; this._running=false; setTimeout(()=>{ this.onend && this.onend(); }, 5); }
    _emit(finalText, interimText, isFinal){
      this._acc = this._acc || [];
      const res = this._acc.slice();
      const base = res.length;
      if (finalText) { const r=[{transcript:finalText,confidence:.93}]; r.isFinal=true; res.push(r); }
      if (interimText) { const r=[{transcript:interimText,confidence:0}]; r.isFinal=false; res.push(r); }
      if (this.continuous && finalText) this._acc.push(res[base]);
      const ev = { results: res, resultIndex: base };
      this.onresult && this.onresult(ev);
    }
  }
  FakeSR.available = async () => 'available';
  window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;
  window.__fakeSR = {
    /** 文字を少しずつ出してから確定 */
    say(text, opts={}) {
      const cps = opts.cps || 12; // chars per sec
      return new Promise(resolve => {
        const inst = FakeSR.active; if (!inst || !inst._running) { resolve(false); return; }
        let i = 0;
        const step = () => {
          if (!inst._running) { resolve(false); return; }
          i = Math.min(text.length, i + 1 + Math.floor(Math.random()*2));
          if (i < text.length) { inst._emit('', text.slice(0,i), false); setTimeout(step, 1000/cps); }
          else { inst._emit(text, '', true); if (!inst.continuous) inst._finish(); resolve(true); }
        };
        setTimeout(step, 80);
      });
    }
  };
})();
