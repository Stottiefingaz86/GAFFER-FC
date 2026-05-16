"use client";

// =====================================================================
// /season/end — END OF SEASON SCRAPBOOK
// Triggered by `career.pendingSeasonReport`. Renders a celebratory
// breakdown of the season just finished:
//   - Champions banner (only when the user lifted the league)
//   - Final position + points + headline form numbers
//   - Trophies + manager awards
//   - Champions / Continental qualification + promotion / relegation
//   - Prize money breakdown + new transfer budget
//   - Golden Boot, top assists and top rated leaderboards
//   - Final standings for all four divisions, with promoted /
//     relegated badges
//   - Champions of every division (the wider football world)
//   - "Start New Season" button — runs `commitSeasonRollover()` which
//     ages players, retires elders, regens youth, regenerates fixtures
//     and bumps career.season.
// =====================================================================

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { PlayerLink } from "@/components/game/PlayerLink";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { useGame } from "@/store/gameStore";
import { COMP_IDS } from "@/data/competitionSeeds";
import { competitionLabel } from "@/engine/historyEngine";
import type {
  Career,
  GameDatabase,
  SeasonReport,
  SeasonReportDivisionStandings,
  SeasonReportPlayerEntry,
  Trophy,
} from "@/types/game";
import { formatValue } from "@/lib/playerValue";
import { playSfx } from "@/lib/sound";

export default function SeasonEndPage() {
  return (
    <AppShell>
      <SeasonEndInner />
    </AppShell>
  );
}

function SeasonEndInner() {
  const career = useGame((s) => s.career)!;
  const db = useGame((s) => s.db)!;
  const commit = useGame((s) => s.commitSeasonRollover);
  const router = useRouter();

  const report: SeasonReport | null = career.pendingSeasonReport ?? null;

  // Bounce out if there's nothing to celebrate (user navigated here by
  // hand). Defer to next tick so React doesn't moan about effect order.
  useEffect(() => {
    if (!report) router.replace("/dashboard");
  }, [report, router]);

  // Final-whistle stinger when the screen first lands. Keep it punchy
  // so the celebration moment hits hard. We guard with a ref so a
  // re-render doesn't re-fire the SFX.
  const stingerFired = useRef(false);
  useEffect(() => {
    if (stingerFired.current || !report) return;
    stingerFired.current = true;
    playSfx("fullTime");
  }, [report]);

  if (!report) return null;

  const won = (report.userFinalPosition ?? 99) === 1;

  return (
    <div className="space-y-3 pb-20">
      {/* HERO ============================================================ */}
      <Hero report={report} db={db} won={won} />

      {/* HEADLINE STATS ROW ============================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 panel overflow-hidden">
        <KV k="Played" v={String(report.userMatches)} />
        <KV k="W / D / L" v={`${report.userWins}-${report.userDraws}-${report.userLosses}`} alt />
        <KV k="GF / GA" v={`${report.userGoalsFor}-${report.userGoalsAgainst}`} />
        <KV k="PPG" v={report.userPpg.toFixed(2)} alt />
      </div>

      {/* TROPHIES + AWARDS ============================================== */}
      {(report.trophies.length > 0 || report.awards.length > 0) && (
        <TrophyCabinet report={report} />
      )}

      {/* CONSEQUENCES STRIP ============================================= */}
      <ConsequenceStrip report={report} />

      {/* MONEY ========================================================== */}
      <PrizeMoneyPanel report={report} />

      {/* INDIVIDUAL HONOURS ============================================ */}
      <Leaderboards report={report} db={db} />

      {/* WORLD SNAPSHOT ================================================ */}
      <DivisionChampionsStrip report={report} db={db} />

      {/* FINAL STANDINGS =============================================== */}
      <FinalStandings report={report} db={db} userClubId={report.userClubId} />

      {/* CTA ============================================================ */}
      <ContinueCTA
        career={career}
        won={won}
        onContinue={() => {
          commit();
          // After commit, pendingSeasonReport is null → AppShell
          // redirects out of /season/end naturally. We push to
          // /dashboard explicitly so the transition is instant.
          router.replace("/dashboard");
        }}
      />
    </div>
  );
}

// =====================================================================
// HERO — full-bleed celebration banner. When the user wins their league
// we crank the colour, drop confetti, and shout CHAMPIONS. Otherwise we
// fall back to a more sober "season ends" treatment.
// =====================================================================

