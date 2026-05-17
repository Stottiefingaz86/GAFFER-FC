// =====================================================================
// HIGHLIGHT GENERATOR
//
// Converts the legacy `MatchResult.events` (text-only MatchEvent[])
// into structured `HighlightEvent[]` the new Pixi viewer can animate:
//
//   • Picks plausible players for each role the legacy event doesn't
//     name (defender, goalkeeper, shooter for non-goal events).
//   • Decides what KIND of play each highlight represents (cross /
//     counter-attack / through-ball / long shot / build-up / corner /
//     free-kick / mistake) based on the shooter's traits, attributes,
//     and a healthy dose of seeded randomness so two replays of the
//     same match feel different visually.
//   • Lays out start / shot / end zones from the attacking team's
//     POV (the viewer mirrors x for away).
//   • Generates a 3-5 step animation path for each highlight.
//   • Pads the feed with non-decisive shots so every match shows 8-16
//     highlights regardless of score (a 0-0 is still watchable).
//
// Pure given the same RNG seed — Quick Sim and Watch Highlights
// always produce the same MatchResult AND the same highlight feed.
// =====================================================================

import type {
  Club,
  Lineup,
  MatchEvent,
  MatchEventType,
  MatchResult,
  Player,
} from "@/types/game";
import type {
  AnimationStep,
  HighlightEvent,
  HighlightEventType,
  HighlightOutcome,
  MatchStory,
  PitchLane,
  PitchZone,
} from "@/types/match";
import { clamp, type Rng } from "@/lib/rng";
import { laneOf, zoneOf } from "@/utils/pitchZones";
import { buildCommentary, type CommentaryContext } from "@/engine/commentary";

// =====================================================================
// PUBLIC API
// =====================================================================

export interface HighlightGeneratorInput {
  result: MatchResult;
  homeClub: Club;
  awayClub: Club;
  homeLineup: Lineup | null;
  awayLineup: Lineup | null;
  /** Full player registry — used to look up starters + pick plausible
   * defenders / keepers / supporting players. */
  players: Record<string, Player>;
  /** Cup tie (drives the "cup shock" copy + extra late drama). */
  isCupGame: boolean;
  /** Local derby (drives "derby chaos" + extra cards/late drama). */
  isDerby: boolean;
  /** Forked RNG so the generator is deterministic per match. */
  rng: Rng;
}

/** Build the structured highlight feed. */
export function generateHighlights(input: HighlightGeneratorInput): HighlightEvent[] {
  const ctx = buildGeneratorContext(input);

  // ── 1. Walk legacy events; build a highlight per qualifying entry. ──
  const highlights: HighlightEvent[] = [];
  for (const ev of input.result.events) {
    const built = buildHighlightFor(ev, ctx);
    if (built) highlights.push(built);
  }

  // ── 2. Pad with non-decisive shots so the feed is always 8-16. ──
  padFeed(highlights, ctx);

  // ── 3. Sort by minute (kickoff first, full-time last). ──
  highlights.sort((a, b) => orderForType(a.type) - orderForType(b.type) || a.minute - b.minute);

  return highlights;
}

// =====================================================================
// INTERNAL CONTEXT — built once per call.
// =====================================================================

interface TeamCtx {
  club: Club;
  starters: Player[];
  forwards: Player[];
  midfielders: Player[];
  defenders: Player[];
  goalkeeper: Player | null;
  attackers: Player[]; // FWD + AM-ish MID
}

interface GeneratorContext {
  rng: Rng;
  home: TeamCtx;
  away: TeamCtx;
  result: MatchResult;
  commentary: CommentaryContext;
  isCupGame: boolean;
  isDerby: boolean;
  matchStory: MatchStory;
}

function buildGeneratorContext(input: HighlightGeneratorInput): GeneratorContext {
  const home = buildTeamCtx(input.homeClub, input.homeLineup, input.players);
  const away = buildTeamCtx(input.awayClub, input.awayLineup, input.players);
  const commentary: CommentaryContext = {
    isCupGame: input.isCupGame,
    isDerby: input.isDerby,
    isLate: false, // updated per-event
    story: legacyStoryToMatchStory(input.result.story),
    homeShortName: input.homeClub.shortName,
    awayShortName: input.awayClub.shortName,
  };
  return {
    rng: input.rng,
    home,
    away,
    result: input.result,
    commentary,
    isCupGame: input.isCupGame,
    isDerby: input.isDerby,
    matchStory: commentary.story,
  };
}

function buildTeamCtx(
  club: Club,
  lineup: Lineup | null,
  players: Record<string, Player>,
): TeamCtx {
  const starters = lineup
    ? Object.values(lineup.starters)
        .map((id) => players[id])
        .filter(Boolean) as Player[]
    : [];
  const goalkeeper = starters.find((p) => p.position === "GK") ?? null;
  const defenders = starters.filter((p) => p.position === "DEF");
  const midfielders = starters.filter((p) => p.position === "MID");
  const forwards = starters.filter((p) => p.position === "FWD");
  // "Attackers" = FWD + AM-style MID. Heuristic: any MID whose
  // detailed position is AM / LW / RW / LM / RM, fallback to all MID.
  const attackers = [
    ...forwards,
    ...midfielders.filter((p) =>
      ["AM", "LW", "RW", "LM", "RM"].includes(p.detailedPosition),
    ),
  ];
  return { club, starters, forwards, midfielders, defenders, goalkeeper, attackers };
}

