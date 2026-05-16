"use client";

import type { ReactNode } from "react";

/**
 * Tooltip — wraps any element and shows a hover tooltip above it.
 * Powered by CSS in globals.css (.tt-wrap / .tt). Animated, accessible
 * (focus-within), and respects prefers-reduced-motion.
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`tt-wrap ${className ?? ""}`}>
      {children}
      <span className="tt" role="tooltip">{label}</span>
    </span>
  );
}
