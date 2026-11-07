"""dist/를 PORT(기본 8501)로 제공한다. 프록시가 /i/<토큰>/ 접두사를 그대로 넘기므로 여기서 벗긴다.

AIStream 서빙과 AgentStream 챗봇은 브라우저의 CORS 요청을 받지 않으므로 이 서버가 중계한다.
- POST /api/predict/solar: 서빙 판정을 {width, height, defects[{bbox, area}], source}로 정규화
- POST /api/classify: 자체 융합 서빙(ir 필수, rgb 선택) 판정을 {label, confidence, probs, irOnlyLabel, usedRgb, source}로 정규화
- GET /api/health: 서빙 상태와 AgentStream 설정 여부(키 값은 내보내지 않음)
- POST /api/agent/opinion: 점검 요약 JSON으로 종합의견 초안 요청(agentstream.py)
- GET /api/samples[?site=A]: 샘플 업로드 피커에 보여 줄 짝 사진 목록(같은 폴더의 samples.json, scripts/split_samples.py가 만든다)
- POST /api/align: multipart rgb(필수)·zoom(선택, 없으면 EXIF)으로 실화상을 열화상 틀로 리매핑한 JPEG를 돌려준다(scripts/align.py, numpy·pillow 필요)
- POST /api/login {id, pw}: APP_ACCOUNTS(id:pw,id2:pw2, 기본 guest:guest와 test1~test3:1234)와 대조해 sunset_session 쿠키(HMAC 서명, 12시간)를 준다.
  예전 이름 suntek_session으로 받은 쿠키도 읽기는 하므로 이름을 바꾸기 전에 로그인한 사람이 틕겨 나가지 않는다.
  실패는 IP마다 1분에 10번까지 받고 그 뒤로는 429. POST /api/logout은 쿠키를 지우고 GET /api/me는 {id} 또는 401.
  /api/login·/api/logout·/api/me·/api/health 밖의 /api/*는 세션이 없으면 401. 정적 파일과 /drone 사진은 공개다.
  서명 키는 SESSION_SECRET, 없으면 프로세스를 띄울 때마다 새로 만든다(재시작하면 다시 로그인).
설정은 같은 폴더의 .env(KEY=VALUE)나 환경변수로 받는다.

시연 사진은 빌드 밖 DATA_DIR(기본 같은 폴더의 data/)의 drone/에서 /drone/<파일>로 제공한다.
배포가 dist/를 갈아 끼워도 사진은 지워지지 않는다. 로컬 개발은 DATA_DIR=data-demo로 띄운다.
"""
import base64
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.parser import BytesParser
from email.policy import HTTP
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import agentstream

ROOT = Path(__file__).parent
SAMPLES_JSON = ROOT / "samples.json"
EXIF_IFD, EXIF_DIGITAL_ZOOM = 0x8769, 0xA404
sys.path.insert(0, str(ROOT / "scripts"))


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


load_env(ROOT / ".env")

DIST = ROOT / "dist"
DATA_DIR = (ROOT / os.environ.get("DATA_DIR", "data")).resolve()
PREFIX = re.compile(r"^/i/[^/]+")
COMPRESSIBLE = (".js", ".css", ".html", ".svg")
MAX_UPLOAD = 30 * 1024 * 1024
MAX_JSON = 1024 * 1024
IMMUTABLE = ("/assets/", "/drone/")

PORT = int(os.environ.get("PORT", "8501"))
SERVING_URL = os.environ.get(
    "SERVING_URL", "https://aiopen-serving.jntp-ax.or.kr/jntp-gpu/SV-e434a471"
).rstrip("/")
SERVING_KIND = os.environ.get("SERVING_KIND", "provided")
SERVING_SOLAR_PATH = os.environ.get(
    "SERVING_SOLAR_PATH", "/predict/solar" if SERVING_KIND == "provided" else "/predict"
)
FUSION_URL = os.environ.get(
    "FUSION_URL", "https://aiopen-serving.jntp-ax.or.kr/jntp-cpu/SV-29e9b912"
).rstrip("/")
FUSION_PATH = os.environ.get("FUSION_PATH", "/infer")
FUSION_LABELS = ("normal", "defect", "non_panel")

