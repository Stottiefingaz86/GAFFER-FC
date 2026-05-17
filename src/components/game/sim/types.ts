// =====================================================================
// sim/types.ts — shared types, pitch constants, geometry helpers used
// by every sub-module of the new match simulator.
//
// Pitch space is 100 wide × 150 tall (SVG viewBox).
// HOME defends y=BOT_GOAL_LINE_Y (144) and attacks toward y=TOP_GOAL_LINE_Y (6).
// AWAY mirrors.
// =====================================================================

import type { DetailedPosition, PlayerRole } from "@/types/game";

// ─────────────────────────────────────────────────────────────────────
// PITCH CONSTANTS
// ─────────────────────────────────────────────────────────────────────
export const TOP_GOAL_LINE_Y = 6;
export const BOT_GOAL_LINE_Y = 144;
export const TOP_GOAL_BACK_Y = 1;
export const BOT_GOAL_BACK_Y = 149;
export const GOAL_LEFT = 42;
export const GOAL_RIGHT = 58;
export const PEN_BOX_LEFT = 22;
export const PEN_BOX_RIGHT = 78;
export const TOP_PEN_BOX_BOTTOM = 26;
export const BOT_PEN_BOX_TOP = 124;
export const SIX_YARD_LEFT = 36;
export const SIX_YARD_RIGHT = 64;
export const TOP_SIX_BOTTOM = 14;
export const BOT_SIX_TOP = 136;
export const TOP_PEN_SPOT_Y = 19;
export const BOT_PEN_SPOT_Y = 131;
export const HALFWAY_Y = 75;

export const PITCH_W = 100;
export const PITCH_H = 150;

// Side / point primitives.
export type Side = "home" | "away";
export interface Pt { x: number; y: number }

// ─────────────────────────────────────────────────────────────────────
// PER-PLAYER SIM RECORD — packs everything we need to drive AI/visual.
// ─────────────────────────────────────────────────────────────────────
export interface PlayerPlacement {
  /** Slot anchor on pitch (formation + tactic + role). */
  homeX: number;
  homeY: number;
  /** Live rendered position. */
  curX: number;
  curY: number;
  /** Where the AI / scene wants this player heading right now. */
  targetX: number;
  targetY: number;
  /** True when an active scene beat is steering this player. Disables
   *  off-ball steering for them this frame. */
  scripted: boolean;
  /** Detailed position from formation (CB, LW, ST, etc.). */
  slotPos: DetailedPosition;
  /** Tactical role from lineup (Overlap, Cut Inside, etc.). */
  role: PlayerRole;
  /** True for the goalkeeper. */
  isGK: boolean;
  /** Jersey number rendered inside the dot. */
  jersey: number;
  /** Player.id (when the slot is filled). Scenes use this to find the
   *  actual engine-named player (scorer, keeper that made the save,
   *  offender that got carded, etc.) on the pitch — so the dot doing
   *  the action is the dot the commentary names. */
  playerId?: string;
  /** Player display name — for hover / debug. */
  displayName?: string;
  /** Player trait — used to flavour scene variants (Wonderkid hits
   *  unstoppable strikes, Target Man heads crosses, Speedster sprints
   *  the channel, etc.). */
  trait?: string;

  // ── Attributes (extracted once at lineup build) ───────────────────
  pace: number;
  shooting: number;
  passing: number;
  tackling: number;
  stamina: number;
  technique: number;
  strength: number;
  mentality: number;
  goalkeeping: number;
  /** Overall — used as a generic "skill" weighting. */
  overall: number;

  /** Phase offset for idle micro-jitter so dots don't all wobble in sync. */
  phase: number;
}

export interface TeamSnapshot {
  side: Side;
  placements: PlayerPlacement[];
  primaryColor: string;
  accentColor: string;
  gkIdx: number;
  /** Tactic for this team — feeds the possession AI's behaviour. */
  tactic: import("@/types/game").Tactic;
  /** Formation key (e.g. "4-3-3"). */
  formationKey: string;
}

