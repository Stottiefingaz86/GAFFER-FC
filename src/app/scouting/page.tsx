"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/game/AppShell";
import { Flag } from "@/components/game/Flag";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { PlayerProfile } from "@/components/game/PlayerProfile";
import { ContractModal } from "@/components/game/ContractModal";
import { TeamCrest } from "@/components/game/TeamCrest";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import type {
  Club,
  GameDatabase,
  Player,
  Position,
  Scout,
  ScoutFocusPos,
  ScoutReport,
} from "@/types/game";
import { motion, AnimatePresence } from "framer-motion";
import { formatValue } from "@/lib/playerValue";
import { FREE_AGENT_CLUB_ID } from "@/generators/playerGenerator";
import { NATIONS_BY_ID } from "@/data/nations";
import { nationalityLabel } from "@/data/nationalityFlags";

const FILTERS = ["All", "Wonderkids", "GK", "DEF", "MID", "FWD", "U17", "U19"] as const;
type FilterKey = typeof FILTERS[number];

const SORTS = ["Potential", "Overall", "Age", "Hype"] as const;
type SortKey = typeof SORTS[number];

type Tab = "watchlist" | "youth" | "scouts" | "recommendations";

export default function ScoutingPage() {
  return (
    <AppShell>
      <ScoutingInner />
    </AppShell>
  );
}

