// =====================================================================
// BID ENGINE — pure logic for evaluating a transfer offer for a player.
//
// Inputs: the player, the selling club, the buying club, the bid amount.
// Outputs: an AI response — accept / counter / reject — with copy that
// the UI can render verbatim ("Aldridge fancies the move, but Liverpool
// won't sell him for less than £42m").
//
// The seller has an internal "asking price" derived from market value
// plus some context-aware multipliers:
//   - Hot prospect (under 23 and potential ≥ overall + 6) → 2.0x
//   - Star already (overall ≥ 84)                        → 1.6x
//   - Aging veteran (age ≥ 31)                           → 0.85x  (eager)
//   - Otherwise                                          → 1.15x  (default)
//
// The bid is then compared as a fraction of asking. A bid clearly above
// asking is accepted; close bids get countered with a softer ask; rude
// low-balls are flat-out rejected.
// =====================================================================

import type { Club, Player } from "@/types/game";

export type BidStatus = "accepted" | "countered" | "rejected";

export interface BidContext {
  player: Player;
  seller: Club;
  buyer: Club;
  amount: number;
}

export interface BidResponse {
  status: BidStatus;
  /** What the seller asked for (raw, pre-counter). */
  askingPrice: number;
  /** When `status === "countered"`, the new asking price. */
  counterAmount?: number;
  /** Two-line copy for the UI. */
  headline: string;
  body: string;
  /** Short tag we can stick on a chip — e.g. "HOT PROSPECT". */
  reason: BidReason;
}

export type BidReason =
  | "hot_prospect"
  | "established_star"
  | "core_starter"
  | "veteran"
  | "fringe"
  | "out_of_our_league"
  | "insulted"
  | "match";

/** Round transfer offers to clean two-significant-figure thousands so
 * counter amounts like £4.137m don't appear in the UI. */
export function roundOffer(amount: number): number {
  if (amount <= 0) return 0;
  if (amount < 100_000) return Math.round(amount / 5_000) * 5_000;
  if (amount < 1_000_000) return Math.round(amount / 25_000) * 25_000;
  if (amount < 10_000_000) return Math.round(amount / 100_000) * 100_000;
  return Math.round(amount / 250_000) * 250_000;
}

/** Pure function — given a bid context, returns the seller's response
 * including asking price, status, counter amount, and pre-formed copy. */
