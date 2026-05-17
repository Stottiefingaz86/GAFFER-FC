"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { useGame } from "@/store/gameStore";
import type { Lineup, MatchEvent, MatchResult, Player, PlayerMatchRating } from "@/types/game";
import { MATCHDAY_LABEL } from "@/types/game";
import { readableOn } from "@/lib/color";
import { playAmbient, playSfx, stopAmbient } from "@/lib/sound";
import { ambientForCompetition, dwellMsForEvent, sfxForEvent } from "@/lib/matchAudio";
import { MatchViewer } from "@/components/pixi/MatchViewer";

export default function MatchDayPage() {
  // We render the inner page first, then let it pick its own chrome
  // (locked vs full) based on whether the user is currently watching
  // highlights. Using local state means the lock engages the moment
  // the user commits to a watched match and lifts the moment we push
  // to /match/result on full time.
  return <MatchDayInner />;
}

type Mode = "preview" | "watching" | "done";

function MatchDayInner() {
  const db = useGame((s) => s.db);
  const career = useGame((s) => s.career);
  const userClub = useGame((s) => s.getUserClub)();
  const nextFx = useGame((s) => s.getNextUserFixture)();
  const advance = useGame((s) => s.advanceWeek);
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("preview");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [tickIndex, setTickIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Defensive: if the user lands on /match without a career or before
  // the world DB is hydrated, render nothing rather than crash. This
  // can happen on a fresh tab, after a save reset, or mid Fast-Refresh.
  const opp = (nextFx && userClub && db)
    ? db.clubs[nextFx.homeId === userClub.id ? nextFx.awayId : nextFx.homeId]
    : null;
  const isHome = !!(nextFx && userClub && nextFx.homeId === userClub.id);
  const competitionName = (nextFx && db) ? db.competitions[nextFx.competitionId].name : "";

  const oppPlayers = useMemo(() =>
    (opp && db) ? Object.values(db.players).filter((p) => p.clubId === opp.id) : [],
    [db, opp]
  );
  const oppKey = useMemo(() => {
    if (!oppPlayers.length) return null;
    return [...oppPlayers].sort((a, b) => b.overall - a.overall)[0];
  }, [oppPlayers]);

  const oppDanger = useMemo(() => {
    if (!oppPlayers.length) return null;
    return [...oppPlayers].filter((p) => p.position === "FWD")
      .sort((a, b) => (b.shooting * b.form) - (a.shooting * a.form))[0];
  }, [oppPlayers]);

  // Watching: stream events one by one. Each event has its own dwell
  // time so big moments (goals, red cards, penalties) breathe while
  // routine ticks fly by. The user's chosen speed is a divisor on top —
  // 2×/4× still respect the relative weighting of events.
  useEffect(() => {
    if (mode !== "watching" || !result) return;
    if (tickIndex >= result.events.length) {
      const t = setTimeout(() => router.push("/match/result"), 1800);
      return () => clearTimeout(t);
    }
    if (!running) return;
    const currentEvent = result.events[tickIndex];
    const dwell = currentEvent ? dwellMsForEvent(currentEvent) : 900;
    const t = setTimeout(() => setTickIndex((i) => i + 1), dwell / speed);
    return () => clearTimeout(t);
  }, [mode, tickIndex, running, speed, result, router]);

  // While watching highlights we lock the chrome — the AppShell strips
  // its header so the user can't accidentally bail out. We also block
  // browser back-nav (the only remaining escape hatch) by pushing a
  // sentinel history entry and re-pushing on `popstate`, plus a
  // `beforeunload` warning for tab close / hard refresh. All cleared
  // the moment the watch transitions out (or on unmount). Declared
  // above the early return so the hook order stays stable when the
  // "no fixtures" branch fires.
  const locked = mode === "watching";
  useEffect(() => {
    if (!locked) return;
    if (typeof window === "undefined") return;

    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const popState = () => {
      window.history.pushState({ matchLock: true }, "", window.location.href);
    };

    window.history.pushState({ matchLock: true }, "", window.location.href);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", popState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", popState);
    };
  }, [locked]);

  if (!nextFx || !opp || !db || !career || !userClub) {
    return (
      <AppShell>
        <div className="panel overflow-hidden">
          <div className="panel-bar">No Upcoming Fixtures</div>
          <div className="bg-[color:var(--ss-bg-2)] py-8 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.14em]">
            {career ? "Season is over." : "No active career."}
          </div>
          <Link href="/dashboard" className="btn btn-primary !rounded-none w-full h-12 border-0">Back to Dashboard</Link>
        </div>
      </AppShell>
    );
  }

  // Preview hints
  const userOvr = userClub.squadRating;
  const oppOvr = opp.squadRating;
  const hints: string[] = [];
  if (oppOvr > userOvr + 4) hints.push(`Tough test — opponent OVR ${oppOvr}, you're at ${userOvr}.`);
  else if (userOvr > oppOvr + 4) hints.push(`Heavy favourites — but don't get complacent.`);
  if (opp.id === userClub.rivalClubId) hints.push("Derby day — anything can happen.");
  if (nextFx.competitionId !== userClub.divisionId) hints.push("Cup tie — the fans expect a fight.");
  if (oppDanger) hints.push(`Watch out for ${oppDanger.displayName} — danger man.`);
  if (oppKey) hints.push(`${oppKey.displayName} is their key player.`);

  const startMatch = (watch: boolean) => {
    const { userMatch } = advance();
    setResult(userMatch);
    setMode(watch ? "watching" : "done");
    if (watch) setRunning(true);
    if (!watch && userMatch) {
      router.push("/match/result");
    }
  };

  return (
    <AppShell locked={locked}>
    <AnimatePresence mode="wait">
      {mode === "preview" && (
        <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="panel overflow-hidden max-w-3xl mx-auto">
            <div className="panel-bar text-base sm:text-lg">
              {competitionName.toUpperCase()} · Week {career.week}
              {nextFx.dayOfWeek && (
                <span className="opacity-75"> · {MATCHDAY_LABEL[nextFx.dayOfWeek]}</span>
              )}
            </div>

            {(() => {
              const homeClub = isHome ? userClub : opp;
              const awayClub = isHome ? opp : userClub;
              const homeColor = homeClub.badge.primaryColor;
              const awayColor = awayClub.badge.primaryColor;
              const homeFg = readableOn(homeColor);
              const awayFg = readableOn(awayColor);
              return (
                <div
                  className="team-hero-vs grid grid-cols-[1fr_auto_1fr] items-center gap-0"
                  style={{
                    ["--team-h" as string]: homeColor,
                    ["--team-a" as string]: awayColor,
                  }}
                >
                  <ClubLink
                    clubId={homeClub.id}
                    className="text-center px-3 sm:px-4 py-5 sm:py-6 relative z-[1] block"
                    title={`View ${homeClub.name}`}
                  >
                    <span style={{ color: homeFg }} className="block">
                      <TeamCrest club={homeClub} size={64} className="mx-auto drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
                      <div
                        className="font-extrabold uppercase tracking-[0.04em] mt-2 text-sm sm:text-base"
                        style={{ textShadow: homeFg === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.6)" : "0 1px 0 rgba(255,255,255,0.4)" }}
                      >
                        {homeClub.name}
                      </div>
                      <div
                        className="text-[10px] uppercase tracking-[0.16em] mt-0.5"
                        style={{ opacity: 0.85 }}
                      >
                        Home · OVR {homeClub.squadRating}
                      </div>
                    </span>
                  </ClubLink>
                  <div className="text-center px-3 sm:px-5 py-5 sm:py-6 relative z-[1] bg-black/35 backdrop-blur-[2px] border-x border-black/40">
                    <div
                      className="scoreboard text-3xl sm:text-4xl font-extrabold tracking-[0.18em] text-[color:var(--ss-accent)]"
                      style={{ textShadow: "0 0 8px rgba(255,208,0,0.4)" }}
                    >
                      VS
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.18em] text-white/80 mt-1">
                      {homeClub.stadium.name}
                    </div>
                  </div>
                  <ClubLink
                    clubId={awayClub.id}
                    className="text-center px-3 sm:px-4 py-5 sm:py-6 relative z-[1] block"
                    title={`View ${awayClub.name}`}
                  >
                    <span style={{ color: awayFg }} className="block">
                      <TeamCrest club={awayClub} size={64} className="mx-auto drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" />
                      <div
                        className="font-extrabold uppercase tracking-[0.04em] mt-2 text-sm sm:text-base"
                        style={{ textShadow: awayFg === "#FFFFFF" ? "0 1px 2px rgba(0,0,0,0.6)" : "0 1px 0 rgba(255,255,255,0.4)" }}
                      >
                        {awayClub.name}
                      </div>
                      <div
                        className="text-[10px] uppercase tracking-[0.16em] mt-0.5"
                        style={{ opacity: 0.85 }}
                      >
                        Away · OVR {awayClub.squadRating}
                      </div>
                    </span>
                  </ClubLink>
                </div>
              );
            })()}

            <div className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-xs uppercase tracking-[0.16em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
              Hints
            </div>
            <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
              {hints.map((h, i) => (
                <li
                  key={i}
                  className="px-4 py-2 text-white text-sm font-bold uppercase tracking-[0.04em]"
                  style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                >
                  <span className="text-[color:var(--ss-accent)] mr-2">▸</span> {h}
                </li>
              ))}
              {hints.length === 0 && (
                <li className="px-4 py-3 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
                  No special notes — go play your game.
                </li>
              )}
            </ul>

            <div className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-xs uppercase tracking-[0.16em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
              Pressure
            </div>
            <div className="grid grid-cols-4 gap-0">
              <KV k="Board" v={`${userClub.boardConfidence}%`} />
              <KV k="Fans" v={`${userClub.fanMood}%`} alt />
              <KV k="Patience" v={`${userClub.boardPatience}%`} />
              <KV k="Rep" v={career.manager.managerLevelLabel} alt />
            </div>

            <div className="grid grid-cols-2 gap-0">
              <Link href="/tactics" className="btn btn-action !rounded-none border-0 border-r-2 border-b-2 border-[color:var(--ss-bg-deep)] h-11 text-xs">
                Edit Tactics
              </Link>
              <Link href="/squad" className="btn btn-action !rounded-none border-0 border-b-2 border-[color:var(--ss-bg-deep)] h-11 text-xs">
                Edit Squad
              </Link>
              <button className="btn btn-stat !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-14 text-sm" onClick={() => startMatch(true)}>
                ▶ Watch Highlights
              </button>
              <button className="btn btn-info !rounded-none border-0 h-14 text-sm" onClick={() => startMatch(false)}>
                ⚡ Quick Sim
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {mode === "watching" && result && (
        <motion.div key="watch" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <WatchHighlights
            result={result}
            setResult={setResult}
            tickIndex={tickIndex}
            running={running}
            speed={speed}
            setSpeed={setSpeed}
            setRunning={setRunning}
            userClubId={userClub.id}
            db={db}
          />
        </motion.div>
      )}
    </AnimatePresence>
    </AppShell>
  );
}

// =====================================================================
// LIVE MATCH HUD — tabbed view that turns the right pane of the watch
// screen into a proper info dashboard:
//
//   • Commentary  — the original play-by-play feed (now also renders
//                   substitution events injected by the manager).
//   • Stats       — possession bar + shots / saves / corners / fouls /
//                   cards, all derived live from the events visible
//                   so far.
//   • Ratings     — per-player live rating, goals, assists, cards, with
//                   a "make sub" hook on each user-side starter.
//
// The live lineup is held in component state and starts from the
// engine's recorded lineup. Substitutions mutate the live lineup AND
// inject a `Substitution` event into the timeline, so the pitch
// simulator picks up the swap automatically (it reads players from the
// shared db keyed by id, which is fine because the new player is
// already in the squad).
// =====================================================================
type HudTab = "commentary" | "stats" | "ratings";

function WatchHighlights({
  result, setResult, tickIndex, running, speed, setSpeed, setRunning, userClubId, db,
}: {
  result: MatchResult;
  setResult: (r: MatchResult) => void;
  tickIndex: number;
  running: boolean;
  speed: number;
  setSpeed: (n: number) => void;
  setRunning: (b: boolean) => void;
  userClubId: string;
  db: ReturnType<typeof useGame.getState>["db"];
}) {
  const home = db!.clubs[result.homeId];
  const away = db!.clubs[result.awayId];
  const userIsHome = home.id === userClubId;
  const userSide: "home" | "away" = userIsHome ? "home" : "away";

  // Live lineup state — starts from the canonical engine lineup, gets
  // mutated as the manager makes subs. Pitch simulator and ratings
  // panel both read from this so a sub is reflected everywhere.
  const initialHomeLineup = db?.lineups[home.id];
  const initialAwayLineup = db?.lineups[away.id];
  const [liveHomeLineup, setLiveHomeLineup] = useState<Lineup | undefined>(initialHomeLineup);
  const [liveAwayLineup, setLiveAwayLineup] = useState<Lineup | undefined>(initialAwayLineup);

  const [tab, setTab] = useState<HudTab>("commentary");
  const [subModalOpen, setSubModalOpen] = useState(false);

  const visibleEvents = result.events.slice(0, tickIndex + 1);
  const lastMinute = visibleEvents[visibleEvents.length - 1]?.minute ?? 0;

  useEffect(() => {
    playAmbient(ambientForCompetition(result.competitionId));
    return () => stopAmbient();
  }, [result.competitionId]);

  useEffect(() => {
    const ev = visibleEvents[visibleEvents.length - 1];
    if (!ev) return;
    const sfx = sfxForEvent(ev);
    if (sfx) playSfx(sfx);
  }, [tickIndex, visibleEvents]);

  // Live score from visible events
  let homeScore = 0; let awayScore = 0;
  visibleEvents.forEach((e) => {
    const isGoal = ["Goal","WonderGoal","Deflection","PenaltyScored"].includes(e.type);
    const isOG = e.type === "OwnGoal";
    if (isGoal && !isOG) {
      if (e.team === "home") homeScore += 1; else awayScore += 1;
    } else if (isOG) {
      if (e.team === "home") awayScore += 1; else homeScore += 1;
    }
  });

  const feedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab !== "commentary") return;
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tickIndex, visibleEvents.length, tab]);

  // === Substitutions ===============================================
  // Inject a Substitution event into the visible timeline at the
  // current minute, swap player IDs in the live lineup, and seed a
  // PlayerMatchRating for the incoming sub. The match engine has
  // already produced the final result — this is a *display* change
  // only, but it ripples through pitch simulator + ratings panel
  // because both read from the live lineup / live ratings.
  const onConfirmSub = (offId: string, onId: string) => {
    const lineup = userIsHome ? liveHomeLineup : liveAwayLineup;
    if (!lineup) return;
    // Find the slot the off-going player occupies.
    const slotEntry = Object.entries(lineup.starters).find(([, pid]) => pid === offId);
    if (!slotEntry) return;
    const [slotId] = slotEntry;
    const newStarters = { ...lineup.starters, [slotId]: onId };
    const newBench = lineup.bench.filter((id) => id !== onId).concat(offId);
    const newLineup: Lineup = { ...lineup, starters: newStarters, bench: newBench };
    if (userIsHome) setLiveHomeLineup(newLineup);
    else setLiveAwayLineup(newLineup);

    const players = db?.players ?? {};
    const offPlayer = players[offId];
    const onPlayer = players[onId];
    const subEvent: MatchEvent = {
      minute: lastMinute,
      type: "Substitution",
      team: userSide,
      playerId: onId,
      playerName: onPlayer?.displayName,
      subOffPlayerId: offId,
      subOffPlayerName: offPlayer?.displayName,
      text: `Substitution — ${onPlayer?.displayName ?? "Sub"} replaces ${offPlayer?.displayName ?? "Player"}.`,
    };

    // Splice the sub event in at tickIndex+1 so it appears AFTER the
    // currently-visible event. We also seed a 6.5 rating for the
    // incoming player.
    const newEvents = [
      ...result.events.slice(0, tickIndex + 1),
      subEvent,
      ...result.events.slice(tickIndex + 1),
    ];
    const ratingsKey = userSide;
    const subbedInRating: PlayerMatchRating = {
      playerId: onId,
      rating: 6.5,
      goals: 0,
      assists: 0,
      yellow: false,
      red: false,
      injured: false,
    };
    const newRatings = {
      ...result.ratings,
      [ratingsKey]: result.ratings[ratingsKey].some((r) => r.playerId === onId)
        ? result.ratings[ratingsKey]
        : [...result.ratings[ratingsKey], subbedInRating],
    };
    setResult({ ...result, events: newEvents, ratings: newRatings });
    setSubModalOpen(false);
  };

  return (
    <div className="panel overflow-hidden max-w-5xl mx-auto">
      <div className="panel-bar text-base sm:text-lg">
        {result.story.toUpperCase()} · {result.weather.toUpperCase()}
      </div>

      <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 text-white">
        <ClubLink clubId={home.id} className="flex items-center gap-3 justify-end">
          <div className="font-extrabold uppercase tracking-[0.04em] text-base">{home.shortName}</div>
          <TeamCrest club={home} size={44} />
        </ClubLink>
        <div className="scoreboard text-3xl sm:text-4xl font-extrabold text-[color:var(--ss-accent)] px-2 text-center">
          {homeScore}<span className="text-white/40 mx-2">·</span>{awayScore}
        </div>
        <ClubLink clubId={away.id} className="flex items-center gap-3">
          <TeamCrest club={away} size={44} />
          <div className="font-extrabold uppercase tracking-[0.04em] text-base">{away.shortName}</div>
        </ClubLink>
      </div>

      <div className="ss-strip text-center text-[10px] tracking-[0.2em] py-1 text-[color:var(--ss-cream)]">
        {lastMinute}&apos;
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,360px)_1fr] gap-0 border-t-2 border-[color:var(--ss-bar-edge)]">
        <div className="bg-[color:var(--ss-bg-deep)] py-3 px-3 md:border-r-2 border-b-2 md:border-b-0 border-[color:var(--ss-bar-edge)]">
          <MatchViewer
            result={result}
            tickIndex={tickIndex}
            home={home}
            away={away}
            userIsHome={userIsHome}
            homeLineup={liveHomeLineup}
            awayLineup={liveAwayLineup}
            players={db?.players}
            running={running}
          />
        </div>

        <div className="bg-[color:var(--ss-bg)] flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="grid grid-cols-3 bg-[color:var(--ss-bar-2)] border-b border-[color:var(--ss-bar-edge)]">
            <HudTabButton id="commentary" label="Commentary" active={tab === "commentary"} onClick={() => setTab("commentary")} />
            <HudTabButton id="stats" label="Stats" active={tab === "stats"} onClick={() => setTab("stats")} />
            <HudTabButton id="ratings" label="Ratings" active={tab === "ratings"} onClick={() => setTab("ratings")} />
          </div>

          <div className="flex-1 min-h-0 md:max-h-[600px] max-h-[320px] overflow-auto scrollbar-thin" ref={feedRef}>
            {tab === "commentary" && (
              <CommentaryFeed
                visibleEvents={visibleEvents}
                userIsHome={userIsHome}
                home={home.shortName}
                away={away.shortName}
              />
            )}
            {tab === "stats" && (
              <StatsPanel
                result={result}
                visibleEvents={visibleEvents}
                lastMinute={lastMinute}
                home={home}
                away={away}
                homeScore={homeScore}
                awayScore={awayScore}
              />
            )}
            {tab === "ratings" && (
              <RatingsPanel
                result={result}
                visibleEvents={visibleEvents}
                home={home}
                away={away}
                userSide={userSide}
                userLineup={userIsHome ? liveHomeLineup : liveAwayLineup}
                players={db?.players ?? {}}
                onOpenSub={() => setSubModalOpen(true)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="bg-[color:var(--ss-bg-deep)] flex items-stretch gap-0 border-t-2 border-[color:var(--ss-bar-edge)]">
        <button
          className={`btn !rounded-none flex-1 border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 text-xs ${running ? "btn-exit" : "btn-stat"}`}
          onClick={() => setRunning(!running)}
        >
          {running ? "Pause" : "Resume"}
        </button>
        <button
          className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 px-4 text-xs"
          onClick={() => {
            setRunning(false);
            setSubModalOpen(true);
          }}
          disabled={!(userIsHome ? liveHomeLineup : liveAwayLineup)}
          title="Pause and make a substitution"
        >
          ⇆ Make Sub
        </button>
        <div className="flex">
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`tab ${speed === s ? "active" : ""}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {subModalOpen && (
        <SubstitutionModal
          lineup={userIsHome ? liveHomeLineup : liveAwayLineup}
          players={db?.players ?? {}}
          onCancel={() => setSubModalOpen(false)}
          onConfirm={onConfirmSub}
        />
      )}
    </div>
  );
}

function HudTabButton({
  id, label, active, onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      key={id}
      onClick={onClick}
      className={[
        "px-3 py-2 text-[11px] uppercase tracking-[0.18em] font-extrabold",
        "border-r border-[color:var(--ss-bar-edge)] last:border-r-0",
        "transition-colors",
        active
          ? "bg-[color:var(--ss-accent)] text-[color:var(--ss-bg-deep)]"
          : "text-[color:var(--ss-bar-text)] hover:bg-[color:var(--ss-bg-3)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function CommentaryFeed({
  visibleEvents, userIsHome, home, away,
}: {
  visibleEvents: MatchEvent[];
  userIsHome: boolean;
  home: string;
  away: string;
}) {
  if (visibleEvents.length === 0) {
    return (
      <div className="text-center py-6 text-[color:var(--muted)] text-sm uppercase tracking-[0.16em]">
        Kick off!
      </div>
    );
  }
  return (
    <ul>
      {visibleEvents.map((e, i) => (
        <EventLine
          key={i}
          index={i}
          ev={e}
          userIsHome={userIsHome}
          home={home}
          away={away}
        />
      ))}
    </ul>
  );
}

// =====================================================================
// LIVE STATS — derive everything from `visibleEvents` + the engine's
// final stats so the panel reads correctly at any point during the
// reel. Possession is interpolated from 50-50 at minute 0 toward the
// engine's final figure at minute 90.
// =====================================================================
function StatsPanel({
  result, visibleEvents, lastMinute, home, away, homeScore, awayScore,
}: {
  result: MatchResult;
  visibleEvents: MatchEvent[];
  lastMinute: number;
  home: { shortName: string; badge: { primaryColor: string } };
  away: { shortName: string; badge: { primaryColor: string } };
  homeScore: number;
  awayScore: number;
}) {
  const stats = useMemo(() => {
    const acc = {
      home: { shots: 0, saves: 0, yellow: 0, red: 0, fouls: 0, corners: 0 },
      away: { shots: 0, saves: 0, yellow: 0, red: 0, fouls: 0, corners: 0 },
    };
    const SHOT_TYPES = new Set(["Goal","WonderGoal","Deflection","PenaltyScored","ShotWide","ShotSaved","Chance","BigChance","KeeperSave","Penalty","PenaltyMissed","DisallowedGoal"]);
    visibleEvents.forEach((e) => {
      const side: "home" | "away" = e.team;
      if (SHOT_TYPES.has(e.type) && e.type !== "KeeperSave") {
        acc[side].shots += 1;
      }
      if (e.type === "KeeperSave") {
        // Keeper save belongs to the *defending* keeper's team.
        acc[side].saves += 1;
        // The shot itself belongs to the OTHER team.
        const other: "home" | "away" = side === "home" ? "away" : "home";
        acc[other].shots += 1;
      }
      if (e.type === "Yellow") acc[side].yellow += 1;
      if (e.type === "Red")    acc[side].red += 1;
    });
    return acc;
  }, [visibleEvents]);

  // Possession lerps from 50-50 toward final stats by minute 90.
  const t = Math.min(1, lastMinute / 90);
  const homePossession = Math.round(50 + (result.stats.home.possession - 50) * t);
  const awayPossession = 100 - homePossession;

  // Corners + fouls are engine-final only — show prorated by minute.
  const homeCorners = Math.round(result.stats.home.corners * t);
  const awayCorners = Math.round(result.stats.away.corners * t);
  const homeFouls = Math.round(result.stats.home.fouls * t);
  const awayFouls = Math.round(result.stats.away.fouls * t);
  // xG prorated.
  const homeXG = +(result.stats.home.xG * t).toFixed(2);
  const awayXG = +(result.stats.away.xG * t).toFixed(2);

  return (
    <div className="divide-y divide-[color:var(--ss-bg-deep)]">
      <PossessionBar
        home={{ name: home.shortName, color: home.badge.primaryColor, value: homePossession }}
        away={{ name: away.shortName, color: away.badge.primaryColor, value: awayPossession }}
      />
      <StatRow label="Goals"    homeVal={homeScore}        awayVal={awayScore} bold />
      <StatRow label="Shots"    homeVal={stats.home.shots} awayVal={stats.away.shots} />
      <StatRow label="Saves"    homeVal={stats.home.saves} awayVal={stats.away.saves} />
      <StatRow label="xG"       homeVal={homeXG.toFixed(2)} awayVal={awayXG.toFixed(2)} />
      <StatRow label="Corners"  homeVal={homeCorners}      awayVal={awayCorners} />
      <StatRow label="Fouls"    homeVal={homeFouls}        awayVal={awayFouls} />
      <StatRow label="Yellows"  homeVal={stats.home.yellow} awayVal={stats.away.yellow} />
      <StatRow label="Reds"     homeVal={stats.home.red}    awayVal={stats.away.red} />
    </div>
  );
}

function PossessionBar({
  home, away,
}: {
  home: { name: string; color: string; value: number };
  away: { name: string; color: string; value: number };
}) {
  return (
    <div className="px-3 py-3 bg-[color:var(--ss-bg-2)]">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] font-extrabold mb-1.5">
        <span style={{ color: home.color, textShadow: "0 1px 0 rgba(0,0,0,0.4)" }}>{home.name}</span>
        <span className="text-white/70">Possession</span>
        <span style={{ color: away.color, textShadow: "0 1px 0 rgba(0,0,0,0.4)" }}>{away.name}</span>
      </div>
      <div className="relative h-3 rounded-sm overflow-hidden border border-[color:var(--ss-bg-deep)]" style={{ background: away.color }}>
        <div
          className="absolute inset-y-0 left-0 transition-all duration-300"
          style={{ width: `${home.value}%`, background: home.color }}
        />
      </div>
      <div className="flex items-center justify-between text-xs mt-1 scoreboard">
        <span style={{ color: home.color }}>{home.value}%</span>
        <span style={{ color: away.color }}>{away.value}%</span>
      </div>
    </div>
  );
}

function StatRow({
  label, homeVal, awayVal, bold,
}: {
  label: string;
  homeVal: string | number;
  awayVal: string | number;
  bold?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-1.5 ${bold ? "bg-[color:var(--ss-bg-2)]" : ""}`}>
      <div className={`scoreboard text-right ${bold ? "text-base text-[color:var(--ss-accent)]" : "text-sm text-white"}`}>{homeVal}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] font-extrabold text-[color:var(--muted)] min-w-[64px] text-center">{label}</div>
      <div className={`scoreboard text-left ${bold ? "text-base text-[color:var(--ss-accent)]" : "text-sm text-white"}`}>{awayVal}</div>
    </div>
  );
}

