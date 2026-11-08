"""실화상을 열화상 틀(640x512)로 리매핑한다. 계수는 align_params.json(.omo/scripts/fit_align.py가 추정).

사상(열화상 픽셀 u,v -> 실화상 픽셀 X,Y)은 fit_align.py와 같다:
  x=(u-cx)/f, y=(v-cy)/f, r2=x²+y², d=1+k1·r2+k2·r2²   (열화상 렌즈 방사 왜곡을 실화상에 입힌다)
  xu=x·d, yu=y·d -> 회전 rot -> X = Xc + s·(f·xr + dx), Y = Yc + s·(f·yr + dy)
  s = (실화상 가로 · crop_w · zoom / 640) · (1 + scale)
실화상이 열화상 화각보다 좁으면(줌 1.95) 비는 가장자리는 검게 둔다.

전역 계수만으로는 비행 고도에 따른 시차 때문에 사진마다 10~25px 어긋남이 남는다. search_shift가 리매핑 결과를
정수 픽셀만큼 옮겨 보며 열화상 에지맵과의 NCC가 가장 큰 이동(shift)을 찾고, warp_array(shift=...)가 그만큼 옮겨 다시 그린다.
이동 (dx, dy)는 정렬본 안에서 실화상 내용이 오른쪽·아래로 움직이는 픽셀 수다.
"""
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 640, 512
PARAMS = json.loads((Path(__file__).resolve().parent / "align_params.json").read_text())
SEARCH_RADIUS = 40  # 이동 탐색 범위(±px)
EDGE_SIGMA = 2.0  # 에지맵을 흐리는 정도. 패널 격자선 몇 px 어긋남에도 NCC가 매끄럽게 변하게 한다.
SHIFT_GAIN = 0.03  # 사진 자체 이동이 기준 이동(비행 중앙값과 0 중 나은 쪽)보다 이만큼 NCC를 올려야 채택한다.

Shift = tuple[int, int]


def group_for(zoom: float) -> dict:
    return PARAMS["groups"]["1.95" if zoom > 1.5 else "1.0"]


def sample_maps(zoom: float, rgb_w: int, rgb_h: int, reduce: int, shift: Shift = (0, 0)) -> tuple[np.ndarray, np.ndarray]:
    p = group_for(zoom)
    f, cx, cy = PARAMS["f"], PARAMS["cx"], PARAMS["cy"]
    u, v = np.meshgrid(np.arange(W, dtype=np.float32) - shift[0], np.arange(H, dtype=np.float32) - shift[1])
    x, y = (u - cx) / f, (v - cy) / f
    r2 = x * x + y * y
    d = 1 + p["k1"] * r2 + p["k2"] * r2 * r2
    xu, yu = x * d, y * d
    c, s_ = np.cos(p["rot"]), np.sin(p["rot"])
    xr, yr = c * xu - s_ * yu, s_ * xu + c * yu
    s = rgb_w * PARAMS["crop_w"] * zoom / W * (1 + p["scale"]) / reduce
    map_x = (rgb_w / reduce - 1) / 2 + s * (f * xr + p["dx"])
    map_y = (rgb_h / reduce - 1) / 2 + s * (f * yr + p["dy"])
    return map_x, map_y


