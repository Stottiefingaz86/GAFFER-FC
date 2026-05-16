// =====================================================================
// PLAYER GENERATOR — produces 25 fictional players per club, 2,000 total.
// Quality is shaped by division tier and role archetype.
// =====================================================================

import type {
  Club,
  DetailedPosition,
  Personality,
  Player,
  PlayerTrait,
  Position,
  PreferredFoot,
  RoleArchetype,
  TransferInterest,
  TransferInterestLevel,
} from "@/types/game";
import { NATIONALITIES } from "@/data/names";
import { clamp, type Rng } from "@/lib/rng";
import { computePlayerValue, computeWageFromValue } from "@/lib/playerValue";
import type { StrengthTier } from "@/data/clubSeeds";

// =====================================================================
// Per-club STRENGTH TIER shift — bumps a club's player band up/down so a
// division has clear favourites, mid-table, and strugglers instead of a
// bell curve crowded around one mean.
// =====================================================================

interface StrengthShift {
  // Added to every band's [min, max] so weaker clubs really field weaker XIs.
  overallShift: number;
  // Star quality scales harder — favourites have proper headline names.
  starShift: number;
  // Potential ceiling shift (top clubs attract better prospects too).
  potentialShift: number;
  // Multiplier on the wage/budget base so finances match squad strength.
  financeMult: number;
}

const STRENGTH_SHIFT: Record<StrengthTier, StrengthShift> = {
  top: { overallShift: 6, starShift: 4, potentialShift: 4, financeMult: 2.1 },
  upper: { overallShift: 3, starShift: 2, potentialShift: 2, financeMult: 1.4 },
  mid: { overallShift: 0, starShift: 0, potentialShift: 0, financeMult: 1.0 },
  lower: { overallShift: -3, starShift: -2, potentialShift: -1, financeMult: 0.65 },
  bottom: { overallShift: -7, starShift: -4, potentialShift: -3, financeMult: 0.4 },
};

export function strengthFinanceMult(tier: StrengthTier): number {
  return STRENGTH_SHIFT[tier].financeMult;
}

interface DivisionBand {
  starOverall: [number, number];
  starterOverall: [number, number];
  squadOverall: [number, number];
  prospectOverall: [number, number];
  prospectPotential: [number, number];
  starPotentialBoost: [number, number];
  budgetBase: number;
  wageBase: number;
}

const BANDS: Record<1 | 2 | 3 | 4, DivisionBand> = {
  1: {
    starOverall: [82, 89],
    starterOverall: [72, 84],
    squadOverall: [66, 78],
    prospectOverall: [68, 78],
    prospectPotential: [80, 90],
    starPotentialBoost: [85, 92],
    budgetBase: 60_000_000,
    wageBase: 45_000,
  },
  2: {
    starOverall: [74, 81],
    starterOverall: [64, 76],
    squadOverall: [58, 70],
    prospectOverall: [60, 72],
    prospectPotential: [74, 84],
    starPotentialBoost: [78, 86],
    budgetBase: 12_000_000,
    wageBase: 14_000,
  },
  3: {
    starOverall: [66, 74],
    starterOverall: [56, 68],
    squadOverall: [50, 62],
    prospectOverall: [52, 64],
    prospectPotential: [68, 78],
    starPotentialBoost: [72, 80],
    budgetBase: 2_500_000,
    wageBase: 4_500,
  },
  4: {
    starOverall: [58, 67],
    starterOverall: [45, 60],
    squadOverall: [40, 52],
    prospectOverall: [42, 58],
    prospectPotential: [62, 75],
    starPotentialBoost: [65, 76],
    budgetBase: 400_000,
    wageBase: 1_400,
  },
};

const POSITION_DISTRIBUTION: Position[] = [
  ...Array(2).fill("GK"),
  ...Array(8).fill("DEF"),
  ...Array(8).fill("MID"),
  ...Array(7).fill("FWD"),
];

const DETAILED_FOR_BROAD: Record<Position, DetailedPosition[]> = {
  GK: ["GK"],
  DEF: ["CB", "CB", "CB", "LB", "RB"],
  MID: ["CM", "CM", "DM", "AM", "LM", "RM"],
  FWD: ["ST", "ST", "CF", "LW", "RW"],
};

const PERSONALITIES: Personality[] = [
  "Professional","Ambitious","Loyal","Temperamental","Relaxed","Leader",
  "Inconsistent","Confident","Nervous","Driven","Money Motivated","Big Match Mentality","Homegrown Hero",
];

