"""드론 시연 사진을 EXIF 없이 다시 저장하고 두 서빙의 판정 결과를 함께 기록한다.

실행: uv run --no-project --with pillow --with numpy python -I scripts/prepare_demo.py [--site D,E] [--fusion-only|--zoom-only|--align-only]
원본(data/drone 폴더, ~/Downloads zip)은 읽기만 한다. zip 원본은 발전소마다 새 임시 폴더에 풀어 읽고 끝나면 지운다.

사진은 git 밖 data-demo/drone/<id>_{T,V,A}.jpg에 쓴다(열화상 640x512 q90, 실화상 긴 변 960 q78,
정렬본 A는 실화상을 열화상 렌즈 왜곡·화각에 맞춰 640x512로 리매핑한 것, align.py·align_params.json).
박스는 제공 서빙 SV-e434a471 /predict/solar, 융합 판정은 PREDICT_BASE(기본 http://127.0.0.1:8601)의
/api/classify로 받는다. 로컬 serve.py를 먼저 띄운다: `DATA_DIR=data-demo PORT=8601 python3 serve.py`.
융합 판정에는 실화상을 긴 변 1280으로 보낸다. 열화상 화각 자르기는 서빙이 한다.

이어 하기: 사진 두 장과 박스·융합 판정을 모두 갖춘 항목은 건너뛴다. 10쌍마다 drone.json을 저장한다.
요청이 실패하면 한 번 더 보내고, 그래도 실패한 쌍은 data-demo/failures.json에 적고 drone.json에서 뺀다.
다시 실행하면 빠진 쌍만 처리한다.

--site: 처리할 발전소(쉼표 구분, 기본 전체). 지정하지 않은 발전소 항목은 그대로 둔다.
--fusion-only: 지정한 발전소의 기존 항목에 융합 판정만 다시 기록한다. 박스는 그대로 둔다.
--zoom-only: 지정한 발전소의 기존 항목에 실화상 줌(rgbZoom)만 원본 EXIF에서 다시 읽어 적는다.
--align-only: 지정한 발전소의 기존 항목에 정렬본(_A.jpg, rgbAligned)과 rgbZoom, rgbShift, alignScore만 원본에서 다시 만든다.
  사진마다 전역 리매핑 뒤 남은 이동을 찾고(align.search_shift), 같은 비행(촬영 간격 FLIGHT_GAP_S 이하) 중앙값을 기본으로 쓴다.
  사진 자체 이동이 기준(중앙값과 이동 없음 중 나은 쪽)보다 NCC를 align.SHIFT_GAIN 이상 올릴 때만 자체 이동을 쓴다. 측정 기록은 data-demo/align_report.json.
  발전소 단위로 이어 한다: 모든 짝이 align_report.json에 있는 발전소는 건너뛴다(--force면 다시 만든다).
  정렬본과 측정은 열화상이 있는 짝 전부(샘플 피커·패널 외 포함)에 하고, drone.json에는 이미 있는 항목만 기록한다.
"""
import argparse
import collections
import contextlib
import io
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import time
import unicodedata
import zipfile
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import align  # noqa: E402 - python -I는 스크립트 폴더를 sys.path에 넣지 않는다

WEB = Path(__file__).resolve().parent.parent
DRONE = WEB.parent / "data" / "drone"
DOWNLOADS = Path.home() / "Downloads"
DEMO = WEB / "data-demo"
OUT_IMG = DEMO / "drone"
FAILURES = DEMO / "failures.json"
ALIGN_REPORT = DEMO / "align_report.json"
FLIGHT_GAP_S = 120  # 촬영 간격이 이보다 길면 다른 비행(고도·시차가 다를 수 있음)으로 본다
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
EXIF_IFD, EXIF_DIGITAL_ZOOM = 0x8769, 0xA404


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


