"use client";

import type { Badge as BadgeType, BadgeIcon } from "@/types/game";

interface Props {
  badge: BadgeType;
  size?: number;
  className?: string;
}

// Each icon is a chunky retro silhouette designed to be readable at small sizes.
function IconShape({ icon, color }: { icon: BadgeIcon; color: string }) {
  switch (icon) {
    case "lion":
      return <path d="M50 30 c-12 0 -16 9 -16 18 c0 8 -4 12 -8 14 v6 h6 v8 h6 v-6 c4 0 6 -2 6 -6 c4 4 12 4 16 0 c0 4 2 6 6 6 v6 h6 v-8 h6 v-6 c-4 -2 -8 -6 -8 -14 c0 -9 -4 -18 -16 -18 z" fill={color} />;
    case "anchor":
      return <g fill={color}><circle cx="50" cy="32" r="6" /><rect x="47" y="34" width="6" height="32" /><rect x="38" y="40" width="24" height="4" /><path d="M30 60 q20 16 40 0 v6 q-20 18 -40 0 z" /></g>;
    case "tower":
      return <g fill={color}><rect x="38" y="34" width="24" height="36" /><rect x="36" y="30" width="6" height="6" /><rect x="46" y="30" width="6" height="6" /><rect x="56" y="30" width="6" height="6" /><rect x="46" y="50" width="8" height="20" /></g>;
    case "star":
      return <path d="M50 28 l6 14 l16 1 l-12 10 l4 16 l-14 -8 l-14 8 l4 -16 l-12 -10 l16 -1 z" fill={color} />;
    case "wave":
      return <g fill={color}><path d="M22 50 q8 -12 18 0 t18 0 t18 0 q-8 12 -18 0 t-18 0 t-18 0 z" /><path d="M22 64 q8 -12 18 0 t18 0 t18 0 q-8 12 -18 0 t-18 0 t-18 0 z" /></g>;
    case "crown":
      return <g fill={color}><path d="M28 40 l8 14 l8 -16 l6 18 l6 -18 l8 16 l8 -14 v22 h-44 z" /><rect x="28" y="64" width="44" height="6" /></g>;
    case "eagle":
      return <g fill={color}><path d="M50 30 l-22 16 l8 0 l-12 14 l16 -2 l-6 12 l16 -8 l16 8 l-6 -12 l16 2 l-12 -14 l8 0 z" /></g>;
    case "wheel":
      return <g fill={color}><circle cx="50" cy="50" r="22" /><circle cx="50" cy="50" r="14" fill="white" /><circle cx="50" cy="50" r="4" /><rect x="48" y="28" width="4" height="44" /><rect x="28" y="48" width="44" height="4" /><rect x="34" y="34" width="4" height="32" transform="rotate(45 50 50)" /><rect x="34" y="34" width="4" height="32" transform="rotate(-45 50 50)" /></g>;
    case "dragon":
      return <g fill={color}><path d="M22 64 q12 -22 28 -10 q4 -16 22 -10 q-6 16 -22 18 q-10 14 -28 2 z" /><circle cx="68" cy="46" r="2" fill="white"/></g>;
    case "horse":
      return <g fill={color}><path d="M40 30 l4 10 l16 -2 l-2 12 l8 4 l-4 18 h-6 l-2 -10 h-12 l-2 10 h-6 l-2 -22 q-6 -2 -6 -10 q0 -10 14 -10 z" /></g>;
    case "castle":
      return <g fill={color}><rect x="32" y="44" width="36" height="26" /><rect x="30" y="38" width="6" height="8" /><rect x="40" y="38" width="6" height="8" /><rect x="50" y="38" width="6" height="8" /><rect x="60" y="38" width="6" height="8" /><rect x="64" y="38" width="6" height="8" /><rect x="46" y="54" width="8" height="16" fill="white" /></g>;
    case "flame":
      return <path d="M50 26 q6 12 -2 16 q10 4 8 16 q4 -2 4 -8 q6 8 0 18 q-2 4 -8 4 q-12 0 -12 -10 q0 -8 4 -10 q-4 -2 -2 -8 q4 -2 8 -18 z" fill={color} />;
    case "bridge":
      return <g fill={color}><path d="M22 56 q14 -22 28 -22 t28 22 v8 h-56 z" /><rect x="22" y="56" width="56" height="4" fill="white" /></g>;
    case "rose":
      return <g fill={color}><circle cx="50" cy="48" r="10" /><circle cx="42" cy="42" r="6" /><circle cx="58" cy="42" r="6" /><circle cx="42" cy="56" r="6" /><circle cx="58" cy="56" r="6" /><circle cx="50" cy="48" r="3" fill="white" /></g>;
    case "mountain":
      return <g fill={color}><path d="M22 70 l14 -22 l8 12 l10 -22 l14 18 l10 14 z" /><path d="M44 60 l6 -8 l4 6 z" fill="white" /></g>;
    case "sun":
      return <g fill={color}><circle cx="50" cy="50" r="12" /><g><rect x="48" y="24" width="4" height="10" /><rect x="48" y="66" width="4" height="10" /><rect x="24" y="48" width="10" height="4" /><rect x="66" y="48" width="10" height="4" /><rect x="32" y="32" width="10" height="4" transform="rotate(-45 36 34)" /><rect x="58" y="32" width="10" height="4" transform="rotate(45 64 34)" /></g></g>;
    case "bolt":
      return <path d="M54 24 l-22 30 h12 l-6 22 l22 -30 h-12 z" fill={color} />;
    case "stag":
      return <g fill={color}><path d="M50 36 l-12 -10 l4 12 l-10 -2 l8 8 l-12 -2 l16 12 l-2 16 h6 l4 -12 l4 12 h6 l-2 -16 l16 -12 l-12 2 l8 -8 l-10 2 l4 -12 z" /></g>;
    case "falcon":
      return <g fill={color}><path d="M22 56 l28 -10 l8 -12 l4 12 l16 10 l-12 4 l4 12 l-16 -10 l-12 4 l-2 -8 z" /></g>;
    case "hammer":
      return <g fill={color}><rect x="46" y="32" width="8" height="22" transform="rotate(-30 50 42)" /><rect x="34" y="22" width="22" height="14" transform="rotate(-30 45 28)" /><rect x="48" y="48" width="4" height="22" /></g>;
    case "tree":
      return <g fill={color}><circle cx="50" cy="42" r="16" /><circle cx="40" cy="50" r="12" /><circle cx="60" cy="50" r="12" /><rect x="46" y="58" width="8" height="14" /></g>;
    case "river":
      return <g fill={color}><path d="M28 32 q14 12 0 24 q14 12 0 24 q14 12 0 24 h44 q14 -12 0 -24 q14 -12 0 -24 q14 -12 0 -24 z" /></g>;
    case "sword":
      return <g fill={color}><rect x="48" y="22" width="4" height="40" /><rect x="40" y="58" width="20" height="4" /><rect x="48" y="62" width="4" height="14" /></g>;
    default:
      return <circle cx="50" cy="50" r="14" fill={color} />;
  }
}

