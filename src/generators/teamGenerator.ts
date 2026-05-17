// =====================================================================
// TEAM GENERATOR — turns ClubSeed[] + generated players into Club[]
// and Player records keyed by id.
// =====================================================================

import type { Club, ClubHistory, Player, Trophy } from "@/types/game";
import { strengthTierFor, type ClubSeed, type StrengthTier, getAllClubSeeds } from "@/data/clubSeeds";
import { spriteOverrideFor } from "@/data/clubSpriteOverrides";
import BADGE_PALETTES from "@/data/badgePalettes.json";
import { COMP_IDS } from "@/data/competitionSeeds";
import { NATIONS, NATION_IDS, divisionIdFor, divisionNameFor, nationFor } from "@/data/nations";
import {
  NameRegistry,
  generateSquad,
  generateYouthPool,
  seedTransferInterest,
  strengthFinanceMult,
} from "@/generators/playerGenerator";
import { clamp, type Rng } from "@/lib/rng";

// Where in the [lo, hi] range a club's stats should sit, by strength tier.
// 0 = bottom of the range, 1 = top.
const STRENGTH_PIVOT: Record<StrengthTier, [number, number]> = {
  top:    [0.78, 1.00],
  upper:  [0.58, 0.82],
  mid:    [0.38, 0.62],
  lower:  [0.18, 0.42],
  bottom: [0.00, 0.22],
};

function inStrengthBand(lo: number, hi: number, strength: StrengthTier, rng: Rng): number {
  const [pLo, pHi] = STRENGTH_PIVOT[strength];
  const span = hi - lo;
  return Math.round(lo + span * (pLo + rng.next() * (pHi - pLo)));
}

function stadiumCapacityForTier(tier: 1 | 2 | 3 | 4, strength: StrengthTier, rng: Rng): number {
  const ranges = {
    1: [25_000, 75_000],
    2: [12_000, 35_000],
    3: [6_000, 20_000],
    4: [2_000, 12_000],
  } as const;
  const [lo, hi] = ranges[tier];
  return Math.round(inStrengthBand(lo, hi, strength, rng) / 500) * 500;
}

function budgetForTier(
  tier: 1 | 2 | 3 | 4,
  strength: StrengthTier,
  rng: Rng,
): { budget: number; wageBudget: number } {
  const ranges = {
    1: [20_000_000, 120_000_000],
    2: [4_000_000, 25_000_000],
    3: [800_000, 6_000_000],
    4: [50_000, 1_000_000],
  } as const;
  const [lo, hi] = ranges[tier];
  // Use a small range jitter then apply the strength finance multiplier so
  // top clubs in a division can clearly out-spend strugglers.
  const raw = rng.int(lo, hi);
  const budget = Math.round(raw * strengthFinanceMult(strength));
  return { budget, wageBudget: Math.round(budget * 0.55) };
}

// Palette overrides extracted from each hand-drawn badge PNG. Keyed by
// crest filename (e.g. "crest-ch-11.png"). When a club uses a sprite
// crest, we honour the badge's actual colours over the seed's so kits
// and gradients no longer fight the artwork — Norwich Canaries was
// rendering in blue because the seed was originally for the blue
// `harbour_athletic` club; the canary badge demands yellow + green.
interface BadgePalette {
  primary: string;
  secondary: string;
  accent: string;
}
const PALETTES = BADGE_PALETTES as Record<string, BadgePalette>;

function paletteForSprite(sprite: string | undefined): BadgePalette | null {
  if (!sprite) return null;
  return PALETTES[sprite] ?? null;
}

function reputationForTier(tier: 1 | 2 | 3 | 4, strength: StrengthTier, rng: Rng): number {
  const ranges = { 1: [70, 90], 2: [55, 75], 3: [40, 62], 4: [25, 50] } as const;
  const [lo, hi] = ranges[tier];
  return inStrengthBand(lo, hi, strength, rng);
}

function fanbaseForTier(tier: 1 | 2 | 3 | 4, strength: StrengthTier, rng: Rng): number {
  const ranges = {
    1: [40_000, 800_000],
    2: [15_000, 80_000],
    3: [4_000, 25_000],
    4: [800, 8_000],
  } as const;
  const [lo, hi] = ranges[tier];
  return inStrengthBand(lo, hi, strength, rng);
}

export interface BuildResult {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  divisionToClubIds: Record<string, string[]>;
}

