"use client";

// =====================================================================
// <UiSoundLayer /> — invisible client component that listens for clicks
// on the document and plays a soft click sound whenever the user hits a
// button (anything with a `.btn` class, or a real <button> / [role=tab]).
//
// Mounting it once at the root of the app means we don't have to wire
// onClick handlers into every component just for SFX. Mute and volume
// are managed centrally by lib/sound.ts.
// =====================================================================

import { useEffect } from "react";
import { playSfx } from "@/lib/sound";

export function UiSoundLayer() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Only fire when the actual interactive control was clicked (not
      // surrounding text or layout). `closest` walks up from the click
      // target to find the nearest button-like element.
      const hit = target.closest(
        "button, .btn, .tab, [role='tab'], [role='button'], a.btn"
      ) as HTMLElement | null;
      if (!hit) return;
      // Skip disabled controls — they shouldn't tick if no action runs.
      if (hit.hasAttribute("disabled")) return;
      if (hit.getAttribute("aria-disabled") === "true") return;
      playSfx("buttonPress");
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
