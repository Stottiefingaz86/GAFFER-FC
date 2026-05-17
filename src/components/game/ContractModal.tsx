"use client";

// =====================================================================
// <ContractModal /> — single component covering three Phase-2 flows:
//
//   • mode="sign"    — sign a free-agent prospect to the user's club
//   • mode="renew"   — extend one of the user's own players
//   • mode="list"    — list one of the user's own players for sale
//
// Each mode shows a different set of sliders/CTAs but reuses the
// same panel chrome so the experience feels consistent and the UI
// budget stays small. The store does the heavy lifting (negotiation,
// budget gates, save persistence) — this is purely presentational.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { Flag } from "@/components/game/Flag";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { formatValue, formatWage } from "@/lib/playerValue";
import {
  defaultFreeAgentTerms,
  defaultRenewalTerms,
  type ContractTerms,
  type NegotiationResponse,
} from "@/engine/contractEngine";
import type { Player } from "@/types/game";

type Mode = "sign" | "renew" | "list";

interface Props {
  player: Player;
  mode: Mode;
  onClose: () => void;
}

export function ContractModal({ player, mode, onClose }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/80 grid place-items-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="panel max-w-lg w-full max-h-[90vh] overflow-auto"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* `key={player.id}` forces a fresh mount per player so the
           *  baseline-terms `useState` initializer reruns — saves an
           *  effect-driven sync hook and keeps the component idempotent. */}
          {mode === "sign" && <SignFlow key={player.id} player={player} onClose={onClose} />}
          {mode === "renew" && <RenewFlow key={player.id} player={player} onClose={onClose} />}
          {mode === "list" && <ListFlow key={player.id} player={player} onClose={onClose} />}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// =====================================================================
// SHARED HEADER — player ID strip
// =====================================================================

function PlayerHeader({ player, kicker }: { player: Player; kicker: string }) {
  return (
    <div
      className="px-4 py-3 grid grid-cols-[48px_1fr] gap-3 items-center"
      style={{ background: "var(--ss-bg-deep)" }}
    >
      <PlayerAvatar playerId={player.id} width={48} />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-accent)]">
          {kicker}
        </div>
        <div className="scoreboard text-[18px] text-white truncate">
          {player.firstName} {player.lastName}
        </div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-white/85 flex items-center gap-1.5 mt-0.5">
          <Flag nationalityId={player.nationality} width={14} />
          <span>
            {player.age}y · {player.detailedPosition} · OVR {player.overall} · POT {player.potential}
          </span>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// SIGN FLOW — free-agent signing
// =====================================================================

function SignFlow({ player, onClose }: { player: Player; onClose: () => void }) {
  const userClub = useGame((s) => s.getUserClub)();
  const signFreeAgent = useGame((s) => s.signFreeAgent);

  const baseline = useMemo(() => defaultFreeAgentTerms(player), [player]);
  const [terms, setTerms] = useState<ContractTerms>(baseline);
  const [response, setResponse] = useState<NegotiationResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const budget = userClub?.budget ?? 0;
  const canAfford = budget >= terms.signingFee;

  const submit = () => {
    setSubmitting(true);
    const result = signFreeAgent(player.id, terms);
    setSubmitting(false);
    if (result.ok) {
      toast(
        `${player.lastName} signed · ${formatValue(terms.signingFee)} fee, ${formatWage(terms.weeklyWage)} wages`,
        "success",
      );
      onClose();
      return;
    }
    if (result.reason === "insufficient") {
      toast("Insufficient budget for the signing fee", "warn");
      return;
    }
    if (result.reason === "rejected" && result.response) {
      setResponse(result.response);
      toast(`${player.lastName} rejected the offer`, "warn");
      return;
    }
    if (result.reason === "countered" && result.response) {
      setResponse(result.response);
      toast(`${player.lastName} countered your offer`, "info");
      return;
    }
    toast("Could not complete signing", "warn");
  };

  const acceptCounter = () => {
    if (!response?.counter) return;
    setTerms(response.counter);
    setResponse(null);
  };

  return (
    <>
      <div className="panel-bar text-base flex items-center justify-between">
        <span>Sign Free Agent</span>
        <button onClick={onClose} className="text-[10px] hover:opacity-80" aria-label="Close">
          ✕
        </button>
      </div>
      <PlayerHeader player={player} kicker="Free Agent · Open to offers" />

      <div className="p-4 space-y-3">
        <SliderRow
          label="Signing Fee"
          value={terms.signingFee}
          min={0}
          max={Math.round(baseline.signingFee * 3)}
          step={500}
          format={formatValue}
          onChange={(n) => {
            setTerms({ ...terms, signingFee: n });
            setResponse(null);
          }}
        />
        <SliderRow
          label="Weekly Wage"
          value={terms.weeklyWage}
          min={500}
          max={Math.round(baseline.weeklyWage * 3)}
          step={100}
          format={formatWage}
          onChange={(n) => {
            setTerms({ ...terms, weeklyWage: n });
            setResponse(null);
          }}
        />
        <SliderRow
          label="Contract Length"
          value={terms.contractYears}
          min={1}
          max={5}
          step={1}
          format={(n) => `${n} year${n === 1 ? "" : "s"}`}
          onChange={(n) => {
            setTerms({ ...terms, contractYears: n });
            setResponse(null);
          }}
        />

        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] uppercase tracking-[0.14em]">
          <Stat label="Total Wages (yr)" v={formatValue(terms.weeklyWage * 52)} />
          <Stat label="Club Budget" v={formatValue(budget)} alt={!canAfford} />
        </div>

        {response && (
          <NegotiationFeedback
            response={response}
            onAcceptCounter={acceptCounter}
          />
        )}

        <div className="flex gap-2 pt-2 border-t border-[color:var(--ss-bar-edge)]">
          <button
            onClick={onClose}
            className="btn btn-exit !rounded-none flex-1 text-[10px] px-3 py-2"
          >
            Walk Away
          </button>
          <button
            onClick={submit}
            disabled={submitting || !canAfford}
            className="btn btn-stat !rounded-none flex-1 text-[10px] px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Negotiating…" : `▸ Submit Offer · ${formatValue(terms.signingFee)}`}
          </button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// RENEW FLOW — contract extension for own players
