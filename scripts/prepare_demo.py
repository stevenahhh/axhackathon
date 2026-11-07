"""드론 시연 사진을 EXIF 없이 다시 저장하고 두 서빙의 판정 결과를 함께 기록한다.

실행: uv run --no-project --with pillow python -I scripts/prepare_demo.py [--site D,E] [--fusion-only]
원본(data/drone 폴더, ~/Downloads zip)은 읽기만 한다. zip 원본은 발전소마다 새 임시 폴더에 풀어 읽고 끝나면 지운다.

사진은 git 밖 data-demo/drone/<id>_{T,V}.jpg에 쓴다(열화상 640x512 q90, 실화상 긴 변 960 q78).
박스는 제공 서빙 SV-e434a471 /predict/solar, 융합 판정은 PREDICT_BASE(기본 http://127.0.0.1:8601)의
/api/classify로 받는다. 로컬 serve.py를 먼저 띄운다: `DATA_DIR=data-demo PORT=8601 python3 serve.py`.
융합 판정에는 실화상을 긴 변 1280으로 보낸다. 열화상 화각 자르기는 서빙이 한다.

이어 하기: 사진 두 장과 박스·융합 판정을 모두 갖춘 항목은 건너뛴다. 10쌍마다 drone.json을 저장한다.
요청이 실패하면 한 번 더 보내고, 그래도 실패한 쌍은 data-demo/failures.json에 적고 drone.json에서 뺀다.
다시 실행하면 빠진 쌍만 처리한다.

--site: 처리할 발전소(쉼표 구분, 기본 전체). 지정하지 않은 발전소 항목은 그대로 둔다.
--fusion-only: 지정한 발전소의 기존 항목에 융합 판정만 다시 기록한다. 박스는 그대로 둔다.
"""
import argparse
import contextlib
import io
import json
import os
import re
import subprocess
import tempfile
import time
import unicodedata
import zipfile
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
DRONE = WEB.parent / "data" / "drone"
DOWNLOADS = Path.home() / "Downloads"
DEMO = WEB / "data-demo"
OUT_IMG = DEMO / "drone"
FAILURES = DEMO / "failures.json"
OUT_JSON = WEB / "src" / "data" / "drone.json"
SERVING = "https://aiopen-serving.jntp-ax.or.kr/jntp-gpu/SV-e434a471/predict/solar"

SITES = {
    "A": (DRONE / "_hadong5(1)_IR", DRONE / "_hadong5(1)_RGB"),
    "B": (DRONE / "_Youngkwang-01_IR", DRONE / "_Youngkwang-01_RGB"),
    "C": (DOWNLOADS / "_Eumseong1_IR.zip", DOWNLOADS / "_Eumseong1_RGB.zip"),
    "D": (DOWNLOADS / "_Icheon2_IR.zip", DOWNLOADS / "_Icheon2_RGB.zip"),
    "E": (DOWNLOADS / "_Jeju Wasan_IR.zip", DOWNLOADS / "_Jeju Wasan_RGB.zip"),
}
FOLDER = {"비정상": "abnormal", "정상": "normal", "패널 외": "outside"}
NAME = re.compile(r"DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(\d{4})_([TV])\.JPG$", re.IGNORECASE)
FUSION_KEYS = ("label", "confidence", "probs", "usedRgb")


def unpacked(src: Path, stack: contextlib.ExitStack) -> Path:
    """폴더 원본은 그대로 돌려주고, zip 원본은 새 임시 폴더에 JPG만 풀어 그 폴더를 돌려준다."""
    if src.suffix != ".zip":
        return src
    out = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="prepare_demo_")))
    with zipfile.ZipFile(src) as archive:
        for info in archive.infolist():
            if NAME.search(info.filename):
                archive.extract(info, out)
    return out


def index(root: Path, kind: str) -> dict[str, Path]:
    found = {}
    for path in root.rglob("*"):
        match = NAME.search(path.name)
        if match and match.group(8).upper() == kind:
            found[match.group(7)] = path
    return found


def curl_json(args: list[str]) -> dict:
    for attempt in (1, 2):
        try:
            out = subprocess.run(["curl", "-s", "-f", "-m", "90", *args], capture_output=True, text=True, check=True)
            return json.loads(out.stdout)
        except (subprocess.CalledProcessError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2)
    raise AssertionError("unreachable")


def predict(ir: Path) -> dict:
    return curl_json(["-F", f"file=@{ir};type=image/jpeg", SERVING])


def classify(ir: Path, rgb: Path) -> dict:
    base = os.environ.get("PREDICT_BASE", "http://127.0.0.1:8601").rstrip("/")
    result = curl_json(["-F", f"ir=@{ir};type=image/jpeg", "-F", f"rgb=@{rgb};type=image/jpeg", f"{base}/api/classify"])
    return {key: result[key] for key in FUSION_KEYS}