function Hero({ report, db, won }: { report: SeasonReport; db: GameDatabase; won: boolean }) {
  const club = db.clubs[report.userClubId];
  if (!club) return null;
  const primary = club.badge.primaryColor;
  const secondary = club.badge.secondaryColor;
  const tag = won
    ? "CHAMPIONS"
    : report.promoted
      ? "PROMOTED"
      : report.relegated
        ? "RELEGATED"
        : report.championsCupQualified
          ? "CHAMPIONS CUP"
          : report.continentalCupQualified
            ? "CONTINENTAL"
            : "SEASON OVER";
  const tagBg = won
    ? "var(--ss-accent)"
    : report.promoted
      ? "var(--ss-btn-stat)"
      : report.relegated
        ? "var(--ss-btn-exit)"
        : report.championsCupQualified
          ? "var(--ss-btn-stat)"
          : "var(--ss-btn-info)";
  const tagTxt = won ? "#0E0830" : "#FFFFFF";

  return (
    <motion.section
      className="panel overflow-hidden relative"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="panel-bar text-base">
        End of Season · S{report.season}
      </div>
      <div
        className="team-hero relative"
        style={{
          ["--team-1" as string]: primary,
          ["--team-2" as string]: secondary,
        }}
      >
        {/* Confetti — only when the user lifts the league. CSS-only,
            cheap, doesn't need a third-party lib. */}
        {won && <Confetti />}

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-6">
          <ClubLink clubId={club.id} className="block">
            <TeamCrest club={club} size={88} />
          </ClubLink>
          <div className="min-w-0">
            <div
              className="text-[11px] uppercase tracking-[0.32em] font-extrabold inline-block px-2 py-0.5"
              style={{ background: tagBg, color: tagTxt }}
            >
              {tag}
            </div>
            <div className="font-h-display text-2xl sm:text-3xl mt-1.5 truncate" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.6)" }}>
              {club.name}
            </div>
            <div className="text-sm uppercase tracking-[0.06em] font-bold opacity-90">
              {competitionLabel(report.userDivisionId)} ·{" "}
              {report.userFinalPosition !== null
                ? `${ordinal(report.userFinalPosition)} place`
                : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Final Position</div>
            <div className="scoreboard text-5xl sm:text-7xl text-[color:var(--ss-accent)] font-extrabold leading-none" style={{ textShadow: "0 3px 6px rgba(0,0,0,0.6)" }}>
              {report.userFinalPosition ?? "—"}
            </div>
          </div>
        </div>

        {won && (
          <div className="ss-strip text-center px-3 py-2 text-[11px] uppercase tracking-[0.32em] font-extrabold text-[color:var(--ss-accent)]">
            {club.name} are crowned {competitionLabel(report.userDivisionId)} champions
          </div>
        )}
      </div>
    </motion.section>
  );
}

function Confetti() {
  // 24 slips of paper, animated by Tailwind keyframes. Colours pulled
  // from the SS palette plus the accent so they harmonise with the rest
  // of the UI. The container is pointer-events:none so it never eats
  // clicks on the hero.
  const colours = [
    "#F2C20A", "#3148C8", "#1FB220", "#E62020",
    "#A0A0E8", "#FFFFFF", "#F2C20A", "#3148C8",
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => {
        const left = (i * 13 + 7) % 100;
        const delay = (i % 7) * 0.18;
        const duration = 2.4 + ((i * 7) % 14) * 0.1;
        const size = 6 + (i % 4) * 2;
        const colour = colours[i % colours.length];
        const rot = (i * 37) % 360;
        return (
          <motion.span
            key={i}
            className="absolute block"
            style={{
              left: `${left}%`,
              top: "-8%",
              width: size,
              height: size * 1.6,
              background: colour,
              transform: `rotate(${rot}deg)`,
              boxShadow: "0 0 1px rgba(0,0,0,0.4)",
            }}
            initial={{ y: -20, opacity: 0 }}
            animate={{
              y: ["-10%", "120%"],
              opacity: [0, 1, 1, 0],
              rotate: [rot, rot + 480],
            }}
            transition={{
              delay,
              duration,
              repeat: Infinity,
              repeatDelay: 0.4,
              ease: "linear",
            }}
          />
        );
      })}
    </div>
  );
}

// =====================================================================
// TROPHIES + AWARDS — line up every cup the user lifted plus every
// manager award they earned. The big trophy gets a dedicated panel so
// it lands like a poster.
// =====================================================================

