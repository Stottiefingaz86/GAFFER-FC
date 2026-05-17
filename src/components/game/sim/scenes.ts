// =====================================================================
// sim/scenes.ts — event-driven scene plans for the pitch simulator.
//
// Every match-engine event with a named player is rendered as a scripted
// "cinematic" mini-sequence that uses the ACTUAL player on the pitch:
//   • Goal:           build-up pass → carrier dribbles → shooter (the
//                     event's named scorer) strikes → ball arcs into
//                     net → scorer wheels away to celebrate.
//   • Wonder goal:    long-range curler from the named scorer.
//   • Penalty:        spot kick run-up by the engine's penalty taker
//                     (or the named taker on the event).
//   • Cross + header: if the scorer is a Target Man / tall / striker
//                     and the team plays Wing Play, a fullback or
//                     winger crosses and the striker heads it home.
//   • Through-ball:   if the scorer is a Speedster, the assister
//                     threads it behind, scorer sprints onto it.
//   • Save:           shooter (named) strikes from edge of box, keeper
//                     (the actual defending GK) dives to catch.
//   • Card:           offender (named) gets the card raised over their
//                     head; ball spots at foul position.
//   • Shot wide:      named shooter pulls the trigger but pulls it wide
//                     of the post.
//
// Crucially every scene resolves to a FINAL ball position + carrier so
// the rolling possession AI can pick up from there with a sensible
// state (e.g. keeper has the ball after a save).
// =====================================================================