const TRAITS: PlayerTrait[] = [
  "Big Game Player","Injury Prone","Leader","Hot Head","Super Sub","Wonderkid",
  "Penalty Specialist","Long Shot Taker","Composed Finisher","Cult Hero","Loyal","Mercenary",
  "Fan Favourite","Derby Specialist","Late Bloomer","Set Piece Expert","Engine","Brick Wall",
  "Playmaker","Speedster","Target Man","Clutch Keeper","Cup Specialist","One Club Man",
];

interface AttributeProfile {
  pace: [number, number];
  shooting: [number, number];
  passing: [number, number];
  tackling: [number, number];
  stamina: [number, number];
  goalkeeping: [number, number];
  technique: [number, number];
  strength: [number, number];
  mentality: [number, number];
}

function profileFor(detailed: DetailedPosition): AttributeProfile {
  switch (detailed) {
    case "GK":
      return {
        pace: [-15, -5], shooting: [-30, -20], passing: [-10, 0], tackling: [-25, -10],
        stamina: [-10, 0], goalkeeping: [10, 20], technique: [-12, -2],
        strength: [0, 8], mentality: [0, 8],
      };
    case "CB":
      return {
        pace: [-8, 2], shooting: [-15, -5], passing: [-5, 5], tackling: [8, 18],
        stamina: [-2, 8], goalkeeping: [-25, -15], technique: [-8, 2],
        strength: [8, 18], mentality: [3, 10],
      };
    case "LB":
    case "RB":
      return {
        pace: [4, 14], shooting: [-12, -2], passing: [0, 8], tackling: [4, 12],
        stamina: [6, 14], goalkeeping: [-25, -15], technique: [-3, 5],
        strength: [0, 8], mentality: [0, 6],
      };
    case "DM":
      return {
        pace: [-2, 6], shooting: [-8, 2], passing: [4, 12], tackling: [6, 14],
        stamina: [4, 12], goalkeeping: [-25, -15], technique: [0, 8],
        strength: [4, 12], mentality: [4, 10],
      };
    case "CM":
      return {
        pace: [0, 8], shooting: [-2, 8], passing: [6, 14], tackling: [0, 8],
        stamina: [6, 14], goalkeeping: [-25, -15], technique: [4, 12],
        strength: [-2, 6], mentality: [2, 8],
      };
    case "AM":
      return {
        pace: [2, 10], shooting: [4, 12], passing: [6, 14], tackling: [-8, 0],
        stamina: [0, 8], goalkeeping: [-25, -15], technique: [8, 16],
        strength: [-4, 4], mentality: [0, 6],
      };
    case "LM":
    case "RM":
      return {
        pace: [6, 14], shooting: [-2, 6], passing: [2, 10], tackling: [-2, 6],
        stamina: [6, 14], goalkeeping: [-25, -15], technique: [4, 12],
        strength: [-4, 4], mentality: [-2, 4],
      };
    case "LW":
    case "RW":
      return {
        pace: [10, 18], shooting: [2, 10], passing: [0, 8], tackling: [-8, 0],
        stamina: [4, 12], goalkeeping: [-25, -15], technique: [8, 16],
        strength: [-6, 2], mentality: [-2, 4],
      };
    case "ST":
      return {
        pace: [4, 14], shooting: [10, 18], passing: [-4, 4], tackling: [-12, -4],
        stamina: [0, 8], goalkeeping: [-25, -15], technique: [4, 12],
        strength: [4, 12], mentality: [0, 6],
      };
    case "CF":
      return {
        pace: [2, 10], shooting: [8, 16], passing: [4, 12], tackling: [-10, -2],
        stamina: [0, 8], goalkeeping: [-25, -15], technique: [8, 16],
        strength: [2, 10], mentality: [0, 6],
      };
  }
}

function rollAttribute(rng: Rng, baseline: number, range: [number, number]): number {
  const spread = range[1] - range[0];
  const adj = range[0] + rng.next() * spread;
  return clamp(Math.round(baseline + adj), 25, 99);
}

export interface PlayerGenInput {
  clubId: string;
  divisionTier: 1 | 2 | 3 | 4;
  strengthTier: StrengthTier;
  archetype: RoleArchetype;
  detailed: DetailedPosition;
  rng: Rng;
  /** Optional registry that tracks already-issued names so the world
   * never produces two "Tom Kettering"s. Falls back to a Roman-numeral
   * suffix after 8 collisions on the same nationality. */
  registry?: NameRegistry;
  /** Per-club surname registry. When provided, the generator avoids
   * picking a `lastName` that's already used by another player at the
   * same club — so a single squad never has two "Halliwell"s. The
   * caller passes a fresh `Set<string>` (lowercased surnames) and we
   * mutate it as we go. Surnames CAN still collide across clubs;
   * that's realistic and the display name disambiguates by club. */
  clubSurnames?: Set<string>;
}

