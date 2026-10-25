#!/usr/bin/env python3
"""Generate the app icons from Bryan's logo (docs/reference/app-logo.png).

    python3 tools/make-icons.py

The logo has a transparent background. iOS fills transparency on the home
screen with black, so every icon here sits on white with a margin around
the artwork; the maskable icons keep the art inside the 80% safe zone.
Idempotent: safe to re-run after replacing the logo.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "reference" / "app-logo.png"
OUT = ROOT / "icons"
WHITE = (255, 255, 255, 255)


def on_white(size: int, art_share: float) -> Image.Image:
    logo = Image.open(SRC).convert("RGBA")
    box = logo.getbbox()
    if box:
        logo = logo.crop(box)
    side = round(size * art_share)
    scale = side / max(logo.size)
    art = logo.resize((max(1, round(logo.width * scale)), max(1, round(logo.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), WHITE)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in (192, 512):
        on_white(size, 0.84).convert("RGB").save(OUT / f"icon-{size}.png", optimize=True)
        on_white(size, 0.66).convert("RGB").save(OUT / f"icon-maskable-{size}.png", optimize=True)
    on_white(180, 0.80).convert("RGB").save(OUT / "apple-touch-icon-180.png", optimize=True)
    on_white(32, 0.92).convert("RGB").save(OUT / "favicon-32.png", optimize=True)
    on_white(64, 0.92).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
