// =====================================================================
// FORMATION ENGINE — formation shape registry + dynamic shape shifts.
//
// Provides the new Pixi-based MatchViewer (and the highlight generator
// underneath it) with a small but complete set of formation layouts.
// Each formation maps to 11 named slots with x/y in 0..100 own-end →
// opponents'-end coordinates from the team's POV. The viewer mirrors
// x for the away team via the AttackingDirection parameter.
//
// On top of the static layouts we expose `getShiftedTeamShape` which
// nudges the whole shape forward when the team is attacking, back when
// they're defending, and laterally to track the ball — making the
// frozen formation feel alive between highlights.
//
// This is intentionally lightweight: there is no per-player decision
// logic here. That intelligence lives in `highlightGenerator.ts` and
// in the viewer itself; this file just hands out positions.
// =====================================================================

import type {
  FormationKey,
  FormationSlot,
  PitchZone,
  TeamPhase,
} from "@/types/match";
import { type AttackingDirection, laneOf, thirdOf } from "@/utils/pitchZones";

// =====================================================================
// STATIC FORMATION TEMPLATES
//
// Coordinates use the attacking-team POV (x grows toward the opposing
// goal). Y is laid out 20→80 across the width so wide players genuinely
// hug the touchlines without sitting outside the pitch.
// =====================================================================

const F_4_4_2: FormationSlot[] = [
  { id: "GK",  role: "GK",  detail: "GK", x: 8,  y: 50 },
  { id: "LB",  role: "DEF", detail: "LB", x: 22, y: 20 },
  { id: "CB1", role: "DEF", detail: "CB", x: 20, y: 42 },
  { id: "CB2", role: "DEF", detail: "CB", x: 20, y: 58 },
  { id: "RB",  role: "DEF", detail: "RB", x: 22, y: 80 },
  { id: "LM",  role: "MID", detail: "LM", x: 45, y: 22 },
  { id: "CM1", role: "MID", detail: "CM", x: 48, y: 43 },
  { id: "CM2", role: "MID", detail: "CM", x: 48, y: 57 },
  { id: "RM",  role: "MID", detail: "RM", x: 45, y: 78 },
  { id: "ST1", role: "FWD", detail: "ST", x: 72, y: 43 },
  { id: "ST2", role: "FWD", detail: "ST", x: 72, y: 57 },
];

const F_4_3_3: FormationSlot[] = [
  { id: "GK",  role: "GK",  detail: "GK", x: 8,  y: 50 },
  { id: "LB",  role: "DEF", detail: "LB", x: 22, y: 20 },
  { id: "CB1", role: "DEF", detail: "CB", x: 20, y: 42 },
  { id: "CB2", role: "DEF", detail: "CB", x: 20, y: 58 },
  { id: "RB",  role: "DEF", detail: "RB", x: 22, y: 80 },
  { id: "DM",  role: "MID", detail: "DM", x: 38, y: 50 },
  { id: "CM1", role: "MID", detail: "CM", x: 50, y: 35 },
  { id: "CM2", role: "MID", detail: "CM", x: 50, y: 65 },
  { id: "LW",  role: "FWD", detail: "LW", x: 70, y: 22 },
  { id: "ST",  role: "FWD", detail: "ST", x: 75, y: 50 },
  { id: "RW",  role: "FWD", detail: "RW", x: 70, y: 78 },
];

const F_3_5_2: FormationSlot[] = [
  { id: "GK",  role: "GK",  detail: "GK", x: 8,  y: 50 },
  { id: "CB1", role: "DEF", detail: "CB", x: 22, y: 28 },
  { id: "CB2", role: "DEF", detail: "CB", x: 20, y: 50 },
  { id: "CB3", role: "DEF", detail: "CB", x: 22, y: 72 },
  { id: "LM",  role: "MID", detail: "LM", x: 45, y: 14 },
  { id: "DM",  role: "MID", detail: "DM", x: 40, y: 40 },
  { id: "CM",  role: "MID", detail: "CM", x: 50, y: 50 },
  { id: "AM",  role: "MID", detail: "AM", x: 58, y: 60 },
  { id: "RM",  role: "MID", detail: "RM", x: 45, y: 86 },
  { id: "ST1", role: "FWD", detail: "ST", x: 75, y: 42 },
  { id: "ST2", role: "FWD", detail: "ST", x: 75, y: 58 },
];