export function buildClubsAndPlayers(rng: Rng): BuildResult {
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  // Pre-populate the divisionToClubIds map with every league across
  // every nation in the world so subsequent .push() calls are safe.
  const divisionToClubIds: Record<string, string[]> = {};
  NATIONS.forEach((n) => {
    n.divisionIds.forEach((id) => { divisionToClubIds[id] = []; });
  });
  // Single registry across the whole world — guarantees uniqueness for
  // every (firstName, lastName) tuple including youth pool + clubs.
  const registry = new NameRegistry();

  // Iterate every seed across every nation. The seeds carry their
  // own nationId so each club is placed in the right pyramid.
  const allSeeds = getAllClubSeeds();
  allSeeds.forEach((seed) => {
    const cRng = rng.fork(`club_${seed.id}`);
    const tier = seed.divisionTier;
    const nationId = seed.nationId ?? NATION_IDS.ENGLAND;
    const nation = nationFor(nationId);
    const division = {
      id: divisionIdFor(nationId, tier),
      name: divisionNameFor(nationId, tier),
    };
    const strength = strengthTierFor(seed);

    // Squad — biased toward the nation's home name pool so Italian
    // clubs get Italian-flavoured names, Spanish clubs Spanish names,
    // etc. The match engine doesn't care about nationality but the
    // user definitely notices if Roma's roster is full of "Harry
    // Smith"s.
    const squad = generateSquad(
      seed.id, tier, strength, cRng.fork("squad"), registry,
      { homeNationalityId: nation.nameNationalityId },
    );

    // Squad ratings
    const sortedByOverall = [...squad].sort((a, b) => b.overall - a.overall);
    const top18 = sortedByOverall.slice(0, 18);
    const squadRating = Math.round(top18.reduce((acc, p) => acc + p.overall, 0) / top18.length);

    const attackPlayers = top18.filter((p) => p.position === "FWD").slice(0, 4);
    const midPlayers = top18.filter((p) => p.position === "MID").slice(0, 4);
    const defPlayers = top18.filter((p) => p.position === "DEF").slice(0, 4);
    const gkPlayer = sortedByOverall.find((p) => p.position === "GK");

    const avg = (arr: { overall: number }[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b.overall, 0) / arr.length) : squadRating - 5;

    const attackRating = avg(attackPlayers);
    const midfieldRating = avg(midPlayers);
    const defenceRating = avg(defPlayers);
    const goalkeeperRating = gkPlayer ? gkPlayer.overall : squadRating - 8;

    const { budget, wageBudget } = budgetForTier(tier, strength, cRng.fork("budget"));
    const stadiumCap = stadiumCapacityForTier(tier, strength, cRng.fork("stadium"));
    const reputation = reputationForTier(tier, strength, cRng.fork("rep"));

    // The sprite override (if present) replaces the seed's display name,
    // short tag and city to match the hand-drawn crest. We also pull
    // the palette directly off the badge PNG so theming, kits and
    // gradients stay coherent with the artwork — the seed's colours
    // were authored before the crests were dropped in and frequently
    // disagree (Norwich Canaries was rendering in blue, etc.).
    const sprite = spriteOverrideFor(seed.id);
    const displayName = sprite?.name ?? seed.name;
    const displayShort = sprite?.shortName ?? seed.shortName;
    const displayCity = sprite?.city ?? seed.city;
    const palette = paletteForSprite(sprite?.crestSprite);
    const primary = palette?.primary ?? seed.primary;
    const secondary = palette?.secondary ?? seed.secondary;
    const accent = palette?.accent ?? seed.accent;

    const club: Club = {
      id: seed.id,
      name: displayName,
      shortName: displayShort,
      city: displayCity,
      country: nation.name,
      nationId: nation.id,
      divisionId: division.id,
      crestSprite: sprite?.crestSprite,
      badge: {
        shape: seed.badgeShape,
        primaryColor: primary,
        secondaryColor: secondary,
        accentColor: accent,
        icon: seed.badgeIcon,
        initials: displayShort,
        foundingYear: seed.foundingYear,
        pattern: seed.badgePattern,
      },
      homeKit: {
        primaryColor: primary,
        secondaryColor: secondary,
        // Shorts in the secondary so kit reads as primary-shirt /
        // secondary-shorts (e.g. Norwich now correctly = yellow shirt,
        // green shorts) rather than a one-tone block.
        shortsColor: secondary,
        socksColor: primary,
        pattern: seed.kitPattern,
        sponsorText: "GFC",
      },
      awayKit: {
        primaryColor: secondary,
        secondaryColor: primary,
        shortsColor: primary,
        socksColor: secondary,
        pattern: "plain",
        sponsorText: "GFC",
      },
      stadium: {
        id: `st_${seed.id}`,
        name: seed.stadium,
        capacity: stadiumCap,
        level: tier === 1 ? 4 : tier === 2 ? 3 : tier === 3 ? 2 : 1,
        condition: clamp(cRng.int(60, 95), 0, 100),
        atmosphere: clamp(cRng.int(55, 95), 0, 100),
        hospitalityLevel: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        fanZoneLevel: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        pitchQualityLevel: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 3),
      },
      budget,
      wageBudget,
      reputation,
      squadRating,
      attackRating,
      midfieldRating,
      defenceRating,
      goalkeeperRating,
      youthAcademyRating: clamp(
        inStrengthBand(20, 80, strength, cRng.fork("youth")) + (tier === 1 ? 10 : 0),
        10,
        95,
      ),
      boardPatience: clamp(cRng.int(40, 85), 0, 100),
      fanbaseSize: fanbaseForTier(tier, strength, cRng.fork("fans")),
      fanMood: cRng.int(45, 75),
      boardConfidence: cRng.int(45, 75),
      rivalClubId: seed.rivalSeedId ?? null,
      playStyle: seed.playStyle,
      personality: seed.personality,
      facilities: {
        trainingGround: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        youthAcademy: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        medicalCentre: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        scoutingNetwork: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        clubShop: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        sponsorshipOffice: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        mediaRoom: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
        communityProgram: tier === 1 ? cRng.int(2, 4) : cRng.int(0, 2),
      },
      seasonObjectives: defaultSeasonObjectives(tier, strength, seed),
      weeklyObjectives: [],
      foundedYear: seed.foundingYear,
      history: seedClubHistory(seed, strength, cRng.fork("history")),
    };

    clubs[club.id] = club;
    divisionToClubIds[division.id].push(club.id);
    squad.forEach((p) => (players[p.id] = p));
  });

  // Now that every club exists we can hand out transfer interest — top
  // players get sniffed at by 1-3 richer clubs.
  seedTransferInterest(players, clubs, 1, rng.fork("transferInterest"));

  // World-wide youth pool: ~600 unsigned 15-21 year-olds the user can
  // hunt down on the scouting page. Pushes total player count from
  // ~2000 → ~2600 and gives the next-Henry/Maradona meta its substrate.
  const youth = generateYouthPool(
    rng.fork("youthPool"),
    { count: 600 },
    registry,
  );
  youth.forEach((p) => (players[p.id] = p));

  return { clubs, players, divisionToClubIds };
}

