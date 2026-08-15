# TODO - タスクリスト

## 優先度：高
- [ ] 西村による実機テスト（Chrome 実機でマイク認識・Chrome 翻訳・OBS 31 でブラウザソース追加・クロマキー窓）
- [x] v2 を v2/ に配置して main にマージ・push（2026-08-16 β公開 https://sayonari.github.io/jimakuChan/v2/）
- [ ] goodBadWordlist の 2 コミット（ローカル main）を push（v1 にも即反映されるので注意：v1 は部分一致のまま）
- [ ] 紹介動画・OBS ガイド動画（.output/*.mp4）を確認して Twitter 投稿
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
