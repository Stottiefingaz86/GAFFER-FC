// =====================================================================
// CONTRACT ENGINE — pure logic for free-agent signings, contract
// renewals, transfer listings, and post-transfer terms.
//
// Three flows live here:
//
//   1. Free-agent signing (`defaultFreeAgentTerms` + `evaluateFreeAgentOffer`)
//      The youth pool / out-of-contract veterans are signed via a one-off
//      negotiation: signing fee + weekly wage + contract length. The
//      player has an internal "minimum acceptable" derived from age,
//      overall and potential — bid above and they sign, below and they
//      counter or reject.
//
//   2. Contract renewal (`defaultRenewalTerms` + `evaluateRenewalOffer`)
//      For your own players whose contract is winding down. Uses the
//      same negotiation model but the AI baseline is more demanding —
//      a 90-rated star expects a 10-15% raise to extend, not a flat
//      replacement. Older / fringe players are easier to extend.
//
//   3. Post-transfer auto-contract (`postTransferContract`)
//      When `completeTransfer` moves a player to a new club, the player
//      gets a fresh wage + contract length so the budget panels stay
//      coherent. The buyer chooses how much they pay — we compute a
//      sensible default the UI can pre-fill.
//
// Everything in this module is PURE — it never reads the Zustand store
// or mutates inputs.
// =====================================================================

import type { Club, Player } from "@/types/game";

// =====================================================================
// CONTRACT TERMS — shared shape across signing / renewing / countering.
// =====================================================================

export interface ContractTerms {
  /** One-off signing fee paid to the player on signing. Free agents
   *  use this to get a payday; for renewals we set this to 0. */
  signingFee: number;
  /** Weekly wage the player will earn over the contract. */
  weeklyWage: number;
  /** Contract length in seasons (capped at 5 in the UI). */
  contractYears: number;
}

export type NegotiationDecision = "accept" | "counter" | "reject";

export interface NegotiationResponse {
  decision: NegotiationDecision;
  /** When `decision === "counter"`, the terms the player would sign for
   *  RIGHT NOW. The UI pre-fills the sliders with this. */
  counter?: ContractTerms;
  /** Two-line UI copy. */
  headline: string;
  body: string;
  /** Short tag for chip — "WANTS A PAYRISE", "TOO CHEEKY", etc. */
  reason: NegotiationReason;
}

export type NegotiationReason =
  | "happy_to_sign"
  | "wants_payrise"
  | "wage_too_low"
  | "fee_too_low"
  | "term_too_short"
  | "term_too_long"
  | "insulted"
  | "veteran_easy"
  | "wonderkid_premium";

// =====================================================================
// FREE-AGENT SIGNING
// =====================================================================

/** What a free agent expects, baseline, before any negotiation. The UI
 *  pre-fills its sliders with this. */
export function defaultFreeAgentTerms(player: Player): ContractTerms {
  // The market value drives both the signing fee (one-off "welcome
  // bonus" — small) and the wage. Free agents typically earn less than
  // contracted players because they have no leverage, so we discount
  // the wage curve by 20% vs the typical-contracted-equivalent.
  const baseWage = wageBandFor(player) * 0.8;
  // Signing fee for a free agent is a small one-off — typically 6 weeks
  // of wages for a young prospect, 3 weeks for a journeyman.
  const feeWeeks = player.age <= 21 ? 6 : player.age <= 26 ? 4 : 3;
  return {
    signingFee: roundMoney(baseWage * feeWeeks),
    weeklyWage: roundMoney(baseWage),
    contractYears: defaultContractYearsFor(player),
  };
}

/**
 * Evaluate a player's response to a free-agent contract offer. Returns
 * accept / counter / reject + counter-offer + UI copy.
 */
