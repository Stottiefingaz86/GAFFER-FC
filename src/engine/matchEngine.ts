// =====================================================================
// MATCH ENGINE — probability-driven, story-aware.
// 70% logic, 30% chaos as per the brief.
// =====================================================================

import type {
  Club,
  DetailedPosition,
  Fixture,
  HiddenMatchStory,
  Lineup,
  MatchEvent,
  MatchEventType,
  MatchResult,
  Player,
  PlayerMatchRating,
  Tactic,
  TeamMatchStats,
  Weather,
} from "@/types/game";
import { clamp, type Rng } from "@/lib/rng";
import { FORMATIONS } from "@/data/formations";
import { divisionTierFor } from "@/data/nations";
import { generateHighlights } from "@/engine/highlightGenerator";

// =====================================================================
// SHAPE QUALITY — judges whether a lineup is *coherent* on top of being
// talented. A 90-rated XI dropped into 11 random pitch coordinates with
// no left back, three players stacked on the right wing, and centre-
// backs shoved up to AM should not breeze past a tactically sound 78
// side. We grade three things on top of raw OVR:
//
//   1. Position familiarity — a player at his native slot is at 100%.
//      Drop into a secondary position → 92%. Same broad group (e.g. CB
//      → LB) → 85%. Adjacent group (CB → DM) → 75%. Off-the-map
//      (FWD as CB, GK outfield) → 55%. Multiplies effective overall.
//   2. Pitch coverage — outfielders are bucketed into a 2×3 grid
//      (defensive/attacking thirds × left/centre/right lanes). Empty
//      lanes in either third bleed `defence` and `attack`. Lateral
//      imbalance (4 players left, 0 right) bleeds `defence` further.
//   3. Cluster penalty — every pair of outfielders within ~10% pitch
//      distance counts as a cluster. Each cluster nicks `attack` and
//      `defence` because it means a chunk of pitch is unmanned.
//
// AI clubs are unaffected: `autoLineup` always slots players to their
// natural detailedPosition and never sets `slotPositions` overrides,
// so familiarity hovers near 1.0 with no coverage gaps. Only a manager
// who deliberately drags their shape into chaos sees these penalties.
// =====================================================================

const POS_GROUP: Record<DetailedPosition, "GK" | "DEF" | "MID" | "FWD"> = {
  GK: "GK",
  CB: "DEF", LB: "DEF", RB: "DEF",
  DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID",
  LW: "FWD", RW: "FWD", ST: "FWD", CF: "FWD",
};

interface SlotAssignment {
  player: Player;
  slotPos: DetailedPosition;
  x: number; // 0..1 left→right
  y: number; // 0..1 own goal→opp goal
  familiarity: number; // 0.55..1.0
}

function familiarityFor(slotPos: DetailedPosition, player: Player): number {
  if (player.detailedPosition === slotPos) return 1.0;
  if (player.secondaryPositions.includes(slotPos)) return 0.92;
  const slotGroup = POS_GROUP[slotPos];
  const playerGroup = POS_GROUP[player.detailedPosition];
  if (slotGroup === playerGroup) return 0.85;
  // Adjacent: DEF↔MID, MID↔FWD
  const adjacent =
    (slotGroup === "DEF" && playerGroup === "MID") ||
    (slotGroup === "MID" && playerGroup === "DEF") ||
    (slotGroup === "MID" && playerGroup === "FWD") ||
    (slotGroup === "FWD" && playerGroup === "MID");
  if (adjacent) return 0.75;
  // Opposite ends of the pitch — including any GK/outfield mix.
  return 0.55;
}

function buildAssignments(
  lineup: Lineup,
  players: Record<string, Player>
): SlotAssignment[] {
  const formation = FORMATIONS[lineup.formationKey];
  if (!formation) return [];
  return formation.slots.flatMap<SlotAssignment>((slot) => {
    const playerId = lineup.starters[slot.id];
    if (!playerId) return [];
    const player = players[playerId];
    if (!player) return [];
    const override = lineup.slotPositions?.[slot.id];
    const slotPos = override?.position ?? slot.position;
    const x = override?.x ?? slot.x;
    const y = override?.y ?? slot.y;
    return [{
      player,
      slotPos,
      x,
      y,
      familiarity: familiarityFor(slotPos, player),
    }];
  });
}

