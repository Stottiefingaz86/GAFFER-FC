// =====================================================================
// sim/possession.ts — the rolling possession AI that runs CONTINUOUSLY
// between scripted match events. This is what stops the simulator
// from looking like "dots floating": the ball is always being passed,
// dribbled, crossed or shot somewhere by SOMEONE based on their
// attributes, role and the team's tactic.
//
// Core idea:
//   • At any moment there is a ball-carrier (or the ball is loose).
//   • When the carrier's current MicroAction completes, we ask the AI:
//     "given this player + their teammates + their opponents + tactic,
//      what's the next thing they want to do?"
//   • Score every plausible option and pick weighted-randomly. Result:
//     tiki-taka teams pass-pass-pass; direct teams hoof it long; a
//     dribbling winger weaves; a tall striker holds it up; a
//     defensive fullback recycles back to GK; etc.
//   • Each pass / dribble has a small turnover chance (defender
//     intercepts) so possession naturally flips.
// =====================================================================

import type { Tactic } from "@/types/game";
import {
  BOT_GOAL_LINE_Y,
  HALFWAY_Y,
  PEN_BOX_LEFT,
  PEN_BOX_RIGHT,
  TOP_GOAL_LINE_Y,
  type MicroAction,
  type PlayState,
  type Side,
  type TeamSnapshot,
  clamp,
  dist,
  makeRng,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function teamOf(side: Side, home: TeamSnapshot, away: TeamSnapshot): TeamSnapshot {
  return side === "home" ? home : away;
}

function oppGoalY(side: Side): number {
  return side === "home" ? TOP_GOAL_LINE_Y : BOT_GOAL_LINE_Y;
}

function ownGoalY(side: Side): number {
  return side === "home" ? BOT_GOAL_LINE_Y : TOP_GOAL_LINE_Y;
}

function dirToOppGoal(side: Side): -1 | 1 {
  return side === "home" ? -1 : 1;
}

/** Where on the pitch (0..1) the ball is in OUR attacking flow.
 *  0 = on our goal line, 1 = on their goal line. */
function attackProgress(side: Side, y: number): number {
  if (side === "home") {
    return clamp((BOT_GOAL_LINE_Y - y) / (BOT_GOAL_LINE_Y - TOP_GOAL_LINE_Y), 0, 1);
  } else {
    return clamp((y - TOP_GOAL_LINE_Y) / (BOT_GOAL_LINE_Y - TOP_GOAL_LINE_Y), 0, 1);
  }
}

interface TacticProfile {
  shortPassBias: number;   // prefer short ground passes
  longBallBias: number;    // hoof-it-long affinity
  dribbleBias: number;     // carry the ball
  shotBias: number;        // pull the trigger from distance
  crossBias: number;       // wide deliveries into the box
  throughBallBias: number; // line-splitting passes
  recycleBias: number;     // pass back to keep ball
  tempo: number;           // 0.5..1.5 — how quickly each action fires
}

function tacticProfile(t: Tactic): TacticProfile {
  switch (t) {
    case "Tiki-Taka":   return { shortPassBias: 1.5, longBallBias: 0.1, dribbleBias: 0.5, shotBias: 0.6, crossBias: 0.3, throughBallBias: 0.7, recycleBias: 1.2, tempo: 1.2 };
    case "Possession":  return { shortPassBias: 1.3, longBallBias: 0.2, dribbleBias: 0.7, shotBias: 0.7, crossBias: 0.5, throughBallBias: 0.7, recycleBias: 1.1, tempo: 1.0 };
    case "Direct":      return { shortPassBias: 0.7, longBallBias: 1.4, dribbleBias: 0.5, shotBias: 1.1, crossBias: 0.7, throughBallBias: 1.2, recycleBias: 0.4, tempo: 1.1 };
    case "Long Ball":   return { shortPassBias: 0.4, longBallBias: 1.7, dribbleBias: 0.3, shotBias: 1.0, crossBias: 0.6, throughBallBias: 0.8, recycleBias: 0.3, tempo: 1.0 };
    case "Counter":     return { shortPassBias: 0.7, longBallBias: 1.2, dribbleBias: 0.9, shotBias: 1.0, crossBias: 0.5, throughBallBias: 1.3, recycleBias: 0.5, tempo: 1.2 };
    case "Wing Play":   return { shortPassBias: 1.0, longBallBias: 0.7, dribbleBias: 0.7, shotBias: 0.7, crossBias: 1.7, throughBallBias: 0.5, recycleBias: 0.6, tempo: 1.0 };
    case "Attacking":   return { shortPassBias: 1.0, longBallBias: 0.8, dribbleBias: 0.9, shotBias: 1.3, crossBias: 0.9, throughBallBias: 1.1, recycleBias: 0.5, tempo: 1.1 };
    case "High Press":  return { shortPassBias: 1.0, longBallBias: 0.7, dribbleBias: 0.7, shotBias: 1.0, crossBias: 0.7, throughBallBias: 1.0, recycleBias: 0.6, tempo: 1.2 };
    case "Gegenpress":  return { shortPassBias: 1.1, longBallBias: 0.5, dribbleBias: 0.7, shotBias: 1.1, crossBias: 0.7, throughBallBias: 1.2, recycleBias: 0.5, tempo: 1.3 };
    case "Defensive":   return { shortPassBias: 1.0, longBallBias: 1.0, dribbleBias: 0.4, shotBias: 0.6, crossBias: 0.5, throughBallBias: 0.6, recycleBias: 1.4, tempo: 0.85 };
    case "Park the Bus":return { shortPassBias: 0.7, longBallBias: 1.5, dribbleBias: 0.2, shotBias: 0.4, crossBias: 0.3, throughBallBias: 0.4, recycleBias: 1.5, tempo: 0.8 };
    case "Balanced":
    default:            return { shortPassBias: 1.0, longBallBias: 0.8, dribbleBias: 0.7, shotBias: 0.8, crossBias: 0.7, throughBallBias: 0.8, recycleBias: 0.8, tempo: 1.0 };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Action factory helpers — each returns a complete MicroAction.
// ─────────────────────────────────────────────────────────────────────
function passAction(
  fromX: number, fromY: number,
  toX: number, toY: number,
  side: Side, idx: number,
  durMs: number,
): MicroAction {
  return {
    kind: "pass",
    fromX, fromY, toX, toY,
    arc: 0.06 + Math.min(0.20, dist(fromX, fromY, toX, toY) / 200),
    durMs,
    endCarrierSide: side, endCarrierIdx: idx,
  };
}

function longBall(
  fromX: number, fromY: number,
  toX: number, toY: number,
  side: Side, idx: number,
  durMs: number,
): MicroAction {
  return {
    kind: "longball",
    fromX, fromY, toX, toY,
    arc: 0.6,
    durMs,
    endCarrierSide: side, endCarrierIdx: idx,
  };
}

function throughBall(
  fromX: number, fromY: number,
  toX: number, toY: number,
  side: Side, idx: number,
  durMs: number,
): MicroAction {
  return {
    kind: "throughball",
    fromX, fromY, toX, toY,
    arc: 0.10,
    durMs,
    endCarrierSide: side, endCarrierIdx: idx,
  };
}

function crossAction(
  fromX: number, fromY: number,
  toX: number, toY: number,
  side: Side, idx: number,
  durMs: number,
): MicroAction {
  return {
    kind: "cross",
    fromX, fromY, toX, toY,
    arc: 0.55,
    durMs,
    endCarrierSide: side, endCarrierIdx: idx,
  };
}

function dribble(
  fromX: number, fromY: number,
  toX: number, toY: number,
  side: Side, idx: number,
  durMs: number,
): MicroAction {
  return {
    kind: "dribble",
    fromX, fromY, toX, toY,
    arc: 0,
    durMs,
    endCarrierSide: side, endCarrierIdx: idx,
  };
}

function shotAction(
  fromX: number, fromY: number,
  toX: number, toY: number,
  durMs: number,
): MicroAction {
  return {
    kind: "shot",
    fromX, fromY, toX, toY,
    arc: 0.55,
    durMs,
    endCarrierSide: null, endCarrierIdx: null,
  };
}

function settleAction(
  x: number, y: number, side: Side, idx: number, durMs: number,
): MicroAction {
  return {
    kind: "settle",
    fromX: x, fromY: y, toX: x, toY: y,
    arc: 0,
    durMs,
    endCarrierSide: side, endCarrierIdx: idx,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Decision: when a player gets the ball (or starts a new action), pick
// what they want to do next.
// ─────────────────────────────────────────────────────────────────────
function pickRandom<T>(
  weighted: { item: T; weight: number }[],
  rand: () => number,
): T | undefined {
  const total = weighted.reduce((a, w) => a + Math.max(0, w.weight), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const w of weighted) {
    r -= Math.max(0, w.weight);
    if (r <= 0) return w.item;
  }
  return weighted[weighted.length - 1]?.item;
}

interface DecisionCtx {
  carrying: TeamSnapshot;
  defending: TeamSnapshot;
  carrierIdx: number;
  ballX: number;
  ballY: number;
  rand: () => number;
}

/** Pick the next MicroAction for the current carrier. */
function decideAction(ctx: DecisionCtx): MicroAction {
  const { carrying, defending, carrierIdx, ballX, ballY, rand } = ctx;
  const me = carrying.placements[carrierIdx];
  const tp = tacticProfile(carrying.tactic);
  const side: Side = carrying.side;
  const dir = dirToOppGoal(side);
  const adv = attackProgress(side, ballY);

  // Distance to opponent goal.
  const goalY = oppGoalY(side);
  const distToGoal = Math.abs(ballY - goalY);
  const inFinalThird = adv > 0.6;
  const inAttackingHalf = adv > 0.4;
  const inOurThird = adv < 0.35;
  const wide = ballX < 22 || ballX > 78;

  // ── Build candidate options with tactical + attribute weights ────
  type Choice = { make: () => MicroAction; weight: number };
  const choices: Choice[] = [];

  // ── 1) SHOT (only from sensible range / angle) ───────────────────
  if (distToGoal < 45 && Math.abs(ballX - 50) < 28 && !me.isGK) {
    // Shot weight grows hugely close to goal, scales with shooting attr.
    const range = clamp((45 - distToGoal) / 45, 0, 1); // 0 at 45m, 1 at 0m
    const shotW =
      tp.shotBias *
      (0.4 + range * 1.2) *
      (0.4 + me.shooting / 100) *
      (me.slotPos === "GK" ? 0.0 : 1.0);
    if (shotW > 0.05) {
      choices.push({
        weight: shotW,
        make: () => {
          const sideRand = (rand() - 0.5) * 8; // sometimes wide
          const hit = clamp(50 + sideRand, 30, 70);
          return shotAction(ballX, ballY, hit, goalY + dir * 1.5, 380);
        },
      });
    }
  }

  // ── 2) CROSS (wide + advanced + cross bias) ──────────────────────
  if (wide && adv > 0.55) {
    // Pick a striker-type teammate near the box.
    const targetIdx = pickTeammate(carrying, defending, {
      preferPos: ["ST", "CF", "AM", "LW", "RW"],
      preferAreaX: 50,
      preferAreaY: goalY + dir * 12,
      excludeIdx: carrierIdx,
      ballX, ballY,
    });
    if (targetIdx !== null) {
      const target = carrying.placements[targetIdx];
      const crossW = tp.crossBias * (0.5 + me.passing / 120);
      choices.push({
        weight: crossW,
        make: () => crossAction(
          ballX, ballY,
          clamp(target.homeX + (rand() - 0.5) * 6, PEN_BOX_LEFT + 2, PEN_BOX_RIGHT - 2),
          goalY + dir * (8 + rand() * 6),
          side, targetIdx, 700,
        ),
      });
    }
  }

  // ── 3) DRIBBLE forward (high tech / pace player, with space) ─────
  if (!me.isGK) {
    const dribbleSkill = (me.technique + me.pace) / 200; // 0..1
    const dribbleW = tp.dribbleBias * (0.3 + dribbleSkill * 1.2) *
                     (inFinalThird ? 0.7 : 0.9); // less dribble crammed in box
    choices.push({
      weight: dribbleW,
      make: () => {
        // Move forward 6-14 units, slight side wiggle.
        const dist = 6 + rand() * 10;
        const wiggle = (rand() - 0.5) * 5;
        return dribble(
          ballX, ballY,
          clamp(ballX + wiggle, 8, 92),
          ballY + dir * dist,
          side, carrierIdx, 600 + rand() * 300,
        );
      },
    });
  }

  // ── 4) THROUGH-BALL (vision pass behind defenders) ───────────────
  if (inAttackingHalf) {
    const targetIdx = pickTeammate(carrying, defending, {
      preferPos: ["ST", "CF", "AM", "LW", "RW"],
      preferAreaX: 50,
      preferAreaY: goalY + dir * 18,
      excludeIdx: carrierIdx,
      ballX, ballY,
      forwardOnly: true,
      side,
    });
    if (targetIdx !== null) {
      const target = carrying.placements[targetIdx];
      const passSkill = me.passing / 100;
      const tbW = tp.throughBallBias * passSkill * (adv * 1.2 + 0.2);
      choices.push({
        weight: tbW,
        make: () => throughBall(
          ballX, ballY,
          clamp(target.homeX + (rand() - 0.5) * 4, 8, 92),
          target.homeY + dir * (8 + rand() * 6),
          side, targetIdx, 650,
        ),
      });
    }
  }

  // ── 5) LONG BALL switching play ──────────────────────────────────
  if (!me.isGK || carrying.tactic === "Long Ball" || carrying.tactic === "Direct") {
    const targetIdx = pickTeammate(carrying, defending, {
      preferPos: inOurThird ? ["ST", "CF", "LW", "RW"] : ["LM", "RM", "LW", "RW", "CM"],
      preferAreaX: ballX < 50 ? 80 : 20, // switch flanks
      preferAreaY: goalY + dir * 30,
      excludeIdx: carrierIdx,
      ballX, ballY,
      forwardOnly: true,
      side,
      minDist: 30,
    });
    if (targetIdx !== null) {
      const target = carrying.placements[targetIdx];
      const longW = tp.longBallBias * (0.4 + me.passing / 120);
      choices.push({
        weight: longW,
        make: () => longBall(
          ballX, ballY,
          clamp(target.homeX, 6, 94),
          target.homeY,
          side, targetIdx, 900,
        ),
      });
    }
  }

  // ── 6) SHORT PASS to nearest open teammate ──────────────────────
  {
    const targetIdx = pickTeammate(carrying, defending, {
      preferPos: undefined,
      preferAreaX: ballX,
      preferAreaY: ballY + dir * 8, // slight forward bias
      excludeIdx: carrierIdx,
      ballX, ballY,
      side,
      minDist: 6,
      maxDist: 22,
    });
    if (targetIdx !== null) {
      const target = carrying.placements[targetIdx];
      const passSkill = me.passing / 100;
      const passW = tp.shortPassBias * (0.5 + passSkill);
      choices.push({
        weight: passW,
        make: () => passAction(
          ballX, ballY,
          target.homeX + (rand() - 0.5) * 3,
          target.homeY + (rand() - 0.5) * 3,
          side, targetIdx, 360 + rand() * 200,
        ),
      });
    }
  }

  // ── 7) RECYCLE backward (to a CB or GK) ──────────────────────────
  {
    const targetIdx = pickTeammate(carrying, defending, {
      preferPos: ["CB", "GK", "DM"],
      preferAreaX: 50,
      preferAreaY: ownGoalY(side) + dir * -1 * 30,
      excludeIdx: carrierIdx,
      ballX, ballY,
      side,
      minDist: 8,
    });
    if (targetIdx !== null) {
      const target = carrying.placements[targetIdx];
      // More likely if pressed (defender close).
      const dPress = closestDefenderDist(defending, ballX, ballY);
      const pressBoost = dPress < 8 ? 1.5 : 1.0;
      const recycleW = tp.recycleBias * pressBoost * (inOurThird ? 0.8 : 0.4);
      choices.push({
        weight: recycleW,
        make: () => passAction(
          ballX, ballY,
          target.homeX + (rand() - 0.5) * 2,
          target.homeY + (rand() - 0.5) * 2,
          side, targetIdx, 420 + rand() * 200,
        ),
      });
    }
  }

  // Pick a choice. Fallback: short safe pass to nearest teammate.
  const chosen = pickRandom(choices.map(c => ({ item: c.make, weight: c.weight })), rand);
  if (chosen) return chosen();

  // Fallback — short safe pass to ANY nearest teammate.
  const fallbackIdx = pickTeammate(carrying, defending, {
    preferAreaX: ballX, preferAreaY: ballY,
    excludeIdx: carrierIdx,
    ballX, ballY,
    side,
  });
  if (fallbackIdx !== null) {
    const target = carrying.placements[fallbackIdx];
    return passAction(
      ballX, ballY, target.homeX, target.homeY,
      side, fallbackIdx, 420,
    );
  }
  // No teammates? Just dribble short.
  return dribble(ballX, ballY, ballX, ballY + dir * 5, side, carrierIdx, 500);
}

// ─────────────────────────────────────────────────────────────────────
// Helper — pick a teammate matching certain criteria.
// ─────────────────────────────────────────────────────────────────────
interface TeammatePick {
  preferPos?: ReadonlyArray<string>;
  preferAreaX: number;
  preferAreaY: number;
  excludeIdx: number;
  ballX: number;
  ballY: number;
  side?: Side;
  forwardOnly?: boolean;
  minDist?: number;
  maxDist?: number;
}

function pickTeammate(
  team: TeamSnapshot,
  opp: TeamSnapshot,
  q: TeammatePick,
): number | null {
  const dir = dirToOppGoal(team.side);
  let best = -1;
  let bestScore = -Infinity;
  team.placements.forEach((p, i) => {
    if (i === q.excludeIdx) return;
    if (p.isGK && q.preferPos && !q.preferPos.includes("GK")) return;
    const d = dist(q.ballX, q.ballY, p.homeX, p.homeY);
    if (q.minDist !== undefined && d < q.minDist) return;
    if (q.maxDist !== undefined && d > q.maxDist) return;
    if (q.forwardOnly && q.side) {
      // forwardOnly: target must be ahead of ball (toward opp goal).
      const aheadOk = team.side === "home" ? p.homeY <= q.ballY + 4 : p.homeY >= q.ballY - 4;
      if (!aheadOk) return;
    }
    let score = -dist(q.preferAreaX, q.preferAreaY, p.homeX, p.homeY);
    if (q.preferPos && q.preferPos.includes(p.slotPos)) score += 30;
    // Penalise being heavily marked.
    let nearestOpp = Infinity;
    opp.placements.forEach((o) => {
      if (o.isGK) return;
      const dd = dist(p.homeX, p.homeY, o.homeX, o.homeY);
      if (dd < nearestOpp) nearestOpp = dd;
    });
    score += clamp(nearestOpp - 4, 0, 14) * 1.5;
    // Penalise wrong-side fullbacks running back when in attack.
    void dir;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best >= 0 ? best : null;
}

function closestDefenderDist(opp: TeamSnapshot, x: number, y: number): number {
  let m = Infinity;
  opp.placements.forEach((o) => {
    if (o.isGK) return;
    const d = dist(x, y, o.homeX, o.homeY);
    if (d < m) m = d;
  });
  return m;
}

// ─────────────────────────────────────────────────────────────────────
// Outcomes — when an action ENDS we resolve what really happened
// (pass succeeded? intercepted? shot wide?). Returns the new PlayState.
// ─────────────────────────────────────────────────────────────────────
function resolveAction(
  prev: PlayState,
  home: TeamSnapshot,
  away: TeamSnapshot,
  rand: () => number,
): PlayState {
  const a = prev.action;

  // Shots — ball goes back to defending team's keeper or out for corner.
  if (a.kind === "shot") {
    // Pick defending team (whoever is NOT the side that just shot).
    // Carrier was last set by the prior pass; ball position is now
    // deep in attacking half. Find which goal we're closest to.
    const defendingSide: Side = a.toY < HALFWAY_Y ? "away" : "home";
    const defending = teamOf(defendingSide, home, away);
    const newAction = settleAction(
      defending.placements[defending.gkIdx].homeX,
      defending.placements[defending.gkIdx].homeY,
      defendingSide, defending.gkIdx, 380,
    );
    return {
      ball: { x: defending.placements[defending.gkIdx].homeX, y: defending.placements[defending.gkIdx].homeY, z: 0 },
      carrierSide: defendingSide,
      carrierIdx: defending.gkIdx,
      action: newAction,
      actionElapsedMs: 0,
    };
  }

  // Cross / through-ball / long-ball / pass — small interception chance.
  if (a.kind === "cross" || a.kind === "throughball" || a.kind === "longball" || a.kind === "pass") {
    if (a.endCarrierSide === null || a.endCarrierIdx === null) {
      return prev;
    }
    const intendedSide: Side = a.endCarrierSide;
    const carrying = teamOf(intendedSide, home, away);
    const defendingSide: Side = intendedSide === "home" ? "away" : "home";
    const defending = teamOf(defendingSide, home, away);
    // Interception chance — depends on action distance + defender pace + tackling.
    const distance = dist(a.fromX, a.fromY, a.toX, a.toY);
    const baseRisk = clamp(0.05 + distance / 400, 0.04, 0.30);
    // Reduce if delivering player has high passing.
    // We don't carry passer info into resolve — so use intended target's openness.
    const target = carrying.placements[a.endCarrierIdx];
    const closeOpp = closestDefenderDist(defending, target.homeX, target.homeY);
    const intercept = baseRisk + (closeOpp < 5 ? 0.18 : 0) - (closeOpp > 12 ? 0.07 : 0);
    if (rand() < intercept) {
      // Defender wins it — pick the closest defender to the target.
      let stealerIdx = -1;
      let nearest = Infinity;
      defending.placements.forEach((o, i) => {
        if (o.isGK) return;
        const d = dist(o.homeX, o.homeY, target.homeX, target.homeY);
        if (d < nearest) { nearest = d; stealerIdx = i; }
      });
      if (stealerIdx >= 0) {
        return {
          ball: { x: target.homeX, y: target.homeY, z: 0 },
          carrierSide: defendingSide,
          carrierIdx: stealerIdx,
          action: settleAction(
            defending.placements[stealerIdx].homeX,
            defending.placements[stealerIdx].homeY,
            defendingSide, stealerIdx, 320,
          ),
          actionElapsedMs: 0,
        };
      }
    }
    // Successful — ball settles on intended target.
    return {
      ball: { x: target.homeX, y: target.homeY, z: 0 },
      carrierSide: intendedSide,
      carrierIdx: a.endCarrierIdx,
      action: settleAction(target.homeX, target.homeY, intendedSide, a.endCarrierIdx, 240),
      actionElapsedMs: 0,
    };
  }

  // Dribble — small tackle chance based on closest defender.
  if (a.kind === "dribble") {
    if (a.endCarrierSide === null || a.endCarrierIdx === null) return prev;
    const carryingSide = a.endCarrierSide;
    const carrying = teamOf(carryingSide, home, away);
    const defendingSide: Side = carryingSide === "home" ? "away" : "home";
    const defending = teamOf(defendingSide, home, away);
    const me = carrying.placements[a.endCarrierIdx];
    const closeOpp = closestDefenderDist(defending, a.toX, a.toY);
    const tackleChance = clamp(0.08 + (8 - closeOpp) * 0.04, 0.04, 0.30) -
                         me.technique * 0.0015;
    if (rand() < tackleChance) {
      // Pick closest defender.
      let stealerIdx = -1;
      let nearest = Infinity;
      defending.placements.forEach((o, i) => {
        if (o.isGK) return;
        const d = dist(o.homeX, o.homeY, a.toX, a.toY);
        if (d < nearest) { nearest = d; stealerIdx = i; }
      });
      if (stealerIdx >= 0) {
        return {
          ball: { x: a.toX, y: a.toY, z: 0 },
          carrierSide: defendingSide,
          carrierIdx: stealerIdx,
          action: settleAction(a.toX, a.toY, defendingSide, stealerIdx, 280),
          actionElapsedMs: 0,
        };
      }
    }
    return {
      ball: { x: a.toX, y: a.toY, z: 0 },
      carrierSide: carryingSide,
      carrierIdx: a.endCarrierIdx,
      action: settleAction(a.toX, a.toY, carryingSide, a.endCarrierIdx, 220),
      actionElapsedMs: 0,
    };
  }

  if (a.kind === "settle") {
    // Settle just expired — caller will request a new decision.
    return {
      ball: { x: a.toX, y: a.toY, z: 0 },
      carrierSide: a.endCarrierSide,
      carrierIdx: a.endCarrierIdx,
      action: a, // unchanged; caller decides
      actionElapsedMs: a.durMs,
    };
  }

  // Loose / tackle — caller handles.
  return prev;
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/** Build an "initial" PlayState representing kickoff: ball on the
 *  centre spot, home side carrying. */
export function initialPlayState(home: TeamSnapshot): PlayState {
  // Pick the home side's most central forward as kickoff carrier.
  let idx = -1;
  let best = Infinity;
  home.placements.forEach((p, i) => {
    if (p.isGK) return;
    const d = dist(p.homeX, p.homeY, 50, 70);
    if (d < best) { best = d; idx = i; }
  });
  const carrier = idx >= 0 ? idx : 0;
  return {
    ball: { x: 50, y: HALFWAY_Y, z: 0 },
    carrierSide: "home",
    carrierIdx: carrier,
    action: settleAction(50, HALFWAY_Y, "home", carrier, 600),
    actionElapsedMs: 0,
  };
}

/** Tick the rolling possession. Returns the PlayState for the next
 *  frame. If the current action is ongoing, just advances it; if it
 *  has ended, resolves the outcome and asks the AI for a fresh choice. */
export function tickPossession(
  state: PlayState,
  home: TeamSnapshot,
  away: TeamSnapshot,
  dtMs: number,
  seed: number,
): PlayState {
  const rand = makeRng(seed);
  const next: PlayState = { ...state, actionElapsedMs: state.actionElapsedMs + dtMs };

  // If the action has finished, resolve it and pick the next.
  if (next.actionElapsedMs >= next.action.durMs) {
    const resolved = resolveAction(next, home, away, rand);
    // Ask AI for next move if we have a carrier.
    if (resolved.carrierSide && resolved.carrierIdx !== null) {
      const carrying = teamOf(resolved.carrierSide, home, away);
      const defending = teamOf(resolved.carrierSide === "home" ? "away" : "home", home, away);
      const newAct = decideAction({
        carrying, defending,
        carrierIdx: resolved.carrierIdx,
        ballX: resolved.ball.x,
        ballY: resolved.ball.y,
        rand,
      });
      // Apply tactic tempo to all decisions.
      const tp = tacticProfile(carrying.tactic);
      const scaled: MicroAction = { ...newAct, durMs: newAct.durMs / tp.tempo };
      return { ...resolved, action: scaled, actionElapsedMs: 0 };
    }
    return resolved;
  }

  return next;
}