/** Map the legacy `HiddenMatchStory` (Title-Case strings) onto the new
 * lowercase `MatchStory` union the commentary engine reads. Unknown
 * values fall back to "normal" so the rest of the feed still works. */
function legacyStoryToMatchStory(s: string): MatchStory {
  const map: Record<string, MatchStory> = {
    "Normal Match": "normal",
    "Favourite Complacent": "favourite_complacent",
    "Underdog Inspired": "underdog_inspired",
    "Keeper Masterclass": "keeper_masterclass",
    "Early Red Card": "early_red_card",
    "Bad Weather": "bad_weather",
    "Cup Shock": "cup_shock",
    "Striker On Fire": "striker_on_fire",
    "Defensive Battle": "defensive_battle",
    "Derby Chaos": "derby_chaos",
    "Injury Crisis": "injury_crisis",
    "Tactical Masterclass": "tactical_masterclass",
    "Nervy Title Race": "late_drama",
    "Relegation Scrap": "late_drama",
    "Promotion Pressure": "late_drama",
    "European Night": "normal",
  };
  return map[s] ?? "normal";
}

/** Sort helper so kickoff is always first and full-time always last. */
function orderForType(type: HighlightEventType): number {
  if (type === "kickoff") return 0;
  if (type === "half_time") return 45;
  if (type === "full_time") return 1000;
  return 100;
}

// =====================================================================
// DISPATCH — one builder per legacy MatchEventType.
// =====================================================================

function buildHighlightFor(
  ev: MatchEvent,
  ctx: GeneratorContext,
): HighlightEvent | null {
  ctx.commentary.isLate = ev.minute >= 85;
  switch (ev.type) {
    case "Kickoff":
      return buildKickoff(ev, ctx);
    case "HalfTime":
      return buildPeriodMarker(ev, ctx, "half_time");
    case "FullTime":
      return buildPeriodMarker(ev, ctx, "full_time");
    case "Goal":
    case "Deflection":
      return buildGoalHighlight(ev, ctx, "open_play");
    case "WonderGoal":
      return buildGoalHighlight(ev, ctx, "wonder");
    case "OwnGoal":
      return buildOwnGoalHighlight(ev, ctx);
    case "PenaltyScored":
      return buildPenaltyHighlight(ev, ctx, "goal");
    case "PenaltyMissed":
      return buildPenaltyHighlight(ev, ctx, "miss");
    case "Penalty":
      // Awarded but unresolved — treat as scored for the viewer.
      return buildPenaltyHighlight(ev, ctx, "goal");
    case "KeeperSave":
      return buildSaveHighlight(ev, ctx);
    case "Yellow":
      return buildCardHighlight(ev, ctx, "yellow_card");
    case "Red":
      return buildCardHighlight(ev, ctx, "red_card");
    case "Injury":
      return buildInjuryHighlight(ev, ctx);
    case "LateDrama":
      return buildLateDramaHighlight(ev, ctx);
    case "Chance":
    case "BigChance":
      return buildOpenPlayShot(ev, ctx, "miss");
    case "ShotWide":
      return buildOpenPlayShot(ev, ctx, "miss");
    case "ShotSaved":
      return buildSaveHighlight(ev, ctx);
    case "KeeperMistake":
    case "DefensiveError":
      return buildDefensiveMistake(ev, ctx);
    case "DisallowedGoal":
      return buildOpenPlayShot(ev, ctx, "miss", "Disallowed!");
    case "Substitution":
      // Substitutions don't feel like highlights — skip in the visual
      // feed (the engine already handles re-attribution).
      return null;
  }
}

// =====================================================================
// BUILDERS — one per kind of highlight.
// =====================================================================

