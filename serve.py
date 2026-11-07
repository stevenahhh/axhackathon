"""dist/를 PORT(기본 8501)로 제공한다. 프록시가 /i/<토큰>/ 접두사를 그대로 넘기므로 여기서 벗긴다.

AIStream 서빙과 AgentStream 챗봇은 브라우저의 CORS 요청을 받지 않으므로 이 서버가 중계한다.
- POST /api/predict/solar: 서빙 판정을 {width, height, defects[{bbox, area}], source}로 정규화
- POST /api/classify: 자체 융합 서빙(ir 필수, rgb 선택) 판정을 {label, confidence, probs, irOnlyLabel, usedRgb, source}로 정규화
- GET /api/health: 서빙 상태와 AgentStream 설정 여부(키 값은 내보내지 않음)
- POST /api/agent/opinion: 점검 요약 JSON으로 종합의견 초안 요청
설정은 같은 폴더의 .env(KEY=VALUE)나 환경변수로 받는다.
"""
import gzip
import json
import os
import re
import urllib.error
import urllib.request
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent


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
PREFIX = re.compile(r"^/i/[^/]+")
COMPRESSIBLE = (".js", ".css", ".html", ".svg")
MAX_UPLOAD = 30 * 1024 * 1024
MAX_JSON = 1024 * 1024
IMMUTABLE = ("/assets/", "/samples/", "/drone/")

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
AGENT_BASE_URL = os.environ.get("AGENTSTREAM_BASE_URL", "").rstrip("/")
AGENT_API_KEY = os.environ.get("AGENTSTREAM_API_KEY", "")
AGENT_CHATBOT_ID = os.environ.get("AGENTSTREAM_CHATBOT_ID", "")
AGENT_WORKSPACE_ID = os.environ.get("AGENTSTREAM_WORKSPACE_ID", "")
AGENT_CHAT_PATH = os.environ.get("AGENTSTREAM_CHAT_PATH", "")
NUMBER = re.compile(r"\d+(?:\.\d+)?")


class RelayError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@lru_cache(maxsize=32)
def compressed(path: str, mtime: float) -> bytes:
    return gzip.compress(Path(path).read_bytes(), 6)


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


def agent_configured() -> bool:
    return all((AGENT_BASE_URL, AGENT_API_KEY, AGENT_CHATBOT_ID, AGENT_CHAT_PATH))


def extract_opinion(raw: bytes) -> dict:
    try:
        texts = [json.loads(raw)]
    except ValueError:
        texts = [raw.decode("utf-8", "replace")]
    while texts:
        node = texts.pop(0)
        if isinstance(node, dict):
            if isinstance(node.get("opinion"), str):
                followups = node.get("followups") or []
                return {"opinion": node["opinion"], "followups": [str(f) for f in followups][:3]}
            texts.extend(node.values())
        elif isinstance(node, list):
            texts.extend(node)
        elif isinstance(node, str) and "opinion" in node:
            start, end = node.find("{"), node.rfind("}")
            if 0 <= start < end:
                try:
                    texts.append(json.loads(node[start : end + 1]))
                except ValueError:
                    pass
    raise RelayError(502, "챗봇 응답에서 종합의견을 찾지 못했습니다.")


def numbers_of(text: str) -> set[str]:
    found = set()
    for token in NUMBER.findall(text):
        found.add(token)
        found.add(token.lstrip("0") or "0")
    return found


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def do_GET(self):
        self.path = PREFIX.sub("", self.path) or "/"
        if self.path.split("?", 1)[0] == "/api/health":
            return self.send_json(200, self.health())
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
        handlers = {
            "/api/predict/solar": self.predict_solar,
            "/api/classify": self.classify,
            "/api/agent/opinion": self.agent_opinion,
        }
        if route not in handlers:
            return self.send_json(404, {"error": "없는 경로입니다."})
        try:
            status, payload = handlers[route]()
        except RelayError as error:
            status, payload = error.status, {"error": str(error)}
        self.send_json(status, payload)

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
            "agent": {"configured": agent_configured()},
        }

    def agent_opinion(self) -> tuple[int, dict]:
        if not agent_configured():
            raise RelayError(503, "AgentStream 연동 정보가 아직 없습니다.")
        try:
            summary = json.loads(self.read_body(MAX_JSON, "요청이 너무 큽니다."))
        except ValueError:
            raise RelayError(400, "요청 본문이 JSON이 아닙니다.")
        message = json.dumps(summary, ensure_ascii=False)
        path = AGENT_CHAT_PATH.format(chatbot_id=AGENT_CHATBOT_ID, workspace_id=AGENT_WORKSPACE_ID)
        request = urllib.request.Request(
            AGENT_BASE_URL + path,
            data=json.dumps(
                {"chatbot_id": AGENT_CHATBOT_ID, "workspace_id": AGENT_WORKSPACE_ID, "message": message},
                ensure_ascii=False,
            ).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {AGENT_API_KEY}"},
            method="POST",
        )
        try:
            status, raw = call(request, 30)
        except (urllib.error.URLError, TimeoutError) as error:
            raise RelayError(502, f"AgentStream에 연결하지 못했습니다: {error}")
        if status != 200:
            raise RelayError(502, f"AgentStream이 응답하지 못했습니다(HTTP {status}).")
        result = extract_opinion(raw)
        if not numbers_of(result["opinion"]) <= numbers_of(message):
            raise RelayError(422, "입력에 없는 숫자가 포함되어 버렸습니다.")
        return 200, result

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        self.path = PREFIX.sub("", self.path) or "/"
        super().do_HEAD()

    def end_headers(self):
        immutable = any(part in self.path for part in IMMUTABLE)
        self.send_header(
            "Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-cache"
        )
        super().end_headers()


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
