from pathlib import Path
from PIL import Image
from collections import deque
import shutil

ROOT = Path(r"c:\Users\artem\Desktop\PortFol\MentOrAI\brandbook")
ASSETS = ROOT / "assets"
PRES = ROOT / "presentation"
FRONTEND = Path(r"c:\Users\artem\Desktop\PortFol\MentOrAI\frontend\assets")

PRES.mkdir(parents=True, exist_ok=True)

BG_TARGETS = [
    (240, 253, 250),
    (255, 255, 255),
    (248, 250, 252),
    (236, 253, 245),
]


def dist(c, t):
    return sum((a - b) ** 2 for a, b in zip(c[:3], t)) ** 0.5


def remove_bg(img: Image.Image, threshold=42, feather=12) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    visited = [[False] * h for _ in range(w)]
    q = deque()

    def is_bg(x, y):
        r, g, b, a = pixels[x, y]
        if a < 10:
            return True
        return min(dist((r, g, b), t) for t in BG_TARGETS) <= threshold

    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y):
                q.append((x, y))
                visited[x][y] = True
    for y in range(h):
        for x in (0, w - 1):
            if not visited[x][y] and is_bg(x, y):
                q.append((x, y))
                visited[x][y] = True

    bg_mask = [[False] * h for _ in range(w)]
    while q:
        x, y = q.popleft()
        bg_mask[x][y] = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and is_bg(nx, ny):
                visited[nx][ny] = True
                q.append((nx, ny))

    out = img.copy()
    op = out.load()
    for x in range(w):
        for y in range(h):
            if not bg_mask[x][y]:
                continue
            r, g, b, a = op[x, y]
            d = min(dist((r, g, b), t) for t in BG_TARGETS)
            if d <= threshold - feather:
                op[x, y] = (r, g, b, 0)
            else:
                alpha = int(255 * (d - (threshold - feather)) / max(feather, 1))
                alpha = max(0, min(255, alpha))
                op[x, y] = (r, g, b, alpha)
    return out


def trim_transparent(img: Image.Image, pad=12) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(img.width, r + pad)
    b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


old_pres = ASSETS / "presentation"
if old_pres.exists():
    for f in old_pres.iterdir():
        dest = PRES / f.name
        if dest.exists():
            dest.unlink()
        shutil.move(str(f), str(dest))
        print("moved presentation:", f.name)
    try:
        old_pres.rmdir()
    except OSError:
        pass

TRANSPARENT = [
    ASSETS / "logo" / "logo-mark.jpg",
    ASSETS / "logo" / "logo-wordmark.jpg",
    ASSETS / "logo" / "favicon.jpg",
    ASSETS / "ui" / "bot-avatar.jpg",
    ASSETS / "ui" / "voice-idle.jpg",
    ASSETS / "ui" / "voice-listen.jpg",
    ASSETS / "ui" / "voice-speak.jpg",
    ASSETS / "icons" / "scenario-university.jpg",
    ASSETS / "icons" / "scenario-job.jpg",
    ASSETS / "icons" / "scenario-adapt.jpg",
    ASSETS / "icons" / "feedback-correct.jpg",
    ASSETS / "icons" / "feedback-improve.jpg",
    ASSETS / "icons" / "feedback-example.jpg",
]

KEEP_BG = [
    ASSETS / "illustrations" / "hero-empty.jpg",
    ASSETS / "og" / "og-cover.jpg",
]

for f in list(PRES.glob("*.jpg")) + list(PRES.glob("*.png")):
    if f.suffix.lower() == ".png" and f.stem.startswith("slide"):
        continue
    if f.suffix.lower() == ".jpg":
        img = Image.open(f).convert("RGBA")
        out = f.with_suffix(".png")
        img.save(out, "PNG")
        print("pres png:", out.name)

for src in TRANSPARENT:
    if not src.exists():
        print("missing", src)
        continue
    thr = 48 if ("logo" in src.parts or "avatar" in src.name) else 38
    out_img = remove_bg(Image.open(src), threshold=thr)
    out_img = trim_transparent(out_img, pad=12)
    dest = src.with_suffix(".png")
    out_img.save(dest, "PNG")
    print("transparent:", dest.relative_to(ROOT), out_img.size)

for src in KEEP_BG:
    if not src.exists():
        continue
    img = Image.open(src).convert("RGBA")
    dest = src.with_suffix(".png")
    img.save(dest, "PNG")
    print("keep-bg png:", dest.relative_to(ROOT))

fe_map = {
    ASSETS / "logo": FRONTEND / "brand",
    ASSETS / "icons": FRONTEND / "icons",
    ASSETS / "ui": FRONTEND / "icons",
    ASSETS / "illustrations": FRONTEND / "brand",
    ASSETS / "og": FRONTEND / "brand",
}
for src_dir, dst_dir in fe_map.items():
    dst_dir.mkdir(parents=True, exist_ok=True)
    for png in src_dir.glob("*.png"):
        shutil.copy2(png, dst_dir / png.name)
        print("frontend:", png.name, "->", dst_dir.name)

print("DONE")
