"use client";

// =====================================================================
// <TeamCrest /> — preferred way to render a club identity in the UI.
//
// Each club may carry a `crestSprite` filename (a hand-drawn PNG sliced
// from the user's spritesheet). When present, we use that image. When
// absent — old saves, custom user clubs, the placeholder champion clubs
// in cup draws, etc. — we fall back to the procedural <Badge /> SVG so
// no UI ever has to deal with a missing crest.
// =====================================================================

import Image from "next/image";
import type { Club } from "@/types/game";
import { Badge } from "@/components/game/Badge";

interface TeamCrestProps {
  club: Pick<Club, "badge" | "crestSprite"> & { name?: string };
  size?: number;
  className?: string;
}

export function TeamCrest({ club, size = 64, className }: TeamCrestProps) {
  if (club.crestSprite) {
    return (
      <Image
        src={`/badges/${club.crestSprite}`}
        alt={club.name ?? "Club crest"}
        width={size}
        height={size}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          imageRendering: "auto",
        }}
        unoptimized
      />
    );
  }
  return <Badge badge={club.badge} size={size} className={className} />;
}
