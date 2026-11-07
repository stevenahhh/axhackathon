"""드론 시연 사진을 EXIF 없이 다시 저장하고 서빙 판정 결과를 함께 기록한다.

실행: uv run --no-project --with pillow python scripts/prepare_demo.py
원본(data/drone)은 읽기만 한다.
"""
import json
import re
import subprocess
import unicodedata
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parent.parent
DRONE = WEB.parent / "data" / "drone"
OUT_IMG = WEB / "public" / "drone"
OUT_JSON = WEB / "src" / "data" / "drone.json"
SERVING = "https://aiopen-serving.jntp-ax.or.kr/jntp-gpu/SV-e434a471/predict/solar"

SITES = {
    "A": ("_hadong5(1)_IR", "_hadong5(1)_RGB",
          ["0142", "0121", "0054", "0193", "0133", "0004", "0275", "0164", "0295", "0297"]),
    "B": ("_Youngkwang-01_IR", "_Youngkwang-01_RGB",
          ["0646", "0586", "0078", "0327", "0068", "0405", "0581", "0248"]),
}
FOLDER = {"비정상": "abnormal", "정상": "normal", "패널 외": "outside"}
NAME = re.compile(r"DJI_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_(\d{4})_([TV])")


def find(root: Path, seq: str, kind: str) -> Path:
    return next(p for p in root.rglob(f"*_{seq}_{kind}.JPG"))


def predict(path: Path) -> dict:
    out = subprocess.run(
        ["curl", "-s", "-m", "90", "-F", f"file=@{path};type=image/jpeg", SERVING],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def main() -> None:
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    photos = []
    for site, (ir_dir, rgb_dir, seqs) in SITES.items():
        for seq in seqs:
            ir_src = find(DRONE / ir_dir, seq, "T")
            rgb_src = find(DRONE / rgb_dir, seq, "V")
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
    OUT_JSON.write_text(json.dumps(photos, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
