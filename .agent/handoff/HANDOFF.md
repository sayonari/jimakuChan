# HANDOFF - 2026-08-16 02:00

## 使用ツール
Claude Code (Fable 5) ＋ Codex CLI (GPT-5.6 Sol, 旧版監査) ＋ Playwright（headless 検証・動画生成）

## 現在のタスクと進捗
- [x] 旧版精査（バグ監査 2 系統）
- [x] v2 再実装（別フォルダ＝ここ，ブランチ v2-rebuild，**未コミット**）
- [x] 伏字ルール見直し＋ goodBadWordlist 全言語更新（別リポジトリ，ローカル main にコミット済・未 push）
- [x] 紹介動画の全自動生成ツール（tools/promo_video，`node build.mjs`）
- [ ] 西村の実機テスト → コミット → GitHub Pages 反映

## 試したこと・結果
- headless Chromium で設定画面・overlay・疑似認識フロー・タイマー・プリセットは動作確認済（.output/*.png）
- Chrome 実機（マイク・Chrome 翻訳・OBS 接続）は未検証（サーバー起動は西村が行うルールのため）

## 次のセッションで最初にやること
1. AGENTS.md / MEMORY.md を読む
2. 西村のテスト結果を聞き，不具合があれば修正 → コミット
3. goodBadWordlist の push 可否を確認

## 2026-08-16 深夜：初回テストの指摘 4 件に対応済（スペース除去／途中結果のみ／連続モード／PC内フォント／OBS http:4444）．再テスト待ち

## 2026-08-16 深夜2：2 回目フィードバック対応→ v2/ に配置し main へ push（β公開済）．なめらか縁取り（膨張影），ライト UI 既定，自動開始，PC 内フォント一覧，Google Fonts 指定修正，動画 2 本（edge-tts Nanami）

## 2026-08-16 03:15：β公開・Twitter 投稿済み．次はユーザーからの反応・不具合報告への対応，将来のメイン URL 切替

## 注意点・ブロッカー
- goodBadWordlist の変更は push すると v1（部分一致）にも即反映される．v1 に影響しそうな短い語は入れていないつもりだが要注意
- overlay.html を OBS で使うには GitHub Pages 反映後の URL が必要（file:// は OBS 側では読めない場合がある）
- 動画の音声は macOS `say -v Kyoko`．別ボイスに変えるなら narration.mjs の buildNarration('Kyoko') を変更

## 2026-08-16 昼：1行表示（ティッカー）・起動時タイトル表示・開発者表記修正を main へ push（f8b5308，GitHub Pages 反映待ち）

## 2026-08-17：既定値変更（未コミット・西村テスト待ち）
- 認識セッションの既定を「文ごとに再起動（従来）」へ（連続認識は文末確定が遅く重く見えるため．連続はオプションとして残す）
- 出現アニメの既定（標準・カスタム）を「なし」へ（アニメ有りだと途中結果が一度消えて再表示され連続性が失われる）．組み込みプリセット独自の anim 指定は維持（西村指示）
- presets.js に `defaultsRev=2` の一回限り移行：保存済み recogMode=continuous→restart，組み込み anim 指定の無いプリセットの anim=rise→none（β初期利用者向け）
- 保存・起動タブの「解説動画」リンクを YouTube サムネイル＋再生バッジ付きカード（.vlink）に
- headless（Playwright, file://）で移行と UI 初期状態は確認済．実機（マイク）での体感確認は西村
