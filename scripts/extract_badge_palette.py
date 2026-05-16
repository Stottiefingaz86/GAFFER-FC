#!/usr/bin/env python3
"""
Extract the dominant 3 colours from every PNG in `public/badges/` and
write them to `src/data/badgePalettes.json`.

The team generator reads this manifest at build time so that whenever a
club uses a hand-drawn sprite (Norwich Canaries, Manchester Sky, ...)
the kit and gradient colours match the badge — no more yellow-and-green
canary on a blue jersey.

Algorithm
---------
For each badge PNG:
  1. Load and ignore transparent + near-white + near-black pixels (the
     paper background and outlines aren't team colours).
  2. Quantise remaining pixels to a 32-colour palette using PIL's
     adaptive median-cut, which is great at preserving distinct hues.
  3. Sort palette entries by pixel count.
  4. Walk the sorted list and accept the top three colours that are
     visually distinct (CIE-ish RGB distance > 50). This avoids picking
     three near-identical greens.
  5. If the badge only has 1-2 distinct hues we pad with a contrasting
     fallback so kits always have a primary + secondary.

The output JSON is keyed by the PNG filename (e.g. `crest-ch-11.png`)
so the team generator can look it up with a single dictionary access.
"""
from __future__ import annotations

import colorsys
import json
import math
import os
from pathlib import Path
from typing import List, Tuple

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BADGES_DIR = ROOT / "public" / "badges"
OUT_PATH = ROOT / "src" / "data" / "badgePalettes.json"

# Pixels brighter than this on every channel are treated as the
# parchment / paper background.
WHITE_THRESHOLD = 235
# Pixels darker than this on every channel are treated as outline ink.
BLACK_THRESHOLD = 28
# RGB distance below which two palette entries are considered the same
# colour. CIE76 is overkill for crest art, plain RGB Euclidean works.
DISTINCT_DIST = 55
# Minimum hue separation (degrees) between two accepted colours so the
# palette doesn't end up as e.g. two near-identical yellows. Norwich
# Canaries should produce yellow + green, not yellow + pale-yellow.
DISTINCT_HUE = 28.0
# Minimum saturation/value before we consider a colour "interesting"
# enough to be a team colour. Filters near-greys.
MIN_CHROMA = 28


