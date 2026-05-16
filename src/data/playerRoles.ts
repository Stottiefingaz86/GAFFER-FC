// =====================================================================
// PLAYER ROLES — UI helpers. The role *type* lives in @/types/game; this
// module owns the user-facing labels, abbreviations, and the
// position-specific role menus.
// =====================================================================

import type { DetailedPosition, PlayerRole } from "@/types/game";

/** Long human label shown in tooltips and menus. */
export const ROLE_LABEL: Record<PlayerRole, string> = {
  "Default":        "Default · stick to the system",
  "Run Forward":    "Run Forward · run in behind",
  "Hold Up":        "Hold Up · take the ball, link play",
  "Drift Wide":     "Drift Wide · pull defenders wide",
  "Cut Inside":     "Cut Inside · inverted run",
  "Get Forward":    "Get Forward · late runs into the box",
  "Stay Back":      "Stay Back · screen the defence",
  "Playmaker":      "Playmaker · dictate tempo",
  "Press High":     "Press High · aggressive press",
  "Overlap":        "Overlap · bomb on outside",
  "Underlap":       "Underlap · third-man inside",
  "Defensive WB":   "Defensive WB · stay back",
  "Stopper":        "Stopper · step out, win first ball",
  "Cover":          "Cover · sit deeper, sweep",
  "Sweeper Keeper": "Sweeper Keeper · aggressive off line",
};

/** Compact 2-letter token shown on the pitch under the player. */
export const ROLE_ABBR: Record<PlayerRole, string> = {
  "Default":        "",   // Hidden — assume default unless overridden
  "Run Forward":    "RF",
  "Hold Up":        "HU",
  "Drift Wide":     "DW",
  "Cut Inside":     "CI",
  "Get Forward":    "GF",
  "Stay Back":      "SB",
  "Playmaker":      "PM",
  "Press High":     "PH",
  "Overlap":        "OL",
  "Underlap":       "UL",
  "Defensive WB":   "WB",
  "Stopper":        "ST",
  "Cover":          "CV",
  "Sweeper Keeper": "SK",
};

/** Short arrow / glyph hint for the abbreviation chip — adds direction. */
export const ROLE_GLYPH: Record<PlayerRole, string> = {
  "Default":        "·",
  "Run Forward":    "↑",
  "Hold Up":        "■",
  "Drift Wide":     "↔",
  "Cut Inside":     "↰",
  "Get Forward":    "↑",
  "Stay Back":      "↓",
  "Playmaker":      "◆",
  "Press High":     "‹‹",
  "Overlap":        "⤴",
  "Underlap":       "↗",
  "Defensive WB":   "↓",
  "Stopper":        "↥",
  "Cover":          "↧",
  "Sweeper Keeper": "↥",
};

/** Returns the menu of roles that make sense for a given on-pitch slot
 * position. Used to drive the per-token role dropdown. */
export function rolesForPosition(pos: DetailedPosition): PlayerRole[] {
  switch (pos) {
    case "GK":
      return ["Default", "Sweeper Keeper"];
    case "CB":
      return ["Default", "Stopper", "Cover"];
    case "LB":
    case "RB":
      return ["Default", "Overlap", "Underlap", "Defensive WB"];
    case "DM":
      return ["Default", "Stay Back", "Playmaker"];
    case "CM":
      return ["Default", "Get Forward", "Stay Back", "Playmaker", "Press High"];
    case "AM":
      return ["Default", "Playmaker", "Get Forward", "Press High"];
    case "LM":
    case "RM":
      return ["Default", "Drift Wide", "Cut Inside", "Press High"];
    case "LW":
    case "RW":
      return ["Default", "Drift Wide", "Cut Inside", "Run Forward"];
    case "ST":
    case "CF":
      return ["Default", "Run Forward", "Hold Up", "Drift Wide"];
    default:
      return ["Default"];
  }
}