// =====================================================================
// LIVE RATINGS — base 6.5 plus event-driven nudges. Matches the engine's
// own scoring deltas so the live numbers converge on the final ratings
// as the reel reaches full time.
// =====================================================================
function computeLiveRatings(
  side: "home" | "away",
  visibleEvents: MatchEvent[],
  initialPlayerIds: string[],
): Map<string, { rating: number; goals: number; assists: number; yellow: boolean; red: boolean }> {
  const map = new Map<string, { rating: number; goals: number; assists: number; yellow: boolean; red: boolean }>();
  initialPlayerIds.forEach((id) => map.set(id, { rating: 6.5, goals: 0, assists: 0, yellow: false, red: false }));

  visibleEvents.forEach((e) => {
    if (e.team !== side) return;
    const id = e.playerId;
    if (!id) return;
    const entry = map.get(id) ?? { rating: 6.5, goals: 0, assists: 0, yellow: false, red: false };
    map.set(id, entry);
    switch (e.type) {
      case "Goal":
      case "WonderGoal":
      case "Deflection":
      case "PenaltyScored":
        entry.goals += 1;
        entry.rating += 1.05;
        break;
      case "OwnGoal":
        entry.rating -= 0.7;
        break;
      case "Yellow":
        entry.yellow = true;
        entry.rating -= 0.2;
        break;
      case "Red":
        entry.red = true;
        entry.rating -= 1.5;
        break;
      case "KeeperSave":
        entry.rating += 0.3;
        break;
      case "Substitution":
        // Brand-new sub — seed at 6.5 if not already known.
        if (!map.has(id)) {
          map.set(id, { rating: 6.5, goals: 0, assists: 0, yellow: false, red: false });
        }
        break;
    }
    // Loose assist credit: any event with an assist phrase pattern
    // can't be inferred without a separate field, so we lean on the
    // engine's final ratings to bump assist counts at full time.
  });
  return map;
}

