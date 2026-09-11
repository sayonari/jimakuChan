#!/usr/bin/env python3
"""
jimakuChan v2 – Ollama WebSocket ブリッジ
外部 pip パッケージ不要（Python 3 標準ライブラリのみで動作）

ブラウザ（GitHub Pages やローカル）からの WebSocket 接続を受け，
ローカルで稼働している Ollama (http://127.0.0.1:11434) へ HTTP リクエストを転送します．
これによりブラウザの CORS 制約および Mixed Content 制約を完全に回避できます．

使い方:
  python3 ollama_bridge.py
  (ポート 11435 で待機．jimakuChan の Ollama 設定で ws://localhost:11435 を指定)
"""

import asyncio
import base64
import hashlib
import json
import struct
import sys
import urllib.error
import urllib.request

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 11435
OLLAMA_BASE_URL = "http://127.0.0.1:11434"
OLLAMA_HTTP_URL = f"{OLLAMA_BASE_URL}/api/chat"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL}/api/tags"


def encode_ws_frame(message: str) -> bytes:
    data = message.encode("utf-8")
    length = len(data)
    frame = bytearray([0x81])  # FIN + text opcode
    if length <= 125:
        frame.append(length)
    elif length <= 65535:
        frame.append(126)
        frame.extend(struct.pack(">H", length))
    else:
        frame.append(127)
        frame.extend(struct.pack(">Q", length))
    frame.extend(data)
    return bytes(frame)


def call_ollama(payload: dict) -> dict:
    req_body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_HTTP_URL,
        data=req_body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            res_data = response.read().decode("utf-8")
            return json.loads(res_data)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Ollama HTTP {e.code}: {err_msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Ollama 接続失敗 (サーバーが起動しているか確認してください): {e.reason}")
    except Exception as e:
        raise RuntimeError(f"Ollama エラー: {e}")


def call_ollama_tags() -> list:
    req = urllib.request.Request(OLLAMA_TAGS_URL, headers={"Accept": "application/json"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=6) as response:
            res_data = response.read().decode("utf-8")
            data = json.loads(res_data)
            return [m.get("name") for m in data.get("models", []) if m.get("name")]
    except Exception as e:
        raise RuntimeError(f"Ollama モデル一覧の取得に失敗: {e}")


async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    # 1. ハンドシェイク読み込み
    try:
        header_data = b""
        while b"\r\n\r\n" not in header_data:
            chunk = await reader.read(1024)
            if not chunk:
                return
            header_data += chunk

        lines = header_data.decode("latin1").split("\r\n")
        headers = {}
        for line in lines[1:]:
            if ": " in line:
                k, v = line.split(": ", 1)
                headers[k.lower()] = v.strip()

        key = headers.get("sec-websocket-key")
        if not key:
            writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
            await writer.drain()
            writer.close()
            return

        accept_val = base64.b64encode(hashlib.sha1((key + WS_GUID).encode("utf-8")).digest()).decode("latin1")
        handshake_resp = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_val}\r\n\r\n"
        )
        writer.write(handshake_resp.encode("latin1"))
        await writer.drain()

        # 2. WebSocket フレーム処理ループ
        while True:
            head = await reader.readexactly(2)
            b1, b2 = head[0], head[1]
            opcode = b1 & 0x0F
            masked = (b2 & 0x80) != 0
            payload_len = b2 & 0x7F

            if opcode == 0x8:  # Close
                break
            if opcode == 0x9:  # Ping
                writer.write(bytes([0x8A, 0x00]))  # Pong
                await writer.drain()
                continue

            if payload_len == 126:
                ext = await reader.readexactly(2)
                payload_len = struct.unpack(">H", ext)[0]
            elif payload_len == 127:
                ext = await reader.readexactly(8)
                payload_len = struct.unpack(">Q", ext)[0]

            mask_key = await reader.readexactly(4) if masked else None
            payload = await reader.readexactly(payload_len)

            if masked:
                unmasked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
            else:
                unmasked = payload

            text_msg = unmasked.decode("utf-8", errors="replace")
            try:
                data = json.loads(text_msg)
                req_id = data.get("id")

                # Ollama への転送処理（スレッドプールでブロック防止）
                loop = asyncio.get_running_loop()
                action = data.get("action")
                if action in ("tags", "list_models"):
                    try:
                        models = await loop.run_in_executor(None, call_ollama_tags)
                        resp_frame = encode_ws_frame(json.dumps({"id": req_id, "models": models}))
                    except Exception as e:
                        resp_frame = encode_ws_frame(json.dumps({"id": req_id, "error": str(e)}))
                else:
                    try:
                        ollama_payload = {
                            "model": data.get("model", "qwen2.5:3b"),
                            "messages": data.get("messages", []),
                            "stream": False,
                            "think": data.get("think", False),
                            "options": data.get("options", {"temperature": 0.3})
                        }
                        res = await loop.run_in_executor(None, call_ollama, ollama_payload)
                        content = (res.get("message") or {}).get("content", "") or res.get("response", "")
                        resp_frame = encode_ws_frame(json.dumps({"id": req_id, "response": content}))
                    except Exception as e:
                        resp_frame = encode_ws_frame(json.dumps({"id": req_id, "error": str(e)}))

                writer.write(resp_frame)
                await writer.drain()
            except json.JSONDecodeError:
                continue

    except (asyncio.IncompleteReadError, ConnectionResetError):
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT)
    print("=" * 60)
    print(f" jimakuChan Ollama WebSocket Bridge 起動完了")
    print(f" - WebSocket 待受: ws://{LISTEN_HOST}:{LISTEN_PORT}")
    print(f" - Ollama 転送先 : {OLLAMA_HTTP_URL}")
    print("=" * 60)
    print("jimakuChan の翻訳設定で以下を入力してください：")
    print(f"  URL: ws://localhost:{LISTEN_PORT}")
    print("※ 終了するには Ctrl+C を押してください")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nブリッジを終了しました．")
        sys.exit(0)