/**
 * Tracks every (firstName, lastName) tuple ever issued in this world
 * so the generator can avoid duplicate names. With ~10k+ players we
 * MUST track this — the birthday paradox makes name clashes inevitable
 * even with a few thousand combos per nationality.
 */
export class NameRegistry {
  private set = new Set<string>();
  private suffixes = new Map<string, number>();

  /** Returns true if the exact name tuple has already been issued. */
  has(first: string, last: string): boolean {
    return this.set.has(this.key(first, last));
  }

  /** Mark a name as taken. */
  add(first: string, last: string): void {
    this.set.add(this.key(first, last));
  }

  /** Issue a Roman-numeral suffix for a colliding (first, last). Useful
   * when the pool is exhausted and we'd otherwise loop forever. */
  withSuffix(first: string, last: string): { first: string; last: string } {
    const k = this.key(first, last);
    const next = (this.suffixes.get(k) ?? 1) + 1;
    this.suffixes.set(k, next);
    const numerals = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    const suffix = numerals[Math.min(next, numerals.length - 1)];
    const newLast = suffix ? `${last} ${suffix}` : last;
    this.set.add(this.key(first, newLast));
    return { first, last: newLast };
  }

  size(): number {
    return this.set.size;
  }

  private key(first: string, last: string): string {
    return `${first.toLowerCase()}|${last.toLowerCase()}`;
  }
}

// Apply a uniform +/- shift to every numeric range in a band. Keeps the
// internal spread but moves the centre of mass up for favourites, down
// for strugglers — giving each division a real pecking order.
function shiftedBand(divisionTier: 1 | 2 | 3 | 4, strengthTier: StrengthTier): DivisionBand {
  const base = BANDS[divisionTier];
  const s = STRENGTH_SHIFT[strengthTier];
  const ov = (r: [number, number]): [number, number] => [r[0] + s.overallShift, r[1] + s.overallShift];
  const sb = (r: [number, number]): [number, number] => [r[0] + s.starShift, r[1] + s.starShift];
  const pb = (r: [number, number]): [number, number] => [r[0] + s.potentialShift, r[1] + s.potentialShift];
  return {
    starOverall: sb(base.starOverall),
    starterOverall: ov(base.starterOverall),
    squadOverall: ov(base.squadOverall),
    prospectOverall: ov(base.prospectOverall),
    prospectPotential: pb(base.prospectPotential),
    starPotentialBoost: pb(base.starPotentialBoost),
    budgetBase: base.budgetBase,
    wageBase: base.wageBase,
  };
}