function coverageDelta(assignments: SlotAssignment[]): {
  attack: number;
  defence: number;
} {
  const outfield = assignments.filter((a) => a.slotPos !== "GK");
  if (outfield.length === 0) return { attack: 0, defence: 0 };
  const def = { l: 0, c: 0, r: 0 };
  const atk = { l: 0, c: 0, r: 0 };
  outfield.forEach((a) => {
    const lane: "l" | "c" | "r" =
      a.x < 0.33 ? "l" : a.x > 0.66 ? "r" : "c";
    if (a.y < 0.4) def[lane] += 1;
    else if (a.y > 0.6) atk[lane] += 1;
  });
  let dDelta = 0;
  let aDelta = 0;
  // Empty defensive lanes are catastrophic — that's an unguarded flank.
  if (def.l === 0) dDelta -= 6;
  if (def.r === 0) dDelta -= 6;
  if (def.c === 0) dDelta -= 8;
  // Empty attacking lanes hurt threat but are recoverable.
  if (atk.l === 0) aDelta -= 3;
  if (atk.r === 0) aDelta -= 3;
  if (atk.c === 0) aDelta -= 4;
  // Lateral imbalance in defence: 4 left, 0 right is worse than 2/2.
  const dImbalance = Math.abs(def.l - def.r);
  if (dImbalance >= 2) dDelta -= 2 * (dImbalance - 1);
  return { attack: aDelta, defence: dDelta };
}

function clusterDelta(assignments: SlotAssignment[]): {
  attack: number;
  defence: number;
} {
  const outfield = assignments.filter((a) => a.slotPos !== "GK");
  let pairs = 0;
  for (let i = 0; i < outfield.length; i++) {
    for (let j = i + 1; j < outfield.length; j++) {
      const dx = outfield[i].x - outfield[j].x;
      const dy = outfield[i].y - outfield[j].y;
      if (Math.hypot(dx, dy) < 0.10) pairs += 1;
    }
  }
  return { attack: -1.5 * pairs, defence: -1.0 * pairs };
}

const TACTIC_MOD: Record<Tactic, { atk: number; def: number; chaos: number; press: number }> = {
  Balanced:        { atk:  0, def:  0, chaos:  0,    press:  0 },
  Attacking:       { atk:  6, def: -4, chaos:  0.05, press:  1 },
  Defensive:       { atk: -5, def:  6, chaos: -0.04, press: -2 },
  Counter:         { atk:  2, def:  3, chaos:  0.04, press: -1 },
  "High Press":    { atk:  3, def:  1, chaos:  0.06, press:  4 },
  Possession:      { atk:  3, def:  2, chaos: -0.02, press:  0 },
  Direct:          { atk:  4, def: -1, chaos:  0.05, press:  0 },
  "Long Ball":     { atk:  3, def: -1, chaos:  0.07, press:  0 },
  // Style-led variants:
  // - Tiki-Taka: extreme possession, low chaos (boring 1-0s, hard to break down)
  // - Gegenpress: fiercest press, high chaos (more goals both ways)
  // - Wing Play: wide attack, modestly aggressive
  // - Park the Bus: extreme defensive shell, no attacking ambition
  "Tiki-Taka":     { atk:  4, def:  3, chaos: -0.05, press:  1 },
  Gegenpress:      { atk:  5, def:  1, chaos:  0.08, press:  5 },
  "Wing Play":     { atk:  4, def: -1, chaos:  0.04, press:  0 },
  "Park the Bus":  { atk: -8, def:  9, chaos: -0.06, press: -3 },
};

