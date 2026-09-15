# KNOWLEDGE - ドメイン知識・調査結果

## 業務・ドメイン知識
- jimakuChan は配信者向けリアルタイム音声認識字幕アプリ．西村ポリシー：導入簡単／機能を絞る／安定・超軽量／縁取りは外側にだけ伸び改行がずれない
- 競合：mojicast（ishiki-emo，pywebview＋ローカル ASR/翻訳モデル，OBS は http://localhost:8765）．こちらの差別化はゼロインストール・軽量

## 調査・リサーチ結果（2026-08-16）
- v1 の主なバグ：フォント select 値のバックスラッシュ不一致でプリセット破損／switchTranslationMethod の TypeError／isLoadingPreset TDZ／起動時 iframe 多重リロード／伏字が部分一致で過多（class→cl***）／404 テキストがワードリスト化／zh-CN 等のフォルダマッピング誤り／Chrome 翻訳失敗時の GAS フォールバック不成立／古い翻訳が新しい字幕を上書き／innerHTML XSS／postMessage 送信元未検証 など（詳細は .output/report_20260816.html と Codex 監査）
- goodBadWordlist：es/fr/de/pt が Latin-1 で保存されていた（UTF-8 で読むと非 ASCII 行が一致しない），zh-TW は破損．2026-08-16 に全面見直し
- Web Speech API：SpeechRecognitionPhrase の boost は 0〜10．オンデバイス認識は `SpeechRecognition.available({langs, processLocally:true})`
- Chrome Translator API：`Translator.availability()` が環境により応答しないことがある → 4 秒でタイムアウト．モデル DL はユーザー操作が必要
- obs-websocket v5：`CallVendorRequest{vendorName:'obs-browser', requestType:'emit_event', requestData:{event_name, event_data}}` で全ブラウザソースに DOM イベントを送れる．認証は sha256(base64(sha256(pw+salt))+challenge)
- Chrome の -webkit-text-stroke は角が尖る（miter）．v1 と同じ．`paint-order: stroke fill` は Chrome 123+ / OBS 31+ で HTML テキストに使えるが，CEF が古い OBS もあるので擬似要素 2 層方式を採用

## 技術的な知見
- BroadcastChannel は file:// では別ウィンドウに届かないことがある → popup には postMessage も併用
- Playwright headless で `Translator.availability()` の Promise が GC される → タイムアウトで保護
- 動画：フレームを Playwright で描画→ffmpeg image2pipe．30fps 1280x720 で約 5fps の描画速度（70 秒動画≒7 分）

## 決定事項と理由
- エンジンを iframe(main.html) から index.html に移動：設定変更のたびの iframe リロード（＝認識再起動）をなくすため
- 表示は overlay.html に統一：プレビュー／ポップアップ／OBS で同じ描画コードにするため
- 秘密機能（パスワード）は廃止し「詳細」折りたたみに：混乱防止は保ちつつ簡素化
- v1 の設定は自動移行（localStorage jimakuChan_presets → jimakuChan_v2_presets）

## 2026-08-16 実機テスト初回フィードバックへの対応
- 日本語認識結果に形態素ごとの半角スペース → app.js `tidy()` で CJK 間（CJK–英数間も）のスペースを除去
- 途中結果表示時に前の確定文が残る → 途中結果のみ表示
- 2 文目の頭が切れる → `continuous=true` の 1 セッションを回す「連続モード」を既定に（recognizer.js mode='continuous'）．shortPause 経過で仮確定（soft）して字幕・翻訳を先出し，Chrome の本確定で差分だけ追加／訂正．従来方式は「文ごとに再起動」として残す
- PC 内フォント → `window.queryLocalFonts()`（Chrome 103+，初回に許可ダイアログ）で一覧をプルダウンに追加．option に font-family を付けてプレビュー
- OBS で表示されない → 原因の本命は OBS(CEF) が自己署名 https://localhost を拒否すること．run_server.py に http:4444 を併設し，localhost 時はそちらを登録．file:// 時は is_local_file で登録．テスト送信は vendor request の成否を表示，overlay は OBS 内で受信するまで「接続待ち」バッジを表示

## 2026-08-16 3 回目フィードバック
- v1 バナーに「このまま v1 を使う（次回から表示しない）」（localStorage jimakuChan_hideV2Banner）
- 表示モード：設定を隠して字幕だけ（body.display-mode，ui.displayMode に記憶．iframe 内クリック→postMessage / Esc で戻る）．別窓は残すが補助扱い
- 縁取り：-webkit-text-stroke の miter トゲ → 円周状 text-shadow の膨張（strokeMode round/sharp）

## 2026-08-22 スペイン語認識の報告から学んだこと
- **利用者の画面キャプチャは数字を読む**．今回は右下の「6 translations」が決め手で，
  「翻訳が 6 回成功している＝認識経路は生きている」と分かり，切り分けが一気に進んだ
- **Chrome の音声認識は同じ言語でも地域コードで可否が変わることがある**．認識言語は
  地域バリアントを複数用意しておくと，利用者自身が回避できる
- **エラーを黙って握りつぶさない**．v2 は `language-not-supported` を無言で再起動し続けており，
  利用者からは「ただ字幕が出ない」ようにしか見えなかった．致命エラーは文言を分けて画面に残す
- **v1 と v2 で伏字の判定方式が違う**（v1＝全言語で部分一致，v2＝ラテン系は単語境界）．
  共有リソース（goodBadWordlist）を更新するときは，古い側のアルゴリズムでも検証する．
  検証は両方を再現した Node スクリプトで文例を通すのが速い