def rgb_zoom(rgb_src: Path) -> float:
    """실화상 EXIF의 DigitalZoomRatio. 웹의 열화상 화각 자르기 비율은 줌 1.0 기준이라 이 값으로 배율을 고친다.
    같은 M3T라도 비행마다 1.0과 1.95가 섞여 있다(하동·음성·이천 1.95, 영광 1.0, 제주 대부분 1.95)."""
    with Image.open(rgb_src) as image:
        return float(image.getexif().get_ifd(EXIF_IFD).get(EXIF_DIGITAL_ZOOM, 1.0))


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
        and "rgbAligned" in photo
        and (OUT_IMG / Path(photo["ir"]).name).is_file()
        and (OUT_IMG / Path(photo["rgb"]).name).is_file()
        and (OUT_IMG / Path(photo["rgbAligned"]).name).is_file()
    )


def save_aligned(result: align.Aligned, site: str, seq: str) -> dict:
    out = OUT_IMG / f"{site}_{seq}_A.jpg"
    Image.fromarray(result.image).save(out, quality=85)
    return {"rgbAligned": f"drone/{out.name}", "rgbShift": list(result.shift), "alignScore": round(result.score, 2)}


def ir_gray(photo: dict) -> np.ndarray:
    with Image.open(OUT_IMG / Path(photo["ir"]).name) as ir:
        return align.gray(ir)


def build_pair(site: str, seq: str, ir_src: Path, rgb_src: Path, scratch: Path) -> dict:
    folder = unicodedata.normalize("NFC", ir_src.parent.name)
    ir_out = OUT_IMG / f"{site}_{seq}_T.jpg"
    rgb_out = OUT_IMG / f"{site}_{seq}_V.jpg"
    ir = Image.open(ir_src).convert("RGB")
    if ir.size != (640, 512):
        ir = ir.resize((640, 512))
    ir.save(ir_out, quality=90)
    rgb = Image.open(rgb_src).convert("RGB")
    zoom = rgb_zoom(rgb_src)
    aligned = save_aligned(align.align_pair(rgb, zoom, align.gray(ir)), site, seq)
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
        "rgbZoom": zoom,
        **aligned,
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


def zoom_only(sites: list[str]) -> None:
    photos = load_photos()
    with contextlib.ExitStack() as stack:
        for site in sites:
            rgbs = index(unpacked(SITES[site][1], stack), "V")
            mine = [photo for photo in photos if photo["site"] == site]
            for photo in mine:
                photo["rgbZoom"] = rgb_zoom(rgbs[photo["seq"]])
            print(site, dict(collections.Counter(photo["rgbZoom"] for photo in mine)), flush=True)
    save_photos(photos)


def flights(photos: list[dict]) -> list[list[dict]]:
    groups: list[list[dict]] = []
    last = None
    for photo in sorted(photos, key=lambda item: item["capturedAt"]):
        taken = datetime.strptime(photo["capturedAt"], "%Y-%m-%d %H:%M:%S")
        if last is None or (taken - last).total_seconds() > FLIGHT_GAP_S:
            groups.append([])
        groups[-1].append(photo)
        last = taken
    return groups


def measure_site(mine: list[dict], rgbs: dict[str, Path]) -> dict[str, tuple]:
    """1단계: 사진마다 이동 없는 정렬본의 회색조·유효 마스크와 자체 최적 이동, 보정 전 점수를 잰다."""
    measured = {}
    for n, photo in enumerate(mine, 1):
        photo["rgbZoom"] = rgb_zoom(rgbs[photo["seq"]])
        with Image.open(rgbs[photo["seq"]]) as rgb:
            arr, valid = align.warp_array(rgb, photo["rgbZoom"])
        ir, rgb_gray = ir_gray(photo), align.gray(arr)
        e = align.edges(ir, rgb_gray, valid)
        measured[photo["id"]] = (rgb_gray.astype(np.uint8), valid, align.search_shift(e), align.score(e, (0, 0)))
        if n % 50 == 0 or n == len(mine):
            print(f"{photo['site']}: 측정 {n}/{len(mine)}", flush=True)
    return measured