const F_4_2_3_1: FormationSlot[] = [
  { id: "GK",  role: "GK",  detail: "GK", x: 8,  y: 50 },
  { id: "LB",  role: "DEF", detail: "LB", x: 22, y: 20 },
  { id: "CB1", role: "DEF", detail: "CB", x: 20, y: 42 },
  { id: "CB2", role: "DEF", detail: "CB", x: 20, y: 58 },
  { id: "RB",  role: "DEF", detail: "RB", x: 22, y: 80 },
  { id: "DM1", role: "MID", detail: "DM", x: 38, y: 42 },
  { id: "DM2", role: "MID", detail: "DM", x: 38, y: 58 },
  { id: "AML", role: "MID", detail: "AM", x: 58, y: 24 },
  { id: "AMC", role: "MID", detail: "AM", x: 60, y: 50 },
  { id: "AMR", role: "MID", detail: "AM", x: 58, y: 76 },
  { id: "ST",  role: "FWD", detail: "ST", x: 76, y: 50 },
];

const F_5_3_2: FormationSlot[] = [
  { id: "GK",  role: "GK",  detail: "GK", x: 8,  y: 50 },
  { id: "LB",  role: "DEF", detail: "LB", x: 24, y: 14 },
  { id: "CB1", role: "DEF", detail: "CB", x: 20, y: 34 },
  { id: "CB2", role: "DEF", detail: "CB", x: 18, y: 50 },
  { id: "CB3", role: "DEF", detail: "CB", x: 20, y: 66 },
  { id: "RB",  role: "DEF", detail: "RB", x: 24, y: 86 },
  { id: "CM1", role: "MID", detail: "CM", x: 46, y: 35 },
  { id: "DM",  role: "MID", detail: "DM", x: 42, y: 50 },
  { id: "CM2", role: "MID", detail: "CM", x: 46, y: 65 },
  { id: "ST1", role: "FWD", detail: "ST", x: 73, y: 42 },
  { id: "ST2", role: "FWD", detail: "ST", x: 73, y: 58 },
];

const F_4_5_1: FormationSlot[] = [
  { id: "GK",  role: "GK",  detail: "GK", x: 8,  y: 50 },
  { id: "LB",  role: "DEF", detail: "LB", x: 22, y: 20 },
  { id: "CB1", role: "DEF", detail: "CB", x: 20, y: 42 },
  { id: "CB2", role: "DEF", detail: "CB", x: 20, y: 58 },
  { id: "RB",  role: "DEF", detail: "RB", x: 22, y: 80 },
  { id: "LM",  role: "MID", detail: "LM", x: 48, y: 18 },
  { id: "CM1", role: "MID", detail: "CM", x: 46, y: 38 },
  { id: "CM2", role: "MID", detail: "CM", x: 46, y: 62 },
  { id: "RM",  role: "MID", detail: "RM", x: 48, y: 82 },
  { id: "AM",  role: "MID", detail: "AM", x: 58, y: 50 },
  { id: "ST",  role: "FWD", detail: "ST", x: 75, y: 50 },
];

const FORMATION_TEMPLATES: Record<FormationKey, FormationSlot[]> = {
  "4-4-2": F_4_4_2,
  "4-3-3": F_4_3_3,
  "3-5-2": F_3_5_2,
  "4-2-3-1": F_4_2_3_1,
  "5-3-2": F_5_3_2,
  "4-5-1": F_4_5_1,
};

/** Public list of supported formations — handy for pickers / UI. */
export const SUPPORTED_FORMATIONS: ReadonlyArray<FormationKey> = Object.keys(
  FORMATION_TEMPLATES,
) as FormationKey[];

// =====================================================================
// PUBLIC API
// =====================================================================

/** Return the static home-position template for a formation. The
 * result is a fresh copy so callers can mutate freely. Falls back to
 * 4-4-2 for unknown / legacy formation strings. */
export function getFormationPositions(
  formation: FormationKey | string,
): FormationSlot[] {
  const template = FORMATION_TEMPLATES[formation as FormationKey] ?? F_4_4_2;
  // Deep-ish copy — slot objects are read-only conceptually so we
  // clone each one to keep mutation safe on the caller's side.
  return template.map((s) => ({ ...s }));
}

/** Convert a formation slot's own-POV coords into a viewer-space
 * point, applying the away-team x mirror via `direction`. */
export function slotToPoint(slot: FormationSlot, direction: AttackingDirection): {
  x: number;
  y: number;
} {
  // We reuse zoneToPoint's directional logic via a synthetic zone-like
  // mirror — the slot coords are already in the attacking POV so we
  // mirror x only when direction === "left".
  if (direction === "right") return { x: slot.x, y: slot.y };
  return { x: 100 - slot.x, y: slot.y };
}

