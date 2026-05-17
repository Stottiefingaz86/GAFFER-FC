// =====================================================================
// PRIZE MONEY ENGINE — end-of-season payouts.
//
// Real football clubs care about three buckets of "post-season cash":
//   1. League prize money — based on final league position.
//   2. Cup prize money — winners + runners-up + per-round progression.
//   3. Continental prize money — Champions Cup, Continental Cup,
//      Super Shield (huge, for the very top clubs).
//
// We mirror that structure here. Only the league + domestic-cup
// pieces actually pay out today because the continental competitions
// (and full cup-final progression) are still being scaffolded — but the
// engine knows about them so when they ship the integration is a
// one-line change in this file rather than a re-architecture.
//
// All amounts are denominated in the same currency the rest of the
// game uses (raw numeric "pounds"). We've calibrated the tables so
// that:
//   - Winning the Premier Division roughly equals a third of a top
//     club's annual budget (≈ £45M against a £100–120M budget).
//   - Winning Division Three roughly equals 1.5× a bottom club's
//     budget (≈ £1.5M against a £100k–£1M budget). Promotion is meant
//     to feel transformational down at the bottom of the pyramid.
//   - Cup wins are a nice top-up but never carry a season alone.
// =====================================================================

import { COMP_IDS } from "@/data/competitionSeeds";
import { divisionTierFor } from "@/data/nations";
import type { Fixture, GameDatabase, LeagueTable } from "@/types/game";
import { competitionLabel } from "./historyEngine";

/** A single prize payment owed to a single club. */
export interface PrizePayout {
  clubId: string;
  competitionId: string;
  /** Final league position (1-N) for league payouts; round number for
   * cup payouts. Helpful for inbox copy. */
  position?: number;
  amount: number;
  /** Human-readable reason — used in the inbox breakdown. */
  reason: string;
}

/** Aggregate result of running the engine. */
export interface PrizeMoneyResult {
  payouts: PrizePayout[];
  /** Pre-aggregated `{ clubId → totalAmount }` so callers don't have
   * to roll the array up themselves before bumping budgets. */
  totals: Record<string, number>;
}

/** Look up the position-band → payout for a given division tier. We
 * use bands rather than per-position numbers because the tail of the
 * table is essentially flat in real life and bands are easier to
 * reason about. */
type Band = { from: number; to: number; amount: number; label: string };

const LEAGUE_PRIZE_TABLES: Record<1 | 2 | 3 | 4, Band[]> = {
  // ---------- PREMIER DIVISION (D1) ----------
  // Title race, European places, mid-table grind, relegation scrap.
  1: [
    { from: 1,  to: 1,  amount: 45_000_000, label: "Champions" },
    { from: 2,  to: 2,  amount: 30_000_000, label: "Runners-up" },
    { from: 3,  to: 3,  amount: 22_000_000, label: "3rd place" },
    // 4-6 is roughly Champions/Continental qualification — still elite.
    { from: 4,  to: 4,  amount: 18_000_000, label: "Champions Cup place" },
    { from: 5,  to: 6,  amount: 14_000_000, label: "Continental qualification" },
    { from: 7,  to: 10, amount: 10_000_000, label: "Top half" },
    { from: 11, to: 13, amount:  8_000_000, label: "Mid-table" },
    { from: 14, to: 17, amount:  6_000_000, label: "Survival" },
    // Relegation places still get a parachute payment so they aren't
    // bankrupt the moment they go down.
    { from: 18, to: 99, amount:  4_000_000, label: "Relegation parachute" },
  ],
  // ---------- DIVISION ONE (D2) ----------
  // Promotion is the prize; relegation is real.
  2: [
    { from: 1,  to: 1,  amount: 15_000_000, label: "Champions (promoted)" },
    { from: 2,  to: 2,  amount: 10_000_000, label: "Runners-up (promoted)" },
    { from: 3,  to: 3,  amount:  7_000_000, label: "Playoff winners" },
    { from: 4,  to: 6,  amount:  5_000_000, label: "Playoff places" },
    { from: 7,  to: 10, amount:  3_500_000, label: "Top half" },
    { from: 11, to: 15, amount:  2_000_000, label: "Mid-table" },
    { from: 16, to: 99, amount:  1_200_000, label: "Lower half" },
  ],
  // ---------- DIVISION TWO (D3) ----------
  3: [
    { from: 1,  to: 1,  amount:  4_500_000, label: "Champions (promoted)" },
    { from: 2,  to: 2,  amount:  3_000_000, label: "Runners-up (promoted)" },
    { from: 3,  to: 3,  amount:  2_000_000, label: "Playoff winners" },
    { from: 4,  to: 6,  amount:  1_500_000, label: "Playoff places" },
    { from: 7,  to: 10, amount:    900_000, label: "Top half" },
    { from: 11, to: 15, amount:    600_000, label: "Mid-table" },
    { from: 16, to: 99, amount:    400_000, label: "Lower half" },
  ],
  // ---------- DIVISION THREE (D4) ----------
  // Bottom of the pyramid — promotion is transformational.
  4: [
    { from: 1,  to: 1,  amount:  1_500_000, label: "Champions (promoted)" },
    { from: 2,  to: 2,  amount:    900_000, label: "Runners-up (promoted)" },
    { from: 3,  to: 3,  amount:    600_000, label: "Playoff winners" },
    { from: 4,  to: 6,  amount:    400_000, label: "Playoff places" },
    { from: 7,  to: 10, amount:    250_000, label: "Top half" },
    { from: 11, to: 15, amount:    150_000, label: "Mid-table" },
    { from: 16, to: 99, amount:    100_000, label: "Lower half" },
  ],
};

