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
