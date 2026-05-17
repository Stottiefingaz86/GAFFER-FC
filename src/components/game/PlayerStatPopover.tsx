"use client";

// =====================================================================
// <PlayerStatPopover /> — compact stat pop-up for the tactics screen.
//
// Lighter-weight than the full <PlayerProfile />; just the headline
// numbers a manager wants while clicking around the pitch:
//   - Avatar, name, age, OVR, nationality flag
//   - Form / Fitness / Morale bars
//   - Position chips (slot vs natural)
//   - Top six attributes (filtered by position so a CB sees defending
//     stats, an ST sees shooting/pace, a GK sees goalkeeping, etc.)
//   - Quick action buttons (View Profile, Bench, Captain, Drop)
//
// Renders as a floating panel anchored to the player's pitch token via
// its `anchor` prop (DOMRect from the click target).
// =====================================================================

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { DetailedPosition, Player } from "@/types/game";
import { Flag } from "@/components/game/Flag";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { AnimatedBar } from "@/components/game/AnimatedBar";
import { nationalityLabel } from "@/data/nationalityFlags";
import { formatValue } from "@/lib/playerValue";

interface Props {
  player: Player;
  /** Anchor rect (e.g. pitch token's getBoundingClientRect()). */
  anchor: DOMRect | null;
  /** Slot the player currently occupies (e.g. "AM"). Optional. */
  slotPosition?: DetailedPosition;
  isCaptain?: boolean;
  /** Has the user's scouting network filed a report on this player?
   * When false, the form/fitness/morale bars and per-position attribute
   * grid are replaced by a "Send Scout" prompt — the user only sees
   * what's public knowledge (name, age, position, nationality, club).
   * Defaults to true to keep existing call sites working. */
  isScouted?: boolean;
  /** Fired when the user clicks the "Send Scout" CTA. Only relevant
   * when `isScouted` is false. */
  onSendScout?: () => void;
  /** £ cost to scout this player. Optional — when supplied we surface
   * it inline so the user knows what they're spending. */
  scoutCost?: number;
  /** False when the user's club can't afford the scout fee. */
  canAffordScout?: boolean;
  onClose: () => void;
  onViewFullProfile?: () => void;
  onBench?: () => void;
  onMakeCaptain?: () => void;
  onDrop?: () => void;
  /** Only set for players who do NOT play for the user's club; opens
   * the bid scene for this player. */
  onMakeBid?: () => void;
}

type AttrKey =
  | "pace"
  | "shooting"
  | "passing"
  | "tackling"
  | "stamina"
  | "technique"
  | "strength"
  | "mentality"
  | "goalkeeping";

const ATTR_LABEL: Record<AttrKey, string> = {
  pace: "PACE",
  shooting: "SHT",
  passing: "PAS",
  tackling: "TKL",
  stamina: "STA",
  technique: "TEC",
  strength: "STR",
  mentality: "MEN",
  goalkeeping: "GK",
};

/** Pick the six most relevant attributes for a position so the popover
 * always shows useful numbers. */
function attrsForPosition(pos: DetailedPosition): AttrKey[] {
  switch (pos) {
    case "GK":
      return ["goalkeeping", "mentality", "strength", "tackling", "passing", "stamina"];
    case "CB":
      return ["tackling", "strength", "mentality", "passing", "stamina", "pace"];
    case "LB":
    case "RB":
      return ["pace", "tackling", "stamina", "passing", "technique", "mentality"];
    case "DM":
      return ["tackling", "passing", "stamina", "mentality", "technique", "pace"];
    case "CM":
      return ["passing", "stamina", "technique", "mentality", "tackling", "pace"];
    case "AM":
      return ["passing", "technique", "shooting", "mentality", "pace", "stamina"];
    case "LM":
    case "RM":
      return ["pace", "passing", "stamina", "technique", "shooting", "mentality"];
    case "LW":
    case "RW":
      return ["pace", "technique", "shooting", "passing", "stamina", "mentality"];
    case "ST":
    case "CF":
      return ["shooting", "pace", "strength", "technique", "mentality", "stamina"];
  }
}

