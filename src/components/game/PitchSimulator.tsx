"use client";

// =====================================================================
// <PitchSimulator /> — top-down "Sensible Soccer"-flavoured pitch view
// that animates beside the highlight feed during a watched match.
//
// The simulator runs three layered systems at the same time:
//
//   1. Tactical placements — every player's "home" coordinate on the
//      pitch is derived from the team's formation, tactic and per-slot
//      role overrides. Built once per (lineup, tactic) pair via
//      `buildTeamSnapshot`. Keepers, defenders and forwards each get
//      their own wobble amplitude / speed scaled by pace, stamina and
//      fitness so a 90-pace winger genuinely buzzes around more than
//      a 60-pace centre-back.
//
//   2. Possession layer — at any instant ONE specific player is the
//      "carrier" of the ball. Every ~600-1200ms the carrier "passes"
//      to a teammate or "loses" the ball to the opposition. The ball
//      lerps smoothly from carrier A's location to carrier B's, which
//      is what actually sells the illusion of football — passes and
//      transitions instead of a single dot wobbling around an anchor.
//
//   3. Reactive shape — the team WITH the ball nudges its lines
//      forward; the team WITHOUT presses toward the ball. So when a
//      side wins possession you can SEE the block break forward, and
//      when they lose it you SEE the press collapse. Combined with
//      the per-player wobble this looks dramatically more football-y
//      than the previous "everyone wobbles around their formation
//      slot regardless of who has the ball" model.
//
// We can't actually simulate ball physics tick-by-tick — the match
// engine produces discrete events, not tracking data — but layering
// these three systems is enough to make the dwell between captions
// feel like a real game in motion.
// =====================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Club,
  DetailedPosition,
  Lineup,
  MatchEvent,
  MatchResult,
  Player,
  PlayerRole,
  Tactic,
} from "@/types/game";
import { FORMATIONS } from "@/data/formations";
import { readableOn } from "@/lib/color";

interface Props {
  result: MatchResult;
  tickIndex: number;
  home: Club;
  away: Club;
  /** Which side is the user — so we can colour their team consistently
   * and also draw the camera/HUD with their attacking direction "up". */
  userIsHome: boolean;
  /** Lineup for the home side (formation + tactic + slot→playerId map). */
  homeLineup?: Lineup;
  /** Lineup for the away side. */
  awayLineup?: Lineup;
  /** Lookup of every player keyed by id — used to read pace, stamina and
   * other attributes that drive the per-dot wobble. */
  players?: Record<string, Player>;
  /** When false, freeze the simulator entirely (pause button on the
   * watch screen). The ball, players and per-frame wobble all stop —
   * commentary stops too, so the picture and feed stay in sync. */
  running?: boolean;
}

// 0..100 coordinate space — y=0 is the top goal (away defends), y=100
// is the bottom goal (home defends). x=0 left touchline, x=100 right.
type Pt = { x: number; y: number };

interface PlayerPlacement {
  /** Tactical home coord — where the player wants to be when not
   * actively pulled by the ball. */
  homeX: number;
  homeY: number;
  ampX: number;
  ampY: number;
  speed: number;
  phase: number;
  /** Larger = chases the ball harder (when off-ball / pressing). */
  pressFactor: number;
  /** Larger = breaks forward harder (when on-ball / attacking shape). */
  attackFactor: number;
  isGK: boolean;
  /** Position label for tactical context (used for pass-receiver
   *  weighting — strikers receive the ball further forward, etc.). */
  slotPos: DetailedPosition;
  /** Rendered position — lerps each frame toward the dynamic target.
   * Held in the placement object so we can do "smooth follow" without
   * fighting React state. */
  curX: number;
  curY: number;
  /** Pace 0..100, used to scale how fast the player closes onto its
   * dynamic target. Higher pace = bigger lerp factor. */
  pace: number;
  /** Stamina / fitness, scales movement amplitude — tired players move
   * less, especially late in the match. */
  stamina: number;
}

interface TeamSnapshot {
  placements: PlayerPlacement[];
  primaryColor: string;
  accentColor: string;
}

/**
 * Each tactic shifts the whole block forward / back, tightens or
 * stretches the lines, and changes the team's "tempo" (how fast every
 * dot wobbles). `advance` is in pitch-percent, positive meaning closer
 * to the opposition goal — the caller flips the sign for the away team.
 */
function tacticShape(tactic: Tactic): {
  advance: number;
  tightness: number;
  vStretch: number;
  hStretch: number;
  tempoMult: number;
  ampMult: number;
} {
  switch (tactic) {
    case "Attacking":
      return { advance: 5, tightness: 0.95, vStretch: 1.05, hStretch: 1.05, tempoMult: 1.1, ampMult: 1.15 };
    case "Defensive":
      return { advance: -6, tightness: 0.85, vStretch: 0.85, hStretch: 0.95, tempoMult: 0.85, ampMult: 0.85 };
    case "Counter":
      return { advance: -2, tightness: 0.9, vStretch: 1.15, hStretch: 1.0, tempoMult: 1.2, ampMult: 1.05 };
    case "High Press":
      return { advance: 7, tightness: 0.8, vStretch: 0.85, hStretch: 1.0, tempoMult: 1.25, ampMult: 1.25 };
    case "Possession":
      return { advance: 1, tightness: 0.7, vStretch: 0.95, hStretch: 0.85, tempoMult: 0.95, ampMult: 0.95 };
    case "Direct":
      return { advance: 2, tightness: 1.0, vStretch: 1.25, hStretch: 1.0, tempoMult: 1.05, ampMult: 1.0 };
    case "Long Ball":
      return { advance: 1, tightness: 1.05, vStretch: 1.3, hStretch: 1.1, tempoMult: 0.95, ampMult: 0.95 };
    case "Tiki-Taka":
      return { advance: 1, tightness: 0.6, vStretch: 0.85, hStretch: 0.8, tempoMult: 0.9, ampMult: 0.95 };
    case "Gegenpress":
      return { advance: 8, tightness: 0.75, vStretch: 0.8, hStretch: 1.0, tempoMult: 1.35, ampMult: 1.3 };
    case "Wing Play":
      return { advance: 3, tightness: 1.05, vStretch: 1.0, hStretch: 1.2, tempoMult: 1.05, ampMult: 1.05 };
    case "Park the Bus":
      return { advance: -10, tightness: 0.7, vStretch: 0.7, hStretch: 0.85, tempoMult: 0.75, ampMult: 0.75 };
    case "Balanced":
    default:
      return { advance: 0, tightness: 1.0, vStretch: 1.0, hStretch: 1.0, tempoMult: 1.0, ampMult: 1.0 };
  }
}