## 2026-09-12 Ollama ローカル AI 翻訳で「字幕が出ない」原因と対策
- **思考型モデルは `think:false` を付けないと爆遅**．実測 qwen3.5:4b は 1 文で 24.6 秒（eval 340 tokens），
  `think:false` で 0.29 秒（3 tokens）．リアルタイム字幕では `think:false` が必須．古いモデルは無視するだけ
- **既定モデルが未導入だと 404**．接続テスト（/api/tags）は通るので気づきにくい．
  未導入のときはインストール済みの先頭モデルを自動選択して，そのまま使えるようにした
- **Ollama は 1 モデルを直列処理**．連続発話で要求が滞留し，固定 10 秒タイムアウトでは
  待ち時間込みで全滅する（実測：req#3 が 13 秒，req#4 が 17 秒でタイムアウト）．
  「実行中 1 件＋最新の待機 1 件」に直列化（latest-wins）して 30 秒に延長した
- **`seq` ガードは古い結果を捨てるが，最新は必ず表示する必要がある**．直列化＋最新優先で保証する
- 検証は Playwright（tools/promo_video の fake_sr.js）＋偽 Ollama（即時／遅延／直列キュー）で再現できる．
  実 Ollama（qwen3.5:4b / gemma2:2b）で HTTP 直接・WebSocket ブリッジ両経路を確認済み

## 2026-09-13 ローカル音声認識は WhisperLiveKit（WLK）に一本化
- 旧 WhisperLive 連携（成長バッファの再文字起こしで commit が遅い）は**廃止**．以降は WLK 前提のみ
- 構成：
  - `v2/tools/whisper_livekit/whisper_launcher.py`（Python CLI：`setup`/`run`/`start`/`model`/`doctor`）．
    venv 既定（Windows/macOS/Linux 共通．venv の python を直接使い Scripts/bin 差を吸収．PyAudio/PortAudio 不要）
  - 127.0.0.1 に制御 API（`GET /wlk/status`, `POST /wlk/config`）を併設し，アプリのモデル ドロップダウンから
    切替＝自動再起動．既定 WS は `ws://127.0.0.1:11437/asr`（8000 は衝突しやすいので回避），制御 11436
  - アプリ：認識モデル「Whisper（ローカル）」．`v2/js/whisper_recognizer.js` が 16kHz モノラル Int16 PCM を送る
    （`mode=full`）．設定は `whisperlivekit.env`
- **WLK（0.2.26）の挙動（実装を読んで確認）**：
  - `lines`＝確定セグメント（validated_segments）＋育っている行＋無音行（speaker:-2, text:""）
  - **無音中はクライアントへ確定を送らない**．open line が確定するのは「次の発話開始」か end-of-stream のみ．
    無音の進行は標準 `/asr` には通知されない（silence_started 等は Deepgram 互換経路のみ）．
    しかも無音中も remaining_time が変化し push され続けるため「出力が静止したら無音」判定は不可
  - `--pause-segmentation-seconds` は「無音の後に発話が再開したとき」に lines を区切る．0 にすると境界判定が
    常に False になり確定が止まり，テキストは `buffer_transcription` に溜まる
  - `remaining_time_transcription_processing` ≒ audio_received − processed（サーバ遅延）．0 なら追いついている
- **クライアントの確定規則（`whisper_recognizer.js` 最終形）**：
  - `lines` の内容行と `buffer_transcription` を **1 本のテキストに連結**して扱う（サーバは無音で lines を分断する
    ため，そのままでは文が途中で切れる）．buffer が lines 末尾と同一なら足さない（二重防止）
  - **文末記号（。．.!?）まで来た文はその場で確定**．未完の切れ端だけ次入力へ持ち越す（`...` は文末にしない）
  - 既出分は raw 接頭辞 `_streamCommitted` で管理し差分だけ出す（言い直しに強い）
  - **末尾フラッシュ**：テキストが 2s 変化せず，かつサーバ遅延 ≤ 0.5 のとき，未完の末尾も確定
    （サーバは無音で末尾を確定しないため）
  - **無音による確定はしない**．旧 clientSilence（「無音で確定」）は語中で切るため全廃（UI も撤去）．
    停止時のみ残りを flush
  - 診断：`?debug=1`＝`[wlk] commit "..."`，`?debug=2`＝毎メッセージの lines/buffer．起動ログは
    `[wlk] whisper_recognizer <BUILD>`．スクリプトは `?v=<BUILD>` でキャッシュ破棄（index.html）
- **接続状態のライブ表示**：
  - Whisper / Ollama の行にライブ接続ドット（ok=緑＋脈動 / busy=黄 / err=赤）．5〜8s ごとにヘルスチェックし，
    切断されると赤くなる
  - Whisper：制御 API `/wlk/status`（無ければ WS `testConnection`）．認識中は WS の生状態を優先
  - Ollama：`translator.fetchOllamaModels`（WS ブリッジ / HTTP `/api/tags`）．翻訳中はスキップ

## 2026-09-13 Ollama 翻訳のタイムアウト対策
- ブリッジ（`v2/tools/ollama_bridge`）は CORS/Mixed Content 回避の WS→HTTP 転送．Ollama HTTP タイムアウトは 25s
- **30s タイムアウトの主因は，WS 切断時に pending を reject していなかったこと**．`_ollamaWsRequest` が
  onclose/onerror/再接続で `_failOllamaPending` により即 reject するよう修正（済）
- 実測：qwen3.5:4b（CPU, size_vram:0）で 1 文 ~1s．ブリッジは連続要求でも stall せず，遅さが原因ではなかった
