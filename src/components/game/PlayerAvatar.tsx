"use client";

// =====================================================================
// <PlayerAvatar /> — picks 1 of 50 hand-drawn portraits from
// /public/avatars/ (one PNG per slot). The slot is chosen
// deterministically from the player id so the same player always shows
// the same face across reloads, fixtures, and screens.
// =====================================================================

import Image from "next/image";

interface PlayerAvatarProps {
  /** Player id — used to pick a deterministic avatar slot 0..49. */
  playerId: string;
  /** Display width in px. Height auto-derives at the cell's portrait ratio. */
  width?: number;
  /** Optional border colour around the portrait. */
  border?: string;
  className?: string;
  /** Background fill behind the portrait. Used as a fallback while the
   * image loads or if `objectFit: cover` ever leaves a sub-pixel gap. */
  tint?: string;
}

const TOTAL = 50; // /public/avatars/avatar-00.png .. avatar-49.png

/**
 * Pick a slot 0..(TOTAL-1) deterministically from a string id.
 * (FNV-like hash, stable across reloads.)
 */
function avatarSlotFor(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % TOTAL;
}

export function PlayerAvatar({
  playerId,
  width = 36,
  border = "rgba(0,0,0,0.45)",
  className,
  // Solid dark fill — never want to see the parent gradient bleed through
  // the corners of the tile. This colour also harmonises with the panel
  // backgrounds across the app.
  tint = "var(--ss-bg-deep)",
}: PlayerAvatarProps) {
  const slot = avatarSlotFor(playerId);
  const slotStr = slot.toString().padStart(2, "0");

  // Source cells vary slightly in size (129–130 × 181–186 px) so a
  // single fixed ratio + `objectFit: contain` letterboxes inconsistently
  // and the parent gradient bleeds through the corners. Instead we
  // anchor at a 1.42 ratio (median of the source) and use `cover` with
  // `top` alignment, so the head is always pinned and any tiny excess
  // gets cropped off the chest — never the face.
  const height = Math.round(width * 1.42);

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width,
        height,
        backgroundColor: tint,
        border: `1px solid ${border}`,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
      aria-hidden
    >
      <Image
        src={`/avatars/avatar-${slotStr}.png`}
        alt=""
        width={width}
        height={height}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          imageRendering: "pixelated",
          display: "block",
        }}
        unoptimized
      />
    </span>
  );
}
