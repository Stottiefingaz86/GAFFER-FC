// =====================================================================
// ZUSTAND STORE — Career, database, week-by-week progression.
// =====================================================================

"use client";

import { create } from "zustand";
import type {
  Career,
  Club,
  DetailedPosition,
  Fixture,
  FormationKey,
  GameDatabase,
  GameState,
  InboxMessage,
  Lineup,
  ManagerProfile,
  MatchResult,
  Player,
  PlayerRole,
  SeasonReport,
  SeasonReportDivisionStandings,
  SeasonReportPayout,
  SeasonReportPlayerEntry,
  Tactic,
} from "@/types/game";
import { createRng, hashStringToSeed } from "@/lib/rng";
import { buildClubsAndPlayers } from "@/generators/teamGenerator";
import {
  buildCompetitionsScaffold,
  COMP_IDS,
  DIVISION_NAMES,
} from "@/data/competitionSeeds";
import {
  generateCupRoundOne,
  generateLeagueFixtures,
} from "@/generators/fixtureGenerator";
import {
  applyMatchToPlayers,
  applyResultToTable,
  autoLineup,
  emptyTable,
  recoverNonPlayers,
  resetTables,
  runSeasonRollover,
} from "@/engine/leagueEngine";
import { spriteOverrideFor } from "@/data/clubSpriteOverrides";
import BADGE_PALETTES from "@/data/badgePalettes.json";
import { WORLD_SEED } from "@/data/worldSeed";
import { competitionLabel, stampSeasonHistory } from "@/engine/historyEngine";
import { computeSeasonPayouts } from "@/engine/prizeMoneyEngine";
import { formatValue } from "@/lib/playerValue";
import { simulateMatch } from "@/engine/matchEngine";
import { saveGame, scheduleSave, flushSave, loadGame, clearSave } from "@/engine/saveEngine";
import { evaluateBid } from "@/engine/bidEngine";
import { FREE_AGENT_CLUB_ID } from "@/generators/playerGenerator";
import {
  clampPitchCoord,
  detailedPositionForCoord,
  FORMATIONS,
} from "@/data/formations";

interface GameStoreApi extends GameState {
  // Career setup
  startNewCareer: (input: { managerName: string; clubId: string; seed?: string }) => void;
  loadFromStorage: () => Promise<boolean>;
  resetCareer: () => void;

  // Lineup management
  setUserLineup: (lineup: Lineup) => void;
  setUserFormation: (key: FormationKey) => void;
  setUserTactic: (tactic: Tactic) => void;
  /** Assign a tactical role to the player occupying a given slot.
   * Pass "Default" to clear. */
  setSlotRole: (slotId: string, role: PlayerRole) => void;
  /** Override a slot's pitch position (drag-to-reposition). x/y are in
   * 0..1 normalised pitch space; the matching `DetailedPosition` is
   * derived from those coords. Pass `null` for both to clear and
   * restore the formation default. */
  setSlotPosition: (
    slotId: string,
    x: number | null,
    y: number | null,
  ) => void;

  // Match flow
  prepareNextUserMatch: () => MatchResult | null;
  playUserNextMatch: () => MatchResult | null;
  advanceWeek: () => { userMatch: MatchResult | null; otherResults: MatchResult[] };
  markInboxRead: (id: string) => void;

  // Season rollover — when the last league fixture of the season is
  // played `advanceWeek` stamps a `SeasonReport` onto the career and
  // STOPS short of retiring elders / regenerating fixtures. The user
  // sees the celebration on /season/end, then clicks "Start New Season"
  // to commit the off-season transition (this action). It's a no-op if
  // there is no pending report.
  commitSeasonRollover: () => void;

  // Transfers — Phase-2 lite: single-shot bid → response → optional
  // accept of the resulting price. The seller's response is computed
  // synchronously by the bid engine; we only persist state when a
  // transfer actually completes (player + budget moves clubs).
  /** Returns the AI response to a bid (no DB mutation). */
  evaluateBidFor: (
    playerId: string,
    amount: number,
  ) => import("@/engine/bidEngine").BidResponse | null;
  /** Pays `amount` to the seller and moves the player to the user's
   * club. Returns true on success, false if the budget can't cover it
   * or anything else is wrong. */
  completeTransfer: (playerId: string, amount: number) => boolean;

  // Scouting — opponents and free agents start fogged. Marking a
  // player as scouted unlocks their detailed stats in profiles,
  // popovers, and squad lists.
  /** Mark one or more players as scouted. Idempotent. */
  scoutPlayers: (playerIds: string[]) => void;
  /** Convenience for the common single-player case. */
  scoutPlayer: (playerId: string) => void;
  /** Mark every player on a club as scouted (used by the club page's
   * "Scout this club" CTA). */
  scoutClub: (clubId: string) => void;
  /** Drop a player from the scouted list. Used by the watchlist's
   * "Remove" action — the player's stats fog back over until the user
   * scouts them again. Idempotent: removing an unscouted id is a no-op. */
  unscoutPlayer: (playerId: string) => void;
  /** True when the player is the user's own, a free-agent youth
   * prospect (the user's scouts work the youth pool by default), or
   * has been explicitly scouted. */
  isPlayerScouted: (playerId: string) => boolean;

  // Selectors
  getUserClub: () => Club | null;
  getUserPlayers: () => Player[];
  getUserLineup: () => Lineup | null;
  getNextUserFixture: () => Fixture | null;
  getDivisionForClub: (clubId: string) => string;
  getDivisionFixturesForWeek: (week: number) => Fixture[];
}

function makeManager(name: string): ManagerProfile {
  return {
    name,
    reputation: 1,
    reputationLevel: 1,
    managerLevelLabel: "Unknown",
    trophies: [],
    stats: {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      cleanSheets: 0,
      trophies: 0,
      ppg: 0,
      winPct: 0,
    },
    awards: [],
    seasonHistory: [],
  };
}

// =====================================================================
// SEASON REPORT BUILDER
// Called from advanceWeek the moment we detect every league fixture has
// been played, BEFORE the rollover wipes player stats and resets tables.
// We snapshot:
//   - final standings for all four divisions (sorted)
//   - the user's row + trophies + awards
//   - prize money (already paid into budgets when we enter this fn)
//   - top 5 scorers / assist makers / rated players in the user's
//     division (because that's "your league" — the board cares about
//     your division's golden boot)
//   - a global Golden Boot for the headline tile
// =====================================================================

