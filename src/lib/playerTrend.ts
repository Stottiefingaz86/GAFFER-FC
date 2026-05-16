/**
 * Player attribute trend helpers.
 *
 * If the player has a `lastSnapshot` (taken every few weeks of game
 * time) we compare against it to render up/down arrows.
 *
 * Otherwise we fall back to a procedural trend that's based on age and
 * potential — young players with headroom trend up, mid-career players
 * are flat, and older players see slow declines (pace and stamina go
 * first, mentality keeps rising).
 */

import type { Player } from "@/types/game";

export type Trend = "up" | "down" | "flat";

export type AttrKey =
  | "pace"
  | "shooting"
  | "passing"
  | "tackling"
  | "stamina"
  | "goalkeeping"
  | "technique"
  | "strength"
  | "mentality";

export interface PlayerTrends {
  overall: Trend;
  pace: Trend;
  shooting: Trend;
  passing: Trend;
  tackling: Trend;
  stamina: Trend;
  goalkeeping: Trend;
  technique: Trend;
  strength: Trend;
  mentality: Trend;
}

/** Returns trends for every numeric attribute. Snapshot wins if it
 * exists, otherwise we infer based on age + potential. */
export function getPlayerTrends(p: Player): PlayerTrends {
  if (p.lastSnapshot) {
    const s = p.lastSnapshot;
    const cmp = (now: number, then: number): Trend =>
      now > then ? "up" : now < then ? "down" : "flat";
    return {
      overall: cmp(p.overall, s.overall),
      pace: cmp(p.pace, s.pace),
      shooting: cmp(p.shooting, s.shooting),
      passing: cmp(p.passing, s.passing),
      tackling: cmp(p.tackling, s.tackling),
      stamina: cmp(p.stamina, s.stamina),
      goalkeeping: cmp(p.goalkeeping, s.goalkeeping),
      technique: cmp(p.technique, s.technique),
      strength: cmp(p.strength, s.strength),
      mentality: cmp(p.mentality, s.mentality),
    };
  }
  return inferTrendsFromAge(p);
}

function inferTrendsFromAge(p: Player): PlayerTrends {
  const a = p.age;
  const headroom = p.potential - p.overall;

  // Young, with headroom → most things trending up.
  if (a <= 22 && headroom > 2) {
    return {
      overall: "up",
      pace: a >= 21 ? "flat" : "up",
      shooting: "up",
      passing: "up",
      tackling: "up",
      stamina: a >= 22 ? "flat" : "up",
      goalkeeping: "up",
      technique: "up",
      strength: "up",
      mentality: "up",
    };
  }

  // Prime — most flat, mentality still ticking up.
  if (a >= 23 && a <= 28) {
    return {
      overall: headroom > 1 ? "up" : "flat",
      pace: a >= 27 ? "flat" : "flat",
      shooting: headroom > 1 ? "up" : "flat",
      passing: "flat",
      tackling: "flat",
      stamina: a >= 27 ? "flat" : "flat",
      goalkeeping: headroom > 1 ? "up" : "flat",
      technique: headroom > 1 ? "up" : "flat",
      strength: "flat",
      mentality: "up",
    };
  }

  // 29–31 — pace/stamina fading, mentality still rising.
  if (a >= 29 && a <= 31) {
    return {
      overall: headroom > 0 ? "flat" : "down",
      pace: "down",
      shooting: "flat",
      passing: "flat",
      tackling: "flat",
      stamina: "down",
      goalkeeping: "flat",
      technique: "flat",
      strength: "flat",
      mentality: "up",
    };
  }

  // 32+ — broad decline, but the wise old head still gets +mentality.
  return {
    overall: "down",
    pace: "down",
    shooting: a >= 35 ? "down" : "flat",
    passing: a >= 36 ? "down" : "flat",
    tackling: "down",
    stamina: "down",
    goalkeeping: a >= 38 ? "down" : "flat",
    technique: a >= 36 ? "down" : "flat",
    strength: "down",
    mentality: a >= 38 ? "flat" : "up",
  };
}

/** Format a date-of-birth string like "1995-08-12" into "12 Aug 1995". */
export function formatDOB(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const idx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
  return `${parseInt(d, 10)} ${months[idx]} ${y}`;
}

/** Compute a contract-expiry season label from contract years left and
 * the current career season. */
export function contractExpiryLabel(contractYears: number, currentSeason: number): string {
  if (contractYears <= 0) return "Out of contract";
  const expirySeason = currentSeason + contractYears;
  // Display as "Sum 2027" style - but our seasons are just numbered, so
  // "Season N" is the cleanest.
  return `End of S${expirySeason}`;
}
