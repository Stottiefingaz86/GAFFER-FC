"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { PlayerLink } from "@/components/game/PlayerLink";
import { useGame } from "@/store/gameStore";
import type { MatchResult, Player } from "@/types/game";
import { MATCHDAY_LABEL } from "@/types/game";
import { formatValue } from "@/lib/playerValue";
import { playSfx, stopAmbient } from "@/lib/sound";

export default function MatchResultPage() {
  return (
    <AppShell>
      <ResultInner />
    </AppShell>
  );
}

function ResultInner() {
  const db = useGame((s) => s.db)!;
  const career = useGame((s) => s.career)!;
  const userClub = useGame((s) => s.getUserClub)()!;

  const lastUserFx = useMemo(() =>
    [...db.fixtures]
      .filter((f) => f.played && f.result && (f.homeId === userClub.id || f.awayId === userClub.id))
      .sort((a, b) => b.week - a.week)[0],
    [db.fixtures, userClub.id]);
  const result: MatchResult | null = lastUserFx?.result ?? null;

  const allPlayers = useMemo(
    () => result
      ? [...result.ratings.home, ...result.ratings.away].map((r) => ({
          r,
          player: db.players[r.playerId] as Player | undefined,
        }))
      : [],
    [result, db.players]
  );

  // Final whistle stinger when arriving from the watch / quick-sim flow.
  // Make sure the highlight crowd ambience is dropped first so it doesn't
  // bleed into the post-match screen.
  useEffect(() => {
    if (!result) return;
    stopAmbient();
    playSfx("fullTime");
  }, [result]);

  if (!result) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base">No Recent Match</div>
        <Link href="/dashboard" className="btn btn-primary !rounded-none w-full h-12 border-0">Back to Dashboard</Link>
      </div>
    );
  }

  const home = db.clubs[result.homeId];
  const away = db.clubs[result.awayId];
  const userIsHome = home.id === userClub.id;
  const opp = userIsHome ? away : home;
  const userScore = userIsHome ? result.homeGoals : result.awayGoals;
  const oppScore = userIsHome ? result.awayGoals : result.homeGoals;
  const won = userScore > oppScore;
  const drew = userScore === oppScore;

  const motm = allPlayers.find((p) => p.r.playerId === result.manOfMatchPlayerId);

  const tableRow = userClub.divisionId
    ? db.tables[userClub.divisionId]?.rows.findIndex((r) => r.clubId === userClub.id) + 1
    : 0;

  const verdict = won ? "VICTORY" : drew ? "DRAW" : "DEFEAT";
  const verdictBg = won ? "var(--ss-btn-stat)" : drew ? "var(--ss-accent)" : "var(--ss-btn-exit)";
  const verdictTxt = drew ? "#0A0A0A" : "#FFFFFF";

  return (
    <div className="space-y-3">
      <motion.section
        className="panel overflow-hidden"
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      >
        <div className="panel-bar text-base">
          {db.competitions[result.competitionId].name.toUpperCase()} · S{career.season} · W{career.week - 1}
          {lastUserFx?.dayOfWeek && (
            <span className="opacity-75"> · {MATCHDAY_LABEL[lastUserFx.dayOfWeek]}</span>
          )}
        </div>
        <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 text-white">
          <ClubLink clubId={home.id} className="text-center min-w-0 block">
            <TeamCrest club={home} size={64} className="mx-auto" />
            <div className="text-sm font-extrabold uppercase tracking-[0.04em] mt-1 truncate" title={home.name}>
              {home.name}
            </div>
          </ClubLink>
          <div className="scoreboard text-5xl sm:text-6xl font-extrabold text-[color:var(--ss-accent)] px-2 text-center">
            {result.homeGoals}<span className="text-white/40 mx-2">·</span>{result.awayGoals}
          </div>
          <ClubLink clubId={away.id} className="text-center min-w-0 block">
            <TeamCrest club={away} size={64} className="mx-auto" />
            <div className="text-sm font-extrabold uppercase tracking-[0.04em] mt-1 truncate" title={away.name}>
              {away.name}
            </div>
          </ClubLink>
        </div>
        <div
          className="text-center font-extrabold uppercase tracking-[0.32em] py-2 text-base"
          style={{ background: verdictBg, color: verdictTxt }}
        >
          {verdict}
        </div>
        <div className="ss-strip text-[10px] tracking-[0.18em] text-center px-3 py-2 text-[color:var(--ss-cream)]">
          {result.story} · {result.weather} · {result.attendance.toLocaleString()} crowd
        </div>
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">Match Stats</div>
          <Row k="xG" h={result.stats.home.xG} a={result.stats.away.xG} userIsHome={userIsHome} />
          <Row k="Shots" h={result.stats.home.shots} a={result.stats.away.shots} userIsHome={userIsHome} alt />
          <Row k="On Target" h={result.stats.home.shotsOnTarget} a={result.stats.away.shotsOnTarget} userIsHome={userIsHome} />
          <Row k="Possession" h={`${result.stats.home.possession}%`} a={`${result.stats.away.possession}%`} userIsHome={userIsHome} alt />
          <Row k="Corners" h={result.stats.home.corners} a={result.stats.away.corners} userIsHome={userIsHome} />
          <Row k="Fouls" h={result.stats.home.fouls} a={result.stats.away.fouls} userIsHome={userIsHome} alt />
          <Row k="Yellows" h={result.stats.home.yellow} a={result.stats.away.yellow} userIsHome={userIsHome} />
          <Row k="Reds" h={result.stats.home.red} a={result.stats.away.red} userIsHome={userIsHome} alt />
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">Goals + Story</div>
          <div
            className="team-hero-vs grid grid-cols-2 px-3 py-2 text-white text-sm font-bold uppercase tracking-[0.04em] gap-3"
            style={{
              ["--team-h" as string]: home.badge.primaryColor,
              ["--team-a" as string]: away.badge.primaryColor,
            }}
          >
            <ul>
              {result.events.filter((e) => ["Goal","WonderGoal","Deflection","PenaltyScored","OwnGoal"].includes(e.type) && e.team === "home").map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                  <span className="truncate">
                    {e.playerId
                      ? <PlayerLink playerId={e.playerId}>{e.playerName ?? "—"}</PlayerLink>
                      : (e.playerName ?? "—")}
                  </span>
                  <span className="scoreboard text-xs text-[color:var(--ss-accent)]">{e.minute}&apos;</span>
                </li>
              ))}
            </ul>
            <ul className="text-right">
              {result.events.filter((e) => ["Goal","WonderGoal","Deflection","PenaltyScored","OwnGoal"].includes(e.type) && e.team === "away").map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-2" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                  <span className="scoreboard text-xs text-[color:var(--ss-accent)]">{e.minute}&apos;</span>
                  <span className="truncate">
                    {e.playerId
                      ? <PlayerLink playerId={e.playerId}>{e.playerName ?? "—"}</PlayerLink>
                      : (e.playerName ?? "—")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)] text-[10px] tracking-[0.2em] uppercase font-extrabold text-center py-1.5 border-y border-[color:var(--ss-bar-edge)]">
            Story
          </div>
          <ul className="bg-[color:var(--ss-bg)] max-h-44 overflow-auto scrollbar-thin">
            {result.events.filter((e) => !["Kickoff","HalfTime","FullTime"].includes(e.type)).map((e, i) => (
              <li
                key={i}
                className="flex gap-2 px-3 py-1 text-[12px] text-white font-bold uppercase tracking-[0.04em]"
                style={{ background: i % 2 === 0 ? "var(--ss-bg-2)" : "var(--ss-strip)" }}
              >
                <span className="scoreboard w-9 shrink-0 text-[color:var(--ss-accent)] text-right">{e.minute}&apos;</span>
                <span className="flex-1">{e.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm truncate">
            Ratings · {userIsHome ? home.name : away.name}
          </div>
          <ul className="max-h-[320px] overflow-auto scrollbar-thin">
            {(userIsHome ? result.ratings.home : result.ratings.away)
              .sort((a, b) => b.rating - a.rating)
              .map((r, i) => {
                const p = db.players[r.playerId];
                if (!p) return null;
                const isMotm = r.playerId === result.manOfMatchPlayerId;
                const bg = isMotm
                  ? "var(--ss-accent)"
                  : i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)";
                return (
                  <li
                    key={r.playerId}
                    className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-1.5 font-bold uppercase tracking-[0.04em] text-[12px]"
                    style={{
                      background: bg,
                      color: isMotm ? "#0E0830" : "#FFFFFF",
                      boxShadow: !isMotm ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                    }}
                  >
                    <span className="truncate flex items-center gap-2 min-w-0">
                      {isMotm && <span className="bg-[color:var(--ss-bg-deep)] text-[color:var(--ss-accent)] text-[9px] px-1 font-extrabold">★MOTM</span>}
                      <span className="truncate">
                        <PlayerLink playerId={p.id}>{p.displayName}</PlayerLink>
                      </span>
                      <span className="scoreboard text-[10px] whitespace-nowrap" style={{ color: isMotm ? "#0E0830" : "var(--ss-accent)" }}>
                        {formatValue(p.value)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {r.goals > 0 && <span className="text-[color:var(--ss-accent)]">⚽×{r.goals}</span>}
                      {r.assists > 0 && <span className="text-blue-300">A×{r.assists}</span>}
                      {r.yellow && <span className="bg-[color:var(--ss-accent)] w-2 h-3 inline-block" />}
                      {r.red && <span className="bg-white w-2 h-3 inline-block" />}
                      <span
                        className="scoreboard text-[14px] font-extrabold"
                        style={{ color: r.rating >= 7.5 ? "var(--ss-btn-stat)" : r.rating < 5.5 ? "var(--ss-btn-exit)" : "#FFFFFF" }}
                      >
                        {r.rating.toFixed(1)}
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
          {motm?.player && (
            <div className="ss-strip px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">Man of the Match</div>
              <div className="font-extrabold uppercase tracking-[0.04em] text-base text-[color:var(--ss-accent)] mt-0.5">
                <PlayerLink playerId={motm.player.id}>{motm.player.displayName}</PlayerLink>
              </div>
              <div className="text-xs scoreboard">Rating {motm.r.rating.toFixed(1)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm">Aftermath</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
          <KV k="Money" v={`£${((userIsHome ? result.homeMoneyEarned : result.awayMoneyEarned)/1000).toFixed(0)}k`} />
          <KV k="Fan Mood" v={`${(userIsHome ? result.fanMoodChangeHome : result.fanMoodChangeAway) > 0 ? "+" : ""}${userIsHome ? result.fanMoodChangeHome : result.fanMoodChangeAway}%`} alt />
          <KV k="Board" v={`${(userIsHome ? result.boardConfidenceChangeHome : result.boardConfidenceChangeAway) > 0 ? "+" : ""}${userIsHome ? result.boardConfidenceChangeHome : result.boardConfidenceChangeAway}%`} />
          <KV k="League Pos" v={tableRow > 0 ? `${tableRow}` : "—"} alt />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-0">
        <Link href="/league" className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm">
          League
        </Link>
        <Link href="/inbox" className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-sm">
          Inbox
        </Link>
        <Link href="/match/roundup" className="btn btn-stat !rounded-none border-0 h-12 text-sm">
          ▶ Round-Up
        </Link>
      </div>
    </div>
  );
}

function Row({ k, h, a, alt, userIsHome }: { k: string; h: number | string; a: number | string; alt?: boolean; userIsHome?: boolean }) {
  return (
    <div
      className="grid grid-cols-[60px_1fr_60px] items-center px-3 py-1.5 text-white text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{ background: alt ? "var(--ss-row-2)" : "var(--ss-row)" }}
    >
      <span
        className="scoreboard text-[15px] text-center"
        style={{ color: userIsHome ? "var(--ss-accent)" : "#FFFFFF" }}
      >
        {h}
      </span>
      <span className="text-[10px] tracking-[0.18em] text-center text-white/85">{k}</span>
      <span
        className="scoreboard text-[15px] text-center"
        style={{ color: !userIsHome ? "var(--ss-accent)" : "#FFFFFF" }}
      >
        {a}
      </span>
    </div>
  );
}

function KV({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div className="px-3 py-3 text-center" style={{ background: alt ? "var(--ss-strip)" : "var(--ss-bg-2)" }}>
      <div className="text-[10px] uppercase text-[color:var(--muted)] tracking-[0.16em]">{k}</div>
      <div className="font-extrabold scoreboard text-base text-white mt-0.5">{v}</div>
    </div>
  );
}