export function generatePlayer(input: PlayerGenInput): Player {
  const { clubId, divisionTier, strengthTier, archetype, detailed, rng, registry, clubSurnames } = input;
  const band = shiftedBand(divisionTier, strengthTier);

  // Determine baseline overall by archetype/division.
  let overall: number;
  let potential: number;
  let age: number;
  let trait: PlayerTrait;
  let personality: Personality;

  switch (archetype) {
    case "Star": {
      overall = rng.int(band.starOverall[0], band.starOverall[1]);
      potential = clamp(
        overall + rng.int(0, 2),
        band.starPotentialBoost[0],
        band.starPotentialBoost[1] + 2
      );
      // Stars peak between 24 and 29. We allow occasional 22/23-year-old
      // stars (a Mbappé/Vinícius type) but the band is centred on the
      // peak years so the world doesn't feel like every elite player
      // is either a teenager or a veteran.
      age = rng.int(22, 29);
      trait = rng.pick<PlayerTrait>([
        "Big Game Player","Composed Finisher","Playmaker","Leader","Fan Favourite","Penalty Specialist",
      ]);
      personality = rng.pick(["Professional", "Leader", "Confident", "Big Match Mentality"]);
      break;
    }
    case "RisingStar": {
      // A Bellingham / Yamal — already at starter level, with a Star-tier
      // ceiling. Sits one rung below the established Star at age but
      // can clearly outgrow them with a couple of years of development.
      overall = rng.int(
        Math.max(band.starterOverall[1] - 1, band.starOverall[0] - 3),
        band.starOverall[0] + 1,
      );
      potential = clamp(
        rng.int(band.starPotentialBoost[0], band.starPotentialBoost[1] + 3),
        overall + 4,
        99,
      );
      age = rng.int(20, 24);
      trait = rng.pick<PlayerTrait>([
        "Wonderkid","Speedster","Composed Finisher","Late Bloomer","Big Game Player",
      ]);
      personality = rng.pick(["Ambitious","Driven","Confident","Big Match Mentality"]);
      break;
    }
    case "VeteranLeader": {
      // Veterans are *experienced*, not elite. Lowered the band so they
      // don't crowd the top of the OVR list — that's the Star/RisingStar
      // job. They're still excellent starters, just not 84-rated giants
      // at age 36.
      overall = rng.int(band.starterOverall[1] - 7, band.starterOverall[1] - 2);
      potential = overall;
      age = rng.int(31, 35);
      trait = rng.pick<PlayerTrait>(["Leader","Loyal","Cult Hero","One Club Man","Brick Wall"]);
      personality = "Leader";
      break;
    }
    case "FanFavourite": {
      overall = rng.int(band.starterOverall[0], band.starterOverall[1] - 2);
      potential = overall;
      age = rng.int(26, 30);
      trait = rng.pick<PlayerTrait>(["Cult Hero","Fan Favourite","Loyal","Derby Specialist"]);
      personality = "Homegrown Hero";
      break;
    }
    case "InconsistentTalent": {
      overall = rng.int(band.starterOverall[0] + 1, band.starterOverall[1]);
      potential = clamp(overall + rng.int(2, 6), 0, 95);
      age = rng.int(22, 26);
      trait = rng.pick<PlayerTrait>(["Hot Head","Mercenary","Long Shot Taker","Wonderkid"]);
      personality = rng.pick(["Inconsistent","Temperamental","Money Motivated"]);
      break;
    }
    case "BackupKeeper": {
      overall = rng.int(band.squadOverall[0], band.squadOverall[1]);
      potential = clamp(overall + rng.int(-1, 3), 0, 90);
      age = rng.int(21, 32);
      trait = rng.pick<PlayerTrait>(["Loyal","Clutch Keeper","Brick Wall"]);
      personality = rng.pick(["Professional","Loyal","Relaxed"]);
      break;
    }
    case "InjuryProne": {
      overall = rng.int(band.starterOverall[0], band.starterOverall[1]);
      potential = overall + rng.int(0, 3);
      age = rng.int(23, 30);
      trait = "Injury Prone";
      personality = rng.pick(["Driven","Professional","Nervous"]);
      break;
    }
    case "HighPotentialYouth": {
      overall = rng.int(band.prospectOverall[0], band.prospectOverall[0] + 6);
      potential = rng.int(band.prospectPotential[0], band.prospectPotential[1]);
      age = rng.int(16, 19);
      trait = rng.pick<PlayerTrait>(["Wonderkid","Late Bloomer","Speedster","Composed Finisher"]);
      personality = rng.pick(["Ambitious","Driven","Confident","Nervous"]);
      break;
    }
    case "YoungProspect": {
      overall = rng.int(band.prospectOverall[0], band.prospectOverall[1] - 2);
      potential = rng.int(
        band.prospectPotential[0] - 2,
        band.prospectPotential[1] - 2
      );
      age = rng.int(17, 21);
      trait = rng.pick<PlayerTrait>(["Wonderkid","Late Bloomer","Engine","Speedster","Set Piece Expert"]);
      personality = rng.pick(["Ambitious","Driven","Confident"]);
      break;
    }
    case "Standard":
    default: {
      overall = rng.int(band.squadOverall[0], band.starterOverall[0] + 2);
      potential = clamp(overall + rng.int(-1, 3), 0, 95);
      // Capped at 31: rotation players should mostly be in their
      // working-age window. Old depth players come from VeteranLeader.
      age = rng.int(21, 31);
      trait = rng.pick(TRAITS);
      personality = rng.pick(PERSONALITIES);
      break;
    }
  }

  // Attribute roll based on detailed-position profile, modulated by overall.
  const profile = profileFor(detailed);
  const baseline = overall;

  const pace = rollAttribute(rng, baseline, profile.pace);
  const shooting = rollAttribute(rng, baseline, profile.shooting);
  const passing = rollAttribute(rng, baseline, profile.passing);
  const tackling = rollAttribute(rng, baseline, profile.tackling);
  const stamina = rollAttribute(rng, baseline, profile.stamina);
  const goalkeeping = rollAttribute(rng, baseline, profile.goalkeeping);
  const technique = rollAttribute(rng, baseline, profile.technique);
  const strength = rollAttribute(rng, baseline, profile.strength);
  const mentality = rollAttribute(rng, baseline, profile.mentality);

  const nationalityPool = rng.pickWeighted(NATIONALITIES, [
    // Strongly English-flavoured base, with international flavour
    35, 8, 9, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2, 2, 2, 4, 3, 2,
  ]);

  // Pick a unique name. Two layers of de-duplication:
  //   1. The world `registry` ensures no two players globally share an
  //      identical (firstName, lastName) tuple.
  //   2. `clubSurnames` ensures no two players in the *same* squad
  //      share a last name — even if their first names differ — so
  //      the user never sees "Halliwell · Halliwell" on a team sheet.
  //
  // We retry up to 16 times for both checks combined, then fall back
  // to a Roman-numeral suffix on the global registry collision case.
  // The per-club check soft-fails (i.e. allows the duplicate) only
  // when the surname pool is genuinely exhausted — extraordinarily
  // unlikely with 25 players per squad and surname pools of 80+.
  const isClubSurnameDup = (last: string): boolean =>
    clubSurnames?.has(last.toLowerCase()) ?? false;

  let firstName = rng.pick(nationalityPool.first);
  let lastName = rng.pick(nationalityPool.last);

  let attempts = 0;
  while (
    attempts < 16 &&
    ((registry?.has(firstName, lastName) ?? false) || isClubSurnameDup(lastName))
  ) {
    firstName = rng.pick(nationalityPool.first);
    lastName = rng.pick(nationalityPool.last);
    attempts++;
  }
  if (registry?.has(firstName, lastName)) {
    const suffixed = registry.withSuffix(firstName, lastName);
    firstName = suffixed.first;
    lastName = suffixed.last;
  } else {
    registry?.add(firstName, lastName);
  }
  clubSurnames?.add(lastName.toLowerCase());

  const displayName =
    rng.bool(0.75) ? lastName : `${firstName[0]}. ${lastName}`;

  const broad: Position =
    detailed === "GK" ? "GK"
    : ["CB", "LB", "RB"].includes(detailed) ? "DEF"
    : ["DM", "CM", "AM", "LM", "RM"].includes(detailed) ? "MID"
    : "FWD";

  const secondary: DetailedPosition[] = (() => {
    if (broad === "GK") return [];
    if (broad === "DEF") return [rng.pick(["CB","LB","RB","DM"]) as DetailedPosition];
    if (broad === "MID") return [rng.pick(["CM","DM","AM","LM","RM"]) as DetailedPosition];
    return [rng.pick(["ST","CF","LW","RW","AM"]) as DetailedPosition];
  })();

  const draft: Player = {
    id: `pl_${rng.int(100000, 999999)}_${rng.int(100, 999)}`,
    clubId,
    firstName,
    lastName,
    displayName,
    age,
    dateOfBirth: `${2026 - age}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
    nationality: nationalityPool.id,
    position: broad,
    detailedPosition: detailed,
    secondaryPositions: secondary,
    preferredFoot: rng.pickWeighted<PreferredFoot>(
      ["Right", "Left", "Both"],
      [70, 25, 5]
    ),
    height: rng.int(broad === "GK" ? 184 : 168, broad === "GK" ? 198 : 192),

    overall,
    potential: clamp(Math.max(potential, overall), 30, 99),

    pace,
    shooting,
    passing,
    tackling,
    stamina,
    goalkeeping,
    technique,
    strength,
    mentality,

    form: rng.int(45, 75),
    morale: rng.int(55, 85),
    fitness: rng.int(85, 100),

    value: 0,
    wage: 0,
    contractYears: rng.int(1, 5),

    personality,
    trait,

    isInjured: false,
    injuryWeeks: 0,
    isSuspended: false,
    suspensionMatches: 0,

    goals: 0,
    assists: 0,
    appearances: 0,
    yellowCards: 0,
    redCards: 0,
    averageRating: 6.5,
    history: [],

    // International record. Caps scale with overall + age. Top players in
    // their late 20s tend to have the most caps; youngsters or weaker
    // players might have none.
    caps: caplsForOverallAndAge(overall, age, rng),
    internationalGoals: capsGoalsFor(overall, age, broad, rng),

    // No transfer interest at generation; it's filled in later by
    // seedTransferInterest() once all clubs exist.
    transferInterest: [],
  };

  // Stamp initial value/wage from the dynamic calculator. Performance weight
  // is dampened at season 0 because no matches have been played yet.
  const value = computePlayerValue(draft, { performanceWeight: 0.4 });
  const wage = computeWageFromValue(draft, value);
  return { ...draft, value, wage };
}

// Generate a complete 25-man squad with the exact archetype mix the brief asks for.
export function generateSquad(
  clubId: string,
  divisionTier: 1 | 2 | 3 | 4,
  strengthTier: StrengthTier,
  rng: Rng,
  registry?: NameRegistry,
): Player[] {
  const players: Player[] = [];

  const detailedDistribution: DetailedPosition[] = [];
  POSITION_DISTRIBUTION.forEach((p) => {
    const pool = DETAILED_FOR_BROAD[p];
    detailedDistribution.push(rng.pick(pool));
  });
  // Force at least one striker and one CB
  if (!detailedDistribution.includes("ST")) detailedDistribution[18] = "ST";
  if (!detailedDistribution.filter((d) => d === "CB").length)
    detailedDistribution[2] = "CB";

  // Decide which slot indices get which archetype roles.
  const archetypeAssignments: RoleArchetype[] = Array(25).fill("Standard");

  // Slot 0/1 = goalkeepers
  archetypeAssignments[0] = "Standard";
  archetypeAssignments[1] = "BackupKeeper";

  // Pick slot for the star (must be in starting outfield band - any non-GK)
  const outfieldIndices = detailedDistribution
    .map((_, i) => i)
    .filter((i) => i >= 2);

  const taken = new Set<number>();
  const assignRole = (role: RoleArchetype) => {
    let idx = rng.pick(outfieldIndices);
    let safety = 0;
    while (taken.has(idx) && safety < 50) {
      idx = rng.pick(outfieldIndices);
      safety++;
    }
    taken.add(idx);
    archetypeAssignments[idx] = role;
  };

  assignRole("Star");
  // Every club gets a young phenom alongside the established star —
  // crucial for the "best players in the world include 20-something
  // generational talents" feel.
  assignRole("RisingStar");
  assignRole("VeteranLeader");
  assignRole("FanFavourite");
  assignRole("InconsistentTalent");
  assignRole("InjuryProne");
  assignRole("HighPotentialYouth");
  assignRole("YoungProspect");
  // sprinkle a couple more youth-flavoured players
  if (rng.bool()) assignRole("YoungProspect");
  if (rng.bool(0.4)) assignRole("HighPotentialYouth");
  // ~20% of clubs get a *second* RisingStar — guarantees the world
  // has a meaningful pool of "young best-in-world" candidates.
  if (rng.bool(0.2)) assignRole("RisingStar");

  // Fresh per-club surname registry — guarantees a 25-man squad never
  // contains two players with the same last name.
  const clubSurnames = new Set<string>();

  for (let i = 0; i < 25; i++) {
    players.push(
      generatePlayer({
        clubId,
        divisionTier,
        strengthTier,
        archetype: archetypeAssignments[i],
        detailed: detailedDistribution[i],
        rng,
        registry,
        clubSurnames,
      })
    );
  }

  return players;
}

// =====================================================================
// Youth pool / free agents — unsigned 15-21 year old prospects scattered
// around the world. The fun is hunting for the next wonderkid before
// rivals do, so we generate WAY more than the clubs absorb.
// =====================================================================

/** Sentinel club id used for free agents and unsigned youth pool. */
export const FREE_AGENT_CLUB_ID = "free_agent";

export interface YouthPoolOpts {
  /** How many prospects to generate. */
  count: number;
}

/** Generate an unsigned youth/free-agent pool. Players have no clubId
 * (set to {@link FREE_AGENT_CLUB_ID}), are 15-21 years old, and have a
 * potential rating that hints at their future ceiling. A small
 * sub-set are "wonderkids" (potential 85+) — the next Messi, Henry,
 * Maradona that the user can scout and sign. */
export function generateYouthPool(
  rng: Rng,
  opts: YouthPoolOpts,
  registry?: NameRegistry,
): Player[] {
  const players: Player[] = [];
  const detailedAll: DetailedPosition[] = [
    "GK","CB","LB","RB","DM","CM","AM","LM","RM","ST","CF","LW","RW",
  ];

  for (let i = 0; i < opts.count; i++) {
    const detailed = rng.pick(detailedAll);
    // Mostly Standard archetype, with a sprinkling of true wonderkids.
    // Wonderkid = HighPotentialYouth at the deepest division band so
    // their floor is moderate but their ceiling is high.
    const archetype: RoleArchetype =
      rng.bool(0.08) ? "HighPotentialYouth"
      : rng.bool(0.25) ? "YoungProspect"
      : "Standard";

    // Free agents come from a wide spread of divisional backgrounds —
    // we vary the tier so the youth pool isn't all bottom-tier scrubs.
    const divisionTier = rng.pickWeighted<1 | 2 | 3 | 4>(
      [1, 2, 3, 4],
      [12, 22, 30, 36],
    );
    const strengthTier = rng.pickWeighted<StrengthTier>(
      ["top","upper","mid","lower","bottom"],
      [4, 8, 30, 30, 28],
    );

    const draft = generatePlayer({
      clubId: FREE_AGENT_CLUB_ID,
      divisionTier,
      strengthTier,
      archetype,
      detailed,
      rng,
      registry,
    });

    // Stamp youth-realistic age + slimmer wage so the listed value is
    // dominated by potential, not current ability.
    const youthAge = rng.int(15, 21);
    const ageReducedOverall = clamp(
      draft.overall - Math.max(0, 22 - youthAge) * 2,
      28,
      Math.max(40, draft.overall),
    );
    players.push({
      ...draft,
      age: youthAge,
      dateOfBirth: `${2026 - youthAge}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      overall: ageReducedOverall,
      // Free agents have NO contract and NO wage on their books.
      contractYears: 0,
      wage: 0,
    });
  }

  return players;
}

