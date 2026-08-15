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