export function evaluateFreeAgentOffer(
  player: Player,
  offer: ContractTerms,
): NegotiationResponse {
  const baseline = defaultFreeAgentTerms(player);

  // Wage ratio drives the headline decision. We tolerate ~5% under the
  // baseline before we counter; below 80% we reject outright unless the
  // player is a journeyman who'll take what they can get.
  const wageRatio = offer.weeklyWage / Math.max(1, baseline.weeklyWage);
  const feeRatio = offer.signingFee / Math.max(1, baseline.signingFee);

  // Years too short for a young prospect → counter (they want stability).
  // Years too long for a veteran → counter (they don't want to commit).
  const yearsBad = isContractLengthBad(player, offer.contractYears);

  if (wageRatio >= 0.95 && feeRatio >= 0.85 && !yearsBad) {
    return {
      decision: "accept",
      headline: `${player.lastName} agrees terms`,
      body: `${player.firstName} ${player.lastName} signs for ${formatWagePerWeek(offer.weeklyWage)} on a ${offer.contractYears}-year contract. ${formatMoney(offer.signingFee)} signing-on fee paid up.`,
      reason: pickPositiveReason(player),
    };
  }

  if (wageRatio < 0.6 || feeRatio < 0.4) {
    return {
      decision: "reject",
      headline: `${player.lastName} walks away`,
      body: `${player.firstName} ${player.lastName} laughs the offer off — ${formatWagePerWeek(offer.weeklyWage)} a week is well below what other clubs are dangling.`,
      reason: "insulted",
    };
  }

  // Counter — surface the baseline terms (or a slight haggle) so the
  // user can re-pitch with one slider change.
  const counter: ContractTerms = {
    signingFee: roundMoney(Math.max(offer.signingFee, baseline.signingFee)),
    weeklyWage: roundMoney(Math.max(offer.weeklyWage, baseline.weeklyWage)),
    contractYears: yearsBad ? baseline.contractYears : offer.contractYears,
  };
  const reason: NegotiationReason = yearsBad
    ? offer.contractYears < baseline.contractYears
      ? "term_too_short"
      : "term_too_long"
    : wageRatio < 0.85
      ? "wage_too_low"
      : "fee_too_low";
  return {
    decision: "counter",
    counter,
    headline: `${player.lastName} counters · ${formatWagePerWeek(counter.weeklyWage)}`,
    body: counterBodyForReason(reason, player, counter),
    reason,
  };
}

// =====================================================================
// CONTRACT RENEWAL — for the user's own players
// =====================================================================

/** Baseline renewal expectation. Higher overall players expect a raise;
 *  veterans take what they're offered. */
export function defaultRenewalTerms(player: Player): ContractTerms {
  // Renewals expect a wage on the upper edge of their band — they
  // already proved themselves, so they don't need to take a discount.
  const newBaselineWage = wageBandFor(player) * (player.overall >= 80 ? 1.1 : 1.0);
  // Bumps over current — players in decent form want a payrise.
  const wantsRaise = Math.max(player.wage, newBaselineWage);
  return {
    signingFee: 0, // renewals don't get a signing-on fee
    weeklyWage: roundMoney(wantsRaise),
    contractYears: defaultContractYearsFor(player),
  };
}

/**
 * Evaluate a renewal offer. Compared against `defaultRenewalTerms`.
 * The bar is higher than free-agent signings because the player has
 * leverage — they can run the contract down and walk free.
 */
export function evaluateRenewalOffer(
  player: Player,
  offer: ContractTerms,
): NegotiationResponse {
  const baseline = defaultRenewalTerms(player);

  const wageRatio = offer.weeklyWage / Math.max(1, baseline.weeklyWage);
  const yearsBad = isContractLengthBad(player, offer.contractYears);

  if (wageRatio >= 0.98 && !yearsBad) {
    return {
      decision: "accept",
      headline: `${player.lastName} re-signs`,
      body: `${player.firstName} ${player.lastName} agrees to a new ${offer.contractYears}-year deal worth ${formatWagePerWeek(offer.weeklyWage)}.`,
      reason: pickPositiveReason(player),
    };
  }

  // The "I'm walking out" line — anything below 70% of expected wage is
  // a flat rejection. Vets are more lenient (they can't run free as
  // easily).
  const rejectFloor = player.age >= 32 ? 0.55 : 0.7;
  if (wageRatio < rejectFloor) {
    return {
      decision: "reject",
      headline: `${player.lastName} rejects renewal`,
      body: `${player.firstName} ${player.lastName} would rather see out the contract than sign on these terms.`,
      reason: "insulted",
    };
  }

  const counter: ContractTerms = {
    signingFee: 0,
    weeklyWage: roundMoney(baseline.weeklyWage),
    contractYears: yearsBad ? baseline.contractYears : offer.contractYears,
  };
  return {
    decision: "counter",
    counter,
    headline: `${player.lastName} counters · ${formatWagePerWeek(counter.weeklyWage)}`,
    body: `${player.firstName} ${player.lastName} wants ${formatWagePerWeek(counter.weeklyWage)} per week to commit.`,
    reason: "wants_payrise",
  };
}

// =====================================================================
// POST-TRANSFER AUTO-CONTRACT
// =====================================================================

