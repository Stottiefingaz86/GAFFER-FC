"use client";

import { FORMATIONS } from "@/data/formations";
import type { FormationKey } from "@/types/game";

/** Tiny formation preview — a 4:3 pitch with a coloured dot per slot.
 * Used inside the tactics screen so users can SEE the difference between
 * 4-4-2 and 3-5-2 at a glance. */
export function FormationCard({
  fk,
  active,
  onClick,
}: {
  fk: FormationKey;
  active: boolean;
  onClick: () => void;
}) {
  const f = FORMATIONS[fk];
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-1 px-2 py-1.5 border-r-2 last:border-r-0 transition-all ${
        active
          ? "bg-[color:var(--ss-accent)] text-black"
          : "bg-[color:var(--ss-bg-strip)] text-white hover:bg-[color:var(--ss-bg-2)]"
      } border-[color:var(--ss-bg-deep)]`}
      title={`Formation ${fk}`}
      aria-pressed={active}
    >
      {/* Tiny pitch preview */}
      <div
        className={`relative w-full aspect-[4/3] max-w-[56px] ${
          active ? "bg-[color:var(--pitch-2)]" : "bg-black/40"
        }`}
        aria-hidden
      >
        {/* halfway line */}
        <span
          className="absolute left-0 right-0 top-1/2 h-px"
          style={{
            background: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)",
          }}
        />
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-2 rounded-full border"
          style={{
            borderColor: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)",
          }}
        />
        {f.slots.map((s) => (
          <span
            key={s.id}
            className="absolute size-1.5 rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${s.x * 100}%`,
              // y in formation is "back→forward attacking up"; in the preview
              // we want defenders at the bottom (closer to viewer) and forwards
              // at the top.
              top: `${(1 - s.y) * 100}%`,
              background: active
                ? "#0E0830"
                : s.position === "GK"
                  ? "#FFD000"
                  : "#FFFFFF",
            }}
          />
        ))}
      </div>
      <span
        className="text-[11px] font-extrabold tracking-[0.04em] leading-none"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {fk}
      </span>
    </button>
  );
}
