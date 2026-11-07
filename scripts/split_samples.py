"""미리 실린 사진(src/data/drone.json)을 발전소마다 KEEP장으로 줄이고, 나머지 짝은 샘플 업로드 목록(samples.json)으로 옮긴다.

실행: uv run --no-project python -I scripts/split_samples.py [--keep 48]
- '패널 외'(outside) 사진은 화면에 띄우지 않기로 해서 두 목록 모두에서 뻐다(사용자 결정 2026-11-07).
- 남길 사진은 폴더(abnormal/normal) 비율을 지키며 seq 간격으로 고르게 뽑는다(결정적).
- samples.json에는 정답 폴더를 넣지 않는다. 피커는 DJI 원본 파일 이름(DJI_<촬영시각>_<seq>_T.JPG)으로 보여 준다.
- 이미 samples.json이 있으면 그 항목을 합쳐 다시 쓴다(두 번 실행해도 사진이 사라지지 않는다).
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent
DRONE_JSON = WEB / "src" / "data" / "drone.json"
SAMPLES_JSON = WEB / "samples.json"


def dji_name(photo: dict, kind: str) -> str:
    stamp = photo["capturedAt"].replace("-", "").replace(" ", "").replace(":", "")
    return f"DJI_{stamp}_{photo['seq']}_{kind}.JPG"


def spread(items: list[dict], count: int) -> list[dict]:
    if count >= len(items):
        return items
    step = len(items) / count
    return [items[int(i * step)] for i in range(count)]


def pick(photos: list[dict], keep: int) -> list[dict]:
    by_folder: dict[str, list[dict]] = defaultdict(list)
    for photo in sorted(photos, key=lambda p: p["seq"]):
        by_folder[photo["folder"]].append(photo)
    total = len(photos)
    quota = {folder: round(keep * len(items) / total) for folder, items in by_folder.items()}
    while sum(quota.values()) > keep:
        biggest = max(quota, key=quota.get)
        quota[biggest] -= 1
    while sum(quota.values()) < keep:
        room = {f: len(by_folder[f]) - quota[f] for f in quota if len(by_folder[f]) > quota[f]}
        quota[max(room, key=room.get)] += 1
    chosen = [p for folder, items in by_folder.items() for p in spread(items, quota[folder])]
    return sorted(chosen, key=lambda p: p["seq"])


def to_sample(photo: dict) -> dict:
    sample = {
        "id": photo["id"],
        "site": photo["site"],
        "seq": photo["seq"],
        "name": dji_name(photo, "T"),
        "capturedAt": photo["capturedAt"],
        "ir": photo["ir"],
    }
    if photo.get("rgb"):
        sample["rgb"] = photo["rgb"]
        sample["rgbName"] = dji_name(photo, "V")
    if photo.get("rgbZoom") is not None:
        sample["rgbZoom"] = photo["rgbZoom"]
    return sample


def main(keep: int) -> None:
    photos = [p for p in json.loads(DRONE_JSON.read_text()) if p["folder"] != "outside"]
    existing = {s["id"]: s for s in json.loads(SAMPLES_JSON.read_text())} if SAMPLES_JSON.exists() else {}
    kept: list[dict] = []
    for site in sorted({p["site"] for p in photos}):
        mine = [p for p in photos if p["site"] == site]
        chosen = pick(mine, keep) if len(mine) > keep else mine
        chosen_ids = {p["id"] for p in chosen}
        for p in mine:
            if p["id"] not in chosen_ids:
                existing[p["id"]] = to_sample(p)
        kept.extend(chosen)
        folders = defaultdict(int)
        for p in chosen:
            folders[p["folder"]] += 1
        print(f"{site}: {len(mine)}장 -> 남김 {len(chosen)}장 {dict(folders)}, 샘플 {len(mine) - len(chosen)}장", flush=True)
    body = ",\n".join(json.dumps(p, ensure_ascii=False, separators=(",", ":")) for p in kept)
    DRONE_JSON.write_text(f"[\n{body}\n]\n")
    samples = sorted(existing.values(), key=lambda s: (s["site"], s["seq"]))
    body = ",\n".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) for s in samples)
    SAMPLES_JSON.write_text(f"[\n{body}\n]\n")
    print(f"drone.json {len(kept)}장, samples.json {len(samples)}장", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--keep", type=int, default=48, help="발전소마다 남길 사진 수")
    main(parser.parse_args().keep)
