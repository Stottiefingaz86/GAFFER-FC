"use client";

// =====================================================================
// <PlayerLink /> — wrap any inline label so clicking it opens the
// global player popover anchored to the clicked element. Drop-in around
// player names anywhere in the app:
//
//   <PlayerLink playerId={p.id}>{p.displayName}</PlayerLink>
//
// Renders as a button (with subtle hover styling) so it screen-reads as
// an action — feels like a link, behaves like a tooltip target.
// =====================================================================

import type { ReactNode } from "react";
import { useOpenPlayerPopover } from "@/store/popoverStore";

interface Props {
  playerId: string;
  children: ReactNode;
  className?: string;
  /** Optional title — falls back to "View player" so screen readers
   * still get a hint. */
  title?: string;
  /** Stop the click bubbling (handy when nested inside a clickable row). */
  stopPropagation?: boolean;
}

export function PlayerLink({
  playerId,
  children,
  className,
  title = "View player",
  stopPropagation = true,
}: Props) {
  const open = useOpenPlayerPopover();
  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        open(playerId, rect);
      }}
      title={title}
      className={
        "inline cursor-pointer underline-offset-2 hover:underline hover:text-[color:var(--ss-accent)] transition-colors text-left " +
        (className ?? "")
      }
      style={{ background: "transparent", padding: 0, border: 0, font: "inherit", color: "inherit" }}
    >
      {children}
    </button>
  );
}
