"use client";

import Link from "next/link";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { PlayerLink } from "@/components/game/PlayerLink";
import { useGame } from "@/store/gameStore";
import { motion } from "framer-motion";
import { formatValue } from "@/lib/playerValue";
import type { Club, Fixture, GameDatabase } from "@/types/game";
import { isLeagueCompetitionId } from "@/data/nations";
import { playersForClub } from "@/lib/dbIndex";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

function DashboardInner() {
  const career = useGame((s) => s.career)!;
  const db = useGame((s) => s.db)!;
  const userClub = db.clubs[career.selectedClubId];
  // Indexed lookup — O(1) after first call this session (see lib/dbIndex).
  const players = useMemo(() => playersForClub(db.players, userClub.id), [db.players, userClub.id]);
  const nextFx = useGame((s) => s.getNextUserFixture)();
  const opp = nextFx
    ? db.clubs[nextFx.homeId === userClub.id ? nextFx.awayId : nextFx.homeId]
    : null;
  const isHome = nextFx?.homeId === userClub.id;
  const competitionName = nextFx ? db.competitions[nextFx.competitionId].name : "";

  const myRow =
    db.tables[userClub.divisionId].rows.findIndex((r) => r.clubId === userClub.id) + 1;

  const injured = players.filter((p) => p.isInjured).length;
  const suspended = players.filter((p) => p.isSuspended).length;
  const hotPlayer = [...players].sort((a, b) => b.form - a.form)[0];
  const squadValue = players.reduce((a, p) => a + p.value, 0);

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {/* Up Next — main matchup card */}
      <motion.section
        className="panel md:col-span-2 overflow-hidden"
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      >
        <div className="panel-bar text-base">
          Up Next · Week {career.week} · {competitionName || "—"}
        </div>
        {nextFx && opp ? (
          <>
            <div className="bg-[color:var(--ss-row-bench)] grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 text-white">
              <ClubLink
                clubId={isHome ? userClub.id : opp.id}
                className="flex items-center gap-3 min-w-0"
              >
                <TeamCrest club={isHome ? userClub : opp} size={56} />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">Home</div>
                  <div className="font-extrabold uppercase tracking-[0.04em] truncate">{isHome ? userClub.name : opp.name}</div>
                  <div className="scoreboard text-xs text-white/80">OVR {(isHome ? userClub : opp).squadRating}</div>
                </div>
              </ClubLink>
              <div className="scoreboard text-3xl font-extrabold tracking-[0.2em] text-white/90 px-2">VS</div>
              <ClubLink
                clubId={!isHome ? userClub.id : opp.id}
                className="flex items-center gap-3 min-w-0 justify-end text-right"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">Away</div>
                  <div className="font-extrabold uppercase tracking-[0.04em] truncate">{!isHome ? userClub.name : opp.name}</div>
                  <div className="scoreboard text-xs text-white/80">OVR {(!isHome ? userClub : opp).squadRating}</div>
                </div>
                <TeamCrest club={!isHome ? userClub : opp} size={56} />
              </ClubLink>
            </div>

            <div className="ss-strip flex flex-wrap items-center gap-2 px-3 py-2 text-[11px]">
              <Tag label="Stadium" value={(isHome ? userClub : opp).stadium.name} />
              <Tag label="Opponent" value={`OVR ${opp.squadRating}`} />
              {opp.id === userClub.rivalClubId && (
                <span className="bg-[color:var(--ss-btn-exit)] text-white px-2 py-0.5 font-extrabold tracking-[0.12em]">RIVALRY</span>
              )}
              <Tag label="Board" value={`${userClub.boardConfidence}%`} />
              <Tag label="Fans" value={`${userClub.fanMood}%`} />
            </div>

            <div className="grid grid-cols-3 gap-0">
              <Link href="/match" className="btn btn-stat h-12 text-sm !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)]">
                Play Match
              </Link>
              <Link href="/tactics" className="btn btn-action h-12 text-sm !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)]">
                Tactics
              </Link>
              <Link href="/squad" className="btn btn-info h-12 text-sm !rounded-none border-0">
                Squad
              </Link>
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-sm text-[color:var(--muted)] text-center uppercase tracking-[0.12em]">
            No more fixtures this season. Time to plan a transfer raid.
          </div>
        )}
      </motion.section>

      {/* Status panel */}
      <section className="panel overflow-hidden">
        <div className="panel-bar text-base">Status</div>
        <div className="divide-y divide-[color:var(--ss-bg-deep)]">
          <Row k="League" v={`${ordinal(myRow)} · ${db.competitions[userClub.divisionId].shortName}`} />
          <Row k="Manager" v={`${career.manager.managerLevelLabel} · L${career.manager.reputationLevel}`} />
          <Row k="Budget" v={`£${(userClub.budget / 1_000_000).toFixed(2)}m`} />
          <Row k="Wages" v={`£${(userClub.wageBudget / 1_000_000).toFixed(2)}m`} />
          <Row k="Squad OVR" v={`${userClub.squadRating}`} accent />
          <Row k="Squad Value" v={formatValue(squadValue)} accent />
          <Row k="Stadium" v={`${userClub.stadium.capacity.toLocaleString()}`} />
        </div>
        {(injured > 0 || suspended > 0) && (
          <div className="bg-[color:var(--ss-btn-exit)] px-3 py-1.5 text-white text-[11px] uppercase tracking-[0.14em] font-bold">
            {injured > 0 && `⚕ ${injured} injured `}{suspended > 0 && `⛔ ${suspended} suspended`}
          </div>
        )}
      </section>

      {/* Hot player — blended in the user's club colours so it feels like
          "this is a player at YOUR club" without flooding the screen green. */}
      <section className="panel overflow-hidden">
        <div className="panel-bar text-base">Hot Player</div>
        {hotPlayer && (
          <PlayerLink
            playerId={hotPlayer.id}
            stopPropagation={false}
            className="block w-full"
          >
            <div
              className="team-hero flex items-center gap-3 px-3 py-3 hover:brightness-110 transition-[filter]"
              style={{
                ["--team-1" as string]: userClub.badge.primaryColor,
                ["--team-2" as string]: userClub.badge.secondaryColor,
              }}
            >
              <div className="relative z-[1] size-12 grid place-items-center font-extrabold scoreboard text-lg bg-[color:var(--ss-bg-deep)] text-[color:var(--ss-accent)]">
                {hotPlayer.lastName.slice(0, 2).toUpperCase()}
              </div>
              <div className="relative z-[1] flex-1 min-w-0">
                <div
                  className="font-extrabold uppercase tracking-[0.04em] truncate"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                >
                  {hotPlayer.displayName}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] opacity-85">
                  {hotPlayer.detailedPosition} · {hotPlayer.age}y · OVR {hotPlayer.overall}
                </div>
                <div className="text-[11px] mt-0.5 scoreboard">
                  FORM {hotPlayer.form} · MOR {hotPlayer.morale} · {formatValue(hotPlayer.value)}
                </div>
              </div>
            </div>
          </PlayerLink>
        )}
      </section>

      {/* Objectives */}
      <section className="panel md:col-span-2 overflow-hidden">
        <div className="panel-bar text-base">Season Objectives</div>
        <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
          {userClub.seasonObjectives.map((o, i) => (
            <li
              key={i}
              className="px-4 py-2.5 flex items-center gap-3 text-white font-bold uppercase tracking-[0.04em] text-sm"
              style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
            >
              <span className="bg-[color:var(--ss-bg-deep)] text-[color:var(--ss-accent)] scoreboard size-6 grid place-items-center text-xs font-extrabold">
                {i + 1}
              </span>
              <span className="flex-1">{o}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Full-season schedule for the user's club — every league fixture
       * and cup tie, played and upcoming. Auto-scrolls to the next
       * unplayed fixture so the user opens the page already looking at
       * their next match. */}
      <FixturesPanel db={db} userClub={userClub} />

      {/* Quick links */}
      <section className="panel overflow-hidden">
        <div className="panel-bar text-base">Quick Links</div>
        <div className="grid grid-cols-2 gap-0">
          <Link href="/transfers" className="btn btn-action !rounded-none border-0 border-r-2 border-b-2 border-[color:var(--ss-bg-deep)] h-11 text-xs">Transfers</Link>
          <Link href="/training" className="btn btn-action !rounded-none border-0 border-b-2 border-[color:var(--ss-bg-deep)] h-11 text-xs">Training</Link>
          <Link href="/club" className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-11 text-xs">Club</Link>
          <Link href="/cups" className="btn btn-action !rounded-none border-0 h-11 text-xs">Cups</Link>
        </div>
        <div className="ss-strip px-3 py-1.5 text-[10px] tracking-[0.14em]">
          Phase 2 features coming soon
        </div>
      </section>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string | number; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-3 px-3 py-2 bg-[color:var(--ss-bg-2)]">
      <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">{k}</span>
      <span
        className={`font-bold uppercase tracking-[0.04em] text-sm truncate ${accent ? "text-[color:var(--ss-accent)] scoreboard" : "text-white"}`}
      >
        {v}
      </span>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[color:var(--ss-bg-2)] px-2 py-0.5 text-white">
      <span className="text-[9px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{label}</span>
      <span className="font-bold uppercase tracking-[0.04em]">{value}</span>
    </span>
  );
}