const WEATHERS: Weather[] = ["Clear", "Cloudy", "Rain", "Heavy Rain", "Snow", "Windy", "Hot"];
const WEATHER_WEIGHTS = [40, 30, 12, 4, 2, 8, 4];

interface TeamStrength {
  attack: number;
  midfield: number;
  defence: number;
  goalkeeper: number;
  composure: number;
  fitness: number;
  quality: number;     // average overall of the XI
  starPower: number;   // how much the very best players lift the team
  starters: Player[];  // for trait-based event bonuses later
  starterCount: number;
}

function lineupStrength(
  club: Club,
  lineup: Lineup | null,
  players: Record<string, Player>,
  isCupGame: boolean
): TeamStrength {
  if (!lineup || Object.keys(lineup.starters).length === 0) {
    // Fallback for clubs without a stored lineup: estimate from the
    // best 11 of their squad, all assumed to be in their native slot.
    // Shape penalties (coverage / cluster) are skipped because we have
    // no real positions to grade — the AI club just hasn't run autoLineup
    // yet and we don't want to punish them for that.
    const squad = Object.values(players).filter((p) => p.clubId === club.id);
    const bestXI = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
    const fakeAssignments: SlotAssignment[] = bestXI.map((p) => ({
      player: p,
      slotPos: p.detailedPosition,
      x: 0.5,
      y: 0.5,
      familiarity: 1,
    }));
    return computeStrength(fakeAssignments, "Balanced", isCupGame, false);
  }

  return computeStrength(
    buildAssignments(lineup, players),
    lineup.tactic,
    isCupGame,
    true
  );
}

function computeStrength(
  assignments: SlotAssignment[],
  tactic: Tactic,
  isCupGame: boolean,
  applyShapePenalties: boolean
): TeamStrength {
  // Effective rating per starter — scaled by fitness, form, AND
  // positional familiarity. A 85-rated CB stuck at AM contributes
  // 85 × ~0.75 = ~64-rated effective output to the midfield bucket.
  const eff = (a: SlotAssignment) => {
    const p = a.player;
    const fitnessFactor = 0.80 + (p.fitness / 100) * 0.30;   // 0.8 .. 1.10
    const formFactor    = 0.85 + (p.form    / 100) * 0.30;   // 0.85 .. 1.15
    return p.overall * fitnessFactor * formFactor * a.familiarity;
  };

  // Bucket by SLOT position group (where the player is *playing*),
  // not by their natural bucket. A CB shoved to AM contributes to
  // midfield (poorly) and isn't double-counted in defence.
  const filterAvg = (group: "GK" | "DEF" | "MID" | "FWD") => {
    const arr = assignments.filter((a) => POS_GROUP[a.slotPos] === group);
    if (arr.length === 0) return 30;   // empty bucket = a glaring hole
    return arr.reduce((acc, a) => acc + eff(a), 0) / arr.length;
  };

  const attack = filterAvg("FWD");
  const midfield = filterAvg("MID");
  const defence = filterAvg("DEF");
  const goalkeeper = filterAvg("GK");

  const starters = assignments.map((a) => a.player);
  const composure = starters.length
    ? starters.reduce((a, p) => a + p.mentality, 0) / starters.length
    : 60;
  const fitness = starters.length
    ? starters.reduce((a, p) => a + p.fitness, 0) / starters.length
    : 80;
  const quality = starters.length
    ? starters.reduce((a, p) => a + p.overall, 0) / starters.length
    : 50;

  // Star power: top-3 stars lift the team. Differentiates a side with
  // a 88-rated talisman from a flat-rated team of the same average.
  const top3 = [...starters].sort((a, b) => b.overall - a.overall).slice(0, 3);
  const starPower = top3.length
    ? top3.reduce((a, p) => a + Math.max(0, p.overall - 70), 0)
    : 0;

  const mod = TACTIC_MOD[tactic];
  const cov = applyShapePenalties
    ? coverageDelta(assignments)
    : { attack: 0, defence: 0 };
  const clu = applyShapePenalties
    ? clusterDelta(assignments)
    : { attack: 0, defence: 0 };

  return {
    attack: attack + mod.atk + cov.attack + clu.attack,
    midfield: midfield + (mod.atk + mod.def) / 4,
    defence: defence + mod.def + cov.defence + clu.defence,
    goalkeeper,
    composure: composure + (isCupGame ? -3 : 0),
    fitness,
    quality,
    starPower,
    starters,
    starterCount: starters.length,
  };
}

