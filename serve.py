"""dist/를 8501 포트로 제공한다. 프록시가 /i/<토큰>/ 접두사를 그대로 넘기므로 여기서 벗긴다.

POST /api/predict/<wind|solar>는 AIStream 서빙으로 넘긴다. 서빙은 브라우저의 CORS 요청을 받지 않는다.
"""
import gzip
import json
import re
import urllib.error
import urllib.request
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIST = Path(__file__).parent / "dist"
PREFIX = re.compile(r"^/i/[^/]+")
COMPRESSIBLE = (".js", ".css", ".html", ".svg")
SERVING = "https://aiopen-serving.jntp-ax.or.kr/jntp-gpu/SV-e434a471"
PREDICT = re.compile(r"^/api/predict/(wind|solar)$")
MAX_UPLOAD = 30 * 1024 * 1024


@lru_cache(maxsize=32)
def compressed(path: str, mtime: float) -> bytes:
    return gzip.compress(Path(path).read_bytes(), 6)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def do_GET(self):
        self.path = PREFIX.sub("", self.path) or "/"
        file = Path(self.translate_path(self.path))
        if file.is_dir():
            file = file / "index.html"
        accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
        if file.suffix in COMPRESSIBLE and file.is_file() and accepts_gzip:
            body = compressed(str(file), file.stat().st_mtime)
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(file)))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        match = PREDICT.match(PREFIX.sub("", self.path))
        if not match:
            return self.send_json(404, {"error": "없는 경로입니다."})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_UPLOAD:
            return self.send_json(413, {"error": "이미지는 30MB 이하로 올려 주세요."})
        request = urllib.request.Request(
            f"{SERVING}/predict/{match.group(1)}",
            data=self.rfile.read(length),
            headers={"Content-Type": self.headers["Content-Type"]},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                status, body = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, body = error.code, error.read()
        except (urllib.error.URLError, TimeoutError) as error:
            return self.send_json(502, {"error": f"서빙 모델에 연결하지 못했습니다: {error}"})
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.path = PREFIX.sub("", self.path) or "/"
        super().do_HEAD()

    def end_headers(self):
        immutable = "/assets/" in self.path or "/samples/" in self.path
        self.send_header(
            "Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-cache"
        )
        super().end_headers()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8501), Handler).serve_forever()
