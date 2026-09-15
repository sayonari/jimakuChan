# WhisperLiveKit 連携ツール（jimakuChan v2）

Web Speech API の代わりに，**ローカルで動く [WhisperLiveKit](https://github.com/QuentinFuxa/WhisperLiveKit)（WLK）** を使って音声認識するためのツールです．ブラウザはマイク音声（16kHz モノラル Int16 PCM）を WebSocket で送り，WLK が **確定した文（lines）** と **未確定の途中結果（buffer）** を返します．翻訳・伏字・OBS 連携はこれまでどおり動きます．

**Windows / macOS / Linux 共通**の Python ランチャ `whisper_launcher.py` を使います．音声はブラウザ側で PCM 化するため，**サーバに PortAudio は不要**です．

## これまでの WhisperLive との違い
- **確定（commit）をサーバが行う**：WLK は LocalAgreement / AlignAtt（SimulStreaming）という同時処理ポリシーと VAD を使い，
  話し続けていても「安定した語」を次々に確定します．無音を待たないので長い独話でも翻訳が流れ続けます．
- クライアント側の無音エンドポイント（旧実装のハック）は**廃止**しました．表示はサーバの `lines`（確定）と
  `buffer_transcription`（途中）をそのまま写すだけです．

## 必要なもの
- **Python 3.11〜3.13**（3.12 / 3.11 推奨．WLK は `<3.14`）
- 初回は torch 等で数 GB のダウンロード

## セットアップ
```bash
cd v2/tools/whisper_livekit
python whisper_launcher.py setup        # Windows: py -3 whisper_launcher.py setup
```

## 起動
```bash
python whisper_launcher.py run          # WhisperLiveKit のみ
python whisper_launcher.py start        # + Ollama WebSocket ブリッジ
python whisper_launcher.py doctor       # 環境チェック
```
既定では `127.0.0.1:11437` で待ち受け，WebSocket は `ws://127.0.0.1:11437/asr` です．`--bind` で変更できます．
Windows でダブルクリックしたい場合は `start_all.bat` をどうぞ．

## アプリ側の設定
1. 設定画面 → 音声認識 →「詳細（認識モデル・優先語句）」
2. **認識モデル**で「Whisper（ローカル）」を選ぶ
3. URL に `ws://127.0.0.1:11437/asr` を入れる
4. **接続テスト**で「接続OK（サーバ準備完了）」を確認 →「認識をはじめる」

## モデルの切り替え（アプリから）
WLK はモデルをプロセス起動時に読み込むため，本ランチャは 127.0.0.1 に小さな**制御 API** を併設し，
アプリの**モデル**ドロップダウンから切り替えられるようにしています（切り替えるとサーバを自動で再起動）。

- `GET http://127.0.0.1:11436/wlk/status` … 現在のモデル・稼働状態
- `POST http://127.0.0.1:11436/wlk/config` `{"model":"base"}` … モデル変更（`--no-control` で無効化可）
- 制御 API を使わない場合は `WHISPER_MODEL` を編集して再起動，または `python whisper_launcher.py model base`

**遅いと感じたら `base`（または `tiny`）に下げてください。** CPU のみの環境では `small`/`medium` は追いつかないことがあります．

## 設定（whisperlivekit.env）
- `WHISPER_MODEL`（既定 `small`）… 小さい順に `tiny`/`base`/`small`/`medium`/`large-v3`．
  CPU のみなら `base`/`small`，Apple Silicon は `mlx-whisper` バックエンドも選べます．
- `WHISPER_CONTROL_PORT`（既定 `11436`）… アプリからのモデル切替 API（127.0.0.1 のみ）．
- `WHISPER_BACKEND_POLICY`（既定 `simulstreaming`）… AlignAtt．`localagreement` も選べます．
- `WHISPER_PAUSE_SEGMENTATION_SECONDS`（既定 `2.0`）… この秒数以上の無音で文を区切ります（小さいほど細かく確定）．
- `WHISPER_API_TOKEN` … 設定すると認証必須．アプリ側の「API キー」欄に同じ値を入れます．
- 詳細な CLI は `wlk serve --help`．

## OS ごとのメモ
- **Windows**: Python を入れて `py -3 whisper_launcher.py setup` → `start_all.bat`．
- **macOS**: Apple Silicon なら `WHISPER_BACKEND=mlx-whisper` も可（別途 extras が必要）．
- **Linux**: 追加のシステム依存はありません．

## 仕組み
- 接続すると WLK が `{"type":"config", "useAudioWorklet":...}` を返します．`--pcm-input` 起動なら true で，
  16kHz モノラル s16le PCM をバイナリで送ります（`useAudioWorklet` が false の場合は `--pcm-input` を付けて起動してください）．
- サーバ→クライアントは `lines`（確定セグメントの配列）と `buffer_transcription`（途中）を含む JSON．
  クライアントは差分モード（`?mode=diff`）で `snapshot`/`diff` を受け取り，新しい `lines` を確定字幕として使います．
- 終了時は空バイトを送ってフラッシュを促します．
- `v2/js/whisper_recognizer.js` がクライアント本体です．