// =====================================================================
// Season objectives: driven by BOTH strength tier and club personality so
// no division has 20 clubs all asked to "Avoid relegation".
// Three objectives per club: league position, cup target, club-flavour goal.
// =====================================================================
function defaultSeasonObjectives(
  tier: 1 | 2 | 3 | 4,
  strength: StrengthTier,
  seed: ClubSeed,
): string[] {
  return [
    leagueObjective(tier, strength),
    cupObjective(tier, strength, seed),
    flavourObjective(strength, seed),
  ];
}

function leagueObjective(tier: 1 | 2 | 3 | 4, strength: StrengthTier): string {
  const divisionName =
    tier === 1 ? "Premier Division"
    : tier === 2 ? "Division One"
    : tier === 3 ? "Division Two"
    : "Division Three";

  if (strength === "top") {
    return tier === 1 ? `Win the ${divisionName}` : "Win promotion as champions";
  }
  if (strength === "upper") {
    if (tier === 1) return "Finish in the top 6";
    return "Reach the playoffs";
  }
  if (strength === "mid") {
    if (tier === 1) return "Finish mid-table (top half)";
    if (tier === 4) return "Push for the playoffs";
    return "Push for the playoffs";
  }
  if (strength === "lower") {
    if (tier === 1) return "Avoid relegation comfortably";
    return "Stay clear of the relegation zone";
  }
  // bottom
  return "Avoid relegation";
}

function cupObjective(tier: 1 | 2 | 3 | 4, strength: StrengthTier, seed: ClubSeed): string {
  // Cup Fighters always get an upgraded cup brief.
  if (seed.personality === "Cup Fighter") {
    if (strength === "top") return "Win the National Cup";
    if (strength === "upper") return "Reach the National Cup semi-final";
    if (strength === "mid") return "Reach the National Cup quarter-final";
    return "Cause an upset in the National Cup";
  }

  if (tier === 1) {
    if (strength === "top") return "Reach the Champions Cup quarter-final";
    if (strength === "upper") return "Reach the National Cup quarter-final";
    if (strength === "mid") return "Reach the National Cup last 16";
    return "Get past the third round of the National Cup";
  }

  if (tier === 2) {
    if (strength === "top") return "Reach the National Cup last 16";
    if (strength === "upper") return "Reach the League Cup quarter-final";
    if (strength === "mid") return "Win at least one cup tie away from home";
    return "Avoid an early cup exit";
  }

  if (tier === 3) {
    if (strength === "top") return "Reach the League Cup last 16";
    if (strength === "upper") return "Beat a higher-tier club in the cups";
    if (strength === "mid") return "Win an away cup tie";
    return "Avoid an early cup exit";
  }

  // Tier 4 — cups are about pride and prize money.
  if (strength === "top") return "Beat a Division Two club in the cups";
  if (strength === "upper") return "Cause a cup upset";
  if (strength === "mid") return "Win an away cup tie";
  return "Make at least one cup payday";
}

