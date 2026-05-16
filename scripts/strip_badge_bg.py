"""
Strip the baked-in white background from every crest in
`public/badges/`.

The originals are RGBA but every "transparent" corner pixel is actually
solid `(247, 247, 247, 255)`, so the renderer was painting a white
square behind every shield. We walk a flood-fill from each corner,
clearing any pixel that's near-white *and* reachable from a corner via
similarly-near-white neighbours. That preserves any legitimate white
*inside* the crest (e.g. white stripes on a kit, white lettering on a
banner).

A two-tier threshold gives us a soft anti-alias edge:

  - whiteness >= HARD  → alpha set to 0 (fully transparent)
  - SOFT <= whiteness < HARD → alpha faded linearly toward 0 (anti-alias)

Reversible: the first time we touch a file we copy the original to
`public/badges/_orig/<name>.png`. Re-running the script never
overwrites the backup.

Usage:

    python3 scripts/strip_badge_bg.py
"""

from __future__ import annotations

import os
import shutil
from collections import deque
from typing import Tuple

from PIL import Image

BADGE_DIR = "public/badges"
BACKUP_DIR = os.path.join(BADGE_DIR, "_orig")

HARD_THRESHOLD = 235   # min(R,G,B) >= this → fully transparent
SOFT_THRESHOLD = 200   # min(R,G,B) >= this → considered "background-ish"


def whiteness(px: Tuple[int, int, int, int]) -> int:
    """Return the smallest of R/G/B — anything still vaguely coloured
    will have a low minimum (e.g. yellow `(255, 200, 0)` → 0)."""
    return min(px[0], px[1], px[2])


def strip(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    if pixels is None:
        return img
    w, h = img.size
    visited = [[False] * h for _ in range(w)]
    q: deque[Tuple[int, int]] = deque()

    # Seed the queue from every corner that's currently background-ish.
    for cx, cy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        cpx = pixels[cx, cy]
        if cpx[3] > 0 and whiteness(cpx) >= SOFT_THRESHOLD:
            q.append((cx, cy))
            visited[cx][cy] = True

    while q:
        x, y = q.popleft()
        r, g, b, a = pixels[x, y]
        wness = whiteness((r, g, b, a))
        if wness >= HARD_THRESHOLD:
            pixels[x, y] = (r, g, b, 0)
        else:
            # Linear fade across the soft band — fully visible at SOFT,
            # fully transparent at HARD. Keeps the colour intact so the
            # remaining visible fringe still matches the crest.
            t = (wness - SOFT_THRESHOLD) / (HARD_THRESHOLD - SOFT_THRESHOLD)
            new_alpha = int(a * (1 - t))
            pixels[x, y] = (r, g, b, max(0, min(255, new_alpha)))

        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            if visited[nx][ny]:
                continue
            npx = pixels[nx, ny]
            if npx[3] > 0 and whiteness(npx) >= SOFT_THRESHOLD:
                visited[nx][ny] = True
                q.append((nx, ny))

    return img


def main() -> None:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    names = [n for n in sorted(os.listdir(BADGE_DIR)) if n.endswith(".png")]
    print(f"Stripping {len(names)} crests in {BADGE_DIR}/")

    touched = 0
    for name in names:
        src = os.path.join(BADGE_DIR, name)
        bak = os.path.join(BACKUP_DIR, name)

        # Back up the original once. Subsequent runs skip the copy so we
        # always know the baseline pre-script state.
        if not os.path.exists(bak):
            shutil.copy2(src, bak)

        # Always operate on the backup so re-runs are idempotent — we
        # don't fade the same pixel twice.
        img = Image.open(bak)
        stripped = strip(img)
        stripped.save(src, format="PNG")
        touched += 1

    print(f"Done — wrote {touched} files. Backups in {BACKUP_DIR}/")


if __name__ == "__main__":
    main()
