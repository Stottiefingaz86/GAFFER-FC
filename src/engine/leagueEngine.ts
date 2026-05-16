// =====================================================================
// LEAGUE ENGINE — table updates and AI lineup selection.
// =====================================================================

import type {
  Club,
  LeagueTable,
  LeagueTableRow,
  Lineup,
  MatchResult,
  Player,
  SeasonStat,
} from "@/types/game";
import { FORMATIONS } from "@/data/formations";
import type { Rng } from "@/lib/rng";
import { stampValue } from "@/lib/playerValue";
import { clamp } from "@/lib/rng";
import {
  FREE_AGENT_CLUB_ID,
  NameRegistry,
  generateRegens,
  seasonalOverallDelta,
  shouldRetire,
} from "@/generators/playerGenerator";

export function emptyTable(competitionId: string, teamIds: string[]): LeagueTable {
  return {
    competitionId,
    rows: teamIds.map((clubId) => ({
      clubId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    })),
  };
}

export function applyResultToTable(table: LeagueTable, result: MatchResult): LeagueTable {
  const rows: LeagueTableRow[] = table.rows.map((r) => ({ ...r, form: [...r.form] }));
  const home = rows.find((r) => r.clubId === result.homeId);
  const away = rows.find((r) => r.clubId === result.awayId);
  if (!home || !away) return table;

  home.played += 1; away.played += 1;
  home.goalsFor += result.homeGoals; home.goalsAgainst += result.awayGoals;
  away.goalsFor += result.awayGoals; away.goalsAgainst += result.homeGoals;

  const pushForm = (row: LeagueTableRow, val: "W" | "D" | "L") => {
    row.form = [...row.form, val].slice(-5);
  };

  if (result.homeGoals > result.awayGoals) {
    home.won += 1; away.lost += 1; home.points += 3;
    pushForm(home, "W"); pushForm(away, "L");
  } else if (result.homeGoals < result.awayGoals) {
    away.won += 1; home.lost += 1; away.points += 3;
    pushForm(away, "W"); pushForm(home, "L");
  } else {
    home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
    pushForm(home, "D"); pushForm(away, "D");
  }

  rows.forEach((r) => { r.goalDifference = r.goalsFor - r.goalsAgainst; });
  rows.sort((a, b) =>
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor
  );
  return { competitionId: table.competitionId, rows };
}

