// =====================================================================
// PYRAMID ENGINE — promotion / relegation between the four divisions
// plus continental qualification (Champions Cup / Continental Cup).
//
// Called by `commitSeasonRollover` in gameStore.ts after the season-end
// report has been built but BEFORE fixtures get regenerated. Mutates
// nothing — returns plain data the store stitches into the next-season
// state.
//
// Movement rules (deliberately simple, readable, "Football League"
// shaped — three up, three down at every boundary):
//   - Premier:        bottom 3 (18-20) ↔ top 3 (1-3) of D1
//   - Division One:   bottom 3 (18-20) ↔ top 3 (1-3) of D2
//   - Division Two:   bottom 3 (18-20) ↔ top 3 (1-3) of D3
// D3 has no further division to fall to.
//
// Continental qualification (drives Champions Cup / Continental Cup
// next season):
//   - Champions Cup    = top 4 of Premier + top 4 of D1 (last season)
//   - Continental Cup  = positions 5-8 of Premier + top 4 of D2
//
// Note: D1 / D2 wildcards are deliberately last season's standings
// (when the report was built). The promoted clubs from D1 are now in
// the Premier, but they still keep their CC qualification — which
// matches real football: a club promoted as champions doesn't lose
// their continental berth on the way up.
// =====================================================================

import { COMP_IDS, DIVISION_NAMES } from "@/data/competitionSeeds";
import type { SeasonReportDivisionStandings } from "@/types/game";

/** Top → bottom hierarchy. Tier 1 is the Premier, Tier 4 is D3. */
const PYRAMID: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];

/** A pair of clubs swapping division. `up` came from the lower tier
 * and now belongs to the upper one; `down` came from the upper tier
 * and now belongs to the lower one. Used for the inbox copy. */
export interface PyramidSwap {
  upClubId: string;
  downClubId: string;
  upFromDivisionId: string;
  upToDivisionId: string;
}

/** Result of running the pyramid for a given set of final standings. */
export interface PyramidResult {
  /** Updated `clubId → divisionId` mapping. Apply to every club whose
   * id is in this map. Clubs that didn't move are still present (with
   * their old divisionId) so callers don't have to look anywhere else
   * to know who plays where next season. */
  clubDivisions: Record<string, string>;
  /** `divisionId → clubIds[]` membership for next season. The order
   * is: surviving incumbents first (in last season's finishing order
   * from positions 4..N-3), then the freshly promoted clubs at the
   * top, then the demoted clubs at the bottom. This isn't strictly
   * required for league logic, but a sensible order makes regenerated
   * tables read nicely until the first match week. */
  divisionMembership: Record<string, string[]>;
  /** Movement narrative — promoted in green, relegated in red. */
  swaps: PyramidSwap[];
  /** Champions Cup teamIds for the new season (top 4 Prem + top 4 D1). */
  championsCupTeamIds: string[];
  /** Continental Cup teamIds (positions 5-8 Prem + top 4 D2). */
  continentalCupTeamIds: string[];
}

/** Number of clubs to swap at each pyramid boundary. */
const SWAPS_PER_BOUNDARY = 3;

export function runPyramidRollover(
  standings: SeasonReportDivisionStandings[],
): PyramidResult {
  // Lookup last season's tables by tier so we can do the up/down shuffle
  // pair by pair without trusting array order.
  const standingsByDivision = new Map<string, SeasonReportDivisionStandings>();
  standings.forEach((s) => standingsByDivision.set(s.divisionId, s));

  const clubDivisions: Record<string, string> = {};
  const swaps: PyramidSwap[] = [];

  // Seed the mapping with the as-was state — every club is "still
  // where they were last season" until we move them.
  standings.forEach((s) => {
    s.rows.forEach((r) => {
      clubDivisions[r.clubId] = s.divisionId;
    });
  });

  // Pyramid swap: walk top-down through the boundaries between adjacent
  // tiers and trade `SWAPS_PER_BOUNDARY` clubs at each one.
  for (let i = 0; i < PYRAMID.length - 1; i++) {
    const upperId = DIVISION_NAMES[PYRAMID[i]].id;
    const lowerId = DIVISION_NAMES[PYRAMID[i + 1]].id;
    const upper = standingsByDivision.get(upperId);
    const lower = standingsByDivision.get(lowerId);
    if (!upper || !lower) continue;

    // Bottom of upper → relegated.
    const relegatedRows = [...upper.rows]
      .slice(-SWAPS_PER_BOUNDARY);
    // Top of lower → promoted.
    const promotedRows = [...lower.rows]
      .slice(0, SWAPS_PER_BOUNDARY);

    // Pair them up so the inbox copy reads "X promoted, Y went down"
    // in matching order. The actual league membership doesn't care
    // who's paired with who; only the narrative does.
    for (let j = 0; j < Math.min(relegatedRows.length, promotedRows.length); j++) {
      const down = relegatedRows[j];
      const up = promotedRows[j];

      clubDivisions[down.clubId] = lowerId;
      clubDivisions[up.clubId] = upperId;

      swaps.push({
        upClubId: up.clubId,
        downClubId: down.clubId,
        upFromDivisionId: lowerId,
        upToDivisionId: upperId,
      });
    }
  }

  // Re-derive memberships from the updated map.
  const divisionMembership: Record<string, string[]> = {};
  PYRAMID.forEach((tier) => {
    divisionMembership[DIVISION_NAMES[tier].id] = [];
  });
  Object.entries(clubDivisions).forEach(([clubId, divisionId]) => {
    if (!divisionMembership[divisionId]) {
      divisionMembership[divisionId] = [];
    }
    divisionMembership[divisionId].push(clubId);
  });

  // ----- Continental qualification ----------------------------------
  const premStandings = standingsByDivision.get(COMP_IDS.PREMIER);
  const d1Standings = standingsByDivision.get(COMP_IDS.D1);
  const d2Standings = standingsByDivision.get(COMP_IDS.D2);

  const championsCupTeamIds: string[] = [];
  if (premStandings) {
    premStandings.rows.slice(0, 4).forEach((r) => championsCupTeamIds.push(r.clubId));
  }
  if (d1Standings) {
    d1Standings.rows.slice(0, 4).forEach((r) => championsCupTeamIds.push(r.clubId));
  }

  const continentalCupTeamIds: string[] = [];
  if (premStandings) {
    premStandings.rows.slice(4, 8).forEach((r) => continentalCupTeamIds.push(r.clubId));
  }
  if (d2Standings) {
    d2Standings.rows.slice(0, 4).forEach((r) => continentalCupTeamIds.push(r.clubId));
  }

  return {
    clubDivisions,
    divisionMembership,
    swaps,
    championsCupTeamIds,
    continentalCupTeamIds,
  };
}
