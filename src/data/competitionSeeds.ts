// =====================================================================
// COMPETITION SEEDS — fictional only.
//
// The four English competitions (Premier Division, Division One/Two/
// Three, National Cup, League Cup, Super Shield) keep their original
// un-prefixed ids so existing English saves load without migration.
//
// All non-English nations get nation-prefixed ids (e.g. "ita_serie_a",
// "esp_la_liga"). The continental Champions Cup and Continental Cup
// are global and pull qualifiers from every nation each season.
//
// `buildCompetitionsScaffold(nations?)` constructs an empty
// competition map with one league per (nation, tier) and one cup per
// (nation, kind), plus the global continental + super-shield comps.
// =====================================================================

import type { Competition, Nation } from "@/types/game";
import { NATIONS } from "@/data/nations";

/** Legacy English-pyramid alias map. New code should prefer the
 *  per-nation helpers in `data/nations.ts`. Kept as-is so existing UI
 *  and engine code that hard-codes "div_premier" continues to work
 *  for English clubs. */
export const DIVISION_NAMES: Record<1 | 2 | 3 | 4, { id: string; name: string; short: string }> = {
  1: { id: "div_premier", name: "Premier Division", short: "PREM" },
  2: { id: "div_one", name: "Division One", short: "D1" },
  3: { id: "div_two", name: "Division Two", short: "D2" },
  4: { id: "div_three", name: "Division Three", short: "D3" },
};

export const COMP_IDS = {
  PREMIER: "div_premier",
  D1: "div_one",
  D2: "div_two",
  D3: "div_three",
  NATIONAL_CUP: "national_cup",
  LEAGUE_CUP: "league_cup",
  CHAMPIONS_CUP: "champions_cup",
  CONTINENTAL_CUP: "continental_cup",
  SUPER_SHIELD: "super_shield",
} as const;

/** Build the competition scaffold for a world. By default builds for
 *  every registered nation (England + Italy + Spain + Germany +
 *  Scotland). Pass an explicit nation list to build a subset (used by
 *  the career picker preview). */
export function buildCompetitionsScaffold(
  nations: ReadonlyArray<Nation> = NATIONS,
): Record<string, Competition> {
  const map: Record<string, Competition> = {};

  // Per-nation leagues + domestic cups + super cup.
  nations.forEach((n) => {
    ([1, 2, 3, 4] as const).forEach((tier) => {
      const id = n.divisionIds[tier - 1];
      map[id] = {
        id,
        name: n.divisionNames[tier - 1],
        shortName: n.divisionShortNames[tier - 1],
        type: "League",
        format: "League",
        divisionTier: tier,
        teamIds: [],
      };
    });

    map[n.nationalCupId] = {
      id: n.nationalCupId,
      name: n.nationalCupName,
      shortName: n.nationalCupShortName,
      type: "DomesticCup",
      format: "Knockout",
      teamIds: [],
    };

    map[n.leagueCupId] = {
      id: n.leagueCupId,
      name: n.leagueCupName,
      shortName: n.leagueCupShortName,
      type: "LeagueCup",
      format: "Knockout",
      teamIds: [],
    };

    map[n.superCupId] = {
      id: n.superCupId,
      name: n.superCupName,
      shortName: n.superCupShortName,
      type: "SuperCup",
      format: "Knockout",
      teamIds: [],
    };
  });

  // Continental Champions Cup — global, pulls qualifiers from every
  // nation's top division (top 4 each).
  map[COMP_IDS.CHAMPIONS_CUP] = {
    id: COMP_IDS.CHAMPIONS_CUP,
    name: "Champions Cup",
    shortName: "CHAMP",
    type: "ContinentalCup",
    format: "GroupAndKnockout",
    teamIds: [],
  };

  // Continental Cup — second-tier European competition (UEFA
  // Europa-style). Pulls qualifiers from every nation's mid table +
  // top of D2.
  map[COMP_IDS.CONTINENTAL_CUP] = {
    id: COMP_IDS.CONTINENTAL_CUP,
    name: "Continental Cup",
    shortName: "CONT",
    type: "ContinentalCup",
    format: "GroupAndKnockout",
    teamIds: [],
  };

  return map;
}
