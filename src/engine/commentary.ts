// =====================================================================
// COMMENTARY ENGINE — minute-prefixed event lines for the new
// highlight feed.
//
// The simulator already emits a one-line `text` field per match event;
// this module replaces that with richer copy that:
//
//   • names BOTH the shooter AND the passer/assister when applicable
//   • acknowledges defensive players (saver, blocker, fouler)
//   • adapts wording to context (cup tie, derby, late drama, weather)
//   • mixes phrasings so a 90-minute match doesn't repeat itself
//
// Pure, deterministic given the same RNG — keeps replays consistent.
// =====================================================================

import type { Player } from "@/types/game";
import type { Rng } from "@/lib/rng";
import type {
  HighlightEventType,
  HighlightOutcome,
  MatchStory,
  PitchZone,
} from "@/types/match";
import { laneName, laneOf, thirdName, thirdOf } from "@/utils/pitchZones";

/** Context the commentary engine reads to season the copy. The
 * highlight generator builds one of these once per match and passes
 * it to every `buildCommentary` call. */
export interface CommentaryContext {
  /** Cup tie, derby, promotion / relegation showdown — drives the
   * "shock", "battle", "drama" vocab. */
  isCupGame: boolean;
  isDerby: boolean;
  isLate: boolean;
  story: MatchStory;
  /** Short tags for the two clubs, used in copy like "Spire United". */
  homeShortName: string;
  awayShortName: string;
}

/** Source data the commentary engine needs about one highlight. The
 * generator builds this from MatchEvent + lineup lookups. */
export interface CommentarySeed {
  minute: number;
  type: HighlightEventType;
  outcome: HighlightOutcome;
  shooter?: Player;
  assister?: Player;
  defender?: Player;
  goalkeeper?: Player;
  /** Where the shot was taken from (for "from the edge of the box"
   * style detail). */
  shotZone?: PitchZone;
  startZone?: PitchZone;
  endZone?: PitchZone;
}

// =====================================================================
// PUBLIC API
// =====================================================================

/**
 * Build a single minute-prefixed commentary line.
 *
 * The output is one short sentence — the viewer renders the minute
 * separately (in the scoreboard), so the line itself reads naturally
 * without the minute prefix. We still allow `minute` in the seed
 * because some templates ("90+2'") need it inline.
 */
export function buildCommentary(seed: CommentarySeed, ctx: CommentaryContext, rng: Rng): string {
  switch (seed.type) {
    case "kickoff":
      return ctx.isCupGame
        ? `Kick-off! ${ctx.homeShortName} v ${ctx.awayShortName} — winner takes all.`
        : `Kick-off at ${ctx.homeShortName}.`;
    case "half_time":
      return "Half-time.";
    case "full_time":
      return "Full-time.";
    case "yellow_card":
      return yellowLine(seed, ctx, rng);
    case "red_card":
      return redLine(seed, ctx, rng);
    case "injury":
      return injuryLine(seed, rng);
    case "substitution":
      return seed.shooter
        ? `Change for ${ctx.homeShortName}: ${seed.shooter.displayName} comes on.`
        : "Substitution.";
    case "penalty":
      return penaltyLine(seed, ctx, rng);
    case "corner":
      return cornerLine(seed, ctx, rng);
    case "free_kick":
      return freeKickLine(seed, ctx, rng);
    case "cross":
      return crossLine(seed, ctx, rng);
    case "through_ball":
      return throughBallLine(seed, ctx, rng);
    case "long_shot":
      return longShotLine(seed, ctx, rng);
    case "counter_attack":
      return counterLine(seed, ctx, rng);
    case "defensive_mistake":
      return mistakeLine(seed, ctx, rng);
    case "keeper_save":
      return keeperSaveLine(seed, ctx, rng);
    case "build_up_shot":
      return buildUpLine(seed, ctx, rng);
    case "goal":
      return goalLine(seed, ctx, rng);
    case "miss":
      return missLine(seed, ctx, rng);
    case "late_drama":
      return lateDramaLine(seed, ctx, rng);
  }
}

// =====================================================================
// PER-TYPE WORDING — every helper returns a single short sentence.
// We use rng.pick across a handful of variants so 16 highlights in
// one match don't all use the same template.
// =====================================================================

function shooterName(seed: CommentarySeed): string {
  return seed.shooter?.displayName ?? "the striker";
}

function gkName(seed: CommentarySeed): string {
  return seed.goalkeeper?.displayName ?? "the keeper";
}

function defName(seed: CommentarySeed): string {
  return seed.defender?.displayName ?? "the defender";
}

function assistName(seed: CommentarySeed): string {
  return seed.assister?.displayName ?? "his teammate";
}

