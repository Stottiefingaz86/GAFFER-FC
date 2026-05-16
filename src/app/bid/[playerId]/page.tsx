"use client";

// =====================================================================
// Bid scene — `/bid/[playerId]`.
//
// Three-step transfer dance:
//   1. SLIDER — set your bid amount (capped by budget). Live preview
//      of asking price + budget after the deal.
//   2. RESPONSE — selling club replies (accept · counter · reject).
//      "Hot prospect" / "established star" / "veteran" reasons drive
//      the asking-price multiplier in the bid engine.
//   3. RESOLVE — accept counter, raise bid again, or walk away.
//
// On accept the player + money actually move clubs (handled by
// gameStore.completeTransfer) and the user is sent back to the
// player's new club page.
// =====================================================================

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Flag } from "@/components/game/Flag";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { formatValue } from "@/lib/playerValue";
import { nationalityLabel } from "@/data/nationalityFlags";
import {
  evaluateBid,
  roundOffer,
  suggestStartingBid,
  type BidResponse,
} from "@/engine/bidEngine";

export default function BidPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = use(params);
  return (
    <AppShell>
      <BidInner playerId={playerId} />
    </AppShell>
  );
}

function BidInner({ playerId }: { playerId: string }) {
  const router = useRouter();
  const db = useGame((s) => s.db);
  const career = useGame((s) => s.career);
  const completeTransfer = useGame((s) => s.completeTransfer);

  const player = db?.players[playerId] ?? null;
  const buyer = db && career ? db.clubs[career.selectedClubId] : null;
  const seller = db && player ? db.clubs[player.clubId] : null;

  // Suggested defaults — runs only when player/seller/buyer are present.
  const initial = useMemo(() => {
    if (!player || !seller || !buyer) return null;
    return suggestStartingBid(player, seller, buyer);
  }, [player, seller, buyer]);

  const [amount, setAmount] = useState<number>(initial?.suggested ?? 0);
  const [response, setResponse] = useState<BidResponse | null>(null);
  const [transferred, setTransferred] = useState<boolean>(false);

  // Keep amount in sync the first time `initial` resolves.
  if (initial && amount === 0 && !response) {
    setAmount(initial.suggested);
  }

  // ---- Guards ----
  if (!db || !career) return null;
  if (!player || !seller || !buyer) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base">Bid · Player Not Found</div>
        <div className="px-4 py-6 text-sm text-[color:var(--muted)] text-center uppercase tracking-[0.12em]">
          We couldn&apos;t find that player.
        </div>
        <Link
          href="/dashboard"
          className="btn btn-action !rounded-none w-full h-11 border-0"
        >
          ▸ Back to dashboard
        </Link>
      </div>
    );
  }
  if (player.clubId === buyer.id) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base">Bid · Already Yours</div>
        <div className="px-4 py-6 text-sm text-[color:var(--muted)] text-center uppercase tracking-[0.12em]">
          {player.lastName} already plays for you.
        </div>
        <Link
          href="/squad"
          className="btn btn-action !rounded-none w-full h-11 border-0"
        >
          ▸ View squad
        </Link>
      </div>
    );
  }

  // initial is guaranteed here (player/seller/buyer all defined)
  const min = initial!.min;
  const max = initial!.max;
  const asking = initial!.asking;

  const bidPct = Math.round((amount / asking) * 100);
  const overBudget = amount > buyer.budget;
  const budgetAfter = buyer.budget - amount;

  // ---- Actions ----
  const submitBid = () => {
    const ev = evaluateBid({ player, seller, buyer, amount: roundOffer(amount) });
    setResponse(ev);
  };

  const acceptCounter = () => {
    if (!response || response.status !== "countered" || !response.counterAmount) return;
    if (response.counterAmount > buyer.budget) {
      toast("Counter exceeds your budget", "warn");
      return;
    }
    const ok = completeTransfer(player.id, response.counterAmount);
    if (!ok) {
      toast("Transfer failed — check your budget", "warn");
      return;
    }
    toast(`${player.lastName} signed for ${formatValue(response.counterAmount)}`, "success");
    setTransferred(true);
  };

  const acceptDirect = () => {
    if (!response || response.status !== "accepted") return;
    if (amount > buyer.budget) {
      toast("Bid exceeds your budget", "warn");
      return;
    }
    const ok = completeTransfer(player.id, amount);
    if (!ok) {
      toast("Transfer failed — check your budget", "warn");
      return;
    }
    toast(`${player.lastName} signed for ${formatValue(amount)}`, "success");
    setTransferred(true);
  };

  const reviseBid = () => {
    // Pre-fill the slider with the counter as the new starting point —
    // the user can decide to match, beat, or undercut it.
    if (response?.counterAmount) {
      setAmount(roundOffer(response.counterAmount));
    }
    setResponse(null);
  };

  // ---- Render ----
  if (transferred) {
    return (
      <div className="panel overflow-hidden anim-fade-up">
        <div className="panel-bar text-base bg-[color:var(--ss-btn-stat)] !text-white">
          ✓ Transfer Complete
        </div>
        <div className="px-4 py-6 text-center bg-[color:var(--ss-bg-2)] space-y-3">
          <PlayerAvatar playerId={player.id} width={64} className="mx-auto" />
          <div className="text-white font-extrabold text-base uppercase tracking-[0.04em]">
            {player.firstName} {player.lastName}
          </div>
          <div className="text-[12px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Signed for{" "}
            <span className="scoreboard text-[color:var(--ss-accent)]">
              {formatValue(response?.counterAmount ?? amount)}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/80">
            ▸ Joins {buyer.name}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-0">
          <Link
            href="/squad"
            className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-11 text-sm"
          >
            ▸ Squad
          </Link>
          <Link
            href={`/club/${buyer.id}`}
            className="btn btn-stat !rounded-none border-0 h-11 text-sm"
          >
            ▸ My Club
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* HERO — buyer vs seller, with the player in the middle. */}
      <section
        className="panel overflow-hidden team-hero-vs"
        style={{
          ["--team-h" as string]: buyer.badge.primaryColor,
          ["--team-a" as string]: seller.badge.primaryColor,
        }}
      >
        <div className="panel-bar text-sm flex items-center justify-between">
          <span>Make a Bid</span>
          <Link
            href={`/club/${seller.id}`}
            className="text-[10px] tracking-[0.16em] hover:opacity-80"
          >
            ✕ Walk Away
          </Link>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 text-white relative z-[1]">
          {/* Buyer */}
          <ClubLink clubId={buyer.id} className="flex items-center gap-3 min-w-0">
            <TeamCrest club={buyer} size={48} />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Buyer</div>
              <div className="font-extrabold uppercase tracking-[0.04em] truncate">{buyer.name}</div>
              <div className="scoreboard text-xs text-[color:var(--ss-accent)]">
                Budget {formatValue(buyer.budget)}
              </div>
            </div>
          </ClubLink>

          {/* Player middle */}
          <div className="text-center px-2">
            <PlayerAvatar playerId={player.id} width={56} className="mx-auto" />
            <div className="font-extrabold uppercase tracking-[0.04em] mt-1.5 text-sm truncate">
              {player.lastName.toUpperCase()}
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] opacity-85 flex items-center justify-center gap-1.5 mt-0.5">
              <Flag nationalityId={player.nationality} width={14} />
              <span>{nationalityLabel(player.nationality)}</span>
            </div>
            <div className="scoreboard text-[11px] mt-0.5 text-[color:var(--ss-accent)]">
              {player.detailedPosition} · OVR {player.overall} · POT {player.potential}
            </div>
          </div>

          {/* Seller */}
          <ClubLink clubId={seller.id} className="flex items-center gap-3 min-w-0 justify-end text-right">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Selling Club</div>
              <div className="font-extrabold uppercase tracking-[0.04em] truncate">{seller.name}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] opacity-80">
                REP {seller.reputation}
              </div>
            </div>
            <TeamCrest club={seller} size={48} />
          </ClubLink>
        </div>
      </section>

      {/* RESPONSE — only shown after a bid is submitted */}
      {response && (
        <BidResponseCard
          response={response}
          buyer={buyer}
          onAcceptCounter={acceptCounter}
          onAcceptDirect={acceptDirect}
          onRevise={reviseBid}
          onWalkAway={() => router.push(`/club/${seller.id}`)}
        />
      )}

      {/* SLIDER + budget panel — hidden once we're in "review response" mode */}
      {!response && (
        <>
          <section className="panel overflow-hidden">
            <div className="panel-bar text-sm flex items-center justify-between">
              <span>Your Offer</span>
              <span className="scoreboard text-[color:var(--ss-accent)]">
                {formatValue(amount)}
              </span>
            </div>

            <div className="px-4 py-3 bg-[color:var(--ss-bg-2)] space-y-3">
              {/* Asking-price hint */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Market Value" value={formatValue(player.value)} />
                <Stat
                  label="Asking Price"
                  value={formatValue(asking)}
                  accent
                />
                <Stat label="Your Bid" value={formatValue(amount)} />
              </div>

              {/* Slider */}
              <div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={Math.max(50_000, Math.round((max - min) / 200))}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full accent-[color:var(--ss-accent)]"
                  aria-label="Bid amount"
                />
                <div className="flex justify-between text-[9px] uppercase tracking-[0.14em] text-[color:var(--muted)] mt-1">
                  <span>{formatValue(min)}</span>
                  <span>{bidPct}% of asking</span>
                  <span>{formatValue(max)}</span>
                </div>
              </div>

              {/* Quick presets */}
              <div className="grid grid-cols-4 gap-1">
                {([
                  ["VALUE", player.value],
                  ["95%",   roundOffer(asking * 0.95)],
                  ["MATCH", asking],
                  ["+10%",  roundOffer(asking * 1.1)],
                ] as const).map(([label, v]) => (
                  <button
                    key={label}
                    onClick={() => setAmount(v)}
                    className={`tab justify-center ${
                      Math.abs(amount - v) < 1 ? "active" : ""
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Budget after */}
              <div
                className="px-3 py-2 text-[11px] uppercase tracking-[0.14em] font-extrabold flex items-center justify-between border-2"
                style={{
                  background: overBudget ? "var(--ss-btn-exit)" : "var(--ss-row)",
                  color: overBudget ? "white" : "white",
                  borderColor: overBudget
                    ? "var(--ss-btn-exit)"
                    : "var(--ss-bg-deep)",
                }}
              >
                <span>Budget After</span>
                <span className="scoreboard">
                  {formatValue(Math.max(budgetAfter, 0))}
                  {overBudget && " · OVER!"}
                </span>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-0">
            <Link
              href={`/club/${seller.id}`}
              className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm"
            >
              ✕ Cancel
            </Link>
            <button
              onClick={submitBid}
              disabled={overBudget}
              className="btn btn-stat !rounded-none border-0 h-12 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ▸ Submit Bid · {formatValue(amount)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BidResponseCard({
  response,
  buyer,
  onAcceptCounter,
  onAcceptDirect,
  onRevise,
  onWalkAway,
}: {
  response: BidResponse;
  buyer: { budget: number };
  onAcceptCounter: () => void;
  onAcceptDirect: () => void;
  onRevise: () => void;
  onWalkAway: () => void;
}) {
  const tone =
    response.status === "accepted"
      ? "var(--ss-btn-stat)"
      : response.status === "rejected"
        ? "var(--ss-btn-exit)"
        : "var(--ss-accent)";
  const fg = response.status === "countered" ? "#0E0830" : "#FFFFFF";

  const counterAffordable =
    response.status === "countered" &&
    !!response.counterAmount &&
    response.counterAmount <= buyer.budget;

  const reasonLabel: Record<string, string> = {
    hot_prospect: "HOT PROSPECT · 2× value asking",
    established_star: "ESTABLISHED STAR · premium asking",
    core_starter: "CORE STARTER",
    veteran: "AGING VETERAN · willing to sell",
    fringe: "FRINGE PLAYER",
    out_of_our_league: "REPUTATION GAP",
    insulted: "INSULTED",
    match: "FAIR MATCH",
  };

  return (
    <section className="panel overflow-hidden anim-fade-up">
      <div
        className="px-3 py-2 font-extrabold uppercase tracking-[0.18em] text-base"
        style={{ background: tone, color: fg }}
      >
        {response.headline}
      </div>
      <div className="px-4 py-3 bg-[color:var(--ss-bg-2)] space-y-2">
        <div className="text-[12px] text-white tracking-[0.04em]">
          {response.body}
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.14em] font-extrabold">
          <span
            className="px-2 py-0.5"
            style={{
              background: "var(--ss-row-2)",
              color: "white",
              fontFamily: "var(--font-display)",
            }}
          >
            {reasonLabel[response.reason] ?? response.reason.toUpperCase()}
          </span>
          <span
            className="px-2 py-0.5"
            style={{ background: "var(--ss-row)", color: "white" }}
          >
            ASKING {formatValue(response.askingPrice)}
          </span>
          {response.status === "countered" && response.counterAmount && (
            <span
              className="px-2 py-0.5"
              style={{
                background: "var(--ss-accent)",
                color: "#0E0830",
              }}
            >
              COUNTER {formatValue(response.counterAmount)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0">
        {response.status === "accepted" && (
          <>
            <button
              onClick={onAcceptDirect}
              className="btn btn-stat !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm"
            >
              ✓ Sign Player
            </button>
            <button
              onClick={onWalkAway}
              className="btn btn-info !rounded-none border-0 h-12 text-sm"
            >
              ✕ Walk Away
            </button>
          </>
        )}

        {response.status === "countered" && (
          <>
            <button
              onClick={onAcceptCounter}
              disabled={!counterAffordable}
              className="btn btn-stat !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                counterAffordable
                  ? "Accept the counter and sign the player"
                  : "Counter exceeds your budget"
              }
            >
              ✓ Accept Counter
            </button>
            <button
              onClick={onRevise}
              className="btn btn-action !rounded-none border-0 sm:border-r-2 sm:border-[color:var(--ss-bg-deep)] h-12 text-sm"
            >
              ▸ Revise Bid
            </button>
            <button
              onClick={onWalkAway}
              className="btn btn-info !rounded-none border-0 h-12 text-sm"
            >
              ✕ Walk Away
            </button>
          </>
        )}

        {response.status === "rejected" && (
          <>
            <button
              onClick={onRevise}
              className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm"
            >
              ▸ New Bid
            </button>
            <button
              onClick={onWalkAway}
              className="btn btn-info !rounded-none border-0 h-12 text-sm"
            >
              ✕ Walk Away
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="px-2 py-1.5"
      style={{
        background: accent ? "var(--ss-accent)" : "var(--ss-row-2)",
        color: accent ? "#0E0830" : "white",
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.18em] font-extrabold opacity-85">
        {label}
      </div>
      <div
        className="scoreboard text-[14px]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
    </div>
  );
}
