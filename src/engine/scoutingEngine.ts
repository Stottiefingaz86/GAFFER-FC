// =====================================================================
// SCOUTING ENGINE
//
// Phase-2 scouting layers cost + automation on top of the existing
// "fog of war" system (Career.scoutedPlayerIds):
//
//   • costToScoutPlayer(player, club)
//       Per-player fee for the on-demand "Send Scout" action. Scales
//       with overall (the headline buy-it-now signal), potential (so
//       wonderkids cost more even at low OVR), age (vets are cheaper
//       to read), and whether the player sits at a foreign-nation club
//       (long-haul scouting trips cost more).
//
//   • generateScoutMarket(seed, season, count)
//       Procedurally seeds a market of hireable scouts at a mix of
//       tiers. Re-seeded automatically every new season; users can
//       refresh on demand (small fee — handled in the store, not here).
//
//   • runWeeklyScouting({ career, db, rng })
//       Called from advanceWeek. Pays scout wages out of the user's
//       club budget, then rolls each hired scout for whether they file
//       a report this week. Returns the patches the store should
//       apply.
//
// Everything in this module is PURE — it never reads the Zustand store
// or mutates inputs. Outputs are fresh objects so the caller can
// shallow-merge them into nextCareer / nextDb.
// =====================================================================

import type {
  Career,
  Club,
  GameDatabase,
  InboxMessage,
  Player,
  Scout,
  ScoutFocusPos,
  ScoutReport,
} from "@/types/game";
import { NATIONALITIES } from "@/data/names";
import { NATION_IDS } from "@/data/nations";
import { FREE_AGENT_CLUB_ID } from "@/generators/playerGenerator";
import { createRng, clamp, type Rng } from "@/lib/rng";

// =====================================================================
// PER-PLAYER SCOUT COST
// =====================================================================

/**
 * Cost to dispatch a one-off scout to a single player. Tuned so the
 * baseline (a 60-rated journeyman at a domestic club) is a rounding
 * error and the headline (a 90-rated wonderkid at a foreign giant) is
 * a meaningful budget hit — enough that the user thinks twice before
 * scouting every player on every club page.
 */
export function costToScoutPlayer(
  player: Player,
  userClub: Club | null,
  targetClub: Club | null,
): number {
  // Base — what it costs to dispatch any scout anywhere in the world.
  let cost = 5_000;

  // Overall multiplier — the dominant driver. The bands are wide on
  // purpose so the user can roughly read the cost back as "this player
  // is in the 70s, OK that's £25k".
  if (player.overall >= 90) cost = 100_000;
  else if (player.overall >= 85) cost = 50_000;
  else if (player.overall >= 80) cost = 25_000;
  else if (player.overall >= 75) cost = 15_000;
  else if (player.overall >= 70) cost = 8_000;
  else if (player.overall >= 60) cost = 5_000;
  else cost = 3_000;

  // Potential premium — wonderkids cost more even when their current
  // overall is still in the academy bands. Stack on top of the OVR
  // band, never replaces it (a 70 OVR / 92 POT teen costs more than a
  // 70 OVR / 72 POT journeyman).
  if (player.potential >= 90) cost = Math.round(cost * 1.6);
  else if (player.potential >= 85) cost = Math.round(cost * 1.35);
  else if (player.potential >= 80) cost = Math.round(cost * 1.15);

  // Age discount — over-30s have a short shelf life and the league
  // already knows them inside out, so scouts price the trip down.
  if (player.age >= 33) cost = Math.round(cost * 0.6);
  else if (player.age >= 30) cost = Math.round(cost * 0.8);

  // Foreign-club surcharge — flying a scout to a different nation
  // costs more than driving down the M1. Free agents are treated as
  // "global" (cheap) since the existing youth-pool flow is always free.
  if (
    userClub &&
    targetClub &&
    targetClub.id !== FREE_AGENT_CLUB_ID &&
    targetClub.nationId &&
    userClub.nationId &&
    targetClub.nationId !== userClub.nationId
  ) {
    cost = Math.round(cost * 1.3);
  }

  return cost;
}

// =====================================================================
// SCOUT MARKET GENERATION
// =====================================================================

/**
 * Wage + signing fee bands for each tier. Picked so a tier-3 scout
 * costs roughly the same per week as a fringe first-teamer, and a
 * tier-5 globe-trotter is a "marquee signing" type investment.
 */
const TIER_ECONOMICS: Record<
  Scout["tier"],
  { signingFeeMin: number; signingFeeMax: number; wageMin: number; wageMax: number }
