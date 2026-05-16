// =====================================================================
// <Flag /> — procedurally renders a fictional nation flag from its id.
// Used in player rows, profiles, and squad lists.
// =====================================================================

import { flagFor, type FlagDef } from "@/data/nationalityFlags";

interface FlagProps {
  /** Nationality id, e.g. "GAL", "ALB", "BRZ". */
  nationalityId: string;
  /** Width in px. Height auto-derives at a 4:3 ratio. */
  width?: number;
  /** Border colour around the flag — keeps it visible on light strips. */
  border?: string;
  /** Optional className for layout positioning. */
  className?: string;
  /** Render the 3-letter id as a small caption underneath. */
  showCode?: boolean;
  /** Render the emblem character (defaults to true). */
  showEmblem?: boolean;
}

/**
 * Render a tiny fictional flag for a nationality id. Stripes follow
 * the FlagDef.orientation, with an optional emblem stamped in the
 * centre. Identical inputs produce identical output — no randomness.
 */
export function Flag({
  nationalityId,
  width = 22,
  border = "rgba(0, 0, 0, 0.35)",
  className,
  showCode = false,
  showEmblem = true,
}: FlagProps) {
  const def = flagFor(nationalityId);
  const height = Math.round((width * 3) / 4);

  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}
      title={def.label}
      aria-label={`Flag of ${def.label}`}
    >
      <svg
        width={width}
        height={height}
        viewBox="0 0 40 30"
        style={{
          display: "block",
          border: `1px solid ${border}`,
          imageRendering: "pixelated",
          flexShrink: 0,
        }}
      >
        <FlagBody def={def} />
        {showEmblem && def.emblem && (
          <text
            x="20"
            y="22"
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill={emblemColorOn(def)}
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {def.emblem}
          </text>
        )}
      </svg>
      {showCode && (
        <span
          className="scoreboard"
          style={{
            fontSize: 8,
            letterSpacing: 0.5,
            marginTop: 2,
            opacity: 0.8,
            color: "currentColor",
          }}
        >
          {def.id}
        </span>
      )}
    </span>
  );
}

function FlagBody({ def }: { def: FlagDef }) {
  const colors = def.colors.filter((c): c is string => Boolean(c));
  const n = colors.length;

  if (def.orientation === "horizontal") {
    const stripeH = 30 / n;
    return (
      <>
        {colors.map((c, i) => (
          <rect
            key={i}
            x={0}
            y={i * stripeH}
            width={40}
            height={stripeH}
            fill={c}
          />
        ))}
      </>
    );
  }

  if (def.orientation === "vertical") {
    const stripeW = 40 / n;
    return (
      <>
        {colors.map((c, i) => (
          <rect
            key={i}
            x={i * stripeW}
            y={0}
            width={stripeW}
            height={30}
            fill={c}
          />
        ))}
      </>
    );
  }

  // diagonal: corner-to-corner triangles using a single base + slashes.
  return (
    <>
      <rect x={0} y={0} width={40} height={30} fill={colors[0]} />
      {colors[1] && (
        <polygon points="0,0 40,0 40,30" fill={colors[1]} />
      )}
      {colors[2] && (
        <polygon points="0,30 40,30 0,0" fill={colors[2]} opacity={0.85} />
      )}
    </>
  );
}

/** Pick a contrasting emblem colour (white or near-black) based on
 * the average lightness of the flag's first colour. */
function emblemColorOn(def: FlagDef): string {
  const first = def.colors[0] ?? "#888";
  // Cheap brightness estimate from a hex literal.
  const hex = first.startsWith("#") ? first.slice(1) : first;
  if (hex.length !== 3 && hex.length !== 6) return "#FFFFFF";
  const norm = hex.length === 3
    ? hex.split("").map((c) => c + c).join("")
    : hex;
  const r = parseInt(norm.slice(0, 2), 16);
  const g = parseInt(norm.slice(2, 4), 16);
  const b = parseInt(norm.slice(4, 6), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 150 ? "#0A0A0A" : "#FFFFFF";
}