function TrophyCabinet({ report }: { report: SeasonReport }) {
  const winners = report.trophies.filter((t) => t.position === 1);
  const podium = report.trophies.filter((t) => t.position && t.position > 1);

  return (
    <section className="panel overflow-hidden">
      <div className="panel-bar text-base">Silverware &amp; Awards</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[color:var(--ss-bg-deep)]">
        {/* Trophies column */}
        <div className="bg-[color:var(--ss-bg)]">
          <div className="ss-strip px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-extrabold text-[color:var(--muted)]">
            Trophies
          </div>
          {winners.length === 0 && podium.length === 0 ? (
            <EmptyRow text="No silverware this season." />
          ) : (
            <ul>
              {winners.map((t, i) => (
                <TrophyRow key={`w_${i}`} t={t} kind="winner" />
              ))}
              {podium.map((t, i) => (
                <TrophyRow key={`p_${i}`} t={t} kind="podium" />
              ))}
            </ul>
          )}
        </div>
        {/* Awards column */}
        <div className="bg-[color:var(--ss-bg)]">
          <div className="ss-strip px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-extrabold text-[color:var(--muted)]">
            Manager Awards
          </div>
          {report.awards.length === 0 ? (
            <EmptyRow text="No awards this season." />
          ) : (
            <ul>
              {report.awards.map((a, i) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-3 py-2 text-white text-sm font-bold uppercase tracking-[0.04em]"
                  style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                >
                  <span className="text-[color:var(--ss-accent)] text-xl leading-none">★</span>
                  <span className="flex-1 truncate">{a.type}</span>
                  <span className="text-[10px] tracking-[0.16em] opacity-75 truncate hidden sm:inline">
                    {a.description ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function TrophyRow({ t, kind }: { t: Trophy; kind: "winner" | "podium" }) {
  const label = competitionLabel(t.competitionId);
  const isWinner = kind === "winner";
  return (
    <li
      className="grid grid-cols-[36px_1fr_auto] items-center gap-3 px-3 py-2.5 text-white font-bold uppercase tracking-[0.04em]"
      style={{
        background: isWinner ? "var(--ss-row-sel)" : "var(--ss-row-2)",
        boxShadow: isWinner ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
      }}
    >
      <span
        className="text-2xl leading-none text-center"
        title={isWinner ? "Champions" : `${ordinal(t.position)} place`}
      >
        {isWinner ? "🏆" : t.position === 2 ? "🥈" : "🥉"}
      </span>
      <span className="text-sm truncate">{label}</span>
      <span
        className="scoreboard text-xs tracking-[0.18em]"
        style={{ color: isWinner ? "var(--ss-accent)" : "rgba(255,255,255,0.7)" }}
      >
        {isWinner ? "WINNERS" : ordinal(t.position).toUpperCase()}
      </span>
    </li>
  );
}

// =====================================================================
// CONSEQUENCE STRIP — small grid of qualification / promotion /
// relegation chips so the user can see at a glance what the finishing
// position bought them.
// =====================================================================

function ConsequenceStrip({ report }: { report: SeasonReport }) {
  type Chip = { label: string; sub: string; tone: "good" | "great" | "bad" | "neutral" };
  const chips: Chip[] = [];

  if (report.championsCupQualified) {
    chips.push({
      label: "Champions Cup",
      sub: "Qualified for next season",
      tone: "great",
    });
  } else if (report.continentalCupQualified) {
    chips.push({
      label: "Continental Cup",
      sub: "Qualified for next season",
      tone: "good",
    });
  } else if (report.userDivisionId === COMP_IDS.PREMIER) {
    chips.push({
      label: "European Football",
      sub: "Missed continental qualification",
      tone: "neutral",
    });
  }

  if (report.promoted) {
    chips.push({ label: "Promotion", sub: "Going up next season", tone: "great" });
  }
  if (report.relegated) {
    chips.push({ label: "Relegation", sub: "Down a division", tone: "bad" });
  }
  if (!report.promoted && !report.relegated && report.userDivisionId !== COMP_IDS.PREMIER) {
    chips.push({
      label: "Division Hold",
      sub: "Same league next season",
      tone: "neutral",
    });
  }

  if (chips.length === 0) return null;

  const toneBg = (t: Chip["tone"]) =>
    t === "great"
      ? "var(--ss-btn-stat)"
      : t === "good"
        ? "var(--ss-btn-info)"
        : t === "bad"
          ? "var(--ss-btn-exit)"
          : "var(--ss-row-2)";
  const toneTxt = (t: Chip["tone"]) => (t === "great" || t === "bad" || t === "good" ? "#FFFFFF" : "#FFFFFF");

  return (
    <section className="panel overflow-hidden">
      <div className="panel-bar text-base">Knock-On Effects</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[color:var(--ss-bg-deep)]">
        {chips.map((c, i) => (
          <div
            key={i}
            className="px-4 py-3 text-center"
            style={{ background: toneBg(c.tone), color: toneTxt(c.tone) }}
          >
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-80">{c.sub}</div>
            <div className="font-extrabold uppercase tracking-[0.04em] text-base mt-0.5">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// PRIZE MONEY — itemised payout list and the new transfer budget.
// =====================================================================

function PrizeMoneyPanel({ report }: { report: SeasonReport }) {
  const sorted = useMemo(
    () => [...report.prizePayouts].sort((a, b) => b.amount - a.amount),
    [report.prizePayouts],
  );
  return (
    <section className="panel overflow-hidden">
      <div className="panel-bar text-base flex items-center justify-between gap-2">
        <span>Prize Money</span>
        <span className="scoreboard text-[color:var(--ss-accent)]">
          {formatValue(report.prizeTotal)}
        </span>
      </div>
      {sorted.length === 0 ? (
        <EmptyRow text="No prize money this season." />
      ) : (
        <ul>
          {sorted.map((p, i) => (
            <li
              key={`${p.competitionId}_${i}`}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-white font-bold uppercase tracking-[0.04em] text-sm"
              style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
            >
              <span className="truncate">{p.reason}</span>
              <span className="scoreboard text-[color:var(--ss-accent)]">
                {formatValue(p.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="ss-strip flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          Updated transfer budget
        </span>
        <span className="scoreboard text-base text-[color:var(--ss-accent)]">
          {formatValue(report.newBudget)}
        </span>
      </div>
    </section>
  );
}

// =====================================================================
// LEADERBOARDS — Golden Boot / Top Assists / Top Rated within the
// user's division.
// =====================================================================

function Leaderboards({ report, db }: { report: SeasonReport; db: GameDatabase }) {
  const goldenBoot = report.topScorers[0] ?? null;
  return (
    <section className="space-y-3">
      {goldenBoot && (
        <GoldenBootHero entry={goldenBoot} db={db} divisionId={report.userDivisionId} />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <LeaderTable
          title="Top Scorers"
          rows={report.topScorers}
          db={db}
          metric={(p) => p.goals}
          metricLabel="GLS"
        />
        <LeaderTable
          title="Top Assists"
          rows={report.topAssists}
          db={db}
          metric={(p) => p.assists}
          metricLabel="AST"
        />
        <LeaderTable
          title="Top Rated"
          rows={report.topRated}
          db={db}
          metric={(p) => +p.averageRating.toFixed(2)}
          metricLabel="AVG"
        />
      </div>
    </section>
  );
}

function GoldenBootHero({
  entry,
  db,
  divisionId,
}: {
  entry: SeasonReportPlayerEntry;
  db: GameDatabase;
  divisionId: string;
}) {
  const club = db.clubs[entry.clubId];
  if (!club) return null;
  return (
    <section className="panel overflow-hidden">
      <div className="panel-bar text-base flex items-center gap-2">
        <span className="text-[color:var(--ss-accent)] text-lg leading-none">⚽</span>
        <span>Golden Boot · {competitionLabel(divisionId)}</span>
      </div>
      <div
        className="team-hero grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4"
        style={{
          ["--team-1" as string]: club.badge.primaryColor,
          ["--team-2" as string]: club.badge.secondaryColor,
        }}
      >
        <PlayerAvatar
          playerId={entry.playerId}
          width={64}
          tint={club.badge.primaryColor}
          border="rgba(0,0,0,0.5)"
        />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] opacity-80">Top scorer</div>
          <div className="font-h-display text-xl sm:text-2xl truncate" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
            <PlayerLink playerId={entry.playerId}>{entry.name}</PlayerLink>
          </div>
          <div className="text-xs uppercase tracking-[0.06em] font-bold opacity-90 truncate">
            <ClubLink clubId={club.id}>{club.name}</ClubLink> · {entry.position}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">Goals</div>
          <div className="scoreboard text-4xl sm:text-5xl text-[color:var(--ss-accent)] font-extrabold leading-none" style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
            {entry.goals}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-80 mt-1">
            {entry.assists} assists · {entry.appearances} apps
          </div>
        </div>
      </div>
    </section>
  );
}

function LeaderTable({
  title,
  rows,
  db,
  metric,
  metricLabel,
}: {
  title: string;
  rows: SeasonReportPlayerEntry[];
  db: GameDatabase;
  metric: (p: SeasonReportPlayerEntry) => number;
  metricLabel: string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-bar text-sm flex items-center justify-between gap-2">
        <span>{title}</span>
        <span className="text-[10px] tracking-[0.18em] opacity-75">{metricLabel}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyRow text="No data" />
      ) : (
        <ul>
          {rows.map((p, i) => {
            const club = db.clubs[p.clubId];
            return (
              <li
                key={p.playerId}
                className="grid grid-cols-[24px_28px_1fr_auto] items-center gap-2 px-3 py-1.5 text-white font-bold uppercase tracking-[0.04em] text-[12px]"
                style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
              >
                <span className="scoreboard text-[color:var(--ss-accent)] text-right">
                  {i + 1}
                </span>
                {club ? (
                  <TeamCrest club={club} size={20} />
                ) : (
                  <span />
                )}
                <span className="truncate">
                  <PlayerLink playerId={p.playerId}>{p.name}</PlayerLink>
                </span>
                <span className="scoreboard text-[color:var(--ss-accent)]">
                  {metric(p)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =====================================================================
// DIVISION CHAMPIONS — strip showing who lifted which league. Helps
// the user feel they're inside a wider football world.
// =====================================================================

function DivisionChampionsStrip({ report, db }: { report: SeasonReport; db: GameDatabase }) {
  if (report.divisionChampions.length === 0) return null;
  return (
    <section className="panel overflow-hidden">
      <div className="panel-bar text-base">Champions of S{report.season}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[color:var(--ss-bg-deep)]">
        {report.divisionChampions.map((c) => {
          const club = db.clubs[c.clubId];
          if (!club) return null;
          return (
            <div key={c.divisionId} className="bg-[color:var(--ss-row)] px-3 py-3 text-center">
              <ClubLink clubId={club.id} className="block">
                <TeamCrest club={club} size={48} className="mx-auto" />
                <div className="text-[10px] uppercase tracking-[0.18em] opacity-75 mt-1">
                  {competitionLabel(c.divisionId)}
                </div>
                <div className="font-extrabold uppercase tracking-[0.04em] text-sm text-white truncate mt-0.5">
                  {club.name}
                </div>
              </ClubLink>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// =====================================================================
// FINAL STANDINGS — compact full tables for all four divisions, with
// promoted / relegated rows highlighted. Default-expanded for the
// user's division so the celebratory finish is the first thing they
// see; the others are collapsible <details>.
// =====================================================================

function FinalStandings({
  report,
  db,
  userClubId,
}: {
  report: SeasonReport;
  db: GameDatabase;
  userClubId: string;
}) {
  return (
    <section className="space-y-2">
      {report.standings.map((standings) => (
        <DivisionTable
          key={standings.divisionId}
          standings={standings}
          db={db}
          userClubId={userClubId}
          defaultOpen={standings.divisionId === report.userDivisionId}
        />
      ))}
    </section>
  );
}

function DivisionTable({
  standings,
  db,
  userClubId,
  defaultOpen,
}: {
  standings: SeasonReportDivisionStandings;
  db: GameDatabase;
  userClubId: string;
  defaultOpen: boolean;
}) {
  const promoSet = new Set(standings.promotedClubIds);
  const relSet = new Set(standings.relegatedClubIds);
  return (
    <details className="panel overflow-hidden group" open={defaultOpen}>
      <summary className="panel-bar text-sm cursor-pointer flex items-center justify-between gap-2 list-none">
        <span>{competitionLabel(standings.divisionId)} · Final Table</span>
        <span className="text-[10px] tracking-[0.18em] opacity-70 group-open:rotate-90 transition-transform">▶</span>
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-bold uppercase tracking-[0.04em]">
          <thead>
            <tr className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)]">
              <th className="text-left px-2 py-1.5 w-8">#</th>
              <th className="text-left px-2 py-1.5">Club</th>
              <th className="text-center px-1 py-1.5 w-8">P</th>
              <th className="text-center px-1 py-1.5 w-8">W</th>
              <th className="text-center px-1 py-1.5 w-8">D</th>
              <th className="text-center px-1 py-1.5 w-8">L</th>
              <th className="text-center px-1 py-1.5 w-12">GF</th>
              <th className="text-center px-1 py-1.5 w-12">GA</th>
              <th className="text-center px-1 py-1.5 w-12">GD</th>
              <th className="text-center px-1 py-1.5 w-10 text-[color:var(--ss-accent)]">PTS</th>
            </tr>
          </thead>
          <tbody>
            {standings.rows.map((r) => {
              const club = db.clubs[r.clubId];
              if (!club) return null;
              const isUser = r.clubId === userClubId;
              const isPromo = promoSet.has(r.clubId);
              const isRel = relSet.has(r.clubId);
              const bg = isUser
                ? "var(--ss-row-user)"
                : isPromo
                  ? "color-mix(in srgb, var(--ss-btn-stat) 28%, var(--ss-row))"
                  : isRel
                    ? "color-mix(in srgb, var(--ss-btn-exit) 28%, var(--ss-row))"
                    : r.position % 2 === 0 ? "var(--ss-row-2)" : "var(--ss-row)";
              const edge = isUser
                ? "inset 4px 0 0 0 var(--ss-accent)"
                : isPromo
                  ? "inset 4px 0 0 0 var(--ss-btn-stat)"
                  : isRel
                    ? "inset 4px 0 0 0 var(--ss-btn-exit)"
                    : undefined;
              const gd = r.goalsFor - r.goalsAgainst;
              return (
                <tr key={r.clubId} style={{ background: bg, boxShadow: edge, color: "#FFFFFF" }}>
                  <td className="px-2 py-1 scoreboard text-[color:var(--ss-accent)]">
                    {r.position}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamCrest club={club} size={18} />
                      <span className="truncate">
                        <ClubLink clubId={club.id}>{club.name}</ClubLink>
                      </span>
                    </div>
                  </td>
                  <td className="text-center px-1 py-1 scoreboard">{r.played}</td>
                  <td className="text-center px-1 py-1 scoreboard">{r.won}</td>
                  <td className="text-center px-1 py-1 scoreboard">{r.drawn}</td>
                  <td className="text-center px-1 py-1 scoreboard">{r.lost}</td>
                  <td className="text-center px-1 py-1 scoreboard">{r.goalsFor}</td>
                  <td className="text-center px-1 py-1 scoreboard">{r.goalsAgainst}</td>
                  <td className="text-center px-1 py-1 scoreboard">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="text-center px-1 py-1 scoreboard text-[color:var(--ss-accent)]">
                    {r.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(standings.promotedClubIds.length > 0 || standings.relegatedClubIds.length > 0) && (
        <div className="ss-strip text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 text-[color:var(--muted)] flex items-center gap-3 flex-wrap">
          {standings.promotedClubIds.length > 0 && (
            <span>
              <span className="inline-block w-2 h-2 align-middle mr-1" style={{ background: "var(--ss-btn-stat)" }} />
              Promoted
            </span>
          )}
          {standings.relegatedClubIds.length > 0 && (
            <span>
              <span className="inline-block w-2 h-2 align-middle mr-1" style={{ background: "var(--ss-btn-exit)" }} />
              Relegated
            </span>
          )}
        </div>
      )}
    </details>
  );
}

// =====================================================================
// CONTINUE CTA — fixed bottom bar so the user always knows how to
// proceed even if the standings tables push the rest of the layout
// off-screen.
// =====================================================================

function ContinueCTA({
  career,
  won,
  onContinue,
}: {
  career: Career;
  won: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-3 sm:mx-0">
      <button
        type="button"
        onClick={onContinue}
        className="btn btn-stat !rounded-none w-full h-14 border-0 text-base flex items-center justify-center gap-3"
      >
        <span className="text-[color:var(--ss-bar-text)] uppercase tracking-[0.04em]">
          {won ? "Begin the Title Defence" : "Start New Season"}
        </span>
        <span className="scoreboard">▶ S{career.season + 1}</span>
      </button>
    </div>
  );
}

// =====================================================================
// SHARED ROW ATOMS
// =====================================================================

function KV({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div
      className="px-3 py-3 text-center"
      style={{ background: alt ? "var(--ss-strip)" : "var(--ss-bg-2)" }}
    >
      <div className="text-[10px] uppercase text-[color:var(--muted)] tracking-[0.16em]">
        {k}
      </div>
      <div className="font-extrabold scoreboard text-base text-white mt-0.5">{v}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="ss-row px-4 py-4 text-[12px] uppercase tracking-[0.04em] text-white/70 text-center">
      {text}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
