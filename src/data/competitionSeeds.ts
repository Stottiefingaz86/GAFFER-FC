// =====================================================================
// COMPETITION SEEDS — fictional only.
// =====================================================================

import type { Competition } from "@/types/game";

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

export function buildCompetitionsScaffold(): Record<string, Competition> {
  const map: Record<string, Competition> = {};

  ([1, 2, 3, 4] as const).forEach((tier) => {
    const d = DIVISION_NAMES[tier];
    map[d.id] = {
      id: d.id,
      name: d.name,
      shortName: d.short,
      type: "League",
      format: "League",
      divisionTier: tier,
      teamIds: [],
    };
  });

  map[COMP_IDS.NATIONAL_CUP] = {
    id: COMP_IDS.NATIONAL_CUP,
    name: "National Cup",
    shortName: "NCUP",
    type: "DomesticCup",
    format: "Knockout",
    teamIds: [],
  };

  map[COMP_IDS.LEAGUE_CUP] = {
    id: COMP_IDS.LEAGUE_CUP,
    name: "League Cup",
    shortName: "LCUP",
    type: "LeagueCup",
    format: "Knockout",
    teamIds: [],
  };

  map[COMP_IDS.CHAMPIONS_CUP] = {
    id: COMP_IDS.CHAMPIONS_CUP,
    name: "Champions Cup",
    shortName: "CHAMP",
    type: "ContinentalCup",
    format: "GroupAndKnockout",
    teamIds: [],
  };

  map[COMP_IDS.CONTINENTAL_CUP] = {
    id: COMP_IDS.CONTINENTAL_CUP,
    name: "Continental Cup",
    shortName: "CONT",
    type: "ContinentalCup",
    format: "GroupAndKnockout",
    teamIds: [],
  };

  map[COMP_IDS.SUPER_SHIELD] = {
    id: COMP_IDS.SUPER_SHIELD,
    name: "Super Shield",
    shortName: "SHLD",
    type: "SuperCup",
    format: "Knockout",
    teamIds: [],
  };

  return map;
}