export function evaluateBid(ctx: BidContext): BidResponse {
  const { player, seller, buyer, amount } = ctx;

  // ---------- 1. Asking-price multiplier ----------
  let multiplier = 1.15;
  let reason: BidReason = "fringe";
  const upside = player.potential - player.overall;

  if (player.age <= 22 && upside >= 6) {
    multiplier = 2.0;
    reason = "hot_prospect";
  } else if (player.overall >= 84) {
    multiplier = 1.6;
    reason = "established_star";
  } else if (player.overall >= 75) {
    multiplier = 1.3;
    reason = "core_starter";
  } else if (player.age >= 31) {
    multiplier = 0.85;
    reason = "veteran";
  }

  // Reputation gap — a top-flight club selling to a much smaller buyer
  // demands more (or simply refuses). Compare reputations on a 0-100 axis.
  const repGap = seller.reputation - buyer.reputation;
  if (repGap >= 25) {
    multiplier *= 1.25; // big club won't sell on the cheap
  }

  const askingPrice = roundOffer(player.value * multiplier);

  // ---------- 2. Reputation gate ----------
  // If the buyer is dramatically smaller, even a perfect bid is auto-rejected
  // for marquee players — clubs simply won't sell their best to minnows.
  const tooSmall = repGap >= 35 && (player.overall >= 80 || reason === "hot_prospect");
  if (tooSmall) {
    return {
      status: "rejected",
      askingPrice,
      headline: `${seller.shortName} REJECT — won't sell to a club ${buyerRepLabel(repGap)}`,
      body: `${seller.name} say ${player.lastName} is going nowhere — especially not to ${buyer.shortName}.`,
      reason: "out_of_our_league",
    };
  }

  // ---------- 3. Compare bid to asking ----------
  const ratio = amount / askingPrice;

  if (ratio >= 1.0) {
    return {
      status: "accepted",
      askingPrice,
      headline: `${seller.shortName} ACCEPT your offer of ${formatMoney(amount)}`,
      body: bidBodyForReason(reason, player, seller, "accept"),
      reason,
    };
  }

  if (ratio >= 0.92) {
    // Close — counter at exact asking price.
    return {
      status: "countered",
      askingPrice,
      counterAmount: askingPrice,
      headline: `${seller.shortName} COUNTER · ${formatMoney(askingPrice)}`,
      body: `${seller.name} won't budge below ${formatMoney(askingPrice)} for ${player.lastName}.`,
      reason,
    };
  }

  if (ratio >= 0.7) {
    // A bit low — counter higher than asking to leave themselves room.
    const counter = roundOffer(askingPrice * 1.1);
    return {
      status: "countered",
      askingPrice,
      counterAmount: counter,
      headline: `${seller.shortName} COUNTER · ${formatMoney(counter)}`,
      body: `${seller.name} call your bid light — they want ${formatMoney(counter)} or no deal.`,
      reason,
    };
  }

  if (ratio >= 0.5) {
    // Rude bid — counter at a sharp markup.
    const counter = roundOffer(askingPrice * 1.25);
    return {
      status: "countered",
      askingPrice,
      counterAmount: counter,
      headline: `${seller.shortName} COUNTER · ${formatMoney(counter)}`,
      body: `${seller.name} are insulted — ${formatMoney(counter)} is your starting point now.`,
      reason: "insulted",
    };
  }

  // ---------- 4. Insulting low-ball ----------
  return {
    status: "rejected",
    askingPrice,
    headline: `${seller.shortName} REJECT — bid too low`,
    body: `${seller.name} won't even take the call. ${player.lastName} is worth far more than ${formatMoney(amount)}.`,
    reason: "insulted",
  };
}

function bidBodyForReason(
  reason: BidReason,
  player: Player,
  seller: Club,
  outcome: "accept",
): string {
  if (outcome === "accept") {
    if (reason === "hot_prospect")
      return `${player.lastName} is a future star — ${seller.name} cash in big.`;
    if (reason === "established_star")
      return `${seller.name} reluctantly accept — losing ${player.lastName} hurts.`;
    if (reason === "core_starter")
      return `${seller.name} take the money for ${player.lastName} after thinking it over.`;
    if (reason === "veteran")
      return `${seller.name} are happy to free up the wage bill on ${player.lastName}.`;
    return `${seller.name} accept — they were never that attached to ${player.lastName} anyway.`;
  }
  return "";
}

function buyerRepLabel(gap: number): string {
  return gap >= 50 ? "this much smaller" : "smaller than us";
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(2).replace(/\.00$/, "")}m`;
  if (amount >= 1_000) return `£${Math.round(amount / 1_000)}k`;
  return `£${amount}`;
}

/** Suggests a sensible starting bid for the UI slider (≈ asking price
 * minus 5%). Returns the asking price separately so the UI can show
 * "they want £X". */
export function suggestStartingBid(player: Player, seller: Club, buyer: Club): {
  asking: number;
  suggested: number;
  min: number;
  max: number;
} {
  // Re-run the asking-price calc inline (small duplication, keeps
  // suggestion + evaluator in one source of truth via shared formula).
  const dummy: BidContext = { player, seller, buyer, amount: player.value };
  const initial = evaluateBid(dummy);
  const asking = initial.askingPrice;
  const suggested = roundOffer(asking * 0.95);
  // Bounds: 30% of value (so user can also try cheeky bids) up to 200% of asking.
  const min = roundOffer(player.value * 0.3);
  const max = roundOffer(asking * 2);
  return { asking, suggested, min, max };
}
