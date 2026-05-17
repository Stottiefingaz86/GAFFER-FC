// =====================================================================
// HISTORY ENGINE — trophy awards, season records, manager awards.
// Called from the season rollover in gameStore.advanceWeek.
// =====================================================================

import type {
  Club,
  ClubSeasonRecord,
  GameDatabase,
  ManagerAward,
  ManagerSeasonRecord,
  Trophy,
} from "@/types/game";
import { COMP_IDS } from "@/data/competitionSeeds";
import { divisionTierFor, nationOfCompetition } from "@/data/nations";

/** Pretty label for a competition id (used in inbox/awards copy).
 *  Works for every nation's pyramid by looking up nation + tier. */
export function competitionLabel(id: string): string {
  const lookup = divisionTierFor(id);
  if (lookup) {
    const nation = nationOfCompetition(id);
    return nation ? nation.divisionNames[lookup.tier - 1] : id;
  }
  const nation = nationOfCompetition(id);
  if (nation?.nationalCupId === id) return nation.nationalCupName;
  if (nation?.leagueCupId === id) return nation.leagueCupName;
  if (nation?.superCupId === id) return nation.superCupName;
  if (id === COMP_IDS.CHAMPIONS_CUP) return "Champions Cup";
  if (id === COMP_IDS.CONTINENTAL_CUP) return "Continental Cup";
  return id;
}

export interface UserSeasonStamp {
  /** Per-season summary for the user's manager career. */
  record: ManagerSeasonRecord;
  /** Trophies the user earned this season (winner + finishers). */
  trophies: Trophy[];
  /** Awards earned (Manager of the Year, Promotion, Survival, etc.). */
  awards: ManagerAward[];
}

/**
 * Mutates `db.clubs[*].history` in place: for every league, top 3 get a
 * Trophy and every club gets a ClubSeasonRecord pushed onto seasons[].
 * Returns the user's per-season stamp (record + awards + trophies) so
 * the store can also update the ManagerProfile.
 */
export function stampSeasonHistory(
  db: GameDatabase,
  seasonClosed: number,
  userClubId: string,
): UserSeasonStamp | null {
  let userStamp: UserSeasonStamp | null = null;

  // Walk every league across every nation in the world. With 5
  // nations × 4 tiers = up to 20 division stamps per season.
  Object.keys(db.tables).forEach((divisionId) => {
    const lookup = divisionTierFor(divisionId);
    if (!lookup) return;
    const tier = lookup.tier;
    const table = db.tables[divisionId];
    if (!table) return;

    // Sort rows the same way the league page does (points → GD → GF).
    const sortedRows = [...table.rows].sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor,
    );

    sortedRows.forEach((row, idx) => {
      const club = db.clubs[row.clubId];
      if (!club) return;

      const finalPosition = idx + 1;
      const seasonRecord: ClubSeasonRecord = {
        season: seasonClosed,
        divisionId,
        finalPosition,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: row.points,
      };

      const trophiesEarned: Trophy[] = [];
      if (finalPosition <= 3) {
        trophiesEarned.push({
          competitionId: divisionId,
          season: seasonClosed,
          position: finalPosition as 1 | 2 | 3,
        });
      }

      const history = club.history ?? { trophies: [], seasons: [] };
      const updated: Club = {
        ...club,
        history: {
          trophies: [...history.trophies, ...trophiesEarned],
          seasons: [...history.seasons, seasonRecord],
        },
      };
      db.clubs[club.id] = updated;

      if (club.id === userClubId) {
        userStamp = buildUserStamp(
          updated,
          tier,
          divisionId,
          seasonClosed,
          finalPosition,
          trophiesEarned,
          row,
        );
      }
    });
  });

  return userStamp;
}

function buildUserStamp(
  club: Club,
  tier: 1 | 2 | 3 | 4,
  divisionId: string,
  seasonClosed: number,
  finalPosition: number,
  trophies: Trophy[],
  row: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number },
): UserSeasonStamp {
  const awards: ManagerAward[] = [];
  const seasonAwardId = (kind: string) =>
    `aw_s${seasonClosed}_${kind}_${club.id}`;

  // League Title.
  if (finalPosition === 1) {
    awards.push({
      id: seasonAwardId("league"),
      type: "League Title",
      season: seasonClosed,
      competitionId: divisionId,
      clubId: club.id,
      description: `Won the ${competitionLabel(divisionId)}`,
    });
    awards.push({
      id: seasonAwardId("moy"),
      type: "Manager of the Year",
      season: seasonClosed,
      competitionId: divisionId,
      clubId: club.id,
      description: `Named Manager of the Year for guiding ${club.name} to the title`,
    });
  }

  // Promotion (top of D1/D2/D3 — same trigger as title, separate award).
  if (finalPosition === 1 && tier > 1) {
    awards.push({
      id: seasonAwardId("promo"),
      type: "Promotion",
      season: seasonClosed,
      competitionId: divisionId,
      clubId: club.id,
      description: `Promoted as champions of the ${competitionLabel(divisionId)}`,
    });
  }
  // Playoff promotion (positions 2-4 in lower divisions — narrative).
  if (finalPosition >= 2 && finalPosition <= 4 && tier > 1) {
    awards.push({
      id: seasonAwardId("playoff"),
      type: "Promotion",
      season: seasonClosed,
      competitionId: divisionId,
      clubId: club.id,
      description: `Reached the ${competitionLabel(divisionId)} playoff places (${ordinal(finalPosition)})`,
    });
  }

  // Survival — Premier finishing 14-17 (above the relegation zone).
  if (tier === 1 && finalPosition >= 14 && finalPosition <= 17) {
    awards.push({
      id: seasonAwardId("survival"),
      type: "Survival",
      season: seasonClosed,
      competitionId: divisionId,
      clubId: club.id,
      description: `Survived in the ${competitionLabel(divisionId)} (${ordinal(finalPosition)})`,
    });
  }

  // Heuristic Manager-of-the-Month awards: if the user racked up enough
  // points-per-game we hand out one MotM award per significant streak.
  // (Real per-month tracking lives in Phase 2 — for now we give one
  // award if PPG ≥ 2.0 across the season, two if ≥ 2.4.)
  const ppg = row.played ? (row.won * 3 + row.drawn) / row.played : 0;
  if (ppg >= 2.4) {
    awards.push(
      {
        id: seasonAwardId("motm1"),
        type: "Manager of the Month",
        season: seasonClosed,
        clubId: club.id,
        description: `Picked up the Manager of the Month award (autumn run)`,
      },
      {
        id: seasonAwardId("motm2"),
        type: "Manager of the Month",
        season: seasonClosed,
        clubId: club.id,
        description: `Picked up the Manager of the Month award (spring run)`,
      },
    );
  } else if (ppg >= 2.0) {
    awards.push({
      id: seasonAwardId("motm1"),
      type: "Manager of the Month",
      season: seasonClosed,
      clubId: club.id,
      description: `Picked up the Manager of the Month award`,
    });
  }

  const record: ManagerSeasonRecord = {
    season: seasonClosed,
    clubId: club.id,
    divisionId,
    finalPosition,
    matches: row.played,
    wins: row.won,
    draws: row.drawn,
    losses: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    trophies,
    awards,
    points: row.points,
  };

  return { record, trophies, awards };
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
