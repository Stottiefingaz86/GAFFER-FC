"use client";

import { useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { Kit } from "@/components/game/Kit";
import { Flag } from "@/components/game/Flag";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { PlayerProfile } from "@/components/game/PlayerProfile";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { DIVISION_NAMES } from "@/data/competitionSeeds";
import { readableOn } from "@/lib/color";
import { formatValue, formatWage } from "@/lib/playerValue";
import { competitionLabel } from "@/engine/historyEngine";
import { nationalityLabel } from "@/data/nationalityFlags";
import type { Club, Player, Position, Trophy } from "@/types/game";

// =====================================================================
// Club detail page — shown when the user clicks on any other club from
// the league table, fixtures, or anywhere else in the game. Lets the
// user inspect the squad, recent results, upcoming fixtures and (Phase
// 2) lodge a transfer bid or scout the club.
// =====================================================================

type Tab = "squad" | "fixtures" | "honours" | "info";
type GroupKey = "GK" | "DEF" | "MID" | "FWD";

const POS_GROUP: Record<Position, GroupKey> = {
  GK: "GK",
  DEF: "DEF",
  MID: "MID",
  FWD: "FWD",
};

const GROUP_LABEL: Record<GroupKey, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

export default function ClubViewPage({ params }: { params: Promise<{ clubId: string }> }) {
  // Next 15 turns route params into a Promise. `use()` unwraps it inside
  // a client component without breaking the server contract.
  const { clubId } = use(params);
  return (
    <AppShell>
      <ClubViewInner clubId={clubId} />
    </AppShell>
  );
}

function ClubViewInner({ clubId }: { clubId: string }) {
  const db = useGame((s) => s.db)!;
  const userClub = useGame((s) => s.getUserClub)();
  const career = useGame((s) => s.career)!;
  // Subscribe to the scouted-id list so rows re-render on scout. We
  // turn it into a Set inside a memo because squad rows ask "is this
  // player scouted?" once each on every render.
  const scoutedIds = useGame((s) => s.career?.scoutedPlayerIds);
  const scoutedSet = useMemo(() => new Set(scoutedIds ?? []), [scoutedIds]);
  const scoutPlayer = useGame((s) => s.scoutPlayer);
  const scoutClub = useGame((s) => s.scoutClub);
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("squad");
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);

  // All hooks must run unconditionally — the "not found" branch happens
  // *after* every hook below has been called.
  const squad = useMemo<Player[]>(
    () => Object.values(db.players).filter((p) => p.clubId === clubId),
    [db.players, clubId],
  );

  const allFixtures = useMemo(
    () =>
      db.fixtures
        .filter((f) => f.homeId === clubId || f.awayId === clubId)
        .sort((a, b) => a.week - b.week),
    [db.fixtures, clubId],
  );

  // Players this club is interested in from OUR squad — so the user
  // sees "Royal Albion want your striker".
  const wantsFromUs: Player[] = useMemo(() => {
    if (!userClub || userClub.id === clubId) return [];
    return Object.values(db.players)
      .filter((p) => p.clubId === userClub.id)
      .filter((p) => (p.transferInterest ?? []).some((t) => t.clubId === clubId))
      .sort((a, b) => b.overall - a.overall);
  }, [db.players, userClub, clubId]);

  // Players from THIS club who'd be open to a move (any transfer interest
  // exists from anywhere — the simplest "available" proxy in MVP).
  const openToMove = useMemo(
    () => squad.filter((p) => (p.transferInterest ?? []).length > 0).sort((a, b) => b.overall - a.overall),
    [squad],
  );

  const club = db.clubs[clubId];

  if (!club) {
    return (
      <div className="panel p-6 text-center">
        <div className="panel-bar mb-3">CLUB NOT FOUND</div>
        <p className="text-sm text-[color:var(--muted)]">
          That club ID isn&apos;t in the database. The save might have been reset.
        </p>
        <Link href="/league" className="btn btn-action mt-3 inline-block">
          Back to League
        </Link>
      </div>
    );
  }

  const isOwnClub = userClub?.id === club.id;
  // For an "Is this player visible?" check that's cheap inside the row
  // map. We resolve the user's own players and free agents up front,
  // and the scouted-id Set covers everyone else.
  const isPlayerVisible = (p: Player): boolean => {
    if (isOwnClub) return true;
    if (!userClub) return false;
    if (p.clubId === userClub.id) return true;
    return scoutedSet.has(p.id);
  };
  // How much of this club's squad have we scouted? Drives the
  // "Scout this club" CTA labelling.
  const squadScouted = squad.filter(isPlayerVisible).length;
  const allSquadScouted = squadScouted === squad.length;
  const division = Object.values(DIVISION_NAMES).find((d) => d.id === club.divisionId);
  const divisionName = division?.name ?? "Unknown Division";

  const table = db.tables[club.divisionId];
  const positionRow = table?.rows.find((r) => r.clubId === club.id);
  const leaguePos = table
    ? table.rows.findIndex((r) => r.clubId === club.id) + 1
    : null;

  const recent = allFixtures.filter((f) => f.played).slice(-5).reverse();
  const upcoming = allFixtures.filter((f) => !f.played).slice(0, 5);

  // Squad stats
  const sortedSquad = [...squad].sort((a, b) => b.overall - a.overall);
  const top11 = sortedSquad.slice(0, 11);
  const teamOvr = top11.length
    ? Math.round(top11.reduce((a, p) => a + p.overall, 0) / top11.length)
    : 0;
  const wageBill = squad.reduce((a, p) => a + p.wage, 0);
  const totalValue = squad.reduce((a, p) => a + p.value, 0);
  const avgAge = squad.length
    ? (squad.reduce((a, p) => a + p.age, 0) / squad.length).toFixed(1)
    : "—";

  const grouped: Record<GroupKey, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  sortedSquad.forEach((p) => grouped[POS_GROUP[p.position]].push(p));

  const openPlayer = openPlayerId ? db.players[openPlayerId] ?? null : null;

  // Hero gradient blends primary + secondary brand colours.
  const primary = club.badge.primaryColor;
  const secondary = club.badge.secondaryColor;
  // Through-dark blend so primary==secondary clubs (and dual-red clubs)
  // never render as a flat blob. The midpoint leans on the secondary
  // colour if one is supplied.
  const mid = secondary && secondary !== primary
    ? `color-mix(in srgb, ${primary} 50%, ${secondary})`
    : `color-mix(in srgb, ${primary} 70%, var(--ss-bg-deep))`;
  const heroBg = `linear-gradient(110deg, ${primary} 0%, ${mid} 38%, color-mix(in srgb, ${primary} 35%, var(--ss-bg-deep)) 70%, var(--ss-bg-deep) 100%)`;
  const heroFg = readableOn(primary);

  // BID — route to the dedicated bid scene. If the user clicked the
  // top-level bid button without picking a player, point them at the
  // squad's most-valuable name as a sensible default.
  const onMakeBid = (p?: Player) => {
    const target = p ?? [...squad].sort((a, b) => b.value - a.value)[0];
    if (!target) {
      toast("No players to bid on", "warn");
      return;
    }
    if (target.clubId === career.selectedClubId) {
      toast(`${target.lastName} already plays for you`, "info");
      return;
    }
    router.push(`/bid/${target.id}`);
  };
  // SCOUT ENTIRE CLUB — adds every player here to the scouted set so
  // the squad list is fully visible. Idempotent, free for now (Phase 2
  // will add a budget cost and a multi-week wait time).
  const onScout = () => {
    if (allSquadScouted) {
      toast(`${club.shortName} fully scouted`, "info");
      return;
    }
    scoutClub(club.id);
    toast(`${club.shortName} scouted · ${squad.length} players reported`, "success");
  };

  return (
    <div className="space-y-3">
      {/* ============== HERO STRIP ============== */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-base sm:text-lg flex items-center justify-between">
          <span className="truncate">{club.name.toUpperCase()}</span>
          <Link
            href="/league"
            className="text-[10px] font-extrabold tracking-[0.16em] hover:opacity-80"
            title="Back to league"
          >
            ✕
          </Link>
        </div>

        <div
          className="px-4 py-4 grid grid-cols-[88px_1fr_auto] sm:grid-cols-[120px_1fr_auto] items-center gap-4"
          style={{ background: heroBg, color: heroFg }}
        >
          <div className="grid place-items-center">
            <TeamCrest club={club} size={88} />
          </div>

          <div className="min-w-0">
            <div
              className="text-[10px] uppercase tracking-[0.18em] opacity-90"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
            >
              {divisionName} · {club.city}
            </div>
            <div
              className="text-xl sm:text-3xl font-extrabold uppercase tracking-[0.04em] truncate"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              {club.name}
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] opacity-90 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              <span>{club.personality}</span>
              <span aria-hidden>·</span>
              <span>{club.playStyle}</span>
              <span aria-hidden>·</span>
              <span>Founded {club.badge.foundingYear}</span>
              <span aria-hidden>·</span>
              <span>{club.stadium.name}</span>
            </div>
            {/* Form pips */}
            {positionRow && positionRow.form.length > 0 && (
              <div className="flex gap-1 mt-2">
                {positionRow.form.slice(-5).map((f, j) => (
                  <span
                    key={j}
                    className="size-4 grid place-items-center text-[10px] font-extrabold"
                    style={{
                      background:
                        f === "W" ? "var(--ss-btn-stat)" :
                        f === "D" ? "var(--ss-accent)" :
                        "var(--ss-btn-exit)",
                      color: f === "D" ? "#0A0A0A" : "#FFFFFF",
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="hidden sm:block">
            <Kit kit={club.homeKit} size={88} />
          </div>
        </div>

        {/* Numbers row */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-0">
          <NumCell k="OVR" v={teamOvr} accent />
          <NumCell k="POS" v={leaguePos ? `${leaguePos}` : "—"} alt />
          <NumCell k="REP" v={`${club.reputation}/100`} />
          <NumCell k="ATT" v={club.attackRating} alt />
          <NumCell k="MID" v={club.midfieldRating} />
          <NumCell k="DEF" v={club.defenceRating} alt />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-0">
          <NumCell k="GK" v={club.goalkeeperRating} />
          <NumCell k="STADIUM" v={`${(club.stadium.capacity / 1000).toFixed(0)}K`} alt />
          <NumCell k="WAGES" v={`${formatWage(wageBill).replace("/w", "")}`} />
          <NumCell k="VALUE" v={formatValue(totalValue)} alt />
          <NumCell k="AGE" v={`${avgAge}Y`} />
          <NumCell k="MOOD" v={moodLabel(club.fanMood)} alt />
        </div>
      </div>

      {/* ============== INTEREST BANNERS ============== */}
      {!isOwnClub && wantsFromUs.length > 0 && (
        <div
          className="panel overflow-hidden anim-fade-up"
          style={{ borderLeft: "4px solid var(--ss-accent)" }}
        >
          <div className="panel-bar text-sm flex items-center justify-between">
            <span>{club.shortName.toUpperCase()} ARE WATCHING YOUR PLAYERS</span>
            <span className="text-[10px] tracking-[0.16em] opacity-70">
              {wantsFromUs.length}
            </span>
          </div>
          <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
            {wantsFromUs.slice(0, 5).map((p, i) => {
              const lvl = (p.transferInterest ?? []).find((t) => t.clubId === club.id)?.level ?? "rumour";
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2 text-[12px] uppercase tracking-[0.04em] font-bold text-white"
                  style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                >
                  <button
                    onClick={() => setOpenPlayerId(p.id)}
                    className="text-left truncate hover:underline"
                  >
                    <span className="text-[10px] tracking-[0.16em] text-[color:var(--muted)] mr-2">
                      {p.detailedPosition}
                    </span>
                    {p.firstName} {p.lastName}
                    <span className="ml-2 text-[10px] tracking-[0.16em] opacity-75">
                      OVR {p.overall}
                    </span>
                  </button>
                  <span
                    className="text-[10px] px-1.5 py-0.5 tracking-[0.16em]"
                    style={{
                      background: lvl === "bid" ? "var(--ss-btn-exit)" : lvl === "interested" ? "var(--ss-accent)" : "var(--ss-row-bench)",
                      color: lvl === "interested" ? "#0E0830" : "#FFFFFF",
                    }}
                  >
                    {lvl.toUpperCase()}
                  </span>
                  <span className="scoreboard text-[12px] text-[color:var(--ss-accent)]">
                    {formatValue(p.value)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ============== TABS ============== */}
      <div className="tabbar">
        <button onClick={() => setTab("squad")} className={`tab ${tab === "squad" ? "active" : ""}`}>
          Squad <span className="opacity-70 ml-1">{squad.length}</span>
        </button>
        <button onClick={() => setTab("fixtures")} className={`tab ${tab === "fixtures" ? "active" : ""}`}>
          Form &amp; Fixtures
        </button>
        <button onClick={() => setTab("honours")} className={`tab ${tab === "honours" ? "active" : ""}`}>
          Honours
          <span className="opacity-70 ml-1">
            {(club.history?.trophies ?? []).filter((t) => t.position === 1).length}
          </span>
        </button>
        <button onClick={() => setTab("info")} className={`tab ${tab === "info" ? "active" : ""}`}>
          Club Info
        </button>
      </div>

      {/* ============== TAB: SQUAD ============== */}
      {tab === "squad" && (
        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">SQUAD · {squad.length} PLAYERS</div>

          {(["GK", "DEF", "MID", "FWD"] as const).map((g) => {
            const list = grouped[g];
            if (list.length === 0) return null;
            return (
              <div key={g}>
                <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold border-y border-[color:var(--ss-bar-edge)]">
                  {GROUP_LABEL[g]} · {list.length}
                </div>
                <ul>
                  {list.map((p, i) => (
                    <SquadRow
                      key={p.id}
                      p={p}
                      idx={i}
                      isScouted={isPlayerVisible(p)}
                      onClick={() => setOpenPlayerId(p.id)}
                      onBid={() => onMakeBid(p)}
                      onScout={() => {
                        scoutPlayer(p.id);
                        toast(`${p.lastName} scouted`, "success");
                      }}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

          {openToMove.length > 0 && (
            <>
              <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] font-extrabold border-y border-[color:var(--ss-bar-edge)] flex items-center justify-between">
                <span>OPEN TO A MOVE</span>
                <span>{openToMove.length}</span>
              </div>
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)] bg-[color:var(--ss-bg-2)]">
                These players have suitors elsewhere and could be available with the right offer.
              </div>
            </>
          )}
        </div>
      )}

      {/* ============== TAB: FIXTURES ============== */}
      {tab === "fixtures" && (
        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">RECENT FORM</div>
          {recent.length === 0 ? (
            <Empty>Season hasn&apos;t started — no results yet.</Empty>
          ) : (
            <ul>
              {recent.map((f, i) => {
                const home = db.clubs[f.homeId];
                const away = db.clubs[f.awayId];
                const isHome = home.id === club.id;
                const us = isHome ? f.result!.homeGoals : f.result!.awayGoals;
                const them = isHome ? f.result!.awayGoals : f.result!.homeGoals;
                const result = us > them ? "W" : us < them ? "L" : "D";
                return (
                  <FixtureRow
                    key={f.id}
                    home={home}
                    away={away}
                    score={`${f.result!.homeGoals}-${f.result!.awayGoals}`}
                    week={f.week}
                    result={result as "W" | "L" | "D"}
                    alt={i % 2 === 1}
                  />
                );
              })}
            </ul>
          )}

          <div className="panel-bar text-sm mt-0">UPCOMING</div>
          {upcoming.length === 0 ? (
            <Empty>Season is wrapping up — no upcoming matches.</Empty>
          ) : (
            <ul>
              {upcoming.map((f, i) => {
                const home = db.clubs[f.homeId];
                const away = db.clubs[f.awayId];
                return (
                  <FixtureRow
                    key={f.id}
                    home={home}
                    away={away}
                    score="vs"
                    week={f.week}
                    alt={i % 2 === 1}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ============== TAB: CLUB INFO ============== */}
      {tab === "honours" && (
        <HonoursTab club={club} />
      )}

      {tab === "info" && (
        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">FACILITIES &amp; STADIUM</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
            <NumCell k="Capacity" v={club.stadium.capacity.toLocaleString()} />
            <NumCell k="Atmosphere" v={`${club.stadium.atmosphere}/100`} alt />
            <NumCell k="Pitch" v={`L${club.stadium.pitchQualityLevel}`} />
            <NumCell k="Hospitality" v={`L${club.stadium.hospitalityLevel}`} alt />
            <NumCell k="Training" v={`L${club.facilities.trainingGround}`} />
            <NumCell k="Youth" v={`L${club.facilities.youthAcademy}`} alt />
            <NumCell k="Medical" v={`L${club.facilities.medicalCentre}`} />
            <NumCell k="Scouting" v={`L${club.facilities.scoutingNetwork}`} alt />
          </div>

          <div className="panel-bar text-sm">SEASON OBJECTIVES</div>
          <ul>
            {club.seasonObjectives.map((o, i) => (
              <li
                key={i}
                className="px-3 py-2 text-[12px] font-bold uppercase tracking-[0.04em] text-white"
                style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
              >
                <span className="text-[color:var(--ss-accent)] scoreboard mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {o}
              </li>
            ))}
          </ul>

          <div className="panel-bar text-sm">FINANCES</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
            <NumCell k="Budget" v={formatValue(club.budget)} />
            <NumCell k="Wages" v={`${formatWage(wageBill).replace("/w", "")}/w`} alt />
            <NumCell k="Squad Val" v={formatValue(totalValue)} />
            <NumCell k="Fans" v={`${(club.fanbaseSize / 1000).toFixed(0)}K`} alt />
          </div>
        </div>
      )}

      {/* ============== ACTION BAR ============== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
        <Link href="/league" className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12">
          Back
        </Link>
        <button
          onClick={onScout}
          disabled={isOwnClub || allSquadScouted}
          className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 disabled:opacity-50"
          title={
            isOwnClub
              ? "Can't scout your own club"
              : allSquadScouted
                ? "Whole squad already scouted"
                : "Send scouts to file reports on every player here"
          }
        >
          {isOwnClub
            ? "Scout"
            : allSquadScouted
              ? "✓ Scouted"
              : `Scout (${squadScouted}/${squad.length})`}
        </button>
        <button
          onClick={() => onMakeBid()}
          disabled={isOwnClub}
          className="btn btn-stat !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-12 disabled:opacity-50"
          title={isOwnClub ? "Can't bid against yourself" : "Open the bid scene with the squad's most-valuable player as a default"}
        >
          Make Bid
        </button>
        <Link href={`/league`} className="btn btn-exit !rounded-none border-0 h-12">
          Exit
        </Link>
      </div>

      {/* ============== PLAYER PROFILE MODAL ============== */}
      <AnimatePresence>
        {openPlayer && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/80 grid place-items-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenPlayerId(null)}
          >
            <motion.div
              className="panel max-w-2xl w-full max-h-[90vh] overflow-auto"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <PlayerProfile
                player={openPlayer}
                clubs={db.clubs}
                season={career?.season ?? 1}
                primaryColor={primary}
                secondaryColor={secondary}
                ownPlayer={isOwnClub}
                isScouted={isPlayerVisible(openPlayer)}
                onSendScout={
                  isOwnClub
                    ? undefined
                    : () => {
                        scoutPlayer(openPlayer.id);
                        toast(`${openPlayer.lastName} scouted`, "success");
                      }
                }
                onClose={() => setOpenPlayerId(null)}
                onMakeBid={isOwnClub ? undefined : () => onMakeBid(openPlayer)}
                onScout={isOwnClub ? undefined : () => onScout()}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

function SquadRow({
  p,
  idx,
  isScouted,
  onClick,
  onBid,
  onScout,
}: {
  p: Player;
  idx: number;
  /** When false this player hasn't been scouted yet — OVR / quality
   * tier / value are redacted and a "Scout" button replaces "Bid". */
  isScouted: boolean;
  onClick: () => void;
  onBid: () => void;
  onScout: () => void;
}) {
  const trendingColor =
    p.overall >= 80
      ? "var(--ss-accent)"
      : p.overall >= 70
        ? "#9AF09A"
        : "#FFFFFF";

  // QUALITY column — derived from potential. Hidden when unscouted.
  const tier = qualityTier(p.potential);
  const stars = "★".repeat(tier.stars) + "☆".repeat(5 - tier.stars);
  const upside = p.potential - p.overall;
  const stillGrowing = upside >= 6;
  // Coarse OVR band — a tease of the headline number that doesn't
  // give away the precise rating. "70+" reads as "at least 70".
  const ovrBand = `${Math.floor(p.overall / 10) * 10}+`;

  const flagCode = (p.nationality ?? "").slice(0, 3).toUpperCase();
  const nationName = nationalityLabel(p.nationality);

  return (
    <li
      className="grid grid-cols-[44px_36px_42px_1fr_92px_38px_92px_64px_56px] items-center gap-2 text-white text-[12px] font-bold uppercase tracking-[0.04em] hover:brightness-110 transition-[filter] cursor-pointer"
      style={{
        background: idx % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
        // Subtle visual cue: unscouted rows are slightly desaturated so
        // the scouted ones pop even before the eye reads any numbers.
        opacity: isScouted ? 1 : 0.78,
      }}
      onClick={onClick}
    >
      {/* AVATAR — gives every row a face. */}
      <div className="flex items-center justify-center py-1.5">
        <PlayerAvatar playerId={p.id} width={32} />
      </div>

      {isScouted ? (
        <span
          className="text-center scoreboard text-[14px] py-2"
          style={{ color: trendingColor }}
          title={`Overall ${p.overall}`}
        >
          {p.overall}
        </span>
      ) : (
        <span
          className="text-center scoreboard text-[12px] py-2 text-white/60"
          title="Send a scout for the precise rating"
        >
          {ovrBand}
        </span>
      )}
      <span
        className="text-center text-[10px] tracking-[0.16em] py-2"
        style={{ color: positionColor(p.detailedPosition) }}
      >
        {p.detailedPosition}
      </span>
      <span className="truncate py-2">
        {p.firstName} {p.lastName}
        {/* "HOT" badge is rumour-mill talk so it can show whether or
         * not we've scouted them. */}
        {(p.transferInterest?.length ?? 0) > 0 && (
          <span
            className="ml-2 text-[9px] tracking-[0.16em] px-1 py-0.5 align-middle"
            style={{ background: "var(--ss-accent)", color: "#0E0830" }}
            title="Has interest from other clubs"
          >
            HOT
          </span>
        )}
      </span>

      {/* NATIONALITY — public knowledge regardless of scouting. */}
      <span
        className="flex items-center gap-1.5 py-2 text-[10px] tracking-[0.14em] text-[color:var(--muted)]"
        title={nationName}
      >
        <Flag nationalityId={p.nationality} width={20} />
        <span className="truncate">{flagCode}</span>
      </span>

      <span className="text-center text-[10px] tracking-[0.16em] py-2 text-[color:var(--muted)]">
        {p.age}Y
      </span>

      {/* QUALITY — derived from potential, so this is the bit a scout
       * actually unlocks. Show as ?? until then. */}
      {isScouted ? (
        <span
          className="flex flex-col items-center justify-center leading-tight py-1"
          title={`${tier.label} · potential ${p.potential}${
            stillGrowing ? ` (+${upside} upside)` : ""
          }`}
        >
          <span
            className="text-[9px] font-extrabold tracking-[0.16em] flex items-center gap-1"
            style={{ color: tier.color }}
          >
            {tier.label}
            {stillGrowing && <span style={{ color: "#9AF09A" }}>↑</span>}
          </span>
          <span
            className="text-[10px] tracking-[0.18em]"
            style={{ color: tier.color, fontFamily: "var(--font-display)" }}
          >
            {stars}
          </span>
        </span>
      ) : (
        <span
          className="flex flex-col items-center justify-center leading-tight py-1 text-[color:var(--muted)]"
          title="Send a scout to see the player's tier and growth"
        >
          <span className="text-[9px] font-extrabold tracking-[0.16em]">
            UNSCOUTED
          </span>
          <span className="text-[10px] tracking-[0.18em]">
            ★★?★★
          </span>
        </span>
      )}

      <span className="text-right scoreboard text-[12px] text-[color:var(--ss-accent)] py-2 pr-1">
        {isScouted ? formatValue(p.value) : "??"}
      </span>

      {/* CTA — Scout if we haven't filed a report yet, otherwise Bid. */}
      {isScouted ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBid();
          }}
          className="btn btn-stat !rounded-none h-8 mx-1 text-[10px] tracking-[0.14em]"
          title="Open the bid scene for this player"
        >
          ▶ BID
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onScout();
          }}
          className="btn btn-info !rounded-none h-8 mx-1 text-[10px] tracking-[0.14em]"
          title="Send a scout to file a full report"
        >
          🔍 SCOUT
        </button>
      )}
    </li>
  );
}

/** Map a potential rating to a 1-5 star tier with a label + colour
 * suitable for a row badge. */
function qualityTier(pot: number): {
  stars: number;
  label: string;
  color: string;
} {
  if (pot >= 88) return { stars: 5, label: "WORLD", color: "#FFD000" };
  if (pot >= 80) return { stars: 4, label: "ELITE", color: "#FFD000" };
  if (pot >= 73) return { stars: 3, label: "GOOD",  color: "#9AF09A" };
  if (pot >= 65) return { stars: 2, label: "OK",    color: "#FFFFFF" };
  return            { stars: 1, label: "ROUGH", color: "rgba(255,255,255,0.55)" };
}

function FixtureRow({
  home,
  away,
  score,
  week,
  result,
  alt,
}: {
  home: { id: string; shortName: string; badge: import("@/types/game").Badge };
  away: { id: string; shortName: string; badge: import("@/types/game").Badge };
  score: string;
  week: number;
  result?: "W" | "L" | "D";
  alt?: boolean;
}) {
  const resColor =
    result === "W" ? "var(--ss-btn-stat)"
    : result === "L" ? "var(--ss-btn-exit)"
    : result === "D" ? "var(--ss-accent)"
    : "transparent";
  const resText = result === "D" ? "#0A0A0A" : "#FFFFFF";

  return (
    <li
      className="grid grid-cols-[34px_22px_1fr_72px_1fr_22px_28px] items-center gap-2 px-3 py-2 text-white text-[12px] uppercase tracking-[0.04em] font-bold"
      style={{ background: alt ? "var(--ss-row-2)" : "var(--ss-row)" }}
    >
      <span className="text-[10px] text-[color:var(--muted)] tracking-[0.16em]">W{week}</span>
      <Link href={`/club/${home.id}`} className="grid place-items-center hover:scale-110 transition-transform">
        <TeamCrest club={home} size={20} />
      </Link>
      <Link href={`/club/${home.id}`} className="truncate hover:underline">
        {home.shortName}
      </Link>
      <span className="scoreboard text-center bg-[color:var(--ss-bg-deep)] py-0.5 px-1">
        {score}
      </span>
      <Link href={`/club/${away.id}`} className="truncate hover:underline text-right">
        {away.shortName}
      </Link>
      <Link href={`/club/${away.id}`} className="grid place-items-center hover:scale-110 transition-transform">
        <TeamCrest club={away} size={20} />
      </Link>
      <span
        className="text-center text-[10px] font-extrabold py-0.5"
        style={{ background: resColor, color: resText }}
      >
        {result ?? ""}
      </span>
    </li>
  );
}

function NumCell({
  k,
  v,
  alt,
  accent,
}: {
  k: string;
  v: string | number;
  alt?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className="px-3 py-2.5 text-center"
      style={{ background: alt ? "var(--ss-bg-strip)" : "var(--ss-bg-2)" }}
    >
      <div className="text-[9px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{k}</div>
      <div
        className={`scoreboard text-base sm:text-lg font-extrabold mt-0.5 ${
          accent ? "text-[color:var(--ss-accent)]" : "text-white"
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--ss-bg-2)] py-4 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
      {children}
    </div>
  );
}

// =====================================================================
// Honours tab — trophy cabinet + season records
// =====================================================================

function HonoursTab({ club }: { club: Club }) {
  const history = club.history;
  const trophies = useMemo(() => history?.trophies ?? [], [history]);
  const seasons = useMemo(() => history?.seasons ?? [], [history]);

  // Group trophies by competition + position so we can render
  // "Premier Division Champion · 4 times" rows.
  const grouped = useMemo(() => {
    const map = new Map<string, { trophies: Trophy[]; competitionId: string; position: 1 | 2 | 3 }>();
    trophies.forEach((t) => {
      const key = `${t.competitionId}_${t.position}`;
      const entry = map.get(key);
      if (entry) entry.trophies.push(t);
      else map.set(key, { trophies: [t], competitionId: t.competitionId, position: t.position });
    });
    // Order: winners first, then runners-up, league before cups.
    return [...map.values()].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return compRank(a.competitionId) - compRank(b.competitionId);
    });
  }, [trophies]);

  const totalWinners = trophies.filter((t) => t.position === 1).length;

  return (
    <div className="space-y-3">
      {/* Trophy cabinet */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm flex items-center justify-between">
          <span>TROPHY CABINET</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {totalWinners} HONOURS
          </span>
        </div>
        {grouped.length === 0 ? (
          <Empty>No silverware yet — write your own history.</Empty>
        ) : (
          <ul>
            {grouped.map((g, i) => (
              <li
                key={`${g.competitionId}_${g.position}`}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-2 px-3 py-2 text-[12px] font-bold uppercase tracking-[0.04em] text-white"
                style={{
                  background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
                }}
              >
                <TrophyIcon position={g.position} />
                <span className="min-w-0">
                  <span className="truncate block">
                    {competitionLabel(g.competitionId)} {positionLabel(g.position)}
                  </span>
                  <span className="text-[9px] tracking-[0.16em] opacity-70 truncate block">
                    {recentSeasonsString(g.trophies)}
                  </span>
                </span>
                <span className="scoreboard text-[16px] text-[color:var(--ss-accent)]">
                  ×{g.trophies.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Season-by-season records (only seasons actually played in-game) */}
      <div className="panel overflow-hidden">
        <div className="panel-bar text-sm flex items-center justify-between">
          <span>SEASON-BY-SEASON</span>
          <span className="text-[10px] tracking-[0.2em] opacity-80">
            {seasons.length} SEASONS
          </span>
        </div>
        {seasons.length === 0 ? (
          <Empty>The current season hasn&apos;t finished yet.</Empty>
        ) : (
          <>
            <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-[60px_1fr_50px_42px_42px_42px_56px] text-[10px] uppercase tracking-[0.18em] font-bold text-[color:var(--ss-cream)] border-t border-[color:var(--ss-bar-edge)]">
              <span className="px-2 py-1.5 text-center">SEASON</span>
              <span className="px-2 py-1.5">DIV</span>
              <span className="px-1 py-1.5 text-center">POS</span>
              <span className="px-1 py-1.5 text-center">W</span>
              <span className="px-1 py-1.5 text-center">D</span>
              <span className="px-1 py-1.5 text-center">L</span>
              <span className="px-2 py-1.5 text-right">PTS</span>
            </div>
            <ul>
              {[...seasons].sort((a, b) => b.season - a.season).map((s, i) => (
                <li
                  key={`s_${s.season}_${s.divisionId}`}
                  className="grid grid-cols-[60px_1fr_50px_42px_42px_42px_56px] items-center text-white text-[12px] font-bold uppercase tracking-[0.04em]"
                  style={{
                    background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)",
                  }}
                >
                  <span className="px-2 py-1.5 text-center scoreboard text-[14px]">
                    S{s.season}
                  </span>
                  <span className="px-2 py-1.5 truncate">
                    {competitionLabel(s.divisionId)}
                  </span>
                  <span
                    className="px-1 py-1.5 text-center scoreboard text-[14px]"
                    style={{ color: positionColorForFinish(s.finalPosition) }}
                  >
                    {s.finalPosition}
                  </span>
                  <span className="px-1 py-1.5 text-center scoreboard">{s.won}</span>
                  <span className="px-1 py-1.5 text-center scoreboard">{s.drawn}</span>
                  <span className="px-1 py-1.5 text-center scoreboard">{s.lost}</span>
                  <span className="px-2 py-1.5 text-right scoreboard text-[14px]">
                    {s.points}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function TrophyIcon({ position }: { position: 1 | 2 | 3 }) {
  const color = position === 1 ? "#FFD000" : position === 2 ? "#C0C0C0" : "#CD7F32";
  return (
    <span
      className="size-9 grid place-items-center scoreboard text-[18px]"
      style={{
        background: "rgba(0,0,0,0.35)",
        color,
        border: `1px solid ${color}66`,
      }}
      aria-hidden
    >
      {position === 1 ? "★" : position === 2 ? "☆" : "•"}
    </span>
  );
}

function positionLabel(p: 1 | 2 | 3): string {
  return p === 1 ? "CHAMPIONS" : p === 2 ? "RUNNERS-UP" : "THIRD PLACE";
}

function positionColorForFinish(p: number): string {
  if (p === 1) return "#FFD000";
  if (p <= 3) return "#9AF09A";
  if (p <= 7) return "#FFFFFF";
  if (p <= 14) return "#D8D8D8";
  return "#FF8585";
}

function compRank(id: string): number {
  if (id === "div_premier") return 0;
  if (id === "div_one") return 1;
  if (id === "div_two") return 2;
  if (id === "div_three") return 3;
  if (id === "national_cup") return 4;
  if (id === "league_cup") return 5;
  return 99;
}

function recentSeasonsString(list: Trophy[]): string {
  const seasons = list
    .map((t) => t.season)
    .sort((a, b) => b - a)
    .map((s) => (s < 0 ? `${s}` : `S${s}`))
    .slice(0, 5);
  if (list.length > 5) seasons.push("…");
  return seasons.join(" · ");
}

function moodLabel(mood: number): string {
  if (mood >= 80) return "EUPHORIC";
  if (mood >= 65) return "HAPPY";
  if (mood >= 50) return "OK";
  if (mood >= 35) return "GRUMPY";
  return "FURIOUS";
}

function positionColor(pos: string): string {
  if (pos === "GK") return "#FFD000";
  if (["CB", "LB", "RB"].includes(pos)) return "#5FB3E8";
  if (["DM", "CM", "AM", "LM", "RM"].includes(pos)) return "#9AF09A";
  return "#FF8585";
}
