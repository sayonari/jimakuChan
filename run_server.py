"""jimakuChan 開発サーバ
  https://localhost:4443/  … 設定画面（マイク・Web Speech は https 必須）
  http://localhost:4444/   … OBS ブラウザソース用（OBS は自己署名 https を拒否するため http を併設）
"""
import ssl, threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 静かに

def serve_http():
    HTTPServer(('localhost', 4444), Handler).serve_forever()

threading.Thread(target=serve_http, daemon=True).start()
httpd = HTTPServer(('localhost', 4443), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile='./localhost.pem', keyfile='./localhost-key.pem')
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print('https://localhost:4443/  (settings)   http://localhost:4444/  (OBS overlay)')
httpd.serve_forever()