import type { MatchEvent } from "@/types/game";
import {
  BOT_GOAL_LINE_Y,
  BOT_GOAL_BACK_Y,
  BOT_PEN_SPOT_Y,
  GOAL_LEFT,
  GOAL_RIGHT,
  HALFWAY_Y,
  PEN_BOX_LEFT,
  PEN_BOX_RIGHT,
  TOP_GOAL_LINE_Y,
  TOP_GOAL_BACK_Y,
  TOP_PEN_SPOT_Y,
  type MicroAction,
  type Pt,
  type ScenePlan,
  type SceneBeat,
  type Side,
  type TeamSnapshot,
  ATTACKING_POSITIONS,
  WIDE_POSITIONS,
  FULLBACK_POSITIONS,
  MIDFIELDER_POSITIONS,
  clamp,
  hashStr,
  lerp,
  makeRng,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// Helpers — find players in a snapshot by id / role / proximity.
// ─────────────────────────────────────────────────────────────────────
function teamOf(side: Side, home: TeamSnapshot, away: TeamSnapshot): TeamSnapshot {
  return side === "home" ? home : away;
}

function findIdxByPlayerId(team: TeamSnapshot, playerId: string | undefined): number {
  if (!playerId) return -1;
  return team.placements.findIndex((p) => p.playerId === playerId);
}

function dirToOppGoal(side: Side): -1 | 1 {
  return side === "home" ? -1 : 1;
}

function oppGoalY(side: Side): number {
  return side === "home" ? TOP_GOAL_LINE_Y : BOT_GOAL_LINE_Y;
}

function oppGoalBackY(side: Side): number {
  return side === "home" ? TOP_GOAL_BACK_Y + 1.5 : BOT_GOAL_BACK_Y - 1.5;
}

function oppPenSpotY(side: Side): number {
  return side === "home" ? TOP_PEN_SPOT_Y : BOT_PEN_SPOT_Y;
}

/** Best teammate matching a predicate, ranked by closeness to a target
 *  point. Ties: higher overall. */
function pickClosest(
  team: TeamSnapshot,
  toX: number,
  toY: number,
  predicate?: (p: TeamSnapshot["placements"][number], idx: number) => boolean,
  excludeIdx?: number,
): number {
  let best = -1;
  let bestScore = Infinity;
  team.placements.forEach((p, i) => {
    if (excludeIdx !== undefined && i === excludeIdx) return;
    if (predicate && !predicate(p, i)) return;
    const d = Math.hypot(p.homeX - toX, p.homeY - toY);
    const score = d - p.overall * 0.05;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best >= 0 ? best : 0;
}

// ─────────────────────────────────────────────────────────────────────
// Action factory helpers (a small subset of possession.ts's factories
// is needed here — kept self-contained so scenes can describe moves
// without depending on the AI module).
// ─────────────────────────────────────────────────────────────────────
function mPass(fromX: number, fromY: number, toX: number, toY: number,
               side: Side, idx: number, durMs: number, arc = 0.06): MicroAction {
  return { kind: "pass", fromX, fromY, toX, toY, arc, durMs,
           endCarrierSide: side, endCarrierIdx: idx };
}
function mDribble(fromX: number, fromY: number, toX: number, toY: number,
                  side: Side, idx: number, durMs: number): MicroAction {
  return { kind: "dribble", fromX, fromY, toX, toY, arc: 0, durMs,
           endCarrierSide: side, endCarrierIdx: idx };
}
function mShot(fromX: number, fromY: number, toX: number, toY: number,
               durMs: number, arc = 0.55): MicroAction {
  return { kind: "shot", fromX, fromY, toX, toY, arc, durMs,
           endCarrierSide: null, endCarrierIdx: null };
}
function mCross(fromX: number, fromY: number, toX: number, toY: number,
                side: Side, idx: number, durMs: number): MicroAction {
  return { kind: "cross", fromX, fromY, toX, toY, arc: 0.6, durMs,
           endCarrierSide: side, endCarrierIdx: idx };
}
function mThroughBall(fromX: number, fromY: number, toX: number, toY: number,
                      side: Side, idx: number, durMs: number): MicroAction {
  return { kind: "throughball", fromX, fromY, toX, toY, arc: 0.10, durMs,
           endCarrierSide: side, endCarrierIdx: idx };
}
function mHeader(fromX: number, fromY: number, toX: number, toY: number,
                 durMs: number): MicroAction {
  return { kind: "header", fromX, fromY, toX, toY, arc: 0.35, durMs,
           endCarrierSide: null, endCarrierIdx: null };
}
function mSettle(x: number, y: number, side: Side | null, idx: number | null,
                 durMs: number): MicroAction {
  return { kind: "settle", fromX: x, fromY: y, toX: x, toY: y, arc: 0, durMs,
           endCarrierSide: side, endCarrierIdx: idx };
}

// ─────────────────────────────────────────────────────────────────────
// Scene plan builders — one per event family.
//
// Each builder is given:
//   • The MatchEvent (which knows the named player if applicable).
//   • Both team snapshots (placements, attributes, colours, gkIdx).
//   • Where the ball currently sits — so the new scene begins from
//     there rather than teleporting.
//   • A seeded RNG so the SAME event always plays out the same way
//     (good for replays / determinism while still feeling varied
//     across different events).
// ─────────────────────────────────────────────────────────────────────

// ── 1. GOAL FAMILY ────────────────────────────────────────────────────
/** Build-up → strike → celebration. Variant depends on scorer's
 *  attributes + position + team tactic. */
function buildGoalScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
  rand: () => number,
): ScenePlan {
  const isOG = ev.type === "OwnGoal";
  const scoringSide: Side = isOG
    ? (ev.team === "home" ? "away" : "home")
    : ev.team;
  const scoring = teamOf(scoringSide, home, away);
  const defending = teamOf(scoringSide === "home" ? "away" : "home", home, away);
  const dir = dirToOppGoal(scoringSide);
  const goalY = oppGoalY(scoringSide);
  const netY = oppGoalBackY(scoringSide);

  // Find the actual scorer named in the event. If we can't find them
  // (e.g. event playerId doesn't match any placement), fall back to the
  // best attacker available.
  let scorerIdx = isOG
    ? findIdxByPlayerId(defending, ev.playerId) // OG: defender named
    : findIdxByPlayerId(scoring, ev.playerId);
  if (scorerIdx < 0) {
    scorerIdx = isOG
      ? pickClosest(defending, 50, goalY - dir * 8, (p) => !p.isGK)
      : pickClosest(scoring, 50, goalY + dir * 14,
          (p) => !p.isGK && ATTACKING_POSITIONS.includes(p.slotPos));
  }

  const scorer = isOG
    ? defending.placements[scorerIdx]
    : scoring.placements[scorerIdx];

  // Decide goal flavour based on scorer + tactic + trait + RNG.
  // Variants:
  //   "wonder"      — long-range curler from outside the box.
  //   "header"      — striker heads in a cross from a wide player.
  //   "throughball" — assister threads it behind defenders; scorer runs onto it.
  //   "tap-in"      — close-range finish from a cut-back.
  //   "buildup"     — multi-pass build-up culminating in a side-footed finish.
  // Wonder goal events from the engine always pick "wonder".
  type Variant = "wonder" | "header" | "throughball" | "tap-in" | "buildup";
  let variant: Variant;
  if (isOG) {
    variant = "buildup";
  } else if (ev.type === "WonderGoal") {
    variant = "wonder";
  } else {
    const w: Array<[Variant, number]> = [];
    // Header: tall target man scorer + wide team or cross-friendly tactic
    if ((scorer.slotPos === "ST" || scorer.slotPos === "CF") &&
        (scorer.trait === "Target Man" || scorer.strength >= 75 ||
         scoring.tactic === "Wing Play" || scoring.tactic === "Long Ball" ||
         scoring.tactic === "Direct")) {
      w.push(["header", 2.5]);
    }
    // Through-ball: speedster forward
    if (ATTACKING_POSITIONS.includes(scorer.slotPos) &&
        (scorer.trait === "Speedster" || scorer.pace >= 80)) {
      w.push(["throughball", 2.5]);
    }
    // Tap-in: any forward, more likely with possession-based tactics
    w.push(["tap-in",
      scoring.tactic === "Tiki-Taka" || scoring.tactic === "Possession" ? 2.5 : 1.0]);
    // Buildup is the default — always available
    w.push(["buildup", 2.0]);
    // Wonderkid / composed finisher / high shooting → small wonder goal chance
    if (scorer.trait === "Wonderkid" || scorer.trait === "Composed Finisher" ||
        scorer.shooting >= 85) {
      w.push(["wonder", 1.0]);
    }
    const total = w.reduce((a, [, x]) => a + x, 0);
    let r = rand() * total;
    variant = "buildup";
    for (const [k, x] of w) { r -= x; if (r <= 0) { variant = k; break; } }
  }

  // Where the ball goes inside the goal — left, centre or right corner.
  // Bias by scorer's preferred side (random per scorer).
  const goalShotX = lerp(GOAL_LEFT + 2, GOAL_RIGHT - 2, rand());

  // Defending GK reacts (and is beaten — usually wrong way).
  const gkIdx = defending.gkIdx;
  const gkWrongWay = goalShotX < 50 ? 55 : 45;
  const gkY = goalY + dir * 1.5;

  // The scene plays out as a sequence of beats. Each scene type below
  // composes its own beat list.
  const beats: SceneBeat[] = [];

  if (variant === "wonder") {
    // Wonder goal: scorer takes a touch outside the box, unleashes a
    // dipping curler into the top corner.
    const winderAt: Pt = {
      x: scorer.homeX + (rand() - 0.5) * 8,
      y: goalY + dir * (32 + rand() * 8), // 32-40 units from goal
    };
    // BEAT 1 — quick pass / pick-up to the scorer outside the box.
    beats.push({
      durationMs: 600,
      ball: mPass(ballAt.x, ballAt.y, winderAt.x, winderAt.y, scoringSide, scorerIdx, 600),
      hints: [{ side: scoringSide, idx: scorerIdx, toX: winderAt.x, toY: winderAt.y }],
    });
    // BEAT 2 — scorer takes a touch (settle).
    beats.push({
      durationMs: 350,
      ball: mSettle(winderAt.x, winderAt.y, scoringSide, scorerIdx, 350),
    });
    // BEAT 3 — strike! Long arcing shot to top corner.
    beats.push({
      durationMs: 750,
      ball: mShot(winderAt.x, winderAt.y, goalShotX, netY, 750, 0.85),
      hints: [
        { side: defending.side, idx: gkIdx, toX: gkWrongWay, toY: gkY },
      ],
    });
  } else if (variant === "header") {
    // Header goal: fullback / winger crosses; striker heads it in.
    const crosserIdx = pickClosest(
      scoring, scoringSide === "home" ? 10 : 90, goalY + dir * 12,
      (p, i) => i !== scorerIdx && !p.isGK &&
        (WIDE_POSITIONS.includes(p.slotPos) || FULLBACK_POSITIONS.includes(p.slotPos)),
    );
    const crossSide = scoring.placements[crosserIdx].homeX < 50 ? "left" : "right";
    const crosserPickup: Pt = {
      x: crossSide === "left" ? 12 : 88,
      y: goalY + dir * 14,
    };
    const headerSpot: Pt = {
      x: lerp(43, 57, rand()),
      y: goalY + dir * 6,
    };
    // BEAT 1 — quick switch to the crosser high & wide.
    beats.push({
      durationMs: 500,
      ball: mPass(ballAt.x, ballAt.y, crosserPickup.x, crosserPickup.y,
                  scoringSide, crosserIdx, 500, 0.20),
      hints: [
        { side: scoringSide, idx: crosserIdx, toX: crosserPickup.x, toY: crosserPickup.y },
        // Scorer makes a near-post run.
        { side: scoringSide, idx: scorerIdx, toX: headerSpot.x, toY: goalY + dir * 12 },
      ],
    });
    // BEAT 2 — crosser settles, scorer arrives at near post.
    beats.push({
      durationMs: 250,
      ball: mSettle(crosserPickup.x, crosserPickup.y, scoringSide, crosserIdx, 250),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: headerSpot.x, toY: headerSpot.y },
      ],
    });
    // BEAT 3 — CROSS into the box.
    beats.push({
      durationMs: 600,
      ball: mCross(crosserPickup.x, crosserPickup.y, headerSpot.x, headerSpot.y,
                   scoringSide, scorerIdx, 600),
    });
    // BEAT 4 — HEADER — ball pops into net.
    beats.push({
      durationMs: 500,
      ball: mHeader(headerSpot.x, headerSpot.y, goalShotX, netY, 500),
      hints: [
        { side: defending.side, idx: gkIdx, toX: gkWrongWay, toY: gkY },
      ],
    });
  } else if (variant === "throughball") {
    // Through-ball: a creative MID/AM threads it behind the defence,
    // the speedster scorer sprints onto it and slots home.
    const assisterIdx = pickClosest(
      scoring, 50, goalY + dir * 28,
      (p, i) => i !== scorerIdx && !p.isGK &&
        (MIDFIELDER_POSITIONS.includes(p.slotPos) || ATTACKING_POSITIONS.includes(p.slotPos)),
    );
    const assister = scoring.placements[assisterIdx];
    // Threaded ball lands behind the defence.
    const onsidePickup: Pt = {
      x: scorer.homeX + (rand() - 0.5) * 6,
      y: goalY + dir * 12,
    };
    const shotSpot: Pt = {
      x: lerp(GOAL_LEFT + 4, GOAL_RIGHT - 4, rand()),
      y: goalY + dir * 6,
    };
    // BEAT 1 — feed the assister in the half-space.
    beats.push({
      durationMs: 450,
      ball: mPass(ballAt.x, ballAt.y, assister.homeX, assister.homeY,
                  scoringSide, assisterIdx, 450),
    });
    // BEAT 2 — assister takes a touch and threads it.
    beats.push({
      durationMs: 300,
      ball: mSettle(assister.homeX, assister.homeY, scoringSide, assisterIdx, 300),
      hints: [
        // Scorer breaks the line, makes a run between the centre-backs.
        { side: scoringSide, idx: scorerIdx, toX: onsidePickup.x, toY: onsidePickup.y },
      ],
    });
    // BEAT 3 — through-ball arrives in front of scorer.
    beats.push({
      durationMs: 550,
      ball: mThroughBall(assister.homeX, assister.homeY, onsidePickup.x, onsidePickup.y,
                         scoringSide, scorerIdx, 550),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: onsidePickup.x, toY: onsidePickup.y },
      ],
    });
    // BEAT 4 — scorer takes one touch.
    beats.push({
      durationMs: 220,
      ball: mDribble(onsidePickup.x, onsidePickup.y, shotSpot.x, shotSpot.y,
                     scoringSide, scorerIdx, 220),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: shotSpot.x, toY: shotSpot.y },
      ],
    });
    // BEAT 5 — strike low past the keeper.
    beats.push({
      durationMs: 400,
      ball: mShot(shotSpot.x, shotSpot.y, goalShotX, netY, 400, 0.30),
      hints: [
        { side: defending.side, idx: gkIdx, toX: gkWrongWay, toY: gkY },
      ],
    });
  } else if (variant === "tap-in") {
    // Tap-in: someone crosses low / cuts back from the byline, scorer
    // arrives at far post and side-foots it.
    const cutterIdx = pickClosest(
      scoring, scorer.homeX < 50 ? 90 : 10, goalY + dir * 8,
      (p, i) => i !== scorerIdx && !p.isGK &&
        (WIDE_POSITIONS.includes(p.slotPos) || FULLBACK_POSITIONS.includes(p.slotPos) ||
         ATTACKING_POSITIONS.includes(p.slotPos)),
    );
    const bylinePoint: Pt = {
      x: scoring.placements[cutterIdx].homeX < 50 ? 14 : 86,
      y: goalY + dir * 6,
    };
    const tapSpot: Pt = {
      x: lerp(GOAL_LEFT + 3, GOAL_RIGHT - 3, rand()),
      y: goalY + dir * 4,
    };
    // BEAT 1 — into the cutter near the byline.
    beats.push({
      durationMs: 500,
      ball: mPass(ballAt.x, ballAt.y, bylinePoint.x, bylinePoint.y,
                  scoringSide, cutterIdx, 500, 0.15),
      hints: [
        { side: scoringSide, idx: cutterIdx, toX: bylinePoint.x, toY: bylinePoint.y },
        // Scorer drives toward the back post.
        { side: scoringSide, idx: scorerIdx, toX: tapSpot.x, toY: goalY + dir * 8 },
      ],
    });
    // BEAT 2 — cutback low across the six-yard box.
    beats.push({
      durationMs: 450,
      ball: mPass(bylinePoint.x, bylinePoint.y, tapSpot.x, tapSpot.y,
                  scoringSide, scorerIdx, 450, 0.05),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: tapSpot.x, toY: tapSpot.y },
      ],
    });
    // BEAT 3 — tap into the empty net.
    beats.push({
      durationMs: 350,
      ball: mShot(tapSpot.x, tapSpot.y, goalShotX, netY, 350, 0.10),
      hints: [
        { side: defending.side, idx: gkIdx, toX: gkWrongWay, toY: gkY },
      ],
    });
  } else {
    // BUILDUP — classic 2-pass build-up culminating in a one-two and
    // a confident side-footed finish.
    const midIdx = pickClosest(
      scoring, 50, goalY + dir * 38,
      (p, i) => i !== scorerIdx && !p.isGK && MIDFIELDER_POSITIONS.includes(p.slotPos),
    );
    const supportIdx = pickClosest(
      scoring, scorer.homeX, goalY + dir * 18,
      (p, i) => i !== scorerIdx && i !== midIdx && !p.isGK &&
        (ATTACKING_POSITIONS.includes(p.slotPos) || p.slotPos === "AM"),
    );
    const mid = scoring.placements[midIdx];
    const support = scoring.placements[supportIdx];
    const layoff: Pt = { x: scorer.homeX + (rand() - 0.5) * 6, y: goalY + dir * 24 };
    const shotSpot: Pt = {
      x: lerp(GOAL_LEFT + 4, GOAL_RIGHT - 4, rand()),
      y: goalY + dir * 9,
    };
    // BEAT 1 — into mid.
    beats.push({
      durationMs: 450,
      ball: mPass(ballAt.x, ballAt.y, mid.homeX, mid.homeY, scoringSide, midIdx, 450),
    });
    // BEAT 2 — mid into support / number 10.
    beats.push({
      durationMs: 450,
      ball: mPass(mid.homeX, mid.homeY, support.homeX, support.homeY,
                  scoringSide, supportIdx, 450),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: layoff.x, toY: layoff.y },
      ],
    });
    // BEAT 3 — layoff to the scorer making the run.
    beats.push({
      durationMs: 400,
      ball: mPass(support.homeX, support.homeY, layoff.x, layoff.y,
                  scoringSide, scorerIdx, 400, 0.10),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: layoff.x, toY: layoff.y },
      ],
    });
    // BEAT 4 — scorer drives into the box.
    beats.push({
      durationMs: 300,
      ball: mDribble(layoff.x, layoff.y, shotSpot.x, shotSpot.y,
                     scoringSide, scorerIdx, 300),
      hints: [
        { side: scoringSide, idx: scorerIdx, toX: shotSpot.x, toY: shotSpot.y },
      ],
    });
    // BEAT 5 — strike, beats the keeper.
    beats.push({
      durationMs: 450,
      ball: mShot(shotSpot.x, shotSpot.y, goalShotX, netY, 450, 0.45),
      hints: [
        { side: defending.side, idx: gkIdx, toX: gkWrongWay, toY: gkY },
      ],
    });
  }

  // ── BEAT — ball settles in the net + scorer celebrates ──────────────
  // Celebration runs toward the corner flag nearest the goal scored at.
  const celebrateX = goalShotX < 50 ? 12 : 88;
  const celebrateY = scoringSide === "home" ? 18 : 132;
  beats.push({
    durationMs: 300,
    flag: {
      ballInNet: true,
      netRipple: true,
      goalFlash: { side: scoringSide },
      celebrate: isOG ? null : { side: scoringSide, idx: scorerIdx },
    },
  });
  // The celebration jog itself.
  beats.push({
    durationMs: 1700,
    flag: {
      ballInNet: true,
      celebrate: isOG ? null : { side: scoringSide, idx: scorerIdx },
    },
    hints: isOG ? [] : [
      { side: scoringSide, idx: scorerIdx, toX: celebrateX, toY: celebrateY },
    ],
  });

  return {
    beats,
    endBall: { x: goalShotX, y: netY },
    endFlag: {
      ballInNet: true,
      celebrate: isOG ? null : { side: scoringSide, idx: scorerIdx },
    },
    // After kickoff the AI will take over with the conceding team —
    // we set the post-goal carrier to the defending side's most central
    // mid so the rolling AI smoothly restarts from the centre circle.
    endCarrierSide: defending.side,
    endCarrierIdx: pickClosest(defending, 50, HALFWAY_Y, (p) => !p.isGK),
    totalMs: beats.reduce((a, b) => a + b.durationMs, 0),
  };
}

