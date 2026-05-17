"use client";

// =====================================================================
// <PitchSimulator /> — 2D top-down match visualisation.
//
// Architecture (v3 — full rewrite for AI-driven play):
//
//   • Between match-engine events the simulator runs a CONTINUOUS
//     possession AI (sim/possession.ts) that keeps the ball alive on
//     the pitch — players pass, dribble, cross, take long shots and
//     overlap based on their attributes, role and team tactic. Every
//     match looks different because each decision is randomised
//     within the player's attribute envelope.
//
//   • When a new match-engine event arrives the AI loop pauses and a
//     SCRIPTED scene (sim/scenes.ts) plays out — a goal, save, card
//     etc. Each event has multiple scene variants picked from the
//     event player's strongest attribute (long-shooter, dribbler,
//     header, poacher, playmaker, pacey).
//
//   • Off-ball steering (sim/movement.ts) drives every non-carrier:
//     fullbacks overlap, wingers stay wide / cut inside, strikers
//     make near/far-post runs, defenders contract around the ball.
//     This is what makes the screen feel like real football instead
//     of dots floating around home positions.
// =====================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Club,
  Lineup,
  MatchEvent,
  MatchResult,
  Player,
} from "@/types/game";
import { readableOn } from "@/lib/color";
import { buildTeamSnapshot } from "./sim/snapshot";
import { targetForPlayer } from "./sim/movement";
import { initialPlayState, tickPossession } from "./sim/possession";
import { buildScene } from "./sim/scenes";
import {
  BOT_GOAL_BACK_Y,
  BOT_GOAL_LINE_Y,
  GOAL_LEFT,
  GOAL_RIGHT,
  HALFWAY_Y,
  PEN_BOX_LEFT,
  PEN_BOX_RIGHT,
  TOP_GOAL_BACK_Y,
  TOP_GOAL_LINE_Y,
  TOP_PEN_BOX_BOTTOM,
  BOT_PEN_BOX_TOP,
  TOP_PEN_SPOT_Y,
  BOT_PEN_SPOT_Y,
  SIX_YARD_LEFT,
  SIX_YARD_RIGHT,
  TOP_SIX_BOTTOM,
  BOT_SIX_TOP,
  type MicroAction,
  type PlayState,
  type SceneFlag,
  type ScenePlan,
  type Side,
  type TeamSnapshot,
  type PlayerPlacement,
  clamp,
  easeOut,
  lerp,
} from "./sim/types";

// =====================================================================
// PROPS
// =====================================================================
export interface Props {
  result: MatchResult;
  tickIndex: number;
  home: Club;
  away: Club;
  userIsHome: boolean;
  homeLineup?: Lineup;
  awayLineup?: Lineup;
  players?: Record<string, Player>;
  running?: boolean;
}

// =====================================================================
// FRAME SNAPSHOT — what we sample from the imperative ref each frame.
// =====================================================================
interface FrameSnap {
  ball: { x: number; y: number; z: number };
  flags: SceneFlag;
  home: Array<{ x: number; y: number }>;
  away: Array<{ x: number; y: number }>;
  frame: number;
}

// =====================================================================
// SIM RUNTIME — held in refs so the 30fps loop doesn't trigger React
// reconciliation. We push a FrameSnap to state each tick so the
// render reads from the latest positions.
// =====================================================================
interface SimRuntime {
  /** Continuous-possession state (used between events). */
  play: PlayState;
  /** Scripted-event scene (or null if continuous play is active). */
  scene: ScenePlan | null;
  sceneElapsedMs: number;
  /** Last tickIndex we built a scene for; -1 = none yet. */
  forTickIndex: number;
  /** Persistent visual flags so they outlast individual beats. */
  visibleFlags: SceneFlag;
  /** Monotonic seed for deterministic-but-varied AI choices. */
  rngSeed: number;
}

// =====================================================================
// HELPERS
// =====================================================================
function ballAlong(action: MicroAction, t: number): { x: number; y: number; z: number } {
  if (action.kind === "settle") {
    return { x: action.toX, y: action.toY, z: 0 };
  }
  const isAirborne =
    action.kind === "shot" || action.kind === "header" ||
    action.kind === "cross" || action.kind === "longball" ||
    action.kind === "throughball";
  const ease = action.kind === "shot" ? easeOut(t) : t;
  const groundX = action.fromX + (action.toX - action.fromX) * ease;
  const groundY = action.fromY + (action.toY - action.fromY) * ease;
  if (!isAirborne || action.arc <= 0) {
    return { x: groundX, y: groundY, z: 0 };
  }
  const heightCurve = 4 * t * (1 - t); // 0..1..0
  const height = action.arc * heightCurve;
  return { x: groundX, y: groundY - height * 8, z: height };
}