function flavourObjective(strength: StrengthTier, seed: ClubSeed): string {
  switch (seed.personality) {
    case "Big City Club":
    case "Money Club":
      return "Sign a marquee player";
    case "Sleeping Giant":
      return "Reawaken the club — five-game winning run";
    case "Fallen Giant":
      return "Restore the club's reputation";
    case "Historic Club":
      return "Honour the badge — beat the rival twice";
    case "Promotion Hunter":
      return strength === "bottom" ? "Stabilise the dressing room" : "Win the head-to-head against rivals";
    case "Cup Fighter":
      return "Win five home games in a row";
    case "Flashy New Club":
      return "Establish the club in this division";
    case "Industrial Club":
    case "Working-Class Club":
      return "Win five home games in a row";
    case "University Club":
      return "Promote two academy players to the first team";
    case "Port Club":
    case "Coastal Club":
      return "Win the harbour derby";
    case "Railway Club":
      return "Build an unbeaten home run";
    case "Youth Factory":
    case "Academy Club":
      return "Develop a wonderkid";
    case "Fan-Owned Club":
      return "Improve fan mood by season's end";
    case "Local Underdog":
      return seed.rivalSeedId ? "Beat the local rival" : "Cause an upset against a top-half club";
    case "Crisis Club":
      return "Stabilise the squad and dressing room";
    case "Mining Town Club":
      return "Keep the club afloat";
    default:
      return "Improve fan mood";
  }
}

// =====================================================================
// Initial club history — gives "Historic" / "Sleeping Giant" / etc clubs
// a believable trophy cabinet so the world doesn't feel born yesterday.
// All trophy seasons are NEGATIVE numbers (representing past seasons
// before the player joined; e.g. season -3 = "3 years ago").
// =====================================================================
function seedClubHistory(
  seed: ClubSeed,
  strength: StrengthTier,
  rng: Rng,
): ClubHistory {
  // Score the club's plausible historical glamour. Older + stronger +
  // historic-personality = more silverware in the cabinet.
  const ageBonus = Math.min(20, Math.max(0, (2026 - seed.foundingYear) / 8));
  const strengthBonus =
    strength === "top" ? 18
    : strength === "upper" ? 10
    : strength === "mid" ? 4
    : strength === "lower" ? 1
    : 0;
  const personalityBonus =
    seed.personality === "Sleeping Giant" ? 14
    : seed.personality === "Historic Club" ? 12
    : seed.personality === "Big City Club" ? 8
    : seed.personality === "Fallen Giant" ? 10
    : seed.personality === "Money Club" ? 5
    : 2;

  const totalGlamour = ageBonus + strengthBonus + personalityBonus;
  const trophies: Trophy[] = [];

  // League titles — distributed in the past 30 seasons.
  const leagueTitles = Math.floor(totalGlamour / 14);
  for (let i = 0; i < leagueTitles; i++) {
    trophies.push({
      competitionId: COMP_IDS.PREMIER,
      season: -rng.int(1, 30),
      position: 1,
    });
  }

  // National Cup wins.
  const cupWins = Math.floor(totalGlamour / 18);
  for (let i = 0; i < cupWins; i++) {
    trophies.push({
      competitionId: COMP_IDS.NATIONAL_CUP,
      season: -rng.int(1, 30),
      position: 1,
    });
  }

  // League Cup wins (slightly more common).
  const leagueCupWins = Math.floor(totalGlamour / 12);
  for (let i = 0; i < leagueCupWins; i++) {
    trophies.push({
      competitionId: COMP_IDS.LEAGUE_CUP,
      season: -rng.int(1, 30),
      position: 1,
    });
  }

  // Some runners-up finishes for flavour.
  if (totalGlamour > 8 && rng.bool(0.6)) {
    trophies.push({
      competitionId: COMP_IDS.PREMIER,
      season: -rng.int(1, 25),
      position: 2,
    });
  }
  if (totalGlamour > 6 && rng.bool(0.7)) {
    trophies.push({
      competitionId: COMP_IDS.NATIONAL_CUP,
      season: -rng.int(1, 20),
      position: 2,
    });
  }

  // Sort newest first for nicer display.
  trophies.sort((a, b) => b.season - a.season);

  return {
    trophies,
    seasons: [],
  };
}