// ── 2. PENALTY KICK ───────────────────────────────────────────────────
function buildPenaltyScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  rand: () => number,
): ScenePlan {
  const scored = ev.type === "PenaltyScored";
  const takerSide: Side = ev.team;
  const taking = teamOf(takerSide, home, away);
  const defending = teamOf(takerSide === "home" ? "away" : "home", home, away);
  const spotY = oppPenSpotY(takerSide);
  const dir = dirToOppGoal(takerSide);
  const goalY = oppGoalY(takerSide);
  const netY = oppGoalBackY(takerSide);
  const gkIdx = defending.gkIdx;

  // The named player on the engine event is the taker (or fallback).
  let takerIdx = findIdxByPlayerId(taking, ev.playerId);
  if (takerIdx < 0) {
    takerIdx = pickClosest(taking, 50, spotY,
      (p) => !p.isGK && ATTACKING_POSITIONS.includes(p.slotPos));
  }

  // Shot placement: random corner if scored, "saved" hits the keeper.
  const goalShotX = scored
    ? lerp(GOAL_LEFT + 2, GOAL_RIGHT - 2, rand())
    : (rand() < 0.5 ? GOAL_LEFT + 2 : GOAL_RIGHT - 2);
  const gkSide = goalShotX < 50 ? GOAL_LEFT + 4 : GOAL_RIGHT - 4;
  const gkX = scored
    ? (goalShotX < 50 ? GOAL_RIGHT - 3 : GOAL_LEFT + 3) // wrong way
    : gkSide; // right way — save
  const finalX = scored ? goalShotX : gkSide;
  const finalY = scored ? netY : goalY + dir * 2;

  const runUpY = spotY + dir * -6; // start 6 units behind the ball
  return {
    beats: [
      // BEAT 1 — set up: ball on the spot, taker takes 6-step run-up.
      {
        durationMs: 800,
        ball: mSettle(50, spotY, takerSide, takerIdx, 800),
        hints: [
          { side: takerSide, idx: takerIdx, toX: 50, toY: runUpY },
          { side: defending.side, idx: gkIdx, toX: 50, toY: goalY + dir * 1.5 },
        ],
      },
      // BEAT 2 — strike! Ball flies to its destination.
      {
        durationMs: 450,
        ball: mShot(50, spotY, finalX, finalY, 450, 0.35),
        hints: [
          { side: takerSide, idx: takerIdx, toX: 50, toY: spotY + dir * 2 },
          { side: defending.side, idx: gkIdx, toX: gkX, toY: goalY + dir * 1.5 },
        ],
      },
      // BEAT 3 — outcome (goal flash or save freeze).
      {
        durationMs: 600,
        flag: scored
          ? { ballInNet: true, netRipple: true, goalFlash: { side: takerSide },
              celebrate: { side: takerSide, idx: takerIdx } }
          : {},
      },
      // BEAT 4 — hold.
      {
        durationMs: 1100,
        flag: scored
          ? { ballInNet: true, celebrate: { side: takerSide, idx: takerIdx } }
          : {},
      },
    ],
    endBall: { x: finalX, y: finalY },
    endFlag: scored
      ? { ballInNet: true, celebrate: { side: takerSide, idx: takerIdx } }
      : {},
    endCarrierSide: scored ? defending.side : defending.side,
    endCarrierIdx: scored
      ? pickClosest(defending, 50, HALFWAY_Y, (p) => !p.isGK) // restart
      : gkIdx, // keeper has it
    totalMs: 800 + 450 + 600 + 1100,
  };
}

