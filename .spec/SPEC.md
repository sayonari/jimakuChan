# SPEC - 技術仕様・要件定義（v2, 2026-08-16）

## 機能要件
- 音声認識：Web Speech API（Chrome）．言語 25 種．文の区切り(shortPause)・消去タイマー・棒読みちゃん送信
- 翻訳：最大 3 言語同時．Chrome 内蔵 Translator API（138+）→ 失敗時 GAS フォールバック．モデル DL ボタン
- 見た目：4 行（認識・翻訳1-3）ごとにフォント／色／フチ色／サイズ／太さ／縁取り．テーマ（縁取り・ボックス・ネオン・シャドウ・ピル），出現アニメ，背景色／透過，左右・上下配置，改行，行間，認識途中マーカー
- プリセット：組み込み 8 種＋カスタム 3．自動保存．JSON でエクスポート／インポート．v1 設定の自動移行
- 伏字：goodBadWordlist（認識言語＋翻訳言語）＋ユーザー追加語／除外語．ラテン系は単語境界判定
- 語句置換：「前→後」（表示・翻訳・OBS 全てに反映）
- OBS：A) obs-websocket 経由でブラウザソースへ配信＋ワンクリック追加，B) 表示ウィンドウ（クロマキー），C) テキストソース直接更新（任意）
- 起動ファイル（.bat/.command），日英 UI

## 非機能要件
- 依存ライブラリなし（vanilla JS），GitHub Pages で静的配信，file:// でも設定・プレビューが動く
- 認識・翻訳・表示の各処理は 1 ファイル 1 責務（js/*.js）
- 縁取りは擬似要素 2 層方式で「外側にだけ太く」「改行が一致」

## 技術構成
- index.html + js/app.js（エンジンホスト）／ overlay.html + js/overlay.js（表示）／ js/{recognizer,translator,filter,obs,presets,i18n}.js
- 配信経路：postMessage（iframe/popup）・BroadcastChannel('jimakuChan')・obs-browser emit_event（DOM イベント 'jimakuChan'）
- 動画生成：tools/promo_video（Playwright フレーム描画 → ffmpeg，say/Kyoko ナレーション，numpy BGM）
