"""드론 시연 사진을 EXIF 없이 다시 저장하고 서빙 판정 결과를 함께 기록한다.

실행: uv run --no-project --with pillow python -I scripts/prepare_demo.py [--site C] [--fusion-only]
원본(data/drone)은 읽기만 한다. zip 원본은 발전소마다 새 임시 폴더에 풀어 읽고 끝나면 지운다.

--site: 다시 만들 발전소(쉼표 구분, 기본 전체). 지정하지 않은 발전소의 drone.json 항목은 그대로 둔다.
--fusion-only: drone.json의 사진 쌍(public/drone/<id>_T.jpg, _V.jpg)을 PREDICT_BASE(기본
http://127.0.0.1:8601)의 /api/classify로 보내 fusion 판정만 기록한다. 박스는 그대로 둔다.
실화상은 원본 비율(4:3)을 그대로 보내며, 열화상 화각 자르기는 서빙이 한다.
"""
import argparse
import contextlib
import json
import os
import re
import subprocess
import tempfile
import unicodedata
import zipfile
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
DRONE = WEB.parent / "data" / "drone"
OUT_IMG = WEB / "public" / "drone"
OUT_JSON = WEB / "src" / "data" / "drone.json"
SERVING = "https://aiopen-serving.jntp-ax.or.kr/jntp-gpu/SV-e434a471/predict/solar"

# (열화상 원본, 실화상 원본, 사진 번호 목록). 원본은 data/drone의 폴더 또는 zip이고, 번호가 None이면 열화상 전부를 쓴다.
SITES = {
    "A": ("_hadong5(1)_IR", "_hadong5(1)_RGB",
          ["0142", "0121", "0054", "0193", "0133", "0004", "0275", "0164", "0295", "0297"]),
    "B": ("_Youngkwang-01_IR", "_Youngkwang-01_RGB",
          ["0646", "0586", "0078", "0327", "0068", "0405", "0581", "0248"]),
    "C": ("_Eumseong1_IR.zip", "_Eumseong1_RGB.zip", None),
}
FOLDER = {"비정상": "abnormal", "정상": "normal", "패널 외": "outside"}
NAME = re.compile(r"DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(\d{4})_([TV])")


def unpacked(name: str, stack: contextlib.ExitStack) -> Path:
    """폴더 원본은 그대로 돌려주고, zip 원본은 새 임시 폴더에 JPG만 풀어 그 폴더를 돌려준다."""
    src = DRONE / name
    if src.suffix != ".zip":
        return src
    out = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix=f"{src.stem}_")))
    with zipfile.ZipFile(src) as archive:
        for info in archive.infolist():
            if info.filename.upper().endswith(".JPG"):
                archive.extract(info, out)
    return out


def find(root: Path, seq: str, kind: str) -> Path:
    return next(p for p in root.rglob(f"*_{seq}_{kind}.JPG"))


def all_seqs(root: Path) -> list[str]:
    return sorted(NAME.search(p.name).group(7) for p in root.rglob("*_T.JPG"))


def predict(path: Path) -> dict:
    out = subprocess.run(
        ["curl", "-s", "-m", "90", "-F", f"file=@{path};type=image/jpeg", SERVING],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def classify(ir: Path, rgb: Path) -> dict:
    base = os.environ.get("PREDICT_BASE", "http://127.0.0.1:8601").rstrip("/")
    out = subprocess.run(
        ["curl", "-s", "-f", "-m", "90", "-F", f"ir=@{ir};type=image/jpeg", "-F", f"rgb=@{rgb};type=image/jpeg",
         f"{base}/api/classify"],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def load_photos() -> list[dict]:
    return json.loads(OUT_JSON.read_text()) if OUT_JSON.exists() else []


def save_photos(photos: list[dict]) -> None:
    OUT_JSON.write_text(json.dumps(photos, ensure_ascii=False, indent=1) + "\n")


def fusion_only(sites: list[str]) -> None:
    photos = load_photos()
    for photo in photos:
        if photo["site"] not in sites:
            continue
        result = classify(WEB / "public" / photo["ir"], WEB / "public" / photo["rgb"])
        photo["fusion"] = {key: result[key] for key in ("label", "confidence", "probs", "usedRgb")}
        print(photo["id"], photo["folder"], result["label"], result["confidence"], len(photo["boxes"]))
    save_photos(photos)


def build_site(site: str, stack: contextlib.ExitStack) -> list[dict]:
    ir_dir, rgb_dir, seqs = SITES[site]
    ir_root, rgb_root = unpacked(ir_dir, stack), unpacked(rgb_dir, stack)
    photos = []
    for seq in seqs or all_seqs(ir_root):
        ir_src = find(ir_root, seq, "T")
        rgb_src = find(rgb_root, seq, "V")
        folder = unicodedata.normalize("NFC", ir_src.parent.name)
        ir_out = OUT_IMG / f"{site}_{seq}_T.jpg"
        rgb_out = OUT_IMG / f"{site}_{seq}_V.jpg"
        Image.open(ir_src).convert("RGB").save(ir_out, quality=92)
        rgb = Image.open(rgb_src).convert("RGB")
        rgb.thumbnail((1280, 1280))
        rgb.save(rgb_out, quality=80)
        result = predict(ir_out)
        y, mo, d, h, mi, s = NAME.search(ir_src.name).groups()[:6]
        photos.append({
            "id": f"{site}_{seq}",
            "site": site,
            "seq": seq,
            "folder": FOLDER[folder],
            "capturedAt": f"{y}-{mo}-{d} {h}:{mi}:{s}",
            "ir": f"drone/{ir_out.name}",
            "rgb": f"drone/{rgb_out.name}",
            "width": result["width"],
            "height": result["height"],
            "boxes": [{"bbox": x["bbox"], "area": x["area"]} for x in result["defects"]],
        })
        print(site, seq, folder, len(result["defects"]))
    return photos


def main(sites: list[str]) -> None:
    """지정한 발전소만 새로 만들고 나머지 발전소 항목은 기존 drone.json 것을 SITES 순서로 그대로 둔다."""
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    existing = load_photos()
    photos = []
    with contextlib.ExitStack() as stack:
        for site in SITES:
            if site in sites:
                photos.extend(build_site(site, stack))
            else:
                photos.extend(photo for photo in existing if photo["site"] == site)
    save_photos(photos)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", default=",".join(SITES), help="다시 만들 발전소(쉼표 구분)")
    parser.add_argument("--fusion-only", action="store_true", help="박스는 두고 fusion 판정만 다시 기록")
    args = parser.parse_args()
    chosen = [site for site in args.site.split(",") if site]
    unknown = set(chosen) - set(SITES)
    if unknown:
        parser.error(f"모르는 발전소: {', '.join(sorted(unknown))}")
    fusion_only(chosen) if args.fusion_only else main(chosen)