function buildKickoff(ev: MatchEvent, ctx: GeneratorContext): HighlightEvent {
  const attackingTeamId = ctx.home.club.id;
  const defendingTeamId = ctx.away.club.id;
  return {
    id: `hl_kickoff_${ev.minute}`,
    minute: 0,
    type: "kickoff",
    attackingTeamId,
    defendingTeamId,
    outcome: "kickoff",
    startZone: "MID_C",
    endZone: "MID_C",
    xg: 0,
    description: buildCommentary(
      {
        minute: 0,
        type: "kickoff",
        outcome: "kickoff",
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: [
      { action: "kickoff_idle", from: "MID_C", to: "MID_C", durationMs: 1200 },
    ],
  };
}

function buildPeriodMarker(
  ev: MatchEvent,
  ctx: GeneratorContext,
  kind: "half_time" | "full_time",
): HighlightEvent {
  return {
    id: `hl_${kind}_${ev.minute}`,
    minute: ev.minute,
    type: kind,
    attackingTeamId: ctx.home.club.id,
    defendingTeamId: ctx.away.club.id,
    outcome: kind,
    startZone: "MID_C",
    endZone: "MID_C",
    xg: 0,
    description: kind === "half_time" ? "Half-time." : "Full-time.",
    animationPath: [
      { action: "kickoff_idle", from: "MID_C", to: "MID_C", durationMs: 600 },
    ],
  };
}

// ── GOALS / SHOTS ─────────────────────────────────────────────────

type GoalVariant = "open_play" | "wonder";

function buildGoalHighlight(
  ev: MatchEvent,
  ctx: GeneratorContext,
  variant: GoalVariant,
): HighlightEvent | null {
  const attackingTeam = ev.team === "home" ? ctx.home : ctx.away;
  const defendingTeam = ev.team === "home" ? ctx.away : ctx.home;
  if (attackingTeam.starters.length === 0) return null;

  const shooter = lookupPlayerById(ev.playerId, attackingTeam.starters) ?? attackingTeam.attackers[0];
  if (!shooter) return null;

  const assister =
    lookupPlayerById(ev.assisterId, attackingTeam.starters) ??
    pickAssister(shooter, attackingTeam, ctx.rng);
  const defender = pickNearestDefender(defendingTeam, ctx.rng);
  const goalkeeper = defendingTeam.goalkeeper;

  // Decide what KIND of goal this is. Wonder goals are nearly always
  // long shots; otherwise we pick a play type using shooter attributes
  // + lane bias so 16 goals don't all look identical.
  const type = decideGoalPlayType(variant, shooter, ctx.rng);

  const lane = pickLaneForType(type, shooter, ctx.rng);
  const startZone = startZoneForType(type, lane);
  const shotZone = shotZoneForType(type, lane);
  const endZone: PitchZone = "GOAL";

  return {
    id: `hl_goal_${ev.minute}_${shooter.id}`,
    minute: ev.minute,
    type,
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: defendingTeam.club.id,
    shooterId: shooter.id,
    assisterId: assister?.id,
    passerId: assister?.id,
    defenderId: defender?.id,
    goalkeeperId: goalkeeper?.id,
    outcome: "goal",
    startZone,
    shotZone,
    endZone,
    xg: xgForType(type, ctx.rng),
    description: buildCommentary(
      {
        minute: ev.minute,
        type,
        outcome: "goal",
        shooter,
        assister: assister ?? undefined,
        defender: defender ?? undefined,
        goalkeeper: goalkeeper ?? undefined,
        shotZone,
        startZone,
        endZone,
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: buildAnimationPath(type, {
      startZone,
      shotZone,
      endZone,
      shooterId: shooter.id,
      assisterId: assister?.id,
      goalkeeperId: goalkeeper?.id,
      outcome: "goal",
    }),
  };
}

function buildOwnGoalHighlight(ev: MatchEvent, ctx: GeneratorContext): HighlightEvent | null {
  // The "scorer" stored on an OwnGoal is the unfortunate defender
  // (from the OPPOSING team, because the legacy engine flips team for
  // OG events — actually it doesn't, it stores the defender's team).
  // We rebuild the play as a defensive mistake by that defender.
  const luckless = lookupPlayerById(ev.playerId, [
    ...ctx.home.starters,
    ...ctx.away.starters,
  ]);
  if (!luckless) return null;

  // Team that BENEFITS from the OG = opposite of the defender's team.
  const isHomeBeneficiary = luckless.clubId !== ctx.home.club.id;
  const attackingTeam = isHomeBeneficiary ? ctx.home : ctx.away;
  const defendingTeam = isHomeBeneficiary ? ctx.away : ctx.home;
  const goalkeeper = defendingTeam.goalkeeper;

  return {
    id: `hl_og_${ev.minute}_${luckless.id}`,
    minute: ev.minute,
    type: "defensive_mistake",
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: defendingTeam.club.id,
    shooterId: luckless.id,
    defenderId: luckless.id,
    goalkeeperId: goalkeeper?.id,
    outcome: "goal",
    startZone: "ATT_C",
    shotZone: "BOX_C",
    endZone: "GOAL",
    xg: 0.4,
    description: `Own goal! ${luckless.displayName} turns it into his own net.`,
    animationPath: [
      { action: "pass", from: "ATT_C", to: "BOX_C", playerId: luckless.id, durationMs: 700 },
      { action: "shot", from: "BOX_C", to: "GOAL", playerId: luckless.id, durationMs: 600 },
      { action: "goal", from: "GOAL", to: "GOAL", durationMs: 1100 },
    ],
  };
}

function buildPenaltyHighlight(
  ev: MatchEvent,
  ctx: GeneratorContext,
  outcome: "goal" | "miss" | "save",
): HighlightEvent | null {
  const attackingTeam = ev.team === "home" ? ctx.home : ctx.away;
  const defendingTeam = ev.team === "home" ? ctx.away : ctx.home;
  if (attackingTeam.starters.length === 0) return null;

  const shooter = lookupPlayerById(ev.playerId, attackingTeam.starters) ?? attackingTeam.attackers[0];
  if (!shooter) return null;
  const goalkeeper = defendingTeam.goalkeeper;

  return {
    id: `hl_pen_${ev.minute}_${shooter.id}`,
    minute: ev.minute,
    type: "penalty",
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: defendingTeam.club.id,
    shooterId: shooter.id,
    goalkeeperId: goalkeeper?.id,
    outcome,
    startZone: "BOX_C",
    shotZone: "BOX_C",
    endZone: outcome === "goal" ? "GOAL" : "BOX_C",
    xg: 0.76,
    description: buildCommentary(
      {
        minute: ev.minute,
        type: "penalty",
        outcome,
        shooter,
        goalkeeper: goalkeeper ?? undefined,
        shotZone: "BOX_C",
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: [
      { action: "setpiece", from: "BOX_C", to: "BOX_C", playerId: shooter.id, durationMs: 900 },
      { action: "shot", from: "BOX_C", to: outcome === "goal" ? "GOAL" : "BOX_C", playerId: shooter.id, durationMs: 600 },
      outcome === "save"
        ? { action: "save", from: "BOX_C", to: "BOX_C", playerId: goalkeeper?.id, durationMs: 900 }
        : outcome === "miss"
          ? { action: "miss", from: "BOX_C", to: "BOX_C", playerId: shooter.id, durationMs: 900 }
          : { action: "goal", from: "GOAL", to: "GOAL", durationMs: 1100 },
    ],
  };
}

function buildSaveHighlight(ev: MatchEvent, ctx: GeneratorContext): HighlightEvent | null {
  // For KeeperSave events the legacy engine stores team = defending
  // team (the keeper's team). The attacking team is the OTHER side.
  const defendingTeam = ev.team === "home" ? ctx.home : ctx.away;
  const attackingTeam = ev.team === "home" ? ctx.away : ctx.home;
  if (attackingTeam.starters.length === 0) return null;

  const goalkeeper =
    lookupPlayerById(ev.playerId, defendingTeam.starters) ?? defendingTeam.goalkeeper;
  const shooter = pickWeightedShooter(attackingTeam, ctx.rng);
  if (!shooter) return null;

  const type = decideShotPlayType(shooter, ctx.rng);
  const lane = pickLaneForType(type, shooter, ctx.rng);
  const startZone = startZoneForType(type, lane);
  const shotZone = shotZoneForType(type, lane);

  return {
    id: `hl_save_${ev.minute}_${shooter.id}`,
    minute: ev.minute,
    type: type === "long_shot" ? "long_shot" : "keeper_save",
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: defendingTeam.club.id,
    shooterId: shooter.id,
    goalkeeperId: goalkeeper?.id,
    outcome: "save",
    startZone,
    shotZone,
    endZone: shotZone,
    xg: xgForType(type, ctx.rng) * 0.7,
    description: buildCommentary(
      {
        minute: ev.minute,
        type: type === "long_shot" ? "long_shot" : "keeper_save",
        outcome: "save",
        shooter,
        goalkeeper: goalkeeper ?? undefined,
        shotZone,
        startZone,
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: buildAnimationPath(type, {
      startZone,
      shotZone,
      endZone: shotZone,
      shooterId: shooter.id,
      goalkeeperId: goalkeeper?.id,
      outcome: "save",
    }),
  };
}

function buildOpenPlayShot(
  ev: MatchEvent,
  ctx: GeneratorContext,
  outcome: HighlightOutcome,
  flavour?: string,
): HighlightEvent | null {
  const attackingTeam = ev.team === "home" ? ctx.home : ctx.away;
  const defendingTeam = ev.team === "home" ? ctx.away : ctx.home;
  if (attackingTeam.starters.length === 0) return null;

  const shooter =
    lookupPlayerById(ev.playerId, attackingTeam.starters) ??
    pickWeightedShooter(attackingTeam, ctx.rng);
  if (!shooter) return null;
  const goalkeeper = defendingTeam.goalkeeper;
  const assister = pickAssister(shooter, attackingTeam, ctx.rng);

  const type = decideShotPlayType(shooter, ctx.rng);
  const lane = pickLaneForType(type, shooter, ctx.rng);
  const startZone = startZoneForType(type, lane);
  const shotZone = shotZoneForType(type, lane);
  const endZone = outcome === "goal" ? ("GOAL" as PitchZone) : shotZone;

  return {
    id: `hl_chance_${ev.minute}_${shooter.id}_${ctx.rng.int(1, 9999)}`,
    minute: ev.minute,
    type,
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: defendingTeam.club.id,
    shooterId: shooter.id,
    assisterId: assister?.id,
    passerId: assister?.id,
    goalkeeperId: goalkeeper?.id,
    outcome,
    startZone,
    shotZone,
    endZone,
    xg: xgForType(type, ctx.rng) * (outcome === "miss" ? 0.5 : 1),
    description: buildCommentary(
      {
        minute: ev.minute,
        type,
        outcome,
        shooter,
        assister: assister ?? undefined,
        goalkeeper: goalkeeper ?? undefined,
        shotZone,
        startZone,
      },
      ctx.commentary,
      ctx.rng,
    ),
    flavour,
    animationPath: buildAnimationPath(type, {
      startZone,
      shotZone,
      endZone,
      shooterId: shooter.id,
      assisterId: assister?.id,
      goalkeeperId: goalkeeper?.id,
      outcome,
    }),
  };
}

function buildDefensiveMistake(ev: MatchEvent, ctx: GeneratorContext): HighlightEvent | null {
  // Defensive errors are scored from the defender's POV. The team
  // that BENEFITS = the other team.
  const errorTeam = ev.team === "home" ? ctx.home : ctx.away;
  const attackingTeam = ev.team === "home" ? ctx.away : ctx.home;
  if (attackingTeam.starters.length === 0) return null;

  const defender =
    lookupPlayerById(ev.playerId, errorTeam.starters) ?? pickNearestDefender(errorTeam, ctx.rng);
  const shooter = pickWeightedShooter(attackingTeam, ctx.rng);
  if (!shooter) return null;
  const goalkeeper = errorTeam.goalkeeper;
  const outcome: HighlightOutcome = ctx.rng.bool(0.45) ? "goal" : "save";

  return {
    id: `hl_mistake_${ev.minute}_${defender?.id ?? "x"}`,
    minute: ev.minute,
    type: "defensive_mistake",
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: errorTeam.club.id,
    shooterId: shooter.id,
    defenderId: defender?.id,
    goalkeeperId: goalkeeper?.id,
    outcome,
    startZone: "DEF_C",
    shotZone: "BOX_C",
    endZone: outcome === "goal" ? "GOAL" : "BOX_C",
    xg: 0.4,
    description: buildCommentary(
      {
        minute: ev.minute,
        type: "defensive_mistake",
        outcome,
        shooter,
        defender: defender ?? undefined,
        goalkeeper: goalkeeper ?? undefined,
        shotZone: "BOX_C",
        startZone: "DEF_C",
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: [
      { action: "carry", from: "DEF_C", to: "DEF_C", playerId: defender?.id, durationMs: 600 },
      { action: "tackle", from: "DEF_C", to: "DEF_C", playerId: shooter.id, durationMs: 500 },
      { action: "shot", from: "BOX_C", to: outcome === "goal" ? "GOAL" : "BOX_C", playerId: shooter.id, durationMs: 600 },
      outcome === "goal"
        ? { action: "goal", from: "GOAL", to: "GOAL", durationMs: 1100 }
        : { action: "save", from: "BOX_C", to: "BOX_C", playerId: goalkeeper?.id, durationMs: 900 },
    ],
  };
}

function buildCardHighlight(
  ev: MatchEvent,
  ctx: GeneratorContext,
  kind: "yellow_card" | "red_card",
): HighlightEvent | null {
  const team = ev.team === "home" ? ctx.home : ctx.away;
  const otherTeam = ev.team === "home" ? ctx.away : ctx.home;
  const offender = lookupPlayerById(ev.playerId, team.starters);
  if (!offender) return null;
  return {
    id: `hl_${kind}_${ev.minute}_${offender.id}`,
    minute: ev.minute,
    type: kind,
    attackingTeamId: otherTeam.club.id, // The OTHER team's free kick
    defendingTeamId: team.club.id,
    defenderId: offender.id,
    outcome: "card",
    startZone: "MID_C",
    endZone: "MID_C",
    xg: 0,
    description: buildCommentary(
      {
        minute: ev.minute,
        type: kind,
        outcome: "card",
        defender: offender,
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: [
      { action: "foul", from: "MID_C", to: "MID_C", playerId: offender.id, durationMs: 700 },
      { action: "card", from: "MID_C", to: "MID_C", playerId: offender.id, durationMs: 1100 },
    ],
  };
}

function buildInjuryHighlight(ev: MatchEvent, ctx: GeneratorContext): HighlightEvent | null {
  const team = ev.team === "home" ? ctx.home : ctx.away;
  const otherTeam = ev.team === "home" ? ctx.away : ctx.home;
  const victim = lookupPlayerById(ev.playerId, team.starters);
  if (!victim) return null;
  return {
    id: `hl_injury_${ev.minute}_${victim.id}`,
    minute: ev.minute,
    type: "injury",
    attackingTeamId: otherTeam.club.id,
    defendingTeamId: team.club.id,
    defenderId: victim.id,
    outcome: "injury",
    startZone: "MID_C",
    endZone: "MID_C",
    xg: 0,
    description: buildCommentary(
      { minute: ev.minute, type: "injury", outcome: "injury", defender: victim },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: [
      { action: "injury", from: "MID_C", to: "MID_C", playerId: victim.id, durationMs: 1300 },
    ],
  };
}

function buildLateDramaHighlight(ev: MatchEvent, ctx: GeneratorContext): HighlightEvent | null {
  // Picks a random attacker and either scores or saves — adds spice
  // to stoppage time even when the legacy engine didn't decide it.
  const attackingTeam = ev.team === "home" ? ctx.home : ctx.away;
  const defendingTeam = ev.team === "home" ? ctx.away : ctx.home;
  if (attackingTeam.starters.length === 0) return null;
  const shooter = pickWeightedShooter(attackingTeam, ctx.rng);
  if (!shooter) return null;
  const goalkeeper = defendingTeam.goalkeeper;
  const outcome: HighlightOutcome = ctx.rng.bool(0.35) ? "goal" : "save";
  return {
    id: `hl_late_${ev.minute}_${shooter.id}`,
    minute: ev.minute,
    type: "late_drama",
    attackingTeamId: attackingTeam.club.id,
    defendingTeamId: defendingTeam.club.id,
    shooterId: shooter.id,
    goalkeeperId: goalkeeper?.id,
    outcome,
    startZone: "ATT_C",
    shotZone: "BOX_C",
    endZone: outcome === "goal" ? "GOAL" : "BOX_C",
    xg: 0.25,
    description: buildCommentary(
      {
        minute: ev.minute,
        type: "late_drama",
        outcome,
        shooter,
        goalkeeper: goalkeeper ?? undefined,
        shotZone: "BOX_C",
      },
      ctx.commentary,
      ctx.rng,
    ),
    animationPath: [
      { action: "carry", from: "ATT_C", to: "BOX_C", playerId: shooter.id, durationMs: 700 },
      { action: "shot", from: "BOX_C", to: outcome === "goal" ? "GOAL" : "BOX_C", playerId: shooter.id, durationMs: 600 },
      outcome === "goal"
        ? { action: "goal", from: "GOAL", to: "GOAL", durationMs: 1100 }
        : { action: "save", from: "BOX_C", to: "BOX_C", playerId: goalkeeper?.id, durationMs: 900 },
    ],
  };
}

// =====================================================================
// PLAY-TYPE DECISIONS
// =====================================================================

/** Decide the shot-play archetype for a NON-goal shot (save / miss). */
function decideShotPlayType(shooter: Player, rng: Rng): HighlightEventType {
  // Lane bias from position.
  const detailed = shooter.detailedPosition;
  const onWing = ["LW", "RW", "LM", "RM"].includes(detailed);
  // Long shots are more likely from CMs / DMs / AMs.
  const central = ["CM", "DM", "AM"].includes(detailed);
  const weights: { type: HighlightEventType; weight: number }[] = [
    { type: "build_up_shot", weight: 3 },
    { type: "counter_attack", weight: 2 },
    { type: "through_ball", weight: 2 },
    { type: "long_shot", weight: central ? 3 : 1 },
    { type: "cross", weight: onWing ? 3 : 1 },
    { type: "free_kick", weight: shooter.trait === "Set Piece Expert" ? 2 : 0.5 },
    { type: "corner", weight: detailed === "CB" ? 2 : 0.5 },
  ];
  return rng.pickWeighted(
    weights.map((w) => w.type),
    weights.map((w) => w.weight),
  );
}

/** Decide the play archetype for a GOAL. Wonder goals lean long. */
function decideGoalPlayType(
  variant: GoalVariant,
  shooter: Player,
  rng: Rng,
): HighlightEventType {
  if (variant === "wonder") {
    return rng.pickWeighted<HighlightEventType>(
      ["long_shot", "free_kick", "build_up_shot"],
      [5, 2, 1],
    );
  }
  return decideShotPlayType(shooter, rng);
}

/** Pick a pitch lane consistent with the play type + shooter's position. */
function pickLaneForType(
  type: HighlightEventType,
  shooter: Player,
  rng: Rng,
): PitchLane {
  const detailed = shooter.detailedPosition;
  // Wingers shoot from their own side; central players hit the centre.
  const sidePreference: PitchLane =
    ["LW", "LM", "LB"].includes(detailed) ? "L" :
    ["RW", "RM", "RB"].includes(detailed) ? "R" : "C";
  if (type === "cross") {
    // Crosses come from wide zones — bias to whichever lane the wide
    // player is from, fall back to a 50/50 left/right.
    if (sidePreference !== "C") return sidePreference;
    return rng.bool() ? "L" : "R";
  }
  if (type === "through_ball" || type === "long_shot" || type === "free_kick" || type === "build_up_shot") {
    // Central plays tend to attack centrally.
    return sidePreference === "C" ? "C" : rng.bool(0.6) ? "C" : sidePreference;
  }
  if (type === "counter_attack") {
    // Counters usually break wide.
    return sidePreference !== "C" ? sidePreference : rng.pickWeighted<PitchLane>(["L", "C", "R"], [3, 2, 3]);
  }
  if (type === "corner") {
    return rng.bool() ? "L" : "R";
  }
  return sidePreference;
}

/** Where the move begins on the pitch (attacking-team POV). */
function startZoneForType(type: HighlightEventType, lane: PitchLane): PitchZone {
  switch (type) {
    case "counter_attack": return zoneOf("MID", lane);
    case "cross":          return zoneOf("ATT", lane);
    case "through_ball":   return zoneOf("MID", "C");
    case "long_shot":      return zoneOf("ATT", lane);
    case "build_up_shot":  return zoneOf("MID", lane);
    case "corner":         return zoneOf("BOX", lane === "C" ? "L" : lane);
    case "free_kick":      return zoneOf("ATT", lane);
    case "penalty":        return "BOX_C";
    case "defensive_mistake": return "DEF_C";
    case "late_drama":     return "ATT_C";
    default:               return zoneOf("MID", lane);
  }
}

/** Where the shot is taken from. */
function shotZoneForType(type: HighlightEventType, lane: PitchLane): PitchZone {
  switch (type) {
    case "long_shot":      return zoneOf("ATT", lane);
    case "cross":          return zoneOf("BOX", "C");
    case "through_ball":   return zoneOf("BOX", lane === "C" ? "C" : lane);
    case "corner":         return zoneOf("BOX", "C");
    case "free_kick":      return zoneOf("ATT", lane);
    case "penalty":        return "BOX_C";
    case "build_up_shot":  return zoneOf("BOX", lane === "C" ? "C" : lane);
    case "counter_attack": return zoneOf("BOX", lane === "C" ? "C" : lane);
    case "defensive_mistake": return "BOX_C";
    case "late_drama":     return "BOX_C";
    default:               return "BOX_C";
  }
}

/** xG band per play type. */
function xgForType(type: HighlightEventType, rng: Rng): number {
  switch (type) {
    case "penalty":          return 0.76;
    case "long_shot":        return clamp(rng.next() * 0.04 + 0.02, 0.02, 0.06);
    case "cross":            return clamp(rng.next() * 0.10 + 0.08, 0.08, 0.20);
    case "through_ball":     return clamp(rng.next() * 0.20 + 0.20, 0.20, 0.45);
    case "counter_attack":   return clamp(rng.next() * 0.20 + 0.18, 0.18, 0.40);
    case "build_up_shot":    return clamp(rng.next() * 0.10 + 0.10, 0.10, 0.22);
    case "corner":           return clamp(rng.next() * 0.06 + 0.04, 0.04, 0.12);
    case "free_kick":        return clamp(rng.next() * 0.06 + 0.04, 0.04, 0.12);
    case "defensive_mistake": return clamp(rng.next() * 0.20 + 0.40, 0.40, 0.70);
    case "late_drama":       return clamp(rng.next() * 0.18 + 0.18, 0.18, 0.40);
    default:                 return 0.1;
  }
}

// =====================================================================
// ANIMATION PATH BUILDER
// =====================================================================

interface AnimationSeed {
  startZone: PitchZone;
  shotZone: PitchZone;
  endZone: PitchZone;
  shooterId?: string;
  assisterId?: string;
  goalkeeperId?: string;
  outcome: HighlightOutcome;
}

function buildAnimationPath(
  type: HighlightEventType,
  seed: AnimationSeed,
): AnimationStep[] {
  const path: AnimationStep[] = [];
  // Helper to push a step succinctly.
  const push = (s: AnimationStep) => path.push(s);

  switch (type) {
    case "counter_attack": {
      push({ action: "carry", from: seed.startZone, to: laneOfZone(seed.startZone, "ATT"), playerId: seed.assisterId, durationMs: 1300 });
      push({ action: "pass",  from: laneOfZone(seed.startZone, "ATT"), to: seed.shotZone, playerId: seed.assisterId, targetPlayerId: seed.shooterId, durationMs: 700 });
      push({ action: "shot",  from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
    case "through_ball": {
      push({ action: "pass",        from: seed.startZone, to: "ATT_C", playerId: seed.assisterId, targetPlayerId: seed.shooterId, durationMs: 600 });
      push({ action: "through_ball", from: "ATT_C", to: seed.shotZone, playerId: seed.assisterId, targetPlayerId: seed.shooterId, durationMs: 700 });
      push({ action: "shot",        from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
    case "cross": {
      push({ action: "carry", from: seed.startZone, to: seed.startZone, playerId: seed.assisterId, durationMs: 700 });
      push({ action: "cross", from: seed.startZone, to: seed.shotZone, playerId: seed.assisterId, targetPlayerId: seed.shooterId, durationMs: 900 });
      push({ action: "header", from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
    case "long_shot": {
      push({ action: "carry", from: laneOfZone(seed.startZone, "MID"), to: seed.startZone, playerId: seed.shooterId, durationMs: 900 });
      push({ action: "shot",  from: seed.startZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 700 });
      break;
    }
    case "build_up_shot": {
      push({ action: "pass", from: seed.startZone, to: "ATT_C", playerId: seed.assisterId, durationMs: 700 });
      push({ action: "pass", from: "ATT_C", to: seed.shotZone, playerId: seed.assisterId, targetPlayerId: seed.shooterId, durationMs: 700 });
      push({ action: "shot", from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
    case "corner": {
      push({ action: "setpiece", from: seed.startZone, to: seed.startZone, playerId: seed.assisterId, durationMs: 800 });
      push({ action: "cross",    from: seed.startZone, to: seed.shotZone, playerId: seed.assisterId, targetPlayerId: seed.shooterId, durationMs: 900 });
      push({ action: "header",   from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
    case "free_kick": {
      push({ action: "setpiece", from: seed.startZone, to: seed.startZone, playerId: seed.shooterId, durationMs: 900 });
      push({ action: "shot",     from: seed.startZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 700 });
      break;
    }
    case "keeper_save":
    case "miss": {
      // Generic shot animation when no specific play type was chosen.
      push({ action: "carry", from: seed.startZone, to: seed.shotZone, playerId: seed.shooterId, durationMs: 800 });
      push({ action: "shot",  from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
    default: {
      push({ action: "carry", from: seed.startZone, to: seed.shotZone, playerId: seed.shooterId, durationMs: 700 });
      push({ action: "shot",  from: seed.shotZone, to: seed.endZone, playerId: seed.shooterId, durationMs: 600 });
      break;
    }
  }

  // Resolution step — always append a one-shot beat for the outcome so
  // the viewer has a frame to flash the goal/save/miss FX.
  if (seed.outcome === "goal") {
    push({ action: "goal", from: "GOAL", to: "GOAL", durationMs: 1100 });
  } else if (seed.outcome === "save") {
    push({ action: "save", from: seed.shotZone, to: seed.shotZone, playerId: seed.goalkeeperId, durationMs: 900 });
  } else if (seed.outcome === "miss" || seed.outcome === "woodwork" || seed.outcome === "blocked") {
    push({ action: "miss", from: seed.shotZone, to: seed.shotZone, playerId: seed.shooterId, durationMs: 800 });
  }
  return path;
}

/** Helper: given a starting zone and a different vertical third, keep
 * the lane and switch the third. e.g. ("MID_L", "ATT") → "ATT_L". */
function laneOfZone(zone: PitchZone, third: "DEF" | "MID" | "ATT"): PitchZone {
  return zoneOf(third, laneOf(zone));
}

// =====================================================================
// PLAYER PICKERS
// =====================================================================

function lookupPlayerById(id: string | undefined, pool: Player[]): Player | undefined {
  if (!id) return undefined;
  return pool.find((p) => p.id === id);
}

function pickWeightedShooter(team: TeamCtx, rng: Rng): Player | undefined {
  const pool = team.attackers.length > 0 ? team.attackers : team.starters.filter((p) => p.position !== "GK");
  if (pool.length === 0) return undefined;
  const weights = pool.map((p) => Math.max(0.5, (p.overall - 50) * (1 + p.shooting / 100)));
  return rng.pickWeighted(pool, weights);
}

function pickAssister(shooter: Player, team: TeamCtx, rng: Rng): Player | undefined {
  // Don't always assign an assister — wonder goals + long shots often
  // come from individual brilliance.
  if (!rng.bool(0.7)) return undefined;
  const pool = team.starters.filter(
    (p) => p.id !== shooter.id && p.position !== "GK",
  );
  if (pool.length === 0) return undefined;
  const weights = pool.map((p) => {
    let w = Math.max(0.5, (p.overall - 50) * (1 + p.passing / 100));
    if (p.position === "MID") w *= 1.6;
    if (p.position === "FWD") w *= 1.2;
    if (p.trait === "Playmaker") w *= 1.5;
    return w;
  });
  return rng.pickWeighted(pool, weights);
}

function pickNearestDefender(team: TeamCtx, rng: Rng): Player | undefined {
  const pool = team.defenders.length > 0 ? team.defenders : team.starters.filter((p) => p.position !== "GK");
  if (pool.length === 0) return undefined;
  return rng.pick(pool);
}

// =====================================================================
// FEED PADDING
//
// If the engine produced too few highlight-worthy events (e.g. a 0-0
// only generates kickoff + 2 saves + half-time + full-time = 5 events)
// we pad with non-decisive chances spread across the 90 minutes so the
// viewer always shows 8-16 highlights regardless of the score.
//
// We never pad UP to a goal — the score is the legacy engine's call.
// =====================================================================

const TARGET_MIN = 8;
const TARGET_MAX = 16;

function padFeed(highlights: HighlightEvent[], ctx: GeneratorContext): void {
  // Count "play" highlights (exclude period markers and cards).
  const playHighlights = highlights.filter(
    (h) => h.type !== "kickoff" && h.type !== "half_time" && h.type !== "full_time",
  );
  const target = ctx.rng.int(TARGET_MIN, TARGET_MAX);
  const needed = target - playHighlights.length;
  if (needed <= 0) return;

  // Existing minutes — try not to crowd.
  const usedMinutes = new Set(playHighlights.map((h) => h.minute));
  for (let i = 0; i < needed; i++) {
    const minute = pickFreeMinute(usedMinutes, ctx.rng);
    if (minute === null) break;
    usedMinutes.add(minute);
    const attacking = ctx.rng.bool() ? ctx.home : ctx.away;
    const defending = attacking === ctx.home ? ctx.away : ctx.home;
    if (attacking.starters.length === 0) continue;
    const shooter = pickWeightedShooter(attacking, ctx.rng);
    if (!shooter) continue;
    const goalkeeper = defending.goalkeeper;
    const assister = pickAssister(shooter, attacking, ctx.rng);
    // Most padding shots end in a save or miss; never a goal (the
    // legacy engine owns the scoreline).
    const outcome: HighlightOutcome = ctx.rng.bool(0.55) ? "save" : "miss";
    const type = decideShotPlayType(shooter, ctx.rng);
    const lane = pickLaneForType(type, shooter, ctx.rng);
    const startZone = startZoneForType(type, lane);
    const shotZone = shotZoneForType(type, lane);
    const endZone = shotZone;

    highlights.push({
      id: `hl_pad_${minute}_${shooter.id}`,
      minute,
      type,
      attackingTeamId: attacking.club.id,
      defendingTeamId: defending.club.id,
      shooterId: shooter.id,
      assisterId: assister?.id,
      passerId: assister?.id,
      goalkeeperId: goalkeeper?.id,
      outcome,
      startZone,
      shotZone,
      endZone,
      xg: xgForType(type, ctx.rng) * 0.6,
      description: buildCommentary(
        {
          minute,
          type,
          outcome,
          shooter,
          assister: assister ?? undefined,
          goalkeeper: goalkeeper ?? undefined,
          shotZone,
          startZone,
        },
        ctx.commentary,
        ctx.rng,
      ),
      animationPath: buildAnimationPath(type, {
        startZone,
        shotZone,
        endZone,
        shooterId: shooter.id,
        assisterId: assister?.id,
        goalkeeperId: goalkeeper?.id,
        outcome,
      }),
    });
  }
}

/** Pick a match minute that isn't already in use (or close to one).
 * Returns null if we've genuinely run out of spread space. */
function pickFreeMinute(used: Set<number>, rng: Rng): number | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = rng.int(2, 88);
    let crowded = false;
    for (const u of used) {
      if (Math.abs(u - m) < 2) {
        crowded = true;
        break;
      }
    }
    if (!crowded) return m;
  }
  return null;
}

// =====================================================================
// LEGACY MAPPING HELPER — exported so the engine + tests can reuse it
// when they need to know whether a MatchEvent will generate a
// highlight (used for sizing / instrumentation).
// =====================================================================
export function legacyEventGeneratesHighlight(type: MatchEventType): boolean {
  return type !== "Substitution";
}
