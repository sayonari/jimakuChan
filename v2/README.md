# jimakuChan v2 (音声認識字幕ちゃん)

ブラウザだけで動く，配信者向けリアルタイム音声認識・翻訳字幕．インストール不要・無料・超軽量．  
**https://sayonari.github.io/jimakuChan/v2/**（β）／ 従来版：https://sayonari.github.io/jimakuChan/

## v2 の設計ポリシー
1. **導入が簡単**（ここに全振り）：Chrome で開く → マイク許可 → 「認識をはじめる」
2. **機能は絞る**：認識・翻訳（最大3言語）・見た目・伏字・OBS 連携・棒読みちゃん
3. **安定・超軽量**：認識は Chrome（Google）に任せ，ページ側は表示と配信だけ．PC の性能に依存しない
4. **縁取りは外側にだけ伸びる**：同じ文字列を同じボックスに重ねて描画（後述）．改行位置がずれない

## ファイル構成
```
index.html        設定画面 ＋ エンジン（認識・翻訳・伏字・タイマー・OBS 送信）
overlay.html      字幕の表示専用ページ（プレビュー iframe／表示ウィンドウ／OBS ブラウザソース で共通）
css/app.css       設定画面のスタイル
css/overlay.css   字幕表示のスタイル（縁取り・テーマ・アニメ）
js/app.js         設定画面ロジック（設定 ⇄ DOM，エンジン制御，配信）
js/overlay.js     表示ページ（BroadcastChannel / DOM イベント / postMessage で受信）
js/recognizer.js  Web Speech API 音声認識（2 インスタンス交互・自動再開・ローカルモデル対応）
js/translator.js  翻訳（Chrome 内蔵 Translator API → GAS フォールバック）
js/chrome_translator.js  Chrome Translator API ラッパ（v1 から継承）
js/filter.js      伏字フィルタ（goodBadWordlist 読込・単語境界判定）
js/obs.js         obs-websocket v5 クライアント（依存なし）
js/presets.js     設定スキーマ・プリセット・保存/読込・v1 からの移行
js/i18n.js        UI 多言語（日本語 / English）
js/bouyomichan_client.js  棒読みちゃん WebSocket（キュー付き）
font/, font.css   同梱フォント
tools/promo_video/  紹介動画の全自動生成ツール（Playwright + ffmpeg + say）
```

## 動作の流れ
```
Chrome(index.html)  ── 音声認識 ──▶ 語句置換 → 伏字 → 表示メッセージ {type:'text', slot, text, interim}
      │                                          │
      │  postMessage      ┌───────────────────────┼─────────────────────────┐
      ▼                   ▼                       ▼                         ▼
 プレビュー iframe   表示ウィンドウ(popup)   OBS ブラウザソース          OBS テキストソース(任意)
 overlay.html        overlay.html?popup=1     overlay.html               SetInputSettings
                     (BroadcastChannel)      (obs-websocket → obs-browser emit_event)
```
- 表示設定も同じ経路で `{type:'config'}` として配るので，設定画面でいじった見た目が OBS 側にも即反映される
- OBS 連携は OBS 28+ 同梱の WebSocket（ツール → WebSocket サーバー設定）を使う．「現在のシーンに字幕を追加」を押すとブラウザソースを自動作成する
- 旧来の「ウィンドウキャプチャ＋クロマキー」は「表示モード」（設定を隠して字幕だけ，クリック／Esc で戻る）で．表示モードは記憶され，次回は同じ URL を開くだけで字幕画面になる（v1 と同じ運用）

## 縁取りの描画（v1 の 3 層方式 → v2 の 2 層方式）
```html
<span class="txt" data-text="同じ文字列">同じ文字列</span>
.txt::before { content: attr(data-text); position:absolute; inset:0; -webkit-text-stroke: calc(縁 * 2) 色; z-index:-1 }
```
前面の塗りと同じ要素・同じ幅・同じフォントで擬似要素にストロークを描くため，改行位置は必ず一致し，
ストロークの内側半分は塗りに隠れて「外側にだけ太くなる」．（`paint-order: stroke fill` 対応ブラウザなら 1 層でも可）

## 1 行ティッカー表示（行ごとの「1行表示」チェック）
「見た目 → 文字」の表で行ごとに **1行表示** をオンにすると，その行は折り返さず 1 行で表示し，**最新の結果が常に右端**に見え，
過去の確定結果は同じ行に蓄積されて左へはみ出していく（紹介動画の字幕と同じ見え方）．認識行だけ 1 行にして，翻訳は複数行で折り返す，という組合せもできる．
実装：`.line[data-wrap="nowrap"]{direction:rtl}` で溢れを左側に逃がし，中の `.txt` を `direction:ltr` に戻す．
蓄積は overlay.js が行い（最大 200 文字，古い側から捨てる），無音タイマーの消去や「1行表示」オフで蓄積もリセットされる．

## 伏字（センシティブワード）
- 単語リストは [goodBadWordlist](https://github.com/sayonari/goodBadWordlist) から認識言語・翻訳言語ごとに取得
- ラテン文字などは**単語単位**，ハングルは語頭境界，日本語・中国語は部分一致＋GoodList 保護
- ユーザー独自の追加語／除外語も設定できる（フィルタ・辞書タブ）

## 開発
- ローカル確認：リポジトリ直下で `python run_server.py` → https://localhost:4443/v2/（OBS 用に http://localhost:4444/v2/ も併設）
- `file://` でも設定画面・プレビューは動く（BroadcastChannel は同一ブラウザ内の別ウィンドウで有効）
- 紹介動画：`cd tools/promo_video && npm i && node build.mjs`（`build/jimakuChan_v2_intro.mp4`）

## 開発者
- さぁたん（構想・助言）／ さよなりω・西村良太（実装，豊橋技術科学大学）
- ライセンス：LICENSE 参照
