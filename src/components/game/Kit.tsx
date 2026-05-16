"use client";

import type { Kit as KitType } from "@/types/game";

interface Props {
  kit: KitType;
  size?: number;
  className?: string;
}

function PatternOverlay({ pattern, secondary }: { pattern: KitType["pattern"]; secondary: string }) {
  switch (pattern) {
    case "vertical-stripes":
      return (
        <g>
          {[20, 35, 50, 65, 80].map((x) => (
            <rect key={x} x={x} y={28} width="6" height="44" fill={secondary} opacity={0.7} />
          ))}
        </g>
      );
    case "hoops":
      return (
        <g>
          <rect x={20} y={32} width="60" height="6" fill={secondary} />
          <rect x={20} y={48} width="60" height="6" fill={secondary} />
          <rect x={20} y={64} width="60" height="6" fill={secondary} />
        </g>
      );
    case "sash":
      return <path d="M22 28 L78 72 L82 60 L26 18 Z" fill={secondary} opacity={0.85} />;
    case "halves":
      return <rect x={50} y={28} width="30" height="44" fill={secondary} opacity={0.85} />;
    case "diagonal":
      return <path d="M20 28 L50 28 L80 72 L60 72 Z" fill={secondary} opacity={0.7} />;
    case "sleeves":
      return (
        <g>
          <rect x={14} y={28} width="10" height="20" fill={secondary} />
          <rect x={76} y={28} width="10" height="20" fill={secondary} />
        </g>
      );
    case "pinstripes":
      return (
        <g>
          {[24, 32, 40, 48, 56, 64, 72].map((x) => (
            <rect key={x} x={x} y={28} width="1.5" height="44" fill={secondary} opacity={0.6} />
          ))}
        </g>
      );
    case "checker":
      return (
        <g>
          {[28, 38, 48, 58, 68].map((y, i) =>
            [22, 32, 42, 52, 62, 72].map((x, j) =>
              (i + j) % 2 === 0 ? (
                <rect key={`${x}_${y}`} x={x} y={y} width="10" height="10" fill={secondary} opacity={0.6} />
              ) : null
            )
          )}
        </g>
      );
    case "plain":
    default:
      return null;
  }
}

export function Kit({ kit, size = 64, className }: Props) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      {/* shirt body */}
      <path d="M22 28 L34 18 L40 22 L60 22 L66 18 L78 28 L72 38 L66 34 L66 76 L34 76 L34 34 L28 38 Z" fill={kit.primaryColor} stroke="#0008" strokeWidth={1.5} />
      <PatternOverlay pattern={kit.pattern} secondary={kit.secondaryColor} />
      {/* shorts */}
      <rect x={36} y={76} width="28" height="16" fill={kit.shortsColor} stroke="#0008" strokeWidth={1.2} />
      {/* socks */}
      <rect x={36} y={92} width="10" height="6" fill={kit.socksColor} />
      <rect x={54} y={92} width="10" height="6" fill={kit.socksColor} />
      {/* sponsor */}
      <text x="50" y="55" textAnchor="middle" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight={700} fill="#fff">
        {kit.sponsorText}
      </text>
    </svg>
  );
}