function ShapePath({
  shape,
  fill,
  stroke,
}: {
  shape: BadgeType["shape"];
  fill: string;
  stroke: string;
}) {
  switch (shape) {
    case "shield":
      return <path d="M50 6 L94 16 L94 50 Q94 78 50 96 Q6 78 6 50 L6 16 Z" fill={fill} stroke={stroke} strokeWidth={2.5} />;
    case "circle":
      return <circle cx="50" cy="50" r="44" fill={fill} stroke={stroke} strokeWidth={2.5} />;
    case "diamond":
      return <path d="M50 4 L96 50 L50 96 L4 50 Z" fill={fill} stroke={stroke} strokeWidth={2.5} />;
    case "crest":
      return <path d="M14 12 H86 L88 38 Q88 76 50 96 Q12 76 12 38 Z" fill={fill} stroke={stroke} strokeWidth={2.5} />;
    case "oval":
      return <ellipse cx="50" cy="50" rx="44" ry="46" fill={fill} stroke={stroke} strokeWidth={2.5} />;
    default:
      return <rect x="6" y="6" width="88" height="88" fill={fill} stroke={stroke} strokeWidth={2.5} />;
  }
}

function PatternOverlay({
  pattern,
  secondary,
}: {
  pattern: BadgeType["pattern"];
  secondary: string;
}) {
  switch (pattern) {
    case "stripes":
      return (
        <g>
          <rect x="20" y="0" width="10" height="100" fill={secondary} opacity={0.45} />
          <rect x="55" y="0" width="10" height="100" fill={secondary} opacity={0.45} />
        </g>
      );
    case "hoops":
      return (
        <g>
          <rect x="0" y="22" width="100" height="10" fill={secondary} opacity={0.45} />
          <rect x="0" y="60" width="100" height="10" fill={secondary} opacity={0.45} />
        </g>
      );
    case "diagonal":
      return (
        <g>
          <path d="M0 60 L60 0 L100 0 L0 100 Z" fill={secondary} opacity={0.45} />
        </g>
      );
    case "halves":
      return <rect x="50" y="0" width="50" height="100" fill={secondary} opacity={0.55} />;
    case "quarters":
      return (
        <g>
          <rect x="50" y="0" width="50" height="50" fill={secondary} opacity={0.55} />
          <rect x="0" y="50" width="50" height="50" fill={secondary} opacity={0.55} />
        </g>
      );
    case "chevron":
      return <path d="M0 30 L50 70 L100 30 L100 50 L50 90 L0 50 Z" fill={secondary} opacity={0.45} />;
    case "plain":
    default:
      return null;
  }
}

export function Badge({ badge, size = 64, className }: Props) {
  if (badge.customImageDataUrl) {
    return (
      // Custom user-uploaded badges are stored as data URLs and intentionally
      // bypass next/image (which won't accept arbitrary data URLs).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={badge.customImageDataUrl}
        alt="Custom badge"
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  const id = badge.initials.replace(/\s/g, "_");

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <clipPath id={`clip_${id}`}>
          <ShapePath
            shape={badge.shape}
            fill="white"
            stroke="white"
          />
        </clipPath>
      </defs>
      <ShapePath shape={badge.shape} fill={badge.primaryColor} stroke={badge.accentColor} />
      <g clipPath={`url(#clip_${id})`}>
        <PatternOverlay
          pattern={badge.pattern}
          secondary={badge.secondaryColor}
        />
        <IconShape icon={badge.icon} color={badge.secondaryColor} />
      </g>
      <text
        x="50"
        y="92"
        textAnchor="middle"
        fontSize="11"
        fontFamily="ui-monospace, monospace"
        fontWeight={700}
        fill={badge.accentColor}
      >
        {badge.initials}
      </text>
    </svg>
  );
}