// Pick the best 11 (and bench) from a club squad in a given formation.
//
// Strategy:
// 1. Score every (slot, player) pair (0 if injured/suspended).
// 2. Process slots in order of "scarcity" — slots with the fewest natural
//    candidates fill first. So GK and specialised wide positions claim their
//    best fits before generic CM slots eat the depth chart.
// 3. Each pass picks the highest-scoring unassigned player for the slot.
export function autoLineup(
  club: Club,
  players: Player[],
  formationKey: keyof typeof FORMATIONS = "4-4-2"
): Lineup {
  const formation = FORMATIONS[formationKey];
  const available = players.filter((p) => !p.isInjured && !p.isSuspended);
  const starters: Record<string, string> = {};
  const used = new Set<string>();

  const broadFor = (det: string): "GK" | "DEF" | "MID" | "FWD" => {
    if (det === "GK") return "GK";
    if (["CB", "LB", "RB"].includes(det)) return "DEF";
    if (["DM", "CM", "AM", "LM", "RM"].includes(det)) return "MID";
    return "FWD";
  };

  const slotScore = (slot: typeof formation.slots[number], p: Player): number => {
    const broad = broadFor(slot.position);
    let score = p.overall + (p.fitness / 100) * 4 + (p.form / 100) * 3;
    if (p.detailedPosition === slot.position) score += 18;
    else if (p.secondaryPositions.includes(slot.position)) score += 10;
    else if (p.position === broad) score += 5;
    else score -= 16;
    // Captains/leaders get a tiny nudge so a leader-type isn't benched
    if (p.trait === "Leader") score += 1.5;
    return score;
  };

  // Order slots by scarcity (fewest natural candidates first).
  const slotsByScarcity = [...formation.slots].sort((a, b) => {
    const aCands = available.filter((p) => p.detailedPosition === a.position).length;
    const bCands = available.filter((p) => p.detailedPosition === b.position).length;
    if (aCands !== bCands) return aCands - bCands;
    // Tie-break: GK first, then DEF, MID, FWD
    const order = (pos: string) => pos === "GK" ? 0 :
      ["CB","LB","RB"].includes(pos) ? 1 :
      ["DM","LM","RM","AM"].includes(pos) ? 2 :
      ["CM"].includes(pos) ? 4 :
      3;
    return order(a.position) - order(b.position);
  });

  slotsByScarcity.forEach((slot) => {
    const best = available
      .filter((p) => !used.has(p.id))
      .map((p) => ({ p, s: slotScore(slot, p) }))
      .sort((a, b) => b.s - a.s)[0];
    if (best) {
      starters[slot.id] = best.p.id;
      used.add(best.p.id);
    }
  });

  // Bench: prefer one of each broad role, then by overall.
  const remaining = available.filter((p) => !used.has(p.id));
  const want: Array<"GK" | "DEF" | "MID" | "FWD"> = ["GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];
  const bench: string[] = [];
  for (const role of want) {
    const pick = remaining
      .filter((p) => !bench.includes(p.id) && p.position === role)
      .sort((a, b) => b.overall - a.overall)[0];
    if (pick) bench.push(pick.id);
  }
  // Fill any remaining bench slots with overall-best leftovers.
  remaining
    .filter((p) => !bench.includes(p.id))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 7 - bench.length)
    .forEach((p) => bench.push(p.id));

  const startersList = Object.values(starters)
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));

  const captain = [...startersList]
    .sort((a, b) =>
      (b.trait === "Leader" ? 30 : 0) + b.mentality + b.overall * 0.6 -
      ((a.trait === "Leader" ? 30 : 0) + a.mentality + a.overall * 0.6)
    )[0]?.id ?? null;

  const penaltyTaker = [...startersList]
    .filter((p) => p.position !== "GK")
    .sort((a, b) =>
      (b.trait === "Penalty Specialist" ? 25 : 0) + b.shooting + b.mentality * 0.4 -
      ((a.trait === "Penalty Specialist" ? 25 : 0) + a.shooting + a.mentality * 0.4)
    )[0];

  const freeKickTaker = [...startersList]
    .filter((p) => p.position !== "GK")
    .sort((a, b) =>
      (b.trait === "Set Piece Expert" ? 20 : 0) +
      (b.trait === "Long Shot Taker" ? 12 : 0) + b.shooting * 0.5 + b.technique -
      ((a.trait === "Set Piece Expert" ? 20 : 0) +
       (a.trait === "Long Shot Taker" ? 12 : 0) + a.shooting * 0.5 + a.technique)
    )[0];

  const cornerTaker = [...startersList]
    .filter((p) => p.position !== "GK")
    .sort((a, b) =>
      (b.trait === "Set Piece Expert" ? 20 : 0) + b.passing + b.technique -
      ((a.trait === "Set Piece Expert" ? 20 : 0) + a.passing + a.technique)
    )[0];

  return {
    clubId: club.id,
    formationKey: formation.key,
    tactic: clubDefaultTactic(club),
    starters,
    bench,
    captainId: captain,
    penaltyTakerId: penaltyTaker?.id ?? null,
    freeKickTakerId: freeKickTaker?.id ?? null,
    cornerTakerId: cornerTaker?.id ?? null,
  };
}