def is_uninteresting(pixel: Tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a < 200:  # transparent / mostly transparent
        return True
    # Near-white parchment.
    if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
        return True
    # Outline ink.
    if r <= BLACK_THRESHOLD and g <= BLACK_THRESHOLD and b <= BLACK_THRESHOLD:
        return True
    # Near-grey (low chroma) — the spread between brightest & dimmest
    # channel needs to be at least MIN_CHROMA before we call it a hue.
    if max(r, g, b) - min(r, g, b) < MIN_CHROMA:
        return True
    return False


def hex_of(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def rgb_dist(a: Tuple[int, int, int], b: Tuple[int, int, int]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def hue_deg(rgb: Tuple[int, int, int]) -> float:
    """Hue in degrees [0, 360). Pure greys return 0 but their saturation
    is ~0 so nothing depends on the value."""
    r, g, b = (c / 255.0 for c in rgb)
    h, _l, _s = colorsys.rgb_to_hls(r, g, b)
    return h * 360.0


def hue_close(a: Tuple[int, int, int], b: Tuple[int, int, int]) -> bool:
    """Two colours share a hue family (same yellow, same blue, ...)."""
    ha, hb = hue_deg(a), hue_deg(b)
    diff = abs(ha - hb)
    if diff > 180.0:
        diff = 360.0 - diff
    return diff < DISTINCT_HUE


def extract_top_colours(img_path: Path) -> List[str]:
    """Return up to three #RRGGBB hex strings, ordered by visual weight."""
    img = Image.open(img_path).convert("RGBA")
    pixels = list(img.getdata())

    # Filter out background / outline / grey pixels.
    interesting = [px for px in pixels if not is_uninteresting(px)]
    if not interesting:
        return []

    # Reproject onto an RGB image so PIL can run quantize() — adaptive
    # palette quantisation collapses clusters of similar paint strokes
    # into a single representative colour.
    only_rgb = Image.new("RGB", (len(interesting), 1))
    only_rgb.putdata([(r, g, b) for (r, g, b, _a) in interesting])
    quantised = only_rgb.quantize(colors=32, method=Image.Quantize.MEDIANCUT)
    palette = quantised.getpalette()  # flat list [r,g,b, r,g,b, ...]
    counts = quantised.getcolors()  # list of (count, palette_index)
    if not counts:
        return []
    counts.sort(reverse=True)  # highest count first

    chosen: List[Tuple[int, int, int]] = []
    for count, idx in counts:
        r, g, b = palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]
        # Belt-and-braces: the median-cut palette can still spit out
        # near-greys; reject them.
        if max(r, g, b) - min(r, g, b) < MIN_CHROMA:
            continue
        rgb = (r, g, b)
        # Reject colours too similar to ones we've already accepted —
        # both in straight RGB distance AND in hue. The hue check is
        # what stops Norwich Canaries picking pale-yellow as its second
        # colour when there's a perfectly good green sitting in the
        # palette right behind it.
        if any(rgb_dist(rgb, c) < DISTINCT_DIST for c in chosen):
            continue
        if any(hue_close(rgb, c) for c in chosen):
            continue
        chosen.append(rgb)
        if len(chosen) == 3:
            break

    # Fallback pass — if hue gating left us short of three colours,
    # relax the hue rule and just require RGB distance so we still
    # produce a usable accent slot for badges with one dominant hue.
    if len(chosen) < 3:
        for count, idx in counts:
            r, g, b = (
                palette[idx * 3],
                palette[idx * 3 + 1],
                palette[idx * 3 + 2],
            )
            if max(r, g, b) - min(r, g, b) < MIN_CHROMA:
                continue
            rgb = (r, g, b)
            if any(rgb_dist(rgb, c) < DISTINCT_DIST for c in chosen):
                continue
            chosen.append(rgb)
            if len(chosen) == 3:
                break

    return [hex_of(*rgb) for rgb in chosen]


def fallback_pair(primary_hex: str) -> Tuple[str, str]:
    """Synthesise a sensible secondary + accent if the badge had only
    one strong colour. We pick a high-contrast neutral (white) and a
    darker shade derived from the primary. Result is never identical
    to the primary, which keeps kits and gradients legible."""
    r = int(primary_hex[1:3], 16)
    g = int(primary_hex[3:5], 16)
    b = int(primary_hex[5:7], 16)
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    secondary = "#FFFFFF" if luminance < 140 else "#0E0830"
    # Accent: darker version of primary.
    dark = (max(0, r - 60), max(0, g - 60), max(0, b - 60))
    accent = hex_of(*dark)
    return secondary, accent


def main() -> None:
    if not BADGES_DIR.exists():
        raise SystemExit(f"badges dir not found: {BADGES_DIR}")

    palettes: dict[str, dict[str, str]] = {}
    files = sorted(p for p in BADGES_DIR.glob("crest-*.png"))
    print(f"scanning {len(files)} badges...")

    for img_path in files:
        try:
            colours = extract_top_colours(img_path)
        except Exception as exc:
            print(f"  ! {img_path.name}: {exc}")
            continue

        if not colours:
            print(f"  ? {img_path.name}: no usable colours, skipping")
            continue

        primary = colours[0]
        if len(colours) >= 3:
            secondary, accent = colours[1], colours[2]
        elif len(colours) == 2:
            secondary = colours[1]
            _, accent = fallback_pair(primary)
        else:
            secondary, accent = fallback_pair(primary)

        palettes[img_path.name] = {
            "primary": primary,
            "secondary": secondary,
            "accent": accent,
        }
        print(f"  ✓ {img_path.name}: {primary} / {secondary} / {accent}")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w") as fh:
        json.dump(palettes, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"wrote {len(palettes)} palettes → {OUT_PATH}")


if __name__ == "__main__":
    main()