function RatingsPanel({
  result, visibleEvents, home, away, userSide, userLineup, players, onOpenSub,
}: {
  result: MatchResult;
  visibleEvents: MatchEvent[];
  home: { shortName: string; id: string };
  away: { shortName: string; id: string };
  userSide: "home" | "away";
  userLineup: Lineup | undefined;
  players: Record<string, Player>;
  onOpenSub: () => void;
}) {
  const userTeamLabel = userSide === "home" ? home.shortName : away.shortName;
  const oppTeamLabel = userSide === "home" ? away.shortName : home.shortName;

  // Build "all players who appeared" per side from initial ratings.
  const homeIds = result.ratings.home.map((r) => r.playerId);
  const awayIds = result.ratings.away.map((r) => r.playerId);

  const homeRatings = computeLiveRatings("home", visibleEvents, homeIds);
  const awayRatings = computeLiveRatings("away", visibleEvents, awayIds);

  const userMap = userSide === "home" ? homeRatings : awayRatings;
  const oppMap  = userSide === "home" ? awayRatings : homeRatings;

  const sortByRating = (ids: string[], map: ReturnType<typeof computeLiveRatings>) =>
    ids
      .map((id) => ({ id, ...(map.get(id) ?? { rating: 6.5, goals: 0, assists: 0, yellow: false, red: false }) }))
      .sort((a, b) => b.rating - a.rating);

  const userIds = userSide === "home" ? homeIds : awayIds;
  const oppIds  = userSide === "home" ? awayIds : homeIds;
  const userList = sortByRating(userIds, userMap);
  const oppList  = sortByRating(oppIds, oppMap);

  // Mark which user-side players are starters (for the sub button) by
  // reading the live lineup.
  const starterSet = new Set<string>(userLineup ? Object.values(userLineup.starters) : []);

  return (
    <div className="divide-y divide-[color:var(--ss-bg-deep)]">
      <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold flex items-center justify-between">
        <span>{userTeamLabel} · Your XI</span>
        <button
          onClick={onOpenSub}
          className="bg-[color:var(--ss-accent)] text-[color:var(--ss-bg-deep)] px-2 py-0.5 text-[9px] tracking-[0.16em] font-black hover:opacity-90"
          title="Pause and make a substitution"
        >
          ⇆ Sub
        </button>
      </div>
      <ul>
        {userList.map((r) => (
          <RatingRow
            key={r.id}
            playerName={players[r.id]?.displayName ?? r.id}
            position={players[r.id]?.detailedPosition ?? "—"}
            rating={r.rating}
            goals={r.goals}
            yellow={r.yellow}
            red={r.red}
            isStarter={starterSet.has(r.id)}
          />
        ))}
      </ul>
      <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold">
        {oppTeamLabel} · Opposition
      </div>
      <ul>
        {oppList.map((r) => (
          <RatingRow
            key={r.id}
            playerName={players[r.id]?.displayName ?? r.id}
            position={players[r.id]?.detailedPosition ?? "—"}
            rating={r.rating}
            goals={r.goals}
            yellow={r.yellow}
            red={r.red}
          />
        ))}
      </ul>
    </div>
  );
}