> = {
  1: { signingFeeMin: 1_000, signingFeeMax: 5_000,  wageMin: 300,   wageMax: 800   },
  2: { signingFeeMin: 5_000, signingFeeMax: 15_000, wageMin: 800,   wageMax: 1_500 },
  3: { signingFeeMin: 15_000, signingFeeMax: 40_000, wageMin: 1_500, wageMax: 3_000 },
  4: { signingFeeMin: 40_000, signingFeeMax: 90_000, wageMin: 3_000, wageMax: 6_000 },
  5: { signingFeeMin: 90_000, signingFeeMax: 200_000, wageMin: 6_000, wageMax: 12_000 },
};

/**
 * Judging accuracy by tier. Tier-1 scouts are spotty (±10 swing on
 * estimates); tier-5 scouts almost always nail it (±2 swing). The
 * potential side is one band lower — projecting teenagers is hard for
 * everyone.
 */
const TIER_JUDGING: Record<
  Scout["tier"],
  { judging: [number, number]; potentialJudging: [number, number] }
> = {
  1: { judging: [40, 55], potentialJudging: [25, 40] },
  2: { judging: [55, 70], potentialJudging: [40, 55] },
  3: { judging: [70, 80], potentialJudging: [55, 70] },
  4: { judging: [80, 90], potentialJudging: [70, 82] },
  5: { judging: [90, 96], potentialJudging: [82, 92] },
};

const ALL_NATION_IDS: readonly string[] = Object.values(NATION_IDS);
const FOCUS_POSITIONS: readonly ScoutFocusPos[] = ["any", "GK", "DEF", "MID", "FWD"];

function pickNamePool(rng: Rng): { firstName: string; lastName: string; nationality: string } {
  const pool = rng.pick(NATIONALITIES);
  return {
    firstName: rng.pick(pool.first),
    lastName: rng.pick(pool.last),
    nationality: pool.id,
  };
}

/**
 * Build a fresh scout at the requested tier. Wage / fee / judging are
 * each rolled from the tier band; focus nation and position are random
 * but weighted so higher-tier scouts are more likely to be "global"
 * generalists (they're the ones who'd actually take long-haul trips).
 */
export function generateScout(
  rng: Rng,
  tier: Scout["tier"],
  hiredSeason: number,
  hiredWeek: number,
): Scout {
  const econ = TIER_ECONOMICS[tier];
  const judg = TIER_JUDGING[tier];
  const { firstName, lastName, nationality } = pickNamePool(rng);

  // Tier 4 and 5 scouts have a strong chance of going global; tier
  // 1-2 are local-only; tier 3 is a coin flip.
  const globalChance = tier === 5 ? 0.7 : tier === 4 ? 0.45 : tier === 3 ? 0.25 : 0.0;
  const focusNationId = rng.bool(globalChance)
    ? "global"
    : rng.pick(ALL_NATION_IDS);

  // Positional brief — generalists slightly more common than specialists.
  const focusPosition = rng.pickWeighted(
    FOCUS_POSITIONS,
    [3, 1, 1, 1, 1], // any, GK, DEF, MID, FWD
  );

  return {
    id: `scout_${rng.int(1_000_000, 9_999_999).toString(36)}_${tier}`,
    name: `${firstName} ${lastName}`,
    nationality,
    tier,
    signingFee: rng.int(econ.signingFeeMin, econ.signingFeeMax),
    wage: rng.int(econ.wageMin, econ.wageMax),
    judging: rng.int(judg.judging[0], judg.judging[1]),
    potentialJudging: rng.int(judg.potentialJudging[0], judg.potentialJudging[1]),
    focusNationId,
    focusPosition,
    hiredSeason,
    hiredWeek,
    lastReportWeek: -1,
  };
}

/**
 * Default market roster — a mix of all five tiers, biased to the
 * lower tiers so the user has affordable options early career while
 * still seeing one or two marquee names dangling.
 */
const DEFAULT_TIER_MIX: ReadonlyArray<Scout["tier"]> = [
  1, 1, 1, 2, 2, 2, 3, 3, 4, 5,
];

/**
 * Build a fresh market of hireable scouts. The market refreshes once
 * per season automatically (handled in the store) and on demand via
 * the "Refresh Market" button.
 */
export function generateScoutMarket(
  seed: string,
  hiredSeason: number,
  hiredWeek: number,
  tierMix: ReadonlyArray<Scout["tier"]> = DEFAULT_TIER_MIX,
): Scout[] {
  const rng = createRng(seed);
  return tierMix.map((tier, i) =>
    generateScout(rng.fork(`m${i}`), tier, hiredSeason, hiredWeek),
  );
}

// =====================================================================
// WEEKLY TICK — wages + reports
// =====================================================================

/**
 * Probability a scout files a new report on any given week. Higher-tier
 * scouts pick up the phone more often.
 */
