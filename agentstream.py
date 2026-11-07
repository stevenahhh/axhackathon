"""AgentStream 챗봇(썬텍점검비서_2조)으로 종합의견 초안을 받는다. 표준 라이브러리만 쓴다.

호출 순서(경로는 AGENTSTREAM_BASE_URL 기준, 헤더 X-API-Key):
1. POST /open/v1/chatbots/{chatbot_id}/sessions {"query"} -> 201, 최상위 session_id
2. POST /open/v1/chat-sessions/{session_id}/messages {"message"} -> application/x-ndjson
   assistant.delta의 text를 이어 붙이고 turn.completed가 와야 성공으로 본다.
메시지에 JSON 객체가 들어가면 챗봇이 표 입력으로 오인해 실패하므로 요약을 key=value 줄로 보낸다.
설정은 호출할 때 환경변수에서 읽는다. 키 값은 어디에도 내보내지 않는다.
"""
import json
import os
import re
import time
import urllib.error
import urllib.request

TIMEOUT = 30.0
SESSION_PATH = "/open/v1/chatbots/{chatbot_id}/sessions"
DEFAULT_CHAT_PATH = "/open/v1/chat-sessions/{session_id}/messages"
NUMBER = re.compile(r"\d+(?:\.\d+)?")
YM = re.compile(r"^(\d{4})-(\d{1,2})$")
FIXED_NUMBERS = {"5", "10", "100", "1", "2", "3", "4", "6"}
LEAD = "점검 요약으로 종합의견 초안을 작성해 주세요."
THERMAL_LEAD = "thermal 항목이 있으면 열화상 측정기록표용 thermal_opinion도 작성해 주세요."


class ConfigError(Exception):
    """연동 정보(주소, 챗봇 id, 키)가 없다. 503으로 응답한다."""


class UpstreamError(Exception):
    """AgentStream 호출이 실패했거나 응답을 해석하지 못했다. 502로 응답한다."""


def settings() -> dict:
    return {
        "base": os.environ.get("AGENTSTREAM_BASE_URL", "").rstrip("/"),
        "chatbot": os.environ.get("AGENTSTREAM_CHATBOT_ID", ""),
        "key": os.environ.get("AGENTSTREAM_API_KEY", ""),
        "chat_path": os.environ.get("AGENTSTREAM_CHAT_PATH", "") or DEFAULT_CHAT_PATH,
    }


def configured() -> bool:
    config = settings()
    return all((config["base"], config["chatbot"], config["key"]))


def render_message(payload: dict) -> str:
    """요약을 중괄호 없는 key=value 줄로 바꾼다. 중첩 dict는 한 줄, dict 목록은 항목마다 한 줄."""

    def flat(value) -> str:
        if isinstance(value, dict):
            return ", ".join(f"{k}={flat(v)}" for k, v in value.items())
        if isinstance(value, list):
            return ", ".join(flat(v) for v in value)
        if value is None:
            return "-"
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value).replace("{", "(").replace("}", ")").replace("\n", " ")

    lines = [LEAD, "task=opinion_draft"]
    for key, value in payload.items():
        if isinstance(value, dict):
            lines.append(f"{key}: {flat(value)}")
        elif isinstance(value, list) and any(isinstance(item, dict) for item in value):
            lines.extend(f"{key}_{index}: {flat(item)}" for index, item in enumerate(value, 1))
        else:
            lines.append(f"{key}={flat(value)}")
    if payload.get("thermal"):
        lines.append(THERMAL_LEAD)
    return "\n".join(lines)


def delta_text(event: dict) -> str:
    content = event.get("content")
    if content is None and isinstance(event.get("data"), dict):
        content = event["data"].get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type", "text") == "text"
        )
    return ""