// =====================================================================
// Retirement + regen — used by the season-rollover transition.
// =====================================================================

/**
 * Yearly overall delta applied during the season rollover.
 *
 * Football's age curve in one helper:
 *   - 16-18: rapid growth, 3-6 OVR per year if there's potential headroom.
 *   - 19-21: steady growth, 1-3 per year.
 *   - 22-23: slowing growth, 0-2.
 *   - 24-29: prime — flat (occasional ±1 around the peak).
 *   - 30-31: gentle decline starts (0 or -1).
 *   - 32-33: -1 or -2.
 *   - 34-35: -2 or -3.
 *   - 36+:   -2 to -4 — career winding down.
 *
 * Goalkeepers age slower so we shift their decline by 2 years.
 *
 * The growth cap is the player's `potential`. The decline floor is
 * 35 OVR — even a 40-year-old retains some baseline competence (and
 * the retirement engine will sweep them up before they get there).
 */
export function seasonalOverallDelta(p: Player, rng: Rng): number {
  const isGK = p.position === "GK";
  // Effective "football age" — GKs age slower, so a 32-year-old GK
  // behaves like a 30-year-old outfielder for decline purposes.
  const a = isGK ? p.age - 2 : p.age;
  const headroom = p.potential - p.overall;

  // Pre-prime: growth scales with how far the player is below their
  // ceiling. Players already AT their potential plateau a bit early.
  if (a <= 18) {
    if (headroom >= 10) return rng.int(3, 6);
    if (headroom >= 4) return rng.int(2, 4);
    if (headroom >= 1) return rng.int(0, 2);
    return 0;
  }
  if (a <= 21) {
    if (headroom >= 8) return rng.int(2, 4);
    if (headroom >= 3) return rng.int(1, 3);
    if (headroom >= 1) return rng.int(0, 2);
    return 0;
  }
  if (a <= 23) {
    if (headroom >= 4) return rng.int(1, 2);
    if (headroom >= 1) return rng.int(0, 1);
    return 0;
  }

  // Prime — flat with the occasional bump up if there's still headroom,
  // and a tiny chance of a 1-point dip due to wear.
  if (a <= 29) {
    if (headroom >= 1 && rng.bool(0.35)) return 1;
    return rng.bool(0.05) ? -1 : 0;
  }

  // Decline tail — gentle at first, accelerating into the late 30s.
  if (a <= 31) return rng.bool(0.45) ? -1 : 0;
  if (a <= 33) return -rng.int(1, 2);
  if (a <= 35) return -rng.int(1, 3);
  if (a <= 37) return -rng.int(2, 3);
  return -rng.int(2, 4);
}