function RatingRow({
  playerName, position, rating, goals, yellow, red, isStarter,
}: {
  playerName: string;
  position: string;
  rating: number;
  goals: number;
  yellow: boolean;
  red: boolean;
  isStarter?: boolean;
}) {
  const colour =
    rating >= 8.5 ? "var(--ss-btn-stat)"
    : rating >= 7.5 ? "var(--ss-accent)"
    : rating >= 6.5 ? "var(--ss-cream)"
    : rating >= 5.5 ? "var(--muted)"
    : "var(--ss-btn-exit)";
  return (
    <li className="grid grid-cols-[28px_44px_1fr_auto] items-center gap-2 px-3 py-1.5 text-white text-xs">
      <span className="scoreboard text-sm font-extrabold tabular-nums" style={{ color: colour }}>
        {rating.toFixed(1)}
      </span>
      <span className="text-[9px] uppercase tracking-[0.12em] text-[color:var(--muted)] font-bold">
        {position}
      </span>
      <span className="font-bold uppercase tracking-[0.04em] truncate">
        {isStarter ? "" : <span className="text-[9px] text-[color:var(--muted)] mr-1">↑</span>}
        {playerName}
      </span>
      <span className="flex items-center gap-1.5">
        {goals > 0 && (
          <span className="text-[color:var(--ss-accent)] font-black text-xs scoreboard">{goals}⚽</span>
        )}
        {yellow && <span className="bg-[color:var(--ss-accent)] w-2 h-3 inline-block" title="Yellow" />}
        {red && <span className="bg-[color:var(--ss-btn-exit)] w-2 h-3 inline-block" title="Red" />}
      </span>
    </li>
  );
}

