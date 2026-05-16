"use client";

// =====================================================================
// <ClubLink /> — wrap any team label so clicking it routes to the
// club detail page (`/club/[clubId]`). Drop-in around team names,
// crests, opponent strips, etc.:
//
//   <ClubLink clubId={c.id}>{c.name}</ClubLink>
//
// Uses Next's <Link> under the hood so prefetch + client-side nav still
// work. Adds a tiny hover affordance so users know it's interactive.
// =====================================================================

import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  clubId: string;
  children: ReactNode;
  className?: string;
  title?: string;
  /** Stop the click bubbling (handy when nested inside another link). */
  stopPropagation?: boolean;
}

export function ClubLink({
  clubId,
  children,
  className,
  title = "View club",
  stopPropagation = true,
}: Props) {
  return (
    <Link
      href={`/club/${clubId}`}
      title={title}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
      }}
      className={
        "cursor-pointer underline-offset-2 hover:underline hover:text-[color:var(--ss-accent)] transition-colors " +
        (className ?? "")
      }
      style={{ color: "inherit" }}
    >
      {children}
    </Link>
  );
}
