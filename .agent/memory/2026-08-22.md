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