interface BuildReportInput {
  db: GameDatabase;
  career: Career;
  seasonClosed: number;
  userManagerSeason: import("@/engine/historyEngine").UserSeasonStamp | null;
  prizePayouts: import("@/engine/prizeMoneyEngine").PrizePayout[];
  /** Updated user club budget after prize money landed. */
  newBudget: number;
}

function buildSeasonReport(input: BuildReportInput): SeasonReport {
  const { db, career, seasonClosed, userManagerSeason, prizePayouts, newBudget } = input;
  const userClubId = career.selectedClubId;
  const userClub = db.clubs[userClubId];
  const userDivisionId = userClub?.divisionId ?? COMP_IDS.PREMIER;

  // ----- Final standings, all four divisions ------------------------
  const standings: SeasonReportDivisionStandings[] = [];
  const divisionChampions: Array<{ divisionId: string; clubId: string }> = [];

  ([1, 2, 3, 4] as const).forEach((tier) => {
    const divisionId = DIVISION_NAMES[tier].id;
    const table = db.tables[divisionId];
    if (!table) return;
    const sorted = [...table.rows].sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor,
    );
    const rows = sorted.map((r, idx) => ({
      clubId: r.clubId,
      position: idx + 1,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      points: r.points,
    }));

    // Promotion zone: top 3 of D1/D2/D3 only (Premier doesn't promote
    // anywhere). Relegation zone: bottom 3 of Prem/D1/D2 (D3 has nowhere
    // to fall). These are presentational only — the actual league
    // shuffle is deferred to a future patch but we still surface the
    // narrative.
    const total = rows.length;
    const promotedClubIds =
      tier > 1 ? rows.slice(0, 3).map((r) => r.clubId) : [];
    const relegatedClubIds =
      tier < 4 && total >= 3
        ? rows.slice(total - 3).map((r) => r.clubId)
        : [];

    standings.push({ divisionId, rows, promotedClubIds, relegatedClubIds });

    if (rows.length > 0) {
      divisionChampions.push({ divisionId, clubId: rows[0].clubId });
    }
  });

  // ----- User row + qualification flags -----------------------------
  const userDivStandings = standings.find((s) => s.divisionId === userDivisionId);
  const userRow = userDivStandings?.rows.find((r) => r.clubId === userClubId) ?? null;
  const userFinalPosition = userRow?.position ?? null;

  const isPremier = userDivisionId === COMP_IDS.PREMIER;
  const championsCupQualified =
    isPremier && userFinalPosition !== null && userFinalPosition <= 4;
  const continentalCupQualified =
    isPremier && userFinalPosition !== null && userFinalPosition >= 5 && userFinalPosition <= 6;
  const promoted = !!userDivStandings?.promotedClubIds.includes(userClubId);
  const relegated = !!userDivStandings?.relegatedClubIds.includes(userClubId);

  // ----- Trophies + awards ------------------------------------------
  const trophies = userManagerSeason?.trophies ?? [];
  const awards = userManagerSeason?.awards ?? [];

  // ----- Money -------------------------------------------------------
  const userPayouts: SeasonReportPayout[] = prizePayouts
    .filter((p) => p.clubId === userClubId)
    .map((p) => ({
      competitionId: p.competitionId,
      position: p.position,
      amount: p.amount,
      reason: p.reason,
    }));
  const prizeTotal = userPayouts.reduce((s, p) => s + p.amount, 0);

  // ----- Player leaderboards (user's division) ----------------------
  const userDivClubIds = new Set(
    userDivStandings?.rows.map((r) => r.clubId) ?? [],
  );
  const playersInDiv = Object.values(db.players).filter(
    (p) => userDivClubIds.has(p.clubId) && p.appearances > 0,
  );

  const toEntry = (p: Player): SeasonReportPlayerEntry => ({
    playerId: p.id,
    name: p.displayName || `${p.firstName} ${p.lastName}`,
    clubId: p.clubId,
    divisionId: userDivisionId,
    position: p.position,
    goals: p.goals,
    assists: p.assists,
    appearances: p.appearances,
    averageRating: p.averageRating,
  });

  const topScorers = [...playersInDiv]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, 5)
    .map(toEntry);
  const topAssists = [...playersInDiv]
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
    .slice(0, 5)
    .map(toEntry);
  const topRated = [...playersInDiv]
    .filter((p) => p.appearances >= 5)
    .sort((a, b) => b.averageRating - a.averageRating)
    .slice(0, 5)
    .map(toEntry);

  // World-wide Golden Boot — used as a headline tile when the user
  // didn't produce the leader.
  const allActive = Object.values(db.players).filter((p) => p.appearances > 0);
  const worldTop = allActive.length
    ? [...allActive].sort(
        (a, b) => b.goals - a.goals || b.assists - a.assists,
      )[0]
    : null;
  const worldGoldenBoot: SeasonReportPlayerEntry | null = worldTop
    ? { ...toEntry(worldTop), divisionId: db.clubs[worldTop.clubId]?.divisionId ?? userDivisionId }
    : null;

  // ----- Headline summary numbers -----------------------------------
  const userMatches = userRow?.played ?? 0;
  const userWins = userRow?.won ?? 0;
  const userDraws = userRow?.drawn ?? 0;
  const userLosses = userRow?.lost ?? 0;
  const userGoalsFor = userRow?.goalsFor ?? 0;
  const userGoalsAgainst = userRow?.goalsAgainst ?? 0;
  const userPpg = userMatches > 0 ? +(((userWins * 3 + userDraws) / userMatches).toFixed(2)) : 0;

  return {
    season: seasonClosed,
    userClubId,
    userDivisionId,
    userFinalPosition,
    userMatches,
    userWins,
    userDraws,
    userLosses,
    userGoalsFor,
    userGoalsAgainst,
    userPpg,
    trophies,
    awards,
    prizeTotal,
    prizePayouts: userPayouts,
    newBudget,
    championsCupQualified,
    continentalCupQualified,
    promoted,
    relegated,
    standings,
    divisionChampions,
    topScorers,
    topAssists,
    topRated,
    worldGoldenBoot,
    generatedAt: new Date().toISOString(),
  };
}

