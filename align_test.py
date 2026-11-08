"""scripts/align.py의 사진별 이동 탐색. numpy·pillow가 필요하다.

실행: uv run --no-project --with numpy --with pillow python -m unittest align_test
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / "scripts"))
import align  # noqa: E402

MARGIN = 48


def shifted_pair(dx: int, dy: int) -> align.Edges:
    """같은 장면에서 열화상 틀과, 내용이 (-dx, -dy)만큼 밀린 실화상 틀을 잘라 낸다."""
    rng = np.random.default_rng(0)
    scene = align.blur(rng.random((align.H + 2 * MARGIN, align.W + 2 * MARGIN), dtype=np.float32) * 255, 3.0)
    ir = scene[MARGIN : MARGIN + align.H, MARGIN : MARGIN + align.W]
    rgb = scene[MARGIN + dy : MARGIN + dy + align.H, MARGIN + dx : MARGIN + dx + align.W]
    return align.edges(ir, rgb, np.ones((align.H, align.W), dtype=bool))


class SearchShiftTest(unittest.TestCase):
    def test_recovers_known_translation(self):
        for dx, dy in ((13, -7), (-22, 5), (0, 0)):
            with self.subTest(dx=dx, dy=dy):
                self.assertEqual(align.search_shift(shifted_pair(dx, dy)), (dx, dy))

    def test_keeps_best_prior_unless_own_shift_clearly_better(self):
        e = shifted_pair(13, -7)
        self.assertEqual(align.choose_shift(e, (13, -7), ((0, 0),)), (13, -7))
        self.assertEqual(align.choose_shift(e, (13, -7), ((0, 0), (12, -7))), (12, -7))

    def test_ignores_own_shift_on_featureless_thermal(self):
        e = shifted_pair(13, -7)
        flat = align.Edges(np.zeros_like(e.ir), e.rgb, e.valid)
        self.assertEqual(align.choose_shift(flat, (13, -7), ((0, 0),)), (0, 0))


if __name__ == "__main__":
    unittest.main()
