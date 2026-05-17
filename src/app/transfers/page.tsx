"use client";

// =====================================================================
// Transfers landing page — central hub for the user's outgoing transfer
// activity. Three sections:
//
//   1. INCOMING OFFERS — pending bids from rival AI clubs for your
//      players. Each row has Accept / Counter / Reject inline.
//   2. ON THE BLOCK — players you've listed for sale. Quick stats +
//      "view bids" jumps to that player's offers above.
//   3. CONTRACTS EXPIRING — your players whose contractYears <= 1.
//      Click any of them to open the renewal modal.
// =====================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/game/AppShell";
import { Flag } from "@/components/game/Flag";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ContractModal } from "@/components/game/ContractModal";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { formatValue, formatWage } from "@/lib/playerValue";
import type { Player, TransferOffer } from "@/types/game";

export default function TransfersPage() {
  return (
    <AppShell>
      <TransfersInner />
    </AppShell>
  );
}

function TransfersInner() {
  const players = useGame((s) => s.db?.players ?? {});
  const clubs = useGame((s) => s.db?.clubs ?? {});
  const career = useGame((s) => s.career);
  const userClub = useGame((s) => s.getUserClub)();
  const userPlayers = useGame((s) => s.getUserPlayers)();
  const acceptTransferOffer = useGame((s) => s.acceptTransferOffer);
  const rejectTransferOffer = useGame((s) => s.rejectTransferOffer);
  const counterTransferOffer = useGame((s) => s.counterTransferOffer);

  const [contractModal, setContractModal] = useState<
    { playerId: string; mode: "renew" | "list" } | null
  >(null);
  const contractPlayer = contractModal ? players[contractModal.playerId] : null;

  const pendingOffers = useMemo(
    () =>
      (career?.pendingOffers ?? [])
        .filter((o) => o.status === "pending")
        .sort((a, b) => b.amount - a.amount),
    [career?.pendingOffers],
  );

  const listed = useMemo(
    () => userPlayers.filter((p) => p.transferListed),
    [userPlayers],
  );

  const expiring = useMemo(
    () =>
      [...userPlayers]
        .filter((p) => p.contractYears <= 1)
        .sort((a, b) => a.contractYears - b.contractYears || b.overall - a.overall),
    [userPlayers],
  );

  return (
    <div className="space-y-3">
      {/* ============ INCOMING OFFERS ============ */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center justify-between">
          <span>Incoming Offers</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {pendingOffers.length} live
          </span>
        </div>
        {pendingOffers.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-8 px-4 text-center">
            <div className="text-[color:var(--ss-accent)] scoreboard text-base mb-2">
              No offers right now
            </div>
            <div className="text-[12px] text-white/80 max-w-md mx-auto leading-relaxed">
              Bids land here when rival clubs come knocking. List one of your
              players for sale on the squad page to attract more interest.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {pendingOffers.map((offer, i) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                player={players[offer.playerId]}
                bidderName={clubs[offer.fromClubId]?.shortName ?? "Unknown"}
                bidderId={offer.fromClubId}
                idx={i}
                userBudget={userClub?.budget ?? 0}
                onAccept={() => {
                  const player = players[offer.playerId];
                  const result = acceptTransferOffer(offer.id);
                  if (result.ok && player) {
                    toast(
                      `${player.lastName} sold for ${formatValue(offer.amount)}`,
                      "success",
                    );
                  }
                }}
                onReject={() => {
                  rejectTransferOffer(offer.id);
                  toast("Offer rejected", "info");
                }}
                onCounter={(amount) => {
                  const result = counterTransferOffer(offer.id, amount);
                  if (result.ok && result.accepted) {
                    toast(
                      `Counter accepted at ${formatValue(amount)} — head back to accept the offer`,
                      "success",
                    );
                  } else if (result.ok) {
                    toast("Buyer walked away", "warn");
                  } else {
                    toast("Could not submit counter", "warn");
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ============ ON THE BLOCK ============ */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center justify-between">
          <span>On the Block</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {listed.length} listed
          </span>
        </div>
        {listed.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-6 px-4 text-center text-[12px] text-white/80 leading-relaxed">
            No players currently listed. Click any of your players from the{" "}
            <Link href="/squad" className="text-[color:var(--ss-accent)] underline">
              Squad
            </Link>{" "}
            screen and choose <span className="text-[color:var(--ss-accent)]">Sell</span> to put them on the market.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {listed.map((p, i) => (
              <ListedRow
                key={p.id}
                player={p}
                idx={i}
                onUpdate={() => setContractModal({ playerId: p.id, mode: "list" })}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ============ CONTRACTS EXPIRING ============ */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center justify-between">
          <span>Contracts Expiring</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {expiring.length} player{expiring.length === 1 ? "" : "s"}
          </span>
        </div>
        {expiring.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-6 px-4 text-center text-[12px] text-white/80">
            All contracts have at least 2 years remaining — relax.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {expiring.map((p, i) => (
              <ExpiringRow
                key={p.id}
                player={p}
                idx={i}
                onRenew={() => setContractModal({ playerId: p.id, mode: "renew" })}
              />
            ))}
          </ul>
        )}
      </div>

      {contractModal && contractPlayer && (
        <ContractModal
          player={contractPlayer}
          mode={contractModal.mode}
          onClose={() => setContractModal(null)}
        />
      )}
    </div>
  );
}

// =====================================================================
// ROWS
// =====================================================================

function OfferRow({
  offer,
  player,
  bidderName,
  bidderId,
  idx,
  onAccept,
  onReject,
  onCounter,
}: {
  offer: TransferOffer;
  player?: Player;
  bidderName: string;
  bidderId: string;
  idx: number;
  userBudget: number;
  onAccept: () => void;
  onReject: () => void;
  onCounter: (amount: number) => void;
}) {
  const [counterMode, setCounterMode] = useState(false);
  const [counterAmount, setCounterAmount] = useState(Math.round(offer.amount * 1.2));
  const clubs = useGame((s) => s.db?.clubs ?? {});
  const bidder = clubs[bidderId];

  if (!player) {
    return (
      <li
        className="px-3 py-2 text-[12px] text-[color:var(--muted)]"
        style={{ background: idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
      >
        Offer for unknown player · expired
      </li>
    );
  }

  return (
    <li
      className="grid grid-cols-1 sm:grid-cols-[44px_1fr_140px_120px] items-stretch text-white text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{ background: idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
    >
      <span className="hidden sm:flex px-2 py-2 items-center justify-center">
        <PlayerAvatar playerId={player.id} width={32} />
      </span>
      <div className="px-3 py-2 flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-2 truncate">
          <span>{player.firstName} {player.lastName}</span>
          {player.transferListed && (
            <span className="bg-[color:var(--ss-accent)] text-black text-[9px] px-1">
              LISTED
            </span>
          )}
        </div>
        <div className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1">
          <Flag nationalityId={player.nationality} width={14} />
          <span>
            {player.age}Y · {player.detailedPosition} · OVR {player.overall}
          </span>
        </div>
      </div>
      <div className="hidden sm:flex px-2 py-2 items-center gap-2 min-w-0">
        {bidder && <TeamCrest club={bidder} size={22} />}
        <span className="truncate text-[11px]">{bidderName}</span>
      </div>
      <div className="hidden sm:flex px-2 py-2 flex-col items-end justify-center ss-stat">
        <span className="text-[9px] opacity-70">OFFER</span>
        <span className="scoreboard text-[14px] text-[color:var(--ss-accent)]">
          {formatValue(offer.amount)}
        </span>
        <span className="text-[8px] opacity-70 mt-0.5">
          expires W{offer.expiresWeek}
        </span>
      </div>

      <div className="sm:col-span-4 border-t border-[color:var(--ss-bg-deep)] p-2">
        {counterMode ? (
          <div className="space-y-2">
            <div>
              <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em]">
                <span className="text-[color:var(--ss-cream)]">Counter Asking</span>
                <span className="scoreboard text-[14px] text-[color:var(--ss-accent)]">
                  {formatValue(counterAmount)}
                </span>
              </div>
              <input
                type="range"
                min={Math.round(offer.amount * 1.05)}
                max={Math.round(offer.amount * 2.5)}
                step={Math.max(50_000, Math.round(offer.amount / 100))}
                value={counterAmount}
                onChange={(e) => setCounterAmount(Number(e.target.value))}
                className="w-full mt-1 accent-[color:var(--ss-accent)]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCounterMode(false)}
                className="btn btn-exit !rounded-none flex-1 text-[10px] px-2 py-1.5"
              >
                Back
              </button>
              <button
                onClick={() => {
                  onCounter(counterAmount);
                  setCounterMode(false);
                }}
                className="btn btn-stat !rounded-none flex-1 text-[10px] px-2 py-1.5"
              >
                ▸ Demand {formatValue(counterAmount)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={onAccept}
              className="btn btn-stat !rounded-none text-[10px] px-2 py-1.5"
            >
              ▸ Accept · {formatValue(offer.amount)}
            </button>
            <button
              onClick={() => setCounterMode(true)}
              className="btn btn-action !rounded-none text-[10px] px-2 py-1.5"
            >
              Counter
            </button>
            <button
              onClick={onReject}
              className="btn btn-exit !rounded-none text-[10px] px-2 py-1.5"
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function ListedRow({
  player,
  idx,
  onUpdate,
}: {
  player: Player;
  idx: number;
  onUpdate: () => void;
}) {
  return (
    <li
      className="grid grid-cols-[40px_1fr_70px_88px] items-stretch text-white text-[12px] font-bold uppercase tracking-[0.04em]"
      style={{ background: idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
    >
      <span className="px-1 py-2 flex items-center justify-center">
        <PlayerAvatar playerId={player.id} width={28} />
      </span>
      <div className="px-2 py-2 flex flex-col justify-center min-w-0">
        <div className="truncate">{player.firstName} {player.lastName}</div>
        <div className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1">
          <Flag nationalityId={player.nationality} width={14} />
          <span>
            {player.age}Y · {player.detailedPosition} · OVR {player.overall} · {formatWage(player.wage)}
          </span>
        </div>
      </div>
      <div className="px-1 py-2 flex flex-col items-end justify-center ss-stat">
        <span className="text-[9px] opacity-70">ASKING</span>
        <span className="scoreboard text-[14px] text-[color:var(--ss-accent)]">
          {formatValue(player.askingPrice ?? 0)}
        </span>
      </div>
      <button
        onClick={onUpdate}
        className="btn btn-stat !rounded-none text-[10px] px-2"
      >
        Manage
      </button>
    </li>
  );
}

function ExpiringRow({
  player,
  idx,
  onRenew,
}: {
  player: Player;
  idx: number;
  onRenew: () => void;
}) {
  const isExpiringNow = player.contractYears <= 1;
  return (
    <li
      className="grid grid-cols-[40px_1fr_70px_88px] items-stretch text-white text-[12px] font-bold uppercase tracking-[0.04em]"
      style={{ background: idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
    >
      <span className="px-1 py-2 flex items-center justify-center">
        <PlayerAvatar playerId={player.id} width={28} />
      </span>
      <div className="px-2 py-2 flex flex-col justify-center min-w-0">
        <div className="truncate flex items-center gap-2">
          <span>{player.firstName} {player.lastName}</span>
          {isExpiringNow && (
            <span className="bg-red-600 text-white text-[9px] px-1">
              {player.contractYears === 0 ? "EXPIRED" : "1 YEAR LEFT"}
            </span>
          )}
        </div>
        <div className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1">
          <Flag nationalityId={player.nationality} width={14} />
          <span>
            {player.age}Y · {player.detailedPosition} · OVR {player.overall} · {formatWage(player.wage)}
          </span>
        </div>
      </div>
      <div className="px-1 py-2 flex flex-col items-end justify-center ss-stat">
        <span className="text-[9px] opacity-70">REMAINING</span>
        <span
          className="scoreboard text-[14px]"
          style={{ color: isExpiringNow ? "#FF8585" : "var(--ss-accent)" }}
        >
          {player.contractYears}y
        </span>
      </div>
      <button
        onClick={onRenew}
        className="btn btn-stat !rounded-none text-[10px] px-2"
      >
        Renew
      </button>
    </li>
  );
}
