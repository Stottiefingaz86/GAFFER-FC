// =====================================================================
// FIXTURE GENERATOR — circle-method round-robin (double round-robin -> 38)
// for each 20-team division. Cup placeholders also produced.
//
// dayOfWeek splits inside a single league round look something like:
//   - 1x Friday night (TV pick)
//   - 6x Saturday afternoon (the bulk)
//   - 2-3x Sunday matinee/lunchtime
// Cup ties play midweek (Tue/Wed).
// =====================================================================

import type { Fixture, MatchDay } from "@/types/game";
import type { Rng } from "@/lib/rng";

/** Stable hash → small integer, used to spread fixtures across days
 * deterministically without depending on a global seed. */
function fxHash(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Pick a day for a league fixture. Bias toward Saturday, with a single
 * Friday-night TV pick per round and a couple of Sunday games. */
function leagueDayFor(fixId: string, indexInRound: number): MatchDay {
  const h = fxHash(fixId);
  if (indexInRound === 0) return "FRI";        // first match of the round = Fri night
  if (indexInRound === 1) return "SUN";        // headline Sunday lunchtime tie
  if (indexInRound === 2) return "SUN";        // Sunday 2pm
  if ((h & 0b111) === 0) return "SUN";         // ~12% chance late-Sunday spread
  return "SAT";
}

/** Pick a day for a cup fixture. Most ties are Wednesday, some Tuesday. */
function cupDayFor(fixId: string): MatchDay {
  return (fxHash(fixId) & 1) === 0 ? "WED" : "TUE";
}

export function generateLeagueFixtures(
  competitionId: string,
  teamIds: string[],
  rng: Rng
): Fixture[] {
  if (teamIds.length % 2 !== 0) {
    throw new Error("League must have an even number of teams.");
  }
  const teams = rng.shuffle(teamIds);
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;

  const fixtures: Fixture[] = [];
  let fixId = 1;

  // First half-season: rounds 1..n-1
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const homeIdx = (r + i) % (n - 1);
      const awayIdx = (n - 1 - i + r) % (n - 1);
      const home = i === 0 ? teams[n - 1] : teams[homeIdx];
      const away = i === 0 ? teams[awayIdx] : teams[awayIdx];
      const swap = (r + i) % 2 === 0;
      const homeId = swap ? home : away;
      const awayId = swap ? away : home;
      const id = `fx_${competitionId}_${fixId++}`;
      fixtures.push({
        id,
        competitionId,
        round: r + 1,
        week: r + 1,
        dayOfWeek: leagueDayFor(id, i),
        homeId,
        awayId,
        played: false,
      });
    }
  }

  // Second half-season: reverse home/away.
  const firstHalf = [...fixtures];
  firstHalf.forEach((f, i) => {
    const id = `fx_${competitionId}_${fixId++}`;
    fixtures.push({
      id,
      competitionId,
      round: f.round + rounds,
      week: f.round + rounds,
      dayOfWeek: leagueDayFor(id, i % half),
      homeId: f.awayId,
      awayId: f.homeId,
      played: false,
    });
  });

  return fixtures;
}

// Build an initial domestic-cup round robin (all 80 in single-leg KO).
// Pairings drawn at random with byes if necessary.
export function generateCupRoundOne(
  competitionId: string,
  teamIds: string[],
  startWeek: number,
  rng: Rng
): Fixture[] {
  const shuffled = rng.shuffle(teamIds);
  const fixtures: Fixture[] = [];
  let fixId = 1;
  for (let i = 0; i < shuffled.length; i += 2) {
    const home = shuffled[i];
    const away = shuffled[i + 1];
    if (!away) continue;
    const id = `cup_${competitionId}_${fixId++}`;
    fixtures.push({
      id,
      competitionId,
      round: 1,
      week: startWeek,
      dayOfWeek: cupDayFor(id),
      homeId: home,
      awayId: away,
      played: false,
      stage: "Round 1",
    });
  }
  return fixtures;
}
