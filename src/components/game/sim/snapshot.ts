// =====================================================================
// sim/snapshot.ts — converts (Club + Lineup + Player records) into a
// TeamSnapshot of placements ready for the AI loop and scene system.
//
// Same logic as the previous in-file `buildTeamSnapshot` but carries
// FULL player attributes through — so downstream AI can ask "what's
// this guy's pace / shooting / passing" instead of guessing.
// =====================================================================

import type { Club, DetailedPosition, Lineup, Player, PlayerRole, Tactic } from "@/types/game";
import { FORMATIONS } from "@/data/formations";
import {
  BOT_GOAL_LINE_Y,
  TOP_GOAL_LINE_Y,
  type PlayerPlacement,
  type TeamSnapshot,
  clamp,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// JERSEY NUMBERING — traditional football convention so the user
// can identify their players at a glance.
//   GK = 1, RB = 2, LB = 3, CB = 4 (then 5/6 for second/third CB),
//   DM = 6, RM/RW = 7, CM = 8 (second CM = 14), ST/CF = 9 (second = 19),
//   AM = 10, LM/LW = 11.
// We assign in two passes — first the canonical numbers, and any
// duplicates fall through to a fallback pool.
// ─────────────────────────────────────────────────────────────────────
function preferredJerseys(pos: DetailedPosition): number[] {
  switch (pos) {
    case "GK": return [1];
    case "RB": return [2];
    case "LB": return [3];
    case "CB": return [4, 5, 6];
    case "DM": return [6, 4, 5];
    case "RM": return [7, 17];
    case "LM": return [11, 18];
    case "RW": return [7, 17];
    case "LW": return [11, 18];
    case "CM": return [8, 14, 15, 16];
    case "AM": return [10, 21];
    case "ST": return [9, 19];
    case "CF": return [9, 19];
    default:   return [];
  }
}

const FALLBACK_NUMBERS: number[] = [
  12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
];

function tacticShape(tactic: Tactic): {
  advance: number;
  tightness: number;
  vStretch: number;
  hStretch: number;
} {
  switch (tactic) {
    case "Attacking":   return { advance:  5, tightness: 0.95, vStretch: 1.05, hStretch: 1.05 };
    case "Defensive":   return { advance: -6, tightness: 0.85, vStretch: 0.85, hStretch: 0.95 };
    case "Counter":     return { advance: -2, tightness: 0.90, vStretch: 1.15, hStretch: 1.00 };
    case "High Press":  return { advance:  7, tightness: 0.80, vStretch: 0.85, hStretch: 1.00 };
    case "Possession":  return { advance:  1, tightness: 0.70, vStretch: 0.95, hStretch: 0.85 };
    case "Direct":      return { advance:  2, tightness: 1.00, vStretch: 1.25, hStretch: 1.00 };
    case "Long Ball":   return { advance:  1, tightness: 1.05, vStretch: 1.30, hStretch: 1.10 };
    case "Tiki-Taka":   return { advance:  1, tightness: 0.60, vStretch: 0.85, hStretch: 0.80 };
    case "Gegenpress":  return { advance:  8, tightness: 0.75, vStretch: 0.80, hStretch: 1.00 };
    case "Wing Play":   return { advance:  3, tightness: 1.05, vStretch: 1.00, hStretch: 1.20 };
    case "Park the Bus":return { advance:-10, tightness: 0.70, vStretch: 0.70, hStretch: 0.85 };
    case "Balanced":
    default:            return { advance:  0, tightness: 1.00, vStretch: 1.00, hStretch: 1.00 };
  }
}

function roleShift(role: PlayerRole): { forward: number; widen: number } {
  switch (role) {
    case "Press High":     return { forward:  5, widen:  0 };
    case "Run Forward":    return { forward:  4, widen:  0 };
    case "Cut Inside":     return { forward:  3, widen: -2 };
    case "Get Forward":    return { forward:  5, widen:  0 };
    case "Overlap":        return { forward:  6, widen:  2 };
    case "Drift Wide":     return { forward:  0, widen:  3 };
    case "Sweeper Keeper": return { forward:  4, widen:  0 };
    case "Stay Back":      return { forward: -4, widen:  0 };
    case "Hold Up":        return { forward: -2, widen:  0 };
    case "Defensive WB":   return { forward: -2, widen:  0 };
    case "Cover":          return { forward: -2, widen:  0 };
    case "Stopper":        return { forward:  1, widen:  0 };
    case "Underlap":       return { forward:  1, widen: -3 };
    case "Playmaker":      return { forward: -3, widen:  0 };
    case "Default":
    default:               return { forward:  0, widen:  0 };
  }
}

export function buildTeamSnapshot(
  club: Club,
  lineup: Lineup | undefined,
  players: Record<string, Player> | undefined,
  isHome: boolean,
): TeamSnapshot {
  const formationKey = lineup?.formationKey ?? "4-3-3";
  const formation = FORMATIONS[formationKey];
  const tactic: Tactic = lineup?.tactic ?? "Balanced";
  const shape = tacticShape(tactic);

  const ownHalfCentre = isHome ? 112 : 38;
  const advanceSign = isHome ? -1 : 1;
  const xMirror = isHome ? 1 : -1;

  let gkIdx = 0;

  // ── Pre-assign jerseys: walk every slot, claim its top-priority
  //    number; if taken, fall through preferred list, then fallback. ─
  const usedNumbers = new Set<number>();
  const slotJersey: Record<number, number> = {};
  formation.slots.forEach((slot, i) => {
    const slotPos: DetailedPosition = (lineup?.slotPositions?.[slot.id]?.position) ?? slot.position;
    const prefer = preferredJerseys(slotPos);
    let chosen = -1;
    for (const n of prefer) {
      if (!usedNumbers.has(n)) { chosen = n; break; }
    }
    if (chosen < 0) {
      for (const n of FALLBACK_NUMBERS) {
        if (!usedNumbers.has(n)) { chosen = n; break; }
      }
    }
    if (chosen < 0) chosen = 99;
    usedNumbers.add(chosen);
    slotJersey[i] = chosen;
  });

  const placements: PlayerPlacement[] = formation.slots.map((slot, i) => {
    const override = lineup?.slotPositions?.[slot.id];
    const fx = override?.x ?? slot.x;
    const fy = override?.y ?? slot.y;
    const slotPosition = override?.position ?? slot.position;

    let pitchX = isHome ? fx * 100 : (1 - fx) * 100;
    // Y-axis mapping. Formations use fy=0 for "back of formation" (own
    // half) and fy=1 for "front" (opponent half). The home team
    // defends y=144 and attacks toward y=6 — so fy=0 must map to a
    // HIGH pitch-y value near home's goal, fy=1 to a LOW value near
    // the opponent's goal. Away mirrors.
    let pitchY = isHome ? 140 - fy * 120 : 10 + fy * 120;

    pitchY += shape.advance * advanceSign;
    pitchY = ownHalfCentre + (pitchY - ownHalfCentre) * shape.vStretch;
    pitchY = ownHalfCentre + (pitchY - ownHalfCentre) * shape.tightness;
    pitchX = 50 + (pitchX - 50) * shape.hStretch;

    const role: PlayerRole = lineup?.roles?.[slot.id] ?? "Default";
    const r = roleShift(role);
    pitchY += r.forward * advanceSign;
    if (r.widen !== 0) {
      const sideSign = pitchX < 50 ? -1 : 1;
      pitchX += r.widen * sideSign * xMirror;
    }

    const playerId = lineup?.starters[slot.id];
    const player: Player | undefined = playerId ? players?.[playerId] : undefined;
    const isGK = slotPosition === "GK";

    if (isGK) gkIdx = i;
    const jersey = slotJersey[i] ?? 99;

    if (isGK) {
      pitchX = 50;
      pitchY = isHome ? BOT_GOAL_LINE_Y - 4 : TOP_GOAL_LINE_Y + 4;
    }

    pitchX = clamp(pitchX, 5, 95);
    pitchY = clamp(
      pitchY,
      isGK ? (isHome ? 138 : 8) : 12,
      isGK ? (isHome ? 142 : 12) : 138,
    );

    return {
      homeX: pitchX,
      homeY: pitchY,
      curX: pitchX,
      curY: pitchY,
      targetX: pitchX,
      targetY: pitchY,
      scripted: false,
      slotPos: slotPosition,
      role,
      isGK,
      jersey,
      playerId: player?.id,
      displayName: player?.displayName,
      trait: player?.trait,
      // Attributes — defaults for empty lineups so the AI still works.
      pace: player?.pace ?? 60,
      shooting: player?.shooting ?? 55,
      passing: player?.passing ?? 60,
      tackling: player?.tackling ?? 55,
      stamina: player?.stamina ?? 65,
      technique: player?.technique ?? 55,
      strength: player?.strength ?? 60,
      mentality: player?.mentality ?? 55,
      goalkeeping: player?.goalkeeping ?? (isGK ? 65 : 10),
      overall: player?.overall ?? 60,
      phase: i * 1.7 + (isHome ? 0 : 5.3),
    };
  });

  return {
    side: isHome ? "home" : "away",
    placements,
    primaryColor: club.badge.primaryColor,
    accentColor: club.badge.secondaryColor || "#FFFFFF",
    gkIdx,
    tactic,
    formationKey,
  };
}