/**
 * Default contract terms for a player joining a new club after a
 * transfer. Used by `completeTransfer` so the budget panels stay
 * coherent — without this every signed player keeps their old club
 * wage forever, which both reads weirdly and breaks finance balance.
 *
 * `buyer` is currently unused but accepted in the signature so the
 * call sites already pass it; future work can scale wage to the
 * buyer's prestige (top clubs pay more for the same player than a
 * relegation candidate would).
 */
export function postTransferContract(
  player: Player,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _buyer: Club,
): { weeklyWage: number; contractYears: number } {
  const playerBand = wageBandFor(player);
  // Lean toward whichever is higher — a smaller club still has to meet
  // the player's market wage to lure them away.
  const wage = Math.max(playerBand, player.wage * 1.05);
  return {
    weeklyWage: roundMoney(wage),
    contractYears: defaultContractYearsFor(player),
  };
}

// =====================================================================
// SHARED HELPERS
// =====================================================================

/** A player's "market" wage band, derived from overall + a small
 *  age skew. Tuned so the £wk numbers feel right next to per-tier
 *  budgets — see `teamGenerator.budgetForTier`. */
function wageBandFor(player: Player): number {
  const ovr = player.overall;
  let weekly: number;
  if (ovr >= 90)      weekly = 350_000;
  else if (ovr >= 85) weekly = 180_000;
  else if (ovr >= 80) weekly = 90_000;
  else if (ovr >= 75) weekly = 40_000;
  else if (ovr >= 70) weekly = 18_000;
  else if (ovr >= 65) weekly = 9_000;
  else if (ovr >= 60) weekly = 4_500;
  else if (ovr >= 55) weekly = 2_500;
  else                weekly = 1_200;

  // Wonderkid premium — high potential pulls the wage up.
  if (player.potential >= 90) weekly *= 1.4;
  else if (player.potential >= 85) weekly *= 1.2;
  else if (player.potential >= 80) weekly *= 1.1;

  // Age skew — peak earners are 26-30, vets and youngsters take less.
  if (player.age <= 19) weekly *= 0.7;
  else if (player.age <= 22) weekly *= 0.85;
  else if (player.age >= 33) weekly *= 0.7;
  else if (player.age >= 30) weekly *= 0.9;

  return weekly;
}

/** Default contract length expectation — youngsters want long deals,
 *  veterans want short ones. */
function defaultContractYearsFor(player: Player): number {
  if (player.age <= 19) return 5;
  if (player.age <= 23) return 4;
  if (player.age <= 28) return 3;
  if (player.age <= 31) return 2;
  return 1;
}

/** True when the offered contract length is a bad fit for the player's
 *  age — a 35-year-old asking for a 5-year deal is unusual; a 17-year-old
 *  signing a 1-year is also unusual. We warn on both ends. */
function isContractLengthBad(player: Player, years: number): boolean {
  if (years < 1 || years > 6) return true;
  if (player.age <= 21 && years === 1) return true;
  if (player.age >= 33 && years >= 4) return true;
  return false;
}

/** Pick a positive flavour reason for an accepted offer. */
function pickPositiveReason(player: Player): NegotiationReason {
  if (player.age >= 32) return "veteran_easy";
  if (player.potential >= 88) return "wonderkid_premium";
  return "happy_to_sign";
}

/** Round wage / fee to a clean number for display. */
export function roundMoney(n: number): number {
  if (n <= 0) return 0;
  if (n < 1_000) return Math.round(n / 50) * 50;
  if (n < 100_000) return Math.round(n / 500) * 500;
  if (n < 1_000_000) return Math.round(n / 5_000) * 5_000;
  return Math.round(n / 50_000) * 50_000;
}

function counterBodyForReason(
  reason: NegotiationReason,
  player: Player,
  counter: ContractTerms,
): string {
  switch (reason) {
    case "wage_too_low":
      return `${player.lastName} wants ${formatWagePerWeek(counter.weeklyWage)} a week to sign — anything less and the deal's off.`;
    case "fee_too_low":
      return `${player.lastName} expects ${formatMoney(counter.signingFee)} on signing on top of those wages.`;
    case "term_too_short":
      return `${player.lastName} wants security — ${counter.contractYears} years, not ${counter.contractYears - 1} or fewer.`;
    case "term_too_long":
      return `${player.lastName} won't tie himself down for that long — ${counter.contractYears} years is the max.`;
    default:
      return `${player.lastName} counters with ${formatWagePerWeek(counter.weeklyWage)} on a ${counter.contractYears}-year deal.`;
  }
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(2).replace(/\.00$/, "")}m`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}k`;
  return `£${amount}`;
}

function formatWagePerWeek(weeklyWage: number): string {
  return `${formatMoney(weeklyWage)}/wk`;
}