function mergeFlag(target: SceneFlag, src: SceneFlag | undefined) {
  if (!src) return;
  if (src.ballInNet !== undefined) target.ballInNet = src.ballInNet;
  if (src.ballHidden !== undefined) target.ballHidden = src.ballHidden;
  if (src.celebrate !== undefined) target.celebrate = src.celebrate;
  if (src.cardOver !== undefined) target.cardOver = src.cardOver;
  if (src.goalFlash !== undefined) target.goalFlash = src.goalFlash;
  if (src.netRipple !== undefined) target.netRipple = src.netRipple;
}

/** True while the ball is in the air / on its own — passes, crosses,
 *  long balls, through balls, shots, headers. The KEY rendering rule:
 *  during flying actions NOBODY is bound to the ball. The passer just
 *  released it and stays put; the receiver hasn't arrived yet. Without
 *  this gate, the carrier (passer) would get dragged along behind the
 *  ball every time the AI recycled possession — so your striker would
 *  end up "playing in defence" the moment they passed back to a CB. */
function isFlyingAction(kind: MicroAction["kind"]): boolean {
  return (
    kind === "pass" || kind === "cross" || kind === "longball" ||
    kind === "throughball" || kind === "shot" || kind === "header"
  );
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export function PitchSimulator({
  result,
  tickIndex,
  home,
  away,
  userIsHome,
  homeLineup,
  awayLineup,
  players,
  running = true,
}: Props) {
  const homeTeam = useMemo(
    () => buildTeamSnapshot(home, homeLineup, players, true),
    [home, homeLineup, players],
  );
  const awayTeam = useMemo(
    () => buildTeamSnapshot(away, awayLineup, players, false),
    [away, awayLineup, players],
  );

  const homeColor = homeTeam.primaryColor;
  const awayColor = awayTeam.primaryColor;
  const homeAccent = homeTeam.accentColor;
  const awayAccent = awayTeam.accentColor;

  const ev: MatchEvent | undefined = result.events[tickIndex];

  // ── Sim runtime (imperative). ────────────────────────────────────
  const runtimeRef = useRef<SimRuntime>({
    play: initialPlayState(homeTeam),
    scene: null,
    sceneElapsedMs: 0,
    forTickIndex: -1,
    visibleFlags: {},
    rngSeed: 1,
  });

  // ── Render snapshot. ─────────────────────────────────────────────
  const [snap, setSnap] = useState<FrameSnap>(() => ({
    ball: { x: 50, y: HALFWAY_Y, z: 0 },
    flags: {},
    home: homeTeam.placements.map((p) => ({ x: p.curX, y: p.curY })),
    away: awayTeam.placements.map((p) => ({ x: p.curX, y: p.curY })),
    frame: 0,
  }));

  // Re-init runtime when teams change (new match, lineup edit, etc.).
  useEffect(() => {
    runtimeRef.current = {
      play: initialPlayState(homeTeam),
      scene: null,
      sceneElapsedMs: 0,
      forTickIndex: -1,
      visibleFlags: {},
      rngSeed: 1,
    };
  }, [homeTeam, awayTeam]);

  // Build (or replace) the active SCENE whenever the displayed event changes.
  useEffect(() => {
    const rt = runtimeRef.current;
    if (rt.forTickIndex === tickIndex) return;

    // Take the ball position from where it currently lives — either
    // the in-flight scene or the rolling possession. If the previous
    // visible flag had ball-in-net or hidden, re-spot at the centre
    // circle (post-goal kickoff / restart).
    const carryFlags = rt.visibleFlags;
    const ballAt =
      carryFlags.ballInNet || carryFlags.ballHidden
        ? { x: 50, y: HALFWAY_Y }
        : { x: rt.play.ball.x, y: rt.play.ball.y };

    const newScene = ev ? buildScene(ev, homeTeam, awayTeam, ballAt) : null;

    rt.scene = newScene;
    rt.sceneElapsedMs = 0;
    rt.forTickIndex = tickIndex;
    rt.visibleFlags = {};
    // Reset scripted flags so any persistent moves clear.
    homeTeam.placements.forEach((p) => { p.scripted = false; });
    awayTeam.placements.forEach((p) => { p.scripted = false; });
  }, [tickIndex, ev, homeTeam, awayTeam]);

  // ── 30fps loop. ──────────────────────────────────────────────────
  const runningRef = useRef(running);
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    let lastTs = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(40, now - lastTs);
      lastTs = now;
      if (!runningRef.current) return;

      const rt = runtimeRef.current;

      // ── BALL & FLAGS ──────────────────────────────────────────────
      // If a SCENE is active, it owns the ball.
      // Otherwise, the continuous AI ticks.
      let ballX = rt.play.ball.x;
      let ballY = rt.play.ball.y;
      let ballZ = rt.play.ball.z;
      let frameFlags: SceneFlag = {};
      const playerHints: Array<{ side: Side; idx: number; toX: number; toY: number }> = [];
      let sceneCarrierSide: Side | null = rt.play.carrierSide;
      let sceneCarrierIdx: number | null = rt.play.carrierIdx;
      let sceneActive = false;

      if (rt.scene) {
        sceneActive = true;
        rt.sceneElapsedMs += dt;

        // Walk beats to find current beat + accumulated flags.
        const flags: SceneFlag = {};
        let beatIdx = -1;
        let elapsedInBeat = rt.sceneElapsedMs;
        for (let i = 0; i < rt.scene.beats.length; i++) {
          const b = rt.scene.beats[i];
          if (elapsedInBeat < b.durationMs) {
            beatIdx = i;
            mergeFlag(flags, b.flag);
            break;
          }
          mergeFlag(flags, b.flag);
          elapsedInBeat -= b.durationMs;
        }

        if (beatIdx < 0) {
          // Scene complete — ball settles at endBall, run flags persist.
          ballX = rt.scene.endBall.x;
          ballY = rt.scene.endBall.y;
          ballZ = 0;
          mergeFlag(flags, rt.scene.endFlag);
          frameFlags = flags;
          // Hand control back to continuous AI. If the scene specified
          // an end carrier, seed possession with that. Otherwise pick
          // a sensible default (whoever is closest to the ball).
          if (rt.scene.endCarrierSide && rt.scene.endCarrierIdx !== null) {
            rt.play = {
              ball: { x: ballX, y: ballY, z: 0 },
              carrierSide: rt.scene.endCarrierSide,
              carrierIdx: rt.scene.endCarrierIdx,
              action: {
                kind: "settle",
                fromX: ballX, fromY: ballY, toX: ballX, toY: ballY,
                arc: 0, durMs: 280,
                endCarrierSide: rt.scene.endCarrierSide,
                endCarrierIdx: rt.scene.endCarrierIdx,
              },
              actionElapsedMs: 0,
            };
          } else {
            // Re-spot for kickoff if ball was in net.
            const restartHome = !!flags.ballInNet
              ? !flags.goalFlash || flags.goalFlash.side !== "home"
              : true;
            const team = restartHome ? homeTeam : awayTeam;
            rt.play = initialPlayState(team);
            // initialPlayState sets the ball to centre, which is correct
            // for kickoff.
            rt.play.ball = { x: 50, y: HALFWAY_Y, z: 0 };
            ballX = 50;
            ballY = HALFWAY_Y;
            ballZ = 0;
          }
          rt.scene = null;
          rt.visibleFlags = { ...flags };
          // Treat the rest of this frame as continuous play.
          sceneActive = false;
        } else {
          const beat = rt.scene.beats[beatIdx];
          const t = beat.durationMs > 0 ? clamp(elapsedInBeat / beat.durationMs, 0, 1) : 1;
          if (beat.ball) {
            const pos = ballAlong(beat.ball, t);
            ballX = pos.x; ballY = pos.y; ballZ = pos.z;
          } else {
            // Hold ball where it ended up.
          }
          if (beat.hints) {
            for (const h of beat.hints) playerHints.push(h);
          }
          frameFlags = flags;
          rt.visibleFlags = { ...flags };
          // Carrier semantics (mirrors the rolling AI branch above):
          //   • settle/dribble — beat's end carrier is on the ball; pin.
          //   • flying beat    — ball flies on its own. Side persists
          //                      (so attacking shape holds), idx
          //                      clears, and (unless the scene already
          //                      pinned the receiver) we push a hint
          //                      so they run onto the landing zone.
          const ba = beat.ball;
          if (ba?.kind === "settle" || ba?.kind === "dribble") {
            sceneCarrierSide = ba.endCarrierSide ?? null;
            sceneCarrierIdx = ba.endCarrierIdx ?? null;
          } else if (ba) {
            sceneCarrierSide = ba.endCarrierSide ?? null;
            sceneCarrierIdx = null;
            if (isFlyingAction(ba.kind) &&
                ba.endCarrierSide !== null && ba.endCarrierIdx !== null) {
              const hasHint = beat.hints?.some(
                (h) => h.side === ba.endCarrierSide && h.idx === ba.endCarrierIdx,
              );
              if (!hasHint) {
                playerHints.push({
                  side: ba.endCarrierSide,
                  idx: ba.endCarrierIdx,
                  toX: ba.toX,
                  toY: ba.toY,
                });
              }
            }
          } else {
            sceneCarrierSide = null;
            sceneCarrierIdx = null;
          }
        }
      }

      if (!sceneActive) {
        // Continuous possession AI.
        rt.rngSeed = (rt.rngSeed * 1103515245 + 12345) >>> 0;
        rt.play = tickPossession(rt.play, homeTeam, awayTeam, dt, rt.rngSeed);
        const action = rt.play.action;
        const t = action.durMs > 0 ? clamp(rt.play.actionElapsedMs / action.durMs, 0, 1) : 1;
        const pos = ballAlong(action, t);
        ballX = pos.x; ballY = pos.y; ballZ = pos.z;
        // Carry over any visible flags from the just-finished scene
        // (e.g. ball still in net briefly).
        frameFlags = { ...rt.visibleFlags };
        // Carrier semantics:
        //   • settle/dribble — a real player IS on the ball; pin them.
        //   • flying action  — ball is on its own. The carrier SIDE
        //                      stays set (movement.ts still needs to
        //                      know which team is in possession so
        //                      attacking shape doesn't collapse), but
        //                      carrier IDX is null so the passer
        //                      stops being dragged behind the ball.
        //   This is what stops your striker following a back-pass
        //   into his own defensive third.
        sceneCarrierSide = rt.play.carrierSide;
        if (action.kind === "settle" || action.kind === "dribble") {
          sceneCarrierIdx = rt.play.carrierIdx;
        } else {
          sceneCarrierIdx = null;
          if (isFlyingAction(action.kind) &&
              action.endCarrierSide !== null &&
              action.endCarrierIdx !== null) {
            // Make the named receiver jog onto the ball.
            playerHints.push({
              side: action.endCarrierSide,
              idx: action.endCarrierIdx,
              toX: action.toX,
              toY: action.toY,
            });
          }
        }
      }

      // ── PLAYER STEERING ───────────────────────────────────────────
      // Apply scripted hints (scenes) → mark those players as scripted
      // and steer them toward the hint position. Everyone else gets
      // off-ball steering from movement.ts based on ball position.
      homeTeam.placements.forEach((p) => { p.scripted = false; });
      awayTeam.placements.forEach((p) => { p.scripted = false; });
      for (const h of playerHints) {
        const team = h.side === "home" ? homeTeam : awayTeam;
        const pl = team.placements[h.idx];
        if (pl) {
          pl.targetX = h.toX;
          pl.targetY = h.toY;
          pl.scripted = true;
        }
      }

      const homeOppGkY = awayTeam.placements[awayTeam.gkIdx].curY;
      const awayOppGkY = homeTeam.placements[homeTeam.gkIdx].curY;
      const ballCtx = {
        x: ballX,
        y: ballY,
        carrierSide: sceneCarrierSide,
        carrierIdx: sceneCarrierIdx,
      };

      const stepFrac = clamp(dt / 1000, 0, 0.05) * 6;
      const stepPlayer = (
        p: PlayerPlacement,
        team: TeamSnapshot,
        oppGkY: number,
        myIdx: number,
      ) => {
        let tx: number, ty: number;
        if (p.scripted) {
          tx = p.targetX; ty = p.targetY;
        } else {
          const r = targetForPlayer(p, team, oppGkY, ballCtx, myIdx);
          tx = r.tx; ty = r.ty;
        }
        // Pace bumps the lerp factor so faster players visibly catch up.
        const lerpAmt = clamp(stepFrac * (0.45 + p.pace / 180), 0.04, 0.32);
        p.curX = lerp(p.curX, tx, lerpAmt);
        p.curY = lerp(p.curY, ty, lerpAmt);
        // Tiny idle wobble for non-scripted, non-carrier outfielders.
        const isCarrier =
          ballCtx.carrierSide === team.side && ballCtx.carrierIdx === myIdx;
        if (!p.scripted && !isCarrier && !p.isGK) {
          p.curX += Math.sin(performance.now() * 0.003 + p.phase) * 0.10;
          p.curY += Math.cos(performance.now() * 0.0028 + p.phase * 1.3) * 0.10;
        }
      };
      homeTeam.placements.forEach((p, i) => stepPlayer(p, homeTeam, homeOppGkY, i));
      awayTeam.placements.forEach((p, i) => stepPlayer(p, awayTeam, awayOppGkY, i));

      // Push frame.
      setSnap((prev) => ({
        ball: { x: ballX, y: ballY, z: ballZ },
        flags: frameFlags,
        home: homeTeam.placements.map((p) => ({ x: p.curX, y: p.curY })),
        away: awayTeam.placements.map((p) => ({ x: p.curX, y: p.curY })),
        frame: prev.frame + 1,
      }));
    }, 33);
    return () => clearInterval(id);
  }, [homeTeam, awayTeam]);

  // ── Render ───────────────────────────────────────────────────────
  const flip = !userIsHome;
  const flags = snap.flags;
  return (
    <div
      className="relative mx-auto select-none"
      style={{
        width: "100%",
        maxWidth: 360,
        aspectRatio: "100 / 150",
        transform: flip ? "rotate(180deg)" : undefined,
        transition: "transform 200ms ease",
        userSelect: "none",
        overflow: "hidden",
        borderRadius: 4,
        boxShadow: "inset 0 0 0 2px #0E0830, inset 0 0 18px rgba(0,0,0,0.45)",
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 100 150"
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      >
        <PitchBackground />
        <PitchLines />

        {flags.goalFlash && (
          <rect
            key={`flash-${tickIndex}`}
            x={0}
            y={flags.goalFlash.side === "home" ? 0 : 75}
            width={100}
            height={75}
            fill={flags.goalFlash.side === "home" ? homeColor : awayColor}
            opacity={0}
          >
            <animate attributeName="opacity" values="0; 0.55; 0"
              keyTimes="0; 0.2; 1" dur="1200ms" fill="freeze" />
          </rect>
        )}

        {snap.home.map((p, i) => (
          <PlayerToken
            key={`h${i}`}
            x={p.x} y={p.y}
            color={homeColor} accent={homeAccent}
            jersey={homeTeam.placements[i].jersey}
            isGK={homeTeam.placements[i].isGK}
            celebrating={flags.celebrate?.side === "home" && flags.celebrate.idx === i}
            cardColor={
              flags.cardOver?.side === "home" && flags.cardOver.idx === i
                ? flags.cardOver.color : null
            }
            flip={flip}
          />
        ))}
        {snap.away.map((p, i) => (
          <PlayerToken
            key={`a${i}`}
            x={p.x} y={p.y}
            color={awayColor} accent={awayAccent}
            jersey={awayTeam.placements[i].jersey}
            isGK={awayTeam.placements[i].isGK}
            celebrating={flags.celebrate?.side === "away" && flags.celebrate.idx === i}
            cardColor={
              flags.cardOver?.side === "away" && flags.cardOver.idx === i
                ? flags.cardOver.color : null
            }
            flip={flip}
          />
        ))}

        {!flags.ballHidden && (
          <Ball
            x={snap.ball.x} y={snap.ball.y} z={snap.ball.z}
            inNet={!!flags.ballInNet}
            netRipple={!!flags.netRipple}
            frame={snap.frame}
          />
        )}
      </svg>

      <div style={teamStripStyle("top", flip)}>
        ▲ {(flip ? away : home).shortName}
        {(() => {
          const lu = flip ? awayLineup : homeLineup;
          return lu ? ` · ${lu.formationKey} · ${lu.tactic}` : "";
        })()}
      </div>
      <div style={teamStripStyle("bottom", flip)}>
        ▼ {(flip ? home : away).shortName}
        {(() => {
          const lu = flip ? homeLineup : awayLineup;
          return lu ? ` · ${lu.formationKey} · ${lu.tactic}` : "";
        })()}
      </div>
    </div>
  );
}

function teamStripStyle(pos: "top" | "bottom", flip: boolean): React.CSSProperties {
  return {
    position: "absolute",
    [pos === "top" ? "top" : "bottom"]: 4,
    [pos === "top" ? "left" : "right"]: 6,
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    letterSpacing: "0.16em",
    fontFamily: "var(--font-display)",
    textTransform: "uppercase",
    textShadow: "0 1px 2px rgba(0,0,0,0.7)",
    transform: flip ? "rotate(180deg)" : undefined,
  };
}

// =====================================================================
// SVG SUB-COMPONENTS (unchanged)
// =====================================================================
function PitchBackground() {
  const bands: React.ReactElement[] = [];
  const playStartY = 6;
  const playEndY = 144;
  const bandCount = 10;
  const bandH = (playEndY - playStartY) / bandCount;
  for (let i = 0; i < bandCount; i++) {
    bands.push(
      <rect key={`b${i}`}
        x={0} y={playStartY + i * bandH}
        width={100} height={bandH}
        fill={i % 2 === 0 ? "#1F7B1F" : "#1A6A1A"} />,
    );
  }
  return (
    <g>
      <rect x={0} y={0} width={100} height={6} fill="#0F4A0F" />
      <rect x={0} y={144} width={100} height={6} fill="#0F4A0F" />
      {bands}
    </g>
  );
}

function PitchLines() {
  const stroke = "rgba(255,255,255,0.85)";
  const sw = 0.4;
  return (
    <g stroke={stroke} strokeWidth={sw} fill="none" shapeRendering="geometricPrecision">
      <rect x={2} y={6} width={96} height={138} />
      <line x1={2} y1={75} x2={98} y2={75} />
      <circle cx={50} cy={75} r={9} />
      <circle cx={50} cy={75} r={0.9} fill={stroke} stroke="none" />

      <rect x={PEN_BOX_LEFT} y={6} width={PEN_BOX_RIGHT - PEN_BOX_LEFT} height={TOP_PEN_BOX_BOTTOM - 6} />
      <rect x={SIX_YARD_LEFT} y={6} width={SIX_YARD_RIGHT - SIX_YARD_LEFT} height={TOP_SIX_BOTTOM - 6} />
      <circle cx={50} cy={TOP_PEN_SPOT_Y} r={0.8} fill={stroke} stroke="none" />
      <path d={`M 41.5 ${TOP_PEN_BOX_BOTTOM} A 9 9 0 0 0 58.5 ${TOP_PEN_BOX_BOTTOM}`} />

      <rect x={PEN_BOX_LEFT} y={BOT_PEN_BOX_TOP}
        width={PEN_BOX_RIGHT - PEN_BOX_LEFT} height={144 - BOT_PEN_BOX_TOP} />
      <rect x={SIX_YARD_LEFT} y={BOT_SIX_TOP}
        width={SIX_YARD_RIGHT - SIX_YARD_LEFT} height={144 - BOT_SIX_TOP} />
      <circle cx={50} cy={BOT_PEN_SPOT_Y} r={0.8} fill={stroke} stroke="none" />
      <path d={`M 41.5 ${BOT_PEN_BOX_TOP} A 9 9 0 0 1 58.5 ${BOT_PEN_BOX_TOP}`} />

      <path d={`M 2 8 A 2 2 0 0 0 4 6`} />
      <path d={`M 96 6 A 2 2 0 0 0 98 8`} />
      <path d={`M 4 144 A 2 2 0 0 0 2 142`} />
      <path d={`M 98 142 A 2 2 0 0 0 96 144`} />

      <GoalCage top />
      <GoalCage top={false} />
    </g>
  );
}

function GoalCage({ top }: { top: boolean }) {
  const lineY = top ? TOP_GOAL_LINE_Y : BOT_GOAL_LINE_Y;
  const backY = top ? TOP_GOAL_BACK_Y : BOT_GOAL_BACK_Y;
  const sweepDir = top ? -1 : 1;
  return (
    <g stroke="rgba(255,255,255,0.95)" strokeWidth={0.6} fill="none">
      <rect x={GOAL_LEFT}
        y={top ? backY : lineY}
        width={GOAL_RIGHT - GOAL_LEFT}
        height={Math.abs(lineY - backY)}
        fill="rgba(255,255,255,0.10)" stroke="none" />
      {[44, 46, 48, 50, 52, 54, 56].map((x) => (
        <line key={`v${x}`} x1={x} y1={lineY} x2={x} y2={backY}
          strokeWidth={0.18} stroke="rgba(255,255,255,0.50)" />
      ))}
      {[1, 2, 3].map((i) => {
        const y = lineY + sweepDir * i * 1.2;
        return (
          <line key={`h${i}`}
            x1={GOAL_LEFT} y1={y} x2={GOAL_RIGHT} y2={y}
            strokeWidth={0.18} stroke="rgba(255,255,255,0.50)" />
        );
      })}
      <line x1={GOAL_LEFT} y1={lineY} x2={GOAL_LEFT} y2={backY} strokeWidth={0.7} />
      <line x1={GOAL_RIGHT} y1={lineY} x2={GOAL_RIGHT} y2={backY} strokeWidth={0.7} />
      <line x1={GOAL_LEFT} y1={backY} x2={GOAL_RIGHT} y2={backY} strokeWidth={0.7} />
    </g>
  );
}

function PlayerToken({
  x, y, color, accent, jersey, isGK,
  celebrating, cardColor, flip,
}: {
  x: number; y: number;
  color: string; accent: string;
  jersey: number; isGK: boolean;
  celebrating: boolean;
  cardColor: "yellow" | "red" | null;
  flip: boolean;
}) {
  const r = isGK ? 2.6 : 2.4;
  const fillColor = isGK ? accent : color;
  const fg = readableOn(fillColor);
  const stroke = isGK ? "#0A0A0A" : fg === "#FFFFFF" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)";
  return (
    <g>
      <ellipse cx={x} cy={y + 0.6} rx={r * 0.9} ry={r * 0.35} fill="rgba(0,0,0,0.35)" />
      {celebrating && (
        <circle cx={x} cy={y} r={r + 1.2} fill="none" stroke="#FFD400" strokeWidth={0.5} opacity={0.9}>
          <animate attributeName="r" from={r} to={r + 2.5} dur="700ms" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.9" to="0" dur="700ms" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={x} cy={y} r={r} fill={fillColor} stroke={stroke} strokeWidth={0.35} />
      <text x={x} y={y + 0.9}
        fontSize={2.4} fontWeight={900}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={fg} textAnchor="middle"
        style={{
          transform: flip ? `rotate(180deg)` : undefined,
          transformOrigin: `${x}px ${y}px`,
        }}>
        {jersey}
      </text>
      {cardColor && (
        <rect x={x - 0.9} y={y - r - 4}
          width={1.8} height={2.6} rx={0.2}
          fill={cardColor === "yellow" ? "#FFD000" : "#E33030"}
          stroke="#000" strokeWidth={0.15} />
      )}
    </g>
  );
}

function Ball({
  x, y, z, inNet, netRipple, frame,
}: {
  x: number; y: number; z: number;
  inNet: boolean; netRipple: boolean; frame: number;
}) {
  const shadowY = y + z * 8 + 1;
  const shadowR = 1.2 + z * 1.5;
  const ballR = 1.4;
  const idleBob = z === 0 ? Math.sin(frame * 0.2) * 0.05 : 0;
  return (
    <g>
      <ellipse cx={x} cy={shadowY} rx={shadowR} ry={shadowR * 0.4} fill="rgba(0,0,0,0.45)" />
      {netRipple && inNet && (
        <circle cx={x} cy={y} r={ballR + 0.8} fill="none" stroke="#FFFFFF" strokeWidth={0.4}>
          <animate attributeName="r" from={ballR + 0.8} to={ballR + 5} dur="600ms" fill="freeze" />
          <animate attributeName="opacity" from="1" to="0" dur="600ms" fill="freeze" />
        </circle>
      )}
      <circle cx={x} cy={y + idleBob} r={ballR}
        fill="#FFFFFF" stroke="rgba(0,0,0,0.6)" strokeWidth={0.18} />
    </g>
  );
}
