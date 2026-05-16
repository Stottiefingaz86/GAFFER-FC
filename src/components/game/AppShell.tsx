"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useGame } from "@/store/gameStore";
import { TeamCrest } from "@/components/game/TeamCrest";
import { PlayerPopoverHost } from "@/components/game/PlayerPopoverHost";
import { formatValue } from "@/lib/playerValue";
import { motion } from "framer-motion";

const NAV = [
  { href: "/dashboard", label: "Office" },
  { href: "/squad", label: "Squad" },
  { href: "/tactics", label: "Tactics" },
  { href: "/league", label: "League" },
  { href: "/cups", label: "Cups" },
  { href: "/scouting", label: "Scout" },
  { href: "/manager", label: "Career" },
  { href: "/inbox", label: "Inbox" },
];

export interface AppShellProps {
  children: React.ReactNode;
  /**
   * "Lock" the chrome — strips the header, navigation and footer so the
   * user can't navigate away. Used during a watched match so the user
   * commits to the result instead of clicking out and ending up with a
   * fixture that "didn't count". The popover host and load-state guard
   * still run; only the chrome is hidden.
   */
  locked?: boolean;
}

export function AppShell({ children, locked = false }: AppShellProps) {
  const career = useGame((s) => s.career);
  const userClub = useGame((s) => (s.db && s.career ? s.db.clubs[s.career.selectedClubId] : null));
  const unread = useGame((s) => s.db?.inbox.filter((m) => !m.read).length ?? 0);
  const loadFromStorage = useGame((s) => s.loadFromStorage);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (career) return;
    let cancelled = false;
    void loadFromStorage().then((ok) => {
      if (cancelled) return;
      if (!ok) router.replace("/");
    });
    return () => { cancelled = true; };
  }, [career, loadFromStorage, router]);

  // ===== Season-end gate =====
  // While `career.pendingSeasonReport` is set we funnel every nav click
  // back to /season/end. The user has to commit the rollover (the
  // "Start New Season" button) before they can poke around the rest of
  // the app — otherwise they'd see a half-finished world (week 1 with
  // last season's tables / fixtures still active). The exception list
  // covers the in-flight match flow so the user can still see the
  // result + roundup of the actual title-decider before being marched
  // to the celebration screen.
  useEffect(() => {
    if (!career?.pendingSeasonReport) return;
    if (!pathname) return;
    const ALLOW = [
      "/season/end",
      "/match",            // covers /match, /match/result, /match/roundup
    ];
    if (ALLOW.some((p) => pathname.startsWith(p))) return;
    router.replace("/season/end");
  }, [career, pathname, router]);

  if (!career || !userClub) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-[color:var(--muted)]">
        <div className="panel-bar px-6 py-3 text-sm">Loading career…</div>
      </div>
    );
  }

  if (locked) {
    // Locked mode: no header, no nav. The user is committed to the
    // current screen until it transitions itself out (e.g. the match
    // page pushes to /match/result on full time).
    return (
      <div className="min-h-dvh flex flex-col bg-[color:var(--ss-bg-deep)]">
        <main className="flex-1 mx-auto max-w-6xl w-full px-3 sm:px-4 py-4">
          {children}
        </main>
        <PlayerPopoverHost />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Top bar — solid navy with club identity */}
      <header className="sticky top-0 z-40 bg-[color:var(--ss-bg-deep)] border-b-2 border-[color:var(--ss-bar-edge)]">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 py-2.5 flex items-center gap-3 sm:gap-4">
          <Link href="/dashboard" className="flex items-center gap-3 group min-w-0">
            <div className="bg-[color:var(--ss-bg)] p-1 border-2 border-[color:var(--ss-bar-edge)] flex-shrink-0">
              <TeamCrest club={userClub} size={32} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--ss-cream)] scoreboard leading-tight">
                S{career.season} · WK {career.week}
              </div>
              <div className="font-bold leading-tight text-white text-sm sm:text-base uppercase tracking-[0.06em] truncate group-hover:text-[color:var(--ss-accent)] transition-colors">
                {userClub.name}
              </div>
            </div>
          </Link>
          <nav className="ml-auto md:ml-4 hidden md:flex">
            <div className="tabbar">
              {NAV.map((n) => {
                const active = pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href}
                    className={`tab ${active ? "active" : ""}`}>
                    {n.label}
                    {n.href === "/inbox" && unread > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 bg-[color:var(--ss-btn-exit)] text-white text-[10px] font-extrabold scoreboard flicker">
                        {unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="ml-auto md:ml-0 flex items-center gap-2 sm:gap-3">
            {/* Bank balance — always visible so the user never has to
             * dig for "how much can I spend?". On mobile we show a
             * compact pill; on desktop a labelled stack matches the
             * Manager block style next to it. Negative balances flash
             * red so an overdraft is impossible to miss. */}
            <BankPill budget={userClub.budget} />
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <div className="text-[9px] uppercase tracking-[0.22em] text-[color:var(--muted)]">Manager</div>
              <div className="scoreboard text-sm text-[color:var(--ss-accent)] uppercase">{career.managerName}</div>
            </div>
            <Link href="/" className="btn btn-action text-[11px] px-3 py-1.5">Menu</Link>
          </div>
        </div>
        {/* Mobile nav bar */}
        <nav className="md:hidden flex overflow-x-auto scrollbar-thin border-t border-[color:var(--ss-bg)]">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={`tab whitespace-nowrap flex-1 text-center ${active ? "active" : ""}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex-1 mx-auto max-w-6xl w-full px-3 sm:px-4 py-4"
      >
        {children}
      </motion.main>

      {/* Single host so any <PlayerLink /> in the app can open the
       * quick-stats popover without each page re-implementing it. */}
      <PlayerPopoverHost />
    </div>
  );
}

/**
 * Bank-balance pill shown in the persistent header. Doubles as a link
 * to the office (where the full finance breakdown lives) so the user
 * can drill in for context. Visually it matches the manager block so
 * the two pieces of meta read as a single right-hand cluster.
 */
function BankPill({ budget }: { budget: number }) {
  const overdrawn = budget < 0;
  return (
    <Link
      href="/dashboard"
      title="Transfer budget · click to open the Office for the full finance picture"
      className="flex flex-col items-end leading-tight px-2 sm:px-2.5 py-1 border border-[color:var(--ss-bar-edge)] bg-[color:var(--ss-bg)] hover:bg-[color:var(--ss-bg-2)] transition-colors"
      style={{
        // Subtle red wash when the user is in the red so it's
        // impossible to miss after an over-budget bid lands.
        background: overdrawn ? "rgba(232,58,58,0.18)" : undefined,
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.22em] text-[color:var(--muted)]">
        Bank
      </div>
      <div
        className={`scoreboard text-sm uppercase ${overdrawn ? "flicker" : ""}`}
        style={{
          color: overdrawn ? "var(--ss-btn-exit)" : "var(--ss-accent)",
        }}
      >
        {/* formatValue is positive-only; negative balances would emit
         * weird "£-5000000" strings, so we sign + format the absolute
         * value ourselves. */}
        {overdrawn ? `-${formatValue(-budget)}` : formatValue(budget)}
      </div>
    </Link>
  );
}
