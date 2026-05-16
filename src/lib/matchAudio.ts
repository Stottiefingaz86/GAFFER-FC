// =====================================================================
// Helpers that decide which sounds belong with which match events.
// Keeping the rules in one place so the match page and the result page
// can stay in sync without copy-pasting branching logic.
// =====================================================================

import { COMP_IDS } from "@/data/competitionSeeds";
import type { MatchEvent } from "@/types/game";
import type { AmbientKey, SoundKey } from "@/lib/sound";

/** "Big game" ambience for the top flight + continental nights. Every
 * other competition (Division One, Two, Three, both domestic cups) gets
 * the smaller, more intimate crowd bed. */
export function ambientForCompetition(competitionId: string): AmbientKey {
  switch (competitionId) {
    case COMP_IDS.PREMIER:
    case COMP_IDS.CHAMPIONS_CUP:
    case COMP_IDS.CONTINENTAL_CUP:
    case COMP_IDS.SUPER_SHIELD:
      return "bigGame";
    default:
      return "smallGame";
  }
}

/** Map a match event to its corresponding one-shot — or null when the
 * event is silent (chances, saves, narration beats, etc.). */
export function sfxForEvent(ev: MatchEvent): SoundKey | null {
  switch (ev.type) {
    case "Kickoff":
      return "kickoff";
    case "FullTime":
      return "fullTime";
    // The headline moments of any match — every flavour of "ball in
    // the back of the net" plays the goal stinger so the user feels it.
    case "Goal":
    case "WonderGoal":
    case "Deflection":
    case "PenaltyScored":
    case "OwnGoal":
      return "goal";
    case "Yellow":
    case "Red":
    case "Injury":
    case "Penalty":
    case "PenaltyMissed":
      return "stoppage";
    default:
      return null;
  }
}

/** How long (ms, at 1× speed) we should linger on an event before
 * advancing to the next one. Big moments get more breathing room so the
 * commentary lands and the SFX isn't immediately stepped on. The match
 * page divides this by the user's chosen speed (1×/2×/4×).
 *
 * These values were bumped up after match-engine feedback — the
 * simulator needs time between events to actually *play out* a phase
 * of football (build-up → progression → attack → resolution). At
 * 900ms per routine tick the dots barely had time to walk five yards
 * before the next caption arrived; commentary felt rushed and the
 * pitch felt like it was on fast-forward. The new dwell budget gives
 * each beat enough air to read AND for the simulator to deliver a
 * recognisable possession sequence. The user can still 2× / 4× when
 * they want to skim. */
export function dwellMsForEvent(ev: MatchEvent): number {
  switch (ev.type) {
    // Goal stingers are the climax — celebration + replay window.
    case "Goal":
    case "WonderGoal":
    case "Deflection":
    case "PenaltyScored":
    case "OwnGoal":
      return 4200;
    // Penalty kick flow: build-up shot first, outcome follows — each
    // gets its own beat so it's clear what just happened.
    case "Penalty":
    case "PenaltyMissed":
      return 3000;
    // Big chances and red cards alter the match — give them weight.
    case "BigChance":
    case "Red":
    case "DisallowedGoal":
    case "LateDrama":
      return 2600;
    // Cards / injuries / saves / mistakes — readable beat plus enough
    // window for the pitch to show the restart shape.
    case "Yellow":
    case "Injury":
    case "KeeperSave":
    case "KeeperMistake":
    case "DefensiveError":
      return 1900;
    // Period markers — a clean pause that doesn't slow the user down.
    case "Kickoff":
    case "HalfTime":
    case "FullTime":
      return 2000;
    // Routine ticks (chances, wide shots, etc.) — slower than before
    // so a phase of play actually gets to develop on the pitch.
    default:
      return 1500;
  }
}
