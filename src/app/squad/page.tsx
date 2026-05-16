"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/game/AppShell";
import { AnimatedBar } from "@/components/game/AnimatedBar";
import { Flag } from "@/components/game/Flag";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { PlayerProfile } from "@/components/game/PlayerProfile";
import { useGame } from "@/store/gameStore";
import type { Position } from "@/types/game";
import { motion, AnimatePresence } from "framer-motion";
import { formatValue } from "@/lib/playerValue";

const FILTERS = [
  "All", "GK", "DEF", "MID", "FWD", "Injured", "Suspended", "Tired", "Hot Form", "Young",
] as const;

type FilterKey = typeof FILTERS[number];

export default function SquadPage() {
  return (
    <AppShell>
      <SquadInner />
    </AppShell>
  );
}

function SquadInner() {
  const players = useGame((s) => s.getUserPlayers)();
  const userClub = useGame((s) => s.getUserClub)();
  const allClubs = useGame((s) => s.db?.clubs ?? {});
  const career = useGame((s) => s.career);
  const [filter, setFilter] = useState<FilterKey>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return players
      .filter((p) => {
        switch (filter) {
          case "All": return true;
          case "GK": case "DEF": case "MID": case "FWD":
            return p.position === filter as Position;
          case "Injured": return p.isInjured;
          case "Suspended": return p.isSuspended;
          case "Tired": return p.fitness < 70;
          case "Hot Form": return p.form >= 75;
          case "Young": return p.age <= 21;
          default: return true;
        }
      })
      .sort((a, b) => b.overall - a.overall);
  }, [players, filter]);

  const counts = useMemo(() => ({
    All: players.length,
    GK: players.filter((p) => p.position === "GK").length,
    DEF: players.filter((p) => p.position === "DEF").length,
    MID: players.filter((p) => p.position === "MID").length,
    FWD: players.filter((p) => p.position === "FWD").length,
    Injured: players.filter((p) => p.isInjured).length,
    Suspended: players.filter((p) => p.isSuspended).length,
    Tired: players.filter((p) => p.fitness < 70).length,
    "Hot Form": players.filter((p) => p.form >= 75).length,
    Young: players.filter((p) => p.age <= 21).length,
  }) as Record<FilterKey, number>, [players]);

  const open = openId ? players.find((p) => p.id === openId) : null;
  const teamOvr = players.length
    ? Math.round([...players].sort((a, b) => b.overall - a.overall).slice(0, 18)
        .reduce((a, p) => a + p.overall, 0) / Math.min(18, players.length))
    : 0;
  const totalValue = players.reduce((a, p) => a + p.value, 0);

  return (
    <div className="space-y-3">
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg">Squad</div>

        {/* Top stats strip */}
        <div className="ss-strip grid grid-cols-3 sm:grid-cols-4 px-2 sm:px-4 py-2 gap-3 text-center">
          <Stat label="Players" v={String(players.length)} />
          <Stat label="Avg OVR" v={String(teamOvr)} accent />
          <Stat label="Squad Value" v={formatValue(totalValue)} accent />
          <Stat label="Filter" v={filter.toUpperCase()} className="hidden sm:block" />
        </div>

        {/* Filter tabbar */}
        <div className="bg-[color:var(--ss-bg-deep)] flex flex-wrap gap-0">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              disabled={counts[f] === 0 && f !== "All"}
              className={`tab ${filter === f ? "active" : ""}`}
              style={counts[f] === 0 && f !== "All" ? { opacity: 0.4 } : undefined}
            >
              {f}
              <span className="ml-1 text-[10px] opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>

        {/* Column headers — OVR has its own dedicated column so the rating
         * is unmissable. VAL sits to the right of it. */}
        <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[40px_1fr_42px_42px_42px_44px_64px] sm:grid-cols-[44px_1fr_46px_46px_46px_50px_88px] text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--ss-cream)] border-t border-[color:var(--ss-bar-edge)]">
          <span className="px-2 py-1.5 text-center">POS</span>
          <span className="px-2 py-1.5">Player</span>
          <span className="px-1 py-1.5 text-center">FRM</span>
          <span className="px-1 py-1.5 text-center">MOR</span>
          <span className="px-1 py-1.5 text-center">FIT</span>
          <span className="px-1 py-1.5 text-center text-[color:var(--ss-accent)]">OVR</span>
          <span className="px-2 py-1.5 text-right">VAL</span>
        </div>

        {/* Player rows */}
        <div className="overflow-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-10 text-center text-[color:var(--muted)] text-sm uppercase tracking-[0.14em]">
              No players match this filter.
            </div>
          ) : (
            filtered.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="w-full text-left grid grid-cols-[40px_1fr_42px_42px_42px_44px_64px] sm:grid-cols-[44px_1fr_46px_46px_46px_50px_88px] items-stretch text-white font-bold uppercase tracking-[0.04em] text-[12px] sm:text-[13px] is-clickable"
                style={{
                  background: p.isInjured
                    ? "var(--ss-row-danger)"
                    : p.isSuspended
                      ? "var(--ss-row-bench)"
                      : i % 2 === 0
                        ? "var(--ss-row)"
                        : "var(--ss-row-2)",
                }}
              >
                {/* Position cell — coloured strip */}
                <span
                  className="px-1 py-2 text-center scoreboard text-[15px] flex items-center justify-center"
                  style={{ background: positionColor(p.detailedPosition), color: "#0A0A0A" }}
                >
                  {p.detailedPosition}
                </span>

                {/* Name + meta */}
                <span className="pl-2 pr-3 py-2 flex items-center gap-2 min-w-0">
                  <PlayerAvatar playerId={p.id} width={26} />
                  <span className="flex flex-col justify-center min-w-0 flex-1">
                    <span className="truncate flex items-center gap-2">
                      <span>{p.displayName}</span>
                      {p.isSuspended && <span className="bg-[color:var(--ss-warning)] text-black text-[9px] px-1">SUS</span>}
                      {p.isInjured && <span className="bg-black text-white text-[9px] px-1">INJ {p.injuryWeeks}w</span>}
                    </span>
                    <span className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1">
                      <Flag nationalityId={p.nationality} width={14} />
                      <span className="truncate">
                        {p.age}Y · {p.preferredFoot.charAt(0)} · {p.trait}
                      </span>
                    </span>
                  </span>
                </span>

                {/* Mini bars */}
                <Mini v={p.form} />
                <Mini v={p.morale} />
                <Mini v={p.fitness} />

                {/* OVR — its own column, a proper big badge so the rating
                 * is the single most scannable thing on the row. */}
                <span
                  className="px-1 py-2 ss-stat flex items-center justify-center scoreboard text-[18px] sm:text-[20px] leading-none"
                  style={{ color: ratingColor(p.overall) }}
                  title={`Overall ${p.overall} · Potential ${p.potential}`}
                >
                  {p.overall}
                </span>

                {/* VAL — separate column, right-aligned so currency lines up. */}
                <span className="px-2 py-2 flex items-center justify-end text-[11px] sm:text-[12px] text-white tracking-[0.04em]">
                  {formatValue(p.value)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/80 grid place-items-center px-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpenId(null)}
          >
            <motion.div
              className="panel max-w-2xl w-full max-h-[90vh] overflow-auto"
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <PlayerProfile
                player={open}
                clubs={allClubs}
                season={career?.season ?? 1}
                primaryColor={userClub?.badge.primaryColor}
                secondaryColor={userClub?.badge.secondaryColor}
                ownPlayer
                onClose={() => setOpenId(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =====================================================================
// Building blocks
// =====================================================================

function Mini({ v }: { v: number }) {
  return (
    <span className="px-1 py-2 ss-stat flex flex-col items-center justify-center gap-1">
      <span className="scoreboard text-[13px] leading-none" style={{ color: barColor(v) }}>{v}</span>
      <AnimatedBar v={v} height={4} />
    </span>
  );
}

function Stat({ label, v, accent, className }: { label: string; v: string; accent?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[9px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{label}</div>
      <div className={`scoreboard text-base font-extrabold leading-tight ${accent ? "text-[color:var(--ss-accent)]" : "text-white"}`}>
        {v}
      </div>
    </div>
  );
}

// =====================================================================
// Visual helpers
// =====================================================================

function positionColor(pos: string): string {
  if (pos === "GK") return "#FFD000";
  if (["CB", "LB", "RB"].includes(pos)) return "#5FB3E8";
  if (["DM", "CM", "AM", "LM", "RM"].includes(pos)) return "#9AF09A";
  return "#FF8585";
}

function ratingColor(overall: number): string {
  if (overall >= 85) return "#FFD000";
  if (overall >= 78) return "#FFE5A0";
  if (overall >= 70) return "#FFFFFF";
  if (overall >= 60) return "#D8D8D8";
  if (overall >= 50) return "#A2B0DC";
  return "#6F80B8";
}

function barColor(v: number): string {
  if (v >= 80) return "#1FB220";
  if (v >= 60) return "#9AF09A";
  if (v >= 40) return "#FFD000";
  if (v >= 25) return "#FF8A1A";
  return "#E83A3A";
}
