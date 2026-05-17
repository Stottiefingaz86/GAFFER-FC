// =====================================================================
// sim/movement.ts — off-ball steering for every player every frame.
//
// Each player has a "home" anchor (formation + tactic + role). The job
// of movement.ts is to nudge that anchor based on:
//   • Who has the ball (own team vs opponent).
//   • Where the ball is on the pitch.
//   • The player's detailed position (CB, LB, ST, ...).
//   • The player's tactical role (Overlap, Cut Inside, Run Forward, ...).
//   • Team tactic (Possession crunches the team narrow, Direct stretches
//     vertically, High Press squeezes everyone forward, ...).
//
// The OUTPUT is a target (x, y) for that player THIS frame. The main
// loop lerps players from curX/Y toward this target each tick. Net
// effect on screen: full-backs visibly overlap when their team is in
// possession high up the pitch, strikers make near/far-post runs,
// CDMs shuttle horizontally with the ball, defending team contracts
// around the ball-carrier, etc.
// =====================================================================

import type { Tactic } from "@/types/game";
import {
  BOT_GOAL_LINE_Y,
  GOAL_LEFT,
  GOAL_RIGHT,
  HALFWAY_Y,
  PEN_BOX_LEFT,
  PEN_BOX_RIGHT,
  TOP_GOAL_LINE_Y,
  type PlayerPlacement,
  type Side,
  type TeamSnapshot,
  clamp,
} from "./types";

interface BallCtx {
  x: number;
  y: number;
  carrierSide: Side | null;
  carrierIdx: number | null;
}

/** How far up the pitch own team has pushed in attacking play, 0..1 (0
 *  = own half, 1 = opp byline). Used to scale fullback overlap, etc. */
function attackAdvance(side: Side, ballY: number): number {
  if (side === "home") {
    // home attacks toward y=6, defends y=144. As ballY decreases, advance grows.
    return clamp((HALFWAY_Y - ballY) / (HALFWAY_Y - TOP_GOAL_LINE_Y), 0, 1);
  } else {
    return clamp((ballY - HALFWAY_Y) / (BOT_GOAL_LINE_Y - HALFWAY_Y), 0, 1);
  }
}

/** Tactic-specific multipliers controlling how aggressively players
 *  push beyond their anchor when in possession. */
function tacticPushFactors(tactic: Tactic): {
  attackPush: number; // amount strikers/wingers push toward goal
  fbOverlap: number;  // FB overlap aggression
  midJoin: number;    // midfield late runs into the box
  defLine: number;    // how high the defensive line plays
  pressUrgency: number; // off-ball pressing intensity (out of possession)
} {
  switch (tactic) {
    case "Attacking":   return { attackPush: 1.0,  fbOverlap: 0.8, midJoin: 0.7, defLine: 0.4, pressUrgency: 0.6 };
    case "Defensive":   return { attackPush: 0.4,  fbOverlap: 0.1, midJoin: 0.2, defLine: -0.4, pressUrgency: 0.4 };
    case "Counter":     return { attackPush: 0.9,  fbOverlap: 0.3, midJoin: 0.5, defLine: -0.2, pressUrgency: 0.4 };
    case "High Press":  return { attackPush: 0.8,  fbOverlap: 0.4, midJoin: 0.4, defLine: 0.7, pressUrgency: 1.0 };
    case "Possession":  return { attackPush: 0.6,  fbOverlap: 0.6, midJoin: 0.5, defLine: 0.3, pressUrgency: 0.6 };
    case "Direct":      return { attackPush: 1.0,  fbOverlap: 0.5, midJoin: 0.4, defLine: 0.1, pressUrgency: 0.5 };
    case "Long Ball":   return { attackPush: 1.0,  fbOverlap: 0.4, midJoin: 0.3, defLine: 0.0, pressUrgency: 0.4 };
    case "Tiki-Taka":   return { attackPush: 0.5,  fbOverlap: 0.7, midJoin: 0.7, defLine: 0.5, pressUrgency: 0.7 };
    case "Gegenpress":  return { attackPush: 0.9,  fbOverlap: 0.7, midJoin: 0.6, defLine: 0.6, pressUrgency: 1.1 };
    case "Wing Play":   return { attackPush: 0.8,  fbOverlap: 1.0, midJoin: 0.5, defLine: 0.2, pressUrgency: 0.5 };
    case "Park the Bus":return { attackPush: 0.2,  fbOverlap: 0.0, midJoin: 0.0, defLine: -0.6, pressUrgency: 0.3 };
    case "Balanced":
    default:            return { attackPush: 0.7,  fbOverlap: 0.5, midJoin: 0.4, defLine: 0.1, pressUrgency: 0.6 };
  }
}