/** Per-role advance / wider bias. */
function roleShift(role: PlayerRole): { forward: number; widen: number } {
  switch (role) {
    case "Press High":     return { forward: 5, widen: 0 };
    case "Run Forward":    return { forward: 4, widen: 0 };
    case "Cut Inside":     return { forward: 3, widen: -2 };
    case "Get Forward":    return { forward: 5, widen: 0 };
    case "Overlap":        return { forward: 6, widen: 2 };
    case "Drift Wide":     return { forward: 0, widen: 3 };
    case "Sweeper Keeper": return { forward: 4, widen: 0 };
    case "Stay Back":      return { forward: -4, widen: 0 };
    case "Hold Up":        return { forward: -2, widen: 0 };
    case "Defensive WB":   return { forward: -2, widen: 0 };
    case "Cover":          return { forward: -2, widen: 0 };
    case "Stopper":        return { forward: 1, widen: 0 };
    case "Underlap":       return { forward: 1, widen: -3 };
    case "Playmaker":      return { forward: -3, widen: 0 };
    case "Default":
    default:               return { forward: 0, widen: 0 };
  }
}

const DEFENSIVE_POSITIONS: ReadonlyArray<DetailedPosition> = [
  "GK", "CB", "LB", "RB", "DM",
];
const ATTACKING_POSITIONS: ReadonlyArray<DetailedPosition> = [
  "ST", "CF", "LW", "RW", "AM",
];

/**
 * Build per-player placements + motion params for one team. The whole
 * thing is in pitch 0..100 space, oriented so the home team defends the
 * bottom and attacks toward y=0 (matching the SVG layout). The away
 * team is mirrored across both axes so it lines up correctly.
 */