function reportProbability(tier: Scout["tier"]): number {
  switch (tier) {
    case 5: return 0.7;
    case 4: return 0.55;
    case 3: return 0.4;
    case 2: return 0.28;
    case 1: return 0.18;
  }
}

const POSITION_BUCKET: Record<string, ScoutFocusPos> = {
  GK: "GK",
  DEF: "DEF",
  MID: "MID",
  FWD: "FWD",
};

/** Bucket a player's primary position into a scout-focus bucket. */
function bucketOf(player: Player): ScoutFocusPos {
  return POSITION_BUCKET[player.position] ?? "any";
}

/** True when this player matches the scout's regional brief. */
function matchesRegion(scout: Scout, player: Player, targetClub: Club | null): boolean {
  if (scout.focusNationId === "global") return true;
  // Match by club's nation (for active players) or by birth nationality
  // (for free agents and as a fallback when the club nationId is
  // missing — older saves don't always have it set).
  if (targetClub && targetClub.nationId === scout.focusNationId) return true;
  if (!targetClub && player.nationality === scout.focusNationId) return true;
  // For non-globals we still allow occasional cross-border surprises
  // via the player's actual nationality (an Italian scout reporting on
  // an Italian playing in Spain).
  if (player.nationality === scout.focusNationId) return true;
  return false;
}

/** True when this player matches the scout's positional brief. */
function matchesPosition(scout: Scout, player: Player): boolean {
  if (scout.focusPosition === "any") return true;
  return bucketOf(player) === scout.focusPosition;
}

/**
 * Headline copy for the recommendation row — short, glanceable. We
 * derive from age + estimated stats rather than the scout because the
 * user reads the summary first and the scout's name second.
 */
function summaryFor(
  player: Player,
  estOverall: number,
  estPotential: number,
): string {
  if (player.age <= 18 && estPotential >= 88) return "Generational talent";
  if (player.age <= 19 && estPotential >= 84) return "Wonderkid prospect";
  if (estOverall >= 86) return "World-class option";
  if (estOverall >= 80) return "Top-tier addition";
  if (estPotential - player.overall >= 12) return "Hidden gem";
  if (player.age <= 21 && estPotential >= 78) return "Long-term project";
  if (player.age >= 30 && estOverall >= 78) return "Experienced head";
  if (estOverall >= 72) return "Solid squad option";
  return "Backup option";
}

interface RunScoutingInput {
  career: Career;
  db: GameDatabase;
  rng: Rng;
}

export interface RunScoutingOutput {
  /** Patched Career — scout reports added, lastReportWeek bumped. */
  nextCareer: Career;
  /** Patched DB — user club budget docked by total wages. */
  nextDb: GameDatabase;
  /** Total wages paid this week (already deducted from the budget). */
  wagesPaid: number;
  /** Reports filed this week — the caller appends one inbox digest. */
  newReports: ScoutReport[];
  /** Inbox messages the caller should prepend (a single weekly digest
   * if any reports were filed). */
  inboxMessages: InboxMessage[];
}

/**
 * Weekly tick for scouting. Pays scout wages, rolls each hired scout
 * for a new report, auto-scouts surfaced players, and (if any reports
 * landed) drops a single digest message in the inbox.
 *
 * Idempotent w.r.t. an empty `scouts` list — if the user has no
 * scouts, the function returns the inputs unchanged.
 */