/**
 * Decide if a player retires this off-season. Older players retire more
 * often; below-replacement-level veterans can hang it up early too.
 * Returns true if the player should be removed from the world.
 */
export function shouldRetire(p: Player, rng: Rng): boolean {
  const a = p.age;
  if (a < 30) return false;
  // Goalkeepers play longer than outfielders.
  const gkBonus = p.position === "GK" ? 2 : 0;
  if (a < 32 + gkBonus) return rng.bool(0.02);
  if (a < 34 + gkBonus) return rng.bool(0.08);
  if (a < 36 + gkBonus) return rng.bool(0.22);
  if (a < 38 + gkBonus) return rng.bool(0.45);
  if (a < 40 + gkBonus) return rng.bool(0.7);
  return rng.bool(0.9);
}

/**
 * Generate `n` 15-year-old regens for the global youth pool. These are
 * the new generation entering the world each off-season — among them
 * will be future Henrys and Maradonas.
 */
export function generateRegens(
  count: number,
  rng: Rng,
  registry?: NameRegistry,
): Player[] {
  const players: Player[] = [];
  const detailedAll: DetailedPosition[] = [
    "GK","CB","LB","RB","DM","CM","AM","LM","RM","ST","CF","LW","RW",
  ];

  for (let i = 0; i < count; i++) {
    const detailed = rng.pick(detailedAll);
    const archetype: RoleArchetype =
      rng.bool(0.04) ? "HighPotentialYouth" // ~4% true wonderkids
      : rng.bool(0.20) ? "YoungProspect"
      : "Standard";

    const draft = generatePlayer({
      clubId: FREE_AGENT_CLUB_ID,
      divisionTier: rng.pickWeighted<1 | 2 | 3 | 4>([1, 2, 3, 4], [10, 20, 30, 40]),
      strengthTier: rng.pickWeighted<StrengthTier>(
        ["top","upper","mid","lower","bottom"],
        [3, 6, 28, 33, 30],
      ),
      archetype,
      detailed,
      rng,
      registry,
    });

    // Always 15. Overall floored to youth band even if archetype rolled
    // higher; potential keeps the headline ceiling.
    const overallCapped = Math.min(draft.overall, rng.int(40, 55));
    players.push({
      ...draft,
      age: 15,
      dateOfBirth: `${2026 - 15}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      overall: overallCapped,
      contractYears: 0,
      wage: 0,
    });
  }

  return players;
}

// =====================================================================
// Caps + transfer interest helpers
// =====================================================================

/** Rough caps count for the simulated nation. Better players get more
 * caps; very young players have fewer; veterans tend to plateau. */
function caplsForOverallAndAge(overall: number, age: number, rng: Rng): number {
  if (overall < 65) return rng.bool(0.05) ? rng.int(1, 3) : 0;
  if (overall < 72) return rng.int(0, 8);
  if (overall < 78) return rng.int(2, 25);
  if (overall < 84) return rng.int(8, 55);
  // Genuine internationals
  const peak = Math.max(0, age - 17);
  return rng.int(Math.max(8, peak * 2), Math.max(20, peak * 4 + 30));
}

/** International goals scaled by position and overall. */
function capsGoalsFor(
  overall: number,
  age: number,
  position: Position,
  rng: Rng,
): number {
  const caps = caplsForOverallAndAge(overall, age, rng);
  if (caps === 0) return 0;
  if (position === "GK" || position === "DEF") {
    return rng.bool(0.25) ? rng.int(0, Math.max(1, Math.floor(caps / 12))) : 0;
  }
  if (position === "MID") return rng.int(0, Math.max(1, Math.floor(caps / 6)));
  // Forwards
  return rng.int(0, Math.max(2, Math.floor(caps / 2.5)));
}

/** After all clubs and players exist, seed plausible transfer interest
 * for the standout players. Mutates the supplied `players` map.
 *
 * Heuristic: the top ~20% of players in each squad attract interest
 * from a small handful of richer/equally-rich clubs. Stronger players
 * get firmer interest. */
export function seedTransferInterest(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  startingWeek: number,
  rng: Rng,
): void {
  const allClubs = Object.values(clubs);
  const playerList = Object.values(players);

  for (const p of playerList) {
    const interest: TransferInterest[] = [];

    // Probability of any interest scales sharply with overall.
    const baseChance =
      p.overall >= 84 ? 0.95
      : p.overall >= 78 ? 0.65
      : p.overall >= 72 ? 0.30
      : p.overall >= 68 ? 0.10
      : 0.02;

    if (rng.bool(baseChance)) {
      // Pick 1–3 clubs that are NOT the player's own and that have a
      // higher squad rating than the player's current club (i.e. a step
      // up). Fall back to any other club if no upward move exists.
      const ownClub = clubs[p.clubId];
      const candidates = allClubs.filter(
        (c) => c.id !== p.clubId && c.squadRating >= (ownClub?.squadRating ?? 0) - 2,
      );
      if (!candidates.length) continue;

      const numInterested = p.overall >= 84 ? rng.int(2, 3) : rng.int(1, 2);
      const picked = new Set<string>();
      for (let i = 0; i < numInterested; i++) {
        const c = rng.pick(candidates);
        if (picked.has(c.id)) continue;
        picked.add(c.id);

        const level: TransferInterestLevel =
          p.overall >= 86 && rng.bool(0.4) ? "bid"
          : p.overall >= 80 && rng.bool(0.5) ? "interested"
          : rng.bool(0.5) ? "watching"
          : "rumour";

        interest.push({
          clubId: c.id,
          level,
          since: startingWeek - rng.int(0, 6),
        });
      }
    }

    p.transferInterest = interest;
  }
}