function buildTeamSnapshot(
  club: Club,
  lineup: Lineup | undefined,
  players: Record<string, Player> | undefined,
  isHome: boolean,
): TeamSnapshot {
  const formationKey = lineup?.formationKey ?? "4-3-3";
  const formation = FORMATIONS[formationKey];
  const tactic = lineup?.tactic ?? "Balanced";
  const shape = tacticShape(tactic);
  const advanceSign = isHome ? -1 : 1;
  const xMirror = isHome ? 1 : -1;

  const ownHalfCentre = isHome ? 75 : 25;

  const placements = formation.slots.map((slot, i): PlayerPlacement => {
    const override = lineup?.slotPositions?.[slot.id];
    const fx = override?.x ?? slot.x;
    const fy = override?.y ?? slot.y;
    const slotPosition: DetailedPosition = override?.position ?? slot.position;

    let pitchX = isHome ? fx * 100 : (1 - fx) * 100;
    let pitchY = isHome ? (1 - fy) * 100 : fy * 100;

    pitchY += shape.advance * advanceSign;
    pitchY = ownHalfCentre + (pitchY - ownHalfCentre) * shape.vStretch;
    pitchY = ownHalfCentre + (pitchY - ownHalfCentre) * shape.tightness;
    pitchX = 50 + (pitchX - 50) * shape.hStretch;

    const role: PlayerRole = lineup?.roles?.[slot.id] ?? "Default";
    const rShift = roleShift(role);
    pitchY += rShift.forward * advanceSign;
    if (rShift.widen !== 0) {
      const sideSign = pitchX < 50 ? -1 : 1;
      pitchX += rShift.widen * sideSign * xMirror;
    }

    const playerId = lineup?.starters[slot.id];
    const player = playerId ? players?.[playerId] : undefined;

    const pace = player?.pace ?? 60;
    const stamina = player?.stamina ?? 60;
    const technique = player?.technique ?? 60;
    const fitness = player?.fitness ?? 90;

    const isDefender = DEFENSIVE_POSITIONS.includes(slotPosition);
    const isAttacker = ATTACKING_POSITIONS.includes(slotPosition);
    const isGK = slotPosition === "GK";

    const fitnessFrac = fitness / 100;
    // Movement amplitudes scaled up so players visibly move (the prior
    // values topped out at ~1.6 pitch units, which is ~2 px on a small
    // simulator — players were technically wobbling but it read as
    // "frozen"). Outfielders now get 3-6 units of constant motion plus
    // their phase / press / attack drive on top.
    const baseAmp = isGK ? 0.6 : isDefender ? 2.4 : 3.6;
    const amp =
      baseAmp * (0.6 + (stamina / 100) * 0.8) * fitnessFrac * shape.ampMult;

    const speed =
      (isGK ? 0.05 : 0.10 + (pace / 100) * 0.22) * shape.tempoMult;

    const ampX = amp * (isDefender ? 0.85 : 1.1);
    const ampY = amp * 0.75;

    // Press factor — how aggressively this player chases the ball when
    // the OTHER team has it. Defenders/midfielders press, attackers
    // less so (they're saving energy for the break). Bumped 2x so the
    // press is actually *visible* on screen — the prior values caused
    // dots to drift a few pixels toward the ball, not noticeably so.
    const pressFactor = isGK
      ? 0.0
      : isDefender
        ? 0.22 + (technique / 100) * 0.08
        : isAttacker
          ? 0.14 + (technique / 100) * 0.06
          : 0.28 + (technique / 100) * 0.08;

    // Attack factor — how aggressively this player breaks forward when
    // his team HAS the ball. Attackers go big, defenders a little.
    // Significantly stronger than before so the lines actually push up.
    const attackFactor = isGK
      ? 0.0
      : isDefender
        ? 0.10
        : isAttacker
          ? 0.36
          : 0.22;

    const phase = (i * 1.7 + (isHome ? 0 : 9) + slot.id.charCodeAt(0) * 0.3);
    const homeXClamped = clamp(pitchX, 3, 97);
    const homeYClamped = clamp(pitchY, 3, 97);

    return {
      homeX: homeXClamped,
      homeY: homeYClamped,
      ampX,
      ampY,
      speed,
      phase,
      pressFactor,
      attackFactor,
      isGK,
      slotPos: slotPosition,
      // Initialise the rendered position to the home anchor so the
      // very first frame draws on top of the formation.
      curX: homeXClamped,
      curY: homeYClamped,
      pace,
      stamina,
    };
  });

  return {
    placements,
    primaryColor: club.badge.primaryColor,
    accentColor: club.badge.secondaryColor || "#FFFFFF",
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const GOAL_TYPES: ReadonlyArray<MatchEvent["type"]> = [
  "Goal", "WonderGoal", "Deflection", "PenaltyScored", "OwnGoal",
];
const ATTACK_TYPES: ReadonlyArray<MatchEvent["type"]> = [
  "Chance", "BigChance", "ShotWide", "ShotSaved",
  "KeeperSave", "KeeperMistake", "DefensiveError",
  "Penalty", "PenaltyMissed", "DisallowedGoal",
];
const FLASH_TYPES: ReadonlyArray<MatchEvent["type"]> = [
  "Yellow", "Red", "Injury",
];

// =====================================================================
// Possession state — the heart of the "looks like football" feel.
//
// State machine:
//   - DRIBBLING: a carrier holds the ball. Their pitch position drifts
//     toward the opposition goal each frame, with a small lateral
//     wiggle for realism. The team behind them pushes up (phase
//     shift); the defending team drops + presses.
//   - PASSING: ball lerps from the previous carrier's position to the
//     new receiver. Once it lands, a brief settle then dribble starts
//     again.
//
// Events emitted by the match engine "interrupt" the state machine to
// drop the ball at a relevant location (kickoff, save, goal, ...). In
// between events the simulator plays out little phases of football
// rather than jittering on home anchors.
// =====================================================================
type BallMode = "dribbling" | "passing";
type Scene = "normal" | "highlight";

/** A single beat of a scripted highlight — one pass to a new location
 *  followed by a hold on the carrier. Goals get a longer climax beat
 *  with a big hold (camera lingers on the celebration); cards / saves
 *  get tighter beats so the dwell windows line up. */
interface HighlightStage {
  team: "home" | "away";
  carrierIdx: number;
  toX: number;
  toY: number;
  passDurationFrames: number;
  holdAfterFrames: number;
}

interface BallState {
  team: "home" | "away";
  carrierIdx: number;
  mode: BallMode;
  /** Live ball coordinate, updated each frame. Both modes drive this. */
  x: number;
  y: number;
  /** Where the ball was when the current pass started. Only meaningful
   * during PASSING; used for the lerp + the trail dot. */
  fromX: number;
  fromY: number;
  /** Where the ball is heading during PASSING. */
  toX: number;
  toY: number;
  /** 0..1 progress along the current pass. */
  progress: number;
  /** Frames the current pass takes from start to land. */
  passDurationFrames: number;
  /** Frames the current dribble has lasted — flips to passing once
   * this exceeds `dribbleHoldFrames`. */
  dribbleFrames: number;
  /** How long the carrier dribbles before passing or shooting. */
  dribbleHoldFrames: number;
  /** Scene state — `normal` runs the freeform dribble/pass cycle,
   * `highlight` plays out a scripted multi-stage choreography of the
   * current event (build-up → climax → settle). */
  scene: Scene;
  /** Stages remaining for the current highlight. Empty in normal. */
  highlightStages: HighlightStage[];
  /** Index into highlightStages for the currently-running stage. */
  highlightStageIdx: number;
  /** When the climax stage of a highlight completes we set this so the
   * render can apply a brief glow / pulse to the ball ("the moment"). */
  highlightClimax: boolean;
}

/** Pick the most plausible carrier for this team given the latest event.
 *  Strikers/wingers attack, midfielders dictate, fullbacks overlap.
 *  We bias toward whichever player sits *closest* to the ideal zone for
 *  the event type. */
function pickCarrier(
  team: TeamSnapshot,
  attackingDirection: -1 | 1,  // -1 means attacking up the screen (home)
  zone: "deep" | "mid" | "final-third" | "box",
): number {
  const placements = team.placements;
  const targetY =
    zone === "deep"        ? (attackingDirection < 0 ? 80 : 20)
    : zone === "mid"       ? 50
    : zone === "final-third" ? (attackingDirection < 0 ? 25 : 75)
    : /* box */              (attackingDirection < 0 ?  8 : 92);

  let bestIdx = 0;
  let bestScore = -Infinity;
  placements.forEach((p, i) => {
    if (p.isGK && zone !== "deep") return;  // keepers don't carry from the box
    const dy = Math.abs(p.homeY - targetY);
    const dx = Math.abs(p.homeX - 50);
    // Lower distance = better. Add small bias toward central players in
    // attacking zones (more likely to be the focal point).
    const score = -dy - dx * 0.3;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

/** Pick a teammate to receive a pass — prefers forward + laterally
 *  reachable players, with a sprinkle of randomness so passes aren't
 *  predictable. We work off CURRENT positions, not home positions, so
 *  the receiver weight reflects the team's actual shape on the pitch
 *  right now (including phase shifts and runs). */
function pickPassReceiver(
  team: TeamSnapshot,
  fromIdx: number,
  fromX: number,
  fromY: number,
  attackingDirection: -1 | 1,
): number {
  const candidates = team.placements
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i !== fromIdx && !team.placements[i].isGK);
  if (candidates.length === 0) return fromIdx;

  // Weight by:
  //   - Forward bias: receivers ahead of the ball are STRONGLY
  //     preferred — a real team plays forward whenever it can
  //   - Distance: 18-32 units of separation is the sweet spot
  //   - Lateral cost: very wide passes are riskier
  //   - Pinch of randomness so play isn't deterministic
  const weights = candidates.map(({ p }) => {
    const dyForward = (p.curY - fromY) * attackingDirection; // negative = backwards
    const dx = Math.abs(p.curX - fromX);
    const dist = Math.hypot(p.curX - fromX, p.curY - fromY);
    let w = 1.0;
    w += Math.max(-2, Math.min(3, dyForward * 0.10));     // strong forward bonus
    w -= Math.abs(dist - 22) * 0.03;                       // sweet spot ~22 units
    w -= Math.min(1.5, dx * 0.018);                        // lateral cost
    if (dyForward < -8) w -= 0.6;                          // backwards passes uncommon
    return Math.max(0.05, w + Math.random() * 0.5);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let k = 0; k < candidates.length; k++) {
    r -= weights[k];
    if (r <= 0) return candidates[k].i;
  }
  return candidates[candidates.length - 1].i;
}

/** "Phase" of the build-up based on how close the ball is to the
 *  attacking goal. Drives team-wide line shifts: in build-up, every
 *  outfield player is in their own/middle third; in the final third,
 *  fullbacks overlap and the back line pushes to halfway. */
type Phase = "buildup" | "midfield" | "final-third" | "box";
function phaseFor(
  ballY: number,
  attackingDir: -1 | 1,
): Phase {
  // Distance along attack direction: 0 = at own goal line, 100 = at
  // opposition goal line.
  const along = attackingDir < 0 ? 100 - ballY : ballY;
  if (along < 35) return "buildup";
  if (along < 60) return "midfield";
  if (along < 82) return "final-third";
  return "box";
}

/** How far up the pitch the team's shape pushes for each phase, in
 *  pitch units. Positive = toward the attacking goal. */
function phasePush(phase: Phase): number {
  switch (phase) {
    case "buildup":     return -3;
    case "midfield":    return  4;
    case "final-third": return 12;
    case "box":         return 18;
  }
}

/** Highlight events — those that deserve a scripted, slowed-down
 *  multi-stage build-up on the pitch instead of a single teleport
 *  pass. Routine ticks (Chance, ShotWide, etc.) keep the freeform
 *  dribble cycle so they zip past at match speed. */
const HIGHLIGHT_TYPES: ReadonlyArray<MatchEvent["type"]> = [
  "Goal", "WonderGoal", "Deflection", "PenaltyScored", "OwnGoal",
  "BigChance", "DisallowedGoal", "LateDrama",
  "KeeperSave", "KeeperMistake", "DefensiveError",
  "Penalty", "PenaltyMissed",
  "Yellow", "Red", "Injury",
];

function isHighlightEvent(ev: MatchEvent | undefined): boolean {
  return !!ev && HIGHLIGHT_TYPES.includes(ev.type);
}

/** Build the script for a highlight: a build-up pass into midfield
 *  followed by the climax pass into the engine-supplied scene point.
 *  Frame budgets are tuned so each stage tiles inside its event's
 *  dwell window at 1× speed (see `dwellMsForEvent` for the targets):
 *    Goal       4200ms / 42f → 8 + 5 + 12 + 17
 *    BigChance  2600ms / 26f → 6 + 4 + 8 + 8
 *    Card/Save  1900ms / 19f → 5 + 4 + 6 + 4
 *  Higher speeds (2× / 4×) just cut the script short — the ball
 *  resets into the next event's choreography cleanly. */
function highlightStagesFor(
  ev: MatchEvent,
  homeTeam: TeamSnapshot,
  awayTeam: TeamSnapshot,
  scene: { team: "home" | "away"; carrierIdx: number; pos: Pt },
): HighlightStage[] {
  const dir: -1 | 1 = scene.team === "home" ? -1 : 1;
  const snap = scene.team === "home" ? homeTeam : awayTeam;
  // Build-up beat — central-midfield carrier roughly at the halfway
  // line. Adds a small jitter so successive highlights don't all
  // start at the exact same point.
  const buildupCarrier = pickCarrier(snap, dir, "mid");
  const buildupPos: Pt = {
    x: 32 + Math.random() * 36,
    y: 50 + (Math.random() - 0.5) * 14,
  };

  // Goals — the headline. Long climax pass + lingering hold for the
  // celebration / replay feel.
  if (GOAL_TYPES.includes(ev.type)) {
    return [
      {
        team: scene.team, carrierIdx: buildupCarrier,
        toX: buildupPos.x, toY: buildupPos.y,
        passDurationFrames: 8, holdAfterFrames: 5,
      },
      {
        team: scene.team, carrierIdx: scene.carrierIdx,
        toX: scene.pos.x, toY: scene.pos.y,
        passDurationFrames: 12, holdAfterFrames: 17,
      },
    ];
  }

  // Big chances / saves / penalties / disallowed goals — a strong
  // beat but shorter than a goal.
  const isBig =
    ev.type === "BigChance" ||
    ev.type === "KeeperSave" ||
    ev.type === "KeeperMistake" ||
    ev.type === "DefensiveError" ||
    ev.type === "Penalty" ||
    ev.type === "PenaltyMissed" ||
    ev.type === "DisallowedGoal" ||
    ev.type === "LateDrama";
  if (isBig) {
    return [
      {
        team: scene.team, carrierIdx: buildupCarrier,
        toX: buildupPos.x, toY: buildupPos.y,
        passDurationFrames: 6, holdAfterFrames: 4,
      },
      {
        team: scene.team, carrierIdx: scene.carrierIdx,
        toX: scene.pos.x, toY: scene.pos.y,
        passDurationFrames: 8, holdAfterFrames: 8,
      },
    ];
  }

  // Yellow / Red / Injury — quick beat, restart shape.
  return [
    {
      team: scene.team, carrierIdx: buildupCarrier,
      toX: buildupPos.x, toY: buildupPos.y,
      passDurationFrames: 5, holdAfterFrames: 4,
    },
    {
      team: scene.team, carrierIdx: scene.carrierIdx,
      toX: scene.pos.x, toY: scene.pos.y,
      passDurationFrames: 6, holdAfterFrames: 4,
    },
  ];
}

/** Determine which team has possession + roughly where the ball should
 *  land based on the event currently being shown. */
function sceneForEvent(
  ev: MatchEvent | undefined,
  homeTeam: TeamSnapshot,
  awayTeam: TeamSnapshot,
): { team: "home" | "away"; carrierIdx: number; pos: Pt } | null {
  if (!ev) return null;

  // Period markers — drop the ball at centre with a midfielder.
  if (ev.type === "Kickoff" || ev.type === "HalfTime" || ev.type === "FullTime") {
    return {
      team: "home",
      carrierIdx: pickCarrier(homeTeam, -1, "mid"),
      pos: { x: 50, y: 50 },
    };
  }

  // Goals — ball ends in the conceding net, scoring team has it as
  // they jog back to half. Own goals: the conceding team becomes the
  // "scoring" reference for net direction.
  if (GOAL_TYPES.includes(ev.type)) {
    const isOG = ev.type === "OwnGoal";
    const scoringHome = isOG ? ev.team !== "home" : ev.team === "home";
    const team: "home" | "away" = scoringHome ? "home" : "away";
    const snap = scoringHome ? homeTeam : awayTeam;
    const dir: -1 | 1 = scoringHome ? -1 : 1;
    return {
      team,
      carrierIdx: pickCarrier(snap, dir, "final-third"),
      pos: { x: 50, y: scoringHome ? 4 : 96 },
    };
  }

  // Saves / keeper events — ball at the keeper of the team that
  // gave away the chance.
  if (ev.type === "KeeperSave" || ev.type === "KeeperMistake") {
    // ev.team for KeeperSave is set to the *defending* team in
    // matchEngine (the keeper's side), so use ev.team as the team
    // with the ball after the save.
    const team: "home" | "away" = ev.team;
    const snap = team === "home" ? homeTeam : awayTeam;
    const gkIdx = snap.placements.findIndex((p) => p.isGK);
    return {
      team,
      carrierIdx: gkIdx >= 0 ? gkIdx : 0,
      pos: { x: 50, y: team === "home" ? 92 : 8 },
    };
  }

  // Attacking events — ball with attacking team in their final third.
  if (ATTACK_TYPES.includes(ev.type)) {
    const team: "home" | "away" = ev.team;
    const snap = team === "home" ? homeTeam : awayTeam;
    const dir: -1 | 1 = team === "home" ? -1 : 1;
    return {
      team,
      carrierIdx: pickCarrier(snap, dir, "final-third"),
      pos: {
        x: 30 + Math.random() * 40,
        y: team === "home" ? 16 : 84,
      },
    };
  }

  // Cards / injuries — ball at offender's spot, possession to the OTHER
  // team for the resulting free kick.
  if (FLASH_TYPES.includes(ev.type)) {
    const restartTeam: "home" | "away" = ev.team === "home" ? "away" : "home";
    const snap = restartTeam === "home" ? homeTeam : awayTeam;
    return {
      team: restartTeam,
      carrierIdx: pickCarrier(snap, restartTeam === "home" ? -1 : 1, "mid"),
      pos: {
        x: 30 + Math.random() * 40,
        y: ev.team === "home" ? 65 : 35,
      },
    };
  }

  return null;
}

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
    () => buildTeamSnapshot(home, homeLineup, players, /* isHome */ true),
    [home, homeLineup, players],
  );
  const awayTeam = useMemo(
    () => buildTeamSnapshot(away, awayLineup, players, /* isHome */ false),
    [away, awayLineup, players],
  );

  const homeColor = homeTeam.primaryColor;
  const awayColor = awayTeam.primaryColor;
  const homeAccent = homeTeam.accentColor;
  const awayAccent = awayTeam.accentColor;

  const ev = result.events[tickIndex];

  // ── Possession state ───────────────────────────────────────────────
  // Held in a ref so the per-frame interval mutates it without
  // triggering a render. Render snapshots the ref's value into
  // `snap` state once per tick (every ~100ms) so we keep the React
  // hooks-rules happy AND avoid re-rendering on every micro-step.
  const lazyInit = (): BallState => {
    const initial = sceneForEvent(result.events[0], homeTeam, awayTeam);
    const base = {
      mode: "dribbling" as BallMode,
      progress: 1,
      passDurationFrames: 6,
      dribbleFrames: 0,
      dribbleHoldFrames: 14,
      scene: "normal" as Scene,
      highlightStages: [] as HighlightStage[],
      highlightStageIdx: 0,
      highlightClimax: false,
    };
    return initial
      ? {
          team: initial.team,
          carrierIdx: initial.carrierIdx,
          x: initial.pos.x, y: initial.pos.y,
          fromX: initial.pos.x, fromY: initial.pos.y,
          toX: initial.pos.x,   toY: initial.pos.y,
          ...base,
        }
      : {
          team: "home",
          carrierIdx: 0,
          x: 50, y: 50,
          fromX: 50, fromY: 50,
          toX: 50, toY: 50,
          ...base,
        };
  };
  const ballRef = useRef<BallState>(lazyInit());
  const [snap, setSnap] = useState<{ ball: BallState; frame: number }>(() => ({
    ball: lazyInit(),
    frame: 0,
  }));
  const frame = snap.frame;

  // When the displayed event changes, choreograph the visual.
  //
  //   • Highlight events (goals, big chances, saves, cards) script a
  //     two-stage build-up→climax that fits inside the event's dwell.
  //     The simulator slows down so the moment reads clearly.
  //   • Routine events (Chance, ShotWide, period markers) keep the
  //     existing single-pass scene change so the in-between play
  //     blasts past at match speed.
  //
  // After the highlight stages complete the simulator drops back to
  // the freeform dribble cycle until the next event arrives.
  useEffect(() => {
    const scene = sceneForEvent(ev, homeTeam, awayTeam);
    if (!scene || !ev) return;
    const cur = ballRef.current;

    if (isHighlightEvent(ev)) {
      const stages = highlightStagesFor(ev, homeTeam, awayTeam, scene);
      const first = stages[0];
      ballRef.current = {
        ...cur,
        team: first.team,
        carrierIdx: first.carrierIdx,
        mode: "passing",
        fromX: cur.x, fromY: cur.y,
        toX: first.toX, toY: first.toY,
        progress: 0,
        passDurationFrames: first.passDurationFrames,
        dribbleFrames: 0,
        dribbleHoldFrames: first.holdAfterFrames,
        scene: "highlight",
        highlightStages: stages,
        highlightStageIdx: 0,
        highlightClimax: false,
      };
    } else {
      // Routine — single-pass teleport into the event's zone, then
      // hand back to the freeform cycle.
      ballRef.current = {
        ...cur,
        team: scene.team,
        carrierIdx: scene.carrierIdx,
        mode: "passing",
        fromX: cur.x, fromY: cur.y,
        toX: scene.pos.x, toY: scene.pos.y,
        progress: 0,
        passDurationFrames: 6,
        dribbleFrames: 0,
        dribbleHoldFrames: 14 + Math.floor(Math.random() * 8),
        scene: "normal",
        highlightStages: [],
        highlightStageIdx: 0,
        highlightClimax: false,
      };
    }
  }, [tickIndex, ev, homeTeam, awayTeam]);

  // ── Frame tick — drives the visual.
  // The state machine alternates between PASSING (ball lerping between
  // two positions) and DRIBBLING (carrier walking forward with the
  // ball). When dribble time runs out we either pass forward, shoot
  // (turnover at the edge of the box), or lose possession.
  // We keep a frame counter in a ref so the interval body always sees
  // the current value (closing over `frame` would freeze it at 0).
  const frameCounterRef = useRef(0);
  // Pause flag mirror — we read it inside the interval, so use a ref so
  // we don't have to tear the interval down every time `running` flips.
  const runningRef = useRef(running);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => {
    const id = setInterval(() => {
      // === PAUSE ==========================================================
      // When the user pauses the watch screen, freeze every part of the
      // simulator (ball, players, wobble). The commentary feed is
      // already paused at the page level, so picture and feed stay in
      // perfect sync.
      if (!runningRef.current) return;

      frameCounterRef.current += 1;
      const f = frameCounterRef.current;
      const b = ballRef.current;
      const dir: -1 | 1 = b.team === "home" ? -1 : 1;
      const teamSnap = b.team === "home" ? homeTeam : awayTeam;
      const oppSnap  = b.team === "home" ? awayTeam : homeTeam;
      const carrier = teamSnap.placements[b.carrierIdx];

      // === HIGHLIGHT MODE =================================================
      // Scripted, multi-stage choreography of the current major event.
      // Stages alternate pass → hold; when all stages run out we drop
      // back to normal play (which is a no-op until the next event).
      if (b.scene === "highlight") {
        if (b.mode === "passing") {
          b.progress = Math.min(1, b.progress + 1 / b.passDurationFrames);
          b.x = lerp(b.fromX, b.toX, b.progress);
          b.y = lerp(b.fromY, b.toY, b.progress);
          if (b.progress >= 1) {
            b.mode = "dribbling";
            b.dribbleFrames = 0;
            // Light up the climax flag once the FINAL stage lands so
            // the render can paint a glow on the ball.
            if (b.highlightStageIdx === b.highlightStages.length - 1) {
              b.highlightClimax = true;
            }
          }
        } else {
          // Hold — slight ball jitter to read as "play settling".
          b.dribbleFrames += 1;
          const wiggle = Math.sin(f * 0.18 + (carrier?.phase ?? 0)) * 0.5;
          b.x = clamp(b.x + wiggle * 0.25, 5, 95);
          if (b.dribbleFrames >= b.dribbleHoldFrames) {
            const next = b.highlightStages[b.highlightStageIdx + 1];
            if (next) {
              // Advance to the next stage of the highlight.
              b.highlightStageIdx += 1;
              b.team = next.team;
              b.carrierIdx = next.carrierIdx;
              b.mode = "passing";
              b.fromX = b.x; b.fromY = b.y;
              b.toX = next.toX; b.toY = next.toY;
              b.progress = 0;
              b.passDurationFrames = next.passDurationFrames;
              b.dribbleHoldFrames = next.holdAfterFrames;
            } else {
              // Highlight choreography finished — fall back to the
              // freeform dribble cycle until the next event arrives.
              b.scene = "normal";
              b.highlightStages = [];
              b.highlightStageIdx = 0;
              b.highlightClimax = false;
              b.dribbleFrames = 0;
              b.dribbleHoldFrames = 12;
            }
          }
        }
        setSnap((prev) => ({
          ball: { ...ballRef.current },
          frame: prev.frame + 1,
        }));
        return;
      }

      // === NORMAL MODE ===================================================
      if (b.mode === "passing") {
        b.progress = Math.min(1, b.progress + 1 / b.passDurationFrames);
        b.x = lerp(b.fromX, b.toX, b.progress);
        b.y = lerp(b.fromY, b.toY, b.progress);
        if (b.progress >= 1) {
          b.mode = "dribbling";
          b.dribbleFrames = 0;
        }
      } else {
        // Dribbling — carrier walks toward the attacking goal, taking
        // the ball with them. Speed scales with the carrier's pace so
        // a quick winger on the break visibly outruns a slow CB.
        const paceFactor = 0.5 + (carrier?.pace ?? 60) / 100; // 0.65 .. 1.5
        const stepY = 0.55 * dir * paceFactor;
        const wiggleX = Math.sin(f * 0.18 + (carrier?.phase ?? 0)) * 0.55;
        b.x = clamp(b.x + wiggleX * 0.4, 5, 95);
        b.y = clamp(b.y + stepY, 4, 96);
        b.dribbleFrames += 1;

        // Pressure check — if a defender is right on top of the ball,
        // there's a good chance the carrier loses possession (turnover
        // to the closest opponent) or is forced into an early pass.
        let nearestOpp = -1;
        let nearestOppDist = Infinity;
        oppSnap.placements.forEach((p, i) => {
          if (p.isGK) return;
          const d = Math.hypot(p.curX - b.x, p.curY - b.y);
          if (d < nearestOppDist) { nearestOppDist = d; nearestOpp = i; }
        });
        const heavyPressure = nearestOppDist < 6;

        // Decide: pass / shoot / turnover / keep dribbling.
        if (b.dribbleFrames >= b.dribbleHoldFrames || heavyPressure) {
          // Distance from goal in attacking direction — used to
          // decide whether to "shoot" (let the engine resolve the
          // moment via its event timeline; we just pop the ball
          // toward the goal box) or play another pass.
          const goalDist = dir < 0 ? b.y : 100 - b.y;
          const inFinalThird = goalDist < 22;

          // Turnover triggered by heavy pressure or random misplaced
          // pass. Higher chance under pressure so the press looks
          // meaningful.
          const turnoverChance = heavyPressure ? 0.55 : 0.10;
          const turnover = Math.random() < turnoverChance;

          if (turnover && nearestOpp >= 0) {
            const newTeam = b.team === "home" ? "away" : "home";
            b.team = newTeam;
            b.carrierIdx = nearestOpp;
            b.mode = "passing";
            b.fromX = b.x; b.fromY = b.y;
            const t = oppSnap.placements[nearestOpp];
            b.toX = clamp(t.curX, 4, 96);
            b.toY = clamp(t.curY, 4, 96);
            b.progress = 0;
            b.passDurationFrames = 4 + Math.floor(Math.random() * 3);
            b.dribbleHoldFrames = 12 + Math.floor(Math.random() * 8);
          } else if (inFinalThird && Math.random() < 0.35) {
            // Shot at goal — the ball arcs to the goal mouth, then
            // a turnover follows (defending keeper or fullback picks
            // it up). The match engine's event for THIS moment is
            // what tells the user if it went in; the simulator just
            // visually completes the build-up.
            const goalY = dir < 0 ? 4 : 96;
            const goalX = 42 + Math.random() * 16;
            b.mode = "passing";
            b.fromX = b.x; b.fromY = b.y;
            b.toX = goalX; b.toY = goalY;
            b.progress = 0;
            b.passDurationFrames = 6 + Math.floor(Math.random() * 3);
            // Switch possession after the shot lands.
            const otherSnap = b.team === "home" ? awayTeam : homeTeam;
            const newGk = otherSnap.placements.findIndex((p) => p.isGK);
            b.team = b.team === "home" ? "away" : "home";
            b.carrierIdx = newGk >= 0 ? newGk : 0;
            b.dribbleHoldFrames = 16 + Math.floor(Math.random() * 8);
          } else {
            // Routine forward pass.
            const receiverIdx = pickPassReceiver(
              teamSnap, b.carrierIdx, b.x, b.y, dir,
            );
            const target = teamSnap.placements[receiverIdx];
            b.carrierIdx = receiverIdx;
            b.mode = "passing";
            b.fromX = b.x; b.fromY = b.y;
            // Pass to slightly in front of where the receiver is now,
            // so it looks like they meet the ball — proper football.
            const lead = 1.5 * dir * (target.pace / 80);
            b.toX = clamp(target.curX + (Math.random() - 0.5) * 3, 4, 96);
            b.toY = clamp(target.curY + lead, 4, 96);
            b.progress = 0;
            b.passDurationFrames = 4 + Math.floor(Math.random() * 4);
            b.dribbleHoldFrames = 14 + Math.floor(Math.random() * 10);
          }
        }
      }
      // Mirror the mutated ball ref into React state so render sees a
      // fresh snapshot. We shallow-copy the ref so React treats this
      // as a new object and re-renders deterministically.
      setSnap((prev) => ({
        ball: { ...ballRef.current },
        frame: prev.frame + 1,
      }));
    }, 100);
    return () => clearInterval(id);
  }, [homeTeam, awayTeam]);

  // ── Derived per-frame visual state ─────────────────────────────────
  // Read from `snap` (React state) rather than the underlying ref so
  // every render sees a stable, hooks-rules-friendly snapshot.
  const b = snap.ball;
  const ball: Pt = { x: b.x, y: b.y };
  const ballMoving = b.mode === "passing";

  // Apply a phase-aware push to every player on each team. Possessing
  // team pushes UP; defending team drops BACK. The carrier ignores
  // these and tracks the ball directly.
  const attackingDir: -1 | 1 = b.team === "home" ? -1 : 1;
  const phase = phaseFor(b.y, attackingDir);
  const teamPush = phasePush(phase);

  const homePlayers = useMemo(
    () => animateTeam({
      team: homeTeam, ball, frame,
      hasBall: b.team === "home",
      carrierIdx: b.team === "home" ? b.carrierIdx : -1,
      attackingDir: -1,
      teamPush: b.team === "home" ? teamPush : -teamPush * 0.45,
      ballMoving,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [homeTeam, ball.x, ball.y, frame, b.team, b.carrierIdx, teamPush, ballMoving],
  );
  const awayPlayers = useMemo(
    () => animateTeam({
      team: awayTeam, ball, frame,
      hasBall: b.team === "away",
      carrierIdx: b.team === "away" ? b.carrierIdx : -1,
      attackingDir: 1,
      teamPush: b.team === "away" ? teamPush : -teamPush * 0.45,
      ballMoving,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [awayTeam, ball.x, ball.y, frame, b.team, b.carrierIdx, teamPush, ballMoving],
  );

  // Side flash for goals / cards.
  const flashState = useMemo(() => {
    if (!ev) return { flash: null as string | null, side: null as "home" | "away" | null };
    if (GOAL_TYPES.includes(ev.type)) {
      const isOG = ev.type === "OwnGoal";
      const scoringHome = isOG ? ev.team !== "home" : ev.team === "home";
      return {
        flash: scoringHome ? homeColor : awayColor,
        side: (scoringHome ? "home" : "away") as "home" | "away",
      };
    }
    if (ev.type === "Red") return { flash: "#FF3030", side: ev.team };
    if (ev.type === "Yellow") return { flash: "#FFD000", side: ev.team };
    return { flash: null, side: null };
  }, [ev, homeColor, awayColor]);

  const flip = !userIsHome;

  return (
    <div
      className="relative mx-auto select-none"
      style={{
        width: "100%",
        maxWidth: 340,
        aspectRatio: "4 / 6",
        background: "#1F6B1F",
        backgroundImage:
          "repeating-linear-gradient(180deg, #1F6B1F 0 8%, #1A5C1A 8% 16%)",
        boxShadow: "inset 0 0 0 2px #0E0830, inset 0 0 18px rgba(0,0,0,0.45)",
        imageRendering: "pixelated",
        overflow: "hidden",
        transform: flip ? "rotate(180deg)" : undefined,
        transition: "transform 200ms ease",
      }}
      aria-hidden
    >
      {/* Pitch lines (unchanged) */}
      <svg
        viewBox="0 0 100 150"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <g stroke="rgba(255,255,255,0.85)" strokeWidth={0.5} fill="none" shapeRendering="crispEdges">
          <rect x={2} y={2} width={96} height={146} />
          <line x1={2} y1={75} x2={98} y2={75} />
          <circle cx={50} cy={75} r={10} />
          <circle cx={50} cy={75} r={0.8} fill="rgba(255,255,255,0.85)" />
          <rect x={20} y={2} width={60} height={20} />
          <rect x={34} y={2} width={32} height={8} />
          <circle cx={50} cy={16} r={0.8} fill="rgba(255,255,255,0.85)" />
          <path d="M40 22 A 10 10 0 0 0 60 22" />
          <rect x={42} y={-2} width={16} height={4} fill="rgba(0,0,0,0.6)" />
          <rect x={20} y={128} width={60} height={20} />
          <rect x={34} y={140} width={32} height={8} />
          <circle cx={50} cy={134} r={0.8} fill="rgba(255,255,255,0.85)" />
          <path d="M40 128 A 10 10 0 0 1 60 128" />
          <rect x={42} y={148} width={16} height={4} fill="rgba(0,0,0,0.6)" />
        </g>
      </svg>

      {flashState.flash && flashState.side && (
        <div
          key={`${tickIndex}-${flashState.side}`}
          style={{
            position: "absolute", left: 0, right: 0,
            top: flashState.side === "home" ? "50%" : 0,
            bottom: flashState.side === "home" ? 0 : "50%",
            background: `linear-gradient(${flashState.side === "home" ? "0deg" : "180deg"}, ${flashState.flash}55, transparent 70%)`,
            animation: "pitch-flash 700ms ease-out 1",
            pointerEvents: "none",
          }}
        />
      )}

      {homePlayers.map((p, i) => (
        <PlayerDot
          key={`h${i}`}
          x={p.x}
          y={p.y}
          color={homeColor}
          accent={homeAccent}
          isGK={p.isGK}
          isCarrier={b.team === "home" && b.carrierIdx === i}
        />
      ))}
      {awayPlayers.map((p, i) => (
        <PlayerDot
          key={`a${i}`}
          x={p.x}
          y={p.y}
          color={awayColor}
          accent={awayAccent}
          isGK={p.isGK}
          isCarrier={b.team === "away" && b.carrierIdx === i}
        />
      ))}

      {/* Ball — smoothly lerps along the pass; faint trail traces the
          path while a pass is in flight. */}
      <span
        style={{
          position: "absolute",
          left: `${b.fromX}%`,
          top: `${(b.fromY / 100) * 100}%`,
          width: 4, height: 4,
          marginLeft: -2, marginTop: -2,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.30)",
          opacity: ballMoving ? 1 : 0,
          transition: "opacity 200ms linear",
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: `${ball.x}%`,
          top: `${(ball.y / 100) * 100}%`,
          width: b.highlightClimax ? 9 : 7,
          height: b.highlightClimax ? 9 : 7,
          marginLeft: b.highlightClimax ? -4.5 : -3.5,
          marginTop: b.highlightClimax ? -4.5 : -3.5,
          borderRadius: "50%",
          background: "#FFFFFF",
          // Soft glow during a highlight climax — ball reads as "the
          // moment" against the rest of the pitch.
          boxShadow: b.highlightClimax
            ? "0 0 0 2px rgba(255,255,255,0.85), 0 0 12px rgba(255,255,255,0.9), 0 0 24px rgba(255,208,0,0.65)"
            : "0 0 4px rgba(255,255,255,0.85), 0 0 1px rgba(0,0,0,0.9)",
          transition: "left 110ms linear, top 110ms linear, width 200ms ease, height 200ms ease, box-shadow 200ms ease",
          willChange: "left, top",
        }}
      />

      <div
        style={{
          position: "absolute", top: 4, left: 4,
          color: "rgba(255,255,255,0.78)",
          fontSize: 9, letterSpacing: "0.16em",
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          transform: flip ? "rotate(180deg)" : undefined,
          transformOrigin: "center",
          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
        }}
      >
        ▲ {(flip ? away : home).shortName}
        {(() => {
          const lu = flip ? awayLineup : homeLineup;
          return lu ? ` · ${lu.formationKey} · ${lu.tactic}` : "";
        })()}
      </div>
      <div
        style={{
          position: "absolute", bottom: 4, right: 4,
          color: "rgba(255,255,255,0.78)",
          fontSize: 9, letterSpacing: "0.16em",
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          transform: flip ? "rotate(180deg)" : undefined,
          transformOrigin: "center",
          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
        }}
      >
        ▼ {(flip ? home : away).shortName}
        {(() => {
          const lu = flip ? homeLineup : awayLineup;
          return lu ? ` · ${lu.formationKey} · ${lu.tactic}` : "";
        })()}
      </div>

      <style jsx>{`
        @keyframes pitch-flash {
          0%   { opacity: 0; }
          25%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// =====================================================================
// Helpers
// =====================================================================

function PlayerDot({
  x, y, color, accent, isGK, isCarrier,
}: {
  x: number;
  y: number;
  color: string;
  accent: string;
  isGK?: boolean;
  isCarrier?: boolean;
}) {
  const fg = readableOn(color);
  return (
    <span
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${(y / 100) * 100}%`,
        width: isGK ? 9 : 8,
        height: isGK ? 9 : 8,
        marginLeft: isGK ? -4.5 : -4,
        marginTop: isGK ? -4.5 : -4,
        background: isGK ? accent : color,
        border: `1px solid ${
          isGK
            ? "#0A0A0A"
            : isCarrier
              ? "#FFFFFF"
              : fg === "#FFFFFF" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)"
        }`,
        boxShadow: isCarrier
          ? "0 0 0 1px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.55)"
          : "0 1px 2px rgba(0,0,0,0.55)",
        transition: "left 110ms linear, top 110ms linear",
        willChange: "left, top",
      }}
    />
  );
}

interface AnimateArgs {
  team: TeamSnapshot;
  ball: Pt;
  frame: number;
  hasBall: boolean;
  carrierIdx: number;
  attackingDir: -1 | 1;
  /** Pitch-units to push the WHOLE team in the attacking direction —
   * driven by the build-up phase. Possessing team gets +12 in final
   * third etc; defending team gets a smaller negative push (drop back).
   */
  teamPush: number;
  /** True when the ball is mid-pass — gives the receiver a small
   * "meet the ball" lean. */
  ballMoving: boolean;
}

/** Compute every player's per-frame screen coord. The carrier glues
 *  to the ball; teammates push forward in waves; defenders close down
 *  and drop back. We mutate `placement.curX/Y` in-place so subsequent
 *  pass receiver / pressure checks read up-to-date positions and the
 *  motion smooths frame-to-frame. */
function animateTeam(args: AnimateArgs): Array<{ x: number; y: number; isGK: boolean }> {
  const { team, ball, frame, hasBall, carrierIdx, attackingDir, teamPush, ballMoving } = args;

  return team.placements.map((p, i): { x: number; y: number; isGK: boolean } => {
    // === The carrier — glued to the ball with a tight dribble wobble.
    if (i === carrierIdx) {
      const dribbleX = Math.sin(frame * 0.5 + p.phase) * 1.0;
      const dribbleY = Math.cos(frame * 0.45 + p.phase) * 0.7;
      const x = clamp(ball.x + dribbleX, 3, 97);
      const y = clamp(ball.y + dribbleY, 3, 97);
      p.curX = x; p.curY = y;
      return { x, y, isGK: p.isGK };
    }

    // === GK target — sits on the goal line, drifts laterally with
    // ball x. Always near own goal regardless of phase.
    if (p.isGK) {
      const ownGoalY = attackingDir < 0 ? 96 : 4;
      const tx = clamp(50 + (ball.x - 50) * 0.3, 38, 62);
      const ty = ownGoalY + (Math.sin(frame * 0.06 + p.phase) * 0.4);
      p.curX = lerp(p.curX, tx, 0.18);
      p.curY = lerp(p.curY, ty, 0.18);
      return { x: p.curX, y: p.curY, isGK: true };
    }

    // === Outfield off-ball target.
    // 1) Start from the tactical home anchor.
    // 2) Apply the team-wide phase push (whole block moves up/back).
    // 3) Apply on-ball "break forward" or off-ball "press / drop".
    // 4) Add a small lateral pull toward the ball line so wide players
    //    track the play, not just the ball.
    let targetX = p.homeX;
    let targetY = p.homeY + teamPush * attackingDir;

    const dx = ball.x - p.homeX;
    const dy = ball.y - (p.homeY + teamPush * attackingDir);
    const dist = Math.hypot(dx, dy);

    if (hasBall) {
      // Possessing team — break forward. Strikers and wingers go big;
      // defenders edge up. Distance from ball fades the effect so the
      // back line doesn't sprint into the box.
      const fade = dist > 55 ? 0.5 : dist > 32 ? 0.85 : 1;
      const advance = p.attackFactor * 26 * fade;
      targetY += advance * attackingDir;
      // Lateral pull toward the line of play.
      targetX += dx * 0.18 * fade;
      // If a pass is in flight, the receiver-ish nearby teammates
      // lean toward the ball to "meet it".
      if (ballMoving && dist < 22) {
        targetX += dx * 0.20;
        targetY += dy * 0.20;
      }
    } else {
      // Defending team — closest defenders press, the line behind them
      // drops back to cover. Distance fades the press, not the drop.
      const press = p.pressFactor * (dist < 20 ? 1.2 : dist < 40 ? 0.7 : 0.25);
      targetX += dx * press;
      targetY += dy * press;
      // Compact-line behaviour — when the ball is in this team's
      // defensive third, the back four shifts toward the ball x.
      const ownThirdSide = attackingDir < 0 ? ball.y > 60 : ball.y < 40;
      if (ownThirdSide) {
        targetX += (ball.x - 50) * 0.10;
      }
    }

    // Constant per-frame wobble so dots are always alive — bigger than
    // before because the prior amplitudes read as "frozen" on screen.
    const wx = Math.sin(frame * p.speed + p.phase) * p.ampX;
    const wy = Math.cos(frame * p.speed * 0.8 + p.phase * 1.3) * p.ampY;
    targetX = clamp(targetX + wx, 3, 97);
    targetY = clamp(targetY + wy, 3, 97);

    // === Smooth-follow lerp — players drift toward target each frame
    // rather than snapping. Lerp factor scales with pace so a fast
    // winger covers ground quicker than a slow CB.
    const lerpAmt = 0.12 + (p.pace / 100) * 0.10;
    p.curX = lerp(p.curX, targetX, lerpAmt);
    p.curY = lerp(p.curY, targetY, lerpAmt);

    return { x: p.curX, y: p.curY, isGK: p.isGK };
  });
}
