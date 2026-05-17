"use client";

// =====================================================================
// NationFlag — procedural SVG flag for a `Nation` registry entry.
// Distinct from the existing <Flag /> component which renders player
// nationality flags from a fictional `nationalityId` (ALB / IBR /
// ITL / etc.). NationFlag is for the broader football pyramid context
// (England, Italy, Spain, Germany, Scotland) and uses real-world
// flag layouts.
// =====================================================================

import type { Nation } from "@/types/game";

interface NationFlagProps {
  nation: Nation;
  /** Height in px; width derives at a 3:2 aspect ratio. */
  size?: number;
  className?: string;
}

export function NationFlag({ nation, size = 28, className }: NationFlagProps) {
  const w = Math.round(size * 1.5);
  const h = size;
  const colors = nation.flagColors;

  return (
    <svg
      viewBox="0 0 60 40"
      width={w}
      height={h}
      className={className}
      style={{
        display: "inline-block",
        borderRadius: 3,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.3)",
        flexShrink: 0,
      }}
      aria-label={`${nation.name} flag`}
    >
      <FlagBody nation={nation} colors={colors} />
    </svg>
  );
}

function FlagBody({ nation, colors }: { nation: Nation; colors: string[] }) {
  switch (nation.flagOrientation) {
    case "tricolore-vertical": {
      const [a, b, c] = [colors[0] ?? "#000", colors[1] ?? "#fff", colors[2] ?? colors[0] ?? "#000"];
      return (
        <>
          <rect x="0" y="0" width="20" height="40" fill={a} />
          <rect x="20" y="0" width="20" height="40" fill={b} />
          <rect x="40" y="0" width="20" height="40" fill={c} />
        </>
      );
    }
    case "tricolore-horizontal": {
      const [a, b, c] = [colors[0] ?? "#000", colors[1] ?? "#fff", colors[2] ?? colors[0] ?? "#000"];
      return (
        <>
          <rect x="0" y="0" width="60" height="13.33" fill={a} />
          <rect x="0" y="13.33" width="60" height="13.34" fill={b} />
          <rect x="0" y="26.67" width="60" height="13.33" fill={c} />
        </>
      );
    }
    case "cross-st-george": {
      const [field, cross] = [colors[0] ?? "#fff", colors[1] ?? "#CE1124"];
      return (
        <>
          <rect x="0" y="0" width="60" height="40" fill={field} />
          <rect x="25" y="0" width="10" height="40" fill={cross} />
          <rect x="0" y="15" width="60" height="10" fill={cross} />
        </>
      );
    }
    case "saltire": {
      const [field, cross] = [colors[0] ?? "#0065BD", colors[1] ?? "#fff"];
      return (
        <>
          <rect x="0" y="0" width="60" height="40" fill={field} />
          <line x1="0" y1="0" x2="60" y2="40" stroke={cross} strokeWidth="7" />
          <line x1="60" y1="0" x2="0" y2="40" stroke={cross} strokeWidth="7" />
        </>
      );
    }
    case "stripes-horizontal": {
      const stripeH = 40 / Math.max(colors.length, 1);
      return (
        <>
          {colors.map((c, i) => (
            <rect key={i} x="0" y={i * stripeH} width="60" height={stripeH} fill={c} />
          ))}
        </>
      );
    }
    case "stripes-vertical": {
      const stripeW = 60 / Math.max(colors.length, 1);
      return (
        <>
          {colors.map((c, i) => (
            <rect key={i} x={i * stripeW} y="0" width={stripeW} height="40" fill={c} />
          ))}
        </>
      );
    }
    case "nordic-cross": {
      // Field colour is colors[0], cross colour is colors[1] (with an
      // optional outline using colors[2] for Norway). Cross is offset
      // toward the hoist (left) per Scandinavian convention.
      const field = colors[0] ?? "#0055A4";
      const cross = colors[1] ?? "#FFFFFF";
      const outline = colors[2];
      return (
        <>
          <rect x="0" y="0" width="60" height="40" fill={field} />
          {/* Outlined cross — render outline a bit thicker, then cross on top. */}
          {outline ? (
            <>
              <rect x="0" y="14" width="60" height="12" fill={outline} />
              <rect x="14" y="0" width="12" height="40" fill={outline} />
            </>
          ) : null}
          <rect x="0" y="16" width="60" height="8" fill={cross} />
          <rect x="16" y="0" width="8" height="40" fill={cross} />
        </>
      );
    }
    case "solid":
    default:
      return <rect x="0" y="0" width="60" height="40" fill={colors[0] ?? "#888"} />;
  }
}