/** Per-cup-tie win prize. Once cup-final progression lands these will
 * be replaced by per-round bonuses + winner/runner-up cheques, but the
 * call-site contract stays the same: the league engine asks "how much
 * did this club earn from cup wins this season?" and we hand it back. */
const CUP_WIN_BONUS: Record<string, number> = {
  [COMP_IDS.NATIONAL_CUP]: 250_000,
  [COMP_IDS.LEAGUE_CUP]:   120_000,
  // Continental wins (only fire if those competitions are simulated).
  [COMP_IDS.CHAMPIONS_CUP]:    2_500_000,
  [COMP_IDS.CONTINENTAL_CUP]:  1_200_000,
  [COMP_IDS.SUPER_SHIELD]:       400_000,
};

/** Bigger one-off cheques for actually winning a knockout. Wired into
 * the cup-final hook once it's live. Today these don't pay out yet
 * because the cup finals haven't been simulated — but they're here so
 * the rest of the engine has a stable shape. */
const CUP_WINNER_BONUS: Record<string, number> = {
  [COMP_IDS.NATIONAL_CUP]:    8_000_000,
  [COMP_IDS.LEAGUE_CUP]:      4_000_000,
  [COMP_IDS.CHAMPIONS_CUP]:  80_000_000,
  [COMP_IDS.CONTINENTAL_CUP]:35_000_000,
  [COMP_IDS.SUPER_SHIELD]:    1_500_000,
};

const CUP_RUNNERUP_BONUS: Record<string, number> = {
  [COMP_IDS.NATIONAL_CUP]:    4_000_000,
  [COMP_IDS.LEAGUE_CUP]:      2_000_000,
  [COMP_IDS.CHAMPIONS_CUP]:  45_000_000,
  [COMP_IDS.CONTINENTAL_CUP]:18_000_000,
  [COMP_IDS.SUPER_SHIELD]:      750_000,
};

/** Headline prize for a given competition — used in copy + tooltips. */
export function headlineWinnerPrize(competitionId: string): number {
  return CUP_WINNER_BONUS[competitionId] ?? 0;
}

function tableSorted(t: LeagueTable) {
  return [...t.rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor,
  );
}

function bandFor(tier: 1 | 2 | 3 | 4, position: number): Band {
  const table = LEAGUE_PRIZE_TABLES[tier];
  for (const band of table) {
    if (position >= band.from && position <= band.to) return band;
  }
  // Should never hit — last band's `to` is 99.
  return table[table.length - 1];
}

