"""Build assets/cover_B_0647.jpg: centre 16:9 crop of the Yeonggwang B_0647 thermal photo blended with navy #0B2C5C at 42%.
Run from the assets/ directory: uv run --no-project --with pillow python -I ../scripts/make_cover.py
"""
from PIL import Image
im = Image.open('B_0647_T.jpg').convert('RGB')
crop = im.crop((0, 76, 640, 436))
navy = Image.new('RGB', crop.size, (11, 44, 92))
out = Image.blend(crop, navy, 0.42).resize((1280, 720), Image.LANCZOS)
out.save('cover_B_0647.jpg', quality=92)
print(out.size)
