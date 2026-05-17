// =====================================================================
// TRANSFER ENGINE — weekly tick that simulates AI rival clubs bidding
// for the user's players. Two flows feed this:
//
//   1. Transfer-listed players — anything the user has set
//      `transferListed=true` on becomes a magnet for offers. Rivals
//      bid against the asking price; we honour the user's anchor but
//      sometimes counter low.
//
//   2. High-interest stars — players with multiple `transferInterest`
//      entries occasionally attract speculative bids even without the
//      user listing them ("clubs are sniffing" → "clubs are bidding").
//
// Every offer is also dropped into the inbox as a "Transfer" message,
// which is the second surface (Phase 2) the user sees outside of the
// Squad page.
//
// PURE — never reads the store or mutates inputs. Returns patches the
// caller (gameStore.advanceWeek) shallow-merges into nextCareer/nextDb.
// =====================================================================

import type {
  Career,
  Club,
  GameDatabase,
  InboxMessage,
  Player,
  TransferOffer,
} from "@/types/game";
import { roundOffer } from "@/engine/bidEngine";
import { type Rng } from "@/lib/rng";
import { FREE_AGENT_CLUB_ID } from "@/generators/playerGenerator";

interface RunTransfersInput {
  career: Career;
  db: GameDatabase;
  rng: Rng;
}

export interface RunTransfersOutput {
  /** New pending offers + status changes (expired offers etc.). */
  nextOffers: TransferOffer[];
  /** Inbox messages to prepend (one per new offer + an expiry digest). */
  inboxMessages: InboxMessage[];
  /** Number of new offers that landed this week (for analytics / toast). */
  newOfferCount: number;
}

/** How long a fresh offer remains on the table before it expires. */
const OFFER_TTL_WEEKS = 4;

/** Probability a transfer-listed player attracts a brand-new bid this
 *  week. Base + bumps based on hype. */
function chanceOfBidFor(player: Player): number {
  let p = 0;
  if (player.transferListed) p += 0.25;
  if ((player.transferInterest?.length ?? 0) >= 3) p += 0.15;
  else if ((player.transferInterest?.length ?? 0) >= 1) p += 0.08;
  if (player.overall >= 85) p += 0.15;
  else if (player.overall >= 78) p += 0.08;
  if (player.potential >= 88 && player.age <= 22) p += 0.1;
  return Math.min(0.6, p);
}

/** Pick a credible bidding club from the world. We bias toward clubs
 *  in the same nation as the player (for transfer realism), but
 *  occasionally a foreign giant swoops in. We also skip the user's
 *  own club + any club that already has a pending offer for the same
 *  player. */
function pickBidder(
  player: Player,
  userClubId: string,
  db: GameDatabase,
  existingBidderIds: Set<string>,
  rng: Rng,
): Club | null {
  const allClubs = Object.values(db.clubs).filter((c) => {
    if (c.id === userClubId) return false;
    if (existingBidderIds.has(c.id)) return false;
    if (c.id === FREE_AGENT_CLUB_ID) return false;
    return true;
  });
  if (allClubs.length === 0) return null;

  // Bias 1: clubs with reputation that can plausibly afford the player.
  // The min reputation scales with player ability — a 90 OVR star
  // attracts 80+ rep clubs, a 70 OVR squad-filler attracts 30+ rep.
  const minRep = Math.max(20, player.overall - 25);
  const eligible = allClubs.filter((c) => c.reputation >= minRep);
  if (eligible.length === 0) return null;

  // Bias 2: 70% of the time pick a club whose rep is within ±15 of the
  // player's overall (peer-level interest); 30% of the time anyone
  // else (the surprise foreign giant). Avoids 60-rep mid-tables
  // bidding £30m for an 88 OVR star, which reads as silly.
  const peerBand = eligible.filter(
    (c) => Math.abs(c.reputation - player.overall) <= 15,
  );
  const pool = peerBand.length > 0 && rng.bool(0.7) ? peerBand : eligible;
  return rng.pick(pool);
}

/** Compute a credible bid amount. We anchor to player.value and adjust
 *  for asking price (if listed), interest (high-interest = higher bid),
 *  and bidder reputation (top clubs bid bigger). */
function bidAmountFor(
  player: Player,
  bidder: Club,
  rng: Rng,
): number {
  // Base anchor — the player's market value.
  let base = player.value || 1_000_000;

  // Asking-price anchor — the user set this expectation, so opening
  // bids cluster 15-25% under it (rivals always try a discount first).
  if (player.transferListed && player.askingPrice && player.askingPrice > 0) {
    base = player.askingPrice;
  }

  // Reputation skew — top clubs (rep 80+) bid 10-25% over base; small
  // clubs (rep < 50) bid 5-15% under. Keeps the "marquee deal" feel.
  let multiplier = 0.85 + rng.next() * 0.15; // 0.85-1.00 by default
  if (bidder.reputation >= 80) multiplier = 1.0 + rng.next() * 0.15;
  else if (bidder.reputation >= 65) multiplier = 0.95 + rng.next() * 0.10;

  // Hot prospect / star inflator — wonderkids and 85+ stars get bigger
  // bids because rivals can see the future.
  const upside = player.potential - player.overall;
  if (player.age <= 22 && upside >= 6) multiplier *= 1.15;
  else if (player.overall >= 85) multiplier *= 1.1;

  return roundOffer(base * multiplier);
}