/** Compute the desired x/y for a single player THIS frame. */
export function targetForPlayer(
  player: PlayerPlacement,
  team: TeamSnapshot,
  oppGkY: number,
  ball: BallCtx,
  /** Index of THIS player inside team.placements (so we can detect
   *  "I'm the carrier" and freeze us at ball position). */
  myIdx: number,
): { tx: number; ty: number } {
  const isHome = team.side === "home";
  const dirToOppGoal: -1 | 1 = isHome ? -1 : 1; // y direction from defensive to attacking end
  const oppGoalY = isHome ? TOP_GOAL_LINE_Y : BOT_GOAL_LINE_Y;
  const ourGoalY = isHome ? BOT_GOAL_LINE_Y : TOP_GOAL_LINE_Y;
  const factors = tacticPushFactors(team.tactic);

  // ── If I'm the carrier: I sit on the ball (the AI moves the ball
  //    explicitly, and the carrier's curX/Y will track it). Returning
  //    home would just yank us off-ball. ─────────────────────────────
  if (ball.carrierSide === team.side && ball.carrierIdx === myIdx) {
    return { tx: ball.x, ty: ball.y };
  }

  // ── GK: tracks ball x with a small bias, stays on his line. ──────
  if (player.isGK) {
    const tx = clamp(50 + (ball.x - 50) * 0.30, GOAL_LEFT + 1, GOAL_RIGHT - 1);
    return { tx, ty: ourGoalY + dirToOppGoal * 4 };
  }

  const inPossession = ball.carrierSide === team.side;
  const advance = attackAdvance(team.side, ball.y); // 0..1 forward push of OUR attack

  // Base target = home anchor with a small ball-tracking shift so the
  // team shape slides with play even when nothing else applies.
  let tx = player.homeX + (ball.x - 50) * 0.10;
  let ty = player.homeY;

  // ── DEFENDERS / GK area ───────────────────────────────────────────
  if (player.slotPos === "CB") {
    // CBs hold the line — ty shifts toward halfway based on how high
    // we play (defLine), but never crosses halfway when defending.
    const baseLine = isHome
      ? BOT_GOAL_LINE_Y - 28
      : TOP_GOAL_LINE_Y + 28;
    const lineShift = inPossession ? 18 + factors.defLine * 14 : 6 + factors.defLine * 8;
    ty = baseLine - dirToOppGoal * lineShift; // dirToOppGoal: -1 (home), +1 (away)
    // Out of possession + ball deep in our half: drop deeper.
    if (!inPossession && (isHome ? ball.y > 110 : ball.y < 40)) {
      ty = isHome ? BOT_GOAL_LINE_Y - 16 : TOP_GOAL_LINE_Y + 16;
    }
    // Track ball x slightly.
    tx = player.homeX + (ball.x - 50) * 0.18;
  } else if (player.slotPos === "LB" || player.slotPos === "RB") {
    // Fullbacks: aggression depends on role + tactic + advance.
    const roleAttack =
      player.role === "Overlap" ? 1.0 :
      player.role === "Get Forward" ? 0.9 :
      player.role === "Underlap" ? 0.8 :
      player.role === "Defensive WB" ? 0.3 :
      0.6;
    if (inPossession && advance > 0.2) {
      // Bomb forward toward attacking third along their flank.
      const flankX = player.slotPos === "LB" ? 8 : 92;
      const bombFraction = roleAttack * factors.fbOverlap * advance;
      tx = player.homeX + (flankX - player.homeX) * bombFraction;
      ty = player.homeY + (oppGoalY - player.homeY) * bombFraction * 0.85;
    } else if (inPossession) {
      // Light push forward when own team starts an attack.
      ty = player.homeY + dirToOppGoal * 8 * factors.fbOverlap;
    } else {
      // Defending — drop back, shade toward ball.
      tx = player.homeX + (ball.x - player.homeX) * 0.30;
      ty = player.homeY - dirToOppGoal * 6;
    }
  }

  // ── MIDFIELDERS ───────────────────────────────────────────────────
  else if (player.slotPos === "DM" || player.role === "Stay Back") {
    // Sit just in front of the back line, swings horizontally with ball.
    tx = player.homeX + (ball.x - 50) * 0.32;
    ty = player.homeY - dirToOppGoal * 2;
  } else if (player.slotPos === "CM" || player.slotPos === "AM") {
    if (inPossession) {
      // Mid push forward — late runs if Get Forward, otherwise modest.
      const lateRun = player.role === "Get Forward" ? 1.0 :
                      player.role === "Press High" ? 0.6 :
                      player.role === "Playmaker" ? 0.2 :
                      0.5;
      ty = player.homeY + dirToOppGoal * (8 + 16 * advance * lateRun) * factors.midJoin;
      tx = player.homeX + (ball.x - 50) * 0.20;
    } else {
      // Pressing: close ball when in attacking half; otherwise track.
      const pressNow = factors.pressUrgency > 0.7 || (isHome ? ball.y < 90 : ball.y > 60);
      if (pressNow) {
        tx = player.homeX + (ball.x - player.homeX) * 0.35;
        ty = player.homeY + (ball.y - player.homeY) * 0.18;
      } else {
        tx = player.homeX + (ball.x - 50) * 0.22;
        ty = player.homeY - dirToOppGoal * 3;
      }
    }
  } else if (player.slotPos === "LM" || player.slotPos === "RM") {
    // Wide mids: hug the touchline; cut inside if role is Cut Inside.
    const flankX = player.slotPos === "LM" ? 12 : 88;
    if (inPossession) {
      if (player.role === "Cut Inside") {
        tx = player.homeX + (50 - player.homeX) * 0.55 * advance;
        ty = player.homeY + dirToOppGoal * 10 * advance * factors.attackPush;
      } else {
        tx = player.homeX + (flankX - player.homeX) * 0.5;
        ty = player.homeY + dirToOppGoal * 12 * advance * factors.attackPush;
      }
    } else {
      // Track back when defending.
      tx = player.homeX + (ball.x - player.homeX) * 0.20;
      ty = player.homeY - dirToOppGoal * 4;
    }
  }

  // ── FORWARDS / WINGERS ────────────────────────────────────────────
  else if (player.slotPos === "LW" || player.slotPos === "RW") {
    const flankX = player.slotPos === "LW" ? 10 : 90;
    if (inPossession) {
      if (player.role === "Cut Inside") {
        // Drift toward half-space + make late diagonal run if ball is wide.
        const halfSpaceX = player.slotPos === "LW" ? 32 : 68;
        tx = player.homeX + (halfSpaceX - player.homeX) * 0.7 * (0.4 + advance);
        // If team has reached attacking third, run toward goal.
        if (advance > 0.45) {
          ty = oppGoalY + dirToOppGoal * 18;
        } else {
          ty = player.homeY + dirToOppGoal * 8;
        }
      } else {
        // Stay wide, threaten the byline when team is high.
        tx = player.homeX + (flankX - player.homeX) * 0.6;
        if (advance > 0.4) {
          ty = oppGoalY + dirToOppGoal * (16 - 6 * advance);
        } else {
          ty = player.homeY + dirToOppGoal * 8 * advance;
        }
      }
    } else {
      // Track back loosely.
      tx = player.homeX + (flankX - player.homeX) * 0.3;
      ty = player.homeY - dirToOppGoal * 4;
    }
  } else if (player.slotPos === "ST" || player.slotPos === "CF") {
    if (inPossession) {
      // Make runs toward goal — split between near post / far post / through
      // based on player.phase so two strikers don't stack on top of each other.
      const splitX = (player.phase % 2 < 1) ? -10 : 10; // near vs far post
      const targetX = player.homeX < 50 ? clamp(50 - splitX * 0.7, PEN_BOX_LEFT + 4, 50) :
                                          clamp(50 + splitX * 0.7, 50, PEN_BOX_RIGHT - 4);
      tx = player.homeX + (targetX - player.homeX) * 0.5 * (0.4 + advance);
      // Run depth scales with advance and "Run Forward" role.
      const runMul = player.role === "Run Forward" ? 1.0 :
                     player.role === "Hold Up" ? 0.4 :
                     0.7;
      ty = player.homeY + dirToOppGoal * (10 + 22 * advance) * runMul * factors.attackPush;
      // Don't run offside — clamp 6yds short of opp keeper.
      const offsideY = oppGkY + dirToOppGoal * 6;
      ty = isHome ? Math.max(ty, offsideY) : Math.min(ty, offsideY);
    } else {
      // Drop slightly to receive on transitions.
      ty = player.homeY - dirToOppGoal * 2;
      tx = player.homeX + (ball.x - 50) * 0.18;
    }
  }

  // ── ATTACKERS PRESSING when out of possession in opp half ────────
  if (!inPossession && factors.pressUrgency > 0.85) {
    // High press: front line lunges at ball-carrier, midfielders close lanes.
    if (player.slotPos === "ST" || player.slotPos === "CF" ||
        player.slotPos === "AM" || player.slotPos === "LW" ||
        player.slotPos === "RW") {
      const ballSide: Side = ball.carrierSide ?? team.side;
      if (ballSide !== team.side) {
        tx = player.homeX + (ball.x - player.homeX) * 0.45;
        ty = player.homeY + (ball.y - player.homeY) * 0.30;
      }
    }
  }

  // ── Final clamp inside the play area ─────────────────────────────
  tx = clamp(tx, 5, 95);
  ty = clamp(ty, 10, 140);

  return { tx, ty };
}

/** ONE defender close to the ball-carrier should "press" — close the
 *  carrier down inside ~5 units. Used by the possession AI to make
 *  defending visible (rather than just everyone tracking generally).
 *  Returns the placement-index of the chosen presser, or null. */
export function pickPresser(
  defending: TeamSnapshot,
  ballX: number,
  ballY: number,
): number | null {
  let best = -1;
  let bestScore = -Infinity;
  defending.placements.forEach((p, i) => {
    if (p.isGK) return;
    const d = Math.hypot(p.homeX - ballX, p.homeY - ballY);
    // Closer = higher; tackling helps tiebreak.
    const score = -d + p.tackling * 0.06 + p.pace * 0.02;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best >= 0 ? best : null;
}
