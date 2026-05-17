// =====================================================================
// PITCH ZONES — coordinate utilities for the new highlight system.
//
// Coordinate convention (used by Pixi viewer + animation helpers):
//
//   • Origin (0, 0) = TOP-LEFT corner of the pitch.
//   • x: 0..100 = LEFT touchline (home goal) → RIGHT touchline (away goal).
//   • y: 0..100 = TOP touchline               → BOTTOM touchline.
//
//   • Home team attacks LEFT → RIGHT  (x ascending).
//   • Away team attacks RIGHT → LEFT  (x mirrored: 100 - x).
//
// All zones are stored from the ATTACKING TEAM's perspective. The
// `zoneToPoint` helper handles the home / away mirror so callers can
// just hand it `("BOX_C", "right")` and get the right screen point.
// =====================================================================

import type { PitchLane, PitchZone, PitchThird } from "@/types/match";

/** Which way the attacking team is going (the side they're shooting
 * AT). Home attacks "right", away attacks "left". */
export type AttackingDirection = "right" | "left";

// =====================================================================
// CANONICAL ZONE GRID
//
// Pixel-perfect coordinates for a 100×100 pitch from the attacking
// team's POV (i.e. they're shooting at the right-hand goal). The
// viewer scales these to actual canvas dimensions.
//
// Layout (eyeballed for a roughly retro 2D feel — defensive third
// holds the GK + back line, attacking third opens up wider):
//
//     y =  20 ─  ATT_L  BOX_L
//              MID_L
//          DEF_L
//     y =  50 ─  ATT_C  BOX_C  GOAL
//              MID_C
//          DEF_C
//     y =  80 ─  ATT_R  BOX_R
//              MID_R
//          DEF_R
//
//          x = 12   45   72   88   98
//          (defensive third / midfield / attacking / box / goal-mouth)
// =====================================================================

interface ZonePoint {
  x: number;
  y: number;
}

/** Where each zone sits on a 100×100 pitch (attacking team POV).
 * Tuned so the centre column lands on the centre spot (y=50) and
 * the boxes hug the goal-mouth (x ~88). */
const ZONE_POINTS_RIGHT: Record<PitchZone, ZonePoint> = {
  // Defensive third — back line + holding mid lane.
  DEF_L: { x: 14, y: 22 },
  DEF_C: { x: 14, y: 50 },
  DEF_R: { x: 14, y: 78 },

  // Middle third — engine room.
  MID_L: { x: 45, y: 22 },
  MID_C: { x: 45, y: 50 },
  MID_R: { x: 45, y: 78 },

  // Attacking third — final third where chances are created.
  ATT_L: { x: 72, y: 22 },
  ATT_C: { x: 72, y: 50 },
  ATT_R: { x: 72, y: 78 },

  // Penalty-box sub-zones — narrower on y so the cluster reads as
  // "in the box" not "on the touchline".
  BOX_L: { x: 88, y: 36 },
  BOX_C: { x: 88, y: 50 },
  BOX_R: { x: 88, y: 64 },

  // Goal-mouth — used as the final ball destination on goals.
  GOAL: { x: 98, y: 50 },
};

/**
 * Convert a zone into a normalised 100×100 pitch point, mirroring x
 * for the away team so their attacking direction is right→left. The
 * viewer can then multiply by its actual width / height to draw.
 */
export function zoneToPoint(
  zone: PitchZone,
  direction: AttackingDirection,
): ZonePoint {
  const p = ZONE_POINTS_RIGHT[zone];
  if (direction === "right") return p;
  return { x: 100 - p.x, y: p.y };
}

/**
 * Mirror a zone across the centre line. Useful when the engine wants
 * the SAME zone from the opposite team's POV (e.g. an away-team event
 * generated in ATT_L lands in the home team's defensive corner).
 */
export function mirrorZone(zone: PitchZone): PitchZone {
  // Goal is the centre line of the goal — it has no "opposite" zone
  // so it sits self-mirrored (used by both teams' attacks).
  if (zone === "GOAL") return "GOAL";
  // Same vertical lane, opposite end of the pitch. Box zones flip to
  // defensive zones in the same lane (BOX_L → DEF_L) since there's no
  // "defensive box" zone in our 13-zone grid.
  switch (zone) {
    case "DEF_L": return "ATT_L";
    case "DEF_C": return "ATT_C";
    case "DEF_R": return "ATT_R";
    case "MID_L": return "MID_L";
    case "MID_C": return "MID_C";
    case "MID_R": return "MID_R";
    case "ATT_L": return "DEF_L";
    case "ATT_C": return "DEF_C";
    case "ATT_R": return "DEF_R";
    case "BOX_L": return "DEF_L";
    case "BOX_C": return "DEF_C";
    case "BOX_R": return "DEF_R";
  }
}

// =====================================================================
// LANE / THIRD HELPERS
// =====================================================================

/** Pull the lane (left/centre/right) out of a zone id. */
export function laneOf(zone: PitchZone): PitchLane {
  if (zone === "GOAL") return "C";
  if (zone.endsWith("_L")) return "L";
  if (zone.endsWith("_R")) return "R";
  return "C";
}

/** Pull the vertical third out of a zone id. */
export function thirdOf(zone: PitchZone): PitchThird {
  if (zone === "GOAL") return "GOAL";
  if (zone.startsWith("DEF")) return "DEF";
  if (zone.startsWith("MID")) return "MID";
  if (zone.startsWith("ATT")) return "ATT";
  return "BOX";
}

/** Build a zone id from a third + lane. Returns ATT_C for BOX/GOAL
 * thirds with non-centre lanes (so BOX_L stays as BOX_L). */
export function zoneOf(third: PitchThird, lane: PitchLane): PitchZone {
  if (third === "GOAL") return "GOAL";
  if (third === "BOX") {
    if (lane === "L") return "BOX_L";
    if (lane === "R") return "BOX_R";
    return "BOX_C";
  }
  if (third === "ATT") {
    if (lane === "L") return "ATT_L";
    if (lane === "R") return "ATT_R";
    return "ATT_C";
  }
  if (third === "MID") {
    if (lane === "L") return "MID_L";
    if (lane === "R") return "MID_R";
    return "MID_C";
  }
  if (lane === "L") return "DEF_L";
  if (lane === "R") return "DEF_R";
  return "DEF_C";
}

/** Centre zone for a given third — used as a fallback when the
 * generator doesn't have a strong opinion on lane. */
export function centreZoneOf(third: PitchThird): PitchZone {
  return zoneOf(third, "C");
}

// =====================================================================
// COMMENTARY HELPERS
// =====================================================================

/** Human-readable lane name for commentary ("down the left", ...). */
export function laneName(lane: PitchLane): string {
  return lane === "L" ? "left" : lane === "R" ? "right" : "centre";
}

/** Human-readable third name for commentary ("midfield", ...). */
export function thirdName(third: PitchThird): string {
  switch (third) {
    case "DEF": return "their own half";
    case "MID": return "midfield";
    case "ATT": return "the final third";
    case "BOX": return "the box";
    case "GOAL": return "the goalmouth";
  }
}
