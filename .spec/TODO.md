# TODO - タスクリスト

## 優先度：高
- [x] Ollama ローカル AI 翻訳機能の実装
  - [x] `v2/index.html`：翻訳方法セレクタに Ollama ボタン，設定行（URL/モデル名），接続テストボタン，モデル選択ドロップダウンを追加
  - [x] `v2/js/presets.js`：`DEFAULTS` に `ollama` 設定（url, model）を追加・永続化対応
  - [x] `v2/js/translator.js`：`_ollama()` 実装，`fetchOllamaModels()` によるタグ取得，`translateOne()` からの呼び出し分岐
  - [x] `v2/js/app.js`：UI 切り替え表示ロジック，接続テスト，モデル自動検出・ドロップダウン連動
  - [x] `v2/js/i18n.js`：日英の多言語ラベル・ステータス表示・プレースホルダー・ヘルプ文言追加
  - [x] `v2/tools/ollama_bridge/ollama_bridge.py`：Python 標準ライブラリのみで動く WebSocket ブリッジスクリプト（モデル一覧取得も中継対応）を作成
  - [x] 2026-09-12 「接続しても翻訳字幕が出ない」不具合を修正：Ollama を「実行中1件＋最新の待機1件」の直列化（latest-wins）に，
        タイムアウト 10→30 秒，思考型モデルへ `think:false`，未導入モデルの自動選択，翻訳エラーを `#engineStatus` に表示．
        Playwright＋偽 Ollama（即時／遅延／直列）＋実 Ollama（qwen3.5:4b / gemma2:2b）で HTTP 直接・WS ブリッジ両経路を自動検証済み
  - [x] ユーザー実機テスト・動作確認（Ollama 連携検証）
- [x] ローカル音声認識（WhisperLive → WhisperLiveKit へ差し替え）
  - 経緯：WhisperLive は成長バッファを再文字起こしし，複数セグメントか出力安定まで commit しないため，
    話し続けると確定せず（長い独話で悪化）．暫定でクライアント側の無音エンドポイントを入れていた
  - [x] 2026-09-13 **WhisperLiveKit（WLK）へ差し替え**：
    - `v2/js/whisper_recognizer.js`：WLK `/asr` クライアント．`--pcm-input` 前提で 16kHz モノラル Int16 PCM を送信．
      接続直後の `config` 待ち→マイク開始．`snapshot`/`diff` の `lines`（確定）→ `final`，`buffer_transcription`（途中）→ `interim`．
      終端は空バイト送信→`ready_to_stop`．再接続（5 回）・接続テスト付き．**クライアント側 endpoint は全廃**（確定はサーバ）
    - `v2/index.html`：認識モデルに「Whisper（ローカル）」．URL（既定 `ws://127.0.0.1:11437/asr`）＋**モデル ドロップダウン**＋API キー＋接続テスト＋状態
    - `v2/js/presets.js`：`DEFAULTS.whisper = { url: 'ws://127.0.0.1:11437/asr', apiKey: '', controlUrl: 'http://127.0.0.1:11436' }`
    - `v2/tools/whisper_livekit/`：`whisper_launcher.py`（`setup`/`run`/`start`/`model`/`doctor`，venv・PyAudio/PortAudio 不要．
      `run`/`start` は **127.0.0.1 の制御 API**（`GET /wlk/status`, `POST /wlk/config`）を併設し，アプリのドロップダウンからモデル切替＝自動再起動），
      `start_all.bat`，`whisperlivekit.env.example`，README
    - 検証：制御 API を curl（status/config/再起動後も生存）で確認し，Playwright でアプリのドロップダウンがサーバのモデル（`base`）を反映→
      `tiny` に変更→`モデル: tiny` 表示＋env 更新を確認．偽 WLK サーバでの認識パイプライン検証は前項のとおり
  - [x] 実機テスト：`whisper_launcher.py setup` → `start` → アプリで「Whisper（ローカル）」→ 接続テスト → 認識（`WHISPER_MODEL=small` 目安）