// =====================================================================
// SUBSTITUTION MODAL — minimal two-column picker. Left side: starters
// (someone to take off). Right side: bench (someone to bring on).
// Confirms only when both are picked.
// =====================================================================
function SubstitutionModal({
  lineup, players, onCancel, onConfirm,
}: {
  lineup: Lineup | undefined;
  players: Record<string, Player>;
  onCancel: () => void;
  onConfirm: (offId: string, onId: string) => void;
}) {
  const [offId, setOffId] = useState<string | null>(null);
  const [onId, setOnId] = useState<string | null>(null);

  if (!lineup) return null;

  const starters = Object.values(lineup.starters)
    .map((id) => players[id])
    .filter((p): p is Player => Boolean(p));
  const bench = lineup.bench
    .map((id) => players[id])
    .filter((p): p is Player => Boolean(p) && !p.isInjured && !p.isSuspended);

  const canConfirm = offId && onId;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-3"
      onClick={onCancel}
    >
      <div
        className="panel max-w-2xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-bar text-base flex items-center justify-between">
          <span>Make a Substitution</span>
          <button
            onClick={onCancel}
            className="text-[color:var(--ss-bar-text)] text-xl leading-none hover:opacity-80"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
          <div className="border-r border-[color:var(--ss-bg-deep)]">
            <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-extrabold">
              Off · Tap a starter
            </div>
            <ul className="max-h-[300px] overflow-auto scrollbar-thin">
              {starters.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setOffId(p.id)}
                    className={[
                      "w-full grid grid-cols-[40px_1fr_auto] items-center gap-2 px-3 py-2 text-left",
                      "border-b border-[color:var(--ss-bg-deep)] hover:bg-[color:var(--ss-bg-3)]",
                      offId === p.id ? "bg-[color:var(--ss-accent)] text-[color:var(--ss-bg-deep)]" : "text-white",
                    ].join(" ")}
                  >
                    <span className="text-[10px] uppercase tracking-[0.12em] font-bold">
                      {p.detailedPosition}
                    </span>
                    <span className="font-bold uppercase tracking-[0.04em] truncate">
                      {p.displayName}
                    </span>
                    <span className="scoreboard text-xs">{p.overall}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-extrabold">
              On · Tap a bench player
            </div>
            <ul className="max-h-[300px] overflow-auto scrollbar-thin">
              {bench.length === 0 && (
                <li className="px-3 py-3 text-[color:var(--muted)] text-xs uppercase tracking-[0.16em] text-center">
                  No fit subs available.
                </li>
              )}
              {bench.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setOnId(p.id)}
                    className={[
                      "w-full grid grid-cols-[40px_1fr_auto] items-center gap-2 px-3 py-2 text-left",
                      "border-b border-[color:var(--ss-bg-deep)] hover:bg-[color:var(--ss-bg-3)]",
                      onId === p.id ? "bg-[color:var(--ss-accent)] text-[color:var(--ss-bg-deep)]" : "text-white",
                    ].join(" ")}
                  >
                    <span className="text-[10px] uppercase tracking-[0.12em] font-bold">
                      {p.detailedPosition}
                    </span>
                    <span className="font-bold uppercase tracking-[0.04em] truncate">
                      {p.displayName}
                    </span>
                    <span className="scoreboard text-xs">{p.overall}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-0">
          <button
            onClick={onCancel}
            className="btn btn-action !rounded-none border-0 border-r-2 border-t-2 border-[color:var(--ss-bg-deep)] h-12 text-xs"
          >
            Cancel
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => offId && onId && onConfirm(offId, onId)}
            className="btn btn-stat !rounded-none border-0 border-t-2 border-[color:var(--ss-bg-deep)] h-12 text-xs disabled:opacity-40"
          >
            ▶ Confirm Sub
          </button>
        </div>
      </div>
    </div>
  );
}

