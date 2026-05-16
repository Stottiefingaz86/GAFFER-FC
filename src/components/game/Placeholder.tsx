"use client";

import Link from "next/link";

export function Placeholder({
  title, subtitle, items,
}: {
  title: string;
  subtitle: string;
  items: { label: string; description: string }[];
}) {
  return (
    <div className="space-y-4">
      <h1 className="h-display text-3xl font-black">{title}</h1>
      <div className="panel p-6">
        <p className="text-sm text-[color:var(--muted)] max-w-2xl">{subtitle}</p>
        <div className="grid gap-2 sm:grid-cols-2 mt-5">
          {items.map((it, i) => (
            <div key={i} className="panel-flat p-3">
              <div className="font-bold">{it.label}</div>
              <div className="text-xs text-[color:var(--muted)]">{it.description}</div>
            </div>
          ))}
        </div>
        <Link href="/dashboard" className="btn btn-primary mt-6 inline-flex">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