def load_photos() -> list[dict]:
    return json.loads(OUT_JSON.read_text()) if OUT_JSON.exists() else []


def save_photos(photos: list[dict]) -> None:
    """한 줄에 항목 하나씩, 들여쓰기 없이 쓴다. 쓰는 도중 Vite가 읽지 않게 임시 파일을 거쳐 바꾼다."""
    photos = sorted(photos, key=lambda photo: (photo["site"], photo["seq"]))
    body = ",\n".join(json.dumps(photo, ensure_ascii=False, separators=(",", ":")) for photo in photos)
    tmp = OUT_JSON.with_suffix(".json.tmp")
    tmp.write_text(f"[\n{body}\n]\n")
    tmp.replace(OUT_JSON)


def complete(photo: dict) -> bool:
    return (
        "fusion" in photo
        and (OUT_IMG / Path(photo["ir"]).name).is_file()
        and (OUT_IMG / Path(photo["rgb"]).name).is_file()
    )


def build_pair(site: str, seq: str, ir_src: Path, rgb_src: Path, scratch: Path) -> dict:
    folder = unicodedata.normalize("NFC", ir_src.parent.name)
    ir_out = OUT_IMG / f"{site}_{seq}_T.jpg"
    rgb_out = OUT_IMG / f"{site}_{seq}_V.jpg"
    ir = Image.open(ir_src).convert("RGB")
    if ir.size != (640, 512):
        ir = ir.resize((640, 512))
    ir.save(ir_out, quality=90)
    rgb = Image.open(rgb_src).convert("RGB")
    rgb_fusion = rgb.copy()
    rgb_fusion.thumbnail((1280, 1280))
    fusion_input = scratch / "rgb_fusion.jpg"
    rgb_fusion.save(fusion_input, quality=85)
    rgb.thumbnail((960, 960))
    rgb.save(rgb_out, quality=78)
    result = predict(ir_out)
    fusion = classify(ir_out, fusion_input)
    y, mo, d, h, mi, s = NAME.search(ir_src.name).groups()[:6]
    return {
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
        "fusion": fusion,
    }


def main(sites: list[str]) -> None:
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    by_id = {photo["id"]: photo for photo in load_photos()}
    failures: dict[str, str] = {}
    with contextlib.ExitStack() as stack:
        scratch = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="prepare_demo_scratch_")))
        for site in sites:
            ir_dir, rgb_dir = SITES[site]
            irs = index(unpacked(ir_dir, stack), "T")
            rgbs = index(unpacked(rgb_dir, stack), "V")
            seqs = sorted(set(irs) & set(rgbs))
            unpaired = sorted(set(irs) ^ set(rgbs))
            print(f"{site}: 짝 {len(seqs)}쌍, 짝 없음 {unpaired or '-'}", flush=True)
            todo = [seq for seq in seqs if not (f"{site}_{seq}" in by_id and complete(by_id[f"{site}_{seq}"]))]
            print(f"{site}: 처리 {len(todo)}쌍, 건너뜀 {len(seqs) - len(todo)}쌍", flush=True)
            for n, seq in enumerate(todo, 1):
                pid = f"{site}_{seq}"
                try:
                    photo = build_pair(site, seq, irs[seq], rgbs[seq], scratch)
                except Exception as error:  # noqa: BLE001 - 실패한 쌍은 기록하고 다음 쌍으로 넘어간다
                    failures[pid] = f"{type(error).__name__}: {error}"
                    by_id.pop(pid, None)
                    print(f"FAIL {pid} {failures[pid]}", flush=True)
                    continue
                by_id[pid] = photo
                print(f"OK {pid} {n}/{len(todo)} {photo['folder']} boxes={len(photo['boxes'])} "
                      f"fusion={photo['fusion']['label']}", flush=True)
                if n % 10 == 0:
                    save_photos(list(by_id.values()))
    save_photos(list(by_id.values()))
    FAILURES.write_text(json.dumps(failures, ensure_ascii=False, indent=1) + "\n")
    print(f"DONE entries={len(by_id)} failures={len(failures)}", flush=True)


def fusion_only(sites: list[str]) -> None:
    photos = load_photos()
    for photo in photos:
        if photo["site"] in sites:
            photo["fusion"] = classify(DEMO / photo["ir"], DEMO / photo["rgb"])
            print(photo["id"], photo["folder"], photo["fusion"]["label"], flush=True)
    save_photos(photos)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", default=",".join(SITES), help="처리할 발전소(쉼표 구분)")
    parser.add_argument("--fusion-only", action="store_true", help="박스는 두고 fusion 판정만 다시 기록")
    args = parser.parse_args()
    chosen = [site for site in args.site.split(",") if site]
    unknown = set(chosen) - set(SITES)
    if unknown:
        parser.error(f"모르는 발전소: {', '.join(sorted(unknown))}")
    fusion_only(chosen) if args.fusion_only else main(chosen)
