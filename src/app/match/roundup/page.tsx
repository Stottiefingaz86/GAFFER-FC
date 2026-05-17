"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { useGame } from "@/store/gameStore";
import {
  MATCHDAY_ORDER,
  MATCHDAY_LABEL,
  type Fixture,
  type MatchDay,
} from "@/types/game";
import { COMP_IDS } from "@/data/competitionSeeds";
import { isLeagueCompetitionId, nationOfCompetition } from "@/data/nations";
import { fixturesForWeek } from "@/lib/dbIndex";

/** Display order so we always render Prem → D1 → D2 → D3 → cups within a day. */
const COMP_ORDER: string[] = [
  COMP_IDS.PREMIER,
  COMP_IDS.D1,
  COMP_IDS.D2,
  COMP_IDS.D3,
  COMP_IDS.NATIONAL_CUP,
  COMP_IDS.LEAGUE_CUP,
  COMP_IDS.CHAMPIONS_CUP,
  COMP_IDS.CONTINENTAL_CUP,
  COMP_IDS.SUPER_SHIELD,
];

/** Fallback for older saves without dayOfWeek — leagues default Saturday,
 * cup ties default Wednesday. */
function dayFor(fx: Fixture): MatchDay {
  if (fx.dayOfWeek) return fx.dayOfWeek;
  return isLeagueCompetitionId(fx.competitionId) ? "SAT" : "WED";
}

export default function MatchRoundupPage() {
  return (
    <AppShell>
      <RoundupInner />
    </AppShell>
  );
}

type ScopeFilter = "league" | "nation" | "all";