- [x] 2026-08-22 X の報告「スペイン語だけ認識されない」対応：認識言語に es-ES/MX/US/AR/CO を追加，
      language-not-supported の可視化（従来は「マイク未許可」と誤表示）→ push（48d8acd, Ver 2026.08.22 17:41）
- [x] 2026-08-27 しゅりみんさん報告「1行スタイルで左端が切れる」対応：
      （1回目 0ac0b93 = 両端に常時固定 → 先生の意図と違ったため却下）
      → **0fc454f, Ver 2026.08.27 22:57**：認識中マーカーは従来どおり途中結果にだけ付き，
      途中結果が長くなって左の << が窓の外へ流れ出るときだけ，その印を行の左端に残す方式に．
      あわせて字幕表示領域のクリックで表示モードを出入りできるように（v1 と同じ操作感）．
      Pages 反映確認済み．**先生の実機テスト結果待ち**
- [ ] しゅりみんさんへの返信（文案 = .output/2026-08-27_1行表示_両端マーカー実装.html 末尾）
- [ ] 1行表示の詰め（先生の実機テスト後）：吸い込みのぼかし幅（いま印の幅＋0.45em）／
      確定文が長いときも左端に印を出すか（いまは途中結果のときだけ）／自動縮小案（下限60%）の要否
- [ ] Danny への返信（Chrome 151 Win10．Chrome 151 に該当変更なし．コンソール貼り付けスニペットで
      「音が届いていない」か「返ってこない」かを切り分ける．文案 = .output/2026-08-27_1行表示と認識不具合_調査.html）
- [ ] 検討：マイク入力レベルメーター／診断パネル（?debug=1）— 海外ユーザーの切り分けが楽になる（先生判断）
- [x] 報告者（Danny）への返信 → 2026-08-27 返答あり：Chrome 151.0.7922.174 / Windows 10，
      コンソールにエラーなし・Listening のまま結果ゼロ（続きは上の「Danny への返信」）
- [ ] **v1（従来版）の伏字が全言語で部分一致のままである件の方針決定**．GoodList 補強で当座は緩和したが
      （2026-08-22 push 2c6cdd3），en `ass`／fr `cul`／id `tai` `asu` などは根本的には単語境界化が必要．
      2 万人利用のため西村先生の判断待ち
- [x] 2026-08-17 OBS 側の不具合修正（消えない／再読み込みで戻る／言語表記／v1 の v2 リンク）実機テスト済 → push（ef4e11b）
- [ ] 西村による実機テスト（Chrome 実機でマイク認識・Chrome 翻訳・OBS 31 でブラウザソース追加・クロマキー窓）
- [x] v2 を v2/ に配置して main にマージ・push（2026-08-16 β公開 https://sayonari.github.io/jimakuChan/v2/）
- [x] goodBadWordlist の 2 コミット（ローカル main）を push（2026-08-16 確認：origin/main と同期済み）
- [x] 紹介動画・OBS ガイド動画を Twitter 投稿（2026-08-16）
- [ ] 将来：メイン URL を v2 に切替（ルートを v2 に置き換え，旧版は v1/ へ）

## 優先度：中
- [ ] OBS 30 以前（CEF 103）で overlay.html の描画確認（擬似要素方式なので動く想定）
- [ ] 英語 UI の文言見直し，使い方ガイド（sayonari.com）の v2 対応
- [ ] Chrome 翻訳モデル DL の UX（進捗表示）

## 優先度：低
- [ ] リリック風テーマなど追加テーマ（機能を増やしすぎない範囲で）
- [ ] 表示ウィンドウのサイズ記憶

## 完了済み
- [x] 旧版精査（Claude 監査＋Codex GPT-5.6 Sol 監査）→ .output/ 参照
- [x] v2 再実装（設定画面・overlay・認識・翻訳・伏字・OBS・プリセット・i18n）
- [x] 伏字ルール見直し（単語境界）＋ goodBadWordlist 全言語更新（ローカルコミット済）
- [x] 紹介動画の全自動生成ツール