/** Generate a short headline for the inbox digest. */
function inboxTitleFor(
  player: Player,
  bidder: Club,
  amount: number,
): string {
  const money =
    amount >= 1_000_000
      ? `£${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
      : `£${Math.round(amount / 1_000)}k`;
  return `${bidder.shortName} bid ${money} for ${player.lastName}`;
}

/** Run the weekly tick. */
export function runWeeklyTransfers(input: RunTransfersInput): RunTransfersOutput {
  const { career, db, rng } = input;
  const week = career.week;
  const season = career.season;

  const userClub = db.clubs[career.selectedClubId];
  if (!userClub) {
    return { nextOffers: career.pendingOffers ?? [], inboxMessages: [], newOfferCount: 0 };
  }

  const previous = career.pendingOffers ?? [];

  // ── 1. Expire stale pending offers ───────────────────────────────
  // Offers older than the TTL flip to "expired" and get a tombstone
  // inbox digest line so the user knows interest cooled off.
  const expiredIds: string[] = [];
  const aged = previous.map<TransferOffer>((o) => {
    if (o.status === "pending" && o.expiresWeek <= week) {
      expiredIds.push(o.id);
      return { ...o, status: "expired" as const };
    }
    return o;
  });

  // Existing pending offers per player — used to avoid duplicates from
  // the same bidder for the same player.
  const pendingByPlayer = new Map<string, Set<string>>();
  for (const o of aged) {
    if (o.status !== "pending") continue;
    if (!pendingByPlayer.has(o.playerId)) {
      pendingByPlayer.set(o.playerId, new Set());
    }
    pendingByPlayer.get(o.playerId)!.add(o.fromClubId);
  }

  // ── 2. Walk every user-club player and roll for fresh offers ─────
  const userPlayers = Object.values(db.players).filter(
    (p) => p.clubId === userClub.id,
  );
  const newOffers: TransferOffer[] = [];
  const inboxMessages: InboxMessage[] = [];

  for (const player of userPlayers) {
    const chance = chanceOfBidFor(player);
    if (chance <= 0) continue;
    const playerRng = rng.fork(`txfr_${player.id}_s${season}_w${week}`);
    if (!playerRng.bool(chance)) continue;

    // Per-player offer cap — we don't want a star with 5 simultaneous
    // bids from the same week unless the user really invited it.
    const existingForPlayer = pendingByPlayer.get(player.id) ?? new Set();
    if (existingForPlayer.size >= 3) continue;

    const bidder = pickBidder(player, userClub.id, db, existingForPlayer, playerRng);
    if (!bidder) continue;

    const amount = bidAmountFor(player, bidder, playerRng);
    const offer: TransferOffer = {
      id: `txofr_${career.id}_s${season}_w${week}_${player.id.slice(-6)}_${bidder.id.slice(-4)}`,
      fromClubId: bidder.id,
      playerId: player.id,
      amount,
      week,
      season,
      expiresWeek: week + OFFER_TTL_WEEKS,
      status: "pending",
    };
    newOffers.push(offer);
    existingForPlayer.add(bidder.id);
    pendingByPlayer.set(player.id, existingForPlayer);

    inboxMessages.push({
      id: `${offer.id}_inbox`,
      week,
      season,
      category: "Transfer",
      title: inboxTitleFor(player, bidder, amount),
      body:
        `${bidder.name} have lodged a £${amount.toLocaleString()} offer for ${player.firstName} ${player.lastName}.` +
        ` ${player.transferListed ? "He's been transfer-listed" : "He hasn't been listed"} — head to the Transfers screen to accept, counter, or reject.` +
        ` The offer expires in ${OFFER_TTL_WEEKS} weeks.`,
      read: false,
      important: player.overall >= 80 || !!player.transferListed,
    });
  }

  // ── 3. Optional: digest any expirations into a single "interest
  // cooled" inbox line so the user knows their listing went stale.
  if (expiredIds.length > 0) {
    inboxMessages.push({
      id: `txofr_expiry_${career.id}_s${season}_w${week}`,
      week,
      season,
      category: "Transfer",
      title:
        expiredIds.length === 1
          ? `Offer expired (1 player)`
          : `${expiredIds.length} offers expired`,
      body: `Pending bids on ${expiredIds.length} of your players have lapsed without a response. The clubs have moved on for now — try re-listing or holding for a fresh round.`,
      read: false,
      important: false,
    });
  }

  return {
    nextOffers: [...aged, ...newOffers],
    inboxMessages,
    newOfferCount: newOffers.length,
  };
}