function RoundupInner() {
  const db = useGame((s) => s.db)!;
  const career = useGame((s) => s.career)!;
  const userClub = useGame((s) => s.getUserClub)()!;

  // The most recently completed week = career.week - 1 (advanceWeek bumps
  // career.week after simulating).
  const lastWeek = Math.max(career.week - 1, 1);

  // With 15 nations × 4 divisions playing every week, the round-up
  // can render 100+ fixtures across 6 competitions PER DAY. That's
  // crippling to render and overwhelming to read. Default to the
  // user's own league only; let them widen to their nation (all
  // domestic comps) or the whole world if they want.
  const [scope, setScope] = useState<ScopeFilter>("league");

  const userNationId = useMemo(
    () => nationOfCompetition(userClub.divisionId) ?? "england",
    [userClub.divisionId],
  );

  // All fixtures played this week — indexed so we don't scan the
  // full season-long fixture list every render.
  const allPlayedThisWeek = useMemo(
    () => fixturesForWeek(db.fixtures, lastWeek).filter((f) => f.played && f.result),
    [db.fixtures, lastWeek],
  );

  // Filter to scope. We always keep the user's own match visible so
  // the "Your Match" strip never disappears regardless of filter.
  const playedThisWeek = useMemo(() => {
    if (scope === "all") return allPlayedThisWeek;
    if (scope === "nation") {
      return allPlayedThisWeek.filter(
        (f) => nationOfCompetition(f.competitionId) === userNationId,
      );
    }
    // "league" — only fixtures from the user's own division.
    return allPlayedThisWeek.filter((f) => f.competitionId === userClub.divisionId);
  }, [allPlayedThisWeek, scope, userClub.divisionId, userNationId]);

  // The user's match is always extracted from the FULL list so the
  // "Your Match" strip always shows (even when scope hides it).
  const userFx = allPlayedThisWeek.find(
    (f) => f.homeId === userClub.id || f.awayId === userClub.id,
  );

  // Counts for the filter tabs — so the user can see how much wider
  // the next scope would go before opting in.
  const counts = useMemo(() => {
    const all = allPlayedThisWeek.length;
    const nation = allPlayedThisWeek.filter(
      (f) => nationOfCompetition(f.competitionId) === userNationId,
    ).length;
    const league = allPlayedThisWeek.filter((f) => f.competitionId === userClub.divisionId).length;
    return { all, nation, league };
  }, [allPlayedThisWeek, userNationId, userClub.divisionId]);

  // Group: day -> competition -> fixtures[]
  const grouped = useMemo(() => {
    const out = new Map<MatchDay, Map<string, Fixture[]>>();
    for (const fx of playedThisWeek) {
      const day = dayFor(fx);
      let byComp = out.get(day);
      if (!byComp) {
        byComp = new Map();
        out.set(day, byComp);
      }
      const list = byComp.get(fx.competitionId) ?? [];
      list.push(fx);
      byComp.set(fx.competitionId, list);
    }
    return out;
  }, [playedThisWeek]);

  const usedDays = MATCHDAY_ORDER.filter((d) => grouped.has(d));

  // Edge case: scope filter could legitimately match zero (e.g. user's
  // league had a cup week off). Show a friendlier empty state with
  // the filter tabs still visible so they can widen the scope.
  if (allPlayedThisWeek.length === 0) {
    return (
      <div className="panel overflow-hidden max-w-2xl mx-auto">
        <div className="panel-bar text-base">No Results Yet</div>
        <div className="bg-[color:var(--ss-bg-2)] py-8 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
          Play a match first.
        </div>
        <Link href="/dashboard" className="btn btn-primary !rounded-none w-full h-12 border-0">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // Headline numbers — always computed off the FILTERED list so the
  // numbers match what the user sees below.
  const totalGoals = playedThisWeek.reduce(
    (acc, f) => acc + (f.result?.homeGoals ?? 0) + (f.result?.awayGoals ?? 0),
    0
  );
  const biggestWin = [...playedThisWeek].sort((a, b) => {
    const da = Math.abs((a.result?.homeGoals ?? 0) - (a.result?.awayGoals ?? 0));
    const db_ = Math.abs((b.result?.homeGoals ?? 0) - (b.result?.awayGoals ?? 0));
    return db_ - da;
  })[0];
  const highestScoring = [...playedThisWeek].sort((a, b) => {
    const sa = (a.result?.homeGoals ?? 0) + (a.result?.awayGoals ?? 0);
    const sb = (b.result?.homeGoals ?? 0) + (b.result?.awayGoals ?? 0);
    return sb - sa;
  })[0];

  return (
    <div className="space-y-3 max-w-4xl mx-auto">
      {/* Headline panel */}
      <motion.section
        className="panel overflow-hidden"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="panel-bar text-base">
          Results Round-Up · S{career.season} · W{lastWeek}
        </div>
        <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-3 gap-0">
          <Headline k="Matches" v={playedThisWeek.length.toString()} />
          <Headline k="Goals" v={totalGoals.toString()} alt />
          <Headline
            k="Biggest"
            v={
              biggestWin
                ? `${db.clubs[biggestWin.homeId].shortName} ${biggestWin.result!.homeGoals}-${biggestWin.result!.awayGoals} ${db.clubs[biggestWin.awayId].shortName}`
                : "—"
            }
          />
        </div>
        {highestScoring && highestScoring.id !== biggestWin?.id && (
          <div className="ss-strip text-[10px] tracking-[0.18em] text-center px-3 py-1.5 text-[color:var(--ss-cream)] truncate">
            Top thriller — {db.clubs[highestScoring.homeId].name} {highestScoring.result!.homeGoals}–{highestScoring.result!.awayGoals} {db.clubs[highestScoring.awayId].name}
          </div>
        )}
      </motion.section>

      {/* User's match — first, in the team-tinted strip. Pulled from
          the full week regardless of filter so it never disappears. */}
      {userFx && userFx.result && (
        <motion.section
          className="panel overflow-hidden"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }}
        >
          <div className="panel-bar text-sm">Your Match</div>
          <UserResultStrip fx={userFx} userClubId={userClub.id} />
        </motion.section>
      )}

      {/* Scope filter — defaults to user's league so the page isn't a
          firehose of every match in every nation. Counts in parens
          tell the user how much more is waiting if they widen. */}
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-3">
          <ScopeTab
            active={scope === "league"}
            count={counts.league}
            label="My League"
            onClick={() => setScope("league")}
          />
          <ScopeTab
            active={scope === "nation"}
            count={counts.nation}
            label="My Nation"
            onClick={() => setScope("nation")}
          />
          <ScopeTab
            active={scope === "all"}
            count={counts.all}
            label="Worldwide"
            onClick={() => setScope("all")}
          />
        </div>
      </div>

      {playedThisWeek.length === 0 && (
        <div className="panel overflow-hidden">
          <div className="bg-[color:var(--ss-bg-2)] py-6 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
            No fixtures in this scope this week — try My Nation or Worldwide.
          </div>
        </div>
      )}

      {/* Per-day blocks */}
      {usedDays.map((day, dayIdx) => {
        const byComp = grouped.get(day)!;
        const orderedComps = [
          ...COMP_ORDER.filter((id) => byComp.has(id)),
          ...Array.from(byComp.keys()).filter((id) => !COMP_ORDER.includes(id)),
        ];
        return (
          <motion.section
            key={day}
            className="panel overflow-hidden"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.08 + dayIdx * 0.04 } }}
          >
            <div className="panel-bar text-sm flex items-center justify-center gap-3">
              <span>{MATCHDAY_LABEL[day]}</span>
              <span className="opacity-60 text-[11px]">
                {Array.from(byComp.values()).reduce((acc, l) => acc + l.length, 0)} matches
              </span>
            </div>

            {orderedComps.map((compId) => {
              const fixtures = byComp.get(compId) ?? [];
              const comp = db.competitions[compId];
              if (!comp) return null;
              return (
                <div key={compId}>
                  <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-extrabold border-y border-[color:var(--ss-bar-edge)]">
                    {comp.name}
                  </div>
                  <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
                    {fixtures.map((fx, i) => (
                      <FixtureRow
                        key={fx.id}
                        fx={fx}
                        i={i}
                        userClubId={userClub.id}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </motion.section>
        );
      })}

      {/* Bottom CTAs */}
      <div className="grid grid-cols-3 gap-0">
        <Link href="/league" className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm">
          League Table
        </Link>
        <Link href="/inbox" className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm">
          Inbox
        </Link>
        {career.pendingSeasonReport ? (
          <Link href="/season/end" className="btn btn-stat !rounded-none border-0 h-12 text-sm flex items-center justify-center gap-2">
            <span>★ End of Season</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="btn btn-stat !rounded-none border-0 h-12 text-sm">
            ▶ Continue
          </Link>
        )}
      </div>
    </div>
  );
}

function ScopeTab({
  active, label, count, onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-2.5 text-[11px] uppercase tracking-[0.18em] font-extrabold",
        "border-r border-[color:var(--ss-bar-edge)] last:border-r-0 transition-colors",
        active
          ? "bg-[color:var(--ss-accent)] text-[color:var(--ss-bg-deep)]"
          : "bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] hover:bg-[color:var(--ss-bg-3)]",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className={active ? "opacity-70 ml-1.5" : "opacity-60 ml-1.5"}>
        ({count})
      </span>
    </button>
  );
}

function Headline({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div
      className="px-3 py-3 text-center"
      style={{ background: alt ? "var(--ss-strip)" : "var(--ss-bg-2)" }}
    >
      <div className="text-[10px] uppercase text-[color:var(--muted)] tracking-[0.16em]">{k}</div>
      <div className="font-extrabold scoreboard text-base sm:text-lg text-white mt-0.5 truncate">
        {v}
      </div>
    </div>
  );
}

function UserResultStrip({ fx, userClubId }: { fx: Fixture; userClubId: string }) {
  const db = useGame((s) => s.db)!;
  const home = db.clubs[fx.homeId];
  const away = db.clubs[fx.awayId];
  const result = fx.result!;
  const userIsHome = home.id === userClubId;
  const us = userIsHome ? result.homeGoals : result.awayGoals;
  const them = userIsHome ? result.awayGoals : result.homeGoals;
  const won = us > them;
  const drew = us === them;
  const verdict = won ? "W" : drew ? "D" : "L";
  const verdictColor = won
    ? "var(--ss-btn-stat)"
    : drew
      ? "var(--ss-accent)"
      : "var(--ss-btn-exit)";
  const verdictText = drew ? "#0E0830" : "#FFFFFF";
  const userClub = userIsHome ? home : away;

  return (
    <div
      className="grid grid-cols-[44px_1fr_auto_1fr_44px] items-center px-3 py-3 text-white gap-2"
      style={{
        background: `linear-gradient(90deg,
          ${userClub.badge.primaryColor} 0%,
          ${userClub.badge.primaryColor} 12%,
          var(--ss-row) 25%,
          var(--ss-row-2) 100%)`,
        boxShadow: "inset 4px 0 0 0 var(--ss-accent)",
      }}
    >
      <span
        className="grid place-items-center scoreboard text-base font-extrabold h-8"
        style={{ background: verdictColor, color: verdictText }}
        title={won ? "Victory" : drew ? "Draw" : "Defeat"}
      >
        {verdict}
      </span>
      <ClubLink clubId={home.id} className="flex items-center gap-2 min-w-0 justify-end">
        <span className="truncate font-extrabold uppercase tracking-[0.04em] text-sm">
          {home.name}
        </span>
        <TeamCrest club={home} size={28} />
      </ClubLink>
      <span className="scoreboard text-2xl font-extrabold px-3 text-[color:var(--ss-accent)] bg-[color:var(--ss-bg-deep)] min-w-[64px] text-center">
        {result.homeGoals}<span className="text-white/40 mx-1">·</span>{result.awayGoals}
      </span>
      <ClubLink clubId={away.id} className="flex items-center gap-2 min-w-0">
        <TeamCrest club={away} size={28} />
        <span className="truncate font-extrabold uppercase tracking-[0.04em] text-sm">
          {away.name}
        </span>
      </ClubLink>
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/80 text-center">
        {result.attendance >= 1000
          ? `${(result.attendance / 1000).toFixed(0)}K`
          : result.attendance}
      </span>
    </div>
  );
}

function FixtureRow({
  fx,
  i,
  userClubId,
}: {
  fx: Fixture;
  i: number;
  userClubId: string;
}) {
  const db = useGame((s) => s.db)!;
  const home = db.clubs[fx.homeId];
  const away = db.clubs[fx.awayId];
  const result = fx.result;
  if (!result) return null;
  const isUser = home.id === userClubId || away.id === userClubId;
  const homeWon = result.homeGoals > result.awayGoals;
  const awayWon = result.awayGoals > result.homeGoals;

  return (
    <li
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 text-white text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{
        background: isUser
          ? "var(--ss-row-user)"
          : i % 2 === 0
            ? "var(--ss-row)"
            : "var(--ss-row-2)",
        boxShadow: isUser ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
      }}
    >
      {/* Home team */}
      <span className="flex items-center gap-2 min-w-0 justify-end">
        <Link
          href={`/club/${home.id}`}
          className={`truncate hover:underline ${homeWon ? "" : "opacity-70"}`}
          title={`View ${home.name}`}
        >
          {home.name}
        </Link>
        <Link href={`/club/${home.id}`} className="hover:scale-110 transition-transform shrink-0">
          <TeamCrest club={home} size={18} />
        </Link>
      </span>

      {/* Score */}
      <span
        className="scoreboard text-[15px] sm:text-base font-extrabold px-2 py-0.5 text-center min-w-[58px] shrink-0"
        style={{
          background: "var(--ss-bg-deep)",
          color: "var(--ss-accent)",
        }}
      >
        {result.homeGoals}<span className="text-white/40 mx-0.5">·</span>{result.awayGoals}
      </span>

      {/* Away team */}
      <span className="flex items-center gap-2 min-w-0">
        <Link href={`/club/${away.id}`} className="hover:scale-110 transition-transform shrink-0">
          <TeamCrest club={away} size={18} />
        </Link>
        <Link
          href={`/club/${away.id}`}
          className={`truncate hover:underline ${awayWon ? "" : "opacity-70"}`}
          title={`View ${away.name}`}
        >
          {away.name}
        </Link>
      </span>
    </li>
  );
}
