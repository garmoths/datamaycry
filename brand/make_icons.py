"""Make every logo file from brand/logo-source.webp (the artwork on a flat slate background).

    cd worker && uv run --with pillow python ../brand/make_icons.py

Background removal: the backdrop is one flat colour (~RGB 51 61 70, noise < 1), so each pixel's
opacity comes from its colour distance to it, with a soft ramp for anti-aliased edges, and the
colour is un-mixed from the backdrop. The gaps between the lines become transparent too.

Outputs (sizes follow the usual web / iOS / Android / PWA conventions):
  brand/logo.png                 1024 px, transparent, cropped to the sphere (master)
  web/public/  and presentation/public/:
    favicon.ico                  16 + 32 + 48 px, transparent
    favicon-16.png, favicon-32.png, favicon-48.png
    apple-touch-icon.png         180 px, opaque dark background (iOS fills transparency with black)
    icon-192.png, icon-512.png   transparent (PWA "any")
    icon-maskable-512.png        opaque, logo inside the 80 % safe zone (PWA "maskable")
    logo.png                     512 px transparent, for the slides
    logo-128.png                 128 px transparent, for the app's top bar (≈ 30 px on screen, sharp up to 4×)
Written with AI assistance (Claude).
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "brand" / "logo-source.webp"
OUT_DIRS = [ROOT / "web" / "public", ROOT / "presentation" / "public"]
BG_APP = (11, 13, 22)  # the app's night background, for opaque icons


def remove_background(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.float64)
    h, w, _ = a.shape
    border = np.concatenate([a[:24].reshape(-1, 3), a[-24:].reshape(-1, 3), a[:, :24].reshape(-1, 3), a[:, -24:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    t0, t1 = 10.0, 70.0  # below t0: backdrop; above t1: fully the artwork
    alpha = np.clip((dist - t0) / (t1 - t0), 0, 1)
    # un-mix: observed = alpha·colour + (1 − alpha)·bg
    safe = np.where(alpha > 1e-3, alpha, 1)[..., None]
    rgb = np.clip((a - (1 - alpha[..., None]) * bg) / safe, 0, 255)
    rgb[alpha <= 1e-3] = 0
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def crop_square(img: Image.Image, pad: float = 0.03) -> Image.Image:
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.where(alpha > 40)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    side = max(x1 - x0, y1 - y0)
    side = int(side * (1 + 2 * pad))
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img.crop(box), (0, 0))
    return canvas


def small(img: Image.Image, size: int) -> Image.Image:
    """Tiny sizes: thin lines fade when downscaled; lift their opacity a little."""
    s = img.resize((size, size), Image.LANCZOS)
    if size <= 48:
        arr = np.asarray(s).astype(np.float64)
        arr[..., 3] = 255 * (arr[..., 3] / 255) ** 0.75
        s = Image.fromarray(arr.astype(np.uint8), "RGBA")
    return s


def on_background(img: Image.Image, size: int, scale: float) -> Image.Image:
    bg = Image.new("RGBA", (size, size), BG_APP + (255,))
    inner = int(size * scale)
    logo = img.resize((inner, inner), Image.LANCZOS)
    bg.alpha_composite(logo, ((size - inner) // 2, (size - inner) // 2))
    return bg.convert("RGB")


def main() -> None:
    master = crop_square(remove_background(Image.open(SRC)))
    master = master.resize((1024, 1024), Image.LANCZOS)
    master.save(ROOT / "brand" / "logo.png", optimize=True)
    for out in OUT_DIRS:
        out.mkdir(parents=True, exist_ok=True)
        for s in (16, 32, 48):
            small(master, s).save(out / f"favicon-{s}.png", optimize=True)
        small(master, 48).save(out / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
        on_background(master, 180, 0.86).save(out / "apple-touch-icon.png", optimize=True)
        master.resize((192, 192), Image.LANCZOS).save(out / "icon-192.png", optimize=True)
        master.resize((512, 512), Image.LANCZOS).save(out / "icon-512.png", optimize=True)
        on_background(master, 512, 0.74).save(out / "icon-maskable-512.png", optimize=True)
        master.resize((512, 512), Image.LANCZOS).save(out / "logo.png", optimize=True)
        master.resize((128, 128), Image.LANCZOS).save(out / "logo-128.png", optimize=True)
        print(f"→ {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
