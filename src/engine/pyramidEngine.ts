// =====================================================================
// PYRAMID ENGINE — promotion / relegation between the four divisions
// of EACH nation, plus continental qualification (Champions Cup /
// Continental Cup) which pulls qualifiers from EVERY nation.
//
// Called by `commitSeasonRollover` in gameStore.ts after the season-end
// report has been built but BEFORE fixtures get regenerated. Mutates
// nothing — returns plain data the store stitches into the next-season
// state.
//
// Movement rules (deliberately simple, readable, "Football League"
// shaped — three up, three down at every boundary, applied to each
// nation independently):
//   - Tier 1 (top flight):  bottom 3 ↔ top 3 of Tier 2
//   - Tier 2 ↔ Tier 3:      bottom 3 ↔ top 3
//   - Tier 3 ↔ Tier 4:      bottom 3 ↔ top 3
// Tier 4 has no further division to fall to.
//
// Continental qualification (drives Champions Cup / Continental Cup
// next season — pulled from EVERY nation in the world; mirrors real
// UEFA-style structure):
//   - Champions Cup    = top 4 of each nation's top flight
//   - Continental Cup  = positions 5-8 of each nation's top flight
//
// With 5 nations that's 5 × 4 = 20 Champions Cup entrants and 5 × 4
// = 20 Continental Cup entrants. The fixture generator trims to the
// largest power-of-two (16) so the bracket is clean.
// =====================================================================

import type { SeasonReportDivisionStandings, Nation } from "@/types/game";
import { NATIONS, divisionTierFor } from "@/data/nations";

/** A pair of clubs swapping division. `up` came from the lower tier
 * and now belongs to the upper one; `down` came from the upper tier
 * and now belongs to the lower one. Used for the inbox copy. */
export interface PyramidSwap {
  upClubId: string;
  downClubId: string;
  upFromDivisionId: string;
  upToDivisionId: string;
  /** Nation id this swap happened in — handy for inbox grouping. */
  nationId: string;
}

/** Result of running the pyramid for a given set of final standings. */
export interface PyramidResult {
  /** Updated `clubId → divisionId` mapping. Apply to every club whose
   * id is in this map. Clubs that didn't move are still present (with
   * their old divisionId) so callers don't have to look anywhere else
   * to know who plays where next season. */
  clubDivisions: Record<string, string>;
  /** `divisionId → clubIds[]` membership for next season. */
  divisionMembership: Record<string, string[]>;
  /** Movement narrative — promoted in green, relegated in red. */
  swaps: PyramidSwap[];
  /** Champions Cup teamIds for the new season — every nation's top 4
   *  from tier 1 plus every nation's top 4 from tier 2. */
  championsCupTeamIds: string[];
  /** Continental Cup teamIds — every nation's positions 5-8 from
   *  tier 1 plus every nation's top 4 from tier 3. */
  continentalCupTeamIds: string[];
}

/** Number of clubs to swap at each pyramid boundary. */
const SWAPS_PER_BOUNDARY = 3;

/** Group standings by their nation. Standings whose divisionId we
 *  don't recognise are silently skipped (so legacy single-nation
 *  saves still work — they just don't roll over those rows). */
function groupStandingsByNation(
  standings: SeasonReportDivisionStandings[],
): Map<string, Map<1 | 2 | 3 | 4, SeasonReportDivisionStandings>> {
  const grouped = new Map<string, Map<1 | 2 | 3 | 4, SeasonReportDivisionStandings>>();
  standings.forEach((s) => {
    const lookup = divisionTierFor(s.divisionId);
    if (!lookup) return;
    if (!grouped.has(lookup.nationId)) grouped.set(lookup.nationId, new Map());
    grouped.get(lookup.nationId)!.set(lookup.tier, s);
  });
  return grouped;
}

/** Apply 3-up / 3-down swaps WITHIN a single nation. */
function rolloverNation(
  nation: Nation,
  byTier: Map<1 | 2 | 3 | 4, SeasonReportDivisionStandings>,
  clubDivisions: Record<string, string>,
  swaps: PyramidSwap[],
): void {
  // Seed every club in this nation as "still where they were".
  byTier.forEach((s) => {
    s.rows.forEach((r) => { clubDivisions[r.clubId] = s.divisionId; });
  });

  for (let i = 0; i < 3; i++) {
    const upperTier = (i + 1) as 1 | 2 | 3 | 4;
    const lowerTier = (i + 2) as 1 | 2 | 3 | 4;
    const upper = byTier.get(upperTier);
    const lower = byTier.get(lowerTier);
    if (!upper || !lower) continue;

    const relegatedRows = [...upper.rows].slice(-SWAPS_PER_BOUNDARY);
    const promotedRows = [...lower.rows].slice(0, SWAPS_PER_BOUNDARY);

    for (let j = 0; j < Math.min(relegatedRows.length, promotedRows.length); j++) {
      const down = relegatedRows[j];
      const up = promotedRows[j];
      clubDivisions[down.clubId] = lower.divisionId;
      clubDivisions[up.clubId] = upper.divisionId;
      swaps.push({
        upClubId: up.clubId,
        downClubId: down.clubId,
        upFromDivisionId: lower.divisionId,
        upToDivisionId: upper.divisionId,
        nationId: nation.id,
      });
    }
  }
}

export function runPyramidRollover(
  standings: SeasonReportDivisionStandings[],
): PyramidResult {
  const grouped = groupStandingsByNation(standings);
  const clubDivisions: Record<string, string> = {};
  const swaps: PyramidSwap[] = [];

  // Roll over each nation independently. Order is the registry order
  // (England → Italy → Spain → Germany → Scotland) so swaps appear
  // in a stable order in the inbox.
  NATIONS.forEach((nation) => {
    const byTier = grouped.get(nation.id);
    if (!byTier) return;
    rolloverNation(nation, byTier, clubDivisions, swaps);
  });

  // Re-derive memberships from the final map.
  const divisionMembership: Record<string, string[]> = {};
  NATIONS.forEach((n) => {
    n.divisionIds.forEach((id) => { divisionMembership[id] = []; });
  });
  Object.entries(clubDivisions).forEach(([clubId, divisionId]) => {
    if (!divisionMembership[divisionId]) {
      divisionMembership[divisionId] = [];
    }
    divisionMembership[divisionId].push(clubId);
  });

  // ----- Continental qualification ----------------------------------
  // Champions Cup: top 4 of each nation's TOP FLIGHT — mirrors the
  // real UEFA Champions League pattern (5 × 4 = 20 teams).
  // Continental Cup: positions 5-8 of each nation's top flight — the
  // equivalent of the Europa League (5 × 4 = 20 teams).
  // We pull from LAST season's standings (matching real football's
  // "you qualify based on where you finished last year" rule).
  const championsCupTeamIds: string[] = [];
  const continentalCupTeamIds: string[] = [];
  NATIONS.forEach((nation) => {
    const byTier = grouped.get(nation.id);
    if (!byTier) return;
    const t1 = byTier.get(1);
    if (t1) {
      t1.rows.slice(0, 4).forEach((r) => championsCupTeamIds.push(r.clubId));
      t1.rows.slice(4, 8).forEach((r) => continentalCupTeamIds.push(r.clubId));
    }
  });

  return {
    clubDivisions,
    divisionMembership,
    swaps,
    championsCupTeamIds,
    continentalCupTeamIds,
  };
}
