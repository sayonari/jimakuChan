#!/usr/bin/env python3
"""jimakuChan – WhisperLiveKit ランチャ（Windows / macOS / Linux 共通）

  python whisper_launcher.py setup   [--venv PATH]        # venv 構築 + whisperlivekit インストール
  python whisper_launcher.py run     [--dry-run]          # サーバ起動（+ モデル切替の制御 API）
  python whisper_launcher.py start   [--no-whisper] [--no-ollama] [--dry-run]
  python whisper_launcher.py model   NAME                 # 使用モデルを設定（次回起動に反映）
  python whisper_launcher.py doctor

設定は whisperlivekit.env（無ければ既定値．setup が作成）．
WLK はモデルをプロセス起動時に読み込むため，アプリから切り替えられるよう
127.0.0.1 に小さな制御 API（GET /wlk/status, POST /wlk/config）を併設する．
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent
BRIDGE = TOOLS / "ollama_bridge" / "ollama_bridge.py"
ENV_FILE = HERE / "whisperlivekit.env"

MODELS = ["tiny", "tiny.en", "base", "base.en", "small", "small.en",
          "medium", "medium.en", "large-v2", "large-v3", "large-v3-turbo"]
POLICIES = ["simulstreaming", "localagreement"]

DEFAULTS = {
    "WHISPER_VENV": "",
    "WHISPER_BIND": "127.0.0.1",
    "WHISPER_PORT": "11437",
    "WHISPER_MODEL": "small",
    "WHISPER_LANGUAGE": "auto",
    "WHISPER_BACKEND": "auto",
    "WHISPER_BACKEND_POLICY": "simulstreaming",
    "WHISPER_PAUSE_SEGMENTATION_SECONDS": "2.0",
    "WHISPER_API_TOKEN": "",
    "WHISPER_CONTROL_PORT": "11436",
    "OLLAMA_BRIDGE_PORT": "11435",
}


def load_env():
    cfg = dict(DEFAULTS)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() in cfg:
                cfg[k.strip()] = v.strip()
    return cfg


def save_env(cfg):
    lines = ["# jimakuChan WhisperLiveKit 設定（whisper_launcher.py が作成．git 管理外）"]
    lines += [f"{k}={cfg.get(k, '')}" for k in DEFAULTS]
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def default_venv():
    return str(Path.home() / ".venvs" / "whisperlivekit")


def _expand(p):
    return os.path.expanduser(os.path.expandvars(str(p)))


def venv_python(venv):
    if not venv:
        return None
    v = Path(_expand(venv))
    for p in (v / "Scripts" / "python.exe", v / "bin" / "python", v / "bin" / "python3"):
        if p.exists():
            return p
    return None


def venv_script(venv, name):
    if not venv:
        return None
    v = Path(_expand(venv))
    for p in (v / "Scripts" / f"{name}.exe", v / "Scripts" / name, v / "bin" / name):
        if p.exists():
            return p
    return None


def find_base_python():
    # whisperlivekit は >=3.11,<3.14
    for name in ("3.12", "3.11", "3.13"):
        p = shutil.which(f"python{name}")
        if p:
            return p
    return sys.executable


def server_args(cfg):
    args = [
        "serve",
        "--model", cfg["WHISPER_MODEL"],
        "--language", cfg["WHISPER_LANGUAGE"],
        "--host", cfg["WHISPER_BIND"],
        "--port", str(cfg["WHISPER_PORT"]),
        "--backend-policy", cfg["WHISPER_BACKEND_POLICY"],
        "--pcm-input",
    ]
    if cfg.get("WHISPER_BACKEND") and cfg["WHISPER_BACKEND"] != "auto":
        args += ["--backend", cfg["WHISPER_BACKEND"]]
    if cfg.get("WHISPER_PAUSE_SEGMENTATION_SECONDS"):
        args += ["--pause-segmentation-seconds", cfg["WHISPER_PAUSE_SEGMENTATION_SECONDS"]]
    if cfg.get("WHISPER_API_TOKEN"):
        args += ["--api-token", cfg["WHISPER_API_TOKEN"]]
    return args


def wlk_command(cfg):
    wlk = venv_script(cfg.get("WHISPER_VENV") or default_venv(), "wlk")
    if not wlk:
        sys.exit("whisperlivekit(venv) が見つかりません．先に: python whisper_launcher.py setup")
    return [str(wlk)] + server_args(cfg)


class Manager:
    """WhisperLiveKit プロセスを保持し，制御 API から再起動できるようにする．"""
    def __init__(self, cfg):
        self.cfg = cfg
        self.proc = None
        self.lock = threading.Lock()

    def start(self):
        with self.lock:
            if self.proc and self.proc.poll() is None:
                return self.proc
            self.proc = subprocess.Popen(wlk_command(self.cfg))
            return self.proc

    def restart(self, model=None, policy=None):
        with self.lock:
            if model:
                self.cfg["WHISPER_MODEL"] = model
            if policy:
                self.cfg["WHISPER_BACKEND_POLICY"] = policy
            if model or policy:
                save_env(self.cfg)
            old = self.proc
            new = subprocess.Popen(wlk_command(self.cfg))
            self.proc = new
            if old is not None and old.poll() is None:
                old.terminate()
                try:
                    old.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    old.kill()
            return new

    def wait_forever(self):
        """現在のプロセスを待つ．再起動で差し替わったら新しい方を待ち直す．"""
        while True:
            proc = self.proc
            if proc is None:
                return
            proc.wait()
            if self.proc is proc:
                return

    def status(self):
        proc = self.proc
        running = bool(proc and proc.poll() is None)
        try:
            silence_ms = int(float(self.cfg.get("WHISPER_PAUSE_SEGMENTATION_SECONDS") or 0) * 1000)
        except (TypeError, ValueError):
            silence_ms = 0
        return {
            "running": running,
            "pid": proc.pid if (proc is not None and running) else None,
            "model": self.cfg.get("WHISPER_MODEL"),
            "policy": self.cfg.get("WHISPER_BACKEND_POLICY"),
            "language": self.cfg.get("WHISPER_LANGUAGE"),
            "bind": self.cfg.get("WHISPER_BIND"),
            "port": self.cfg.get("WHISPER_PORT"),
            "pauseSegmentationSeconds": self.cfg.get("WHISPER_PAUSE_SEGMENTATION_SECONDS"),
            "silenceMs": silence_ms,
            "models": MODELS,
            "policies": POLICIES,
            "wsUrl": f"ws://{self.cfg.get('WHISPER_BIND')}:{self.cfg.get('WHISPER_PORT')}/asr",
        }


def control_handler_class(manager):
    class ControlHandler(BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def _json(self, obj, code=200):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.end_headers()

        def do_GET(self):
            if self.path.split("?")[0] == "/wlk/status":
                self._json(manager.status())
            else:
                self._json({"error": "not found"}, 404)

        def do_POST(self):
            if self.path.split("?")[0] != "/wlk/config":
                self._json({"error": "not found"}, 404)
                return
            try:
                length = int(self.headers.get("Content-Length") or 0)
                data = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                self._json({"error": "bad request"}, 400)
                return
            model = data.get("model")
            policy = data.get("policy")
            if model and model not in MODELS:
                self._json({"error": f"unknown model: {model}"}, 400)
                return
            if policy and policy not in POLICIES:
                self._json({"error": f"unknown policy: {policy}"}, 400)
                return
            try:
                manager.restart(model=model, policy=policy)
            except SystemExit as e:
                self._json({"error": str(e)}, 500)
                return
            self._json({"ok": True, **manager.status()})

        def log_message(self, format, *args):
            pass

    return ControlHandler


def start_control(manager, port):
    httpd = ThreadingHTTPServer(("127.0.0.1", int(port)), control_handler_class(manager))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def cmd_setup(cfg, a):
    venv = a.venv or cfg.get("WHISPER_VENV") or default_venv()
    base = find_base_python()
    print(f"venv を作成: {venv}  (base: {base})")
    subprocess.run([base, "-m", "venv", _expand(venv)], check=True)
    vpy = venv_python(venv) or (Path(_expand(venv)) / "bin" / "python")
    subprocess.run([str(vpy), "-m", "pip", "install", "--upgrade", "pip"], check=True)
    subprocess.run([str(vpy), "-m", "pip", "install", "whisperlivekit"], check=True)
    cfg["WHISPER_VENV"] = _expand(venv)
    save_env(cfg)
    print("完了．次: python whisper_launcher.py run")


def _apply_overrides(cfg, a):
    for key, attr in (("WHISPER_BIND", "bind"), ("WHISPER_PORT", "port"), ("WHISPER_MODEL", "model"),
                      ("WHISPER_LANGUAGE", "language"), ("WHISPER_BACKEND", "backend"),
                      ("WHISPER_BACKEND_POLICY", "policy"), ("WHISPER_VENV", "venv"),
                      ("WHISPER_API_TOKEN", "api_token"), ("WHISPER_CONTROL_PORT", "control_port"),
                      ("WHISPER_PAUSE_SEGMENTATION_SECONDS", "pause_segmentation")):
        v = getattr(a, attr, None)
        if v:
            cfg[key] = str(v)


def cmd_run(cfg, a):
    manager = Manager(cfg)
    print(f"WhisperLiveKit 起動: {' '.join(wlk_command(cfg))}")
    if a.dry_run:
        return
    if not a.no_control:
        start_control(manager, cfg.get("WHISPER_CONTROL_PORT") or 11436)
        print(f"制御 API: http://127.0.0.1:{cfg.get('WHISPER_CONTROL_PORT') or 11436}/wlk/status")
    try:
        manager.start()
        manager.wait_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if manager.proc and manager.proc.poll() is None:
            manager.proc.terminate()


def cmd_start(cfg, a):
    manager = Manager(cfg)
    bridge = None
    httpd = None
    try:
        if not a.no_whisper:
            print(f"WhisperLiveKit 起動: {' '.join(wlk_command(cfg))}")
            if not a.dry_run:
                if not a.no_control:
                    httpd = start_control(manager, cfg.get("WHISPER_CONTROL_PORT") or 11436)
                manager.start()
        if not a.no_ollama:
            if BRIDGE.exists():
                if a.dry_run:
                    print(f"Ollama bridge: {sys.executable} {BRIDGE}")
                else:
                    bridge = subprocess.Popen([sys.executable, str(BRIDGE)])
            else:
                print(f"Ollama ブリッジが見つかりません: {BRIDGE}", file=sys.stderr)
        if a.dry_run:
            return
        if a.no_whisper and bridge is None:
            sys.exit("起動するものがありません")
        print("起動中．Ctrl+C で停止します．")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        if manager.proc and manager.proc.poll() is None:
            manager.proc.terminate()
        if bridge is not None and bridge.poll() is None:
            bridge.terminate()
        if httpd is not None:
            httpd.shutdown()


def cmd_model(cfg, name):
    if name not in MODELS:
        sys.exit(f"不明なモデル: {name}\n利用可能: {', '.join(MODELS)}")
    cfg["WHISPER_MODEL"] = name
    save_env(cfg)
    print(f"WHISPER_MODEL={name} に設定しました．サーバを再起動すると反映されます．")


def cmd_doctor(cfg):
    wlk = venv_script(cfg.get("WHISPER_VENV") or default_venv(), "wlk")
    print(f"OS                : {sys.platform}")
    print(f"Python            : {sys.version.split()[0]} ({sys.executable})")
    print(f"venv              : {cfg.get('WHISPER_VENV') or default_venv()}")
    print(f"wlk               : {wlk or 'なし（未インストール）'}")
    print(f"ollama bridge     : {'あり' if BRIDGE.exists() else 'なし'} ({BRIDGE})")
    print(f"設定              : bind={cfg['WHISPER_BIND']} port={cfg['WHISPER_PORT']} model={cfg['WHISPER_MODEL']} "
          f"lang={cfg['WHISPER_LANGUAGE']} policy={cfg['WHISPER_BACKEND_POLICY']}")
    print(f"WS URL            : ws://{cfg['WHISPER_BIND']}:{cfg['WHISPER_PORT']}/asr")
    print(f"制御 API          : http://127.0.0.1:{cfg['WHISPER_CONTROL_PORT']}/wlk/status")


def main():
    p = argparse.ArgumentParser(description="WhisperLiveKit ランチャ (jimakuChan)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("setup")
    s.add_argument("--venv")

    for name in ("run", "start"):
        c = sub.add_parser(name)
        c.add_argument("--bind"); c.add_argument("--port"); c.add_argument("--model")
        c.add_argument("--language"); c.add_argument("--backend"); c.add_argument("--policy")
        c.add_argument("--venv"); c.add_argument("--api-token", dest="api_token")
        c.add_argument("--control-port", dest="control_port")
        c.add_argument("--no-control", action="store_true")
        c.add_argument("--pause-segmentation", dest="pause_segmentation")
        c.add_argument("--dry-run", action="store_true")
        if name == "start":
            c.add_argument("--no-whisper", action="store_true")
            c.add_argument("--no-ollama", action="store_true")

    m = sub.add_parser("model")
    m.add_argument("name")

    sub.add_parser("doctor")

    a = p.parse_args()
    cfg = load_env()
    if a.cmd != "doctor":
        _apply_overrides(cfg, a)

    if a.cmd == "setup":
        cmd_setup(cfg, a)
    elif a.cmd == "run":
        cmd_run(cfg, a)
    elif a.cmd == "start":
        cmd_start(cfg, a)
    elif a.cmd == "model":
        cmd_model(cfg, a.name)
    else:
        cmd_doctor(cfg)


if __name__ == "__main__":
    main()