// =====================================================================

function RenewFlow({ player, onClose }: { player: Player; onClose: () => void }) {
  const renewContract = useGame((s) => s.renewContract);

  const baseline = useMemo(() => defaultRenewalTerms(player), [player]);
  const [terms, setTerms] = useState<ContractTerms>(baseline);
  const [response, setResponse] = useState<NegotiationResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    setSubmitting(true);
    const result = renewContract(player.id, terms);
    setSubmitting(false);
    if (result.ok) {
      toast(
        `${player.lastName} re-signed · ${formatWage(terms.weeklyWage)} for ${terms.contractYears} years`,
        "success",
      );
      onClose();
      return;
    }
    if (result.reason === "rejected" && result.response) {
      setResponse(result.response);
      toast(`${player.lastName} rejected the offer`, "warn");
      return;
    }
    if (result.reason === "countered" && result.response) {
      setResponse(result.response);
      toast(`${player.lastName} countered`, "info");
      return;
    }
    toast("Could not renew contract", "warn");
  };

  const acceptCounter = () => {
    if (!response?.counter) return;
    setTerms(response.counter);
    setResponse(null);
  };

  return (
    <>
      <div className="panel-bar text-base flex items-center justify-between">
        <span>Renew Contract</span>
        <button onClick={onClose} className="text-[10px] hover:opacity-80" aria-label="Close">
          ✕
        </button>
      </div>
      <PlayerHeader
        player={player}
        kicker={`Current · ${formatWage(player.wage)} · ${player.contractYears}y left`}
      />

      <div className="p-4 space-y-3">
        <SliderRow
          label="New Weekly Wage"
          value={terms.weeklyWage}
          min={Math.round(player.wage * 0.5)}
          max={Math.round(baseline.weeklyWage * 2.5)}
          step={100}
          format={formatWage}
          onChange={(n) => {
            setTerms({ ...terms, weeklyWage: n });
            setResponse(null);
          }}
        />
        <SliderRow
          label="Contract Length"
          value={terms.contractYears}
          min={1}
          max={5}
          step={1}
          format={(n) => `${n} year${n === 1 ? "" : "s"}`}
          onChange={(n) => {
            setTerms({ ...terms, contractYears: n });
            setResponse(null);
          }}
        />

        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] uppercase tracking-[0.14em]">
          <Stat
            label="Wage Δ"
            v={`${terms.weeklyWage > player.wage ? "+" : ""}${formatWage(terms.weeklyWage - player.wage)}`}
          />
          <Stat
            label="Total Wages (yr)"
            v={formatValue(terms.weeklyWage * 52)}
            alt
          />
        </div>

        {response && (
          <NegotiationFeedback
            response={response}
            onAcceptCounter={acceptCounter}
          />
        )}

        <div className="flex gap-2 pt-2 border-t border-[color:var(--ss-bar-edge)]">
          <button
            onClick={onClose}
            className="btn btn-exit !rounded-none flex-1 text-[10px] px-3 py-2"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="btn btn-stat !rounded-none flex-1 text-[10px] px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Negotiating…" : "▸ Offer Contract"}
          </button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// LIST FLOW — transfer-list one of the user's players
// =====================================================================

