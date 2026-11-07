"""실화상을 열화상 틀(640x512)로 리매핑한다. 계수는 align_params.json(.omo/scripts/fit_align.py가 추정).

사상(열화상 픽셀 u,v -> 실화상 픽셀 X,Y)은 fit_align.py와 같다:
  x=(u-cx)/f, y=(v-cy)/f, r2=x²+y², d=1+k1·r2+k2·r2²   (열화상 렌즈 방사 왜곡을 실화상에 입힌다)
  xu=x·d, yu=y·d -> 회전 rot -> X = Xc + s·(f·xr + dx), Y = Yc + s·(f·yr + dy)
  s = (실화상 가로 · crop_w · zoom / 640) · (1 + scale)
실화상이 열화상 화각보다 좁으면(줌 1.95) 비는 가장자리는 검게 둔다.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 640, 512
PARAMS = json.loads((Path(__file__).resolve().parent / "align_params.json").read_text())


def group_for(zoom: float) -> dict:
    return PARAMS["groups"]["1.95" if zoom > 1.5 else "1.0"]


def sample_maps(zoom: float, rgb_w: int, rgb_h: int, reduce: int) -> tuple[np.ndarray, np.ndarray]:
    p = group_for(zoom)
    f, cx, cy = PARAMS["f"], PARAMS["cx"], PARAMS["cy"]
    u, v = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
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


def bilinear(arr: np.ndarray, map_x: np.ndarray, map_y: np.ndarray) -> np.ndarray:
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
    return out


def warp_rgb_to_ir(rgb: Image.Image, zoom: float) -> Image.Image:
    """실화상(원본 크기)을 열화상 640x512 틀로 옮긴다. 샘플 간격이 넓으면 BOX로 먼저 줄여 앨리어싱을 막는다."""
    nominal = rgb.width * PARAMS["crop_w"] * zoom / W
    reduce = max(1, int(nominal // 2))
    small = rgb.convert("RGB").reduce(reduce) if reduce > 1 else rgb.convert("RGB")
    map_x, map_y = sample_maps(zoom, rgb.width, rgb.height, reduce)
    arr = np.asarray(small, dtype=np.float32)
    out = bilinear(arr, map_x, map_y)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))
