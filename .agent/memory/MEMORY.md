# MEMORY

## プロジェクト概要
- jimakuChan v2（音声認識字幕ちゃん）：2026-08-16 に全面再実装．旧版は `_data/program/_Legacy/twitch/ninshikiChan_all/jimakuChan_20260216`
- 構成：index.html(設定＋エンジン) / overlay.html(表示) / js/*.js（1 ファイル 1 責務）．詳細は README.md・CLAUDE.md
- git：origin=github.com/sayonari/jimakuChan，作業ブランチ `v2-rebuild`（西村テスト後にコミット）

## 学習した知識・教訓
- テスト前にコミットしない／サーバー起動はユーザーが行う（CLAUDE.md）
- 句読点は「，．」（西村ルール）．UI 文言も同様
- 西村ポリシー：導入簡単・機能を絞る・軽量・縁取りは外側にだけ伸びて改行がずれない
- 伏字：ラテン系は単語境界，CJK は部分一致＋GoodList．goodBadWordlist は同階層の別リポジトリ（2026-08-16 push 済）
- 外部 AI 監査：`codex exec --skip-git-repo-check -s read-only -m gpt-5.6-sol < prompt.txt`（30 分程度かかる）
- Playwright は tools/promo_video/node_modules にインストール済（テスト・動画生成に使用）
- fake_sr.js（tools/promo_video）で Web Speech API をモックして E2E テストできる
- バージョン表記は `v2/js/presets.js` の VERSION（`YYYY.MM.DD HH:MM`，時刻まで含める・西村指示 2026-08-17）．push のたびに書き換える．画面バッジ・フッター・起動時タイトル・エクスポート JSON に反映される
- **obs-websocket emit_event の落とし穴**：event_data は libobs obs_data を通るため，数値・文字列だけの配列は空配列になる（オブジェクト配列は残る）．OBS 向けメッセージは必ず `json` 文字列を同梱する（sendObs が自動で付ける）．新しいメッセージ型を足すときもこの経路で配列を送らないこと
- OBS 側の即時反映を確認するときは「ブラウザソースの再読み込み」も試す（URL の cfg は追加時点のスナップショット．overlay の localStorage 復元＋10 秒ハートビートで追従）
- 開発用証明書 localhost.pem は mkcert 製（有効期限あり，git 管理外）．期限切れになると Chrome がマイク許可を記憶せず「文ごとに再起動」のたびに許可ポップアップが出る．`mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1` で再発行（2026-08-17 再発行，期限 2028-11-17）
- **goodBadWordlist は v1・v2 で判定方式が違う**：v2（filter.js）は単語境界だが，**従来版 v1（main.html）は全言語で部分一致のまま**．BadList に 3 文字以下の語を入れると v1 で一般語を巻き込む（pt の `cu` → cultura/curso/documento）．GoodList は**活用形もそのまま書く**（`habiter` を入れても `habite` は守れない）．2026-08-22 に es/de/pt の文字化け修正＋es/pt/fr/id/nl/tr の GoodList 補強，pt BadList から `cu` を削除
- 単語リストを変更したら，`v1（部分一致）` と `v2（単語境界）` の両アルゴリズムを再現したスクリプトで文例を確認する（v1 は GoodList をファイル順にプレースホルダ退避 → BadList 伏字 → 復元）
- **認識言語は地域バリアントを持たせる**：Chrome の音声認識は同じ言語でも地域で可否が変わることがある．2026-08-22 にスペイン語を es-ES/MX/US/AR/CO の 5 つに（X で「スペイン語だけ認識されない」報告を受けて）
- 致命エラー（fatal）の文言は app.js 側で `error` コードごとに分岐する．以前は 2 種類しかなく `language-not-supported` でも「マイクが許可されていません」と誤表示していた．トーストは 2.6 秒で消えるので `#engineStatus` にも残す
- Drive アーカイブ：`.agent/scripts/sync_to_drive.sh` → `マイドライブ/nishimura/webpage/字幕ちゃん/jimakuChan_v2/`（コードは GitHub が正本なので同期しない）
- **1行表示（ティッカー）の左マーカー**（2026-08-27 西村指示・Ver 22:57）：認識中マーカー `<< >>` は**従来どおり途中結果にだけ**付く．ただし途中結果が長くなって左の `<<` が窓の外へ流れ出るときだけ，その印を行の左端に残す（`.line.is-over` → 絶対配置の `.mk`＋窓の左を `--mkw` ぶんマスク）．**最初に作った「両端に常時固定」は先生の意図と違って却下された**（22:45 → 22:57 で作り直し）．要望を聞いたら「どのタイミングで出るか」まで確認すること
- あふれ判定は**必ず「マーカーを本文に入れて描いた状態」の幅**で行う（`paint(i,false)` → 測定 → over なら `paint(i,true)`）．描き分けた後の幅で判定すると付いたり外れたりで振動する
- CSS の落とし穴：縁取りを共有するため `.txt, .mk` を後方でまとめて `display:inline-block` にしているので，前方の `.mk{display:none}` は詳細度同点＋後勝ちで負ける．`.line:not([data-wrap="nowrap"]) > .mk` のように詳細度を上げて隠すこと
- `render()` には「内容が同じなら DOM を触らない」早期 return があるので，レイアウト系の再判定（あふれ判定 `updateOverflow()` など）は**早期 return の前にも**呼ぶ．でないとモード切替時に古い状態が残る
- ティッカーの窓は右にだけ `padding-right`（.3em）を入れる：`overflow:hidden` で最新文字の縁取りが右端で切れるのを防ぐ（左はフェードするので不要）
- 縁取り層は `.txt::before{content:attr(data-text)}` で**文字列全体**を描くので，本文の一部（マーカーなど）だけを動かす・隠すことはできない．端に残す印は本文の外に別要素として置き，本文側からはその文字を取り除く
- 字幕表示領域（プレビュー）のクリックで表示モードを出入りできる（v1 と同じ操作感・2026-08-27）．HUD ボタンは `closest('.hud')` で除外
- **Chrome はオンデバイスモデルがあると processLocally=false でもローカル認識する**（2026-10 報告・Chrome 155）．ページから強制も削除もできない．ja のみ install すると available なのに結果ゼロ → en-US も入れると直る．削除は chrome://settings/accessibility →「自動字幕起こし」をオンにすると言語一覧が出てそこから消せる（オフのままだと一覧が出ない）．実体は ~/Library/Application Support/Google/Chrome/SODALanguagePacks/
- **start(audioTrack)**：v2 は mic.js で getUserMedia → 処理（ゲイン・ゲート・2入力ミックス・ミュート）→ track を認識に渡す．AudioContext が suspended だと処理後 track は無音なので生 track を渡す．**Edge は 16kHz の track でないと結果が返らない**（AudioContext({sampleRate:16000}) を通す．ジュノーン先生 @junorn_1978 情報）
- 宣伝 PV：v2/tools/promo_video/build_hype.mjs（ドパガキ仕様・170BPM）．X の文字数は日本語2・英数1・URL23 で 280 以内（scratchpad の xlen.py 方式で検算）
- **start(track) は例外なしで黙って動かないことがある**（Issue #14・2026-10-11）：例外だけを見たフォールバックでは足りない．v2 は「結果ゼロのまま watchdog 作り直し 2 回」で検出し，プルダウンの「マイク選択を使わない」（'direct'，localStorage 保存）へ切替．判定は app.js の noTrack()（未対応 or direct）に集約してある
- **Chrome 翻訳モデルは英語との組（en_ja, en_ko …）で入り英語経由で訳す**（~/Library/Application Support/Google/Chrome/TranslateKit/models/）．認識 ja で翻訳が全部止まる＝en_ja の取得・読込不良が本命．利用者への案内は「翻訳先の選び直し（change で取得開始）」→ chrome://on-device-translation-internals で確認・入れ直し → Chrome 再起動．**GAS API はキー取得が難しいので利用者に勧めない**（2026-10-14 先生）
- **宣伝動画の効果音**（2026-10-14 神託 PV）：「神々しい」＝西洋・キリスト教的（パイプオルガン，女性コーラスの「アー」，ウィンドベル＝ツリーチャイムの「ちりちりーん」，「パーン」と光が差す和音）．**鐘・鈴・梵鐘・ハープ（琴に聞こえる）は和風・仏教的になるので使わない**．合成は v2/tools/promo_video/sfx_divine.py，ビルドは build_divine.mjs（--remix で音だけ作り直し）