SESSION_COOKIE = "sunset_session"
LEGACY_SESSION_COOKIE = "suntek_session"  # 이름을 바꾸기 전 쿠키. 읽기만 하고 로그아웃 때 같이 지운다.
SESSION_COOKIES = (SESSION_COOKIE, LEGACY_SESSION_COOKIE)
SESSION_TTL = 12 * 3600
PUBLIC_API = {"/api/login", "/api/logout", "/api/me", "/api/health"}
LOGIN_FAIL_LIMIT, LOGIN_FAIL_WINDOW = 10, 60.0
UNAUTHORIZED = {"error": "로그인이 필요합니다."}


def parse_accounts(raw: str) -> dict[str, str]:
    """'id:pw,id2:pw2'를 {id: pw}로 푼다. 비밀번호에는 ':'가 들어가도 되고, 빈 항목과 id 없는 항목은 버린다."""
    accounts: dict[str, str] = {}
    for item in raw.split(","):
        user, sep, password = item.strip().partition(":")
        if sep and user.strip():
            accounts[user.strip()] = password
    return accounts


def check_password(accounts: dict[str, str], user: str, password: str) -> bool:
    # 없는 id도 같은 비교를 거쳐 응답 시간으로 id 존재 여부가 드러나지 않게 한다.
    expected = accounts.get(user)
    same = hmac.compare_digest((expected or "\0").encode(), password.encode())
    return expected is not None and same


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_session(user: str, secret: bytes, now: float, ttl: int = SESSION_TTL) -> str:
    payload = _b64(json.dumps({"id": user, "exp": int(now + ttl)}, separators=(",", ":")).encode())
    signature = _b64(hmac.new(secret, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def verify_session(token: str, secret: bytes, now: float) -> str | None:
    """서명이 맞고 만료 전이면 id를, 아니면 None을 돌려준다."""
    payload, sep, signature = token.partition(".")
    if not sep:
        return None
    expected = _b64(hmac.new(secret, payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected.encode(), signature.encode()):
        return None
    try:
        data = json.loads(_unb64(payload))
        user, exp = data["id"], int(data["exp"])
    except (ValueError, KeyError, TypeError):
        return None
    return user if isinstance(user, str) and now < exp else None


def cookie_user(header: str, secret: bytes, now: float, accounts: dict[str, str]) -> str | None:
    """Cookie 헤더에서 세션 쿠키(새 이름과 예전 이름)를 찾아 검증된 id를 돌려준다."""
    for part in header.split(";"):
        name, _, value = part.strip().partition("=")
        if name in SESSION_COOKIES and value:
            user = verify_session(value, secret, now)
            if user and user in accounts:
                return user
    return None


class LoginLimiter:
    """IP별 로그인 실패 시각을 window초 동안 기억해 limit번을 넘으면 막는다."""

    def __init__(self, limit: int = LOGIN_FAIL_LIMIT, window: float = LOGIN_FAIL_WINDOW):
        self.limit, self.window = limit, window
        self.failures: dict[str, list[float]] = {}
        self.lock = threading.Lock()

    def _recent(self, ip: str, now: float) -> list[float]:
        recent = [t for t in self.failures.get(ip, []) if now - t < self.window]
        if recent:
            self.failures[ip] = recent
        else:
            self.failures.pop(ip, None)
        return recent

    def blocked(self, ip: str, now: float) -> bool:
        with self.lock:
            return len(self._recent(ip, now)) >= self.limit

    def fail(self, ip: str, now: float) -> None:
        with self.lock:
            self.failures[ip] = self._recent(ip, now) + [now]


DEFAULT_ACCOUNTS = "guest:guest,test1:1234,test2:1234,test3:1234"
ACCOUNTS = parse_accounts(os.environ.get("APP_ACCOUNTS") or DEFAULT_ACCOUNTS)
SESSION_SECRET = (os.environ.get("SESSION_SECRET") or secrets.token_hex(32)).encode()
LOGIN_LIMITER = LoginLimiter()


class RelayError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@lru_cache(maxsize=32)
def compressed(path: str, mtime: float) -> bytes:
    return gzip.compress(Path(path).read_bytes(), 6)


@lru_cache(maxsize=4)
def samples(mtime: float) -> list[dict]:
    return json.loads(SAMPLES_JSON.read_text(encoding="utf-8"))


def parse_multipart(content_type: str, body: bytes) -> dict[str, bytes]:
    """multipart/form-data를 {필드이름: 바이트}로 풀어 준다. 표준 cgi 모듈이 없어지므로 email 파서를 쓴다."""
    if not content_type.startswith("multipart/form-data"):
        raise RelayError(400, "multipart/form-data로 보내 주세요.")
    message = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    fields: dict[str, bytes] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name:
            fields[str(name)] = part.get_payload(decode=True) or b""
    return fields


def align_module():
    try:
        import align
    except ImportError as error:
        raise RelayError(503, f"실화상 정렬 모듈을 불러오지 못했습니다(numpy·pillow 필요): {error}")
    return align


def call(request: urllib.request.Request, timeout: float) -> tuple[int, bytes]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def normalize_provided(data: dict) -> list[dict]:
    return [
        {"bbox": [int(v) for v in d["bbox"]], "area": int(d["area"])}
        for d in data.get("defects", [])
    ]


def normalize_yolo(data: dict) -> list[dict]:
    """YOLO 서빙의 xyxy 박스를 xywh로 바꾼다. 응답 형식은 todo 4 실측 뒤 확정한다."""
    items = next(
        (data[k] for k in ("defects", "detections", "predictions", "boxes") if isinstance(data.get(k), list)),
        [],
    )
    defects = []
    for item in items:
        box = (item.get("xyxy") or item.get("bbox") or item.get("box")) if isinstance(item, dict) else item
        if isinstance(box, dict):
            box = [box["x1"], box["y1"], box["x2"], box["y2"]]
        x1, y1, x2, y2 = (round(float(v)) for v in box[:4])
        w, h = max(x2 - x1, 0), max(y2 - y1, 0)
        defects.append({"bbox": [x1, y1, w, h], "area": w * h})
    return defects


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def translate_path(self, path):
        clean = urllib.parse.unquote(path.split("?", 1)[0].split("#", 1)[0])
        if clean.startswith("/drone/"):
            # 파일 이름만 받아 data 폴더 밖으로 나가지 못하게 한다.
            return str(DATA_DIR / "drone" / Path(clean).name)
        return super().translate_path(path)

    def send_response(self, code, message=None):
        self.status_code = code
        super().send_response(code, message)

    def do_GET(self):
        self.path = PREFIX.sub("", self.path) or "/"
        route, _, query = self.path.partition("?")
        if route.startswith("/api/") and route not in PUBLIC_API and not self.session_user():
            return self.send_json(401, UNAUTHORIZED)
        if route == "/api/health":
            return self.send_json(200, self.health())
        if route == "/api/me":
            user = self.session_user()
            return self.send_json(200, {"id": user}) if user else self.send_json(401, UNAUTHORIZED)
        if route.startswith("/api/") and route != "/api/samples":
            return self.send_json(404, {"error": "없는 경로입니다."})
        if route == "/api/samples":
            return self.send_json(200, self.sample_list(query))
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
        route = PREFIX.sub("", self.path).split("?", 1)[0]
        if route == "/api/login":
            return self.login()
        if route == "/api/logout":
            cleared = tuple(self.session_cookie("", 0, name) for name in SESSION_COOKIES)
            return self.send_json(200, {"ok": True}, cookies=cleared)
        if route.startswith("/api/") and not self.session_user():
            return self.send_json(401, UNAUTHORIZED)
        handlers = {
            "/api/predict/solar": self.predict_solar,
            "/api/classify": self.classify,
            "/api/agent/opinion": self.agent_opinion,
            "/api/align": self.align_rgb,
        }
        if route not in handlers:
            return self.send_json(404, {"error": "없는 경로입니다."})
        try:
            status, payload = handlers[route]()
        except RelayError as error:
            status, payload = error.status, {"error": str(error)}
        if isinstance(payload, bytes):
            return self.send_bytes(status, payload, "image/jpeg")
        self.send_json(status, payload)

    def session_user(self) -> str | None:
        return cookie_user(self.headers.get("Cookie", ""), SESSION_SECRET, time.time(), ACCOUNTS)

    def client_ip(self) -> str:
        # 팀 서버는 devopen 프록시 뒤에 있어 접속 주소가 늘 프록시다. 맨 앞 X-Forwarded-For를 쓴다.
        forwarded = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        return forwarded or self.client_address[0]

    def session_cookie(self, token: str, max_age: int, name: str = SESSION_COOKIE) -> str:
        cookie = f"{name}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Lax"
        if self.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower() == "https":
            cookie += "; Secure"
        return cookie

    def login(self):
        ip, now = self.client_ip(), time.time()
        if LOGIN_LIMITER.blocked(ip, now):
            return self.send_json(429, {"error": "로그인 시도가 너무 많습니다. 1분 뒤에 다시 시도해 주세요."})
        try:
            body = json.loads(self.read_body(4096, "요청이 너무 큽니다."))
            user, password = body["id"], body["pw"]
            if not isinstance(user, str) or not isinstance(password, str):
                raise TypeError
        except RelayError as error:
            return self.send_json(error.status, {"error": str(error)})
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {"error": "아이디와 비밀번호를 보내 주세요."})
        if not check_password(ACCOUNTS, user, password):
            LOGIN_LIMITER.fail(ip, now)
            return self.send_json(401, {"error": "아이디 또는 비밀번호가 맞지 않습니다."})
        token = sign_session(user, SESSION_SECRET, now)
        self.send_json(200, {"id": user}, cookies=(self.session_cookie(token, SESSION_TTL),))

    def sample_list(self, query: str) -> dict:
        if not SAMPLES_JSON.is_file():
            return {"samples": []}
        site = urllib.parse.parse_qs(query).get("site", [None])[0]
        rows = samples(SAMPLES_JSON.stat().st_mtime)
        return {"samples": [row for row in rows if not site or row["site"] == site]}

    def align_rgb(self) -> tuple[int, bytes]:
        body = self.read_body(MAX_UPLOAD, "실화상은 30MB 이하로 올려 주세요.")
        fields = parse_multipart(self.headers.get("Content-Type", ""), body)
        if not fields.get("rgb"):
            raise RelayError(400, "실화상 사진(rgb)을 보내 주세요.")
        align = align_module()
        from PIL import Image

        try:
            image = Image.open(io.BytesIO(fields["rgb"]))
            image.load()
        except Exception as error:  # PIL은 형식마다 다른 예외를 낸다.
            raise RelayError(400, f"실화상 사진을 읽지 못했습니다: {error}")
        try:
            zoom = float(fields["zoom"].decode()) if fields.get("zoom") else None
        except ValueError:
            raise RelayError(400, "zoom 값은 숫자여야 합니다.")
        if zoom is None:
            zoom = float(image.getexif().get_ifd(EXIF_IFD).get(EXIF_DIGITAL_ZOOM, 1.0))
        out = io.BytesIO()
        align.warp_rgb_to_ir(image, zoom).save(out, format="JPEG", quality=85)
        return 200, out.getvalue()

    def read_body(self, limit: int, message: str) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= limit:
            raise RelayError(413, message)
        return self.rfile.read(length)

    def predict_solar(self) -> tuple[int, dict]:
        body = self.read_body(MAX_UPLOAD, "이미지는 30MB 이하로 올려 주세요.")
        request = urllib.request.Request(
            SERVING_URL + SERVING_SOLAR_PATH,
            data=body,
            headers={"Content-Type": self.headers.get("Content-Type", "application/octet-stream")},
            method="POST",
        )
        try:
            status, raw = call(request, 180)
        except (urllib.error.URLError, TimeoutError) as error:
            raise RelayError(502, f"서빙 모델에 연결하지 못했습니다: {error}")
        try:
            data = json.loads(raw)
        except ValueError:
            raise RelayError(502, f"서빙 모델이 JSON이 아닌 응답을 보냈습니다(HTTP {status}).")
        if status != 200:
            detail = data.get("error") or data.get("detail") if isinstance(data, dict) else None
            raise RelayError(status, f"서빙 모델이 판정하지 못했습니다: {detail or f'HTTP {status}'}")
        try:
            defects = normalize_provided(data) if SERVING_KIND == "provided" else normalize_yolo(data)
        except (KeyError, TypeError, ValueError):
            raise RelayError(502, "서빙 모델 응답 형식을 해석하지 못했습니다.")
        return 200, {
            "width": int(data.get("width") or 0),
            "height": int(data.get("height") or 0),
            "defects": defects,
            "source": "provided" if SERVING_KIND == "provided" else "own",
        }

    def classify(self) -> tuple[int, dict]:
        if not int(self.headers.get("Content-Length") or 0):
            raise RelayError(400, "열화상 사진(ir)을 보내 주세요.")
        body = self.read_body(MAX_UPLOAD, "사진은 합쳐서 30MB 이하로 올려 주세요.")
        request = urllib.request.Request(
            FUSION_URL + FUSION_PATH,
            data=body,
            headers={"Content-Type": self.headers.get("Content-Type", "application/octet-stream")},
            method="POST",
        )
        try:
            status, raw = call(request, 90)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise RelayError(502, f"자체 융합 모델 서빙에 연결하지 못했습니다: {error}")
        try:
            data = json.loads(raw)
        except ValueError:
            raise RelayError(502, f"자체 융합 모델이 JSON이 아닌 응답을 보냈습니다(HTTP {status}).")
        if 400 <= status < 500:
            if status == 422:
                raise RelayError(422, "열화상 사진(ir)이 빠졌거나 요청 형식이 맞지 않습니다.")
            detail = data.get("detail") if isinstance(data, dict) else None
            raise RelayError(status, f"자체 융합 모델이 판정하지 못했습니다: {detail or f'HTTP {status}'}")
        if status != 200:
            raise RelayError(502, f"자체 융합 모델 서빙이 응답하지 못했습니다(HTTP {status}).")
        try:
            label = data["label"]
            if label not in FUSION_LABELS:
                raise ValueError(label)
            return 200, {
                "label": label,
                "confidence": float(data["confidence"]),
                "probs": {key: float(data["probs"][key]) for key in FUSION_LABELS},
                "irOnlyLabel": (data.get("ir_only") or {}).get("label"),
                "usedRgb": bool(data.get("used_rgb")),
                "source": "own",
            }
        except (KeyError, TypeError, ValueError):
            raise RelayError(502, "자체 융합 모델 응답 형식을 해석하지 못했습니다.")

    def health(self) -> dict:
        def reachable(url: str, accept: tuple[int, ...]) -> bool:
            try:
                status, _ = call(urllib.request.Request(url), 5)
                return status in accept
            except (urllib.error.URLError, TimeoutError, OSError):
                return False

        return {
            "serving": {"ok": reachable(SERVING_URL + "/health", (200,)), "kind": SERVING_KIND},
            "fusion": {"ok": reachable(FUSION_URL + "/health", (200, 404))},
            "agent": {"configured": agentstream.configured()},
        }

    def agent_opinion(self) -> tuple[int, dict]:
        if not agentstream.configured():
            raise RelayError(503, "AgentStream 연동 정보가 아직 없습니다.")
        try:
            summary = json.loads(self.read_body(MAX_JSON, "요청이 너무 큽니다."))
        except ValueError:
            raise RelayError(400, "요청 본문이 JSON이 아닙니다.")
        if not isinstance(summary, dict):
            raise RelayError(400, "요청 본문은 JSON 객체여야 합니다.")
        try:
            return 200, agentstream.draft_opinion(summary)
        except agentstream.ConfigError as error:
            raise RelayError(503, str(error))
        except agentstream.UpstreamError as error:
            raise RelayError(502, str(error))

    def send_json(self, status: int, payload: dict, cookies: tuple[str, ...] = ()):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_bytes(status, body, "application/json; charset=utf-8", cookies)

    def send_bytes(self, status: int, body: bytes, content_type: str, cookies: tuple[str, ...] = ()):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        for cookie in cookies:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.path = PREFIX.sub("", self.path) or "/"
        super().do_HEAD()

    def end_headers(self):
        immutable = getattr(self, "status_code", 200) == 200 and any(part in self.path for part in IMMUTABLE)
        self.send_header(
            "Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-cache"
        )
        super().end_headers()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
