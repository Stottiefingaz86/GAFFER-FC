"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { formatValue } from "@/lib/playerValue";

export default function InboxPage() {
  return (
    <AppShell>
      <InboxInner />
    </AppShell>
  );
}

function InboxInner() {
  const inbox = useGame((s) => s.db?.inbox ?? []);
  const markRead = useGame((s) => s.markInboxRead);
  const pendingOffers = useGame((s) => s.career?.pendingOffers ?? []);
  const players = useGame((s) => s.db?.players ?? {});
  const clubs = useGame((s) => s.db?.clubs ?? {});
  const acceptTransferOffer = useGame((s) => s.acceptTransferOffer);
  const rejectTransferOffer = useGame((s) => s.rejectTransferOffer);
  const counterTransferOffer = useGame((s) => s.counterTransferOffer);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = inbox.find((m) => m.id === openId) ?? null;
  const unread = inbox.filter((m) => !m.read).length;

  // If the open message is a transfer offer, find the underlying offer
  // record so the user can act on it inline.
  const offer = open && open.category === "Transfer"
    ? pendingOffers.find((o) => `${o.id}_inbox` === open.id) ?? null
    : null;
  const offerPlayer = offer ? players[offer.playerId] : null;
  const offerBidder = offer ? clubs[offer.fromClubId] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
      <aside className="panel overflow-hidden max-h-[80vh] flex flex-col">
        <div className="panel-bar text-base flex items-center justify-between">
          <span>Inbox</span>
          {unread > 0 && (
            <span className="bg-[color:var(--ss-btn-exit)] text-white text-[10px] px-1.5 py-0.5 font-extrabold scoreboard">
              {unread}
            </span>
          )}
        </div>
        <div className="overflow-auto scrollbar-thin flex-1">
          {inbox.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-8 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
              Inbox empty
            </div>
          ) : (
            inbox.map((m, i) => {
              const selected = openId === m.id;
              const bg = selected
                ? "var(--ss-row-sel)"
                : !m.read
                  ? i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)"
                  : "var(--ss-bg-strip)";
              return (
                <button
                  key={m.id}
                  onClick={() => { setOpenId(m.id); markRead(m.id); }}
                  className="w-full text-left px-3 py-2 text-white"
                  style={{
                    background: bg,
                    boxShadow: selected ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase tracking-[0.18em] text-white/75">
                      W{m.week} · {m.category}
                    </span>
                    {!m.read && <span className="size-2 bg-[color:var(--ss-accent)]" />}
                  </div>
                  <div className={`text-[12px] truncate font-bold uppercase tracking-[0.04em] ${!m.read ? "text-white" : "text-white/70"}`}>
                    {m.title}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key={open.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="panel overflow-hidden"
          >
            <div className="panel-bar text-base">
              S{open.season} · W{open.week} · {open.category.toUpperCase()}
            </div>
            <div className="bg-[color:var(--ss-row-bench)] px-5 py-4 text-white">
              <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-[0.04em]">{open.title}</h2>
            </div>
            <div className="bg-[color:var(--ss-bg-2)] p-5 text-sm leading-relaxed whitespace-pre-line text-white">
              {open.body}
            </div>
            {offer && offer.status === "pending" && offerPlayer && offerBidder && (
              <TransferOfferActions
                offerId={offer.id}
                playerName={`${offerPlayer.firstName} ${offerPlayer.lastName}`}
                bidderName={offerBidder.shortName}
                amount={offer.amount}
                onAccept={() => {
                  const result = acceptTransferOffer(offer.id);
                  if (result.ok) {
                    toast(
                      `${offerPlayer.lastName} sold to ${offerBidder.shortName} · ${formatValue(offer.amount)} received`,
                      "success",
                    );
                  } else {
                    toast("Could not complete transfer", "warn");
                  }
                }}
                onReject={() => {
                  rejectTransferOffer(offer.id);
                  toast(`Offer for ${offerPlayer.lastName} rejected`, "info");
                }}
                onCounter={(counterAmount) => {
                  const result = counterTransferOffer(offer.id, counterAmount);
                  if (result.ok && result.accepted) {
                    toast(
                      `${offerBidder.shortName} agreed to ${formatValue(counterAmount)} — accept the new offer to finalise the transfer`,
                      "success",
                    );
                  } else if (result.ok) {
                    toast(
                      `${offerBidder.shortName} walked away — they wouldn't pay ${formatValue(counterAmount)}`,
                      "warn",
                    );
                  } else {
                    toast("Could not submit counter", "warn");
                  }
                }}
              />
            )}
            {offer && offer.status !== "pending" && (
              <div className="bg-[color:var(--ss-bg-deep)] px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-[color:var(--ss-cream)]">
                Offer status: <span className="text-[color:var(--ss-accent)]">{offer.status}</span>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="panel-bar text-base">Message</div>
            <div className="bg-[color:var(--ss-bg-2)] py-12 grid place-items-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
              Select a message
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------
// <TransferOfferActions /> — Accept / Counter / Reject CTA strip shown
// below the inbox body when the open message is a Transfer offer.
// ---------------------------------------------------------------------
function TransferOfferActions({
  offerId,
  playerName,
  bidderName,
  amount,
  onAccept,
  onReject,
  onCounter,
}: {
  offerId: string;
  playerName: string;
  bidderName: string;
  amount: number;
  onAccept: () => void;
  onReject: () => void;
  onCounter: (counterAmount: number) => void;
}) {
  const [counterMode, setCounterMode] = useState(false);
  const [counterAmount, setCounterAmount] = useState(
    Math.round(amount * 1.2),
  );
  return (
    <div
      className="bg-[color:var(--ss-bg-deep)] border-t border-[color:var(--ss-bar-edge)] p-4 space-y-3"
      key={offerId}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-accent)]">
        Decision · {playerName}
      </div>
      {counterMode ? (
        <>
          <div>
            <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em]">
              <span className="text-[color:var(--ss-cream)]">Counter Asking Price</span>
              <span className="scoreboard text-[14px] text-[color:var(--ss-accent)]">
                {formatValue(counterAmount)}
              </span>
            </div>
            <input
              type="range"
              min={Math.round(amount * 1.05)}
              max={Math.round(amount * 2.5)}
              step={Math.max(50_000, Math.round(amount / 100))}
              value={counterAmount}
              onChange={(e) => setCounterAmount(Number(e.target.value))}
              className="w-full mt-1 accent-[color:var(--ss-accent)]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCounterMode(false)}
              className="btn btn-exit !rounded-none flex-1 text-[10px] px-3 py-2"
            >
              Back
            </button>
            <button
              onClick={() => onCounter(counterAmount)}
              className="btn btn-stat !rounded-none flex-1 text-[10px] px-3 py-2"
            >
              ▸ Demand {formatValue(counterAmount)}
            </button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onAccept}
            className="btn btn-stat !rounded-none text-[10px] px-2 py-2"
            title={`Accept ${bidderName}'s offer of ${formatValue(amount)}`}
          >
            ▸ Accept · {formatValue(amount)}
          </button>
          <button
            onClick={() => setCounterMode(true)}
            className="btn btn-action !rounded-none text-[10px] px-2 py-2"
            title="Counter with a higher asking price"
          >
            Counter
          </button>
          <button
            onClick={onReject}
            className="btn btn-exit !rounded-none text-[10px] px-2 py-2"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