function ListFlow({ player, onClose }: { player: Player; onClose: () => void }) {
  const listPlayerForSale = useGame((s) => s.listPlayerForSale);
  const unlistPlayerForSale = useGame((s) => s.unlistPlayerForSale);
  const releasePlayer = useGame((s) => s.releasePlayer);

  const isAlreadyListed = !!player.transferListed;
  const initialPrice = player.askingPrice ?? Math.round(player.value * 1.2);
  const [askingPrice, setAskingPrice] = useState(initialPrice);

  const submit = () => {
    listPlayerForSale(player.id, askingPrice);
    toast(
      `${player.lastName} listed for sale · asking ${formatValue(askingPrice)}`,
      "success",
    );
    onClose();
  };

  const unlist = () => {
    unlistPlayerForSale(player.id);
    toast(`${player.lastName} removed from transfer list`, "info");
    onClose();
  };

  const release = () => {
    const ok = window.confirm(
      `Release ${player.firstName} ${player.lastName}? You'll pay severance equal to half his remaining wage commitment.`,
    );
    if (!ok) return;
    const result = releasePlayer(player.id);
    if (result.ok) {
      toast(
        `${player.lastName} released · ${formatValue(result.severance)} severance paid`,
        "success",
      );
      onClose();
    } else {
      toast(
        `Need ${formatValue(result.severance)} for severance`,
        "warn",
      );
    }
  };

  return (
    <>
      <div className="panel-bar text-base flex items-center justify-between">
        <span>{isAlreadyListed ? "Transfer Listing" : "List for Sale"}</span>
        <button onClick={onClose} className="text-[10px] hover:opacity-80" aria-label="Close">
          ✕
        </button>
      </div>
      <PlayerHeader
        player={player}
        kicker={
          isAlreadyListed
            ? `Listed · asking ${formatValue(player.askingPrice ?? 0)}`
            : `Market value · ${formatValue(player.value)}`
        }
      />

      <div className="p-4 space-y-3">
        <SliderRow
          label="Asking Price"
          value={askingPrice}
          min={Math.round(player.value * 0.4)}
          max={Math.round(player.value * 3)}
          step={Math.max(50_000, Math.round(player.value / 100))}
          format={formatValue}
          onChange={setAskingPrice}
        />

        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] uppercase tracking-[0.14em]">
          <Stat label="Market Value" v={formatValue(player.value)} />
          <Stat label="Wage Saved" v={formatWage(player.wage)} alt />
        </div>

        <div className="bg-[color:var(--ss-bg-2)] border-l-2 border-[color:var(--ss-accent)] px-3 py-2 text-[11px] text-white/85 leading-relaxed">
          Listed players attract bids from rival clubs over the next few weeks.
          Offers land in your <span className="text-[color:var(--ss-accent)]">Transfers</span>{" "}
          screen and as inbox messages. You can <strong>accept</strong>,{" "}
          <strong>counter</strong>, or <strong>reject</strong> each one.
        </div>

        <div className="flex gap-2 pt-2 border-t border-[color:var(--ss-bar-edge)]">
          {isAlreadyListed ? (
            <>
              <button
                onClick={unlist}
                className="btn btn-exit !rounded-none flex-1 text-[10px] px-3 py-2"
              >
                ✕ Unlist
              </button>
              <button
                onClick={submit}
                className="btn btn-stat !rounded-none flex-1 text-[10px] px-3 py-2"
              >
                ▸ Update Asking Price
              </button>
            </>
          ) : (
            <>
              <button
                onClick={release}
                className="btn btn-exit !rounded-none flex-1 text-[10px] px-3 py-2"
                title="Cancel his contract — pay severance, no fee received"
              >
                Release
              </button>
              <button
                onClick={submit}
                className="btn btn-stat !rounded-none flex-1 text-[10px] px-3 py-2"
              >
                ▸ List for {formatValue(askingPrice)}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// =====================================================================
// SHARED PRIMITIVES
// =====================================================================

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.16em]">
        <span className="text-[color:var(--ss-cream)]">{label}</span>
        <span className="scoreboard text-[14px] text-[color:var(--ss-accent)]">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-[color:var(--ss-accent)]"
      />
    </div>
  );
}

function Stat({ label, v, alt }: { label: string; v: string; alt?: boolean }) {
  return (
    <div
      className="px-3 py-2"
      style={{ background: alt ? "var(--ss-row-2)" : "var(--ss-row)" }}
    >
      <div className="text-[color:var(--muted)] text-[9px]">{label}</div>
      <div className="scoreboard text-[14px] text-white">{v}</div>
    </div>
  );
}

function NegotiationFeedback({
  response,
  onAcceptCounter,
}: {
  response: NegotiationResponse;
  onAcceptCounter: () => void;
}) {
  const isCounter = response.decision === "counter";
  return (
    <div
      className="px-3 py-2 border-l-2"
      style={{
        background: "var(--ss-bg-2)",
        borderColor: isCounter ? "var(--ss-accent)" : "var(--ss-warning, #f87171)",
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-accent)]">
        {response.headline}
      </div>
      <div className="text-[12px] text-white/85 mt-1 leading-relaxed">
        {response.body}
      </div>
      {isCounter && response.counter && (
        <button
          onClick={onAcceptCounter}
          className="btn btn-stat !rounded-none mt-2 text-[10px] px-3 py-1.5"
        >
          ▸ Accept Counter
        </button>
      )}
    </div>
  );
}
