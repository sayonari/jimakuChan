#!/bin/bash
# jimakuChan_v2 — 整理済みデータを Google Drive（正本・アーカイブ）へ同期する
#
# 保存先: マイドライブ/nishimura/webpage/字幕ちゃん/jimakuChan_v2/
#   01_受領書類・メール/ ← .references/（利用者からの報告・素材）
#   02_成果物/           ← .output/（レポート HTML・紹介動画・UI キャプチャ）
#   03_記録/             ← .spec/ .agent/（設計・メモリ・ハンドオフ）
#
# ソースコードは GitHub（github.com/sayonari/jimakuChan）が正本のため同期しない．
# 作業の区切り（成果物完成・push・セッション終了）ごとに実行する．
set -u
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
DST="$HOME/Library/CloudStorage/GoogleDrive-sayonari@gmail.com/マイドライブ/nishimura/webpage/字幕ちゃん/jimakuChan_v2"

mkdir -p "$DST/01_受領書類・メール" "$DST/02_成果物" "$DST/03_記録"

RSYNC=(rsync -a --delete --exclude '.DS_Store')
"${RSYNC[@]}" "$SRC/.references/" "$DST/01_受領書類・メール/"
"${RSYNC[@]}" "$SRC/.output/"     "$DST/02_成果物/"
"${RSYNC[@]}" "$SRC/.spec/"       "$DST/03_記録/spec/"
"${RSYNC[@]}" --exclude 'scripts/' "$SRC/.agent/" "$DST/03_記録/agent/"

echo "同期しました → $DST"
du -sh "$DST" 2>/dev/null