// ── 3. KEEPER SAVE / SHOT SAVED / KEEPER MISTAKE ─────────────────────
function buildSaveScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
  rand: () => number,
): ScenePlan {
  // KeeperSave: ev.team is the DEFENDING (keeper's) team.
  // ShotSaved / Chance / BigChance / KeeperMistake / DefensiveError /
  // ShotWide / DisallowedGoal / LateDrama: ev.team is the ATTACKING team.
  const isKeeperEvent = ev.type === "KeeperSave" || ev.type === "KeeperMistake";
  const defendingSide: Side = isKeeperEvent ? ev.team : (ev.team === "home" ? "away" : "home");
  const attackingSide: Side = defendingSide === "home" ? "away" : "home";
  const attacking = teamOf(attackingSide, home, away);
  const defending = teamOf(defendingSide, home, away);
  const dir = dirToOppGoal(attackingSide);
  const goalY = oppGoalY(attackingSide);
  const gkIdx = defending.gkIdx;

  // Pick the actual named shooter if the event names them, else best FWD.
  let shooterIdx = -1;
  if (!isKeeperEvent && ev.playerId) shooterIdx = findIdxByPlayerId(attacking, ev.playerId);
  if (shooterIdx < 0) {
    shooterIdx = pickClosest(attacking, 50, goalY + dir * 14,
      (p) => !p.isGK && ATTACKING_POSITIONS.includes(p.slotPos));
  }
  const shooter = attacking.placements[shooterIdx];

  // Wide vs on-target.
  const isWide = ev.type === "ShotWide";
  const isMistake = ev.type === "KeeperMistake" || ev.type === "DefensiveError";
  const isDisallowed = ev.type === "DisallowedGoal";

  const shotSpot: Pt = {
    x: shooter.homeX + (rand() - 0.5) * 6,
    y: goalY + dir * (10 + rand() * 6),
  };

  // Destination of the shot.
  let endX: number; let endY: number;
  if (isWide) {
    // Pull it wide of the post.
    endX = rand() < 0.5 ? GOAL_LEFT - 4 - rand() * 4 : GOAL_RIGHT + 4 + rand() * 4;
    endY = goalY + dir * 0.5;
  } else if (isMistake || isDisallowed) {
    // Mistake → ball deflects awkwardly into the net OR rolls back to
    // attacker; disallowed → ball ends in net then is recalled.
    endX = lerp(GOAL_LEFT + 4, GOAL_RIGHT - 4, rand());
    endY = oppGoalBackY(attackingSide);
  } else {
    // Save / on-target — ball heads for the corner.
    endX = rand() < 0.5 ? GOAL_LEFT + 3 : GOAL_RIGHT - 3;
    endY = goalY + dir * 1.5;
  }

  // GK movement.
  const gkSaveX = isWide
    ? 50  // GK doesn't react much to a wide shot
    : endX;
  const gkSaveY = goalY + dir * 1.5;

  // Beats:
  return {
    beats: [
      // BEAT 1 — feed into the shooter.
      {
        durationMs: 450,
        ball: mPass(ballAt.x, ballAt.y, shooter.homeX, shooter.homeY,
                    attackingSide, shooterIdx, 450, 0.15),
        hints: [
          { side: attackingSide, idx: shooterIdx, toX: shooter.homeX, toY: shooter.homeY },
        ],
      },
      // BEAT 2 — shooter takes a touch and gets a shot away.
      {
        durationMs: 300,
        ball: mDribble(shooter.homeX, shooter.homeY, shotSpot.x, shotSpot.y,
                       attackingSide, shooterIdx, 300),
        hints: [
          { side: attackingSide, idx: shooterIdx, toX: shotSpot.x, toY: shotSpot.y },
        ],
      },
      // BEAT 3 — STRIKE.
      {
        durationMs: 500,
        ball: mShot(shotSpot.x, shotSpot.y, endX, endY, 500, isWide ? 0.55 : 0.4),
        hints: [
          { side: defendingSide, idx: gkIdx, toX: gkSaveX, toY: gkSaveY },
        ],
      },
      // BEAT 4 — outcome.
      {
        durationMs: 700,
        flag: isDisallowed
          ? { ballInNet: true, netRipple: true }
          : isMistake
            ? { ballInNet: true, netRipple: true, goalFlash: { side: attackingSide } }
            : {},
      },
    ],
    endBall: { x: endX, y: endY },
    endFlag: isDisallowed ? {} : {},
    endCarrierSide: isWide
      ? defendingSide       // goal kick to keeper
      : isMistake
        ? attackingSide     // attacker exploits mistake (but commentary already named)
        : defendingSide,    // keeper has it
    endCarrierIdx: isWide || isMistake ? gkIdx : gkIdx,
    totalMs: 450 + 300 + 500 + 700,
  };
}

