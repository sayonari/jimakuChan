# CLAUDE.md

- セッション開始時に共通ルールである、AGENTS.mdを必ず読み込むこと。
- 読み込んだことを最初に報告すること
- 以下は Claude Code固有の差分のみ記載する

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

jimakuChan v2 (音声認識字幕ちゃん) — ブラウザだけで動く配信者向けリアルタイム音声認識・翻訳字幕．
2026-08-16 に v1（index.html + main.html の URL パラメータ方式）から全面再実装した（**`v2/` フォルダ**，β公開 https://sayonari.github.io/jimakuChan/v2/）．
リポジトリ直下は **v1 のまま**（2 万人以上が利用中なので触らない．トップにだけ v2 β へのバナーを追加）．将来メイン URL を v2 に切り替える．
旧版のスナップショットは `/Users/sayonari/_data/program/_Legacy/twitch/ninshikiChan_all/jimakuChan_20260216/` にもある．

## Architecture (v2)

- （以下すべて `v2/` 配下）`index.html` + `js/app.js` … 設定画面 **かつエンジン**．認識(`js/recognizer.js`)・翻訳(`js/translator.js`)・伏字(`js/filter.js`)・タイマー・OBS 送信(`js/obs.js`)をここで行う
- `overlay.html` + `js/overlay.js` + `css/overlay.css` … 表示専用．プレビュー iframe／表示ウィンドウ(popup)／OBS ブラウザソースで共通．メッセージ `{type:'config'|'text'|'clear'}` を postMessage / BroadcastChannel('jimakuChan') / DOM イベント `jimakuChan`（obs-browser の emit_event）で受け取る
- `js/presets.js` … 設定スキーマ（DEFAULTS）・組み込みプリセット・localStorage(`jimakuChan_v2_presets`)・v1 設定(`jimakuChan_presets`)からの自動移行
- `js/i18n.js` … `data-i18n` 属性による日英切替
- 縁取りは `.txt::before{content:attr(data-text); -webkit-text-stroke: 2×幅}` を同一ボックスに重ねる 2 層方式（外側にだけ太くなる・改行が一致）
- OBS 連携：obs-websocket v5（`ws://localhost:4455`）．`CallVendorRequest(obs-browser/emit_event)` で全ブラウザソースへ字幕を配信，`CreateInput` でブラウザソースを自動追加
- 詳細は v2/README.md．紹介動画ツールは v2/tools/promo_video

## Policy（西村）
- 導入が簡単であることに全振り／機能は絞る／安定・超軽量／縁取りは外側にだけ伸び改行がずれない
- 句読点は「，．」

## Development Commands

### Local HTTPS Server
```bash
python run_server.py
```
Starts HTTPS server on localhost:4443 (required for Web Speech API)

## 🚨 CRITICAL DEVELOPMENT RULES 🚨

### **NEVER COMMIT WITHOUT TESTING FIRST**
- **絶対にテスト前にコミットしてはいけません**
- 必ず以下の手順を守ること:
  1. コード修正完了
  2. ユーザーがテスト実施（サーバー起動は**ユーザーが行う**）
  3. 実際の動作確認完了
  4. 問題がないことを確認後にのみコミット
- この手順を飛ばすことは**絶対禁止**

### **NEVER START SERVER AUTOMATICALLY**
- **`python run_server.py` などのサーバー起動コマンドを実行してはいけません**
- サーバー起動は**必ずユーザーが手動で行う**
- Bashツールでサーバー起動コマンドを実行することは**絶対禁止**

## SSL Certificates

The development server uses `localhost.pem` and `localhost-key.pem` for HTTPS support. These are required because the Web Speech API only works over secure connections.