def site_pairs(site: str, rgbs: dict[str, Path]) -> list[dict]:
    """열화상(_T.jpg)이 있는 원본 짝 전부. drone.json에 없는 샘플 피커·패널 외 사진도 비행 중앙값과 측정에 넣는다."""
    pairs = []
    for seq, src in sorted(rgbs.items()):
        if not (OUT_IMG / f"{site}_{seq}_T.jpg").is_file():
            continue
        y, mo, d, h, mi, s = NAME.search(src.name).groups()[:6]
        pairs.append({"id": f"{site}_{seq}", "site": site, "seq": seq, "capturedAt": f"{y}-{mo}-{d} {h}:{mi}:{s}",
                      "ir": f"drone/{site}_{seq}_T.jpg"})
    return pairs


def align_only(sites: list[str], force: bool) -> None:
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    photos = load_photos()
    listed = {photo["id"]: photo for photo in photos}
    report = {row["id"]: row for row in json.loads(ALIGN_REPORT.read_text())} if ALIGN_REPORT.exists() else {}
    with contextlib.ExitStack() as stack:
        for site in sites:
            rgbs = index(unpacked(SITES[site][1], stack), "V")
            mine = site_pairs(site, rgbs)
            if not force and all(photo["id"] in report for photo in mine):
                print(f"{site}: 측정 기록이 모두 있어 건너뜀", flush=True)
                continue
            measured = measure_site(mine, rgbs)
            for flight_no, flight in enumerate(flights(mine)):
                owns = [measured[photo["id"]][2] for photo in flight]
                median = (round(statistics.median(s[0] for s in owns)), round(statistics.median(s[1] for s in owns)))
                for photo in flight:
                    rgb_gray, valid, own, before = measured.pop(photo["id"])
                    ir = ir_gray(photo)
                    shift = align.choose_shift(align.edges(ir, rgb_gray.astype(np.float32), valid), own, (median, (0, 0)))
                    with Image.open(rgbs[photo["seq"]]) as rgb:
                        result = align.render(rgb, photo["rgbZoom"], ir, shift)
                    fields = save_aligned(result, site, photo["seq"])
                    if photo["id"] in listed:
                        listed[photo["id"]].update(rgbZoom=photo["rgbZoom"], **fields)
                    report[photo["id"]] = {
                        "id": photo["id"], "site": site, "flight": f"{site}{flight_no}", "zoom": photo["rgbZoom"],
                        "own": list(own), "median": list(median), "shift": list(shift),
                        "before": round(before, 4), "after": round(result.score, 4),
                    }
            print(f"{site}: 정렬본 {len(mine)}장, 비행 {len(flights(mine))}개", flush=True)
            save_photos(photos)
            ALIGN_REPORT.write_text(json.dumps(sorted(report.values(), key=lambda row: row["id"]), indent=0) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--site", default=",".join(SITES), help="처리할 발전소(쉼표 구분)")
    only = parser.add_mutually_exclusive_group()
    only.add_argument("--fusion-only", action="store_true", help="박스는 두고 fusion 판정만 다시 기록")
    only.add_argument("--zoom-only", action="store_true", help="실화상 줌(rgbZoom)만 원본 EXIF에서 다시 기록")
    only.add_argument("--align-only", action="store_true", help="정렬본(_A.jpg)과 rgbZoom·rgbShift·alignScore만 원본에서 다시 만듦")
    parser.add_argument("--force", action="store_true", help="--align-only에서 이미 정렬 점수가 있는 발전소도 다시 만듦")
    args = parser.parse_args()
    chosen = [site for site in args.site.split(",") if site]
    unknown = set(chosen) - set(SITES)
    if unknown:
        parser.error(f"모르는 발전소: {', '.join(sorted(unknown))}")
    if args.fusion_only:
        fusion_only(chosen)
    elif args.zoom_only:
        zoom_only(chosen)
    elif args.align_only:
        align_only(chosen, args.force)
    else:
        main(chosen)