import type { Tactic, PlayStyle } from "@/types/game";
function clubDefaultTactic(club: Club): Tactic {
  const map: Record<PlayStyle, Tactic> = {
    Balanced: "Balanced",
    Attacking: "Attacking",
    Defensive: "Defensive",
    Counter: "Counter",
    "High Press": "High Press",
    Possession: "Possession",
    Direct: "Direct",
    Physical: "Long Ball",
    "Youth Focus": "Possession",
    "Set Pieces": "Direct",
  };
  return map[club.playStyle] ?? "Balanced";
}

// Update player aggregate stats from a played match.
export function applyMatchToPlayers(
  result: MatchResult,
  players: Record<string, Player>,
  rng: Rng
): Record<string, Player> {
  const updated = { ...players };

  const allRatings = [...result.ratings.home, ...result.ratings.away];
  allRatings.forEach((r) => {
    const p = updated[r.playerId];
    if (!p) return;
    const apps = p.appearances + 1;
    const newAvg = (p.averageRating * p.appearances + r.rating) / apps;

    let injuryWeeks = p.injuryWeeks;
    let isInjured = p.isInjured;
    let suspensionMatches = p.suspensionMatches;
    let isSuspended = p.isSuspended;

    if (r.injured || (p.trait === "Injury Prone" && rng.bool(0.04)) || rng.bool(0.015)) {
      isInjured = true;
      injuryWeeks = rng.int(1, 6);
    }
    if (r.red) {
      isSuspended = true;
      suspensionMatches = rng.int(1, 3);
    }

    const fitnessLoss = rng.int(8, 16);
    const newFitness = Math.max(40, p.fitness - fitnessLoss);

    const formChange = (r.rating - 6.5) * 4;
    const newForm = Math.max(20, Math.min(99, Math.round(p.form + formChange)));

    // Morale nudges with rating, with a cushion so it doesn't swing wildly.
    const moraleChange = (r.rating - 6.5) * 2 + (r.goals * 3) + (r.assists * 2);
    const newMorale = Math.max(20, Math.min(99, Math.round(p.morale + moraleChange)));

    const post: Player = {
      ...p,
      appearances: apps,
      goals: p.goals + r.goals,
      assists: p.assists + r.assists,
      yellowCards: p.yellowCards + (r.yellow ? 1 : 0),
      redCards: p.redCards + (r.red ? 1 : 0),
      averageRating: +newAvg.toFixed(2),
      isInjured,
      injuryWeeks,
      isSuspended,
      suspensionMatches,
      fitness: newFitness,
      form: newForm,
      morale: newMorale,
    };

    // Recompute value/wage from the new state. Value moves with form,
    // productivity, average rating, and injury status.
    updated[r.playerId] = stampValue(post);
  });

  return updated;
}

// =====================================================================
// SEASON ROLLOVER — retirement, regen, ageing, and stat reset.
// Called once per off-season (after the final fixture of a league season).
// =====================================================================

export interface SeasonRolloverInput {
  players: Record<string, Player>;
  /** RNG fork for this off-season — must be deterministic per save. */
  rng: Rng;
  /** Season we're transitioning OUT of. Used to stamp historical stats. */
  seasonClosed: number;
  /** How many fresh 15-year-old regens to spawn into the youth pool. */
  regenCount?: number;
}

export interface SeasonRolloverResult {
  players: Record<string, Player>;
  retiredIds: string[];
  newRegens: Player[];
  stats: {
    retired: number;
    aged: number;
    regens: number;
  };
}

/**
 * Run the off-season transition on the player pool.
 *
 * 1. Stamp the season just played to each player's history.
 * 2. Retire eligible older players (their record stays for nostalgia,
 *    but the live player object is removed).
 * 3. Age every surviving player by 1 year.
 * 4. Reset season-counters (goals, assists, appearances, cards) for the
 *    fresh season.
 * 5. Generate a new wave of 15-year-old regens into the youth pool —
 *    fresh wonderkids for the user to chase.
 */
