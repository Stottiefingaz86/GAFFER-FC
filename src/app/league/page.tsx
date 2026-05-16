"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { PlayerLink } from "@/components/game/PlayerLink";
import { useGame } from "@/store/gameStore";
import { DIVISION_NAMES } from "@/data/competitionSeeds";
import type { Club, Player } from "@/types/game";

export default function LeaguePage() {
  return (
    <AppShell>
      <LeagueInner />
    </AppShell>
  );
}

type LeagueTab = "table" | "fixtures" | "stats";

function LeagueInner() {
  const db = useGame((s) => s.db)!;
  const userClub = useGame((s) => s.getUserClub)()!;
  const nextFx = useGame((s) => s.getNextUserFixture)();
  const [tab, setTab] = useState<LeagueTab>("table");
  const [divisionId, setDivisionId] = useState<string>(userClub.divisionId);

  const divisions = ([1, 2, 3, 4] as const).map((tier) => DIVISION_NAMES[tier]);
  const division = Object.values(DIVISION_NAMES).find((d) => d.id === divisionId)!;
  const table = db.tables[divisionId];
  const fixtures = db.fixtures
    .filter((f) => f.competitionId === divisionId)
    .sort((a, b) => a.week - b.week);

  // Coloured zone strips on the left edge of each row.
  const zoneFor = (idx: number, divId: string) => {
    if (divId === "div_premier") {
      if (idx < 4) return { color: "var(--ss-accent)", title: "Champions Cup" };
      if (idx < 6) return { color: "var(--ss-btn-info)", title: "Continental Cup" };
      if (idx >= 17) return { color: "var(--ss-btn-exit)", title: "Relegation" };
      return null;
    }
    if (divId === "div_one" || divId === "div_two") {
      if (idx < 2) return { color: "var(--ss-btn-stat)", title: "Auto Promotion" };
      if (idx < 6) return { color: "var(--ss-accent)", title: "Playoff" };
      if (idx >= (divId === "div_one" ? 17 : 16)) return { color: "var(--ss-btn-exit)", title: "Relegation" };
      return null;
    }
    if (idx < 3) return { color: "var(--ss-btn-stat)", title: "Auto Promotion" };
    if (idx < 7) return { color: "var(--ss-accent)", title: "Playoff" };
    if (idx >= 18) return { color: "var(--ss-btn-exit)", title: "Drop" };
    return null;
  };

  const userPos = table.rows.findIndex((r) => r.clubId === userClub.id) + 1;
  const opp = nextFx
    ? db.clubs[nextFx.homeId === userClub.id ? nextFx.awayId : nextFx.homeId]
    : null;

  return (
    <div className="space-y-3">
      {/* Division switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="tabbar">
          {divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={`tab ${divisionId === d.id ? "active" : ""}`}
            >
              {d.short}
            </button>
          ))}
        </div>
        <div className="tabbar">
          <button onClick={() => setTab("table")} className={`tab ${tab === "table" ? "active" : ""}`}>Table</button>
          <button onClick={() => setTab("fixtures")} className={`tab ${tab === "fixtures" ? "active" : ""}`}>Fixtures</button>
          <button onClick={() => setTab("stats")} className={`tab ${tab === "stats" ? "active" : ""}`}>Stats</button>
        </div>
      </div>

      {/* The classic Sensible Soccer table panel */}
      <div className="panel overflow-hidden">
        {/* Cream title bar */}
        <div className="panel-bar text-base sm:text-lg">
          {division.name.toUpperCase()}
        </div>

        {tab === "stats" ? (
          <LeagueStatsPanel db={db} divisionId={divisionId} />
        ) : tab === "table" ? (
          <>
            {/* Column headers */}
            <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[40px_1fr_36px_36px_36px_36px_36px_36px_44px_92px] sm:grid-cols-[44px_1fr_40px_40px_40px_40px_40px_40px_50px_100px] text-[10px] sm:text-[11px] uppercase tracking-[0.18em] font-bold text-[color:var(--ss-cream)]">
              <span className="px-2 py-1.5 text-center">#</span>
              <span className="px-3 py-1.5">Club</span>
              <span className="px-1 py-1.5 text-center">PL</span>
              <span className="px-1 py-1.5 text-center">W</span>
              <span className="px-1 py-1.5 text-center">D</span>
              <span className="px-1 py-1.5 text-center">L</span>
              <span className="px-1 py-1.5 text-center">F</span>
              <span className="px-1 py-1.5 text-center">A</span>
              <span className="px-1 py-1.5 text-center">GD</span>
              <span className="px-2 py-1.5 text-center">PTS · FORM</span>
            </div>

            {/* Rows */}
            <div className="overflow-auto scrollbar-thin">
              {table.rows.map((row, i) => {
                const club = db.clubs[row.clubId];
                const me = club.id === userClub.id;
                const zone = zoneFor(i, divisionId);
                const rowBg = me ? "var(--ss-row-user)" : i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)";

                return (
                  <Link
                    key={row.clubId}
                    href={`/club/${club.id}`}
                    className="grid grid-cols-[40px_1fr_36px_36px_36px_36px_36px_36px_44px_92px] sm:grid-cols-[44px_1fr_40px_40px_40px_40px_40px_40px_50px_100px] items-stretch text-white text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em] hover:brightness-125 transition-[filter] cursor-pointer"
                    style={{
                      background: rowBg,
                      boxShadow: me ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                    }}
                    title={`${zone?.title ?? "View"} ${club.name}`}
                  >
                    {/* Position number — left strip with zone colour accent.
                        We hide this accent for the user's row (the yellow
                        edge above is enough — keeping both fights visually). */}
                    <span
                      className="px-2 py-2 text-center scoreboard text-[15px] flex items-center justify-center relative"
                      style={{
                        boxShadow: zone && !me
                          ? `inset 4px 0 0 0 ${zone.color}`
                          : undefined,
                      }}
                    >
                      {i + 1}
                    </span>

                    {/* Club */}
                    <span className="px-3 py-2 flex items-center gap-2 truncate">
                      <TeamCrest club={club} size={20} />
                      <span className="truncate">{club.name}</span>
                    </span>

                    {/* Stat columns */}
                    <Stat>{row.played}</Stat>
                    <Stat>{row.won}</Stat>
                    <Stat>{row.drawn}</Stat>
                    <Stat>{row.lost}</Stat>
                    <Stat>{row.goalsFor}</Stat>
                    <Stat>{row.goalsAgainst}</Stat>
                    <Stat>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</Stat>

                    {/* PTS + form */}
                    <span className="px-2 py-2 flex items-center justify-end gap-1.5 ss-stat">
                      <span className="scoreboard text-[16px] font-bold mr-1">{row.points}</span>
                      <div className="flex gap-0.5">
                        {row.form.length === 0 && <span className="text-white/60 text-xs">—</span>}
                        {row.form.slice(-3).map((f, j) => (
                          <span
                            key={j}
                            className="size-3.5 grid place-items-center text-[9px] font-extrabold"
                            style={{
                              background:
                                f === "W" ? "var(--ss-btn-stat)" :
                                f === "D" ? "var(--ss-accent)" :
                                "var(--ss-btn-exit)",
                              color: f === "D" ? "#0A0A0A" : "#FFFFFF",
                            }}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Bottom info strip — current matchup */}
            <div className="ss-strip flex items-center justify-center gap-4 py-2.5 text-sm sm:text-base tracking-[0.12em]">
              <Link href={`/club/${userClub.id}`} className="flex items-center gap-2 hover:underline" title="View your club">
                <TeamCrest club={userClub} size={20} />
                <span className="font-bold">{userClub.name}</span>
                <span className="scoreboard text-[color:var(--ss-cream)]">·</span>
                <span className="scoreboard text-[color:var(--ss-cream)]">{ordinal(userPos)}</span>
              </Link>
              {opp && (
                <>
                  <span className="text-[color:var(--ss-cream)] tracking-[0.4em] font-bold">V</span>
                  <Link href={`/club/${opp.id}`} className="flex items-center gap-2 hover:underline" title={`View ${opp.name}`}>
                    <span className="font-bold">{opp.name}</span>
                    <TeamCrest club={opp} size={20} />
                  </Link>
                </>
              )}
            </div>

            {/* Big Sensible-style action buttons */}
            <div className="grid grid-cols-3 gap-0">
              <Link
                href="/match"
                className="btn btn-action h-12 text-sm sm:text-base !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)]"
              >
                Play Match
              </Link>
              <button
                type="button"
                onClick={() => setTab("stats")}
                className="btn btn-stat h-12 text-sm sm:text-base !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] w-full"
              >
                Stats
              </button>
              <Link
                href="/dashboard"
                className="btn btn-exit h-12 text-sm sm:text-base !rounded-none border-0"
              >
                Exit
              </Link>
            </div>
          </>
        ) : (
          <div className="p-3 space-y-3">
            {Array.from(new Set(fixtures.map((f) => f.week))).slice(0, 38).map((w) => (
              <div key={w}>
                <div className="panel-bar text-xs mb-0">Week {w}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 mt-0">
                  {fixtures.filter((f) => f.week === w).map((f, idx) => {
                    const home = db.clubs[f.homeId];
                    const away = db.clubs[f.awayId];
                    const isUser = home.id === userClub.id || away.id === userClub.id;
                    const bg = isUser ? "var(--ss-row-user)" : idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)";
                    return (
                      <div
                        key={f.id}
                        className="px-3 py-2 flex items-center gap-2 text-white font-bold uppercase tracking-[0.04em] text-[13px]"
                        style={{
                          background: bg,
                          boxShadow: isUser ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                        }}
                      >
                        <Link href={`/club/${home.id}`} title={`View ${home.name}`} className="hover:scale-110 transition-transform shrink-0">
                          <TeamCrest club={home} size={18} />
                        </Link>
                        <Link
                          href={`/club/${home.id}`}
                          className="flex-1 truncate hover:underline min-w-0"
                          title={home.name}
                        >
                          {home.name}
                        </Link>
                        <span className="scoreboard w-16 text-center bg-[color:var(--ss-bg-deep)] py-0.5 px-1 shrink-0">
                          {f.played && f.result
                            ? `${f.result.homeGoals}-${f.result.awayGoals}`
                            : "vs"}
                        </span>
                        <Link
                          href={`/club/${away.id}`}
                          className="flex-1 truncate text-right hover:underline min-w-0"
                          title={away.name}
                        >
                          {away.name}
                        </Link>
                        <Link href={`/club/${away.id}`} title={`View ${away.name}`} className="hover:scale-110 transition-transform shrink-0">
                          <TeamCrest club={away} size={18} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ children }: { children: React.ReactNode }) {
  return (
    <span className="ss-stat px-1 py-2 text-center scoreboard text-[14px]">
      {children}
    </span>
  );
}

// =====================================================================
// <LeagueStatsPanel /> — top 5 leaderboards across the selected
// division. Categories: Goals, Assists, Average Rating, Yellow Cards,
// Red Cards. Players are filtered to clubs in the active division so
// the user can compare like-with-like across each tier.
//
// Match ratings require a minimum appearance count to dodge "1 game,
// 9.5 rating" outliers; the cards/goals/assists boards use raw totals.
// =====================================================================
const MIN_RATING_APPEARANCES = 3;
const TOP_N = 5;

function LeagueStatsPanel({
  db,
  divisionId,
}: {
  db: NonNullable<ReturnType<typeof useGame.getState>["db"]>;
  divisionId: string;
}) {
  // Resolve every player who plays for a club in this division. We
  // hit `db.tables` for the membership instead of scanning each club
  // because the table is the canonical source of "who's in the
  // league this season" (handles promotion/relegation correctly).
  const stats = useMemo(() => {
    const clubIds = new Set(db.tables[divisionId]?.rows.map((r) => r.clubId) ?? []);
    const players = Object.values(db.players).filter((p) => clubIds.has(p.clubId));

    const byTotal = (key: "goals" | "assists" | "yellowCards" | "redCards") =>
      [...players]
        .filter((p) => p[key] > 0)
        .sort((a, b) => b[key] - a[key] || (b.appearances - a.appearances))
        .slice(0, TOP_N);

    const byRating = [...players]
      .filter((p) => p.appearances >= MIN_RATING_APPEARANCES)
      .sort((a, b) => b.averageRating - a.averageRating || b.appearances - a.appearances)
      .slice(0, TOP_N);

    return {
      goals: byTotal("goals"),
      assists: byTotal("assists"),
      yellows: byTotal("yellowCards"),
      reds: byTotal("redCards"),
      ratings: byRating,
    };
  }, [db, divisionId]);

  const empty =
    stats.goals.length === 0 &&
    stats.assists.length === 0 &&
    stats.ratings.length === 0 &&
    stats.yellows.length === 0 &&
    stats.reds.length === 0;

  if (empty) {
    return (
      <div className="bg-[color:var(--ss-bg-2)] py-10 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
        No matches played yet — stats will appear once the season kicks off.
      </div>
    );
  }

  return (
    <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px">
      <Leaderboard
        title="Top Scorers"
        accent="var(--ss-accent)"
        rows={stats.goals}
        render={(p) => <ScoreboardNumber>{p.goals}</ScoreboardNumber>}
        clubs={db.clubs}
      />
      <Leaderboard
        title="Top Assists"
        accent="var(--ss-btn-info)"
        rows={stats.assists}
        render={(p) => <ScoreboardNumber>{p.assists}</ScoreboardNumber>}
        clubs={db.clubs}
      />
      <Leaderboard
        title="Top Match Ratings"
        accent="var(--ss-btn-stat)"
        rows={stats.ratings}
        sub={(p) => `${p.appearances} apps`}
        render={(p) => (
          <ScoreboardNumber>
            {p.averageRating.toFixed(1)}
          </ScoreboardNumber>
        )}
        clubs={db.clubs}
      />
      <Leaderboard
        title="Yellow Cards"
        accent="#FFD000"
        rows={stats.yellows}
        render={(p) => (
          <span className="flex items-center gap-1.5 justify-end">
            <span
              aria-hidden
              style={{
                background: "#FFD000",
                width: 10,
                height: 14,
                display: "inline-block",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
              }}
            />
            <ScoreboardNumber>{p.yellowCards}</ScoreboardNumber>
          </span>
        )}
        clubs={db.clubs}
      />
      <Leaderboard
        title="Red Cards"
        accent="var(--ss-btn-exit)"
        rows={stats.reds}
        render={(p) => (
          <span className="flex items-center gap-1.5 justify-end">
            <span
              aria-hidden
              style={{
                background: "var(--ss-btn-exit)",
                width: 10,
                height: 14,
                display: "inline-block",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
              }}
            />
            <ScoreboardNumber>{p.redCards}</ScoreboardNumber>
          </span>
        )}
        clubs={db.clubs}
      />
    </div>
  );
}

function Leaderboard({
  title,
  accent,
  rows,
  render,
  sub,
  clubs,
}: {
  title: string;
  accent: string;
  rows: Player[];
  render: (p: Player) => React.ReactNode;
  sub?: (p: Player) => string;
  clubs: Record<string, Club>;
}) {
  return (
    <div className="bg-[color:var(--ss-bg)] flex flex-col">
      <div
        className="px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-extrabold text-black"
        style={{ background: accent }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          —
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
          {rows.map((p, i) => {
            const club = clubs[p.clubId];
            return (
              <li
                key={p.id}
                className="grid grid-cols-[24px_28px_1fr_auto] items-center gap-2 px-2 py-1.5 text-white text-[12px] font-bold uppercase tracking-[0.04em]"
                style={{
                  background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
                }}
              >
                <span className="scoreboard text-[13px] text-[color:var(--ss-accent)] text-center">
                  {i + 1}
                </span>
                <PlayerAvatar playerId={p.id} width={24} />
                <span className="flex flex-col min-w-0">
                  <PlayerLink playerId={p.id} className="truncate">
                    {p.firstName.charAt(0)}. {p.lastName}
                  </PlayerLink>
                  <span className="text-[9px] tracking-[0.14em] opacity-75 truncate flex items-center gap-1">
                    {club ? (
                      <>
                        <TeamCrest club={club} size={11} />
                        <span className="truncate">{club.shortName}</span>
                      </>
                    ) : (
                      <span>—</span>
                    )}
                    {sub && <span className="opacity-70">· {sub(p)}</span>}
                  </span>
                </span>
                <span className="text-right">{render(p)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScoreboardNumber({ children }: { children: React.ReactNode }) {
  return (
    <span className="scoreboard text-[15px] text-[color:var(--ss-accent)]">
      {children}
    </span>
  );
}

function ordinal(n: number): string {
  if (n <= 0) return `${n}`;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
