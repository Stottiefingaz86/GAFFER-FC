// =====================================================================
// PLAYER VALUE & WAGE — dynamic, age-curved, performance-driven.
// Values flex up when a player is in form, scoring, and well-rated.
// Values flex down with age, drops in form, injuries.
// =====================================================================

import type { Player } from "@/types/game";

// Calibrated piecewise base by overall.
// Tuned so the curve feels right across all four divisions:
// 90 ≈ £80M | 80 ≈ £14M | 70 ≈ £3M | 60 ≈ £500k | 50 ≈ £80k | 45 ≈ £30k
function tieredBase(overall: number): number {
  if (overall >= 90) return 80_000_000 + (overall - 90) * 12_000_000;
  if (overall >= 85) return 30_000_000 + (overall - 85) * 10_000_000;
  if (overall >= 80) return 14_000_000 + (overall - 80) * 3_200_000;
  if (overall >= 75) return 7_000_000 + (overall - 75) * 1_400_000;
  if (overall >= 70) return 3_000_000 + (overall - 70) * 800_000;
  if (overall >= 65) return 1_200_000 + (overall - 65) * 360_000;
  if (overall >= 60) return 500_000 + (overall - 60) * 140_000;
  if (overall >= 55) return 200_000 + (overall - 55) * 60_000;
  if (overall >= 50) return 80_000 + (overall - 50) * 24_000;
  if (overall >= 45) return 30_000 + (overall - 45) * 10_000;
  return Math.max(4_000, overall * 600);
}

// Age curve. Prospects retain value because of their potential ceiling,
// peak players (24-27) are worth most, and value collapses after 32.
function ageMultiplier(age: number): number {
  if (age <= 17) return 1.10;
  if (age <= 19) return 1.18;
  if (age <= 21) return 1.20;
  if (age <= 23) return 1.12;
  if (age <= 27) return 1.00;
  if (age === 28) return 0.92;
  if (age === 29) return 0.82;
  if (age === 30) return 0.70;
  if (age === 31) return 0.55;
  if (age === 32) return 0.42;
  if (age === 33) return 0.30;
  if (age === 34) return 0.22;
  if (age === 35) return 0.16;
  return 0.10;
}

// Trait modifiers — small but meaningful nudges.
function traitMultiplier(player: Player): number {
  switch (player.trait) {
    case "Wonderkid": return 1.18;
    case "Big Game Player": return 1.07;
    case "Composed Finisher": return 1.06;
    case "Speedster": return 1.05;
    case "Playmaker": return 1.05;
    case "Penalty Specialist": return 1.04;
    case "Cup Specialist": return 1.04;
    case "Set Piece Expert": return 1.03;
    case "Engine": return 1.03;
    case "Brick Wall": return 1.03;
    case "Clutch Keeper": return 1.04;
    case "Late Bloomer": return player.age <= 23 ? 1.10 : 1.00;
    case "Cult Hero":
    case "Fan Favourite":
    case "Loyal":
    case "One Club Man": return 0.96;
    case "Mercenary": return 0.94;
    case "Hot Head": return 0.94;
    case "Injury Prone": return 0.85;
    default: return 1.00;
  }
}

export interface ValueOptions {
  // Multiply non-base modifiers by this. Useful when seeding initial values
  // (no appearances yet) to avoid weird zero-state extremes.
  performanceWeight?: number;
}

export function computePlayerValue(p: Player, opts: ValueOptions = {}): number {
  const performanceWeight = opts.performanceWeight ?? 1;

  const base = tieredBase(p.overall);
  const ageMult = ageMultiplier(p.age);

  // Potential gap: how much room to grow.
  const potentialGap = Math.max(0, p.potential - p.overall);
  const potentialMult = 1 + (potentialGap / 12) * (p.age <= 23 ? 0.65 : p.age <= 27 ? 0.25 : 0.05);

  // Form / morale / fitness combine into a "shape" multiplier.
  const formDelta = (p.form - 60) / 100;
  const moraleDelta = (p.morale - 60) / 100;
  const shapeMult = 1 + (formDelta * 0.18 + moraleDelta * 0.05) * performanceWeight;

  // Productivity: goals + assists per appearance, role-aware.
  const apps = Math.max(1, p.appearances);
  const productivityRaw =
    p.position === "GK" ? 0 :
    p.position === "DEF" ? (p.goals + p.assists) / apps :
    p.position === "MID" ? (p.goals * 0.8 + p.assists) / apps :
    /* FWD */ (p.goals + p.assists * 0.5) / apps;
  const productivityMult = 1 + Math.min(0.55, productivityRaw * 0.55) * performanceWeight;

  // Average rating multiplier (anchored at 6.5).
  const ratingMult = p.appearances > 0
    ? 1 + ((p.averageRating - 6.5) * 0.10) * performanceWeight
    : 1;

  // Penalties for being unavailable.
  let availability = 1;
  if (p.isInjured) {
    availability *= Math.max(0.55, 1 - p.injuryWeeks * 0.05);
  }
  if (p.isSuspended) availability *= 0.92;

  const traitMult = traitMultiplier(p);

  const value = base
    * ageMult
    * potentialMult
    * shapeMult
    * productivityMult
    * ratingMult
    * availability
    * traitMult;

  // Squash extreme outliers and round to nice numbers.
  const rounded = roundNice(value);
  return Math.max(2_000, rounded);
}

function roundNice(v: number): number {
  if (v >= 10_000_000) return Math.round(v / 100_000) * 100_000;
  if (v >= 1_000_000) return Math.round(v / 50_000) * 50_000;
  if (v >= 100_000) return Math.round(v / 5_000) * 5_000;
  if (v >= 10_000) return Math.round(v / 1_000) * 1_000;
  return Math.round(v / 500) * 500;
}

// Recompute weekly wage from value: rough rule of thumb that keeps things in
// the same ballpark as the original generator while still moving with overall.
export function computeWageFromValue(p: Player, value: number): number {
  // Wage ≈ value / weeksOfContract / multiplier. Higher overall keeps a higher
  // wage-to-value ratio because elite players negotiate harder.
  const ratio =
    p.overall >= 85 ? 0.0040 :
    p.overall >= 78 ? 0.0034 :
    p.overall >= 70 ? 0.0028 :
    p.overall >= 62 ? 0.0024 :
    0.0020;
  return Math.max(450, Math.round((value * ratio) / 100) * 100);
}

// Compact display: £80M, £8.4M, £450k, £75k, £8k.
export function formatValue(v: number): string {
  if (v >= 10_000_000) return `£${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `£${Math.round(v / 1_000)}k`;
  return `£${v}`;
}

export function formatWage(w: number): string {
  if (w >= 100_000) return `£${(w / 1_000).toFixed(0)}k/w`;
  if (w >= 1_000) return `£${(w / 1_000).toFixed(1)}k/w`;
  return `£${w}/w`;
}

// Re-stamp value/wage on a player record without mutating other fields.
export function stampValue(p: Player, opts?: ValueOptions): Player {
  const value = computePlayerValue(p, opts);
  const wage = computeWageFromValue(p, value);
  return { ...p, value, wage };
}