def read_stream(lines, deadline: float) -> str:
    """NDJSON 줄을 읽어 assistant.delta 문장을 이어 붙인다. turn.completed가 없으면 실패로 본다."""
    seen, parts = set(), []
    for raw in lines:
        if time.monotonic() > deadline:
            raise UpstreamError("AgentStream 응답이 30초 안에 끝나지 않았습니다.")
        line = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except ValueError:
            raise UpstreamError("AgentStream이 잘못된 스트림 줄을 보냈습니다.")
        if not isinstance(event, dict):
            continue
        event_id = event.get("event_id")
        if event_id is not None:
            if event_id in seen:
                continue
            seen.add(event_id)
        kind = event.get("type") or event.get("event")
        if kind == "assistant.delta":
            parts.append(delta_text(event))
        elif kind in ("turn.failed", "tool.failed"):
            raise UpstreamError(f"AgentStream이 답변을 만들지 못했습니다({kind}).")
        elif kind == "turn.completed":
            return "".join(parts)
    raise UpstreamError("AgentStream 답변이 완료 신호 없이 끝났습니다.")


def extract_json(text: str) -> dict:
    decoder = json.JSONDecoder()
    start = text.find("{")
    while start >= 0:
        try:
            value, _ = decoder.raw_decode(text, start)
        except ValueError:
            value = None
        if isinstance(value, dict) and isinstance(value.get("opinion"), str):
            return value
        start = text.find("{", start + 1)
    raise UpstreamError("챗봇 답변에서 종합의견 JSON을 찾지 못했습니다.")


def canonical(token: str) -> str:
    if "." in token:
        token = token.rstrip("0").rstrip(".")
    whole, dot, frac = token.partition(".")
    return (whole.lstrip("0") or "0") + dot + frac


def allowed_numbers(payload: dict) -> set[str]:
    allowed = {canonical(t) for t in NUMBER.findall(json.dumps(payload, ensure_ascii=False))}
    allowed |= FIXED_NUMBERS
    match = YM.match(str(payload.get("ym", "")))
    if match:
        allowed |= {canonical(match.group(1)), canonical(match.group(2))}
    return allowed


def number_warnings(texts: list[str], payload: dict) -> list[str]:
    allowed = allowed_numbers(payload)
    extra = []
    for text in texts:
        for token in NUMBER.findall(text):
            number = canonical(token)
            if number not in allowed and number not in extra:
                extra.append(number)
    return [f"입력에 없는 숫자가 있습니다: {', '.join(extra)}"] if extra else []


def post(urlopen, url: str, body: dict, key: str, deadline: float, accept: str):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise UpstreamError("AgentStream 응답이 30초 안에 끝나지 않았습니다.")
    request = urllib.request.Request(
        url,
        data=json.dumps(body, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json", "Accept": accept, "X-API-Key": key},
        method="POST",
    )
    try:
        return urlopen(request, timeout=remaining)
    except urllib.error.HTTPError as error:
        raise UpstreamError(f"AgentStream이 요청을 거절했습니다(HTTP {error.code}).")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise UpstreamError(f"AgentStream에 연결하지 못했습니다: {error}")


def draft_opinion(payload: dict, urlopen=urllib.request.urlopen) -> dict:
    config = settings()
    if not configured():
        raise ConfigError("AgentStream 연동 정보가 아직 없습니다.")
    deadline = time.monotonic() + TIMEOUT
    message = render_message(payload)
    try:
        with post(
            urlopen,
            config["base"] + SESSION_PATH.format(chatbot_id=config["chatbot"]),
            {"query": LEAD},
            config["key"],
            deadline,
            "application/json",
        ) as response:
            session_id = json.loads(response.read()).get("session_id")
        if not session_id:
            raise UpstreamError("AgentStream이 세션 id를 주지 않았습니다.")
        with post(
            urlopen,
            config["base"] + config["chat_path"].format(session_id=session_id),
            {"message": message},
            config["key"],
            deadline,
            "application/x-ndjson",
        ) as response:
            text = read_stream(response, deadline)
    except (TimeoutError, OSError) as error:
        raise UpstreamError(f"AgentStream 응답이 늦거나 끊겼습니다: {error}")
    except (ValueError, AttributeError):
        raise UpstreamError("AgentStream 세션 응답을 해석하지 못했습니다.")

    data = extract_json(text)
    result = {
        "opinion": data["opinion"].strip(),
        "followups": [str(item) for item in data.get("followups") or []][:3],
    }
    if isinstance(data.get("thermal_opinion"), str) and data["thermal_opinion"].strip():
        result["thermal_opinion"] = data["thermal_opinion"].strip()
    texts = [result["opinion"], *result["followups"], result.get("thermal_opinion", "")]
    result["warnings"] = number_warnings(texts, payload)
    return result
