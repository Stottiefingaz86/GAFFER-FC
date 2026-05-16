// =====================================================================
// FORMATIONS — slot positions are normalised in 0..1 space.
// (x = left→right, y = back→forward, with home team attacking up)
// =====================================================================

import type { DetailedPosition, Formation, FormationKey } from "@/types/game";

const slot = (id: string, position: DetailedPosition, x: number, y: number) => ({
  id,
  position,
  x,
  y,
});

export const FORMATIONS: Record<FormationKey, Formation> = {
  "4-4-2": {
    key: "4-4-2",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("lm", "LM", 0.13, 0.55),
      slot("lcm", "CM", 0.38, 0.55),
      slot("rcm", "CM", 0.62, 0.55),
      slot("rm", "RM", 0.87, 0.55),
      slot("ls", "ST", 0.38, 0.85),
      slot("rs", "ST", 0.62, 0.85),
    ],
  },
  "4-3-3": {
    key: "4-3-3",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("dm", "DM", 0.5, 0.45),
      slot("lcm", "CM", 0.3, 0.6),
      slot("rcm", "CM", 0.7, 0.6),
      slot("lw", "LW", 0.15, 0.85),
      slot("st", "ST", 0.5, 0.9),
      slot("rw", "RW", 0.85, 0.85),
    ],
  },
  "3-5-2": {
    key: "3-5-2",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lcb", "CB", 0.28, 0.22),
      slot("ccb", "CB", 0.5, 0.2),
      slot("rcb", "CB", 0.72, 0.22),
      slot("lwb", "LB", 0.1, 0.5),
      slot("rwb", "RB", 0.9, 0.5),
      slot("lcm", "CM", 0.32, 0.55),
      slot("ccm", "CM", 0.5, 0.55),
      slot("rcm", "CM", 0.68, 0.55),
      slot("ls", "ST", 0.38, 0.85),
      slot("rs", "ST", 0.62, 0.85),
    ],
  },
  "4-2-3-1": {
    key: "4-2-3-1",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("ldm", "DM", 0.38, 0.45),
      slot("rdm", "DM", 0.62, 0.45),
      slot("lam", "AM", 0.2, 0.7),
      slot("cam", "AM", 0.5, 0.7),
      slot("ram", "AM", 0.8, 0.7),
      slot("st", "ST", 0.5, 0.9),
    ],
  },
  "5-3-2": {
    key: "5-3-2",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lwb", "LB", 0.1, 0.3),
      slot("lcb", "CB", 0.3, 0.22),
      slot("ccb", "CB", 0.5, 0.2),
      slot("rcb", "CB", 0.7, 0.22),
      slot("rwb", "RB", 0.9, 0.3),
      slot("lcm", "CM", 0.3, 0.55),
      slot("ccm", "CM", 0.5, 0.55),
      slot("rcm", "CM", 0.7, 0.55),
      slot("ls", "ST", 0.38, 0.85),
      slot("rs", "ST", 0.62, 0.85),
    ],
  },
  "4-5-1": {
    key: "4-5-1",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("lm", "LM", 0.1, 0.55),
      slot("lcm", "CM", 0.32, 0.55),
      slot("ccm", "CM", 0.5, 0.55),
      slot("rcm", "CM", 0.68, 0.55),
      slot("rm", "RM", 0.9, 0.55),
      slot("st", "ST", 0.5, 0.9),
    ],
  },
  // Anchor + flat band of four ahead of him — solid out of possession,
  // late runs from the wide pair on the break.
  "4-1-4-1": {
    key: "4-1-4-1",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("dm", "DM", 0.5, 0.42),
      slot("lm", "LM", 0.13, 0.62),
      slot("lcm", "CM", 0.38, 0.6),
      slot("rcm", "CM", 0.62, 0.6),
      slot("rm", "RM", 0.87, 0.62),
      slot("st", "ST", 0.5, 0.9),
    ],
  },
  // Three at the back, attacking front three — high-tempo, wing-back
  // dependent shape that lives or dies by the wide pair's stamina.
  "3-4-3": {
    key: "3-4-3",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lcb", "CB", 0.28, 0.22),
      slot("ccb", "CB", 0.5, 0.2),
      slot("rcb", "CB", 0.72, 0.22),
      slot("lwb", "LB", 0.1, 0.5),
      slot("lcm", "CM", 0.38, 0.55),
      slot("rcm", "CM", 0.62, 0.55),
      slot("rwb", "RB", 0.9, 0.5),
      slot("lw", "LW", 0.18, 0.85),
      slot("st", "ST", 0.5, 0.9),
      slot("rw", "RW", 0.82, 0.85),
    ],
  },
  // Narrow midfield diamond — DM at the base, two interior CMs, AM at
  // the tip. Two strikers up top. Compact in the centre, exposed wide.
  "4-1-2-1-2": {
    key: "4-1-2-1-2",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("dm", "DM", 0.5, 0.42),
      slot("lcm", "CM", 0.32, 0.6),
      slot("rcm", "CM", 0.68, 0.6),
      slot("am", "AM", 0.5, 0.75),
      slot("ls", "ST", 0.4, 0.9),
      slot("rs", "ST", 0.6, 0.9),
    ],
  },
  // Park-the-bus shape — back five and a midfield four behind the lone
  // striker. Defensive minded in every phase.
  "5-4-1": {
    key: "5-4-1",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lwb", "LB", 0.1, 0.3),
      slot("lcb", "CB", 0.3, 0.22),
      slot("ccb", "CB", 0.5, 0.2),
      slot("rcb", "CB", 0.7, 0.22),
      slot("rwb", "RB", 0.9, 0.3),
      slot("lm", "LM", 0.15, 0.55),
      slot("lcm", "CM", 0.38, 0.55),
      slot("rcm", "CM", 0.62, 0.55),
      slot("rm", "RM", 0.85, 0.55),
      slot("st", "ST", 0.5, 0.9),
    ],
  },
  // Classic British 4-4-1-1 — a second striker drops between the lines
  // to link play. Lone forward up top.
  "4-4-1-1": {
    key: "4-4-1-1",
    slots: [
      slot("gk", "GK", 0.5, 0.05),
      slot("lb", "LB", 0.15, 0.25),
      slot("lcb", "CB", 0.38, 0.22),
      slot("rcb", "CB", 0.62, 0.22),
      slot("rb", "RB", 0.85, 0.25),
      slot("lm", "LM", 0.13, 0.55),
      slot("lcm", "CM", 0.38, 0.55),
      slot("rcm", "CM", 0.62, 0.55),
      slot("rm", "RM", 0.87, 0.55),
      slot("am", "AM", 0.5, 0.75),
      slot("st", "ST", 0.5, 0.92),
    ],
  },
};