def bilinear(arr: np.ndarray, map_x: np.ndarray, map_y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """리매핑한 배열과, 원본 안쪽을 샘플한 픽셀인지 나타내는 마스크를 함께 돌려준다."""
    h, w = arr.shape[:2]
    x0 = np.floor(map_x).astype(np.int64)
    y0 = np.floor(map_y).astype(np.int64)
    valid = (x0 >= 0) & (x0 + 1 < w) & (y0 >= 0) & (y0 + 1 < h)
    x0c, y0c = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    wx = (map_x - x0)[..., None].astype(np.float32)
    wy = (map_y - y0)[..., None].astype(np.float32)
    out = (
        arr[y0c, x0c] * (1 - wx) * (1 - wy)
        + arr[y0c, x0c + 1] * wx * (1 - wy)
        + arr[y0c + 1, x0c] * (1 - wx) * wy
        + arr[y0c + 1, x0c + 1] * wx * wy
    )
    out[~valid] = 0
    return out, valid


def warp_array(rgb: Image.Image, zoom: float, shift: Shift = (0, 0)) -> tuple[np.ndarray, np.ndarray]:
    """실화상(원본 크기)을 열화상 틀로 옮긴 uint8 배열(H,W,3)과 유효 마스크. 샘플 간격이 넓으면 BOX로 먼저 줄여 앨리어싱을 막는다."""
    nominal = rgb.width * PARAMS["crop_w"] * zoom / W
    reduce = max(1, int(nominal // 2))
    small = rgb.convert("RGB").reduce(reduce) if reduce > 1 else rgb.convert("RGB")
    map_x, map_y = sample_maps(zoom, rgb.width, rgb.height, reduce, shift)
    out, valid = bilinear(np.asarray(small, dtype=np.float32), map_x, map_y)
    return np.clip(out + 0.5, 0, 255).astype(np.uint8), valid


def warp_rgb_to_ir(rgb: Image.Image, zoom: float, shift: Shift = (0, 0)) -> Image.Image:
    return Image.fromarray(warp_array(rgb, zoom, shift)[0])


def gray(image: Image.Image | np.ndarray) -> np.ndarray:
    pil = Image.fromarray(image) if isinstance(image, np.ndarray) else image
    return np.asarray(pil.convert("L"), dtype=np.float32)


def box_blur(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """상자 흐림 세 번으로 가우시안을 근사한다(numpy만 쓴다)."""
    r = max(1, round((np.sqrt(12 * sigma * sigma / 3 + 1) - 1) / 2))
    for _ in range(3):
        a = box_blur(box_blur(a, r, 0), r, 1)
    return a


def edge_map(g: np.ndarray, valid: np.ndarray, sigma: float) -> np.ndarray:
    g = blur(g, 1.0)
    p = np.pad(g, 1, mode="edge")
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    mag = np.sqrt(gx * gx + gy * gy) * valid
    if valid.any():
        mag = np.minimum(mag, np.percentile(mag[valid], 99))  # 극단값이 NCC를 지배하지 않게 자른다
    return blur(mag, sigma)


def erode(valid: np.ndarray, r: int) -> np.ndarray:
    """검은 가장자리와의 경계가 만드는 가짜 에지를 빼려고 유효 영역을 r px 깎는다."""
    return box_blur(box_blur(valid.astype(np.float32), r, 0), r, 1) > 0.999


@dataclass(frozen=True, slots=True)
class Edges:
    ir: np.ndarray
    rgb: np.ndarray
    valid: np.ndarray


def half(a: np.ndarray) -> np.ndarray:
    return a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).mean(axis=(1, 3))


def edges(ir_gray: np.ndarray, rgb_gray: np.ndarray, valid: np.ndarray, sigma: float = EDGE_SIGMA) -> Edges:
    ir_valid = np.ones_like(valid)
    return Edges(edge_map(ir_gray, ir_valid, sigma), edge_map(rgb_gray, valid, sigma), erode(valid, int(3 * sigma) + 2))


def score(e: Edges, shift: Shift) -> float:
    """실화상 에지맵을 shift만큼 옮겼을 때 겹치는 유효 영역에서 열화상 에지맵과의 NCC."""
    dx, dy = shift
    h, w = e.ir.shape
    if abs(dx) >= w or abs(dy) >= h:
        return 0.0
    dst = (slice(max(0, dy), h + min(0, dy)), slice(max(0, dx), w + min(0, dx)))
    src = (slice(max(0, -dy), h + min(0, -dy)), slice(max(0, -dx), w + min(0, -dx)))
    mask = e.valid[src]
    if mask.sum() < 1000:
        return 0.0
    a = e.ir[dst][mask]
    b = e.rgb[src][mask]
    a = a - a.mean()
    b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))


def search_shift(e: Edges, radius: int = SEARCH_RADIUS) -> Shift:
    """반 해상도에서 4px 간격으로 넓게 찾은 뒤, 원 해상도에서 ±4px를 1px 간격으로 다듬는다."""
    coarse = Edges(half(e.ir), half(e.rgb), half(e.valid.astype(np.float32)) > 0.999)
    steps = range(-(radius // 2), radius // 2 + 1, 2)
    cx, cy = max(((x, y) for y in steps for x in steps), key=lambda s: score(coarse, s))
    fine = [(2 * cx + x, 2 * cy + y) for y in range(-4, 5) for x in range(-4, 5)]
    return max((s for s in fine if max(abs(s[0]), abs(s[1])) <= radius), key=lambda s: score(e, s))


def choose_shift(e: Edges, own: Shift, priors: tuple[Shift, ...]) -> Shift:
    """기준 이동은 priors(비행 중앙값, 이동 없음) 중 NCC가 높은 쪽이다. 사진 자체 이동은 그보다 SHIFT_GAIN 이상 나을 때만 쓴다.
    패널 격자가 반복돼 NCC 봉우리가 여럿 생기므로, 차이가 작으면 엉뚱한 봉우리로 튀지 않게 기준을 지킨다."""
    prior = max(priors, key=lambda s: score(e, s))
    return own if score(e, own) - score(e, prior) >= SHIFT_GAIN else prior


@dataclass(frozen=True, slots=True)
class Aligned:
    image: np.ndarray
    shift: Shift
    score: float


def render(rgb: Image.Image, zoom: float, ir_gray: np.ndarray, shift: Shift) -> Aligned:
    """shift만큼 옮겨 다시 리매핑하고, 실제 결과물의 에지 NCC를 정렬 점수로 잰다."""
    arr, valid = warp_array(rgb, zoom, shift)
    return Aligned(arr, shift, score(edges(ir_gray, gray(arr), valid), (0, 0)))


def align_pair(rgb: Image.Image, zoom: float, ir_gray: np.ndarray) -> Aligned:
    """현장 중앙값이 없는 사진(업로드)용: 자체 이동이 이동 없음보다 확실히 나을 때만 옮긴다."""
    arr, valid = warp_array(rgb, zoom)
    e = edges(ir_gray, gray(arr), valid)
    return render(rgb, zoom, ir_gray, choose_shift(e, search_shift(e), ((0, 0),)))