function ScoutingInner() {
  const db = useGame((s) => s.db);
  const career = useGame((s) => s.career);
  const userClub = useGame((s) => s.getUserClub)();
  // Subscribing to the array directly (not the action) so the page
  // re-renders when the watchlist changes — adding from anywhere in
  // the app, removing from this page, etc.
  const scoutedIds = useGame((s) => s.career?.scoutedPlayerIds);
  const unscoutPlayer = useGame((s) => s.unscoutPlayer);
  // Phase-2 scout staff + reports — subscribe directly so the page
  // refreshes the moment a scout is hired/fired or a weekly digest
  // lands.
  const scouts = useGame((s) => s.career?.scouts ?? []);
  const scoutMarket = useGame((s) => s.career?.scoutMarket ?? []);
  const scoutReports = useGame((s) => s.career?.scoutReports ?? []);
  const hireScout = useGame((s) => s.hireScout);
  const fireScout = useGame((s) => s.fireScout);
  const refreshScoutMarket = useGame((s) => s.refreshScoutMarket);
  const dismissScoutReport = useGame((s) => s.dismissScoutReport);
  const markScoutReportSeen = useGame((s) => s.markScoutReportSeen);

  // Default tab biases toward unread recommendations — the user only
  // notices the new scouting flow if it surfaces what the scouts have
  // produced immediately on entry.
  const unreadReports = scoutReports.filter((r) => !r.seen).length;
  const [tab, setTab] = useState<Tab>(unreadReports > 0 ? "recommendations" : "watchlist");
  const [filter, setFilter] = useState<FilterKey>("Wonderkids");
  const [sort, setSort] = useState<SortKey>("Potential");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // When the user clicks Sign on a free-agent profile we swap to the
  // contract negotiation modal — same player, different surface.
  const [signId, setSignId] = useState<string | null>(null);

  // Resolve the user's watchlist into actual player records. We exclude
  // the user's own players (those don't need a watchlist — they're
  // already in the squad) and free agents (those have their own tab).
  const watchlist: Player[] = useMemo(() => {
    if (!db || !career || !scoutedIds) return [];
    return scoutedIds
      .map((id) => db.players[id])
      .filter((p): p is Player => Boolean(p))
      .filter((p) => p.clubId !== career.selectedClubId)
      .filter((p) => p.clubId !== FREE_AGENT_CLUB_ID);
  }, [db, career, scoutedIds]);

  const youthPool: Player[] = useMemo(() => {
    if (!db) return [];
    return Object.values(db.players).filter((p) => p.clubId === FREE_AGENT_CLUB_ID);
  }, [db]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return youthPool
      .filter((p) => {
        switch (filter) {
          case "All": return true;
          case "Wonderkids": return p.potential >= 84;
          case "GK": case "DEF": case "MID": case "FWD":
            return p.position === filter as Position;
          case "U17": return p.age <= 16;
          case "U19": return p.age <= 18;
          default: return true;
        }
      })
      .filter((p) => {
        if (!q) return true;
        return (
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          p.displayName.toLowerCase().includes(q) ||
          p.nationality.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        switch (sort) {
          case "Potential": return b.potential - a.potential || b.overall - a.overall;
          case "Overall":   return b.overall - a.overall || b.potential - a.potential;
          case "Age":       return a.age - b.age || b.potential - a.potential;
          case "Hype":      return hype(b) - hype(a);
          default:          return 0;
        }
      });
  }, [youthPool, filter, sort, search]);

  const counts = useMemo(() => ({
    All: youthPool.length,
    Wonderkids: youthPool.filter((p) => p.potential >= 84).length,
    GK: youthPool.filter((p) => p.position === "GK").length,
    DEF: youthPool.filter((p) => p.position === "DEF").length,
    MID: youthPool.filter((p) => p.position === "MID").length,
    FWD: youthPool.filter((p) => p.position === "FWD").length,
    U17: youthPool.filter((p) => p.age <= 16).length,
    U19: youthPool.filter((p) => p.age <= 18).length,
  }) as Record<FilterKey, number>, [youthPool]);

  // The profile modal can be opened from either pool, so we resolve
  // against the full player registry rather than just the youth pool.
  const open = openId ? db?.players[openId] ?? null : null;

  const headlineWonderkid = useMemo(
    () => [...youthPool].sort((a, b) => b.potential - a.potential || b.overall - a.overall)[0],
    [youthPool],
  );

  return (
    <div className="space-y-3">
      {/* Top-level tab strip — Recommendations (scout-filed reports)
       * + Scouts (manage your staff) + Watchlist (saved scouts) +
       * Youth Pool (implicitly scouted free-agent regens). */}
      <div className="panel overflow-hidden">
        <div className="tabbar !rounded-none flex-wrap">
          <button
            onClick={() => setTab("recommendations")}
            className={`tab flex-1 ${tab === "recommendations" ? "active" : ""}`}
          >
            Reports
            <span
              className={`ml-1.5 text-[10px] ${
                unreadReports > 0
                  ? "text-[color:var(--ss-accent)] font-extrabold"
                  : "opacity-70"
              }`}
            >
              {scoutReports.length}
              {unreadReports > 0 ? ` · ${unreadReports} new` : ""}
            </span>
          </button>
          <button
            onClick={() => setTab("scouts")}
            className={`tab flex-1 ${tab === "scouts" ? "active" : ""}`}
          >
            Scouts
            <span className="ml-1.5 text-[10px] opacity-70">{scouts.length}</span>
          </button>
          <button
            onClick={() => setTab("watchlist")}
            className={`tab flex-1 ${tab === "watchlist" ? "active" : ""}`}
          >
            Watchlist
            <span className="ml-1.5 text-[10px] opacity-70">{watchlist.length}</span>
          </button>
          <button
            onClick={() => setTab("youth")}
            className={`tab flex-1 ${tab === "youth" ? "active" : ""}`}
          >
            Youth Pool
            <span className="ml-1.5 text-[10px] opacity-70">{youthPool.length}</span>
          </button>
        </div>
      </div>

      {tab === "recommendations" && (
        <RecommendationsPanel
          reports={scoutReports}
          scouts={scouts}
          db={db}
          onOpenPlayer={(id) => setOpenId(id)}
          onDismiss={dismissScoutReport}
          onMarkSeen={markScoutReportSeen}
          onSwitchToScouts={() => setTab("scouts")}
        />
      )}

      {tab === "scouts" && (
        <ScoutsPanel
          scouts={scouts}
          market={scoutMarket}
          budget={userClub?.budget ?? 0}
          onHire={(id) => {
            const scout = scoutMarket.find((s) => s.id === id);
            const result = hireScout(id);
            if (result.ok) {
              toast(
                scout
                  ? `${scout.name} hired · ${formatValue(scout.signingFee)} paid`
                  : "Scout hired",
                "success",
              );
            } else if (result.reason === "insufficient") {
              toast("Insufficient funds for this signing fee", "warn");
            } else {
              toast("Could not hire scout", "warn");
            }
          }}
          onFire={(id) => {
            const scout = scouts.find((s) => s.id === id);
            fireScout(id);
            toast(scout ? `${scout.name} released` : "Scout released", "info");
          }}
          onRefresh={() => {
            const result = refreshScoutMarket();
            if (result.ok) {
              toast(`Market refreshed · ${formatValue(result.cost)} paid`, "success");
            } else {
              toast(
                `Need ${formatValue(result.cost)} to refresh the market`,
                "warn",
              );
            }
          }}
        />
      )}

      {tab === "watchlist" && (
        <WatchlistPanel
          watchlist={watchlist}
          clubs={db?.clubs ?? {}}
          onOpen={(id) => setOpenId(id)}
          onRemove={(id) => unscoutPlayer(id)}
        />
      )}

      {tab === "youth" && (
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center gap-3">
          <span>Scouting · Youth Pool</span>
          <span className="ml-auto text-[10px] tracking-[0.2em] opacity-70">
            {youthPool.length} prospects worldwide
          </span>
        </div>

        {/* Headline wonderkid hero */}
        {headlineWonderkid && (
          <div
            className="team-hero p-3 sm:p-4 grid gap-2 sm:grid-cols-[1fr_auto] items-center"
            style={
              {
                "--team-1": userClub?.badge.primaryColor ?? "#5FB3E8",
                "--team-2": userClub?.badge.secondaryColor ?? "#FFD000",
              } as React.CSSProperties
            }
          >
            <div className="flex flex-col">
              <span className="text-[10px] tracking-[0.2em] uppercase text-[color:var(--ss-accent)] opacity-90">
                The next big thing
              </span>
              <button
                onClick={() => setOpenId(headlineWonderkid.id)}
                className="text-left hover:opacity-90 flex items-center gap-3"
              >
                <PlayerAvatar playerId={headlineWonderkid.id} width={48} />
                <span className="flex flex-col min-w-0">
                  <span className="scoreboard text-[22px] sm:text-[26px] text-white leading-none truncate">
                    {headlineWonderkid.firstName} {headlineWonderkid.lastName}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.16em] mt-1 text-white/85 flex items-center gap-1.5">
                    <Flag nationalityId={headlineWonderkid.nationality} width={18} />
                    <span>
                      {headlineWonderkid.age}y · {headlineWonderkid.detailedPosition} · POT {headlineWonderkid.potential}
                    </span>
                  </span>
                </span>
              </button>
            </div>
            <div className="flex gap-2 self-stretch sm:self-center">
              <BigStat label="POT" v={headlineWonderkid.potential} accent />
              <BigStat label="OVR" v={headlineWonderkid.overall} />
              <BigStat label="AGE" v={headlineWonderkid.age} />
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="px-2 sm:px-4 py-2 bg-[color:var(--ss-bg-deep)] border-t border-[color:var(--ss-bar-edge)]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or nationality…"
            className="w-full bg-[color:var(--ss-bg-2)] border border-[color:var(--ss-bar-edge)] text-white text-[12px] uppercase tracking-[0.12em] px-3 py-2 placeholder:opacity-50 focus:outline-none focus:border-[color:var(--ss-accent)]"
          />
        </div>

        {/* Filter chips */}
        <div className="bg-[color:var(--ss-bg-deep)] flex flex-wrap gap-0 border-t border-[color:var(--ss-bar-edge)]">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              disabled={counts[f] === 0 && f !== "All"}
              className={`tab ${filter === f ? "active" : ""}`}
              style={counts[f] === 0 && f !== "All" ? { opacity: 0.4 } : undefined}
            >
              {f}
              <span className="ml-1 text-[10px] opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>

        {/* Sort row */}
        <div className="bg-[color:var(--ss-bg-2)] flex border-t border-b border-[color:var(--ss-bar-edge)]">
          <span className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-cream)]">
            Sort
          </span>
          {SORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] font-bold ${
                sort === s
                  ? "bg-[color:var(--ss-accent)] text-black"
                  : "text-white hover:bg-[color:var(--ss-row-2)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Headers */}
        <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[40px_1fr_46px_46px_70px] sm:grid-cols-[44px_1fr_50px_50px_92px] text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--ss-cream)] border-t border-[color:var(--ss-bar-edge)]">
          <span className="px-2 py-1.5 text-center">POS</span>
          <span className="px-2 py-1.5">Player</span>
          <span className="px-1 py-1.5 text-center">AGE</span>
          <span className="px-1 py-1.5 text-center">OVR</span>
          <span className="px-2 py-1.5 text-right">POT · VAL</span>
        </div>

        {/* Player rows */}
        <div className="overflow-auto scrollbar-thin max-h-[60vh]">
          {filtered.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-10 text-center text-[color:var(--muted)] text-sm uppercase tracking-[0.14em]">
              No prospects match your filter.
            </div>
          ) : (
            filtered.map((p, i) => {
              const h = hype(p);
              return (
                <button
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className="w-full text-left grid grid-cols-[40px_1fr_46px_46px_70px] sm:grid-cols-[44px_1fr_50px_50px_92px] items-stretch text-white font-bold uppercase tracking-[0.04em] text-[12px] sm:text-[13px] is-clickable"
                  style={{
                    background:
                      h >= 4
                        ? "linear-gradient(90deg, color-mix(in srgb, var(--ss-accent) 28%, var(--ss-row)) 0%, var(--ss-row) 100%)"
                        : i % 2 === 0
                          ? "var(--ss-row)"
                          : "var(--ss-row-2)",
                  }}
                >
                  <span
                    className="px-1 py-2 text-center scoreboard text-[15px] flex items-center justify-center"
                    style={{ background: positionColor(p.detailedPosition), color: "#0A0A0A" }}
                  >
                    {p.detailedPosition}
                  </span>

                  <span className="pl-2 pr-3 py-2 flex items-center gap-2 min-w-0">
                    <PlayerAvatar playerId={p.id} width={26} />
                    <span className="flex flex-col justify-center min-w-0 flex-1">
                      <span className="truncate flex items-center gap-2">
                        <span>{p.firstName} {p.lastName}</span>
                        {p.potential >= 88 && (
                          <span className="bg-[color:var(--ss-accent)] text-black text-[9px] px-1 leading-tight">
                            ★ WONDERKID
                          </span>
                        )}
                        {h >= 5 && (
                          <span className="bg-red-500 text-white text-[9px] px-1 leading-tight">
                            HYPE
                          </span>
                        )}
                      </span>
                      <span className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1">
                        <Flag nationalityId={p.nationality} width={14} />
                        <span className="truncate">
                          {p.preferredFoot.charAt(0)} · {p.trait}
                          {p.transferInterest.length > 0 && (
                            <span className="ml-2 text-[color:var(--ss-warning)]">
                              · {p.transferInterest.length} CLUBS WATCHING
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                  </span>

                  <span className="px-1 py-2 text-center scoreboard text-[14px] flex items-center justify-center">
                    {p.age}
                  </span>

                  <span className="px-1 py-2 text-center scoreboard text-[14px] flex items-center justify-center" style={{ color: ratingColor(p.overall) }}>
                    {p.overall}
                  </span>

                  <span className="px-2 py-2 flex flex-col items-end justify-center ss-stat">
                    <span className="scoreboard text-[16px] leading-none" style={{ color: ratingColor(p.potential) }}>
                      {p.potential}
                    </span>
                    <span className="text-[9px] mt-0.5 text-white">{formatValue(p.value)}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* Educational info strip — shown for both tabs */}
      <div className="panel">
        <div className="panel-bar text-sm">How scouting works</div>
        <div className="p-3 sm:p-4 text-[12px] leading-relaxed text-white/85 grid sm:grid-cols-3 gap-3">
          <Tip title="Watchlist">
            Scout a player from any club page or popover and they&apos;ll land here. Their stats unlock and you can come back any time to make a bid.
          </Tip>
          <Tip title="Wonderkids">
            Players with potential 84+ are flagged as wonderkids. The very best (88+) get a ★ star. Find them young, sign them cheap.
          </Tip>
          <Tip title="Hype">
            HYPE means rivals are sniffing around the same player. Move fast or you&apos;ll lose them.
          </Tip>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/80 grid place-items-center px-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpenId(null)}
          >
            <motion.div
              className="panel max-w-2xl w-full max-h-[90vh] overflow-auto"
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <PlayerProfile
                player={open}
                clubs={db?.clubs ?? {}}
                season={career?.season ?? 1}
                primaryColor={userClub?.badge.primaryColor}
                secondaryColor={userClub?.badge.secondaryColor}
                onClose={() => setOpenId(null)}
                onSign={
                  open.clubId === FREE_AGENT_CLUB_ID
                    ? () => {
                        setSignId(open.id);
                        setOpenId(null);
                      }
                    : undefined
                }
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {signId && db?.players[signId] && (
        <ContractModal
          player={db.players[signId]}
          mode="sign"
          onClose={() => setSignId(null)}
        />
      )}
    </div>
  );
}

// Hype score: combines potential, transfer interest, and how young they are.
// Used both for sorting and for highlighting hot prospects in the row UI.
function hype(p: Player): number {
  let h = 0;
  if (p.potential >= 90) h += 3;
  else if (p.potential >= 86) h += 2;
  else if (p.potential >= 82) h += 1;
  if (p.age <= 16) h += 2;
  else if (p.age <= 18) h += 1;
  h += Math.min(2, p.transferInterest.length);
  return h;
}

function BigStat({ label, v, accent }: { label: string; v: number; accent?: boolean }) {
  return (
    <div
      className="px-3 py-2 min-w-[60px] text-center"
      style={{
        background: accent ? "var(--ss-accent)" : "rgba(0,0,0,0.35)",
        color: accent ? "#0A0A0A" : "#fff",
      }}
    >
      <div className="text-[9px] tracking-[0.18em] uppercase opacity-80">{label}</div>
      <div className="scoreboard text-[20px] leading-none">{v}</div>
    </div>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--ss-bg-2)] border-l-2 border-[color:var(--ss-accent)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-accent)] mb-1">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function positionColor(pos: string): string {
  if (pos === "GK") return "#FFD000";
  if (["CB", "LB", "RB"].includes(pos)) return "#5FB3E8";
  if (["DM", "CM", "AM", "LM", "RM"].includes(pos)) return "#9AF09A";
  return "#FF8585";
}

function ratingColor(overall: number): string {
  if (overall >= 85) return "#FFD000";
  if (overall >= 78) return "#FFE5A0";
  if (overall >= 70) return "#FFFFFF";
  if (overall >= 60) return "#D8D8D8";
  if (overall >= 50) return "#A2B0DC";
  return "#6F80B8";
}

// =====================================================================
// <WatchlistPanel /> — the user's saved scouts.
//
// Each row shows the player's identity and current club, the headline
// numbers (OVR / POT / VAL), how many other clubs are sniffing around,
// and three quick actions: VIEW (opens the profile modal), BID (jumps
// to the bid scene), REMOVE (drops them from the watchlist).
// =====================================================================

function WatchlistPanel({
  watchlist,
  clubs,
  onOpen,
  onRemove,
}: {
  watchlist: Player[];
  clubs: Record<string, Club>;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  // Sort by hottest target first — high potential, lots of interest,
  // young age. Identical scoring to the Youth Pool's "Hype" sort so
  // the rest of the app feels consistent.
  const sorted = useMemo(
    () =>
      [...watchlist].sort(
        (a, b) =>
          hype(b) - hype(a) ||
          b.potential - a.potential ||
          b.overall - a.overall,
      ),
    [watchlist],
  );

  if (sorted.length === 0) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center gap-3">
          <span>Watchlist</span>
          <span className="ml-auto text-[10px] tracking-[0.2em] opacity-70">
            0 scouted
          </span>
        </div>
        <div className="bg-[color:var(--ss-bg-2)] py-10 px-4 text-center">
          <div className="text-[color:var(--ss-accent)] scoreboard text-base mb-2">
            No scouts on file
          </div>
          <div className="text-[12px] text-white/80 max-w-md mx-auto leading-relaxed">
            Visit a club, click any player, and hit{" "}
            <span className="text-[color:var(--ss-accent)]">SCOUT</span> to
            unlock their stats. They&apos;ll appear here so you can come
            back and make a bid whenever you&apos;re ready.
          </div>
          <Link
            href="/league"
            className="btn btn-info inline-flex mt-4 text-xs px-4 py-2"
          >
            Browse League
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-bar text-base sm:text-lg flex items-center gap-3">
        <span>Watchlist</span>
        <span className="ml-auto text-[10px] tracking-[0.2em] opacity-70">
          {sorted.length} scouted
        </span>
      </div>

      {/* Headers — mirror the youth pool grid for visual consistency
       * but trade the POS column for a CLUB column since these players
       * are at real clubs, not free agents. */}
      <div className="bg-[color:var(--ss-bg-deep)] hidden sm:grid grid-cols-[40px_1fr_120px_46px_46px_70px_180px] text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--ss-cream)] border-t border-[color:var(--ss-bar-edge)]">
        <span className="px-2 py-1.5 text-center">POS</span>
        <span className="px-2 py-1.5">Player</span>
        <span className="px-2 py-1.5">Club</span>
        <span className="px-1 py-1.5 text-center">AGE</span>
        <span className="px-1 py-1.5 text-center">OVR</span>
        <span className="px-2 py-1.5 text-right">POT · VAL</span>
        <span className="px-2 py-1.5 text-center">Actions</span>
      </div>

      <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
        {sorted.map((p, i) => {
          const club = clubs[p.clubId];
          const interest = p.transferInterest.length;
          return (
            <li
              key={p.id}
              className="grid grid-cols-[40px_1fr_46px_70px] sm:grid-cols-[40px_1fr_120px_46px_46px_70px_180px] items-stretch text-white font-bold uppercase tracking-[0.04em] text-[12px] sm:text-[13px]"
              style={{
                background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
              }}
            >
              <span
                className="px-1 py-2 text-center scoreboard text-[14px] flex items-center justify-center"
                style={{
                  background: positionColor(p.detailedPosition),
                  color: "#0A0A0A",
                }}
              >
                {p.detailedPosition}
              </span>

              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="pl-2 pr-3 py-2 flex items-center gap-2 min-w-0 text-left is-clickable hover:opacity-90"
              >
                <PlayerAvatar playerId={p.id} width={26} />
                <span className="flex flex-col justify-center min-w-0 flex-1">
                  <span className="truncate flex items-center gap-2">
                    <span>{p.firstName} {p.lastName}</span>
                    {p.potential >= 88 && (
                      <span className="bg-[color:var(--ss-accent)] text-black text-[9px] px-1 leading-tight">
                        ★ WONDERKID
                      </span>
                    )}
                  </span>
                  <span className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1">
                    <Flag nationalityId={p.nationality} width={14} />
                    <span className="truncate">
                      {p.preferredFoot.charAt(0)} · {p.trait}
                      {interest > 0 && (
                        <span className="ml-2 text-[color:var(--ss-warning)]">
                          · {interest} CLUBS WATCHING
                        </span>
                      )}
                    </span>
                  </span>
                </span>
              </button>

              {/* Club cell — hidden on mobile to keep the row compact. */}
              {club ? (
                <Link
                  href={`/club/${club.id}`}
                  className="hidden sm:flex px-2 py-2 items-center gap-2 min-w-0 is-clickable hover:opacity-90"
                  title={`View ${club.name}`}
                >
                  <TeamCrest club={club} size={22} />
                  <span className="truncate text-[11px]">{club.shortName}</span>
                </Link>
              ) : (
                <span className="hidden sm:flex px-2 py-2 items-center text-[10px] opacity-60">
                  —
                </span>
              )}

              <span className="hidden sm:flex px-1 py-2 text-center scoreboard text-[14px] items-center justify-center">
                {p.age}
              </span>

              <span
                className="px-1 py-2 text-center scoreboard text-[14px] flex items-center justify-center"
                style={{ color: ratingColor(p.overall) }}
              >
                {p.overall}
              </span>

              <span className="px-2 py-2 flex flex-col items-end justify-center ss-stat">
                <span
                  className="scoreboard text-[16px] leading-none"
                  style={{ color: ratingColor(p.potential) }}
                >
                  {p.potential}
                </span>
                <span className="text-[9px] mt-0.5 text-white">
                  {formatValue(p.value)}
                </span>
              </span>

              {/* Actions — desktop gets a 3-button row, mobile users
               * tap the player name to open and use the modal CTAs. */}
              <span className="hidden sm:flex items-stretch border-l border-[color:var(--ss-bg-deep)]">
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="btn btn-action !rounded-none flex-1 text-[10px] px-2 border-0 border-r border-[color:var(--ss-bg-deep)]"
                >
                  View
                </button>
                <Link
                  href={`/bid/${p.id}`}
                  className="btn btn-stat !rounded-none flex-1 text-[10px] px-2 border-0 border-r border-[color:var(--ss-bg-deep)] flex items-center justify-center"
                >
                  £ Bid
                </Link>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="btn btn-exit !rounded-none flex-1 text-[10px] px-2 border-0"
                  title="Remove from watchlist"
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// =====================================================================
// <RecommendationsPanel /> — scout-filed reports.
//
// Every weekly tick can drop new reports here (one row per report).
// Each row shows the player snippet, the scout's estimated OVR + POT,
// confidence, and a quick way to jump to the full profile, lodge a
// bid, or dismiss the report.
// =====================================================================

function RecommendationsPanel({
  reports,
  scouts,
  db,
  onOpenPlayer,
  onDismiss,
  onMarkSeen,
  onSwitchToScouts,
}: {
  reports: ScoutReport[];
  scouts: Scout[];
  db: GameDatabase | null;
  onOpenPlayer: (id: string) => void;
  onDismiss: (id: string) => void;
  onMarkSeen: (id: string) => void;
  onSwitchToScouts: () => void;
}) {
  // Sort newest reports first so the user lands on what's fresh.
  const sorted = useMemo(
    () =>
      [...reports].sort(
        (a, b) => b.season - a.season || b.week - a.week,
      ),
    [reports],
  );

  if (sorted.length === 0) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center gap-3">
          <span>Scout Reports</span>
          <span className="ml-auto text-[10px] tracking-[0.2em] opacity-70">
            0 filed
          </span>
        </div>
        <div className="bg-[color:var(--ss-bg-2)] py-10 px-4 text-center">
          <div className="text-[color:var(--ss-accent)] scoreboard text-base mb-2">
            No reports filed yet
          </div>
          <div className="text-[12px] text-white/80 max-w-md mx-auto leading-relaxed">
            Hire scouts from the{" "}
            <button
              type="button"
              onClick={onSwitchToScouts}
              className="text-[color:var(--ss-accent)] underline hover:no-underline"
            >
              Scouts
            </button>{" "}
            tab and they&apos;ll start filing weekly briefings on
            players from around the world that match their brief.
          </div>
          <button
            type="button"
            onClick={onSwitchToScouts}
            className="btn btn-info inline-flex mt-4 text-xs px-4 py-2"
          >
            Hire Scouts
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="panel-bar text-base sm:text-lg flex items-center gap-3">
        <span>Scout Reports</span>
        <span className="ml-auto text-[10px] tracking-[0.2em] opacity-70">
          {sorted.length} filed
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
        {sorted.map((r, i) => {
          const player = db?.players[r.playerId];
          const scout = scouts.find((s) => s.id === r.scoutId);
          if (!player) {
            // The report still exists but the player has retired or
            // moved out of the DB — surface a tombstone so the user
            // can dismiss without crashing on a missing record.
            return (
              <li
                key={r.id}
                className="px-3 py-2 text-[12px] text-[color:var(--muted)] flex items-center justify-between"
                style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
              >
                <span>Report on unknown player · W{r.week}</span>
                <button
                  type="button"
                  onClick={() => onDismiss(r.id)}
                  className="btn btn-exit !rounded-none text-[10px] px-2 py-1"
                >
                  ✕
                </button>
              </li>
            );
          }
          const club = db?.clubs[player.clubId];
          return (
            <li
              key={r.id}
              className="grid grid-cols-[44px_1fr_56px_56px_70px] sm:grid-cols-[44px_1fr_140px_56px_56px_70px_200px] items-stretch text-white text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em]"
              style={{
                background: r.seen
                  ? i % 2 === 0
                    ? "var(--ss-row)"
                    : "var(--ss-row-2)"
                  : "linear-gradient(90deg, color-mix(in srgb, var(--ss-accent) 24%, var(--ss-row)) 0%, var(--ss-row) 100%)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (!r.seen) onMarkSeen(r.id);
                  onOpenPlayer(player.id);
                }}
                className="px-1 py-2 flex items-center justify-center is-clickable"
              >
                <PlayerAvatar playerId={player.id} width={32} />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!r.seen) onMarkSeen(r.id);
                  onOpenPlayer(player.id);
                }}
                className="pl-1 pr-3 py-2 flex flex-col justify-center min-w-0 text-left is-clickable hover:opacity-90"
              >
                <span className="truncate flex items-center gap-2">
                  {!r.seen && (
                    <span className="size-2 rounded-full bg-[color:var(--ss-accent)] animate-pulse" />
                  )}
                  <span>{player.firstName} {player.lastName}</span>
                  <span
                    className="text-[9px] px-1 py-0.5 leading-tight"
                    style={{ background: "var(--ss-bg-deep)", color: "var(--ss-accent)" }}
                  >
                    {r.summary.toUpperCase()}
                  </span>
                </span>
                <span className="text-[9px] tracking-[0.16em] opacity-80 truncate flex items-center gap-1 mt-0.5">
                  <Flag nationalityId={player.nationality} width={14} />
                  <span className="truncate">
                    {player.age}Y · {player.detailedPosition}
                    {scout ? ` · scout ${scout.name}` : ""}
                  </span>
                </span>
              </button>

              {club ? (
                <Link
                  href={`/club/${club.id}`}
                  className="hidden sm:flex px-2 py-2 items-center gap-2 min-w-0 is-clickable hover:opacity-90"
                  title={`View ${club.name}`}
                >
                  <TeamCrest club={club} size={22} />
                  <span className="truncate text-[11px]">{club.shortName}</span>
                </Link>
              ) : (
                <span className="hidden sm:flex px-2 py-2 items-center text-[10px] opacity-60">
                  Free agent
                </span>
              )}

              <span
                className="px-1 py-2 text-center scoreboard text-[14px] flex flex-col items-center justify-center leading-tight"
                title={`Estimated overall · ${r.confidence}% confidence`}
              >
                <span className="text-[8px] uppercase tracking-[0.18em] opacity-70">EST OVR</span>
                <span style={{ color: ratingColor(r.estOverall) }}>{r.estOverall}</span>
              </span>

              <span
                className="px-1 py-2 text-center scoreboard text-[14px] flex flex-col items-center justify-center leading-tight"
                title={`Estimated potential · ${r.confidence}% confidence`}
              >
                <span className="text-[8px] uppercase tracking-[0.18em] opacity-70">EST POT</span>
                <span style={{ color: ratingColor(r.estPotential) }}>{r.estPotential}</span>
              </span>

              <span className="px-2 py-2 flex flex-col items-end justify-center ss-stat">
                <span className="text-[9px] opacity-80">CONF</span>
                <span className="scoreboard text-[13px] leading-none">
                  {r.confidence}%
                </span>
              </span>

              <span className="hidden sm:flex items-stretch border-l border-[color:var(--ss-bg-deep)]">
                <button
                  type="button"
                  onClick={() => {
                    if (!r.seen) onMarkSeen(r.id);
                    onOpenPlayer(player.id);
                  }}
                  className="btn btn-action !rounded-none flex-1 text-[10px] px-2 border-0 border-r border-[color:var(--ss-bg-deep)]"
                >
                  View
                </button>
                <Link
                  href={`/bid/${player.id}`}
                  className="btn btn-stat !rounded-none flex-1 text-[10px] px-2 border-0 border-r border-[color:var(--ss-bg-deep)] flex items-center justify-center"
                  onClick={() => {
                    if (!r.seen) onMarkSeen(r.id);
                  }}
                >
                  £ Bid
                </Link>
                <button
                  type="button"
                  onClick={() => onDismiss(r.id)}
                  className="btn btn-exit !rounded-none flex-1 text-[10px] px-2 border-0"
                  title="Drop this report"
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// =====================================================================
// <ScoutsPanel /> — manage hired scouts + browse the open market.
// =====================================================================

const POS_LABEL: Record<ScoutFocusPos, string> = {
  any: "Any position",
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

function regionLabel(focusNationId: string): string {
  if (focusNationId === "global") return "Global";
  return NATIONS_BY_ID[focusNationId]?.name ?? nationalityLabel(focusNationId);
}

function tierStars(tier: Scout["tier"]): string {
  return "★".repeat(tier) + "☆".repeat(5 - tier);
}

function tierColor(tier: Scout["tier"]): string {
  if (tier >= 5) return "#FFD000";
  if (tier === 4) return "#FFE5A0";
  if (tier === 3) return "#9AF09A";
  if (tier === 2) return "#A2B0DC";
  return "#FFFFFF";
}

function ScoutsPanel({
  scouts,
  market,
  budget,
  onHire,
  onFire,
  onRefresh,
}: {
  scouts: Scout[];
  market: Scout[];
  budget: number;
  onHire: (id: string) => void;
  onFire: (id: string) => void;
  onRefresh: () => void;
}) {
  const totalWages = scouts.reduce((sum, s) => sum + s.wage, 0);
  const sortedMarket = useMemo(
    () => [...market].sort((a, b) => b.tier - a.tier || b.judging - a.judging),
    [market],
  );

  return (
    <div className="space-y-3">
      {/* ── Summary strip ─────────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm flex items-center gap-3">
          <span>Scouting Network</span>
          <span className="ml-auto text-[10px] tracking-[0.2em] opacity-70">
            {scouts.length} on staff · {formatValue(totalWages)}/w
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 text-[11px]">
          <NetCell k="Scouts" v={String(scouts.length)} />
          <NetCell k="Weekly Wages" v={formatValue(totalWages)} alt />
          <NetCell k="Tier Avg" v={
            scouts.length === 0
              ? "—"
              : (scouts.reduce((a, s) => a + s.tier, 0) / scouts.length).toFixed(1)
          } />
          <NetCell k="Budget" v={formatValue(budget)} alt />
        </div>
      </div>

      {/* ── Hired scouts list ────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm">Your Scouts</div>
        {scouts.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-8 px-4 text-center">
            <div className="text-[color:var(--ss-accent)] scoreboard text-base mb-2">
              No scouts on staff
            </div>
            <div className="text-[12px] text-white/80 max-w-md mx-auto leading-relaxed">
              Hire scouts from the market below — they&apos;ll work the
              transfer pool every week and surface players that match
              their region + position brief.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {scouts.map((s, i) => (
              <ScoutRow
                key={s.id}
                scout={s}
                idx={i}
                budget={budget}
                hired
                onFire={() => onFire(s.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Open market ─────────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm flex items-center gap-3">
          <span>Scout Market</span>
          <button
            type="button"
            onClick={onRefresh}
            className="ml-auto btn btn-info !rounded-none text-[10px] px-3 py-1"
            title="Roll a fresh roster of available scouts · £5,000"
          >
            ↻ Refresh · £5,000
          </button>
        </div>
        {sortedMarket.length === 0 ? (
          <div className="bg-[color:var(--ss-bg-2)] py-8 text-center text-[12px] text-[color:var(--muted)]">
            The market is empty. Refresh to roll a fresh roster.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {sortedMarket.map((s, i) => (
              <ScoutRow
                key={s.id}
                scout={s}
                idx={i}
                budget={budget}
                onHire={() => onHire(s.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <div className="panel-bar text-sm">How scouts work</div>
        <div className="p-3 sm:p-4 text-[12px] leading-relaxed text-white/85 grid sm:grid-cols-3 gap-3">
          <Tip title="Hire">
            One-off signing fee + weekly wage. Wages are debited every
            week alongside player wages.
          </Tip>
          <Tip title="Region & Position">
            A scout only files reports on players inside their brief.
            Tier-4 and tier-5 scouts often go global; tier-1s stay
            local.
          </Tip>
          <Tip title="Judging">
            Higher-tier scouts return tighter estimates of overall and
            potential. The real numbers unlock on the player profile —
            the estimate is what they bring back from the field.
          </Tip>
        </div>
      </div>
    </div>
  );
}

function NetCell({ k, v, alt }: { k: string; v: string; alt?: boolean }) {
  return (
    <div
      className="px-3 py-2 text-[10px] uppercase tracking-[0.16em]"
      style={{ background: alt ? "var(--ss-row-2)" : "var(--ss-row)" }}
    >
      <div className="text-[color:var(--muted)]">{k}</div>
      <div className="scoreboard text-[16px] text-white">{v}</div>
    </div>
  );
}

function ScoutRow({
  scout,
  idx,
  budget,
  hired,
  onHire,
  onFire,
}: {
  scout: Scout;
  idx: number;
  budget: number;
  hired?: boolean;
  onHire?: () => void;
  onFire?: () => void;
}) {
  const canAfford = budget >= scout.signingFee;
  return (
    <li
      className="grid grid-cols-[1fr_auto] sm:grid-cols-[44px_1fr_140px_120px_140px_120px] items-stretch text-white text-[12px] sm:text-[13px] font-bold uppercase tracking-[0.04em]"
      style={{
        background: idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
      }}
    >
      <span
        className="hidden sm:flex px-2 py-2 items-center justify-center"
        title={`Tier ${scout.tier}`}
      >
        <Flag nationalityId={scout.nationality} width={28} />
      </span>

      <span className="px-3 py-2 flex flex-col justify-center min-w-0">
        <span className="truncate flex items-center gap-2">
          <span>{scout.name}</span>
          <span
            className="text-[10px] tracking-[0.16em]"
            style={{ color: tierColor(scout.tier) }}
          >
            {tierStars(scout.tier)}
          </span>
        </span>
        <span className="text-[9px] tracking-[0.16em] opacity-80 truncate">
          Judging {scout.judging} · Potential judge {scout.potentialJudging}
        </span>
      </span>

      <span className="hidden sm:flex px-2 py-2 flex-col justify-center text-[10px] tracking-[0.14em]">
        <span className="opacity-70 text-[9px]">REGION</span>
        <span className="truncate">{regionLabel(scout.focusNationId)}</span>
      </span>

      <span className="hidden sm:flex px-2 py-2 flex-col justify-center text-[10px] tracking-[0.14em]">
        <span className="opacity-70 text-[9px]">FOCUS</span>
        <span className="truncate">{POS_LABEL[scout.focusPosition]}</span>
      </span>

      <span className="hidden sm:flex px-2 py-2 flex-col items-end justify-center text-[10px] tracking-[0.14em] ss-stat">
        <span className="opacity-70 text-[9px]">
          {hired ? "WAGE" : "FEE · WAGE"}
        </span>
        {hired ? (
          <span className="scoreboard text-[13px] text-[color:var(--ss-accent)]">
            {formatValue(scout.wage)}/w
          </span>
        ) : (
          <>
            <span className="scoreboard text-[13px] text-[color:var(--ss-accent)]">
              {formatValue(scout.signingFee)}
            </span>
            <span className="scoreboard text-[10px] opacity-90">
              + {formatValue(scout.wage)}/w
            </span>
          </>
        )}
      </span>

      <span className="flex items-stretch border-l border-[color:var(--ss-bg-deep)]">
        {hired ? (
          <button
            type="button"
            onClick={onFire}
            className="btn btn-exit !rounded-none flex-1 text-[10px] px-3"
            title="Release this scout — they leave immediately"
          >
            ✕ Release
          </button>
        ) : (
          <button
            type="button"
            onClick={canAfford ? onHire : undefined}
            disabled={!canAfford}
            className="btn btn-stat !rounded-none flex-1 text-[10px] px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              canAfford
                ? `Pay ${formatValue(scout.signingFee)} signing fee`
                : `Insufficient budget — need ${formatValue(scout.signingFee)}`
            }
          >
            ▸ Hire · {formatValue(scout.signingFee)}
          </button>
        )}
      </span>
    </li>
  );
}