function buildInitialDatabase(seed: string): {
  db: GameDatabase;
  inboxOpener: InboxMessage[];
} {
  const rng = createRng(seed);
  const { clubs, players, divisionToClubIds } = buildClubsAndPlayers(rng);
  const competitions = buildCompetitionsScaffold();

  // Wire teams into competitions.
  ([1, 2, 3, 4] as const).forEach((tier) => {
    const id = DIVISION_NAMES[tier].id;
    competitions[id].teamIds = divisionToClubIds[id];
  });
  const allClubIds = Object.keys(clubs);
  competitions[COMP_IDS.NATIONAL_CUP].teamIds = allClubIds;
  competitions[COMP_IDS.LEAGUE_CUP].teamIds = allClubIds;

  // Generate fixtures for all 4 leagues.
  const fixtures: Fixture[] = [];
  ([1, 2, 3, 4] as const).forEach((tier) => {
    const id = DIVISION_NAMES[tier].id;
    fixtures.push(
      ...generateLeagueFixtures(id, divisionToClubIds[id], rng.fork(`fx_${id}`))
    );
  });

  // Cup round one placeholders (every 6 weeks)
  fixtures.push(
    ...generateCupRoundOne(COMP_IDS.NATIONAL_CUP, allClubIds, 4, rng.fork("ncup"))
  );
  fixtures.push(
    ...generateCupRoundOne(COMP_IDS.LEAGUE_CUP, allClubIds, 6, rng.fork("lcup"))
  );

  // Build empty league tables.
  const tables: Record<string, ReturnType<typeof emptyTable>> = {};
  ([1, 2, 3, 4] as const).forEach((tier) => {
    const id = DIVISION_NAMES[tier].id;
    tables[id] = emptyTable(id, divisionToClubIds[id]);
  });

  // Build default lineups for all clubs.
  const lineups: Record<string, Lineup> = {};
  Object.values(clubs).forEach((club) => {
    const squad = Object.values(players).filter((p) => p.clubId === club.id);
    lineups[club.id] = autoLineup(club, squad, "4-4-2");
  });

  return {
    db: {
      clubs,
      players,
      competitions,
      fixtures,
      tables,
      lineups,
      inbox: [],
    },
    inboxOpener: [],
  };
}

