"use client";

import type { Club, Player } from "@/types/game";
import { AnimatedBar } from "@/components/game/AnimatedBar";
import { Flag } from "@/components/game/Flag";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { formatValue } from "@/lib/playerValue";
import { nationalityLabel } from "@/data/nationalityFlags";
import { FREE_AGENT_CLUB_ID } from "@/generators/playerGenerator";
import {
  contractExpiryLabel,
  formatDOB,
  getPlayerTrends,
  type Trend,
} from "@/lib/playerTrend";

interface Props {
  player: Player;
  clubs: Record<string, Club>;
  /** Current career season — used for the contract-expiry label. */
  season: number;
  isCaptain?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  /** Optional close button (renders an ✕ in the header bar). */
  onClose?: () => void;
  /** Whether this is a player on the user's own club. Drives which
   * default actions appear (New Contract / Sell vs Make Bid / Scout). */
  ownPlayer?: boolean;
  /** Has the user's scouting network produced a report on this player?
   * When false, finance / condition / attribute panels are replaced by
   * a "Send Scout" prompt — the user only sees what they could pick up
   * from a programme: name, age, position, nationality, club. Defaults
   * to true so existing callers (your own squad, youth pool, etc.)
   * keep working unchanged. */
  isScouted?: boolean;
  /** Fired when the user clicks the "Send Scout" CTA from inside the
   * profile (only relevant when `isScouted` is false). */
  onSendScout?: () => void;
  /** £ cost to scout this player. Displayed inside the CTA so the user
   * knows what the click will spend before they commit. Optional —
   * legacy callers that haven't been updated yet just show "Send Scout"
   * with no price tag. */
  scoutCost?: number;
  /** False when the user can't afford the scout fee. We still render
   * the CTA so the cost is visible, but greyed-out + unclickable so
   * the user knows it's the budget, not a missing feature. */
  canAffordScout?: boolean;
  /** Action handlers — if absent the corresponding button still renders
   * but is disabled with a "Phase 2" hint, so the user can SEE the
   * action exists even before its system is built. */
  onNewContract?: () => void;
  onSell?: () => void;
  onMakeBid?: () => void;
  onScout?: () => void;
  onSign?: () => void;
  /** Tactics-specific actions — only rendered when supplied. */
  onBench?: () => void;
  onDrop?: () => void;
  onMakeCaptain?: () => void;
  /** Optional row of action buttons rendered at the bottom. If
   * provided, replaces the default contextual action bar entirely. */
  footer?: React.ReactNode;
}

const TREND_LABEL: Record<Trend, string> = {
  up: "▲",
  down: "▼",
  flat: "−",
};

const TREND_COLOR: Record<Trend, string> = {
  up: "var(--ss-btn-stat)",
  down: "var(--ss-btn-exit)",
  flat: "rgba(255,255,255,0.55)",
};

const INTEREST_COPY: Record<string, { label: string; color: string }> = {
  rumour: { label: "RUMOUR", color: "var(--ss-row)" },
  watching: { label: "WATCHING", color: "var(--ss-row-bench)" },
  interested: { label: "INTEREST", color: "var(--ss-accent)" },
  bid: { label: "BID INCOMING", color: "var(--ss-btn-exit)" },
};