export function runWeeklyScouting(input: RunScoutingInput): RunScoutingOutput {
  const { career, db, rng } = input;
  const scouts = career.scouts ?? [];

  if (scouts.length === 0) {
    return {
      nextCareer: career,
      nextDb: db,
      wagesPaid: 0,
      newReports: [],
      inboxMessages: [],
    };
  }

  const userClub = db.clubs[career.selectedClubId];
  if (!userClub) {
    return {
      nextCareer: career,
      nextDb: db,
      wagesPaid: 0,
      newReports: [],
      inboxMessages: [],
    };
  }

  // ── 1. WAGES ─────────────────────────────────────────────────────
  const wagesPaid = scouts.reduce((sum, s) => sum + s.wage, 0);

  // ── 2. REPORTS ──────────────────────────────────────────────────
  const scoutedSet = new Set(career.scoutedPlayerIds);
  const newReports: ScoutReport[] = [];
  const updatedScouts: Scout[] = [];

  // Precompute the candidate pools per scout once — picking from a
  // pre-filtered array is way faster than re-walking db.players per
  // scout per tick.
  const allPlayers = Object.values(db.players);

  for (const scout of scouts) {
    const scoutRng = rng.fork(`s_${scout.id}_${career.week}`);
    if (!scoutRng.bool(reportProbability(scout.tier))) {
      updatedScouts.push(scout);
      continue;
    }

    // Candidate pool — region + position match, NOT on the user's own
    // club (the manager already knows their own squad), NOT already in
    // the scouted registry (no duplicate reports). Tier-5 scouts also
    // filter for ability so the user gets meaningful tips.
    const minOverall = scout.tier >= 5 ? 78 : scout.tier >= 4 ? 72 : scout.tier >= 3 ? 65 : 55;
    const minPotential = scout.tier >= 5 ? 82 : scout.tier >= 4 ? 76 : scout.tier >= 3 ? 70 : 60;

    const pool = allPlayers.filter((p) => {
      if (p.clubId === career.selectedClubId) return false;
      if (scoutedSet.has(p.id)) return false;
      if (p.overall < minOverall && p.potential < minPotential) return false;
      const club = db.clubs[p.clubId] ?? null;
      if (!matchesRegion(scout, p, club)) return false;
      if (!matchesPosition(scout, p)) return false;
      return true;
    });

    if (pool.length === 0) {
      updatedScouts.push(scout);
      continue;
    }

    // Bias toward higher potential — sort the pool by a weighted score
    // and pick from the top quartile so the user gets useful tips
    // rather than random journeymen.
    pool.sort((a, b) => {
      const scoreA = a.potential * 0.6 + a.overall * 0.4 - (a.age >= 30 ? 8 : 0);
      const scoreB = b.potential * 0.6 + b.overall * 0.4 - (b.age >= 30 ? 8 : 0);
      return scoreB - scoreA;
    });
    const slice = pool.slice(0, Math.max(5, Math.ceil(pool.length * 0.25)));
    const target = scoutRng.pick(slice);

    // Estimate accuracy = judging band → ±swing. We clamp to [1, 99]
    // to keep the displayed numbers sensible regardless of swing.
    const ovrSwing = Math.round((100 - scout.judging) / 10);
    const potSwing = Math.round((100 - scout.potentialJudging) / 8);
    const estOverall = clamp(
      target.overall + scoutRng.int(-ovrSwing, ovrSwing),
      1,
      99,
    );
    const estPotential = clamp(
      target.potential + scoutRng.int(-potSwing, potSwing),
      estOverall, // a scout never reports a *lower* potential than current OVR
      99,
    );

    const confidence = clamp(
      Math.round((scout.judging + scout.potentialJudging) / 2),
      0,
      100,
    );

    const report: ScoutReport = {
      id: `rep_${scout.id}_${career.season}_${career.week}_${target.id.slice(-6)}`,
      scoutId: scout.id,
      playerId: target.id,
      week: career.week,
      season: career.season,
      estOverall,
      estPotential,
      confidence,
      summary: summaryFor(target, estOverall, estPotential),
      seen: false,
    };

    newReports.push(report);
    scoutedSet.add(target.id);
    updatedScouts.push({ ...scout, lastReportWeek: career.week });
  }

  // ── 3. APPLY PATCHES ────────────────────────────────────────────
  const nextDb: GameDatabase = {
    ...db,
    clubs: {
      ...db.clubs,
      [userClub.id]: { ...userClub, budget: userClub.budget - wagesPaid },
    },
  };

  const nextCareer: Career = {
    ...career,
    scouts: updatedScouts,
    scoutReports: [...(career.scoutReports ?? []), ...newReports],
    scoutedPlayerIds: Array.from(scoutedSet),
    updatedAt: new Date().toISOString(),
  };

  // ── 4. INBOX DIGEST ─────────────────────────────────────────────
  const inboxMessages: InboxMessage[] = [];
  if (newReports.length > 0) {
    const titles = newReports
      .slice(0, 3)
      .map((r) => {
        const p = db.players[r.playerId];
        return p ? `${p.firstName.charAt(0)}. ${p.lastName} (POT ${r.estPotential})` : null;
      })
      .filter(Boolean)
      .join(", ");
    const more = newReports.length > 3 ? ` and ${newReports.length - 3} more` : "";
    inboxMessages.push({
      id: `scout_digest_${career.id}_s${career.season}_w${career.week}`,
      week: career.week,
      season: career.season,
      category: "Scout",
      title:
        newReports.length === 1
          ? `Scout report: ${titles}`
          : `${newReports.length} scout reports filed`,
      body:
        `Your scouting network has filed ${newReports.length} new report${
          newReports.length === 1 ? "" : "s"
        } this week — ${titles}${more}. Head to the Scouting screen to read the briefings and add anyone catching your eye to the watchlist.`,
      read: false,
      important: false,
    });
  }

  return { nextCareer, nextDb, wagesPaid, newReports, inboxMessages };
}
