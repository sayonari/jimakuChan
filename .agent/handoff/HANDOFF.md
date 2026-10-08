# HANDOFF - 2026-10-09

## やったこと
1. ローカルモデル混入対策（v1・v2）→ commit 0267232・push・Pages 反映済
   - クラウド選択時の警告，en-US 同時取得，無反応 20 秒検出→英語モデル誘導，詳しい人向け削除手順（chrome://settings/accessibility →「自動字幕起こし」オン → 言語一覧から削除）
2. v2：start(audioTrack) 対応（**未コミット**）
   - マイク選択・入力レベルメーター・音量/ノイズゲート・2つ目の入力ミックス・ミュート（Ctrl+Shift+M）・声の大きさで字幕が反応（見た目タブ「声の大きさ」）・Edge は 16kHz 化
   - 自動テスト v2/tools/promo_video/test_mic.mjs・test_audio_features.mjs ALL PASS．先生は「文字はデカくなりました」まで確認
3. ドパガキ PV＋X 文案：.output/2026-10-09_PVとTwitter文案.html／.output/2026-10-09_jimakuChan_v2_hype.mp4

## 次にやること（最優先）
1. **v2 の新機能を commit・push** → 済（Ver 2026.10.09 01:14）
2. 文案の Ver を push 時刻に差し替えて渡す → 先生が投稿
3. 報告者（ジュノーン先生）へお礼
4. 残：「困ったときは」（sayonari_web刷新）に項目追加，ミュートのもっと良い操作方法（先生「とりあえず今回はこれで」），区切り制御（自前 VAD）は見送り中

## 注意
- Ctrl+Shift+M は Windows Chrome で衝突の可能性．Edge 実機は未確認
- PV の音声は人の耳で未確認