export function PlayerProfile({
  player,
  clubs,
  season,
  isCaptain,
  primaryColor,
  secondaryColor,
  onClose,
  ownPlayer,
  isScouted = true,
  onSendScout,
  scoutCost,
  canAffordScout = true,
  onNewContract,
  onSell,
  onMakeBid,
  onScout,
  onSign,
  onBench,
  onDrop,
  onMakeCaptain,
  footer,
}: Props) {
  const trends = getPlayerTrends(player);
  const interest = player.transferInterest ?? [];
  const isFreeAgent = player.clubId === FREE_AGENT_CLUB_ID;
  const nationality = nationalityLabel(player.nationality);
  // Use the same through-dark blend used elsewhere so a player whose
  // club has primary == secondary doesn't render a flat monochrome strip.
  // If a secondary is supplied we lean the midpoint toward it so the
  // gradient has a hint of it, but always resolve back to the deep
  // background colour on the right edge for crisp text contrast.
  const mid = secondaryColor
    ? `color-mix(in srgb, ${primaryColor ?? "var(--ss-row)"} 50%, ${secondaryColor})`
    : `color-mix(in srgb, ${primaryColor ?? "var(--ss-row)"} 70%, var(--ss-bg-deep))`;
  const heroBg = primaryColor
    ? `linear-gradient(110deg, ${primaryColor} 0%, ${mid} 38%, color-mix(in srgb, ${primaryColor} 35%, var(--ss-bg-deep)) 70%, var(--ss-bg-deep) 100%)`
    : "var(--ss-row-bench)";

  // When the player isn't scouted we deliberately reveal less in the
  // hero strip — physical attributes (preferred foot, exact height) are
  // the kind of detail a scout brings back, not match-day knowledge.
  const headLine = isScouted
    ? [
        `${player.age}Y`,
        `${player.preferredFoot}-Footed`,
        `${player.height}cm`,
      ].join(" · ")
    : `${player.age}Y · Unscouted`;

  const secondary =
    player.secondaryPositions.length > 0
      ? player.secondaryPositions.join(" / ")
      : "—";

  // OVR is genuinely unknown until you've watched the player. Round it
  // to a coarse band so the user has *some* signal (a 56 OVR player is
  // clearly not a 90, even at a glance) without giving away the rating.
  // Each band spans ten points and we display the lower edge with a
  // trailing "+" so the user reads it as an inequality, not the number.
  const ovrBand = `${Math.floor(player.overall / 10) * 10}+`;

  return (
    <div className="panel overflow-hidden anim-fade-up">
      {/* Header bar */}
      <div className="panel-bar text-sm flex items-center justify-between">
        <span className="truncate">
          {player.lastName.toUpperCase()}
          {isCaptain && (
            <span className="ml-2 text-[color:var(--ss-bar-text)] bg-[color:var(--ss-accent)] border border-black/40 px-1 text-[10px] align-middle">
              C
            </span>
          )}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[10px] font-extrabold tracking-[0.16em] hover:opacity-80"
            title="Close profile"
            aria-label="Close profile"
          >
            ✕
          </button>
        )}
      </div>

      {/* Hero strip — team-tinted gradient */}
      <div
        className="px-4 py-3 text-white grid grid-cols-[64px_1fr_auto] items-center gap-3"
        style={{ background: heroBg }}
      >
        <div className="relative">
          <PlayerAvatar playerId={player.id} width={64} />
          <span
            className="absolute -bottom-1 -right-1 px-1 py-0.5 scoreboard text-[10px] font-extrabold uppercase"
            style={{
              background: "var(--ss-accent)",
              color: "#0A0A0A",
              border: "1px solid #00000080",
              letterSpacing: "0.04em",
            }}
          >
            {player.detailedPosition}
          </span>
        </div>
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.18em] opacity-90 flex items-center gap-1.5"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            <Flag nationalityId={player.nationality} width={20} />
            <span className="truncate">
              {nationality} · {headLine}
            </span>
          </div>
          <div
            className="text-lg sm:text-xl font-extrabold uppercase tracking-[0.04em] leading-tight truncate"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            {player.firstName} {player.lastName}
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] opacity-90 truncate">
            {isScouted ? (
              <>
                {player.trait} · {player.personality}
                {secondary !== "—" && <> · Also: {secondary}</>}
              </>
            ) : (
              <span className="opacity-75">Detailed report not yet filed</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-[0.18em] opacity-80">
            {isScouted ? "OVR · POT" : "Est. OVR"}
          </div>
          {isScouted ? (
            <>
              <div className="scoreboard text-2xl font-extrabold leading-none text-[color:var(--ss-accent)] flex items-center justify-end gap-1.5">
                {player.overall}
                <span style={{ color: TREND_COLOR[trends.overall] }} title={`Overall trending ${trends.overall}`}>
                  {TREND_LABEL[trends.overall]}
                </span>
              </div>
              <div className="text-[10px] scoreboard mt-0.5 opacity-90">
                → {player.potential}
              </div>
            </>
          ) : (
            <>
              <div
                className="scoreboard text-2xl font-extrabold leading-none text-white/80"
                title="Send a scout for a precise rating"
              >
                {ovrBand}
              </div>
              <div className="text-[10px] scoreboard mt-0.5 opacity-75">
                → ??
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bio strip — Nationality + Born are public knowledge from a
       * matchday programme, but Caps + Contract come from a scout's
       * homework. We show the latter as ?? until then. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
        <BioCellWithFlag
          k="Nationality"
          v={nationality}
          flagNationality={player.nationality}
        />
        <BioCell k="Born" v={formatDOB(player.dateOfBirth)} alt />
        <BioCell
          k="Caps"
          v={
            isScouted
              ? `${player.caps ?? 0}${player.internationalGoals ? ` · ${player.internationalGoals}g` : ""}`
              : "??"
          }
        />
        <BioCell
          k="Contract"
          v={isScouted ? contractExpiryLabel(player.contractYears, season) : "??"}
          alt
        />
      </div>

      {isScouted ? (
        <>
          {/* Money + appearances row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-0 text-[11px]">
            <Stat k="Value" v={formatValue(player.value)} />
            <Stat k="Wage" v={`£${(player.wage / 1000).toFixed(0)}k/w`} alt />
            <Stat k="Apps" v={String(player.appearances)} />
            <Stat k="Goals" v={String(player.goals)} alt />
            <Stat k="Assists" v={String(player.assists)} />
            <Stat k="Avg" v={player.averageRating.toFixed(2)} alt />
          </div>

          {/* Form / Morale / Fitness with bars */}
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
            Condition
          </div>
          <div className="bg-[color:var(--ss-bg-2)] grid grid-cols-3 gap-0 px-3 py-2.5 text-white text-[11px] font-bold uppercase tracking-[0.04em]">
            <CondCell k="Form" v={player.form} colorFor="growth" />
            <CondCell k="Morale" v={player.morale} colorFor="growth" />
            <CondCell k="Fitness" v={player.fitness} colorFor="fitness" />
          </div>

          {/* Attributes with trends */}
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
            Attributes
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-0">
            <AttrRow k="Pace" v={player.pace} trend={trends.pace} />
            <AttrRow k="Shooting" v={player.shooting} trend={trends.shooting} alt />
            <AttrRow k="Passing" v={player.passing} trend={trends.passing} />
            <AttrRow k="Tackling" v={player.tackling} trend={trends.tackling} alt />
            <AttrRow k="Stamina" v={player.stamina} trend={trends.stamina} />
            <AttrRow k="Technique" v={player.technique} trend={trends.technique} alt />
            <AttrRow k="Strength" v={player.strength} trend={trends.strength} />
            <AttrRow k="Mentality" v={player.mentality} trend={trends.mentality} alt />
          </ul>

          {/* Transfer interest — only if any */}
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)] flex items-center justify-between">
            <span className="opacity-70">Transfer Interest</span>
            <span>{interest.length}</span>
          </div>
          {interest.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-3 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
              No clubs are sniffing around · keep performing
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
              {interest.map((it, i) => {
                const c = clubs[it.clubId];
                const meta = INTEREST_COPY[it.level] ?? INTEREST_COPY.rumour;
                const dark = it.level === "interested"; // yellow accent → dark text
                return (
                  <li
                    key={`${it.clubId}-${i}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em]"
                    style={{
                      background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
                      color: "#FFFFFF",
                    }}
                  >
                    <span className="truncate">{c?.name ?? "Unknown club"}</span>
                    <span
                      className="text-[10px] tracking-[0.16em] px-1.5 py-0.5"
                      style={{
                        background: meta.color,
                        color: dark ? "#0E0830" : "#FFFFFF",
                      }}
                      title={`Interested since W${it.since}`}
                    >
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        // ─── UNSCOUTED VIEW ────────────────────────────────────────
        // The user hasn't filed a scout report yet, so we replace the
        // detail panels with an explanation + "Send Scout" CTA. Bio
        // (nationality + DOB) stays visible above; everything else is
        // deliberately hidden.
        <ScoutPrompt
          onSendScout={onSendScout}
          scoutCost={scoutCost}
          canAfford={canAffordScout}
        />
      )}

      {/* Action bar — defaults to a contextual set if no override given */}
      {footer ?? (
        <DefaultActionBar
          ownPlayer={ownPlayer}
          isFreeAgent={isFreeAgent}
          isCaptain={isCaptain}
          onClose={onClose}
          onNewContract={onNewContract}
          onSell={onSell}
          onMakeBid={onMakeBid}
          onScout={onScout}
          onSign={onSign}
          onBench={onBench}
          onDrop={onDrop}
          onMakeCaptain={onMakeCaptain}
        />
      )}
    </div>
  );
}

// =====================================================================
// Default action bar — context-aware CTAs
// =====================================================================

function DefaultActionBar({
  ownPlayer,
  isFreeAgent,
  isCaptain,
  onClose,
  onNewContract,
  onSell,
  onMakeBid,
  onScout,
  onSign,
  onBench,
  onDrop,
  onMakeCaptain,
}: {
  ownPlayer?: boolean;
  isFreeAgent?: boolean;
  isCaptain?: boolean;
  onClose?: () => void;
  onNewContract?: () => void;
  onSell?: () => void;
  onMakeBid?: () => void;
  onScout?: () => void;
  onSign?: () => void;
  onBench?: () => void;
  onDrop?: () => void;
  onMakeCaptain?: () => void;
}) {
  const buttons: Array<React.ReactNode> = [];

  if (onClose) {
    buttons.push(
      <ActionBtn key="close" variant="action" onClick={onClose} label="Close" />,
    );
  }

  if (isFreeAgent) {
    // Free agent / youth pool prospect.
    buttons.push(
      <ActionBtn key="scout" variant="info" onClick={onScout} label="Scout" phase2={!onScout} />,
    );
    buttons.push(
      <ActionBtn key="sign" variant="primary" onClick={onSign} label="Sign" phase2={!onSign} />,
    );
  } else if (ownPlayer) {
    // User's own player — contract & sale flows.
    if (onBench) {
      buttons.push(
        <ActionBtn
          key="bench"
          variant="info"
          onClick={onBench}
          label="▼ To Bench"
          title="Move out of the starting XI but keep as a named sub"
        />,
      );
    }
    if (onDrop) {
      buttons.push(
        <ActionBtn
          key="drop"
          variant="exit"
          onClick={onDrop}
          label="⇊ To Reserves"
          title="Drop from the matchday squad — player stays at the club"
        />,
      );
    }
    if (onMakeCaptain) {
      buttons.push(
        <ActionBtn
          key="captain"
          variant={isCaptain ? "stat" : "action"}
          onClick={onMakeCaptain}
          label={isCaptain ? "★ Capt" : "Captain"}
        />,
      );
    }
    buttons.push(
      <ActionBtn
        key="contract"
        variant="primary"
        onClick={onNewContract}
        label="New Contract"
        phase2={!onNewContract}
      />,
    );
    buttons.push(
      <ActionBtn
        key="sell"
        variant="exit"
        onClick={onSell}
        label="Sell"
        phase2={!onSell}
      />,
    );
  } else {
    // Player at a rival club — bid & scout flows.
    buttons.push(
      <ActionBtn
        key="scout"
        variant="info"
        onClick={onScout}
        label="Scout"
        phase2={!onScout}
      />,
    );
    buttons.push(
      <ActionBtn
        key="bid"
        variant="primary"
        onClick={onMakeBid}
        label="Make Bid"
        phase2={!onMakeBid}
      />,
    );
  }

  if (buttons.length === 0) return null;

  return (
    <div
      className="grid gap-0"
      style={{ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` }}
    >
      {buttons}
    </div>
  );
}

function ActionBtn({
  variant,
  label,
  onClick,
  phase2,
  title,
}: {
  variant: "action" | "info" | "primary" | "exit" | "stat";
  label: string;
  onClick?: () => void;
  phase2?: boolean;
  title?: string;
}) {
  const disabled = phase2;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={phase2 ? "Coming in Phase 2" : title}
      className={`btn btn-${variant} !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] last:border-r-0 h-12 text-xs ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {label}
      {phase2 && (
        <span className="ml-1 text-[8px] tracking-[0.2em] opacity-80">· P2</span>
      )}
    </button>
  );
}

function BioCellWithFlag({
  k,
  v,
  flagNationality,
}: {
  k: string;
  v: string;
  flagNationality: string;
}) {
  return (
    <div className="px-3 py-2" style={{ background: "var(--ss-bg-2)" }}>
      <div className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {k}
      </div>
      <div className="font-extrabold text-white text-[12px] uppercase tracking-[0.04em] mt-0.5 truncate flex items-center gap-1.5">
        <Flag nationalityId={flagNationality} width={20} />
        <span className="truncate">{v}</span>
      </div>
    </div>
  );
}

function BioCell({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div
      className="px-3 py-2"
      style={{ background: alt ? "var(--ss-bg-strip)" : "var(--ss-bg-2)" }}
    >
      <div className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {k}
      </div>
      <div className="font-extrabold text-white text-[12px] uppercase tracking-[0.04em] mt-0.5 truncate">
        {v}
      </div>
    </div>
  );
}

function Stat({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div
      className="px-2 py-1.5 text-center"
      style={{ background: alt ? "var(--ss-bg-strip)" : "var(--ss-bg-2)" }}
    >
      <div className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {k}
      </div>
      <div className="font-extrabold scoreboard text-sm text-white">{v}</div>
    </div>
  );
}

function CondCell({
  k,
  v,
  colorFor,
}: {
  k: string;
  v: number;
  colorFor: "growth" | "fitness";
}) {
  const c = colorFor === "growth"
    ? v >= 80 ? "var(--ss-btn-stat)" : v >= 60 ? "var(--ss-accent)" : "var(--ss-btn-exit)"
    : v >= 80 ? "var(--ss-btn-stat)" : v >= 55 ? "var(--ss-warning)" : "var(--ss-btn-exit)";
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span className="opacity-80">{k}</span>
        <span className="scoreboard text-[14px]" style={{ color: c }}>{v}</span>
      </div>
      <div className="h-1.5 bg-[color:var(--ss-bg-deep)] overflow-hidden">
        <div className="h-full" style={{ width: `${v}%`, background: c }} />
      </div>
    </div>
  );
}

function AttrRow({
  k,
  v,
  trend,
  alt,
}: {
  k: string;
  v: number;
  trend: Trend;
  alt?: boolean;
}) {
  const valColor =
    v >= 85 ? "var(--ss-btn-stat)"
    : v >= 70 ? "#9AF09A"
    : v >= 55 ? "#FFFFFF"
    : v >= 40 ? "var(--ss-warning)"
    : "var(--ss-btn-exit)";
  return (
    <li
      className="grid grid-cols-[80px_1fr_30px_18px] items-center gap-2 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.04em] text-white"
      style={{ background: alt ? "var(--ss-bg-strip)" : "var(--ss-bg-2)" }}
    >
      <span className="text-[10px] tracking-[0.16em] text-[color:var(--muted)]">{k}</span>
      <AnimatedBar v={v} height={10} />
      <span className="scoreboard text-[14px] text-right" style={{ color: valColor }}>
        {v}
      </span>
      <span
        className="text-center text-[12px] font-extrabold leading-none"
        style={{ color: TREND_COLOR[trend] }}
        title={`Attribute trending ${trend}`}
        aria-label={`Trend ${trend}`}
      >
        {TREND_LABEL[trend]}
      </span>
    </li>
  );
}

// =====================================================================
// "Send Scout" prompt — replaces the detail panels (condition,
// attributes, transfer interest, finance) when the user hasn't filed
// a scout report on this player yet.
// =====================================================================
function ScoutPrompt({
  onSendScout,
  scoutCost,
  canAfford = true,
}: {
  onSendScout?: () => void;
  scoutCost?: number;
  canAfford?: boolean;
}) {
  const hasCost = typeof scoutCost === "number" && scoutCost > 0;
  const disabled = hasCost && !canAfford;
  return (
    <>
      <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
        Scout Report
      </div>
      <div className="bg-[color:var(--ss-bg-2)] px-4 py-5 text-center">
        <div className="scoreboard text-[28px] text-[color:var(--ss-accent)] mb-1">
          🔍
        </div>
        <div className="text-[13px] uppercase tracking-[0.16em] font-extrabold text-white mb-1">
          No Report Filed
        </div>
        <p className="text-[11px] tracking-[0.04em] text-[color:var(--muted)] max-w-sm mx-auto leading-relaxed">
          Send a scout to watch this player. They&apos;ll come back with
          attributes, condition, valuation and any transfer interest.
          {hasCost && (
            <>
              <br />
              <span className="text-[color:var(--ss-accent)]">
                Cost: {formatValue(scoutCost!)}
              </span>
              {!canAfford && (
                <span className="ml-1 text-[color:var(--ss-btn-exit)]">
                  · over budget
                </span>
              )}
            </>
          )}
        </p>
        {onSendScout && (
          <button
            onClick={disabled ? undefined : onSendScout}
            disabled={disabled}
            className="btn btn-stat mt-4 px-5 h-10 text-xs uppercase tracking-[0.16em] disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              disabled
                ? "Your club can't cover this scouting fee"
                : hasCost
                  ? `Pay ${formatValue(scoutCost!)} to scout this player`
                  : "Send a scout to file a report"
            }
          >
            {hasCost
              ? `▸ Send Scout · ${formatValue(scoutCost!)}`
              : "▸ Send Scout"}
          </button>
        )}
      </div>
    </>
  );
}
