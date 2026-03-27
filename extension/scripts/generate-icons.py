#!/usr/bin/env python3
"""Generate PNG toolbar icons (magnifying glass motif). Run: python3 generate-icons.py"""
from __future__ import annotations

import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit("Install Pillow: pip install pillow")

ROOT = Path(__file__).resolve().parent.parent / "icons"


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(1, size // 16)
    # Deep teal background, rounded
    bg = (18, 100, 120, 255)
    d.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=max(2, size // 6),
        fill=bg,
    )
    # Magnifying glass (white)
    cx, cy = size * 0.38, size * 0.38
    r = size * 0.20
    lw = max(2, size // 10)
    d.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        outline=(255, 255, 255, 255),
        width=lw,
    )
    ang = math.pi / 4
    x1 = cx + r * math.cos(ang) * 0.85
    y1 = cy + r * math.sin(ang) * 0.85
    x2 = cx + r * 2.35 * math.cos(ang)
    y2 = cy + r * 2.35 * math.sin(ang)
    d.line([(x1, y1), (x2, y2)], fill=(255, 255, 255, 255), width=lw)
    # Small accent dot = "finding" an opportunity
    dot_r = max(1, size // 28)
    d.ellipse(
        [size * 0.62 - dot_r, size * 0.28 - dot_r, size * 0.62 + dot_r, size * 0.28 + dot_r],
        fill=(255, 214, 102, 255),
    )
    return img


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for s in (16, 48, 128):
        draw_icon(s).save(ROOT / f"icon{s}.png", format="PNG")
    print("Wrote icon16.png, icon48.png, icon128.png ->", ROOT)


if __name__ == "__main__":
    main()