// =====================================================================
// SHAPE-SHIFT — make a static formation breathe.
//
// Three knobs:
//   • phase ("attack" pushes the whole shape forward, "defend" pulls
//     it back) — applied to x.
//   • ballZone — the team shifts laterally toward whichever lane the
//     ball is currently in (small ±5 y nudge).
//   • role-aware nudges — fullbacks overlap further forward when
//     attacking; wingers cut inside when attacking centre; defenders
//     narrow when defending. These give the shape character beyond
//     a flat translate.
// =====================================================================

const PHASE_X_SHIFT: Record<TeamPhase, number> = {
  neutral: 0,
  attack: 10,
  defend: -10,
};

const PHASE_X_BOUNDS: Record<TeamPhase, { min: number; max: number }> = {
  neutral: { min: 6, max: 92 },
  attack:  { min: 10, max: 95 },
  defend:  { min: 4,  max: 80 },
};

/** Returns a NEW array of slots shifted to reflect phase + ball lane.
 * Original input is never mutated.
 *
 * `ballZone` is in the attacking team's POV — when calling for the
 * defending team you can mirror first or just pass "centre" zones if
 * you only want phase + role-based shifts. */
export function getShiftedTeamShape(
  basePositions: FormationSlot[],
  ballZone: PitchZone | null,
  phase: TeamPhase,
): FormationSlot[] {
  const xShift = PHASE_X_SHIFT[phase];
  const bounds = PHASE_X_BOUNDS[phase];

  // Lateral nudge based on which lane the ball is in. Both teams
  // shift slightly toward the lane so wingers stay close to play.
  const yShift = (() => {
    if (!ballZone) return 0;
    const lane = laneOf(ballZone);
    if (lane === "L") return -4;
    if (lane === "R") return 4;
    return 0;
  })();

  // Closer to the goal-mouth = stronger shift (compresses the shape
  // toward the box on attack, near our own box on defend).
  const ballThird = ballZone ? thirdOf(ballZone) : "MID";
  const boxBoost = ballThird === "BOX" || ballThird === "GOAL"
    ? phase === "attack" ? 4 : phase === "defend" ? -4 : 0
    : 0;

  return basePositions.map((slot) => {
    let x = slot.x + xShift + boxBoost;
    let y = slot.y + yShift;

    // Role-specific nudges. We keep these small (≤5 units) so the
    // shape stays recognisable.
    switch (slot.detail) {
      case "LB":
      case "RB":
        // Fullbacks overlap when attacking, tuck in when defending.
        if (phase === "attack") x += 8;
        if (phase === "defend") x -= 2;
        break;
      case "LW":
      case "RW":
      case "LM":
      case "RM":
        // Wingers cut inside slightly on attack toward the centre,
        // hold width on defend.
        if (phase === "attack" && slot.y < 50) y += 3;
        if (phase === "attack" && slot.y > 50) y -= 3;
        break;
      case "AM":
        if (phase === "attack") x += 4;
        break;
      case "DM":
        if (phase === "defend") x -= 2;
        break;
      case "CB":
        // Centre-backs narrow on defend, hold the line on attack.
        if (phase === "defend" && slot.y < 50) y += 2;
        if (phase === "defend" && slot.y > 50) y -= 2;
        break;
      case "ST":
      case "CF":
        // Strikers push onto the last defender on attack.
        if (phase === "attack") x += 4;
        break;
      case "GK":
        // Keeper holds the line — never shifts up beyond his own box.
        x = slot.x;
        break;
    }

    // Clamp inside the pitch + phase-aware bounds.
    x = Math.max(bounds.min, Math.min(bounds.max, x));
    y = Math.max(6, Math.min(94, y));
    return { ...slot, x, y };
  });
}

// =====================================================================
// CONVENIENCE — derive the team phase from where the ball is, from
// the team's own POV. Used by the viewer when it advances between
// highlights (the active attacking team is on "attack", the other on
// "defend").
// =====================================================================
export function phaseForTeam(
  ballZone: PitchZone | null,
  isAttackingTeam: boolean,
): TeamPhase {
  if (!ballZone) return "neutral";
  if (isAttackingTeam) {
    // We're on the ball — the further forward the ball is, the more
    // committed our shape is to the attack.
    if (ballZone.startsWith("BOX") || ballZone === "GOAL" || ballZone.startsWith("ATT")) return "attack";
    if (ballZone.startsWith("MID")) return "neutral";
    return "defend";
  }
  // We're defending — the closer the ball is to our goal, the more
  // collapsed our shape is.
  if (ballZone.startsWith("BOX") || ballZone === "GOAL" || ballZone.startsWith("ATT")) return "defend";
  if (ballZone.startsWith("MID")) return "neutral";
  return "attack";
}
