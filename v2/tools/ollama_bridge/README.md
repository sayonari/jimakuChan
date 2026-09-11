# Ollama WebSocket ブリッジ (jimakuChan v2)

Python 3 の標準ライブラリのみで動作する，jimakuChan 向けの軽量 WebSocket ↔ Ollama プロキシです．外部パッケージ（`pip install`）は一切不要です．

## このツールが必要なケース
- **GitHub Pages（HTTPS）から jimakuChan を利用する場合**: ブラウザの Mixed Content 制約（HTTPS からローカル HTTP へのアクセス遮断）を回避できます．
- **Ollama の CORS 設定（`OLLAMA_ORIGINS`）を行わずに利用したい場合**: Python から Ollama への通信は通常のローカル HTTP 通信となるため，CORS 制約を受けません．

## 使い方

1. **Ollama を起動** しておきます（通常通り `ollama serve` またはデスクトップアプリ）
2. 本スクリプトを実行します：
   ```bash
   python3 v2/tools/ollama_bridge/ollama_bridge.py
   ```
3. jimakuChan の翻訳設定で：
   - 翻訳方法: **Ollama (ローカルAI)** を選択
   - Ollama 設定の URL: `ws://localhost:11435`
   - モデル名: 利用したいモデル（例: `qwen2.5:3b`, `qwen3.5:4b`）