/**
 * Compute every payout owed at season-end.
 *
 * The fixtures + league tables on `db` still represent the season
 * that just ended at the moment we're called from advanceWeek (the
 * reset happens after this), so we don't currently need a `season`
 * argument. When the cup engine grows historical results we'll add
 * one back.
 *
 * @param db Game database (read-only — we don't mutate here).
 */
export function computeSeasonPayouts(db: GameDatabase): PrizeMoneyResult {
  const payouts: PrizePayout[] = [];
  const totals: Record<string, number> = {};

  const credit = (p: PrizePayout) => {
    payouts.push(p);
    totals[p.clubId] = (totals[p.clubId] ?? 0) + p.amount;
  };

  // ---------- 1. League prize money ----------
  // Pay every league across every nation in the world. The prize
  // bands scale by tier the same way for each nation — top flight
  // pays out the most, tier 4 the least.
  Object.keys(db.tables).forEach((divisionId) => {
    const lookup = divisionTierFor(divisionId);
    if (!lookup) return;
    const tier = lookup.tier;
    const table = db.tables[divisionId];
    if (!table) return;

    const sorted = tableSorted(table);
    sorted.forEach((row, idx) => {
      const position = idx + 1;
      const band = bandFor(tier, position);
      credit({
        clubId: row.clubId,
        competitionId: divisionId,
        position,
        amount: band.amount,
        reason:
          `${competitionLabel(divisionId)} prize money — ` +
          `${band.label} (${ordinal(position)})`,
      });
    });
  });

  // ---------- 2. Cup prize money ----------
  // For now we count *played and won* cup ties this season as a
  // per-win bonus. When cup-final progression lands, this loop will be
  // replaced (or augmented) by trophy/runner-up cheques sourced from
  // the cup engine. We deliberately keep the wiring in one place so
  // there's a single place to upgrade.
  // (The fixtures array is replaced every rollover, so any played
  // cup ties in `db.fixtures` belong to the season that just ended.)
  const cupWinsByClub: Record<string, Record<string, number>> = {};
  for (const fixture of db.fixtures as Fixture[]) {
    if (!fixture.played) continue;
    const winnerId = winnerOf(fixture);
    if (!winnerId) continue;
    if (!(fixture.competitionId in CUP_WIN_BONUS)) continue;
    cupWinsByClub[winnerId] ??= {};
    cupWinsByClub[winnerId][fixture.competitionId] =
      (cupWinsByClub[winnerId][fixture.competitionId] ?? 0) + 1;
  }
  for (const [clubId, winsByComp] of Object.entries(cupWinsByClub)) {
    for (const [competitionId, wins] of Object.entries(winsByComp)) {
      const perWin = CUP_WIN_BONUS[competitionId] ?? 0;
      if (perWin <= 0) continue;
      const amount = perWin * wins;
      credit({
        clubId,
        competitionId,
        amount,
        reason:
          `${competitionLabel(competitionId)} progression bonus — ` +
          `${wins} cup tie${wins === 1 ? "" : "s"} won`,
      });
    }
  }

  return { payouts, totals };
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

function winnerOf(fx: Fixture): string | null {
  // Goals live inside the optional MatchResult, not on the fixture.
  if (!fx.result) return null;
  const hg = fx.result.homeGoals;
  const ag = fx.result.awayGoals;
  if (hg > ag) return fx.homeId;
  if (ag > hg) return fx.awayId;
  // Drawn cup ties don't pay out (we don't model replays/penalties yet).
  return null;
}

// Re-export the bonus tables for any future inbox/UI hooks that want
// to show "if you win this final you'll bank X". Keeping them frozen
// signals to future readers: don't mutate at runtime, edit the engine.
export const PRIZE_TABLES = Object.freeze({
  league: LEAGUE_PRIZE_TABLES,
  cupWinPerTie: CUP_WIN_BONUS,
  cupWinner: CUP_WINNER_BONUS,
  cupRunnerUp: CUP_RUNNERUP_BONUS,
});