export const FORMATION_KEYS: FormationKey[] = [
  "4-4-2",
  "4-3-3",
  "3-5-2",
  "4-2-3-1",
  "5-3-2",
  "4-5-1",
  "4-1-4-1",
  "3-4-3",
  "4-1-2-1-2",
  "5-4-1",
  "4-4-1-1",
];

export function detailedToBroad(p: DetailedPosition): "GK" | "DEF" | "MID" | "FWD" {
  if (p === "GK") return "GK";
  if (p === "CB" || p === "LB" || p === "RB") return "DEF";
  if (p === "DM" || p === "CM" || p === "AM" || p === "LM" || p === "RM") return "MID";
  return "FWD";
}

/**
 * Snap an arbitrary (x, y) on the pitch to the closest tactical
 * position label. Used by the drag-to-reposition flow on the tactics
 * board so dragging a CM up gets relabelled as AM, dragging the RM
 * higher gets relabelled as RW, etc.
 *
 * Coordinates are in formation-space (0..1, with y=0 near own goal,
 * y=1 attacking up). Bands are slightly biased toward the centre line
 * because real pitches feel that way — the wings only really kick in
 * past ~70% of the half-width.
 */
export function detailedPositionForCoord(
  x: number,
  y: number,
): DetailedPosition {
  // Goalkeeper zone — anything sitting on top of the GK area.
  if (y < 0.12) return "GK";

  const wide = x < 0.18 || x > 0.82;     // out-and-out wing channels
  const halfSpace = x < 0.32 || x > 0.68; // half-spaces / fullback corridors

  // Bands of the pitch, back-to-front:
  //   defence (≤ 0.32) → DM band → CM band → AM band → forward line.
  if (y < 0.32) {
    // Back four — wide channels become full-backs, otherwise CB.
    if (halfSpace) return x < 0.5 ? "LB" : "RB";
    return "CB";
  }
  if (y < 0.5) {
    // Holding band.
    if (wide) return x < 0.5 ? "LM" : "RM";
    return "DM";
  }
  if (y < 0.68) {
    // Central midfield band.
    if (wide) return x < 0.5 ? "LM" : "RM";
    return "CM";
  }
  if (y < 0.82) {
    // Attacking midfield / inverted-wing band.
    if (wide) return x < 0.5 ? "LW" : "RW";
    return "AM";
  }
  // Forward line.
  if (wide) return x < 0.5 ? "LW" : "RW";
  // Pure central forward area — pull back slightly to CF if the
  // player isn't pinned to the very top, otherwise classic ST.
  return y > 0.92 ? "ST" : "CF";
}

/** Clamp x/y into the playable pitch area we expose to the user.
 * Leaves a small inset so tokens never sit on the touchline. */
export function clampPitchCoord(x: number, y: number): {
  x: number;
  y: number;
} {
  return {
    x: Math.max(0.05, Math.min(0.95, x)),
    // y starts at 0.06 to keep field players above the GK zone, and
    // tops out at 0.95 so they can't sit on the opposition keeper.
    y: Math.max(0.06, Math.min(0.95, y)),
  };
}
