# HANDOFF - 2026-10-14

## やったこと
1. v2：音声入力に「Chrome のタブの音声」を追加（getDisplayMedia・ジュノーンさん方式）．欄名を「音声入力」に，ライン入力も選べる旨の案内．push 31d069b（Ver 2026.10.14 19:09）・Pages 反映済
   - 設定変更での再起動はタブを使い回す／取れない・キャンセル・音声なし・共有停止は既定マイクに切り替えず止めて案内／タブ中は Issue #14 の自動切替を無効
   - 回帰テスト v2/tools/promo_video/test_tab_audio.mjs（getDisplayMedia はモック）ALL PASS．**実機の共有画面での確認はまだ**（先生は push を許可）
2. v1：伏字を v2 filter.js と同じ判定に（main.html の maskBadWords）．GoodList 復元の大小文字化け・404 本文の誤読込も解消．push 3b5caa8
3. 「困ったときは」（sayonari_web刷新 tips.html）に2項目追加・アップロード済
4. 返信：しゅりみんさん（先生送信済・確認済）／鬼灯ルルさん（先生送信済．ja 翻訳モデルの取得・読込不良が本命）
5. 宣伝 PV「神託」（51 秒）を作成 → 先生が X に投稿済み．.output/2026-10-14_jimakuChan_v2_divine.mp4・文案 .output/2026-10-14_神託PVとX文案.html
   - BGM：Suno「字幕ちゃん 神託」3:05 を WAV 取得（build/suno_shintaku.wav，9.5 秒目から）．Suno のダウンロード枠を 1 回使用（残 10）
   - 声：Gemini TTS Gacrux（tts_gemini.py，キーは FIT動画/.env）．効果音はオルガン・コーラス・ウィンドベル（鐘・ハープは不可）
   - 再生成：node build_divine.mjs --narr=gem --bgm=build/suno_shintaku.wav --bgmStart=9.5（--remix で音だけ）

## 次にやること
1. 先生の実機確認：タブ音声（字幕・翻訳／言語変更で選び直さない／共有停止）・v1 の伏字
2. Danny さんへの返信（英語文案 = .output/2026-10-14_タブ音声_v1伏字_返信文案.html）
3. 鬼灯ルルさんの結果待ち（chrome://on-device-translation-internals の表記は未確認）
4. 残：X 文案の Ver 差し替え，ジュノーンさんへのお礼（タブ音声も告知），ミュート操作の改善，test_ui.mjs のクラッシュ

## 注意
- **PV ツール（v2/tools/promo_video/ の build_divine.mjs・capture_divine.mjs・sfx_divine.py・video_divine.html・tts_gemini.py）は未コミット**（コミット可否を先生に未確認）
- Suno の作成フォームに，私の誤操作で曲参照（オーディオの影響 25%）が付いた状態が残っている可能性あり．次に Suno を使うとき確認
- getDisplayMedia はユーザー操作直後でないと使えない：自動開始時は「『開始』を押してタブを選んで」を出す仕様