export function PlayerStatPopover({
  player,
  anchor,
  slotPosition,
  isCaptain,
  isScouted = true,
  onSendScout,
  scoutCost,
  canAffordScout = true,
  onClose,
  onViewFullProfile,
  onBench,
  onMakeCaptain,
  onDrop,
  onMakeBid,
}: Props) {
  // ESC closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Guard SSR — `document` only exists in the browser.
  if (typeof document === "undefined") return null;

  // Position the popover next to the anchor. Falls back to centre of
  // viewport if no anchor is provided (e.g. opened from a list row).
  const popWidth = 320;
  const popPad = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = vw / 2 - popWidth / 2;
  let top = vh / 2 - 200;
  if (anchor) {
    // Try to place to the right of the anchor; if it overflows, place left.
    const wantsLeft = anchor.right + popPad + popWidth > vw;
    left = wantsLeft
      ? Math.max(8, anchor.left - popPad - popWidth)
      : anchor.right + popPad;
    // Vertically centre the popover on the token, clamped within viewport.
    top = Math.min(
      vh - 24,
      Math.max(8, anchor.top + anchor.height / 2 - 180),
    );
  }

  const detailedPos = player.detailedPosition;
  const attrs = attrsForPosition(detailedPos);
  const isOOP = !!slotPosition && player.detailedPosition !== slotPosition;
  const nationality = nationalityLabel(player.nationality);

  // Fixed full-viewport overlay catches outside-clicks; portal so we
  // escape any clipping from `overflow-hidden` parent panels.
  return createPortal(
    <div
      className="fixed inset-0 z-50"
      style={{ background: "rgba(8,4,32,0.55)" }}
      onClick={onClose}
      role="dialog"
      aria-label={`${player.firstName} ${player.lastName} quick stats`}
    >
      <div
        className="absolute panel overflow-hidden anim-fade-up"
        style={{
          left,
          top,
          width: popWidth,
          maxHeight: "calc(100vh - 16px)",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 2px var(--ss-accent)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: name + ✕ */}
        <div className="panel-bar text-sm flex items-center justify-between">
          <span className="truncate">
            {player.lastName.toUpperCase()}
            {isCaptain && (
              <span className="ml-2 bg-[color:var(--ss-accent)] text-black border border-black/40 px-1 text-[10px] align-middle">
                C
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            className="text-[10px] font-extrabold tracking-[0.16em] hover:opacity-80"
            title="Close (ESC)"
            aria-label="Close popover"
          >
            ✕
          </button>
        </div>

        {/* Hero row: avatar + name + OVR */}
        <div className="flex items-stretch bg-[color:var(--ss-row)]">
          <PlayerAvatar playerId={player.id} width={64} />
          <div className="flex-1 px-3 py-2 flex flex-col justify-center min-w-0">
            <div className="text-white font-extrabold tracking-[0.04em] text-[14px] truncate">
              {player.firstName.toUpperCase()} {player.lastName.toUpperCase()}
            </div>
            <div className="text-[color:var(--muted)] text-[10px] uppercase tracking-[0.14em] flex items-center gap-1.5 mt-0.5">
              <Flag nationalityId={player.nationality} width={18} />
              <span className="truncate">{nationality}</span>
            </div>
            <div className="text-[10px] text-white/85 uppercase tracking-[0.06em] mt-1">
              {isScouted
                ? `AGE ${player.age} · ${player.preferredFoot.toUpperCase()} FOOT · ${player.height}cm`
                : `AGE ${player.age} · UNSCOUTED`}
            </div>
          </div>
          <div
            className="px-3 grid place-items-center scoreboard text-[26px] text-[color:var(--ss-accent)]"
            style={{ background: "var(--ss-bg-deep)" }}
            title={isScouted ? "Overall rating" : "Estimated rating · scout for precise number"}
          >
            {isScouted
              ? player.overall
              : `${Math.floor(player.overall / 10) * 10}+`}
          </div>
        </div>

        {/* Position strip — slot vs natural */}
        <div
          className="grid grid-cols-2 text-[10px] uppercase tracking-[0.14em] font-extrabold border-y-2 border-[color:var(--ss-bg-deep)]"
          style={{ background: "var(--ss-bg-strip)" }}
        >
          <div className="px-2 py-1.5 text-center">
            <div className="text-[8px] text-[color:var(--muted)]">SLOT</div>
            <div className="text-white">{slotPosition ?? "—"}</div>
          </div>
          <div
            className="px-2 py-1.5 text-center border-l border-[color:var(--ss-bg-deep)]"
            style={{
              background: isOOP ? "var(--ss-row-danger)" : undefined,
              color: isOOP ? "white" : "white",
            }}
            title={isOOP ? "Player is out of position" : "Player in natural position"}
          >
            <div className="text-[8px] opacity-70">
              NATURAL{isOOP ? " · OOP" : ""}
            </div>
            <div>{player.detailedPosition}</div>
          </div>
        </div>

        {isScouted ? (
          <>
            {/* Form / Fitness / Morale bars */}
            <div className="px-3 py-2 space-y-1.5 bg-[color:var(--ss-bg-2)]">
              <BarRow label="FORM" value={player.form} />
              <BarRow label="FITNESS" value={player.fitness} />
              <BarRow label="MORALE" value={player.morale} />
            </div>

            {/* Attribute grid */}
            <div className="px-3 py-2 grid grid-cols-3 gap-1 bg-[color:var(--ss-bg-2)] border-t border-[color:var(--ss-bg-deep)]">
              {attrs.slice(0, 6).map((k) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-1 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em]"
                  style={{
                    background: "var(--ss-row-2)",
                    color: "white",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  <span className="text-[color:var(--muted)]">{ATTR_LABEL[k]}</span>
                  <span className="scoreboard text-[12px] text-white">
                    {player[k]}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer: Value + actions */}
            <div className="panel-bar text-[11px] flex items-center justify-between">
              <span>
                VAL <span className="scoreboard text-[color:var(--ss-accent)]">{formatValue(player.value)}</span>
              </span>
              <span className="text-[10px] opacity-75">
                POT <span className="scoreboard">{player.potential}</span>
              </span>
            </div>
          </>
        ) : (
          // ─── UNSCOUTED VIEW ─────────────────────────────────────
          // Replace condition + attributes + footer numbers with a
          // compact scout-prompt block. Action buttons below stay so
          // the user can still navigate to the full profile or open
          // a bid (the bid scene has its own scouting affordance).
          <div className="px-3 py-4 bg-[color:var(--ss-bg-2)] text-center">
            <div className="scoreboard text-[22px] text-[color:var(--ss-accent)] mb-1">
              🔍
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-extrabold text-white">
              No Scout Report
            </div>
            <p className="text-[10px] tracking-[0.04em] text-[color:var(--muted)] mt-1 leading-relaxed">
              Send a scout to reveal attributes,
              <br />
              condition, and valuation.
              {typeof scoutCost === "number" && scoutCost > 0 && (
                <>
                  <br />
                  <span className="text-[color:var(--ss-accent)]">
                    Cost: {formatValue(scoutCost)}
                  </span>
                  {!canAffordScout && (
                    <span className="ml-1 text-[color:var(--ss-btn-exit)]">
                      · over budget
                    </span>
                  )}
                </>
              )}
            </p>
            {onSendScout && (
              <button
                onClick={
                  typeof scoutCost === "number" && scoutCost > 0 && !canAffordScout
                    ? undefined
                    : onSendScout
                }
                disabled={
                  typeof scoutCost === "number" && scoutCost > 0 && !canAffordScout
                }
                className="btn btn-stat mt-3 px-4 h-8 text-[10px] uppercase tracking-[0.16em] disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  typeof scoutCost === "number" && scoutCost > 0 && !canAffordScout
                    ? "Your club can't cover this scouting fee"
                    : typeof scoutCost === "number" && scoutCost > 0
                      ? `Pay ${formatValue(scoutCost)} to scout this player`
                      : "Send a scout to file a report"
                }
              >
                {typeof scoutCost === "number" && scoutCost > 0
                  ? `▸ Scout · ${formatValue(scoutCost)}`
                  : "▸ Send Scout"}
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-0">
          {onViewFullProfile && (
            <button
              onClick={onViewFullProfile}
              className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-9 text-[10px]"
            >
              ▸ Full Profile
            </button>
          )}
          {onMakeBid && (
            <button
              onClick={onMakeBid}
              className="btn btn-stat !rounded-none border-0 h-9 text-[10px]"
              title="Open the bid scene for this player"
            >
              ▸ Make Bid
            </button>
          )}
          {onMakeCaptain && (
            <button
              onClick={onMakeCaptain}
              className={`btn ${isCaptain ? "btn-stat" : "btn-action"} !rounded-none border-0 h-9 text-[10px]`}
              disabled={isCaptain}
              title={isCaptain ? "Already captain" : "Make captain"}
            >
              {isCaptain ? "★ CAPTAIN" : "Make Captain"}
            </button>
          )}
          {onBench && (
            <button
              onClick={onBench}
              className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-9 text-[10px]"
              title="Move out of the starting XI but keep as a named substitute"
            >
              ▼ To Bench
            </button>
          )}
          {onDrop && (
            <button
              onClick={onDrop}
              className="btn btn-exit !rounded-none border-0 h-9 text-[10px]"
              title="Move out of the matchday squad — player is still at the club, just not selected"
            >
              ⇊ To Reserves
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BarRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[9px] text-[color:var(--muted)] uppercase tracking-[0.16em] font-extrabold">
        {label}
      </span>
      <div className="flex-1">
        <AnimatedBar v={value} max={100} />
      </div>
      <span
        className="scoreboard text-[11px] text-white w-7 text-right"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </span>
    </div>
  );
}