export const useGame = create<GameStoreApi>((set, get) => ({
  career: null,
  db: null,

  startNewCareer: ({ managerName, clubId, seed }) => {
    // The world (clubs, players, fixtures) uses a fixed canonical seed
    // so every new career starts from the same baseline — Liverpool
    // Mersey always begins with the same 25-man squad. Per-career
    // randomness still diverges via `career.id` further down. Callers
    // can pass an explicit `seed` to override (used by tests / debug).
    const seedString = seed ?? WORLD_SEED;
    const { db } = buildInitialDatabase(seedString);
    // `career.id` must stay unique per save: weekly match RNG, AI
    // transfer decisions, and rollover all fork from it. If two
    // managers picked the same world seed they'd otherwise share
    // identical week-by-week dice rolls.
    const careerSalt = `${managerName}-${clubId}-${Date.now()}`;
    const career: Career = {
      id: `car_${hashStringToSeed(careerSalt).toString(16)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      managerName,
      selectedClubId: clubId,
      season: 1,
      week: 1,
      manager: makeManager(managerName),
      scoutedPlayerIds: [],
    };

    const club = db.clubs[clubId];
    const opener: InboxMessage = {
      id: `msg_open_${career.id}`,
      week: 1,
      season: 1,
      category: "Board",
      title: `Welcome to ${club.name}, ${managerName}`,
      body:
        `The board are pleased to confirm your appointment as manager of ${club.name}. ` +
        `Your objectives this season are: ${club.seasonObjectives.join(", ")}. ` +
        `The fans expect commitment, fight, and a side they can be proud of. ` +
        `Best of luck — your first match is just around the corner.`,
      read: false,
      important: true,
    };
    db.inbox.push(opener);

    set({ career, db });
    // Fire-and-forget — IDB transactions started here keep the page
    // alive long enough to commit even if the user navigates away.
    void saveGame(career, db);
  },

  loadFromStorage: async () => {
    const data = await loadGame();
    if (!data) return false;
    // Backwards-compat: defensively fill new Player fields that older
    // saves don't have, so the profile UI doesn't crash on undefined.
    const players = { ...data.db.players };
    Object.keys(players).forEach((id) => {
      const p = players[id];
      if (p.caps === undefined) p.caps = 0;
      if (p.internationalGoals === undefined) p.internationalGoals = 0;
      if (!Array.isArray(p.transferInterest)) p.transferInterest = [];
    });
    // Migration: older saves were generated before per-club surname
    // de-duplication and end up with two "Halliwell"s on the same
    // squad. We can't safely rewrite the underlying `lastName` (the UI
    // and engine cite players by full name in match commentary etc.),
    // but we *can* rewrite the `displayName` so the squad list, pitch
    // tokens and popovers all show "T. Halliwell" / "B. Halliwell"
    // instead of two identical "HALLIWELL" labels. Group by clubId →
    // surname; any surname with >1 player gets initial-disambiguated.
    const surnameByClub = new Map<string, Map<string, string[]>>();
    Object.values(players).forEach((p) => {
      let perClub = surnameByClub.get(p.clubId);
      if (!perClub) {
        perClub = new Map();
        surnameByClub.set(p.clubId, perClub);
      }
      const key = p.lastName.toLowerCase();
      const ids = perClub.get(key) ?? [];
      ids.push(p.id);
      perClub.set(key, ids);
    });
    surnameByClub.forEach((perClub) => {
      perClub.forEach((ids) => {
        if (ids.length < 2) return;
        ids.forEach((id) => {
          const p = players[id];
          if (!p) return;
          const initial = p.firstName.charAt(0).toUpperCase();
          // Already disambiguated? Skip — re-running the migration is
          // a no-op so saves don't accumulate "T. T. Halliwell".
          const expected = `${initial}. ${p.lastName}`;
          if (p.displayName === expected) return;
          players[id] = { ...p, displayName: expected };
        });
      });
    });
    // Backwards-compat for clubs (history and crestSprite may be missing
    // on old saves — the latter is filled from the spriteOverrides table
    // so old careers immediately get the hand-drawn artwork on reload).
    // We also re-derive the badge palette + kit colours from the badge
    // PNG itself whenever a sprite crest is present, so existing careers
    // pick up the colour-coherence fix without having to start over
    // (Norwich Canaries was rendering yellow badge over a blue kit; one
    // reload and it's now yellow shirt + green shorts as it should be).
    const clubs = { ...data.db.clubs };
    Object.keys(clubs).forEach((id) => {
      const c = clubs[id];
      const patch: Partial<typeof c> = {};
      if (!c.history) patch.history = { trophies: [], seasons: [] };
      const sprite = spriteOverrideFor(c.id);
      if (!c.crestSprite && sprite) {
        patch.crestSprite = sprite.crestSprite;
        // Also refresh display name + short tag so the spritesheet
        // names appear in old saves without forcing a new career.
        patch.name = sprite.name;
        patch.shortName = sprite.shortName;
      }
      const crestKey = patch.crestSprite ?? c.crestSprite;
      const palette = crestKey
        ? (BADGE_PALETTES as Record<string, { primary: string; secondary: string; accent: string }>)[
            crestKey
          ] ?? null
        : null;
      if (palette) {
        // Only repaint if the colours actually differ — keeps the
        // migration idempotent so saves don't churn.
        const wantPrimary = palette.primary;
        const wantSecondary = palette.secondary;
        const wantAccent = palette.accent;
        const colourMismatch =
          c.badge.primaryColor !== wantPrimary ||
          c.badge.secondaryColor !== wantSecondary ||
          c.badge.accentColor !== wantAccent;
        if (colourMismatch) {
          patch.badge = {
            ...c.badge,
            primaryColor: wantPrimary,
            secondaryColor: wantSecondary,
            accentColor: wantAccent,
          };
          patch.homeKit = {
            ...c.homeKit,
            primaryColor: wantPrimary,
            secondaryColor: wantSecondary,
            shortsColor: wantSecondary,
            socksColor: wantPrimary,
          };
          patch.awayKit = {
            ...c.awayKit,
            primaryColor: wantSecondary,
            secondaryColor: wantPrimary,
            shortsColor: wantPrimary,
            socksColor: wantSecondary,
          };
        }
      }
      if (Object.keys(patch).length > 0) clubs[id] = { ...c, ...patch };
    });
    // Backwards-compat for the manager profile.
    const career = { ...data.career };
    const m = career.manager;
    career.manager = {
      ...m,
      stats: m.stats ?? {
        matches: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, cleanSheets: 0,
        trophies: 0, ppg: 0, winPct: 0,
      },
      awards: m.awards ?? [],
      seasonHistory: m.seasonHistory ?? [],
    };
    // Backwards-compat: scouting was added later, so old saves don't
    // have this field. Default to an empty registry — every non-user
    // player starts fogged until the manager scouts them.
    if (!Array.isArray(career.scoutedPlayerIds)) {
      career.scoutedPlayerIds = [];
    }
    // ===== League table self-heal =====
    // The league table is *derived* from the fixtures ledger — every
    // played fixture has a stored `result`, and the table is meant to
    // be the running sum of those results. We've seen reports where
    // PL/PTS counts drift backwards because a save was dropped (e.g.
    // localStorage quota hit) or a mid-week advance crashed before
    // the new table snapshot persisted. The fix is to *always* rebuild
    // each league table from played fixtures on load, treating the
    // saved `db.tables` as a presentational cache that can be safely
    // rehydrated. The clubs in each division come from the existing
    // table rows so promotion/relegation history is preserved.
    const tables = { ...data.db.tables };
    Object.keys(tables).forEach((divId) => {
      const existing = tables[divId];
      if (!existing) return;
      const clubIds = existing.rows.map((r) => r.clubId);
      let rebuilt = emptyTable(divId, clubIds);
      data.db.fixtures
        .filter(
          (f) => f.competitionId === divId && f.played && f.result,
        )
        .forEach((f) => {
          if (f.result) {
            rebuilt = applyResultToTable(rebuilt, f.result);
          }
        });
      tables[divId] = rebuilt;
    });
    const db = { ...data.db, players, clubs, tables };
    set({ career, db });
    return true;
  },

  resetCareer: () => {
    void clearSave();
    set({ career: null, db: null });
  },

  setUserLineup: (lineup) => {
    const state = get();
    if (!state.db || !state.career) return;
    const db = {
      ...state.db,
      lineups: { ...state.db.lineups, [lineup.clubId]: lineup },
    };
    // Update store immediately so the UI feels instant; persist on idle.
    set({ db });
    scheduleSave(state.career, db);
  },

  setUserFormation: (key) => {
    const { db, career } = get();
    if (!db || !career) return;
    const club = db.clubs[career.selectedClubId];
    const players = Object.values(db.players).filter((p) => p.clubId === club.id);
    const previous = db.lineups[club.id];
    const newLineup = autoLineup(club, players, key);
    if (previous) newLineup.tactic = previous.tactic;
    const next = { ...db, lineups: { ...db.lineups, [club.id]: newLineup } };
    set({ db: next });
    scheduleSave(career, next);
  },

  setUserTactic: (tactic) => {
    const { db, career } = get();
    if (!db || !career) return;
    const club = db.clubs[career.selectedClubId];
    const previous = db.lineups[club.id];
    if (!previous) return;
    const next = {
      ...db,
      lineups: { ...db.lineups, [club.id]: { ...previous, tactic } },
    };
    set({ db: next });
    scheduleSave(career, next);
  },

  setSlotRole: (slotId, role: PlayerRole) => {
    const { db, career } = get();
    if (!db || !career) return;
    const club = db.clubs[career.selectedClubId];
    const previous = db.lineups[club.id];
    if (!previous) return;
    // "Default" clears the override so the saved roles map stays small.
    const nextRoles: Record<string, PlayerRole> = { ...(previous.roles ?? {}) };
    if (role === "Default") {
      delete nextRoles[slotId];
    } else {
      nextRoles[slotId] = role;
    }
    const nextLineup = { ...previous, roles: nextRoles };
    const nextDb = { ...db, lineups: { ...db.lineups, [club.id]: nextLineup } };
    set({ db: nextDb });
    scheduleSave(career, nextDb);
  },

  setSlotPosition: (slotId, x, y) => {
    const { db, career } = get();
    if (!db || !career) return;
    const club = db.clubs[career.selectedClubId];
    const previous = db.lineups[club.id];
    if (!previous) return;

    const nextOverrides: Record<
      string,
      { x: number; y: number; position: DetailedPosition }
    > = { ...(previous.slotPositions ?? {}) };

    if (x === null || y === null) {
      // Clearing the override falls the slot back to its formation default.
      delete nextOverrides[slotId];
    } else {
      // Don't allow user-driven repositioning of the GK slot — the
      // engine assumes a goalkeeper is on his line and out-of-position
      // GKs would just be confusing. Outfield slots can roam freely.
      const formation = FORMATIONS[previous.formationKey];
      const slotMeta = formation.slots.find((s) => s.id === slotId);
      if (slotMeta?.position === "GK") return;

      const clamped = clampPitchCoord(x, y);
      // Keep field players above the GK zone — the helper already
      // returns "GK" for low y values, but we never want to label an
      // outfielder "GK" via repositioning, so floor the position.
      let position = detailedPositionForCoord(clamped.x, clamped.y);
      if (position === "GK") position = "CB";
      nextOverrides[slotId] = { x: clamped.x, y: clamped.y, position };
    }

    const nextLineup: Lineup = {
      ...previous,
      slotPositions: nextOverrides,
    };
    const nextDb = {
      ...db,
      lineups: { ...db.lineups, [club.id]: nextLineup },
    };
    set({ db: nextDb });
    scheduleSave(career, nextDb);
  },

  prepareNextUserMatch: () => null,

  playUserNextMatch: () => {
    const result = get().advanceWeek();
    return result.userMatch;
  },

  advanceWeek: () => {
    const state = get();
    if (!state.db || !state.career) return { userMatch: null, otherResults: [] };
    const career = state.career;
    const db = state.db;
    const week = career.week;

    const rng = createRng(`${career.id}_w${week}`);

    // Find all fixtures scheduled for this week (league + cups currently active).
    const leagueFixtures = db.fixtures.filter((f) => !f.played && f.week === week);

    const nextDb: GameDatabase = { ...db, fixtures: [...db.fixtures], tables: { ...db.tables }, players: { ...db.players }, clubs: { ...db.clubs }, inbox: [...db.inbox] };
    const otherResults: MatchResult[] = [];
    let userMatch: MatchResult | null = null;
    // Per-week deltas for the user's lifetime manager record. Apply at end.
    const managerDelta = {
      matches: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, cleanSheets: 0,
    };

    leagueFixtures.forEach((fx) => {
      const home = nextDb.clubs[fx.homeId];
      const away = nextDb.clubs[fx.awayId];
      if (!home || !away) return;
      const isUser = home.id === career.selectedClubId || away.id === career.selectedClubId;

      // Lineups: user-defined (with autoLineup fallback for opponent), AI auto for others.
      const homeLineup = nextDb.lineups[home.id]
        ?? autoLineup(home, Object.values(nextDb.players).filter((p) => p.clubId === home.id));
      const awayLineup = nextDb.lineups[away.id]
        ?? autoLineup(away, Object.values(nextDb.players).filter((p) => p.clubId === away.id));

      const result = simulateMatch(
        {
          fixture: fx,
          home,
          away,
          homeLineup,
          awayLineup,
          homeRivalry: home.rivalClubId === away.id,
          awayRivalry: away.rivalClubId === home.id,
          isCupGame: !fx.competitionId.startsWith("div_"),
        },
        nextDb.players,
        rng.fork(fx.id)
      );

      // Mark fixture played.
      nextDb.fixtures = nextDb.fixtures.map((f) =>
        f.id === fx.id ? { ...f, played: true, result } : f
      );

      // Update league table.
      const compId = fx.competitionId;
      if (nextDb.tables[compId]) {
        nextDb.tables[compId] = applyResultToTable(nextDb.tables[compId], result);
      }

      // Update players involved.
      nextDb.players = applyMatchToPlayers(result, nextDb.players, rng.fork(`pl_${fx.id}`));

      // Update club budget/mood/board.
      const updHome: Club = {
        ...nextDb.clubs[home.id],
        budget: nextDb.clubs[home.id].budget + result.homeMoneyEarned,
        fanMood: clamp(nextDb.clubs[home.id].fanMood + result.fanMoodChangeHome, 0, 100),
        boardConfidence: clamp(nextDb.clubs[home.id].boardConfidence + result.boardConfidenceChangeHome, 0, 100),
      };
      const updAway: Club = {
        ...nextDb.clubs[away.id],
        budget: nextDb.clubs[away.id].budget + result.awayMoneyEarned,
        fanMood: clamp(nextDb.clubs[away.id].fanMood + result.fanMoodChangeAway, 0, 100),
        boardConfidence: clamp(nextDb.clubs[away.id].boardConfidence + result.boardConfidenceChangeAway, 0, 100),
      };
      nextDb.clubs[home.id] = updHome;
      nextDb.clubs[away.id] = updAway;

      if (isUser) {
        userMatch = result;
        const userClub = home.id === career.selectedClubId ? home : away;
        const opp = home.id === career.selectedClubId ? away : home;
        const userScored = home.id === career.selectedClubId ? result.homeGoals : result.awayGoals;
        const oppScored = home.id === career.selectedClubId ? result.awayGoals : result.homeGoals;

        // Manager lifetime stats — incremented for every user match
        // (league + cup) so the stats panel reflects the full career.
        managerDelta.matches += 1;
        managerDelta.goalsFor += userScored;
        managerDelta.goalsAgainst += oppScored;
        if (oppScored === 0) managerDelta.cleanSheets += 1;
        if (userScored > oppScored) managerDelta.wins += 1;
        else if (userScored < oppScored) managerDelta.losses += 1;
        else managerDelta.draws += 1;

        nextDb.inbox.unshift({
          id: `msg_${result.fixtureId}`,
          week,
          season: career.season,
          category: "MatchReport",
          title:
            userScored > oppScored ? `Win vs ${opp.shortName} (${userScored}-${oppScored})`
            : userScored < oppScored ? `Loss to ${opp.shortName} (${userScored}-${oppScored})`
            : `Draw with ${opp.shortName} (${userScored}-${oppScored})`,
          body:
            `${userClub.name} ${userScored}-${oppScored} ${opp.name}. ` +
            `Story: ${result.story}. Weather: ${result.weather}. ` +
            `Attendance ${result.attendance.toLocaleString()}.`,
          read: false,
          important: false,
        });
      } else {
        otherResults.push(result);
      }
    });

    // Recover other players (those who didn't play).
    nextDb.players = recoverNonPlayers(nextDb.players);

    // Refresh user lineup so injured/suspended starters are auto-replaced for next week.
    const userClub = nextDb.clubs[career.selectedClubId];
    if (userClub) {
      const userPlayers = Object.values(nextDb.players).filter((p) => p.clubId === userClub.id);
      const previous = nextDb.lineups[userClub.id];
      const refreshed = autoLineup(userClub, userPlayers, previous?.formationKey ?? "4-4-2");
      if (previous) {
        // Preserve user-set tactic and overrides.
        refreshed.tactic = previous.tactic;
        // Keep starters that are still available; otherwise let auto fill.
        const fixed: Record<string, string> = {};
        Object.entries(previous.starters).forEach(([slotId, playerId]) => {
          const p = nextDb.players[playerId];
          if (p && !p.isInjured && !p.isSuspended) fixed[slotId] = playerId;
        });
        // Combine: user's preserved starters override auto.
        refreshed.starters = { ...refreshed.starters, ...fixed };
      }
      nextDb.lineups[userClub.id] = refreshed;
    }

    // Apply manager-stat deltas accumulated this week.
    let nextManager: ManagerProfile = career.manager;
    if (managerDelta.matches > 0) {
      const prev = career.manager.stats ?? {
        matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
        cleanSheets: 0, trophies: 0, ppg: 0, winPct: 0,
      };
      const matches = prev.matches + managerDelta.matches;
      const wins = prev.wins + managerDelta.wins;
      const draws = prev.draws + managerDelta.draws;
      const losses = prev.losses + managerDelta.losses;
      const points = wins * 3 + draws;
      const stats = {
        ...prev,
        matches,
        wins,
        draws,
        losses,
        goalsFor: prev.goalsFor + managerDelta.goalsFor,
        goalsAgainst: prev.goalsAgainst + managerDelta.goalsAgainst,
        cleanSheets: prev.cleanSheets + managerDelta.cleanSheets,
        ppg: matches > 0 ? Math.round((points / matches) * 100) / 100 : 0,
        winPct: matches > 0 ? Math.round((wins / matches) * 100) : 0,
      };
      nextManager = { ...career.manager, stats };
    }

    let nextCareer: Career = { ...career, manager: nextManager, week: week + 1, updatedAt: new Date().toISOString() };

    // ===== Season rollover detection =====
    // After every league fixture is played the season is over. We then
    // run the off-season transition: retire elders, age survivors,
    // spawn 15-yo regens, reset tables, regenerate fixtures.
    const maxFxWeek = nextDb.fixtures.length
      ? Math.max(...nextDb.fixtures.map((f) => f.week))
      : 0;
    const allLeagueDone = nextDb.fixtures
      .filter((f) => f.competitionId.startsWith("div_"))
      .every((f) => f.played);

    if (nextCareer.week > maxFxWeek && allLeagueDone) {
      const seasonClosed = nextCareer.season;

      // ===== Trophies, season records & manager awards =====
      // Snapshot final tables BEFORE we reset them. Award positions 1/2/3
      // in each division as Trophy entries on the corresponding clubs,
      // then push a ClubSeasonRecord for every club.
      const userClubId = career.selectedClubId;
      const userManagerSeason = stampSeasonHistory(
        nextDb,
        seasonClosed,
        userClubId,
      );
      // Push to manager's career history + awards
      if (userManagerSeason) {
        const baseAwards = nextManager.awards ?? [];
        const baseHistory = nextManager.seasonHistory ?? [];
        const baseTrophies = nextManager.stats?.trophies ?? 0;
        const wonTrophies = userManagerSeason.trophies.filter(
          (t) => t.position === 1,
        ).length;
        const stats = nextManager.stats
          ? { ...nextManager.stats, trophies: baseTrophies + wonTrophies }
          : nextManager.stats;
        nextManager = {
          ...nextManager,
          stats,
          awards: [...baseAwards, ...userManagerSeason.awards],
          seasonHistory: [...baseHistory, userManagerSeason.record],
          // Preserve human-readable trophies list for legacy ManagerProfile.trophies.
          trophies: [
            ...nextManager.trophies,
            ...userManagerSeason.trophies
              .filter((t) => t.position === 1)
              .map((t) => `${competitionLabel(t.competitionId)} (S${t.season})`),
          ],
        };
        nextCareer = { ...nextCareer, manager: nextManager };
      }

      // ===== Prize money =====
      // Final-table snapshot still lives on nextDb (rollover hasn't run
      // yet — that's deferred until the user clicks "Start New Season"
      // on /season/end), and this season's cup ties are still in
      // db.fixtures, so this is the right moment to compute prize money.
      // We pay it out into budgets immediately so the report screen can
      // show the updated transfer budget.
      const prize = computeSeasonPayouts(nextDb);
      if (Object.keys(prize.totals).length > 0) {
        const updatedClubs: Record<string, Club> = { ...nextDb.clubs };
        for (const [clubId, total] of Object.entries(prize.totals)) {
          const club = updatedClubs[clubId];
          if (!club) continue;
          updatedClubs[clubId] = { ...club, budget: club.budget + total };
        }
        nextDb.clubs = updatedClubs;
      }

      const userClubNow = nextDb.clubs[career.selectedClubId];
      const newBudget = userClubNow ? userClubNow.budget : 0;

      // ===== Build the season report =====
      // Everything the /season/end screen needs is captured here, before
      // anyone wipes goals/assists or resets tables. The user must click
      // "Start New Season" to trigger commitSeasonRollover() which does
      // the actual off-season transition.
      const report = buildSeasonReport({
        db: nextDb,
        career: { ...nextCareer, manager: nextManager },
        seasonClosed,
        userManagerSeason,
        prizePayouts: prize.payouts,
        newBudget,
      });

      // Park the report on the career. The AppShell sees this and
      // funnels every nav click to /season/end so the user has to
      // celebrate (or grieve) before the new season starts.
      nextCareer = {
        ...nextCareer,
        manager: nextManager,
        pendingSeasonReport: report,
      };

      // Note: we deliberately DO NOT bump `season` or reset `week` here.
      // Those happen inside commitSeasonRollover() so the dashboard /
      // league screen still reflect the just-closed season while the
      // user reads the report.
    }

    set({ career: nextCareer, db: nextDb });
    // Drop any pending lineup-debounced save so it can't overwrite us
    // a moment from now, then persist this checkpoint. IDB serializes
    // these two transactions in submission order — the second write
    // commits last and wins, which is the behaviour we want.
    void flushSave();
    void saveGame(nextCareer, nextDb);
    return { userMatch, otherResults };
  },

  markInboxRead: (id) => {
    const { db, career } = get();
    if (!db || !career) return;
    const inbox = db.inbox.map((m) => (m.id === id ? { ...m, read: true } : m));
    const next = { ...db, inbox };
    set({ db: next });
    scheduleSave(career, next);
  },

  // ------------------------------------------------------------------
  // Season rollover commit — runs the deferred off-season transition
  // (retire elders → age survivors → spawn 15-yo regens → reset tables
  // → regenerate fixtures → fresh lineups → bump career.season). Wired
  // to the "Start New Season" button on /season/end. No-ops if there
  // isn't a pending report.
  // ------------------------------------------------------------------
  commitSeasonRollover: () => {
    const { db, career } = get();
    if (!db || !career) return;
    const report = career.pendingSeasonReport;
    if (!report) return;

    const seasonClosed = report.season;
    const rolloverRng = createRng(`${career.id}_eos_${seasonClosed}`);

    // 1. Roll the player pool forward — retire elders, age survivors,
    //    reset season counters, spawn fresh youth.
    const rollover = runSeasonRollover({
      players: db.players,
      rng: rolloverRng,
      seasonClosed,
      regenCount: 200,
    });

    // 2. Wipe last season's tables.
    const newTables = resetTables(db.tables);

    // 3. Regenerate fixtures (same divisions / same teams — actual
    //    promotion/relegation comes in a future patch).
    const newFixtures: Fixture[] = [];
    ([1, 2, 3, 4] as const).forEach((tier) => {
      const id = DIVISION_NAMES[tier].id;
      const teamIds = newTables[id]?.rows.map((r) => r.clubId) ?? [];
      if (teamIds.length) {
        newFixtures.push(
          ...generateLeagueFixtures(id, teamIds, rolloverRng.fork(`fx_${id}`)),
        );
      }
    });
    const allClubIds = Object.keys(db.clubs);
    newFixtures.push(
      ...generateCupRoundOne(COMP_IDS.NATIONAL_CUP, allClubIds, 4, rolloverRng.fork("ncup")),
      ...generateCupRoundOne(COMP_IDS.LEAGUE_CUP, allClubIds, 6, rolloverRng.fork("lcup")),
    );

    // 4. Refresh every club's lineup against the new (aged) squads.
    const newLineups: Record<string, Lineup> = {};
    Object.values(db.clubs).forEach((c) => {
      const squad = Object.values(rollover.players).filter((p) => p.clubId === c.id);
      const prev = db.lineups[c.id];
      newLineups[c.id] = autoLineup(c, squad, prev?.formationKey ?? "4-4-2");
    });

    // 5. Inbox dispatch — prize-money receipt + off-season summary.
    const userClub = db.clubs[career.selectedClubId];
    const retiredOnYourClub = rollover.retiredIds
      .map((id) => db.players[id])
      .filter((p): p is Player => !!p && p.clubId === career.selectedClubId);
    const wonderkidCount = rollover.newRegens.filter((p) => p.potential >= 84).length;

    const updatedInbox: InboxMessage[] = [...db.inbox];

    if (report.prizeTotal > 0) {
      const lines = [...report.prizePayouts]
        .sort((a, b) => b.amount - a.amount)
        .map((p) => `• ${p.reason}: ${formatValue(p.amount)}`)
        .join("\n");
      updatedInbox.unshift({
        id: `msg_prize_${seasonClosed}`,
        week: 1,
        season: seasonClosed,
        category: "Board",
        title: `Season ${seasonClosed} prize money — ${formatValue(report.prizeTotal)}`,
        body:
          `The board has confirmed ${formatValue(report.prizeTotal)} in prize ` +
          `money for the season just gone.\n\n` +
          `${lines}\n\n` +
          `Updated transfer budget: ${formatValue(report.newBudget)}.`,
        read: false,
        important: report.prizeTotal >= 10_000_000,
      });
    }

    const trophyLine = report.trophies.filter((t) => t.position === 1).length
      ? `You lifted ${report.trophies
          .filter((t) => t.position === 1)
          .map((t) => competitionLabel(t.competitionId))
          .join(", ")}. `
      : "";
    const awardLine = report.awards.length
      ? `Awards earned: ${report.awards.map((a) => a.type).join(", ")}. `
      : "";

    updatedInbox.unshift({
      id: `msg_eos_${seasonClosed}`,
      week: 1,
      season: seasonClosed,
      category: "Board",
      title: report.trophies.some(
        (t) => t.position === 1 && t.competitionId.startsWith("div_"),
      )
        ? `Season ${seasonClosed} ends — CHAMPIONS!`
        : `Season ${seasonClosed} ends`,
      body:
        `The ${seasonClosed}/${seasonClosed + 1} season has concluded. ` +
        trophyLine +
        awardLine +
        `${rollover.stats.retired} players retired worldwide` +
        (retiredOnYourClub.length
          ? `, including ${retiredOnYourClub.map((p) => p.firstName + " " + p.lastName).join(", ")} from ${userClub?.name ?? "your club"}.`
          : ".") +
        ` A fresh wave of ${rollover.stats.regens} 15-year-olds has entered the world — ` +
        `${wonderkidCount} of them flagged as potential wonderkids. ` +
        `Head to the Scout screen to start hunting the next big thing.`,
      read: false,
      important: true,
    });

    const nextDb: GameDatabase = {
      ...db,
      players: rollover.players,
      tables: newTables,
      fixtures: newFixtures,
      lineups: newLineups,
      inbox: updatedInbox,
    };
    const nextCareer: Career = {
      ...career,
      season: seasonClosed + 1,
      week: 1,
      pendingSeasonReport: null,
      updatedAt: new Date().toISOString(),
    };

    set({ career: nextCareer, db: nextDb });
    void flushSave();
    void saveGame(nextCareer, nextDb);
  },

  // ------------------------------------------------------------------
  // Transfers
  // ------------------------------------------------------------------

  evaluateBidFor: (playerId, amount) => {
    const { db, career } = get();
    if (!db || !career) return null;
    const player = db.players[playerId];
    if (!player) return null;
    const buyer = db.clubs[career.selectedClubId];
    const seller = db.clubs[player.clubId];
    if (!buyer || !seller) return null;
    // Pure function — no state mutation.
    return evaluateBid({ player, seller, buyer, amount });
  },

  completeTransfer: (playerId, amount) => {
    const { db, career } = get();
    if (!db || !career) return false;
    const player = db.players[playerId];
    if (!player) return false;
    const buyer = db.clubs[career.selectedClubId];
    const seller = db.clubs[player.clubId];
    if (!buyer || !seller || buyer.id === seller.id) return false;
    // Hard budget gate — UI should also gate this, but we double-check.
    if (buyer.budget < amount) return false;

    const nextBuyer: Club = { ...buyer, budget: buyer.budget - amount };
    const nextSeller: Club = { ...seller, budget: seller.budget + amount };
    const nextPlayer: Player = { ...player, clubId: buyer.id };

    // Add the new player to the buyer's bench tail (or leave him out
    // entirely if there's no lineup yet — he'll show up in reserves).
    const buyerLineup = db.lineups[buyer.id];
    let nextLineups = db.lineups;
    if (buyerLineup && !buyerLineup.bench.includes(playerId) &&
        !Object.values(buyerLineup.starters).includes(playerId)) {
      const room = 6; // BENCH_CAP — keep in sync with tactics page
      const updatedLineup: Lineup = {
        ...buyerLineup,
        bench: buyerLineup.bench.length < room
          ? [...buyerLineup.bench, playerId]
          : buyerLineup.bench,
      };
      nextLineups = { ...db.lineups, [buyer.id]: updatedLineup };
    }

    const nextDb: GameDatabase = {
      ...db,
      clubs: {
        ...db.clubs,
        [buyer.id]: nextBuyer,
        [seller.id]: nextSeller,
      },
      players: { ...db.players, [playerId]: nextPlayer },
      lineups: nextLineups,
    };
    set({ db: nextDb });
    void flushSave();
    void saveGame(career, nextDb);
    return true;
  },

  scoutPlayers: (playerIds) => {
    const { career, db } = get();
    if (!career || !db) return;
    const existing = new Set(career.scoutedPlayerIds ?? []);
    let added = 0;
    for (const id of playerIds) {
      if (db.players[id] && !existing.has(id)) {
        existing.add(id);
        added += 1;
      }
    }
    if (added === 0) return;
    const nextCareer: Career = {
      ...career,
      scoutedPlayerIds: Array.from(existing),
      updatedAt: new Date().toISOString(),
    };
    set({ career: nextCareer });
    scheduleSave(nextCareer, db);
  },

  scoutPlayer: (playerId) => {
    get().scoutPlayers([playerId]);
  },

  scoutClub: (clubId) => {
    const { db } = get();
    if (!db) return;
    const ids = Object.values(db.players)
      .filter((p) => p.clubId === clubId)
      .map((p) => p.id);
    get().scoutPlayers(ids);
  },

  unscoutPlayer: (playerId) => {
    const { career, db } = get();
    if (!career || !db) return;
    const existing = career.scoutedPlayerIds ?? [];
    if (!existing.includes(playerId)) return;
    const nextCareer: Career = {
      ...career,
      scoutedPlayerIds: existing.filter((id) => id !== playerId),
      updatedAt: new Date().toISOString(),
    };
    set({ career: nextCareer });
    scheduleSave(nextCareer, db);
  },

  isPlayerScouted: (playerId) => {
    const { career, db } = get();
    if (!career || !db) return false;
    const player = db.players[playerId];
    if (!player) return false;
    // The user's own players are always fully visible.
    if (player.clubId === career.selectedClubId) return true;
    // Free agents (the youth pool) are surfaced through the
    // /scouting page — the user's network is implicitly working that
    // bucket by default, so they don't need a separate scout action.
    if (player.clubId === FREE_AGENT_CLUB_ID) return true;
    // Otherwise must be in the explicit registry.
    return (career.scoutedPlayerIds ?? []).includes(playerId);
  },

  getUserClub: () => {
    const { db, career } = get();
    if (!db || !career) return null;
    return db.clubs[career.selectedClubId] ?? null;
  },

  getUserPlayers: () => {
    const { db, career } = get();
    if (!db || !career) return [];
    return Object.values(db.players).filter((p) => p.clubId === career.selectedClubId);
  },

  getUserLineup: () => {
    const { db, career } = get();
    if (!db || !career) return null;
    return db.lineups[career.selectedClubId] ?? null;
  },

  getNextUserFixture: () => {
    const { db, career } = get();
    if (!db || !career) return null;
    return (
      db.fixtures
        .filter((f) => !f.played && (f.homeId === career.selectedClubId || f.awayId === career.selectedClubId))
        .sort((a, b) => a.week - b.week)[0] ?? null
    );
  },

  getDivisionForClub: (clubId) => {
    const { db } = get();
    return db?.clubs[clubId]?.divisionId ?? "div_premier";
  },

  getDivisionFixturesForWeek: (week) => {
    const { db } = get();
    if (!db) return [];
    return db.fixtures.filter((f) => f.week === week && f.competitionId.startsWith("div_"));
  },
}));

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