function lateFlag(seed: CommentarySeed): string {
  return seed.minute >= 85 ? " in the dying minutes" : "";
}

function laneFor(seed: CommentarySeed): string {
  const z = seed.startZone ?? seed.endZone;
  if (!z) return "midfield";
  return laneName(laneOf(z));
}

function goalLine(seed: CommentarySeed, ctx: CommentaryContext, rng: Rng): string {
  if (seed.shotZone === "BOX_C" && seed.assister) {
    return rng.pick([
      `GOAL! ${assistName(seed)} squares it for ${shooterName(seed)} to tap home.`,
      `GOAL! ${shooterName(seed)} finishes a clever ${assistName(seed)} pass.`,
      `GOAL! ${shooterName(seed)} steers home from the centre of the box.`,
    ]);
  }
  if (seed.assister) {
    return rng.pick([
      `GOAL! ${shooterName(seed)} finishes after a sharp ball from ${assistName(seed)}.`,
      `GOAL! ${assistName(seed)} picks out ${shooterName(seed)} and it's in!`,
      `GOAL! ${shooterName(seed)} converts ${assistName(seed)}'s assist.`,
    ]);
  }
  if (seed.shotZone === "MID_C" || seed.shotZone === "ATT_C") {
    return `GOAL! ${shooterName(seed)} unleashes one from distance!`;
  }
  const cup = ctx.isCupGame && ctx.story === "cup_shock"
    ? " — a famous cup shock could be on!"
    : ctx.isDerby ? " — bedlam in the derby!" : "";
  return `GOAL! ${shooterName(seed)} finds the net${lateFlag(seed)}${cup}`;
}

function missLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  return rng.pick([
    `${shooterName(seed)} drags it wide of the post.`,
    `${shooterName(seed)} blazes it over the bar — huge chance gone.`,
    `${shooterName(seed)} can't keep his shot down.`,
    `Open ${laneFor(seed)} side and ${shooterName(seed)} miscues — wide.`,
  ]);
}

function keeperSaveLine(seed: CommentarySeed, ctx: CommentaryContext, rng: Rng): string {
  const masterclass = ctx.story === "keeper_masterclass"
    ? rng.pick([
        `Huge save! ${gkName(seed)} is putting on a masterclass.`,
        `${gkName(seed)} again! What a performance.`,
      ])
    : null;
  if (masterclass) return masterclass;
  if (seed.shooter) {
    return rng.pick([
      `Big save! ${gkName(seed)} denies ${shooterName(seed)} at point-blank range.`,
      `${gkName(seed)} parries ${shooterName(seed)}'s effort away from danger.`,
      `${shooterName(seed)} forces a fine save from ${gkName(seed)}.`,
    ]);
  }
  return rng.pick([
    `${gkName(seed)} gets down well to keep it out.`,
    `Strong hands from ${gkName(seed)}.`,
  ]);
}

function counterLine(seed: CommentarySeed, _ctx: CommentaryContext, _rng: Rng): string {
  const lane = laneFor(seed);
  const finish = seed.outcome === "goal"
    ? `and ${shooterName(seed)} finishes off the counter!`
    : seed.outcome === "save"
      ? `but ${gkName(seed)} stands tall.`
      : seed.outcome === "miss"
        ? `but the finish is poor.`
        : `but the move breaks down.`;
  if (seed.assister) {
    return `Counter! ${assistName(seed)} races down the ${lane} and feeds ${shooterName(seed)} — ${finish}`;
  }
  return `Counter-attack down the ${lane}, ${finish}`;
}

function crossLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  const lane = laneFor(seed);
  const ass = seed.assister ? assistName(seed) : "the wide man";
  if (seed.outcome === "goal") {
    return `${ass} whips in a cross from the ${lane} and ${shooterName(seed)} buries it!`;
  }
  if (seed.outcome === "save") {
    return `${ass} crosses dangerously and ${shooterName(seed)} forces a save from ${gkName(seed)}.`;
  }
  if (seed.outcome === "miss") {
    return rng.pick([
      `${ass} hangs one up but ${shooterName(seed)}'s header goes wide.`,
      `Cross from ${ass}, ${shooterName(seed)} can't quite connect.`,
    ]);
  }
  return `${ass} flashes a cross across the six-yard box — cleared.`;
}

function throughBallLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  const ass = seed.assister ? assistName(seed) : "the playmaker";
  if (seed.outcome === "goal") {
    return `${ass} slides ${shooterName(seed)} through and he picks his spot!`;
  }
  if (seed.outcome === "save") {
    return `${ass} threads a sublime through-ball, ${gkName(seed)} smothers ${shooterName(seed)}'s effort.`;
  }
  if (seed.outcome === "miss") {
    return rng.pick([
      `${ass}'s through-ball releases ${shooterName(seed)} but he can't finish.`,
      `${ass} plays in ${shooterName(seed)}, who fires wide.`,
    ]);
  }
  return `${ass} attempts the killer ball, the defender intercepts.`;
}

function longShotLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return rng.pick([
      `${shooterName(seed)} hits one from 25 yards and it flies in!`,
      `${shooterName(seed)} lets fly from distance — stunner!`,
    ]);
  }
  if (seed.outcome === "save") {
    return `${shooterName(seed)} tries his luck from range, ${gkName(seed)} tips it over.`;
  }
  if (seed.outcome === "woodwork") {
    return `Crashes off the bar! ${shooterName(seed)}'s long-range strike was inches away.`;
  }
  return `${shooterName(seed)} swings one in from outside the box — over.`;
}

function buildUpLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return `Patient build-up pays off — ${shooterName(seed)} finishes the move.`;
  }
  if (seed.outcome === "save") {
    return `Worked into the box for ${shooterName(seed)} — ${gkName(seed)} saves.`;
  }
  if (seed.outcome === "miss") {
    return `${shooterName(seed)} works space on the edge of the box but his shot misses.`;
  }
  return rng.pick([
    `Slick passing inside the area, blocked away.`,
    `Build-up move, the defender steps in.`,
  ]);
}

function mistakeLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return `Defensive mistake! ${defName(seed)} gifts ${shooterName(seed)} and he punishes them!`;
  }
  if (seed.outcome === "save") {
    return `${defName(seed)}'s slack pass is intercepted but ${gkName(seed)} bails them out.`;
  }
  return rng.pick([
    `${defName(seed)} makes a hash of it but gets away with it.`,
    `Loose touch from ${defName(seed)} — scare averted.`,
  ]);
}

function penaltyLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return `PENALTY CONVERTED! ${shooterName(seed)} sends ${gkName(seed)} the wrong way.`;
  }
  if (seed.outcome === "save") {
    return `PENALTY SAVED! ${gkName(seed)} guesses right and denies ${shooterName(seed)}!`;
  }
  if (seed.outcome === "miss") {
    return rng.pick([
      `Penalty missed! ${shooterName(seed)} skies it over the bar.`,
      `${shooterName(seed)} blazes the spot-kick wide!`,
    ]);
  }
  return `Penalty given — ${shooterName(seed)} steps up.`;
}

function cornerLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return `Corner whipped in and ${shooterName(seed)} powers home a header!`;
  }
  if (seed.outcome === "save") {
    return `Corner causes panic — ${gkName(seed)} claims it after a goalmouth scramble.`;
  }
  return rng.pick([
    `Corner cleared at the near post.`,
    `Corner headed away to safety.`,
  ]);
}

function freeKickLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return `Free-kick! ${shooterName(seed)} curls it over the wall and in!`;
  }
  if (seed.outcome === "save") {
    return `${shooterName(seed)}'s free-kick is fingertipped over by ${gkName(seed)}.`;
  }
  return rng.pick([
    `Free-kick smacks into the wall.`,
    `${shooterName(seed)} drags the free-kick wide.`,
  ]);
}

function yellowLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  return rng.pick([
    `Yellow card for ${defName(seed) || shooterName(seed)}.`,
    `Booking — ${defName(seed) || shooterName(seed)} goes into the book.`,
  ]);
}

function redLine(seed: CommentarySeed, ctx: CommentaryContext, _rng: Rng): string {
  const who = seed.defender ?? seed.shooter;
  if (!who) return `RED CARD! Down to ten men.`;
  const drama = ctx.story === "early_red_card" && seed.minute < 35
    ? " — and it's a hammer blow this early."
    : "";
  return `RED CARD! ${who.displayName} is sent off${drama}.`;
}

function injuryLine(seed: CommentarySeed, _rng: Rng): string {
  const who = seed.defender ?? seed.shooter;
  if (!who) return "Player down, the physio is on.";
  return `${who.displayName} is down injured — looks serious.`;
}

function lateDramaLine(seed: CommentarySeed, _ctx: CommentaryContext, rng: Rng): string {
  if (seed.outcome === "goal") {
    return rng.pick([
      `LATE DRAMA! ${shooterName(seed)} has done it at the death!`,
      `It's there! ${shooterName(seed)} steals it deep in stoppage time!`,
    ]);
  }
  if (seed.outcome === "save") {
    return rng.pick([
      `Last-gasp save by ${gkName(seed)}!`,
      `Heart-stopping moment — ${gkName(seed)} pulls off a stunner!`,
    ]);
  }
  return `Final moments — a chance comes and goes in ${thirdName(thirdOf(seed.endZone ?? "ATT_C"))}.`;
}
