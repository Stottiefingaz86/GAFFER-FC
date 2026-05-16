// =====================================================================
// FICTIONAL NATIONALITY FLAGS
// Each nation gets a small palette + a stripe pattern. Flags are
// rendered procedurally by the <Flag /> component using these tokens
// so we never have to ship dozens of bitmap assets.
// =====================================================================

import { NATIONALITIES } from "@/data/names";

export type FlagOrientation = "horizontal" | "vertical" | "diagonal";

export interface FlagDef {
  /** 3-letter nationality id (matches NamePool.id). */
  id: string;
  /** Full label — real country adjective, e.g. "Italian", "French". */
  label: string;
  /** 2-3 stripe colors, painted in order. */
  colors: [string, string, string?];
  orientation: FlagOrientation;
  /** Optional emblem character (Unicode glyph) overlaid in the centre. */
  emblem?: string;
}

// Real country adjectives mapped to fictional flag palettes. The flag
// designs themselves stay invented (we don't ship pixel-perfect real
// flags) but the labels are the everyday country names users expect.
const FLAG_DEFS: FlagDef[] = [
  { id: "ALB", label: "English",     colors: ["#1A2A4F", "#FFFFFF", "#C8102E"], orientation: "horizontal", emblem: "✚" },
  { id: "IBR", label: "Spanish",     colors: ["#C8102E", "#FFD000"],            orientation: "horizontal" },
  { id: "ITL", label: "Italian",     colors: ["#0E8A4A", "#FFFFFF", "#C8102E"], orientation: "vertical" },
  { id: "GAL", label: "French",      colors: ["#0E2D6B", "#FFFFFF", "#C8102E"], orientation: "vertical" },
  { id: "GRM", label: "German",      colors: ["#1A1A1A", "#C8102E", "#FFD000"], orientation: "horizontal" },
  { id: "POR", label: "Portuguese",  colors: ["#0E8A4A", "#C8102E"],            orientation: "vertical", emblem: "⚓" },
  { id: "NLD", label: "Dutch",       colors: ["#C8102E", "#FFFFFF", "#0E2D6B"], orientation: "horizontal" },
  { id: "BRZ", label: "Brazilian",   colors: ["#0E8A4A", "#FFD000", "#0E2D6B"], orientation: "diagonal" },
  { id: "ARG", label: "Argentine",   colors: ["#5FB3E8", "#FFFFFF", "#5FB3E8"], orientation: "horizontal", emblem: "☀" },
  { id: "SCN", label: "Swedish",     colors: ["#0E2D6B", "#FFD000"],            orientation: "vertical", emblem: "✶" },
  { id: "EAS", label: "Romanian",    colors: ["#1F1140", "#C8102E", "#FFD000"], orientation: "horizontal" },
  { id: "AFR", label: "Senegalese",  colors: ["#0E8A4A", "#FFD000", "#C8102E"], orientation: "horizontal" },
  { id: "JPN", label: "Japanese",    colors: ["#FFFFFF", "#C8102E"],            orientation: "vertical", emblem: "●" },
  { id: "KOR", label: "Korean",      colors: ["#FFFFFF", "#0E2D6B", "#C8102E"], orientation: "horizontal", emblem: "☯" },
  { id: "USA", label: "American",    colors: ["#0E2D6B", "#FFFFFF", "#C8102E"], orientation: "diagonal", emblem: "★" },
  { id: "IRI", label: "Irish",       colors: ["#0E8A4A", "#FFFFFF", "#FF8C2A"], orientation: "vertical" },
  { id: "SCO", label: "Scottish",    colors: ["#0E2D6B", "#FFFFFF"],            orientation: "diagonal", emblem: "✕" },
  { id: "WAL", label: "Welsh",       colors: ["#FFFFFF", "#0E8A4A", "#C8102E"], orientation: "horizontal", emblem: "♛" },
];

const FLAG_BY_ID: Record<string, FlagDef> = Object.fromEntries(
  FLAG_DEFS.map((f) => [f.id, f]),
);

/** Look up the flag/palette for a nationality id. Falls back to a
 * neutral grey palette if the id is unknown. */
export function flagFor(nationalityId: string): FlagDef {
  return (
    FLAG_BY_ID[nationalityId] ?? {
      id: nationalityId,
      label: nationalityId,
      colors: ["#444", "#888"],
      orientation: "horizontal",
    }
  );
}

/** Return the human-readable nationality label, e.g. "French" for
 * "GAL". Used everywhere the player profile / row needs to display the
 * country alongside the flag. */
export function nationalityLabel(id: string): string {
  return (
    FLAG_BY_ID[id]?.label ??
    NATIONALITIES.find((n) => n.id === id)?.label ??
    id
  );
}