export function runSeasonRollover(
  input: SeasonRolloverInput,
): SeasonRolloverResult {
  const { players, rng, seasonClosed } = input;
  const regenCount = input.regenCount ?? 150;

  const next: Record<string, Player> = {};
  const retiredIds: string[] = [];
  let aged = 0;

  // Re-use a registry seeded with current names so regens can't clash
  // with anyone alive in the world.
  const registry = new NameRegistry();
  Object.values(players).forEach((p) => registry.add(p.firstName, p.lastName));

  Object.values(players).forEach((p) => {
    // Append closed season to history before potentially retiring.
    const seasonStat: SeasonStat = {
      season: seasonClosed,
      clubId: p.clubId,
      competitionId: "all",
      goals: p.goals,
      assists: p.assists,
      appearances: p.appearances,
      averageRating: p.averageRating,
    };
    const history = [...(p.history ?? []), seasonStat];

    if (shouldRetire(p, rng.fork(`retire_${p.id}`))) {
      retiredIds.push(p.id);
      return;
    }

    aged++;

    // Aging curve — youth grow toward their potential, primes
    // plateau, veterans decline. Without this the world is frozen and
    // the same Veteran Leaders dominate the OVR list forever.
    const nextAge = p.age + 1;
    const ageDelta = seasonalOverallDelta(p, rng.fork(`age_${p.id}`));
    // Cap growth at the player's ceiling so a 21-year-old with potential
    // 86 can't accidentally shoot to 90.
    const newOverall = clamp(
      Math.min(p.overall + ageDelta, p.potential),
      35,
      99,
    );

    next[p.id] = stampValue({
      ...p,
      age: nextAge,
      overall: newOverall,
      // Per-season counters reset so last-year's hot run doesn't keep
      // colouring the value calculation forever.
      goals: 0,
      assists: 0,
      appearances: 0,
      yellowCards: 0,
      redCards: 0,
      averageRating: 0,
      history,
      // Refresh fitness/form to reasonable pre-season baselines.
      fitness: 90,
      form: 60,
      morale: 70,
    });
  });

  // Spawn fresh regens — the next Henrys, Maradonas, Messis.
  const newRegens = generateRegens(regenCount, rng.fork("regens"), registry);
  newRegens.forEach((p) => (next[p.id] = p));

  return {
    players: next,
    retiredIds,
    newRegens,
    stats: {
      retired: retiredIds.length,
      aged,
      regens: newRegens.length,
    },
  };
}

/** Reset every league table to zeros, ready for a new season. */
export function resetTables(
  tables: Record<string, LeagueTable>,
): Record<string, LeagueTable> {
  const out: Record<string, LeagueTable> = {};
  Object.entries(tables).forEach(([id, table]) => {
    out[id] = emptyTable(
      id,
      table.rows.map((r) => r.clubId),
    );
  });
  return out;
}

// Re-export the free agent constant so the store can refer to it without
// pulling the generator transitively.
export { FREE_AGENT_CLUB_ID };

// Recover players that didn't play. Also restamps value because injury
// status may have changed and weekly drift on form/fitness affects value.
export function recoverNonPlayers(players: Record<string, Player>): Record<string, Player> {
  const updated: Record<string, Player> = {};
  Object.values(players).forEach((p) => {
    let next = { ...p };
    if (!p.isInjured && !p.isSuspended) {
      next = { ...next, fitness: Math.min(100, p.fitness + 8) };
      // Players who don't appear lose a little form/sharpness.
      next.form = Math.max(20, p.form - 1);
    } else {
      if (p.injuryWeeks > 0) {
        next = { ...next, injuryWeeks: p.injuryWeeks - 1, isInjured: p.injuryWeeks - 1 > 0 };
        if (next.injuryWeeks === 0) next.fitness = Math.max(70, p.fitness);
      }
      if (p.suspensionMatches > 0) {
        next = { ...next, suspensionMatches: p.suspensionMatches - 1, isSuspended: p.suspensionMatches - 1 > 0 };
      }
    }
    // Restamp value so age/form/availability changes flow through.
    updated[p.id] = stampValue(next);
  });
  return updated;
}
