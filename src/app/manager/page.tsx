"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { useGame } from "@/store/gameStore";
import { competitionLabel } from "@/engine/historyEngine";
import type { ManagerAward, ManagerAwardType } from "@/types/game";

export default function ManagerPage() {
  return (
    <AppShell>
      <ManagerInner />
    </AppShell>
  );
}

function ManagerInner() {
  const career = useGame((s) => s.career);
  const userClub = useGame((s) => s.getUserClub)();
  const allClubs = useGame((s) => s.db?.clubs ?? {});

  const stats = career?.manager.stats;
  const awards = useMemo(() => career?.manager.awards ?? [], [career?.manager.awards]);
  const seasonHistory = useMemo(
    () => career?.manager.seasonHistory ?? [],
    [career?.manager.seasonHistory],
  );

  // Group awards by type for the headline cabinet.
  const groupedAwards = useMemo(() => {
    const map = new Map<ManagerAwardType, ManagerAward[]>();
    awards.forEach((a) => {
      const list = map.get(a.type) ?? [];
      list.push(a);
      map.set(a.type, list);
    });
    return [...map.entries()].sort((a, b) => awardRank(a[0]) - awardRank(b[0]));
  }, [awards]);

  if (!career) return null;

  const primary = userClub?.badge.primaryColor ?? "#5FB3E8";
  const secondary = userClub?.badge.secondaryColor ?? "#FFD000";

  return (
    <div className="space-y-3">
      {/* Hero — manager identity + headline lifetime numbers */}
      <div
        className="team-hero p-3 sm:p-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] items-center anim-fade-up"
        style={
          {
            "--team-1": primary,
            "--team-2": secondary,
          } as React.CSSProperties
        }
      >
        <div className="grid place-items-center bg-black/35 size-16 sm:size-20 border-2 border-white/40 scoreboard text-2xl sm:text-3xl text-white uppercase">
          {initials(career.managerName)}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-90">
            Manager · S{career.season} · W{career.week}
          </div>
          <div className="text-xl sm:text-2xl font-extrabold uppercase tracking-[0.04em] leading-tight truncate">
            {career.managerName}
          </div>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-90 truncate flex items-center gap-2 mt-1">
            {userClub && (
              <ClubLink clubId={userClub.id} className="flex items-center gap-2 min-w-0">
                <TeamCrest club={userClub} size={20} />
                <span className="truncate">{userClub.name}</span>
              </ClubLink>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 sm:gap-2 self-stretch sm:self-center">
          <BigStat label="GAMES" v={stats?.matches ?? 0} />
          <BigStat label="WIN %" v={`${stats?.winPct ?? 0}%`} accent />
          <BigStat label="TROPHIES" v={stats?.trophies ?? 0} />
        </div>
      </div>

      {/* Lifetime stats grid */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm">CAREER STATS</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-0">
          <Cell k="Played" v={stats?.matches ?? 0} />
          <Cell k="Won" v={stats?.wins ?? 0} accent alt />
          <Cell k="Drawn" v={stats?.draws ?? 0} />
          <Cell k="Lost" v={stats?.losses ?? 0} alt />
          <Cell k="GF" v={stats?.goalsFor ?? 0} />
          <Cell k="GA" v={stats?.goalsAgainst ?? 0} alt />
          <Cell k="GD" v={(stats?.goalsFor ?? 0) - (stats?.goalsAgainst ?? 0)} />
          <Cell k="Clean" v={stats?.cleanSheets ?? 0} alt />
          <Cell k="PPG" v={(stats?.ppg ?? 0).toFixed(2)} accent />
          <Cell k="Win %" v={`${stats?.winPct ?? 0}%`} alt />
          <Cell k="Trophies" v={stats?.trophies ?? 0} accent />
          <Cell k="Awards" v={awards.length} alt />
        </div>
      </div>

      {/* Awards cabinet */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm flex items-center justify-between">
          <span>AWARDS &amp; HONOURS</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {awards.length} TOTAL
          </span>
        </div>
        {groupedAwards.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-4 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
            No silverware on the mantelpiece yet — lift your first trophy at the end of the season.
          </div>
        ) : (
          <ul>
            {groupedAwards.map(([type, list], i) => (
              <li
                key={type}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.04em] text-white"
                style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
              >
                <AwardIcon type={type} />
                <span className="min-w-0">
                  <span className="truncate block">{type}</span>
                  <span className="text-[9px] tracking-[0.16em] opacity-70 truncate block">
                    {list.slice(0, 4).map((a) => `S${a.season}`).join(" · ")}
                    {list.length > 4 && ` · +${list.length - 4}`}
                  </span>
                </span>
                <span className="scoreboard text-[16px] text-[color:var(--ss-accent)]">
                  ×{list.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Awards timeline (most recent first) */}
      {awards.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">AWARDS TIMELINE</div>
          <ul>
            {[...awards]
              .sort((a, b) => b.season - a.season)
              .slice(0, 12)
              .map((a, i) => {
                const club = allClubs[a.clubId];
                return (
                  <li
                    key={a.id}
                    className="grid grid-cols-[60px_28px_1fr_auto] items-center gap-2 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] text-white"
                    style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                  >
                    <span className="scoreboard text-[14px] text-[color:var(--ss-accent)] text-center">
                      S{a.season}
                    </span>
                    {club ? (
                      <ClubLink clubId={club.id} className="flex items-center">
                        <TeamCrest club={club} size={20} />
                      </ClubLink>
                    ) : (
                      <span />
                    )}
                    <span className="truncate text-[11px]">{a.description}</span>
                    <span className="text-[9px] tracking-[0.16em] opacity-80">
                      {a.type}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Season-by-season career */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm flex items-center justify-between">
          <span>SEASON-BY-SEASON</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {seasonHistory.length} SEASONS
          </span>
        </div>
        {seasonHistory.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-4 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
            Your first season hasn&apos;t finished yet.
          </div>
        ) : (
          <>
            <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[56px_1fr_44px_38px_38px_38px_50px_36px] text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--ss-cream)] border-t border-[color:var(--ss-bar-edge)]">
              <span className="px-2 py-1.5 text-center">SEASON</span>
              <span className="px-2 py-1.5">CLUB · DIV</span>
              <span className="px-1 py-1.5 text-center">POS</span>
              <span className="px-1 py-1.5 text-center">W</span>
              <span className="px-1 py-1.5 text-center">D</span>
              <span className="px-1 py-1.5 text-center">L</span>
              <span className="px-2 py-1.5 text-right">PTS</span>
              <span className="px-1 py-1.5 text-center">TR</span>
            </div>
            <ul>
              {[...seasonHistory]
                .sort((a, b) => b.season - a.season)
                .map((s, i) => {
                  const club = allClubs[s.clubId];
                  return (
                    <li
                      key={`ms_${s.season}_${s.clubId}`}
                      className="grid grid-cols-[56px_1fr_44px_38px_38px_38px_50px_36px] items-center text-white text-[12px] font-bold uppercase tracking-[0.04em]"
                      style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                    >
                      <span className="px-2 py-1.5 text-center scoreboard text-[14px]">
                        S{s.season}
                      </span>
                      <span className="px-2 py-1.5 truncate flex items-center gap-2 min-w-0">
                        {club && <TeamCrest club={club} size={18} />}
                        <Link
                          href={`/club/${s.clubId}`}
                          className="truncate hover:text-[color:var(--ss-accent)]"
                        >
                          {club?.shortName ?? s.clubId} · {competitionLabel(s.divisionId)}
                        </Link>
                      </span>
                      <span
                        className="px-1 py-1.5 text-center scoreboard text-[14px]"
                        style={{ color: positionColorForFinish(s.finalPosition) }}
                      >
                        {s.finalPosition}
                      </span>
                      <span className="px-1 py-1.5 text-center scoreboard">{s.wins}</span>
                      <span className="px-1 py-1.5 text-center scoreboard">{s.draws}</span>
                      <span className="px-1 py-1.5 text-center scoreboard">{s.losses}</span>
                      <span className="px-2 py-1.5 text-right scoreboard text-[14px]">
                        {s.points}
                      </span>
                      <span className="px-1 py-1.5 text-center scoreboard text-[14px] text-[color:var(--ss-accent)]">
                        {s.trophies.filter((t) => t.position === 1).length || "·"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-0">
        <Link
          href="/dashboard"
          className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12"
        >
          Back
        </Link>
        {userClub ? (
          <Link
            href={`/club/${userClub.id}`}
            className="btn btn-action !rounded-none border-0 h-12"
          >
            View Club
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function awardRank(t: ManagerAwardType): number {
  switch (t) {
    case "Manager of the Year": return 0;
    case "League Title": return 1;
    case "Cup Winner": return 2;
    case "Promotion": return 3;
    case "Manager of the Month": return 4;
    case "Survival": return 5;
    case "Objective Met": return 6;
  }
}

function AwardIcon({ type }: { type: ManagerAwardType }) {
  const map: Record<ManagerAwardType, { glyph: string; color: string }> = {
    "Manager of the Year": { glyph: "★", color: "#FFD000" },
    "League Title":         { glyph: "★", color: "#FFD000" },
    "Cup Winner":           { glyph: "♛", color: "#FFD000" },
    "Promotion":            { glyph: "▲", color: "#9AF09A" },
    "Manager of the Month": { glyph: "✶", color: "#FFE5A0" },
    "Survival":             { glyph: "✓", color: "#5FB3E8" },
    "Objective Met":        { glyph: "✓", color: "#5FB3E8" },
  };
  const { glyph, color } = map[type];
  return (
    <span
      className="size-9 grid place-items-center scoreboard text-[18px]"
      style={{
        background: "rgba(0,0,0,0.35)",
        color,
        border: `1px solid ${color}66`,
      }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

function BigStat({ label, v, accent }: { label: string; v: string | number; accent?: boolean }) {
  return (
    <div
      className="px-3 py-2 min-w-[64px] text-center"
      style={{
        background: accent ? "var(--ss-accent)" : "rgba(0,0,0,0.35)",
        color: accent ? "#0A0A0A" : "#fff",
      }}
    >
      <div className="text-[9px] tracking-[0.18em] uppercase opacity-80">{label}</div>
      <div className="scoreboard text-[18px] sm:text-[20px] leading-none">{v}</div>
    </div>
  );
}

function Cell({
  k,
  v,
  accent,
  alt,
}: {
  k: string;
  v: string | number;
  accent?: boolean;
  alt?: boolean;
}) {
  return (
    <div
      className="px-2 py-2 text-center"
      style={{ background: alt ? "var(--ss-bg-strip)" : "var(--ss-bg-2)" }}
    >
      <div className="text-[9px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {k}
      </div>
      <div
        className={`font-extrabold scoreboard text-base ${
          accent ? "text-[color:var(--ss-accent)]" : "text-white"
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function positionColorForFinish(p: number): string {
  if (p === 1) return "#FFD000";
  if (p <= 3) return "#9AF09A";
  if (p <= 7) return "#FFFFFF";
  if (p <= 14) return "#D8D8D8";
  return "#FF8585";
}