// ── 4. CHANCE / BIG CHANCE (no shot specified) ────────────────────────
function buildChanceScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
  rand: () => number,
): ScenePlan {
  // Treat as a half-chance — build-up + shot that doesn't go in.
  // Reuse save-style scene with a wide shot finish so it ends naturally.
  return buildSaveScene(
    { ...ev, type: ev.type === "BigChance" ? "ShotSaved" : "ShotWide" } as MatchEvent,
    home, away, ballAt, rand,
  );
}

// ── 5. CARD ──────────────────────────────────────────────────────────
function buildCardScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
): ScenePlan {
  const offendingSide: Side = ev.team;
  const offending = teamOf(offendingSide, home, away);
  // The named offender is the engine player on the event.
  let offenderIdx = findIdxByPlayerId(offending, ev.playerId);
  if (offenderIdx < 0) {
    offenderIdx = pickClosest(offending, ballAt.x, ballAt.y, (p) => !p.isGK);
  }
  const offender = offending.placements[offenderIdx];
  const foulX = clamp(lerp(ballAt.x, offender.homeX, 0.5), 12, 88);
  const foulY = clamp(lerp(ballAt.y, offender.homeY, 0.5), 20, 130);
  const color = ev.type === "Red" ? "red" : "yellow";

  return {
    beats: [
      // BEAT 1 — ball trickles to the foul spot.
      {
        durationMs: 450,
        ball: mPass(ballAt.x, ballAt.y, foulX, foulY, offendingSide, offenderIdx, 450, 0.04),
        hints: [
          { side: offendingSide, idx: offenderIdx, toX: foulX + 1, toY: foulY + 1 },
        ],
      },
      // BEAT 2 — card raised over offender.
      {
        durationMs: 1200,
        ball: mSettle(foulX, foulY, offendingSide, offenderIdx, 1200),
        flag: { cardOver: { side: offendingSide, idx: offenderIdx, color } },
      },
      // BEAT 3 — reset (card disappears).
      {
        durationMs: 200,
        flag: { cardOver: null },
      },
    ],
    endBall: { x: foulX, y: foulY },
    endFlag: {},
    // Opposition take the free kick — find their nearest player.
    endCarrierSide: offendingSide === "home" ? "away" : "home",
    endCarrierIdx: pickClosest(
      offendingSide === "home" ? away : home,
      foulX, foulY, (p) => !p.isGK,
    ),
    totalMs: 450 + 1200 + 200,
  };
}

