"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedBar — a horizontal progress bar that fills from 0 → v on mount
 * and on subsequent value changes. Renders 4 hairline notches for the
 * classic "skill bar" look.
 */
export function AnimatedBar({
  v,
  max = 99,
  height = 12,
  color,
  className,
}: {
  v: number;
  max?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  const [w, setW] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    // requestAnimationFrame ensures the transition triggers
    const id = requestAnimationFrame(() => setW(Math.max(0, Math.min(100, (v / max) * 100))));
    return () => cancelAnimationFrame(id);
  }, [v, max]);

  const fill = color ?? barColor(v);

  return (
    <span
      className={`relative inline-block w-full overflow-hidden bg-black/40 ${className ?? ""}`}
      style={{ height }}
    >
      <span
        ref={ref}
        className="block h-full will-change-transform"
        style={{
          width: `${w}%`,
          background: fill,
          transition: "width 600ms cubic-bezier(0.2, 0.7, 0.3, 1)",
          boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.25)`,
        }}
      />
      <span className="absolute inset-0 pointer-events-none">
        {[20, 40, 60, 80].map((mark) => (
          <span
            key={mark}
            className="absolute top-0 bottom-0 border-l border-black/30"
            style={{ left: `${mark}%` }}
          />
        ))}
      </span>
    </span>
  );
}

function barColor(v: number): string {
  if (v >= 80) return "#1FB220";
  if (v >= 65) return "#9AF09A";
  if (v >= 50) return "#FFD000";
  if (v >= 35) return "#FF8A1A";
  return "#E83A3A";
}
