import io
import json
import os
import unittest
from unittest import mock

import agentstream

ENV = {
    "AGENTSTREAM_BASE_URL": "https://agent.example/agentstream",
    "AGENTSTREAM_CHATBOT_ID": "bot-1",
    "AGENTSTREAM_API_KEY": "test-key",
    "AGENTSTREAM_CHAT_PATH": "/open/v1/chat-sessions/{session_id}/messages",
}

PAYLOAD = {
    "site_alias": "A현장",
    "ym": "2026-11",
    "photos_total": 30,
    "confirmed": 5,
    "top_photos": [{"seq": "0142", "count": 15, "area_px": 2152}],
    "previous_month": {"ym": "2026-10", "confirmed": 3},
}


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, status: int = 200):
        super().__init__(body)
        self.status = status


def ndjson(*events: dict) -> bytes:
    return b"".join(json.dumps(e, ensure_ascii=False).encode() + b"\n" for e in events)


class FakeTransport:
    def __init__(self, stream: bytes):
        self.stream = stream
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append(request)
        if request.full_url.endswith("/sessions"):
            return FakeResponse(json.dumps({"session_id": "s-9"}).encode(), 201)
        return FakeResponse(self.stream)


class StreamTest(unittest.TestCase):
    def test_concatenates_deltas_skipping_duplicates_and_non_text_blocks(self):
        lines = ndjson(
            {"type": "assistant.delta", "event_id": "1", "content": "앞"},
            {"type": "assistant.delta", "event_id": "1", "content": "앞"},
            {"type": "assistant.delta", "event_id": "2", "content": [
                {"type": "thinking", "text": "숨김"},
                {"type": "text", "text": "뒤"},
            ]},
            {"type": "turn.completed", "event_id": "3"},
        ).splitlines(keepends=True)
        self.assertEqual(agentstream.read_stream(lines, float("inf")), "앞뒤")

    def test_stream_without_completion_fails(self):
        lines = ndjson({"type": "assistant.delta", "content": "중간"}).splitlines()
        with self.assertRaises(agentstream.UpstreamError):
            agentstream.read_stream(lines, float("inf"))

    def test_turn_failed_fails(self):
        lines = ndjson({"type": "turn.failed"}).splitlines()
        with self.assertRaises(agentstream.UpstreamError):
            agentstream.read_stream(lines, float("inf"))


class ExtractTest(unittest.TestCase):
    def test_reads_first_opinion_object_in_fenced_text(self):
        text = '초안입니다.\n```json\n{"opinion": "현장 확인 필요", "followups": ["a"]}\n```\n{"opinion": "둘째"}'
        self.assertEqual(agentstream.extract_json(text)["opinion"], "현장 확인 필요")

    def test_text_without_json_fails(self):
        with self.assertRaises(agentstream.UpstreamError):
            agentstream.extract_json("JSON은 객체 행 배열로 제공해 주세요.")


class NumberRuleTest(unittest.TestCase):
    def test_payload_numbers_fixed_numbers_and_ym_are_allowed(self):
        text = "0142번 사진 5장, 지난달 3장, 2026년 11월, 100% 확인, 10℃, 6개 항목"
        self.assertEqual(agentstream.number_warnings([text], PAYLOAD), [])

    def test_unknown_number_becomes_warning(self):
        warnings = agentstream.number_warnings(["핫스팟 7장과 12.5℃"], PAYLOAD)
        self.assertEqual(len(warnings), 1)
        self.assertIn("7", warnings[0])
        self.assertIn("12.5", warnings[0])


class DraftOpinionTest(unittest.TestCase):
    def test_full_flow_sends_flat_message_and_returns_opinion_with_warnings(self):
        reply = '```json\n{"opinion": "핫스팟 9장 확인", "followups": ["0142번 확인"], "thermal_opinion": "온도차 10℃"}\n```'
        transport = FakeTransport(ndjson(
            {"type": "assistant.delta", "event_id": "a", "content": reply[:20]},
            {"type": "assistant.delta", "event_id": "b", "content": reply[20:]},
            {"type": "turn.completed", "event_id": "c"},
        ))
        with mock.patch.dict(os.environ, ENV):
            result = agentstream.draft_opinion(PAYLOAD, urlopen=transport)

        self.assertEqual(result["opinion"], "핫스팟 9장 확인")
        self.assertEqual(result["thermal_opinion"], "온도차 10℃")
        self.assertEqual(result["warnings"], ["입력에 없는 숫자가 있습니다: 9"])
        session, message = transport.requests
        self.assertEqual(session.full_url, "https://agent.example/agentstream/open/v1/chatbots/bot-1/sessions")
        self.assertEqual(message.full_url, "https://agent.example/agentstream/open/v1/chat-sessions/s-9/messages")
        self.assertEqual(message.get_header("X-api-key"), "test-key")
        sent = json.loads(message.data)["message"]
        self.assertNotIn("{", sent)
        self.assertIn("top_photos_1: seq=0142, count=15, area_px=2152", sent)

    def test_missing_key_raises_config_error(self):
        env = {**ENV, "AGENTSTREAM_API_KEY": ""}
        with mock.patch.dict(os.environ, env):
            self.assertFalse(agentstream.configured())
            with self.assertRaises(agentstream.ConfigError):
                agentstream.draft_opinion(PAYLOAD, urlopen=FakeTransport(b""))


if __name__ == "__main__":
    unittest.main()