function EventLine({ ev, home, away, userIsHome, index }: { ev: MatchEvent; home: string; away: string; userIsHome: boolean; index: number }) {
  const teamLabel = ev.team === "home" ? home : away;
  const isGoal = ["Goal","WonderGoal","Deflection","PenaltyScored","OwnGoal"].includes(ev.type);
  const isUser = (ev.team === "home") === userIsHome;

  if (ev.type === "Kickoff" || ev.type === "HalfTime" || ev.type === "FullTime") {
    return (
      <li className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)] text-[11px] uppercase tracking-[0.2em] font-extrabold text-center py-2 border-y border-[color:var(--ss-bar-edge)]">
        — {ev.text} —
      </li>
    );
  }

  // Substitution gets its own arrow-icon badge so it's visually
  // distinct from goals / cards / chances in the feed.
  if (ev.type === "Substitution") {
    return (
      <li
        className="flex items-center gap-3 px-3 py-1.5 text-white text-sm font-bold uppercase tracking-[0.04em]"
        style={{ background: "var(--ss-btn-info)" }}
      >
        <div className="scoreboard w-10 text-right text-xs text-[color:var(--ss-accent)]">{ev.minute}&apos;</div>
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-[0.18em] opacity-75 mr-2">{teamLabel}</span>
          <span className="text-[color:var(--ss-cream)] mr-1">↑</span>{ev.playerName ?? "Sub"}
          <span className="opacity-60 mx-2">replaces</span>
          <span className="text-[color:var(--ss-btn-exit)] mr-1">↓</span>{ev.subOffPlayerName ?? "Player"}
        </div>
      </li>
    );
  }

  const bg = isGoal
    ? isUser ? "var(--ss-btn-stat)" : "var(--ss-btn-exit)"
    : ev.type === "Red"
      ? "var(--ss-btn-exit)"
      : index % 2 === 0 ? "var(--ss-row-2)" : "var(--ss-strip)";

  return (
    <li
      className="flex items-center gap-3 px-3 py-1.5 text-white text-sm font-bold uppercase tracking-[0.04em]"
      style={{ background: bg }}
    >
      <div className="scoreboard w-10 text-right text-xs text-[color:var(--ss-accent)]">{ev.minute}&apos;</div>
      <div className="flex-1">
        <span className="text-[10px] uppercase tracking-[0.18em] opacity-75 mr-2">
          {teamLabel}
        </span>
        {ev.text}
      </div>
      {isGoal && <span className="text-[color:var(--ss-accent)] font-black text-base">⚽</span>}
      {ev.type === "Yellow" && <span className="bg-[color:var(--ss-accent)] text-black w-2.5 h-3.5 inline-block" />}
      {ev.type === "Red" && <span className="bg-white text-[color:var(--ss-btn-exit)] w-2.5 h-3.5 inline-block" />}
    </li>
  );
}

function KV({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div className="px-3 py-2 text-center" style={{ background: alt ? "var(--ss-strip)" : "var(--ss-bg-2)" }}>
      <div className="text-[10px] uppercase text-[color:var(--muted)] tracking-[0.16em]">{k}</div>
      <div className="font-extrabold scoreboard text-sm text-white mt-0.5">{v}</div>
    </div>
  );
}