// ── 6. KICKOFF / HALF / FULL TIME ─────────────────────────────────────
function buildPeriodScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
): ScenePlan {
  const target: Pt = { x: 50, y: HALFWAY_Y };
  // Who kicks off — home for kickoff/halftime by convention.
  const carrierSide: Side = "home";
  const carrierIdx = pickClosest(home, 50, 70, (p) => !p.isGK);
  return {
    beats: [
      {
        durationMs: 600,
        ball: mPass(ballAt.x, ballAt.y, target.x, target.y, carrierSide, carrierIdx, 600, 0.10),
      },
      {
        durationMs: 1400,
        flag: { ballHidden: ev.type === "FullTime" },
      },
    ],
    endBall: target,
    endFlag: ev.type === "FullTime" ? { ballHidden: true } : {},
    endCarrierSide: ev.type === "FullTime" ? null : carrierSide,
    endCarrierIdx: ev.type === "FullTime" ? null : carrierIdx,
    totalMs: 2000,
  };
}

// ── 7. SUBSTITUTION ──────────────────────────────────────────────────
function buildSubScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
): ScenePlan {
  // Ball is held; the AI resumes after.
  // Use the OPPOSING team for restart so the game flows on.
  const restartSide: Side = ev.team === "home" ? "away" : "home";
  const restart = teamOf(restartSide, home, away);
  const idx = pickClosest(restart, ballAt.x, ballAt.y, (p) => !p.isGK);
  return {
    beats: [{ durationMs: 1400, ball: mSettle(ballAt.x, ballAt.y, restartSide, idx, 1400) }],
    endBall: ballAt,
    endFlag: {},
    endCarrierSide: restartSide,
    endCarrierIdx: idx,
    totalMs: 1400,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Master dispatcher — pick the right scene builder for the event type.
// ─────────────────────────────────────────────────────────────────────
const GOAL_TYPES = new Set<MatchEvent["type"]>([
  "Goal", "WonderGoal", "Deflection", "OwnGoal",
]);
const SAVE_TYPES = new Set<MatchEvent["type"]>([
  "KeeperSave", "KeeperMistake", "ShotSaved", "ShotWide",
  "DefensiveError", "DisallowedGoal", "LateDrama",
]);
const CHANCE_TYPES = new Set<MatchEvent["type"]>(["Chance", "BigChance"]);

/** Returns null when the event is BEST handled by the rolling possession
 *  AI rather than a scripted scene (e.g. Injury — just let play continue
 *  briefly). The caller falls back to a tiny "settle" scene for those. */
export function buildScene(
  ev: MatchEvent,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ballAt: Pt,
): ScenePlan | null {
  // Seeded RNG so the same event always plays out the same way.
  const seed = hashStr(
    `${ev.minute}-${ev.type}-${ev.playerId ?? ""}-${ev.team}`,
  );
  const rand = makeRng(seed);

  if (GOAL_TYPES.has(ev.type)) return buildGoalScene(ev, home, away, ballAt, rand);
  if (ev.type === "PenaltyScored" || ev.type === "PenaltyMissed" || ev.type === "Penalty") {
    return buildPenaltyScene(ev, home, away, rand);
  }
  if (SAVE_TYPES.has(ev.type)) return buildSaveScene(ev, home, away, ballAt, rand);
  if (CHANCE_TYPES.has(ev.type)) return buildChanceScene(ev, home, away, ballAt, rand);
  if (ev.type === "Yellow" || ev.type === "Red") return buildCardScene(ev, home, away, ballAt);
  if (ev.type === "Kickoff" || ev.type === "HalfTime" || ev.type === "FullTime") {
    return buildPeriodScene(ev, home, away, ballAt);
  }
  if (ev.type === "Substitution") return buildSubScene(ev, home, away, ballAt);
  // Injury and anything else → no scripted scene; rolling AI continues.
  return null;
}

// Suppress unused-import diagnostics for constants that are exported by
// `types.ts` but only conditionally read above.
void PEN_BOX_LEFT; void PEN_BOX_RIGHT;