// ─────────────────────────────────────────────────────────────────────
// MICRO-ACTIONS — atomic ball events used by both the continuous AI
// and the scripted event scenes. The animation loop interpolates the
// ball along these.
// ─────────────────────────────────────────────────────────────────────
export type MicroActionKind =
  | "pass"        // ball travels to a teammate
  | "throughball" // ball threaded behind defenders to an onrushing teammate
  | "longball"    // raked diagonal / vertical long pass
  | "cross"       // ball hangs into the box from a wide area
  | "dribble"     // carrier moves with the ball
  | "shot"        // ball flies toward goal
  | "header"      // brief vertical pop, ball heads toward goal
  | "loose"       // ball is loose — players sprint to it
  | "settle"      // ball is stationary, carrier is on it (e.g. set piece)
  | "tackle";     // tackler steals it, possession flips

export interface MicroAction {
  kind: MicroActionKind;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Quadratic-bezier height factor 0..1 (0 = flat, 1 = high). */
  arc: number;
  /** Total duration of this action in ms. */
  durMs: number;
  /** When this action ends, who has the ball and where (used to update
   *  PlayState). For shots/crosses we leave it null and the resolver
   *  decides based on what happened. */
  endCarrierSide: Side | null;
  endCarrierIdx: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// PLAY STATE — current "live" possession info between events.
// ─────────────────────────────────────────────────────────────────────
export interface PlayState {
  ball: { x: number; y: number; z: number };
  carrierSide: Side | null;
  carrierIdx: number | null;
  action: MicroAction;
  actionElapsedMs: number;
}

// ─────────────────────────────────────────────────────────────────────
// SCENE PLAN — for scripted events. A scene is just a sequence of
// MicroActions plus visual flags (goal flash, card raised, etc.).
// ─────────────────────────────────────────────────────────────────────
export interface SceneFlag {
  ballInNet?: boolean;
  cardOver?: { side: Side; idx: number; color: "yellow" | "red" } | null;
  celebrate?: { side: Side; idx: number } | null;
  goalFlash?: { side: Side } | null;
  netRipple?: boolean;
  ballHidden?: boolean;
}

export interface PlayerHint {
  side: Side;
  idx: number;
  toX: number;
  toY: number;
}

export interface SceneBeat {
  durationMs: number;
  ball?: MicroAction;
  /** Players to override toward a specific spot during this beat. */
  hints?: PlayerHint[];
  /** Visual flags applied at the START of the beat. */
  flag?: SceneFlag;
}

export interface ScenePlan {
  beats: SceneBeat[];
  endBall: Pt;
  endFlag: SceneFlag;
  /** Possession after the scene completes (handed to the AI loop). */
  endCarrierSide: Side | null;
  endCarrierIdx: number | null;
  totalMs: number;
}

// ─────────────────────────────────────────────────────────────────────
// MATH HELPERS
// ─────────────────────────────────────────────────────────────────────
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

/** Mulberry32 — small deterministic PRNG so sim "decisions" are stable
 *  per match tick and reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit unsigned int. Used to seed scene RNGs
 *  off event playerIds so the same goal always plays the same way. */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────────────
// COMMON PREDICATES
// ─────────────────────────────────────────────────────────────────────
export const ATTACKING_POSITIONS: ReadonlyArray<DetailedPosition> = [
  "ST", "CF", "LW", "RW", "AM",
];

export const WIDE_POSITIONS: ReadonlyArray<DetailedPosition> = [
  "LB", "RB", "LM", "RM", "LW", "RW",
];

export const FULLBACK_POSITIONS: ReadonlyArray<DetailedPosition> = ["LB", "RB"];

export const MIDFIELDER_POSITIONS: ReadonlyArray<DetailedPosition> = [
  "DM", "CM", "LM", "RM", "AM",
];

export const DEFENDER_POSITIONS: ReadonlyArray<DetailedPosition> = [
  "CB", "LB", "RB",
];
