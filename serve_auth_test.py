import unittest

import serve

SECRET = b"test-secret"


class AccountsTest(unittest.TestCase):
    def test_parses_pairs_and_keeps_colons_in_password(self):
        self.assertEqual(
            serve.parse_accounts(" guest:guest , admin:a:b:c ,"),
            {"guest": "guest", "admin": "a:b:c"},
        )

    def test_default_accounts(self):
        self.assertEqual(
            serve.parse_accounts(serve.DEFAULT_ACCOUNTS),
            {"guest": "guest", "test1": "1234", "test2": "1234", "test3": "1234"},
        )

    def test_drops_entries_without_separator_or_id(self):
        self.assertEqual(serve.parse_accounts("nocolon,:pw,ok:1"), {"ok": "1"})

    def test_check_password(self):
        accounts = {"guest": "guest"}
        self.assertTrue(serve.check_password(accounts, "guest", "guest"))
        self.assertFalse(serve.check_password(accounts, "guest", "wrong"))
        self.assertFalse(serve.check_password(accounts, "nobody", "guest"))
        self.assertFalse(serve.check_password({"x": ""}, "y", "\0"))


class SessionTokenTest(unittest.TestCase):
    def test_round_trip(self):
        token = serve.sign_session("guest", SECRET, now=1000)
        self.assertEqual(serve.verify_session(token, SECRET, now=1001), "guest")

    def test_expires_after_ttl(self):
        token = serve.sign_session("guest", SECRET, now=1000, ttl=60)
        self.assertEqual(serve.verify_session(token, SECRET, now=1059), "guest")
        self.assertIsNone(serve.verify_session(token, SECRET, now=1060))

    def test_rejects_bad_signature_and_other_secret(self):
        token = serve.sign_session("guest", SECRET, now=1000)
        payload, signature = token.split(".")
        forged = serve.sign_session("admin", SECRET, now=1000).split(".")[0]
        self.assertIsNone(serve.verify_session(f"{forged}.{signature}", SECRET, now=1001))
        self.assertIsNone(serve.verify_session(f"{payload}.{signature[:-2]}xx", SECRET, now=1001))
        self.assertIsNone(serve.verify_session(token, b"other", now=1001))

    def test_rejects_malformed_tokens(self):
        for token in ("", "abc", ".", "abc.def"):
            self.assertIsNone(serve.verify_session(token, SECRET, now=1001))


class LimiterTest(unittest.TestCase):
    def test_blocks_after_limit_until_window_passes(self):
        limiter = serve.LoginLimiter(limit=3, window=60)
        for t in (0, 1, 2):
            self.assertFalse(limiter.blocked("1.2.3.4", t))
            limiter.fail("1.2.3.4", t)
        self.assertTrue(limiter.blocked("1.2.3.4", 3))
        self.assertFalse(limiter.blocked("5.6.7.8", 3))
        self.assertFalse(limiter.blocked("1.2.3.4", 61))


if __name__ == "__main__":
    unittest.main()