function ordinal(n: number): string {
  if (n <= 0) return `${n}`;
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// =====================================================================
// <FixturesPanel /> — every fixture involving the user's club this
// season. Shows result + W/D/L badge for played ties; "vs" for
// upcoming. The first unplayed fixture is highlighted (so the user
// can spot their next match instantly) and the panel auto-scrolls to
// it on mount, like a season ticket book opening at today's page.
// =====================================================================

type FixtureFilter = "all" | "league" | "cups";

function FixturesPanel({
  db,
  userClub,
}: {
  db: GameDatabase;
  userClub: Club;
}) {
  const [filter, setFilter] = useState<FixtureFilter>("all");

  const fixtures = useMemo(() => {
    return db.fixtures
      .filter((f) => f.homeId === userClub.id || f.awayId === userClub.id)
      .filter((f) => {
        if (filter === "all") return true;
        const isLeague = isLeagueCompetitionId(f.competitionId);
        return filter === "league" ? isLeague : !isLeague;
      })
      .sort((a, b) => a.week - b.week);
  }, [db.fixtures, userClub.id, filter]);

  // Index of the next unplayed fixture — used to anchor the
  // auto-scroll and to mark the row visually.
  const nextIdx = useMemo(
    () => fixtures.findIndex((f) => !f.played),
    [fixtures],
  );

  // Counts for the filter chips (all / league / cups).
  const counts = useMemo(() => {
    const all = db.fixtures.filter(
      (f) => f.homeId === userClub.id || f.awayId === userClub.id,
    );
    const league = all.filter((f) => isLeagueCompetitionId(f.competitionId));
    return { all: all.length, league: league.length, cups: all.length - league.length };
  }, [db.fixtures, userClub.id]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const nextRowRef = useRef<HTMLDivElement | null>(null);
  // Once on mount (and on filter change), scroll the list so the next
  // fixture is in view. We use a small offset so a few played rows
  // remain visible above for context.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const target = nextRowRef.current;
    if (!scroller || !target) return;
    scroller.scrollTop = Math.max(0, target.offsetTop - 60);
  }, [filter, nextIdx]);

  // Compute season summary numbers (W/D/L + GF/GA) from played fixtures
  // — quick at-a-glance stats above the list.
  const summary = useMemo(() => {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0;
    fixtures.forEach((f) => {
      if (!f.played || !f.result) return;
      const isHome = f.homeId === userClub.id;
      const ourGoals = isHome ? f.result.homeGoals : f.result.awayGoals;
      const oppGoals = isHome ? f.result.awayGoals : f.result.homeGoals;
      gf += ourGoals;
      ga += oppGoals;
      if (ourGoals > oppGoals) w++;
      else if (ourGoals < oppGoals) l++;
      else d++;
    });
    return { w, d, l, gf, ga };
  }, [fixtures, userClub.id]);

  return (
    <section className="panel md:col-span-3 overflow-hidden">
      <div className="panel-bar text-base flex items-center gap-3 flex-wrap">
        <span>Fixtures &amp; Results</span>
        <span className="ml-auto scoreboard text-xs text-[color:var(--ss-cream)] flex gap-3">
          <span className="text-[color:var(--ss-btn-stat)]">W {summary.w}</span>
          <span className="text-[color:var(--ss-accent)]">D {summary.d}</span>
          <span className="text-[color:var(--ss-btn-exit)]">L {summary.l}</span>
          <span className="opacity-80">{summary.gf}-{summary.ga}</span>
        </span>
      </div>

      {/* Filter strip */}
      <div className="bg-[color:var(--ss-bg-deep)] flex border-y border-[color:var(--ss-bar-edge)]">
        <FilterTab
          label="All"
          count={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterTab
          label="League"
          count={counts.league}
          active={filter === "league"}
          onClick={() => setFilter("league")}
        />
        <FilterTab
          label="Cups"
          count={counts.cups}
          active={filter === "cups"}
          onClick={() => setFilter("cups")}
        />
      </div>

      <div
        ref={scrollerRef}
        className="bg-[color:var(--ss-bg)] max-h-[420px] overflow-auto scrollbar-thin"
      >
        {fixtures.length === 0 ? (
          <div className="px-3 py-6 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
            No fixtures found.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {fixtures.map((f, i) => (
              <FixtureRow
                key={f.id}
                ref={i === nextIdx ? nextRowRef : undefined}
                fixture={f}
                userClub={userClub}
                db={db}
                index={i}
                isNext={i === nextIdx}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`tab flex-1 ${active ? "active" : ""}`}
      disabled={count === 0}
      style={count === 0 ? { opacity: 0.4 } : undefined}
    >
      {label}
      <span className="ml-1.5 text-[10px] opacity-70">{count}</span>
    </button>
  );
}

// One row in the fixture list. Played ties show the score with a
// W/D/L block on the left edge; upcoming ties show "vs". The "next"
// fixture also gets a subtle accent so the user can scan to it fast.
const FixtureRow = forwardRef<
  HTMLDivElement,
  {
    fixture: Fixture;
    userClub: Club;
    db: GameDatabase;
    index: number;
    isNext: boolean;
  }
>(function FixtureRow({ fixture, userClub, db, index, isNext }, ref) {
  const home = db.clubs[fixture.homeId];
  const away = db.clubs[fixture.awayId];
  if (!home || !away) return null;

  const isHome = home.id === userClub.id;
  const opp = isHome ? away : home;
  const competition = db.competitions[fixture.competitionId];
  const isLeague = isLeagueCompetitionId(fixture.competitionId);

  let result: "W" | "D" | "L" | null = null;
  let scoreLabel = "vs";
  if (fixture.played && fixture.result) {
    // CRITICAL: scoreLabel is HOME-AWAY ordered to match the row's
    // visual layout (home club rendered on the left of the score,
    // away club on the right). If we wrote it in user-opp order an
    // away win would render as e.g. "MEA 1-5 LMY" when the actual
    // result was LMY winning 5-1 away — the brain reads "MEA 1, LMY 5"
    // and concludes the user won when in fact they lost.
    // The W/D/L tag stays computed from the USER's perspective.
    scoreLabel = `${fixture.result.homeGoals}-${fixture.result.awayGoals}`;
    const ourGoals = isHome ? fixture.result.homeGoals : fixture.result.awayGoals;
    const oppGoals = isHome ? fixture.result.awayGoals : fixture.result.homeGoals;
    result =
      ourGoals > oppGoals ? "W" : ourGoals < oppGoals ? "L" : "D";
  }

  const resultColor =
    result === "W"
      ? "var(--ss-btn-stat)"
      : result === "L"
        ? "var(--ss-btn-exit)"
        : result === "D"
          ? "var(--ss-accent)"
          : "transparent";

  const rowBg = isNext
    ? "var(--ss-row-user)"
    : index % 2 === 0
      ? "var(--ss-row)"
      : "var(--ss-row-2)";

  return (
    <div
      ref={ref}
      className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[32px_70px_1fr_auto_auto_1fr_72px] items-center gap-2 sm:gap-2 px-2 sm:px-3 py-2 text-white text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{
        background: rowBg,
        boxShadow: isNext ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
      }}
    >
      {/* W/D/L tag (or empty placeholder for upcoming) */}
      <span
        className="scoreboard text-center text-[12px] py-1"
        style={{
          background: result ? resultColor : "transparent",
          color: result === "D" ? "#0A0A0A" : "#FFFFFF",
          minHeight: 24,
        }}
      >
        {result ?? (isNext ? "▶" : "")}
      </span>

      {/* Week + competition tag — hidden on mobile, shown desktop. */}
      <span className="hidden sm:flex flex-col text-[10px] tracking-[0.14em] opacity-80 leading-tight">
        <span className="scoreboard text-[color:var(--ss-cream)]">WK {fixture.week}</span>
        <span className="truncate" title={competition?.name}>
          {isLeague ? competition?.shortName ?? "LGE" : "CUP"}
          {fixture.stage && !isLeague ? ` · ${fixture.stage}` : ""}
        </span>
      </span>

      {/* Home — wraps with crest. Bold for the user's side. */}
      <ClubLink
        clubId={home.id}
        className="flex items-center gap-1.5 sm:gap-2 min-w-0"
        title={`View ${home.name}`}
      >
        <TeamCrest club={home} size={18} />
        <span
          className="truncate"
          style={{
            fontWeight: home.id === userClub.id ? 800 : 600,
            opacity: home.id === userClub.id ? 1 : 0.85,
          }}
        >
          {home.shortName}
        </span>
      </ClubLink>

      {/* Score / vs */}
      <span
        className="scoreboard text-[14px] sm:text-[16px] px-2 py-0.5 text-center"
        style={{
          background: "var(--ss-bg-deep)",
          minWidth: 56,
          color:
            result === "W"
              ? "var(--ss-btn-stat)"
              : result === "L"
                ? "var(--ss-btn-exit)"
                : "#FFFFFF",
        }}
      >
        {scoreLabel}
      </span>

      {/* Away */}
      <ClubLink
        clubId={away.id}
        className="hidden sm:flex items-center gap-2 min-w-0 justify-end text-right"
        title={`View ${away.name}`}
      >
        <span
          className="truncate"
          style={{
            fontWeight: away.id === userClub.id ? 800 : 600,
            opacity: away.id === userClub.id ? 1 : 0.85,
          }}
        >
          {away.shortName}
        </span>
        <TeamCrest club={away} size={18} />
      </ClubLink>

      {/* Mobile-only: opponent compact label so the row doesn't blow
       * up to two lines on small screens. Hidden on sm+ where the full
       * home/away pair is shown above. */}
      <span className="sm:hidden flex items-center gap-1.5 justify-end min-w-0 text-[11px]">
        <span className="opacity-70">{isHome ? "v" : "@"}</span>
        <TeamCrest club={opp} size={14} />
        <span className="truncate">{opp.shortName}</span>
      </span>
    </div>
  );
});