function chooseStory(rng: Rng, isCupGame: boolean, gap: number): HiddenMatchStory {
  // Higher chaos in cup games & big mismatches
  const baseStories: HiddenMatchStory[] = [
    "Normal Match","Normal Match","Normal Match","Normal Match","Normal Match",
    "Defensive Battle","Striker On Fire","Tactical Masterclass","Keeper Masterclass",
    "Bad Weather","Derby Chaos","Underdog Inspired","Favourite Complacent",
  ];
  if (isCupGame) {
    baseStories.push("Cup Shock","Early Red Card","Underdog Inspired","Derby Chaos");
  }
  if (Math.abs(gap) > 12) {
    baseStories.push("Underdog Inspired","Favourite Complacent");
  }
  return rng.pick(baseStories);
}

interface MatchSetup {
  fixture: Fixture;
  home: Club;
  away: Club;
  homeLineup: Lineup | null;
  awayLineup: Lineup | null;
  homeRivalry: boolean;
  awayRivalry: boolean;
  isCupGame: boolean;
}

export function simulateMatch(
  setup: MatchSetup,
  players: Record<string, Player>,
  rng: Rng
): MatchResult {
  const { fixture, home, away, homeLineup, awayLineup, isCupGame } = setup;

  const homeStr = lineupStrength(home, homeLineup, players, isCupGame);
  const awayStr = lineupStrength(away, awayLineup, players, isCupGame);

  // Home advantage
  homeStr.attack += 2.5;
  homeStr.defence += 1.5;
  homeStr.composure += 1;

  const weather = rng.pickWeighted<Weather>(WEATHERS, WEATHER_WEIGHTS);
  if (weather === "Heavy Rain" || weather === "Snow") {
    homeStr.attack -= 4; awayStr.attack -= 4;
    homeStr.composure -= 2; awayStr.composure -= 2;
  } else if (weather === "Windy") {
    homeStr.attack -= 2; awayStr.attack -= 2;
  } else if (weather === "Hot") {
    homeStr.fitness -= 5; awayStr.fitness -= 5;
  }

  const gap = homeStr.quality - awayStr.quality;
  const story = chooseStory(rng, isCupGame, gap);

  const events: MatchEvent[] = [];
  events.push({ minute: 0, type: "Kickoff", team: "home", text: "Kick-off!" });

  // Apply story modifiers
  let homeMod = 1;
  let awayMod = 1;
  let homeChaos = 0;
  let awayChaos = 0;
  let homeKeeperBoost = 0;
  let awayKeeperBoost = 0;
  let earlyRedTeam: "home" | "away" | null = null;
  let strikerOnFireTeam: "home" | "away" | null = null;

  switch (story) {
    case "Favourite Complacent":
      if (gap > 0) homeMod = 0.85;
      else awayMod = 0.85;
      break;
    case "Underdog Inspired":
      if (gap > 0) awayMod = 1.25;
      else homeMod = 1.25;
      break;
    case "Keeper Masterclass":
      if (rng.bool()) homeKeeperBoost = 12; else awayKeeperBoost = 12;
      break;
    case "Early Red Card":
      earlyRedTeam = rng.bool() ? "home" : "away";
      if (earlyRedTeam === "home") homeMod = 0.7;
      else awayMod = 0.7;
      break;
    case "Bad Weather":
      homeMod *= 0.92; awayMod *= 0.92;
      break;
    case "Cup Shock":
      if (gap > 0) { homeMod = 0.8; awayMod = 1.2; } else { awayMod = 0.8; homeMod = 1.2; }
      homeChaos += 0.1; awayChaos += 0.1;
      break;
    case "Striker On Fire":
      strikerOnFireTeam = rng.bool() ? "home" : "away";
      break;
    case "Defensive Battle":
      homeMod *= 0.7; awayMod *= 0.7;
      break;
    case "Derby Chaos":
      homeChaos += 0.15; awayChaos += 0.15;
      break;
    default: break;
  }

  // Produce per-team xG. Logic ~70% / chaos ~30%.
  // Star power lifts attack via individual brilliance; opposing defence's
  // star power (defenders/keepers) suppresses it.
  const baseXG = (
    atk: number, mid: number, def: number, gk: number,
    ownStars: number, oppDefStars: number,
  ) => {
    const off = atk * 0.62 + mid * 0.38;
    const defs = def * 0.62 + gk * 0.38;
    const starDelta = ownStars * 0.06 - oppDefStars * 0.04;
    const raw = (off - defs) / 16 + 1.25 + starDelta;
    return clamp(raw, 0.15, 4.0);
  };

  // Defensive star contribution from opponent's CBs/keeper.
  const defenderStars = (s: TeamStrength) =>
    s.starters.filter((p) => p.position === "DEF" || p.position === "GK")
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 2)
      .reduce((a, p) => a + Math.max(0, p.overall - 70), 0);

  let homeXG = baseXG(
    homeStr.attack, homeStr.midfield, awayStr.defence, awayStr.goalkeeper,
    homeStr.starPower, defenderStars(awayStr),
  ) * homeMod;
  let awayXG = baseXG(
    awayStr.attack, awayStr.midfield, homeStr.defence, homeStr.goalkeeper,
    awayStr.starPower, defenderStars(homeStr),
  ) * awayMod;

  // Chaos band: 0.7..1.3 for normal matches, wider during chaotic stories.
  homeXG = homeXG * (0.7 + rng.next() * (0.6 + homeChaos));
  awayXG = awayXG * (0.7 + rng.next() * (0.6 + awayChaos));

  homeXG = clamp(homeXG, 0.05, 5);
  awayXG = clamp(awayXG, 0.05, 5);

  // Determine goals from xG (Poisson-ish)
  const samplePoisson = (lambda: number) => {
    const L = Math.exp(-lambda);
    let k = 0; let p = 1;
    while (true) {
      k += 1;
      p *= rng.next();
      if (p <= L) return k - 1;
      if (k > 12) return k - 1;
    }
  };
  let homeGoals = samplePoisson(homeXG);
  let awayGoals = samplePoisson(awayXG);

  // keeper masterclass cuts a goal
  if (homeKeeperBoost > 0 && awayGoals > 0 && rng.bool(0.7)) awayGoals -= 1;
  if (awayKeeperBoost > 0 && homeGoals > 0 && rng.bool(0.7)) homeGoals -= 1;

  // Build event timeline.
  const homeStarters = Object.values(setup.homeLineup?.starters ?? {})
    .map((id) => players[id]).filter(Boolean) as Player[];
  const awayStarters = Object.values(setup.awayLineup?.starters ?? {})
    .map((id) => players[id]).filter(Boolean) as Player[];

  const stats: { home: TeamMatchStats; away: TeamMatchStats } = {
    home: { xG: +homeXG.toFixed(2), shots: 0, shotsOnTarget: 0, possession: 50, corners: 0, fouls: 0, yellow: 0, red: 0 },
    away: { xG: +awayXG.toFixed(2), shots: 0, shotsOnTarget: 0, possession: 50, corners: 0, fouls: 0, yellow: 0, red: 0 },
  };

  const possessionEdge = clamp((homeStr.midfield - awayStr.midfield) * 1.4 + 50, 30, 70);
  stats.home.possession = Math.round(possessionEdge);
  stats.away.possession = 100 - Math.round(possessionEdge);

  const ratings: { home: PlayerMatchRating[]; away: PlayerMatchRating[] } = {
    home: homeStarters.map((p) => ({
      playerId: p.id, rating: 6.5, goals: 0, assists: 0, yellow: false, red: false, injured: false,
    })),
    away: awayStarters.map((p) => ({
      playerId: p.id, rating: 6.5, goals: 0, assists: 0, yellow: false, red: false, injured: false,
    })),
  };

  if (earlyRedTeam) {
    const team = earlyRedTeam;
    const candidates = team === "home" ? homeStarters : awayStarters;
    const target = candidates.find((p) => p.position === "DEF") ?? candidates[0];
    if (target) {
      events.push({
        minute: rng.int(8, 30),
        type: "Red", team,
        playerId: target.id, playerName: target.displayName,
        text: `${target.displayName} sees red — ${team === "home" ? home.shortName : away.shortName} down to ten men!`,
      });
      const r = (team === "home" ? ratings.home : ratings.away).find(rat => rat.playerId === target.id);
      if (r) { r.red = true; r.rating = 4.0; }
      if (team === "home") stats.home.red += 1; else stats.away.red += 1;
    }
  }

  // Goal-scoring weights are heavily skewed toward best attackers, with
  // trait nudges so wonderkids, composed finishers, and target men feel
  // distinct from squad fillers.
  const scorerWeight = (p: Player): number => {
    let w = Math.max(0.4, (p.overall - 50) ** 1.8);
    if (p.position === "FWD") w *= 4.0;
    else if (p.position === "MID") w *= 1.0;
    else if (p.position === "DEF") w *= 0.18;
    else w *= 0.01;
    w *= 0.5 + (p.shooting / 100) * 1.4;
    w *= 0.7 + (p.form / 100) * 0.6;
    if (p.trait === "Composed Finisher") w *= 1.35;
    if (p.trait === "Wonderkid") w *= 1.15;
    if (p.trait === "Speedster" && p.position === "FWD") w *= 1.10;
    if (p.trait === "Target Man" && p.position === "FWD") w *= 1.15;
    if (p.trait === "Big Game Player") w *= 1.10;
    return w;
  };

  const assisterWeight = (p: Player, scorerId: string): number => {
    if (p.id === scorerId) return 0;
    let w = Math.max(0.3, (p.overall - 50) ** 1.5);
    if (p.position === "MID") w *= 2.4;
    else if (p.position === "FWD") w *= 1.6;
    else if (p.position === "DEF") w *= 0.4;
    else w *= 0.05;
    w *= 0.5 + (p.passing / 100) * 1.3;
    if (p.trait === "Playmaker") w *= 1.5;
    if (p.trait === "Set Piece Expert") w *= 1.15;
    return w;
  };

  // Generate goal events
  const goalsFor = (team: "home" | "away", goals: number, lineup: Player[]) => {
    const onFire = strikerOnFireTeam === team;
    if (lineup.length === 0) return;

    // Try to use designated penalty / set-piece takers if they exist.
    const oppLineup = team === "home" ? awayStarters : homeStarters;
    const lu = team === "home" ? setup.homeLineup : setup.awayLineup;
    const penaltyTaker = lu?.penaltyTakerId
      ? lineup.find((p) => p.id === lu.penaltyTakerId)
      : undefined;

    for (let i = 0; i < goals; i++) {
      const minute = rng.int(2, 92);
      const isWonder = rng.bool(0.045);
      const isPen = rng.bool(0.07);
      const isDeflection = rng.bool(0.04);
      const isOG = rng.bool(0.018);

      let scorer: Player | undefined;
      if (isOG) {
        scorer = oppLineup.filter((p) => p.position === "DEF")[0] ?? oppLineup[0];
      } else if (isPen && penaltyTaker) {
        scorer = penaltyTaker;
      } else if (onFire) {
        // Striker on fire: weight forwards extra heavy
        const fwds = lineup.filter((p) => p.position === "FWD");
        if (fwds.length) {
          const weights = fwds.map((p) => scorerWeight(p) * 2.5);
          scorer = rng.pickWeighted(fwds, weights);
        }
      }
      if (!scorer) {
        const candidates = lineup.filter((p) => p.position !== "GK");
        const weights = candidates.map(scorerWeight);
        scorer = rng.pickWeighted(candidates, weights);
      }
      if (!scorer) continue;

      // Assist with probability that scales with possession-style sides.
      const assistProb = isOG ? 0 : isPen ? 0 : isWonder ? 0.3 : 0.65;
      let assister: Player | undefined;
      if (rng.bool(assistProb)) {
        const candidates = lineup.filter((p) => p.id !== scorer!.id && p.position !== "GK");
        if (candidates.length) {
          const weights = candidates.map((p) => assisterWeight(p, scorer!.id));
          assister = rng.pickWeighted(candidates, weights);
        }
      }

      const text =
        isOG ? `Own goal! ${scorer.displayName} turns it into his own net.`
        : isPen ? `Penalty converted by ${scorer.displayName}!`
        : isWonder ? `Wonder goal from ${scorer.displayName}! Stunning strike.`
        : isDeflection ? `Deflection! ${scorer.displayName} gets the lucky bounce.`
        : assister ? `GOAL! ${scorer.displayName} finishes after a clever pass from ${assister.displayName}.`
        : `GOAL! ${scorer.displayName} finds the net.`;

      const evType: MatchEventType = isOG ? "OwnGoal" :
        isPen ? "PenaltyScored" :
        isWonder ? "WonderGoal" :
        isDeflection ? "Deflection" : "Goal";

      events.push({
        minute, type: evType, team,
        playerId: scorer.id, playerName: scorer.displayName, text,
        assisterId: assister?.id,
        assisterName: assister?.displayName,
      });

      const rTeam = team === "home" ? ratings.home : ratings.away;
      const opTeam = team === "home" ? ratings.away : ratings.home;
      const rec = (isOG ? opTeam : rTeam).find((r) => r.playerId === scorer!.id);
      if (rec) { if (!isOG) rec.goals += 1; rec.rating += isOG ? -0.7 : 1.05; }
      if (assister) {
        const ar = rTeam.find((r) => r.playerId === assister.id);
        if (ar) { ar.assists += 1; ar.rating += 0.45; }
      }
    }
  };

  goalsFor("home", homeGoals, homeStarters);
  goalsFor("away", awayGoals, awayStarters);

  // Misc events (shots, saves, cards)
  const sprinkle = (team: "home" | "away", lineup: Player[], xg: number) => {
    const shotCount = Math.round(xg * rng.int(4, 6) + rng.int(2, 5));
    const teamStats = team === "home" ? stats.home : stats.away;
    teamStats.shots = shotCount;
    teamStats.shotsOnTarget = Math.round(shotCount * 0.45);
    teamStats.corners = rng.int(2, 9);
    teamStats.fouls = rng.int(6, 16);

    // Yellow cards
    const yc = rng.int(0, 3);
    for (let i = 0; i < yc; i++) {
      const target = rng.pick(lineup);
      events.push({
        minute: rng.int(15, 88), type: "Yellow", team,
        playerId: target.id, playerName: target.displayName,
        text: `Yellow card for ${target.displayName}.`,
      });
      const r = (team === "home" ? ratings.home : ratings.away).find((r) => r.playerId === target.id);
      if (r) { r.yellow = true; r.rating -= 0.2; }
      teamStats.yellow += 1;
    }

    // Saves
    const saveCount = rng.int(1, 3);
    for (let i = 0; i < saveCount; i++) {
      const op = team === "home" ? awayStarters : homeStarters;
      const gk = op.find((p) => p.position === "GK");
      if (gk) {
        events.push({
          minute: rng.int(10, 89),
          type: "KeeperSave",
          team: team === "home" ? "away" : "home",
          playerId: gk.id, playerName: gk.displayName,
          text: `Big save by ${gk.displayName}!`,
        });
        const r = (team === "home" ? ratings.away : ratings.home).find((r) => r.playerId === gk.id);
        if (r) r.rating += 0.3;
      }
    }
  };

  sprinkle("home", homeStarters, homeXG);
  sprinkle("away", awayStarters, awayXG);

  // Ensure half-time/full-time markers.
  events.push({ minute: 45, type: "HalfTime", team: "home", text: "Half-time." });
  events.push({ minute: 90, type: "FullTime", team: "home", text: "Full-time." });
  events.sort((a, b) => a.minute - b.minute || (a.type === "Kickoff" ? -1 : 0));

  // Adjust ratings based on result
  const winnerSide: "home" | "away" | "draw" =
    homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";

  ratings.home.forEach((r) => {
    r.rating += winnerSide === "home" ? 0.4 : winnerSide === "away" ? -0.3 : 0;
    r.rating = clamp(+r.rating.toFixed(1), 3.0, 10.0);
  });
  ratings.away.forEach((r) => {
    r.rating += winnerSide === "away" ? 0.4 : winnerSide === "home" ? -0.3 : 0;
    r.rating = clamp(+r.rating.toFixed(1), 3.0, 10.0);
  });

  const allRatings = [...ratings.home, ...ratings.away];
  const motm = allRatings.reduce<PlayerMatchRating | null>((best, r) =>
    !best || r.rating > best.rating ? r : best, null
  );

  // Money / mood / confidence deltas
  const attendance = Math.round(home.stadium.capacity * (0.55 + rng.next() * 0.4));
  // Ticket pricing scales with the division's tier — works the same
  // way for every nation in the world.
  const homeTier = divisionTierFor(home.divisionId)?.tier ?? 1;
  const ticketPerSeat = homeTier === 1 ? 35 : homeTier === 2 ? 22 : homeTier === 3 ? 15 : 10;
  const ticketRevenue = attendance * ticketPerSeat;

  const homeMood = winnerSide === "home" ? 4 : winnerSide === "draw" ? 0 : -3;
  const awayMood = winnerSide === "away" ? 3 : winnerSide === "draw" ? 0 : -2;
  const homeBoard = winnerSide === "home" ? 3 : winnerSide === "draw" ? 0 : -2;
  const awayBoard = winnerSide === "away" ? 2 : winnerSide === "draw" ? 0 : -2;

  const baseResult: MatchResult = {
    fixtureId: fixture.id,
    competitionId: fixture.competitionId,
    homeId: home.id,
    awayId: away.id,
    homeGoals,
    awayGoals,
    events,
    stats,
    ratings,
    manOfMatchPlayerId: motm?.playerId ?? null,
    attendance,
    weather,
    story,
    homeMoneyEarned: Math.round(ticketRevenue),
    awayMoneyEarned: Math.round(ticketRevenue * 0.15),
    fanMoodChangeHome: homeMood,
    fanMoodChangeAway: awayMood,
    boardConfidenceChangeHome: homeBoard,
    boardConfidenceChangeAway: awayBoard,
  };

  // ── Build the structured highlight feed for the new Pixi viewer.
  //    Uses a FORKED rng so the highlight layout is deterministic but
  //    completely decoupled from the engine's RNG cursor (we don't
  //    want chance generation to drift just because the highlight
  //    builder rolled a few extra numbers). The legacy engine's
  //    result is the source of truth — the generator only adds the
  //    structured "what happened in zone X with player Y" data the
  //    viewer needs to animate. QuickSim and Watch Highlights see
  //    identical content.
  const highlightRng = rng.fork(`highlights:${fixture.id}`);
  baseResult.highlights = generateHighlights({
    result: baseResult,
    homeClub: home,
    awayClub: away,
    homeLineup,
    awayLineup,
    players,
    isCupGame,
    isDerby: setup.homeRivalry || setup.awayRivalry,
    rng: highlightRng,
  });
  return baseResult;
}
