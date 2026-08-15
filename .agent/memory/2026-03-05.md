# MEMORY

## プロジェクト概要
- jimakuChan（音声認識字幕ちゃん）: 配信者・コンテンツクリエイター向けリアルタイム音声認識・翻訳字幕アプリ
- 主要ファイル: index.html（設定UI）、main.html（字幕表示・認識エンジン）、js/i18n.js（多言語対応）
- Web Speech API使用、HTTPS必須（run_server.py: localhost:4443）

## 学習した知識・教訓
- テスト前にコミットしない（CLAUDE.mdルール）
- サーバー起動はユーザーが手動で行う（自動起動禁止）
- 秘密機能パスワード: ponpontanuki（XOR 42で難読化）、リセット: death
- Chrome v138+でオンデバイス音声認識対応（processLocally）
- 設定はlocalStorageとURLパラメータ経由でiframeに渡される
- 3層テキストレンダリング: bg（縁取り）、fg（前面）、imb（背景色合わせ）
